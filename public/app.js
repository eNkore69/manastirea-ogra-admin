import { ro as L } from "./lang.js";
import { createAboutEditor } from "./about-editor.js";

document.title = L.title;
const app = document.querySelector("#app");
const state = {
  auth: sessionStorage.getItem("adminAuth") || "",
  content: null,
  section: "dashboard",
};

const sections = ["dashboard", "pages", "media", "posts", "events", "services", "galleries", "settings"];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const toBase64 = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const MAX_MEDIA_EDGE = 2560;
const WEBP_QUALITY = 0.86;
let activeAboutEditor = null;
let aboutImageUploadActive = false;

function destroyAboutEditor() {
  activeAboutEditor?.destroy();
  activeAboutEditor = null;
  aboutImageUploadActive = false;
}

async function convertImageToWebp(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_MEDIA_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    if (!blob || blob.type !== "image/webp") throw new Error("webp_conversion_failed");
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "imagine";
    return new File([blob], baseName + ".webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.auth) headers.set("Authorization", "Basic " + state.auth);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "request_failed");
  return response.status === 204 ? null : response.json();
}

function notify(message) {
  const node = document.createElement("div");
  node.className = "notice";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}

function logout() {
  destroyAboutEditor();
  state.auth = "";
  state.content = null;
  sessionStorage.removeItem("adminAuth");
  renderLogin();
}

function renderLogin(message = "") {
  app.innerHTML = '<main class="login-screen"><form class="login-card" id="login-form"><h1>' + esc(L.loginTitle) + '</h1><p>' + esc(L.loginIntro) + '</p><div class="field"><label for="user">' + esc(L.username) + '</label><input id="user" name="user" autocomplete="username" required></div><div class="field"><label for="pass">' + esc(L.password) + '</label><input id="pass" name="pass" type="password" autocomplete="current-password" required></div>' + (message ? '<p class="error">' + esc(message) + "</p>" : "") + '<button class="button button-primary" type="submit">' + esc(L.login) + "</button></form></main>";
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.auth = toBase64(String(data.get("user")) + ":" + String(data.get("pass")));
    try {
      state.content = await api("/api/admin/content");
      sessionStorage.setItem("adminAuth", state.auth);
      renderShell();
    } catch (caught) {
      state.auth = "";
      renderLogin(caught instanceof Error && caught.message === "unauthorized" ? L.invalidLogin : L.loginServerError);
    }
  });
}

function renderShell() {
  app.innerHTML = '<div class="app-shell"><aside class="sidebar"><strong>' + esc(L.brand) + '</strong><small>' + esc(L.admin) + '</small><nav class="nav">' + sections.map((section) => '<button type="button" data-section="' + section + '">' + esc(L[section]) + '</button>').join("") + '</nav><button class="button button-secondary logout" type="button" id="logout">' + esc(L.logout) + '</button></aside><div class="main"><header class="topbar"><h1 id="section-title"></h1></header><main class="content" id="content"></main></div></div>';
  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => {
    state.section = button.dataset.section;
    renderSection();
  }));
  renderSection();
}

function renderSection() {
  destroyAboutEditor();
  document.querySelectorAll("[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === state.section));
  document.querySelector("#section-title").textContent = L[state.section];
  if (state.section === "dashboard") renderDashboard();
  else if (state.section === "settings") renderSettings();
  else if (state.section === "pages") renderPages();
  else if (state.section === "media") renderMedia();
  else renderCollection(state.section);
}

function renderDashboard() {
  const stats = [
    ["pages", Object.keys(state.content.pages || {}).length],
    ["media", (state.content.media || []).length],
    ["posts", (state.content.posts || []).length],
    ["events", (state.content.events || []).length],
    ["services", (state.content.services || []).length],
    ["galleries", (state.content.galleries || []).length],
  ];
  document.querySelector("#content").innerHTML =
    '<section class="welcome-panel"><p class="section-kicker">' + esc(L.brand) + '</p><h2>' + esc(L.dashboard) + '</h2><p>' + esc(L.dashboardIntro) + '</p></section>' +
    '<section><div class="section-heading"><h2>' + esc(L.quickStats) + '</h2></div><div class="stats-grid">' +
    stats.map(([key, count]) => '<button type="button" class="stat-card" data-go="' + key + '"><span>' + esc(L[key]) + '</span><strong>' + count + '</strong></button>').join("") +
    "</div></section>";
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
    state.section = button.dataset.go;
    renderSection();
  }));
}

