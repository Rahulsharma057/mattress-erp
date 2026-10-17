const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { cloudinary } = require("../config/cloudinary");

// Generic Cloudinary-backed upload middleware - used for expense-claim receipts,
// employee documents, etc. Files land directly in Cloudinary; multer never touches disk.
const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "mattress-erp/uploads" },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPEG/PNG/WebP images or PDF files are allowed"));
  },
});

// Stricter, image-only upload for the Company Logo (see companySettingsController) - the
// generic `upload` above allows PDFs and a 5MB limit, neither appropriate for a logo. Reuses
// the same Cloudinary config/storage pattern, just scoped tighter for this one use case.
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const isAllowedLogoType = (mimetype) => ALLOWED_LOGO_TYPES.includes(mimetype);

const uploadCompanyLogo = multer({
  storage: new CloudinaryStorage({ cloudinary, params: { folder: "mattress-erp/uploads" } }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (isAllowedLogoType(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed for the company logo"));
  },
});

// Wraps a single-file multer upload so a rejected file type or oversized upload returns a
// clean 400 with a clear message - multer errors otherwise fall through to the generic 500
// error handler (same as the plain /api/uploads endpoint), but this route is explicitly
// required to give a clear validation error.
const handleSingleUpload = (multerInstance, fieldName) => (req, res, next) => {
  multerInstance.single(fieldName)(req, res, (err) => {
    if (!err) return next();
    res.status(400);
    next(new Error(err.code === "LIMIT_FILE_SIZE" ? "Logo image must be 2MB or smaller" : err.message));
  });
};

module.exports = { upload, uploadCompanyLogo, isAllowedLogoType, handleSingleUpload };
