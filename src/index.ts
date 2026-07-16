const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 15_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const PAGE_SLUGS = new Set(["home", "about", "life", "services", "news", "gallery", "contact"]);

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...JSON_HEADERS, ...(init.headers || {}) } });
}

function error(status: number, code: string): Response {
  return json({ error: code }, { status });
}

function addCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.SITE_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Basic ")) return false;
  try {
    const encodedBytes = Uint8Array.from(
      atob(authorization.slice(6)),
      (character) => character.charCodeAt(0),
    );
    const decoded = new TextDecoder().decode(encodedBytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const [userValid, passwordValid] = await Promise.all([
      sameSecret(user, env.USER_KEY),
      sameSecret(password, env.PASS_KEY),
    ]);
    return userValid && passwordValid;
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || "0");
  if (length > MAX_JSON_BYTES) throw new Error("payload_too_large");
  const body: unknown = await request.json();
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

function parseJsonArray(value: unknown): string {
  if (!Array.isArray(value)) return "[]";
  return JSON.stringify(value).slice(0, 100_000);
}

function mediaUrl(env: Env, objectKey: string | null): string | null {
  if (!objectKey) return null;
  return env.PUBLIC_MEDIA_URL.replace(/\/$/, "") + "/" + objectKey.split("/").map(encodeURIComponent).join("/");
}

async function getContent(env: Env, includeDrafts = false): Promise<Record<string, unknown>> {
  const publishedFilter = includeDrafts ? "" : " WHERE is_published = 1";
  const [settingsResult, pagesResult, postsResult, eventsResult, servicesResult, galleriesResult, mediaResult] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM settings ORDER BY key"),
    env.DB.prepare("SELECT p.*, m.object_key AS hero_object_key FROM pages p LEFT JOIN media m ON m.id = p.hero_media_id ORDER BY p.slug"),
    env.DB.prepare("SELECT p.*, m.object_key AS image_object_key, m.alt_text AS image_alt FROM posts p LEFT JOIN media m ON m.id = p.image_media_id" + publishedFilter + " ORDER BY published_at DESC"),
    env.DB.prepare("SELECT e.*, m.object_key AS image_object_key, m.alt_text AS image_alt FROM events e LEFT JOIN media m ON m.id = e.image_media_id" + publishedFilter + " ORDER BY event_date DESC"),
    env.DB.prepare("SELECT * FROM services" + (includeDrafts ? "" : " WHERE is_visible = 1") + " ORDER BY sort_order, day_label"),
    env.DB.prepare("SELECT g.*, m.object_key, m.alt_text FROM gallery_items g JOIN media m ON m.id = g.media_id" + (includeDrafts ? "" : " WHERE g.is_visible = 1") + " ORDER BY g.sort_order, g.created_at DESC"),
    env.DB.prepare("SELECT * FROM media ORDER BY created_at DESC"),
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
      body: JSON.parse(String(row.body_json || "[]")),
      heroMediaId: row.hero_media_id,
      heroImage: mediaUrl(env, row.hero_object_key ? String(row.hero_object_key) : null),
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
    };
  }

  const posts = (postsResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    body: JSON.parse(String(row.body_json || "[]")),
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(row.published_at))),
  }));
  const events = (eventsResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    image_url: mediaUrl(env, row.image_object_key ? String(row.image_object_key) : null),
    display_date: new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(row.event_date))),
  }));
  const galleries = (galleriesResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    image_url: mediaUrl(env, String(row.object_key)),
  }));
  const media = (mediaResult.results as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    url: mediaUrl(env, String(row.object_key)),
  }));

  return { settings, pages, posts, events, services: servicesResult.results, galleries, media };
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
    await env.DB.prepare("INSERT INTO posts (id, slug, title, excerpt, body_json, image_media_id, published_at, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, cleanText(body.slug, 160), cleanText(body.title, 200), cleanText(body.excerpt, 500), parseJsonArray(body.body), cleanText(body.imageMediaId, 100) || null, cleanText(body.publishedAt, 40) || new Date().toISOString(), cleanBoolean(body.isPublished)).run();
  } else if (collection === "events") {
    await env.DB.prepare("INSERT INTO events (id, title, excerpt, event_date, image_media_id, is_published) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, cleanText(body.title, 200), cleanText(body.excerpt, 500), cleanText(body.eventDate, 40), cleanText(body.imageMediaId, 100) || null, cleanBoolean(body.isPublished)).run();
  } else if (collection === "services") {
    await env.DB.prepare("INSERT INTO services (id, day_label, time_label, service_name, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, cleanText(body.dayLabel, 100), cleanText(body.timeLabel, 100), cleanText(body.serviceName, 200), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible)).run();
  } else if (collection === "galleries") {
    await env.DB.prepare("INSERT INTO gallery_items (id, title, media_id, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)")
      .bind(id, cleanText(body.title, 200), cleanText(body.mediaId, 100), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible)).run();
  } else {
    return error(404, "collection_not_found");
  }
  return json({ ok: true, id }, { status: 201 });
}

