import { Hono } from "hono";
import { login, logout, requireAdmin, requireCsrf, requireSession, sessionInfo } from "./auth";
import {
  adminBodyLimit,
  authBodyLimit,
  contentSecurityPolicy,
  privateNoStore,
  publicCors,
  requestLogger,
  workerSecurityHeaders,
} from "./middleware";
import type { AppEnv } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MAX_JSON_BYTES = 1_000_000;
const MAX_STORED_JSON_CHARS = 750_000;
const MAX_IMAGE_BYTES = 15_000_000;
const IMAGE_TYPES = new Set(["image/webp"]);
const PAGE_SLUGS = new Set(["home", "life", "services", "news", "gallery", "contact"]);
const GALLERY_TYPES = new Set(["story", "photos"]);
const MAX_GALLERY_IMAGES = 100;

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...JSON_HEADERS, ...(init.headers || {}) } });
}

function error(status: number, code: string): Response {
  return json({ error: code }, { status });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || "0");
  if (length > MAX_JSON_BYTES) throw new Error("payload_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) throw new Error("payload_too_large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json");
  return body as Record<string, unknown>;
}

function cleanText(value: unknown, max = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanBoolean(value: unknown): number {
  return value === true || value === 1 ? 1 : 0;
}

function cleanInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function cleanMediaFileName(value: unknown, fallback = "imagine.webp"): string {
  const raw = cleanText(value, 240).split(/[\\/]/).pop() || fallback;
  const stem = raw
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 220) || "imagine";
  return stem + ".webp";
}

function cleanSlug(value: unknown, fallback = "continut"): string {
  const normalized = cleanText(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
  return normalized || fallback;
}

function cleanMonthDay(value: unknown): string {
  const raw = cleanText(value, 10);
  const match = raw.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if (!match) throw new Error("invalid_calendar_date");
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(2024, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("invalid_calendar_date");
  }
  return match[1] + "-" + match[2];
}

function currentMonthDay(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return month + "-" + day;
}

function formatMonthDay(value: unknown): string {
  const match = String(value || "").match(/^(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(2024, Number(match[1]) - 1, Number(match[2])));
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function parseGalleryImages(value: unknown): Array<{ mediaId: string; caption: string; sortOrder: number }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const images: Array<{ mediaId: string; caption: string; sortOrder: number }> = [];
  for (const item of value.slice(0, MAX_GALLERY_IMAGES)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const mediaId = cleanText(record.mediaId, 100);
    if (!mediaId || seen.has(mediaId)) continue;
    seen.add(mediaId);
    images.push({
      mediaId,
      caption: cleanText(record.caption, 300),
      sortOrder: images.length,
    });
  }
  return images;
}

function parseJsonArray(value: unknown): string {
  if (!Array.isArray(value)) return "[]";
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_STORED_JSON_CHARS) throw new Error("content_too_large");
  return serialized;
}

function parseStoredArray(value: unknown): unknown[] {
  try {
    const parsed: unknown = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDisplayDate(value: unknown): string {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function mediaUrl(env: Env, objectKey: string | null): string | null {
  if (!objectKey) return null;
  return env.PUBLIC_MEDIA_URL.replace(/\/$/, "") + "/" + objectKey.split("/").map(encodeURIComponent).join("/");
}

async function validateCategoryId(env: Env, value: unknown): Promise<string | null> {
  const id = cleanText(value, 100);
  if (!id) return null;
  const category = await env.DB.prepare("SELECT id FROM media_categories WHERE id = ?").bind(id).first();
  if (!category) throw new Error("category_not_found");
  return id;
}

function withoutImageNodes(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(withoutImageNodes)
      .filter((item) => item !== null);
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "image") return null;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, withoutImageNodes(child)]),
  );
}

function removeStoredImages(value: unknown): string {
  try {
    return JSON.stringify(withoutImageNodes(JSON.parse(String(value || "[]"))));
  } catch {
    return "[]";
  }
}

