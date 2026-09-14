import { Hono } from "hono";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { messages, profiles } from "../db/schema";
import { parseBody, parseQuery } from "../lib/validate";
import { requireActiveMember, requireGroupMember } from "../lib/access";
import { newId } from "../lib/id";
import { rateLimit } from "../lib/ratelimit";
import { notifyGroup } from "../lib/notify";
import { censor } from "../lib/profanity";
import { toPublicUser } from "../lib/dto";
import { LIMITS } from "@shared/constants";
import type { MessageDTO } from "@shared/types";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

async function toDTOs(
  db: ReturnType<typeof createDb>,
  rows: (typeof messages.$inferSelect)[],
  currentUserId: string,
): Promise<MessageDTO[]> {
  const authorIds = [
    ...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)),
  ];
  const authors = authorIds.length
    ? await db
        .select({
          userId: profiles.userId,
          displayName: profiles.displayName,
          avatarKey: profiles.avatarKey,
        })
        .from(profiles)
        .where(inArray(profiles.userId, authorIds))
    : [];
  const byId = new Map(authors.map((a) => [a.userId, a]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    meta: JSON.parse(r.meta) as Record<string, unknown>,
    author: r.userId && byId.has(r.userId) ? toPublicUser(byId.get(r.userId)!) : null,
    createdAt: r.createdAt,
    isYou: r.userId === currentUserId,
  }));
}

app.get("/:id/messages", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireGroupMember(db, groupId, uid(c));
  const q = parseQuery(
    c,
    z.object({
      before: z.coerce.number().int().optional(),
      after: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );

  const conds = [eq(messages.groupId, groupId)];
  if (q.before) conds.push(lt(messages.createdAt, q.before));
  if (q.after) conds.push(gt(messages.createdAt, q.after));

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(q.after ? asc(messages.createdAt) : desc(messages.createdAt))
    .limit(q.limit);

  const ordered = q.after ? rows : rows.reverse();
  return c.json({ messages: await toDTOs(db, ordered, uid(c)) });
});

app.post("/:id/messages", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireActiveMember(db, groupId, uid(c));
  await rateLimit(c.env, "chat", `${groupId}:${uid(c)}`, 30, 60); // 30 / min
  const body = await parseBody(
    c,
    z.object({
      body: z.string().trim().min(LIMITS.message.min).max(LIMITS.message.max),
    }),
  );
  const { clean, flagged } = censor(body.body);
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  await db.insert(messages).values({
    id,
    groupId,
    userId: uid(c),
    kind: "text",
    body: clean,
    meta: flagged ? JSON.stringify({ filtered: true }) : "{}",
    createdAt: now,
  });
  const me = await db.query.profiles.findFirst({
    where: eq(profiles.userId, uid(c)),
    columns: { displayName: true },
  });
  await notifyGroup(db, groupId, uid(c), {
    kind: "message",
    title: `${me?.displayName ?? "Someone"} in the group chat`,
    body: clean.slice(0, 120),
    data: { messageId: id },
  });
  const [row] = await toDTOs(
    db,
    [
      {
        id,
        groupId,
        userId: uid(c),
        kind: "text",
        body: clean,
        meta: flagged ? JSON.stringify({ filtered: true }) : "{}",
        createdAt: now,
      },
    ],
    uid(c),
  );
  return c.json({ message: row }, 201);
});

export default app;
