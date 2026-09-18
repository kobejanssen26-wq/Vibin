import { describe, expect, it } from "vitest";
import { toActivityDTO } from "./dto";
import type { Activity } from "../db/schema";

/** Minimal valid Activity row, overridable per test — mirrors the columns
 *  every OSM-imported row actually has set. */
function activityFixture(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act_test",
    providerId: "prov_osm",
    externalId: null,
    title: "TC De Vrijheid",
    description: "Tennis in Hoogstraten. From OpenStreetMap — not yet verified by VIBIN.",
    shortDescription: null,
    fullDescription: null,
    descriptionSource: null,
    descriptionCheckedAt: null,
    categoryId: "sport",
    subcategory: "Tennis",
    provider: "TC De Vrijheid",
    providerWebsite: null,
    locationLabel: "TC De Vrijheid, Hoogstraten",
    address: null,
    city: "Hoogstraten",
    country: "BE",
    lat: 51_393_522,
    lng: 4_762_364,
    priceCents: null,
    priceType: "varies",
    priceBand: "10_25",
    currency: "EUR",
    priceMinCents: null,
    priceMaxCents: null,
    priceUnitNote: null,
    priceConfidence: null,
    priceSourceUrl: null,
    priceCheckedAt: null,
    durationMin: null,
    minParticipants: null,
    maxParticipants: null,
    minAge: null,
    indoorOutdoor: "both",
    accessibility: null,
    openingHours: "{}",
    websiteUrl: null,
    bookingUrl: null,
    ticketUrl: null,
    monetizationType: "none",
    affiliateUrl: null,
    affiliateNetwork: null,
    affiliatePartnerId: null,
    commissionType: "none",
    commissionRate: null,
    commissionCurrency: null,
    commissionStatus: "none",
    imageUrl: "https://example.com/wrong-location.jpg",
    imageSource: "Wikimedia Commons",
    imageAttribution: "Someone / CC BY-SA 4.0 — Wikimedia Commons",
    imageIsGeneric: 0,
    imageQualityScore: null,
    tags: '["osm","both","needs-review"]',
    source: "osm",
    sourceUrl: "https://www.openstreetmap.org/way/1",
    lastVerifiedAt: null,
    status: "needs_review",
    needsReviewFields: "[]",
    active: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Activity;
}

describe("toActivityDTO — user-facing cleanup of internal metadata (§1/§2/§6/§38)", () => {
  it("returns no description at all when all that's left is a 'type in city' location label", () => {
    const dto = toActivityDTO(activityFixture());
    expect(dto.description).toBe("");
    expect(dto.fullDescription).toBe("");
  });

  it("never shows type+city as prose, even after stripping provenance + raw hours", () => {
    const dto = toActivityDTO(
      activityFixture({
        subcategory: "Spa & sauna",
        categoryId: "relaxation",
        description:
          "Spa & sauna in Bouwel. From OpenStreetMap — not yet verified by VIBIN. Listed hours: Mo-Sa 11:00-23:30; Su 11:00-22:30.",
      }),
    );
    expect(dto.description).toBe("");
  });

  it("keeps a real hand-written sentence and only strips the provenance tail", () => {
    const dto = toActivityDTO(
      activityFixture({
        description:
          "Family-run brasserie with a shaded terrace on the market square. From OpenStreetMap — not yet verified by VIBIN.",
      }),
    );
    expect(dto.description).toBe(
      "Family-run brasserie with a shaded terrace on the market square.",
    );
  });

  it("prefers a real enrichment-pipeline shortDescription over the cleaned fallback", () => {
    const dto = toActivityDTO(
      activityFixture({ shortDescription: "Real researched copy from the official site." }),
    );
    expect(dto.description).toBe("Real researched copy from the official site.");
  });

  it("fullDescription falls back to the short description when no full one was written", () => {
    const dto = toActivityDTO(activityFixture({ shortDescription: "Short only." }));
    expect(dto.fullDescription).toBe("Short only.");
  });

  it("drops internal pipeline tags (osm, needs-review, both) and title-cases what's left", () => {
    const dto = toActivityDTO(
      activityFixture({ tags: '["osm","both","needs-review","family","cuisine:italian"]' }),
    );
    expect(dto.tags).not.toContain("osm");
    expect(dto.tags).not.toContain("needs-review");
    expect(dto.tags).not.toContain("both");
    expect(dto.tags).toContain("Family");
    expect(dto.tags).toContain("Italian");
  });

  it("strips the internal-pipeline wording from image attribution without inventing a source", () => {
    const dto = toActivityDTO(
      activityFixture({ imageAttribution: "Wikimedia Commons — via OpenStreetMap" }),
    );
    expect(dto.imageAttribution).toBe("Wikimedia Commons");
    expect(dto.imageAttribution).not.toMatch(/OpenStreetMap/);
  });

  it("never exposes status/source/verification fields as card copy", () => {
    const dto = toActivityDTO(activityFixture());
    // status/source are still on the DTO for admin-ish callers, but they
    // must never leak into description or tags.
    expect(dto.description).not.toMatch(/needs.review/i);
    expect(dto.tags.join(" ")).not.toMatch(/needs.review|unverified|imported/i);
  });
});

