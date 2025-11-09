const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/tokenController");

router.get("/balance", authenticatePublic, ctrl.getBalance);
router.get("/transactions", authenticatePublic, ctrl.listTransactions);
router.get("/transactions/:id", authenticatePublic, ctrl.getTransaction);
router.post("/purchase", authenticatePublic, ctrl.purchaseTokens);
router.post("/boost", authenticatePublic, ctrl.boostProfile);
router.patch("/boost/:id/extend", authenticatePublic, ctrl.extendProfileBoost);

module.exports = router;
