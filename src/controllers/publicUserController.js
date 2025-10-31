const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const config = require("../config/config");
const { PublicUser, TokenTransaction } = require("../models");

const signPublicJwt = (userId) => {
  return jwt.sign({ id: userId, type: "public" }, config.jwtSecret, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res) => {
  try {
    const {
      name,
      gender,
      age,
      city,
      category,
      phone,
      email,
      password,
      latitude,
      longitude,
    } = req.body;
    if (!name || !phone || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }
    const exists = await PublicUser.findOne({
      where: { [Op.or]: [{ email }, { phone }] },
    });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Email or phone already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await PublicUser.create({
      name,
      gender,
      age,
      city,
      category,
      phone,
      email,
      password: hashed,
      latitude,
      longitude,
    });
    const token = signPublicJwt(user.id);
    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { ...user.toJSON(), password: undefined, otp: undefined },
      },
    });
  } catch (err) {
    console.error("register error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Registration failed" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    const user = await PublicUser.findOne({ where: { email } });
    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    const token = signPublicJwt(user.id);
    return res.json({
      success: true,
      data: {
        token,
        user: { ...user.toJSON(), password: undefined, otp: undefined },
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
};

exports.requestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email required" });
    const user = await PublicUser.findOne({ where: { email } });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.update({ otp, otp_expiry: expiry });
    // Integrate email/SMS later
    return res.json({ success: true, message: "OTP generated", data: { otp } });
  } catch (err) {
    console.error("requestOtp error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate OTP" });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await PublicUser.findOne({ where: { email } });
    if (!user || !user.otp || !user.otp_expiry)
      return res
        .status(400)
        .json({ success: false, message: "No OTP requested" });
    if (user.otp !== otp || new Date(user.otp_expiry) < new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }
    await user.update({ otp: null, otp_expiry: null });
    const token = signPublicJwt(user.id);
    return res.json({
      success: true,
      data: { token, user: { ...user.toJSON(), password: undefined } },
    });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to verify OTP" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error("getMe error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch profile" });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const allowed = [
      "name",
      "gender",
      "age",
      "city",
      "category",
      "bio",
      "photo",
      "email",
      "phone",
      "latitude",
      "longitude",
    ];
    const updates = {};

    // Handle file upload if profile_image is provided
    if (req.file) {
      // File path relative to uploads folder (e.g., "profiles/filename.jpg")
      const photoPath = `profiles/${req.file.filename}`;
      updates.photo = photoPath;
    }

    // Check for email/phone uniqueness if they're being updated
    if (req.body.email) {
      const existingUser = await PublicUser.findOne({
        where: {
          email: req.body.email,
          id: { [Op.ne]: req.publicUserId },
        },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "Email already in use" });
      }
    }

    if (req.body.phone) {
      const existingUser = await PublicUser.findOne({
        where: {
          phone: req.body.phone,
          id: { [Op.ne]: req.publicUserId },
        },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "Phone number already in use" });
      }
    }

    // Add fields from req.body (works for both JSON and form-data)
    for (const key of allowed) {
      if (
        req.body[key] !== undefined &&
        req.body[key] !== null &&
        req.body[key] !== ""
      ) {
        if (key === "age") {
          const ageValue = parseInt(req.body[key]);
          if (!isNaN(ageValue) && ageValue > 0) {
            updates[key] = ageValue;
          }
        } else if (key === "latitude" || key === "longitude") {
          const coordValue = parseFloat(req.body[key]);
          if (!isNaN(coordValue)) {
            updates[key] = coordValue;
          }
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    // Check if there are any updates to make
    if (Object.keys(updates).length === 0) {
      // No updates to make, just return current user
      const user = await PublicUser.findByPk(req.publicUserId, {
        attributes: { exclude: ["password", "otp"] },
      });
      return res.json({ success: true, data: user });
    }

    await PublicUser.update(updates, { where: { id: req.publicUserId } });
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error("updateMe error:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      body: req.body,
      file: req.file,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

exports.getWallet = async (req, res) => {
  try {
    const user = await PublicUser.findByPk(req.publicUserId);
    const transactions = await TokenTransaction.findAll({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    return res.json({
      success: true,
      data: { balance: user.token_balance, transactions },
    });
  } catch (err) {
    console.error("getWallet error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch wallet" });
  }
};

// Public listing with filters and guest gating
exports.list = async (req, res) => {
  try {
    const {
      city,
      category,
      isVerified,
      online,
      q,
      page = 1,
      pageSize = 20,
    } = req.query;
    const where = {};
    if (city) where.city = city;
    if (category) where.category = category;
    if (isVerified !== undefined) where.isVerified = isVerified === "true";
    if (online !== undefined) where.is_online = online === "true";
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { city: { [Op.iLike]: `%${q}%` } },
      ];
    }

    // Guest gating: guests cannot view premium categories or verified users list
    if (!req.publicUserId) {
      where.category = where.category || { [Op.eq]: "Regular" };
      where.isVerified = false;
    }

    const limit = Math.min(Number(pageSize) || 20, 50);
    const offset = (Number(page) - 1) * limit;

    const rows = await PublicUser.findAll({
      where,
      attributes: {
        exclude: ["password", "otp", "phone"], // mask phone in listings
      },
      order: [
        ["isVerified", "DESC"],
        ["boost_score", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit,
      offset,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("users list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list users" });
  }
};

// Featured users for homepage carousel
exports.featured = async (req, res) => {
  try {
    const now = new Date();
    const where = {
      [Op.or]: [
        { is_featured_until: { [Op.gt]: now } },
        { boost_score: { [Op.gt]: 0 } },
        { isVerified: true },
      ],
    };
    // Guest gating: exclude premium categories for guests
    if (!req.publicUserId) {
      where.category = { [Op.eq]: "Regular" };
    }
    const rows = await PublicUser.findAll({
      where,
      attributes: { exclude: ["password", "otp", "phone"] },
      order: [
        ["is_featured_until", "DESC"],
        ["boost_score", "DESC"],
      ],
      limit: 20,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("users featured error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch featured users" });
  }
};

// Admin endpoint to list all public users without restrictions
exports.adminList = async (req, res) => {
  try {
    const {
      city,
      category,
      isVerified,
      online,
      q,
      page = 1,
      pageSize = 10,
    } = req.query;
    const where = {};
    if (city) where.city = city;
    if (category) where.category = category;
    if (isVerified !== undefined) where.isVerified = isVerified === "true";
    if (online !== undefined) where.is_online = online === "true";
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { city: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { phone: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const limit = Math.min(Number(pageSize) || 10, 100);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await PublicUser.findAndCountAll({
      where,
      attributes: {
        exclude: ["password", "otp"], // Admin can see phone numbers
      },
      order: [
        ["createdAt", "DESC"],
        ["isVerified", "DESC"],
        ["boost_score", "DESC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("admin list public users error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list public users" });
  }
};

// Admin endpoint to get a single public user by ID
exports.adminGetById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await PublicUser.findByPk(id, {
      attributes: { exclude: ["password", "otp"] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Public user not found",
      });
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error("admin get public user by id error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch public user",
    });
  }
};
