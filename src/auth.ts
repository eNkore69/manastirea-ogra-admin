import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { timingSafeEqual } from "node:crypto";
import type { AppEnv } from "./types";

const SESSION_COOKIE = "ogra_admin_session";
const CSRF_COOKIE = "ogra_admin_csrf";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_BLOCK_SECONDS = 15 * 60;
const MAX_LOGIN_FAILURES = 5;
const MAX_LOGIN_BODY_BYTES = 10_000;

type SessionRow = {
  token_hash: string;
  csrf_hash: string;
  role: string;
  expires_at: number;
};

type RateLimitRow = {
  window_started_at: number;
  failed_attempts: number;
  blocked_until: number;
};

function token(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

export async function hashToken(value: string): Promise<string> {
  return hex(await digest(value));
}

export async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([digest(provided), digest(expected)]);
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

async function matchesHash(provided: string, expectedHash: string): Promise<boolean> {
  const expected = fromHex(expectedHash);
  if (!expected) return false;
  const providedHash = new Uint8Array(await digest(provided));
  return timingSafeEqual(providedHash, expected);
}

function isHttps(c: Context<AppEnv>): boolean {
  const hostname = new URL(c.req.url).hostname;
  return !["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function cookieOptions(c: Context<AppEnv>) {
  return {
    path: "/",
    secure: isHttps(c),
    sameSite: "Strict" as const,
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(Date.now() + SESSION_TTL_SECONDS * 1_000),
  };
}

function setSessionCookies(c: Context<AppEnv>, sessionToken: string, csrfToken: string): void {
  const options = cookieOptions(c);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    ...options,
    httpOnly: true,
    priority: "High",
  });
  setCookie(c, CSRF_COOKIE, csrfToken, {
    ...options,
    httpOnly: false,
    priority: "High",
  });
}

export function clearSessionCookies(c: Context<AppEnv>): void {
  const options = { path: "/", secure: isHttps(c) };
  deleteCookie(c, SESSION_COOKIE, options);
  deleteCookie(c, CSRF_COOKIE, options);
}

function clientAddress(c: Context<AppEnv>): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "local-development"
  );
}

async function clientKey(c: Context<AppEnv>): Promise<string> {
  return hashToken("admin-login:" + clientAddress(c));
}

async function readLoginBody(c: Context<AppEnv>): Promise<{ user: string; password: string } | null> {
  const contentLength = Number(c.req.header("Content-Length") || "0");
  if (contentLength > MAX_LOGIN_BODY_BYTES) return null;
  try {
    const body: unknown = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    if (typeof record.user !== "string" || typeof record.password !== "string") return null;
    if (!record.user || !record.password || record.user.length > 320 || record.password.length > 1_024) return null;
    return { user: record.user, password: record.password };
  } catch {
    return null;
  }
}

function validRequestOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("Origin");
  const fetchSite = c.req.header("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  return !origin || origin === new URL(c.req.url).origin;
}

async function rateLimitState(c: Context<AppEnv>, now: number): Promise<{ key: string; row: RateLimitRow | null }> {
  const key = await clientKey(c);
  const row = await c.env.DB.prepare(
    "SELECT window_started_at, failed_attempts, blocked_until FROM auth_rate_limits WHERE client_key = ?",
  ).bind(key).first<RateLimitRow>();
  if (!row) return { key, row: null };
  if (row.window_started_at <= now - LOGIN_WINDOW_SECONDS && row.blocked_until <= now) {
    await c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE client_key = ?").bind(key).run();
    return { key, row: null };
  }
  return { key, row };
}

async function recordLoginFailure(env: Env, key: string, previous: RateLimitRow | null, now: number): Promise<number> {
  const reset = !previous || previous.window_started_at <= now - LOGIN_WINDOW_SECONDS || previous.blocked_until > 0 && previous.blocked_until <= now;
  const attempts = reset ? 1 : previous.failed_attempts + 1;
  const windowStartedAt = reset ? now : previous.window_started_at;
  const blockedUntil = attempts >= MAX_LOGIN_FAILURES ? now + LOGIN_BLOCK_SECONDS : 0;
  await env.DB.prepare(
    "INSERT INTO auth_rate_limits (client_key, window_started_at, failed_attempts, blocked_until, updated_at) " +
      "VALUES (?, ?, ?, ?, ?) ON CONFLICT(client_key) DO UPDATE SET " +
      "window_started_at = excluded.window_started_at, failed_attempts = excluded.failed_attempts, " +
      "blocked_until = excluded.blocked_until, updated_at = excluded.updated_at",
  ).bind(key, windowStartedAt, attempts, blockedUntil, now).run();
  return blockedUntil;
}

