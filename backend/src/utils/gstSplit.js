// Decides which GST head(s) actually apply to a bill's lines: CGST+SGST for an intra-state
// transaction (party is in the same state as the company), or IGST for inter-state - never
// both. An Item's sgst/cgst/igst are snapshotted from its HSN, where
// `igst = sgst + cgst` BY DESIGN (see models/HsnSac.js's pre-save hook) - they are two
// ALTERNATIVE ways of expressing the SAME total tax rate, not three taxes to add together.
// Summing all three (as every Sales/Purchase/Credit Note/Debit Note line previously did)
// silently doubled the GST on every single bill.
//
// Set COMPANY_STATE in .env to the state your business is GST-registered in, e.g.
// `COMPANY_STATE=Maharashtra`. Until it's set, every transaction is treated as inter-state
// (IGST only) - the TOTAL tax amount is still correct either way (sgst+cgst and igst are the
// same rate), this only affects which GST head(s) the amount is booked under for return filing.
const COMPANY_STATE = (process.env.COMPANY_STATE || "").trim().toLowerCase();

// @param items - line items, each with sgst/cgst/igst already snapshotted from the Item/HSN
// @param partyState - the dealer/supplier's state (prefer placeOfSupply, then gstState, then state)
// @returns the same items with exactly one GST head populated per line (igst=0 for
//   intra-state, or sgst=cgst=0 for inter-state) - ready for computeLineAmounts/splitTaxes.
const applyGstSplit = (items, partyState) => {
  const isIntraState = !!COMPANY_STATE && !!partyState && partyState.trim().toLowerCase() === COMPANY_STATE;
  return items.map((line) => (
    isIntraState
      ? { ...line, igst: 0 } // intra-state: keep CGST+SGST, no IGST
      : { ...line, sgst: 0, cgst: 0 } // inter-state (or company state not configured): IGST only
  ));
};

// Picks the most specific state field available on a Ledger for place-of-supply purposes.
const resolvePartyState = (ledger) => ledger?.placeOfSupply || ledger?.gstState || ledger?.state || "";

module.exports = { applyGstSplit, resolvePartyState, COMPANY_STATE };
