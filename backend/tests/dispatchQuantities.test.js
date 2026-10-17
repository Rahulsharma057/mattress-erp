// Regression tests for the dispatch per-line remaining-quantity fix (see
// src/utils/dispatchQuantities.js and the bug it fixes in dispatchController.js).
//
// Root cause being guarded against: dispatched/remaining quantity was previously tracked per
// ITEM, not per bill LINE. A Sales Bill with two lines of the same item in different sizes
// (e.g. SB-2026-00017: "Double Bed Mattress 5-inch" at two different sizes) had those lines
// merged into one pool, so dispatching against one size silently consumed the other's
// allowance too.
//
// Run with: node --test   (Node's built-in test runner, no extra dependency needed - this
// repo had no test framework at all before this fix).
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLineKey, computeRemainingLines } = require("../src/utils/dispatchQuantities");

// ---- Fixtures -------------------------------------------------------------------------

const ITEM_MATTRESS = "aaaa00000000000000000001";
const ITEM_FOAM = "aaaa00000000000000000002";
const VARIANT_SMALL = "bbbb00000000000000000001";
const VARIANT_LARGE = "bbbb00000000000000000002";

// A Sales Bill with the SAME product ("Double Bed Mattress") billed twice at two different
// sizes - the exact scenario from SB-2026-00017 that exposed the bug - plus an unrelated
// single-line item (PU Foam Sheet) to make sure per-item isolation still works.
const makeBill = (overrides = {}) => ({
  billNumber: "SB-2026-00017",
  items: [
    { item: { _id: ITEM_MATTRESS, name: "Double Bed Mattress 5-inch", unit: "PCS" }, variant: { _id: VARIANT_SMALL, sizeLabel: "12x9 inch" }, quantity: 1, rate: 1995 },
    { item: { _id: ITEM_FOAM, name: "PU Foam Sheet 6-inch", unit: "PCS" }, variant: null, quantity: 1, rate: 200 },
    { item: { _id: ITEM_MATTRESS, name: "Double Bed Mattress 5-inch", unit: "PCS" }, variant: { _id: VARIANT_LARGE, sizeLabel: "17x12 inch" }, quantity: 1, rate: 2000 },
  ],
  ...overrides,
});

const lineKeyFor = (bill, index) => buildLineKey(bill.items[index], index);

// ---- buildLineKey ----------------------------------------------------------------------

test("buildLineKey gives each line a distinct key even when item+variant match", () => {
  const bill = makeBill();
  const keys = bill.items.map((line, i) => buildLineKey(line, i));
  assert.equal(new Set(keys).size, 3, "all three lines must have distinct keys");
});

test("buildLineKey is stable across repeated calls on the same line (array order never changes)", () => {
  const bill = makeBill();
  assert.equal(buildLineKey(bill.items[0], 0), buildLineKey(bill.items[0], 0));
});

test("buildLineKey handles a line with no variant at all (missing variant data)", () => {
  const bill = makeBill();
  const key = buildLineKey(bill.items[1], 1); // the foam sheet line, variant: null
  assert.match(key, /:none:1$/);
});

// ---- computeRemainingLines: the core fix ------------------------------------------------

test("two lines of the same item in different sizes start fully independent", () => {
  const bill = makeBill();
  const lines = computeRemainingLines(bill, []);
  assert.equal(lines.length, 3);
  for (const l of lines) {
    assert.equal(l.dispatchedQty, 0);
    assert.equal(l.remainingQty, l.billedQty);
  }
});

test("dispatching one size does NOT consume the other size's remaining quantity (the bug)", () => {
  const bill = makeBill();
  const smallKey = lineKeyFor(bill, 0); // 12x9
  const largeKey = lineKeyFor(bill, 2); // 17x12

  const dispatches = [
    { status: "pending", packingList: [{ item: ITEM_MATTRESS, lineKey: smallKey, quantity: 1 }] },
  ];

  const lines = computeRemainingLines(bill, dispatches);
  const small = lines.find((l) => l.lineKey === smallKey);
  const large = lines.find((l) => l.lineKey === largeKey);
  const foam = lines.find((l) => l.item === ITEM_FOAM);

  assert.equal(small.remainingQty, 0, "the dispatched size must be fully consumed");
  assert.equal(large.remainingQty, 1, "the OTHER size must still show its full remaining quantity - this is the bug this fix prevents");
  assert.equal(foam.remainingQty, 1, "an unrelated item must be completely unaffected");
});

test("multiple dispatches against the same line accumulate correctly (partial dispatches)", () => {
  const bill = makeBill({
    items: [{ item: { _id: ITEM_MATTRESS, name: "Double Bed Mattress 5-inch", unit: "PCS" }, variant: { _id: VARIANT_SMALL, sizeLabel: "12x9 inch" }, quantity: 5, rate: 1995 }],
  });
  const key = lineKeyFor(bill, 0);
  const dispatches = [
    { status: "pending", packingList: [{ item: ITEM_MATTRESS, lineKey: key, quantity: 2 }] },
    { status: "delivered", packingList: [{ item: ITEM_MATTRESS, lineKey: key, quantity: 1 }] },
  ];
  const [line] = computeRemainingLines(bill, dispatches);
  assert.equal(line.dispatchedQty, 3);
  assert.equal(line.remainingQty, 2);
});

