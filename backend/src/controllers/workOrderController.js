const asyncHandler = require("express-async-handler");
const WorkOrder = require("../models/WorkOrder");
const BillOfMaterial = require("../models/BillOfMaterial");
const Item = require("../models/Item");
const StockTransaction = require("../models/StockTransaction");
const withTransaction = require("../utils/withTransaction");
const { getOrCreateVariant, applyVariantStockDelta } = require("../services/itemVariants");
const { buildProductionPlan } = require("../utils/workOrderProduction");

const { STAGES } = WorkOrder;
// Real production sequence (excludes "cancelled", which can happen from any stage separately)
const STAGE_ORDER = ["planned", "raw_material_verification", "pasting", "stitching", "packing", "ready_to_dispatch"];

// @desc Create a multi-model Work Order - one entry per product model, each with its own
//       planned quantity (e.g. 12 different mattress models in a single production run) AND
//       its own manufacturing specification (length/width/thickness/density) - resolved into
//       an ItemVariant here so the eventual finished-goods credit on ready_to_dispatch lands
//       in the correct size-specific stock bucket, not a single merged total for the item.
const createWorkOrder = asyncHandler(async (req, res) => {
  const { workOrderNumber, items, scheduledDate } = req.body;

  const itemsWithVariant = await Promise.all((items || []).map(async (line) => {
    const variant = await getOrCreateVariant({
      item: line.item, length: line.length, width: line.width,
      thickness: line.thickness, density: line.density, unit: line.unit,
    });
    return { ...line, variant: variant._id };
  }));

  const wo = await WorkOrder.create({
    workOrderNumber, items: itemsWithVariant, scheduledDate, createdBy: req.user._id,
    currentStage: "planned",
    stageHistory: [{ stage: "planned", changedBy: req.user._id, changedAt: new Date(), remarks: "Work order created" }],
  });
  res.status(201).json(wo);
});

const getWorkOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.stage) filter.currentStage = req.query.stage;

  const orders = await WorkOrder.find(filter)
    .populate("items.item", "name unit productCode")
    .populate("items.variant", "sizeLabel")
    .populate("stageHistory.changedBy", "name")
    .sort({ scheduledDate: -1 });
  res.json(orders);
});

// @desc Full record view of one work order: line items + complete stage-by-stage history
const getWorkOrderById = asyncHandler(async (req, res) => {
  const wo = await WorkOrder.findById(req.params.id)
    .populate("items.item", "name unit productCode")
    .populate("items.variant", "sizeLabel")
    .populate("stageHistory.changedBy", "name")
    .populate("createdBy", "name");
  if (!wo) {
    res.status(404);
    throw new Error("Work order not found");
  }
  res.json(wo);
});

// @desc Cancel a work order from any non-final stage (no stock has moved yet before
//       "ready_to_dispatch", so cancelling earlier stages is always safe).
const cancelWorkOrder = asyncHandler(async (req, res) => {
  const wo = await WorkOrder.findById(req.params.id);
  if (!wo) {
    res.status(404);
    throw new Error("Work order not found");
  }
  if (wo.currentStage === "ready_to_dispatch" || wo.currentStage === "cancelled") {
    res.status(400);
    throw new Error(`Cannot cancel a work order that is already '${wo.currentStage}'`);
  }
  wo.currentStage = "cancelled";
  wo.stageHistory.push({ stage: "cancelled", changedBy: req.user._id, changedAt: new Date(), remarks: req.body.remarks });
  await wo.save();
  res.json(wo);
});

