const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/marketItemController");
const { authenticateAdmin } = require("../middleware/auth");
const {
  uploadMarketImages,
  handleUploadError,
} = require("../middleware/upload");

router.get("/", ctrl.list);
router.post(
  "/",
  authenticateAdmin,
  uploadMarketImages,
  handleUploadError,
  ctrl.create
);
router.put(
  "/:id",
  authenticateAdmin,
  uploadMarketImages,
  handleUploadError,
  ctrl.update
);
router.delete("/:id", authenticateAdmin, ctrl.remove);

module.exports = router;
