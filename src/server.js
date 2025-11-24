const http = require("http");
const { app, appInitialized } = require("./app");
const config = require("./config/config");
const { testConnections } = require("./config/database");

const PORT = process.env.PORT || 4000;

// Prevent multiple server instances
let serverInstance = null;
let isStarting = false;

async function createServer() {
  // Prevent multiple instances
  if (isStarting) {
    console.log("⚠️ Server is already starting, skipping...");
    return null;
  }

  if (serverInstance) {
    console.log("⚠️ Server instance already exists, returning existing instance");
    return serverInstance;
  }

  isStarting = true;

  try {
    // Test database connections
    await testConnections();

    // Wait for app initialization to complete
    await appInitialized;

    const server = http.createServer(app);

    server.listen(PORT, () => {
      isStarting = false;
      serverInstance = server;
      console.log(`🚀 Server listening on port ${PORT} (PID: ${process.pid})`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(
        `🗄️  Database: ${config.database.direct.database}@${config.database.direct.host}:${config.database.direct.port}`
      );
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
    });

    // Handle port already in use
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
        console.log("💡 Try: Kill the process using this port or use a different port");
        isStarting = false;
        process.exit(1);
      } else {
        console.error("❌ Server error:", err);
        isStarting = false;
      }
    });

    // Graceful shutdown for individual workers
    const gracefulShutdown = (signal) => {
      console.log(`🔄 Received ${signal}, shutting down gracefully...`);
      if (serverInstance) {
        serverInstance.close(() => {
          console.log(`✅ Server closed (PID: ${process.pid})`);
          serverInstance = null;
          isStarting = false;
          process.exit(0);
        });

        // Force close after 10 seconds
        setTimeout(() => {
          console.error("⚠️ Forcing shutdown after timeout");
          process.exit(1);
        }, 10000);
      } else {
        process.exit(0);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    return server;
  } catch (error) {
    isStarting = false;
    console.error("❌ Failed to start server:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for cluster mode
module.exports = { createServer };

// If running directly (not in cluster), start the server
if (require.main === module) {
  createServer();
}
