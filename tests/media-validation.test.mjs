import test from "node:test";
import assert from "node:assert/strict";

import { hasValidWebpSignature } from "../src/media-validation.ts";

test("accepts a WebP RIFF signature", async () => {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(await hasValidWebpSignature(new Blob([bytes])), true);
});

test("rejects a spoofed image/webp payload", async () => {
  const bytes = new TextEncoder().encode("<script>alert(1)</script>");
  assert.equal(await hasValidWebpSignature(new Blob([bytes])), false);
});

test("rejects a truncated payload", async () => {
  assert.equal(await hasValidWebpSignature(new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])])), false);
});
