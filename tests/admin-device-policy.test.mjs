import test from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_PHONE_BREAKPOINT,
  classifyAdminAccess,
} from "../public/admin-device-policy.js";

const desktopSignals = (viewportWidth, viewportHeight) => ({
  viewportWidth,
  viewportHeight,
  screenWidth: viewportWidth,
  screenHeight: viewportHeight,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  platform: "Win32",
  userAgentDataMobile: false,
  maxTouchPoints: 0,
  coarsePointer: false,
});

const phoneSignals = (viewportWidth, viewportHeight) => ({
  viewportWidth,
  viewportHeight,
  screenWidth: viewportWidth,
  screenHeight: viewportHeight,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
  platform: "Linux armv8l",
  userAgentDataMobile: true,
  maxTouchPoints: 5,
  coarsePointer: true,
});

for (const [width, height] of [[375, 667], [390, 844], [430, 932]]) {
  test(`blocks a phone at ${width}x${height}`, () => {
    const result = classifyAdminAccess(phoneSignals(width, height));
    assert.equal(result.blocked, true);
    assert.equal(result.formFactor, "phone");
  });
}

test("allows a 768x1024 touch tablet below the phone breakpoint", () => {
  const result = classifyAdminAccess({
    viewportWidth: 768,
    viewportHeight: 1024,
    screenWidth: 768,
    screenHeight: 1024,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    platform: "MacIntel",
    userAgentDataMobile: false,
    maxTouchPoints: 5,
    coarsePointer: true,
  });

  assert.equal(result.blocked, false);
  assert.equal(result.formFactor, "tablet");
});

for (const [width, height] of [[1024, 768], [1440, 900]]) {
  test(`allows a computer at ${width}x${height}`, () => {
    const result = classifyAdminAccess(desktopSignals(width, height));
    assert.equal(result.blocked, false);
    assert.equal(result.formFactor, "computer");
  });
}

test("still blocks a phone when desktop-site mode reports a wide viewport", () => {
  const result = classifyAdminAccess({
    ...phoneSignals(430, 932),
    viewportWidth: 1024,
    viewportHeight: 768,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    userAgentDataMobile: false,
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "phone-device");
});

test("blocks a phone in landscape orientation", () => {
  const result = classifyAdminAccess({
    ...phoneSignals(844, 390),
    screenWidth: 844,
    screenHeight: 390,
  });

  assert.equal(result.blocked, true);
  assert.equal(result.formFactor, "phone");
});

test("blocks a narrow non-tablet computer below 992 pixels", () => {
  const result = classifyAdminAccess(desktopSignals(ADMIN_PHONE_BREAKPOINT - 1, 900));
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "narrow-viewport");
});

test("allows a computer at the 992-pixel boundary", () => {
  const result = classifyAdminAccess(desktopSignals(ADMIN_PHONE_BREAKPOINT, 768));
  assert.equal(result.blocked, false);
  assert.equal(result.formFactor, "computer");
});
