# ERP Workflow Map — Finalized Flows (NOT YET IMPLEMENTED)

Nothing in this document has been built. This reflects the FINALIZED decisions in `ERP_REQUIREMENTS.md`. See `ERP_IMPLEMENTATION_PLAN.md` for the file-by-file plan, which still needs your approval before any code changes.

## Flow 1 — Salesman Collection with Custody & Handover (both styles)

```
Salesman logs Visit (+ optional Collection amount/mode/allocation)    [UNCHANGED]
        │
        ▼
Collection.status = "pending_approval"                                [UNCHANGED]
        │
        ▼
Admin/Accountant reviews
        │
        ├─ Reject → status = "rejected", nothing posted               [UNCHANGED]
        │
        └─ Approve  (happens exactly ONCE - existing status guard)
                │
                ▼
        Receipt Voucher posted:
          Dr  "Salesman Collections In Hand"   (NEW shared custody ledger)
          Cr  Dealer                            [dealer outstanding drops
                                                  HERE - the one confirmed
                                                  posting event, unchanged]
          Collection.status = "approved"
          Collection.handoverStatus = "pending"      (NEW)
          Collection.handedOverAmount = 0             (NEW)
          Collection.voucherId = <this voucher>       [UNCHANGED guard]
                │
                ▼ (later, independently, any time after approval)
        ┌───────────────────────┴───────────────────────┐
        │                                                 │
   ITEMIZED HANDOVER                              LUMP-SUM HANDOVER
   Accountant picks one or more                   Accountant enters a total
   specific approved collections                  amount for one salesman
   for this salesman, up to their                        │
   remaining (amount - handedOverAmount)                 ▼
        │                                         System allocates the total
        │                                         oldest-first across that
        │                                         salesman's collections with
        │                                         handoverStatus != "handed_over",
        │                                         same pattern as existing
        │                                         Sales/Purchase payment
        │                                         allocation
        │                                                 │
        └───────────────────────┬───────────────────────┘
                                 ▼
                Handover Voucher posted:
                  Dr  Cash/Bank (account selected, same settlement-account
                      picker already built for Receive Payment)
                  Cr  "Salesman Collections In Hand"
                  allocations: [{ collection, amount }, ...]  (NEW - shows
                      exactly which collections/how much, for both styles)
                  For each covered Collection:
                    handedOverAmount += allocated amount
                    handoverStatus = "handed_over" if fully covered,
                                      else "partial"
                  [Dealer ledger NOT touched - cannot double-reduce outstanding]
```

**Duplicate protection:** lump-sum allocation only ever draws from `amount - handedOverAmount` per collection, and a collection already `"handed_over"` is excluded from both pickers entirely.

---

## Flow 2 — Dispatch Return via Sales Return / Credit Note (with Good/Damaged split)

```
Dispatch exists (status: pending/in_transit/delivered)                [UNCHANGED]
        │
        ▼
Status changed to "Returned"           [UNCHANGED - still posts NOTHING, flag only]
        │
        ▼
"Process Return" action (NEW) - only enabled while
Dispatch.returnProcessed is not yet true
        │
        ▼
Return form, per packed line (capped by the extended per-dispatch
assertWithinReturnableQuantity check):
  Dispatched/billed qty (reference) │ Returned qty │ split → Good qty + Damaged qty
        │
        ▼
Submit → Credit Note created (existing createCreditNote, extended):
  - referenceBill = the Sales Bill          (existing field, reused)
  - dispatchRef = this Dispatch              (NEW)
  - Dr Sales Account + Dr Output GST, Cr Dealer   [UNCHANGED reversal logic]
  - Good qty   → ItemVariant.stockQty  += qty   (same variant sold from -
                 existing resolveNoteLineVariant, unchanged)
  - Damaged qty → ItemVariant.damagedQty += qty  (NEW - never touches
                 stockQty/availableQty)
  - Dispatch.returnProcessed = true, Dispatch.creditNoteRef = <this note>  (NEW)
        │
        ▼ (separately, later, admin/super_admin only)
┌───────────────────────┴────────────────────────┐
│                                                  │
ZERO-RECOVERY WRITE-OFF                    SCRAP SALE (recovers value)
  damagedQty -= qty                          damagedQty -= qty
  StockTransaction logged                    StockTransaction logged
  ("damage_writeoff")                        ("damage_scrap_sale")
  NO accounting entry - FINALIZED            Pick HSN/SAC (existing master -
  (stock isn't carried at a valued           never assumed same rate as the
  balance anywhere in these books,           original item) + optional buyer
  so there is nothing verified to            (existing Ledger, or none = cash
  credit down; inventing a figure            scrap sale) + rate
  would be an unverified entry)                      │
                                                       ▼
                                              Posts (reuses the existing
                                              gstSplit CGST+SGST-vs-IGST logic):
                                                Dr  Cash/Bank (incl. GST) -
                                                    settlement account picker
                                                Cr  "Scrap Sales Income" (NEW)
                                                    - base amount
                                                Cr  Output CGST+SGST, or
                                                    Output IGST (never both -
                                                    same alternative rule as
                                                    every other GST posting)
```

**Cancellation:** cancelling the Credit Note (existing `cancelCreditNote`, extended) reverses the Good-qty stock AND the Damaged-qty bucket entry together, and clears `Dispatch.returnProcessed`/`creditNoteRef` so the return can be corrected and reprocessed.

---

## Flow 3 — Size-wise Opening Stock

```
Item Master → "View" (size-wise stock) → "Add Opening Stock" (NEW)
        │
        ▼
Pick/enter specification (existing getOrCreateVariant resolution,
same as Purchase)
        │
        ▼
Guard: this variant must have ZERO StockTransaction history so far -
otherwise rejected ("already has stock movements - use Stock Adjustment")
        │
        ▼
Enter Quantity + Valuation Rate (₹/unit)
        │
        ▼
Posts (inside one withTransaction, so a retry can't double-post):
  - ItemVariant.stockQty += quantity  (+ Item.stockQty rollup, as today)
  - StockTransaction: type "opening_stock", variant, quantity, valuationRate
  - Accounting entry for quantity × valuationRate - FINALIZED:
      Dr  "Stock-in-Hand" (NEW asset ledger)
      Cr  "Opening Balance Equity" (NEW dedicated equity ledger - never
          Capital Account; also the ledger a future Dealer/Supplier
          opening-balance phase would share, by design - see
          ERP_REQUIREMENTS.md "R2 (gap)")
```

**This entry is explicitly subject to your approval of the accounting treatment** (per your instruction) before it is ever posted live — the Dr/Cr pair above is shown here precisely so you can approve or amend it as part of approving this whole plan, not discover it after the fact.

---

## Still Blocking

**COMPANY_STATE / GSTIN / registered address** — re-confirmed nowhere in the codebase (no config model, no `.env.example`, nothing in any seed script). Printed vouchers/invoices will show no company address block until you provide one. Needed before the CGST+SGST vs IGST split can be verified correct for intra-state vs inter-state sales — including the new Scrap Sale flow above, which reuses the same split.

---

All three previously-open items (damaged write-off, opening-balance gap, opening-stock credit ledger) are now FINALIZED above. Waiting only on COMPANY_STATE and your explicit approval of `ERP_IMPLEMENTATION_PLAN.md` before any code changes.
