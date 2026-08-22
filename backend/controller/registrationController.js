/* =========================================================================
   controllers/registration.controller.js
   Saves a registration AFTER payment.controller.verifyPayment has already
   confirmed the signature. Called by the frontend right after verification
   succeeds, with the form data + Razorpay payment/order IDs. Also sends a
   confirmation email via Nodemailer.

   Capacity: each (preferredDate, preferredTime) combo is capped at
   SLOT_CAPACITY paid registrations. Checked here as a final safety net —
   the primary gate should be in payment.controller before an order is
   created (see note at the bottom of this file).

   Reference numbers: RMC-26001, RMC-26002, ... — atomically incremented
   via the Counter model so concurrent registrations never collide.
   ========================================================================= */

const Registration = require("../model/Registration");
const Counter = require("../model/Counter");
const { CAMP_FEE_RUPEES } = require("./paymentController");
const { sendConfirmationEmail } = require("../utils/mailer");
const { CAMP_SLOTS, SLOT_CAPACITY } = require("../config/slots");

const CAMP_DATE_LABELS = {
  "2026-09-04": "4th Sept 2026",
  "2026-09-05": "5th Sept 2026",
  "2026-09-06": "6th Sept 2026",
};

/* -------------------------------------------------------------------------
   Reference numbers: RMC-26001, RMC-26002, ...
   "26" = 2-digit year, "001" = sequential counter for that year,
   atomically incremented so concurrent registrations never collide.
------------------------------------------------------------------------- */
async function generateReferenceNumber() {
  const yearShort = new Date().getFullYear().toString().slice(-2);
  const counterId = `rmc_${yearShort}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seqPadded = String(counter.seq).padStart(3, "0");
  return `RMC-${yearShort}${seqPadded}`;
}

/* -------------------------------------------------------------------------
   Shared helper: how many paid seats are taken for a given date+time.
   Exported so paymentController can call it before creating an order.
------------------------------------------------------------------------- */
async function getSlotSeatsTaken(preferredDate, preferredTime) {
  return Registration.countDocuments({
    preferredDate,
    preferredTime,
    paymentStatus: "paid",
  });
}
exports.getSlotSeatsTaken = getSlotSeatsTaken;

async function isSlotFull(preferredDate, preferredTime) {
  const taken = await getSlotSeatsTaken(preferredDate, preferredTime);
  return taken >= SLOT_CAPACITY;
}
exports.isSlotFull = isSlotFull;

/* -------------------------------------------------------------------------
   GET /api/registrations/availability?date=2026-09-04
   Returns seat counts for every slot on a given date, so the frontend
   can disable full slots in the dropdown before the user even picks one.
------------------------------------------------------------------------- */
exports.getSlotAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Missing date query param." });
    }

    const slots = await Promise.all(
      CAMP_SLOTS.map(async (time) => {
        const taken = await getSlotSeatsTaken(date, time);
        return {
          time,
          capacity: SLOT_CAPACITY,
          taken,
          available: Math.max(SLOT_CAPACITY - taken, 0),
          full: taken >= SLOT_CAPACITY,
        };
      })
    );

    res.json({ date, slots });
  } catch (err) {
    console.error("Fetching slot availability failed:", err);
    res.status(500).json({ error: "Could not fetch slot availability." });
  }
};

/* -------------------------------------------------------------------------
   POST /api/registrations
------------------------------------------------------------------------- */
exports.createRegistration = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      age,
      preferredDate,
      preferredTime,
      reason,
      source,
      paymentId,
      orderId,
    } = req.body;

    if (!name || !phone || !email || !age || !preferredDate || !preferredTime || !reason || !source) {
      return res.status(400).json({ error: "Missing required registration fields." });
    }
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "Missing payment reference." });
    }
    if (!CAMP_SLOTS.includes(preferredTime)) {
      return res.status(400).json({ error: "Invalid time slot." });
    }

    // Final safety-net check. In the normal flow, payment.controller's
    // create-order step already blocks full slots before charging anyone —
    // this only fires in the rare race where the last seat filled between
    // order creation and this save. Payment has already succeeded at this
    // point, so this needs a manual refund on your end (Razorpay dashboard
    // or refund API) since we don't auto-refund here.
    const full = await isSlotFull(preferredDate, preferredTime);
    if (full) {
      return res.status(409).json({
        error:
          "This slot just filled up. Your payment was received — please contact us with your payment ID so we can move you to another slot or refund you.",
      });
    }

    const referenceNumber = await generateReferenceNumber();

    const registration = await Registration.create({
      referenceNumber,
      name,
      phone,
      email,
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

    // Fire-and-log: don't fail the API response if the email hiccups —
    // the registration itself is already saved and paid for.
    sendConfirmationEmail({
      to: email,
      name,
      referenceNumber,
      campDateLabel: CAMP_DATE_LABELS[preferredDate] || preferredDate,
      preferredTime,
    }).catch((err) => {
      console.error("Confirmation email failed to send:", err);
    });

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