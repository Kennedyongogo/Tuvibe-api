const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const tokenCtrl = require("../controllers/tokenController");
const subscriptionCtrl = require("../controllers/subscriptionController");

router.get("/balance", authenticatePublic, tokenCtrl.getBalance);
router.get("/transactions", authenticatePublic, tokenCtrl.listTransactions);
router.get("/transactions/:id", authenticatePublic, tokenCtrl.getTransaction);
router.post("/purchase", authenticatePublic, tokenCtrl.purchaseTokens);
// Boost routes now use subscription controller (subscription-based, not token-based)
router.post("/boost", authenticatePublic, subscriptionCtrl.boostProfile);
router.patch(
  "/boost/:id/extend",
  authenticatePublic,
  subscriptionCtrl.extendProfileBoost
);

module.exports = router;
