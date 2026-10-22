/**
 * VIBIN activity quality rules — pure logic, no I/O.
 *
 * THE RULE: a business is not admitted just because it has a physical location,
 * a website or sells something. There must be a concrete, relevant experience
 * that a user can discover on VIBIN and do together with friends.
 *
 * `assessActivity` turns one catalogue row (plus optional evidence from the
 * venue's own website) into an audit outcome with a reason and a rule id. It is
 * used by the one-off audit (scripts/audit), by the OSM catalogue builder and by
 * the admin import, so the same standard applies to new rows. It is an aid:
 * anything it is unsure about becomes `manual`, never an automatic deletion.
 */

/** Data gaps that are about trust, not about content. */
export const UNVERIFIED_ISSUE = "unverified";

export type AuditOutcome =
  | "approved" // real, relevant experience with enough reliable information
  | "fix_data" // suitable, but data is wrong or incomplete (see issues)
  | "manual" // not enough certainty to decide automatically
  | "exclude" // shop / ordinary commerce / no visitor experience
  | "duplicate" // same activity already in the catalogue
  | "closed"; // no longer exists / permanently closed

export type Confidence = "high" | "medium" | "low";

export interface AuditInput {
  title: string;
  provider?: string | null;
  category_id?: string | null;
  subcategory?: string | null;
  source?: string | null;
  description?: string | null;
  short_description?: string | null;
  website_url?: string | null;
  web_status?: string | null;
  status?: string | null;
  image_url?: string | null;
  image_is_generic?: number | null;
  address?: string | null;
  city?: string | null;
  price_confidence?: string | null;
  price_cents?: number | null;
  /**
   * True only when the record's existence and basics were verified against a source (research
   * evidence, or status 'verified' set after such a check). Without it a record can never be
   * "approved": a description and a live website do not prove anything.
   */
  verified?: boolean;
}

/** What the venue's own website says (from the crawl), when we have it. */
export interface AuditEvidence {
  text?: string | null;
  title?: string | null;
  meta?: string | null;
  closedSignal?: boolean;
}

export interface Assessment {
  outcome: AuditOutcome;
  rule: string;
  reason: string;
  confidence: Confidence;
  /** Data gaps / problems, even for approved rows: photo_generic, description_bare, … */
  issues: string[];
}

/* -------------------------------------------------------------------------- */
/*  Text helpers                                                              */
/* -------------------------------------------------------------------------- */

export const norm = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A description produced only from the OSM import template: tells a visitor nothing. */
export function isBareDescription(a: Pick<AuditInput, "description" | "short_description">): boolean {
  // The enriched short_description wins over the import template kept in `description`.
  const short = (a.short_description ?? "").trim();
  if (short.length >= 40 && !/From OpenStreetMap — not yet verified/i.test(short)) return false;
  const d = (a.description ?? "").trim();
  if (/From OpenStreetMap — not yet verified/i.test(d) || /From OpenStreetMap — not yet verified/i.test(short)) return true;
  return (short || d).length < 40;
}

const has = (re: RegExp, ...texts: (string | null | undefined)[]) => texts.some((t) => !!t && re.test(norm(t)));

/* -------------------------------------------------------------------------- */
/*  Pattern libraries (nl / fr / en / de), matched on normalised text         */
/* -------------------------------------------------------------------------- */

/** Chains whose outlets are shops, supermarkets or ordinary services. */
const RETAIL_BRANDS =
  /^(leonidas|neuhaus|godiva|marcolini|jeff de bruyne|galler|wittamer|corne port royal|pralibel|colruyt|delhaize|carrefour|aldi|lidl|intermarche|albert heijn|hema|zara|h en m|primark|jbc|mediamarkt|krefel|brico|hubo|gamma|ikea|decathlon|torfs|kruidvat|ici paris|bpost|kbc|belfius|bnp paribas|basic fit|jims|fitness|snap fitness|anytime fitness|mcdonald|burger king|quick|subway|domino|pizza hut|kfc|starbucks|panos|le pain quotidien|dunkin)\b/;

/** Ordinary shops, services and takeaway — by name word. */
const RETAIL_WORDS =
  /\b(winkel|boutique|magasin|supermarkt|supermarche|bakkerij|boulangerie|patisserie|slagerij|boucherie|traiteur|kapsalon|coiffeur|apotheek|pharmacie|opticien|juwelier|bijouterie|fleuriste|bloemist|frituur|friterie|snackbar|snack bar|kebab|pizzeria|takeaway|take away|afhaal|broodjeszaak|sandwicherie|ijssalon|glacier|tearoom|tea room|outlet|dierenwinkel|tabacshop|nachtwinkel|night shop|fietsenwinkel|autogarage|garage|dakwerken|schrijnwerk|immo|notaris|verzekering|bank|tandarts|dokter|kine|kinesist)\b/;

