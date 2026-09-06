import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { reports } from "../db/schema";
import { parseBody } from "../lib/validate";
import { newId } from "../lib/id";
import { rateLimit } from "../lib/ratelimit";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

app.post("/", async (c) => {
  await rateLimit(c.env, "report", uid(c), 20, 3600);
  const body = await parseBody(
    c,
    z.object({
      targetType: z.enum(["activity", "group", "member", "message"]),
      targetId: z.string().min(1).max(64),
      reason: z.enum(["inappropriate", "spam", "incorrect_info", "other"]),
      detail: z.string().trim().max(1000).default(""),
    }),
  );
  const db = createDb(c.env);
  await db.insert(reports).values({
    id: newId(),
    reporterId: uid(c),
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    detail: body.detail,
    status: "open",
    createdAt: Math.floor(Date.now() / 1000),
  });
  return c.json({ ok: true, message: "Thanks — our team will take a look." }, 201);
});

export default app;
