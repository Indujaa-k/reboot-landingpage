/* =========================================================================
   config/slots.js
   Single source of truth for camp time slots + per-slot capacity.
   Import this anywhere you need to validate or list slots, so the
   registration controller and payment controller never drift apart.
   ========================================================================= */

const CAMP_SLOTS = [
  "10:00 AM - 11:30 AM",
  "10:45 AM - 11:15 AM",
  "1:45 PM - 3:15 PM",
  "3:00 PM - 5:00 PM",
  "5:00 PM - 6:30 PM",
];

const SLOT_CAPACITY = 24; // seats per slot, per day

module.exports = { CAMP_SLOTS, SLOT_CAPACITY };