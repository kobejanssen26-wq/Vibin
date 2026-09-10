import { Hono } from "hono";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityImages,
  activityVotes,
  groupActivityPool,
  groupSettings,
  matches,
  type Group,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, conflict } from "../lib/errors";
import { newId } from "../lib/id";
import { track } from "../lib/analytics";
import { chunk, rowsPerInsert } from "../lib/chunk";
import { requireActiveMember, requireGroupMember, activeMemberIds } from "../lib/access";
import { activityVoteProgress } from "../engine/match";
import { buildDeckBatch, countEligibleActivities, haversineKm } from "../engine/deck";
import { loadRankContext, rankingWorthwhile } from "../engine/rank-context";
import type { RankContext } from "../engine/rank";
import { runActivityMatch } from "../lib/engine-run";
import { matchDTO } from "../lib/match-view";
import { settingsToDTO } from "../lib/group-view";
import { toActivityDTO } from "../lib/dto";
import { LIMITS } from "@shared/constants";
import type { DB } from "../db/client";
import type { SwipeCardDTO, SwipeStateDTO } from "@shared/types";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

/** How many cards the client is ever handed at once — plenty ahead of the
 * prefetch threshold, and safely under SQLite's ~100 bound-variable limit for
 * the follow-up image lookup even as the shared pool grows into the hundreds. */
const QUEUE_HYDRATE_LIMIT = 60;

/** activity id NOT IN (this user's votes for the group) — constant-size subquery */
const notVotedBy = (db: DB, groupId: string, userId: string) =>
  notInArray(
    activities.id,
    db
      .select({ id: activityVotes.activityId })
      .from(activityVotes)
      .where(
        and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, userId)),
      ),
  );

/** activity id NOT IN (this group's matches) — constant-size subquery */
const notMatchedIn = (db: DB, groupId: string) =>
  notInArray(
    activities.id,
    db
      .select({ id: matches.activityId })
      .from(matches)
      .where(eq(matches.groupId, groupId)),
  );

function cardDTO(
  a: typeof activities.$inferSelect,
  imgs: (typeof activityImages.$inferSelect)[],
  glat: number | null,
  glng: number | null,
) {
  const dist =
    glat != null && glng != null && a.lat != null && a.lng != null
      ? haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6)
      : null;
  return toActivityDTO(
    a,
    imgs
      .filter((i) => i.activityId === a.id)
      .sort((x, y) => x.sort - y.sort)
      .map((i) => i.url),
    dist,
  );
}

/** The full SwipeStateDTO — shared by GET /swipe and POST /swipe/extend. */
async function buildSwipeState(
  db: DB,
  group: Group,
  userId: string,
): Promise<SwipeStateDTO> {
  const groupId = group.id;
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });
  const glat = settings?.lat != null ? settings.lat / 1e6 : null;
  const glng = settings?.lng != null ? settings.lng / 1e6 : null;

  // The queue = pooled activities this user hasn't voted on and the group hasn't
  // matched, in deck order. Bounded — the client keeps it topped up by swiping
  // (voted cards drop out) and prefetching new batches.
  const queueRows = await db
    .select({ act: activities, sort: groupActivityPool.sort })
    .from(groupActivityPool)
    .innerJoin(activities, eq(activities.id, groupActivityPool.activityId))
    .where(
      and(
        eq(groupActivityPool.groupId, groupId),
        notVotedBy(db, groupId, userId),
        notMatchedIn(db, groupId),
      ),
    )
    .orderBy(asc(groupActivityPool.sort))
    .limit(QUEUE_HYDRATE_LIMIT);

  const queueActs = queueRows.map((r) => r.act);
  const queueIds = queueActs.map((a) => a.id);
  const queueImgs = queueIds.length
    ? await db
        .select()
        .from(activityImages)
        .where(inArray(activityImages.activityId, queueIds))
    : [];

  const queue: SwipeCardDTO[] = queueActs.map((a, idx) => ({
    activity: cardDTO(a, queueImgs, glat, glng),
    yourVote: null,
    position: idx,
    deckSize: queueActs.length,
  }));

  // last card this user voted on (for undo)
  const lastVotedRow = await db
    .select({ act: activities })
    .from(activityVotes)
    .innerJoin(activities, eq(activities.id, activityVotes.activityId))
    .where(
      and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, userId)),
    )
    .orderBy(desc(activityVotes.updatedAt))
    .limit(1);
  let lastVoted: SwipeCardDTO | null = null;
  if (lastVotedRow[0]) {
    const a = lastVotedRow[0].act;
    const imgs = await db
      .select()
      .from(activityImages)
      .where(eq(activityImages.activityId, a.id));
    lastVoted = {
      activity: cardDTO(a, imgs, glat, glng),
      yourVote: null,
      position: -1,
      deckSize: 0,
    };
  }

  const [poolCountRow, swipedRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(groupActivityPool)
      .where(eq(groupActivityPool.groupId, groupId)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(activityVotes)
      .where(
        and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, userId)),
      ),
  ]);
  const deckSize = poolCountRow[0]?.n ?? 0;
  const swipedByYou = swipedRow[0]?.n ?? 0;

  // collective progress on the frontmost undecided card
  let currentProgress: SwipeStateDTO["currentProgress"] = null;
  if (queue.length > 0) {
    const activeIds = await activeMemberIds(db, groupId);
    const cardVotes = await db
      .select({ userId: activityVotes.userId, value: activityVotes.value })
      .from(activityVotes)
      .where(
        and(
          eq(activityVotes.groupId, groupId),
          eq(activityVotes.activityId, queue[0]!.activity.id),
        ),
      );
    const p = activityVoteProgress(activeIds, cardVotes);
    currentProgress = { voted: p.voted, total: p.total };
  }

  // is there another batch to pull? (anything the group hasn't pooled/voted on)
  const hasMore = settings
    ? (await countEligibleActivities(db, settings, groupId)) > 0
    : false;

  const latestMatch = await db.query.matches.findFirst({
    where: eq(matches.groupId, groupId),
    orderBy: [desc(matches.matchedAt)],
  });

  return {
    groupId,
    status: group.status,
    deckSize,
    queue,
    lastVoted,
    currentProgress,
    newMatch: latestMatch ? await matchDTO(db, latestMatch.id) : null,
    hasMore,
    swipedByYou,
    filters: settingsToDTO(settings),
    canChangeFilters: group.creatorId === userId,
    finished: deckSize > 0 && queue.length === 0 && !hasMore,
  };
}

