const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op, Sequelize } = require("sequelize");
const config = require("../config/config");
const {
  PublicUser,
  TokenTransaction,
  ProfileView,
  ProfileBoost,
  LookingForPost,
  Favourite,
  Notification,
  Report,
  ProfileTag,
  ChatUnlock,
  PremiumVerification,
  Payment,
  AccountSuspension,
} = require("../models");
const { sequelize } = require("../config/database");
const {
  computeAgeFromBirthYear,
  extractBirthYearFromPayload,
  birthYearProvided,
  formatUserForResponse,
  formatUserForPublicResponse,
  MIN_PUBLIC_USER_AGE,
  isAdultFromBirthYear,
  isAdultFromAge,
  deriveBirthYearFromAge,
} = require("../utils/userProfile");
const { validatePhoneNumber } = require("../utils/phone");
const { sendEventToUser } = require("../routes/sseRoutes");
const {
  useWhoViewedForRegular,
  getActiveSubscriptionForUser,
  REGULAR_PLANS,
  useSuggestedMatchesForRegular,
} = require("../services/subscriptionService");
const {
  syncGoldVerificationBadge,
} = require("../services/goldVerificationService");
const { getPremiumBadgeType } = require("../services/premiumBadgeService");

// Helper to add badge type to user data
const addBadgeTypeToUser = async (userData, userInstance) => {
  if (!userData || !userData.isVerified) {
    userData.badgeType = null;
    return userData;
  }

  const PREMIUM_CATEGORIES = [
    "Sugar Mummy",
    "Sponsor",
    "Ben 10",
    "Urban Chics",
  ];

  // Regular users with Gold subscription get "gold" badge
  if (userData.category === "Regular") {
    userData.badgeType = "gold";
    return userData;
  }

  // Premium users - check subscription plan
  if (PREMIUM_CATEGORIES.includes(userData.category)) {
    try {
      const badgeType = await getPremiumBadgeType(
        userInstance || { id: userData.id, category: userData.category }
      );
      userData.badgeType = badgeType; // "silver" or "gold"
    } catch (error) {
      console.error("Error getting badge type:", error);
      userData.badgeType = null;
    }
  } else {
    userData.badgeType = null;
  }

  return userData;
};

const signPublicJwt = (userId) => {
  return jwt.sign({ id: userId, type: "public" }, config.jwtSecret, {
    expiresIn: "7d",
  });
};

// Helper function to filter unapproved photos from photos array
const filterApprovedPhotos = (photos) => {
  if (!photos || !Array.isArray(photos)) {
    return [];
  }
  return photos.filter((photo) => photo.moderation_status === "approved");
};

const activeBoostUntilSubquery = `(
  SELECT pb.ends_at
  FROM profile_boosts pb
  WHERE pb.public_user_id = "PublicUser"."id"
    AND pb.status = 'active'
    AND pb.ends_at > NOW()
  ORDER BY pb.ends_at DESC
  LIMIT 1
)`;

const activeBoostExistsLiteral = Sequelize.literal(`(
  SELECT COUNT(pb.id)
  FROM profile_boosts pb
  WHERE pb.public_user_id = "PublicUser"."id"
    AND pb.status = 'active'
    AND pb.ends_at > NOW()
) > 0`);

const boostHistoryExistsLiteral = Sequelize.literal(`(
  SELECT COUNT(pb.id)
  FROM profile_boosts pb
  WHERE pb.public_user_id = "PublicUser"."id"
) > 0`);

const activeBoostPresenceOrderLiteral = Sequelize.literal(
  `CASE WHEN ${activeBoostUntilSubquery} IS NULL THEN 0 ELSE 1 END`
);
const activeBoostUntilOrderLiteral = Sequelize.literal(
  `COALESCE(${activeBoostUntilSubquery}, '1970-01-01'::timestamp)`
);

