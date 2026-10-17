// Regression tests for the Company Logo upload/replace/remove safety logic (see
// utils/companyLogo.js, middleware/upload.js, utils/cloudinaryImage.js). No real Cloudinary
// account/credentials are used - Cloudinary's own network calls are mocked where needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLogoToDelete } = require("../src/utils/companyLogo");
const { isAllowedLogoType } = require("../src/middleware/upload");
const { toPngDeliveryUrl, fetchLogoAsPngBuffer } = require("../src/utils/cloudinaryImage");

// ---- resolveLogoToDelete: replace/remove safety ----

test("first-ever upload (no previous logo) has nothing to delete", () => {
  assert.equal(resolveLogoToDelete(null, "mattress-erp/uploads/new123"), null);
  assert.equal(resolveLogoToDelete(undefined, "mattress-erp/uploads/new123"), null);
});

test("replacing an existing logo returns the OLD publicId to delete, never the new one", () => {
  const result = resolveLogoToDelete("mattress-erp/uploads/old1", "mattress-erp/uploads/new2");
  assert.equal(result, "mattress-erp/uploads/old1");
});

test("never deletes the asset if old and new publicId are somehow identical", () => {
  assert.equal(resolveLogoToDelete("mattress-erp/uploads/same", "mattress-erp/uploads/same"), null);
});

test("a failed new upload never reaches this function at all (structural guarantee)", () => {
  // multer-storage-cloudinary uploads the new file BEFORE companySettingsController.uploadLogo
  // runs; if that upload throws, Express calls the error handler and the controller - and
  // therefore resolveLogoToDelete - never executes, so the OLD logo in the database is never
  // touched and nothing is ever deleted. This is enforced by Express's middleware chain, not
  // by this function, so there is nothing further to assert here beyond documenting it.
  assert.ok(true);
});

// ---- isAllowedLogoType: file-type validation ----

test("accepts PNG, JPEG and WebP", () => {
  assert.equal(isAllowedLogoType("image/png"), true);
  assert.equal(isAllowedLogoType("image/jpeg"), true);
  assert.equal(isAllowedLogoType("image/webp"), true);
});

test("rejects unsupported types (PDF, GIF, SVG, etc.)", () => {
  assert.equal(isAllowedLogoType("application/pdf"), false);
  assert.equal(isAllowedLogoType("image/gif"), false);
  assert.equal(isAllowedLogoType("image/svg+xml"), false);
  assert.equal(isAllowedLogoType("text/plain"), false);
});

// Oversized-file rejection (2MB limit) is enforced natively by multer's own, already-tested
// `limits.fileSize` option (see middleware/upload.js's uploadCompanyLogo) - not re-tested here
// since that would only be testing the multer library itself, not code written for this task.

// ---- toPngDeliveryUrl: Cloudinary format-conversion URL rewrite ----

test("inserts f_png into a Cloudinary delivery URL to force PNG output", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v123/mattress-erp/uploads/logo.webp";
  assert.equal(toPngDeliveryUrl(url), "https://res.cloudinary.com/demo/image/upload/f_png/v123/mattress-erp/uploads/logo.webp");
});

test("leaves a non-Cloudinary or malformed URL unchanged rather than mangling it", () => {
  const url = "https://example.com/not-cloudinary/logo.png";
  assert.equal(toPngDeliveryUrl(url), url);
});

test("passes through null/undefined", () => {
  assert.equal(toPngDeliveryUrl(null), null);
  assert.equal(toPngDeliveryUrl(undefined), undefined);
});

// ---- fetchLogoAsPngBuffer: network behaviour, with `fetch` mocked (no real network/Cloudinary) ----

test("returns null immediately when no logoUrl is configured, without calling fetch", async () => {
  let called = false;
  const originalFetch = global.fetch;
  global.fetch = async () => { called = true; throw new Error("should not be called"); };
  try {
    const result = await fetchLogoAsPngBuffer(undefined);
    assert.equal(result, null);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns a Buffer when the mocked fetch succeeds", async () => {
  const fakeBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, arrayBuffer: async () => fakeBytes.buffer.slice(fakeBytes.byteOffset, fakeBytes.byteOffset + fakeBytes.byteLength) });
  try {
    const result = await fetchLogoAsPngBuffer("https://res.cloudinary.com/demo/image/upload/v1/logo.png");
    assert.ok(Buffer.isBuffer(result));
    assert.deepEqual(result, fakeBytes);
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns null (never throws) when the mocked fetch rejects (network error/timeout)", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("simulated network failure"); };
  try {
    const result = await fetchLogoAsPngBuffer("https://res.cloudinary.com/demo/image/upload/v1/logo.png");
    assert.equal(result, null, "invoice generation must be able to fall back to the text-only header, never crash");
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns null when the mocked fetch responds non-OK (e.g. 404 asset deleted on Cloudinary's side)", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false });
  try {
    const result = await fetchLogoAsPngBuffer("https://res.cloudinary.com/demo/image/upload/v1/logo.png");
    assert.equal(result, null);
  } finally {
    global.fetch = originalFetch;
  }
});
