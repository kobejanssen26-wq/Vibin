import { describe, expect, it } from "vitest";
import { allowedStatus, assessActivity, essentialFieldsChanged, findDuplicateGroups, isBareDescription, QUALITY_RULE, type AuditInput } from "./activity-quality";

const BARE = "Chocolate shop in Brussel. From OpenStreetMap — not yet verified by VIBIN.";
const row = (o: Partial<AuditInput> & { title: string }): AuditInput => ({
  provider: null,
  category_id: "other",
  subcategory: null,
  source: "osm",
  description: BARE,
  short_description: null,
  website_url: null,
  web_status: null,
  status: "needs_review",
  image_url: "https://x/y.jpg",
  image_is_generic: 1,
  address: null,
  city: "Brussel",
  ...o,
});

describe("assessActivity — what does NOT belong", () => {
  it("excludes a Leonidas shop (the owner's example)", () => {
    const a = assessActivity(row({ title: "Leonidas", subcategory: "Chocolate shop", category_id: "food_drinks" }));
    expect(a.outcome).toBe("exclude");
    expect(a.confidence).toBe("high");
  });
  it("keeps a chocolate workshop for review instead of deleting it", () => {
    const a = assessActivity(
      row({ title: "Planète Chocolat", subcategory: "Chocolate shop", short_description: "Chocolatier with workshops where visitors make their own pralines." }),
    );
    expect(a.outcome).toBe("manual");
  });
  it("excludes shopping centres, libraries and ordinary markets", () => {
    expect(assessActivity(row({ title: "Rive Gauche", subcategory: "Shopping centre" })).outcome).toBe("exclude");
    expect(assessActivity(row({ title: "Bibliotheek Mol", subcategory: "Library" })).outcome).toBe("exclude");
    expect(assessActivity(row({ title: "Vrijdagmarkt", subcategory: "Market" })).outcome).toBe("exclude");
  });
  it("sends a possibly special market to manual review", () => {
    expect(assessActivity(row({ title: "Kerstmarkt Brugge", subcategory: "Market" })).outcome).toBe("manual");
  });
  it("excludes monuments and statues but not a castle or a belfry", () => {
    expect(assessActivity(row({ title: "Monument aux Martyrs", subcategory: "Historic site" })).outcome).toBe("exclude");
    expect(assessActivity(row({ title: "Charles Buls - Karel Buls", subcategory: "Historic site" })).outcome).toBe("exclude");
    expect(assessActivity(row({ title: "Belfort van Veurne", subcategory: "Historic site" })).outcome).not.toBe("exclude");
  });
  it("excludes ordinary sports halls and fitness, keeps padel/climbing for review", () => {
    expect(assessActivity(row({ title: "Sporthal Merchtem", subcategory: "Sports centre" })).outcome).toBe("exclude");
    expect(assessActivity(row({ title: "Basic-Fit", subcategory: "Sports centre" })).outcome).toBe("exclude");
    expect(
      assessActivity(row({ title: "Sportcentrum Diest", subcategory: "Sports centre", short_description: "Multi-sport centre with fitness, padel and squash courts for hire." })).outcome,
    ).toBe("manual");
  });
  it("does not mistake a beauty institute for the Torfs shoe chain", () => {
    expect(assessActivity(row({ title: "Instituut Tim Torfs", subcategory: "Private sauna", short_description: "Beauty institute offering massage and facial treatments." })).outcome).not.toBe("exclude");
  });
  it("excludes ordinary cafés/restaurants but not a themed one", () => {
    expect(assessActivity(row({ title: "WOK Palace", subcategory: "Restaurant" })).outcome).toBe("exclude");
    expect(
      assessActivity(row({ title: "The Warlord Tavern", subcategory: "Bar", short_description: "Bar run as a cooperative with a medieval theme, serving beer." })).outcome,
    ).toBe("manual");
  });
  it("marks a site that reports closure as closed", () => {
    expect(assessActivity(row({ title: "Oud museum", subcategory: "Museum", web_status: "closed_signal" })).outcome).toBe("closed");
  });
  it("excludes venues for hire", () => {
    expect(assessActivity(row({ title: "Feestzalen Berkenhof", subcategory: "Events venue" })).outcome).toBe("exclude");
  });
});