async function getContent(env: Env, includeDrafts = false): Promise<Record<string, unknown>> {
  const publishedFilter = includeDrafts ? "" : " WHERE is_published = 1";
  const galleryFilter = includeDrafts ? "" : " WHERE a.is_published = 1";
  const churchFilter = includeDrafts ? "" : " WHERE c.is_published = 1";
  const postsQuery = includeDrafts
    ? "SELECT p.*, m.object_key AS image_object_key, m.alt_text AS image_alt FROM posts p LEFT JOIN media m ON m.id = p.image_media_id" + publishedFilter + " ORDER BY published_at DESC"
    : "SELECT p.id, p.slug, p.title, p.excerpt, p.image_media_id, p.published_at, p.is_published, " +
      "m.object_key AS image_object_key, m.alt_text AS image_alt FROM posts p LEFT JOIN media m ON m.id = p.image_media_id" +
      publishedFilter + " ORDER BY published_at DESC";
  const galleriesQuery = includeDrafts
    ? "SELECT a.*, m.object_key AS cover_object_key, m.alt_text AS cover_alt " +
      "FROM gallery_albums a LEFT JOIN media m ON m.id = a.cover_media_id" +
      galleryFilter + " ORDER BY a.published_at DESC, a.created_at DESC"
    : "SELECT a.id, a.slug, a.title, a.excerpt, a.gallery_type, a.cover_media_id, a.published_at, a.is_published, " +
      "m.object_key AS cover_object_key, m.alt_text AS cover_alt, " +
      "(SELECT COUNT(*) FROM gallery_album_images gi WHERE gi.gallery_id = a.id) AS image_count " +
      "FROM gallery_albums a LEFT JOIN media m ON m.id = a.cover_media_id" +
      galleryFilter + " ORDER BY a.published_at DESC, a.created_at DESC";
  const galleryImagesQuery = includeDrafts
    ? "SELECT gi.id, gi.gallery_id, gi.media_id, gi.caption, gi.sort_order, " +
      "m.object_key, m.alt_text, m.file_name FROM gallery_album_images gi " +
      "JOIN gallery_albums a ON a.id = gi.gallery_id " +
      "JOIN media m ON m.id = gi.media_id ORDER BY gi.gallery_id, gi.sort_order, gi.created_at"
    : "SELECT id, gallery_id, media_id, caption, sort_order, '' AS object_key, '' AS alt_text, '' AS file_name " +
      "FROM gallery_album_images WHERE 1 = 0";
  const churchQuery = includeDrafts
    ? "SELECT c.*, m.object_key AS image_object_key, m.alt_text AS image_alt " +
      "FROM church_calendar_entries c LEFT JOIN media m ON m.id = c.image_media_id" +
      churchFilter + " ORDER BY c.month_day"
    : "SELECT c.id, c.month_day, c.title, c.excerpt, c.image_media_id, c.is_published, " +
      "m.object_key AS image_object_key, m.alt_text AS image_alt " +
      "FROM church_calendar_entries c LEFT JOIN media m ON m.id = c.image_media_id" +
      churchFilter + " ORDER BY c.month_day";
  const [
    settingsResult,
    pagesResult,
    postsResult,
    servicesResult,
    galleriesResult,
    galleryImagesResult,
    churchResult,
    mediaResult,
    categoriesResult,
  ] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM settings ORDER BY key"),
    env.DB.prepare("SELECT p.*, m.object_key AS hero_object_key FROM pages p LEFT JOIN media m ON m.id = p.hero_media_id ORDER BY p.slug"),
    env.DB.prepare(postsQuery),
    env.DB.prepare("SELECT * FROM services" + (includeDrafts ? "" : " WHERE is_visible = 1") + " ORDER BY sort_order, day_label"),
    env.DB.prepare(galleriesQuery),
    env.DB.prepare(galleryImagesQuery),
    env.DB.prepare(churchQuery),
    env.DB.prepare("SELECT m.*, c.name AS category_name FROM media m LEFT JOIN media_categories c ON c.id = m.category_id ORDER BY m.created_at DESC"),
    env.DB.prepare("SELECT id, name, created_at FROM media_categories ORDER BY name COLLATE NOCASE"),
  ]);

  const settings: Record<string, string> = {};
  for (const row of settingsResult.results as Array<{ key: string; value: string }>) settings[row.key] = row.value;

  const pages: Record<string, unknown> = {};
  for (const row of pagesResult.results as Array<Record<string, unknown>>) {
    const slug = String(row.slug);
    pages[slug] = {
      slug,
      title: row.title,
      eyebrow: row.eyebrow,
      intro: row.intro,
      body: parseStoredArray(row.body_json),
      heroMediaId: row.hero_media_id,
      heroImage: mediaUrl(env, row.hero_object_key ? String(row.hero_object_key) : null),
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
    };
  }

  const posts = (postsResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    body: parseStoredArray(row.body_json),
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: formatDisplayDate(row.published_at),
  }));
  const imagesByGallery = new Map<string, Array<Record<string, unknown>>>();
  for (const row of galleryImagesResult.results as Array<Record<string, unknown>>) {
    const galleryId = String(row.gallery_id);
    const images = imagesByGallery.get(galleryId) || [];
    images.push({
      id: row.id,
      media_id: row.media_id,
      caption: row.caption,
      sort_order: row.sort_order,
      alt_text: row.alt_text,
      file_name: row.file_name,
      url: mediaUrl(env, String(row.object_key)),
    });
    imagesByGallery.set(galleryId, images);
  }
  const galleries = (galleriesResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    body: parseStoredArray(row.body_json),
    cover_url: mediaUrl(env, row.cover_object_key ? String(row.cover_object_key) : null),
    display_date: formatDisplayDate(row.published_at),
    images: imagesByGallery.get(String(row.id)) || [],
  }));
  const churchCalendar = (churchResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    body: parseStoredArray(row.body_json),
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: formatMonthDay(row.month_day),
  }));
  const todayKey = currentMonthDay();
  const todayChurchEvent = churchCalendar.find((item) => String((item as Record<string, unknown>).month_day) === todayKey) || null;
  const media = (mediaResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    url: mediaUrl(env, String(row.object_key)),
  }));

  return {
    settings,
    pages,
    posts,
    events: [],
    services: servicesResult.results,
    galleries,
    churchCalendar,
    todayChurchEvent,
    media,
    mediaCategories: categoriesResult.results,
  };
}

