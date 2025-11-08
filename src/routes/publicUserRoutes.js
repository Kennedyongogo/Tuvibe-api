const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/publicUserController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const {
  uploadProfileImage,
  uploadProfileImages,
  handleUploadError,
} = require("../middleware/upload");

// Auth
router.post("/register", uploadProfileImage, handleUploadError, ctrl.register);
router.post("/login", ctrl.login);
router.post("/request-otp", ctrl.requestOtp);
router.post("/verify-otp", ctrl.verifyOtp);

// Profile
router.get("/me", authenticatePublic, ctrl.getMe);
router.post("/logout", authenticatePublic, ctrl.logout);
router.put(
  "/me",
  authenticatePublic,
  uploadProfileImages,
  handleUploadError,
  ctrl.updateMe
);
router.delete("/me/photos/:photoIndex", authenticatePublic, ctrl.deletePhoto);

// Wallet
router.get("/wallet", authenticatePublic, ctrl.getWallet);

// Browse & Featured (guest-friendly)
router.get(
  "/featured/boosts",
  optionalPublicAuth,
  ctrl.featuredBoosts
);
router.get("/featured", optionalPublicAuth, ctrl.featured);
router.get("/", optionalPublicAuth, ctrl.list);

// Profile viewing (requires authentication - use /users prefix to avoid conflicts)
router.get("/users/:id", authenticatePublic, ctrl.getById);
router.post("/users/:id/view", authenticatePublic, ctrl.trackProfileView);

router.get(
  "/boosts/targeted",
  authenticatePublic,
  ctrl.targetedBoostMatches
);
router.get("/boosts/status", authenticatePublic, ctrl.getBoostStatus);

module.exports = router;
