const asyncHandler = require("express-async-handler");
const Dispatch = require("../models/Dispatch");
const SalesBill = require("../models/SalesBill");
const Ledger = require("../models/Ledger");
const Voucher = require("../models/Voucher");
const generateBillNumber = require("../utils/generateBillNumber");
const paginate = require("../utils/paginate");
const { resolveBillTo } = require("../utils/billToSnapshot");
const { generateDispatchInvoicePDF } = require("../services/pdfGenerator");
const { computeRemainingLines } = require("../utils/dispatchQuantities");
const { computePaymentReceivedInfo } = require("../utils/paymentReceivedInfo");
const { getOrCreateSettings } = require("./companySettingsController");

// "Payment Received In" - see utils/paymentReceivedInfo for the actual computation and why
// `counterLedger` is the right field. Only `voucherType: "receipt"` vouchers whose
// `allocations` include THIS bill are ever fetched, so a receipt for a different bill can
// never leak in, and a cancelled/reversed receipt (hard-deleted, see voucherController.
// deleteVoucher) can never appear here either - nothing further to filter.
const resolvePaymentReceivedInfo = async (billId) => {
  const vouchers = await Voucher.find({ voucherType: "receipt", "allocations.salesBill": billId })
    .populate({
      path: "counterLedger",
      select: "name accountGroup bankName bankAccountHolderName bankAccountNumber bankIfscCode",
      populate: { path: "accountGroup", select: "name" },
    });
  return computePaymentReceivedInfo(billId, vouchers);
};

// Builds this dispatch's own Ship To snapshot - copied from the dealer's CURRENT Ledger
// details when sameAsBillTo (default), or from the caller's own fields when the shipping
// address for this specific dispatch is different. Either way the result is a snapshot
// frozen onto the Dispatch document, never a live reference - see the model's field comment.
const buildShipTo = (shipToInput, dealer) => {
  const sameAsBillTo = shipToInput?.sameAsBillTo !== false;
  if (sameAsBillTo) {
    return {
      sameAsBillTo: true, name: dealer.name, dealerCode: dealer.dealerCode, address: dealer.address,
      city: dealer.city, state: dealer.state, pincode: dealer.pincode, gstin: dealer.gstin, mobile: dealer.mobile,
    };
  }
  return {
    sameAsBillTo: false,
    name: shipToInput?.name || dealer.name,
    dealerCode: shipToInput?.dealerCode,
    address: shipToInput?.address,
    city: shipToInput?.city,
    state: shipToInput?.state,
    pincode: shipToInput?.pincode,
    gstin: shipToInput?.gstin,
    mobile: shipToInput?.mobile,
  };
};

// Builds { lineKey, item, variant, name, unit, sizeLabel, billedQty, dispatchedQty,
// remainingQty } for EVERY line of the bill independently - see utils/dispatchQuantities for
// why this must be per-line (lineKey) rather than per-item: a bill with two lines of the same
// item in different sizes must never have one size's dispatch silently consume the other's
// allowance. `bill.items.variant` should be populated with at least `sizeLabel` so the result
// can disambiguate same-item lines for display.
const getRemainingLines = async (bill) => {
  const dispatches = await Dispatch.find({ salesBill: bill._id });
  return computeRemainingLines(bill, dispatches);
};

// @desc List confirmed Sales Bills that still have something left to dispatch, with a
//       per-line remaining quantity - this is what the "New Dispatch" screen should use
//       instead of the raw Sales Bill list, so it can never build a packing list that
//       exceeds what is actually pending.
// @route GET /api/dispatch/dispatchable-bills
const getDispatchableBills = asyncHandler(async (req, res) => {
  const bills = await SalesBill.find({ billType: { $ne: "sale_order" }, status: { $in: ["confirmed", "modified"] } })
    .populate("party", "name")
    .populate("items.item", "name unit")
    .populate("items.variant", "sizeLabel")
    .sort({ date: -1 });

  const result = [];
  for (const bill of bills) {
    const lines = await getRemainingLines(bill);
    const remainingLines = lines.filter((l) => l.remainingQty > 0);
    if (remainingLines.length > 0) {
      result.push({ _id: bill._id, billNumber: bill.billNumber, party: bill.party, items: lines });
    }
  }
  res.json(result);
});

