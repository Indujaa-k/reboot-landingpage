const express = require("express");
const ExcelJS = require("exceljs");
const Registration = require("../model/Registration");
const { protect } = require("../middleware/authMiddleware");
const { CAMP_SLOTS, getSlotCapacity } = require("../config/slots");
const { CAMP_DATE_LABELS } = require("../controller/registrationController");

const router = express.Router();

// Age bucket boundaries used by the /analytics endpoint. Kept here so the
// route and any future consumer stay in sync.
const AGE_BOUNDARIES = [0, 18, 25, 35, 45, 60, 150];
const AGE_GROUP_LABELS = {
  0: "Under 18",
  18: "18-24",
  25: "25-34",
  35: "35-44",
  45: "45-59",
  60: "60+",
};

// Builds a Mongo filter object from shared query params used by the list
// endpoint, the export endpoint, and now the per-slot registrant lookup
// (preferredDate + preferredTime), so all three stay consistent.
const buildFilter = (query) => {
  const {
    search,
    status,
    source,
    gender,
    from,
    to,
    preferredDate,
    preferredTime,
  } = query;
  const filter = {};

  if (status) filter.paymentStatus = status;
  if (source) filter.source = source;
  if (gender) filter.gender = gender;
  if (preferredDate) filter.preferredDate = preferredDate;
  if (preferredTime) filter.preferredTime = preferredTime;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (search) {
    const re = new RegExp(search, "i");
    filter.$or = [
      { name: re },
      { phone: re },
      { referenceNumber: re },
      { razorpayOrderId: re },
      { razorpayPaymentId: re },
    ];
  }

  return filter;
};

