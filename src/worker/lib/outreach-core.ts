/**
 * Provider outreach — pure logic (no I/O), so every safety rule is unit-testable.
 *
 * Nothing in here sends mail or touches the network. The send path in
 * `outreach-send.ts` calls `evaluateSend()` immediately before every delivery;
 * the frontend is never the only gate.
 */

/* -------------------------------------------------------------------------- */
/*  Domains & addresses                                                       */
/* -------------------------------------------------------------------------- */

/** Sites that list or resell other people's activities — never "the provider". */
export const AGGREGATOR_DOMAINS = new Set([
  "facebook.com", "fb.com", "fb.me", "instagram.com", "linkedin.com", "twitter.com",
  "x.com", "tiktok.com", "youtube.com", "youtu.be", "pinterest.com", "wa.me",
  "google.com", "goo.gl", "g.page", "maps.app.goo.gl", "tripadvisor.com",
  "tripadvisor.be", "booking.com", "airbnb.com", "getyourguide.com", "viator.com",
  "klook.com", "eventbrite.com", "eventbrite.be", "ticketmaster.be", "facebook.be",
  "linktr.ee", "wixsite.com", "business.site", "wordpress.com", "blogspot.com",
  "visitflanders.com", "visitgent.be", "visitbruges.be", "visitantwerpen.be",
  "visitleuven.be", "visitmechelen.be", "uitinvlaanderen.be", "uitdatabank.be",
  "openstreetmap.org", "wikipedia.org", "wikimedia.org", "yelp.com", "foursquare.com",
]);

const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "com.br", "co.za", "co.jp",
]);

