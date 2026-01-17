const { randomUUID } = require("crypto");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));
require("dotenv").config();
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");
const config = require("../config/config");

const { Subscription, PublicUser } = require("../models");
const { validatePhoneNumber } = require("../utils/phone");
const {
  extractBirthYearFromPayload,
  birthYearProvided,
  isAdultFromBirthYear,
  MIN_PUBLIC_USER_AGE,
  formatUserForResponse,
} = require("../utils/userProfile");

const signPublicJwt = (userId) => {
  return jwt.sign({ id: userId, type: "public" }, config.jwtSecret, {
    expiresIn: "7d",
  });
};

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || "KES";
const PAYSTACK_MINOR_UNIT_FACTOR = Number(
  process.env.PAYSTACK_MINOR_UNIT_FACTOR || "100"
);
const PAYSTACK_BYPASS =
  process.env.PAYSTACK_BYPASS === "true" || process.env.PAYSTACK_BYPASS === "1";

if (
  !Number.isFinite(PAYSTACK_MINOR_UNIT_FACTOR) ||
  PAYSTACK_MINOR_UNIT_FACTOR <= 0
) {
  throw new Error("PAYSTACK_MINOR_UNIT_FACTOR must be a positive number");
}

const {
  useIncognitoMinutesForRegular,
  useIncognitoMinutesForPremium,
  useBoostHoursForRegular,
  useBoostHoursForPremium,
  REGULAR_PLANS,
  PREMIUM_PLANS,
  getActiveSubscriptionForUser,
} = require("../services/subscriptionService");
const {
  syncGoldVerificationBadge,
} = require("../services/goldVerificationService");
const {
  syncPremiumBadge,
  PREMIUM_CATEGORIES,
} = require("../services/premiumBadgeService");
const { ProfileBoost } = require("../models");
const { normalizeCountyName } = require("../config/kenyaCounties");
const { sendEventToUser } = require("../routes/sseRoutes");

const ALLOWED_BOOST_CATEGORIES = [
  "Regular",
  "Sugar Mummy",
  "Sponsor",
  "Ben 10",
  "Urban Chics",
];

// Helper functions for boost
const parseCoordinate = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeRadius = (value, { min = 1, max = 200, fallback = 10 } = {}) => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.max(numeric, min), max);
};

const buildAuthHeader = () => {
  if (!PAYSTACK_SECRET_KEY) {
    console.error("Paystack secret key missing");
  }
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
};

const toPaystackAmountFromMajor = (amount) => {
  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return Math.round(amountNumber * PAYSTACK_MINOR_UNIT_FACTOR);
};

const fromPaystackAmountToMajor = (paystackAmount) => {
  const amountNumber = Number(paystackAmount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    throw new Error("Invalid Paystack amount");
  }
  return amountNumber / PAYSTACK_MINOR_UNIT_FACTOR;
};

const normalizePlan = (plan) => {
  if (!plan || typeof plan !== "string") return null;
  const normalized = plan.trim().toLowerCase();
  if (normalized === "silver") return "Silver";
  if (normalized === "gold") return "Gold";
  return null;
};

// Helper function to get plan pricing based on user category
const getPlanPrice = (userCategory, plan) => {
  if (userCategory === "Regular") {
    return plan === "Silver" ? 149 : 249;
  } else if (PREMIUM_CATEGORIES.includes(userCategory)) {
    return plan === "Silver" ? 199 : 349;
  }
  // Default to Regular pricing
  return plan === "Silver" ? 149 : 249;
};

// Helper function to calculate prorated amount
const calculateProratedAmount = (currentPlanPrice, newPlanPrice, expiresAt) => {
  const now = new Date();
  const expirationDate = new Date(expiresAt);

  // Calculate remaining days
  const timeDiff = expirationDate.getTime() - now.getTime();
  const remainingDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

  if (remainingDays <= 0) {
    return 0; // Subscription already expired
  }

  // Calculate daily rates
  const daysInMonth = 30; // Standard subscription period
  const currentDailyRate = currentPlanPrice / daysInMonth;
  const newDailyRate = newPlanPrice / daysInMonth;

  // Calculate prorated difference
  const dailyDifference = newDailyRate - currentDailyRate;
  const proratedAmount = dailyDifference * remainingDays;

  return Math.max(0, Math.round(proratedAmount * 100) / 100); // Round to 2 decimal places, ensure non-negative
};

