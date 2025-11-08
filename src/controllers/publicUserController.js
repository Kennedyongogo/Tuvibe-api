const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op, Sequelize } = require("sequelize");
const config = require("../config/config");
const { PublicUser, TokenTransaction, ProfileView } = require("../models");
const { sequelize } = require("../config/database");
const {
  computeAgeFromBirthYear,
  extractBirthYearFromPayload,
  birthYearProvided,
  formatUserForResponse,
} = require("../utils/userProfile");

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

exports.register = async (req, res) => {
  try {
    const {
      name,
      gender,
      phone,
      email,
      password,
      latitude,
      longitude,
      bio,
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
    const birthYear = extractBirthYearFromPayload(req.body);

    if (birthYearProvided(req.body) && birthYear === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid year of birth or age provided",
      });
    }

    // Prepare user data
    const userData = {
      name,
      gender,
      category: "Regular", // Always set as Regular by default
      phone,
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

    // Update login timestamp and clear logout timestamp
    // Clear last_seen_at when user logs in (will be set only on logout)
    const now = new Date();
    await user.update({
      logged_in_at: now,
      logged_out_at: null,
      is_online: true,
      last_seen_at: null, // Clear last_seen_at on login (only set on logout)
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
    return res.json({
      success: true,
      data: formatUserForResponse(user),
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

    // Add fields from req.body (works for both JSON and form-data)
    for (const key of allowed) {
      if (
        req.body[key] !== undefined &&
        req.body[key] !== null &&
        req.body[key] !== ""
      ) {
        if (key === "latitude" || key === "longitude") {
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

    // Log updates before saving (for debugging)
    if (process.env.NODE_ENV === "development") {
      console.log("Attempting to update with:", {
        keys: Object.keys(updates),
        photosCount: updates.photos ? updates.photos.length : 0,
      });
    }

    // Validate updates object before saving
    try {
      await PublicUser.update(updates, { where: { id: req.publicUserId } });
      const user = await PublicUser.findByPk(req.publicUserId, {
        attributes: { exclude: ["password", "otp"] },
      });
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
    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];

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
      if (county) where.county = county;
      if (online !== undefined) where.is_online = online === "true";
      if (q) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${q}%` } },
          { county: { [Op.iLike]: `%${q}%` } },
        ];
      }
    } else {
      // Get current user to determine their category
      const currentUser = await PublicUser.findByPk(req.publicUserId, {
        attributes: ["category"],
      });

      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const isCurrentUserRegular = currentUser.category === "Regular";
      const isCurrentUserPremium = premiumCategories.includes(
        currentUser.category
      );

      // Build base filters
      const baseFilters = {};
      if (county) baseFilters.county = county;
      if (online !== undefined) baseFilters.is_online = online === "true";

      // Handle category filter
      if (category) {
        if (premiumCategories.includes(category)) {
          // Regular users can view premium categories but only verified users
          if (isCurrentUserRegular) {
            where.category = category;
            where.isVerified = true; // Regular users can only see verified premium users
            Object.assign(where, baseFilters);
          } else {
            // Premium users: filtering by premium category shows verified users only
            where.category = category;
            where.isVerified = true;
            Object.assign(where, baseFilters);
          }
        } else {
          // Filtering by Regular: show all Regular users
          where.category = category;
          Object.assign(where, baseFilters);
        }
      } else {
        // No category filter
        if (isCurrentUserRegular) {
          // Regular users: show Regular AND verified premium users (view only, can't unlock)
          where[Op.and] = [
            {
              [Op.or]: [
                { category: { [Op.eq]: "Regular" } },
                {
                  category: { [Op.in]: premiumCategories },
                  isVerified: true, // Regular users can only see verified premium users
                },
              ],
            },
            ...(Object.keys(baseFilters).length > 0 ? [baseFilters] : []),
          ];
        } else if (isCurrentUserPremium) {
          // Premium users (verified or unverified): show Regular AND premium users
          where[Op.and] = [
            {
              [Op.or]: [
                { category: { [Op.eq]: "Regular" } },
                {
                  category: { [Op.in]: premiumCategories },
                  // Premium users can see both verified and unverified premium users
                },
              ],
            },
            ...(Object.keys(baseFilters).length > 0 ? [baseFilters] : []),
          ];
        }
      }

      // Handle search query
      if (q) {
        if (!where[Op.and]) where[Op.and] = [];
        where[Op.and].push({
          [Op.or]: [
            { name: { [Op.iLike]: `%${q}%` } },
            { county: { [Op.iLike]: `%${q}%` } },
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
        exclude: ["password", "otp", "phone"], // mask phone in listings
      },
    };

    // If not nearby search, apply ordering and pagination normally
    if (!isNearbySearch) {
      queryOptions.order = [
        ["isVerified", "DESC"],
        // Prioritize active boosts: profiles with is_featured_until > current time appear first
        [
          Sequelize.literal(`CASE 
            WHEN "PublicUser"."is_featured_until" IS NULL THEN 0 
            WHEN "PublicUser"."is_featured_until" > NOW() THEN 1 
            ELSE 0 
          END`),
          "DESC",
        ],
        // Then sort by is_featured_until DESC (future dates first, NULLs last)
        // Note: Sequelize doesn't support NULLS LAST directly, so we use COALESCE to push NULLs to end
        [
          Sequelize.literal(
            `COALESCE("PublicUser"."is_featured_until", '1970-01-01'::timestamp)`
          ),
          "DESC",
        ],
        ["boost_score", "DESC"],
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
          const userData = formatUserForResponse(user);
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
            const userJson = formatUserForResponse(userModel);
            userJson.distance = user.distance;
            return userJson;
          }
          return user;
        });

      // Update count to reflect filtered results
      const totalFiltered = usersWithDistance.length;

      // Filter out unapproved photos and bios
      const filteredRows = processedRows.map((user) => {
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
        return user;
      });

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

    // Filter out unapproved photos and bios for public listings
    const filteredRows = processedRows.map((user) => {
      const userData = formatUserForResponse(user);
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
      const userData = formatUserForResponse(user);
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

    const where = {
      is_featured_until: { [Op.gt]: now },
      boost_score: { [Op.gt]: 0 },
    };

    if (req.publicUserId) {
      where.id = { [Op.ne]: req.publicUserId };
    }

    const rows = await PublicUser.findAll({
      where,
      attributes: { exclude: ["password", "otp", "phone"] },
      order: [
        ["is_featured_until", "DESC"],
        ["updatedAt", "DESC"],
      ],
      limit,
    });

    const filteredRows = rows.map((user) => {
      const userData = formatUserForResponse(user);
      if (userData.photo_moderation_status !== "approved") {
        userData.photo = null;
      }
      if (userData.photos) {
        userData.photos = filterApprovedPhotos(userData.photos);
      }
      if (userData.bio_moderation_status !== "approved") {
        userData.bio = null;
      }
      return userData;
    });

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
    const safeUser = formatUserForResponse(user);
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

    console.log("=== DELETE PHOTO BACKEND DEBUG ===");
    console.log("Photo index to delete:", photoIndexNum);
    console.log("Photos before deletion:", photos);
    console.log("Photos count before:", photos.length);

    // Check if photo index is valid
    if (photoIndexNum >= photos.length) {
      console.log("Invalid photo index - out of bounds");
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    // Remove the photo from the array
    const deletedPhoto = photos[photoIndexNum];
    photos.splice(photoIndexNum, 1);
    
    console.log("Photos after deletion:", photos);
    console.log("Photos count after:", photos.length);

    // Update user's photos array - ensure it's saved as JSONB array
    try {
      await user.update({ photos: photos }, { returning: true });
      
      // Reload user to verify the update
      await user.reload();
      console.log("User photos after update:", user.photos);
      console.log("User photos count after update:", Array.isArray(user.photos) ? user.photos.length : "Not an array");
      
      // Verify the update worked
      const updatedPhotos = user.photos;
      if (Array.isArray(updatedPhotos) && updatedPhotos.length !== photos.length) {
        console.error("WARNING: Photo count mismatch after update!");
        console.error("Expected count:", photos.length, "Actual count:", updatedPhotos.length);
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