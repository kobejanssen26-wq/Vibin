/**
 * File Manager backend helpers.
 *
 * Cloudflare Workers have no filesystem, so the "project directory" the admin edits is the GitHub
 * repository (Contents API). This file holds (1) the pure path/safety rules that every request goes
 * through, and (2) a tiny GitHub client. The token is read from the Worker secret GITHUB_TOKEN and
 * is never returned to the browser or written to logs.
 */
import type { Env } from "../env";
import { AppError } from "./errors";

/* ------------------------------ path rules ------------------------------ */

const MAX_PATH_LENGTH = 300;
const MAX_SEGMENTS = 25;

/**
 * Normalise a repository-relative path coming from the browser. Returns "" for the repository root
 * and null for anything that is not a plain, clean relative path: no `..`/`.` segments, no absolute
 * paths (a leading `/` is refused), no backslashes, percent-encoding tricks, control characters or shell/URL metacharacters.
 */
export function normalizeRepoPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length > MAX_PATH_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\%?#:*"<>|]/.test(input)) return null;
  if (/^\/*$/.test(input)) return ""; // "" and "/" are the repository root
  if (input.startsWith("/")) return null; // absolute paths are never valid, even though they would stay in the repo
  const trimmed = input.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  if (segments.length > MAX_SEGMENTS) return null;
  for (const seg of segments) {
    if (seg === "" || /^\.+$/.test(seg)) return null; // empty, ".", "..", "..."
    if (seg !== seg.trim()) return null; // leading/trailing whitespace
  }
  return segments.join("/");
}

/** Per path segment (lower-cased). Anything matching is invisible and untouchable in the File Manager. */
const SENSITIVE_SEGMENT: readonly RegExp[] = [
  /^\.git$/,
  /^node_modules$/,
  /^\.wrangler$/,
  /^\.claude$/,
  /^\.env(\..*)?$/,
  /\.env$/,
  /^\.dev\.vars(\..*)?$/,
  /^\.(npmrc|yarnrc|netrc|pypirc|htpasswd|pgpass|git-credentials)$/,
  /^\.(aws|ssh|gnupg|azure|kube|docker)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|tfstate|sqlite3?|db)$/,
  /^secrets?(\..*)?$/,
  /^credentials?(\..*)?$/,
  /^(service-account|client_secret|serviceaccount).*\.json$/,
];

/** True when a file or folder with this path must never be listed, read or written. */
export function isSensitivePath(path: string): boolean {
  return path
    .toLowerCase()
    .split("/")
    .some((seg) => SENSITIVE_SEGMENT.some((re) => re.test(seg)));
}

/**
 * Files that make up the access-control and deployment machinery. Anyone with `files.read` can read
 * them, but only the owner can change them — a developer must not be able to rewrite the rules that
 * limit developers. (Defence in depth: the real boundary is that nothing goes live without a deploy.)
 */
const OWNER_ONLY_WRITE: readonly RegExp[] = [
  /^src\/worker\/index\.ts$/,
  /^src\/worker\/middleware\//,
  /^src\/worker\/env\.ts$/,
  /^src\/worker\/lib\/(admin-|developer-|repo-files|crypto-box|password|totp|session|cookies|recovery-codes|preview-access|system-settings|audit)/,
  /^src\/worker\/routes\/(admin-auth|admin-team|admin-files|admin-vault|auth)\.ts$/,
  /^src\/worker\/db\/schema\.ts$/,
  /^src\/shared\/constants\.ts$/,
  /^migrations\//,
  /^\.github\//,
  /^wrangler\.jsonc?$/,
  /^package(-lock)?\.json$/,
  /^(CLAUDE|SECURITY)\.md$/,
  /^scripts\/audit\//,
];

export function isOwnerOnlyWrite(path: string): boolean {
  return OWNER_ONLY_WRITE.some((re) => re.test(path));
}

/** Extensions that are never shown as text (no download from GitHub either). */
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|zip|gz|tgz|bz2|7z|rar|pdf|mp[34]|mov|webm|ogg|wav|wasm|bin|exe|dll|so|dylib|psd|ai|sketch)$/i;

export function looksBinaryByName(path: string): boolean {
  return BINARY_EXT.test(path);
}

/** Editing cap. Bigger files can be viewed on GitHub, not in the admin editor. */
export const MAX_EDIT_BYTES = 400_000;

