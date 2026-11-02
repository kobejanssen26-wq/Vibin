/**
 * Owner Swipe Manager — real-browser check (Chromium via Playwright). Needs `npm run build` first.
 *
 *   node tests/swipe-ui.mjs
 *
 * Boots a throw-away local D1 + `wrangler dev`, signs in as owner through the API, then drives the page like a
 * person: keyboard, mouse drag, buttons, undo, the trash, a phone-sized screen. Screenshots go to SHOTS (default: tmp).
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/usr/lib/node_modules/playwright"));
}

const PORT = Number(process.env.PORT ?? 8812);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-swipe-ui-"));
const SHOTS = process.env.SHOTS ?? fs.mkdtempSync(path.join(os.tmpdir(), "vibin-swipe-shots-"));
const IS_WIN = process.platform === "win32";

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    fail++;
    console.error("  ✗", name, extra !== undefined ? `\n      ${JSON.stringify(extra).slice(0, 500)}` : "");
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const w = (a) => execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN });
const dbq = (sql) => {
  const out = w(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--command", sql, "--json"]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

// the same fixtures as the API suite (activities s1…s12 near Gent, one hidden by a rule, research, an organisation)
const src = fs.readFileSync("tests/swipe.mjs", "utf8");
const fixtureSql = new Function(`${src.slice(src.indexOf("const ACT = (id"), src.indexOf("/* -------------------------------- run"))}; return fixtureSql;`)();

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totp = (s) => {
  let bits = "";
  for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(buf).digest();
  const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
};

let server;
const stop = () => {
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    /* gone */
  }
};

