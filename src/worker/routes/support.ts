import { Hono } from "hono";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { supportMessages, supportTickets } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { parseBody } from "../lib/validate";
import { rateLimit } from "../lib/ratelimit";
import { sendEmail } from "../lib/email";
import { askSupportAi } from "../lib/support-ai";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

const CATEGORIES = ["account", "groups", "swiping", "activities", "bug", "other"] as const;

app.get("/", async (c) => {
  const db = createDb(c.env);
  const rows = await db.query.supportTickets.findMany({
    where: eq(supportTickets.userId, uid(c)),
    orderBy: desc(supportTickets.updatedAt),
    limit: 100,
  });
  return c.json({ tickets: rows });
});

app.post("/", async (c) => {
  const userId = uid(c);
  await rateLimit(c.env, "support-ticket-create", userId, 10, 3600);
  const body = await parseBody(
    c,
    z.object({
      subject: z.string().trim().min(3).max(160),
      category: z.enum(CATEGORIES).default("other"),
      body: z.string().trim().min(5).max(4000),
    }),
  );
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  const ticketId = newId();

  await db.insert(supportTickets).values({
    id: ticketId,
    userId,
    subject: body.subject,
    category: body.category,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(supportMessages).values({
    id: newId(),
    ticketId,
    authorType: "user",
    authorId: userId,
    body: body.body,
    createdAt: now,
  });

  const ai = await askSupportAi(c.env, body.subject, body.body);
  let escalate = true;
  if (ai) {
    await db.insert(supportMessages).values({
      id: newId(),
      ticketId,
      authorType: "ai",
      body: ai.answer,
      createdAt: now + 1,
    });
    await db
      .update(supportTickets)
      .set({ aiResolved: ai.confident ? 1 : 0, updatedAt: now + 1 })
      .where(eq(supportTickets.id, ticketId));
    escalate = !ai.confident;
  }

  if (escalate) {
    const user = await db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.id, userId),
      columns: { email: true },
    });
    await sendEmail(c.env, {
      to: c.env.SUPPORT_EMAIL || c.env.EMAIL_FROM || "hello@vibin.be",
      subject: `[VIBIN support] ${body.subject}`,
      text: `New ticket from ${user?.email ?? userId} (${body.category}):\n\n${body.body}\n\n${
        ai ? "(AI answered but was not confident.)" : "(No AI configured — needs a human.)"
      }\n\nOpen in the Command Center: /admin/support/${ticketId}`,
    });
  }

  const messages = await db.query.supportMessages.findMany({
    where: eq(supportMessages.ticketId, ticketId),
    orderBy: supportMessages.createdAt,
  });
  return c.json({ ticketId, escalated: escalate, messages }, 201);
});

app.get("/:id", async (c) => {
  const db = createDb(c.env);
  const ticket = await db.query.supportTickets.findFirst({
    where: eq(supportTickets.id, c.req.param("id")),
  });
  if (!ticket || ticket.userId !== uid(c)) throw notFound("Ticket not found.");
  const messages = await db.query.supportMessages.findMany({
    where: and(eq(supportMessages.ticketId, ticket.id), ne(supportMessages.internal, 1)),
    orderBy: supportMessages.createdAt,
  });
  return c.json({ ticket, messages });
});

app.post("/:id/messages", async (c) => {
  const { body } = await parseBody(c, z.object({ body: z.string().trim().min(1).max(4000) }));
  const db = createDb(c.env);
  const ticket = await db.query.supportTickets.findFirst({
    where: eq(supportTickets.id, c.req.param("id")),
  });
  if (!ticket || ticket.userId !== uid(c)) throw notFound("Ticket not found.");
  if (ticket.status === "closed") throw badRequest("This ticket is closed. Start a new one.");

  const now = Math.floor(Date.now() / 1000);
  await db.insert(supportMessages).values({
    id: newId(),
    ticketId: ticket.id,
    authorType: "user",
    authorId: uid(c),
    body,
    createdAt: now,
  });
  await db
    .update(supportTickets)
    .set({ status: "open", updatedAt: now })
    .where(eq(supportTickets.id, ticket.id));
  return c.json({ ok: true });
});

export default app;
