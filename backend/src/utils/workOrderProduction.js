// Pure logic for matching `itemsProduced` (submitted when advancing a Work Order to
// "ready_to_dispatch") to the Work Order's own lines, and building the BOM raw-material
// consumption plan from that pairing - kept DB-free (BOM components passed in as plain data)
// so it's directly unit-testable - see tests/workOrderProduction.test.js. See
// workOrderController.advanceStage for the Mongoose-fetching wrapper, and the real bug this
// fixes: entries were previously matched to lines by `item` id alone via `.find()`, which
// always returns the FIRST matching element - so when the same item appeared on multiple
// lines at different sizes (models/WorkOrder.js's per-line `variant`), every size silently
// received the first line's produced/scrap quantity (and its BOM consumption), not its own.
//
// Entries are now paired with lines strictly BY POSITION, which is how the frontend always
// builds this array (see production/page.tsx's confirmFinalStage, which maps over the exact
// same `items` array fetched for the work order). The item-id equality check below is a
// sanity guard against a malformed or out-of-order payload, not the matching mechanism itself.
//
// @param items - the Work Order's own `items` array (models/WorkOrder.js), each with at
//   least `item` (id) and `variant` (id or null).
// @param itemsProduced - the submitted array, same length/order as `items`, each
//   `{ item, producedQty, scrapQty? }`.
// @param bomComponentsByItemId - map of finishedItemId (string) -> BOM `components` array
//   (`[{ item, quantityRequired }]`), or undefined/missing for an item with no BOM.
// @returns { consumptionPlan, lineUpdates } - consumptionPlan maps componentItemId -> total
//   qty needed across every line (merged, since two models can share a raw material);
//   lineUpdates is one entry per line, in the same order, with its OWN producedQty/scrapQty.
// @throws Error (plain, with a user-facing message) on a length mismatch, a missing
//   producedQty, or a line/entry item-id mismatch - the caller is expected to set the HTTP
//   status before re-throwing, same as every other validation error in this codebase.
const buildProductionPlan = (items, itemsProduced, bomComponentsByItemId = {}) => {
  if (!Array.isArray(itemsProduced) || itemsProduced.length !== items.length) {
    throw new Error("producedQty/scrapQty must be provided for every model/item line to move to Ready to Dispatch");
  }

  const consumptionPlan = {};
  const lineUpdates = [];
  for (let i = 0; i < items.length; i++) {
    const line = items[i];
    const p = itemsProduced[i];
    if (!p || p.producedQty === undefined) {
      throw new Error(`Missing produced quantity for line ${i + 1} of this work order`);
    }
    if (String(p.item) !== String(line.item)) {
      throw new Error(`Produced-quantity entry ${i + 1} does not match this work order's line ${i + 1} - the lines are out of order`);
    }

    const producedQty = Number(p.producedQty);
    const scrapQty = Number(p.scrapQty || 0);
    lineUpdates.push({ index: i, item: line.item, variant: line.variant, producedQty, scrapQty });

    const components = bomComponentsByItemId[String(line.item)];
    if (components) {
      const totalUnits = producedQty + scrapQty;
      for (const comp of components) {
        const key = String(comp.item);
        consumptionPlan[key] = (consumptionPlan[key] || 0) + comp.quantityRequired * totalUnits;
      }
    }
  }

  return { consumptionPlan, lineUpdates };
};

module.exports = { buildProductionPlan };
