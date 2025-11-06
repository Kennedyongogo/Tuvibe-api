const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/chatUnlockController");

router.get("/cost", authenticatePublic, ctrl.getChatCost);
router.post("/unlock", authenticatePublic, ctrl.unlock);
router.get("/", authenticatePublic, ctrl.list); // List all unlocked chats
router.get("/check", authenticatePublic, ctrl.checkUnlocked); // Check if specific user is unlocked

module.exports = router;
