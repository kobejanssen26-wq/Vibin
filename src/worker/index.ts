import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env, Vars } from "./env";
import { toResponse } from "./lib/errors";
import { withSession, requireAuth, requireAdmin } from "./middleware/auth";

import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import groupRoutes from "./routes/groups";
import inviteRoutes from "./routes/invites";
import activityRoutes from "./routes/activities";
import voteRoutes from "./routes/votes";
import dateRoutes from "./routes/dates";
import planRoutes from "./routes/plans";
import messageRoutes from "./routes/messages";
import reportRoutes from "./routes/reports";
import adminRoutes from "./routes/admin";
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
    allowHeaders: ["content-type", "x-vibin-csrf"],
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

api.route("/auth", authRoutes);
api.route("/media", mediaRoutes);

// Everything below requires a session.
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
api.route("/", authed);

const admin = new Hono<Ctx>();
admin.use("*", requireAuth, requireAdmin());
admin.route("/", adminRoutes);
api.route("/admin", admin);

api.onError((err, c) => toResponse(err, c));
api.notFound((c) => c.json({ error: "not_found", message: "Unknown endpoint." }, 404));

/* ------------------------------------------------------------------ */

const app = new Hono<Ctx>();
app.route("/api", api);

// Static SPA — assets binding handles hashing, caching and the SPA fallback
// (not_found_handling: single-page-application in wrangler.jsonc).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
