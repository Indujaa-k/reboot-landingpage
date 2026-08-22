const Registration = require("../model/Registration");
const Counter = require("../model/Counter");
const { CAMP_FEE_RUPEES } = require("./paymentController");
const { sendConfirmationEmail } = require("../utils/mailer");
const { CAMP_SLOTS, getSlotCapacity } = require("../config/slots");

const CAMP_DATE_LABELS = {
  "2026-09-04": "4th Sept 2026",
  "2026-09-05": "5th Sept 2026",
  "2026-09-06": "6th Sept 2026",
};

/* -------------------------------------------------------------------------
   Reference numbers: RMC-26001, RMC-26002, ...
------------------------------------------------------------------------- */
async function generateReferenceNumber() {
  const yearShort = new Date().getFullYear().toString().slice(-2);
  const counterId = `rmc_${yearShort}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
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

// Capacity is now date-dependent (24 on 4th Sept, 28 on 5th/6th), so this
// looks up the right number for the date being checked instead of using a
// single flat constant.
async function isSlotFull(preferredDate, preferredTime) {
  const taken = await getSlotSeatsTaken(preferredDate, preferredTime);
  return taken >= getSlotCapacity(preferredDate);
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

    const capacity = getSlotCapacity(date);

    const slots = await Promise.all(
      CAMP_SLOTS.map(async (time) => {
        const taken = await getSlotSeatsTaken(date, time);
        return {
          time,
          capacity,
          taken,
          available: Math.max(capacity - taken, 0),
          full: taken >= capacity,
        };
      }),
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
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "Missing payment reference." });
    }
    if (!CAMP_SLOTS.includes(preferredTime)) {
      return res.status(400).json({ error: "Invalid time slot." });
    }

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
exports.CAMP_DATE_LABELS = CAMP_DATE_LABELS;
