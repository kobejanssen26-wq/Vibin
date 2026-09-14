/**
 * CSV import (§9-§12) — upload -> parse -> validate -> preview -> confirm.
 * Nothing is written to the catalogue until POST /confirm: preview only
 * parses, validates against the exact same schema the create/edit form uses
 * (activityInput), and flags likely duplicates for the admin to decide on.
 * The validated, ready-to-insert rows live in KV for 30 minutes between
 * preview and confirm so a large CSV isn't re-uploaded/re-parsed twice.
 */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { parseBody } from "../lib/validate";
import { audit } from "../lib/audit";
import { parseCsvToRecords } from "../lib/csv";
import {
  ACTIVITY_CSV_COLUMNS,
  REQUIRED_CSV_HEADERS,
} from "../lib/activity-csv-columns";
import {
  activityInput,
  ensureAdminProvider,
  scaleLatLng,
  type ActivityInput,
} from "../lib/activity-input";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const MAX_ROWS = 20_000;
const PREVIEW_LIST_CAP = 300; // don't ship 6,000 error strings to the browser
const KV_TTL_SECONDS = 1800;
const BATCH_SIZE = 200; // matches the seed pipeline's proven-safe chunk size

type PreparedRow =
  | { row: number; action: "create"; data: ActivityInput }
  | { row: number; action: "update"; targetId: string; data: ActivityInput }
  | {
      row: number;
      action: "duplicate";
      data: ActivityInput;
      candidateId: string;
      candidateTitle: string;
      reason: string;
    };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normUrl = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\/+$/, "");

/* ------------------------------- preview -------------------------------- */
app.post("/activities/import/preview", async (c) => {
  const { csv } = await parseBody(c, z.object({ csv: z.string().min(1).max(30_000_000) }));
  const { headers, records } = parseCsvToRecords(csv);
  if (headers.length === 0) throw badRequest("The file is empty or not a CSV.");

  const missing = REQUIRED_CSV_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw badRequest(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  }
  if (records.length === 0) throw badRequest("No data rows found below the header.");
  if (records.length > MAX_ROWS) {
    throw badRequest(`Too many rows (${records.length}). Split into files of ${MAX_ROWS} or fewer.`);
  }

  // preload existing catalogue once — every duplicate check below is an
  // in-memory lookup, not a per-row query, so this scales to thousands of rows.
  const existing = await c.env.DB.prepare(
    `SELECT id, title, city, website_url AS websiteUrl, provider_website AS providerWebsite
     FROM activities WHERE active = 1`,
  ).all<{ id: string; title: string; city: string | null; websiteUrl: string | null; providerWebsite: string | null }>();
  const byId = new Map(existing.results.map((r) => [r.id, r]));
  const byTitleCity = new Map<string, { id: string; title: string }>();
  const byUrl = new Map<string, { id: string; title: string }>();
  for (const r of existing.results) {
    const tc = `${norm(r.title)}|${norm(r.city)}`;
    if (!byTitleCity.has(tc)) byTitleCity.set(tc, { id: r.id, title: r.title });
    for (const u of [r.websiteUrl, r.providerWebsite]) {
      const nu = normUrl(u);
      if (nu && !byUrl.has(nu)) byUrl.set(nu, { id: r.id, title: r.title });
    }
  }

  const errors: { row: number; message: string }[] = [];
  const duplicates: {
    row: number;
    title: string;
    reason: string;
    existingId: string;
    existingTitle: string;
  }[] = [];
  const prepared: PreparedRow[] = [];
  let createCount = 0;
  let updateCount = 0;

  records.forEach((rec, i) => {
    const row = i + 2; // 1-indexed + header line
    const idCell = (rec.id ?? "").trim();

    const raw: Record<string, unknown> = {};
    for (const col of ACTIVITY_CSV_COLUMNS) raw[col.key] = col.parse(rec[col.header] ?? "");

    const parsed = activityInput.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((iss) => `${iss.path.join(".") || "value"}: ${iss.message}`)
        .join("; ");
      if (errors.length < PREVIEW_LIST_CAP) errors.push({ row, message: msg });
      return;
    }
    const data = parsed.data;

    if (idCell) {
      const target = byId.get(idCell);
      if (!target) {
        if (errors.length < PREVIEW_LIST_CAP) {
          errors.push({ row, message: `id: "${idCell}" does not match any existing activity.` });
        }
        return;
      }
      prepared.push({ row, action: "update", targetId: idCell, data });
      updateCount++;
      return;
    }

    const tc = `${norm(data.title)}|${norm(data.city)}`;
    const byTC = byTitleCity.get(tc);
    const byW =
      byUrl.get(normUrl(data.websiteUrl)) || byUrl.get(normUrl(data.providerWebsite));
    const match = byTC ?? byW;
    if (match) {
      const reason = byTC
        ? "Same name and city as an existing activity"
        : "Same website URL as an existing activity";
      prepared.push({
        row,
        action: "duplicate",
        data,
        candidateId: match.id,
        candidateTitle: match.title,
        reason,
      });
      if (duplicates.length < PREVIEW_LIST_CAP) {
        duplicates.push({ row, title: data.title, reason, existingId: match.id, existingTitle: match.title });
      }
      return;
    }

    prepared.push({ row, action: "create", data });
    createCount++;
  });

  const importId = newId();
  await c.env.KV.put(`import:${importId}`, JSON.stringify({ prepared }), {
    expirationTtl: KV_TTL_SECONDS,
  });

  return c.json({
    importId,
    totalRows: records.length,
    createCount,
    updateCount,
    duplicateCount: prepared.filter((p) => p.action === "duplicate").length,
    errorCount: records.length - prepared.length,
    errors,
    duplicates,
    truncated: {
      errors: errors.length >= PREVIEW_LIST_CAP,
      duplicates: duplicates.length >= PREVIEW_LIST_CAP,
    },
  });
});