function field(name, label, value = "", type = "text", className = "") {
  const tag = type === "textarea"
    ? '<textarea id="' + name + '" name="' + name + '">' + esc(value) + "</textarea>"
    : '<input id="' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value) + '">';
  return '<div class="field ' + className + '"><label for="' + name + '">' + esc(label) + "</label>" + tag + "</div>";
}

function mediaOptions(selected = "") {
  return '<option value="">' + esc(L.chooseImage) + "</option>" + (state.content.media || []).map((item) => '<option value="' + esc(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" + esc(item.alt_text || item.file_name) + "</option>").join("");
}

function heroPreview(mediaId) {
  const media = (state.content.media || []).find((item) => item.id === mediaId);
  return '<div class="hero-preview" id="hero-preview"><span>' + esc(L.heroPreview) + '</span>' +
    (media ? '<img src="' + esc(media.url) + '" alt="' + esc(media.alt_text || media.file_name) + '">' : '<p>' + esc(L.chooseImage) + "</p>") +
    "</div>";
}

async function setPageHero(slug, mediaId) {
  const page = state.content.pages[slug];
  await api("/api/admin/pages/" + encodeURIComponent(slug), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: page.title,
      eyebrow: page.eyebrow,
      intro: page.intro,
      body: page.body || [],
      heroMediaId: mediaId,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
    }),
  });
  state.content = await api("/api/admin/content");
}

function renderSettings() {
  const data = state.content.settings || {};
  const keys = ["address", "phone", "email", "office_hours", "facebook_url", "instagram_url", "maps_url", "map_query"];
  document.querySelector("#content").innerHTML = '<form class="panel" id="settings-form"><div class="form-grid">' + keys.map((key) => field(key, L[key], data[key] || "", key === "email" ? "email" : "text")).join("") + '</div><div class="actions"><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form>";
  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    state.content.settings = payload;
    notify(L.saved);
  });
}

function renderPages() {
  destroyAboutEditor();
  const pages = state.content.pages || {};
  const slugs = Object.keys(pages);
  const selectedSlug = document.querySelector("#page-select")?.value || slugs[0] || "home";
  document.querySelector("#content").innerHTML = '<div class="panel"><div class="toolbar"><select id="page-select">' + slugs.map((slug) => '<option value="' + esc(slug) + '"' + (slug === selectedSlug ? " selected" : "") + ">" + esc(pages[slug].title) + "</option>").join("") + '</select></div><div id="page-editor"></div></div>';
  const select = document.querySelector("#page-select");
  select.addEventListener("change", () => renderPageEditor(select.value));
  renderPageEditor(selectedSlug);
}

function richTextNode(text, marks = []) {
  return text ? { type: "text", text: String(text), ...(marks.length ? { marks } : {}) } : null;
}

function legacyAboutDocument(blocks) {
  const stored = blocks.find((block) =>
    block &&
    block.type === "richText" &&
    block.doc &&
    block.doc.type === "doc" &&
    Array.isArray(block.doc.content)
  );
  if (stored) return stored.doc;

  const content = [];
  blocks.forEach((block) => {
    if (!block || typeof block !== "object") return;
    if (block.eyebrow) {
      content.push({
        type: "paragraph",
        content: [richTextNode(block.eyebrow, [
          { type: "bold" },
          { type: "textStyle", attrs: { fontSize: "14px" } },
        ])].filter(Boolean),
      });
    }
    if (block.title) {
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [richTextNode(block.title)].filter(Boolean),
      });
    }
    String(block.text || "")
      .split(/\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        content.push({
          type: "paragraph",
          content: [richTextNode(paragraph)].filter(Boolean),
        });
      });
  });

  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

