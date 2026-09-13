import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { supportMessages, supportTickets, users } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { parseBody } from "../lib/validate";
import { audit } from "../lib/audit";
import { sendEmail } from "../lib/email";
import { notifyUsers } from "../lib/notify";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pageCount: Math.ceil(total / pageSize) || 1 };
}

app.get("/support/tickets", async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize")) || 25));
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const priority = url.searchParams.get("priority");

  const where: string[] = [];
  const args: unknown[] = [];
  if (q) {
    where.push("(t.subject LIKE ?" + (args.length + 1) + " OR u.email LIKE ?" + (args.length + 1) + " OR t.id = ?" + (args.length + 2) + ")");
    args.push(`%${q}%`, q);
  }
  if (status && ["open", "pending", "resolved", "closed"].includes(status)) {
    where.push(`t.status = ?${args.length + 1}`);
    args.push(status);
  }
  if (category) {
    where.push(`t.category = ?${args.length + 1}`);
    args.push(category);
  }
  if (priority && ["low", "normal", "high"].includes(priority)) {
    where.push(`t.priority = ?${args.length + 1}`);
    args.push(priority);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.ai_resolved AS aiResolved,
            t.created_at AS createdAt, t.updated_at AS updatedAt,
            u.id AS userId, u.email AS userEmail,
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS messageCount
     FROM support_tickets t JOIN users u ON u.id = t.user_id
     ${whereSql}
     ORDER BY t.updated_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all();
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM support_tickets t JOIN users u ON u.id = t.user_id ${whereSql}`,
  )
    .bind(...(args as never[]))
    .first<{ n: number }>();

  return c.json({ rows: rows.results, ...pageMeta(total?.n ?? 0, page, pageSize) });
});

app.get("/support/tickets/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const ticket = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
  if (!ticket) throw notFound("Ticket not found.");
  const user = await db.query.users.findFirst({
    where: eq(users.id, ticket.userId),
    columns: { id: true, email: true },
  });
  const messages = await db.query.supportMessages.findMany({
    where: eq(supportMessages.ticketId, id),
    orderBy: supportMessages.createdAt,
  });
  const messageAuthors = await db.query.users.findMany({
    where: (u, { inArray: inA }) =>
      inA(
        u.id,
        [...new Set(messages.map((m) => m.authorId).filter((x): x is string => !!x))],
      ),
    columns: { id: true, email: true },
  });
  const authorEmail = Object.fromEntries(messageAuthors.map((a) => [a.id, a.email]));
  return c.json({
    ticket,
    user,
    messages: messages.map((m) => ({ ...m, authorEmail: m.authorId ? authorEmail[m.authorId] : null })),
  });
});

app.post("/support/tickets/:id/reply", async (c) => {
  const id = c.req.param("id");
  const { body, internal } = await parseBody(
    c,
    z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().default(false) }),
  );
  const db = createDb(c.env);
  const ticket = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
  if (!ticket) throw notFound("Ticket not found.");

  const now = Math.floor(Date.now() / 1000);
  await db.insert(supportMessages).values({
    id: newId(),
    ticketId: id,
    authorType: "admin",
    authorId: c.get("adminUserId"),
    body,
    internal: internal ? 1 : 0,
    createdAt: now,
  });
  await db
    .update(supportTickets)
    .set({ status: internal ? ticket.status : "pending", updatedAt: now })
    .where(eq(supportTickets.id, id));

  if (!internal) {
    await notifyUsers(db, [ticket.userId], {
      kind: "support_reply",
      title: "VIBIN support replied",
      body: body.slice(0, 120),
      data: { ticketId: id },
    });
  }
  await audit(c, {
    action: "support.replied",
    targetType: "support_ticket",
    targetId: id,
    meta: { internal },
  });
  return c.json({ ok: true });
});

app.patch("/support/tickets/:id", async (c) => {
  const id = c.req.param("id");
  const body = await parseBody(
    c,
    z.object({
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
      assignedTo: z.string().nullable().optional(),
    }),
  );
  const db = createDb(c.env);
  const ticket = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
  if (!ticket) throw notFound("Ticket not found.");
  if (Object.keys(body).length === 0) throw badRequest("Nothing to update.");

  await db
    .update(supportTickets)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(supportTickets.id, id));
  await audit(c, {
    action: "support.updated",
    targetType: "support_ticket",
    targetId: id,
    meta: body,
  });
  return c.json({ ok: true });
});

export default app;