// Initialize subscription with registration data (payment before account creation)
exports.initializeSubscriptionWithRegistration = async (req, res) => {
  try {
    const {
      amount,
      plan,
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
      birth_year,
      age,
    } = req.body;

    // Validate subscription plan
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    // Validate registration data
    const normalizedUsername =
      typeof username === "string" ? username.trim() : "";
    
    // Check if this is a Google registration
    const isGoogleRegistration = req.body.google_id && req.body.auth_provider === "google";
    
    // For Google users, password is optional (null)
    if (!name || !normalizedUsername || !phone || !email || (!isGoogleRegistration && !password)) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required registration fields" });
    }

    // For Google users, photo is optional (they have Google picture)
    // For regular registration, photo is required
    if (!isGoogleRegistration && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Profile image is required to register.",
      });
    }

    // Validate phone number
    const {
      valid: isPhoneValid,
      normalized: normalizedPhone,
      message: phoneValidationMessage,
    } = validatePhoneNumber(phone);

    if (!isPhoneValid) {
      return res.status(400).json({
        success: false,
        message: phoneValidationMessage,
      });
    }

    // Check if user already exists
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

    // Validate birth year/age
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
        return res.status(403).json({
          success: false,
          message: `You must be at least ${MIN_PUBLIC_USER_AGE} years old to join TuVibe.`,
        });
      }
    }

    // Validate and normalize category
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

    // Store photo path (for Google users, use Google picture URL if provided)
    let photoPath = null;
    if (req.file) {
      photoPath = `profiles/${req.file.filename}`;
    } else if (isGoogleRegistration && req.body.google_picture_url) {
      // Store Google picture URL for later download/storage
      photoPath = req.body.google_picture_url;
    }

    // Prepare registration data for metadata
    const registrationData = {
      name,
      username: normalizedUsername,
      gender,
      category: normalizedCategory,
      phone: normalizedPhone,
      email,
      password: isGoogleRegistration ? null : (await bcrypt.hash(password, 10)), // No password for Google users
      latitude,
      longitude,
      bio,
      photo: photoPath,
      birth_year: birthYear,
    };

    // Add Google-specific fields if this is a Google registration
    if (isGoogleRegistration) {
      registrationData.google_id = req.body.google_id;
      registrationData.auth_provider = "google";
      registrationData.google_picture_url = req.body.google_picture_url;
    }

    let paystackAmount;
    try {
      paystackAmount = toPaystackAmountFromMajor(amount);
    } catch (conversionErr) {
      console.error("initializeSubscriptionWithRegistration amount error:", conversionErr);
      return res.status(400).json({
        success: false,
        message: conversionErr.message,
      });
    }

    if (PAYSTACK_BYPASS) {
      // In bypass mode, create account and subscription immediately
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const userData = {
        name,
        username: normalizedUsername,
        gender,
        category: normalizedCategory,
        phone: normalizedPhone,
        email,
        password: registrationData.password,
        latitude,
        longitude,
        logged_in_at: now,
        logged_out_at: null,
        is_online: true,
        last_seen_at: null,
      };

      if (bio) {
        userData.bio = bio;
        userData.bio_moderation_status = "pending";
      }

      if (photoPath) {
        userData.photo = photoPath;
        userData.photo_moderation_status = "pending";
      }

      if (birthYear !== null) {
        userData.birth_year = birthYear;
        const { computeAgeFromBirthYear } = require("../utils/userProfile");
        const computedAge = computeAgeFromBirthYear(birthYear);
        if (computedAge !== null) {
          userData.age = computedAge;
        }
      }

      const user = await PublicUser.create(userData);
      const reference = `sub-dev-${randomUUID()}`;

      const subscription = await Subscription.create({
        public_user_id: user.id,
        plan: normalizedPlan,
        amount,
        currency: PAYSTACK_CURRENCY,
        reference,
        status: "active",
        starts_at: now,
        expires_at: expiresAt,
      });

      // Sync badges
      if (user.category === "Regular") {
        if (normalizedPlan === "Gold") {
          await syncGoldVerificationBadge(user);
        }
      } else if (PREMIUM_CATEGORIES.includes(user.category)) {
        await syncPremiumBadge(user);
      }

      const token = signPublicJwt(user.id);
      const formattedUser = formatUserForResponse(user);

      return res.status(200).json({
        success: true,
        bypassed: true,
        authorization_url: null,
        reference,
        currency: PAYSTACK_CURRENCY,
        subscription,
        token,
        user: {
          ...formattedUser,
          password: undefined,
        },
      });
    }

    // Initialize Paystack payment with registration data in metadata
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: buildAuthHeader(),
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: PAYSTACK_CURRENCY,
          metadata: {
            type: "subscription_with_registration",
            plan: normalizedPlan,
            registrationData: JSON.stringify(registrationData),
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      console.error("initializeSubscriptionWithRegistration response error:", data);
      return res.status(400).json({
        success: false,
        message: data?.message || "Paystack error",
      });
    }

    const reference = data.data.reference;
    const paystackResponseAmount = data.data.amount || paystackAmount;
    const currency = data.data.currency || PAYSTACK_CURRENCY;

    if (!reference) {
      console.error("initializeSubscriptionWithRegistration missing reference:", data.data);
      return res.status(400).json({
        success: false,
        message: "Payment reference not received from Paystack",
      });
    }

    return res.status(200).json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference,
      paystack_amount: Number(paystackResponseAmount),
      currency,
      access_code: data.data.access_code,
    });
  } catch (err) {
    console.error("initializeSubscriptionWithRegistration error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription initialization with registration failed",
    });
  }
};

