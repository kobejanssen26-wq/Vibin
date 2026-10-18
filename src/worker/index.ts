import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env, Vars } from "./env";
import { AppError, toResponse } from "./lib/errors";
import { trackNow } from "./lib/analytics";
import { getSetting, SETTINGS } from "./lib/system-settings";
import { withSession, requireAuth } from "./middleware/auth";
import { withAdminSession, requireOwner } from "./middleware/admin";
import { createDb } from "./db/client";
import { runDueSources } from "./events/sync";

import authRoutes from "./routes/auth";
import adminAuthRoutes from "./routes/admin-auth";
import meRoutes from "./routes/me";
import groupRoutes from "./routes/groups";
import inviteRoutes from "./routes/invites";
import activityRoutes from "./routes/activities";
import voteRoutes from "./routes/votes";
import dateRoutes from "./routes/dates";
import planRoutes from "./routes/plans";
import messageRoutes from "./routes/messages";
import reportRoutes from "./routes/reports";
import eventRoutes from "./routes/events";
import geoRoutes from "./routes/geo";
import categoryRoutes from "./routes/categories";
import liveEventRoutes from "./routes/live-events";
import supportRoutes from "./routes/support";
import adminRoutes from "./routes/admin";
import adminCcRoutes from "./routes/admin-cc";
import adminImportRoutes from "./routes/admin-import";
import adminEventRoutes from "./routes/admin-events";
import adminSupportRoutes from "./routes/admin-support";
import adminVaultRoutes from "./routes/admin-vault";
import adminQualityRoutes from "./routes/admin-quality";
import adminOutreachRoutes from "./routes/admin-outreach";
import adminOutreachMailRoutes from "./routes/admin-outreach-mail";
import outreachPublicRoutes from "./routes/outreach-public";
import { runOutreachTick } from "./lib/outreach-send";
import mediaRoutes from "./routes/media";
import goRoutes from "./routes/go";
import contactRoutes from "./routes/contact";

type Ctx = { Bindings: Env; Variables: Vars };

const api = new Hono<Ctx>();

api.use("*", async (c, next) => {
  // The SPA and API are served from the same origin, so CORS is only really
  // exercised by the split dev setup (Vite :5173 → Worker). In production the
  // configured APP_URL is the only allowed origin.
  const allowed =
    c.env.APP_ENV === "development"
      ? [c.env.APP_URL, "http://localhost:5173", "http://127.0.0.1:5173"]
      : [c.env.APP_URL];
  return cors({
    origin: allowed,
    credentials: true,
    allowHeaders: [
      "content-type",
      "authorization",
      "x-vibin-csrf",
      "x-vibin-admin-csrf",
      "x-vibin-client",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  })(c, next);
});

api.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);
api.use("*", withSession);

// Liveness probe only — no environment details.
api.get("/health", (c) => c.json({ ok: true }));

/* Public status: lets the SPA render a maintenance screen before it hits a
   protected route. Never reveals anything sensitive. */
let maintCache: { at: number; on: boolean; msg: string } | null = null;
async function maintenanceState(env: Env) {
  if (maintCache && Date.now() - maintCache.at < 15_000) return maintCache;
  const [on, msg] = await Promise.all([
    getSetting(env, SETTINGS.maintenanceMode),
    getSetting(env, SETTINGS.maintenanceMessage),
  ]);
  maintCache = {
    at: Date.now(),
    on: on === "1",
    msg: msg ?? "",
  };
  return maintCache;
}
api.get("/status", async (c) => {
  const m = await maintenanceState(c.env);
  return c.json({ maintenance: m.on, message: m.msg });
});

/* When maintenance mode is on, the whole normal-user API returns 503. The
   Owner Command Center (/admin/*), the liveness probe and this status route
   stay reachable so the owner can still work and turn it back off. */
api.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    path === "/api/health" ||
    path === "/api/status" ||
    path.startsWith("/api/admin/")
  ) {
    return next();
  }
  const m = await maintenanceState(c.env);
  if (m.on) {
    return c.json(
      { error: "maintenance", message: m.msg || "VIBIN is briefly down for maintenance." },
      503,
    );
  }
  return next();
});