/** Host of a URL, lower-cased, without `www.` and port — or null when unusable. */
export function hostOf(rawUrl: string): string | null {
  let s = (rawUrl ?? "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // bare IPv4
  if (host.includes(":")) return null; // IPv6
  if (/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
  return host;
}

/** `shop.bowling.be` → `bowling.be`. Good enough for matching an address to a site. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function isAggregatorHost(host: string): boolean {
  const reg = registrableDomain(host);
  return AGGREGATOR_DOMAINS.has(host) || AGGREGATOR_DOMAINS.has(reg);
}

/** `https://…` form of a stored website value, or null if it is not a plain http(s) site. */
export function normalizeWebsite(raw: string): string | null {
  const host = hostOf(raw);
  if (!host) return null;
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  if (e.length > 254 || !EMAIL_RE.test(e)) return false;
  const tld = e.split(".").pop() ?? "";
  return /^[a-z]{2,24}$/.test(tld);
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

/** Local parts that belong to a role/mailbox of the organisation, not to a person. */
const GENERIC_LOCALS = new Set([
  "info", "contact", "contactus", "hello", "hallo", "hi", "welkom", "welcome",
  "mail", "post", "office", "kantoor", "bureau", "administratie", "admin",
  "secretariaat", "secretary", "receptie", "reception", "accueil", "balie",
  "reservatie", "reservaties", "reservation", "reservations", "reserveren",
  "reserveer", "booking", "bookings", "boeking", "boekingen", "boeken", "book",
  "sales", "verkoop", "commercial", "commercieel", "groepen", "groups", "group",
  "events", "event", "evenementen", "teambuilding", "feesten", "party", "info.be",
  "vragen", "question", "questions", "service", "klantenservice", "customerservice",
  "klantendienst", "support", "team", "enquiries", "enquiry", "aanvraag",
  "aanvragen", "offerte", "tickets", "ticket", "shop", "winkel", "horeca",
  "restaurant", "cafe", "bar", "keuken", "zaal", "zalen", "verhuur", "rental",
]);

/** Privacy / abuse / technical mailboxes — never useful for outreach. */
const SKIP_LOCALS = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
  "webmaster", "hostmaster", "abuse", "privacy", "gdpr", "dpo", "unsubscribe",
  "security", "legal", "press", "pers", "jobs", "vacatures", "hr", "billing",
  "facturatie", "invoice", "invoices", "boekhouding", "accounting",
]);

/** Consumer mailbox providers: an address there is a person or a sole trader. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.be", "outlook.com",
  "outlook.be", "live.com", "live.be", "yahoo.com", "yahoo.be", "icloud.com",
  "me.com", "msn.com", "telenet.be", "skynet.be", "proximus.be", "scarlet.be",
  "belgacom.net", "pandora.be", "gmx.com", "gmx.net", "proton.me", "protonmail.com",
  "hotmail.nl", "ziggo.nl", "kpnmail.nl", "wanadoo.be", "voo.be", "edpnet.be",
]);

export type EmailKind = "generic" | "personal" | "unknown";

export function classifyEmail(email: string): EmailKind {
  const e = normalizeEmail(email);
  const [local = "", domain = ""] = e.split("@");
  const base = local.split("+")[0] ?? local;
  if (FREEMAIL.has(domain)) return "personal";
  if (GENERIC_LOCALS.has(base)) return "generic";
  // firstname.lastname / jan.peeters / j.peeters → a person
  if (/^[a-z]{1,}[._-][a-z]{2,}$/.test(base) && !GENERIC_LOCALS.has(base.split(/[._-]/)[0]!)) {
    return "personal";
  }
  return "unknown";
}

export function isSkippableLocal(email: string): boolean {
  const local = (normalizeEmail(email).split("@")[0] ?? "").split("+")[0] ?? "";
  return SKIP_LOCALS.has(local);
}

/** True when the address' domain is the site's domain or one of its subdomains. */
export function domainMatchesSite(email: string, siteHost: string): boolean {
  const ed = emailDomain(email);
  const sd = registrableDomain(siteHost);
  return ed === sd || ed.endsWith(`.${sd}`) || registrableDomain(ed) === sd;
}

/** Preference order when several generic addresses exist on one site. */
const PRIMARY_ORDER = [
  "info", "contact", "hello", "hallo", "welkom", "reservatie", "reservaties",
  "reservation", "reservations", "booking", "boeking", "groepen", "groups",
  "events", "office", "kantoor", "post", "mail",
];

export function primaryRank(email: string): number {
  const local = normalizeEmail(email).split("@")[0] ?? "";
  const i = PRIMARY_ORDER.indexOf(local);
  return i === -1 ? PRIMARY_ORDER.length : i;
}

/* -------------------------------------------------------------------------- */
/*  Extracting addresses & links from a page                                  */
/* -------------------------------------------------------------------------- */

const JUNK_DOMAINS = [
  "example.com", "example.org", "domain.com", "email.com", "yourdomain.com",
  "sentry.io", "sentry-next.wixpress.com", "wixpress.com", "godaddy.com",
  "sentry.wixpress.com", "w3.org", "schema.org", "mysite.com", "test.com",
];

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");
}

export interface FoundAddress {
  email: string;
  via: "mailto" | "text";
}

/**
 * Addresses a visitor would see on the page: `mailto:` links and plain text.
 * Deliberately does NOT decode anti-scraper obfuscation ("info [at] x"), JS
 * assembly or Cloudflare e-mail protection — a site that hides its address has
 * chosen not to be scraped, and we respect that.
 */
export function extractEmails(html: string): FoundAddress[] {
  const out = new Map<string, FoundAddress>();
  const add = (raw: string, via: FoundAddress["via"]) => {
    const email = normalizeEmail(decodeEntities(raw).replace(/^mailto:/i, ""));
    if (!isValidEmail(email)) return;
    const dom = emailDomain(email);
    if (JUNK_DOMAINS.some((d) => dom === d || dom.endsWith(`.${d}`))) return;
    if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico)$/.test(dom)) return;
    if (/@\d+x$/.test(email) || /^\d/.test(dom)) return;
    if (isSkippableLocal(email)) return;
    const prev = out.get(email);
    if (!prev || (prev.via === "text" && via === "mailto")) out.set(email, { email, via });
  };

  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?#\s]+)/gi)) {
    for (const part of decodeURIComponent(safeDecode(m[1]!)).split(",")) add(part, "mailto");
  }
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)) {
    add(m[0], "text");
  }
  return [...out.values()];
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Same-site links that probably lead to a contact page, best first. */
export function findContactLinks(html: string, baseUrl: string, max = 2): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const baseHost = registrableDomain(base.hostname.replace(/^www\./, ""));
  const scored = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1]!.trim();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (registrableDomain(u.hostname.replace(/^www\./, "")) !== baseHost) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const label = `${u.pathname} ${m[2]!.replace(/<[^>]+>/g, " ")}`.toLowerCase();
    let score = 0;
    if (/contact|kontakt|contacteer|contactez|neem[- ]contact/.test(label)) score += 3;
    if (/over[- ]ons|about|a-propos|qui[- ]sommes|wie[- ]zijn/.test(label)) score += 1;
    if (/impressum|colofon|praktisch|info/.test(label)) score += 1;
    if (score === 0) continue;
    u.hash = "";
    const key = u.toString();
    if (key === base.toString()) continue;
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([u]) => u);
}

