/* =========================================================================
   routes/registration.routes.js
   Routing only — all logic lives in controllers/registration.controller.js
   ========================================================================= */

const express = require("express");
const router = express.Router();
const registrationController = require("../controllers/registration.controller");

router.post("/", registrationController.createRegistration);
router.get("/:referenceNumber", registrationController.getRegistrationByReference);

module.exports = router;