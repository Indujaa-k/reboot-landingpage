const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../model/adminModel');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

// @route   POST /api/auth/login
// @desc    Authenticate admin using username + password, return JWT
// @access  Public
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username });

    if (admin && (await admin.matchPassword(password))) {
      return res.json({
        _id: admin._id,
        username: admin.username,
        token: generateToken(admin._id),
      });
    }

    return res.status(401).json({ message: 'Invalid username or password' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