/**
 * The recommendation context for a group's shared pool — the extending member's
 * personal taste blended with the whole group's. `null` until there's enough
 * swipe history to beat a fair shuffle.
 */
export async function contextForGroup(
  db: DB,
  groupId: string,
  userId: string,
): Promise<RankContext | null> {
  const memberIds = await activeMemberIds(db, groupId);
  const ctx = await loadRankContext(db, groupId, userId, memberIds.length || 1);
  return rankingWorthwhile(ctx) ? ctx : null;
}

/** Append the next batch of cards to the shared pool. Race-safe (PK conflict). */
export async function extendPool(
  db: DB,
  groupId: string,
  opts: { batchLimit?: number; rank?: RankContext | null } = {},
): Promise<{ added: number; hasMore: boolean }> {
  const batchLimit = opts.batchLimit ?? LIMITS.deckSize;
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });
  if (!settings) return { added: 0, hasMore: false };

  const maxSortRow = await db
    .select({ m: sql<number>`coalesce(max(${groupActivityPool.sort}), -1)` })
    .from(groupActivityPool)
    .where(eq(groupActivityPool.groupId, groupId));

  const { ids, hasMore } = await buildDeckBatch(db, settings, {
    groupId,
    limit: batchLimit,
    rank: opts.rank ?? null,
  });
  if (ids.length === 0) return { added: 0, hasMore: false };

  const now = Math.floor(Date.now() / 1000);
  let sort = (maxSortRow[0]?.m ?? -1) + 1;
  const rows = ids.map((activityId) => ({
    groupId,
    activityId,
    sort: sort++,
    addedAt: now,
  }));
  for (const b of chunk(rows, rowsPerInsert(4))) {
    await db.insert(groupActivityPool).values(b).onConflictDoNothing();
  }
  return { added: ids.length, hasMore };
}

/**
 * Rebuild the not-yet-voted tail of the pool from the current settings. Votes
 * and matches are untouched: only unswiped cards are swapped. Called after a
 * mid-swipe filter change.
 */
export async function rebuildPoolTail(
  db: DB,
  groupId: string,
  userId: string,
): Promise<void> {
  // Drop every not-yet-voted card (subquery keep-list — no big NOT IN param
  // list), then pull a fresh batch on the new filters.
  await db
    .delete(groupActivityPool)
    .where(
      and(
        eq(groupActivityPool.groupId, groupId),
        notInArray(
          groupActivityPool.activityId,
          db
            .select({ id: activityVotes.activityId })
            .from(activityVotes)
            .where(eq(activityVotes.groupId, groupId)),
        ),
      ),
    );

  await extendPool(db, groupId, { rank: await contextForGroup(db, groupId, userId) });
}

