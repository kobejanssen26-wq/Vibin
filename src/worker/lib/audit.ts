import type { Context } from "hono";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { auditLog } from "../db/schema";
import { newId } from "./id";
import { clientIp } from "./ratelimit";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/** Keys whose values must never reach the audit log, even by accident. */
const SECRET_KEY = /(pass(word)?|secret|token|code|otp|mfa|key|hash|cookie|auth)/i;

/** Recursively drop secret-looking values from audit metadata. */
function sanitizeMeta(input: unknown, depth = 0): unknown {
  if (depth > 4 || input == null) return input;
  if (Array.isArray(input)) return input.map((v) => sanitizeMeta(v, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : sanitizeMeta(v, depth + 1);
    }
    return out;
  }
  return input;
}

export interface AuditEntry {
  action: string; // "admin.login", "user.suspended", "credential.viewed", …
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  actorType?: "owner" | "admin" | "system";
  actorId?: string | null;
}

/**
 * Append one row to the audit trail. Never throws into the request path — a
 * failed audit write is logged to console but does not break the action.
 * Secret values are stripped from `meta` as defense in depth.
 */
export async function audit(c: Ctx, entry: AuditEntry): Promise<void> {
  try {
    const db = createDb(c.env);
    const actorId =
      entry.actorId !== undefined
        ? entry.actorId
        : c.get("adminUserId") ?? c.get("userId") ?? null;
    await db.insert(auditLog).values({
      id: newId(),
      actorType: entry.actorType ?? "owner",
      actorId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: JSON.stringify(sanitizeMeta(entry.meta ?? {})),
      ip: clientIp(c.req.raw),
      userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error("audit write failed:", entry.action, err);
  }
}
