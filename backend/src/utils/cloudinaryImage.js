// Fetches the Company Logo from Cloudinary as a PNG buffer PDFKit can embed directly.
// PDFKit only supports PNG/JPEG, not WebP (see models/CompanySettings.logoUrl, which may hold
// any of the formats accepted at upload time - middleware/upload.js's uploadCompanyLogo).

// Rewrites a Cloudinary delivery URL to force a PNG response via Cloudinary's own on-the-fly
// format-conversion transformation (`f_png`), regardless of the asset's stored format. This
// reuses the existing Cloudinary service itself as the "image conversion utility" instead of
// adding a new image-processing dependency (sharp/jimp) to the project. Non-Cloudinary or
// malformed URLs (no "/upload/" segment) are returned unchanged rather than mangled.
const toPngDeliveryUrl = (url) => (url && url.includes("/upload/") ? url.replace("/upload/", "/upload/f_png/") : url);

const LOGO_FETCH_TIMEOUT_MS = 6000;

// Returns a Buffer on success, or null on ANY failure - missing logo, network error, timeout,
// non-OK response. Invoice generation must always succeed with the existing text-only header
// rather than hang or crash when Cloudinary is slow/unavailable - see pdfGenerator.js.
const fetchLogoAsPngBuffer = async (logoUrl) => {
  if (!logoUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(toPngDeliveryUrl(logoUrl), { signal: controller.signal });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { toPngDeliveryUrl, fetchLogoAsPngBuffer };
