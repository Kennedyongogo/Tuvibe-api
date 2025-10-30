const { PremiumVerification, PublicUser } = require("../models");
const { Op } = require("sequelize");

exports.requestVerification = async (req, res) => {
  try {
    // one active request per user
    const existing = await PremiumVerification.findOne({
      where: {
        public_user_id: req.publicUserId,
        verification_status: "pending",
      },
    });
    if (existing)
      return res
        .status(409)
        .json({ success: false, message: "Request already pending" });
    const record = await PremiumVerification.create({
      public_user_id: req.publicUserId,
      verification_status: "pending",
    });
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("requestVerification error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to request verification" });
  }
};

exports.listRequests = async (_req, res) => {
  try {
    const rows = await PremiumVerification.findAll({
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("listRequests error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch requests" });
  }
};

exports.approve = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const rec = await PremiumVerification.findByPk(id);
    if (!rec)
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    await rec.update({
      verification_status: "approved",
      admin_id: req.userId,
      notes,
    });
    await PublicUser.update(
      { isVerified: true },
      { where: { id: rec.public_user_id } }
    );
    return res.json({ success: true, data: rec });
  } catch (err) {
    console.error("approve error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to approve" });
  }
};

exports.reject = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const rec = await PremiumVerification.findByPk(id);
    if (!rec)
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    await rec.update({
      verification_status: "rejected",
      admin_id: req.userId,
      notes,
    });
    return res.json({ success: true, data: rec });
  } catch (err) {
    console.error("reject error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject" });
  }
};

// Premium Lounge listings by category with cost metadata
exports.loungeByCategory = async (req, res) => {
  try {
    const { category } = req.params; // "Sugar Mummy" | "Sponsor" | "Ben 10"
    const allowed = ["Sugar Mummy", "Sponsor", "Ben 10"];
    if (!allowed.includes(category)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category" });
    }
    // Guests are not allowed to view premium lounge
    if (!req.publicUserId) {
      return res
        .status(401)
        .json({ success: false, message: "Login required" });
    }
    const rows = await PublicUser.findAll({
      where: { category, isVerified: true },
      attributes: { exclude: ["password", "otp", "phone"] },
      order: [
        ["boost_score", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 50,
    });
    // Token cost metadata (aligned with chat unlock controller)
    const costMap = {
      Regular: 5,
      "Sugar Mummy": 20,
      Sponsor: 20,
      "Ben 10": 10,
    };
    return res.json({
      success: true,
      data: { cost: costMap[category] ?? 10, users: rows },
    });
  } catch (err) {
    console.error("loungeByCategory error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch premium lounge" });
  }
};
