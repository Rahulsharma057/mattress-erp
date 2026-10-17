// PM2 process manager config - use if deploying to a VPS instead of a container platform.
// Run with: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: "mattress-erp-backend",
      script: "server.js",
      instances: "max",       // cluster mode - one worker per CPU core
      exec_mode: "cluster",
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
      max_memory_restart: "300M",
    },
  ],
};