exports.initializeSubscription = async (req, res) => {
  try {
    const { amount, plan } = req.body;

    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    let paystackAmount;
    try {
      paystackAmount = toPaystackAmountFromMajor(amount);
    } catch (conversionErr) {
      console.error("initializeSubscription amount error:", conversionErr);
      return res.status(400).json({
        success: false,
        message: conversionErr.message,
      });
    }

    if (PAYSTACK_BYPASS) {
      const reference = `sub-dev-${randomUUID()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subscription = await Subscription.create({
        public_user_id: req.publicUserId,
        plan: normalizedPlan,
        amount,
        currency: PAYSTACK_CURRENCY,
        reference,
        status: "active",
        starts_at: now,
        expires_at: expiresAt,
      });

      // Sync badges based on user category and plan
      const user = await PublicUser.findByPk(req.publicUserId);
      if (user) {
        if (user.category === "Regular") {
          // Regular users: sync gold verification badge for Gold plan
          if (normalizedPlan === "Gold") {
            await syncGoldVerificationBadge(user);
          }
        } else if (PREMIUM_CATEGORIES.includes(user.category)) {
          // Premium users: sync premium badge (Silver or Gold)
          await syncPremiumBadge(user);
        }
      }

      // Send SSE event for subscription creation
      try {
        await subscription.reload();
        sendEventToUser(req.publicUserId, "subscription:created", {
          subscription: subscription.toJSON(),
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending subscription:created event:",
          sseError
        );
      }

      return res.status(200).json({
        success: true,
        bypassed: true,
        authorization_url: null,
        reference,
        currency: PAYSTACK_CURRENCY,
        subscription,
      });
    }

    const email =
      req.body.email || req.user?.email || req.publicUserEmail || undefined;

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: buildAuthHeader(),
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: PAYSTACK_CURRENCY,
          metadata: {
            userId: req.publicUserId,
            type: "subscription",
            plan: normalizedPlan,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      console.error("initializeSubscription response error:", data);
      return res.status(400).json({
        success: false,
        message: data?.message || "Paystack error",
      });
    }

    // Validate required fields from Paystack response
    if (!data.data) {
      console.error("initializeSubscription missing data object:", data);
      return res.status(400).json({
        success: false,
        message: "Invalid response from Paystack",
      });
    }

    const reference = data.data.reference;
    // Use amount from response if available, otherwise use the amount we sent
    const paystackResponseAmount = data.data.amount || paystackAmount;
    const currency = data.data.currency || PAYSTACK_CURRENCY;

    if (!reference) {
      console.error("initializeSubscription missing reference:", data.data);
      return res.status(400).json({
        success: false,
        message: "Payment reference not received from Paystack",
      });
    }

    // Validate amount - use the one we sent if response doesn't have it
    if (!Number.isFinite(Number(paystackResponseAmount))) {
      console.error("initializeSubscription invalid amount:", data.data);
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount received from Paystack",
      });
    }

    await Subscription.create({
      public_user_id: req.publicUserId,
      plan: normalizedPlan,
      amount,
      currency: PAYSTACK_CURRENCY,
      reference,
      status: "pending",
      starts_at: null,
      expires_at: null,
    });

    return res.status(200).json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference,
      paystack_amount: Number(paystackResponseAmount),
      currency,
      access_code: data.data.access_code,
    });
  } catch (err) {
    console.error("initializeSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription initialization failed",
    });
  }
};

exports.verifySubscription = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Reference required" });
    }

    if (PAYSTACK_BYPASS) {
      const subscription = await Subscription.findOne({ where: { reference } });
      if (!subscription) {
        return res.status(404).json({
          success: false,
          bypassed: true,
          message: "No subscription found for reference in bypass mode",
        });
      }
      return res.status(200).json({
        success: true,
        bypassed: true,
        message: "Paystack bypass active; verification skipped",
        data: subscription,
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status || data.data?.status !== "success") {
      console.error("verifySubscription unsuccessful response:", data);
      return res
        .status(400)
        .json({ success: false, message: "Payment not successful" });
    }

    const paystackAmount = data.data.amount;
    let majorAmount;
    try {
      majorAmount = fromPaystackAmountToMajor(paystackAmount);
    } catch (conversionErr) {
      console.error(
        "verifySubscription conversion error:",
        conversionErr,
        data.data
      );
      return res.status(500).json({
        success: false,
        message: "Failed to convert payment amount",
      });
    }

    const metadata = data.data.metadata || {};
    let userId = req.publicUserId || metadata.userId;

    // Check if this is a subscription with registration
    let registrationData = null;
    if (metadata.type === "subscription_with_registration" && metadata.registrationData) {
      try {
        registrationData = JSON.parse(metadata.registrationData);
      } catch (parseErr) {
        console.error("Failed to parse registration data from metadata:", parseErr);
      }
    }

    // If registration data exists, create account first
    if (registrationData && !userId) {
      try {
        const now = new Date();
        const userData = {
          name: registrationData.name,
          username: registrationData.username,
          gender: registrationData.gender,
          category: registrationData.category,
          phone: registrationData.phone,
          email: registrationData.email,
          password: registrationData.password, // Already hashed
          latitude: registrationData.latitude,
          longitude: registrationData.longitude,
          logged_in_at: now,
          logged_out_at: null,
          is_online: true,
          last_seen_at: null,
        };

        if (registrationData.bio) {
          userData.bio = registrationData.bio;
          userData.bio_moderation_status = "pending";
        }

        // Handle photo - could be file path or Google picture URL
        if (registrationData.photo) {
          // Check if it's a Google picture URL (starts with http)
          if (registrationData.photo.startsWith("http")) {
            // Store Google picture URL directly (you may want to download and store it later)
            userData.photo = registrationData.photo;
          } else {
            // It's a file path
            userData.photo = registrationData.photo;
          }
          userData.photo_moderation_status = "pending";
        }

        // Add Google-specific fields if present
        if (registrationData.google_id) {
          userData.google_id = registrationData.google_id;
        }
        if (registrationData.auth_provider) {
          userData.auth_provider = registrationData.auth_provider;
        }

        if (registrationData.birth_year !== null && registrationData.birth_year !== undefined) {
          userData.birth_year = registrationData.birth_year;
          const { computeAgeFromBirthYear } = require("../utils/userProfile");
          const computedAge = computeAgeFromBirthYear(registrationData.birth_year);
          if (computedAge !== null) {
            userData.age = computedAge;
          }
        }

        const user = await PublicUser.create(userData);
        const newUserId = user.id;

        // Update metadata to include userId
        metadata.userId = newUserId;

        // Sync badges based on user category and plan
        const normalizedPlan = normalizePlan(metadata.plan);
        if (normalizedPlan) {
          if (user.category === "Regular") {
            if (normalizedPlan === "Gold") {
              await syncGoldVerificationBadge(user);
            }
          } else if (PREMIUM_CATEGORIES.includes(user.category)) {
            await syncPremiumBadge(user);
          }
        }

        // Set userId for subscription creation
        userId = newUserId;
      } catch (createErr) {
        console.error("Failed to create user during subscription verification:", createErr);
        return res.status(500).json({
          success: false,
          message: "Failed to create account after payment verification",
        });
      }
    }

    if (!userId) {
      console.error(
        "verifySubscription missing userId for reference",
        reference,
        metadata
      );
      return res.status(400).json({
        success: false,
        message: "Unable to determine user for this subscription",
      });
    }

    let subscription = await Subscription.findOne({ where: { reference } });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (!subscription) {
      const normalizedPlan = normalizePlan(metadata.plan);
      if (!normalizedPlan) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription plan in metadata",
        });
      }

      subscription = await Subscription.create({
        public_user_id: userId,
        plan: normalizedPlan,
        amount: majorAmount,
        currency: data.data.currency || PAYSTACK_CURRENCY,
        reference,
        status: "active",
        starts_at: now,
        expires_at: expiresAt,
      });

      // Sync badges based on user category and plan
      const user = await PublicUser.findByPk(userId);
      if (user) {
        if (user.category === "Regular") {
          // Regular users: sync gold verification badge for Gold plan
          if (normalizedPlan === "Gold") {
            await syncGoldVerificationBadge(user);
          }
        } else if (PREMIUM_CATEGORIES.includes(user.category)) {
          // Premium users: sync premium badge (Silver or Gold)
          await syncPremiumBadge(user);
        }
      }

      // Send SSE event for subscription creation
      try {
        await subscription.reload();
        sendEventToUser(userId, "subscription:created", {
          subscription: subscription.toJSON(),
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending subscription:created event:",
          sseError
        );
      }
    } else if (subscription.status !== "active") {
      await subscription.update({
        status: "active",
        amount: majorAmount,
        currency: data.data.currency || PAYSTACK_CURRENCY,
        starts_at: now,
        expires_at: expiresAt,
      });

      // Sync badges based on user category and plan
      const user = await PublicUser.findByPk(userId);
      if (user) {
        if (user.category === "Regular") {
          // Regular users: sync gold verification badge for Gold plan
          if (subscription.plan === "Gold") {
            await syncGoldVerificationBadge(user);
          }
        } else if (PREMIUM_CATEGORIES.includes(user.category)) {
          // Premium users: sync premium badge (Silver or Gold)
          await syncPremiumBadge(user);
        }
      }

      // Send SSE event for subscription update
      try {
        await subscription.reload();
        sendEventToUser(userId, "subscription:updated", {
          subscription: subscription.toJSON(),
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending subscription:updated event:",
          sseError
        );
      }
    }

    // If this was a registration flow, return token and user data
    if (registrationData && metadata.userId) {
      const user = await PublicUser.findByPk(metadata.userId);
      if (user) {
        const token = signPublicJwt(user.id);
        const formattedUser = formatUserForResponse(user);

        return res.status(200).json({
          success: true,
          message: "Registration and subscription payment successful",
          data: {
            subscription,
            token,
            user: {
              ...formattedUser,
              password: undefined,
            },
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Subscription payment successful",
      data: subscription,
    });
  } catch (err) {
    console.error("verifySubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription verification failed",
    });
  }
};

// Admin endpoint to create fake subscriptions for fake users
exports.adminCreateFakeSubscription = async (req, res) => {
  try {
    const { public_user_id, plan, duration_days = 30 } = req.body;

    // Validate required fields
    if (!public_user_id || !plan) {
      return res.status(400).json({
        success: false,
        message: "public_user_id and plan are required",
      });
    }

    // Normalize plan
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    // Check if user exists
    const user = await PublicUser.findByPk(public_user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Public user not found",
      });
    }

    // Calculate amount based on user category and plan
    let amount;
    if (user.category === "Regular") {
      amount = normalizedPlan === "Silver" ? 149 : 249;
    } else if (PREMIUM_CATEGORIES.includes(user.category)) {
      amount = normalizedPlan === "Silver" ? 199 : 349;
    } else {
      // Default to Regular pricing
      amount = normalizedPlan === "Silver" ? 149 : 249;
    }

    // Check if user already has an active subscription
    const now = new Date();
    const existingActive = await Subscription.findOne({
      where: {
        public_user_id,
        status: "active",
        starts_at: { [Op.lte]: now },
        expires_at: { [Op.gt]: now },
      },
    });

    if (existingActive) {
      return res.status(409).json({
        success: false,
        message: "User already has an active subscription",
        existingSubscription: existingActive,
      });
    }

    // Calculate expiration date
    const duration = parseInt(duration_days, 10) || 30;
    const expiresAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    // Generate reference
    const reference = `fake-sub-${randomUUID()}`;

    // Create subscription
    const subscription = await Subscription.create({
      public_user_id,
      plan: normalizedPlan,
      amount,
      currency: PAYSTACK_CURRENCY,
      reference,
      status: "active",
      starts_at: now,
      expires_at: expiresAt,
    });

    // Sync badges based on user category and plan
    if (user.category === "Regular") {
      // Regular users: sync gold verification badge for Gold plan
      if (normalizedPlan === "Gold") {
        await syncGoldVerificationBadge(user);
      }
    } else if (PREMIUM_CATEGORIES.includes(user.category)) {
      // Premium users: sync premium badge (Silver or Gold)
      await syncPremiumBadge(user);
    }

    return res.status(201).json({
      success: true,
      message: "Fake subscription created successfully",
      data: {
        subscription,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          category: user.category,
        },
      },
    });
  } catch (err) {
    console.error("admin create fake subscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create fake subscription",
      error: err.message,
    });
  }
};

exports.startIncognitoSession = async (req, res) => {
  try {
    const minutesParam =
      req.body?.minutes ??
      req.body?.durationMinutes ??
      req.body?.requestedMinutes ??
      null;
    const requestedMinutes =
      Number.isFinite(Number(minutesParam)) && Number(minutesParam) > 0
        ? Number(minutesParam)
        : null;

    // Check if user is premium category
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["category"],
    });

    let usage;
    if (user && PREMIUM_CATEGORIES.includes(user.category)) {
      // Premium category users
      usage = await useIncognitoMinutesForPremium(
        req.publicUserId,
        requestedMinutes
      );
    } else {
      // Regular users
      usage = await useIncognitoMinutesForRegular(
        req.publicUserId,
        requestedMinutes
      );
    }

    if (!usage.subscription) {
      return res.status(402).json({
        success: false,
        message: "Active subscription required for incognito mode",
      });
    }

    if (!usage.allowed || !usage.consumedMinutes) {
      return res.status(429).json({
        success: false,
        message:
          "Daily incognito allowance exhausted. Try again after 24 hours.",
      });
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + usage.consumedMinutes * 60 * 1000
    );

    await PublicUser.update(
      { incognito_expires_at: expiresAt },
      { where: { id: req.publicUserId } }
    );

    return res.json({
      success: true,
      data: {
        expires_at: expiresAt,
        consumed_minutes: usage.consumedMinutes,
        remaining_minutes: usage.remaining,
        limit_minutes: usage.limit,
      },
    });
  } catch (err) {
    console.error("startIncognitoSession error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to activate incognito mode",
    });
  }
};

exports.getIncognitoStatus = async (req, res) => {
  try {
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["incognito_expires_at"],
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const now = new Date();
    const expiresAt =
      user.incognito_expires_at && new Date(user.incognito_expires_at);
    const active = expiresAt && expiresAt > now;
    const remainingMinutes = active
      ? Math.max(Math.round((expiresAt - now) / 60000), 0)
      : 0;

    return res.json({
      success: true,
      data: {
        active: Boolean(active),
        expires_at: expiresAt,
        remaining_minutes: remainingMinutes,
      },
    });
  } catch (err) {
    console.error("getIncognitoStatus error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch incognito status",
    });
  }
};

// Get current subscription status for user
exports.getMySubscription = async (req, res) => {
  try {
    const userId = req.publicUserId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subscription = await getActiveSubscriptionForUser(userId);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        data: {
          hasSubscription: false,
          subscription: null,
          pendingDowngrade: null,
        },
      });
    }

    // Calculate remaining days
    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    const timeDiff = expiresAt.getTime() - now.getTime();
    const remainingDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    // Check for pending downgrade (scheduled subscription)
    const pendingDowngrade = await Subscription.findOne({
      where: {
        public_user_id: userId,
        status: "pending",
        starts_at: {
          [Op.gte]: expiresAt, // Starts when current subscription expires
        },
      },
      order: [["starts_at", "ASC"]],
    });

    // Get user to determine category
    const user = await PublicUser.findByPk(userId, {
      attributes: ["category"],
    });

    // Get boost hours information based on plan
    let boostHoursInfo = null;
    if (user) {
      const isPremium = PREMIUM_CATEGORIES.includes(user.category);
      const planConfig = isPremium
        ? PREMIUM_PLANS[subscription.plan]
        : REGULAR_PLANS[subscription.plan];

      if (planConfig) {
        // Get today's usage to show remaining hours
        const { SubscriptionUsage } = require("../models");
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayUsage = await SubscriptionUsage.findOne({
          where: {
            public_user_id: userId,
            usage_date: todayStr,
          },
        });

        const usedHours = todayUsage
          ? Number(todayUsage.boost_hours_used || 0)
          : 0;
        const totalHours = Number.isFinite(planConfig.boostHoursPerDay)
          ? planConfig.boostHoursPerDay
          : 0;
        const remainingHours = Math.max(0, totalHours - usedHours);
        const defaultDuration = planConfig.boostDurationHours || 1;

        boostHoursInfo = {
          totalHoursPerDay: totalHours,
          usedHours: usedHours,
          remainingHours: remainingHours,
          defaultDurationPerBoost: defaultDuration,
          maxDurationPerBoost: defaultDuration, // Same as default for now
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          amount: parseFloat(subscription.amount),
          status: subscription.status,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          remainingDays: Math.max(0, remainingDays),
          auto_renew_enabled: subscription.auto_renew_enabled || false,
          isCancelled: subscription.status === "cancelled",
        },
        pendingDowngrade: pendingDowngrade
          ? {
              plan: pendingDowngrade.plan,
              starts_at: pendingDowngrade.starts_at,
              expires_at: pendingDowngrade.expires_at,
            }
          : null,
        boostHours: boostHoursInfo,
      },
    });
  } catch (err) {
    console.error("getMySubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subscription status",
      error: err.message,
    });
  }
};

// Upgrade subscription - pay prorated difference, activate immediately
exports.upgradeSubscription = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.publicUserId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate plan
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    // Get user
    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get active subscription
    const activeSubscription = await getActiveSubscriptionForUser(userId);
    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found. Please subscribe first.",
      });
    }

    // Check if already on this plan or higher
    if (activeSubscription.plan === normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: `You are already subscribed to the ${normalizedPlan} plan.`,
      });
    }

    // Only allow upgrade (Silver -> Gold), not downgrade
    if (activeSubscription.plan === "Gold" && normalizedPlan === "Silver") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot downgrade using upgrade endpoint. Use downgrade endpoint instead.",
      });
    }

    // Calculate pricing
    const currentPlanPrice = parseFloat(activeSubscription.amount);
    const newPlanPrice = getPlanPrice(user.category, normalizedPlan);
    const proratedAmount = calculateProratedAmount(
      currentPlanPrice,
      newPlanPrice,
      activeSubscription.expires_at
    );

    if (proratedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Subscription has expired or is about to expire. Please renew instead.",
      });
    }

    // If PAYSTACK_BYPASS is true, create upgrade immediately
    if (PAYSTACK_BYPASS) {
      // Update existing subscription to new plan
      await activeSubscription.update({
        plan: normalizedPlan,
        amount: newPlanPrice,
        // Keep same expiration date
      });

      // Reload to get updated data
      await activeSubscription.reload();

      // Sync badges
      if (user.category === "Regular") {
        if (normalizedPlan === "Gold") {
          await syncGoldVerificationBadge(user);
        }
      } else if (PREMIUM_CATEGORIES.includes(user.category)) {
        await syncPremiumBadge(user);
      }

      // Send SSE event for subscription update
      try {
        await activeSubscription.reload();
        sendEventToUser(userId, "subscription:updated", {
          subscription: activeSubscription.toJSON(),
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending subscription:updated event:",
          sseError
        );
      }

      return res.status(200).json({
        success: true,
        message: "Subscription upgraded successfully",
        bypassed: true,
        data: {
          subscription: activeSubscription,
          proratedAmount: 0, // Bypassed, no charge
          newPlan: normalizedPlan,
          newAmount: newPlanPrice,
        },
      });
    }

    // Real Paystack flow - initialize payment for prorated amount
    const email = user.email;
    const paystackAmount = toPaystackAmountFromMajor(proratedAmount);

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: buildAuthHeader(),
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: PAYSTACK_CURRENCY,
          metadata: {
            userId: userId,
            type: "subscription_upgrade",
            currentPlan: activeSubscription.plan,
            newPlan: normalizedPlan,
            subscriptionId: activeSubscription.id,
            proratedAmount: proratedAmount,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      console.error("upgradeSubscription Paystack error:", data);
      return res.status(400).json({
        success: false,
        message: data?.message || "Payment initialization failed",
      });
    }

    // Validate required fields from Paystack response
    if (!data.data) {
      console.error("upgradeSubscription missing data object:", data);
      return res.status(400).json({
        success: false,
        message: "Invalid response from Paystack",
      });
    }

    const reference = data.data.reference;
    if (!reference) {
      console.error("upgradeSubscription missing reference:", data.data);
      return res.status(400).json({
        success: false,
        message: "Payment reference not received from Paystack",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment initialized for upgrade",
      authorization_url: data.data.authorization_url,
      reference,
      proratedAmount: proratedAmount,
      newPlan: normalizedPlan,
      newAmount: newPlanPrice,
      access_code: data.data.access_code,
    });
  } catch (err) {
    console.error("upgradeSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription upgrade failed",
      error: err.message,
    });
  }
};

// Verify upgrade payment and complete upgrade
exports.verifyUpgrade = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Reference is required",
      });
    }

    if (PAYSTACK_BYPASS) {
      return res.status(400).json({
        success: false,
        message: "Bypass mode: Upgrade should be completed directly",
      });
    }

    // Verify with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: buildAuthHeader(),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      return res.status(400).json({
        success: false,
        message: data?.message || "Payment verification failed",
      });
    }

    if (data.data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
      });
    }

    const metadata = data.data.metadata;
    if (metadata.type !== "subscription_upgrade") {
      return res.status(400).json({
        success: false,
        message: "Invalid payment type",
      });
    }

    const userId = metadata.userId;
    const subscriptionId = metadata.subscriptionId;
    const newPlan = normalizePlan(metadata.newPlan);

    if (!newPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan in metadata",
      });
    }

    // Get subscription
    const subscription = await Subscription.findByPk(subscriptionId);
    if (!subscription || subscription.public_user_id !== userId) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Get user
    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update subscription
    const newPlanPrice = getPlanPrice(user.category, newPlan);
    await subscription.update({
      plan: newPlan,
      amount: newPlanPrice,
      // Keep same expiration date
    });

    // Sync badges
    if (user.category === "Regular") {
      if (newPlan === "Gold") {
        await syncGoldVerificationBadge(user);
      }
    } else if (PREMIUM_CATEGORIES.includes(user.category)) {
      await syncPremiumBadge(user);
    }

    // Send SSE event for subscription update
    try {
      await subscription.reload();
      sendEventToUser(userId, "subscription:updated", {
        subscription: subscription.toJSON(),
      });
    } catch (sseError) {
      console.error(
        "[SSE] Error sending subscription:updated event:",
        sseError
      );
    }

    return res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      data: {
        subscription: subscription,
        newPlan: newPlan,
        newAmount: newPlanPrice,
      },
    });
  } catch (err) {
    console.error("verifyUpgrade error:", err);
    return res.status(500).json({
      success: false,
      message: "Upgrade verification failed",
      error: err.message,
    });
  }
};

// Downgrade subscription - schedule for end of current period (no refund)
exports.downgradeSubscription = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.publicUserId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate plan
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    // Get user
    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get active subscription
    const activeSubscription = await getActiveSubscriptionForUser(userId);
    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found. Please subscribe first.",
      });
    }

    // Check if already on this plan or lower
    if (activeSubscription.plan === normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: `You are already subscribed to the ${normalizedPlan} plan.`,
      });
    }

    // Only allow downgrade (Gold -> Silver), not upgrade
    if (activeSubscription.plan === "Silver" && normalizedPlan === "Gold") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot upgrade using downgrade endpoint. Use upgrade endpoint instead.",
      });
    }

    // Check if there's already a pending downgrade scheduled
    const existingPendingDowngrade = await Subscription.findOne({
      where: {
        public_user_id: userId,
        status: "pending",
        plan: normalizedPlan,
        starts_at: {
          [Op.gte]: new Date(activeSubscription.expires_at), // Starts when current expires
        },
      },
    });

    if (existingPendingDowngrade) {
      return res.status(400).json({
        success: false,
        message: `A downgrade to ${normalizedPlan} is already scheduled. It will take effect when your current subscription expires.`,
      });
    }

    // Calculate new plan price
    const newPlanPrice = getPlanPrice(user.category, normalizedPlan);

    // Create a scheduled downgrade record
    // We'll store this in a metadata field or create a separate table
    // For now, we'll update the subscription with a "pending_downgrade" status
    // and store the new plan in a custom field or use a separate model

    // Simple approach: Store downgrade info in subscription metadata
    // Since we don't have a metadata field, we'll create a new subscription record
    // that will become active when current one expires

    // Better approach: Add a "scheduled_plan" field or use a separate ScheduledDowngrade model
    // For simplicity, let's create a new subscription with status "pending" that activates on expiration

    const now = new Date();
    const expiresAt = new Date(activeSubscription.expires_at);

    // Create a scheduled subscription that will activate when current expires
    const scheduledSubscription = await Subscription.create({
      public_user_id: userId,
      plan: normalizedPlan,
      amount: newPlanPrice,
      currency: PAYSTACK_CURRENCY,
      reference: `downgrade-${randomUUID()}`,
      status: "pending", // Will be activated when current subscription expires
      starts_at: expiresAt, // Start when current expires
      expires_at: new Date(expiresAt.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from expiration
    });

    return res.status(200).json({
      success: true,
      message:
        "Subscription downgrade scheduled. It will take effect when your current subscription expires.",
      data: {
        currentSubscription: {
          plan: activeSubscription.plan,
          expires_at: activeSubscription.expires_at,
        },
        scheduledSubscription: {
          plan: normalizedPlan,
          starts_at: expiresAt,
          expires_at: scheduledSubscription.expires_at,
        },
        note: "No refund will be issued. Your current plan remains active until expiration.",
      },
    });
  } catch (err) {
    console.error("downgradeSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription downgrade failed",
      error: err.message,
    });
  }
};

// Cancel/Unsubscribe from subscription
// User can cancel at any time - subscription remains active until expiry, but won't auto-renew
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.publicUserId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get active subscription
    const activeSubscription = await getActiveSubscriptionForUser(userId);
    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found to cancel",
      });
    }

    // Check if already cancelled
    if (activeSubscription.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Subscription is already cancelled",
      });
    }

    // Cancel the subscription
    // Set status to cancelled and disable auto-renewal
    await activeSubscription.update({
      status: "cancelled",
      auto_renew_enabled: false,
      cancelled_at: new Date(),
    });

    // Also cancel any pending downgrade
    const pendingDowngrade = await Subscription.findOne({
      where: {
        public_user_id: userId,
        status: "pending",
        starts_at: {
          [Op.gte]: new Date(activeSubscription.expires_at),
        },
      },
    });

    if (pendingDowngrade) {
      await pendingDowngrade.update({
        status: "cancelled",
        cancelled_at: new Date(),
      });
    }

    // Calculate remaining days
    const now = new Date();
    const expiresAt = new Date(activeSubscription.expires_at);
    const remainingDays = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
      data: {
        subscription: {
          id: activeSubscription.id,
          plan: activeSubscription.plan,
          status: "cancelled",
          expires_at: activeSubscription.expires_at,
          remainingDays: Math.max(0, remainingDays),
        },
        note: `Your subscription will remain active until ${expiresAt.toLocaleDateString()}. You will not be charged again.`,
      },
    });
  } catch (err) {
    console.error("cancelSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel subscription",
      error: err.message,
    });
  }
};

// Check and send notifications for expiring/expired subscriptions
// This endpoint can be called manually or via a scheduled job (cron)
exports.checkSubscriptionExpirations = async (req, res) => {
  try {
    const subscriptionNotificationService = require("../services/subscriptionNotificationService");

    // Run all expiration checks
    const results =
      await subscriptionNotificationService.runSubscriptionExpirationChecks();

    return res.status(200).json({
      success: true,
      message: "Subscription expiration checks completed",
      data: results,
    });
  } catch (err) {
    console.error("checkSubscriptionExpirations error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to check subscription expirations",
      error: err.message,
    });
  }
};

// Profile boost functions - subscription-based only (no tokens)
exports.boostProfile = async (req, res) => {
  try {
    const {
      targetCategory,
      targetArea,
      targetLatitude,
      targetLongitude,
      targetRadiusKm,
      targetLat,
      targetLng,
      targetRadius,
      durationHours,
      hours,
      purchaseHours,
    } = req.body;

    if (!targetCategory || !ALLOWED_BOOST_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing target category",
      });
    }

    const boostLat =
      parseCoordinate(targetLatitude) ?? parseCoordinate(targetLat);
    const boostLng =
      parseCoordinate(targetLongitude) ?? parseCoordinate(targetLng);
    const boostRadiusKm = sanitizeRadius(targetRadiusKm ?? targetRadius, {
      min: 1,
      max: 200,
      fallback: 10,
    });

    if (
      boostLat === null ||
      boostLng === null ||
      boostLat < -90 ||
      boostLat > 90 ||
      boostLng < -180 ||
      boostLng > 180
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid target latitude and longitude are required to geotarget a boost.",
      });
    }

    const normalizedTargetCounty = targetArea
      ? normalizeCountyName(targetArea) || targetArea?.trim() || null
      : null;

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const now = new Date();

    await ProfileBoost.update(
      { status: "expired" },
      {
        where: {
          public_user_id: user.id,
          status: "active",
          ends_at: { [Op.lte]: now },
        },
      }
    );

    // Subscription-based boost allowance (no tokens)
    let extensionMs = 0;
    let totalHoursPurchased = 0;

    const isPremium = PREMIUM_CATEGORIES.includes(user.category);

    if (user.category === "Regular") {
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);
      const plan = subscription ? REGULAR_PLANS[subscription.plan] : null;

      if (!subscription || !plan) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to boost your profile.",
        });
      }

      if (subscription.plan === "Gold") {
        // Gold plan: use hours-based tracking
        // Use requested durationHours or plan's default (2 hours)
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForRegular(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
      } else {
        // Silver plan doesn't have boosts
        return res.status(403).json({
          success: false,
          message:
            "Profile boosts are not available for your subscription plan.",
        });
      }
    } else if (isPremium) {
      // Premium category users: subscription-based boost allowance using hours
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);
      const plan = subscription ? PREMIUM_PLANS[subscription.plan] : null;

      if (!subscription || !plan) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to boost your profile.",
        });
      }

      if (subscription.plan === "Silver") {
        // Silver plan: default 1-hour duration, can target one category
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForPremium(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        // Silver can only target one category - verify targetCategory is provided
        if (!targetCategory) {
          return res.status(400).json({
            success: false,
            message: "Target category is required for Silver plan boosts.",
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
      } else if (subscription.plan === "Gold") {
        // Gold plan: default 3-hour duration, can target all categories
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForPremium(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
      } else {
        return res.status(403).json({
          success: false,
          message:
            "Profile boosts are not available for your subscription plan.",
        });
      }
    } else {
      // Subscription required for all users
      return res.status(402).json({
        success: false,
        message:
          "Active subscription required to boost your profile. Please subscribe to a plan to continue.",
      });
    }

    const boostRecord = await ProfileBoost.create({
      public_user_id: user.id,
      target_category: targetCategory,
      target_area: normalizedTargetCounty,
      target_lat: boostLat,
      target_lng: boostLng,
      target_radius_km: boostRadiusKm,
      price_kes: 0, // Free for subscribers
      starts_at: now,
      ends_at: new Date(now.getTime() + extensionMs),
      status: "active",
    });

    const totalBoosts = await ProfileBoost.count({
      where: { public_user_id: user.id },
    });

    return res.json({
      success: true,
      data: {
        boost: boostRecord,
        totalBoosts,
        hoursPurchased: totalHoursPurchased,
        targetCounty: normalizedTargetCounty,
        targetLatitude: boostLat,
        targetLongitude: boostLng,
        targetRadiusKm: boostRadiusKm,
      },
    });
  } catch (err) {
    console.error("boostProfile error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to boost profile",
      error: err.message,
    });
  }
};

exports.extendProfileBoost = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["category"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isRegularOrPremium =
      user.category === "Regular" || PREMIUM_CATEGORIES.includes(user.category);

    // For Regular and Premium users: allow extension using daily hours allowance
    if (isRegularOrPremium) {
      const {
        additionalHours,
        hours,
        durationHours,
        targetRadiusKm,
        targetRadius,
      } = req.body;

      const now = new Date();

      const boost = await ProfileBoost.findOne({
        where: {
          id,
          public_user_id: req.publicUserId,
          status: "active",
          ends_at: { [Op.gt]: now },
        },
      });

      if (!boost) {
        return res.status(404).json({
          success: false,
          message: "Active boost not found for this user",
        });
      }

      // Calculate requested extension hours
      const requestedHours = Number.parseFloat(
        additionalHours ?? hours ?? durationHours ?? 1
      );
      const extensionHours =
        Number.isFinite(requestedHours) && requestedHours > 0
          ? Math.min(requestedHours, 24) // Max 24 hours extension at once
          : 1;

      // Use hours-based allowance
      let usage;
      if (user.category === "Regular") {
        usage = await useBoostHoursForRegular(req.publicUserId, extensionHours);
      } else {
        usage = await useBoostHoursForPremium(req.publicUserId, extensionHours);
      }

      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to extend boost.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message: `Insufficient daily boost hours. You have ${usage.remaining.toFixed(
            1
          )} hours remaining, but need ${extensionHours} hours.`,
        });
      }

      // Update boost end time
      const extensionMs = usage.consumedHours * 3600 * 1000;
      const currentEndsAt = new Date(boost.ends_at);
      const baseline = currentEndsAt > now ? currentEndsAt : now;
      const newEndsAt = new Date(baseline.getTime() + extensionMs);

      // Update radius if provided
      const radiusFallback =
        boost.target_radius_km !== null
          ? Number.parseFloat(boost.target_radius_km)
          : 10;
      const updatedRadius = sanitizeRadius(
        targetRadiusKm ?? targetRadius ?? radiusFallback,
        {
          fallback: radiusFallback,
        }
      );

      boost.target_radius_km = updatedRadius;
      boost.ends_at = newEndsAt;
      await boost.save();

      return res.json({
        success: true,
        data: {
          boost,
          hoursExtended: usage.consumedHours,
          remainingHours: usage.remaining,
          endsAt: newEndsAt,
        },
      });
    }

    // For other users (if any), subscription is required
    return res.status(402).json({
      success: false,
      message: "Active subscription required to extend boost.",
    });
  } catch (err) {
    console.error("extendProfileBoost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to extend boost",
      error: err.message,
    });
  }
};

// Admin endpoint to get user's subscription and boost status
exports.adminGetUserSubscription = async (req, res) => {
  try {
    const { public_user_id } = req.params;

    if (!public_user_id) {
      return res.status(400).json({
        success: false,
        message: "public_user_id is required",
      });
    }

    const user = await PublicUser.findByPk(public_user_id, {
      attributes: ["id", "category"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const subscription = await getActiveSubscriptionForUser(public_user_id);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        data: {
          hasSubscription: false,
          subscription: null,
          pendingDowngrade: null,
          boostHours: null,
        },
      });
    }

    // Calculate remaining days
    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    const timeDiff = expiresAt.getTime() - now.getTime();
    const remainingDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    // Check for pending downgrade
    const pendingDowngrade = await Subscription.findOne({
      where: {
        public_user_id: public_user_id,
        status: "pending",
        starts_at: {
          [Op.gte]: expiresAt,
        },
      },
      order: [["starts_at", "ASC"]],
    });

    // Get boost hours information based on plan
    let boostHoursInfo = null;
    const isPremium = PREMIUM_CATEGORIES.includes(user.category);
    const planConfig = isPremium
      ? PREMIUM_PLANS[subscription.plan]
      : REGULAR_PLANS[subscription.plan];

    if (planConfig) {
      // Get today's usage to show remaining hours
      const { SubscriptionUsage } = require("../models");
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayUsage = await SubscriptionUsage.findOne({
        where: {
          public_user_id: public_user_id,
          usage_date: todayStr,
        },
      });

      const usedHours = todayUsage
        ? Number(todayUsage.boost_hours_used || 0)
        : 0;
      const totalHours = Number.isFinite(planConfig.boostHoursPerDay)
        ? planConfig.boostHoursPerDay
        : 0;
      const remainingHours = Math.max(0, totalHours - usedHours);
      const defaultDuration = planConfig.boostDurationHours || 1;

      boostHoursInfo = {
        totalHoursPerDay: totalHours,
        usedHours: usedHours,
        remainingHours: remainingHours,
        defaultDurationPerBoost: defaultDuration,
        maxDurationPerBoost: defaultDuration,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          amount: parseFloat(subscription.amount),
          status: subscription.status,
          starts_at: subscription.starts_at,
          expires_at: subscription.expires_at,
          remainingDays: Math.max(0, remainingDays),
          auto_renew_enabled: subscription.auto_renew_enabled || false,
          isCancelled: subscription.status === "cancelled",
        },
        pendingDowngrade: pendingDowngrade
          ? {
              plan: pendingDowngrade.plan,
              starts_at: pendingDowngrade.starts_at,
              expires_at: pendingDowngrade.expires_at,
            }
          : null,
        boostHours: boostHoursInfo,
      },
    });
  } catch (err) {
    console.error("adminGetUserSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user subscription status",
      error: err.message,
    });
  }
};