function normalizeAboutDocument(document) {
  const mediaUrls = new Set((state.content.media || []).map((item) => String(item.url || "")));
  const alignments = new Set(["left", "center", "right", "full"]);
  const widths = new Set(["35", "50", "70", "100"]);
  const fontSizes = new Set(["14px", "16px", "20px", "26px"]);

  function normalizeNode(node) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return null;
    if (node.type === "image") {
      const src = String(node.attrs?.src || "");
      if (!mediaUrls.has(src)) return null;
      const align = alignments.has(String(node.attrs?.align)) ? String(node.attrs.align) : "center";
      const width = widths.has(String(node.attrs?.width)) ? String(node.attrs.width) : "70";
      const alt = String(node.attrs?.alt || "").trim().slice(0, 300);
      return {
        type: "image",
        attrs: { src, alt, title: alt || null, align, width },
      };
    }
    if (node.type === "text") {
      const marks = (Array.isArray(node.marks) ? node.marks : []).map((mark) => {
        if (mark?.type === "bold" || mark?.type === "italic" || mark?.type === "code") return { type: mark.type };
        if (mark?.type === "textStyle" && fontSizes.has(String(mark.attrs?.fontSize))) {
          return { type: "textStyle", attrs: { fontSize: String(mark.attrs.fontSize) } };
        }
        return null;
      }).filter(Boolean);
      return {
        type: "text",
        text: String(node.text || ""),
        ...(marks.length ? { marks } : {}),
      };
    }
    const content = (Array.isArray(node.content) ? node.content : []).map(normalizeNode).filter(Boolean);
    const normalized = { type: node.type };
    if (node.type === "heading") normalized.attrs = { level: node.attrs?.level === 3 ? 3 : 2 };
    if (content.length) normalized.content = content;
    return normalized;
  }

  const normalized = normalizeNode(document);
  return normalized?.type === "doc" ? normalized : { type: "doc", content: [{ type: "paragraph" }] };
}

