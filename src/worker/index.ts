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
  // Same-origin app: only allow the configured APP_URL origin for CORS
  // (mostly relevant to the split dev setup on :5173).
  const mw = cors({
    origin: [c.env.APP_URL, "http://localhost:5173"],
    credentials: true,
    allowHeaders: ["content-type", "x-mingo-csrf"],
  });
  return mw(c, next);
});
api.use("*", secureHeaders());
api.use("*", withSession);

api.get("/health", (c) => c.json({ ok: true, env: c.env.APP_ENV }));

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
