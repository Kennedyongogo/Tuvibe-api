const express = require("express");
const { authenticateAdmin } = require("../middleware/auth");
const { authenticatePublic } = require("../middleware/publicAuth");
const suspensionController = require("../controllers/suspensionController");
const suspensionMessageController = require("../controllers/suspensionMessageController");

const router = express.Router();

const adminRouter = express.Router();
adminRouter.post("/", suspensionController.suspendUser);
adminRouter.patch("/:id/revoke", suspensionController.revokeSuspension);
adminRouter.get("/", suspensionController.listSuspensions);
adminRouter.get("/user/:userId", suspensionController.getSuspensionByUser);
adminRouter.get("/:id/messages", suspensionMessageController.getMessages);
adminRouter.post("/:id/messages", suspensionMessageController.sendMessage);
adminRouter.patch("/:id/messages/read", suspensionMessageController.markAsRead);
adminRouter.get(
  "/:id/messages/unread-count",
  suspensionMessageController.getUnreadCount
);

const meRouter = express.Router();
meRouter.get("/status", suspensionController.getMyActiveSuspension);
meRouter.get("/:id/messages", suspensionMessageController.getMessages);
meRouter.post("/:id/messages", suspensionMessageController.sendMessage);
meRouter.patch("/:id/messages/read", suspensionMessageController.markAsRead);
meRouter.get(
  "/:id/messages/unread-count",
  suspensionMessageController.getUnreadCount
);

router.use("/admin", authenticateAdmin, adminRouter);
router.use("/me", authenticatePublic, meRouter);

module.exports = router;