exports.register = async (req, res) => {
  try {
    const {
      name,
      username,
      gender,
      phone,
      email,
      password,
      latitude,
      longitude,
      bio,
      category,
    } = req.body;
    const normalizedUsername =
      typeof username === "string" ? username.trim() : "";
    if (!name || !normalizedUsername || !phone || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }
    if (!req.file) {
      console.warn("Registration blocked due to missing profile image:", {
        email,
        phone,
      });
      return res.status(400).json({
        success: false,
        message: "Profile image is required to register.",
      });
    }
    const {
      valid: isPhoneValid,
      normalized: normalizedPhone,
      message: phoneValidationMessage,
    } = validatePhoneNumber(phone);

    if (!isPhoneValid) {
      console.warn("Registration blocked due to invalid phone number:", {
        email,
        phone,
      });
      return res.status(400).json({
        success: false,
        message: phoneValidationMessage,
      });
    }

    const exists = await PublicUser.findOne({
      where: {
        [Op.or]: [
          { email },
          { phone: normalizedPhone },
          { username: normalizedUsername },
        ],
      },
    });
    if (exists)
      return res.status(409).json({
        success: false,
        message: "Email, phone, or username already in use",
      });

    const hashed = await bcrypt.hash(password, 10);
    const now = new Date();
    if (!birthYearProvided(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Age confirmation is required to create an account.",
      });
    }

    const birthYear = extractBirthYearFromPayload(req.body);

    if (birthYearProvided(req.body) && birthYear === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid year of birth or age provided",
      });
    }

    if (birthYear !== null) {
      const adultCheck = isAdultFromBirthYear(birthYear);
      if (adultCheck === null || adultCheck === false) {
        console.warn("Registration blocked for underage user attempt:", {
          email,
          phone,
          birthYear,
        });
        return res.status(403).json({
          success: false,
          message: `You must be at least ${MIN_PUBLIC_USER_AGE} years old to join TuVibe.`,
        });
      }
    }

    // Validate and normalize category (optional on signup)
    const ALLOWED_CATEGORIES = [
      "Regular",
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const normalizedCategory =
      typeof category === "string" && ALLOWED_CATEGORIES.includes(category)
        ? category
        : "Regular";

    // Prepare user data
    const userData = {
      name,
      username: normalizedUsername,
      gender,
      category: normalizedCategory,
      phone: normalizedPhone,
      email,
      password: hashed,
      latitude,
      longitude,
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null, // Clear last_seen_at on registration (only set on logout)
    };

    // Handle bio if provided
    if (bio) {
      userData.bio = bio;
      // Set bio moderation status to pending
      userData.bio_moderation_status = "pending";
    }

    // Handle file upload if profile_image is provided
    if (req.file) {
      // File path relative to uploads folder (e.g., "profiles/filename.jpg")
      const photoPath = `profiles/${req.file.filename}`;
      userData.photo = photoPath;
      // Set photo moderation status to pending
      userData.photo_moderation_status = "pending";
    }

    if (birthYear !== null) {
      userData.birth_year = birthYear;
      const computedAge = computeAgeFromBirthYear(birthYear);
      if (computedAge !== null) {
        userData.age = computedAge;
      }
    }

    const user = await PublicUser.create(userData);
    const token = signPublicJwt(user.id);
    const formattedUser = formatUserForResponse(user);

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          ...formattedUser,
          password: undefined,
          otp: undefined,
        },
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

    let resolvedBirthYear = user.birth_year || null;
    let adultCheck = null;

    if (resolvedBirthYear !== null && resolvedBirthYear !== undefined) {
      adultCheck = isAdultFromBirthYear(resolvedBirthYear);
    }

    if (adultCheck === null && user.age !== undefined && user.age !== null) {
      adultCheck = isAdultFromAge(user.age);
      if (
        adultCheck !== null &&
        resolvedBirthYear === null &&
        adultCheck === true
      ) {
        const derivedBirthYear = deriveBirthYearFromAge(user.age);
        if (derivedBirthYear !== null) {
          resolvedBirthYear = derivedBirthYear;
        }
      }
    }

    if (adultCheck === null) {
      console.warn("Login blocked due to missing age verification:", {
        userId: user.id,
        email: user.email,
      });
      return res.status(403).json({
        success: false,
        message:
          "We could not confirm your age. Please contact support to update your profile.",
      });
    }

    if (adultCheck === false) {
      console.warn("Login blocked for underage user attempt:", {
        userId: user.id,
        email: user.email,
        birthYear: resolvedBirthYear,
        age: user.age,
      });
      return res.status(403).json({
        success: false,
        message: `You must be at least ${MIN_PUBLIC_USER_AGE} years old to access TuVibe.`,
      });
    }

    // Update login timestamp and clear logout timestamp
    // Clear last_seen_at when user logs in (will be set only on logout)
    const now = new Date();
    const loginUpdates = {
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null, // Clear last_seen_at on login (only set on logout)
    };

    if (resolvedBirthYear !== null && resolvedBirthYear !== user.birth_year) {
      loginUpdates.birth_year = resolvedBirthYear;
      const computedAge = computeAgeFromBirthYear(resolvedBirthYear);
      if (computedAge !== null) {
        loginUpdates.age = computedAge;
      }
    }

    await user.update(loginUpdates);

    const token = signPublicJwt(user.id);
    const formattedUser = formatUserForResponse(user);
    return res.json({
      success: true,
      data: {
        token,
        user: {
          ...formattedUser,
          password: undefined,
          otp: undefined,
        },
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const emailFromBody = req.body?.Email || req.body?.email;

    if (!emailFromBody || typeof emailFromBody !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const normalizedEmail = emailFromBody.trim().toLowerCase();

    const publicUser = await PublicUser.findOne({
      where: Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("email")),
        normalizedEmail
      ),
    });

    if (!publicUser) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find an account with that email.",
      });
    }

    const newPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await publicUser.update({ password: hashedPassword });

    const emailConfig = config.emailService || {};
    const transporter = nodemailer.createTransport({
      service: emailConfig.provider || "gmail",
      auth: {
        user: emailConfig.user || "tuvibeonline@gmail.com",
        pass: emailConfig.pass || "eraw tjci pfcs jfii",
      },
    });

    try {
      await transporter.sendMail({
        from: emailConfig.user || "tuvibeonline@gmail.com",
        to: normalizedEmail,
        subject: "TuVibe Password Reset",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">TuVibe Password Reset</h2>
            <p>Hello ${publicUser.name || "there"},</p>
            <p>Your password for the TuVibe account associated with <strong>${normalizedEmail}</strong> has been reset.</p>
            <div style="background-color: #f7f7f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 12px 0; color: #555;">Use the temporary password below to sign in, then update it immediately from your profile settings.</p>
              <p style="font-size: 1.1rem; font-weight: 600; color: #d4af37;">${newPassword}</p>
            </div>
            <p>If you did not request this reset, please reply to this email and let us know right away.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #777; font-size: 12px;">TuVibe Support Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Public user password reset email error:", emailError);
    }

    return res.status(200).json({
      success: true,
      message: "Password reset email sent.",
    });
  } catch (error) {
    console.error("public forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again later.",
    });
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
      last_seen_at: null, // Clear last_seen_at on OTP login (only set on logout)
    });

    const token = signPublicJwt(user.id);
    const formattedUser = formatUserForResponse(user);
    return res.json({
      success: true,
      data: {
        token,
        user: {
          ...formattedUser,
          password: undefined,
          otp: undefined,
        },
      },
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

    // Sync badges based on user category
    if (user) {
      const PREMIUM_CATEGORIES = [
        "Sugar Mummy",
        "Sponsor",
        "Ben 10",
        "Urban Chics",
      ];
      if (user.category === "Regular") {
        const {
          syncGoldVerificationBadge,
        } = require("../services/goldVerificationService");
        await syncGoldVerificationBadge(user);
      } else if (PREMIUM_CATEGORIES.includes(user.category)) {
        const { syncPremiumBadge } = require("../services/premiumBadgeService");
        await syncPremiumBadge(user);
      }
      // Reload user to get updated isVerified status
      await user.reload();
    }

    // Note: getMe doesn't emit SSE events since it's just a read operation
    // SSE events are emitted when data actually changes (updateMe, token changes, etc.)

    const userData = formatUserForResponse(user);
    await addBadgeTypeToUser(userData, user);

    return res.json({
      success: true,
      data: userData,
    });
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
        last_seen_at: now, // Set immediately on logout
        logged_out_at: now,
        is_online: false,
      });
    }
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("logout error:", err);
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

// Return "who viewed your profile" list, gated by Regular plan allowances
exports.getWhoViewedMe = async (req, res) => {
  try {
    const viewerId = req.publicUserId;

    const currentUser = await PublicUser.findByPk(viewerId);
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const PREMIUM_CATEGORIES = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const isPremium = PREMIUM_CATEGORIES.includes(currentUser.category);

    if (currentUser.category === "Regular") {
      const usage = await useWhoViewedForRegular(viewerId);

      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message:
            "Active subscription required to see who viewed your profile.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message:
            "Daily 'who viewed your profile' limit reached for your plan.",
        });
      }
    } else if (isPremium) {
      const {
        useWhoViewedForPremium,
      } = require("../services/subscriptionService");
      const usage = await useWhoViewedForPremium(viewerId);

      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message:
            "Active subscription required to see who viewed your profile.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message:
            "Daily 'who viewed your profile' limit reached for your plan.",
        });
      }
    }

    const views = await ProfileView.findAll({
      where: { viewed_id: viewerId },
      include: [
        {
          model: PublicUser,
          as: "viewer",
          attributes: [
            "id",
            "name",
            "username",
            "photo",
            "photo_moderation_status",
            "photos",
            "category",
            "age",
            "birth_year",
            "gender",
            "bio",
            "county",
            "isVerified",
            "is_online",
            "last_seen_at",
          ],
        },
      ],
      order: [["viewed_at", "DESC"]],
      limit: 50,
    });

    const formatted = views.map((row) => {
      const data = row.toJSON();
      if (data.viewer) {
        data.viewer = formatUserForPublicResponse(data.viewer);
        if (data.viewer.photo_moderation_status !== "approved") {
          data.viewer.photo = null;
        }
        if (data.viewer.photos) {
          data.viewer.photos = filterApprovedPhotos(data.viewer.photos);
        }
        if (data.viewer.bio_moderation_status !== "approved") {
          data.viewer.bio = null;
        }
      }
      return data;
    });

    return res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("getWhoViewedMe error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile views",
    });
  }
};

