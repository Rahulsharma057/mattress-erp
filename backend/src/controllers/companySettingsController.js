const asyncHandler = require("express-async-handler");
const CompanySettings = require("../models/CompanySettings");
const { cloudinary } = require("../config/cloudinary");
const { resolveLogoToDelete } = require("../utils/companyLogo");
const logger = require("../config/logger");

// Returns the single CompanySettings document, creating an empty one (all fields blank
// except the default name) on first use. Exported so other controllers that print an invoice
// (dispatchController.getDispatchInvoice) can read it directly without an extra HTTP call.
const getOrCreateSettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) settings = await CompanySettings.create({});
  return settings;
};

// @desc Read the company's own profile (name/address/GSTIN/contact/bank details/terms) used
//       on printed invoices. Any authenticated role can read it - it's not sensitive, and the
//       invoice-printing flow for a salesman/dispatch manager needs it too.
// @route GET /api/settings/company
const getCompanySettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

// @desc Update the company's own profile. Admin/Super Admin only - this is company-wide
//       configuration, not a per-user preference.
// @route PUT /api/settings/company
const EDITABLE_FIELDS = [
  "name", "addressLine1", "addressLine2", "gstin", "phone", "email", "website",
  "termsAndConditions",
];
const updateCompanySettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) settings[field] = req.body[field];
  }
  settings.updatedBy = req.user._id;
  await settings.save();
  res.json(settings);
});

// @desc Upload/replace the company logo. The new file is uploaded to Cloudinary by the
//       `uploadCompanyLogo` multer middleware BEFORE this handler ever runs - if that upload
//       fails (bad network, Cloudinary error), multer calls next(err) and this handler never
//       executes at all, so the previous logo in CompanySettings is left completely untouched.
//       Only once the new logo is safely saved do we attempt to delete the OLD Cloudinary
//       asset, using its publicId as already stored in the database - never a client-supplied
//       id (see utils/companyLogo.resolveLogoToDelete) - and a failure to delete the old
//       asset is logged but never fails the request, since the new logo is already live.
// @route POST /api/settings/company/logo
// @body multipart/form-data, field name "logo"
const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No logo file uploaded - attach an image under the 'logo' field");
  }

  const settings = await getOrCreateSettings();
  const oldPublicId = settings.logoPublicId;
  const newUrl = req.file.path; // multer-storage-cloudinary attaches the Cloudinary result onto req.file
  const newPublicId = req.file.filename;

  settings.logoUrl = newUrl;
  settings.logoPublicId = newPublicId;
  settings.updatedBy = req.user._id;
  await settings.save();

  const toDelete = resolveLogoToDelete(oldPublicId, newPublicId);
  if (toDelete) {
    try {
      await cloudinary.uploader.destroy(toDelete);
    } catch (err) {
      logger.warn(`Failed to delete replaced company logo from Cloudinary (publicId=${toDelete}): ${err.message}`);
    }
  }

  res.json(settings);
});

// @desc Remove the company logo entirely (invoice falls back to the text-only header).
// @route DELETE /api/settings/company/logo
const removeLogo = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const publicId = settings.logoPublicId; // only ever the DB's own value, never client input

  settings.logoUrl = undefined;
  settings.logoPublicId = undefined;
  settings.updatedBy = req.user._id;
  await settings.save();

  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      logger.warn(`Failed to delete company logo from Cloudinary (publicId=${publicId}): ${err.message}`);
    }
  }

  res.json(settings);
});

module.exports = { getCompanySettings, updateCompanySettings, getOrCreateSettings, uploadLogo, removeLogo };
