/**
 * Owner Command Center — encrypted credential vault (`/api/admin/cc/vault/*`).
 *
 * Behind the same `withAdminSession` + `requireOwner()` gate as the rest of the
 * command center. Secret values are AES-256-GCM encrypted with the server-side
 * `ENCRYPTION_KEY` (never in the DB, never sent to the frontend, never logged):
 *   - list / detail responses NEVER include the secret
 *   - only `POST /vault/:id/reveal`, guarded by a fresh password re-entry,
 *     decrypts one — and every reveal is written to the access log + audit log
 *   - audit / access-log rows record the action and the credential id, never
 *     the value
 */
import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  credentialAccessLog,
  credentials,
  users,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { verifyPassword } from "../lib/password";
import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
} from "../lib/crypto-box";
import { audit } from "../lib/audit";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowS = () => Math.floor(Date.now() / 1000);

const CATEGORIES = [
  "activity_provider",
  "development",
  "services",
  "test_account",
  "other",
] as const;

const meta = z.object({
  name: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(160).nullable().optional(),
  category: z.enum(CATEGORIES).default("other"),
  username: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  url: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(8000).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
});
const clean = (v: unknown) => (v === "" || v === undefined ? null : v);

async function logAccess(
  c: Context<Ctx>,
  credentialId: string,
  action: "viewed" | "created" | "updated" | "deleted" | "exported",
) {
  const db = createDb(c.env);
  await db.insert(credentialAccessLog).values({
    id: newId(),
    credentialId,
    actorId: c.get("adminUserId"),
    action,
    createdAt: nowS(),
  });
}

async function reauth(env: Env, userId: string, password: string) {
  const db = createDb(env);
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const { ok } = await verifyPassword(password, u?.passwordHash ?? "");
  if (!ok) throw forbidden("Password re-entry failed.");
}

/* -------------------------------- list -------------------------------- */

app.get("/", async (c) => {
  const category = new URL(c.req.url).searchParams.get("category");
  const db = createDb(c.env);
  const rows = await db.query.credentials.findMany({
    orderBy: (t, { desc }) => desc(t.updatedAt),
    columns: {
      id: true,
      name: true,
      provider: true,
      category: true,
      username: true,
      email: true,
      url: true,
      notes: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      lastAccessedAt: true,
      // secretEnc intentionally omitted
    },
  });
  const filtered = category
    ? rows.filter((r) => r.category === category)
    : rows;
  return c.json({
    encryptionConfigured: hasEncryptionKey(c.env),
    rows: filtered.map((r) => ({
      ...r,
      tags: safeTags(r.tags),
      hasSecret: true,
    })),
  });
});

function safeTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/* ------------------------------- create ------------------------------- */

app.post("/", async (c) => {
  if (!hasEncryptionKey(c.env))
    throw badRequest("ENCRYPTION_KEY is not configured — cannot store secrets.");
  const body = await parseBody(
    c,
    meta.extend({ secret: z.string().min(1).max(8000) }),
  );
  const id = newId();
  const t = nowS();
  const db = createDb(c.env);
  await db.insert(credentials).values({
    id,
    name: body.name,
    provider: clean(body.provider) as string | null,
    category: body.category,
    username: clean(body.username) as string | null,
    email: clean(body.email) as string | null,
    url: clean(body.url) as string | null,
    notes: body.notes ?? "",
    secretEnc: await encryptSecret(c.env, body.secret),
    tags: JSON.stringify(body.tags ?? []),
    ownerId: c.get("adminUserId"),
    createdAt: t,
    updatedAt: t,
  });
  await logAccess(c, id, "created");
  await audit(c, {
    action: "credential.created",
    targetType: "credential",
    targetId: id,
    meta: { name: body.name, category: body.category },
  });
  return c.json({ id }, 201);
});

/* ------------------------------- update ------------------------------- */

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await parseBody(
    c,
    meta.extend({ secret: z.string().min(1).max(8000).optional() }),
  );
  const db = createDb(c.env);
  const existing = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
    columns: { id: true },
  });
  if (!existing) throw notFound("Credential not found.");

  await db
    .update(credentials)
    .set({
      name: body.name,
      provider: clean(body.provider) as string | null,
      category: body.category,
      username: clean(body.username) as string | null,
      email: clean(body.email) as string | null,
      url: clean(body.url) as string | null,
      notes: body.notes ?? "",
      tags: JSON.stringify(body.tags ?? []),
      ...(body.secret
        ? { secretEnc: await encryptSecret(c.env, body.secret) }
        : {}),
      updatedAt: nowS(),
    })
    .where(eq(credentials.id, id));
  await logAccess(c, id, "updated");
  await audit(c, {
    action: "credential.updated",
    targetType: "credential",
    targetId: id,
    meta: { secretRotated: !!body.secret },
  });
  return c.json({ ok: true });
});

/* ------------------------------- delete ------------------------------- */

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);
  const res = await db.delete(credentials).where(eq(credentials.id, id));
  // access log rows are kept on purpose (id no longer resolvable, that's fine)
  await logAccess(c, id, "deleted");
  await audit(c, {
    action: "credential.deleted",
    targetType: "credential",
    targetId: id,
  });
  void res;
  return c.json({ ok: true });
});

/* ------------------------------- reveal ------------------------------- */

app.post("/:id/reveal", async (c) => {
  const id = c.req.param("id");
  const { password } = await parseBody(
    c,
    z.object({ password: z.string().min(1).max(200) }),
  );
  await reauth(c.env, c.get("adminUserId")!, password);

  const db = createDb(c.env);
  const row = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  });
  if (!row) throw notFound("Credential not found.");

  const secret = await decryptSecret(c.env, row.secretEnc);
  await db
    .update(credentials)
    .set({ lastAccessedAt: nowS() })
    .where(eq(credentials.id, id));
  await logAccess(c, id, "viewed");
  await audit(c, {
    action: "credential.viewed",
    targetType: "credential",
    targetId: id,
    meta: { name: row.name },
  });
  return c.json({ secret });
});

/* ----------------------------- access log ---------------------------- */

app.get("/:id/access-log", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.action, l.created_at AS createdAt, u.email AS actorEmail
     FROM credential_access_log l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.credential_id = ?1 ORDER BY l.created_at DESC LIMIT 100`,
  )
    .bind(id)
    .all();
  return c.json({ rows: rows.results });
});

export default app;
