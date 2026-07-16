import { ro as L } from "./lang.js";
import { createAboutEditor } from "./about-editor.js";

document.title = L.title;
const app = document.querySelector("#app");
const state = {
  auth: sessionStorage.getItem("adminAuth") || "",
  content: null,
  section: "dashboard",
  mediaCategoryFilter: "all",
  eventTab: "news",
};

const sections = ["dashboard", "pages", "media", "events", "services", "galleries", "settings"];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const toBase64 = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const MAX_MEDIA_EDGE = 2560;
const WEBP_QUALITY = 0.86;
let activeAboutEditor = null;

function destroyAboutEditor() {
  activeAboutEditor?.destroy();
  activeAboutEditor = null;
}

async function convertImageToWebp(file) {
  if (!file.type.startsWith("image/")) throw new Error("unsupported_image_type");
  if (file.size > 50_000_000) throw new Error("source_image_too_large");
  let source;
  let width;
  let height;
  let cleanup = () => {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await image.decode();
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
      cleanup = () => URL.revokeObjectURL(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error("image_decode_failed");
    }
  }
  try {
    if (!width || !height) throw new Error("image_decode_failed");
    const scale = Math.min(1, MAX_MEDIA_EDGE / Math.max(width, height));
    const outputWidth = Math.max(1, Math.round(width * scale));
    const outputHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, outputWidth, outputHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    if (!blob || blob.type !== "image/webp") throw new Error("webp_conversion_failed");
    if (blob.size > 15_000_000) throw new Error("image_too_large");
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "imagine";
    return new File([blob], baseName + ".webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    cleanup();
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

function mediaErrorMessage(caught) {
  const code = caught instanceof Error ? caught.message : "request_failed";
  const messages = {
    file_required: L.imageRequired,
    unsupported_image_type: L.unsupportedImage,
    source_image_too_large: L.sourceImageTooLarge,
    image_too_large: L.optimizedImageTooLarge,
    image_decode_failed: L.imageDecodeFailed,
    canvas_unavailable: L.imageConversionFailed,
    webp_conversion_failed: L.imageConversionFailed,
    category_name_required: L.categoryNameRequired,
    category_exists: L.categoryExists,
    category_not_found: L.categoryNotFound,
    media_not_found: L.mediaNotFound,
    title_required: L.titleRequired,
    slug_exists: L.slugExists,
    invalid_calendar_date: L.invalidCalendarDate,
    calendar_date_exists: L.calendarDateExists,
    gallery_images_required: L.galleryImagesRequired,
    gallery_not_found: L.galleryNotFound,
    church_event_not_found: L.churchEventNotFound,
    internal_error: L.serverMediaError,
    request_failed: L.serverMediaError,
  };
  return messages[code] || L.error + " [" + code + "]";
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
  else if (state.section === "events") renderEventsHub();
  else if (state.section === "galleries") renderGalleries();
  else renderCollection(state.section);
}

function renderDashboard() {
  const stats = [
    ["pages", Object.keys(state.content.pages || {}).length],
    ["media", (state.content.media || []).length],
    ["events", (state.content.posts || []).length + (state.content.churchCalendar || []).length],
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

function richEditorMarkup({ kicker, title, intro, toolbarLabel }) {
  return '<section class="about-editor-section" data-about-editor-root>' +
    '<div class="about-editor-heading"><div><p class="section-kicker">' + esc(kicker) + '</p><h3>' + esc(title) + '</h3><p>' + esc(intro) + '</p></div><span class="editor-status" data-editor-upload-status>' + esc(L.inlineImageReady) + '</span></div>' +
    '<div class="editor-shell"><div class="editor-toolbar" role="toolbar" aria-label="' + esc(toolbarLabel) + '">' +
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
    '<div class="rich-editor" data-about-editor aria-label="' + esc(toolbarLabel) + '"></div></div></section>';
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
    "</div>" +
    richEditorMarkup({
      kicker: L.fullPageEditor,
      title: L.aboutEditorTitle,
      intro: L.aboutEditorIntro,
      toolbarLabel: L.editorToolbar,
    }) +
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

function mountActiveRichEditor(root, blocks, placeholder) {
  const uploadStatus = root.querySelector("[data-editor-upload-status]");
  const uploadInput = root.querySelector("[data-inline-image-input]");
  let uploading = false;
  const editor = createAboutEditor({
    root,
    element: root.querySelector("[data-about-editor]"),
    content: legacyAboutDocument(Array.isArray(blocks) ? blocks : []),
    labels: { placeholder },
    uploadImage: uploadInlineImage,
    onUploadState: (nextUploading) => {
      uploading = nextUploading;
      uploadInput.disabled = nextUploading;
      uploadStatus.textContent = nextUploading ? L.inlineImageUploading : L.inlineImageReady;
      uploadStatus.classList.toggle("loading", nextUploading);
    },
    onError: (caught) => notify(mediaErrorMessage(caught)),
  });
  activeAboutEditor = editor;
  return {
    getJSON: () => editor.getJSON(),
    isUploading: () => uploading,
  };
}

function renderAboutPageEditor(slug) {
  const page = state.content.pages[slug];
  const target = document.querySelector("#page-editor");
  const blocks = Array.isArray(page.body) ? page.body.filter((block) => block && typeof block === "object") : [];
  target.innerHTML = aboutEditorMarkup(page);

  target.querySelector("#heroMediaId").addEventListener("change", (event) => {
    target.querySelector("#hero-preview").outerHTML = heroPreview(event.currentTarget.value);
  });

  const editorController = mountActiveRichEditor(
    target.querySelector("[data-about-editor-root]"),
    blocks,
    L.editorPlaceholder,
  );

  target.querySelector("#page-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editorController.isUploading()) {
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
        doc: normalizeAboutDocument(editorController.getJSON()),
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

function categoryOptions(selected = "", includeAll = false) {
  const categories = state.content.mediaCategories || [];
  const first = includeAll
    ? '<option value="all">' + esc(L.allCategories) + '</option><option value="uncategorized">' + esc(L.uncategorized) + "</option>"
    : '<option value="">' + esc(L.uncategorized) + "</option>";
  return first + categories.map((category) =>
    '<option value="' + esc(category.id) + '"' + (category.id === selected ? " selected" : "") + ">" + esc(category.name) + "</option>"
  ).join("");
}

function renderMedia() {
  const items = state.content.media || [];
  const categories = state.content.mediaCategories || [];
  if (state.mediaCategoryFilter !== "all" &&
      state.mediaCategoryFilter !== "uncategorized" &&
      !categories.some((category) => category.id === state.mediaCategoryFilter)) {
    state.mediaCategoryFilter = "all";
  }
  const visibleItems = items.filter((item) => {
    if (state.mediaCategoryFilter === "all") return true;
    if (state.mediaCategoryFilter === "uncategorized") return !item.category_id;
    return item.category_id === state.mediaCategoryFilter;
  });
  document.querySelector("#content").innerHTML =
    '<section class="media-category-panel"><div class="category-copy"><p class="section-kicker">' + esc(L.organization) + '</p><h2>' + esc(L.imageCategories) + '</h2><p>' + esc(L.categoryHint) + '</p></div>' +
    '<form id="category-form" class="category-create-form">' + field("categoryName", L.newCategory, "", "text") + '<button class="button button-primary" type="submit">' + esc(L.createCategory) + '</button></form>' +
    '<div class="category-list">' + (categories.length ? categories.map((category) =>
      '<div class="category-chip"><span>' + esc(category.name) + '</span><div><button class="category-action" data-edit-category="' + esc(category.id) + '" type="button">' + esc(L.rename) + '</button><button class="category-action danger-text" data-delete-category="' + esc(category.id) + '" type="button">' + esc(L.remove) + "</button></div></div>"
    ).join("") : '<p class="category-empty">' + esc(L.noCategories) + "</p>") + "</div></section>" +
    '<section class="upload-panel"><div class="upload-copy"><p class="section-kicker">' + esc(L.media) + '</p><h2>' + esc(L.upload) + '</h2><p>' + esc(L.uploadHint) + '</p></div>' +
    '<form id="upload-form" class="upload-form"><label class="upload-dropzone" for="file"><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required><span class="upload-icon">+</span><strong>' + esc(L.file) + '</strong><small>' + esc(L.uploadHint) + '</small></label>' +
    '<div class="selected-file-preview" id="selected-file-preview"><span>' + esc(L.selectedPreview) + '</span><div class="preview-placeholder">' + esc(L.chooseImage) + '</div></div>' +
    field("altText", L.altText, "", "text", "upload-alt") +
    '<div class="field upload-category"><label for="categoryId">' + esc(L.category) + '</label><select id="categoryId" name="categoryId">' + categoryOptions() + "</select></div>" +
    '<div class="actions upload-actions"><button class="button button-primary" type="submit">' + esc(L.upload) + '</button></div></form></section>' +
    '<section class="media-library"><div class="section-heading media-library-heading"><div><p class="section-kicker">' + esc(L.mediaLibrary) + '</p><h2>' + visibleItems.length + ' / ' + items.length + ' ' + esc(L.imagesCount) + '</h2></div>' +
    '<div class="media-library-tools"><label>' + esc(L.filterCategory) + '<select id="media-category-filter">' + categoryOptions(state.mediaCategoryFilter, true) + '</select></label>' +
    (items.length ? '<button class="button button-danger" id="delete-all-media" type="button">' + esc(L.deleteAllImages) + "</button>" : "") + "</div></div><div class=\"media-grid\">" +
    (visibleItems.length ? visibleItems.map((item) =>
      '<article class="media-card"><div class="media-image-wrap"><img src="' + esc(item.url) + '" alt="' + esc(item.alt_text || item.file_name) + '" loading="lazy"></div>' +
      '<div class="media-info">' + (item.category_name ? '<span class="media-category-badge">' + esc(item.category_name) + "</span>" : '<span class="media-category-badge muted">' + esc(L.uncategorized) + "</span>") +
      '<strong>' + esc(item.alt_text || item.file_name) + '</strong><small>' + esc(item.file_name) + '</small></div>' +
      '<div class="media-actions"><button class="button button-secondary" data-edit-media="' + esc(item.id) + '" type="button">' + esc(L.edit) + '</button><button class="button button-secondary" data-home-hero="' + esc(item.id) + '" type="button">' + esc(L.useAsHomeHero) + '</button><button class="icon-button danger" data-delete-media="' + esc(item.id) + '" type="button" aria-label="' + esc(L.remove) + '">&times;</button></div></article>'
    ).join("") : '<div class="empty-state">' + esc(L.noImagesInCategory) + "</div>") +
    "</div></section>";

  document.querySelector("#category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const name = String(new FormData(event.currentTarget).get("categoryName") || "").trim();
    button.disabled = true;
    try {
      await api("/api/admin/media-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      state.content = await api("/api/admin/content");
      notify(L.categoryCreated);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => button.addEventListener("click", () => {
    openCategoryEditor(categories.find((category) => category.id === button.dataset.editCategory));
  }));
  document.querySelectorAll("[data-delete-category]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmDeleteCategory)) return;
    try {
      await api("/api/admin/media-categories/" + encodeURIComponent(button.dataset.deleteCategory), { method: "DELETE" });
      state.content = await api("/api/admin/content");
      notify(L.categoryDeleted);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
    }
  }));

  const filter = document.querySelector("#media-category-filter");
  filter.value = state.mediaCategoryFilter;
  filter.addEventListener("change", () => {
    state.mediaCategoryFilter = filter.value;
    renderMedia();
  });

  const fileInput = document.querySelector("#file");
  const preview = document.querySelector("#selected-file-preview");
  let previewUrl = "";
  fileInput.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = fileInput.files?.[0];
    if (!file) {
      preview.innerHTML = '<span>' + esc(L.selectedPreview) + '</span><div class="preview-placeholder">' + esc(L.chooseImage) + "</div>";
      return;
    }
    previewUrl = URL.createObjectURL(file);
    preview.innerHTML = '<span>' + esc(L.selectedPreview) + '</span><img src="' + esc(previewUrl) + '" alt="">';
  });
  document.querySelector("#upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const button = formElement.querySelector('button[type="submit"]');
    const form = new FormData(formElement);
    const originalFile = fileInput.files?.[0];
    if (!originalFile) {
      notify(L.imageRequired);
      return;
    }
    button.disabled = true;
    button.textContent = L.optimizing;
    try {
      const webpFile = await convertImageToWebp(originalFile);
      button.textContent = L.uploading;
      const uploadData = new FormData();
      uploadData.set("file", webpFile);
      uploadData.set("altText", String(form.get("altText") || ""));
      uploadData.set("categoryId", String(form.get("categoryId") || ""));
      await api("/api/admin/media", { method: "POST", body: uploadData });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      state.content = await api("/api/admin/content");
      notify(L.uploadSuccess);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
      button.textContent = L.upload;
    }
  });

  document.querySelectorAll("[data-edit-media]").forEach((button) => button.addEventListener("click", () => {
    openMediaEditor(items.find((item) => item.id === button.dataset.editMedia));
  }));
  document.querySelectorAll("[data-delete-media]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmDeleteImage)) return;
    button.disabled = true;
    try {
      await api("/api/admin/media/" + encodeURIComponent(button.dataset.deleteMedia), { method: "DELETE" });
      state.content = await api("/api/admin/content");
      notify(L.imageDeleted);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  }));
  document.querySelectorAll("[data-home-hero]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await setPageHero("home", button.dataset.homeHero);
      notify(L.homeHeroSet);
    } catch (caught) {
      notify(mediaErrorMessage(caught));
    } finally {
      button.disabled = false;
    }
  }));
  document.querySelector("#delete-all-media")?.addEventListener("click", async (event) => {
    if (!confirm(L.confirmDeleteAllImages)) return;
    event.currentTarget.disabled = true;
    try {
      const result = await api("/api/admin/media", { method: "DELETE" });
      state.mediaCategoryFilter = "all";
      state.content = await api("/api/admin/content");
      notify(String(result.deleted || 0) + " " + L.imagesDeleted);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      event.currentTarget.disabled = false;
    }
  });
}

function openCategoryEditor(category) {
  if (!category) return;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = '<div class="modal media-modal"><h2>' + esc(L.renameCategory) + '</h2><form id="category-edit-form">' +
    field("name", L.categoryName, category.name) +
    '<div class="actions"><button class="button button-secondary" data-cancel type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#category-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("/api/admin/media-categories/" + encodeURIComponent(category.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(new FormData(event.currentTarget).get("name") || "") }),
      });
      backdrop.remove();
      state.content = await api("/api/admin/content");
      notify(L.categoryRenamed);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });
}

