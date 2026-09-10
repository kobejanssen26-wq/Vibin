import { describe, it, expect } from "vitest";
import {
  buildRankContext,
  scoreActivity,
  rankActivities,
  type VoteSignalRow,
} from "./rank";
import type { Activity } from "../db/schema";

const NOW = 1_800_000_000;

/** minimal Activity stub */
function act(over: Partial<Activity>): Activity {
  return {
    id: over.id ?? "a1",
    providerId: "p",
    externalId: null,
    title: over.title ?? "X",
    description: "",
    categoryId: over.categoryId ?? "sport",
    subcategory: over.subcategory ?? "Bowling",
    provider: null,
    providerWebsite: null,
    locationLabel: "",
    address: null,
    city: over.city ?? "Antwerpen",
    country: "BE",
    lat: over.lat ?? 51_220_000,
    lng: over.lng ?? 4_400_000,
    priceCents: null,
    priceType: "varies",
    priceBand: "10_25",
    currency: "EUR",
    durationMin: null,
    minParticipants: over.minParticipants ?? null,
    maxParticipants: over.maxParticipants ?? null,
    minAge: null,
    indoorOutdoor: null,
    accessibility: null,
    openingHours: "{}",
    websiteUrl: null,
    bookingUrl: null,
    ticketUrl: null,
    imageUrl: null,
    imageSource: null,
    imageAttribution: null,
    tags: over.tags ?? "[]",
    source: over.source ?? "web",
    sourceUrl: null,
    lastVerifiedAt: null,
    status: "needs_review",
    active: 1,
    createdAt: over.createdAt ?? NOW - 200 * 86400,
    updatedAt: NOW,
  } as Activity;
}

const vote = (
  value: VoteSignalRow["value"],
  categoryId: string,
  subcategory: string,
  ageDays = 1,
  tags: string[] = [],
): VoteSignalRow => ({
  value,
  updatedAt: NOW - ageDays * 86400,
  categoryId,
  subcategory,
  tags: JSON.stringify(tags),
});

const opts = {
  origin: { lat: 51.22, lng: 4.4 },
  radiusKm: 25,
  groupSize: 4,
  now: NOW,
};

describe("scoreActivity", () => {
  it("closer activities score higher on the distance term", () => {
    const ctx = buildRankContext([], [], opts);
    const near = scoreActivity(act({ lat: 51_221_000, lng: 4_401_000 }), ctx);
    const far = scoreActivity(act({ lat: 51_400_000, lng: 4_700_000 }), ctx);
    expect(near.distance).toBeGreaterThan(far.distance);
  });

  it("repeated passes on a subcategory lower its score — but never exclude it", () => {
    const passes = Array.from({ length: 6 }, () =>
      vote("nope", "sport", "Bouldering", 2, ["osm", "indoor"]),
    );
    const ctx = buildRankContext(passes, passes, opts);
    const boulder = scoreActivity(
      act({ categoryId: "sport", subcategory: "Bouldering", tags: '["osm","indoor"]' }),
      ctx,
    );
    const neutral = scoreActivity(
      act({ categoryId: "culture", subcategory: "Museum", tags: '["indoor"]' }),
      ctx,
    );
    expect(boulder.personalSubcategory).toBeLessThan(0);
    expect(boulder.similarityToPassed).toBeGreaterThan(0);
    expect(boulder.total).toBeLessThan(neutral.total);
    // still a finite, comparable score — not -Infinity / filtered out
    expect(Number.isFinite(boulder.total)).toBe(true);
  });

  it("repeated likes lift similar items", () => {
    const likes = Array.from({ length: 5 }, () =>
      vote("like", "sport", "Padel", 3, ["osm", "racket", "active"]),
    );
    const ctx = buildRankContext(likes, likes, opts);
    const similar = scoreActivity(
      act({ categoryId: "sport", subcategory: "Padel", tags: '["osm","racket","active"]' }),
      ctx,
    );
    const unrelated = scoreActivity(
      act({ categoryId: "culture", subcategory: "Museum", tags: '["indoor","quiet"]' }),
      ctx,
    );
    expect(similar.personalSubcategory).toBeGreaterThan(0.2);
    expect(similar.total).toBeGreaterThan(unrelated.total);
  });

  it("group signal differs from personal signal (per-group personalization)", () => {
    const personal = [vote("like", "sport", "Padel", 5)];
    const groupCulture = Array.from({ length: 6 }, () =>
      vote("like", "culture", "Museum", 2),
    );
    const ctx = buildRankContext(personal, groupCulture, opts);
    const museum = scoreActivity(act({ categoryId: "culture", subcategory: "Museum" }), ctx);
    expect(museum.groupCategory).toBeGreaterThan(0.2);
    expect(museum.personalCategory).toBeLessThanOrEqual(0);
  });

  it("group-size fit penalises an activity that can't hold the group", () => {
    const ctx = buildRankContext([], [], { ...opts, groupSize: 30 });
    const tiny = scoreActivity(act({ maxParticipants: 4 }), ctx);
    const big = scoreActivity(act({ maxParticipants: 40 }), ctx);
    expect(tiny.groupSizeFit).toBeLessThan(big.groupSizeFit);
  });
});

describe("rankActivities", () => {
  it("does not stack one subcategory back-to-back", () => {
    const ctx = buildRankContext([], [], opts);
    const many: Activity[] = [];
    for (let i = 0; i < 20; i++)
      many.push(act({ id: `bowl${i}`, subcategory: "Bowling" }));
    for (let i = 0; i < 5; i++)
      many.push(act({ id: `mus${i}`, subcategory: "Museum", categoryId: "culture" }));
    const ranked = rankActivities(many, ctx, 12).map((r) => r.id);
    // among the first 8, at least one non-bowling card sneaks in via diversity
    const firstEight = ranked.slice(0, 8);
    expect(firstEight.some((id) => id.startsWith("mus"))).toBe(true);
  });

  it("returns ids capped at the limit with numeric scores", () => {
    const ctx = buildRankContext([], [], opts);
    const many = Array.from({ length: 50 }, (_, i) => act({ id: `x${i}` }));
    const ranked = rankActivities(many, ctx, 10);
    expect(ranked).toHaveLength(10);
    expect(ranked.every((r) => typeof r.score === "number")).toBe(true);
  });
});
