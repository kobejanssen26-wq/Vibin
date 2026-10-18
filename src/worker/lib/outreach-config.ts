import { z } from "zod";
import type { Env } from "../env";
import { getSetting, setSetting } from "./system-settings";
import {
  DEFAULT_BODY,
  LEGACY_BODY,
  defaultConfig,
  isValidEmail,
  type OutreachConfig,
} from "./outreach-core";

const KEY = "outreach_config";

const emailOrEmpty = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || isValidEmail(v), "Geen geldig e-mailadres.");

/** Fields the owner may change through the settings form (legal review has its own endpoint). */
export const configPatchSchema = z
  .object({
    mode: z.enum(["test", "live"]),
    testInbox: emailOrEmpty,
    fromName: z.string().trim().min(1).max(80),
    fromEmail: emailOrEmpty,
    replyTo: emailOrEmpty,
    contactAddress: emailOrEmpty,
    websiteUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Gebruik een https://-adres."),
    senderIdentity: z.string().trim().max(500),
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(20).max(8000),
    bodyMulti: z.string().trim().min(20).max(8000),
    dailyCap: z.number().int().min(1).max(500),
    perRun: z.number().int().min(1).max(50),
    autoDiscovery: z.boolean(),
    discoveryPerRun: z.number().int().min(1).max(25),
  })
  .partial();

export async function loadConfig(env: Env): Promise<OutreachConfig> {
  const base = defaultConfig(env.APP_URL);
  const raw = await getSetting(env, KEY);
  if (!raw) return base;
  try {
    const stored = JSON.parse(raw) as Partial<OutreachConfig>;
    // Field by field: one stale/invalid value must never throw away the others.
    const merged: OutreachConfig = { ...base };
    const shape = configPatchSchema.shape as Record<string, z.ZodTypeAny>;
    for (const key of Object.keys(shape)) {
      const v = (stored as Record<string, unknown>)[key];
      if (v === undefined) continue;
      const parsed = shape[key]!.safeParse(v);
      if (parsed.success && parsed.data !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = parsed.data;
      }
    }
    const lr = stored.legalReview;
    if (lr && (lr.status === "approved" || lr.status === "not_reviewed")) {
      merged.legalReview = {
        status: lr.status,
        reviewedAt: typeof lr.reviewedAt === "number" ? lr.reviewedAt : null,
        reviewedBy: typeof lr.reviewedBy === "string" ? lr.reviewedBy : null,
        note: typeof lr.note === "string" ? lr.note.slice(0, 1000) : "",
      };
    }
    // A stored copy of the old wording (before activities were named) moves to the new one.
    if (merged.body.trim() === LEGACY_BODY.trim()) merged.body = DEFAULT_BODY;
    if (!merged.websiteUrl) merged.websiteUrl = base.websiteUrl;
    return merged;
  } catch {
    return base;
  }
}

export async function saveConfig(
  env: Env,
  config: OutreachConfig,
  userId: string | null,
): Promise<void> {
  await setSetting(env, KEY, JSON.stringify(config), userId);
}

export interface Readiness {
  /** Things that must be fixed before real sending is possible. */
  blockers: string[];
  /** True when none of the blockers apply. */
  ready: boolean;
}

/** Same rules the send gate enforces, summarised for the settings screen. */
export function liveReadiness(config: OutreachConfig, env: Env): Readiness {
  const b: string[] = [];
  if (env.APP_ENV !== "production") b.push("Echte verzending is uitgeschakeld buiten de productieomgeving.");
  if (config.legalReview.status !== "approved") b.push("Juridische controle is nog niet bevestigd.");
  if (!isValidEmail(config.fromEmail)) b.push("Afzenderadres ontbreekt.");
  if (!isValidEmail(config.replyTo)) b.push("Reply-to adres ontbreekt.");
  if (!isValidEmail(config.contactAddress)) b.push("Officieel contactadres ontbreekt.");
  if (!config.senderIdentity.trim()) b.push("Identiteit van de afzender (bedrijfsgegevens) ontbreekt.");
  if (!env.EMAIL_API_KEY) b.push("EMAIL_API_KEY is niet ingesteld op de server.");
  if (!env.ENCRYPTION_KEY) b.push("ENCRYPTION_KEY ontbreekt (nodig voor afmeldlinks).");
  return { blockers: b, ready: b.length === 0 };
}
