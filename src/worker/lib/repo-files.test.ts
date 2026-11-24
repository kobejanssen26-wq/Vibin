import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  decodeText,
  isOwnerOnlyWrite,
  isSensitivePath,
  looksBinaryByName,
  normalizeRepoPath,
  repoConfig,
} from "./repo-files";
import type { Env } from "../env";

describe("normalizeRepoPath", () => {
  it("accepts clean relative paths and the root", () => {
    expect(normalizeRepoPath("")).toBe("");
    expect(normalizeRepoPath("/")).toBe("");
    expect(normalizeRepoPath("src/worker/index.ts")).toBe("src/worker/index.ts");
    expect(normalizeRepoPath("src/client/")).toBe("src/client");
    expect(normalizeRepoPath("docs/Mijn bestand (1).md")).toBe("docs/Mijn bestand (1).md");
  });

  it("rejects directory traversal in every spelling", () => {
    for (const p of [
      "..",
      "../etc/passwd",
      "src/../../etc/passwd",
      "src/./index.ts",
      "src//index.ts",
      "/../x",
      "/etc/passwd",
      "/src/worker/index.ts",
      "....//....//x",
      "src/...",
      "..\\..\\windows",
      "src\\worker",
      "%2e%2e/secret",
      "src/%2e%2e/x",
      "C:/Windows/win.ini",
      "src/file.ts?x=1",
      "src/file.ts#frag",
      "src/\u0000x",
      "src/\nx",
      " src/x",
      "src /x",
    ]) {
      expect(normalizeRepoPath(p), JSON.stringify(p)).toBeNull();
    }
  });

  it("rejects non-strings and absurd lengths", () => {
    expect(normalizeRepoPath(undefined)).toBeNull();
    expect(normalizeRepoPath(42)).toBeNull();
    expect(normalizeRepoPath("a/".repeat(26))).toBeNull();
    expect(normalizeRepoPath("x".repeat(301))).toBeNull();
  });
});

describe("isSensitivePath", () => {
  it("hides env files, secrets, keys, git internals and local state", () => {
    for (const p of [
      ".env",
      ".env.local",
      ".env.production",
      "apps/web/.env",
      "config/prod.env",
      ".dev.vars",
      ".dev.vars.staging",
      ".git/config",
      "node_modules/x/index.js",
      ".wrangler/state/v3/d1/db.sqlite",
      ".claude/settings.local.json",
      "certs/server.pem",
      "deploy/private.key",
      "id_rsa",
      "keys/id_ed25519.pub",
      ".npmrc",
      "secrets/api.txt",
      "credentials.json",
      "service-account-prod.json",
      "client_secret_123.json",
      "data/local.sqlite",
      "backup.db",
    ]) {
      expect(isSensitivePath(p), p).toBe(true);
    }
  });

  it("is case-insensitive and does not hide normal code", () => {
    expect(isSensitivePath(".ENV")).toBe(true);
    expect(isSensitivePath(".Git/HEAD")).toBe(true);
    for (const p of [
      "src/worker/index.ts",
      "src/client/admin/pages/Settings.tsx",
      "wrangler.jsonc",
      "README.md",
      ".gitignore",
      ".github/workflows/ci.yml",
      "docs/environment-setup.md",
      "src/worker/lib/crypto-box.ts",
      ".dev.vars.example".replace(".dev.vars.example", "dev-vars-example.md"),
    ]) {
      expect(isSensitivePath(p), p).toBe(false);
    }
  });
});

describe("isOwnerOnlyWrite", () => {
  it("protects the access-control and deployment machinery from developer edits", () => {
    for (const p of [
      "src/worker/index.ts",
      "src/worker/middleware/admin.ts",
      "src/worker/lib/admin-rbac.ts",
      "src/worker/lib/developer-access.ts",
      "src/worker/lib/repo-files.ts",
      "src/worker/lib/password.ts",
      "src/worker/routes/admin-auth.ts",
      "src/worker/routes/admin-team.ts",
      "src/worker/routes/admin-files.ts",
      "src/worker/db/schema.ts",
      "src/shared/constants.ts",
      "migrations/0017_developer_access.sql",
      ".github/workflows/deploy.yml",
      "wrangler.jsonc",
      "package.json",
      "CLAUDE.md",
    ]) {
      expect(isOwnerOnlyWrite(p), p).toBe(true);
    }
    for (const p of ["src/client/pages/Home.tsx", "src/worker/routes/activities.ts", "README.md", "docs/audit-pipeline.md"]) {
      expect(isOwnerOnlyWrite(p), p).toBe(false);
    }
  });
});

describe("misc helpers", () => {
  it("round-trips UTF-8 text through base64", () => {
    const text = "const café = 'één ✓';\n// 日本語 🚀\n";
    const b64 = bytesToBase64(new TextEncoder().encode(text));
    expect(decodeText(base64ToBytes(b64))).toBe(text);
    expect(decodeText(base64ToBytes(`${b64.slice(0, 8)}\n${b64.slice(8)}`))).toBe(text); // GitHub wraps lines
  });

  it("treats NUL bytes and invalid UTF-8 as binary", () => {
    expect(decodeText(new Uint8Array([104, 105, 0, 1]))).toBeNull();
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
    expect(looksBinaryByName("public/logo.PNG")).toBe(true);
    expect(looksBinaryByName("src/a.ts")).toBe(false);
  });

  it("only configures the repository with a token and a valid owner/name", () => {
    const base = { GITHUB_TOKEN: "t", GITHUB_REPO: "acme/vibin" } as unknown as Env;
    expect(repoConfig({} as Env)).toBeNull();
    expect(repoConfig({ GITHUB_REPO: "acme/vibin" } as Env)).toBeNull();
    expect(repoConfig({ GITHUB_TOKEN: "t", GITHUB_REPO: "../../etc" } as Env)).toBeNull();
    expect(repoConfig({ ...base, GITHUB_BRANCH: "../x" } as Env)).toBeNull();
    expect(repoConfig(base)).toMatchObject({ repo: "acme/vibin", branch: "main", base: "https://api.github.com" });
  });
});
