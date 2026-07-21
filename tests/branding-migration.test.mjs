import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("parish branding migration updates persisted public metadata", async () => {
  const migration = await readFile(new URL("../migrations/0006_parish_branding.sql", import.meta.url), "utf8");

  assert.match(migration, /UPDATE settings/);
  assert.match(migration, /UPDATE pages/);
  assert.match(migration, /UPDATE posts/);
  assert.match(migration, /UPDATE gallery_albums/);
  assert.match(migration, /UPDATE church_calendar_entries/);
  assert.match(migration, /Parohia Ortodoxă Ogra/);
  assert.match(migration, /Parohiei Ortodoxe Ogra/);
});