// @desc Create a dispatch (full or partial) against a Sales Bill. Every packing-list line is
//       capped at what remains undispatched for that EXACT bill line (see
//       utils/dispatchQuantities) - never allow dispatch to exceed the pending quantity, and
//       never let dispatching one size of an item draw down a different size's allowance.
//
//       Each incoming packingList entry should carry the `lineKey` the client got from
//       getDispatchableBills/getRemainingLines, identifying exactly which bill line it's
//       for. A legacy/older caller that only sends `{item, quantity}` (no lineKey) is still
//       accepted - it falls back to the old item-level aggregate check across every line of
//       that item, which is correct whenever the item only has one line, and a conservative
//       (not silently wrong) approximation otherwise.
const createDispatch = asyncHandler(async (req, res) => {
  const { salesBill, party, packingList, dispatchType, shipTo, transport } = req.body;

  const bill = await SalesBill.findById(salesBill)
    .populate("items.item", "name unit")
    .populate("items.variant", "sizeLabel");
  if (!bill) {
    res.status(400);
    throw new Error("Sales bill not found");
  }
  if (bill.status === "cancelled") {
    res.status(400);
    throw new Error("Cannot dispatch against a cancelled sales bill");
  }

  const dealer = await Ledger.findById(party);
  if (!dealer) {
    res.status(400);
    throw new Error("Party not found");
  }

  const existingDispatches = await Dispatch.find({ salesBill: bill._id });
  const remainingLines = computeRemainingLines(bill, existingDispatches);
  const lineByKey = new Map(remainingLines.map((l) => [l.lineKey, l]));
  // Legacy fallback view: remaining quantity aggregated across every line of an item, for a
  // caller that doesn't send a lineKey at all (see the function comment above).
  const aggregateByItem = new Map();
  for (const l of remainingLines) {
    aggregateByItem.set(l.item, (aggregateByItem.get(l.item) || 0) + l.remainingQty);
  }

  const resolvedPackingList = [];
  for (const entry of packingList) {
    const itemKey = String(entry.item);
    if (entry.lineKey) {
      const line = lineByKey.get(entry.lineKey);
      if (!line || line.item !== itemKey) {
        res.status(400);
        throw new Error("One of the packing list lines does not match this sales bill");
      }
      if (entry.quantity > line.remainingQty) {
        const sizeNote = line.sizeLabel ? ` (${line.sizeLabel})` : "";
        res.status(400);
        throw new Error(`Cannot dispatch ${entry.quantity} of "${line.name}"${sizeNote}: only ${line.remainingQty} remains pending on ${bill.billNumber}`);
      }
      // Decrement in-memory so two packingList entries in THIS SAME request against the same
      // line can't double-spend the same remaining quantity.
      line.remainingQty -= entry.quantity;
      resolvedPackingList.push({ item: entry.item, variant: line.variant || undefined, lineKey: entry.lineKey, quantity: entry.quantity });
    } else {
      const available = aggregateByItem.get(itemKey);
      if (available === undefined) {
        res.status(400);
        throw new Error("One of the items in the packing list is not on this sales bill");
      }
      if (entry.quantity > available) {
        res.status(400);
        throw new Error(`Cannot dispatch ${entry.quantity} of this item: only ${available} remains pending on ${bill.billNumber}`);
      }
      aggregateByItem.set(itemKey, available - entry.quantity);
      resolvedPackingList.push({ item: entry.item, quantity: entry.quantity });
    }
  }

  const dispatchNumber = await generateBillNumber(Dispatch, "DSP", "dispatchNumber");

  const dispatch = await Dispatch.create({
    dispatchNumber, salesBill, party, packingList: resolvedPackingList, dispatchType, dispatchedBy: req.user._id,
    shipTo: buildShipTo(shipTo, dealer),
    // Every field here is optional and left blank when not provided - never fabricated.
    // Recording an E-Way Bill number is just that: this ERP has no generation/integration.
    transport: transport || undefined,
  });

  res.status(201).json(dispatch);
});

