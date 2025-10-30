const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/tokenController");

router.get("/balance", authenticatePublic, ctrl.getBalance);
router.get("/transactions", authenticatePublic, ctrl.listTransactions);
router.post("/purchase", authenticatePublic, ctrl.purchaseTokens);
router.post("/boost", authenticatePublic, ctrl.boostProfile);

module.exports = router;
