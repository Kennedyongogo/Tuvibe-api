const { randomUUID } = require("crypto");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));
require("dotenv").config();

const { Subscription } = require("../models");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || "KES";
const PAYSTACK_MINOR_UNIT_FACTOR = Number(
  process.env.PAYSTACK_MINOR_UNIT_FACTOR || "100"
);
const PAYSTACK_BYPASS =
  process.env.PAYSTACK_BYPASS === "true" || process.env.PAYSTACK_BYPASS === "1";

if (
  !Number.isFinite(PAYSTACK_MINOR_UNIT_FACTOR) ||
  PAYSTACK_MINOR_UNIT_FACTOR <= 0
) {
  throw new Error("PAYSTACK_MINOR_UNIT_FACTOR must be a positive number");
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

const toPaystackAmountFromMajor = (amount) => {
  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return Math.round(amountNumber * PAYSTACK_MINOR_UNIT_FACTOR);
};

const fromPaystackAmountToMajor = (paystackAmount) => {
  const amountNumber = Number(paystackAmount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    throw new Error("Invalid Paystack amount");
  }
  return amountNumber / PAYSTACK_MINOR_UNIT_FACTOR;
};

const normalizePlan = (plan) => {
  if (!plan || typeof plan !== "string") return null;
  const normalized = plan.trim().toLowerCase();
  if (normalized === "silver") return "Silver";
  if (normalized === "gold") return "Gold";
  return null;
};

exports.initializeSubscription = async (req, res) => {
  try {
    const { amount, plan } = req.body;

    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Allowed values are Silver or Gold.",
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    let paystackAmount;
    try {
      paystackAmount = toPaystackAmountFromMajor(amount);
    } catch (conversionErr) {
      console.error("initializeSubscription amount error:", conversionErr);
      return res.status(400).json({
        success: false,
        message: conversionErr.message,
      });
    }

    if (PAYSTACK_BYPASS) {
      const reference = `sub-dev-${randomUUID()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subscription = await Subscription.create({
        public_user_id: req.publicUserId,
        plan: normalizedPlan,
        amount,
        currency: PAYSTACK_CURRENCY,
        reference,
        status: "active",
        starts_at: now,
        expires_at: expiresAt,
      });

      return res.status(200).json({
        success: true,
        bypassed: true,
        authorization_url: null,
        reference,
        currency: PAYSTACK_CURRENCY,
        subscription,
      });
    }

    const email =
      req.body.email || req.user?.email || req.publicUserEmail || undefined;

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: buildAuthHeader(),
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: PAYSTACK_CURRENCY,
          metadata: {
            userId: req.publicUserId,
            type: "subscription",
            plan: normalizedPlan,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.status) {
      console.error("initializeSubscription response error:", data);
      return res.status(400).json({
        success: false,
        message: data?.message || "Paystack error",
      });
    }

    const reference = data.data.reference;

    await Subscription.create({
      public_user_id: req.publicUserId,
      plan: normalizedPlan,
      amount,
      currency: PAYSTACK_CURRENCY,
      reference,
      status: "pending",
      starts_at: null,
      expires_at: null,
    });

    return res.status(200).json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference,
      paystack_amount: data.data.amount,
      currency: data.data.currency,
      access_code: data.data.access_code,
    });
  } catch (err) {
    console.error("initializeSubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription initialization failed",
    });
  }
};

exports.verifySubscription = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Reference required" });
    }

    if (PAYSTACK_BYPASS) {
      const subscription = await Subscription.findOne({ where: { reference } });
      if (!subscription) {
        return res.status(404).json({
          success: false,
          bypassed: true,
          message: "No subscription found for reference in bypass mode",
        });
      }
      return res.status(200).json({
        success: true,
        bypassed: true,
        message: "Paystack bypass active; verification skipped",
        data: subscription,
      });
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
      console.error("verifySubscription unsuccessful response:", data);
      return res
        .status(400)
        .json({ success: false, message: "Payment not successful" });
    }

    const paystackAmount = data.data.amount;
    let majorAmount;
    try {
      majorAmount = fromPaystackAmountToMajor(paystackAmount);
    } catch (conversionErr) {
      console.error(
        "verifySubscription conversion error:",
        conversionErr,
        data.data
      );
      return res.status(500).json({
        success: false,
        message: "Failed to convert payment amount",
      });
    }

    const metadata = data.data.metadata || {};
    const userId = req.publicUserId || metadata.userId;

    if (!userId) {
      console.error(
        "verifySubscription missing userId for reference",
        reference,
        metadata
      );
      return res.status(400).json({
        success: false,
        message: "Unable to determine user for this subscription",
      });
    }

    let subscription = await Subscription.findOne({ where: { reference } });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (!subscription) {
      const normalizedPlan = normalizePlan(metadata.plan);
      if (!normalizedPlan) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription plan in metadata",
        });
      }

      subscription = await Subscription.create({
        public_user_id: userId,
        plan: normalizedPlan,
        amount: majorAmount,
        currency: data.data.currency || PAYSTACK_CURRENCY,
        reference,
        status: "active",
        starts_at: now,
        expires_at: expiresAt,
      });
    } else if (subscription.status !== "active") {
      await subscription.update({
        status: "active",
        amount: majorAmount,
        currency: data.data.currency || PAYSTACK_CURRENCY,
        starts_at: now,
        expires_at: expiresAt,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subscription payment successful",
      data: subscription,
    });
  } catch (err) {
    console.error("verifySubscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Subscription verification failed",
    });
  }
};
