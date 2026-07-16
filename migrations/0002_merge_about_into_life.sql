DELETE FROM pages WHERE slug = 'life';

UPDATE pages
SET
  slug = 'life',
  title = 'Viața mănăstirii',
  seo_title = 'Viața mănăstirii',
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'about';
