-- Real enrichment batch 2, researched 2026-09-16.

-- 6. Cuore Italiano (act_osm-restaurant-n755793128) — verified against
-- cuoreitaliano.be/menu and the site's contact page.
UPDATE activities SET
  short_description = 'Italian osteria in Leuven serving fresh pasta, wood-fired pizza and Italian charcuterie boards. Shares a building with La Bottega, its companion wine bar and Italian-products shop.',
  full_description = 'Italian osteria in Leuven serving fresh pasta, wood-fired pizza, Italian charcuterie and cheese boards, meat and fish mains, and homemade desserts. Its companion wine bar and shop, La Bottega, sits a few doors down and pours Italian wines alongside the same kitchen''s food. Pizza runs roughly EUR15-25, pasta EUR21-32 and mains EUR21-43. Closed on Tuesdays; open for lunch and dinner the rest of the week, with a Sunday-evening service too.',
  description_source = 'enrichment-pipeline-2026-09-16 (cuoreitaliano.be)',
  description_checked_at = 1789562591,
  price_min_cents = 1500,
  price_max_cents = 4300,
  price_unit_note = 'p.p. (pizza to main course range)',
  price_confidence = 'exact',
  price_source_url = 'https://www.cuoreitaliano.be/menu',
  price_checked_at = 1789562591,
  image_url = 'https://cuoreitaliano.be/img/tileRestaurant.jpeg',
  image_source = 'Cuore Italiano (official site)',
  image_attribution = 'Cuore Italiano',
  image_is_generic = 0,
  image_quality_score = 5,
  status = 'verified',
  last_verified_at = 1789562591,
  needs_review_fields = '[]'
WHERE id = 'act_osm-restaurant-n755793128';

-- 7. Het Stadsmus (act_osm-museum-n676088249) — verified against
-- stadsmus.hasselt.be/nl (the site the old hetstadsmus.be URL now
-- redirects to).
UPDATE activities SET
  short_description = 'City history museum in Hasselt in two adjoining historic residences, covering local history, Hasselt ceramics and folk culture. The permanent collection is free to visit.',
  full_description = 'City history museum in Hasselt, housed in two adjoining 17th- and 19th-century patrician residences. The permanent collection covers Hasselt''s history from historical, political, folkloric and cultural angles, and includes a Hasselt ceramics collection. The museum also runs temporary exhibitions and monthly guided tours of the city''s carillon tower. The permanent collection is free to enter; some temporary exhibitions carry a separate fee, and a self-guided audio tour costs a small extra charge. Note: the building''s elevator is currently out of service, which limits upper-floor access.',
  description_source = 'enrichment-pipeline-2026-09-16 (stadsmus.hasselt.be)',
  description_checked_at = 1789562591,
  price_min_cents = 0,
  price_max_cents = 0,
  price_unit_note = 'permanent collection free; some temporary exhibitions charge extra',
  price_confidence = 'exact',
  price_source_url = 'https://stadsmus.hasselt.be/nl/plan-je-bezoek',
  price_checked_at = 1789562591,
  image_url = 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Hasselt_-_Het_Stadsmus.jpg',
  image_source = 'Wikimedia Commons',
  image_attribution = 'Sonuwe / CC BY-SA 3.0 — Wikimedia Commons',
  image_is_generic = 0,
  image_quality_score = 4,
  status = 'verified',
  last_verified_at = 1789562591,
  needs_review_fields = '[]'
WHERE id = 'act_osm-museum-n676088249';

-- 8. Op de Wolken (act_osm-theatre-n10926792668) — the venue's own website
-- now displays a closure notice ("THEATER ZAAL OP DE WOLKEN STOPT!!!") and
-- redirects to an unrelated business. Its ticketing partner (Uitbureau)
-- confirms it has stopped selling tickets for this venue. Flagging for
-- review rather than publishing enrichment copy for what looks like a
-- closed theatre.
UPDATE activities SET
  needs_review_fields = '["identity"]'
WHERE id = 'act_osm-theatre-n10926792668';
