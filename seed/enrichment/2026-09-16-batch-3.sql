-- Real enrichment batch 3, researched 2026-09-16. Two images that looked
-- promising (Georges Espressobar's own site, Cine Mangiare's CDN link)
-- failed live validation (403 / 404) and were NOT used — image left
-- untouched rather than publish a broken or unverified link (§21).

-- 9. 't Withofke (act_osm-cafe-n2110537967) — verified against withofke.be
-- and Google Maps review tags.
UPDATE activities SET
  short_description = 'Traditional village brown pub in Minderhout run by a local family, known for darts and pool as much as for a drink. A back room hosts private parties while the front stays open to walk-ins.',
  full_description = 'Traditional Flemish "brown pub" in Minderhout, family-run and known locally for darts and pool/billiards alongside the usual drinks. It has a genuinely informal, homey character rather than a designed concept, and ties into village life (the site references the local kermis/fair). A back section can be booked for private parties while the front bar stays open to regular walk-ins. Closed Monday and Tuesday; open from 15:00 Wednesday to Saturday and from 09:00 on Sunday.',
  description_source = 'enrichment-pipeline-2026-09-16 (withofke.be, Google Maps reviews)',
  description_checked_at = 1789568948,
  needs_review_fields = '[]'
WHERE id = 'act_osm-cafe-n2110537967';

-- 10. Georges Espressobar (act_osm-cafe-n4826857561) — the venue's own
-- domain has expired/gone dark, so this is sourced from a specialty-coffee
-- directory and Google Maps review tags instead, not the official site.
UPDATE activities SET
  short_description = 'Small specialty coffee bar in Antwerp''s Eilandje district serving espresso, filter and cold brew, with plant-based milk options and a pastry with every coffee. Dog-friendly with outdoor seating.',
  full_description = 'Small specialty coffee bar in Antwerp''s Eilandje (old dock) district, named after the owner''s grandfather. Serves espresso, filter coffee (including V60 pour-over) and cold brew, with plant-based milk options; regulars note a pastry or cookie comes with every coffee. Dog-friendly, with outdoor seating available. Note: the café''s own website is currently offline, so this is sourced from a specialty-coffee directory and Google reviews rather than the venue directly — worth rechecking that it''s still open before relying on the listed hours.',
  description_source = 'enrichment-pipeline-2026-09-16 (europeancoffeetrip.com, Google Maps — official site is down)',
  description_checked_at = 1789568948,
  needs_review_fields = '["identity"]'
WHERE id = 'act_osm-cafe-n4826857561';

-- 11. Bowling & Hyperbowling / Bowling Stones Antwerp (act_bowling-stones-antwerp)
-- — verified against bowlingstones.be (official rates + Hyperbowling page).
UPDATE activities SET
  short_description = 'Antwerp branch of Belgium''s largest bowling chain, with 18 lanes and "Hyperbowling" - lit, colour-coded bumper targets that add bonus points, one of the first venues in Belgium to offer it. Also runs a Stone Grill restaurant where you cook your own meat or fish at the table.',
  full_description = 'Antwerp branch of Bowling Stones, Belgium''s largest bowling chain, with 18 lanes that can run classic bowling or "Hyperbowling" - a format using lit, colour-coded bumper targets along the lane that award bonus points, which this venue was one of the first in Belgium to offer. Beyond bowling, it runs a Stone Grill restaurant concept (cook your own meat, fish or vegetables at the table on a hot stone) and a "Pastastrike" pasta-plus-bowling combo, and hosts kids'' parties and themed bowling nights. Lanes are rented per hour, not per person (up to 6 players per lane), and one drink per person is required. Dogs are not allowed.',
  description_source = 'enrichment-pipeline-2026-09-16 (bowlingstones.be)',
  description_checked_at = 1789568948,
  price_min_cents = 3500,
  price_max_cents = 3800,
  price_unit_note = 'per lane / hour, up to 6 players (Mon-Thu vs Fri-Sun/holidays)',
  price_confidence = 'exact',
  price_source_url = 'https://www.bowlingstones.be/en/antwerp/praktische-info/',
  price_checked_at = 1789568948,
  image_url = 'https://www.bowlingstones.be/wp-content/uploads/2025/09/43A9093.jpg',
  image_source = 'Bowling Stones (official site)',
  image_attribution = 'Bowling Stones',
  image_is_generic = 0,
  image_quality_score = 5,
  status = 'verified',
  last_verified_at = 1789568948,
  needs_review_fields = '[]'
