const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/premiumVerificationController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");

// Public user - upgrade to premium (automatic verification)
router.get("/upgrade-costs", authenticatePublic, ctrl.getUpgradeCosts);
router.post("/upgrade", authenticatePublic, ctrl.upgradeToPremium);

// Premium Lounge (auth required)
router.get("/lounge/:category", optionalPublicAuth, ctrl.loungeByCategory);

module.exports = router;
