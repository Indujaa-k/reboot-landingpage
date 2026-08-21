
const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    referenceNumber: { type: String, required: true, unique: true },

    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    preferredDate: { type: String, required: true },
    preferredTime: { type: String, required: true },
    reason: { type: String, required: true },
    source: { type: String, required: true },

    amount: { type: Number, required: true }, // in rupees
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ["paid", "failed", "refunded"],
      default: "paid",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Registration", registrationSchema);