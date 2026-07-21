import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./types";

const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_REQUEST_BYTES = 15_100_000;
const MAX_LOGIN_REQUEST_BYTES = 10_000;

const jsonBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => c.json({ error: "payload_too_large" }, 413),
});

const imageBodyLimit = bodyLimit({
  maxSize: MAX_IMAGE_REQUEST_BYTES,
  onError: (c) => c.json({ error: "image_too_large" }, 413),
});

export const authBodyLimit = bodyLimit({
  maxSize: MAX_LOGIN_REQUEST_BYTES,
  onError: (c) => c.json({ error: "payload_too_large" }, 413),
});

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header("CF-Ray") || crypto.randomUUID();
  const startedAt = Date.now();
  c.set("requestId", requestId);
  try {
    await next();
  } finally {
    c.header("X-Request-Id", requestId);
    console.log(JSON.stringify({
      message: "request_completed",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    }));
  }
};

export const workerSecurityHeaders = secureHeaders({
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=15552000; includeSubDomains",
  xFrameOptions: "DENY",
});

export const contentSecurityPolicy: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  let mediaOrigin = "";
  try {
    mediaOrigin = new URL(c.env.PUBLIC_MEDIA_URL).origin;
  } catch {
    mediaOrigin = "";
  }
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:" + (mediaOrigin ? " " + mediaOrigin : ""),
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  c.header("X-Permitted-Cross-Domain-Policies", "none");
  c.header("X-Robots-Tag", "noindex, nofollow");
};

export const privateNoStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};

export const publicCors: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header("Origin");
  const applyAllowedOrigin = () => {
    if (!origin || origin !== c.env.SITE_ORIGIN) return;
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Vary", "Origin", { append: true });
  };
  if (c.req.method === "OPTIONS") {
    applyAllowedOrigin();
    return c.body(null, 204);
  }
  await next();
  applyAllowedOrigin();
};

export const adminBodyLimit: MiddlewareHandler<AppEnv> = (c, next) => {
  if (c.req.method === "POST" && c.req.path === "/api/admin/media") {
    return imageBodyLimit(c, next);
  }
  return jsonBodyLimit(c, next);
};
