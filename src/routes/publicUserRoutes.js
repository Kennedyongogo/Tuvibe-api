const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/publicUserController");
const { authenticatePublic } = require("../middleware/publicAuth");

// Auth
router.post("/register", ctrl.register);
router.post("/login", ctrl.login);
router.post("/request-otp", ctrl.requestOtp);
router.post("/verify-otp", ctrl.verifyOtp);

// Profile
router.get("/me", authenticatePublic, ctrl.getMe);
router.put("/me", authenticatePublic, ctrl.updateMe);

// Wallet
router.get("/wallet", authenticatePublic, ctrl.getWallet);

module.exports = router;
