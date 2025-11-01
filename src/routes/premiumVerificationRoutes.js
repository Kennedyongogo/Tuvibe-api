const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/premiumVerificationController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const { authenticateAdmin } = require("../middleware/auth");

// Public user
router.post("/request", authenticatePublic, ctrl.requestVerification);
router.get("/my-status", authenticatePublic, ctrl.getMyStatus);

// Admin
router.get("/", authenticateAdmin, ctrl.listRequests);
router.post("/:id/approve", authenticateAdmin, ctrl.approve);
router.post("/:id/reject", authenticateAdmin, ctrl.reject);

module.exports = router;

// Premium Lounge (auth required)
router.get("/lounge/:category", optionalPublicAuth, ctrl.loungeByCategory);