function aboutEditorMarkup(page) {
  return '<form id="page-form" class="about-page-form"><div class="form-grid">' +
    field("title", L.titleField, page.title) +
    field("eyebrow", L.eyebrow, page.eyebrow) +
    field("intro", L.intro, page.intro, "textarea", "span-2") +
    '<div class="field span-2"><label for="heroMediaId">' + esc(L.heroImage) + '</label><select id="heroMediaId" name="heroMediaId">' + mediaOptions(page.heroMediaId) + "</select></div>" +
    heroPreview(page.heroMediaId) +
    field("seoTitle", L.seoTitle, page.seoTitle) +
    field("seoDescription", L.seoDescription, page.seoDescription, "textarea") +
    '</div><section class="about-editor-section" data-about-editor-root>' +
    '<div class="about-editor-heading"><div><p class="section-kicker">' + esc(L.fullPageEditor) + '</p><h3>' + esc(L.aboutEditorTitle) + '</h3><p>' + esc(L.aboutEditorIntro) + '</p></div><span class="editor-status" data-editor-upload-status>' + esc(L.inlineImageReady) + '</span></div>' +
    '<div class="editor-shell"><div class="editor-toolbar" role="toolbar" aria-label="' + esc(L.editorToolbar) + '">' +
    '<select class="toolbar-select" data-editor-block-style aria-label="' + esc(L.paragraphStyle) + '">' +
    '<option value="paragraph">' + esc(L.paragraph) + '</option><option value="heading-2">' + esc(L.heading2) + '</option><option value="heading-3">' + esc(L.heading3) + '</option></select>' +
    '<select class="toolbar-select" data-editor-text-size aria-label="' + esc(L.textSize) + '">' +
    '<option value="">' + esc(L.normalSize) + '</option><option value="14px">' + esc(L.smallSize) + '</option><option value="16px">' + esc(L.normalSize) + '</option><option value="20px">' + esc(L.largeSize) + '</option><option value="26px">' + esc(L.featuredSize) + '</option></select>' +
    '<span class="toolbar-divider" aria-hidden="true"></span>' +
    '<button type="button" class="editor-button" data-editor-command="bold" title="' + esc(L.bold) + '" aria-label="' + esc(L.bold) + '"><strong>B</strong></button>' +
    '<button type="button" class="editor-button" data-editor-command="italic" title="' + esc(L.italic) + '" aria-label="' + esc(L.italic) + '"><em>I</em></button>' +
    '<button type="button" class="editor-button" data-editor-command="bulletList" title="' + esc(L.bulletList) + '" aria-label="' + esc(L.bulletList) + '"><span aria-hidden="true">&bull;&#8801;</span></button>' +
    '<button type="button" class="editor-button" data-editor-command="orderedList" title="' + esc(L.orderedList) + '" aria-label="' + esc(L.orderedList) + '"><span aria-hidden="true">1&#8801;</span></button>' +
    '<button type="button" class="editor-button" data-editor-command="blockquote" title="' + esc(L.blockquote) + '" aria-label="' + esc(L.blockquote) + '"><span aria-hidden="true">&ldquo;</span></button>' +
    '<button type="button" class="editor-button" data-editor-command="undo" title="' + esc(L.undo) + '" aria-label="' + esc(L.undo) + '"><span aria-hidden="true">&#8630;</span></button>' +
    '<button type="button" class="editor-button" data-editor-command="redo" title="' + esc(L.redo) + '" aria-label="' + esc(L.redo) + '"><span aria-hidden="true">&#8631;</span></button>' +
    '<span class="toolbar-divider" aria-hidden="true"></span>' +
    '<label class="toolbar-upload"><input data-inline-image-input type="file" accept="image/jpeg,image/png,image/webp,image/avif"><span>' + esc(L.insertImage) + '</span></label>' +
    '</div><div class="image-controls" data-image-controls hidden>' +
    '<div class="image-controls-head"><div><strong>' + esc(L.imageSelected) + '</strong><span>' + esc(L.imageControlsHint) + '</span></div><button class="image-remove-button" type="button" data-image-remove>' + esc(L.removeImage) + '</button></div>' +
    '<div class="image-control-grid"><section class="image-control-group"><span class="image-control-label">' + esc(L.imageFlow) + '</span>' +
    '<div class="segmented-control layout-control" aria-label="' + esc(L.imageFlow) + '">' +
    '<button type="button" data-image-align="left">' + esc(L.wrapLeft) + '</button><button type="button" data-image-align="center">' + esc(L.centerNoWrap) + '</button><button type="button" data-image-align="right">' + esc(L.wrapRight) + '</button><button type="button" data-image-align="full">' + esc(L.separateRow) + '</button></div></section>' +
    '<section class="image-control-group"><span class="image-control-label">' + esc(L.imageSize) + '</span><div class="segmented-control size-control" aria-label="' + esc(L.imageSize) + '">' +
    '<button type="button" data-image-width-option="35">' + esc(L.imageSmall) + '</button><button type="button" data-image-width-option="50">' + esc(L.imageMedium) + '</button><button type="button" data-image-width-option="70">' + esc(L.imageLarge) + '</button><button type="button" data-image-width-option="100">100%</button></div></section>' +
    '<label class="image-alt-control">' + esc(L.imageAlt) + '<input data-image-alt type="text" maxlength="300"></label></div></div>' +
    '<div class="rich-editor" data-about-editor></div></div></section>' +
    '<div class="sticky-actions"><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form>";
}

async function uploadInlineImage(file) {
  const webpFile = await convertImageToWebp(file);
  const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  const uploadData = new FormData();
  uploadData.set("file", webpFile);
  uploadData.set("altText", alt);
  const result = await api("/api/admin/media", { method: "POST", body: uploadData });
  state.content = await api("/api/admin/content");
  return { url: result.url, alt };
}

