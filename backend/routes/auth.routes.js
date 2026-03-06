const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Admin login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (admin && (await admin.matchPassword(password))) {
    res.json({
      _id: admin._id,
      username: admin.username,
      token: generateToken(admin._id)
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Create admin (optional, for first-time setup)
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) {return res.status(400).json({ message: 'Admin exists' });}

  const admin = await Admin.create({ username, password });
  if (admin) {
    res.status(201).json({ message: 'Admin created' });
  } else {
    res.status(400).json({ message: 'Invalid admin data' });
  }
});

module.exports = router;