exports.getSuggestedMatches = async (req, res) => {
  try {
    const viewerId = req.publicUserId;
    const viewer = await PublicUser.findByPk(viewerId, {
      attributes: ["category"],
    });
    if (!viewer) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let usage = null;
    let allowedLimit = Infinity;

    const PREMIUM_CATEGORIES = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const isPremium = PREMIUM_CATEGORIES.includes(viewer.category);

    if (viewer.category === "Regular") {
      usage = await useSuggestedMatchesForRegular(viewerId);
      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to get suggested matches.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message:
            "Daily suggested matches limit reached for your plan. Try again tomorrow.",
        });
      }

      allowedLimit = usage.limit ?? Infinity;
    } else if (isPremium) {
      const {
        useSuggestedMatchesForPremium,
      } = require("../services/subscriptionService");
      usage = await useSuggestedMatchesForPremium(viewerId);
      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to get suggested matches.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message:
            "Daily suggested matches limit reached for your plan. Try again tomorrow.",
        });
      }

      allowedLimit = usage.limit ?? Infinity;
    }

    const requestedLimit = Number.parseInt(
      req.query.limit ?? req.query.count ?? 5,
      10
    );
    const desiredLimit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? requestedLimit
        : 5;
    const maxLimit =
      Number.isFinite(allowedLimit) && allowedLimit > 0
        ? allowedLimit
        : desiredLimit;
    const fetchLimit = Math.max(1, Math.min(desiredLimit, maxLimit, 10));

    const matches = await PublicUser.findAll({
      where: {
        id: { [Op.ne]: viewerId },
      },
      attributes: {
        exclude: ["password", "otp", "phone"],
        include: [
          [Sequelize.literal(activeBoostUntilSubquery), "active_boost_until"],
        ],
      },
      order: [[Sequelize.literal("random()"), "ASC"]],
      limit: fetchLimit,
    });

    const formatted = matches.map((row) => {
      const data = formatUserForPublicResponse(row);
      if (data.photo_moderation_status !== "approved") {
        data.photo = null;
      }
      if (data.photos) {
        data.photos = filterApprovedPhotos(data.photos);
      }
      if (data.bio_moderation_status !== "approved") {
        data.bio = null;
      }
      return data;
    });

    return res.json({
      success: true,
      data: {
        matches: formatted,
        limit: Number.isFinite(allowedLimit) ? allowedLimit : null,
        remaining: usage?.remaining ?? null,
        used_today: usage?.usedCount ?? null,
        requested: fetchLimit,
      },
    });
  } catch (err) {
    console.error("getSuggestedMatches error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch suggested matches",
    });
  }
};

exports.getBoostStatus = async (req, res) => {
  try {
    const now = new Date();

    const activeBoosts = await ProfileBoost.findAll({
      where: {
        public_user_id: req.publicUserId,
        status: "active",
        ends_at: { [Op.gt]: now },
      },
      order: [["ends_at", "ASC"]],
    });

    if (!activeBoosts || activeBoosts.length === 0) {
      return res.json({
        success: true,
        data: {
          status: "inactive",
          boost: null,
          boosts: [],
          activeCount: 0,
        },
      });
    }

    const formattedBoosts = activeBoosts.map((boost) => {
      const radiusValue =
        boost.target_radius_km !== null
          ? Number.parseFloat(boost.target_radius_km)
          : null;
      return {
        id: boost.id,
        starts_at: boost.starts_at,
        ends_at: boost.ends_at,
        target_category: boost.target_category,
        target_area: boost.target_area,
        radius_km: radiusValue,
        target_lat: boost.target_lat,
        target_lng: boost.target_lng,
        status: boost.status,
      };
    });

    return res.json({
      success: true,
      data: {
        status: "active",
        boost: formattedBoosts[0],
        boosts: formattedBoosts,
        activeCount: formattedBoosts.length,
      },
    });
  } catch (err) {
    console.error("getBoostStatus error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch boost status" });
  }
};

// Admin endpoint to get user's boost status
exports.adminGetUserBoostStatus = async (req, res) => {
  try {
    const { public_user_id } = req.params;

    if (!public_user_id) {
      return res.status(400).json({
        success: false,
        message: "public_user_id is required",
      });
    }

    const now = new Date();

    const activeBoosts = await ProfileBoost.findAll({
      where: {
        public_user_id: public_user_id,
        status: "active",
        ends_at: { [Op.gt]: now },
      },
      order: [["ends_at", "ASC"]],
    });

    if (!activeBoosts || activeBoosts.length === 0) {
      return res.json({
        success: true,
        data: {
          status: "inactive",
          boost: null,
          boosts: [],
          activeCount: 0,
        },
      });
    }

    const formattedBoosts = activeBoosts.map((boost) => {
      const radiusValue =
        boost.target_radius_km !== null
          ? Number.parseFloat(boost.target_radius_km)
          : null;
      return {
        id: boost.id,
        starts_at: boost.starts_at,
        ends_at: boost.ends_at,
        target_category: boost.target_category,
        target_area: boost.target_area,
        radius_km: radiusValue,
        target_lat: boost.target_lat,
        target_lng: boost.target_lng,
        status: boost.status,
      };
    });

    return res.json({
      success: true,
      data: {
        status: "active",
        boost: formattedBoosts[0],
        boosts: formattedBoosts,
        activeCount: formattedBoosts.length,
      },
    });
  } catch (err) {
    console.error("adminGetUserBoostStatus error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch boost status" });
  }
};

