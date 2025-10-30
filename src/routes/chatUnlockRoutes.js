const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/chatUnlockController");

router.get("/cost", authenticatePublic, ctrl.getChatCost);
router.post("/unlock", authenticatePublic, ctrl.unlock);

module.exports = router;
