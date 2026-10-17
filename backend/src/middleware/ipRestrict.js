// Optional IP-based restriction, mainly intended for the Super Admin panel.
// Configure ALLOWED_IPS in .env as a comma-separated list. Leave empty to disable.
const ipRestrict = (req, res, next) => {
  const allowed = (process.env.ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (allowed.length === 0) return next(); // restriction disabled

  const requestIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;

  if (allowed.includes(requestIp)) return next();

  res.status(403);
  throw new Error("Access denied: your IP is not whitelisted for this system");
};

module.exports = ipRestrict;
