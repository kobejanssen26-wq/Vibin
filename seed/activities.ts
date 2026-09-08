/**
 * VIBIN production seed catalogue — Belgium first (§13–§19).
 *
 * Every entry below is a REAL, publicly-listed Belgian activity venue. The
 * `provider`, `providerWebsite`, `city`, `address` and `bookingUrl` were taken
 * from public sources (venue sites, tourism boards) on the date in
 * `SEED_VERIFIED_ON`. Prices are INDICATIVE and typed honestly
 * (`per_person` / `per_group` / `from_per_person` / `varies`) — a group price is
 * never presented as a per-person price.
 *
 * IMPORTANT: every seeded activity ships as `status: "needs_review"`. Before a
 * public launch a human must re-check each one against the provider and flip it
 * to `verified` in the admin (which stamps `lastVerifiedAt`). VIBIN never
 * presents unverified data as guaranteed-current (§27).
 *
 * Images: each activity carries a hand-picked photo that shows THAT specific
 * activity (see ACTIVITY_IMAGES below) — free-licence Unsplash photos resolved to
 * their stable CDN URLs. The SwipeCard/PlanView `<img onError>` still falls back
 * to the branded category treatment if a URL ever fails. Provider-approved
 * photos remain the launch upgrade path (§18 priority 1) and can replace these
 * per-activity in the admin.
 */

export const SEED_VERIFIED_ON = "2026-09-07"; // YYYY-MM-DD

/**
 * Per-activity photography. Values are Unsplash photo ids (the `photo-<id>`
 * segment of images.unsplash.com URLs). Every photo was hand-checked to depict
 * the actual activity — not a loose category match — and confirmed to be on the
 * free Unsplash licence (not Unsplash+). Shared ids are intentional: the two
 * Bowling Stones venues, the two The Park VR venues and the two axe-throwing
 * venues run the identical format, and both brewery visits are lambic/cellar
 * tours.
 */
export const ACTIVITY_IMAGES: Record<string, string> = {
  "bowling-stones-antwerp": "1545056453-f0359c3df6db",
  "bowling-stones-brussels": "1545056453-f0359c3df6db",
  "the-park-vr-antwerp": "1758273239313-6c703d089dd4",
  "the-park-vr-ghent": "1758273239313-6c703d089dd4",
  "dijle-floats-kayak-leuven": "1578940695359-2dd6aff3eb84",
  "halve-maan-brewery-tour-bruges": "1779591211635-5e3daafab2a2",
  "cantillon-brewery-brussels": "1779591211635-5e3daafab2a2",
  "train-world-brussels": "1779643796787-aa14cac77030",
  "mas-museum-antwerp": "1782507421864-25e22178f70e",
  "gravensteen-castle-ghent": "1668030589283-cc19db6b4f97",
  "thermae-boetfort-spa": "1757940661240-f2e8d2ff93bf",
  "boulder-the-island-antwerp": "1696105538782-7815474f28e0",
  "antwerp-axe-throwing": "1761873763418-2c9596bc8c65",
  "gent-axe-throwing": "1761873763418-2c9596bc8c65",
  "jump-xl-brussels": "1751235604534-f07bf076d690",
  "kings-of-comedy-brussels": "1507676385008-e7fb562d11f8",
  "60-minutes-escape-brussels": "1761207850889-75d5765d33c0",
  "outpost-gamecenter-antwerp": "1676651471150-0e3a5f8de05e",
  "kinepolis-cinema": "1595769816263-9b910be24d5f",
};

/** Resolve a slug to a sized, CDN-optimised Unsplash URL (or null if unmapped). */
export function activityImageUrl(slug: string): string | null {
  const id = ACTIVITY_IMAGES[slug];
  return id
    ? `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`
    : null;
}

export const ACTIVITY_IMAGE_SOURCE = "Unsplash";
export const ACTIVITY_IMAGE_ATTRIBUTION = "Photo via Unsplash";