WHERE id = 'act_bowling-stones-antwerp';

-- 12. Ciné Mangiare (act_osm-cinema-n12464992390) — verified against
-- cinemangiare.be. Genuinely no fixed weekly opening hours (it runs on a
-- per-screening program, not daily hours) - left opening_hours empty
-- rather than force a misleading weekly schedule onto it.
UPDATE activities SET
  short_description = 'Small family-run dinner cinema in Gent: a home-cooked meal that changes with every screening, served before the film starts. The son curates the films and introduces them; the mother cooks.',
  full_description = 'Small, intimate dinner cinema in Gent run by a family: a home-cooked meal (a different dish each screening, usually with a vegetarian or vegan option) is served before the film, typically doors at 18:00, dinner at 19:00, film around 20:30. One reviewer notes the son personally curates and introduces the films while the mother cooks. There is a garden terrace by the Leie river. The venue can also be privately rented (minimum 15 people) with a choice of set menus, including picking your own film. Because programming is per-screening rather than a fixed weekly schedule, check the current listing on the official site for what''s actually showing.',
  description_source = 'enrichment-pipeline-2026-09-16 (cinemangiare.be, Google Maps reviews)',
  description_checked_at = 1789568948,
  price_min_cents = 3500,
  price_max_cents = 4500,
  price_unit_note = 'p.p., private group rental (min. 15 people) - regular screenings are priced per event',
  price_confidence = 'estimate',
  price_source_url = 'https://www.cinemangiare.be/',
  price_checked_at = 1789568948,
  needs_review_fields = '["opening_hours"]'
WHERE id = 'act_osm-cinema-n12464992390';

-- 13. Casa de Padel Genval / La Casa (act_osm-padel-n9681015404) — verified
-- against lacasagenval.com and Google Maps. Note: the official address is
-- actually in La Hulpe, not Genval itself, despite the venue's own
-- "Genval" branding - flagged for a human sanity check rather than
-- silently changing the stored city.
UPDATE activities SET
  short_description = 'Indoor padel club with 7 heated courts (12m ceiling height), a clubhouse with bar and light food, and a padel academy running adult and kids courses. Despite the "Genval" name, the official address is in neighbouring La Hulpe.',
  full_description = 'Indoor padel club with 7 heated, covered courts and 12 metres of free ceiling height, plus a clubhouse with a bar, light food and a mezzanine overlooking the courts. Runs a padel academy (Padel Genval Academie) with structured courses for adults and kids/teens, plus school-holiday camps, and has two meeting rooms available for corporate bookings alongside free indoor parking. Court rental is priced per hour rather than per person, with a lower daytime weekday rate. Note: despite the "Genval" branding, the club''s official address is in La Hulpe, a short walk from the Genval lake.',
  description_source = 'enrichment-pipeline-2026-09-16 (lacasagenval.com, Google Maps)',
  description_checked_at = 1789568948,
  price_min_cents = 3000,
  price_max_cents = 3600,
  price_unit_note = 'per court / hour (weekday daytime vs. evening/weekend)',
  price_confidence = 'estimate',
  price_source_url = 'https://www.lacasagenval.com',
  price_checked_at = 1789568948,
  image_url = 'https://static.wixstatic.com/media/217adb_9b0134dbe4344c76a5e848ae2ad139fa~mv2.jpg',
  image_source = 'La Casa Genval (official site)',
  image_attribution = 'La Casa Genval',
  image_is_generic = 0,
  image_quality_score = 5,
  status = 'verified',
  last_verified_at = 1789568948,
  needs_review_fields = '["location"]'
WHERE id = 'act_osm-padel-n9681015404';
