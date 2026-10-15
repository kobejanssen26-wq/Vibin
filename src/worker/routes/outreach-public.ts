/**
 * Public opt-out for outreach mail: GET/POST /optout/:token.
 *
 * The token is an HMAC over the message id, so it cannot be guessed or forged
 * and needs no stored secret per message. Opting out is immediate and
 * idempotent: the address goes on the do-not-contact list, the organisation is
 * excluded and every unsent draft / queued mail for it is cancelled. A mail
 * client's one-click `List-Unsubscribe-Post` hits the POST variant.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { newId } from "../lib/id";
import { clientIp, rateLimit } from "../lib/ratelimit";
import { verifyOptOut } from "../lib/outreach-core";
import { logAudit, sendOptOutReceipt } from "../lib/outreach-send";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const page = (title: string, body: string) => `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<style>
  body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f8fc;color:#0b0e1c;display:grid;place-items:center;min-height:100vh;padding:24px}
  main{max-width:460px;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(11,14,28,.08)}
  h1{font-size:22px;margin:0 0 12px} p{margin:0 0 10px;color:#3b4160} a{color:#3155ff}
</style></head><body><main>${body}</main></body></html>`;

async function handle(c: import("hono").Context<Ctx>): Promise<Response> {
  const html = (title: string, body: string, status = 200) =>
    c.html(page(title, body), status as 200, {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
  await rateLimit(c.env, "optout", clientIp(c.req.raw), 40, 3600);

  const token = c.req.param("token") ?? "";
  if (!c.env.ENCRYPTION_KEY || token.length > 120) {
    return html("Link ongeldig", "<h1>Deze link is niet geldig</h1><p>Stuur ons een mailtje met “stop” als je geen berichten meer wilt ontvangen.</p>", 400);
  }
  const messageId = await verifyOptOut(c.env.ENCRYPTION_KEY, token);
  if (!messageId) {
    return html("Link ongeldig", "<h1>Deze link is niet geldig</h1><p>Stuur ons een mailtje met “stop” als je geen berichten meer wilt ontvangen.</p>", 400);
  }
  const msg = await c.env.DB.prepare(
    `SELECT id, org_id AS orgId, lower(to_email) AS email, test_mode AS testMode, status
       FROM outreach_messages WHERE id = ?1`,
  )
    .bind(messageId)
    .first<{ id: string; orgId: string; email: string; testMode: number; status: string }>();
  if (!msg) {
    return html("Link ongeldig", "<h1>Deze link is niet geldig</h1>", 404);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO outreach_suppressions (id, kind, value, reason, note, created_by, created_at)
       VALUES (?1,'email',?2,'opt_out','afmeldlink in e-mail',NULL,?3)`,
    ).bind(newId(), msg.email, now),
    c.env.DB.prepare(
      `UPDATE outreach_orgs SET excluded = 1, excluded_reason = 'afgemeld via link', updated_at = ?2 WHERE id = ?1`,
    ).bind(msg.orgId, now),
    c.env.DB.prepare(
      `UPDATE outreach_messages
          SET status = 'cancelled', error = 'Geannuleerd: afmelding', updated_at = ?2
        WHERE org_id = ?1 AND status IN ('draft','approved','queued')`,
    ).bind(msg.orgId, now),
    c.env.DB.prepare(
      `INSERT INTO outreach_events (id, org_id, message_id, kind, body, created_by, created_at)
       VALUES (?1,?2,?3,'opt_out','Afgemeld via de link in de e-mail',NULL,?4)`,
    ).bind(newId(), msg.orgId, msg.id, now),
  ]);
  await logAudit(c.env, { userId: null, kind: "system" }, "outreach.opt_out", msg.id, { orgId: msg.orgId });

  // Legally required e-mailed receipt — only for a real message that was actually sent.
  if (!msg.testMode && msg.status === "sent") {
    let note = "Ontvangstbevestiging van de afmelding verzonden.";
    try {
      const r = await sendOptOutReceipt(c.env, msg.id, msg.email);
      if (!r.ok) note = `Ontvangstbevestiging NIET verzonden (${r.error}): stuur die handmatig.`;
    } catch (e) {
      note = `Ontvangstbevestiging NIET verzonden (${e instanceof Error ? e.message.slice(0, 80) : "fout"}): stuur die handmatig.`;
    }
    await c.env.DB.prepare(
      `INSERT INTO outreach_events (id, org_id, message_id, kind, body, created_by, created_at)
       VALUES (?1,?2,?3,'note',?4,NULL,?5)`,
    )
      .bind(newId(), msg.orgId, msg.id, note, now)
      .run();
  }

  return html(
    "Afgemeld",
    "<h1>Je bent afgemeld</h1><p>We sturen geen berichten meer naar dit adres. Bedankt voor het laten weten.</p><p>Per ongeluk afgemeld? Antwoord dan gerust op onze mail, dan helpen we je verder.</p>",
  );
}

app.get("/:token", handle);
app.post("/:token", handle);

export default app;