function openMediaEditor(item) {
  if (!item) return;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = '<div class="modal media-modal"><div class="media-edit-heading"><div><p class="section-kicker">' + esc(L.editImage) + '</p><h2>' + esc(item.file_name) + '</h2></div><img src="' + esc(item.url) + '" alt="' + esc(item.alt_text || item.file_name) + '"></div>' +
    '<form id="media-edit-form"><div class="form-grid">' +
    field("fileName", L.fileName, item.file_name) +
    field("altText", L.altText, item.alt_text || "") +
    '<div class="field span-2"><label for="mediaCategoryId">' + esc(L.category) + '</label><select id="mediaCategoryId" name="categoryId">' + categoryOptions(item.category_id || "") + "</select></div></div>" +
    '<p class="form-help">' + esc(L.renameHint) + '</p><div class="actions"><button class="button button-secondary" data-cancel type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#media-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api("/api/admin/media/" + encodeURIComponent(item.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      backdrop.remove();
      state.content = await api("/api/admin/content");
      notify(L.imageUpdated);
      renderMedia();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });
}

function richBodyFromEditor(controller) {
  return [{
    type: "richText",
    version: 1,
    doc: normalizeAboutDocument(controller.getJSON()),
  }];
}

function closeEditorModal(backdrop) {
  destroyAboutEditor();
  backdrop.remove();
}

