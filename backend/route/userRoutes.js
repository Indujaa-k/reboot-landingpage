const express = require("express");
const User = require("../model/userModel");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (for admin dashboard)
// @access  Private (admin only)
router.get("/", protect, async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/:id
// @desc    Get single user by id
// @access  Private (admin only)
router.get("/:id", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
