# ERP Requirements — Confirmed Decisions

Company: Sunrise Foam Industries / Samraddhi Mattresses. This document records only what has been explicitly confirmed. Nothing here is implemented yet — see `ERP_IMPLEMENTATION_PLAN.md` (pending approval) for what will change and where.

## R1. Salesman Collection — Custody & Handover — FINALIZED

- Collection approval and actual cash handover are **two separate events**.
- Flow preserved exactly: **Visit → Collection (pending_approval) → Approval → Receipt Voucher → Dealer Ledger drops.** Approval still happens exactly once per Collection (existing `Collection.voucherId` guard, reused not replaced) and this is the one and only point the dealer's outstanding drops.
- Approval posts Dr **Salesman Collections In Hand** (new shared custody ledger — one ledger for ALL salesmen, not one per salesman/user; which salesman holds how much is derived from the `salesman` field already on Collection/Voucher, never from a per-user ledger).
- Handover is a later, separate posting: Dr Cash/Bank (the real account chosen), Cr Salesman Collections In Hand. It **never** touches the dealer's ledger, so it structurally cannot double-reduce the dealer's outstanding.
- **Both handover styles are supported**, chosen by the accountant at handover time:
  - **Itemized** — select specific approved, not-yet-handed-over Collections and mark them handed over individually.
  - **Lump-sum** — enter a total amount; the system allocates it across that salesman's pending collections oldest-first (same allocation pattern already used for Sales/Purchase payment allocation), and shows exactly which collections were covered, in full or in part.
  - A single Collection can be partially handed over across more than one lump-sum handover event before it's fully covered — this requires `handoverStatus` to be tri-state (`pending` / `partial` / `handed_over`) with a running `handedOverAmount` per Collection, not a plain boolean. No conflict with existing accounting behavior: handover never touches the dealer ledger, so partial/split handover is purely an internal custody-tracking concern.
- Duplicate protection: re-approving an already-approved/rejected Collection is already blocked (existing status check). Handover additionally needs its own guard — a Collection already fully handed over (`handoverStatus: "handed_over"`) cannot be selected again in either itemized or lump-sum mode, and lump-sum allocation only ever draws from the *remaining* un-handed-over amount per Collection.
- Full audit trail: every handover posts its own Voucher, and a `HandoverAllocation`-style record (or an `allocations` array on the handover Voucher, mirroring the existing Sales/Purchase allocation pattern) names exactly which Collection(s) and how much of each were covered — so "every amount's allocation is shown" is satisfied for both styles.

## R2. Dispatch Return → Sales Return / Credit Note — FINALIZED

