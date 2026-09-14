import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { clientIp, rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/email";
import { parseBody } from "../lib/validate";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/** Public contact form — no account needed, so this is a plain email to the
 *  support inbox rather than a support ticket (support_tickets.user_id is
 *  required, and someone reaching out here may not have signed up at all). */
const REASONS = {
  problem: "Report a problem",
  idea: "Suggest an idea",
  business: "Business / partner inquiry",
  activity_correction: "Activity correction",
  question: "General question",
  other: "Other",
} as const;

app.post("/", async (c) => {
  await rateLimit(c.env, "contact", clientIp(c.req.raw), 5, 3600);
  const body = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(200),
      reason: z.enum(
        Object.keys(REASONS) as [keyof typeof REASONS, ...(keyof typeof REASONS)[]],
      ),
      message: z.string().trim().min(5).max(4000),
    }),
  );
  await sendEmail(c.env, {
    to: c.env.SUPPORT_EMAIL || c.env.EMAIL_FROM || "hello@vibin.be",
    subject: `[VIBIN contact] ${REASONS[body.reason]} — ${body.name}`,
    text: `From: ${body.name} <${body.email}>\nReason: ${REASONS[body.reason]}\n\n${body.message}`,
  });
  return c.json({ ok: true });
});

export default app;