function publishedCheckbox(name, checked) {
  return '<label class="checkbox content-published"><input name="' + name + '" type="checkbox"' + (checked ? " checked" : "") + "><span><strong>" + esc(L.published) + "</strong><small>" + esc(L.publishedHint) + "</small></span></label>";
}

function renderEventsHub() {
  destroyAboutEditor();
  const news = state.content.posts || [];
  const church = state.content.churchCalendar || [];
  const isNews = state.eventTab === "news";
  const items = isNews ? news : church;
  document.querySelector("#content").innerHTML =
    '<section class="content-hub-header"><div><p class="section-kicker">' + esc(L.events) + '</p><h2>' + esc(L.eventsWorkspaceTitle) + '</h2><p>' + esc(L.eventsWorkspaceIntro) + '</p></div><div class="content-tabs" role="tablist">' +
    '<button type="button" data-event-tab="news" class="' + (isNews ? "active" : "") + '">' + esc(L.newsUpdates) + '</button>' +
    '<button type="button" data-event-tab="church" class="' + (!isNews ? "active" : "") + '">' + esc(L.churchEvents) + "</button></div></section>" +
    '<section class="panel content-manager"><div class="section-heading"><div><p class="section-kicker">' + esc(isNews ? L.newsUpdates : L.churchCalendar) + '</p><h2>' + esc(isNews ? L.newsListTitle : L.churchListTitle) + '</h2></div><button class="button button-primary" id="add-content-item" type="button">' + esc(isNews ? L.addNews : L.addChurchEvent) + '</button></div>' +
    '<div class="manager-list">' + (items.length ? items.map((item) =>
      '<article class="manager-card"><div class="manager-card-date">' + esc(isNews ? item.display_date : item.display_date) + '</div><div class="manager-card-copy"><span class="status-pill ' + (item.is_published ? "published" : "draft") + '">' + esc(item.is_published ? L.published : L.draft) + '</span><h3>' + esc(item.title) + '</h3><p>' + esc(item.excerpt || "") + '</p></div><div class="row-actions"><button class="button button-secondary" data-edit-content="' + esc(item.id) + '" type="button">' + esc(L.edit) + '</button><button class="button button-danger" data-delete-content="' + esc(item.id) + '" type="button">' + esc(L.remove) + "</button></div></article>"
    ).join("") : '<div class="empty-state">' + esc(isNews ? L.noNewsItems : L.noChurchItems) + "</div>") + "</div></section>";

  document.querySelectorAll("[data-event-tab]").forEach((button) => button.addEventListener("click", () => {
    state.eventTab = button.dataset.eventTab;
    renderEventsHub();
  }));
  document.querySelector("#add-content-item").addEventListener("click", () => {
    if (isNews) openNewsEditor();
    else openChurchEventEditor();
  });
  document.querySelectorAll("[data-edit-content]").forEach((button) => button.addEventListener("click", () => {
    const item = items.find((candidate) => candidate.id === button.dataset.editContent);
    if (isNews) openNewsEditor(item);
    else openChurchEventEditor(item);
  }));
  document.querySelectorAll("[data-delete-content]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmRemove)) return;
    const path = isNews ? "/api/admin/posts/" : "/api/admin/church-calendar/";
    try {
      await api(path + encodeURIComponent(button.dataset.deleteContent), { method: "DELETE" });
      state.content = await api("/api/admin/content");
      notify(L.deleted);
      renderEventsHub();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
    }
  }));
}

