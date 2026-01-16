const express = require("express");
const router = express.Router();

const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const { authenticateAdmin } = require("../middleware/auth");
const { uploadProfileImage } = require("../middleware/upload");
const ctrl = require("../controllers/subscriptionController");

// Initialize a Paystack subscription payment (Silver/Gold) with registration data
router.post(
  "/paystack/initialize-with-registration",
  uploadProfileImage,
  ctrl.initializeSubscriptionWithRegistration
);

// Initialize a Paystack subscription payment (Silver/Gold)
router.post(
  "/paystack/initialize",
  authenticatePublic,
  ctrl.initializeSubscription
);

// Verify a Paystack subscription payment by reference
router.get("/paystack/verify", optionalPublicAuth, ctrl.verifySubscription);

// Get current subscription status
router.get("/status", authenticatePublic, ctrl.getMySubscription);

router.post("/incognito/start", authenticatePublic, ctrl.startIncognitoSession);
router.get("/incognito/status", authenticatePublic, ctrl.getIncognitoStatus);

// Upgrade subscription - pay prorated difference, activate immediately
router.post("/upgrade", authenticatePublic, ctrl.upgradeSubscription);

// Verify upgrade payment
router.get("/upgrade/verify", optionalPublicAuth, ctrl.verifyUpgrade);

// Downgrade subscription - schedule for end of current period
router.post("/downgrade", authenticatePublic, ctrl.downgradeSubscription);

// Cancel/Unsubscribe from subscription
router.post("/cancel", authenticatePublic, ctrl.cancelSubscription);

// Check and send notifications for expiring/expired subscriptions (Admin only)
// This endpoint can be called manually or via a scheduled job (cron)
router.post(
  "/check-expirations",
  authenticateAdmin,
  ctrl.checkSubscriptionExpirations
);

module.exports = router;