async function updateItem(request: Request, env: Env, collection: string, id: string): Promise<Response> {
  const body = await readJson(request);
  if (collection === "posts") {
    await env.DB.prepare("UPDATE posts SET slug = ?, title = ?, excerpt = ?, body_json = ?, image_media_id = ?, published_at = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(cleanText(body.slug, 160), cleanText(body.title, 200), cleanText(body.excerpt, 500), parseJsonArray(body.body), cleanText(body.imageMediaId, 100) || null, cleanText(body.publishedAt, 40), cleanBoolean(body.isPublished), id).run();
  } else if (collection === "events") {
    await env.DB.prepare("UPDATE events SET title = ?, excerpt = ?, event_date = ?, image_media_id = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(cleanText(body.title, 200), cleanText(body.excerpt, 500), cleanText(body.eventDate, 40), cleanText(body.imageMediaId, 100) || null, cleanBoolean(body.isPublished), id).run();
  } else if (collection === "services") {
    await env.DB.prepare("UPDATE services SET day_label = ?, time_label = ?, service_name = ?, sort_order = ?, is_visible = ? WHERE id = ?")
      .bind(cleanText(body.dayLabel, 100), cleanText(body.timeLabel, 100), cleanText(body.serviceName, 200), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible), id).run();
  } else if (collection === "galleries") {
    await env.DB.prepare("UPDATE gallery_items SET title = ?, media_id = ?, sort_order = ?, is_visible = ? WHERE id = ?")
      .bind(cleanText(body.title, 200), cleanText(body.mediaId, 100), cleanInteger(body.sortOrder), cleanBoolean(body.isVisible), id).run();
  } else {
    return error(404, "collection_not_found");
  }
  return json({ ok: true });
}

async function deleteItem(env: Env, collection: string, id: string): Promise<Response> {
  const tables: Record<string, string> = { posts: "posts", events: "events", services: "services", galleries: "gallery_items" };
  const table = tables[collection];
  if (!table) return error(404, "collection_not_found");
  await env.DB.prepare("DELETE FROM " + table + " WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_IMAGE_BYTES + 100_000) return error(413, "image_too_large");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error(400, "file_required");
  if (file.size > MAX_IMAGE_BYTES) return error(413, "image_too_large");
  if (!IMAGE_TYPES.has(file.type)) return error(415, "unsupported_image_type");
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const objectKey = "images/" + new Date().getUTCFullYear() + "/" + crypto.randomUUID() + (extension ? "." + extension : "");
  await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO media (id, object_key, file_name, content_type, byte_size, alt_text) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, objectKey, file.name.slice(0, 240), file.type, file.size, cleanText(form.get("altText"), 300)).run();
  return json({ ok: true, id, url: mediaUrl(env, objectKey) }, { status: 201 });
}

async function deleteMedia(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT object_key FROM media WHERE id = ?").bind(id).first<{ object_key: string }>();
  if (!row) return error(404, "media_not_found");
  await env.MEDIA.delete(row.object_key);
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
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

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/public/")) {
    return addCors(new Response(null, { status: 204 }), request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/public/content") {
    return addCors(json(await getContent(env), { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }), request, env);
  }
  if (request.method === "GET" && segments[0] === "media") {
    return serveMedia(request, env, segments.slice(1).map(decodeURIComponent).join("/"));
  }
  if (url.pathname.startsWith("/api/admin/")) {
    if (!(await isAuthorized(request, env))) {
      return json({ error: "unauthorized" }, { status: 401 });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/content") return json(await getContent(env, true));
    if (request.method === "PUT" && url.pathname === "/api/admin/settings") return updateSettings(request, env);
    if (request.method === "PUT" && segments[2] === "pages" && segments[3]) return updatePage(request, env, segments[3]);
    if (request.method === "POST" && url.pathname === "/api/admin/media") return uploadMedia(request, env);
    if (request.method === "DELETE" && segments[2] === "media" && segments[3]) return deleteMedia(env, segments[3]);
    if (request.method === "POST" && segments[2] && segments.length === 3) return createItem(request, env, segments[2]);
    if (request.method === "PUT" && segments[2] && segments[3]) return updateItem(request, env, segments[2], segments[3]);
    if (request.method === "DELETE" && segments[2] && segments[3]) return deleteItem(env, segments[2], segments[3]);
    return error(404, "admin_route_not_found");
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown_error";
      console.error(JSON.stringify({ message: "request_failed", error: message, path: new URL(request.url).pathname }));
      if (message === "payload_too_large") return error(413, message);
      if (message === "invalid_json") return error(400, message);
      return error(500, "internal_error");
    }
  },
} satisfies ExportedHandler<Env>;
import { timingSafeEqual } from "node:crypto";
