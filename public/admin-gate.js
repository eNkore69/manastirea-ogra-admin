import { getAdminAccessDecision } from "./admin-device-policy.js";
import { ro as L } from "./lang.js";

const root = document.documentElement;
const app = document.querySelector("#app");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

let currentDecision = getAdminAccessDecision();
let resizeFrame = 0;

function finishGate(className) {
  root.classList.remove("admin-gate-pending", "admin-gate-ready", "admin-mobile-blocked");
  root.classList.add(className);
}

async function applyChurchBackground() {
  try {
    const response = await fetch("/api/public/content", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const content = await response.json();
    const image = content?.pages?.home?.heroImage;
    if (typeof image !== "string" || !image) return;
    const url = new URL(image, window.location.origin);
    if (!["https:", "http:"].includes(url.protocol)) return;
    root.style.setProperty("--admin-mobile-background-image", `url(${JSON.stringify(url.href)})`);
  } catch {
    // The warning remains fully usable with its gradient fallback if the public image is unavailable.
  }
}

function renderMobileNotice() {
  document.title = `${L.mobileUnavailableTitle} — ${L.brand}`;
  app.innerHTML = `
    <main class="mobile-admin-block" aria-labelledby="mobile-admin-title">
      <article class="mobile-admin-card">
        <div class="mobile-admin-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <rect x="8" y="10" width="48" height="34" rx="5"></rect>
            <path d="M24 54h16M32 44v10"></path>
            <path d="M16 36h32"></path>
          </svg>
        </div>
        <p class="mobile-admin-kicker">${escapeHtml(L.brand)}</p>
        <h1 id="mobile-admin-title">${escapeHtml(L.mobileUnavailableTitle)}</h1>
        <p>${escapeHtml(L.mobileUnavailableText)}</p>
        <p>${escapeHtml(L.mobileUnavailableThanks)}</p>
      </article>
    </main>`;
  finishGate("admin-mobile-blocked");
  void applyChurchBackground();
}

async function renderAdmin() {
  finishGate("admin-gate-ready");
  await import("./app.js");
}

function handleViewportChange() {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    const nextDecision = getAdminAccessDecision();
    if (nextDecision.blocked !== currentDecision.blocked) {
      window.location.reload();
      return;
    }
    currentDecision = nextDecision;
  });
}

window.addEventListener("resize", handleViewportChange, { passive: true });
window.addEventListener("orientationchange", handleViewportChange, { passive: true });

if (currentDecision.blocked) renderMobileNotice();
else void renderAdmin();
