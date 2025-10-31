const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/publicUserController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const {
  uploadProfileImage,
  handleUploadError,
} = require("../middleware/upload");

// Auth
router.post("/register", ctrl.register);
router.post("/login", ctrl.login);
router.post("/request-otp", ctrl.requestOtp);
router.post("/verify-otp", ctrl.verifyOtp);

// Profile
router.get("/me", authenticatePublic, ctrl.getMe);
router.put(
  "/me",
  authenticatePublic,
  uploadProfileImage,
  handleUploadError,
  ctrl.updateMe
);

// Wallet
router.get("/wallet", authenticatePublic, ctrl.getWallet);

// Browse & Featured (guest-friendly)
router.get("/", optionalPublicAuth, ctrl.list);
router.get("/featured", optionalPublicAuth, ctrl.featured);

module.exports = router;
