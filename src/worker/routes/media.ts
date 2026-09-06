import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { notFound } from "../lib/errors";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/**
 * Serves objects from the R2 media bucket (avatars, uploaded activity images).
 * Public read is fine — keys are unguessable nanoids — but we only expose the
 * `avatars/` and `activities/` prefixes and always send safe headers.
 */
app.get("/:key{.+}", async (c) => {
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

export default app;
