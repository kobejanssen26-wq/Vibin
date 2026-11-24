/**
 * A tiny in-memory stand-in for the GitHub Contents API (list directory / read file / update file),
 * used by the developer-access tests. Token: "Bearer test-token", repository: acme/vibin.
 */
import { createHash } from "node:crypto";
import http from "node:http";

export const sha1 = (b) => createHash("sha1").update(b).digest("hex");

export function createMockGitHub() {
  const repo = new Map();
  const calls = [];
  const commits = [];
  const setFile = (p, content) => repo.set(p, { content: Buffer.isBuffer(content) ? content : Buffer.from(content), sha: sha1(Buffer.isBuffer(content) ? content : Buffer.from(content)) });
  setFile("README.md", "# VIBIN\nhello\n");
  setFile("docs/guide.md", "# Guide\n");
  setFile("src/client/pages/Home.tsx", "export const Home = () => null;\n");
  setFile("src/worker/index.ts", "// worker entry\n");
  setFile("src/worker/lib/admin-rbac.ts", "// rbac\n");
  setFile("src/worker/lib/other.ts", "// other\n");
  setFile(".env", "SECRET=top");
  setFile(".dev.vars", "ENCRYPTION_KEY=abc");
  setFile("config/server.pem", "-----BEGIN-----");
  setFile("public/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  setFile("big/huge.txt", "x".repeat(500_000));

  const mock = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const p = decodeURIComponent(u.pathname);
    calls.push(`${req.method} ${p}`);
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bearer test-token") return send(401, { message: "Bad credentials" });
    const m = p.match(/^\/repos\/acme\/vibin\/contents\/?(.*)$/);
    if (!m) return send(404, { message: "Not Found" });
    const target = m[1].replace(/\/$/, "");
    if (req.method === "GET") {
      if (repo.has(target)) {
        const f = repo.get(target);
        return send(200, {
          type: "file",
          name: target.split("/").pop(),
          path: target,
          size: f.content.length,
          sha: f.sha,
          content: f.content.length > 400_000 ? "" : f.content.toString("base64").replace(/(.{60})/g, "$1\n"),
          encoding: "base64",
        });
      }
      const prefix = target ? `${target}/` : "";
      const kids = new Map();
      for (const [k, f] of repo) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const name = rest.split("/")[0];
        const isDir = rest.includes("/");
        if (!kids.has(name)) kids.set(name, { name, path: prefix + name, type: isDir ? "dir" : "file", size: isDir ? 0 : f.content.length, sha: f.sha });
      }
      if (!kids.size && target) return send(404, { message: "Not Found" });
      return send(200, [...kids.values()]);
    }
    if (req.method === "PUT") {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        const body = JSON.parse(raw);
        const f = repo.get(target);
        if (!f) return send(404, { message: "Not Found" });
        if (body.sha !== f.sha) return send(409, { message: "does not match" });
        const content = Buffer.from(body.content, "base64");
        setFile(target, content);
        const commit = { path: target, message: body.message, branch: body.branch, sha: sha1(`${Date.now()}${target}`) };
        commits.push(commit);
        return send(200, { content: { sha: repo.get(target).sha }, commit: { sha: commit.sha, html_url: `https://example.test/commit/${commit.sha}` } });
      });
      return;
    }
    return send(405, {});
  });


  return { mock, repo, calls, commits, setFile };
}