export interface SeedActivity {
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  provider: string;
  providerWebsite: string;
  bookingUrl?: string;
  ticketUrl?: string;
  city: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** amount in `priceType` units, in EUR cents. null = varies / free */
  priceCents: number | null;
  priceType:
    | "per_person"
    | "per_group"
    | "from_per_person"
    | "free"
    | "varies";
  priceBand: "free" | "0_10" | "10_25" | "25_50" | "50_100" | "100_plus";
  durationMin?: number;
  minParticipants?: number;
  maxParticipants?: number;
  minAge?: number;
  indoorOutdoor?: "indoor" | "outdoor" | "both";
  accessibility?: string;
  tags: string[];
  /** page the details were taken from */
  sourceUrl: string;
}

export const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: "sport", label: "Sport", icon: "🏅" },
  { id: "adventure", label: "Adventure", icon: "🧗" },
  { id: "food_drinks", label: "Food & Drinks", icon: "🍽️" },
  { id: "nightlife", label: "Nightlife", icon: "🌃" },
  { id: "creative", label: "Creative", icon: "🎨" },
  { id: "relaxation", label: "Relaxation", icon: "🧖" },
  { id: "culture", label: "Culture", icon: "🏛️" },
  { id: "nature", label: "Nature", icon: "🌲" },
  { id: "gaming", label: "Gaming", icon: "🎮" },
  { id: "entertainment", label: "Entertainment", icon: "🎬" },
  { id: "learning", label: "Learning", icon: "📚" },
  { id: "other", label: "Other", icon: "✨" },
];

