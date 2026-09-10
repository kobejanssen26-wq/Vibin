import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env, Vars } from "./env";
import { AppError, toResponse } from "./lib/errors";
import { trackNow } from "./lib/analytics";
import { getSetting, SETTINGS } from "./lib/system-settings";
import { withSession, requireAuth } from "./middleware/auth";
import { withAdminSession, requireOwner } from "./middleware/admin";

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
import adminRoutes from "./routes/admin";
import adminCcRoutes from "./routes/admin-cc";
import adminVaultRoutes from "./routes/admin-vault";
import mediaRoutes from "./routes/media";

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
commandCenter.route("/vault", adminVaultRoutes); // encrypted credential vault
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
authed.route("/geo", geoRoutes);
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
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
