const express = require("express");
const router = express.Router();

const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/PaystackController");

router.post("/initialize", authenticatePublic, ctrl.initializePayment);
router.get("/verify", authenticatePublic, ctrl.verifyPayment);

module.exports = router;
