// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     // Personal Information
//     name: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     age: {
//       type: Number,
//       required: true,
//     },

//     gender: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     preferredDate: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     // How the user found you
//     source: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     // Location
//     location: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     // Contact Information
//     email: {
//       type: String,
//       required: true,
//       trim: true,
//       lowercase: true,
//     },

//     phone: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     // Razorpay Payment Information
//     payment: {
//       razorpayOrderId: {
//         type: String,
//         default: null,
//       },

//       razorpayPaymentId: {
//         type: String,
//         default: null,
//       },

//       razorpaySignature: {
//         type: String,
//         default: null,
//       },

//       amount: {
//         type: Number,
//         default: 0,
//       },

//       currency: {
//         type: String,
//         default: "INR",
//       },

//       status: {
//         type: String,
//         enum: ["pending", "paid", "failed"],
//         default: "pending",
//       },

//       paidAt: {
//         type: String,
//         default: null,
//       },
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("User", userSchema);