/* -------------------------------------------------------------------------- */
/*  robots.txt                                                                */
/* -------------------------------------------------------------------------- */

/** Minimal robots.txt reader: the group for `*` or our bot token, longest match wins. */
export function robotsAllows(robotsTxt: string, path: string, botToken = "vibincontactbot"): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      cur.rules.push({ allow: key === "allow", path: val });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && botToken.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (r.path === "") {
        if (!r.allow) continue; // "Disallow:" with no path allows everything
      }
      const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
      if (r.path && new RegExp(`^${pat}`).test(path)) {
        const len = r.path.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}

/* -------------------------------------------------------------------------- */
/*  Message template                                                          */
/* -------------------------------------------------------------------------- */

export const DEFAULT_SUBJECT = "Mag ik VIBIN kort aan jullie voorstellen?";

export const DEFAULT_BODY = `Beste {{provider}},

Wij zijn VIBIN, een nieuw platform dat binnenkort gelanceerd wordt en mensen helpt om samen met vrienden leuke activiteiten te ontdekken.

Met VIBIN kunnen gebruikers door verschillende activiteiten swipen, aangeven wat ze wel of niet leuk vinden en ontdekken welke activiteiten bij hun groep passen. Zodra er een match is, kunnen ze de activiteit verder bekijken en eventueel via de website van de aanbieder reserveren of boeken.

We willen graag zoveel mogelijk interessante activiteiten uit België samenbrengen op ons platform. Daarom leek het ons leuk om jullie activiteit(en) aan jullie voor te stellen als mogelijke aanvulling op VIBIN.

Zouden jullie interesse hebben om meer informatie te ontvangen over een mogelijke vermelding op VIBIN?

Als jullie interesse hebben, vertellen we graag wat meer over het platform en hoe een eventuele samenwerking eruit zou kunnen zien.

Alvast bedankt voor jullie tijd!

Met vriendelijke groeten,

Het VIBIN-team`;

export interface TemplateVars {
  provider: string;
  website: string;
  contact: string;
}

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  const out = tpl
    .replace(/\{\{\s*provider\s*\}\}/g, vars.provider.trim())
    .replace(/\{\{\s*website\s*\}\}/g, vars.website.trim())
    .replace(/\{\{\s*contact\s*\}\}/g, vars.contact.trim());
  // A missing value must not leave a gap or a stray placeholder in the mail.
  return out
    .replace(/Beste ,/g, "Beste,")
    .replace(/ · $/gm, "")
    .replace(/^ · /gm, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface FooterVars {
  identity: string;
  sourceUrl: string | null;
  optoutUrl: string;
}

/** Always appended; not part of the editable template so it cannot be removed. */
export function buildFooter(f: FooterVars): string {
  // Owner's choice: no opt-out sentence or link in the visible mail. The one-click
  // List-Unsubscribe header (invisible in the body) still carries the opt-out URL.
  return f.identity.trim() ? `
${f.identity.trim()}` : "";
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text → a clean, single-column HTML mail (links, paragraphs, small grey footer). */
export function buildHtml(f: { body: string; identity: string; optoutUrl: string; banner?: string }): string {
  const link = (s: string) =>
    escapeHtml(s).replace(
      /(https?:\/\/[^\s<]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[a-z0-9-]+\.)+(?:be|com|eu)\b)/gi,
      (m) => {
        const href = m.includes("@") ? `mailto:${m}` : /^https?:/i.test(m) ? m : `https://${m}`;
        return `<a href="${href}" style="color:#3155ff;text-decoration:none">${m.replace(/^https?:\/\//i, "")}</a>`;
      },
    );
  const paras = f.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.split("\n").map(link).join("<br>")}</p>`)
    .join("");
  const banner = f.banner
    ? `<p style="margin:0 0 18px;padding:8px 12px;background:#fff6d6;border-radius:6px;font-size:13px;color:#6b5600">${escapeHtml(f.banner)}</p>`
    : "";
  const identity = f.identity.trim() ? escapeHtml(f.identity.trim()) : "";
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:24px;background:#ffffff">
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1f36">
${banner}${paras}
${identity ? `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e6e8f0;font-size:12px;line-height:1.5;color:#8a90a8">${identity}</div>` : ""}
</div></body></html>`;
}

/* -------------------------------------------------------------------------- */
/*  Hashing & opt-out tokens                                                  */
/* -------------------------------------------------------------------------- */

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** What an approval is pinned to: change any of these and the approval is void. */
export function messageHash(m: { toEmail: string; subject: string; bodyText: string }): Promise<string> {
  return sha256Hex(`${normalizeEmail(m.toEmail)}\n${m.subject}\n${m.bodyText}`);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`vibin-outreach-optout:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data))).slice(0, 32);
}