/** Words that show a real visitor experience — they override a retail-ish name. */
const EXPERIENCE_WORDS =
  /\b(museum|musee|workshop|atelier|rondleiding|visite|tour|experience|beleving|escape|adventure|avontuur|park|spa|sauna|wellness|brouwerij|brasserie|distillery|distillerie|proeverij|degustation|tasting|cursus|les|class|kookworkshop|praline maken|chocolate making|choco story|choco-story|cinema|bioscoop|theater|theatre|zoo|dierentuin|aquarium|kasteel|chateau|abdij|abbaye|kajak|kayak|klim|climb|bowling|karting|minigolf|mini golf|paintball|lasergame|trampoline|arcade|vr|virtual|simulator|planetarium|speelpark|pretpark)\b/;

/** Monuments / memorials / statues: nothing for a visitor to do. */
const MONUMENT_WORDS =
  /(monument|memorial|memoire|gedenk|standbeeld|ereperk|grafheuvel|tumul|demarcatiepaal|ruiterstandbeeld|\b(statue|statues|beeld|buste|bust|kruis|calvarie|calvaire|kapelletje|chapelle|chapel|kapel|plaque|stele|obelisk|obelisque|fontein|fontaine|pomp|lavoir|wasplaats|graf|grave|tombe|tombeau|kerkhof|cimetiere|begraafplaats|observatiepost|pilbox|wegkapel|boomstronk|declaration|centre geographique|geografisch centrum)\b)/;

/** Words that make a bare historic entry a genuine, visitable place. */
const HISTORIC_PLACE_WORDS =
  /(chateau|kasteel|abdij|abbaye|\bfort\b|fortress|vesting|toren|\btour\b|belfort|beffroi|burcht|donjon|stadhuis|hotel de ville|site\b|domein|domaine|\bhof\b|molen|moulin|\bbrug\b|\bpont\b|poort|\bporte\b|kerk|eglise|kathedraal|cathedrale|begijnhof|beguinage|citadel|ruine|paleis|palais|villa|museum|musee|\bmijn\b|charbonnage|kolenmijn|grotte|\bgrot\b|\bcave\b|kazemat|bunker|erfgoed|heritage|archeolog|romeins|romain|sluis|ecluse|hefschip|spoorweg|thier|neolith|unesco|tempel|temple|oud |amphitheatre|theatre romain|toreken|\bmine\b|puits|mijnschacht|ermitage|hermitage|oppidum|perron|westwall|atlantikwall|schans|redoute|ringwall|motte|\bfortin\b|fortifi)/;

/** Accommodation / private-event / training words: a business, not a visit. */
const ACCOMMODATION_WORDS =
  /\b(gite|gites|chambres? d hotes|chambre d hote|b en b|bed en breakfast|bed and breakfast|logies|vakantiewoning|vakantiehuis|hotel|overnachting|overnacht|camping|jeugdverblijf|groepsverblijf|seminar|seminaire|residentie|appartement)\b/;
const PRIVATE_EVENT_WORDS =
  /\b(feestzaal|feestzalen|salle de fetes|salle des fetes|salle|zaal|zalen|cercle|salon de reception|receptiezaal|trouwzaal|huwelijk|mariage|wedding|bruiloft|communie|doopfeest|bapteme|party hall|banqueting|catering)\b/;
const EDUCATION_WORDS =
  /\b(school|ecole|academie|academy|opleiding|formation|cursussen|lessen|lessons|studio|residency|residentie|kunstkring|atelier graphoui|vereniging|asbl|vzw|club de|club van|koninklijke .*club)\b/;
const SPORT_FACILITY_WORDS =
  /\b(sporthal|sporthall|salle de sport|hall omnisport|omnisport|turnhal|sportcomplex|sportpark|sportcentrum|centre sportif|complexe sportif|gemeentelijke|gemeentelijk|fitness|gym|crossfit|hondenschool|manege|ruiterclub)\b/;
const PLAYGROUND_WORDS =
  /\b(speeltuin|speelplein|plaine de jeux|playground|square|plein|pocket park|speelbos|buurtpark|jeugdhuis|skatepark?)\b/;