/* --------------------------- base64 / utf-8 ------------------------------ */

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Strict UTF-8 decode; null when the bytes are not valid text (binary file). */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/* ------------------------------ GitHub client ---------------------------- */

export interface RepoConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
  base: string; // API origin
}

/** null = the File Manager is not configured yet (no token / repo). */
export function repoConfig(env: Env): RepoConfig | null {
  const token = env.GITHUB_TOKEN?.trim();
  const repo = env.GITHUB_REPO?.trim();
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const branch = (env.GITHUB_BRANCH?.trim() || "main").slice(0, 100);
  if (!/^[\w./-]+$/.test(branch) || branch.includes("..")) return null;
  const base = (env.GITHUB_API_BASE?.trim() || "https://api.github.com").replace(/\/+$/, "");
  return { token, repo, branch, base };
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function gh(cfg: RepoConfig, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${cfg.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "vibin-admin-file-manager",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new AppError(502, "github_unreachable", "Could not reach GitHub. Try again in a moment.");
  }
  return res;
}

/** Translate a failed GitHub response into a safe, token-free error for the browser. */
async function failure(res: Response, what: string): Promise<AppError> {
  if (res.status === 404) return new AppError(404, "not_found", `${what} was not found in the repository.`);
  if (res.status === 409 || res.status === 422) {
    return new AppError(409, "conflict", `${what} changed on GitHub since you opened it. Reload it and re-apply your edit.`);
  }
  if (res.status === 401) {
    return new AppError(502, "github_auth", "GitHub rejected the access token (GITHUB_TOKEN). Check that it is valid.");
  }
  if (res.status === 403 || res.status === 429) {
    const limited = res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429;
    return limited
      ? new AppError(429, "github_rate_limited", "GitHub rate limit reached. Try again in a few minutes.")
      : new AppError(502, "github_forbidden", "GitHub refused the request. The token needs 'Contents: read and write' on this repository.");
  }
  return new AppError(502, "github_error", `GitHub returned an error (${res.status}).`);
}

export interface RepoEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
}

export async function listDir(cfg: RepoConfig, dir: string): Promise<RepoEntry[]> {
  const url = `/repos/${cfg.repo}/contents${dir ? `/${encodePath(dir)}` : ""}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await gh(cfg, url);
  if (!res.ok) throw await failure(res, "That folder");
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new AppError(400, "not_a_folder", "That path is not a folder.");
  const out: RepoEntry[] = [];
  for (const raw of json as Array<Record<string, unknown>>) {
    const type = raw.type === "dir" ? "dir" : raw.type === "file" ? "file" : null;
    const path = typeof raw.path === "string" ? raw.path : "";
    if (!type || !path || isSensitivePath(path)) continue; // symlinks / submodules / sensitive: not shown
    out.push({ name: String(raw.name ?? ""), path, type, size: Number(raw.size ?? 0) });
  }
  out.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : a.type === "dir" ? -1 : 1,
  );
  return out;
}

export type RepoFile =
  | { kind: "text"; sha: string; size: number; content: string }
  | { kind: "binary"; sha: string; size: number }
  | { kind: "too_large"; sha: string; size: number };

export async function readFile(cfg: RepoConfig, path: string): Promise<RepoFile> {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (!res.ok) throw await failure(res, "That file");
  const j = (await res.json()) as Record<string, unknown>;
  if (Array.isArray(j) || j.type !== "file") throw new AppError(400, "not_a_file", "That path is not a file.");
  const sha = String(j.sha ?? "");
  const size = Number(j.size ?? 0);
  if (looksBinaryByName(path)) return { kind: "binary", sha, size };
  if (size > MAX_EDIT_BYTES || typeof j.content !== "string" || (j.content === "" && size > 0)) {
    return { kind: "too_large", sha, size };
  }
  const text = decodeText(base64ToBytes(j.content));
  return text === null ? { kind: "binary", sha, size } : { kind: "text", sha, size, content: text };
}

export async function writeFile(
  cfg: RepoConfig,
  path: string,
  content: string,
  sha: string,
  message: string,
): Promise<{ sha: string; commitSha: string; commitUrl: string | null }> {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: bytesToBase64(new TextEncoder().encode(content)),
      sha,
      branch: cfg.branch,
    }),
  });
  if (!res.ok) throw await failure(res, "That file");
  const j = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string; html_url?: string } };
  return {
    sha: String(j.content?.sha ?? ""),
    commitSha: String(j.commit?.sha ?? ""),
    commitUrl: j.commit?.html_url ?? null,
  };
}
