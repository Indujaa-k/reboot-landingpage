/* =========================================================================
   config/slots.js
   Single source of truth for camp time slots + per-slot, per-date capacity.
   Import this anywhere you need to validate or list slots, so the
   registration controller, payment controller, and admin routes never
   drift apart.
   ========================================================================= */

const CAMP_SLOTS = [
  "10:00 AM - 11:30 AM",
  "10:45 AM - 11:15 AM",
  "1:45 PM - 3:15 PM",
  "3:00 PM - 5:00 PM",
  "5:00 PM - 6:30 PM",
];

// Seats per slot, per camp date. 4th Sept runs at a smaller capacity than
// the 5th/6th.
const SLOT_CAPACITY_BY_DATE = {
  "2026-09-04": 24,
  "2026-09-05": 28,
  "2026-09-06": 28,
};

// Fallback used only if a date somehow isn't in the map above.
const DEFAULT_SLOT_CAPACITY = 28;

// Single lookup used everywhere instead of a flat SLOT_CAPACITY constant.
function getSlotCapacity(date) {
  return SLOT_CAPACITY_BY_DATE[date] ?? DEFAULT_SLOT_CAPACITY;
}

module.exports = {
  CAMP_SLOTS,
  SLOT_CAPACITY_BY_DATE,
  DEFAULT_SLOT_CAPACITY,
  getSlotCapacity,
};
