const asyncHandler = require("express-async-handler");

// @desc Upload a single file (receipt, document) to Cloudinary via multer-storage-cloudinary
// @route POST /api/uploads
// @body multipart/form-data, field name "file"
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded - attach a file under the 'file' field");
  }
  // multer-storage-cloudinary attaches the Cloudinary result onto req.file
  res.status(201).json({ url: req.file.path, publicId: req.file.filename });
});

module.exports = { uploadFile };
