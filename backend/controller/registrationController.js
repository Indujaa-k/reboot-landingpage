/* =========================================================================
   controllers/registration.controller.js
   Saves a registration AFTER payment.controller.verifyPayment has already
   confirmed the signature. Called by the frontend right after verification
   succeeds, with the form data + Razorpay payment/order IDs.
   ========================================================================= */

const Registration = require("../model/Registration");
const { CAMP_FEE_RUPEES } = require("./paymentController");

function generateReferenceNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RMHC-${stamp}-${rand}`;
}

/* -------------------------------------------------------------------------
   POST /api/registrations
------------------------------------------------------------------------- */
exports.createRegistration = async (req, res) => {
  try {
    const {
      name,
      phone,
      age,
      preferredDate,
      preferredTime,
      reason,
      source,
      paymentId,
      orderId,
    } = req.body;

    if (!name || !phone || !age || !preferredDate || !preferredTime || !reason || !source) {
      return res.status(400).json({ error: "Missing required registration fields." });
    }
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "Missing payment reference." });
    }

    const referenceNumber = generateReferenceNumber();

    const registration = await Registration.create({
      referenceNumber,
      name,
      phone,
      age,
      preferredDate,
      preferredTime,
      reason,
      source,
      amount: CAMP_FEE_RUPEES,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      paymentStatus: "paid",
    });

    // TODO: trigger SMS/WhatsApp/email confirmation here if wired up
    // (e.g. Twilio, MSG91, Nodemailer).

    res.status(201).json({
      success: true,
      referenceNumber: registration.referenceNumber,
    });
  } catch (err) {
    console.error("Saving registration failed:", err);
    res.status(500).json({ error: "Could not save registration." });
  }
};

/* -------------------------------------------------------------------------
   GET /api/registrations/:referenceNumber  (optional lookup helper)
------------------------------------------------------------------------- */
exports.getRegistrationByReference = async (req, res) => {
  try {
    const registration = await Registration.findOne({
      referenceNumber: req.params.referenceNumber,
    });
    if (!registration) {
      return res.status(404).json({ error: "Registration not found." });
    }
    res.json(registration);
  } catch (err) {
    console.error("Fetching registration failed:", err);
    res.status(500).json({ error: "Could not fetch registration." });
  }
};