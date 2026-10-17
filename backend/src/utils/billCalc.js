const { applyGstSplit } = require("./gstSplit");

// Round to paise (2 decimals) - the standard precision for GST invoicing. Used everywhere
// money is rounded in this file and in services/accountingPostings, so a bill's total and
// its tax-head breakdown are always rounded the same way.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Shared qty*rate+tax line/total calculation - used by Sales Bill, Purchase Bill, and
// Credit/Debit Notes so a bill's total is computed identically everywhere. Never trust a
// frontend-computed total - the backend always recomputes it from the line items itself.
//
// Rounds to paise, not whole rupees (a previous version did `Math.round(base+taxAmount)`,
// which rounds to the nearest rupee per line - combined with accountingPostings.splitTaxes
// rounding its own aggregate to paise, the two numbers could end up genuinely unequal,
// posting a voucher where Dr != Cr by a few rupees, since splitTaxes.base is now DERIVED
// from this totalAmount - see that file).
//
// @param partyState - the dealer/supplier's state (see gstSplit.resolvePartyState). When
//   given, applies the correct GST split FIRST (CGST+SGST xor IGST, never both - see
//   gstSplit.js for why summing all three was a real, severe bug) before computing amounts.
//   Omit only for a caller that has no party context at all.
const computeLineAmounts = (items, partyState) => {
  const source = partyState !== undefined ? applyGstSplit(items, partyState) : items;
  let totalAmount = 0;
  const computed = source.map((line) => {
    const base = line.quantity * line.rate;
    const taxAmount = (base * ((line.sgst || 0) + (line.cgst || 0) + (line.igst || 0))) / 100;
    const amount = round2(base + taxAmount);
    totalAmount += amount;
    return { ...line, amount };
  });
  return { computed, totalAmount: round2(totalAmount) };
};

module.exports = { computeLineAmounts, round2 };