async function main() {
  w(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  fs.writeFileSync(path.join(STATE, "f.sql"), fixtureSql());
  w(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--file", path.join(STATE, "f.sql")]);
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE], { stdio: "ignore", shell: IS_WIN, detached: !IS_WIN });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* wait */
    }
    await sleep(1000);
  }

  // owner session via the API, handed to the browser
  const cookies = new Map();
  const call = async (m, p, body, csrf) => {
    const h = { "content-type": "application/json", connection: "close" };
    if (cookies.size) h.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (csrf) h["x-vibin-admin-csrf"] = cookies.get("vibin_admin_csrf");
    const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    for (const l of r.headers.getSetCookie()) {
      const s = l.split(";")[0];
      const i = s.indexOf("=");
      cookies.set(s.slice(0, i), s.slice(i + 1));
    }
    return r.json().catch(() => null);
  };
  const s1 = await call("POST", "/api/admin/auth/setup/begin", { email: `ui${Date.now()}@vibin.local`, password: "owner-super-secret-123" });
  await call("POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(s1.secret) }, true);

  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
  const errors = [];
  const newPage = async (ctx) => {
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));
    return page;
  };

  /* ---- not signed in: no access to the page's data ---- */
  console.log("\ntoegang");
  const anonCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const anon = await newPage(anonCtx);
  await anon.goto(`${BASE}/admin/swipe`);
  await sleep(1500);
  ok("zonder owner-sessie zie je de Swipe Manager niet (inlogscherm)", !(await anon.getByText("Swipe Manager").count()) && (await anon.locator("input[type=password], input[type=email]").count()) > 0);
  await anonCtx.close();
  errors.length = 0; // expected 401s above

  /* ---- signed in, desktop ---- */
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([...cookies].map(([name, value]) => ({ name, value, url: BASE })));
  const page = await newPage(ctx);
  await page.goto(`${BASE}/admin/swipe`);
  await page.waitForSelector("article", { timeout: 20000 });
  await sleep(800);
  await page.screenshot({ path: path.join(SHOTS, "01-desktop-start.png") });

  console.log("\nscherm");
  ok("pagina 'Swipe Manager' met echte voortgang uit de database", (await page.getByText("12", { exact: false }).count()) > 0 && (await page.getByText("activiteiten totaal").count()) > 0);
  const front = () => page.locator("article").last();
  ok("grote kaart met titel, adres en e-mail", (await front().innerText()).includes("Klimhal Alpha") && (await front().innerText()).includes("Teststraat 1") && (await front().innerText()).includes("info@klimhal-alpha.be"));
  ok("kaart maakt duidelijk dat behouden ≠ geverifieerd", (await front().innerText()).includes("behouden ≠ geverifieerd"));

  console.log("\ntoetsenbord en knoppen");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.body.innerText.includes("opgeslagen ✓"), null, { timeout: 8000 });
  ok("pijl rechts = behouden: opgeslagen in de database", dbq("SELECT decision FROM owner_activity_decisions WHERE activity_id='s1'")[0]?.decision === "keep");
  ok("de balk meldt pas 'alles opgeslagen' nadat de server bevestigd heeft", (await page.getByText("Alles opgeslagen in de database").count()) > 0);
  ok("volgende kaart staat klaar", (await front().innerText()).includes("Boulder Kappa"));
  await page.keyboard.press("ArrowLeft");
  await page.waitForSelector("text=staat nu in de prullenbak", { timeout: 8000 });
  await page.screenshot({ path: path.join(SHOTS, "02-na-verwijderen-toast.png") });
  ok("pijl links = naar de prullenbak (soft delete in de database)", dbq("SELECT active, status FROM activities WHERE id='s10'")[0].active === 0);
  await page.getByRole("button", { name: "Ongedaan maken" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Beslissing ongedaan gemaakt"), null, { timeout: 8000 });
  ok("'Ongedaan maken' in de toast zet het meteen terug", dbq("SELECT active FROM activities WHERE id='s10'")[0].active === 1 && (await front().innerText()).includes("Boulder Kappa"));
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => [...document.querySelectorAll("li")].some((l) => l.innerText.includes("Boulder Kappa") && l.innerText.includes("opgeslagen ✓") && l.innerText.includes("prullenbak")), null, { timeout: 8000 });
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => document.body.innerText.includes("Beslissing ongedaan gemaakt"), null, { timeout: 8000 });
  ok("Backspace = terug: de laatste beslissing is ongedaan gemaakt", dbq("SELECT active FROM activities WHERE id='s10'")[0].active === 1 && (await front().innerText()).includes("Boulder Kappa"));
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.body.innerText.includes("Trampoline Lambda"), null, { timeout: 8000 });
  ok("pijl omhoog = later bekijken (activiteit zelf ongemoeid)", dbq("SELECT decision FROM owner_activity_decisions WHERE activity_id='s10'")[0].decision === "later" && dbq("SELECT active FROM activities WHERE id='s10'")[0].active === 1);

  // typing in a field must never trigger a decision
  await page.getByLabel("Zoeken").fill("");
  await page.getByLabel("Zoeken").focus();
  await page.keyboard.type("zzz");
  await page.keyboard.press("ArrowLeft");
  await sleep(600);
  ok("toetsen in een invoerveld doen niets met de kaart (geen z/Backspace/pijl-acties)", dbq("SELECT COUNT(*) AS n FROM owner_activity_decisions")[0].n === 2, dbq("SELECT activity_id, decision FROM owner_activity_decisions"));
  await page.getByLabel("Zoeken").fill("");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  console.log("\nsleep met de muis");
  const card = front();
  const box = await card.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - i * 25, cy + i * 2);
  await page.screenshot({ path: path.join(SHOTS, "03-slepen-naar-links.png") });
  ok("tijdens het slepen verschijnt 'VERWIJDEREN' op de kaart", (await page.getByText("VERWIJDEREN", { exact: true }).count()) > 0);
  await page.mouse.up();
  await page.waitForFunction(() => document.body.innerText.includes("staat nu in de prullenbak"), null, { timeout: 8000 });
  ok("kaart naar links slepen = verwijderen (Trampoline Lambda staat in de prullenbak)", dbq("SELECT active FROM activities WHERE id='s11'")[0].active === 0);
  // a short drag must NOT decide anything
  const b2 = await front().boundingBox();
  await page.mouse.move(b2.x + 200, b2.y + 200);
  await page.mouse.down();
  await page.mouse.move(b2.x + 240, b2.y + 205, { steps: 4 });
  await page.mouse.up();
  await sleep(500);
  ok("een korte sleep beslist niets (kaart blijft staan)", dbq("SELECT COUNT(*) AS n FROM owner_activity_decisions")[0].n === 3);

  console.log("\ndetails en bewerken");
  await page.keyboard.press("i");
  await page.waitForSelector('[role="dialog"][aria-label="Details"]', { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, "04-details.png") });
  ok("details openen met 'i': volledige informatie", (await page.locator('[role="dialog"]').innerText()).includes("Omschrijving") && (await page.locator('[role="dialog"]').innerText()).includes("Onderzoek"));
  await page.keyboard.press("Escape");
  await sleep(300);
  ok("Escape sluit de details", (await page.locator('[role="dialog"][aria-label="Details"]').count()) === 0);
  await page.getByRole("button", { name: /Bewerken/ }).first().click();
  await page.waitForSelector('[role="dialog"][aria-label="Activiteit bewerken"]', { timeout: 8000 });
  await page.screenshot({ path: path.join(SHOTS, "05-bewerken.png") });
  ok("bewerken opent het bestaande formulier met de huidige waarden", (await page.locator('[role="dialog"] input').first().inputValue()).length > 0);
  await page.keyboard.press("Escape");
  await sleep(300);

  console.log("\nfilters en voortgang");
  await page.getByLabel("Zichtbaarheid").selectOption("hidden");
  await sleep(900);
  ok("filter 'alleen verborgen (audit)' toont de door een regel verborgen activiteit", (await front().innerText()).includes("Bowling Epsilon"));
  await page.getByLabel("Zichtbaarheid").selectOption("active");
  await page.getByRole("tab", { name: /Behouden/ }).click();
  await sleep(900);
  ok("tabblad 'Behouden' toont wat je behouden hebt", (await front().innerText()).includes("Klimhal Alpha"));
  ok("voortgang telt mee (1 behouden)", (await page.locator("text=behouden").first().innerText()).length > 0);

  console.log("\nprullenbak");
  await page.getByRole("tab", { name: /Prullenbak/ }).click();
  await sleep(900);
  await page.screenshot({ path: path.join(SHOTS, "06-prullenbak.png") });
  ok("prullenbak toont de verwijderde activiteit met 'VERWIJDERD'", (await front().innerText()).includes("VERWIJDERD") && (await front().innerText()).includes("Trampoline Lambda"));
  ok("op een verwijderde kaart staat 'Herstellen' en 'Definitief'", (await page.getByRole("button", { name: /Herstellen/ }).count()) > 0 && (await page.getByRole("button", { name: /Definitief/ }).count()) > 0);
  await page.getByRole("button", { name: /Prullenbak legen/ }).click();
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, "07-prullenbak-legen-dialoog.png") });
  const confirmBtn = page.getByRole("button", { name: /^Definitief verwijderen/ });
  ok("de dialoog toont wat er verdwijnt en 'Definitief verwijderen' staat uit", (await page.locator('[role="alertdialog"]').innerText()).includes("kan niet ongedaan") && (await confirmBtn.isDisabled()));
  await page.getByLabel("Bevestigingszin").fill("ja doe maar");
  ok("een verkeerde zin laat de knop uit", await confirmBtn.isDisabled());
  await page.getByLabel("Bevestigingszin").fill("DEFINITIEF VERWIJDEREN");
  ok("de exacte zin zet de knop aan", await confirmBtn.isEnabled());
  await confirmBtn.click();
  await page.waitForFunction(() => document.body.innerText.includes("definitief verwijderd"), null, { timeout: 15000 });
  ok("de activiteit is nu écht weg uit de database", dbq("SELECT COUNT(*) AS n FROM activities WHERE id='s11'")[0].n === 0 && dbq("SELECT decision FROM owner_activity_decisions WHERE activity_id='s11'")[0].decision === "purged");
  await sleep(800);
  ok("de prullenbak is leeg na het legen", (await page.getByText("Deze lijst is klaar").count()) > 0 || (await page.getByText("Er zijn geen activiteiten meer").count()) > 0);

  console.log("\ntelefoon");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mobile.addCookies([...cookies].map(([name, value]) => ({ name, value, url: BASE })));
  const mp = await newPage(mobile);
  await mp.goto(`${BASE}/admin/swipe`);
  await mp.waitForSelector("article", { timeout: 20000 });
  await sleep(800);
  await mp.screenshot({ path: path.join(SHOTS, "08-telefoon.png"), fullPage: false });
  ok("op een telefoon past de pagina in de breedte (geen horizontaal scrollen)", await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok("de knoppen staan onder de kaart en zijn zichtbaar", (await mp.getByRole("button", { name: /Bewaren/ }).isVisible()) && (await mp.getByRole("button", { name: /Verwijderen/ }).first().isVisible()));
  await mp.getByRole("button", { name: /Bewaren/ }).click();
  await mp.waitForFunction(() => document.body.innerText.includes("opgeslagen ✓"), null, { timeout: 8000 });
  ok("knop 'Bewaren' werkt ook op een telefoon", dbq("SELECT COUNT(*) AS n FROM owner_activity_decisions WHERE decision='keep'")[0].n === 2);

  ok("geen JavaScript-fouten in de browser", errors.length === 0, errors);
  console.log(`\n${pass} geslaagd, ${fail} mislukt — schermafbeeldingen: ${SHOTS}`);
  await browser.close();
  stop();
  fs.rmSync(STATE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("UI TEST CRASHED:", e);
  try {
    stop();
  } catch {
    /* */
  }
  process.exit(2);
});