async function getPublicPost(env: Env, slug: string): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(
    "SELECT p.*, m.object_key AS image_object_key, m.alt_text AS image_alt FROM posts p " +
    "LEFT JOIN media m ON m.id = p.image_media_id WHERE p.slug = ? AND p.is_published = 1",
  ).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    ...row,
    body: parseStoredArray(row.body_json),
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: formatDisplayDate(row.published_at),
  };
}

async function getPublicGallery(env: Env, slug: string): Promise<Record<string, unknown> | null> {
  const gallery = await env.DB.prepare(
    "SELECT a.*, m.object_key AS cover_object_key, m.alt_text AS cover_alt FROM gallery_albums a " +
    "LEFT JOIN media m ON m.id = a.cover_media_id WHERE a.slug = ? AND a.is_published = 1",
  ).bind(slug).first<Record<string, unknown>>();
  if (!gallery) return null;
  const imagesResult = await env.DB.prepare(
    "SELECT gi.id, gi.media_id, gi.caption, gi.sort_order, m.object_key, m.alt_text, m.file_name " +
    "FROM gallery_album_images gi JOIN media m ON m.id = gi.media_id " +
    "WHERE gi.gallery_id = ? ORDER BY gi.sort_order, gi.created_at",
  ).bind(String(gallery.id)).all<Record<string, unknown>>();
  return {
    ...gallery,
    body: parseStoredArray(gallery.body_json),
    cover_url: mediaUrl(env, gallery.cover_object_key ? String(gallery.cover_object_key) : null),
    display_date: formatDisplayDate(gallery.published_at),
    images: imagesResult.results.map((row) => ({
      id: row.id,
      media_id: row.media_id,
      caption: row.caption,
      sort_order: row.sort_order,
      alt_text: row.alt_text,
      file_name: row.file_name,
      url: mediaUrl(env, String(row.object_key)),
    })),
  };
}