const EVENT_MARKET_WORDS =
  /\b(kerstmarkt|marche de noel|christmas|vlooienmarkt|brocante|rommelmarkt|antiek|antiquites|nachtmarkt|night market|foodmarkt|food market|streetfood|vintage|kunstmarkt|ambachtenmarkt|boekenmarkt|bloemenmarkt|pasar|festival)\b/;
const VISIT_SIGNALS =
  /\b(bezoek|bezoeken|rondleiding|rondleidingen|visite|visites|visit|tickets|ticket|openingsuren|toegang|entree|entrance|tarieven|prijzen|exposition|tentoonstelling|expo|collectie|collection|proeverij|degustation|tasting|taproom|brewpub|taverne|activiteiten|activites|activities|workshop|reserveren|reserver|book)\b/;
const COMMERCE_SIGNALS =
  /\b(webshop|online bestellen|winkelwagen|add to cart|shop online|onze producten|assortiment|bestellen|livraison|boutique en ligne|verkoop)\b/;

/* -------------------------------------------------------------------------- */
/*  The assessment                                                            */
/* -------------------------------------------------------------------------- */

function build(
  outcome: AuditOutcome,
  rule: string,
  reason: string,
  confidence: Confidence,
  issues: string[],
): Assessment {
  return { outcome, rule, reason, confidence, issues };
}

/** Data gaps that apply regardless of the verdict. */
export function dataIssues(a: AuditInput): string[] {
  const issues: string[] = [];
  if (isBareDescription(a)) issues.push("description_bare");
  if (!a.image_url || a.image_is_generic) issues.push("photo_generic");
  if (!a.website_url) issues.push("website_missing");
  else if (a.web_status === "dead" || a.web_status === "parked") issues.push("website_unreliable");
  if (!a.address) issues.push("address_missing");
  if (a.price_confidence !== "exact" && a.price_confidence !== "estimate") issues.push("price_unknown");
  return issues;
}

