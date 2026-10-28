-- Public reference data for planning replies: place articles, descriptions, photographs and coordinates.
-- It holds no tenant data, so it is shared by every organisation. Misses are cached briefly so a place that
-- has no article is not searched again on every planning turn; transient provider failures are never stored.
CREATE TABLE place_media (
  place_key TEXT PRIMARY KEY,
  place_name TEXT NOT NULL,
  found INTEGER NOT NULL CHECK (found IN (0, 1)),
  article_title TEXT,
  article_url TEXT,
  extract TEXT,
  image_url TEXT,
  latitude REAL,
  longitude REAL,
  fetched_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_place_media_fetched ON place_media(fetched_at);
