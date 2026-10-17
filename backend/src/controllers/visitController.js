const asyncHandler = require("express-async-handler");
const Visit = require("../models/Visit");
const Ledger = require("../models/Ledger");
const { createCollectionForVisit, validateCollectionInput } = require("./collectionController");

// @desc Log a field visit. If a collection amount is recorded, this only creates a
//       PENDING_APPROVAL Collection - it does NOT touch the ledger or post any voucher.
//       An Accountant/Admin/Super Admin must approve it first (see collectionController.
//       reviewCollection) before it becomes a Receipt voucher and the outstanding drops.
const createVisit = asyncHandler(async (req, res) => {
  const salesman = req.user.role === "salesman" ? req.user._id : req.body.salesman;
  const { party, location, orderPlaced, collectionAmount = 0, paymentMode, allocations, remarks } = req.body;

  // A salesman can only log a visit (and collect money) against a dealer actually assigned
  // to THEM right now - the frontend's "Party Visited" picker already only offers their own
  // dealers, but that's just UI; without this, anyone could still POST a different dealer's
  // id directly and claim a visit/collection they were never assigned. Admin/Super Admin are
  // exempt - they may be logging a visit on a salesman's behalf (see req.body.salesman above).
  if (req.user.role === "salesman") {
    const dealer = await Ledger.findById(party);
    if (!dealer || String(dealer.salesman || "") !== String(req.user._id)) {
      res.status(403);
      throw new Error("This dealer is not assigned to you - visits and collections can only be logged for your own assigned dealers");
    }
  }

  // Validate the allocation (if any) BEFORE creating the Visit - so a bad allocation never
  // leaves an orphan visit with no linked collection behind.
  if (collectionAmount > 0 && allocations?.length) {
    try {
      await validateCollectionInput(party, collectionAmount, allocations);
    } catch (err) {
      res.status(400);
      throw err;
    }
  }

  const visit = await Visit.create({ salesman, party, location, orderPlaced, collectionAmount, remarks });

  if (collectionAmount > 0) {
    const collection = await createCollectionForVisit({
      visit, party, salesman, amount: collectionAmount, paymentMode, allocations, remarks, submittedBy: req.user._id,
    });
    visit.collectionRecord = collection._id;
    await visit.save();
  }

  res.status(201).json(visit);
});

const getVisits = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "salesman") filter.salesman = req.user._id;
  else if (req.query.salesman) filter.salesman = req.query.salesman;
  if (req.query.party) filter.party = req.query.party;

  const visits = await Visit.find(filter)
    .populate("party", "name address")
    .populate("salesman", "name")
    .populate("collectionRecord", "status amount approvedAt voucherId")
    .sort({ visitTime: -1 });
  res.json(visits);
});

module.exports = { createVisit, getVisits };
