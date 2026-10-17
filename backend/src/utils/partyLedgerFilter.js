const AccountGroup = require("../models/AccountGroup");

// A Ledger's `entityType` ("dealer"/"supplier") defaults to "dealer" on EVERY ledger that
// doesn't explicitly set it - including internal/nominal ledgers (Cash Account, Bank
// Account, Sales Account, Purchase Account, GST ledgers...) that seedMasters.js/
// seedDemoData.js insert directly without ever setting entityType. Trusting entityType
// alone to find "real" dealers/suppliers therefore leaks those internal ledgers into every
// Party/Supplier dropdown and every outstanding/receivable total (e.g. Cash Account's own
// positive balance was being counted as a "dealer" owing money). The account group a ledger
// is actually booked under (Tally-style "Sundry Debtors"/"Sundry Creditors") is the real
// source of truth for "this is a transactable party" - so every dealer/supplier-only query
// must require that group membership too, not entityType in isolation.
const partyGroupFilter = async (entityType) => {
  const groupName = entityType === "supplier" ? "Sundry Creditors" : "Sundry Debtors";
  const group = await AccountGroup.findOne({ name: groupName });
  // No such group yet (fresh install before running the masters seed) - match nothing
  // rather than silently falling back to "everything".
  return { entityType, accountGroup: group ? group._id : null };
};

module.exports = { partyGroupFilter };