api.route("/auth", authRoutes);
api.route("/media", mediaRoutes);
// Public outbound-click redirect — no auth required (§3); withSession above
// already best-effort-populates userId when a session cookie is present.
api.route("/go", goRoutes);
// Public contact form — reachable without an account.
api.route("/contact", contactRoutes);

/* -------------------------- Owner Command Center ------------------------- *
 * Registered BEFORE the app's `requireAuth` catch-all so `/api/admin/auth/*`
 * can be reached without a normal `vibin_session`.
 *
 * `/api/admin/auth/*`  — pre-authorization: first-run setup, password step,
 *                        MFA step, deployment recovery, session management.
 * `/api/admin/cc/*`     — the command center data API. Requires a live,
 *                        MFA-verified admin session whose account still has
 *                        role='owner', re-checked independently on every
 *                        request. A normal `vibin_session` grants nothing here.
 * The two prefixes never overlap, so the owner gate can't leak onto the
 * pre-auth routes.                                                           */
const adminAuth = new Hono<Ctx>();
adminAuth.use("*", withAdminSession);
adminAuth.route("/", adminAuthRoutes);
api.route("/admin/auth", adminAuth);

const commandCenter = new Hono<Ctx>();
commandCenter.use("*", withAdminSession, requireOwner());
commandCenter.route("/", adminCcRoutes); // dashboards, analytics, browsers, CRM
commandCenter.route("/", adminRoutes); // catalogue + moderation actions
commandCenter.route("/", adminImportRoutes); // CSV template/preview/confirm
commandCenter.route("/", adminEventRoutes); // live events + ingestion sources
commandCenter.route("/", adminSupportRoutes); // help-desk tickets
commandCenter.route("/vault", adminVaultRoutes); // encrypted credential vault
commandCenter.route("/", adminQualityRoutes); // catalogue quality audit
commandCenter.route("/outreach", adminOutreachRoutes); // provider outreach: orgs, contacts, settings
commandCenter.route("/outreach", adminOutreachMailRoutes); // drafts, approval, send, campaigns
api.route("/admin/cc", commandCenter);

// Everything below requires a normal user session.
const authed = new Hono<Ctx>();
authed.use("*", requireAuth);
authed.route("/invites", inviteRoutes);
authed.route("/me", meRoutes);
authed.route("/groups", groupRoutes);
authed.route("/groups", voteRoutes);
authed.route("/groups", dateRoutes);
authed.route("/groups", messageRoutes);
authed.route("/", planRoutes); // /groups/:id/matches, /groups/:id/plans, /plans/:id
authed.route("/activities", activityRoutes);
authed.route("/reports", reportRoutes);
authed.route("/events", eventRoutes);
authed.route("/live-events", liveEventRoutes);
authed.route("/geo", geoRoutes);
authed.route("/categories", categoryRoutes);
authed.route("/support", supportRoutes);
api.route("/", authed);

api.onError((err, c) => {
  // Record genuine server faults (unhandled exceptions / explicit 5xx) for the
  // Command Center error centre. Never store the request body, headers or any
  // secret — just where it happened and a truncated message.
  const status = err instanceof AppError ? err.status : 500;
  if (status >= 500) {
    const p = trackNow(c.env, "server_error", {
      userId: c.get("userId"),
      props: {
        route: new URL(c.req.url).pathname.slice(0, 120),
        method: c.req.method,
        status,
        message: (err instanceof Error ? err.message : String(err)).slice(0, 200),
        env: c.env.APP_ENV,
      },
    });
    const ctx = c.executionCtx as
      | { waitUntil?: (p: Promise<unknown>) => void }
      | undefined;
    if (ctx?.waitUntil) ctx.waitUntil(p);
    else void p;
  }
  return toResponse(err, c);
});
api.notFound((c) => c.json({ error: "not_found", message: "Unknown endpoint." }, 404));

/* ------------------------------------------------------------------ */

const app = new Hono<Ctx>();
app.route("/api", api);
// Public opt-out page for outreach mail (HMAC-signed link, no session).
app.route("/optout", outreachPublicRoutes);

