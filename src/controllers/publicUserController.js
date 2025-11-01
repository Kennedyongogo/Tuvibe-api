const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const config = require("../config/config");
const { PublicUser, TokenTransaction, ProfileView } = require("../models");

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
    const now = new Date();
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
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null,  // Clear last_seen_at on registration (only set on logout)
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
    
    // Update login timestamp and clear logout timestamp
    // Clear last_seen_at when user logs in (will be set only on logout)
    const now = new Date();
    await user.update({
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null,  // Clear last_seen_at on login (only set on logout)
    });
    
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
    
    // Update login timestamp and set online status (OTP login)
    // Clear last_seen_at when user logs in (will be set only on logout)
    const now = new Date();
    await user.update({
      otp: null,
      otp_expiry: null,
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null,  // Clear last_seen_at on OTP login (only set on logout)
    });
    
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

exports.logout = async (req, res) => {
  try {
    const user = await PublicUser.findByPk(req.publicUserId);
    if (user) {
      const now = new Date();
      // Update last_seen_at immediately when user clicks logout
      // Set logged_out_at and is_online to false
      await user.update({
        last_seen_at: now,      // Set immediately on logout
        logged_out_at: now,
        is_online: false,
      });
    }
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("logout error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Logout failed" });
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
      // Set photo moderation status to pending
      updates.photo_moderation_status = "pending";
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
        } else if (key === "bio") {
          // If bio is being updated, set moderation status to pending
          updates[key] = req.body[key];
          updates.bio_moderation_status = "pending";
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
    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
    
    // Guest gating: guests cannot view premium categories or verified users list
    if (!req.publicUserId) {
      where.category = category || { [Op.eq]: "Regular" };
      where.isVerified = false;
      if (city) where.city = city;
      if (online !== undefined) where.is_online = online === "true";
      if (q) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${q}%` } },
          { city: { [Op.iLike]: `%${q}%` } },
        ];
      }
    } else {
      // Registered users: can see Regular users and verified premium users only
      // Cannot see unverified premium category users (maintains exclusivity)
      
      // Build base filters
      const baseFilters = {};
      if (city) baseFilters.city = city;
      if (online !== undefined) baseFilters.is_online = online === "true";
      
      // Handle category filter
      if (category) {
        if (premiumCategories.includes(category)) {
          // Filtering by premium category: only show verified users
          where.category = category;
          where.isVerified = true;
          Object.assign(where, baseFilters);
        } else {
          // Filtering by Regular: show all Regular users
          where.category = category;
          Object.assign(where, baseFilters);
        }
      } else {
        // No category filter: show Regular OR verified premium users
        where[Op.and] = [
          {
            [Op.or]: [
              { category: { [Op.eq]: "Regular" } },
              {
                category: { [Op.in]: premiumCategories },
                isVerified: true,
              },
            ],
          },
          ...(Object.keys(baseFilters).length > 0 ? [baseFilters] : []),
        ];
      }
      
      // Handle search query
      if (q) {
        if (!where[Op.and]) where[Op.and] = [];
        where[Op.and].push({
          [Op.or]: [
            { name: { [Op.iLike]: `%${q}%` } },
            { city: { [Op.iLike]: `%${q}%` } },
          ],
        });
      }
      
      // Handle explicit isVerified filter for registered users
      if (isVerified !== undefined) {
        if (category && premiumCategories.includes(category)) {
          // Premium category filter already enforces isVerified=true
          // But if user explicitly wants unverified, they shouldn't see premium users anyway
          // So ignore the filter if it conflicts
        } else {
          where.isVerified = isVerified === "true";
        }
      }
      
      // Exclude current user from browse results
      if (req.publicUserId) {
        where.id = { [Op.ne]: req.publicUserId };
      }
    }

    const limit = Math.min(Number(pageSize) || 20, 50);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await PublicUser.findAndCountAll({
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

    // Filter out unapproved photos and bios for public listings
    const filteredRows = rows.map((user) => {
      const userData = user.toJSON();
      // Hide photo if not approved
      if (userData.photo_moderation_status !== "approved") {
        userData.photo = null;
      }
      // Hide bio if not approved
      if (userData.bio_moderation_status !== "approved") {
        userData.bio = null;
      }
      return userData;
    });

    return res.json({
      success: true,
      data: filteredRows,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
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
    } else {
      // Registered users: only show Regular users or verified premium users in featured
      const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
      where[Op.and] = [
        {
          [Op.or]: [
            { category: { [Op.eq]: "Regular" } },
            {
              category: { [Op.in]: premiumCategories },
              isVerified: true,
            },
          ],
        },
      ];
      // Exclude current user from featured results
      where.id = { [Op.ne]: req.publicUserId };
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

    // Filter out unapproved photos and bios for featured listings
    const filteredRows = rows.map((user) => {
      const userData = user.toJSON();
      // Hide photo if not approved
      if (userData.photo_moderation_status !== "approved") {
        userData.photo = null;
      }
      // Hide bio if not approved
      if (userData.bio_moderation_status !== "approved") {
        userData.bio = null;
      }
      return userData;
    });

    return res.json({ success: true, data: filteredRows });
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

// Get public user profile by ID (for viewing other users)
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await PublicUser.findByPk(id, {
      attributes: {
        exclude: [
          "password",
          "otp",
          "phone",
          "email",
          "token_balance",
          "latitude",
          "longitude",
        ],
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Only show photo if approved
    const safeUser = { ...user.toJSON() };
    if (
      safeUser.photo_moderation_status !== "approved" &&
      safeUser.photo_moderation_status !== null
    ) {
      safeUser.photo = null;
    }

    // Only show bio if approved
    if (
      safeUser.bio_moderation_status !== "approved" &&
      safeUser.bio_moderation_status !== null
    ) {
      safeUser.bio = null;
    }

    return res.json({
      success: true,
      data: safeUser,
    });
  } catch (err) {
    console.error("get user by id error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    });
  }
};

// Track profile view with 24-hour cooldown
exports.trackProfileView = async (req, res) => {
  try {
    const viewerId = req.publicUserId; // Current logged-in user
    const { id: viewedId } = req.params; // User whose profile is being viewed

    // Can't view own profile (doesn't count as view)
    if (viewerId === viewedId) {
      return res.json({
        success: true,
        data: { counted: false, message: "Cannot count view of own profile" },
      });
    }

    // Check if viewed user exists
    const viewedUser = await PublicUser.findByPk(viewedId);
    if (!viewedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get current date (start of day for cooldown calculation)
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    // Check if viewer has already viewed this profile today
    const lastView = await ProfileView.findOne({
      where: {
        viewer_id: viewerId,
        viewed_id: viewedId,
        viewed_at: {
          [Op.gte]: todayStart, // Views from today onwards
        },
      },
      order: [["viewed_at", "DESC"]],
    });

    if (lastView) {
      // Already viewed today, don't count again
      return res.json({
        success: true,
        data: {
          counted: false,
          message: "Profile view already counted today",
          profile_views: viewedUser.profile_views,
        },
      });
    }

    // Check if there's any view in the last 24 hours (more precise cooldown)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentView = await ProfileView.findOne({
      where: {
        viewer_id: viewerId,
        viewed_id: viewedId,
        viewed_at: {
          [Op.gte]: twentyFourHoursAgo,
        },
      },
      order: [["viewed_at", "DESC"]],
    });

    if (recentView) {
      // Viewed within last 24 hours, don't count
      return res.json({
        success: true,
        data: {
          counted: false,
          message: "Profile view already counted in last 24 hours",
          profile_views: viewedUser.profile_views,
        },
      });
    }

    // Create new profile view record
    await ProfileView.create({
      viewer_id: viewerId,
      viewed_id: viewedId,
      viewed_at: now,
    });

    // Increment profile views count
    await viewedUser.increment("profile_views");

    // Fetch updated user to get new count
    await viewedUser.reload();

    return res.json({
      success: true,
      data: {
        counted: true,
        message: "Profile view counted",
        profile_views: viewedUser.profile_views,
      },
    });
  } catch (err) {
    console.error("track profile view error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to track profile view",
    });
  }
};
