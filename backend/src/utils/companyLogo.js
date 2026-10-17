// Pure decision logic for replacing/removing the Company Logo's Cloudinary asset - kept
// separate from companySettingsController (which does the actual Cloudinary I/O) so it's
// unit-testable without a real Cloudinary account - see tests/companyLogo.test.js.

// Given the PREVIOUS publicId (read from the CompanySettings document - never from client
// input, see the controller) and the NEWLY-uploaded file's publicId, decides which asset (if
// any) should be deleted from Cloudinary. Returns null when there is nothing to clean up:
// no previous logo (first-ever upload), or the "new" id is somehow identical to the old one
// (never delete the asset that's about to become - or already is - the current logo).
const resolveLogoToDelete = (oldPublicId, newPublicId) => {
  if (!oldPublicId) return null;
  if (oldPublicId === newPublicId) return null;
  return oldPublicId;
};

module.exports = { resolveLogoToDelete };
