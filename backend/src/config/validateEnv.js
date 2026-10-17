// Fails fast on startup if required environment variables are missing -
// far better than a cryptic runtime error hours after deployment.
const REQUIRED_VARS = ["MONGO_URI", "JWT_SECRET"];

const RECOMMENDED_VARS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

const validateEnv = (logger) => {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED_VARS.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    logger.warn(`Missing recommended environment variables (Cloudinary uploads will fail): ${missingRecommended.join(", ")}`);
  }

  // Not required - every Sales/Purchase/Credit/Debit Note still posts the correct TOTAL tax
  // amount without it - but until it's set, every transaction is treated as inter-state
  // (IGST only), which is wrong for GST return filing on intra-state sales. See utils/gstSplit.js.
  if (!process.env.COMPANY_STATE) {
    logger.warn("COMPANY_STATE is not set - GST will always be booked as IGST (inter-state), even for dealers in your own state. Set COMPANY_STATE in .env (e.g. COMPANY_STATE=Maharashtra) for correct CGST+SGST vs IGST splitting.");
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 20) {
    logger.warn("JWT_SECRET is short - use a long random string in production (openssl rand -hex 32)");
  }
};

module.exports = validateEnv;