- "Returned" status change stays a pure flag — confirmed already true in the current code, no change there.
- A separate **Process Return** action creates a real Credit Note, extended to:
  - Link to the originating Dispatch **and** the Sales Bill/invoice where available.
  - Reuse the existing `assertWithinReturnableQuantity` over-return guard, extended to also check per-dispatch (not just per-bill) so a bill with multiple dispatches can't have the same dispatch's goods returned twice.
  - Split returned quantity into **Good** and **Damaged** per line (must sum to the returned quantity).
  - Block re-processing the same dispatch's return (`Dispatch.returnProcessed` + `creditNoteRef`).
  - Good quantity → back into the exact same sellable `ItemVariant` it was sold from (existing `resolveNoteLineVariant` logic, unchanged).
  - Damaged quantity → a separate, non-sellable damaged bucket **by variant** (see below) — never counted in `availableQty`/sellable stock.
  - Customer balance + Sales Account + Output GST reversed exactly as the existing Credit Note already does.
  - Supports partial returns (only some of a dispatch's lines/quantity) and safe cancellation/reversal of the Credit Note itself (existing `cancelCreditNote`, extended to also reverse the damaged-bucket entry when applicable).
  - Original Sales Bill/Dispatch records are never rewritten — only new linked records are added, preserving full audit history.
- Reuses the existing return-quantity and stock-reversal machinery; this is **not** a second, competing return system — it is the existing Credit Note flow extended with a Dispatch-aware entry point and a Good/Damaged split.

## R3. Damaged Goods — FINALIZED

- Damaged quantity lives in a **separate, non-sellable bucket per `ItemVariant`** — a `damagedQty` field alongside the existing `stockQty` on the same variant document (so "72x36/4in/D32, Good" and "72x36/4in/D32, Damaged" are still clearly the same specification, just two counters), rather than a second parallel variant row. `availableQty`/sellable stock calculations only ever read `stockQty`, never `damagedQty`.
- A later **authorized write-off or scrap-disposal** action (admin/super_admin only) reduces `damagedQty`, with its own `StockTransaction` entry for audit history (who, when, how much, item+variant).
- Damaged quantity must never be sellable or appear as available normal stock, at any point before disposal.

### R3a. Zero-recovery write-off — FINALIZED

- Updates `damagedQty` (decreases it) and logs a `StockTransaction` (`type: "damage_writeoff"`, who/when/how much/item+variant) for audit history.
- **Posts no financial accounting entry.** Reasoning, stated explicitly per your instruction not to invent an entry without a verified basis: stock is not carried at any valued balance on the books today (Purchase Account already expensed the cost at purchase time; there is no perpetual "inventory asset" ledger being debited/credited on every movement). A write-off therefore has no existing asset balance to credit down, and inventing one (e.g. guessing a "loss on damaged goods" expense amount) would be an unverified, arbitrary entry — exactly what you told me not to do.
- **Reconciliation:** the write-off is reconciled by quantity, not value — `damagedQty` before minus `damagedQty` after must equal the written-off quantity, and the `StockTransaction` log is the audit trail tying it back to the original `damage_in` entry (the Credit Note / return that created the damaged quantity in the first place) via the shared `item`+`variant`. No rupee figure is reconciled because none is posted.

### R3b. Scrap sale (recovers value) — FINALIZED, with GST treatment added

- A scrap sale is a **real transaction**, not a stock-only action, and **must carry the correct GST treatment** (your new instruction) — a scrap sale is itself a taxable supply if the company is GST-registered, so it cannot be posted as a bare Cash/Income entry with no tax leg.
- Reuses the **existing** Sales GST machinery rather than inventing a parallel one: the scrap-sale form requires selecting an HSN/SAC from the existing HSN master (scrap commonly falls under a different HSN/rate than the original item — never assumed to match it), and an optional buyer (an existing Ledger, or none for a walk-in cash scrap sale, mirroring how Cash Sale already has no dealer-ledger effect).
- Proposed entries for quantity × rate (+ GST per the selected HSN, split via the existing `gstSplit` CGST+SGST-vs-IGST logic, using the buyer's state if one is picked, else treated as intra-state):
  - Dr Cash/Bank (the selected settlement account) — total including GST
  - Cr "Scrap Sales Income" (new ledger) — base amount
  - Cr Output CGST+SGST, or Cr Output IGST — the GST portion, same alternative-not-additive rule as every other GST posting in this system
- `damagedQty -= quantity sold`, `StockTransaction` logged (`type: "damage_scrap_sale"`).
- **Reconciliation:** total `"Scrap Sales Income"` ledger credits should equal the sum of all `damage_scrap_sale` `StockTransaction` base amounts — a straightforward report-level check, the same pattern already used to reconcile Sales Account against the Sales Register.

## R4. Size-wise Opening Stock — FINALIZED

- Opening stock entry by Item + `ItemVariant` (size/length/width/thickness/density), quantity, and valuation (₹ per unit) — using the existing Item → ItemVariant architecture, never merging variants.
- One-time per variant: blocked once that variant has any real `StockTransaction` already (rejected with a clear message pointing to the Stock Adjustment workflow instead) — never usable as a disguised adjustment.
- **Credit ledger — FINALIZED as a new dedicated "Opening Balance Equity" ledger** (not "Capital Account" — per your instruction, never silently reuse an existing ledger for a new accounting meaning). New `equity`-nature ledger, seeded once.
- **Entry posted, per variant, for Quantity × Valuation Rate:**

  | | Account | Amount |
  |---|---|---|
  | Dr | Stock-in-Hand (new asset ledger) | Qty × Rate |
  | Cr | Opening Balance Equity (new equity ledger) | Qty × Rate |

- **Reconciliation:** `"Stock-in-Hand"`'s balance at any time = sum of every posted opening-stock entry's value, by construction (nothing else ever touches that ledger in this phase — Purchase/Sales/Production continue to post through Purchase Account/Sales Account exactly as today, completely separate from this ledger). This entry is explicitly flagged as **subject to your approval of the accounting treatment** before it is ever posted to a real ledger — see the Implementation Plan's acceptance step, which requires you to confirm the Dr/Cr pair above (or request a change) before the feature goes live, not just before I start coding it.
- Duplicate-entry prevention: the one-variant-one-time rule above; the posting itself is wrapped in the existing `withTransaction` pattern so a retried request can't double-post.

## R2 (gap). Dealer/Supplier Opening Balances — EXPLICITLY DEFERRED, dependencies documented

Confirmed: **left for a separate, later phase** — not expanded into this implementation. Documented here so it is never lost, and so Opening Stock's design is checked against it:

- **Current state (investigated, not assumed):** `Ledger.openingBalance` has no UI, is never copied into `currentBalance`, and no Voucher/Journal is ever posted for it. Zero live ledgers have a non-zero value today.
- **Dependency check against Opening Stock, General Ledger, Trial Balance, reconciliation — confirmed no conflict:**
  - Opening Stock posts into **"Stock-in-Hand"** / **"Opening Balance Equity"** — two ledgers Dealer/Supplier opening balances would never touch directly (those would post into the Dealer/Supplier's own ledger, Cr the *same* "Opening Balance Equity" ledger if/when that phase happens).
  - Sharing one "Opening Balance Equity" Cr ledger across both *future* Dealer/Supplier opening balances and *this phase's* Opening Stock is intentional and consistent — it becomes a single "opening position of the business" equity line in Trial Balance/Balance Sheet, not two incompatible ones. Naming it "Opening Balance Equity" now (rather than something inventory-specific like "Stock Opening Equity") is what keeps that future phase compatible rather than blocked.
  - General Ledger / Trial Balance need no structural change for this phase — they already sum all posted ledgers; "Stock-in-Hand" and "Opening Balance Equity" simply join that sum as two more real ledgers once opening-stock entries exist.
  - **Conclusion: this phase's design does not foreclose or complicate a correct future Dealer/Supplier opening-balance implementation** — it in fact pre-establishes the shared equity ledger that phase would reuse.

## R5. COMPANY_STATE (GST split) — STILL BLOCKING

- Re-verified: no company GSTIN, registered address, or state exists anywhere in the codebase (model, seed script, or `.env`). `backend/.env` has `COMPANY_STATE=` present but blank. Company name appears only as plain display text on PDFs/pages, never with an address.
- Will not be guessed or defaulted, per your instruction.
- Printed vouchers/invoices will only show verified registration details — currently that means **no address/GSTIN block is printed at all** until you provide one; this plan does not invent placeholder company details.

---

## Remaining Blocker

**COMPANY_STATE / GSTIN / registered address — re-verified, still blocked.**
Re-inspected per your instruction: no company configuration model exists, no `.env.example`, nothing in any seed script, nothing in `backend/.env` except a blank `COMPANY_STATE=`. "Sunrise Foam Industries"/"Samraddhi Mattresses" appear only as plain display text, never with a state/GSTIN/address anywhere in the repository. This is not re-askable from the code — I need it from you directly:

- What state is the company GST-registered in?
- (Optional, for printed voucher/invoice headers) GSTIN and registered address.

Every other item (Open Items 1–3 from the previous batch) is now resolved and reflected above as FINALIZED. This is the only remaining business decision before implementation can start.
