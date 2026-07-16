CREATE TABLE media_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE media ADD COLUMN category_id TEXT;

CREATE INDEX media_category_idx ON media(category_id, created_at DESC);
