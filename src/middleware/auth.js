const jwt = require("jsonwebtoken");
const { AdminUser } = require("../models");
const config = require("../config/config");

// Authenticate admin users
exports.authenticateAdmin = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied, no token provided",
    });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, config.jwtSecret);

    if (decoded.type !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin privileges required",
      });
    }

    const admin = await AdminUser.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!admin || !admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Access denied, invalid or inactive admin",
      });
    }

    // Attach user info to request
    req.userId = admin.id;
    req.user = admin;
    req.userType = "admin";
    req.adminRole = admin.role;

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(400).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// Alias for authenticateAdmin (for backward compatibility)
exports.authenticateToken = exports.authenticateAdmin;

// Optional authentication (for public endpoints that might need user info)
exports.optionalAuth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next(); // Continue without authentication
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    if (decoded.type === "admin") {
      const admin = await AdminUser.findByPk(decoded.id, {
        attributes: { exclude: ["password"] },
      });

      if (admin && admin.isActive) {
        req.userId = admin.id;
        req.user = admin;
        req.userType = "admin";
        req.adminRole = admin.role;
      }
    }

    next();
  } catch (error) {
    // If token is invalid, continue without authentication
    next();
  }
};

// Check if admin has super-admin role
exports.requireSuperAdmin = (req, res, next) => {
  if (req.userType !== "admin" || req.adminRole !== "super-admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied, super-admin privileges required",
    });
  }
  next();
};

// Check if admin has admin role (admin or super-admin)
exports.requireAdmin = (req, res, next) => {
  if (
    req.userType !== "admin" ||
    (req.adminRole !== "admin" && req.adminRole !== "super-admin")
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied, admin privileges required",
    });
  }
  next();
};

// Check if admin has any role except regular user
exports.requireAdminOrHigher = (req, res, next) => {
  if (req.userType !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied, admin access required",
    });
  }
  
  if (req.adminRole === "regular user") {
    return res.status(403).json({
      success: false,
      message: "Access denied, elevated privileges required",
    });
  }
  
  next();
};

// Verify admin can only access their own resources (unless super-admin)
exports.verifyAdminOwnership = (userIdParam = "id") => {
  return (req, res, next) => {
    // Super admins can access all resources
    if (req.adminRole === "super-admin") {
      return next();
    }

    const resourceUserId =
      req.params[userIdParam] ||
      req.body[userIdParam] ||
      req.query[userIdParam];

    // If no resource user ID specified, allow (creation cases)
    if (!resourceUserId) {
      return next();
    }

    // Check if accessing own resource
    if (resourceUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied, you can only access your own resources",
      });
    }

    next();
  };
};

// Rate limiting helper (can be enhanced with redis)
const requestCounts = new Map();

exports.rateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const key = req.userId || req.ip;
    const now = Date.now();
    
    if (!requestCounts.has(key)) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userData = requestCounts.get(key);
    
    if (now > userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + windowMs;
      return next();
    }

    if (userData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later",
      });
    }

    userData.count++;
    next();
  };
};

module.exports = exports;