export function assessActivity(a: AuditInput, ev: AuditEvidence = {}): Assessment {
  const issues = dataIssues(a);
  const sub = norm(a.subcategory);
  const name = norm(`${a.title} ${a.provider ?? ""}`);
  const bare = isBareDescription(a);
  const desc = norm(`${a.short_description ?? ""} ${a.description ?? ""}`);
  const siteText = norm(`${ev.title ?? ""} ${ev.meta ?? ""} ${(ev.text ?? "").slice(0, 3000)}`);
  const experienceInName = EXPERIENCE_WORDS.test(name);
  const curated = a.source === "web"; // hand-curated rows: trusted unless a hard rule hits

  /* 1. closed ---------------------------------------------------------- */
  if (a.web_status === "closed_signal" || ev.closedSignal || a.status === "outdated") {
    return build("closed", "closed_signal", "De website of de gegevens wijzen op een definitieve sluiting.", "medium", issues);
  }

  /* 2. retail brands and ordinary shops, by name ------------------------ */
  // Only when the name IS the brand ("Leonidas", "Neuhaus Etterbeek"), not "Instituut Tim Torfs".
  const titleWords = norm(a.title).split(" ");
  if (titleWords.length <= 3 && RETAIL_BRANDS.test(titleWords.join(" ")) && !/\b(museum|workshop|atelier|experience|tour)\b/.test(name)) {
    return build("exclude", "retail_brand", "Winkelketen of gewoon verkooppunt: producten kopen is geen VIBIN-activiteit.", "high", issues);
  }

  /* 3. subcategory-level standards -------------------------------------- */
  switch (sub) {
    case "chocolate shop": {
      if (/(workshop|atelier|museum|choco story|praline maken|proeverij|degustation|experience|rondleiding|initiation|make their own|zelf pralines)/.test(name + " " + desc + " " + siteText)) {
        return build("manual", "chocolate_experience_unclear", "Chocoladezaak met mogelijk een workshop of rondleiding: concreet aanbod controleren.", "low", issues);
      }
      return build("exclude", "chocolate_shop", "Chocoladewinkel: producten kopen is geen activiteit.", "high", issues);
    }
    case "shopping centre":
      return build("exclude", "shopping_centre", "Winkelcentrum: geen concrete activiteit of ervaring.", "high", issues);
    case "library":
      return build("exclude", "public_library", "Openbare bibliotheek: geen bezoekerservaring voor een vriendengroep.", "medium", issues);
    case "market": {
      if (EVENT_MARKET_WORDS.test(name + " " + desc)) {
        return build("manual", "market_event", "Mogelijk een bijzondere markt (kerst-, vlooien-, brocantemarkt): controleren of er een vaste, bezoekbare activiteit is.", "low", issues);
      }
      if (!bare) return build("manual", "market_described", "Markt met omschrijving: controleren of het een bijzondere, vaste uitstapbestemming is.", "low", issues);
      return build("exclude", "ordinary_market", "Gewone (week)markt: een verkooppunt, geen activiteit.", "medium", issues);
    }
    case "events venue": {
      if (bare || PRIVATE_EVENT_WORDS.test(name) || /\b(wedding|bruiloft|mariage|huwelijk|feest|party|baptisms|communie)\b/.test(desc)) {
        return build("exclude", "venue_for_hire", "Zaal- of feestlocatie voor privé-evenementen: geen publieke activiteit.", "medium", issues);
      }
      return build("manual", "events_venue_unclear", "Evenementenlocatie: controleren of er een publiek programma is.", "low", issues);
    }
    case "sports centre": {
      if (/(padel|squash|klim|climb|bowling|zwem|swim|trampol|schaats|skate|badminton|boulder|karting|laser|paintball|archery|boogschiet|kajak|kayak)/.test(desc)) {
        return build("manual", "sports_centre_activity", "Sportcentrum met concrete sportactiviteiten: controleren of bezoekers die kunnen boeken.", "low", issues);
      }
      if (SPORT_FACILITY_WORDS.test(name) || bare) {
        return build("exclude", "ordinary_sports_facility", "Gewone sporthal, fitness of clubfaciliteit: geen concrete uitstap voor vrienden.", "medium", issues);
      }
      return build("manual", "sports_centre_unclear", "Sportcentrum met beschrijving: controleren welke activiteit bezoekers kunnen boeken.", "low", issues);
    }
    case "tennis": {
      if (bare) return build("manual", "tennis_club_unclear", "Tennisclub zonder informatie: nagaan of terreinen publiek te huren zijn.", "low", issues);
      if (/\b(member|members|lid|leden|membre|membres|club|vereniging)\b/.test(desc) && !/\b(reserve|reserv|huur|rent|book|public|openbaar)\b/.test(desc)) {
        return build("manual", "tennis_club_members", "Lijkt een ledenclub: nagaan of terreinen publiek te huren zijn.", "low", issues);
      }
      break;
    }
    case "historic site": {
      if (MONUMENT_WORDS.test(name) && !HISTORIC_PLACE_WORDS.test(name)) {
        return build("exclude", "monument_no_visit", "Monument, gedenkteken of standbeeld: er valt niets te beleven.", "medium", issues);
      }
      if (bare && !HISTORIC_PLACE_WORDS.test(name)) {
        return build("exclude", "historic_unidentifiable", "Erfgoedpunt zonder omschrijving of herkenbaar bezoekbaar object: onvoldoende informatie.", "medium", issues);
      }
      break;
    }
    case "park": {
      if (PLAYGROUND_WORDS.test(name)) {
        return build("exclude", "playground_or_square", "Speeltuin, plein of buurtpark: geen bijzondere uitstapbestemming.", "medium", issues);
      }
      if (bare && !/\b(provincie|domein|domaine|natuur|nature|bos|bois|tuin|jardin|garden|arboretum|heide|landgoed|kasteel|recreatie|lac|meer|plas|rivier|dal|vallee|polder)\b/.test(name)) {
        return build("manual", "plain_park_unclear", "Gewoon stadspark zonder omschrijving: controleren of het een uitstapbestemming is.", "low", issues);
      }
      break;
    }
    case "castle": {
      const t = `${name} ${desc} ${siteText}`;
      if (ACCOMMODATION_WORDS.test(name) || (ACCOMMODATION_WORDS.test(desc) && !VISIT_SIGNALS.test(desc))) {
        return build("exclude", "castle_accommodation", "Kasteel dat vooral als hotel, gîte of verblijf functioneert: geen bezoekerservaring.", "medium", issues);
      }
      if (ev.text && ACCOMMODATION_WORDS.test(siteText) && !VISIT_SIGNALS.test(siteText) && !experienceInName) {
        return build("manual", "castle_not_visitable", "Website toont vooral verblijf of evenementen: nagaan of het kasteel te bezoeken is.", "low", issues);
      }
      if (bare && !a.website_url) {
        return build("manual", "castle_no_info", "Kasteel zonder website of omschrijving: nagaan of het publiek toegankelijk is.", "low", issues);
      }
      void t;
      break;
    }
    case "cultural centre": {
      const programme = /(programm|concert|theat|spectac|\bshows?\b|exposit|exhibit|tentoonstell|cinema|\bfilms?\b|\bdance|\bdans|festival|perform|\bstage\b)/.test(desc);
      if (!programme && (EDUCATION_WORDS.test(name) || /\b(school|lessons|lessen|residency|studio|opleiding|courses|workshops for)\b/.test(desc))) {
        return build("exclude", "arts_school_or_studio", "Kunstschool, studio of vereniging zonder publiek programma: geen bezoekerservaring.", "medium", issues);
      }
      break;
    }
    case "art gallery": {
      if (/\b(shop|boutique|verkoop|products|producten|for sale|te koop)\b/.test(desc) && !/(exhibit|tentoonstell|expo|museum|collection)/.test(desc)) {
        return build("exclude", "gallery_shop", "Galerie die vooral verkoopt: geen bezoekerservaring.", "medium", issues);
      }
      if (/\b(kunstkring|vereniging|amateur|cercle d art)\b/.test(name + " " + desc)) {
        return build("exclude", "art_circle", "Kunstkring of vereniging: geen publieke bezoekerservaring.", "medium", issues);
      }
      break;
    }
    case "club": {
      if (PRIVATE_EVENT_WORDS.test(name) || /\b(auditoire|ulb|vub|campus|student)\b/.test(name)) {
        return build("exclude", "hall_not_club", "Zaal of campusruimte, geen uitgaansgelegenheid.", "medium", issues);
      }
      break;
    }
    case "restaurant":
    case "cafe":
    case "bar": {
      if (experienceInName) break;
      if (/\b(immersive|interactief|interactive|robot|themed|theme|thema|escape|dinner show|dinner experience|murder|mystery|karaoke|medieval|rooftop|cocktail workshop)\b/.test(desc + " " + name)) {
        return build("manual", "horeca_experience_unclear", "Horecazaak met mogelijk een bijzondere ervaring: concreet aanbod controleren.", "low", issues);
      }
      if (/\b(group lodge|holiday house|lodge|gite|hotel|rooms)\b/.test(desc)) {
        return build("exclude", "horeca_accommodation", "Verblijf of gewone horeca: geen activiteit.", "medium", issues);
      }
      return build("exclude", "ordinary_horeca", "Gewoon café, bar of restaurant zonder bijzondere ervaring.", "medium", issues);
    }
    default:
      break;
  }

  /* 4. generic name-based commerce guard (any subcategory) ---------------- */
  if (!curated && RETAIL_WORDS.test(name) && !experienceInName && !VISIT_SIGNALS.test(desc)) {
    return build("exclude", "retail_name", "De naam wijst op een winkel of gewone dienstverlening zonder activiteit.", "medium", issues);
  }
  if (ev.text && COMMERCE_SIGNALS.test(siteText) && !VISIT_SIGNALS.test(siteText) && !experienceInName && !curated) {
    return build("manual", "commerce_site", "De website draait om verkoop; geen bezoek- of activiteitenaanbod gevonden.", "low", issues);
  }

  /* 5. brewery: a visit, or just a producer? --------------------------- */
  if (sub === "brewery" && ev.text && !VISIT_SIGNALS.test(siteText) && !/\b(taverne|tavern|brewpub|taproom|bezoek|visite|rondleiding)\b/.test(desc)) {
    return build("manual", "brewery_no_visit", "Brouwerij zonder zichtbaar bezoek- of proefaanbod: controleren.", "low", issues);
  }

  /* 6. what remains is an experience-type: approved vs data to fix ------- */
  // "approved" means: exists AND verified against a source. Without evidence it is at best fix_data.
  const fixable = issues.filter((i) => i === "description_bare" || i === "photo_generic" || i === "website_unreliable");
  const proven = a.verified === true;
  const allIssues = proven ? issues : [...issues, UNVERIFIED_ISSUE];
  if (curated && !issues.includes("website_unreliable")) {
    const ok = proven && !issues.includes("photo_generic");
    return build(ok ? "approved" : "fix_data", "curated_experience", proven ? "Handmatig opgenomen ervaring; ontbrekende gegevens zijn verbeterpunten." : "Handmatig opgenomen ervaring, nog niet aan een bron geverifieerd.", "medium", allIssues);
  }
  if (!bare && !issues.includes("website_unreliable") && !issues.includes("photo_generic") && proven) {
    return build("approved", "experience_verified", "Concrete ervaring, aan een bron geverifieerd.", "medium", allIssues);
  }
  return build(
    "fix_data",
    "experience_needs_data",
    `Geschikt type (${a.subcategory ?? a.category_id ?? "onbekend"}); te verbeteren: ${[...fixable, ...(proven ? [] : [UNVERIFIED_ISSUE])].join(", ") || "gegevens"}.`,
    "medium",
    allIssues,
  );
}

