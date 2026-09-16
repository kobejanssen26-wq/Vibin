-- Real enrichment batch, researched 2026-09-16. Every fact below was
-- verified against the official source cited in price_source_url /
-- description_source. Nothing here is invented.

-- 1. TC De Vrijheid (act_osm-tennis-w742621308) — research found the club
-- may have merged into "Noord Tennis Padel vzw" and the address on file is
-- marked permanently closed on Google Maps. Too uncertain to publish new
-- descriptive copy under the old identity. The one thing we CAN fix now:
-- the current image is a stock photo of a tennis court in Melbourne,
-- Australia — a wrong-location image, worse than no image at all.
UPDATE activities SET
  image_url = NULL,
  image_attribution = NULL,
  image_source = NULL,
  image_is_generic = 1,
  image_quality_score = 0,
  needs_review_fields = '["identity","image"]'
WHERE id = 'act_osm-tennis-w742621308';

-- 2. De Patriot (act_osm-bar-w230315341) — Google Maps marks this address
-- "Permanently closed" and the website is an empty hosting placeholder.
-- Flagging for human review rather than publishing enrichment copy for a
-- possibly-defunct bar.
UPDATE activities SET
  needs_review_fields = '["identity"]'
WHERE id = 'act_osm-bar-w230315341';

-- 3. Aquarein (act_osm-spa-n5040685922) — verified against aquarein.be/info,
-- checked 2026-09-16.
UPDATE activities SET
  short_description = 'Wellness centre in Bouwel with seven saunas (including a biosauna, hammam and panorama sauna), two hot tubs, and indoor and outdoor pools. Day admission covers the full sauna and pool area; a cheaper rate applies from 16:30 on weekday evenings.',
  full_description = 'Wellness centre in Bouwel with seven saunas (biosauna, hammam, infrared, kelosauna, mood sauna, panorama sauna, stone sauna), two hot tubs, and indoor and outdoor swimming pools. An on-site restaurant serves food throughout the day, and massage and beauty treatments (manicure, pedicure, facials, epilation) can be booked separately. Day admission covers the full sauna and pool area; a cheaper evening rate applies from 16:30 on weekdays (excluding Friday, Saturday, public holidays and school breaks). Multi-visit cards are available for regulars. Open daily 11:00-22:00, closed 24-25 December and 1 January.',
  description_source = 'enrichment-pipeline-2026-09-16 (aquarein.be)',
  description_checked_at = 1789561853,
  price_min_cents = 3300,
  price_max_cents = 4100,
  price_unit_note = 'p.p. (evening from 16:30 - full day)',
  price_confidence = 'exact',
  price_source_url = 'https://www.aquarein.be/info',
  price_checked_at = 1789561853,
  image_url = 'https://www.aquarein.be/images/2026/04/15/sauna.webp',
  image_source = 'Aquarein (official site)',
  image_attribution = 'Aquarein',
  image_is_generic = 0,
  image_quality_score = 5,
  status = 'verified',
  last_verified_at = 1789561853,
  needs_review_fields = '[]'
WHERE id = 'act_osm-spa-n5040685922';

-- 4. Recreatiedomein De Mosten (act_de-mosten-meer) — verified against
-- visithoogstraten.be and hoogstraten.be/retributie-DeMosten, checked
-- 2026-09-16.
UPDATE activities SET
  short_description = 'Municipal recreation domain in Meer with a natural swimming pond, sandy beach and playgrounds, plus a climbing park and cable-wakeboard park run by local partners. Free beach volleyball, basketball and table tennis courts are also on site.',
  full_description = 'Municipal recreation domain in Meer (near Hoogstraten) built around a natural swimming pond with a sandy beach and grass lounging area, big playgrounds, and free-to-use beach volleyball, basketball, badminton and table tennis. A 4.5 km mountain-bike single-track runs through the surrounding woods. Two partner operators run extra activities on site: a climbing park (Klimpark De Mosten) and a cable-wakeboard park (Goodlife Cablepark). The swimming area is seasonal — full hours from late June to end of August, shorter hours in May, June and September, and closed (with the playground still free and open) from mid-September to April. Blue Flag certified for water quality and sustainable management.',
  description_source = 'enrichment-pipeline-2026-09-16 (visithoogstraten.be, hoogstraten.be)',
  description_checked_at = 1789561853,
  price_min_cents = 300,
  price_max_cents = 500,
  price_unit_note = 'p.p. / day (age & residency dependent, swim season)',
  price_confidence = 'exact',
  price_source_url = 'https://www.hoogstraten.be/retributie-DeMosten',
  price_checked_at = 1789561853,
  image_url = 'https://cdn.visithoogstraten.be/20210723154954/2021-06-12-Hoogstraten-De-Mosten-039_websize-620x450.jpg',
  image_source = 'VisitHoogstraten (official)',
  image_attribution = 'VisitHoogstraten',
  image_is_generic = 0,
  image_quality_score = 4,
  status = 'verified',
  last_verified_at = 1789561853,
  needs_review_fields = '[]'
WHERE id = 'act_de-mosten-meer';

-- 5. Sportpark Vrijheid (act_osm-sportscentre-w232439618) — verified against
-- heusden-zolder.be/sportpark-vrijheid, checked 2026-09-16. No public pitch-
-- rental price was found, so price is left alone rather than guessed; a
-- real venue photo exists but only as an unlicensed scraped Google Maps
-- CDN URL, which we don't use per the "official APIs only" image policy —
-- so the image stays the honest generic fallback too.
UPDATE activities SET
  short_description = 'Open-access sports park in Heusden-Zolder with natural and artificial grass pitches, an 850 m² skatepark and a free outdoor fitness area. Pitches can be booked online outside club hours with at least 24 hours notice.',
  full_description = 'Open-access municipal sports park combining natural and artificial grass pitches (used by local football and rugby clubs, but bookable by the public outside club hours via an online platform with at least 24 hours notice), an 850+ m² skatepark, and a free outdoor body-weight fitness area. The skatepark is open daily, with longer hours on weekends, school holidays and in July-August.',
  description_source = 'enrichment-pipeline-2026-09-16 (heusden-zolder.be)',
  description_checked_at = 1789561853,
  needs_review_fields = '["price","image"]'
WHERE id = 'act_osm-sportscentre-w232439618';
