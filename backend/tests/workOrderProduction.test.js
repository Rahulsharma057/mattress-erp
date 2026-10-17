// Regression tests for the Work Order size-wise produced-quantity bug (see
// utils/workOrderProduction.js and workOrderController.advanceStage).
//
// Root cause being guarded against: when a Work Order has the same item on multiple lines at
// different sizes, `itemsProduced` entries were matched to lines by `item` id alone via
// `.find()`, which always returns the FIRST matching element - so every size of that item
// silently received the FIRST line's produced/scrap quantity (and its BOM consumption),
// never its own. Example from the real bug report: Mattress A at 72x36 (10), 72x48 (5),
// 72x60 (3) - expected total 18, each size independent; the bug would assign 10 (or whatever
// the first line's value was) to all three.
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildProductionPlan } = require("../src/utils/workOrderProduction");

const ITEM_MATTRESS_A = "aaaa00000000000000000001";
const ITEM_FOAM = "aaaa00000000000000000002";
const VARIANT_72x36 = "bbbb00000000000000000001";
const VARIANT_72x48 = "bbbb00000000000000000002";
const VARIANT_72x60 = "bbbb00000000000000000003";
const COMPONENT_FOAM_BLOCK = "cccc00000000000000000001";
const COMPONENT_FABRIC = "cccc00000000000000000002";

// The exact test scenario from the bug report: Mattress A at three sizes, different
// quantities, plus an unrelated item to confirm nothing else is disturbed.
const woItems = () => ([
  { item: ITEM_MATTRESS_A, variant: VARIANT_72x36 },
  { item: ITEM_MATTRESS_A, variant: VARIANT_72x48 },
  { item: ITEM_MATTRESS_A, variant: VARIANT_72x60 },
  { item: ITEM_FOAM, variant: null },
]);

test("each size of the same item keeps its OWN produced/scrap quantity - the core bug", () => {
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 10, scrapQty: 0 },
    { item: ITEM_MATTRESS_A, producedQty: 5, scrapQty: 0 },
    { item: ITEM_MATTRESS_A, producedQty: 3, scrapQty: 0 },
    { item: ITEM_FOAM, producedQty: 7, scrapQty: 1 },
  ];
  const { lineUpdates } = buildProductionPlan(woItems(), itemsProduced, {});

  assert.equal(lineUpdates.length, 4);
  assert.equal(lineUpdates[0].producedQty, 10, "72x36 must keep its own 10, not be overwritten by another size");
  assert.equal(lineUpdates[1].producedQty, 5, "72x48 must keep its own 5 - this is exactly what the bug collapsed to 10");
  assert.equal(lineUpdates[2].producedQty, 3, "72x60 must keep its own 3 - this is exactly what the bug collapsed to 10");
  assert.equal(lineUpdates[3].producedQty, 7, "the unrelated item must be completely unaffected");

  const total = lineUpdates.filter((l) => l.item === ITEM_MATTRESS_A).reduce((s, l) => s + l.producedQty, 0);
  assert.equal(total, 18, "total across all three sizes must be 10+5+3=18, never 18 assigned to each or 10 copied to all");
});

test("lineUpdates preserve each line's own variant, never merging different sizes", () => {
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 10 },
    { item: ITEM_MATTRESS_A, producedQty: 5 },
    { item: ITEM_MATTRESS_A, producedQty: 3 },
    { item: ITEM_FOAM, producedQty: 7 },
  ];
  const { lineUpdates } = buildProductionPlan(woItems(), itemsProduced, {});
  assert.deepEqual(lineUpdates.map((l) => l.variant), [VARIANT_72x36, VARIANT_72x48, VARIANT_72x60, null]);
});

test("BOM consumption is calculated per-line and merged correctly across sizes sharing a component", () => {
  // All three Mattress A sizes share the same BOM (foam block + fabric), scaled to each
  // size's own produced+scrap units - this is the scenario where the old item-only matching
  // would have scaled EVERY line's consumption by the first line's quantity instead.
  const boms = {
    [ITEM_MATTRESS_A]: [
      { item: COMPONENT_FOAM_BLOCK, quantityRequired: 2 },
      { item: COMPONENT_FABRIC, quantityRequired: 1 },
    ],
  };
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 10, scrapQty: 0 }, // 72x36: 10 units
    { item: ITEM_MATTRESS_A, producedQty: 5, scrapQty: 1 },  // 72x48: 5 produced + 1 scrap = 6 units
    { item: ITEM_MATTRESS_A, producedQty: 3, scrapQty: 0 },  // 72x60: 3 units
    { item: ITEM_FOAM, producedQty: 7, scrapQty: 0 },
  ];
  const { consumptionPlan } = buildProductionPlan(woItems(), itemsProduced, boms);

  // Total mattress units consuming the shared BOM = 10 + 6 + 3 = 19
  assert.equal(consumptionPlan[COMPONENT_FOAM_BLOCK], 19 * 2, "foam block consumption must scale to EACH size's own units, summed - not 10 units x 3 lines");
  assert.equal(consumptionPlan[COMPONENT_FABRIC], 19 * 1);
});

test("duplicate identical lines (same item AND same variant) are each matched to their own entry, not merged", () => {
  const items = [
    { item: ITEM_MATTRESS_A, variant: VARIANT_72x36 },
    { item: ITEM_MATTRESS_A, variant: VARIANT_72x36 }, // exact duplicate size, e.g. two separate planned batches
  ];
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 4 },
    { item: ITEM_MATTRESS_A, producedQty: 6 },
  ];
  const { lineUpdates } = buildProductionPlan(items, itemsProduced, {});
  assert.equal(lineUpdates[0].producedQty, 4);
  assert.equal(lineUpdates[1].producedQty, 6, "the second identical-size line must keep its own value, not copy the first");
});

test("rejects a length mismatch instead of silently proceeding with partial data", () => {
  assert.throws(() => buildProductionPlan(woItems(), [{ item: ITEM_MATTRESS_A, producedQty: 10 }], {}),
    /producedQty\/scrapQty must be provided for every/);
});

test("rejects a missing producedQty on any one line", () => {
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 10 },
    { item: ITEM_MATTRESS_A }, // missing producedQty
    { item: ITEM_MATTRESS_A, producedQty: 3 },
    { item: ITEM_FOAM, producedQty: 7 },
  ];
  assert.throws(() => buildProductionPlan(woItems(), itemsProduced, {}), /Missing produced quantity for line 2/);
});

test("rejects an out-of-order payload (item id mismatch at a position) instead of silently misattributing", () => {
  const itemsProduced = [
    { item: ITEM_MATTRESS_A, producedQty: 10 },
    { item: ITEM_FOAM, producedQty: 7 }, // swapped with line 4 - wrong item at this position
    { item: ITEM_MATTRESS_A, producedQty: 3 },
    { item: ITEM_MATTRESS_A, producedQty: 5 },
  ];
  assert.throws(() => buildProductionPlan(woItems(), itemsProduced, {}), /does not match this work order's line 2/);
});

test("an item with no BOM contributes nothing to the consumption plan (not an error)", () => {
  const { consumptionPlan } = buildProductionPlan(
    [{ item: ITEM_FOAM, variant: null }],
    [{ item: ITEM_FOAM, producedQty: 7, scrapQty: 0 }],
    {},
  );
  assert.deepEqual(consumptionPlan, {});
});