function renderAboutPageEditor(slug) {
  const page = state.content.pages[slug];
  const target = document.querySelector("#page-editor");
  const blocks = Array.isArray(page.body) ? page.body.filter((block) => block && typeof block === "object") : [];
  target.innerHTML = aboutEditorMarkup(page);

  target.querySelector("#heroMediaId").addEventListener("change", (event) => {
    target.querySelector("#hero-preview").outerHTML = heroPreview(event.currentTarget.value);
  });

  const editorRoot = target.querySelector("[data-about-editor-root]");
  const uploadStatus = target.querySelector("[data-editor-upload-status]");
  const uploadInput = target.querySelector("[data-inline-image-input]");
  activeAboutEditor = createAboutEditor({
    root: editorRoot,
    element: target.querySelector("[data-about-editor]"),
    content: legacyAboutDocument(blocks),
    labels: { placeholder: L.editorPlaceholder },
    uploadImage: uploadInlineImage,
    onUploadState: (uploading) => {
      aboutImageUploadActive = uploading;
      uploadInput.disabled = uploading;
      uploadStatus.textContent = uploading ? L.inlineImageUploading : L.inlineImageReady;
      uploadStatus.classList.toggle("loading", uploading);
    },
    onError: () => notify(L.inlineImageError),
  });

  target.querySelector("#page-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (aboutImageUploadActive) {
      notify(L.inlineImageWait);
      return;
    }
    const saveButton = event.currentTarget.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      values.body = [{
        type: "richText",
        version: 1,
        doc: normalizeAboutDocument(activeAboutEditor.getJSON()),
      }];
      await api("/api/admin/pages/" + encodeURIComponent(slug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      state.content = await api("/api/admin/content");
      notify(L.saved);
      renderPages();
    } catch {
      notify(L.error);
      saveButton.disabled = false;
    }
  });
}

function contentBlockMarkup(block = {}) {
  return '<article class="content-block-editor" data-content-block>' +
    '<div class="block-editor-head"><strong>' + esc(L.contentSections) + '</strong><button class="icon-button danger" type="button" data-remove-block aria-label="' + esc(L.remove) + '">×</button></div>' +
    '<div class="form-grid">' +
    field("blockEyebrow", L.sectionEyebrow, block.eyebrow || "") +
    field("blockTitle", L.sectionTitle, block.title || "") +
    field("blockText", L.sectionText, block.text || "", "textarea", "span-2") +
    "</div></article>";
}

function collectContentBlocks(form) {
  return [...form.querySelectorAll("[data-content-block]")].map((block) => ({
    eyebrow: block.querySelector('[name="blockEyebrow"]').value.trim(),
    title: block.querySelector('[name="blockTitle"]').value.trim(),
    text: block.querySelector('[name="blockText"]').value.trim(),
  })).filter((block) => block.eyebrow || block.title || block.text);
}

function renderPageEditor(slug) {
  destroyAboutEditor();
  if (slug === "life") {
    renderAboutPageEditor(slug);
    return;
  }
  const page = state.content.pages[slug];
  const target = document.querySelector("#page-editor");
  const blocks = Array.isArray(page.body) ? page.body.filter((block) => block && typeof block === "object") : [];
  target.innerHTML = '<form id="page-form"><div class="form-grid">' +
    field("title", L.titleField, page.title) +
    field("eyebrow", L.eyebrow, page.eyebrow) +
    field("intro", L.intro, page.intro, "textarea", "span-2") +
    '<div class="field span-2"><label for="heroMediaId">' + esc(L.heroImage) + '</label><select id="heroMediaId" name="heroMediaId">' + mediaOptions(page.heroMediaId) + "</select></div>" +
    heroPreview(page.heroMediaId) +
    field("seoTitle", L.seoTitle, page.seoTitle) +
    field("seoDescription", L.seoDescription, page.seoDescription, "textarea") +
    '</div><section class="blocks-editor"><div class="section-heading"><h3>' + esc(L.contentSections) + '</h3><button class="button button-secondary" id="add-content-block" type="button">' + esc(L.addSection) + '</button></div><div id="content-block-list">' +
    blocks.map(contentBlockMarkup).join("") +
    '</div></section><div class="sticky-actions"><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form>";
  target.querySelector("#heroMediaId").addEventListener("change", (event) => {
    target.querySelector("#hero-preview").outerHTML = heroPreview(event.currentTarget.value);
  });
  target.querySelector("#add-content-block").addEventListener("click", () => {
    target.querySelector("#content-block-list").insertAdjacentHTML("beforeend", contentBlockMarkup());
  });
  target.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-block]");
    if (removeButton) removeButton.closest("[data-content-block]").remove();
  });
  target.querySelector("#page-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.body = collectContentBlocks(event.currentTarget);
    await api("/api/admin/pages/" + encodeURIComponent(slug), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    state.content = await api("/api/admin/content");
    notify(L.saved);
    renderPages();
  });
}