// @route   GET /api/registrations
// @desc    List registrations (transaction history) with filters + pagination
//          Also used to fetch "who's in this slot" via preferredDate/preferredTime.
// @access  Private
router.get("/", protect, async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const [items, total] = await Promise.all([
      Registration.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Registration.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/registrations/analytics
// @desc    Aggregated stats for dashboard cards + charts
// @access  Private
router.get("/analytics", protect, async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);

    const [summary] = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRegistrations: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$amount", 0],
            },
          },
          averageAmount: { $avg: "$amount" },
        },
      },
    ]);

    const byStatus = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
    ]);

    const bySource = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Gender breakdown
    const byGender = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $ifNull: ["$gender", "not_specified"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Age group breakdown
    const byAgeGroupRaw = await Registration.aggregate([
      { $match: filter },
      {
        $bucket: {
          groupBy: "$age",
          boundaries: AGE_BOUNDARIES,
          default: "unknown",
          output: { count: { $sum: 1 } },
        },
      },
    ]);
    const byAgeGroup = byAgeGroupRaw.map((b) => ({
      _id: b._id,
      label: AGE_GROUP_LABELS[b._id] || "Unknown",
      count: b.count,
    }));

    // Revenue trend for the last 30 days (paid transactions only)
    const byDate = await Registration.aggregate([
      {
        $match: {
          ...filter,
          paymentStatus: "paid",
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Daily enrollment (registration) trend, regardless of payment status.
    // Respects the admin's own date filter when set, otherwise defaults to
    // the last 90 days so the chart doesn't try to render the whole table.
    const enrollmentMatch = { ...filter };
    if (!enrollmentMatch.createdAt) {
      enrollmentMatch.createdAt = {
        $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      };
    }
    const enrollmentsByDate = await Registration.aggregate([
      { $match: enrollmentMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalRegistrations: summary?.totalRegistrations || 0,
      totalRevenue: summary?.totalRevenue || 0,
      averageAmount: summary?.averageAmount || 0,
      byStatus,
      bySource,
      byGender,
      byAgeGroup,
      byDate,
      enrollmentsByDate,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/registrations/slots
// @desc    Seats taken/available per camp date + time slot (paid seats only).
//          Capacity is per-date: 24/slot on 4th Sept, 28/slot on 5th & 6th.
// @access  Private
router.get("/slots", protect, async (req, res, next) => {
  try {
    const dates = Object.keys(CAMP_DATE_LABELS);

    const counts = await Registration.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          preferredDate: { $in: dates },
        },
      },
      {
        $group: {
          _id: { date: "$preferredDate", time: "$preferredTime" },
          taken: { $sum: 1 },
        },
      },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[`${c._id.date}|${c._id.time}`] = c.taken;
    });

    const slotsByDate = dates.map((date) => {
      const capacity = getSlotCapacity(date);

      const slots = CAMP_SLOTS.map((time) => {
        const taken = countMap[`${date}|${time}`] || 0;
        return {
          time,
          taken,
          capacity,
          available: Math.max(capacity - taken, 0),
          full: taken >= capacity,
          fillPercent: Math.min(
            100,
            Math.round((taken / (capacity || 1)) * 100),
          ),
        };
      });

      const totalTaken = slots.reduce((sum, s) => sum + s.taken, 0);
      const totalCapacity = slots.length * capacity;

      return {
        date,
        label: CAMP_DATE_LABELS[date] || date,
        slots,
        totalTaken,
        totalCapacity,
        totalAvailable: Math.max(totalCapacity - totalTaken, 0),
        totalFillPercent: Math.min(
          100,
          Math.round((totalTaken / (totalCapacity || 1)) * 100),
        ),
      };
    });

    res.json({ slotsByDate });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/registrations/export
// @desc    Export the (optionally filtered) registrations as an .xlsx file
// @access  Private
router.get("/export", protect, async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    const registrations = await Registration.find(filter).sort({
      createdAt: -1,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Admin Console";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Transactions");

    sheet.columns = [
      { header: "Reference No.", key: "referenceNumber", width: 22 },
      { header: "Name", key: "name", width: 24 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Age", key: "age", width: 8 },
      { header: "Gender", key: "gender", width: 14 },
      { header: "Preferred Date", key: "preferredDate", width: 16 },
      { header: "Preferred Time", key: "preferredTime", width: 16 },
      { header: "Reason", key: "reason", width: 24 },
      { header: "Source", key: "source", width: 16 },
      { header: "Amount (INR)", key: "amount", width: 14 },
      { header: "Payment Status", key: "paymentStatus", width: 16 },
      { header: "Razorpay Order ID", key: "razorpayOrderId", width: 26 },
      { header: "Razorpay Payment ID", key: "razorpayPaymentId", width: 26 },
      { header: "Created At", key: "createdAt", width: 22 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8ECEF" },
    };

    registrations.forEach((r) => {
      sheet.addRow({
        referenceNumber: r.referenceNumber,
        name: r.name,
        phone: r.phone,
        age: r.age,
        gender: r.gender || "not_specified",
        preferredDate: r.preferredDate,
        preferredTime: r.preferredTime,
        reason: r.reason,
        source: r.source,
        amount: r.amount,
        paymentStatus: r.paymentStatus,
        razorpayOrderId: r.razorpayOrderId,
        razorpayPaymentId: r.razorpayPaymentId,
        createdAt: r.createdAt.toISOString(),
      });
    });

    sheet.getColumn("amount").numFmt = "₹#,##0.00";

    // Summary sheet
    const summarySheet = workbook.addWorksheet("Summary");
    const totalPaid = registrations
      .filter((r) => r.paymentStatus === "paid")
      .reduce((sum, r) => sum + r.amount, 0);

    summarySheet.addRows([
      ["Total registrations", registrations.length],
      ["Total paid revenue (INR)", totalPaid],
      ["Paid", registrations.filter((r) => r.paymentStatus === "paid").length],
      [
        "Failed",
        registrations.filter((r) => r.paymentStatus === "failed").length,
      ],
      [
        "Refunded",
        registrations.filter((r) => r.paymentStatus === "refunded").length,
      ],
      ["Exported at", new Date().toISOString()],
    ]);
    summarySheet.getColumn(1).width = 26;
    summarySheet.getColumn(2).width = 20;

    // Build the file as a buffer instead of streaming straight to `res`.
    // workbook.xlsx.write(res) ends the response stream itself, and a
    // follow-up res.end() can throw and break the connection mid-flight —
    // that shows up in the browser as a blocked/CORS-looking failure
    // rather than a clean error. Buffering avoids that entirely.
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="transactions-${Date.now()}.xlsx"`,
    );
    res.setHeader("Content-Length", buffer.length);

    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
});
module.exports = router;
