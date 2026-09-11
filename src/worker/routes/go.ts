/**
 * Outbound-click tracking redirect. Every "visit the website" / "book" /
 * "tickets" link in the product routes through here instead of a bare
 * `<a href>`, so a click is recorded server-side (reliable — it doesn't
 * depend on a client-side beacon surviving the navigation) before the
 * redirect fires.
 *
 *   GET /api/go/activity/:id?kind=website|booking|ticket&src=<screen>&groupId=<id?>
 *
 * SECURITY (§53): the destination is never taken from the request — it is
 * always looked up server-side from the activity's own stored URLs. There is
 * no `?url=` parameter, so this cannot be used as an open redirect to an
 * arbitrary domain.
 *
 * A click NEVER means a booking/purchase happened — see toEventName below and
 * lib/analytics.ts. Idempotent-ish: a burst of identical clicks from the same
 * visitor within a few seconds collapses to one recorded event (dedupeKey),
 * so a double-click or a page retry doesn't inflate the count; the raw event
 * itself is still one row, kept for debugging.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities } from "../db/schema";
import { notFound } from "../lib/errors";
import { track, type EventName } from "../lib/analytics";
import { SESSION_COOKIE } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const KINDS = ["website", "booking", "ticket"] as const;
type Kind = (typeof KINDS)[number];

const SOURCE_SCREENS = new Set([
  "swipe_card",
  "expanded_card",
  "match_screen",
  "plan_screen",
  "admin_preview",
]);

function pickKind(
  raw: string | undefined,
  a: { websiteUrl: string | null; bookingUrl: string | null; ticketUrl: string | null },
): { kind: Kind; url: string } | null {
  const want = KINDS.includes(raw as Kind) ? (raw as Kind) : null;
  const byKind: Record<Kind, string | null> = {
    website: a.websiteUrl,
    booking: a.bookingUrl,
    ticket: a.ticketUrl,
  };
  if (want) return byKind[want] ? { kind: want, url: byKind[want]! } : null;
  // no preference given -> most actionable destination first
  for (const k of ["ticket", "booking", "website"] as const) {
    if (byKind[k]) return { kind: k, url: byKind[k]! };
  }
  return null;
}

app.get("/activity/:id", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  if (!a || a.active !== 1) throw notFound("Activity not found.");

  const dest = pickKind(c.req.query("kind"), a);
  if (!dest) throw notFound("This activity has no outbound link of that kind.");

  const src = c.req.query("src");
  const sourceScreen = src && SOURCE_SCREENS.has(src) ? src : "unknown";
  const groupId = c.req.query("groupId") || null;

  // identity for the dedupe window: the session if logged in, else the
  // session cookie's raw value if present (anonymous but stable), else the IP
  // — coarse and only used to collapse an accidental double-click burst, not
  // to fingerprint anyone.
  const userId = c.get("userId");
  const anonId =
    userId ?? getCookie(c, SESSION_COOKIE) ?? c.req.header("cf-connecting-ip") ?? "anon";
  const bucket = Math.floor(Date.now() / 5000); // 5 s collapse window
  const dedupeKey = `go:${a.id}:${dest.kind}:${anonId}:${bucket}`;

  const eventName: EventName = dest.kind === "website" ? "activity_website_clicked" : "booking_clicked";
  track(c, eventName, {
    userId,
    groupId,
    activityId: a.id,
    dedupeKey,
    props: {
      kind: dest.kind,
      source: sourceScreen,
      monetizationType: a.monetizationType,
    },
  });

  return c.redirect(dest.url, 302);
});

export default app;
