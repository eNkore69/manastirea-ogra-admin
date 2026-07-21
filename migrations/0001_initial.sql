PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  eyebrow TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '[]',
  hero_media_id TEXT,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hero_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '[]',
  image_media_id TEXT,
  published_at TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  image_media_id TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  day_label TEXT NOT NULL,
  time_label TEXT NOT NULL,
  service_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))
);

CREATE TABLE gallery_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX posts_published_idx ON posts(is_published, published_at DESC);
CREATE INDEX events_published_idx ON events(is_published, event_date DESC);
CREATE INDEX services_sort_idx ON services(is_visible, sort_order);
CREATE INDEX gallery_sort_idx ON gallery_items(is_visible, sort_order);

INSERT INTO settings (key, value) VALUES
  ('address', ''),
  ('phone', ''),
  ('email', ''),
  ('office_hours', ''),
  ('facebook_url', ''),
  ('instagram_url', ''),
  ('maps_url', 'https://maps.app.goo.gl/pnL8XuAqr5kvZyqYA'),
  ('map_query', 'Parohia Ortodoxă Ogra');

INSERT INTO pages (slug, title, eyebrow, intro, body_json, seo_title, seo_description) VALUES
  ('home', 'Bine ați venit la casa lui Dumnezeu', 'Parohia Ortodoxă Ogra', 'Credință, rugăciune și comuniune în lumina Sfinților Arhangheli.', '[{"eyebrow":"Cuvânt de învățătură","title":"Credința ne unește, dragostea ne întărește","text":"Să avem iubire unii către alții, căci iubirea este din Dumnezeu.","quote":"1 Ioan 4:7"}]', 'Parohia Ortodoxă Ogra', 'Site-ul oficial al Parohiei Ortodoxe Ogra.'),
  ('about', 'Despre noi', 'Parohia noastră', '', '[]', 'Despre parohie', 'Istoria, comunitatea și misiunea Parohiei Ortodoxe Ogra.'),
  ('life', 'Viața mănăstirii', 'Credință și comuniune', '', '[]', 'Viața mănăstirii', 'Activități, proiecte și viața duhovnicească a Parohiei Ortodoxe Ogra.'),
  ('services', 'Slujbe', 'Program liturgic', '', '[]', 'Programul slujbelor', 'Programul actualizat al slujbelor la Parohia Ortodoxă Ogra.'),
  ('news', 'Știri și evenimente', 'Actualități', '', '[]', 'Știri și evenimente', 'Noutăți și evenimente de la Parohia Ortodoxă Ogra.'),
  ('gallery', 'Galerie', 'Momente și mărturii', '', '[]', 'Galerie foto', 'Imagini din viața liturgică și comunitară a Parohiei Ortodoxe Ogra.'),
  ('contact', 'Contact', 'Vă așteptăm cu drag', '', '[]', 'Contact', 'Date de contact și localizarea Parohiei Ortodoxe Ogra.');
