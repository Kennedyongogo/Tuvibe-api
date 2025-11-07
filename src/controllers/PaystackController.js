const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));
require("dotenv").config();

const { TokenTransaction } = require("../models");
const { addTokens } = require("../services/tokenService");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_CALLBACK_URL =
  process.env.PAYSTACK_CALLBACK_URL ||
  "http://84.247.176.143:1435/api/paystack/verify";
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || "KES";
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

const buildAuthHeader = () => {
  if (!PAYSTACK_SECRET_KEY) {
    console.error("Paystack secret key missing");
  }
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
};

const toPaystackAmount = (tokens) => {
  const tokensNumber = Number(tokens);
  if (!Number.isFinite(tokensNumber) || tokensNumber <= 0) {
    throw new Error("Tokens must be a positive number");
  }
  const majorUnits = tokensNumber / PAYSTACK_TOKENS_PER_UNIT;
  return Math.round(majorUnits * PAYSTACK_MINOR_UNIT_FACTOR);
};

const fromPaystackAmountToTokens = (paystackAmount) => {
  const amountNumber = Number(paystackAmount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    throw new Error("Invalid Paystack amount");
  }
  const majorUnits = amountNumber / PAYSTACK_MINOR_UNIT_FACTOR;
  return majorUnits * PAYSTACK_TOKENS_PER_UNIT;
};

exports.initializePayment = async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Email and amount are required" });
    }

    let paystackAmount;
    try {
      paystackAmount = toPaystackAmount(amount);
    } catch (conversionErr) {
      console.error("initializePayment amount error:", conversionErr);
      return res.status(400).json({
        success: false,
        message: conversionErr.message,
      });
    }

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: buildAuthHeader(),
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          callback_url: PAYSTACK_CALLBACK_URL,
          currency: PAYSTACK_CURRENCY,
          metadata: {
            userId: req.publicUserId,
            tokens: Number(amount),
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      console.error("initializePayment response error:", data);
      return res
        .status(400)
        .json({ success: false, message: data?.message || "Paystack error" });
    }

    return res.status(200).json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
      paystack_amount: data.data.amount,
      currency: data.data.currency,
      access_code: data.data.access_code,
    });
  } catch (err) {
    console.error("initializePayment error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Payment initialization failed" });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Reference required" });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status || data.data?.status !== "success") {
      console.error("verifyPayment unsuccessful response:", data);
      return res
        .status(400)
        .json({ success: false, message: "Payment not successful" });
    }

    let tokensToCredit;
    try {
      tokensToCredit = fromPaystackAmountToTokens(data.data.amount);
    } catch (conversionErr) {
      console.error(
        "verifyPayment conversion error:",
        conversionErr,
        data.data
      );
      return res.status(500).json({
        success: false,
        message: "Failed to convert payment amount",
      });
    }
    const email = data.data.customer?.email;
    const userId = req.publicUserId || data.data.metadata?.userId;

    if (!userId) {
      console.error(
        "verifyPayment missing userId for reference",
        reference,
        data.data.metadata
      );
      return res.status(400).json({
        success: false,
        message: "Unable to determine user for this transaction",
      });
    }

    const existing = await TokenTransaction.findOne({ where: { reference } });
    if (existing) {
      console.log(
        `ℹ️ Paystack reference ${reference} already processed for user ${userId}`
      );
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        data: data.data,
      });
    }

    await addTokens(userId, tokensToCredit, {
      payment_method: "card",
      reference,
      description: "Token purchase via Paystack",
      email,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: data.data,
    });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Payment verification failed" });
  }
};
