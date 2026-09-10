import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { parseQuery } from "../lib/validate";
import { resolvePlace } from "../lib/be-places";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/**
 * Offline geocoder as a tiny endpoint. Keeps the ~2700-locality table out of the
 * client bundle: the group-config screen calls this to tell the user whether the
 * place they typed can be placed (and therefore whether the radius will apply).
 * The server also resolves the label again on settings save — this is only a
 * hint. Auth-gated + trivially cacheable.
 */
app.get("/resolve", (c) => {
  const { q } = parseQuery(c, z.object({ q: z.string().trim().min(1).max(120) }));
  const hit = resolvePlace(q);
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(hit); // { lat, lng } | null
});

export default app;
