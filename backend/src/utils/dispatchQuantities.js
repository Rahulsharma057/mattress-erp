// Dispatch quantity accounting, kept here as pure functions (no Mongoose/DB access) so the
// root-cause bug - dispatched/remaining quantity being merged across every Sales Bill line
// that shares the same item, instead of tracked per line - can be fixed and regression-tested
// independently of a database. See dispatchController.js for how these are wired to real data,
// and tests/dispatchQuantities.test.js for the regression coverage.

// Normalizes a Mongoose ref field that may be a populated document, a raw ObjectId, or null/
// undefined, to a plain string (or null). Used everywhere a line/packing-list entry's
// item/variant needs comparing, regardless of whether it came in populated or not.
const idStr = (v) => (v == null ? null : String(v._id ?? v));

// Stable per-line identifier for one Sales Bill item line. BillItem (models/BillItem.js) has
// no per-line _id - it's shared by Sales/Purchase/Voucher and `_id: false` there is
// intentional, out of scope to change for a dispatch-only fix - so this composite key
// (item + variant + the line's position in the bill) is used instead. It is reliable because
// a Sales Bill's `items` array is never reordered or edited after creation (no edit-bill-items
// endpoint exists anywhere in salesBillController - only create/confirm/cancel touch a bill),
// so the same line always resolves to the same key on every later read, including two lines
// that happen to share the exact same item AND variant (the index tells them apart).
const buildLineKey = (line, index) => `${idStr(line.item)}:${idStr(line.variant) || "none"}:${index}`;

// Computes dispatched/remaining quantity for EVERY line of a Sales Bill independently - this
// is the actual fix: the previous logic (getDispatchedQtyByItem + the old getRemainingLines)
// summed dispatched quantity per ITEM, so a bill with two lines of the same item in different
// sizes had its remaining quantity merged into one pool; dispatching against one size silently
// consumed the other's allowance too.
//
// `bill.items` may have `item`/`variant` populated or raw; `dispatches` is every Dispatch
// document already created against this bill (any status - "returned" ones are skipped here,
// same as the pre-fix behaviour: a returned dispatch's quantity goes back to pending).
//
// Backward compatibility: a dispatch created before this fix has NO `lineKey` on its packing
// list entries (only `{item, quantity}`), because at the time there was no way to know which
// specific line it came from. Such legacy entries - and any entry whose `lineKey` no longer
// resolves to a line on this bill - are apportioned FIFO across this bill's lines of that
// item, in bill order: the same order those lines would have been drawn down in under the old
// item-only logic. Historical dispatch quantity is therefore never lost, never double-counted,
// and never silently misattributed to the wrong size - only interpreted as precisely as the
// data allows.
const computeRemainingLines = (bill, dispatches) => {
  const lines = (bill.items || []).map((line, index) => ({
    lineKey: buildLineKey(line, index),
    item: idStr(line.item),
    variant: idStr(line.variant),
    name: line.item?.name,
    unit: line.item?.unit,
    sizeLabel: line.variant?.sizeLabel,
    billedQty: line.quantity,
    dispatchedQty: 0,
  }));

  const lineByKey = new Map(lines.map((l) => [l.lineKey, l]));
  const linesByItem = new Map();
  for (const l of lines) {
    if (!linesByItem.has(l.item)) linesByItem.set(l.item, []);
    linesByItem.get(l.item).push(l);
  }

  for (const dispatch of dispatches || []) {
    if (dispatch.status === "returned") continue;
    for (const entry of dispatch.packingList || []) {
      const match = entry.lineKey && lineByKey.get(entry.lineKey);
      if (match) {
        match.dispatchedQty += entry.quantity;
        continue;
      }
      // Legacy entry (no lineKey, or one that no longer resolves - e.g. a bill whose line
      // order changed, which shouldn't happen but is handled safely either way): apportion
      // FIFO across this item's lines rather than drop or misattribute the quantity.
      const itemKey = idStr(entry.item);
      let remaining = entry.quantity;
      for (const l of linesByItem.get(itemKey) || []) {
        if (remaining <= 0) break;
        const capacity = Math.max(0, l.billedQty - l.dispatchedQty);
        const take = Math.min(capacity, remaining);
        l.dispatchedQty += take;
        remaining -= take;
      }
      // If `remaining` is still > 0 here, this item's total legacy dispatched quantity
      // exceeds what was ever billed - shouldn't happen under correct validation, and there
      // is nothing safe left to attribute it to, so it's dropped rather than guessed at.
    }
  }

  return lines.map((l) => ({
    lineKey: l.lineKey,
    item: l.item,
    variant: l.variant,
    name: l.name,
    unit: l.unit,
    sizeLabel: l.sizeLabel,
    billedQty: l.billedQty,
    dispatchedQty: l.dispatchedQty,
    remainingQty: Math.max(0, l.billedQty - l.dispatchedQty),
  }));
};

module.exports = { idStr, buildLineKey, computeRemainingLines };
