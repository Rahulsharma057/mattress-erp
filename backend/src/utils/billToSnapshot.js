// Shared by salesBillController and dispatchController - the Bill-To details to actually
// show/print for a Sales Bill: its frozen billingSnapshot (see SalesBill model comment) when
// present, else the dealer's current live Ledger data for bills created before that field
// existed. `bill.party` must already be populated (at least name/dealerCode/address/city/
// state/pincode/gstin/mobile) when there is no snapshot to fall back on.
const resolveBillTo = (bill) => {
  if (bill.billingSnapshot?.name) return bill.billingSnapshot;
  const p = bill.party;
  return p && {
    name: p.name, dealerCode: p.dealerCode, address: p.address,
    city: p.city, state: p.state, pincode: p.pincode, gstin: p.gstin, mobile: p.mobile,
  };
};

module.exports = { resolveBillTo };
