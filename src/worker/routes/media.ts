import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities } from "../db/schema";
import { notFound } from "../lib/errors";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/**
 * Serves objects from the R2 media bucket (avatars, uploaded activity images).
 * Public read is fine — keys are unguessable nanoids — but we only expose the
 * `avatars/` and `activities/` prefixes and always send safe headers.
 *
 * When R2 isn't bound (not enabled on the account) this just 404s; the app
 * falls back to initials everywhere an avatar would appear.
 */
app.get("/:key{.+}", async (c) => {
  if (!c.env.MEDIA) throw notFound();
  const key = c.req.param("key");
  if (!/^(avatars|activities)\//.test(key)) throw notFound();

  const object = await c.env.MEDIA.get(key);
  if (!object) throw notFound("Image not found.");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
});

/**
 * A real, specific photo of one activity's exact location, sourced from
 * Google's Street View Static API — server-side only, so GOOGLE_MAPS_API_KEY
 * never reaches the browser (it's never in a URL a client sees, unlike a
 * redirect would leak it). Cached hard at Cloudflare's edge (a given
 * coordinate's street view doesn't change day to day), so after the first
 * viewer in a region, this stops costing API calls entirely.
 *
 * Only serves activities the backfill has already confirmed have real
 * coverage (image_source = 'Google Street View' on that row) — this is a
 * lookup, not a live "does this address have coverage" gamble on every view.
 */
app.get("/streetview/:id", async (c) => {
  if (!c.env.GOOGLE_MAPS_API_KEY) throw notFound();
  const id = c.req.param("id");
  const db = createDb(c.env);
  const a = await db.query.activities.findFirst({
    where: eq(activities.id, id),
    columns: { lat: true, lng: true, imageSource: true, active: true },
  });
  if (!a || !a.active || a.imageSource !== "Google Street View" || a.lat == null || a.lng == null) {
    throw notFound();
  }
  const lat = a.lat / 1e6;
  const lng = a.lng / 1e6;
  const upstream = await fetch(
    `https://maps.googleapis.com/maps/api/streetview?size=1280x800&fov=90&location=${lat},${lng}&key=${c.env.GOOGLE_MAPS_API_KEY}`,
  );
  if (!upstream.ok || !upstream.body) throw notFound();
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});

export default app;