export async function signOptOut(secret: string, messageId: string): Promise<string> {
  return `${messageId}.${await hmac(secret, messageId)}`;
}

export async function verifyOptOut(secret: string, token: string): Promise<string | null> {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = await hmac(secret, id);
  if (sig.length !== want.length) return null;
  let diff = 0;
  for (let k = 0; k < sig.length; k++) diff |= sig.charCodeAt(k) ^ want.charCodeAt(k);
  return diff === 0 ? id : null;
}

/* -------------------------------------------------------------------------- */
/*  The send gate                                                             */
/* -------------------------------------------------------------------------- */

export interface OutreachConfig {
  /** "test" never reaches a real recipient; "live" needs everything below. */
  mode: "test" | "live";
  testInbox: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  contactAddress: string;
  websiteUrl: string;
  senderIdentity: string;
  subject: string;
  body: string;
  legalReview: {
    status: "not_reviewed" | "approved";
    reviewedAt: number | null;
    reviewedBy: string | null;
    note: string;
  };
  dailyCap: number;
  perRun: number;
  autoDiscovery: boolean;
  discoveryPerRun: number;
}

export interface SendCheckInput {
  config: OutreachConfig;
  message: {
    status: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    approvedHash: string | null;
    approvedBy: string | null;
    approvedAt: number | null;
    testMode: number;
    contactId: string | null;
  };
  /** The message hash recomputed from the stored recipient/subject/body. */
  currentHash: string;
  contact: {
    id: string;
    orgId: string;
    email: string;
    kind: string;
    verification: string;
    mxOk: number | null;
  } | null;
  org: { id: string; excluded: number } | null;
  suppressed: boolean;
  alreadySentLive: boolean;
  sentLast24h: number;
  runtime: {
    isProduction: boolean;
    hasProviderKey: boolean;
    hasSigningKey: boolean;
  };
  /** "send" = about to deliver; "approve" = owner is approving (not yet sending). */
  stage: "approve" | "send";
}

export interface Reason {
  code: string;
  message: string;
}

