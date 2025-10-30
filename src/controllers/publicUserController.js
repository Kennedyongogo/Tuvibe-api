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
    const { name, gender, age, city, category, phone, email, password } =
      req.body;
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
    ];
    const updates = {};
    for (const key of allowed)
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    await PublicUser.update(updates, { where: { id: req.publicUserId } });
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error("updateMe error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
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
