const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');

// ---------------- LOGIN ----------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) 
      {return res.status(400).json({ success: false, message: 'Email and password required' });}

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) 
      {return res.status(401).json({ success: false, message: 'Invalid email or password' });}
    if (!admin.isActive) 
      {return res.status(403).json({ success: false, message: 'Account deactivated' });}

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) 
      {return res.status(401).json({ success: false, message: 'Invalid email or password' });}

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2hours' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: admin._id, email: admin.email, role: admin.role }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ---------------- JWT AUTH ----------------
const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) 
    {return res.status(401).json({ success: false, message: 'No token provided' });}

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// ---------------- PROFILE ----------------
router.get('/profile', requireAdminAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    if (!admin) {return res.status(404).json({ success: false, message: 'Admin not found' });}
    res.json({ success: true, admin });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

// ---------------- FORGOT PASSWORD ----------------
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {return res.status(400).json({ success: false, message: 'Email is required' });}

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {return res.status(404).json({ success: false, message: 'Admin not found' });}

    // Generate token
    const token = crypto.randomBytes(20).toString('hex');
    admin.resetPasswordToken = token;
    admin.resetPasswordExpires = Date.now() + 3600 * 1000; // 1 hour
    await admin.save();

    const resetURL = `${process.env.CLIENT_URL}/reset-password.html?token=${token}`;

    // Nodemailer transporter
    let transporter;
    if (process.env.NODE_ENV === 'production') {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
    } else {
      // Local dev with Ethereal
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
    }

    const mailInfo = await transporter.sendMail({
      from: `"Nortek Admin" <${process.env.EMAIL_USER || 'test@example.com'}>`,
      to: admin.email,
      subject: 'Reset Your Password',
      html: `<p>Hello,</p>
             <p>Click the link below to reset your password:</p>
             <a href="${resetURL}">${resetURL}</a>
             <p>This link will expire in 1 hour.</p>`
    });

    // Log for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(mailInfo));
      console.log('Reset Link:', resetURL);
    } else {
      console.log(' Reset email sent. Message ID:', mailInfo.messageId);
      console.log('Reset Link:', resetURL);
    }

    res.json({ success: true, message: 'Reset link sent to your email' });

  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Server error sending reset link' });
  }
});

// ---------------- RESET PASSWORD ----------------
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {return res.status(400).json({ success: false, message: 'Token and password required' });}

    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!admin) {return res.status(400).json({ success: false, message: 'Invalid or expired token' });}

    admin.password = await bcrypt.hash(password, 10);
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    res.json({ success: true, message: 'Password reset successfully' });

  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
