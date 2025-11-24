const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { PublicUser } = require("../models");

// Store active SSE connections
// Structure: userId -> Set of response objects
const sseConnections = new Map();

// Helper function to downgrade expired premium users
const downgradeExpiredPremium = async (user) => {
  if (!user) return user;
  const categories = ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"];
  if (!categories.includes(user.category)) {
    return user;
  }

  const expiresAt = user.premium_expires_at
    ? new Date(user.premium_expires_at)
    : null;
  if (!expiresAt || expiresAt > new Date()) {
    return user;
  }

  try {
    await user.update({
      category: "Regular",
      isVerified: false,
      premium_expires_at: null,
    });
    return user;
  } catch (err) {
    console.error(
      `[Premium] Failed to downgrade expired premium user ${user.id}:`,
      err
    );
    return user;
  }
};

// Authenticate token from query parameter (EventSource doesn't support headers)
const authenticateSSE = async (req, res, next) => {
  // Get token from query parameter (EventSource limitation)
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    if (decoded.type !== "public") {
      return res.status(403).json({
        success: false,
        message: "Invalid token type",
      });
    }

    let user = await PublicUser.findByPk(decoded.id, {
      attributes: { exclude: ["password", "otp"] },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    user = await downgradeExpiredPremium(user);

    req.publicUserId = user.id;
    req.publicUser = user;
    next();
  } catch (err) {
    console.error("SSE auth error:", err);
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// SSE endpoint
router.get("/events", authenticateSSE, (req, res) => {
  const userId = req.publicUserId;

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.setHeader("Access-Control-Allow-Origin", "*"); // CORS for SSE

  // Store this connection
  if (!sseConnections.has(userId)) {
    sseConnections.set(userId, new Set());
  }
  sseConnections.get(userId).add(res);

  console.log(
    `[SSE] User ${userId} connected. Total connections: ${sseConnections.size}`
  );

  // Send initial connection message
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      type: "connected",
      userId,
    })}\n\n`
  );

  // Handle client disconnect
  req.on("close", () => {
    const userConnections = sseConnections.get(userId);
    if (userConnections) {
      userConnections.delete(res);
      if (userConnections.size === 0) {
        sseConnections.delete(userId);
      }
    }
    console.log(
      `[SSE] User ${userId} disconnected. Remaining connections: ${sseConnections.size}`
    );
    res.end();
  });

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 30000); // Every 30 seconds

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

/**
 * Helper function to send events to a user
 * @param {number} userId - The user ID to send the event to
 * @param {string} eventType - The event type (e.g., "user:update", "suspension:update")
 * @param {Object} data - The data to send
 */
function sendEventToUser(userId, eventType, data) {
  const userConnections = sseConnections.get(userId);
  if (!userConnections || userConnections.size === 0) {
    return; // User not connected
  }

  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  userConnections.forEach((res) => {
    try {
      res.write(message);
    } catch (err) {
      // Connection closed, remove it
      console.error(
        `[SSE] Error sending event to user ${userId}:`,
        err.message
      );
      userConnections.delete(res);
    }
  });

  // Clean up empty sets
  if (userConnections.size === 0) {
    sseConnections.delete(userId);
  }
}

/**
 * Send event to multiple users
 * @param {number[]} userIds - Array of user IDs
 * @param {string} eventType - The event type
 * @param {Object} data - The data to send
 */
function sendEventToUsers(userIds, eventType, data) {
  userIds.forEach((userId) => {
    sendEventToUser(userId, eventType, data);
  });
}

/**
 * Broadcast event to all connected users
 * @param {string} eventType - The event type
 * @param {Object} data - The data to send
 */
function broadcastToAll(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  let sentCount = 0;
  let errorCount = 0;

  sseConnections.forEach((userConnections, userId) => {
    userConnections.forEach((res) => {
      try {
        res.write(message);
        sentCount++;
      } catch (err) {
        errorCount++;
        console.error(
          `[SSE] Error broadcasting to user ${userId}:`,
          err.message
        );
        userConnections.delete(res);
      }
    });

    // Clean up empty sets
    if (userConnections.size === 0) {
      sseConnections.delete(userId);
    }
  });

  console.log(
    `[SSE] Broadcast "${eventType}" to ${sentCount} connections (${errorCount} errors)`
  );
}

/**
 * Get connection count for a user
 * @param {number} userId - The user ID
 * @returns {number} Number of active connections
 */
function getUserConnectionCount(userId) {
  const userConnections = sseConnections.get(userId);
  return userConnections ? userConnections.size : 0;
}

/**
 * Get total connection count
 * @returns {number} Total number of active connections
 */
function getTotalConnectionCount() {
  return sseConnections.size;
}

// Export for use in controllers
module.exports = {
  router,
  sendEventToUser,
  sendEventToUsers,
  broadcastToAll,
  getUserConnectionCount,
  getTotalConnectionCount,
};
