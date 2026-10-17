// Regression tests for the Credit/Debit Note size-wise matching bug (see
// utils/creditDebitNoteLines.js and controllers/creditDebitNoteController.js).
//
// Root cause being guarded against: a Credit/Debit Note tied to a referenced bill resolved
// which specification (variant) was being returned by matching the bill's own lines on
// `item` id ALONE (`bill.items.find(l => l.item === line.item)`), which always returns the
// FIRST line for that item - so a bill with the same item at two sizes could silently
// return/credit the WRONG size's stock. The cumulative-returnable-quantity guard had the
// identical gap, summing billed/already-returned quantity by item id alone.
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLineVariantFromBill, checkReturnableQuantity } = require("../src/utils/creditDebitNoteLines");

const ITEM_MATTRESS = "aaaa00000000000000000001";
const ITEM_FOAM = "aaaa00000000000000000002";
const VARIANT_SMALL = "bbbb00000000000000000001";
const VARIANT_LARGE = "bbbb00000000000000000002";

// A bill with the same item billed at two different sizes - the exact scenario that exposed
// the bug, mirroring SB-2026-00017 from the dispatch fix earlier this session.
const billItems = () => ([
  { item: ITEM_MATTRESS, variant: VARIANT_SMALL, quantity: 1 },
  { item: ITEM_FOAM, variant: null, quantity: 1 },
  { item: ITEM_MATTRESS, variant: VARIANT_LARGE, quantity: 1 },
]);

// ---- resolveLineVariantFromBill ----

test("an explicit variant resolves to exactly that bill line, never the first matching item", () => {
  const result = resolveLineVariantFromBill({ item: ITEM_MATTRESS, variant: VARIANT_LARGE, quantity: 1 }, billItems());
  assert.equal(result, VARIANT_LARGE, "must resolve to the LARGE size that was explicitly named, not the first (SMALL) line for this item");
});

test("no variant given, but the bill has only ONE line for that item - resolves unambiguously (common case, unchanged)", () => {
  const result = resolveLineVariantFromBill({ item: ITEM_FOAM, quantity: 1 }, billItems());
  assert.equal(result, null);
});

test("no variant given, and the bill has MULTIPLE lines for that item - rejects rather than guessing (the bug this fixes)", () => {
  assert.throws(
    () => resolveLineVariantFromBill({ item: ITEM_MATTRESS, quantity: 1 }, billItems()),
    /specify which "variant"/,
    "must never silently default to the first (SMALL) line - that's exactly the bug being fixed",
  );
});

test("a variant that doesn't belong to this item on the bill is rejected, never trusted blindly", () => {
  assert.throws(
    () => resolveLineVariantFromBill({ item: ITEM_FOAM, variant: VARIANT_LARGE, quantity: 1 }, billItems()),
    /does not match this item/,
  );
});

test("an item that was never on the bill is rejected - cannot return what wasn't billed", () => {
  assert.throws(
    () => resolveLineVariantFromBill({ item: "cccc00000000000000000099", quantity: 1 }, billItems()),
    /never on the referenced bill/,
  );
});

// ---- checkReturnableQuantity ----

test("each size's returnable quantity is tracked independently - the core bug", () => {
  // Both mattress sizes were billed qty 1 each. Returning 1 of the LARGE size must not affect
  // what remains returnable for the SMALL size.
  const request = [{ item: ITEM_MATTRESS, variant: VARIANT_LARGE, quantity: 1 }];
  assert.doesNotThrow(() => checkReturnableQuantity(billItems(), [], request));

  // Now simulate that the LARGE size was already fully returned by a prior note - the SMALL
  // size must still be fully returnable (never merged into one shared pool of 2).
  const priorNotes = [[{ item: ITEM_MATTRESS, variant: VARIANT_LARGE, quantity: 1 }]];
  assert.doesNotThrow(() => checkReturnableQuantity(billItems(), priorNotes, [{ item: ITEM_MATTRESS, variant: VARIANT_SMALL, quantity: 1 }]));
});

test("over-returning ONE size is rejected even though the OTHER size of the same item is still untouched", () => {
  // Billed: SMALL=1, LARGE=1. Trying to return 2 of SMALL must fail - it must never be allowed
  // just because the item's aggregate billed quantity (across both sizes) is 2.
  const request = [{ item: ITEM_MATTRESS, variant: VARIANT_SMALL, quantity: 2 }];
  assert.throws(() => checkReturnableQuantity(billItems(), [], request), /only 1 of the 1 billed/);
});

test("a prior return against ONE size does not reduce what's returnable for the OTHER size", () => {
  // Prior note already returned 1 of LARGE. A new request to return 1 of SMALL must still
  // succeed - the old bug merged these into one pool, which would have blocked this.
  const priorNotes = [[{ item: ITEM_MATTRESS, variant: VARIANT_LARGE, quantity: 1 }]];
  const request = [{ item: ITEM_MATTRESS, variant: VARIANT_SMALL, quantity: 1 }];
  assert.doesNotThrow(() => checkReturnableQuantity(billItems(), priorNotes, request));
});

test("returning more than billed for an item that was never on the bill at all is rejected", () => {
  const request = [{ item: "cccc00000000000000000099", variant: null, quantity: 1 }];
  assert.throws(() => checkReturnableQuantity(billItems(), [], request), /never on bill/);
});

test("multiple prior notes against the same line accumulate correctly before blocking an over-return", () => {
  const priorNotes = [
    [{ item: ITEM_FOAM, variant: null, quantity: 0.5 }],
    [{ item: ITEM_FOAM, variant: null, quantity: 0.4 }],
  ];
  // Billed 1 total, 0.9 already returned across two notes - only 0.1 should remain.
  assert.doesNotThrow(() => checkReturnableQuantity(billItems(), priorNotes, [{ item: ITEM_FOAM, variant: null, quantity: 0.1 }]));
  assert.throws(() => checkReturnableQuantity(billItems(), priorNotes, [{ item: ITEM_FOAM, variant: null, quantity: 0.2 }]));
});