/* --------------------------- swipe state ----------------------------- */
app.get("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireGroupMember(db, groupId, uid(c));
  return c.json(await buildSwipeState(db, group, uid(c)));
});

/* ------------------------ pull the next batch ----------------------- */
app.post("/:id/swipe/extend", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireActiveMember(db, groupId, uid(c));
  if (group.status !== "swiping" && group.status !== "date_matching") {
    // still return current state so the client can settle gracefully
    return c.json(await buildSwipeState(db, group, uid(c)));
  }
  await extendPool(db, groupId, {
    rank: await contextForGroup(db, groupId, uid(c)),
  });
  return c.json(await buildSwipeState(db, group, uid(c)));
});

/* ----------------------------- cast vote ---------------------------- */
app.post("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireActiveMember(db, groupId, uid(c));
  if (
    group.status !== "swiping" &&
    group.status !== "date_matching" &&
    group.status !== "planned"
  ) {
    throw conflict("This group isn't swiping right now.");
  }
  const body = await parseBody(
    c,
    z.object({
      activityId: z.string().min(1),
      value: z.enum(["like", "nope", "superlike"]),
    }),
  );

  const inDeck = await db.query.groupActivityPool.findFirst({
    where: and(
      eq(groupActivityPool.groupId, groupId),
      eq(groupActivityPool.activityId, body.activityId),
    ),
  });
  if (!inDeck) throw badRequest("That activity isn't in this group's deck.");

  const already = await db.query.matches.findFirst({
    where: and(
      eq(matches.groupId, groupId),
      eq(matches.activityId, body.activityId),
    ),
  });

  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(activityVotes)
    .values({
      id: newId(),
      groupId,
      activityId: body.activityId,
      userId: uid(c),
      value: body.value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        activityVotes.groupId,
        activityVotes.activityId,
        activityVotes.userId,
      ],
      set: { value: body.value, updatedAt: now },
    });

  track(
    c,
    body.value === "nope"
      ? "activity_passed"
      : body.value === "superlike"
        ? "activity_superliked"
        : "activity_liked",
    {
      userId: uid(c),
      groupId,
      activityId: body.activityId,
      dedupeKey: `swipe:${groupId}:${body.activityId}:${uid(c)}`,
    },
  );

  let newMatch = null;
  if (!already && body.value !== "nope") {
    newMatch = await runActivityMatch(db, c.env, groupId, body.activityId, uid(c));
  }

  const activeIds = await activeMemberIds(db, groupId);
  const cardVotes = await db
    .select({ userId: activityVotes.userId, value: activityVotes.value })
    .from(activityVotes)
    .where(
      and(
        eq(activityVotes.groupId, groupId),
        eq(activityVotes.activityId, body.activityId),
      ),
    );
  const progress = activityVoteProgress(activeIds, cardVotes);

  return c.json({
    ok: true,
    progress: { voted: progress.voted, total: progress.total },
    newMatch,
  });
});

/* ------------------------------- undo ------------------------------- */
app.post("/:id/swipe/undo", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireActiveMember(db, groupId, uid(c));

  const last = await db
    .select()
    .from(activityVotes)
    .where(
      and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, uid(c))),
    )
    .orderBy(desc(activityVotes.updatedAt))
    .limit(1);
  if (last.length === 0) throw badRequest("Nothing to undo.");

  const matched = await db.query.matches.findFirst({
    where: and(
      eq(matches.groupId, groupId),
      eq(matches.activityId, last[0]!.activityId),
    ),
  });
  if (matched) throw conflict("That card already matched — it can't be undone.");

  await db.delete(activityVotes).where(eq(activityVotes.id, last[0]!.id));

  // make sure the undone card is still in the pool (a filter change may have
  // dropped unswiped cards; this one now has no vote so re-add it at the front)
  const stillPooled = await db.query.groupActivityPool.findFirst({
    where: and(
      eq(groupActivityPool.groupId, groupId),
      eq(groupActivityPool.activityId, last[0]!.activityId),
    ),
  });
  if (!stillPooled) {
    const minSort = await db
      .select({ m: sql<number>`coalesce(min(${groupActivityPool.sort}), 0)` })
      .from(groupActivityPool)
      .where(eq(groupActivityPool.groupId, groupId));
    await db
      .insert(groupActivityPool)
      .values({
        groupId,
        activityId: last[0]!.activityId,
        sort: (minSort[0]?.m ?? 0) - 1,
        addedAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoNothing();
  }

  return c.json({ ok: true, undoneActivityId: last[0]!.activityId });
});

export { buildSwipeState };
export default app;
