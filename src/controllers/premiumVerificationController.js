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
      include: [
        {
          model: PublicUser,
          as: "publicUser",
          attributes: {
            exclude: ["password", "otp"],
          },
        },
      ],
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
    
    // Check if already approved
    if (rec.verification_status === "approved") {
      return res
        .status(400)
        .json({ success: false, message: "Request is already approved" });
    }
    
    // Update verification record
    await rec.update({
      verification_status: "approved",
      admin_id: req.userId,
      notes,
    });
    
    // Update user's verified status
    const [updatedCount] = await PublicUser.update(
      { isVerified: true },
      { where: { id: rec.public_user_id } }
    );
    
    console.log(`Verification approved: User ${rec.public_user_id} is now verified. Admin: ${req.userId}`);
    
    // Fetch updated record with user data
    const updatedRec = await PremiumVerification.findByPk(id, {
      include: [
        {
          model: PublicUser,
          as: "publicUser",
          attributes: {
            exclude: ["password", "otp"],
          },
        },
      ],
    });
    
    return res.json({ 
      success: true, 
      message: "Verification approved successfully",
      data: updatedRec 
    });
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
    
    // Check if already processed
    if (rec.verification_status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "Request has already been processed" });
    }
    
    // Update verification record
    await rec.update({
      verification_status: "rejected",
      admin_id: req.userId,
      notes,
    });
    
    console.log(`Verification rejected: Request ${id}. Admin: ${req.userId}`);
    
    // Fetch updated record with user data
    const updatedRec = await PremiumVerification.findByPk(id, {
      include: [
        {
          model: PublicUser,
          as: "publicUser",
          attributes: {
            exclude: ["password", "otp"],
          },
        },
      ],
    });
    
    return res.json({ 
      success: true, 
      message: "Verification rejected",
      data: updatedRec 
    });
  } catch (err) {
    console.error("reject error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject" });
  }
};

// Get current user's verification status
exports.getMyStatus = async (req, res) => {
  try {
    const verification = await PremiumVerification.findOne({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
    });
    
    if (!verification) {
      return res.json({ 
        success: true, 
        data: { 
          status: null, 
          message: "No verification request found" 
        } 
      });
    }
    
    return res.json({ 
      success: true, 
      data: {
        id: verification.id,
        status: verification.verification_status,
        createdAt: verification.createdAt,
        notes: verification.notes,
      } 
    });
  } catch (err) {
    console.error("getMyStatus error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch verification status" });
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
      where: { 
        category, 
        isVerified: true,
        id: { [Op.ne]: req.publicUserId } // Exclude current user
      },
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
