const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { PublicUser } = require("../models");

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
    const user = await PublicUser.findByPk(decoded.id, {
      attributes: { exclude: ["password", "otp"] },
    });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }
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
      const user = await PublicUser.findByPk(decoded.id, {
        attributes: { exclude: ["password", "otp"] },
      });
      if (user) {
        req.publicUserId = user.id;
        req.publicUser = user;
      }
    }
  } catch (_) {}
  next();
};

module.exports = exports;
