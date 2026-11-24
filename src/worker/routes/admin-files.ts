/**
 * Admin File Manager API — mounted at /api/admin/cc/files behind withAdminSession + requireStaff() +
 * ccPermissionGate() (`files.read` for everything here, `files.write` for saving).
 *
 * The "project directory" is the GitHub repository (Workers have no filesystem). Every path is
 * validated on the server: clean relative paths only (no `..`, no absolute paths, no encoded tricks),
 * and sensitive files (.env, .dev.vars, keys, credentials, .git, node_modules …) are invisible and
 * can be neither read nor written. Saving only updates an EXISTING file, needs the file's current
 * sha (so a stale editor can't overwrite newer work), and becomes a commit on the configured branch.
 * The GitHub token stays on the server. Responses are never cached.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { parseBody } from "../lib/validate";
import { AppError, badRequest, forbidden } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import { audit } from "../lib/audit";
import { requirePermission } from "../middleware/admin";
import {
  isOwnerOnlyWrite,
  isSensitivePath,
  listDir,
  MAX_EDIT_BYTES,
  normalizeRepoPath,
  readFile,
  repoConfig,
  writeFile,
  type RepoConfig,
} from "../lib/repo-files";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

function configOr503(env: Env): RepoConfig {
  const cfg = repoConfig(env);
  if (!cfg) {
    throw new AppError(
      503,
      "not_configured",
      "The File Manager is not connected to the repository yet. Set the GITHUB_TOKEN secret and the GITHUB_REPO variable (see docs/developer-access.md).",
    );
  }
  return cfg;
}

/** Clean + vet a path from the browser. `allowRoot` lets "" (the repository root) through. */
function vetPath(raw: unknown, allowRoot: boolean): string {
  const p = normalizeRepoPath(raw);
  if (p === null) throw badRequest("That path is not valid.");
  if (p === "" && !allowRoot) throw badRequest("A file path is required.");
  if (p !== "" && isSensitivePath(p)) throw forbidden("That file is protected and cannot be accessed.");
  return p;
}

function canWrite(c: { get: <K extends keyof Vars>(k: K) => Vars[K] }, path: string): boolean {
  if (c.get("adminRole") === "owner") return true;
  return c.get("adminPerms").includes("files.write") && !isOwnerOnlyWrite(path);
}

/* -------------------------------- config -------------------------------- */
app.get("/config", (c) => {
  const cfg = repoConfig(c.env);
  return c.json({
    configured: !!cfg,
    repo: cfg?.repo ?? null,
    branch: cfg?.branch ?? null,
    canWrite: c.get("adminRole") === "owner" || c.get("adminPerms").includes("files.write"),
    maxEditBytes: MAX_EDIT_BYTES,
  });
});

/* --------------------------------- list --------------------------------- */
app.get("/list", async (c) => {
  const cfg = configOr503(c.env);
  const dir = vetPath(c.req.query("path") ?? "", true);
  const entries = await listDir(cfg, dir);
  return c.json({
    path: dir,
    branch: cfg.branch,
    entries: entries.map((e) => ({
      ...e,
      ownerOnly: e.type === "file" && isOwnerOnlyWrite(e.path),
    })),
  });
});

/* --------------------------------- read --------------------------------- */
app.get("/read", async (c) => {
  const cfg = configOr503(c.env);
  const path = vetPath(c.req.query("path"), false);
  const file = await readFile(cfg, path);
  const name = path.split("/").pop() ?? path;
  const ownerOnly = isOwnerOnlyWrite(path);
  return c.json({
    path,
    name,
    kind: file.kind,
    sha: file.sha,
    size: file.size,
    content: file.kind === "text" ? file.content : null,
    ownerOnly,
    canEdit: file.kind === "text" && canWrite(c, path),
    branch: cfg.branch,
  });
});

/* --------------------------------- write -------------------------------- */
app.put("/write", requirePermission("files.write"), async (c) => {
  const cfg = configOr503(c.env);
  const adminId = c.get("adminUserId")!;
  const body = await parseBody(
    c,
    z.object({
      path: z.string().min(1).max(300),
      content: z.string().max(MAX_EDIT_BYTES * 2),
      sha: z.string().regex(/^[0-9a-f]{40}$/i, "Missing or invalid file version."),
      message: z.string().max(200).optional(),
    }),
  );
  const path = vetPath(body.path, false);
  if (!canWrite(c, path)) {
    await audit(c, { action: "files.write_denied", targetType: "file", targetId: path, meta: { reason: "owner_only_file" } });
    throw forbidden("Only the owner can change this file (access control / deployment).");
  }
  if (new TextEncoder().encode(body.content).length > MAX_EDIT_BYTES) {
    throw badRequest("That file is too large to save from the admin editor.");
  }
  await rateLimit(c.env, "files-write", adminId, 60, 10 * 60);

  const role = c.get("adminRole") ?? "developer";
  const firstLine = (body.message ?? "").split("\n")[0]!.replace(/[^\P{C}\t]/gu, "").trim().slice(0, 100);
  const message = `${firstLine || `Update ${path}`}\n\nEdited via the VIBIN admin File Manager (${role}).`;
  const saved = await writeFile(cfg, path, body.content, body.sha, message);

  await audit(c, {
    action: "files.write",
    targetType: "file",
    targetId: path,
    meta: { branch: cfg.branch, bytes: body.content.length, commit: saved.commitSha },
  });
  return c.json({ ok: true, sha: saved.sha, commit: { sha: saved.commitSha, url: saved.commitUrl } });
});

export default app;
