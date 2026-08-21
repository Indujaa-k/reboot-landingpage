/* =========================================================================
   routes/payment.routes.js
   Routing only — all logic lives in controllers/payment.controller.js
   ========================================================================= */

const express = require("express");
const router = express.Router();
const paymentController = require("../controller/paymentController");

router.post("/create-order", paymentController.createOrder);
router.post("/verify", paymentController.verifyPayment);

router.get("/key", paymentController.getKey);

module.exports = router;