describe("assessActivity — what stays", () => {
  const real = "Indoor climbing hall with 4,000 m² of walls for beginners and experts, open every day.";
  it("approves a described experience with its own photo and a live site — only when verified against a source", () => {
    const r = row({ title: "Klimzaal", subcategory: "Climbing", short_description: real, website_url: "https://k.be", web_status: "alive", image_is_generic: 0, address: "Straat 1" });
    expect(assessActivity({ ...r, verified: true }).outcome).toBe("approved");
    const unverified = assessActivity(r);
    expect(unverified.outcome).toBe("fix_data");
    expect(unverified.issues).toContain("unverified");
  });
  it("keeps a real experience visible but flags the generic photo and bare text", () => {
    const a = assessActivity(row({ title: "Escape Zone", subcategory: "Escape room", website_url: "https://e.be", web_status: "alive" }));
    expect(a.outcome).toBe("fix_data");
    expect(a.issues).toEqual(expect.arrayContaining(["photo_generic", "description_bare"]));
  });
  it("trusts hand-curated rows unless a hard rule hits", () => {
    const r = row({ title: "Karting near Antwerp", subcategory: "Karting", source: "web", short_description: real, image_is_generic: 0, website_url: "https://k.be", web_status: "alive" });
    expect(assessActivity({ ...r, verified: true }).outcome).toBe("approved");
    expect(assessActivity(r).outcome).toBe("fix_data");
  });
});

describe("bare descriptions", () => {
  it("the enriched short description wins over the import template", () => {
    expect(isBareDescription({ short_description: "A real, useful description of more than forty characters.", description: BARE })).toBe(false);
    expect(isBareDescription({ short_description: null, description: BARE })).toBe(true);
    expect(isBareDescription({ short_description: "kort", description: "" })).toBe(true);
  });
});

describe("duplicates", () => {
  const base = { source: "osm", description: BARE, short_description: null, website_url: null, image_is_generic: 1 };
  it("groups same title+city and keeps the best row", () => {
    const g = findDuplicateGroups([
      { id: "a", title: "Technopolis", city: "Mechelen", lat: 51_000_000, lng: 4_000_000, ...base },
      { id: "b", title: "Technopolis", city: "Mechelen", lat: 51_000_000, lng: 4_000_000, ...base, short_description: "Hands-on science centre with interactive set-ups for all ages.", website_url: "https://t.be" },
      { id: "c", title: "Iets anders", city: "Gent", lat: 51_100_000, lng: 3_700_000, ...base },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.map((x) => x.id)).toEqual(["b", "a"]); // the described one is kept
  });
  it("groups the same place under a slightly different name within 80 m", () => {
    const g = findDuplicateGroups([
      { id: "a", title: "Plantin-Moretus Museum", city: "Antwerpen", lat: 51_218_000, lng: 4_399_000, ...base },
      { id: "b", title: "Plantin-Moretus", city: "Antwerp", lat: 51_218_100, lng: 4_399_100, ...base },
    ]);
    expect(g).toHaveLength(1);
  });
  it("does not merge different places in the same city", () => {
    const g = findDuplicateGroups([
      { id: "a", title: "Bowling Gent", city: "Gent", lat: 51_050_000, lng: 3_700_000, ...base },
      { id: "b", title: "Escape Gent", city: "Gent", lat: 51_050_100, lng: 3_700_100, ...base },
    ]);
    expect(g).toHaveLength(0);
  });
});

describe("the quality rule", () => {
  it("states the standard", () => {
    expect(QUALITY_RULE).toMatch(/concrete, relevante ervaring/);
  });
});

describe("verification guards", () => {
  it("a new or edited record can only be 'verified' when the basics exist", () => {
    expect(allowedStatus("verified", { websiteUrl: "https://x.be", address: "Straat 1", city: "Gent" })).toBe("verified");
    expect(allowedStatus("verified", { websiteUrl: null, address: "Straat 1", city: "Gent" })).toBe("needs_review");
    expect(allowedStatus("needs_review", {})).toBe("needs_review");
    expect(allowedStatus(undefined, {})).toBeUndefined();
  });
  it("detects changes to the fields that identify the venue", () => {
    expect(essentialFieldsChanged({ title: "A", city: "Gent" }, { title: "A", city: "Brugge" })).toEqual(["city"]);
    expect(essentialFieldsChanged({ title: "A" }, { title: "A", description: "x" })).toEqual([]);
    expect(essentialFieldsChanged({ website_url: "a" }, { website_url: "b" })).toEqual(["website_url"]);
  });
});
