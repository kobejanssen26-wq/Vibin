-- Live-event ingestion sources. Idempotent (INSERT OR IGNORE on the id).
--
-- Only "manual" is enabled — it needs no config and lets the owner add events
-- by hand in the Command Center. The rest are DISABLED templates: fill in the
-- config, add any API key as a Worker secret, flip enabled = 1 in the admin.
--
-- NO events are seeded. Nothing is invented — events only ever come from a feed
-- the owner connects or from manual admin entry.

INSERT OR IGNORE INTO event_sources (id, name, kind, enabled, trust, config, sync_every_min, created_at, updated_at)
VALUES
  ('evsrc_manual', 'Manual (Command Center)', 'manual', 1, 'official', '{}', 1440,
   unixepoch(), unixepoch()),

  ('evsrc_ics_template', 'Council calendar (.ics) — TEMPLATE', 'ics', 0, 'trusted',
   '{"url":"https://REPLACE-WITH-COUNCIL-CALENDAR.ics","city":"","kind":"community"}',
   360, unixepoch(), unixepoch()),

  ('evsrc_rss_template', 'Venue events (RSS) — TEMPLATE', 'rss', 0, 'trusted',
   '{"url":"https://REPLACE-WITH-VENUE-FEED/rss","city":"","kind":"music"}',
   360, unixepoch(), unixepoch()),

  ('evsrc_sports_template', 'Sports fixtures API — TEMPLATE', 'sports_api', 0, 'official',
   '{"provider":"","endpoint":"","apiKeySecret":"SPORTS_API_KEY","competitions":[],"region":"BE"}',
   180, unixepoch(), unixepoch()),

  ('evsrc_tickets_template', 'Ticketing / events platform — TEMPLATE', 'ticket_feed', 0, 'trusted',
   '{"provider":"","endpoint":"","apiKeySecret":"TICKET_API_KEY","market":"BE"}',
   360, unixepoch(), unixepoch()),

  ('evsrc_citycal_template', 'City open-data events API — TEMPLATE', 'city_calendar', 0, 'official',
   '{"endpoint":"","format":"json","city":""}',
   360, unixepoch(), unixepoch());
