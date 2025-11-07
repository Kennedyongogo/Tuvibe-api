const express = require("express");
const router = express.Router();

const { handleWebhook } = require("../controllers/paystackWebhookController");

router.post("/", handleWebhook);

module.exports = router;