describe("toActivityDTO — price label (§10-14: no more bare 'Price varies')", () => {
  it("uses the curated per-category price band instead of a bare 'Price varies'", () => {
    const dto = toActivityDTO(activityFixture({ priceType: "varies", priceBand: "10_25" }));
    expect(dto.priceLabel).toBe("Approx. €10–25 / person");
    expect(dto.priceIsEstimate).toBe(true);
  });

  it("shows a real researched range as an exact figure, not an estimate", () => {
    const dto = toActivityDTO(
      activityFixture({
        priceMinCents: 3300,
        priceMaxCents: 4100,
        priceUnitNote: "p.p. (evening - full day)",
        priceConfidence: "exact",
      }),
    );
    expect(dto.priceLabel).toBe("€33–€41 p.p. (evening - full day)");
    expect(dto.priceIsEstimate).toBe(false);
  });

  it("prefixes a researched estimate range with 'Approx.'", () => {
    const dto = toActivityDTO(
      activityFixture({ priceMinCents: 1000, priceMaxCents: 2000, priceConfidence: "estimate" }),
    );
    expect(dto.priceLabel).toBe("Approx. €10–€20 p.p.");
    expect(dto.priceIsEstimate).toBe(true);
  });

  it("free stays Free regardless of any band on file", () => {
    const dto = toActivityDTO(activityFixture({ priceType: "free", priceBand: "free" }));
    expect(dto.priceLabel).toBe("Free");
  });

  it("a 'varies' row with an inconsistent 'free' band says Free, not 'Approx. Free'", () => {
    const dto = toActivityDTO(activityFixture({ priceType: "varies", priceBand: "free" }));
    expect(dto.priceLabel).toBe("Free");
  });
});

describe("toActivityDTO — image attribution (§20: no 'Photo via Unsplash' on-card)", () => {
  it("suppresses Unsplash attribution entirely — its license doesn't require on-image credit", () => {
    const dto = toActivityDTO(
      activityFixture({ imageSource: "Unsplash", imageAttribution: "Photo via Unsplash" }),
    );
    expect(dto.imageAttribution).toBeNull();
  });

  it("keeps a Wikimedia Commons credit (its CC license requires attribution)", () => {
    const dto = toActivityDTO(
      activityFixture({
        imageSource: "Wikimedia Commons",
        imageAttribution: "Jane Doe / CC BY-SA 4.0 — Wikimedia Commons",
      }),
    );
    expect(dto.imageAttribution).toBe("Jane Doe / CC BY-SA 4.0 — Wikimedia Commons");
  });
});

describe("toActivityDTO — specific subcategory badge beats the broad category (§5)", () => {
  it("uses the subcategory + its own icon as the primary badge when mapped", () => {
    const dto = toActivityDTO(activityFixture({ categoryId: "sport", subcategory: "Tennis" }));
    expect(dto.categoryLabel).toBe("Tennis");
    expect(dto.categoryIcon).toBe("🎾");
  });

  it("falls back to the broad category when there is no subcategory", () => {
    const dto = toActivityDTO(activityFixture({ categoryId: "sport", subcategory: null }));
    expect(dto.categoryLabel).toBe("Sport");
    expect(dto.categoryIcon).toBe("🏅");
  });
});
