const crypto = require("crypto");
require("dotenv").config();

const { TokenTransaction } = require("../models");
const { addTokens } = require("../services/tokenService");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_MINOR_UNIT_FACTOR = Number(
  process.env.PAYSTACK_MINOR_UNIT_FACTOR || "100"
);
const PAYSTACK_TOKENS_PER_UNIT = Number(
  process.env.PAYSTACK_TOKENS_PER_UNIT || "1"
);

if (
  !Number.isFinite(PAYSTACK_MINOR_UNIT_FACTOR) ||
  PAYSTACK_MINOR_UNIT_FACTOR <= 0
) {
  throw new Error("PAYSTACK_MINOR_UNIT_FACTOR must be a positive number");
}

if (
  !Number.isFinite(PAYSTACK_TOKENS_PER_UNIT) ||
  PAYSTACK_TOKENS_PER_UNIT <= 0
) {
  throw new Error("PAYSTACK_TOKENS_PER_UNIT must be a positive number");
}

const fromPaystackAmountToTokens = (paystackAmount) => {
  const amountNumber = Number(paystackAmount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    throw new Error("Invalid Paystack amount");
  }
  const majorUnits = amountNumber / PAYSTACK_MINOR_UNIT_FACTOR;
  return majorUnits * PAYSTACK_TOKENS_PER_UNIT;
};

exports.handleWebhook = async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      console.warn("⚠️ PAYSTACK_SECRET_KEY is not set; rejecting webhook");
      return res.status(500).send("Server misconfiguration");
    }

    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const signature = req.headers["x-paystack-signature"];

    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (!signature || hash !== signature) {
      console.warn("⚠️ Invalid Paystack signature detected");
      return res.status(401).send("Invalid signature");
    }

    const { event, data } = req.body || {};

    if (event === "charge.success" && data?.status === "success") {
      const reference = data.reference;
      let tokensToCredit;
      try {
        tokensToCredit = fromPaystackAmountToTokens(data.amount);
      } catch (conversionErr) {
        console.error("handleWebhook conversion error:", conversionErr, data);
        return res.status(200).send("Webhook ignored");
      }
      const email = data.customer?.email;
      const userId = data.metadata?.userId;


      if (!userId) {
        console.warn(
          "⚠️ Missing userId in Paystack metadata for reference",
          reference
        );
        return res.status(200).send("Webhook received");
      }

      const existing = await TokenTransaction.findOne({ where: { reference } });
      if (!existing) {
        await addTokens(userId, tokensToCredit, {
          payment_method: "card",
          reference,
          description: "Token purchase via Paystack webhook",
          email,
        });
      } else {
      }
    }

    return res.status(200).send("Webhook received");
  } catch (err) {
    console.error("handleWebhook error:", err);
    return res.status(500).send("Server error");
  }
};