/* ---- Deep-link association files for the iOS / Android apps ----------
 * Served from the Worker so the content-type is guaranteed `application/json`
 * (iOS rejects the AASA file otherwise). The Apple Team ID and the Android
 * signing-cert SHA-256 come from the app's store accounts — set them via the
 * env vars below (wrangler secret / vars) once known. */
app.get("/.well-known/apple-app-site-association", (c) => {
  const appId = `${c.env.APPLE_TEAM_ID ?? "TEAMID"}.be.vibin.app`;
  return c.json({
    applinks: {
      apps: [],
      details: [
        { appID: appId, paths: ["/join/*", "/reset-password", "/verify-email", "/plans/*"] },
      ],
    },
    webcredentials: { apps: [appId] },
  });
});
app.get("/.well-known/assetlinks.json", (c) => {
  const sha = c.env.ANDROID_CERT_SHA256 ?? "AA:BB:CC:DD:...";
  return c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "be.vibin.app",
        sha256_cert_fingerprints: [sha],
      },
    },
  ]);
});

// Static SPA — assets binding handles hashing, caching and the SPA fallback
// (not_found_handling: single-page-application in wrangler.jsonc).
/* ---- "Binnenkort" gate -------------------------------------------------
 * While maintenance mode is ON (Command Center → Settings) every page
 * navigation shows this coming-soon page instead of the app. Only the admin
 * area, its static assets, the opt-out links and the .well-known files stay
 * reachable, so the owner can still sign in and turn it off. The API is
 * already answering 503 to everyone but admins (see the maintenance middleware). */
const COMING_SOON_ALLOW = /^\/(admin(\/|$)|assets\/|\.well-known\/|optout\/|icons?\/|favicon|manifest|robots\.txt|apple-touch)/;
const comingSoonHtml = (msg: string) => `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>VIBIN — binnenkort</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center;
    font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#f7f8fc;
    background:radial-gradient(1200px 600px at 50% -10%,#1b2a6b 0%,#0b0e1c 60%)}
  main{max-width:520px}
  h1{font-size:44px;letter-spacing:-.02em;margin:18px 0 8px}
  h1 b{color:#b6f23a}
  p{color:#b9bfdc;margin:0 0 10px}
  .pill{display:inline-block;margin-top:14px;padding:6px 14px;border-radius:999px;background:#ffffff14;color:#dfe3f7;font-size:14px}
  a{color:#7d96ff;font-size:13px;text-decoration:none}
</style></head><body><main>
<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><path d="M14 10 L36 52" stroke="#3155ff" stroke-width="12" stroke-linecap="round" fill="none"/><path d="M58 10 L36 52" stroke="#b6f23a" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="36" cy="54" r="7" fill="#fff"/></svg>
<h1>VI<b>BIN</b></h1>
<p>${msg}</p>
<span class="pill">Binnenkort beschikbaar</span>
<p style="margin-top:28px"><a href="/admin">Beheer</a></p>
</main></body></html>`;

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const isPageNav =
    (c.req.method === "GET" || c.req.method === "HEAD") &&
    !COMING_SOON_ALLOW.test(url.pathname) &&
    !/\.[a-z0-9]{2,5}$/i.test(url.pathname);
  if (isPageNav) {
    const m = await maintenanceState(c.env);
    if (m.on) {
      return c.html(comingSoonHtml(m.msg || "We werken aan iets moois. Tot snel!"), 503, {
        "cache-control": "no-store",
        "retry-after": "3600",
        "x-content-type-options": "nosniff",
      });
    }
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  /**
   * Cron (every 30 min, see wrangler.jsonc `triggers.crons`): pull any enabled
   * event source that is due and roll event statuses forward. A no-op while no
   * event source is enabled.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      runOutreachTick(env).catch((e) => {
        console.error("outreach tick failed", e);
      }),
    );
    ctx.waitUntil(
      runDueSources(createDb(env), env).catch((e) => {
        void trackNow(env, "server_error", {
          props: { route: "cron:events", message: String(e).slice(0, 200) },
        });
      }),
    );
  },
} satisfies ExportedHandler<Env>;