/** Fields that identify the venue: if one changes, an earlier verification no longer applies. */
export const ESSENTIAL_FIELDS = ["title", "provider", "address", "city", "lat", "lng", "website_url"] as const;
export function essentialFieldsChanged(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return ESSENTIAL_FIELDS.filter((f) => f in after && after[f] !== undefined && String(after[f] ?? "") !== String(before[f] ?? ""));
}

/** A record may only be stored as "verified" when the basics that could be verified exist. */
export function allowedStatus(status: string | undefined, r: { websiteUrl?: string | null; address?: string | null; city?: string | null }): string | undefined {
  if (status !== "verified") return status;
  return r.websiteUrl && r.address && r.city ? "verified" : "needs_review";
}

/* -------------------------------------------------------------------------- */
/*  Duplicates                                                                */
/* -------------------------------------------------------------------------- */

export interface DupCandidate {
  id: string;
  title: string;
  city?: string | null;
  lat?: number | null; // × 1e6
  lng?: number | null;
  source?: string | null;
  description?: string | null;
  short_description?: string | null;
  website_url?: string | null;
  image_is_generic?: number | null;
  created_at?: number | null;
}

/** Higher = better row to keep. Prefers curated, described, with its own site and photo. */
export function keepScore(a: DupCandidate): number {
  return (
    (a.source === "web" ? 100 : 0) +
    (isBareDescription(a) ? 0 : 40) +
    (a.website_url ? 15 : 0) +
    (a.image_is_generic ? 0 : 10) -
    (a.created_at ?? 0) / 1e12 // older wins ties
  );
}