// @desc Edit Ship To / Transport details for an already-created dispatch - these are often
//       only known once the vehicle actually arrives, after the dispatch record itself was
//       created with just the packing list. Deliberately narrow: never touches packingList,
//       salesBill, party or status (see the separate, existing updateDispatchStatus below).
// @route PUT /api/dispatch/:id/details
const updateDispatchDetails = asyncHandler(async (req, res) => {
  const dispatch = await Dispatch.findById(req.params.id);
  if (!dispatch) {
    res.status(404);
    throw new Error("Dispatch not found");
  }

  if (req.body.shipTo) {
    const dealer = await Ledger.findById(dispatch.party);
    dispatch.shipTo = buildShipTo(req.body.shipTo, dealer);
  }
  if (req.body.transport) {
    dispatch.transport = req.body.transport;
  }

  await dispatch.save();
  res.json(dispatch);
});

// @desc Download/print the full Tax Invoice (Bill To + Ship To + Transport Details + every
//       item on the underlying Sales Bill) for one dispatch. The item table always reflects
//       the full Sales Bill, not just this dispatch's packing list - same as any real tax
//       invoice; the packing list/dispatch is the separate record of partial physical
//       movement against it. Read-only: never creates or modifies a bill or dispatch.
// @route GET /api/dispatch/:id/invoice?copy=original|duplicate|triplicate
const getDispatchInvoice = asyncHandler(async (req, res) => {
  const dispatch = await Dispatch.findById(req.params.id);
  if (!dispatch) {
    res.status(404);
    throw new Error("Dispatch not found");
  }

  const bill = await SalesBill.findById(dispatch.salesBill)
    .populate("party")
    .populate({ path: "items.item", select: "name unit productCode hsn", populate: { path: "hsn", select: "code shortName" } })
    .populate("items.variant", "sizeLabel isUnspecified");
  if (!bill) {
    res.status(404);
    throw new Error("The sales bill behind this dispatch was not found");
  }

  const copyLabelMap = { original: "Original for Buyer", duplicate: "Duplicate for Transporter", triplicate: "Triplicate for Assessee" };
  const copyLabel = copyLabelMap[req.query.copy] || copyLabelMap.original;
  const company = await getOrCreateSettings();
  const paymentInfo = await resolvePaymentReceivedInfo(bill._id);

  const pdfBuffer = await generateDispatchInvoicePDF(bill, dispatch, { billTo: resolveBillTo(bill), copyLabel, company, paymentInfo });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${bill.billNumber}-${dispatch.dispatchNumber}.pdf"`);
  res.send(pdfBuffer);
});

// @desc List Dispatches. No `page` param keeps the old plain-array shape (existing callers
//       unaffected); the Dispatch screen passes page/limit/search explicitly for a real
//       paginated, server-searched page - same pattern as getSalesBills/getPurchaseBills.
// @route GET /api/dispatch?status=&dispatchType=&party=&search=&page=&limit=
const getDispatches = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.dispatchType) filter.dispatchType = req.query.dispatchType;
  if (req.query.party) filter.party = req.query.party;

  if (req.query.search) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "i");
    const matchingParties = await Ledger.find({ name: re }).select("_id");
    filter.$or = [
      { dispatchNumber: re },
      { party: { $in: matchingParties.map((p) => p._id) } },
    ];
  }

  const query = Dispatch.find(filter)
    .populate("party", "name")
    .populate("salesBill", "billNumber")
    .populate("packingList.item", "name unit")
    .populate("packingList.variant", "sizeLabel")
    .sort({ dispatchDate: -1 });

  if (!req.query.page) {
    const dispatches = await query.limit(500);
    return res.json(dispatches);
  }

  const { data, pagination } = await paginate(query, req.query);
  res.json({ dispatches: data, pagination });
});

// @desc Update dispatch status. Marking a dispatch "returned" does NOT reverse stock or the
//       dealer's ledger - it only frees up that quantity to be dispatched again (see
//       computeRemainingLines, which skips "returned" dispatches entirely). A real sales
//       return (stock back in, Credit Note against the dealer) is a separate accounting flow,
//       not implemented by this endpoint.
const updateDispatchStatus = asyncHandler(async (req, res) => {
  const dispatch = await Dispatch.findById(req.params.id);
  if (!dispatch) {
    res.status(404);
    throw new Error("Dispatch not found");
  }
  dispatch.status = req.body.status;
  if (req.body.status === "delivered") dispatch.deliveredDate = new Date();
  await dispatch.save();
  res.json(dispatch);
});

module.exports = { getDispatchableBills, createDispatch, getDispatches, updateDispatchStatus, updateDispatchDetails, getDispatchInvoice };
