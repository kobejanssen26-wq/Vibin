import { describe, expect, it } from "vitest";
import {
  buildFooter,
  buildHtml,
  classifyEmail,
  defaultConfig,
  domainMatchesSite,
  evaluateSend,
  extractEmails,
  findContactLinks,
  hostOf,
  isAggregatorHost,
  isValidEmail,
  messageHash,
  registrableDomain,
  renderTemplate,
  robotsAllows,
  signOptOut,
  verifyOptOut,
  DEFAULT_BODY,
  DEFAULT_BODY_MULTI,
  assessGroup,
  classifyRole,
  composeMail,
  formatActivityList,
  rolePriority,
  type SendCheckInput,
} from "./outreach-core";

describe("hostOf / registrableDomain", () => {
  it("normalises hosts and rejects unusable ones", () => {
    expect(hostOf("https://www.Bowling-Gent.be/contact?x=1")).toBe("bowling-gent.be");
    expect(hostOf("bowling-gent.be")).toBe("bowling-gent.be");
    expect(hostOf("http://localhost:3000")).toBeNull();
    expect(hostOf("http://10.0.0.1/x")).toBeNull();
    expect(hostOf("ftp://x.be")).toBeNull();
    expect(hostOf("https://x.be:8443")).toBeNull();
    expect(hostOf("")).toBeNull();
  });
  it("finds the registrable domain", () => {
    expect(registrableDomain("shop.bowling.be")).toBe("bowling.be");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("bowling.be")).toBe("bowling.be");
  });
  it("flags aggregators", () => {
    expect(isAggregatorHost("facebook.com")).toBe(true);
    expect(isAggregatorHost("m.facebook.com")).toBe(true);
    expect(isAggregatorHost("bowling.be")).toBe(false);
  });
});