async function createSession(c: Context<AppEnv>, now: number) {
  const sessionToken = token();
  const csrfToken = token();
  const expiresAt = now + SESSION_TTL_SECONDS;
  const [sessionHash, csrfHash] = await Promise.all([hashToken(sessionToken), hashToken(csrfToken)]);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    c.env.DB.prepare(
      "INSERT INTO admin_sessions (token_hash, csrf_hash, role, expires_at, created_at, last_seen_at) VALUES (?, ?, 'admin', ?, ?, ?)",
    ).bind(sessionHash, csrfHash, expiresAt, now, now),
  ]);
  setSessionCookies(c, sessionToken, csrfToken);
  return { csrfToken, expiresAt };
}

export async function login(c: Context<AppEnv>): Promise<Response> {
  if (!validRequestOrigin(c)) return c.json({ error: "invalid_origin" }, 403);
  const now = Math.floor(Date.now() / 1_000);
  await c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE updated_at <= ?").bind(now - 86_400).run();
  const { key, row } = await rateLimitState(c, now);
  if (row && row.blocked_until > now) {
    c.header("Retry-After", String(row.blocked_until - now));
    return c.json({ error: "too_many_login_attempts" }, 429);
  }
  const body = await readLoginBody(c);
  if (!body) return c.json({ error: "invalid_json" }, 400);
  const [userValid, passwordValid] = await Promise.all([
    sameSecret(body.user, c.env.USER_KEY),
    sameSecret(body.password, c.env.PASS_KEY),
  ]);
  if (!userValid || !passwordValid) {
    const blockedUntil = await recordLoginFailure(c.env, key, row, now);
    if (blockedUntil > now) c.header("Retry-After", String(blockedUntil - now));
    return c.json({ error: "unauthorized" }, 401);
  }
  await c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE client_key = ?").bind(key).run();
  const session = await createSession(c, now);
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    role: "admin",
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
  });
}

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rawToken = getCookie(c, SESSION_COOKIE);
  if (!rawToken) return c.json({ error: "unauthorized" }, 401);
  const tokenHash = await hashToken(rawToken);
  const row = await c.env.DB.prepare(
    "SELECT token_hash, csrf_hash, role, expires_at FROM admin_sessions WHERE token_hash = ?",
  ).bind(tokenHash).first<SessionRow>();
  const now = Math.floor(Date.now() / 1_000);
  if (!row || row.expires_at <= now || row.role !== "admin") {
    if (row) await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    clearSessionCookies(c);
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("session", {
    tokenHash: row.token_hash,
    csrfHash: row.csrf_hash,
    role: "admin",
    expiresAt: row.expires_at,
  });
  c.header("Cache-Control", "no-store");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("session").role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
};

export const requireCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await next();
    return;
  }
  if (!validRequestOrigin(c)) return c.json({ error: "invalid_csrf" }, 403);
  const headerToken = c.req.header("X-CSRF-Token") || "";
  const cookieToken = getCookie(c, CSRF_COOKIE) || "";
  const session = c.get("session");
  const [headerMatchesCookie, headerMatchesSession] = await Promise.all([
    sameSecret(headerToken, cookieToken),
    matchesHash(headerToken, session.csrfHash),
  ]);
  if (!headerToken || !cookieToken || !headerMatchesCookie || !headerMatchesSession) {
    return c.json({ error: "invalid_csrf" }, 403);
  }
  await next();
};

export async function sessionInfo(c: Context<AppEnv>): Promise<Response> {
  const csrfToken = getCookie(c, CSRF_COOKIE) || "";
  const session = c.get("session");
  if (!csrfToken || !(await matchesHash(csrfToken, session.csrfHash))) {
    clearSessionCookies(c);
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json({
    ok: true,
    role: session.role,
    csrfToken,
    expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
  });
}

export async function logout(c: Context<AppEnv>): Promise<Response> {
  const sessionToken = getCookie(c, SESSION_COOKIE);
  if (sessionToken) {
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
      .bind(await hashToken(sessionToken))
      .run();
  }
  clearSessionCookies(c);
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true });
}
