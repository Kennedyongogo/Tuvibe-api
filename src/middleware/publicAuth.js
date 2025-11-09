const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { PublicUser } = require("../models");
const { Op } = require("sequelize");

const downgradeExpiredPremium = async (user) => {
  if (!user) return user;
  const categories = ["Sugar Mummy", "Sponsor", "Ben 10"];
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
    console.log(
      `[Premium] Downgraded user ${user.id} – premium expired on ${expiresAt.toISOString()}`
    );
    return user;
  } catch (err) {
    console.error(
      `[Premium] Failed to downgrade expired premium user ${user.id}:`,
      err
    );
    return user;
  }
};

exports.authenticatePublic = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type !== "public") {
      return res
        .status(403)
        .json({ success: false, message: "Invalid token type" });
    }
    let user = await PublicUser.findByPk(decoded.id, {
      attributes: { exclude: ["password", "otp"] },
    });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    user = await downgradeExpiredPremium(user);
    
    // Middleware: No last_seen_at updates here
    // last_seen_at is only set on logout and cleared on login
    
    req.publicUserId = user.id;
    req.publicUser = user;
    next();
  } catch (err) {
    console.error("Public auth error:", err);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

exports.optionalPublicAuth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type === "public") {
      let user = await PublicUser.findByPk(decoded.id, {
        attributes: { exclude: ["password", "otp"] },
      });
      if (user) {
        user = await downgradeExpiredPremium(user);
        req.publicUserId = user.id;
        req.publicUser = user;
      }
    }
  } catch (_) {}
  next();
};

module.exports = exports;