async function getPublicChurchEntry(env: Env, monthDay: string): Promise<Record<string, unknown> | null> {
  const normalized = cleanMonthDay(monthDay);
  const row = await env.DB.prepare(
    "SELECT c.*, m.object_key AS image_object_key, m.alt_text AS image_alt " +
    "FROM church_calendar_entries c LEFT JOIN media m ON m.id = c.image_media_id " +
    "WHERE c.month_day = ? AND c.is_published = 1",
  ).bind(normalized).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    ...row,
    body: parseStoredArray(row.body_json),
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: formatMonthDay(row.month_day),
  };
}

async function updateSettings(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const allowed = ["address", "phone", "email", "office_hours", "facebook_url", "instagram_url", "maps_url", "map_query"];
  const statements = allowed
    .filter((key) => key in body)
    .map((key) => env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(key, cleanText(body[key], 2_000)));
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true });
}

async function updatePage(request: Request, env: Env, slug: string): Promise<Response> {
  if (!PAGE_SLUGS.has(slug)) return error(404, "page_not_found");
  const body = await readJson(request);
  await env.DB.prepare(
    "UPDATE pages SET title = ?, eyebrow = ?, intro = ?, body_json = ?, hero_media_id = ?, seo_title = ?, seo_description = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?"
  ).bind(
    cleanText(body.title, 200),
    cleanText(body.eyebrow, 120),
    cleanText(body.intro, 1_000),
    parseJsonArray(body.body),
    cleanText(body.heroMediaId, 100) || null,
    cleanText(body.seoTitle, 200),
    cleanText(body.seoDescription, 320),
    slug,
  ).run();
  return json({ ok: true });
}

