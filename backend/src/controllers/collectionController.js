const asyncHandler = require("express-async-handler");
const Collection = require("../models/Collection");
const Ledger = require("../models/Ledger");
const Voucher = require("../models/Voucher");
const generateBillNumber = require("../utils/generateBillNumber");
const { applyLedgerDelta } = require("./voucherController");
const { validateAllocations, clipAllocationsToCurrentOutstanding } = require("../services/outstandingCalc");
const { resolveSettlementLedgerName } = require("../utils/paymentModeLedgers");
const withTransaction = require("../utils/withTransaction");

// Internal helper - called from visitController.createVisit when a visit logs a collection
// amount. Creates a PENDING_APPROVAL collection only; never touches the ledger. Allocation
// validity (if any) must already have been checked by validateCollectionInput below, BEFORE
// the caller creates the Visit document - so a bad allocation never leaves behind an orphan
// visit with no collection.
const createCollectionForVisit = async ({ visit, party, salesman, amount, paymentMode, remarks, allocations, submittedBy }) => {
  return Collection.create({
    visit: visit._id,
    party,
    salesman,
    date: visit.visitTime,
    amount,
    paymentMode: paymentMode || "cash",
    remarks,
    allocations: allocations || [],
    submittedBy,
    status: "pending_approval",
  });
};

// Called by visitController.createVisit before it creates the Visit - throws (400 via
// asyncHandler) if the requested allocation is invalid, so nothing gets persisted at all.
const validateCollectionInput = async (party, amount, allocations) => {
  await validateAllocations(party, amount, allocations);
};

const getCollections = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "salesman") filter.salesman = req.user._id;
  else if (req.query.salesman) filter.salesman = req.query.salesman;
  if (req.query.party) filter.party = req.query.party;
  if (req.query.status) filter.status = req.query.status;

  const collections = await Collection.find(filter)
    .populate("party", "name dealerCode")
    .populate("salesman", "name")
    .populate("approvedBy", "name")
    .populate("rejectedBy", "name")
    .populate("allocations.salesBill", "billNumber")
    .sort({ date: -1 });
  res.json(collections);
});

// @desc Approve or reject a salesman's field collection.
//   Approve: posts exactly ONE Receipt voucher (settlement ledger Dr, Dealer ledger Cr),
//   which is what actually reduces the dealer's outstanding. Rejecting leaves the ledger
//   untouched entirely - the salesman's claimed collection simply never happened financially.
// @route PUT /api/salesman/collections/:id/review
// @body { status: "approved" | "rejected", rejectionReason? }
const reviewCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id);
  if (!collection) {
    res.status(404);
    throw new Error("Collection not found");
  }

  if (collection.status !== "pending_approval") {
    res.status(400);
    throw new Error(`This collection is already '${collection.status}' and cannot be reviewed again`);
  }

  const { status, rejectionReason } = req.body;

  if (status === "rejected") {
    collection.status = "rejected";
    collection.rejectedBy = req.user._id;
    collection.rejectedAt = new Date();
    collection.rejectionReason = rejectionReason;
    await collection.save();
    return res.json(collection);
  }

  // status === "approved"
  // Re-check the allocation against what's outstanding RIGHT NOW - another collection
  // against the same invoice may have been approved since this one was submitted. Any part
  // that no longer fits its invoice quietly falls back to unallocated/on-account; this never
  // blocks approval because the actual ledger posting below is unaffected by allocation.
  collection.allocations = await clipAllocationsToCurrentOutstanding(collection.party, collection.allocations);

  const settlementLedgerName = resolveSettlementLedgerName(collection.paymentMode);
  const settlementLedger = await Ledger.findOne({ name: settlementLedgerName });
  if (!settlementLedger) {
    res.status(500);
    throw new Error(`Cannot approve: settlement ledger "${settlementLedgerName}" is not set up. Run the masters seed or create it under Ledger master first.`);
  }

  // Voucher + both ledger legs + the collection's own approved status all commit together -
  // a crash partway through can never leave a voucher posted without the collection marked
  // approved (or vice versa), which is exactly the "no duplicate posting on retry" guarantee
  // the approval flow depends on.
  await withTransaction(async (session) => {
    const voucherNumber = await generateBillNumber(Voucher, "RCP", "voucherNumber");
    const [voucher] = await Voucher.create([{
      voucherType: "receipt",
      voucherNumber,
      date: new Date(),
      ledger: collection.party,
      amount: collection.amount,
      drCr: "credit", // dealer's balance (a debtor) goes down
      counterLedger: settlementLedger._id,
      narration: `Field collection by salesman - approved${collection.referenceNumber ? ` (ref ${collection.referenceNumber})` : ""}`,
      paymentMode: collection.paymentMode,
      referenceNumber: collection.referenceNumber,
      source: "collection_approval",
      // Copied onto the voucher because outstandingCalc reads allocations from Vouchers, not
      // from Collection - this is what makes a field-collection receipt and a direct
      // accountant-entered receipt reconcile identically against invoice outstanding.
      allocations: collection.allocations,
      createdBy: req.user._id,
    }], { session });
    await applyLedgerDelta(collection.party, collection.amount, "credit", session);
    await applyLedgerDelta(settlementLedger._id, collection.amount, "debit", session);

    collection.status = "approved";
    collection.approvedBy = req.user._id;
    collection.approvedAt = new Date();
    collection.voucherId = voucher._id;
    await collection.save({ session });
  });

  res.json(collection);
});

module.exports = { createCollectionForVisit, validateCollectionInput, getCollections, reviewCollection };