exports.updateMe = async (req, res) => {
  let updates = {};
  try {
    const allowed = [
      "name",
      "gender",
      "county",
      "bio",
      "photo",
      "email",
      "phone",
      "latitude",
      "longitude",
    ];

    // Handle single file upload if profile_image is provided (for main photo update)
    if (
      req.files &&
      req.files.profile_image &&
      Array.isArray(req.files.profile_image) &&
      req.files.profile_image.length > 0
    ) {
      // File path relative to uploads folder (e.g., "profiles/filename.jpg")
      const photoPath = `profiles/${req.files.profile_image[0].filename}`;
      updates.photo = photoPath;
      // Set photo moderation status to pending
      updates.photo_moderation_status = "pending";
    }

    // Handle multiple photo uploads if profile_images are provided
    if (
      req.files &&
      req.files.profile_images &&
      Array.isArray(req.files.profile_images) &&
      req.files.profile_images.length > 0
    ) {
      try {
        const user = await PublicUser.findByPk(req.publicUserId);
        if (!user) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        // Ensure existingPhotos is always an array
        let existingPhotos = [];
        if (user.photos) {
          // Handle JSONB data - it might come as array or need parsing
          if (Array.isArray(user.photos)) {
            existingPhotos = user.photos;
          } else if (typeof user.photos === "string") {
            // If it's a string, try to parse it
            try {
              existingPhotos = JSON.parse(user.photos);
              if (!Array.isArray(existingPhotos)) {
                existingPhotos = [];
              }
            } catch (e) {
              existingPhotos = [];
            }
          } else {
            existingPhotos = [];
          }
        }

        // Create new photo objects with pending moderation status
        const newPhotos = req.files.profile_images.map((file) => ({
          path: `profiles/${file.filename}`,
          moderation_status: "pending",
          uploaded_at: new Date().toISOString(),
        }));

        // Add new photos to existing photos array
        updates.photos = [...existingPhotos, ...newPhotos];
      } catch (photoUploadError) {
        console.error("Error handling photo uploads:", photoUploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to process photo uploads",
        });
      }
    }

    // Handle setting profile picture from existing gallery photo
    // Only process if no new file is being uploaded (file upload takes precedence)
    if (
      (req.body.photo_path || req.body.set_profile_photo_from_gallery) &&
      !(
        req.files &&
        req.files.profile_image &&
        Array.isArray(req.files.profile_image) &&
        req.files.profile_image.length > 0
      )
    ) {
      try {
        const photoPath =
          req.body.photo_path || req.body.set_profile_photo_from_gallery;

        if (!photoPath || typeof photoPath !== "string") {
          return res.status(400).json({
            success: false,
            message: "Invalid photo path provided",
          });
        }

        // Fetch user to get their photos array
        const user = await PublicUser.findByPk(req.publicUserId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        // Normalize existing photos to array
        let existingPhotos = [];
        if (user.photos) {
          if (Array.isArray(user.photos)) {
            existingPhotos = user.photos;
          } else if (typeof user.photos === "string") {
            try {
              existingPhotos = JSON.parse(user.photos);
              if (!Array.isArray(existingPhotos)) {
                existingPhotos = [];
              }
            } catch (e) {
              existingPhotos = [];
            }
          }
        }

        // Find the photo in the gallery
        const galleryPhoto = existingPhotos.find(
          (photo) => photo && photo.path === photoPath.trim()
        );

        if (!galleryPhoto) {
          return res.status(404).json({
            success: false,
            message: "Photo not found in your gallery",
          });
        }

        // Only allow approved gallery photos to be set as profile picture
        if (galleryPhoto.moderation_status !== "approved") {
          return res.status(400).json({
            success: false,
            message:
              "Only approved photos from your gallery can be used as profile picture. This photo is still pending approval or has been rejected.",
          });
        }

        // Set the profile picture to the selected approved gallery photo
        // Since the gallery photo was already approved, the profile picture is automatically approved
        updates.photo = photoPath.trim();
        updates.photo_moderation_status = "approved";
      } catch (galleryPhotoError) {
        console.error(
          "Error setting profile picture from gallery:",
          galleryPhotoError
        );
        return res.status(500).json({
          success: false,
          message: "Failed to set profile picture from gallery",
        });
      }
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
      const {
        valid: isPhoneValid,
        normalized: normalizedPhone,
        message: phoneValidationMessage,
      } = validatePhoneNumber(req.body.phone);

      if (!isPhoneValid) {
        return res.status(400).json({
          success: false,
          message: phoneValidationMessage,
        });
      }

      const existingUser = await PublicUser.findOne({
        where: {
          phone: normalizedPhone,
          id: { [Op.ne]: req.publicUserId },
        },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "Phone number already in use" });
      }

      updates.phone = normalizedPhone;
    }

    if (req.body.username !== undefined) {
      const nextUsername =
        typeof req.body.username === "string" ? req.body.username.trim() : "";
      if (!nextUsername) {
        return res.status(400).json({
          success: false,
          message: "Username cannot be empty",
        });
      }

      const existingUsername = await PublicUser.findOne({
        where: {
          username: nextUsername,
          id: { [Op.ne]: req.publicUserId },
        },
      });

      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "Username already in use",
        });
      }

      updates.username = nextUsername;
    }

    const requestedBirthYear = extractBirthYearFromPayload(req.body);
    if (birthYearProvided(req.body)) {
      if (requestedBirthYear === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid year of birth or age provided",
        });
      }
      updates.birth_year = requestedBirthYear;
      const computedAge = computeAgeFromBirthYear(requestedBirthYear);
      updates.age = computedAge !== null ? computedAge : null;
    }

    // Get current user to compare bio changes
    const currentUser = await PublicUser.findByPk(req.publicUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Handle bio separately to allow empty strings (for clearing bio)
    if (
      req.body.bio !== undefined &&
      req.body.bio !== null &&
      allowed.includes("bio")
    ) {
      // Normalize bio strings for comparison (handles Unicode, whitespace, encoding)
      const normalizeBio = (bioStr) => {
        if (!bioStr || typeof bioStr !== "string") return "";
        // Normalize Unicode, collapse whitespace, and trim
        return bioStr
          .normalize("NFKC") // Normalize Unicode characters
          .replace(/\s+/g, " ") // Replace all whitespace with single space
          .trim();
      };

      const newBioNormalized = normalizeBio(req.body.bio);
      const currentBioNormalized = normalizeBio(currentUser.bio);

      // Update bio if:
      // 1. Normalized content is different, OR
      // 2. Raw strings are different (handles encoding edge cases in production)
      const shouldUpdate =
        newBioNormalized !== currentBioNormalized ||
        String(req.body.bio || "") !== String(currentUser.bio || "");

      if (shouldUpdate) {
        // Always store the trimmed version of the new bio (or null if empty)
        updates.bio =
          typeof req.body.bio === "string" && req.body.bio.trim() !== ""
            ? req.body.bio.trim()
            : null;
        updates.bio_moderation_status = "pending";
      }
    }

    // Add fields from req.body (works for both JSON and form-data)
    for (const key of allowed) {
      // Skip bio as it's handled above
      if (key === "bio") {
        continue;
      }

      if (
        req.body[key] !== undefined &&
        req.body[key] !== null &&
        req.body[key] !== ""
      ) {
        if (key === "phone") {
          continue;
        }
        if (key === "latitude" || key === "longitude") {
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
      return res.json({
        success: true,
        data: formatUserForResponse(user),
      });
    }

    // Ensure photos is properly formatted as JSONB array before saving
    if (updates.photos && Array.isArray(updates.photos)) {
      try {
        // Clean and validate photos array - ensure all are plain objects
        const cleanedPhotos = updates.photos
          .filter((photo) => {
            // Keep only valid photo objects with a path
            return (
              photo &&
              typeof photo === "object" &&
              photo.path &&
              typeof photo.path === "string" &&
              photo.path.trim() !== ""
            );
          })
          .map((photo) => {
            // Create a clean plain object for JSONB storage
            const cleanedPhoto = {
              path: String(photo.path).trim(),
              moderation_status: photo.moderation_status || "pending",
            };

            // Handle uploaded_at - ensure it's always an ISO string
            if (photo.uploaded_at) {
              try {
                const date = new Date(photo.uploaded_at);
                if (!isNaN(date.getTime())) {
                  cleanedPhoto.uploaded_at = date.toISOString();
                } else {
                  cleanedPhoto.uploaded_at = new Date().toISOString();
                }
              } catch (e) {
                cleanedPhoto.uploaded_at = new Date().toISOString();
              }
            } else {
              cleanedPhoto.uploaded_at = new Date().toISOString();
            }

            return cleanedPhoto;
          });

        // Only update if we have valid photos
        if (cleanedPhotos.length > 0) {
          updates.photos = cleanedPhotos;
        } else {
          // If all photos were invalid, don't update photos field
          delete updates.photos;
        }
      } catch (photoError) {
        console.error("Error processing photos array:", photoError);
        console.error("Photos array that caused error:", updates.photos);
        // If photos processing fails, remove it from updates to prevent crash
        delete updates.photos;
      }
    }

    // Validate updates object before saving
    try {
      await PublicUser.update(updates, { where: { id: req.publicUserId } });
      const user = await PublicUser.findByPk(req.publicUserId, {
        attributes: { exclude: ["password", "otp"] },
      });

      // Send SSE event for user update
      try {
        sendEventToUser(user.id, "user:update", formatUserForResponse(user));
      } catch (sseError) {
        console.error("[SSE] Error sending user:update event:", sseError);
      }

      return res.json({
        success: true,
        data: formatUserForResponse(user),
      });
    } catch (updateError) {
      console.error("Database update error:", updateError);
      console.error("Update error details:", {
        message: updateError.message,
        name: updateError.name,
        stack: updateError.stack,
      });
      throw updateError; // Re-throw to be caught by outer catch
    }
  } catch (err) {
    console.error("updateMe error:", err);
    console.error("Error details:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      body: req.body,
      files: req.files
        ? {
            profile_image: req.files.profile_image
              ? req.files.profile_image.length
              : 0,
            profile_images: req.files.profile_images
              ? req.files.profile_images.length
              : 0,
          }
        : null,
      updatesKeys: Object.keys(updates || {}),
    });

    // Ensure we always send a response
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
};

// Upload gallery photos immediately (optimistic flow). Appends photos with pending moderation.
exports.addPhotos = async (req, res) => {
  try {
    if (
      !req.files ||
      !req.files.profile_images ||
      !Array.isArray(req.files.profile_images) ||
      req.files.profile_images.length === 0
    ) {
      return res
        .status(400)
        .json({ success: false, message: "No photos provided" });
    }

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Normalize existing photos to array
    let existingPhotos = [];
    if (user.photos) {
      if (Array.isArray(user.photos)) {
        existingPhotos = user.photos;
      } else if (typeof user.photos === "string") {
        try {
          const parsed = JSON.parse(user.photos);
          existingPhotos = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          existingPhotos = [];
        }
      }
    }

    // Map uploaded files to photo objects
    const uploadedAt = new Date().toISOString();
    const newPhotos = req.files.profile_images.map((file) => ({
      path: `profiles/${file.filename}`,
      moderation_status: "pending",
      uploaded_at: uploadedAt,
    }));

    const updatedPhotos = [...existingPhotos, ...newPhotos];

    await user.update({ photos: updatedPhotos });
    await user.reload();

    // Return updated safe user payload
    const safeUser = formatUserForResponse(user);

    return res.json({
      success: true,
      message: "Photos uploaded and pending approval",
      data: {
        user: safeUser,
        added: newPhotos.length,
      },
    });
  } catch (err) {
    console.error("addPhotos error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to upload photos",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (
      !currentPassword ||
      typeof currentPassword !== "string" ||
      !newPassword ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      user.password || ""
    );
    if (!isCurrentValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update password",
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

// Haversine formula helper function to calculate distance in kilometers
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const parseCoordinate = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

// Public listing with filters and guest gating
exports.list = async (req, res) => {
  try {
    const {
      county,
      category,
      isVerified,
      online,
      q,
      page = 1,
      pageSize = 20,
      nearby,
      radius = 10, // Default radius in kilometers
    } = req.query;
    const where = {};
    const premiumCategories = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];

    // Location-based search variables
    let userLat = null;
    let userLon = null;
    let searchRadius = parseFloat(radius) || 10;
    const isNearbySearch = nearby === "true" && req.publicUserId;

    // Get current user's location for nearby search
    if (isNearbySearch) {
      const currentUser = await PublicUser.findByPk(req.publicUserId, {
        attributes: ["latitude", "longitude"],
      });
      if (currentUser && currentUser.latitude && currentUser.longitude) {
        userLat = parseFloat(currentUser.latitude);
        userLon = parseFloat(currentUser.longitude);
      } else {
        // User doesn't have location set, return error
        return res.status(400).json({
          success: false,
          message: "Please set your location in profile to search nearby users",
        });
      }
    }

    // Guest gating: guests cannot view premium categories or verified users list
    if (!req.publicUserId) {
      where.category = category || { [Op.eq]: "Regular" };
      where.isVerified = false;
      if (county) where.county = { [Op.iLike]: `%${county}%` };
      if (online !== undefined) where.is_online = online === "true";
      if (q) {
        where.username = { [Op.iLike]: `%${q}%` };
      }
    } else {
      // Get current user (for excluding from results)
      const currentUser = await PublicUser.findByPk(req.publicUserId, {
        attributes: ["category"],
      });

      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      // Build base filters (county and online status)
      const baseFilters = {};
      if (county) baseFilters.county = { [Op.iLike]: `%${county}%` };
      if (online !== undefined) baseFilters.is_online = online === "true";

      // Handle search query (username) - add to baseFilters so it works consistently
      if (q) {
        baseFilters.username = { [Op.iLike]: `%${q}%` };
      }

      // Handle category filter
      if (category) {
        // Show all users in the selected category (no verification filter)
        where.category = category;
        // Merge baseFilters (county, online, username) into where
        Object.assign(where, baseFilters);
      } else {
        // No category filter - show ALL registered users regardless of category or verification
        // Apply baseFilters if any exist
        if (Object.keys(baseFilters).length > 0) {
          Object.assign(where, baseFilters);
        }
        // No category restriction - shows all users
      }

      // Handle explicit isVerified filter for registered users (only if user explicitly requests it)
      if (isVerified !== undefined) {
        where.isVerified = isVerified === "true";
      }

      // Exclude current user from browse results
      if (req.publicUserId) {
        where.id = { [Op.ne]: req.publicUserId };
      }
    }

    // For nearby search, only include users with coordinates
    if (isNearbySearch) {
      where.latitude = { [Op.ne]: null };
      where.longitude = { [Op.ne]: null };
    }

    const limit = Math.min(Number(pageSize) || 20, 50);
    const offset = (Number(page) - 1) * limit;

    // For nearby search, we need to fetch all matching users first to calculate distances
    // Then filter by radius and paginate
    let queryOptions = {
      where,
      attributes: {
        exclude: ["password", "otp", "phone"],
        include: [
          [Sequelize.literal(activeBoostUntilSubquery), "active_boost_until"],
        ],
      },
    };

    // If not nearby search, apply ordering and pagination normally
    if (!isNearbySearch) {
      queryOptions.order = [
        ["isVerified", "DESC"],
        [activeBoostPresenceOrderLiteral, "DESC"],
        [activeBoostUntilOrderLiteral, "DESC"],
        ["createdAt", "DESC"],
      ];
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    const { count, rows } = await PublicUser.findAndCountAll(queryOptions);

    // For nearby search, filter by distance and sort
    let processedRows = rows;
    if (isNearbySearch) {
      // Calculate distance for each user and filter by radius
      const usersWithDistance = rows
        .map((user) => {
          const userData = formatUserForPublicResponse(user);
          const lat = parseFloat(userData.latitude);
          const lon = parseFloat(userData.longitude);

          if (!isNaN(lat) && !isNaN(lon)) {
            const distance = calculateDistance(userLat, userLon, lat, lon);
            return { ...userData, distance };
          }
          return null;
        })
        .filter((user) => user !== null && user.distance <= searchRadius)
        .sort((a, b) => a.distance - b.distance); // Sort by distance ascending

      // Apply pagination after filtering
      const startIndex = offset;
      const endIndex = startIndex + limit;
      processedRows = usersWithDistance
        .slice(startIndex, endIndex)
        .map((user) => {
          // Convert back to Sequelize instance format for consistency
          const userModel = rows.find((r) => r.id === user.id);
          if (userModel) {
            const userJson = formatUserForPublicResponse(userModel);
            userJson.distance = user.distance;
            const activeBoostUntil = userModel.get("active_boost_until");
            if (activeBoostUntil) {
              userJson.active_boost_until = activeBoostUntil;
            }
            return userJson;
          }
          return user;
        });

      // Update count to reflect filtered results
      const totalFiltered = usersWithDistance.length;

      // Filter out unapproved photos and bios, and add badge types
      const filteredRows = await Promise.all(
        processedRows.map(async (user) => {
          // Hide photo if not approved
          if (user.photo_moderation_status !== "approved") {
            user.photo = null;
          }
          // Filter photos array to only show approved photos
          if (user.photos) {
            user.photos = filterApprovedPhotos(user.photos);
          }
          // Hide bio if not approved
          if (user.bio_moderation_status !== "approved") {
            user.bio = null;
          }
          // Add badge type
          await addBadgeTypeToUser(user, user);
          return user;
        })
      );

      return res.json({
        success: true,
        data: filteredRows,
        pagination: {
          total: totalFiltered,
          page: Number(page),
          pageSize: limit,
          totalPages: Math.ceil(totalFiltered / limit),
        },
      });
    }

    // Filter out unapproved photos and bios for public listings, and add badge types
    const filteredRows = await Promise.all(
      processedRows.map(async (user) => {
        const userData = formatUserForPublicResponse(user);
        const activeBoostUntil = user.get("active_boost_until");
        if (activeBoostUntil) {
          userData.active_boost_until = activeBoostUntil;
        }
        // Hide photo if not approved
        if (userData.photo_moderation_status !== "approved") {
          userData.photo = null;
        }
        // Filter photos array to only show approved photos
        if (userData.photos) {
          userData.photos = filterApprovedPhotos(userData.photos);
        }
        // Hide bio if not approved
        if (userData.bio_moderation_status !== "approved") {
          userData.bio = null;
        }
        // Add badge type
        await addBadgeTypeToUser(userData, user);
        return userData;
      })
    );

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
        Sequelize.where(activeBoostExistsLiteral, true),
        Sequelize.where(boostHistoryExistsLiteral, true),
        { isVerified: true },
      ],
    };
    // Guest gating: exclude premium categories for guests
    if (!req.publicUserId) {
      where.category = { [Op.eq]: "Regular" };
    } else {
      // Registered users: only show Regular users or verified premium users in featured
      const premiumCategories = [
        "Sugar Mummy",
        "Sponsor",
        "Ben 10",
        "Urban Chics",
      ];
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
      attributes: {
        exclude: ["password", "otp", "phone"],
        include: [
          [Sequelize.literal(activeBoostUntilSubquery), "active_boost_until"],
        ],
      },
      order: [
        [activeBoostPresenceOrderLiteral, "DESC"],
        [activeBoostUntilOrderLiteral, "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 20,
    });

    // Filter out unapproved photos and bios for featured listings
    const filteredRows = rows.map((user) => {
      const userData = formatUserForPublicResponse(user);
      const activeBoostUntil = user.get("active_boost_until");
      if (activeBoostUntil) {
        userData.active_boost_until = activeBoostUntil;
      }
      // Hide photo if not approved
      if (userData.photo_moderation_status !== "approved") {
        userData.photo = null;
      }
      // Filter photos array to only show approved photos
      if (userData.photos) {
        userData.photos = filterApprovedPhotos(userData.photos);
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

// Featured boosted users ordered by most recent boost window
exports.featuredBoosts = async (req, res) => {
  try {
    const now = new Date();
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const boosts = await ProfileBoost.findAll({
      where: {
        status: "active",
        ends_at: { [Op.gt]: now },
        ...(req.publicUserId
          ? { public_user_id: { [Op.ne]: req.publicUserId } }
          : {}),
      },
      include: [
        {
          model: PublicUser,
          as: "owner",
          attributes: {
            exclude: ["password", "otp", "phone"],
          },
        },
      ],
      order: [
        ["ends_at", "DESC"],
        ["updatedAt", "DESC"],
      ],
      limit,
    });

    const filteredRows = boosts
      .map((boost) => {
        if (!boost.owner) return null;
        const userData = formatUserForPublicResponse(boost.owner);
        if (userData.photo_moderation_status !== "approved") {
          userData.photo = null;
        }
        if (userData.photos) {
          userData.photos = filterApprovedPhotos(userData.photos);
        }
        if (userData.bio_moderation_status !== "approved") {
          userData.bio = null;
        }
        userData.active_boost_until = boost.ends_at;
        userData.boost_target_category = boost.target_category;
        userData.boost_target_area = boost.target_area;
        userData.boost_target_lat =
          boost.target_lat !== null && boost.target_lat !== undefined
            ? Number.parseFloat(boost.target_lat)
            : null;
        userData.boost_target_lng =
          boost.target_lng !== null && boost.target_lng !== undefined
            ? Number.parseFloat(boost.target_lng)
            : null;
        userData.boost_target_radius_km =
          boost.target_radius_km !== null &&
          boost.target_radius_km !== undefined
            ? Number.parseFloat(boost.target_radius_km)
            : null;
        userData.boost_id = boost.id;
        return userData;
      })
      .filter(Boolean);

    return res.json({ success: true, data: filteredRows });
  } catch (err) {
    console.error("featuredBoosts error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch boosted featured users",
    });
  }
};

// Admin endpoint to list all public users without restrictions
exports.adminList = async (req, res) => {
  try {
    const {
      county,
      category,
      isVerified,
      online,
      q,
      page = 1,
      pageSize = 10,
    } = req.query;
    const where = {};
    if (county) where.county = county;
    if (category) where.category = category;
    if (isVerified !== undefined) where.isVerified = isVerified === "true";
    if (online !== undefined) where.is_online = online === "true";
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { county: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { phone: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const limit = Math.min(Number(pageSize) || 10, 100);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await PublicUser.findAndCountAll({
      where,
      attributes: {
        exclude: ["password", "otp"],
        include: [
          [Sequelize.literal(activeBoostUntilSubquery), "active_boost_until"],
        ],
      },
      order: [
        ["createdAt", "DESC"],
        ["isVerified", "DESC"],
        [activeBoostPresenceOrderLiteral, "DESC"],
        [activeBoostUntilOrderLiteral, "DESC"],
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

// Admin endpoint to create fake/demo user profiles
// Follows the same flow as registration but allows bypassing some validations
exports.adminCreateFakeUser = async (req, res) => {
  try {
    const {
      name,
      username,
      gender,
      email,
      phone,
      password,
      bio,
      category = "Regular",
      county,
      birth_year,
      age,
      latitude,
      longitude,
      isVerified = false,
      autoApprove = false, // Default to pending like registration
      bypassPhoneValidation = true, // Allow bypassing phone validation
      bypassAgeCheck = true, // Allow bypassing age check
    } = req.body;

    // Basic validation - same as registration
    const normalizedUsername =
      typeof username === "string" ? username.trim() : "";
    if (!name || !normalizedUsername || !email) {
      return res.status(400).json({
        success: false,
        message: "Name, username, and email are required",
      });
    }

    // Phone validation (can be bypassed for fake users)
    let normalizedPhone = phone || `+254700000000`;
    if (phone && !bypassPhoneValidation) {
      const {
        valid: isPhoneValid,
        normalized: validatedPhone,
        message: phoneValidationMessage,
      } = validatePhoneNumber(phone);

      if (!isPhoneValid) {
        return res.status(400).json({
          success: false,
          message: phoneValidationMessage,
        });
      }
      normalizedPhone = validatedPhone;
    }

    // Check if username, email, or phone already exists
    const exists = await PublicUser.findOne({
      where: {
        [Op.or]: [
          { email },
          { phone: normalizedPhone },
          { username: normalizedUsername },
        ],
      },
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Email, phone, or username already in use",
      });
    }

    // Handle birth year - same logic as registration
    let birthYearValue = null;
    if (birth_year) {
      birthYearValue = parseInt(birth_year, 10);
    } else if (age) {
      const numericAge = parseInt(age, 10);
      if (!Number.isNaN(numericAge) && numericAge > 0) {
        const currentYear = new Date().getFullYear();
        birthYearValue = currentYear - numericAge;
      }
    }

    // Age validation (can be bypassed for fake users)
    if (birthYearValue !== null && !bypassAgeCheck) {
      const adultCheck = isAdultFromBirthYear(birthYearValue);
      if (adultCheck === null || adultCheck === false) {
        return res.status(403).json({
          success: false,
          message: `You must be at least ${MIN_PUBLIC_USER_AGE} years old to join TuVibe.`,
        });
      }
    }

    // Validate and normalize category - same as registration
    const ALLOWED_CATEGORIES = [
      "Regular",
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const normalizedCategory =
      typeof category === "string" && ALLOWED_CATEGORIES.includes(category)
        ? category
        : "Regular";

    // Generate password (use provided password or random one)
    const passwordToHash = password || `fake_${Date.now()}_${Math.random()}`;
    const hashedPassword = await bcrypt.hash(passwordToHash, 10);

    const now = new Date();

    // Prepare user data - exactly like registration
    const userData = {
      name,
      username: normalizedUsername,
      gender: gender || null,
      category: normalizedCategory,
      phone: normalizedPhone,
      email,
      password: hashedPassword,
      latitude: latitude || null,
      longitude: longitude || null,
      logged_in_at: now,
      logged_out_at: null,
      is_online: true, // Same as registration
      last_seen_at: null, // Same as registration
      isVerified: isVerified || false,
    };

    // Handle bio - same as registration
    if (bio) {
      userData.bio = bio;
      userData.bio_moderation_status = autoApprove ? "approved" : "pending";
    }

    // Handle file upload if profile_image is provided - same as registration
    if (req.file) {
      // File path relative to uploads folder (e.g., "profiles/filename.jpg")
      const photoPath = `profiles/${req.file.filename}`;
      userData.photo = photoPath;
      userData.photo_moderation_status = autoApprove ? "approved" : "pending";
    }

    // Handle birth year - same as registration
    if (birthYearValue !== null) {
      userData.birth_year = birthYearValue;
      const computedAge = computeAgeFromBirthYear(birthYearValue);
      if (computedAge !== null) {
        userData.age = computedAge;
      }
    }

    // Handle county
    if (county) {
      userData.county = county;
    }

    // Create the fake user
    const user = await PublicUser.create(userData);

    // Format response - same as registration
    const formattedUser = formatUserForResponse(user);
    await addBadgeTypeToUser(formattedUser, user);

    // Return the plaintext password for admin use (only for fake users)
    // This allows admins to login with fake profiles for testing
    return res.status(201).json({
      success: true,
      message: "Fake user profile created successfully",
      data: {
        user: {
          ...formattedUser,
          password: undefined,
          otp: undefined,
        },
        // Include plaintext password for admin to use for login
        plaintextPassword: passwordToHash,
        loginCredentials: {
          email: email,
          password: passwordToHash,
        },
      },
    });
  } catch (err) {
    console.error("admin create fake user error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create fake user profile",
      error: err.message,
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

    // Require active subscription to view profiles (except viewing own profile)
    if (req.publicUserId && req.publicUserId !== user.id) {
      const {
        getActiveSubscriptionForUser,
      } = require("../services/subscriptionService");
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);

      if (!subscription || subscription.status !== "active") {
        return res.status(402).json({
          success: false,
          message:
            "Active subscription required to view profiles. Please subscribe to a plan.",
        });
      }
    }

    // Check if viewed user is premium and has private profile mode enabled
    const PREMIUM_CATEGORIES = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const isViewedUserPremium = PREMIUM_CATEGORIES.includes(user.category);
    let shouldHideDetails = false;

    if (isViewedUserPremium && req.publicUserId) {
      // Check if viewed user has active subscription with private profile mode
      const {
        getActiveSubscriptionForUser,
        getPremiumPlanConfig,
      } = require("../services/subscriptionService");
      const subscription = await getActiveSubscriptionForUser(user.id);
      const plan = subscription ? getPremiumPlanConfig(subscription) : null;

      if (plan && plan.hasPrivateProfileMode) {
        // Check if viewer is premium user
        const viewer = await PublicUser.findByPk(req.publicUserId, {
          attributes: ["category"],
        });
        const isViewerPremium =
          viewer && PREMIUM_CATEGORIES.includes(viewer.category);

        // Hide details from non-premium users
        if (!isViewerPremium) {
          shouldHideDetails = true;
        }
      }
    }

    // Only show photo if approved
    const safeUser = formatUserForPublicResponse(user);
    if (
      safeUser.photo_moderation_status !== "approved" &&
      safeUser.photo_moderation_status !== null
    ) {
      safeUser.photo = null;
    }

    // Filter photos array to only show approved photos
    if (safeUser.photos) {
      safeUser.photos = filterApprovedPhotos(safeUser.photos);
    }

    // Only show bio if approved
    if (
      safeUser.bio_moderation_status !== "approved" &&
      safeUser.bio_moderation_status !== null
    ) {
      safeUser.bio = null;
    }

    // Apply private profile mode: hide some details from non-premium users
    if (shouldHideDetails) {
      // Hide additional photos, bio, age, and other personal details
      safeUser.photos = [];
      safeUser.bio = null;
      safeUser.age = null;
      safeUser.birth_year = null;
      safeUser.county = null;
      // Keep basic info: username, category, isVerified, photo (if approved)
    }

    // Add badge type
    await addBadgeTypeToUser(safeUser, user);

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

    const viewer = await PublicUser.findByPk(viewerId, {
      attributes: ["incognito_expires_at"],
    });
    if (!viewer) {
      return res
        .status(404)
        .json({ success: false, message: "Viewer not found" });
    }

    const incognitoUntil =
      viewer.incognito_expires_at && new Date(viewer.incognito_expires_at);
    if (incognitoUntil && incognitoUntil > now) {
      return res.json({
        success: true,
        data: {
          counted: false,
          incognito: true,
          message:
            "Incognito mode is active; this view is hidden from the viewer list.",
        },
      });
    }

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

// Delete a photo from user's gallery
exports.deletePhoto = async (req, res) => {
  try {
    const { photoIndex } = req.params;
    const photoIndexNum = parseInt(photoIndex);

    if (isNaN(photoIndexNum) || photoIndexNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid photo index",
      });
    }

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Ensure photos is always an array
    let photos = [];
    if (user.photos) {
      if (Array.isArray(user.photos)) {
        photos = [...user.photos]; // Create a copy to avoid mutating
      } else if (typeof user.photos === "string") {
        try {
          photos = JSON.parse(user.photos);
          if (!Array.isArray(photos)) {
            photos = [];
          }
        } catch (e) {
          photos = [];
        }
      }
    }

    // Check if photo index is valid
    if (photoIndexNum >= photos.length) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    // Remove the photo from the array
    const deletedPhoto = photos[photoIndexNum];
    photos.splice(photoIndexNum, 1);

    // Update user's photos array - ensure it's saved as JSONB array
    try {
      await user.update({ photos: photos }, { returning: true });

      // Reload user to verify the update
      await user.reload();

      // Verify the update worked
      const updatedPhotos = user.photos;
      if (
        Array.isArray(updatedPhotos) &&
        updatedPhotos.length !== photos.length
      ) {
        console.error("WARNING: Photo count mismatch after update!");
        console.error(
          "Expected count:",
          photos.length,
          "Actual count:",
          updatedPhotos.length
        );
      }
    } catch (updateError) {
      console.error("Error updating user photos:", updateError);
      throw updateError;
    }

    // Return updated user data so frontend doesn't need to fetch again
    const updatedUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });

    return res.json({
      success: true,
      message: "Photo deleted successfully",
      data: {
        deletedPhoto,
        remainingPhotos: photos.length,
        user: updatedUser, // Include updated user data
      },
    });
  } catch (err) {
    console.error("deletePhoto error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete photo",
    });
  }
};

// Add photos to user's gallery
exports.addPhotos = async (req, res) => {
  try {
    if (
      !req.files ||
      !req.files.profile_images ||
      !Array.isArray(req.files.profile_images) ||
      req.files.profile_images.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No photos provided",
      });
    }

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Ensure existingPhotos is always an array
    let existingPhotos = [];
    if (user.photos) {
      // Handle JSONB data - it might come as array or need parsing
      if (Array.isArray(user.photos)) {
        existingPhotos = user.photos;
      } else if (typeof user.photos === "string") {
        // If it's a string, try to parse it
        try {
          existingPhotos = JSON.parse(user.photos);
          if (!Array.isArray(existingPhotos)) {
            existingPhotos = [];
          }
        } catch (e) {
          existingPhotos = [];
        }
      } else {
        existingPhotos = [];
      }
    }

    // Create new photo objects with pending moderation status
    const newPhotos = req.files.profile_images.map((file) => ({
      path: `profiles/${file.filename}`,
      moderation_status: "pending",
      uploaded_at: new Date().toISOString(),
    }));

    // Add new photos to existing photos array
    const updatedPhotos = [...existingPhotos, ...newPhotos];

    // Clean and validate photos array - ensure all are plain objects
    const cleanedPhotos = updatedPhotos
      .filter((photo) => {
        // Keep only valid photo objects with a path
        return (
          photo &&
          typeof photo === "object" &&
          photo.path &&
          typeof photo.path === "string" &&
          photo.path.trim() !== ""
        );
      })
      .map((photo) => {
        // Create a clean plain object for JSONB storage
        const cleanedPhoto = {
          path: String(photo.path).trim(),
          moderation_status: photo.moderation_status || "pending",
        };

        // Handle uploaded_at - ensure it's always an ISO string
        if (photo.uploaded_at) {
          try {
            const date = new Date(photo.uploaded_at);
            if (!isNaN(date.getTime())) {
              cleanedPhoto.uploaded_at = date.toISOString();
            } else {
              cleanedPhoto.uploaded_at = new Date().toISOString();
            }
          } catch (e) {
            cleanedPhoto.uploaded_at = new Date().toISOString();
          }
        } else {
          cleanedPhoto.uploaded_at = new Date().toISOString();
        }

        return cleanedPhoto;
      });

    // Update user's photos array
    await user.update({ photos: cleanedPhotos }, { returning: true });

    // Return updated user data
    const updatedUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });

    return res.json({
      success: true,
      message: "Photos added successfully",
      data: {
        addedPhotos: newPhotos.length,
        totalPhotos: cleanedPhotos.length,
        user: formatUserForResponse(updatedUser),
      },
    });
  } catch (err) {
    console.error("addPhotos error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add photos",
    });
  }
};

// Delete user account
exports.deleteAccount = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { password } = req.body;
    const userId = req.publicUserId;

    // Find user
    const user = await PublicUser.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Optional password confirmation for security
    if (password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        await transaction.rollback();
        return res.status(401).json({
          success: false,
          message:
            "Invalid password. Please provide the correct password to delete your account.",
        });
      }
    }

    // Delete related data in proper order (respecting foreign key constraints)
    // Delete user's favourites (where user is the one favouriting)
    await Favourite.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete favourites where user is the target (where user is being favourited)
    await Favourite.destroy({
      where: { favourite_user_id: userId },
      transaction,
    });

    // Delete user's looking for posts
    await LookingForPost.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete user's notifications
    await Notification.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete profile views where user is the viewer
    await ProfileView.destroy({
      where: { viewer_id: userId },
      transaction,
    });

    // Delete profile views where user is the viewed
    await ProfileView.destroy({
      where: { viewed_id: userId },
      transaction,
    });

    // Delete reports where user is the reporter
    await Report.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete reports where user is the reported
    await Report.destroy({
      where: { reported_user_id: userId },
      transaction,
    });

    // Delete profile tags where user is the tagger
    await ProfileTag.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete profile tags where user is the tagged
    await ProfileTag.destroy({
      where: { tagged_user_id: userId },
      transaction,
    });

    // Delete profile boosts
    await ProfileBoost.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete chat unlocks
    await ChatUnlock.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete premium verifications
    await PremiumVerification.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete token transactions
    await TokenTransaction.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete payments
    await Payment.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Delete account suspensions
    await AccountSuspension.destroy({
      where: { public_user_id: userId },
      transaction,
    });

    // Finally, delete the user account
    await user.destroy({ transaction });

    // Commit transaction
    await transaction.commit();

    // Send logout event via SSE if available
    try {
      sendEventToUser(userId, {
        type: "account_deleted",
        message: "Your account has been deleted successfully",
      });
    } catch (sseError) {
      // Ignore SSE errors - account is already deleted
    }

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    await transaction.rollback();
    console.error("deleteAccount error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete account. Please try again later.",
    });
  }
};

exports.targetedBoostMatches = async (req, res) => {
  try {
    const viewer = await PublicUser.findByPk(req.publicUserId);

    if (!viewer) {
      return res.status(404).json({
        success: false,
        message: "Viewer not found",
      });
    }

    if (!viewer.category) {
      return res.status(400).json({
        success: false,
        message: "Viewer category is required to match boosts",
      });
    }

    const queryCategory = req.query.category || viewer.category;

    const requestedLat =
      parseCoordinate(req.query.lat) ??
      parseCoordinate(req.query.latitude) ??
      parseCoordinate(req.body?.lat) ??
      parseCoordinate(req.body?.latitude) ??
      parseCoordinate(viewer.latitude);
    const requestedLng =
      parseCoordinate(req.query.lng) ??
      parseCoordinate(req.query.longitude) ??
      parseCoordinate(req.body?.lng) ??
      parseCoordinate(req.body?.longitude) ??
      parseCoordinate(viewer.longitude);

    if (
      requestedLat === null ||
      requestedLng === null ||
      requestedLat < -90 ||
      requestedLat > 90 ||
      requestedLng < -180 ||
      requestedLng > 180
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Viewer location is required. Provide valid latitude and longitude to see boosts targeting your current area.",
      });
    }

    const now = new Date();

    const boosts = await ProfileBoost.findAll({
      where: {
        status: "active",
        ends_at: { [Op.gt]: now },
        target_category: queryCategory,
        target_lat: { [Op.ne]: null },
        target_lng: { [Op.ne]: null },
        target_radius_km: { [Op.gt]: 0 },
        public_user_id: { [Op.ne]: viewer.id },
      },
      include: [
        {
          model: PublicUser,
          as: "owner",
          attributes: { exclude: ["password", "otp", "phone"] },
        },
      ],
      order: [["ends_at", "ASC"]],
      limit: Math.min(Number(req.query.limit) || 20, 50),
    });

    const matches = boosts
      .map((boost) => {
        if (!boost.owner) return null;
        const owner = formatUserForPublicResponse(boost.owner);
        if (owner.photo_moderation_status !== "approved") {
          owner.photo = null;
        }
        if (owner.photos) {
          owner.photos = filterApprovedPhotos(owner.photos);
        }
        if (owner.bio_moderation_status !== "approved") {
          owner.bio = null;
        }
        if (
          boost.target_lat === null ||
          boost.target_lng === null ||
          boost.target_radius_km === null
        ) {
          return null;
        }
        const targetLat = parseFloat(boost.target_lat);
        const targetLng = parseFloat(boost.target_lng);
        const targetRadius =
          Number.parseFloat(boost.target_radius_km) > 0
            ? Number.parseFloat(boost.target_radius_km)
            : null;
        if (
          !Number.isFinite(targetLat) ||
          !Number.isFinite(targetLng) ||
          !Number.isFinite(targetRadius)
        ) {
          return null;
        }

        const distanceKm = calculateDistance(
          requestedLat,
          requestedLng,
          targetLat,
          targetLng
        );

        if (distanceKm > targetRadius) {
          return null;
        }

        return {
          id: boost.id,
          starts_at: boost.starts_at,
          ends_at: boost.ends_at,
          target_category: boost.target_category,
          target_area: boost.target_area,
          target_radius_km: targetRadius,
          distance_km: Number(distanceKm.toFixed(2)),
          owner,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.distance_km === b.distance_km) {
          return new Date(a.ends_at) - new Date(b.ends_at);
        }
        return a.distance_km - b.distance_km;
      });

    return res.json({
      success: true,
      data: {
        count: matches.length,
        category: queryCategory,
        latitude: requestedLat,
        longitude: requestedLng,
        matches,
      },
    });
  } catch (err) {
    console.error("targetedBoostMatches error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch targeted boosts" });
  }
};
