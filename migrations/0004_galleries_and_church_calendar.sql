CREATE TABLE gallery_albums (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  gallery_type TEXT NOT NULL DEFAULT 'photos' CHECK (gallery_type IN ('story', 'photos')),
  body_json TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  published_at TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE TABLE gallery_album_images (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gallery_id) REFERENCES gallery_albums(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  UNIQUE (gallery_id, media_id)
);

CREATE TABLE church_calendar_entries (
  id TEXT PRIMARY KEY,
  month_day TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '[]',
  image_media_id TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE INDEX gallery_albums_public_idx
  ON gallery_albums(is_published, published_at DESC);

CREATE INDEX gallery_album_images_sort_idx
  ON gallery_album_images(gallery_id, sort_order, created_at);

CREATE INDEX church_calendar_public_idx
  ON church_calendar_entries(is_published, month_day);

INSERT OR IGNORE INTO posts (
  id,
  slug,
  title,
  excerpt,
  body_json,
  image_media_id,
  published_at,
  is_published,
  created_at,
  updated_at
)
SELECT
  id,
  'eveniment-' || lower(replace(id, '-', '')),
  title,
  excerpt,
  '[]',
  image_media_id,
  event_date,
  is_published,
  created_at,
  updated_at
FROM events;