// @desc Advance a work order to its next production stage:
//   planned -> raw_material_verification -> pasting -> stitching -> packing -> ready_to_dispatch
//   Moving into "ready_to_dispatch" is the one stage that actually touches stock: it consumes
//   each model's BOM raw materials (scaled to that model's actual produced+scrap units) and
//   credits each model's finished-goods stock - stock sufficiency for every component across
//   every model is checked FIRST, so a blocked transition never partially consumes anything.
// @route POST /api/production/work-orders/:id/advance-stage
// @body { remarks?, itemsProduced?: [{ item, producedQty, scrapQty }] } - itemsProduced is
//   only required for the final transition into "ready_to_dispatch".
const advanceStage = asyncHandler(async (req, res) => {
  const wo = await WorkOrder.findById(req.params.id);
  if (!wo) {
    res.status(404);
    throw new Error("Work order not found");
  }
  if (wo.currentStage === "cancelled") {
    res.status(400);
    throw new Error("This work order is cancelled and cannot be advanced");
  }

  const currentIdx = STAGE_ORDER.indexOf(wo.currentStage);
  if (currentIdx === STAGE_ORDER.length - 1) {
    res.status(400);
    throw new Error("This work order is already at the final stage (Ready to Dispatch)");
  }
  const nextStage = STAGE_ORDER[currentIdx + 1];

  if (nextStage === "ready_to_dispatch") {
    const { itemsProduced } = req.body;

    // BOM lookup per DISTINCT item (not per line) - two lines with the same item share the
    // same BOM, no need to fetch it twice.
    const distinctItemIds = [...new Set(wo.items.map((l) => String(l.item)))];
    const boms = await BillOfMaterial.find({ finishedItem: { $in: distinctItemIds } });
    const bomComponentsByItemId = Object.fromEntries(boms.map((b) => [String(b.finishedItem), b.components]));

    // Matches `itemsProduced` to `wo.items` BY POSITION and builds the merged raw-material
    // consumption plan - see utils/workOrderProduction for the real bug this fixes: matching
    // by `item` id alone (`.find()`) let multiple sizes of the same item collapse onto the
    // first matching line's produced quantity.
    let consumptionPlan, lineUpdates;
    try {
      ({ consumptionPlan, lineUpdates } = buildProductionPlan(wo.items, itemsProduced, bomComponentsByItemId));
    } catch (err) {
      res.status(400);
      throw err;
    }

    // Verify stock sufficiency for every component BEFORE deducting any of them.
    for (const [componentId, qtyNeeded] of Object.entries(consumptionPlan)) {
      const componentItem = await Item.findById(componentId);
      if (!componentItem) {
        res.status(400);
        throw new Error(`Component item not found: ${componentId}`);
      }
      if (componentItem.stockQty < qtyNeeded) {
        res.status(400);
        throw new Error(`Insufficient stock for component "${componentItem.name}": available ${componentItem.stockQty}, required ${qtyNeeded}`);
      }
    }

    // All checks passed - now actually consume raw materials, credit finished-goods stock,
    // and save the work order's new stage, all as one atomic unit: a crash partway through
    // (e.g. after consuming raw material but before crediting output) can never happen.
    await withTransaction(async (session) => {
      for (const [componentId, qtyNeeded] of Object.entries(consumptionPlan)) {
        await Item.findByIdAndUpdate(componentId, { $inc: { stockQty: -qtyNeeded } }, { session });
        await StockTransaction.create([{
          type: "bom_consumption", item: componentId, quantity: qtyNeeded,
          referenceWorkOrder: wo._id, remarks: `Consumed for Work Order ${wo.workOrderNumber}`, createdBy: req.user._id,
        }], { session });
      }
      // ...and credit each model's finished-goods stock - to its OWN specification's variant,
      // not a single total shared by every size of this item (see services/itemVariants).
      for (const { index, producedQty, scrapQty } of lineUpdates) {
        const line = wo.items[index];
        line.producedQty = producedQty;
        line.scrapQty = scrapQty;
        await applyVariantStockDelta(line.variant, line.item, line.producedQty, session);
        await StockTransaction.create([{
          type: "production_output", item: line.item, variant: line.variant, quantity: line.producedQty,
          referenceWorkOrder: wo._id, remarks: `Produced via Work Order ${wo.workOrderNumber}`, createdBy: req.user._id,
        }], { session });
      }
      wo.completedDate = new Date();

      wo.currentStage = nextStage;
      wo.stageHistory.push({ stage: nextStage, changedBy: req.user._id, changedAt: new Date(), remarks: req.body.remarks });
      await wo.save({ session });
    });

    return res.json(wo);
  }

  wo.currentStage = nextStage;
  wo.stageHistory.push({ stage: nextStage, changedBy: req.user._id, changedAt: new Date(), remarks: req.body.remarks });
  await wo.save();
  res.json(wo);
});

module.exports = { createWorkOrder, getWorkOrders, getWorkOrderById, advanceStage, cancelWorkOrder, STAGE_ORDER };