function renderMedia() {
  const items = state.content.media || [];
  document.querySelector("#content").innerHTML =
    '<section class="upload-panel"><div class="upload-copy"><p class="section-kicker">' + esc(L.media) + '</p><h2>' + esc(L.upload) + '</h2><p>' + esc(L.uploadHint) + '</p></div>' +
    '<form id="upload-form" class="upload-form"><label class="upload-dropzone" for="file"><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required><span class="upload-icon">+</span><strong>' + esc(L.file) + '</strong><small>' + esc(L.uploadHint) + '</small></label>' +
    '<div class="selected-file-preview" id="selected-file-preview"><span>' + esc(L.selectedPreview) + '</span><div class="preview-placeholder">' + esc(L.chooseImage) + '</div></div>' +
    field("altText", L.altText, "", "text", "upload-alt") +
    '<div class="actions upload-actions"><button class="button button-primary" type="submit">' + esc(L.upload) + '</button></div></form></section>' +
    '<section class="media-library"><div class="section-heading"><div><p class="section-kicker">' + esc(L.media) + '</p><h2>' + items.length + ' ' + esc(L.media).toLowerCase() + '</h2></div></div><div class="media-grid">' +
    (items.length ? items.map((item) =>
      '<article class="media-card"><div class="media-image-wrap"><img src="' + esc(item.url) + '" alt="' + esc(item.alt_text || item.file_name) + '" loading="lazy"></div>' +
      '<div class="media-info"><strong>' + esc(item.alt_text || item.file_name) + '</strong><small>' + esc(item.file_name) + '</small></div>' +
      '<div class="media-actions"><button class="button button-secondary" data-home-hero="' + esc(item.id) + '" type="button">' + esc(L.useAsHomeHero) + '</button><button class="icon-button danger" data-delete-media="' + esc(item.id) + '" type="button" aria-label="' + esc(L.remove) + '">&times;</button></div></article>'
    ).join("") : '<div class="empty-state">' + esc(L.noItems) + "</div>") +
    "</div></section>";
  const fileInput = document.querySelector("#file");
  const preview = document.querySelector("#selected-file-preview");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      preview.innerHTML = '<span>' + esc(L.selectedPreview) + '</span><div class="preview-placeholder">' + esc(L.chooseImage) + "</div>";
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    preview.innerHTML = '<span>' + esc(L.selectedPreview) + '</span><img src="' + esc(objectUrl) + '" alt="">';
    preview.querySelector("img").addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
  });
  document.querySelector("#upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const originalFile = fileInput.files?.[0];
    if (!originalFile) {
      notify(L.imageRequired);
      return;
    }
    button.disabled = true;
    button.textContent = L.optimizing;
    try {
      const webpFile = await convertImageToWebp(originalFile);
      const uploadData = new FormData();
      uploadData.set("file", webpFile);
      uploadData.set("altText", String(new FormData(event.currentTarget).get("altText") || ""));
      await api("/api/admin/media", { method: "POST", body: uploadData });
      state.content = await api("/api/admin/content");
      notify(L.uploadSuccess);
      renderMedia();
    } catch {
      notify(L.error);
      button.disabled = false;
      button.textContent = L.upload;
    }
  });
  document.querySelectorAll("[data-delete-media]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmRemove)) return;
    await api("/api/admin/media/" + encodeURIComponent(button.dataset.deleteMedia), { method: "DELETE" });
    state.content = await api("/api/admin/content");
    renderMedia();
  }));
  document.querySelectorAll("[data-home-hero]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await setPageHero("home", button.dataset.homeHero);
      notify(L.homeHeroSet);
    } catch {
      notify(L.error);
    } finally {
      button.disabled = false;
    }
  }));
}

