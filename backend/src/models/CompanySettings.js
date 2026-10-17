const mongoose = require("mongoose");

// Singleton (exactly one document ever exists - see companySettingsController.getOrCreateSettings)
// holding the company's own profile: used to fill the header and terms sections of printed
// invoices (see services/pdfGenerator.js's generateDispatchInvoicePDF) instead of hardcoding
// them. Every field is optional and blank by default - the invoice PDF omits a section whose
// fields are all blank rather than fabricate a value.
//
// NOTE: this previously also held a configured company bank account (bankName/
// bankAccountName/bankAccountNumber/bankIfscCode/bankBranch), used as a static "pay us here"
// block on the invoice. That has been removed deliberately: it was a second, parallel bank
// account configuration that could drift from reality and get substituted for the invoice's
// real "Payment Received In" account. There is now exactly one source of truth for any bank
// account's details - the Ledger record itself (models/Ledger.js's own bank fields, edited
// via Ledger Master) - and the invoice resolves them from there (see
// dispatchController.resolvePaymentReceivedInfo), never from this document. Any bank fields
// still physically present on old CompanySettings documents in the database are harmless,
// orphaned data - they are no longer read, written, or exposed by this schema.
const companySettingsSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Sunrise Foam Industries" },
    addressLine1: { type: String },
    addressLine2: { type: String },
    gstin: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },

    // Cloudinary-hosted company logo, printed in the invoice header (see
    // services/pdfGenerator.js). logoPublicId is the ONLY thing ever used to delete/replace
    // the Cloudinary asset (see companySettingsController) - a client-supplied public id is
    // never trusted for deletion, only this persisted value.
    logoUrl: { type: String },
    logoPublicId: { type: String },

    // Printed verbatim as a numbered list on the invoice (payment terms, return policy,
    // jurisdiction, warranty notes, etc. - whatever the admin types, in whatever order).
    termsAndConditions: [{ type: String }],

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanySettings", companySettingsSchema);
