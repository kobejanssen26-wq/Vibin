/**
 * OpenStreetMap → VIBIN activity mapping.
 *
 * Each entry pulls one kind of real place from OSM (via Overpass) across all of
 * Belgium and maps it onto a VIBIN category + subcategory. `q` is an Overpass
 * filter body (statements inside `( … );`), run inside the Belgium area.
 *
 * Prices are INDICATIVE bands only (never a euro amount presented as fact) —
 * exactly how the hand-curated catalogue already treats `priceType: "varies"`.
 * `free: true` sets price 0 / band "free". `cap` bounds how many rows of that
 * kind enter the catalogue (keeps the mass categories sane).
 */

/** @typedef {{key:string, category:string, subcategory:string, indoorOutdoor?:"indoor"|"outdoor"|"both", priceType?:"varies"|"free"|"from_per_person", priceBand:string, free?:boolean, minAge?:number, cap:number, q:string}} OsmCat */

/** @type {OsmCat[]} */
export const OSM_CATEGORIES = [
  /* ---------------------------- sport ---------------------------- */
  { key: "bowling", category: "sport", subcategory: "Bowling", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", cap: 120,
    q: `nwr["leisure"="bowling_alley"];` },
  { key: "climbing", category: "sport", subcategory: "Climbing", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", minAge: 6, cap: 150,
    q: `nwr["leisure"="climbing"];nwr["sport"="climbing"]["leisure"~"sports_centre|climbing"];` },
  { key: "bouldering", category: "sport", subcategory: "Bouldering", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", minAge: 6, cap: 80,
    q: `nwr["climbing:boulder"="yes"];nwr["sport"="bouldering"];` },
  { key: "padel", category: "sport", subcategory: "Padel", indoorOutdoor: "both", priceType: "varies", priceBand: "10_25", cap: 250,
    q: `nwr["sport"="padel"];` },
  { key: "squash", category: "sport", subcategory: "Squash", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", cap: 80,
    q: `nwr["sport"="squash"];` },
  { key: "tennis", category: "sport", subcategory: "Tennis", indoorOutdoor: "both", priceType: "varies", priceBand: "10_25", cap: 200,
    q: `nwr["leisure"="sports_centre"]["sport"="tennis"];nwr["club"="tennis"];` },
  { key: "iceskating", category: "sport", subcategory: "Ice skating", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", cap: 60,
    q: `nwr["leisure"="ice_rink"];` },
  { key: "trampoline", category: "sport", subcategory: "Trampoline park", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", minAge: 4, cap: 60,
    q: `nwr["leisure"="trampoline_park"];` },
  { key: "karting", category: "sport", subcategory: "Karting", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "25_50", minAge: 12, cap: 80,
    q: `nwr["sport"="karting"];nwr["leisure"="track"]["sport"="motor"];` },
  { key: "minigolf", category: "sport", subcategory: "Mini-golf", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "0_10", cap: 120,
    q: `nwr["leisure"="miniature_golf"];` },
  { key: "golf", category: "sport", subcategory: "Golf", indoorOutdoor: "outdoor", priceType: "varies", priceBand: "25_50", cap: 120,
    q: `nwr["leisure"="golf_course"];` },
  { key: "laser", category: "sport", subcategory: "Laser game", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", minAge: 6, cap: 60,
    q: `nwr["sport"="laser_tag"];nwr["leisure"="laser_tag"];` },
  { key: "paintball", category: "sport", subcategory: "Paintball", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "25_50", minAge: 12, cap: 60,
    q: `nwr["sport"="paintball"];` },
  { key: "swimming", category: "sport", subcategory: "Swimming pool", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "0_10", cap: 250,
    q: `nwr["leisure"="swimming_pool"]["access"!="private"]["name"];` },
  { key: "waterpark", category: "sport", subcategory: "Water park", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "10_25", cap: 40,
    q: `nwr["leisure"="water_park"];` },
  { key: "sportscentre", category: "sport", subcategory: "Sports centre", indoorOutdoor: "both", priceType: "varies", priceBand: "10_25", cap: 250,
    q: `nwr["leisure"="sports_centre"]["name"]["sport"!~"."];` },

  /* ------------------------- entertainment ---------------------- */
  { key: "cinema", category: "entertainment", subcategory: "Cinema", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", cap: 150,
    q: `nwr["amenity"="cinema"];` },
  { key: "arcade", category: "entertainment", subcategory: "Arcade", indoorOutdoor: "indoor", priceType: "varies", priceBand: "0_10", cap: 80,
    q: `nwr["leisure"="amusement_arcade"];` },
  { key: "theatre", category: "entertainment", subcategory: "Theatre", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", cap: 200,
    q: `nwr["amenity"="theatre"]["theatre:type"!="amphi"]["name"];` },
  { key: "escape", category: "entertainment", subcategory: "Escape room", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "25_50", minAge: 10, cap: 200,
    q: `nwr["leisure"="escape_game"];` },
  { key: "themepark", category: "entertainment", subcategory: "Theme park", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "25_50", cap: 40,
    q: `nwr["tourism"="theme_park"];` },
  { key: "karaoke", category: "entertainment", subcategory: "Karaoke", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", cap: 40,
    q: `nwr["amenity"="karaoke_box"];nwr["leisure"="karaoke"];` },
  { key: "eventsvenue", category: "entertainment", subcategory: "Events venue", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", cap: 120,
    q: `nwr["amenity"="events_venue"]["name"];nwr["amenity"="concert_hall"]["name"];` },

  /* ---------------------------- culture ------------------------- */
  { key: "museum", category: "culture", subcategory: "Museum", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "0_10", cap: 400,
    q: `nwr["tourism"="museum"]["name"];` },
  { key: "gallery", category: "culture", subcategory: "Art gallery", indoorOutdoor: "indoor", priceType: "varies", priceBand: "free", cap: 150,
    q: `nwr["tourism"="gallery"]["name"];` },
  { key: "artscentre", category: "culture", subcategory: "Cultural centre", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", cap: 200,
    q: `nwr["amenity"="arts_centre"]["name"];` },
  { key: "castle", category: "culture", subcategory: "Castle", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "0_10", cap: 200,
    q: `nwr["historic"="castle"]["name"];nwr["historic"="fort"]["name"];` },
  { key: "historic", category: "culture", subcategory: "Historic site", indoorOutdoor: "both", priceType: "varies", priceBand: "free", cap: 300,
    q: `nwr["historic"~"monument|memorial|ruins|archaeological_site|city_gate|tower"]["name"]["wikipedia"];` },
  { key: "planetarium", category: "culture", subcategory: "Planetarium", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "0_10", cap: 15,
    q: `nwr["amenity"="planetarium"];` },
  { key: "library", category: "culture", subcategory: "Library", indoorOutdoor: "indoor", free: true, priceBand: "free", cap: 150,
    q: `nwr["amenity"="library"]["name"]["library"!="mobile"];` },

  /* ----------------------------- nature ------------------------- */
  { key: "zoo", category: "nature", subcategory: "Zoo", indoorOutdoor: "both", priceType: "from_per_person", priceBand: "10_25", cap: 40,
    q: `nwr["tourism"="zoo"]["name"];` },
  { key: "aquarium", category: "nature", subcategory: "Aquarium", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "10_25", cap: 20,
    q: `nwr["tourism"="aquarium"]["name"];` },
  { key: "botanical", category: "nature", subcategory: "Botanical garden", indoorOutdoor: "outdoor", priceType: "varies", priceBand: "0_10", cap: 40,
    q: `nwr["leisure"="garden"]["garden:type"="botanical"]["name"];` },
  { key: "naturereserve", category: "nature", subcategory: "Nature reserve", indoorOutdoor: "outdoor", free: true, priceBand: "free", cap: 400,
    q: `nwr["leisure"="nature_reserve"]["name"];` },
  { key: "park", category: "nature", subcategory: "Park", indoorOutdoor: "outdoor", free: true, priceBand: "free", cap: 400,
    q: `nwr["leisure"="park"]["name"]["access"!="private"]["wikidata"];way["leisure"="park"]["name"](if:number(t["area"])>40000);` },
  { key: "viewpoint", category: "nature", subcategory: "Viewpoint", indoorOutdoor: "outdoor", free: true, priceBand: "free", cap: 250,
    q: `nwr["tourism"="viewpoint"]["name"];` },
  { key: "forest", category: "nature", subcategory: "Forest walk", indoorOutdoor: "outdoor", free: true, priceBand: "free", cap: 150,
    q: `nwr["boundary"="forest"]["name"];nwr["landuse"="forest"]["name"]["wikidata"];` },

  /* -------------------------- relaxation ------------------------ */
  { key: "spa", category: "relaxation", subcategory: "Spa & sauna", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "25_50", minAge: 16, cap: 120,
    q: `nwr["leisure"="spa"]["name"];nwr["amenity"="spa"]["name"];nwr["leisure"="sauna"]["name"];` },

  /* --------------------------- creative ------------------------- */
  { key: "pottery", category: "creative", subcategory: "Pottery workshop", indoorOutdoor: "indoor", priceType: "from_per_person", priceBand: "25_50", cap: 60,
    q: `nwr["craft"="pottery"]["name"];nwr["shop"="pottery"]["name"];` },

  /* ---------------------------- gaming -------------------------- */
  { key: "boardgames", category: "gaming", subcategory: "Board games", indoorOutdoor: "indoor", priceType: "varies", priceBand: "0_10", cap: 60,
    q: `nwr["shop"="games"]["name"];nwr["leisure"="adult_gaming_centre"]["name"];` },

  /* -------------------------- nightlife ------------------------- */
  { key: "nightclub", category: "nightlife", subcategory: "Club", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", minAge: 18, cap: 120,
    q: `nwr["amenity"="nightclub"]["name"];` },
  { key: "bar", category: "nightlife", subcategory: "Bar", indoorOutdoor: "indoor", priceType: "varies", priceBand: "0_10", minAge: 16, cap: 300,
    q: `nwr["amenity"="bar"]["name"]["website"];` },

  /* ------------------------- food_drinks ------------------------ */
  { key: "brewery", category: "food_drinks", subcategory: "Brewery", indoorOutdoor: "indoor", priceType: "varies", priceBand: "10_25", minAge: 16, cap: 200,
    q: `nwr["craft"="brewery"]["name"];nwr["microbrewery"="yes"]["name"];` },
  { key: "restaurant", category: "food_drinks", subcategory: "Restaurant", indoorOutdoor: "indoor", priceType: "varies", priceBand: "25_50", cap: 500,
    q: `nwr["amenity"="restaurant"]["name"]["website"]["cuisine"];` },
  { key: "cafe", category: "food_drinks", subcategory: "Café", indoorOutdoor: "indoor", priceType: "varies", priceBand: "0_10", cap: 250,
    q: `nwr["amenity"="cafe"]["name"]["website"];` },
  { key: "chocolate", category: "food_drinks", subcategory: "Chocolate shop", indoorOutdoor: "indoor", priceType: "varies", priceBand: "0_10", cap: 120,
    q: `nwr["shop"="chocolate"]["name"];` },

  /* ----------------------------- other ------------------------- */
  { key: "mall", category: "other", subcategory: "Shopping centre", indoorOutdoor: "indoor", free: true, priceBand: "free", cap: 120,
    q: `nwr["shop"="mall"]["name"];` },
  { key: "market", category: "other", subcategory: "Market", indoorOutdoor: "outdoor", free: true, priceBand: "free", cap: 120,
    q: `nwr["amenity"="marketplace"]["name"];` },
];
