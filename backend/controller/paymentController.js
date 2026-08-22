/* =========================================================================
   controllers/paymentController.js
   Handles the Razorpay order lifecycle for camp registrations:
     1. GET  /api/payment/key           -> hand the public key to the frontend
     2. POST /api/payment/create-order  -> validate slot capacity, create order
     3. POST /api/payment/verify        -> verify the payment signature

   Env vars required:
     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

   Registration is only saved to the DB in registration.controller.js,
   AFTER verify succeeds — this file never writes a Registration document.
   ========================================================================= */

const Razorpay = require("razorpay");
const crypto = require("crypto");
const { CAMP_SLOTS, getSlotCapacity } = require("../config/slots");

const CAMP_FEE_RUPEES = 699;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* -------------------------------------------------------------------------
   GET /api/payment/key
   Frontend needs the public key_id to initialize the Razorpay checkout.
------------------------------------------------------------------------- */
exports.getKey = (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res
      .status(500)
      .json({ error: "Payment gateway is not configured." });
  }
  res.json({ key: process.env.RAZORPAY_KEY_ID });
};

/* -------------------------------------------------------------------------
   POST /api/payment/create-order
   Body: { registration: { name, phone, email, age, preferredDate,
                            preferredTime, reason, source } }

   Validates the slot before charging anyone. This is the primary gate —
   registration.controller.js has a second, race-condition-only check
   right before saving, but THIS is what stops someone from being charged
   for a slot that's already full.
------------------------------------------------------------------------- */
exports.createOrder = async (req, res) => {
  try {
    const { registration } = req.body;

    if (!registration) {
      return res.status(400).json({ error: "Missing registration details." });
    }

    const {
      name,
      phone,
      email,
      age,
      preferredDate,
      preferredTime,
      reason,
      source,
    } = registration;

    if (
      !name ||
      !phone ||
      !email ||
      !age ||
      !preferredDate ||
      !preferredTime ||
      !reason ||
      !source
    ) {
      return res
        .status(400)
        .json({ error: "Missing required registration fields." });
    }

    if (!CAMP_SLOTS.includes(preferredTime)) {
      return res.status(400).json({ error: "Invalid time slot." });
    }

    // Lazy require to avoid a circular import at module-load time
    // (registration.controller.js also requires this file for CAMP_FEE_RUPEES).
    const { isSlotFull } = require("./registrationController");

    const full = await isSlotFull(preferredDate, preferredTime);
    if (full) {
      // Capacity is per-date (24 on 4th Sept, 28 on 5th/6th), so look up
      // the right number for this specific date rather than a flat constant.
      const capacity = getSlotCapacity(preferredDate);
      return res.status(409).json({
        error: `Sorry, that slot is fully booked (max ${capacity} per slot). Please choose a different time.`,
      });
    }

    const amountPaise = CAMP_FEE_RUPEES * 100;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `rmhc_${Date.now()}`,
      notes: {
        name,
        phone,
        email,
        preferredDate,
        preferredTime,
      },
    });

    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error("Creating Razorpay order failed:", err);
    res
      .status(500)
      .json({ error: "Could not start payment. Please try again." });
  }
};

/* -------------------------------------------------------------------------
   POST /api/payment/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }

   Verifies the HMAC signature Razorpay sends back after checkout completes.
   Does NOT save a Registration — that happens in registration.controller.js
   right after the frontend gets { success: true } from here.
------------------------------------------------------------------------- */
exports.verifyPayment = (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json({ error: "Missing payment verification fields." });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      return res
        .status(400)
        .json({ success: false, error: "Payment signature mismatch." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Verifying payment failed:", err);
    res
      .status(500)
      .json({ success: false, error: "Could not verify payment." });
  }
};

exports.CAMP_FEE_RUPEES = CAMP_FEE_RUPEES;
