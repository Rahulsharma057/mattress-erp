require("dotenv").config();
const connectDB = require("./src/config/db");
const app = require("./src/app");
const logger = require("./src/config/logger");
const validateEnv = require("./src/config/validateEnv");

validateEnv(logger);

const PORT = process.env.PORT || 5000;

let server;

connectDB().then(() => {
  server = app.listen(PORT, () => logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`));
});

// Crash loudly instead of silently on unhandled promise rejections / uncaught exceptions,
// but attempt a clean shutdown first so in-flight requests can finish.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
  if (server) server.close(() => process.exit(1));
  else process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

// Graceful shutdown on SIGTERM (e.g. container orchestrator stopping the pod)
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  if (server) server.close(() => logger.info("Server closed"));
});
