const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const morgan = require("morgan");

const logger = require("./config/logger");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiters");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const masterRoutes = require("./routes/masterRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const salarySlipRoutes = require("./routes/salarySlipRoutes");
const productionRoutes = require("./routes/productionRoutes");
const salesRoutes = require("./routes/salesRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const salesmanRoutes = require("./routes/salesmanRoutes");
const reportRoutes = require("./routes/reportRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const app = express();

// Trust the first proxy hop (Render/Railway/Nginx) so req.ip / x-forwarded-for and the
// rate limiter behave correctly behind a load balancer.
app.set("trust proxy", 1);

// --- Security & performance middleware ---
app.use(helmet());
app.use(compression());

// CORS: restrict to a comma-separated whitelist in production via CORS_ORIGINS,
// falls back to allow-all in development for convenience.
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : true,
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));
app.use(mongoSanitize()); // strips $/. operators from user input - blocks NoSQL injection
app.use(hpp()); // guards against HTTP parameter pollution

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

app.use("/api", apiLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "mattress-erp-backend", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/masters", masterRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/salary-slips", salarySlipRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/accounts", voucherRoutes);
app.use("/api/salesman", salesmanRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/settings", settingsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