function openNewsEditor(item = null) {
  destroyAboutEditor();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const date = String(item?.published_at || new Date().toISOString()).slice(0, 10);
  backdrop.innerHTML = '<div class="modal modal-workspace"><div class="workspace-modal-heading"><div><p class="section-kicker">' + esc(L.newsUpdates) + '</p><h2>' + esc(item ? L.editNews : L.addNews) + '</h2><p>' + esc(L.newsEditorIntro) + '</p></div><button class="icon-button" data-close-editor type="button" aria-label="' + esc(L.cancel) + '">×</button></div>' +
    '<form id="news-editor-form"><div class="form-grid">' +
    field("title", L.titleField, item?.title || "") +
    field("slug", L.slug, item?.slug || "") +
    field("excerpt", L.excerpt, item?.excerpt || "", "textarea", "span-2") +
    field("publishedAt", L.publishedAt, date, "date") +
    '<div class="field"><label for="imageMediaId">' + esc(L.image) + '</label><select id="imageMediaId" name="imageMediaId">' + mediaOptions(item?.image_media_id || "") + "</select></div>" +
    '<div class="span-2">' + publishedCheckbox("isPublished", Boolean(item?.is_published)) + "</div></div>" +
    richEditorMarkup({
      kicker: L.fullPageEditor,
      title: L.newsEditorTitle,
      intro: L.newsEditorDescription,
      toolbarLabel: L.newsEditorTitle,
    }) +
    '<div class="sticky-actions"><button class="button button-secondary" data-close-editor type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  const editorController = mountActiveRichEditor(
    backdrop.querySelector("[data-about-editor-root]"),
    item?.body || [],
    L.newsEditorPlaceholder,
  );
  backdrop.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", () => closeEditorModal(backdrop)));
  backdrop.querySelector("#news-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editorController.isUploading()) {
      notify(L.inlineImageWait);
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.isPublished = event.currentTarget.elements.isPublished.checked;
    data.body = richBodyFromEditor(editorController);
    try {
      await api("/api/admin/posts" + (item ? "/" + encodeURIComponent(item.id) : ""), {
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      closeEditorModal(backdrop);
      state.content = await api("/api/admin/content");
      notify(L.saved);
      renderEventsHub();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });
}

function openChurchEventEditor(item = null) {
  destroyAboutEditor();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const calendarDate = item?.month_day ? new Date().getFullYear() + "-" + item.month_day : "";
  backdrop.innerHTML = '<div class="modal modal-workspace"><div class="workspace-modal-heading"><div><p class="section-kicker">' + esc(L.churchCalendar) + '</p><h2>' + esc(item ? L.editChurchEvent : L.addChurchEvent) + '</h2><p>' + esc(L.churchEditorIntro) + '</p></div><button class="icon-button" data-close-editor type="button" aria-label="' + esc(L.cancel) + '">×</button></div>' +
    '<form id="church-editor-form"><div class="form-grid">' +
    field("calendarDate", L.calendarDate, calendarDate, "date") +
    field("title", L.saintTitle, item?.title || "") +
    field("excerpt", L.saintExcerpt, item?.excerpt || "", "textarea", "span-2") +
    '<div class="field span-2"><label for="imageMediaId">' + esc(L.saintImage) + '</label><select id="imageMediaId" name="imageMediaId">' + mediaOptions(item?.image_media_id || "") + "</select></div>" +
    '<div class="span-2">' + publishedCheckbox("isPublished", Boolean(item?.is_published)) + "</div></div>" +
    richEditorMarkup({
      kicker: L.fullPageEditor,
      title: L.churchEditorTitle,
      intro: L.churchEditorDescription,
      toolbarLabel: L.churchEditorTitle,
    }) +
    '<div class="sticky-actions"><button class="button button-secondary" data-close-editor type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  const editorController = mountActiveRichEditor(
    backdrop.querySelector("[data-about-editor-root]"),
    item?.body || [],
    L.churchEditorPlaceholder,
  );
  backdrop.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", () => closeEditorModal(backdrop)));
  backdrop.querySelector("#church-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editorController.isUploading()) {
      notify(L.inlineImageWait);
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.isPublished = event.currentTarget.elements.isPublished.checked;
    data.body = richBodyFromEditor(editorController);
    try {
      await api("/api/admin/church-calendar" + (item ? "/" + encodeURIComponent(item.id) : ""), {
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      closeEditorModal(backdrop);
      state.content = await api("/api/admin/content");
      notify(L.saved);
      renderEventsHub();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });
}

function renderGalleries() {
  destroyAboutEditor();
  const galleries = state.content.galleries || [];
  document.querySelector("#content").innerHTML =
    '<section class="content-hub-header"><div><p class="section-kicker">' + esc(L.galleries) + '</p><h2>' + esc(L.galleryWorkspaceTitle) + '</h2><p>' + esc(L.galleryWorkspaceIntro) + '</p></div><button class="button button-primary" id="add-gallery" type="button">' + esc(L.addGallery) + '</button></section>' +
    '<section class="gallery-manager-grid">' + (galleries.length ? galleries.map((gallery) =>
      '<article class="gallery-manager-card">' + (gallery.cover_url ? '<img src="' + esc(gallery.cover_url) + '" alt="' + esc(gallery.cover_alt || gallery.title) + '" loading="lazy">' : '<div class="gallery-cover-placeholder">✦</div>') +
      '<div class="gallery-manager-copy"><div><span class="status-pill ' + (gallery.is_published ? "published" : "draft") + '">' + esc(gallery.is_published ? L.published : L.draft) + '</span><span class="type-pill">' + esc(gallery.gallery_type === "story" ? L.galleryStory : L.galleryPhotos) + '</span></div><h3>' + esc(gallery.title) + '</h3><p>' + esc(gallery.excerpt || "") + '</p><small>' + gallery.images.length + " " + esc(L.imagesCount) + " · " + esc(gallery.display_date || "") + '</small></div>' +
      '<div class="gallery-manager-actions"><button class="button button-secondary" data-edit-gallery="' + esc(gallery.id) + '" type="button">' + esc(L.edit) + '</button><button class="button button-danger" data-delete-gallery="' + esc(gallery.id) + '" type="button">' + esc(L.remove) + "</button></div></article>"
    ).join("") : '<div class="empty-state">' + esc(L.noGalleries) + "</div>") + "</section>";
  document.querySelector("#add-gallery").addEventListener("click", () => openGalleryEditor());
  document.querySelectorAll("[data-edit-gallery]").forEach((button) => button.addEventListener("click", () => {
    openGalleryEditor(galleries.find((gallery) => gallery.id === button.dataset.editGallery));
  }));
  document.querySelectorAll("[data-delete-gallery]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(L.confirmDeleteGallery)) return;
    try {
      await api("/api/admin/galleries/" + encodeURIComponent(button.dataset.deleteGallery), { method: "DELETE" });
      state.content = await api("/api/admin/content");
      notify(L.deleted);
      renderGalleries();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
    }
  }));
}