const definitions = {
  posts: [
    ["slug", "slug", "text"], ["title", "titleField", "text"], ["excerpt", "excerpt", "textarea"],
    ["body", "body", "json"], ["imageMediaId", "image", "media"], ["publishedAt", "publishedAt", "datetime-local"], ["isPublished", "published", "checkbox"],
  ],
  events: [
    ["title", "titleField", "text"], ["excerpt", "excerpt", "textarea"], ["eventDate", "eventDate", "datetime-local"],
    ["imageMediaId", "image", "media"], ["isPublished", "published", "checkbox"],
  ],
  services: [
    ["dayLabel", "dayLabel", "text"], ["timeLabel", "timeLabel", "text"], ["serviceName", "serviceName", "text"],
    ["sortOrder", "sortOrder", "number"], ["isVisible", "visible", "checkbox"],
  ],
  galleries: [
    ["title", "galleryTitle", "text"], ["mediaId", "selectMedia", "media"], ["sortOrder", "sortOrder", "number"], ["isVisible", "visible", "checkbox"],
  ],
};

function itemValue(collection, item, key) {
  const maps = {
    posts: { imageMediaId: "image_media_id", publishedAt: "published_at", isPublished: "is_published" },
    events: { eventDate: "event_date", imageMediaId: "image_media_id", isPublished: "is_published" },
    services: { dayLabel: "day_label", timeLabel: "time_label", serviceName: "service_name", sortOrder: "sort_order", isVisible: "is_visible" },
    galleries: { mediaId: "media_id", sortOrder: "sort_order", isVisible: "is_visible" },
  };
  return item[maps[collection]?.[key] || key] ?? "";
}

function renderCollection(collection) {
  const items = state.content[collection] || [];
  document.querySelector("#content").innerHTML = '<div class="panel"><div class="toolbar"><span></span><button class="button button-primary" id="add-item" type="button">' + esc(L.add) + '</button></div><div class="list">' + (items.length ? items.map((item) => '<article class="list-row"><div><h3>' + esc(item.title || item.service_name || item.day_label) + '</h3><small>' + esc(item.excerpt || item.time_label || item.event_date || item.published_at || "") + '</small></div><div class="row-actions"><button class="button button-secondary" data-edit="' + esc(item.id) + '" type="button">' + esc(L.edit) + '</button><button class="button button-danger" data-delete="' + esc(item.id) + '" type="button">' + esc(L.remove) + "</button></div></article>").join("") : '<p>' + esc(L.noItems) + "</p>") + "</div></div>";
  document.querySelector("#add-item").addEventListener("click", () => openItemEditor(collection));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openItemEditor(collection, items.find((item) => item.id === button.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmRemove)) return;
    await api("/api/admin/" + collection + "/" + encodeURIComponent(button.dataset.delete), { method: "DELETE" });
    state.content = await api("/api/admin/content");
    renderCollection(collection);
  }));
}

function openItemEditor(collection, item = null) {
  const fields = definitions[collection];
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const fieldsHtml = fields.map(([key, labelKey, type]) => {
    let value = item ? itemValue(collection, item, key) : "";
    if (type === "json") value = JSON.stringify(value || [], null, 2);
    if (type === "media") return '<div class="field"><label for="' + key + '">' + esc(L[labelKey]) + '</label><select id="' + key + '" name="' + key + '">' + mediaOptions(value) + "</select></div>";
    if (type === "checkbox") return '<label class="checkbox"><input name="' + key + '" type="checkbox"' + (value ? " checked" : "") + ">" + esc(L[labelKey]) + "</label>";
    return field(key, L[labelKey], value, type === "json" || type === "textarea" ? "textarea" : type);
  }).join("");
  backdrop.innerHTML = '<div class="modal"><h2>' + esc(item ? L.edit : L.add) + '</h2><form id="item-form"><div class="form-grid">' + fieldsHtml + '</div><div class="actions"><button class="button button-secondary" data-cancel type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#item-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    fields.filter(([, , type]) => type === "checkbox").forEach(([key]) => { data[key] = form.elements[key].checked; });
    for (const [key, , type] of fields) {
      if (type === "json") {
        try { data[key] = JSON.parse(data[key] || "[]"); } catch { notify(L.error); return; }
      }
    }
    const path = "/api/admin/" + collection + (item ? "/" + encodeURIComponent(item.id) : "");
    await api(path, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    backdrop.remove();
    state.content = await api("/api/admin/content");
    notify(L.saved);
    renderCollection(collection);
  });
}

if (state.auth) {
  api("/api/admin/content").then((content) => {
    state.content = content;
    renderShell();
  }).catch(() => renderLogin());
} else {
  renderLogin();
}