test("a returned dispatch frees its quantity back up (excluded from dispatchedQty)", () => {
  const bill = makeBill();
  const smallKey = lineKeyFor(bill, 0);
  const dispatches = [
    { status: "returned", packingList: [{ item: ITEM_MATTRESS, lineKey: smallKey, quantity: 1 }] },
  ];
  const [small] = computeRemainingLines(bill, dispatches);
  assert.equal(small.remainingQty, 1, "a returned dispatch must not count against remaining quantity");
});

test("duplicate lines with the IDENTICAL item and variant are still tracked independently", () => {
  const bill = makeBill({
    items: [
      { item: { _id: ITEM_MATTRESS, name: "Double Bed Mattress 5-inch", unit: "PCS" }, variant: { _id: VARIANT_SMALL, sizeLabel: "12x9 inch" }, quantity: 1, rate: 1995 },
      { item: { _id: ITEM_MATTRESS, name: "Double Bed Mattress 5-inch", unit: "PCS" }, variant: { _id: VARIANT_SMALL, sizeLabel: "12x9 inch" }, quantity: 1, rate: 1995 },
    ],
  });
  const firstKey = lineKeyFor(bill, 0);
  const secondKey = lineKeyFor(bill, 1);
  assert.notEqual(firstKey, secondKey, "identical item+variant lines must still get distinct keys");

  const dispatches = [{ status: "pending", packingList: [{ item: ITEM_MATTRESS, lineKey: firstKey, quantity: 1 }] }];
  const lines = computeRemainingLines(bill, dispatches);
  assert.equal(lines.find((l) => l.lineKey === firstKey).remainingQty, 0);
  assert.equal(lines.find((l) => l.lineKey === secondKey).remainingQty, 1, "the second identical line must be untouched");
});

test("an edited dispatch (status changed after creation) is still read with its latest status", () => {
  const bill = makeBill();
  const smallKey = lineKeyFor(bill, 0);
  // Simulates updateDispatchStatus having changed this dispatch to "returned" after creation.
  const dispatches = [{ status: "returned", packingList: [{ item: ITEM_MATTRESS, lineKey: smallKey, quantity: 1 }] }];
  const [small] = computeRemainingLines(bill, dispatches);
  assert.equal(small.remainingQty, 1);
});

// ---- Backward compatibility: legacy dispatches with no lineKey at all ------------------

test("a legacy dispatch with no lineKey is apportioned FIFO across the item's lines, not merged/dropped", () => {
  const bill = makeBill(); // two mattress lines, qty 1 each, in bill order: small then large
  const legacyDispatch = { status: "pending", packingList: [{ item: ITEM_MATTRESS, quantity: 1 }] }; // no lineKey

  const lines = computeRemainingLines(bill, [legacyDispatch]);
  const small = lines.find((l) => l.item === ITEM_MATTRESS && l.remainingQty === 0);
  const large = lines.find((l) => l.item === ITEM_MATTRESS && l.remainingQty === 1);
  assert.ok(small, "the FIRST mattress line in bill order should absorb the legacy quantity");
  assert.ok(large, "the SECOND mattress line should remain untouched by the legacy entry");
});

test("a legacy dispatch quantity larger than the first line spills into the second line (still FIFO, never lost)", () => {
  const bill = makeBill();
  const legacyDispatch = { status: "pending", packingList: [{ item: ITEM_MATTRESS, quantity: 2 }] }; // both mattress lines together
  const lines = computeRemainingLines(bill, [legacyDispatch]);
  const mattressLines = lines.filter((l) => l.item === ITEM_MATTRESS);
  assert.equal(mattressLines[0].remainingQty, 0);
  assert.equal(mattressLines[1].remainingQty, 0);
  const totalDispatched = mattressLines.reduce((s, l) => s + l.dispatchedQty, 0);
  assert.equal(totalDispatched, 2, "both units of legacy quantity must be accounted for, not lost");
});

test("a lineKey that no longer resolves on the bill falls back to legacy FIFO apportionment instead of throwing", () => {
  const bill = makeBill();
  const dispatches = [{ status: "pending", packingList: [{ item: ITEM_MATTRESS, lineKey: "stale-key-not-on-bill", quantity: 1 }] }];
  const lines = computeRemainingLines(bill, dispatches);
  const totalRemaining = lines.filter((l) => l.item === ITEM_MATTRESS).reduce((s, l) => s + l.remainingQty, 0);
  assert.equal(totalRemaining, 1, "the quantity must still be accounted for somewhere, not silently dropped");
});

test("a dispatch spanning both sizes in one request decrements each line independently", () => {
  const bill = makeBill();
  const smallKey = lineKeyFor(bill, 0);
  const largeKey = lineKeyFor(bill, 2);
  const dispatches = [{
    status: "pending",
    packingList: [
      { item: ITEM_MATTRESS, lineKey: smallKey, quantity: 1 },
      { item: ITEM_MATTRESS, lineKey: largeKey, quantity: 1 },
    ],
  }];
  const lines = computeRemainingLines(bill, dispatches);
  assert.equal(lines.find((l) => l.lineKey === smallKey).remainingQty, 0);
  assert.equal(lines.find((l) => l.lineKey === largeKey).remainingQty, 0);
});