describe("email validation and classification", () => {
  it("validates syntax", () => {
    expect(isValidEmail("info@bowling.be")).toBe(true);
    expect(isValidEmail("info@bowling")).toBe(false);
    expect(isValidEmail("in fo@bowling.be")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
  it("separates generic from personal addresses", () => {
    expect(classifyEmail("info@bowling.be")).toBe("generic");
    expect(classifyEmail("Reservaties@bowling.be")).toBe("generic");
    expect(classifyEmail("jan.peeters@bowling.be")).toBe("personal");
    expect(classifyEmail("bowling@gmail.com")).toBe("personal");
    expect(classifyEmail("jan@bowling.be")).toBe("unknown");
  });
  it("matches addresses to the site's domain", () => {
    expect(domainMatchesSite("info@bowling.be", "www.bowling.be")).toBe(true);
    expect(domainMatchesSite("info@mail.bowling.be", "bowling.be")).toBe(true);
    expect(domainMatchesSite("info@other.be", "bowling.be")).toBe(false);
  });
});

describe("extractEmails", () => {
  it("reads mailto links and visible text, skips junk and privacy mailboxes", () => {
    const html = `
      <a href="mailto:Info@Bowling.be?subject=Hi">mail</a>
      <p>Reserveer via reservaties@bowling.be of bel ons.</p>
      <p>privacy@bowling.be</p>
      <img src="logo@2x.png"> <span>user@example.com</span>
      <script>var a = "hidden@bowling.be"</script>
      <p>obfuscated: verborgen [at] bowling.be</p>`;
    const got = extractEmails(html).map((e) => e.email).sort();
    expect(got).toEqual(["info@bowling.be", "reservaties@bowling.be"]);
    expect(extractEmails(html).find((e) => e.email === "info@bowling.be")?.via).toBe("mailto");
  });
});

describe("findContactLinks", () => {
  it("returns same-site contact pages only", () => {
    const html = `
      <a href="/contact">Contact</a>
      <a href="https://other.be/contact">elsewhere</a>
      <a href="/over-ons">Over ons</a>
      <a href="/menu">Menu</a>
      <a href="mailto:x@y.be">mail</a>`;
    const links = findContactLinks(html, "https://www.bowling.be/");
    expect(links[0]).toBe("https://www.bowling.be/contact");
    expect(links).toContain("https://www.bowling.be/over-ons");
    expect(links.some((l) => l.includes("other.be"))).toBe(false);
  });
});

describe("robotsAllows", () => {
  it("honours disallow, allow overrides and our bot group", () => {
    const txt = `User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: VIBINContactBot\nDisallow: /contact`;
    expect(robotsAllows(txt, "/contact")).toBe(false);
    expect(robotsAllows(txt, "/")).toBe(true);
    const star = `User-agent: *\nDisallow: /private\nAllow: /private/open`;
    expect(robotsAllows(star, "/private/x")).toBe(false);
    expect(robotsAllows(star, "/private/open")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/contact")).toBe(false);
    expect(robotsAllows("", "/contact")).toBe(true);
  });
});

describe("template and footer", () => {
  it("fills the provider name and never leaves placeholders", () => {
    const body = renderTemplate(DEFAULT_BODY, {
      provider: "Bowling Gent",
      website: "https://vibin.be",
      contact: "",
    });
    expect(body.startsWith("Beste Bowling Gent,")).toBe(true);
    expect(body.trim().endsWith("Het VIBIN-team")).toBe(true); // no links under the signature for now
    expect(body).not.toMatch(/\{\{/);
    const noName = renderTemplate("Beste {{provider}},\n\nX", { provider: "", website: "", contact: "" });
    expect(noName).toBe("Beste,\n\nX");
  });
  it("footer is only the identity line: no opt-out sentence, no links, no source sentence", () => {
    const f = buildFooter({ identity: "VIBIN", sourceUrl: "https://bowling.be/contact", optoutUrl: "https://vibin.be/optout/abc" });
    expect(f.trim()).toBe("VIBIN");
    expect(buildFooter({ identity: "", sourceUrl: null, optoutUrl: "x" })).toBe("");
  });
  it("html mail: paragraphs, links, escaped content, no footer links", () => {
    const h = buildHtml({ body: "Hallo <b>X</b>,\n\nBezoek vibin.be of mail hello@vibin.be", identity: "VIBIN", optoutUrl: "https://vibin.be/optout/tok.en" });
    expect(h).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(h).toContain('href="https://vibin.be"');
    expect(h).toContain('href="mailto:hello@vibin.be"');
    expect(h).not.toContain('optout');
    expect(h).not.toContain('stop');
    expect(h).not.toContain("<b>X</b>");
  });
});

describe("opt-out tokens and approval hash", () => {
  it("round-trips and rejects tampering", async () => {
    const t = await signOptOut("secret", "msg_123");
    expect(await verifyOptOut("secret", t)).toBe("msg_123");
    expect(await verifyOptOut("other", t)).toBeNull();
    expect(await verifyOptOut("secret", t.replace(/.$/, "0"))).toBeNull();
    expect(await verifyOptOut("secret", "garbage")).toBeNull();
  });
  it("hash changes with recipient, subject and body", async () => {
    const a = await messageHash({ toEmail: "info@x.be", subject: "s", bodyText: "b" });
    expect(await messageHash({ toEmail: "INFO@x.be", subject: "s", bodyText: "b" })).toBe(a);
    expect(await messageHash({ toEmail: "info@x.be", subject: "s2", bodyText: "b" })).not.toBe(a);
    expect(await messageHash({ toEmail: "info@x.be", subject: "s", bodyText: "b2" })).not.toBe(a);
    expect(await messageHash({ toEmail: "other@x.be", subject: "s", bodyText: "b" })).not.toBe(a);
  });
});

/* ---------------------------- the send gate ---------------------------- */

function base(over: Partial<SendCheckInput> = {}): SendCheckInput {
  const config = defaultConfig("https://vibin.be");
  return {
    config,
    message: {
      status: "approved",
      toEmail: "info@bowling.be",
      subject: "s",
      bodyText: "b",
      approvedHash: "H",
      approvedBy: "owner1",
      approvedAt: 1,
      testMode: 1,
      contactId: "c1",
    },
    currentHash: "H",
    contact: { id: "c1", orgId: "o1", email: "info@bowling.be", kind: "generic", verification: "checked", mxOk: null },
    org: { id: "o1", excluded: 0 },
    suppressed: false,
    alreadySentLive: false,
    sentLast24h: 0,
    runtime: { isProduction: false, hasProviderKey: false, hasSigningKey: true },
    stage: "send",
    ...over,
  };
}

function live(over: Partial<SendCheckInput> = {}): SendCheckInput {
  const b = base(over);
  b.config = {
    ...b.config,
    mode: "live",
    fromEmail: "outreach@vibin.be",
    replyTo: "contact@vibin.be",
    contactAddress: "contact@vibin.be",
    senderIdentity: "VIBIN, Straat 1, 9000 Gent",
    legalReview: { status: "approved", reviewedAt: 1, reviewedBy: "owner1", note: "ok" },
    ...(over.config ?? {}),
  };
  b.message = { ...b.message, testMode: 0, ...(over.message ?? {}) };
  b.runtime = { isProduction: true, hasProviderKey: true, hasSigningKey: true, ...(over.runtime ?? {}) };
  return b;
}

const codes = (i: SendCheckInput) => evaluateSend(i).map((r) => r.code);

describe("evaluateSend — nothing leaves without every check", () => {
  it("passes for a fully valid, approved test message", () => {
    expect(codes(base())).toEqual([]);
  });
  it("passes for a fully valid live message", () => {
    expect(codes(live())).toEqual([]);
  });
  it("blocks a missing recipient and a malformed one", () => {
    expect(codes(base({ message: { ...base().message, toEmail: "" } }))).toContain("bad_recipient");
    expect(codes(base({ message: { ...base().message, toEmail: "nope" } }))).toContain("bad_recipient");
  });
  it("blocks a contact that belongs to another organisation / mismatched recipient", () => {
    const i = base();
    expect(codes({ ...i, contact: { ...i.contact!, orgId: "other" } })).toContain("contact_mismatch");
    expect(codes({ ...i, contact: { ...i.contact!, email: "else@bowling.be" } })).toContain("contact_mismatch");
    expect(codes({ ...i, contact: null })).toContain("contact_missing");
  });
  it("blocks personal, unclassified and unverified addresses", () => {
    const i = base();
    expect(codes({ ...i, contact: { ...i.contact!, kind: "personal" } })).toContain("personal_address");
    expect(codes({ ...i, contact: { ...i.contact!, kind: "unknown" } })).toContain("unclassified_address");
    expect(codes({ ...i, contact: { ...i.contact!, verification: "uncertain" } })).toContain("unverified_contact");
    expect(codes({ ...i, contact: { ...i.contact!, verification: "unverified" } })).toContain("unverified_contact");
    expect(codes({ ...i, contact: { ...i.contact!, mxOk: 0 } })).toContain("mx_failed");
  });
  it("blocks excluded organisations and the suppression list", () => {
    expect(codes(base({ org: { id: "o1", excluded: 1 } }))).toContain("org_excluded");
    expect(codes(base({ suppressed: true }))).toContain("suppressed");
  });
  it("blocks anything not approved, or changed after approval", () => {
    const m = base().message;
    expect(codes(base({ message: { ...m, status: "draft" } }))).toContain("not_approved");
    expect(codes(base({ message: { ...m, approvedBy: null } }))).toContain("not_approved");
    expect(codes(base({ message: { ...m, approvedHash: null } }))).toContain("not_approved");
    expect(codes(base({ currentHash: "CHANGED" }))).toContain("approval_stale");
  });
  it("approval stage does not require an existing approval", () => {
    const m = base().message;
    expect(codes(base({ stage: "approve", message: { ...m, status: "draft", approvedBy: null, approvedHash: null } }))).toEqual([]);
  });
  it("never lets a test message go out live, nor a live message go out as a test", () => {
    expect(codes(live({ message: { ...live().message, testMode: 1 } }))).toContain("mode_changed");
    expect(codes(base({ message: { ...base().message, testMode: 0 } }))).toContain("mode_changed");
  });
  it("live sending needs production, legal review, full config and keys", () => {
    expect(codes(live({ runtime: { isProduction: false, hasProviderKey: true, hasSigningKey: true } }))).toContain("not_production");
    const l = live();
    expect(codes({ ...l, config: { ...l.config, legalReview: { ...l.config.legalReview, status: "not_reviewed" } } })).toContain("legal_not_reviewed");
    expect(codes({ ...l, config: { ...l.config, fromEmail: "" } })).toContain("config_incomplete");
    expect(codes({ ...l, config: { ...l.config, replyTo: "" } })).toContain("config_incomplete");
    expect(codes({ ...l, config: { ...l.config, contactAddress: "" } })).toContain("config_incomplete");
    expect(codes({ ...l, config: { ...l.config, senderIdentity: " " } })).toContain("config_incomplete");
    expect(codes({ ...l, runtime: { ...l.runtime, hasProviderKey: false } })).toContain("no_provider_key");
    expect(codes({ ...l, runtime: { ...l.runtime, hasSigningKey: false } })).toContain("no_signing_key");
  });
  it("live sending blocks duplicates and honours the daily cap", () => {
    expect(codes(live({ alreadySentLive: true }))).toContain("already_sent");
    expect(codes(live({ sentLast24h: 50 }))).toContain("daily_cap");
    expect(codes(live({ sentLast24h: 49 }))).not.toContain("daily_cap");
  });
});

describe("assessGroup", () => {
  const a = (id: string, title: string, provider: string | null, city = "Gent") => ({ id, title, provider, city });
  it("one activity is always a safe group", () => {
    const r = assessGroup({ domain: "bowling.be", activities: [a("1", "Bowling", "Bowling Gent")] });
    expect(r.confidence).toBe("high");
    expect(r.perActivity[0]).toMatchObject({ included: true });
  });
  it("same provider name = high, legal suffix ignored", () => {
    const r = assessGroup({ domain: "x.be", activities: [a("1", "Karting", "Fun BV"), a("2", "Lasergame", "Fun B.V.")] });
    expect(r.confidence).toBe("high");
    expect(r.source).toBe("same_name");
  });
  it("names that carry the domain brand = high", () => {
    const r = assessGroup({
      domain: "www.zandpark.be",
      activities: [a("1", "Klimmen", "Zandpark Klimmen"), a("2", "Minigolf", "Zandpark Minigolf")],
    });
    expect(r.confidence).toBe("high");
    expect(r.source).toBe("domain_brand");
  });
  it("a dominant name with outliers = medium; outliers still included", () => {
    const acts = [
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => a(`d${i}`, `Spel ${i}`, "Pretpark Oost")),
      a("o1", "Iets anders", "Andere Zaak"),
    ];
    const r = assessGroup({ domain: "oost-pret.be", activities: acts });
    expect(r.confidence).toBe("medium");
    expect(r.perActivity.every((p) => p.included)).toBe(true);
  });
  it("many different names under one domain = low; unrelated ones are not included", () => {
    const acts = [1, 2, 3, 4, 5, 6, 7].map((i) => a(`n${i}`, `Activiteit ${i}`, `Aanbieder ${i}`, `Stad ${i}`));
    const r = assessGroup({ domain: "platform.be", activities: acts });
    expect(r.confidence).toBe("low");
    expect(r.source).toBe("many_names");
    expect(r.perActivity.some((p) => !p.included)).toBe(true);
    expect(r.reasons.some((x) => x.code === "different_cities")).toBe(true);
  });
  it("a public body is never trusted automatically", () => {
    const r = assessGroup({
      domain: "gemeente-x.be",
      reviewFlag: "public_body",
      activities: [a("1", "A", "Cultuurdienst"), a("2", "B", "Cultuurdienst")],
    });
    expect(r.confidence).toBe("low");
  });
});

describe("classifyRole / rolePriority", () => {
  it("reads the role from the mailbox name", () => {
    expect(classifyRole("info@x.be")).toBe("general");
    expect(classifyRole("Reservaties@x.be")).toBe("reservations");
    expect(classifyRole("groepen@x.be")).toBe("groups");
    expect(classifyRole("sales@x.be")).toBe("sales");
    expect(classifyRole("jan@x.be")).toBe("other");
  });
  it("prefers a general mailbox over a reservations desk", () => {
    expect(rolePriority("general")).toBeLessThan(rolePriority("reservations"));
    expect(rolePriority("reservations")).toBeLessThan(rolePriority("other"));
  });
});

describe("composeMail", () => {
  const cfg = { subject: "Onderwerp", body: DEFAULT_BODY, bodyMulti: DEFAULT_BODY_MULTI };
  const v = { provider: "Fun", website: "vibin.be", contact: "a@b.be" };
  it("names one activity in the single template", () => {
    const m = composeMail(cfg, { ...v, titles: ["Karting"] });
    expect(m.body).toContain('"Karting"');
    expect(m.body).not.toContain("{{");
  });
  it("lists several activities once, in a single mail", () => {
    const m = composeMail(cfg, { ...v, titles: ["Karting", "Lasergame"] });
    expect(m.body).toContain("- Karting\n- Lasergame");
    expect(m.body).toContain("jullie activiteiten");
  });
  it("summarises a long list", () => {
    const t = Array.from({ length: 9 }, (_, i) => `Act ${i + 1}`);
    expect(formatActivityList(t).split("\n")).toHaveLength(7);
    expect(formatActivityList(t)).toContain("en nog 3 andere activiteiten");
  });
  it("falls back to neutral wording without activities", () => {
    const m = composeMail(cfg, { ...v, titles: [] });
    expect(m.body).toContain("jullie activiteit(en)");
    expect(m.body).not.toContain("{{");
  });
});

describe("send gate: grouping", () => {
  const codes = (i: SendCheckInput) => evaluateSend(i).map((r) => r.code);
  it("blocks an unconfirmed low-confidence group, allows it once confirmed", () => {
    expect(codes(base({ org: { id: "o1", excluded: 0, groupConfidence: "low", groupConfirmed: 0 } }))).toContain("group_unconfirmed");
    expect(codes(base({ org: { id: "o1", excluded: 0, groupConfidence: "low", groupConfirmed: 1 } }))).not.toContain("group_unconfirmed");
  });
  it("medium and high groups are not blocked", () => {
    for (const g of ["medium", "high"]) {
      expect(codes(base({ org: { id: "o1", excluded: 0, groupConfidence: g, groupConfirmed: 0 } }))).not.toContain("group_unconfirmed");
    }
  });
  it("blocks activities that another message already named", () => {
    expect(codes(base({ alreadyMentioned: ["Karting"] }))).toContain("activities_already_mentioned");
    expect(codes(base({ alreadyMentioned: [] }))).not.toContain("activities_already_mentioned");
  });
});

describe("send gate: address evidence", () => {
  const codes = (i: SendCheckInput) => evaluateSend(i).map((r) => r.code);
  it("blocks an address the research marked invalid, conflicting or not found", () => {
    for (const evidenceStatus of ["invalid", "conflict", "not_found"]) {
      const b = base();
      b.contact = { ...b.contact!, evidenceStatus };
      expect(codes(b)).toContain("contact_evidence");
    }
  });
  it("does not block verified, likely or merely unverified addresses", () => {
    for (const evidenceStatus of ["verified", "likely", "unverified"]) {
      const b = base();
      b.contact = { ...b.contact!, evidenceStatus };
      expect(codes(b)).not.toContain("contact_evidence");
    }
  });
});