function openGalleryEditor(item = null) {
  destroyAboutEditor();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const media = state.content.media || [];
  let selectedImages = (item?.images || []).map((image, index) => ({
    mediaId: image.media_id,
    caption: image.caption || "",
    sortOrder: index,
  }));
  backdrop.innerHTML = '<div class="modal modal-workspace gallery-workspace"><div class="workspace-modal-heading"><div><p class="section-kicker">' + esc(L.galleries) + '</p><h2>' + esc(item ? L.editGallery : L.addGallery) + '</h2><p>' + esc(L.galleryEditorIntro) + '</p></div><button class="icon-button" data-close-editor type="button" aria-label="' + esc(L.cancel) + '">×</button></div>' +
    '<form id="gallery-editor-form"><div class="form-grid">' +
    field("title", L.titleField, item?.title || "") +
    field("slug", L.slug, item?.slug || "") +
    field("excerpt", L.excerpt, item?.excerpt || "", "textarea", "span-2") +
    '<div class="field"><label for="galleryType">' + esc(L.galleryType) + '</label><select id="galleryType" name="galleryType"><option value="story"' + (item?.gallery_type === "story" ? " selected" : "") + ">" + esc(L.galleryStory) + '</option><option value="photos"' + (item?.gallery_type !== "story" ? " selected" : "") + ">" + esc(L.galleryPhotos) + "</option></select></div>" +
    field("publishedAt", L.publishedAt, String(item?.published_at || new Date().toISOString()).slice(0, 10), "date") +
    '<div class="field span-2"><label for="coverMediaId">' + esc(L.galleryCover) + '</label><select id="coverMediaId" name="coverMediaId">' + mediaOptions(item?.cover_media_id || "") + "</select></div>" +
    '<div class="span-2">' + publishedCheckbox("isPublished", Boolean(item?.is_published)) + "</div></div>" +
    '<div id="gallery-rich-editor">' + richEditorMarkup({
      kicker: L.fullPageEditor,
      title: L.galleryDescriptionEditor,
      intro: L.galleryDescriptionIntro,
      toolbarLabel: L.galleryDescriptionEditor,
    }) + "</div>" +
    '<section class="album-builder"><div class="section-heading"><div><p class="section-kicker">' + esc(L.galleryAlbum) + '</p><h3>' + esc(L.galleryImagesTitle) + '</h3><p>' + esc(L.galleryImagesIntro) + '</p></div><span id="gallery-image-count" class="editor-status"></span></div>' +
    '<div class="gallery-source-actions"><label class="toolbar-upload gallery-upload"><input id="gallery-file-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><span>' + esc(L.uploadGalleryImages) + '</span></label></div>' +
    '<div class="media-picker-grid" id="gallery-media-picker">' + (media.length ? media.map((image) =>
      '<button type="button" class="media-picker-card" data-pick-media="' + esc(image.id) + '"><img src="' + esc(image.url) + '" alt="' + esc(image.alt_text || image.file_name) + '" loading="lazy"><span>' + esc(image.alt_text || image.file_name) + "</span></button>"
    ).join("") : '<p class="empty-state">' + esc(L.noItems) + "</p>") + '</div><div id="gallery-selected-images" class="selected-gallery-images"></div></section>' +
    '<div class="sticky-actions"><button class="button button-secondary" data-close-editor type="button">' + esc(L.cancel) + '</button><button class="button button-primary" type="submit">' + esc(L.save) + "</button></div></form></div>";
  document.body.append(backdrop);
  const editorController = mountActiveRichEditor(
    backdrop.querySelector("[data-about-editor-root]"),
    item?.body || [],
    L.galleryEditorPlaceholder,
  );
  const typeSelect = backdrop.querySelector("#galleryType");
  const richSection = backdrop.querySelector("#gallery-rich-editor");
  const coverSelect = backdrop.querySelector("#coverMediaId");
  const picker = backdrop.querySelector("#gallery-media-picker");
  const selectedList = backdrop.querySelector("#gallery-selected-images");
  const count = backdrop.querySelector("#gallery-image-count");

  const refreshPicker = () => {
    picker.querySelectorAll("[data-pick-media]").forEach((button) => {
      button.classList.toggle("selected", selectedImages.some((image) => image.mediaId === button.dataset.pickMedia));
    });
  };
  const renderSelected = () => {
    count.textContent = selectedImages.length + " " + L.imagesCount;
    selectedList.innerHTML = selectedImages.length ? selectedImages.map((selected, index) => {
      const image = (state.content.media || []).find((candidate) => candidate.id === selected.mediaId);
      if (!image) return "";
      return '<article class="selected-gallery-card" data-selected-media="' + esc(selected.mediaId) + '"><div class="selected-gallery-preview"><img src="' + esc(image.url) + '" alt="' + esc(image.alt_text || image.file_name) + '">' + (coverSelect.value === selected.mediaId ? '<span>' + esc(L.coverBadge) + "</span>" : "") + '</div><div class="selected-gallery-copy"><strong>' + esc(image.alt_text || image.file_name) + '</strong><label>' + esc(L.imageCaption) + '<input data-gallery-caption value="' + esc(selected.caption) + '" maxlength="300"></label></div><div class="selected-gallery-actions"><button type="button" data-gallery-image-action="cover">' + esc(L.setAsCover) + '</button><button type="button" data-gallery-image-action="up"' + (index === 0 ? " disabled" : "") + '>↑</button><button type="button" data-gallery-image-action="down"' + (index === selectedImages.length - 1 ? " disabled" : "") + '>↓</button><button type="button" data-gallery-image-action="remove">×</button></div></article>';
    }).join("") : '<div class="empty-state">' + esc(L.noGalleryImages) + "</div>";
    refreshPicker();
  };
  const updateType = () => {
    richSection.hidden = typeSelect.value !== "story";
  };
  typeSelect.addEventListener("change", updateType);
  updateType();
  picker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pick-media]");
    if (!button) return;
    const index = selectedImages.findIndex((image) => image.mediaId === button.dataset.pickMedia);
    if (index >= 0) selectedImages.splice(index, 1);
    else selectedImages.push({ mediaId: button.dataset.pickMedia, caption: "", sortOrder: selectedImages.length });
    if (!coverSelect.value && selectedImages.length) coverSelect.value = selectedImages[0].mediaId;
    renderSelected();
  });
  selectedList.addEventListener("input", (event) => {
    const card = event.target.closest("[data-selected-media]");
    if (!card || !event.target.matches("[data-gallery-caption]")) return;
    const selected = selectedImages.find((image) => image.mediaId === card.dataset.selectedMedia);
    if (selected) selected.caption = event.target.value;
  });
  selectedList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-image-action]");
    const card = event.target.closest("[data-selected-media]");
    if (!button || !card) return;
    const index = selectedImages.findIndex((image) => image.mediaId === card.dataset.selectedMedia);
    if (index < 0) return;
    const action = button.dataset.galleryImageAction;
    if (action === "remove") {
      const [removed] = selectedImages.splice(index, 1);
      if (coverSelect.value === removed.mediaId) coverSelect.value = selectedImages[0]?.mediaId || "";
    }
    if (action === "cover") coverSelect.value = selectedImages[index].mediaId;
    if (action === "up" && index > 0) [selectedImages[index - 1], selectedImages[index]] = [selectedImages[index], selectedImages[index - 1]];
    if (action === "down" && index < selectedImages.length - 1) [selectedImages[index + 1], selectedImages[index]] = [selectedImages[index], selectedImages[index + 1]];
    renderSelected();
  });
  coverSelect.addEventListener("change", renderSelected);
  backdrop.querySelector("#gallery-file-upload").addEventListener("change", async (event) => {
    const fileInputElement = event.currentTarget;
    const files = [...(fileInputElement.files || [])].slice(0, 100 - selectedImages.length);
    if (!files.length) return;
    fileInputElement.disabled = true;
    count.textContent = L.galleryUploading;
    try {
      const newIds = [];
      for (const file of files) {
        const webpFile = await convertImageToWebp(file);
        const uploadData = new FormData();
        uploadData.set("file", webpFile);
        uploadData.set("altText", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        const result = await api("/api/admin/media", { method: "POST", body: uploadData });
        newIds.push(result.id);
      }
      state.content = await api("/api/admin/content");
      newIds.forEach((mediaId) => selectedImages.push({ mediaId, caption: "", sortOrder: selectedImages.length }));
      const draftBody = richBodyFromEditor(editorController);
      const draftCoverMediaId = coverSelect.value || selectedImages[0]?.mediaId || "";
      const draft = {
        ...(item || {}),
        title: backdrop.querySelector('[name="title"]').value,
        slug: backdrop.querySelector('[name="slug"]').value,
        excerpt: backdrop.querySelector('[name="excerpt"]').value,
        gallery_type: typeSelect.value,
        published_at: backdrop.querySelector('[name="publishedAt"]').value,
        cover_media_id: draftCoverMediaId,
        is_published: backdrop.querySelector('[name="isPublished"]').checked ? 1 : 0,
        body: draftBody,
        images: selectedImages.map((image) => ({ media_id: image.mediaId, caption: image.caption })),
      };
      notify(L.uploadSuccess);
      closeEditorModal(backdrop);
      openGalleryEditor(draft);
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      fileInputElement.disabled = false;
      renderSelected();
    }
  });
  backdrop.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", () => closeEditorModal(backdrop)));
  backdrop.querySelector("#gallery-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editorController.isUploading()) {
      notify(L.inlineImageWait);
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.isPublished = event.currentTarget.elements.isPublished.checked;
    data.body = typeSelect.value === "story" ? richBodyFromEditor(editorController) : [];
    data.images = selectedImages.map((image, index) => ({ ...image, sortOrder: index }));
    try {
      await api("/api/admin/galleries" + (item?.id ? "/" + encodeURIComponent(item.id) : ""), {
        method: item?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      closeEditorModal(backdrop);
      state.content = await api("/api/admin/content");
      notify(L.saved);
      renderGalleries();
    } catch (caught) {
      notify(mediaErrorMessage(caught));
      button.disabled = false;
    }
  });
  renderSelected();
}

const definitions = {
  services: [
    ["dayLabel", "dayLabel", "text"], ["timeLabel", "timeLabel", "text"], ["serviceName", "serviceName", "text"],
    ["sortOrder", "sortOrder", "number"], ["isVisible", "visible", "checkbox"],
  ],
};

function itemValue(collection, item, key) {
  const maps = {
    services: { dayLabel: "day_label", timeLabel: "time_label", serviceName: "service_name", sortOrder: "sort_order", isVisible: "is_visible" },
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
