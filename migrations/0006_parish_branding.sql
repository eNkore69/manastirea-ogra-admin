-- Update only the former proper brand names. Generic references to monastic life
-- remain unchanged because they describe the content rather than the organization.

UPDATE settings
SET value = REPLACE(REPLACE(REPLACE(REPLACE(
  value,
  'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'
), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'),
  'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'),
  'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  updated_at = CURRENT_TIMESTAMP
WHERE value LIKE '%Mănăstirea%Ogra%' OR value LIKE '%Mănăstirii%Ogra%';

UPDATE pages
SET
  title = REPLACE(REPLACE(REPLACE(REPLACE(title, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  eyebrow = REPLACE(REPLACE(REPLACE(REPLACE(eyebrow, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  intro = REPLACE(REPLACE(REPLACE(REPLACE(intro, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  body_json = REPLACE(REPLACE(REPLACE(REPLACE(body_json, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  seo_title = REPLACE(REPLACE(REPLACE(REPLACE(seo_title, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  seo_description = REPLACE(REPLACE(REPLACE(REPLACE(seo_description, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  updated_at = CURRENT_TIMESTAMP;

UPDATE posts
SET
  title = REPLACE(REPLACE(REPLACE(REPLACE(title, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  excerpt = REPLACE(REPLACE(REPLACE(REPLACE(excerpt, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  body_json = REPLACE(REPLACE(REPLACE(REPLACE(body_json, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  updated_at = CURRENT_TIMESTAMP;

UPDATE gallery_albums
SET
  title = REPLACE(REPLACE(REPLACE(REPLACE(title, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  excerpt = REPLACE(REPLACE(REPLACE(REPLACE(excerpt, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  body_json = REPLACE(REPLACE(REPLACE(REPLACE(body_json, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  updated_at = CURRENT_TIMESTAMP;

UPDATE church_calendar_entries
SET
  title = REPLACE(REPLACE(REPLACE(REPLACE(title, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  excerpt = REPLACE(REPLACE(REPLACE(REPLACE(excerpt, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  body_json = REPLACE(REPLACE(REPLACE(REPLACE(body_json, 'Mănăstirea Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Sfinții Arhangheli Mihail și Gavril Ogra', 'Parohiei Ortodoxe Ogra'), 'Mănăstirea Ogra', 'Parohia Ortodoxă Ogra'), 'Mănăstirii Ogra', 'Parohiei Ortodoxe Ogra'),
  updated_at = CURRENT_TIMESTAMP;
