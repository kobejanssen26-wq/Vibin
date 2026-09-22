import type { ActivityDTO } from "@shared/types";

/**
 * Fully-formed ActivityDTOs used only to render REAL <SwipeCard>s on the
 * marketing landing page (a live component preview, not a fake screenshot
 * or stock mockup). Both venues are real, live in the catalogue, with an
 * exact price and a photo pulled from the venue's own website — not a
 * generic stock photo standing in for "an activity" (checked 2026-09-24;
 * re-verify against the live row if these venues' own data changes).
 */
export function demoActivity(): ActivityDTO {
  return {
    id: "demo",
    title: "Museum of Illusions",
    description:
      "Billed as the largest of its kind in Brussels, it explores science and math concepts through exhibits that reveal how human perception can be tricked.",
    fullDescription:
      "Billed as the largest of its kind in Brussels, it explores science and math concepts through exhibits that reveal how human perception can be tricked.",
    descriptionCredit: null,
    category: "culture",
    subcategory: "Museum",
    categoryLabel: "Museum",
    categoryIcon: "🖼️",
    provider: "Museum of Illusions",
    providerWebsite: "https://museumofillusions.be",
    locationLabel: "Museum of Illusions, Brussels",
    address: "Rue du Lombard 27, 1000 Bruxelles",
    city: "Brussels",
    country: "BE",
    lat: 50.8459,
    lng: 4.3486,
    distanceKm: 1.8,
    priceCents: 1750,
    priceType: "per_person",
    priceBand: "10_25",
    priceLabel: "€17.50 / person",
    priceIsEstimate: false,
    currency: "EUR",
    durationMin: null,
    minParticipants: null,
    maxParticipants: null,
    minAge: null,
    indoorOutdoor: "indoor",
    accessibility: null,
    openingHours: {},
    websiteUrl: "https://museumofillusions.be",
    bookingUrl: "https://museumofillusions.be",
    ticketUrl: null,
    imageUrl:
      "https://museumofillusions.be/wp-content/uploads/2024/08/moi-home-carousel5-Brussels-Belgium-1200x900-1.png",
    images: [
      "https://museumofillusions.be/wp-content/uploads/2024/08/moi-home-carousel5-Brussels-Belgium-1200x900-1.png",
    ],
    imageSource: "Official website (museumofillusions.be)",
    imageAttribution: null,
    tags: [],
    source: "web",
    sourceUrl: "https://museumofillusions.be",
    lastVerifiedAt: null,
    status: "needs_review",
    monetizationType: "outbound_tracking",
    availabilityNote: "",
  };
}

/** The card waiting underneath in the hero's swipe loop. Also real, live data. */
export function demoNextActivity(): ActivityDTO {
  return {
    ...demoActivity(),
    id: "demo-next",
    title: "MoMu Fashion Museum",
    description:
      "Fashion museum that collects, conserves, studies and exhibits Belgian fashion, with a collection to explore, a magazine and online tickets that secure entry at a chosen time.",
    fullDescription:
      "Fashion museum that collects, conserves, studies and exhibits Belgian fashion, with a collection to explore, a magazine and online tickets that secure entry at a chosen time.",
    descriptionCredit: null,
    category: "culture",
    subcategory: "Museum",
    categoryLabel: "Museum",
    categoryIcon: "🖼️",
    provider: "MoMu",
    providerWebsite: "https://www.momu.be",
    locationLabel: "MoMu, Antwerp",
    address: "Nationalestraat 28, 2000 Antwerpen",
    city: "Antwerp",
    lat: 51.2178,
    lng: 4.3997,
    distanceKm: 3.1,
    priceCents: 1300,
    priceType: "per_person",
    priceBand: "0_10",
    priceLabel: "€13 / person",
    priceIsEstimate: false,
    durationMin: null,
    minParticipants: null,
    maxParticipants: null,
    minAge: null,
    indoorOutdoor: "indoor",
    websiteUrl: "https://www.momu.be",
    bookingUrl: "https://www.momu.be",
    imageUrl:
      "https://d4r8ypmqnkoz0.cloudfront.net/visits/_1200x630_crop_center-center_82_none/schools_main_image_3.jpg",
    images: [
      "https://d4r8ypmqnkoz0.cloudfront.net/visits/_1200x630_crop_center-center_82_none/schools_main_image_3.jpg",
    ],
    imageSource: "Official website (momu.be)",
    tags: [],
    sourceUrl: "https://www.momu.be",
  };
}