/** Everything that must be true before approval / delivery. Empty array = go. */
export function evaluateSend(i: SendCheckInput): Reason[] {
  const r: Reason[] = [];
  const add = (code: string, message: string) => r.push({ code, message });
  const { config, message: m, contact, org } = i;
  const testRun = config.mode !== "live";

  if (!m.toEmail || !isValidEmail(m.toEmail)) add("bad_recipient", "Ontvanger ontbreekt of is geen geldig e-mailadres.");
  if (!contact) {
    add("contact_missing", "Het bijbehorende contactadres bestaat niet meer.");
  } else {
    if (normalizeEmail(contact.email) !== normalizeEmail(m.toEmail)) {
      add("contact_mismatch", "De ontvanger komt niet meer overeen met het contactadres.");
    }
    if (org && contact.orgId !== org.id) add("contact_mismatch", "Het adres hoort niet bij deze aanbieder.");
    if (contact.kind === "personal") {
      add("personal_address", "Dit lijkt een persoonlijk adres. Alleen algemene zakelijke adressen zijn toegestaan.");
    } else if (contact.kind !== "generic") {
      add("unclassified_address", "Het adres is niet als algemeen zakelijk adres bevestigd.");
    }
    if (contact.verification !== "checked") {
      add("unverified_contact", "Het adres is niet als betrouwbaar gecontroleerd gemarkeerd.");
    }
    if (contact.mxOk === 0) add("mx_failed", "Het domein van dit adres kan geen e-mail ontvangen.");
  }
  if (!org) add("org_missing", "De aanbieder bestaat niet meer.");
  else if (org.excluded) add("org_excluded", "Deze aanbieder is uitgesloten van outreach.");
  if (i.suppressed) add("suppressed", "Dit adres of domein staat op de uitsluitingslijst (bezwaar, afmelding of bounce).");

  if (i.stage === "send") {
    if (m.status !== "approved" && m.status !== "queued") {
      add("not_approved", "Dit bericht is niet goedgekeurd.");
    }
    if (!m.approvedBy || !m.approvedAt || !m.approvedHash) {
      add("not_approved", "Er is geen goedkeuring van een beheerder vastgelegd.");
    } else if (m.approvedHash !== i.currentHash) {
      add("approval_stale", "Het bericht is gewijzigd na de goedkeuring. Keur het opnieuw goed.");
    }
  }

  if (testRun && !m.testMode) {
    add("mode_changed", "Dit bericht is voor echte verzending goedgekeurd, maar de modus is nu 'test'. Bereid het opnieuw voor.");
  }
  if (!testRun && m.testMode) {
    add("mode_changed", "Dit is een testbericht en kan niet echt worden verzonden. Bereid het opnieuw voor.");
  }

  if (!testRun) {
    if (!i.runtime.isProduction) add("not_production", "Echte verzending is alleen mogelijk in de productieomgeving.");
    if (config.legalReview.status !== "approved") {
      add("legal_not_reviewed", "De juridische controle is niet bevestigd (LEGAL REVIEW REQUIRED).");
    }
    if (!config.fromEmail || !isValidEmail(config.fromEmail)) add("config_incomplete", "Afzenderadres is niet ingesteld.");
    if (!config.replyTo || !isValidEmail(config.replyTo)) add("config_incomplete", "Reply-to adres is niet ingesteld.");
    if (!config.contactAddress || !isValidEmail(config.contactAddress)) {
      add("config_incomplete", "Officieel contactadres van VIBIN is niet ingesteld.");
    }
    if (!config.senderIdentity.trim()) add("config_incomplete", "Identiteit van de afzender (bedrijfsgegevens) is niet ingesteld.");
    if (!i.runtime.hasProviderKey) add("no_provider_key", "Er is geen e-mailprovider-sleutel geconfigureerd.");
    if (!i.runtime.hasSigningKey) add("no_signing_key", "Er is geen server-sleutel voor afmeldlinks geconfigureerd.");
    if (i.alreadySentLive) add("already_sent", "Naar dit adres is al eerder een bericht verzonden.");
    if (i.stage === "send" && i.sentLast24h >= config.dailyCap) {
      add("daily_cap", `Het daglimiet van ${config.dailyCap} berichten is bereikt.`);
    }
  } else {
    if (config.testInbox && !isValidEmail(config.testInbox)) add("config_incomplete", "Het testadres is ongeldig.");
  }
  return r;
}

/** Normalised, validated config: unknown/invalid values fall back to safe defaults. */
export function defaultConfig(appUrl: string): OutreachConfig {
  return {
    mode: "test",
    testInbox: "",
    fromName: "VIBIN",
    fromEmail: "",
    replyTo: "",
    contactAddress: "",
    websiteUrl: appUrl,
    senderIdentity: "",
    subject: DEFAULT_SUBJECT,
    body: DEFAULT_BODY,
    legalReview: { status: "not_reviewed", reviewedAt: null, reviewedBy: null, note: "" },
    dailyCap: 50,
    perRun: 10,
    autoDiscovery: true,
    discoveryPerRun: 10,
  };
}