export const ACTIVITIES: SeedActivity[] = [
  {
    slug: "bowling-stones-antwerp",
    title: "Bowling & Hyperbowling",
    description:
      "Eighteen lanes plus Hyperbowling (interactive bumpers and light targets), a bar and food. Good for mixed groups — competitive or not. Book a lane per hour; shoe rental included.",
    category: "entertainment",
    subcategory: "Bowling",
    provider: "Bowling Stones Antwerp",
    providerWebsite: "https://www.bowlingstones.be",
    bookingUrl: "https://www.bowlingstones.be/en/",
    city: "Antwerp",
    address: "Groenendaallaan 394, 2030 Antwerpen",
    lat: 51.2554,
    lng: 4.4188,
    priceCents: 2000,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 90,
    minParticipants: 2,
    indoorOutdoor: "indoor",
    tags: ["indoor", "any-weather", "classic", "groups"],
    sourceUrl: "https://www.bowlingstones.be/en/",
  },
  {
    slug: "the-park-vr-antwerp",
    title: "Free-roam VR mission",
    description:
      "Backpack VR with 100 m² of free-roam space: 30 minutes of co-op mini-games followed by a 30-minute free-roam mission. Teams of two to six. No wires, no queues between rounds.",
    category: "gaming",
    subcategory: "Virtual reality",
    provider: "The Park Playground",
    providerWebsite: "https://theparkplayground.com",
    bookingUrl: "https://theparkplayground.com/en-be/our-locations/antwerp",
    city: "Antwerp",
    address: "Vlaamsekaai 30, 2000 Antwerpen",
    lat: 51.2137,
    lng: 4.3919,
    priceCents: 2299,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 60,
    minParticipants: 2,
    maxParticipants: 6,
    minAge: 10,
    indoorOutdoor: "indoor",
    tags: ["indoor", "tech", "teamwork", "adrenaline"],
    sourceUrl: "https://theparkplayground.com/en-be/our-locations/antwerp",
  },
  {
    slug: "the-park-vr-ghent",
    title: "Free-roam VR mission (Ghent)",
    description:
      "The Ghent branch of The Park's backpack VR: shared free-roam arena, co-op mini-games and a mission. Same format as Antwerp, at Dok-Noord.",
    category: "gaming",
    subcategory: "Virtual reality",
    provider: "The Park Playground",
    providerWebsite: "https://theparkplayground.com",
    bookingUrl: "https://theparkplayground.com/en-be/our-locations/ghent",
    city: "Ghent",
    address: "Dok-Noord 7, 9000 Gent",
    lat: 51.0662,
    lng: 3.7402,
    priceCents: 3499,
    priceType: "from_per_person",
    priceBand: "25_50",
    durationMin: 60,
    minParticipants: 2,
    maxParticipants: 6,
    minAge: 10,
    indoorOutdoor: "indoor",
    tags: ["indoor", "tech", "teamwork"],
    sourceUrl: "https://theparkplaygroundcom.webhosting.be/en/cities/gent/",
  },
  {
    slug: "dijle-floats-kayak-leuven",
    title: "Kayak the Dijle to Leuven",
    description:
      "A calm one-and-a-half to two hour paddle down the Dijle, from Korbeek-Dijle through the Arenberg estate towards Leuven. No experience needed. Kayaks, paddles and buoyancy aids provided.",
    category: "adventure",
    subcategory: "Kayaking",
    provider: "Dijle Floats",
    providerWebsite: "https://www.dijlefloats.be",
    bookingUrl: "https://www.dijlefloats.be/nl/particulieren/kayak-op-de-dijle",
    city: "Leuven",
    address: "Waversebaan, Oud-Heverlee (start point)",
    lat: 50.8399,
    lng: 4.6650,
    priceCents: 3800,
    priceType: "from_per_person",
    priceBand: "25_50",
    durationMin: 120,
    minParticipants: 2,
    minAge: 12,
    indoorOutdoor: "outdoor",
    tags: ["outdoor", "water", "summer", "nature"],
    sourceUrl: "https://www.dijlefloats.be/nl/particulieren/kayak-op-de-dijle",
  },
  {
    slug: "halve-maan-brewery-tour-bruges",
    title: "De Halve Maan brewery tour",
    description:
      "A 45-minute guided tour of Bruges' historic city-centre brewery, ending with a Brugse Zot Blond on the rooftop. Book online for a small discount; buy tickets at the door otherwise.",
    category: "food_drinks",
    subcategory: "Brewery tour",
    provider: "Brouwerij De Halve Maan",
    providerWebsite: "https://www.halvemaan.be",
    ticketUrl: "https://www.halvemaan.be/en/visit/brewery",
    city: "Bruges",
    address: "Walplein 26, 8000 Brugge",
    lat: 51.2019,
    lng: 3.2231,
    priceCents: 1100,
    priceType: "per_person",
    priceBand: "10_25",
    durationMin: 45,
    minAge: 16,
    indoorOutdoor: "indoor",
    accessibility: "Many stairs — not step-free.",
    tags: ["indoor", "drinks", "guided", "rainy-day"],
    sourceUrl: "https://www.halvemaan.be/en/visit/brewery",
  },
  {
    slug: "cantillon-brewery-brussels",
    title: "Cantillon: lambic brewery visit",
    description:
      "A self-guided walk around a working family lambic brewery from 1900, with two beers to taste at the end. Best in the cold months when brewing is in progress.",
    category: "food_drinks",
    subcategory: "Brewery visit",
    provider: "Brasserie Cantillon",
    providerWebsite: "https://www.cantillon.be",
    ticketUrl: "https://www.cantillon.be",
    city: "Brussels",
    address: "Rue Gheude 56, 1070 Anderlecht",
    lat: 50.8419,
    lng: 4.3319,
    priceCents: 1000,
    priceType: "per_person",
    priceBand: "10_25",
    durationMin: 60,
    minAge: 18,
    indoorOutdoor: "indoor",
    tags: ["indoor", "drinks", "self-guided"],
    sourceUrl: "https://www.cantillon.be",
  },
  {
    slug: "train-world-brussels",
    title: "Train World museum",
    description:
      "The Belgian railway museum next to Schaerbeek station: historic locomotives, a preserved 19th-century station building and an atmospheric, theatrical layout. Two to three hours.",
    category: "culture",
    subcategory: "Museum",
    provider: "Train World",
    providerWebsite: "https://trainworld.be",
    ticketUrl: "https://trainworld.be/en/plan-your-visit/tickets-prices-train-world/",
    city: "Brussels",
    address: "Place Princesse Élisabeth 5, 1030 Schaerbeek",
    lat: 50.8786,
    lng: 4.3792,
    priceCents: 1500,
    priceType: "per_person",
    priceBand: "10_25",
    durationMin: 150,
    indoorOutdoor: "indoor",
    accessibility: "Step-free access available.",
    tags: ["indoor", "rainy-day", "family"],
    sourceUrl: "https://trainworld.be/en/plan-your-visit/tickets-prices-train-world/",
  },
  {
    slug: "mas-museum-antwerp",
    title: "MAS + free rooftop",
    description:
      "Ten floors of Antwerp's history in a striking red sandstone tower, plus a free panoramic rooftop with a 360° view of the city and port. Closed Mondays; go late afternoon for the light.",
    category: "culture",
    subcategory: "Museum",
    provider: "MAS | Museum aan de Stroom",
    providerWebsite: "https://www.mas.be",
    ticketUrl: "https://www.mas.be",
    city: "Antwerp",
    address: "Hanzestedenplaats 1, 2000 Antwerpen",
    lat: 51.2289,
    lng: 4.4052,
    priceCents: 1200,
    priceType: "per_person",
    priceBand: "10_25",
    durationMin: 120,
    indoorOutdoor: "indoor",
    accessibility: "Lifts to all floors and the rooftop.",
    tags: ["indoor", "view", "rainy-day"],
    sourceUrl: "https://www.mas.be",
  },
  {
    slug: "gravensteen-castle-ghent",
    title: "Gravensteen castle",
    description:
      "A moated 12th-century castle in the middle of Ghent, with ramparts to walk, a small arms collection and a well-known tongue-in-cheek audio guide. About an hour and a half.",
    category: "culture",
    subcategory: "Historic site",
    provider: "Historische Huizen Gent",
    providerWebsite: "https://historischehuizen.stad.gent/en/gravensteen",
    ticketUrl: "https://historischehuizen.stad.gent/en/gravensteen",
    city: "Ghent",
    address: "Sint-Veerleplein 11, 9000 Gent",
    lat: 51.0574,
    lng: 3.7200,
    priceCents: 1300,
    priceType: "per_person",
    priceBand: "10_25",
    durationMin: 90,
    indoorOutdoor: "both",
    accessibility: "Many steep stairs — limited step-free access.",
    tags: ["history", "walking", "audio-guide"],
    sourceUrl: "https://historischehuizen.stad.gent/en/gravensteen",
  },
  {
    slug: "thermae-boetfort-spa",
    title: "Thermae Boetfort day spa",
    description:
      "A wellness centre in a 400-year-old castle estate just outside Brussels: Finnish saunas, steam rooms, indoor and outdoor pools and quiet lounging areas. A full day is roughly ten hours.",
    category: "relaxation",
    subcategory: "Spa & sauna",
    provider: "Thermae Boetfort",
    providerWebsite: "https://www.thermae.com",
    bookingUrl: "https://www.thermae.com",
    city: "Melsbroek",
    address: "Sellaerstraat 42, 1820 Melsbroek",
    lat: 50.9086,
    lng: 4.4930,
    priceCents: 2990,
    priceType: "per_person",
    priceBand: "25_50",
    durationMin: 300,
    minAge: 16,
    indoorOutdoor: "both",
    tags: ["quiet", "wellness", "indoor", "couples"],
    sourceUrl: "https://www.thermae.com",
  },
  {
    slug: "boulder-the-island-antwerp",
    title: "Indoor bouldering",
    description:
      "Walk-in bouldering across graded problems for every level, with a first-timer intro if you need one. No ropes, no partner required. Shoe rental on site; bring comfortable clothes.",
    category: "sport",
    subcategory: "Bouldering",
    provider: "Boulderzaal The Island",
    providerWebsite: "https://boulderzaaltheisland.be",
    bookingUrl: "https://boulderzaaltheisland.be/en/prices/",
    city: "Antwerp",
    address: "Napelsstraat 116, 2000 Antwerpen",
    lat: 51.2286,
    lng: 4.4171,
    priceCents: 1600,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 120,
    minAge: 8,
    indoorOutdoor: "indoor",
    tags: ["indoor", "active", "any-weather", "beginner-friendly"],
    sourceUrl: "https://boulderzaaltheisland.be/en/prices/",
  },
  {
    slug: "antwerp-axe-throwing",
    title: "Axe throwing",
    description:
      "Coached lanes with interactive projected targets and mini-games — closer to darts than lumberjacking. Closed-toe shoes required. Groups of two to six per lane.",
    category: "adventure",
    subcategory: "Axe throwing",
    provider: "Antwerp Axe Throwing",
    providerWebsite: "https://www.antwerpaxethrowing.be",
    bookingUrl: "https://www.antwerpaxethrowing.be/en/",
    city: "Antwerp",
    address: "Sint-Jacobsmarkt 36, 2000 Antwerpen",
    lat: 51.2213,
    lng: 4.4093,
    priceCents: 2500,
    priceType: "from_per_person",
    priceBand: "25_50",
    durationMin: 75,
    minParticipants: 2,
    maxParticipants: 6,
    minAge: 16,
    indoorOutdoor: "indoor",
    tags: ["indoor", "adrenaline", "coached", "competitive"],
    sourceUrl: "https://www.antwerpaxethrowing.be/en/",
  },
  {
    slug: "gent-axe-throwing",
    title: "Axe throwing (Ghent)",
    description:
      "Axe throwing at interactive projected games in a retro arcade setting in central Ghent. One game runs about an hour per person.",
    category: "adventure",
    subcategory: "Axe throwing",
    provider: "Gent Axe Throwing",
    providerWebsite: "https://www.gentaxethrowing.be",
    bookingUrl: "https://www.gentaxethrowing.be/en",
    city: "Ghent",
    address: "Sint-Niklaasstraat, 9000 Gent",
    lat: 51.0526,
    lng: 3.7231,
    priceCents: 2500,
    priceType: "per_person",
    priceBand: "25_50",
    durationMin: 60,
    minParticipants: 2,
    minAge: 16,
    indoorOutdoor: "indoor",
    tags: ["indoor", "retro", "competitive"],
    sourceUrl: "https://www.gentaxethrowing.be/en",
  },
  {
    slug: "jump-xl-brussels",
    title: "Trampoline park session",
    description:
      "A big indoor trampoline park in Laeken: interconnected trampolines, a foam pit, a ninja course, dodgeball and a wall-run. Grippy socks required (sold on site). One-hour jump sessions.",
    category: "sport",
    subcategory: "Trampoline park",
    provider: "Jump XL Brussels",
    providerWebsite: "https://jumpxlbrussels.com",
    bookingUrl: "https://jumpxlbrussels.com/en/session/",
    city: "Brussels",
    address: "Rue Tielemans 2, 1020 Laken",
    lat: 50.8853,
    lng: 4.3517,
    priceCents: 1600,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 60,
    minAge: 6,
    indoorOutdoor: "indoor",
    tags: ["indoor", "active", "any-weather", "family"],
    sourceUrl: "https://jumpxlbrussels.com/en/practical-information/",
  },
  {
    slug: "kings-of-comedy-brussels",
    title: "English stand-up comedy night",
    description:
      "A New-York-style comedy club in Ixelles with a bar and kitchen, running regular hand-picked English-language line-ups. Around 70 seats — arrive early, especially on Saturdays. Shows usually start at 21:00.",
    category: "entertainment",
    subcategory: "Comedy",
    provider: "Kings of Comedy Club",
    providerWebsite: "https://www.lekings.be",
    ticketUrl: "https://www.lekings.be/series/english-stand-up-comedy/",
    city: "Brussels",
    address: "Chaussée de Boondael 489, 1050 Ixelles",
    lat: 50.8199,
    lng: 4.3808,
    priceCents: 1200,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 120,
    minAge: 16,
    indoorOutdoor: "indoor",
    tags: ["evening", "indoor", "drinks"],
    sourceUrl: "https://www.lekings.be/series/english-stand-up-comedy/",
  },
  {
    slug: "60-minutes-escape-brussels",
    title: "Escape room challenge",
    description:
      "Sixty minutes to solve your way out of a themed room as a team. Best with three to five people. Rooms vary in difficulty — pick one to match the group.",
    category: "gaming",
    subcategory: "Escape room",
    provider: "60 Minutes Escape Room",
    providerWebsite: "https://60minutes.be",
    bookingUrl: "https://60minutes.be/en",
    city: "Brussels",
    address: "Rue Berckmans 87, 1060 Saint-Gilles",
    lat: 50.8306,
    lng: 4.3540,
    priceCents: 2500,
    priceType: "from_per_person",
    priceBand: "25_50",
    durationMin: 75,
    minParticipants: 2,
    maxParticipants: 6,
    minAge: 12,
    indoorOutdoor: "indoor",
    tags: ["indoor", "puzzles", "teamwork", "any-weather"],
    sourceUrl: "https://60minutes.be/en",
  },
  {
    slug: "outpost-gamecenter-antwerp",
    title: "Board-game café afternoon",
    description:
      "A dedicated game centre with a large open library of board games (free to play), a bar and food. Staff will teach you something new. Pay for what you drink and eat.",
    category: "gaming",
    subcategory: "Board games",
    provider: "Outpost Gamecenter",
    providerWebsite: "https://www.outpost.be",
    city: "Antwerp",
    address: "Beggaardenstraat 6, 2000 Antwerpen",
    lat: 51.2201,
    lng: 4.4013,
    priceCents: 0,
    priceType: "free",
    priceBand: "free",
    durationMin: 180,
    indoorOutdoor: "indoor",
    tags: ["indoor", "cosy", "any-weather", "casual"],
    sourceUrl: "https://www.spottedbylocals.com/antwerp/outpost/",
  },
  {
    slug: "kinepolis-cinema",
    title: "Cinema night at Kinepolis",
    description:
      "A trip to one of Kinepolis' large multiplexes — latest releases, big screens, Laser and premium halls at some sites. Book seats together in advance for a group.",
    category: "entertainment",
    subcategory: "Cinema",
    provider: "Kinepolis",
    providerWebsite: "https://kinepolis.be",
    ticketUrl: "https://kinepolis.be",
    city: "Antwerp",
    address: "Groenendaallaan 394, 2030 Antwerpen (and other sites)",
    lat: 51.2557,
    lng: 4.4183,
    priceCents: 1300,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 150,
    indoorOutdoor: "indoor",
    tags: ["indoor", "evening", "rainy-day", "classic"],
    sourceUrl: "https://kinepolis.be",
  },
  {
    slug: "bowling-stones-brussels",
    title: "Hyperbowling in Brussels",
    description:
      "The Brussels branch of Bowling Stones: classic lanes plus Hyperbowling with light-up targets, and Bobbies restaurant on site. Lane hire by the hour, shoes included.",
    category: "entertainment",
    subcategory: "Bowling",
    provider: "Bowling Stones Brussels",
    providerWebsite: "https://www.bowlingstones.be",
    bookingUrl: "https://www.bowlingstones.be/en/brussel/hyperbowlen/",
    city: "Brussels",
    address: "Boulevard de l'Humanité 55, 1070 Anderlecht",
    lat: 50.8232,
    lng: 4.3121,
    priceCents: 2000,
    priceType: "from_per_person",
    priceBand: "10_25",
    durationMin: 90,
    minParticipants: 2,
    indoorOutdoor: "indoor",
    tags: ["indoor", "any-weather", "classic", "groups"],
    sourceUrl: "https://www.bowlingstones.be/en/brussel/hyperbowlen/",
  },
];
