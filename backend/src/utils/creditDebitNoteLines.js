// Pure line-matching/quantity logic for Credit/Debit Notes - kept DB-free so it's directly
// unit-testable (tests/creditDebitNoteLines.test.js). See controllers/creditDebitNoteController.js
// for the Mongoose-fetching wrappers and the real bug this fixes: a Credit/Debit Note tied to
// a bill resolved which specification (variant) was being returned by matching the bill's own
// lines on `item` id ALONE (`bill.items.find(l => l.item === line.item)`), which always
// returns the FIRST line for that item. A bill with the same item at two different sizes
// could silently return/credit the WRONG size's stock - exactly the same root cause already
// fixed in Dispatch (utils/dispatchQuantities.js) and Work Order (utils/workOrderProduction.js).
// The cumulative-returnable-quantity guard had the identical gap: it summed billed/already-
// returned quantity by item id alone, so two sizes of the same item shared one return
// allowance instead of each having its own.

const idStr = (v) => (v == null ? null : String(v._id ?? v));
const lineKey = (l) => `${idStr(l.item)}:${idStr(l.variant) || "none"}`;

// Resolves which EXACT bill line (and therefore which variant) a Credit/Debit Note request
// line refers to, when the note references a bill. Never guesses by item id alone once a bill
// has more than one line for that item:
//   - If the client named a variant, it must match one of the bill's own lines for that item
//     (never trusted blindly - a variant for a different item/bill is rejected).
//   - With no variant named, this is only safe when the bill has EXACTLY ONE line for that
//     item (the common, unambiguous case) - otherwise it throws, asking the client to say
//     which size, rather than silently crediting/returning the wrong one.
// @param line - the request line `{ item, variant?, quantity, ... }`.
// @param billItems - the referenced bill's own `items` array (each already carries its
//   resolved `variant`).
// @returns the variant id (string or ObjectId, whatever billItems/line used) to use.
// @throws Error (plain, user-facing message) if the item was never on the bill, if an explicit
//   variant doesn't match, or if the size is ambiguous.
const resolveLineVariantFromBill = (line, billItems) => {
  const billLinesForItem = (billItems || []).filter((l) => idStr(l.item) === idStr(line.item));
  if (billLinesForItem.length === 0) {
    throw new Error("One of the returned items was never on the referenced bill - cannot return what wasn't billed");
  }
  if (line.variant) {
    const match = billLinesForItem.find((l) => idStr(l.variant) === idStr(line.variant));
    if (!match) {
      throw new Error("The specified specification does not match this item on the referenced bill");
    }
    return match.variant;
  }
  if (billLinesForItem.length === 1) {
    return billLinesForItem[0].variant;
  }
  throw new Error("This bill has more than one size of the same item - specify which \"variant\" is being returned");
};

// Guards against returning more than was ever billed, PER LINE (item+variant), not merged
// across every size of an item - see the file header for why that merge was a real bug.
// `requestItems`/`billItems`/each prior note's `items` must already carry a resolved
// `variant` (see resolveLineVariantFromBill above).
// @throws Error on the first line that would over-return.
const checkReturnableQuantity = (billItems, priorNoteItems, requestItems) => {
  const alreadyReturned = {};
  for (const note of priorNoteItems || []) {
    for (const line of note) {
      const key = lineKey(line);
      alreadyReturned[key] = (alreadyReturned[key] || 0) + line.quantity;
    }
  }

  const billedByLine = {};
  for (const line of billItems || []) {
    const key = lineKey(line);
    billedByLine[key] = (billedByLine[key] || 0) + line.quantity;
  }

  for (const line of requestItems || []) {
    const key = lineKey(line);
    const billed = billedByLine[key];
    if (billed === undefined) {
      throw new Error("One of the returned items/specifications was never on bill - cannot return what wasn't billed");
    }
    const returnedSoFar = alreadyReturned[key] || 0;
    const remaining = billed - returnedSoFar;
    if (line.quantity > remaining + 1e-9) {
      throw new Error(`Cannot return ${line.quantity} of this item: only ${remaining} of the ${billed} billed is still returnable (${returnedSoFar} already returned against this bill)`);
    }
  }
};

module.exports = { lineKey, resolveLineVariantFromBill, checkReturnableQuantity };