const distM = (a: DupCandidate, b: DupCandidate): number => {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const dLat = ((a.lat - b.lat) / 1e6) * 111_000;
  const dLng = ((a.lng - b.lng) / 1e6) * 111_000 * Math.cos((a.lat / 1e6) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
};

const stripChain = (t: string) => norm(t).replace(/\b(museum|musee|brouwerij|brasserie|chateau|kasteel|restaurant|cafe|bar|de|het|een|la|le|les|the|van|der|den|du|des)\b/g, " ").replace(/\s+/g, " ").trim();

/**
 * Groups of duplicate rows. Same normalised title in the same city, or within
 * 80 m with a (near-)identical title. Returns [keeper, ...duplicates] per group.
 */
export function findDuplicateGroups<T extends DupCandidate>(rows: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${norm(r.title)}|${norm(r.city)}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
  }
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  rows.forEach((r) => parent.set(r.id, r.id));
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const g of byKey.values()) for (let i = 1; i < g.length; i++) union(g[0]!.id, g[i]!.id);

  // spatial pass: bucket by ~0.001° cell, compare neighbours
  const cells = new Map<string, T[]>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const key = `${Math.round(r.lat / 1000)}:${Math.round(r.lng / 1000)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(r);
  }
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const cx = Math.round(r.lat / 1000);
    const cy = Math.round(r.lng / 1000);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (o.id <= r.id) continue;
          if (distM(r, o) > 80) continue;
          const a = stripChain(r.title);
          const b = stripChain(o.title);
          if (a && b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))))) union(r.id, o.id);
        }
      }
    }
  }
  const groups = new Map<string, T[]>();
  for (const r of rows) (groups.get(find(r.id)) ?? groups.set(find(r.id), []).get(find(r.id))!).push(r);
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((x, y) => keepScore(y) - keepScore(x) || x.id.localeCompare(y.id)));
}

/** One-line statement of the standard, shown in the admin and the import preview. */
export const QUALITY_RULE =
  "Een bedrijf wordt niet toegelaten alleen omdat het een fysieke locatie, website of commerciële activiteit heeft. Er moet een concrete, relevante ervaring zijn die een gebruiker bij VIBIN kan ontdekken.";
