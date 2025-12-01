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
router.post("/forgot-password", ctrl.forgotPassword);

// Profile
router.get("/me", authenticatePublic, ctrl.getMe);
router.post("/logout", authenticatePublic, ctrl.logout);
router.get("/me/who-viewed", authenticatePublic, ctrl.getWhoViewedMe);
router.get(
  "/me/suggested-matches",
  authenticatePublic,
  ctrl.getSuggestedMatches
);
router.put(
  "/me",
  authenticatePublic,
  uploadProfileImages,
  handleUploadError,
  ctrl.updateMe
);
router.put("/me/password", authenticatePublic, ctrl.changePassword);
router.delete("/me/photos/:photoIndex", authenticatePublic, ctrl.deletePhoto);
router.post(
  "/me/photos",
  authenticatePublic,
  uploadProfileImages,
  handleUploadError,
  ctrl.addPhotos
);
router.delete("/me", authenticatePublic, ctrl.deleteAccount);

// Wallet
router.get("/wallet", authenticatePublic, ctrl.getWallet);

// Browse & Featured (guest-friendly)
router.get("/featured/boosts", optionalPublicAuth, ctrl.featuredBoosts);
router.get("/featured", optionalPublicAuth, ctrl.featured);
router.get("/", optionalPublicAuth, ctrl.list);

// Profile viewing (requires authentication - use /users prefix to avoid conflicts)
router.get("/users/:id", authenticatePublic, ctrl.getById);
router.post("/users/:id/view", authenticatePublic, ctrl.trackProfileView);

router.get("/boosts/targeted", authenticatePublic, ctrl.targetedBoostMatches);
router.get("/boosts/status", authenticatePublic, ctrl.getBoostStatus);

module.exports = router;