/* ------------------------------- confirm -------------------------------- */
app.post("/activities/import/confirm", async (c) => {
  const { importId, duplicateDecisions } = await parseBody(
    c,
    z.object({
      importId: z.string().min(1).max(64),
      duplicateDecisions: z.record(z.enum(["skip", "update", "create"])).default({}),
    }),
  );
  const cached = await c.env.KV.get(`import:${importId}`);
  if (!cached) throw notFound("This import preview has expired. Upload the file again.");
  const { prepared } = JSON.parse(cached) as { prepared: PreparedRow[] };

  const db = createDb(c.env);
  const providerId = await ensureAdminProvider(c.env);
  const now = Math.floor(Date.now() / 1000);

  type Op = { kind: "insert"; id: string; data: ActivityInput } | { kind: "update"; id: string; data: ActivityInput };
  const ops: Op[] = [];
  let skipped = 0;

  for (const p of prepared) {
    if (p.action === "create") {
      ops.push({ kind: "insert", id: newId(), data: p.data });
    } else if (p.action === "update") {
      ops.push({ kind: "update", id: p.targetId, data: p.data });
    } else {
      const decision = duplicateDecisions[String(p.row)] ?? "skip";
      if (decision === "skip") skipped++;
      else if (decision === "update") ops.push({ kind: "update", id: p.candidateId, data: p.data });
      else ops.push({ kind: "insert", id: newId(), data: p.data });
    }
  }

  let created = 0;
  let updated = 0;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = ops.slice(i, i + BATCH_SIZE).map((op) => {
      const d = op.data;
      const common = {
        ...d,
        lat: scaleLatLng(d.lat) ?? null,
        lng: scaleLatLng(d.lng) ?? null,
        tags: JSON.stringify(d.tags),
        openingHours: JSON.stringify(d.openingHours),
        active: d.active ? 1 : 0,
        updatedAt: now,
      };
      if (op.kind === "insert") {
        created++;
        return db.insert(activities).values({
          id: op.id,
          providerId,
          externalId: `admin-import-${op.id}`,
          ...common,
          lastVerifiedAt: d.status === "verified" ? now : null,
          createdAt: now,
        });
      }
      updated++;
      return db
        .update(activities)
        .set({
          ...common,
          lastVerifiedAt: d.status === "verified" ? now : undefined,
        })
        .where(eq(activities.id, op.id));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic batch length; Drizzle's batch() only needs the tuple shape for compile-time inference
    if (batch.length) await db.batch(batch as any);
  }

  await c.env.KV.delete(`import:${importId}`);
  await audit(c, {
    action: "activities.imported",
    meta: { created, updated, skipped, total: prepared.length },
  });
  return c.json({ created, updated, skipped });
});

export default app;
