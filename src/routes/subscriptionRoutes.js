const express = require("express");
const router = express.Router();

const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const ctrl = require("../controllers/subscriptionController");

// Initialize a Paystack subscription payment (Silver/Gold)
router.post(
  "/paystack/initialize",
  authenticatePublic,
  ctrl.initializeSubscription
);

// Verify a Paystack subscription payment by reference
router.get("/paystack/verify", optionalPublicAuth, ctrl.verifySubscription);

module.exports = router;
