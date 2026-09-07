import type { ActivityDTO } from "@shared/types";

/**
 * A fully-formed ActivityDTO used only to render a REAL <SwipeCard> on the
 * marketing landing page (a live component preview, not a fake screenshot).
 * The venue is real and public; this is the same shape the API returns.
 */
export function demoActivity(): ActivityDTO {
  return {
    id: "demo",
    title: "Free-roam VR mission",
    description:
      "Backpack VR with 100 m² of free-roam space: 30 minutes of co-op mini-games, then a 30-minute mission. Teams of two to six.",
    category: "gaming",
    subcategory: "Virtual reality",
    categoryLabel: "Gaming",
    categoryIcon: "🎮",
    provider: "The Park Playground",
    providerWebsite: "https://theparkplayground.com",
    locationLabel: "The Park Playground, Antwerp",
    address: "Vlaamsekaai 30, 2000 Antwerpen",
    city: "Antwerp",
    country: "BE",
    lat: 51.2137,
    lng: 4.3919,
    distanceKm: 2.4,
    priceCents: 2299,
    priceType: "from_per_person",
    priceBand: "10_25",
    priceLabel: "From €23 / person",
    currency: "EUR",
    durationMin: 60,
    minParticipants: 2,
    maxParticipants: 6,
    minAge: 10,
    indoorOutdoor: "indoor",
    accessibility: null,
    openingHours: {},
    websiteUrl: "https://theparkplayground.com",
    bookingUrl: "https://theparkplayground.com/en-be/our-locations/antwerp",
    ticketUrl: null,
    imageUrl: null,
    images: [],
    imageAttribution: null,
    tags: ["indoor", "tech", "teamwork"],
    source: "web",
    sourceUrl: "https://theparkplayground.com/en-be/our-locations/antwerp",
    lastVerifiedAt: null,
    status: "needs_review",
    availabilityNote: "",
  };
}
