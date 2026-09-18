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
    fullDescription:
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
    priceIsEstimate: false,
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
    imageUrl:
      "https://images.unsplash.com/photo-1758273239313-6c703d089dd4?w=1200&q=75&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1758273239313-6c703d089dd4?w=1200&q=75&auto=format&fit=crop",
    ],
    imageSource: "Unsplash",
    imageAttribution: null,
    tags: ["Tech", "Teamwork"],
    source: "web",
    sourceUrl: "https://theparkplayground.com/en-be/our-locations/antwerp",
    lastVerifiedAt: null,
    status: "needs_review",
    monetizationType: "outbound_tracking",
    availabilityNote: "",
  };
}

/**
 * The card waiting underneath in the hero's swipe loop. Also a real venue
 * with facts from its own site (cinemangiare.be, checked 2026-09-16); no
 * photo, so it renders the brand gradient rather than a stock image that
 * doesn't show the place.
 */
export function demoNextActivity(): ActivityDTO {
  return {
    ...demoActivity(),
    id: "demo-next",
    title: "Ciné Mangiare",
    description:
      "Home-cooked dinner served before the film, different at every screening.",
    fullDescription:
      "Home-cooked dinner served before the film, different at every screening.",
    category: "entertainment",
    subcategory: "Cinema",
    categoryLabel: "Cinema",
    categoryIcon: "🎬",
    provider: "Ciné Mangiare",
    providerWebsite: "https://www.cinemangiare.be/",
    locationLabel: "Ciné Mangiare, Gent",
    address: null,
    city: "Gent",
    lat: null,
    lng: null,
    distanceKm: null,
    priceCents: null,
    priceType: "per_person",
    priceBand: "25_50",
    priceLabel: "€35 p.p. (groups of 15+)",
    priceIsEstimate: false,
    durationMin: null,
    minParticipants: null,
    maxParticipants: null,
    minAge: null,
    indoorOutdoor: "indoor",
    websiteUrl: "https://www.cinemangiare.be/",
    bookingUrl: null,
    imageUrl: null,
    images: [],
    imageSource: null,
    imageAttribution: null,
    tags: [],
    sourceUrl: "https://www.cinemangiare.be/",
  };
}
