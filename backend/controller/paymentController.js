/* =========================================================================
   controllers/payment.controller.js
   Business logic for Razorpay order creation + signature verification.
   Routes just call these — no logic lives in routes/payment.routes.js.
   ========================================================================= */

const crypto = require("crypto");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Registration fee in rupees, decided server-side. Keep the frontend
// display value in sync, but this is what actually gets charged.
const CAMP_FEE_RUPEES = 499;

/* -------------------------------------------------------------------------
   POST /api/payment/create-order
   Body: { registration: { name, phone, ... } }
------------------------------------------------------------------------- */
exports.createOrder = async (req, res) => {
  try {
    const amountInPaise = CAMP_FEE_RUPEES * 100;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: "camp_reg_" + Date.now(),
      notes: {
        name: req.body?.registration?.name || "",
        phone: req.body?.registration?.phone || "",
      },
    });

    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    res.status(500).json({ error: "Could not create payment order." });
  }
};

/* -------------------------------------------------------------------------
   POST /api/payment/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
------------------------------------------------------------------------- */
exports.verifyPayment = (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: "Missing payment fields." });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const isValid = expectedSignature === razorpay_signature;

  if (!isValid) {
    return res.status(400).json({ success: false, error: "Payment verification failed." });
  }

  res.json({ success: true });
};

exports.CAMP_FEE_RUPEES = CAMP_FEE_RUPEES;

exports.getKey = (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
};