async function createItem(request: Request, env: Env, collection: string): Promise<Response> {
  const body = await readJson(request);
  const id = crypto.randomUUID();
  if (collection === "posts") {
    const title = cleanText(body.title, 200);
    if (!title) return error(400, "title_required");
    const slug = cleanSlug(body.slug || title, "noutate");
    const existing = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (existing) return error(409, "slug_exists");
    await env.DB.prepare("INSERT INTO posts (id, slug, title, excerpt, body_json, image_media_id, published_at, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, slug, title, cleanText(body.excerpt, 500), parseJsonArray(body.body), cleanText(body.imageMediaId, 100) || null, cleanText(body.publishedAt, 40) || new Date().toISOString(), cleanBoolean(body.isPublished)).run();
  } else if (collection === "services") {
    await env.DB.prepare("INSERT INTO services (id, day_label, time_label, service_name, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, cleanText(body.dayLabel, 100), cleanText(body.timeLabel, 100), cleanText(body.serviceName, 200), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible)).run();
  } else {
    return error(404, "collection_not_found");
  }
  return json({ ok: true, id }, { status: 201 });
}

async function updateItem(request: Request, env: Env, collection: string, id: string): Promise<Response> {
  const body = await readJson(request);
  if (collection === "posts") {
    const title = cleanText(body.title, 200);
    if (!title) return error(400, "title_required");
    const slug = cleanSlug(body.slug || title, "noutate");
    const existing = await env.DB.prepare("SELECT id FROM posts WHERE slug = ? AND id <> ?").bind(slug, id).first();
    if (existing) return error(409, "slug_exists");
    await env.DB.prepare("UPDATE posts SET slug = ?, title = ?, excerpt = ?, body_json = ?, image_media_id = ?, published_at = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(slug, title, cleanText(body.excerpt, 500), parseJsonArray(body.body), cleanText(body.imageMediaId, 100) || null, cleanText(body.publishedAt, 40), cleanBoolean(body.isPublished), id).run();
  } else if (collection === "services") {
    await env.DB.prepare("UPDATE services SET day_label = ?, time_label = ?, service_name = ?, sort_order = ?, is_visible = ? WHERE id = ?")
      .bind(cleanText(body.dayLabel, 100), cleanText(body.timeLabel, 100), cleanText(body.serviceName, 200), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible), id).run();
  } else {
    return error(404, "collection_not_found");
  }
  return json({ ok: true });
}

async function deleteItem(env: Env, collection: string, id: string): Promise<Response> {
  const tables: Record<string, string> = { posts: "posts", services: "services" };
  const table = tables[collection];
  if (!table) return error(404, "collection_not_found");
  await env.DB.prepare("DELETE FROM " + table + " WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function validateMediaIds(env: Env, values: Array<string | null>): Promise<void> {
  const ids = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DB.prepare("SELECT id FROM media WHERE id IN (" + placeholders + ")").bind(...ids).all();
  if (result.results.length !== ids.length) throw new Error("media_not_found");
}

async function createGallery(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const title = cleanText(body.title, 200);
  if (!title) return error(400, "title_required");
  const slug = cleanSlug(body.slug || title, "galerie");
  const existing = await env.DB.prepare("SELECT id FROM gallery_albums WHERE slug = ?").bind(slug).first();
  if (existing) return error(409, "slug_exists");
  const galleryType = GALLERY_TYPES.has(String(body.galleryType)) ? String(body.galleryType) : "photos";
  const images = parseGalleryImages(body.images);
  if (galleryType === "photos" && !images.length) return error(400, "gallery_images_required");
  const coverMediaId = cleanText(body.coverMediaId, 100) || images[0]?.mediaId || null;
  await validateMediaIds(env, [coverMediaId, ...images.map((image) => image.mediaId)]);
  const statements = [
    env.DB.prepare(
      "INSERT INTO gallery_albums (id, slug, title, excerpt, gallery_type, body_json, cover_media_id, published_at, is_published) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      id,
      slug,
      title,
      cleanText(body.excerpt, 500),
      galleryType,
      galleryType === "story" ? parseJsonArray(body.body) : "[]",
      coverMediaId,
      cleanText(body.publishedAt, 40) || new Date().toISOString(),
      cleanBoolean(body.isPublished),
    ),
    ...images.map((image) => env.DB.prepare(
      "INSERT INTO gallery_album_images (id, gallery_id, media_id, caption, sort_order) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), id, image.mediaId, image.caption, image.sortOrder)),
  ];
  await env.DB.batch(statements);
  return json({ ok: true, id, slug }, { status: 201 });
}

async function updateGallery(request: Request, env: Env, id: string): Promise<Response> {
  const gallery = await env.DB.prepare("SELECT id FROM gallery_albums WHERE id = ?").bind(id).first();
  if (!gallery) return error(404, "gallery_not_found");
  const body = await readJson(request);
  const title = cleanText(body.title, 200);
  if (!title) return error(400, "title_required");
  const slug = cleanSlug(body.slug || title, "galerie");
  const existing = await env.DB.prepare("SELECT id FROM gallery_albums WHERE slug = ? AND id <> ?").bind(slug, id).first();
  if (existing) return error(409, "slug_exists");
  const galleryType = GALLERY_TYPES.has(String(body.galleryType)) ? String(body.galleryType) : "photos";
  const images = parseGalleryImages(body.images);
  if (galleryType === "photos" && !images.length) return error(400, "gallery_images_required");
  const coverMediaId = cleanText(body.coverMediaId, 100) || images[0]?.mediaId || null;
  await validateMediaIds(env, [coverMediaId, ...images.map((image) => image.mediaId)]);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE gallery_albums SET slug = ?, title = ?, excerpt = ?, gallery_type = ?, body_json = ?, " +
      "cover_media_id = ?, published_at = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(
      slug,
      title,
      cleanText(body.excerpt, 500),
      galleryType,
      galleryType === "story" ? parseJsonArray(body.body) : "[]",
      coverMediaId,
      cleanText(body.publishedAt, 40) || new Date().toISOString(),
      cleanBoolean(body.isPublished),
      id,
    ),
    env.DB.prepare("DELETE FROM gallery_album_images WHERE gallery_id = ?").bind(id),
    ...images.map((image) => env.DB.prepare(
      "INSERT INTO gallery_album_images (id, gallery_id, media_id, caption, sort_order) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), id, image.mediaId, image.caption, image.sortOrder)),
  ]);
  return json({ ok: true, slug });
}

async function deleteGallery(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM gallery_albums WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return error(404, "gallery_not_found");
  return json({ ok: true });
}

async function createChurchCalendarEntry(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const monthDay = cleanMonthDay(body.calendarDate || body.monthDay);
  const title = cleanText(body.title, 200);
  if (!title) return error(400, "title_required");
  const existing = await env.DB.prepare("SELECT id FROM church_calendar_entries WHERE month_day = ?").bind(monthDay).first();
  if (existing) return error(409, "calendar_date_exists");
  const imageMediaId = cleanText(body.imageMediaId, 100) || null;
  await validateMediaIds(env, [imageMediaId]);
  await env.DB.prepare(
    "INSERT INTO church_calendar_entries (id, month_day, title, excerpt, body_json, image_media_id, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    id,
    monthDay,
    title,
    cleanText(body.excerpt, 500),
    parseJsonArray(body.body),
    imageMediaId,
    cleanBoolean(body.isPublished),
  ).run();
  return json({ ok: true, id, monthDay }, { status: 201 });
}

async function updateChurchCalendarEntry(request: Request, env: Env, id: string): Promise<Response> {
  const entry = await env.DB.prepare("SELECT id FROM church_calendar_entries WHERE id = ?").bind(id).first();
  if (!entry) return error(404, "church_event_not_found");
  const body = await readJson(request);
  const monthDay = cleanMonthDay(body.calendarDate || body.monthDay);
  const title = cleanText(body.title, 200);
  if (!title) return error(400, "title_required");
  const existing = await env.DB.prepare(
    "SELECT id FROM church_calendar_entries WHERE month_day = ? AND id <> ?",
  ).bind(monthDay, id).first();
  if (existing) return error(409, "calendar_date_exists");
  const imageMediaId = cleanText(body.imageMediaId, 100) || null;
  await validateMediaIds(env, [imageMediaId]);
  await env.DB.prepare(
    "UPDATE church_calendar_entries SET month_day = ?, title = ?, excerpt = ?, body_json = ?, image_media_id = ?, " +
    "is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(
    monthDay,
    title,
    cleanText(body.excerpt, 500),
    parseJsonArray(body.body),
    imageMediaId,
    cleanBoolean(body.isPublished),
    id,
  ).run();
  return json({ ok: true, monthDay });
}

async function deleteChurchCalendarEntry(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM church_calendar_entries WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return error(404, "church_event_not_found");
  return json({ ok: true });
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_IMAGE_BYTES + 100_000) return error(413, "image_too_large");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "invalid_form_data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return error(400, "file_required");
  if (file.size > MAX_IMAGE_BYTES) return error(413, "image_too_large");
  if (!IMAGE_TYPES.has(file.type)) return error(415, "unsupported_image_type");
  const categoryId = await validateCategoryId(env, form.get("categoryId"));
  const objectKey = "images/" + new Date().getUTCFullYear() + "/" + crypto.randomUUID() + ".webp";
  await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO media (id, object_key, file_name, content_type, byte_size, alt_text, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, objectKey, cleanMediaFileName(file.name), "image/webp", file.size, cleanText(form.get("altText"), 300), categoryId).run();
  } catch (caught) {
    await env.MEDIA.delete(objectKey);
    throw caught;
  }
  return json({ ok: true, id, url: mediaUrl(env, objectKey) }, { status: 201 });
}

async function updateMedia(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  const categoryId = await validateCategoryId(env, body.categoryId);
  const result = await env.DB.prepare(
    "UPDATE media SET file_name = ?, alt_text = ?, category_id = ? WHERE id = ?",
  ).bind(
    cleanMediaFileName(body.fileName),
    cleanText(body.altText, 300),
    categoryId,
    id,
  ).run();
  if (!result.meta.changes) return error(404, "media_not_found");
  return json({ ok: true });
}

async function deleteMedia(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT object_key FROM media WHERE id = ?").bind(id).first<{ object_key: string }>();
  if (!row) return error(404, "media_not_found");
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
  await env.MEDIA.delete(row.object_key);
  return json({ ok: true });
}

async function deleteAllMedia(env: Env): Promise<Response> {
  const [mediaResult, pagesResult, postsResult, galleriesResult, churchResult] = await env.DB.batch([
    env.DB.prepare("SELECT object_key FROM media"),
    env.DB.prepare("SELECT slug, body_json FROM pages"),
    env.DB.prepare("SELECT id, body_json FROM posts"),
    env.DB.prepare("SELECT id, body_json FROM gallery_albums"),
    env.DB.prepare("SELECT id, body_json FROM church_calendar_entries"),
  ]);
  const statements: D1PreparedStatement[] = [];
  for (const row of pagesResult.results as Array<{ slug: string; body_json: string }>) {
    const cleaned = removeStoredImages(row.body_json);
    if (cleaned !== row.body_json) {
      statements.push(env.DB.prepare("UPDATE pages SET body_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?").bind(cleaned, row.slug));
    }
  }
  for (const row of postsResult.results as Array<{ id: string; body_json: string }>) {
    const cleaned = removeStoredImages(row.body_json);
    if (cleaned !== row.body_json) {
      statements.push(env.DB.prepare("UPDATE posts SET body_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(cleaned, row.id));
    }
  }
  for (const row of galleriesResult.results as Array<{ id: string; body_json: string }>) {
    const cleaned = removeStoredImages(row.body_json);
    if (cleaned !== row.body_json) {
      statements.push(env.DB.prepare("UPDATE gallery_albums SET body_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(cleaned, row.id));
    }
  }
  for (const row of churchResult.results as Array<{ id: string; body_json: string }>) {
    const cleaned = removeStoredImages(row.body_json);
    if (cleaned !== row.body_json) {
      statements.push(env.DB.prepare("UPDATE church_calendar_entries SET body_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(cleaned, row.id));
    }
  }
  statements.push(env.DB.prepare("DELETE FROM media"));
  await env.DB.batch(statements);
  const keys = (mediaResult.results as Array<{ object_key: string }>).map((row) => row.object_key);
  if (keys.length) await env.MEDIA.delete(keys);
  return json({ ok: true, deleted: keys.length });
}

async function createMediaCategory(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const name = cleanText(body.name, 80);
  if (!name) return error(400, "category_name_required");
  const existing = await env.DB.prepare("SELECT id FROM media_categories WHERE name = ? COLLATE NOCASE").bind(name).first();
  if (existing) return error(409, "category_exists");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO media_categories (id, name) VALUES (?, ?)").bind(id, name).run();
  return json({ ok: true, id }, { status: 201 });
}

async function updateMediaCategory(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  const name = cleanText(body.name, 80);
  if (!name) return error(400, "category_name_required");
  const existing = await env.DB.prepare("SELECT id FROM media_categories WHERE name = ? COLLATE NOCASE AND id <> ?").bind(name, id).first();
  if (existing) return error(409, "category_exists");
  const result = await env.DB.prepare("UPDATE media_categories SET name = ? WHERE id = ?").bind(name, id).run();
  if (!result.meta.changes) return error(404, "category_not_found");
  return json({ ok: true });
}

async function deleteMediaCategory(env: Env, id: string): Promise<Response> {
  const category = await env.DB.prepare("SELECT id FROM media_categories WHERE id = ?").bind(id).first();
  if (!category) return error(404, "category_not_found");
  await env.DB.batch([
    env.DB.prepare("UPDATE media SET category_id = NULL WHERE category_id = ?").bind(id),
    env.DB.prepare("DELETE FROM media_categories WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!object) return error(404, "media_not_found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!("body" in object)) return new Response(null, { headers, status: 304 });
  return new Response(object.body, { headers, status: 200 });
}

const app = new Hono<AppEnv>();

app.use("*", requestLogger);
app.use("*", workerSecurityHeaders);
app.use("*", contentSecurityPolicy);
app.use("/api/public/*", publicCors);
app.use("/api/auth/*", privateNoStore);
app.use("/api/admin/*", privateNoStore);

app.use("/api/auth/login", authBodyLimit);
app.post("/api/auth/login", login);
app.use("/api/auth/session", requireSession);
app.get("/api/auth/session", sessionInfo);
app.use("/api/auth/logout", requireSession);
app.use("/api/auth/logout", requireCsrf);
app.post("/api/auth/logout", logout);

app.get("/api/public/content", async (c) => {
  return json(await getContent(c.env), { headers: { "Cache-Control": "no-store, max-age=0" } });
});

app.get("/api/public/posts/:slug", async (c) => {
  const item = await getPublicPost(c.env, c.req.param("slug"));
  return item
    ? json({ item }, { headers: { "Cache-Control": "no-store, max-age=0" } })
    : error(404, "content_not_found");
});

app.get("/api/public/galleries/:slug", async (c) => {
  const item = await getPublicGallery(c.env, c.req.param("slug"));
  return item
    ? json({ item }, { headers: { "Cache-Control": "no-store, max-age=0" } })
    : error(404, "content_not_found");
});

app.get("/api/public/church-calendar/:monthDay", async (c) => {
  const item = await getPublicChurchEntry(c.env, c.req.param("monthDay"));
  return item
    ? json({ item }, { headers: { "Cache-Control": "no-store, max-age=0" } })
    : error(404, "content_not_found");
});

app.get("/media/*", (c) => {
  const key = c.req.path
    .slice("/media/".length)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  return serveMedia(c.req.raw, c.env, key);
});

app.use("/api/admin/*", requireSession);
app.use("/api/admin/*", requireAdmin);
app.use("/api/admin/*", requireCsrf);
app.use("/api/admin/*", adminBodyLimit);

app.get("/api/admin/content", async (c) => json(await getContent(c.env, true)));
app.put("/api/admin/settings", (c) => updateSettings(c.req.raw, c.env));
app.put("/api/admin/pages/:slug", (c) => updatePage(c.req.raw, c.env, c.req.param("slug")));
app.post("/api/admin/media", (c) => uploadMedia(c.req.raw, c.env));
app.delete("/api/admin/media", (c) => deleteAllMedia(c.env));
app.put("/api/admin/media/:id", (c) => updateMedia(c.req.raw, c.env, c.req.param("id")));
app.delete("/api/admin/media/:id", (c) => deleteMedia(c.env, c.req.param("id")));
app.post("/api/admin/media-categories", (c) => createMediaCategory(c.req.raw, c.env));
app.put("/api/admin/media-categories/:id", (c) => updateMediaCategory(c.req.raw, c.env, c.req.param("id")));
app.delete("/api/admin/media-categories/:id", (c) => deleteMediaCategory(c.env, c.req.param("id")));
app.post("/api/admin/galleries", (c) => createGallery(c.req.raw, c.env));
app.put("/api/admin/galleries/:id", (c) => updateGallery(c.req.raw, c.env, c.req.param("id")));
app.delete("/api/admin/galleries/:id", (c) => deleteGallery(c.env, c.req.param("id")));
app.post("/api/admin/church-calendar", (c) => createChurchCalendarEntry(c.req.raw, c.env));
app.put("/api/admin/church-calendar/:id", (c) => updateChurchCalendarEntry(c.req.raw, c.env, c.req.param("id")));
app.delete("/api/admin/church-calendar/:id", (c) => deleteChurchCalendarEntry(c.env, c.req.param("id")));
app.post("/api/admin/:collection", (c) => createItem(c.req.raw, c.env, c.req.param("collection")));
app.put("/api/admin/:collection/:id", (c) => updateItem(c.req.raw, c.env, c.req.param("collection"), c.req.param("id")));
app.delete("/api/admin/:collection/:id", (c) => deleteItem(c.env, c.req.param("collection"), c.req.param("id")));

app.all("/api/admin/*", (c) => c.json({ error: "admin_route_not_found" }, 404));
app.all("/api/*", (c) => c.json({ error: "api_route_not_found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((caught, c) => {
  const message = caught instanceof Error ? caught.message : "unknown_error";
  console.error(JSON.stringify({
    message: "request_failed",
    requestId: c.get("requestId"),
    error: message,
    path: c.req.path,
  }));
  if (message === "payload_too_large" || message === "content_too_large") {
    return c.json({ error: message }, 413);
  }
  if (["invalid_json", "category_not_found", "invalid_calendar_date", "media_not_found"].includes(message)) {
    return c.json({ error: message }, 400);
  }
  return c.json({ error: "internal_error" }, 500);
});

export default app;
