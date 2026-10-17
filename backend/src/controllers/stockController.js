const asyncHandler = require("express-async-handler");
const StockTransaction = require("../models/StockTransaction");
const Item = require("../models/Item");
const withTransaction = require("../utils/withTransaction");
const paginate = require("../utils/paginate");

// Applies a signed quantity delta to an item's stockQty. Positive = stock in, negative = stock out.
// Pass `session` to make this write part of an in-progress Mongo transaction - see utils/withTransaction.
const applyStockDelta = async (itemId, delta, session) => {
  await Item.findByIdAndUpdate(itemId, { $inc: { stockQty: delta } }, { session });
};

// @desc Manual stock movement: receive / scrap issue / scrap return / stock adjustment.
//   A decrease (scrap issue, or a "decrease" adjustment) is blocked if it would take the
//   item's stock negative - previously scrap_issue had no such check at all.
const createStockTransaction = asyncHandler(async (req, res) => {
  const { type, item, quantity, remarks, direction } = req.body;

  let delta;
  if (type === "stock_adjustment") {
    delta = direction === "decrease" ? -quantity : quantity;
  } else {
    const deltaMap = { receive: quantity, scrap_return: quantity, scrap_issue: -quantity };
    if (!(type in deltaMap)) {
      res.status(400);
      throw new Error("This endpoint only accepts type: receive, scrap_issue, scrap_return, stock_adjustment. Use Work Orders for production consumption/output.");
    }
    delta = deltaMap[type];
  }

  if (delta < 0) {
    const itemDoc = await Item.findById(item);
    if (!itemDoc) {
      res.status(400);
      throw new Error("Item not found");
    }
    if (itemDoc.stockQty + delta < 0) {
      res.status(400);
      throw new Error(`Cannot reduce "${itemDoc.name}" stock below zero: available ${itemDoc.stockQty}, requested reduction ${-delta}`);
    }
  }

  const txn = await withTransaction(async (session) => {
    const [created] = await StockTransaction.create([{
      type, item, quantity, remarks,
      direction: type === "stock_adjustment" ? direction : undefined,
      createdBy: req.user._id,
    }], { session });
    await applyStockDelta(item, delta, session);
    return created;
  });

  res.status(201).json(txn);
});

// @desc List Stock Transactions. No `page` param keeps the old plain-array shape (existing
//       callers unaffected); the Stock screen passes page/limit/search explicitly for a real
//       paginated, server-searched page - same pattern as getSalesBills/getDispatches.
// @route GET /api/production/stock?item=&type=&search=&page=&limit=
const getStockTransactions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.item) filter.item = req.query.item;
  if (req.query.type) filter.type = req.query.type;

  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "i");
    // Item name needs its own lookup first since Mongo can't regex-match a populated field
    // in the same find(); remarks matches directly.
    const matchingItems = await Item.find({ name: re }).select("_id");
    filter.$or = [{ remarks: re }, { item: { $in: matchingItems.map((i) => i._id) } }];
  }

  const query = StockTransaction.find(filter).populate("item", "name unit").sort({ createdAt: -1 });

  if (!req.query.page) {
    const txns = await query.limit(500);
    return res.json(txns);
  }

  const { data, pagination } = await paginate(query, req.query);
  res.json({ transactions: data, pagination });
});

module.exports = { createStockTransaction, getStockTransactions, applyStockDelta };
