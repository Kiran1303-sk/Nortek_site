const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
// Render/other reverse proxies set X-Forwarded-For. Required for express-rate-limit.
app.set('trust proxy', 1);
const ADMIN_ROLES = ['super_admin', 'admin', 'recruiter', 'user'];

// ================= CONFIG =================
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nortek';
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '30m';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5500';
const CORS_ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS
  || `${CLIENT_URL},http://localhost:5000,http://localhost:5500,http://127.0.0.1:5500`
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CONTACT_RECEIVER_EMAIL = process.env.CONTACT_RECEIVER_EMAIL || process.env.EMAIL_USER;
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_CSP_REPORT_ONLY = process.env.ENABLE_CSP_REPORT_ONLY
  ? process.env.ENABLE_CSP_REPORT_ONLY === 'true'
  : IS_PRODUCTION;
const LOG_CSP_REPORTS = process.env.LOG_CSP_REPORTS === 'true';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const signToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '30min') =>
  jwt.sign(payload, JWT_SECRET, { expiresIn });

// ================= MIDDLEWARE =================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use((req, res, next) => {
  const cspReportOnly = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-hashes' 'nonce-${res.locals.cspNonce}' https://cdn.jsdelivr.net https://unpkg.com`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
    "img-src 'self' data: https:",
    "media-src 'self' data: https:",
    "connect-src 'self' http://localhost:5000 http://localhost:5500 http://127.0.0.1:5500",
    "frame-src 'self' https://www.google.com https://maps.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'report-uri /csp-report'
  ].join('; ');

  if (ENABLE_CSP_REPORT_ONLY) {
    res.setHeader('Content-Security-Policy-Report-Only', cspReportOnly);
  }
  next();
});

app.use(cors({
  origin(origin, cb) {
    if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' }
});

const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

// ================= MONGODB =================
mongoose.connect(MONGO_URI)
  .then(() => console.log(' MongoDB connected'))
  .catch(err => console.error(' MongoDB error:', err));

// ================= MODELS =================
const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ADMIN_ROLES, default: 'admin' },
  isActive: { type: Boolean, default: true },
  displayName: { type: String, default: '' },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date
}, { timestamps: true });
const Admin = mongoose.model('Admin', AdminSchema);

const CandidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'candidate' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });
const Candidate = mongoose.model('Candidate', CandidateSchema);

const CandidateOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['signup', 'forgot_password'], required: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });
CandidateOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
const CandidateOtp = mongoose.model('CandidateOtp', CandidateOtpSchema);

const AdminOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['forgot_password'], required: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });
AdminOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
const AdminOtp = mongoose.model('AdminOtp', AdminOtpSchema);

/* ===================================================
    UPGRADED APPLICATION MODEL (HR PROFESSIONAL)
=================================================== */
const ApplicationSchema = new mongoose.Schema({
  name: String,
  firstname: String,
  lastname: String,
  email: String,
  phone: String,
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
  jobCode: String,
  designation: String,
  cv: String,

  //  HR Management Fields
  status: {
    type: String,
    enum: ['New', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected'],
    default: 'New'
  },

  notes: {
    type: String,
    default: ''
  },

  rejectionReason: {
    type: String,
    default: ''
  },

  interviewDate: Date,

  isRead: {
    type: Boolean,
    default: false
  },

  readAt: {
    type: Date,
    default: null
  },

  appliedAt: { type: Date, default: Date.now }
});
const Application = mongoose.model('Application', ApplicationSchema);

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================= AUTH MIDDLEWARE =================
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {return res.status(401).json({ message: 'Unauthorized' });}

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));
const isStrongEnoughPassword = (password = '') => String(password).length >= PASSWORD_MIN_LENGTH;

const createCandidateOtpVerificationToken = (email, purpose) => signToken({
  type: 'candidate_otp_verified',
  email,
  purpose
}, '15m');

const verifyCandidateOtpVerificationToken = (token, expectedPurpose, expectedEmail) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = String(expectedEmail || '').toLowerCase().trim();
    return (
      decoded &&
      decoded.type === 'candidate_otp_verified' &&
      decoded.purpose === expectedPurpose &&
      String(decoded.email || '').toLowerCase().trim() === email
    );
  } catch {
    return false;
  }
};

const createAdminOtpVerificationToken = (email) => signToken({
  type: 'admin_otp_verified',
  email,
  purpose: 'forgot_password'
}, '15m');

const verifyAdminOtpVerificationToken = (token, expectedEmail) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = String(expectedEmail || '').toLowerCase().trim();
    return (
      decoded &&
      decoded.type === 'admin_otp_verified' &&
      decoded.purpose === 'forgot_password' &&
      String(decoded.email || '').toLowerCase().trim() === email
    );
  } catch {
    return false;
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  next();
};

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) =>
    cb(null, `${Date.now()  }-${  file.originalname.replace(/\s+/g, '-')}`)
});
const upload = multer({ storage });

// ================= STATIC =================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (_, res) => {
  res.json({ success: true, service: 'nortek-backend', message: 'API is running' });
});

app.get('/health', (_, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

app.post('/csp-report', express.json({
  type: ['application/csp-report', 'application/reports+json', 'application/json']
}), (req, res) => {
  if (LOG_CSP_REPORTS) {
    console.warn('CSP Report:', req.body);
  }
  res.status(204).end();
});

// ================= ADMIN ROUTES =================
const adminRouter = express.Router();

// --- Login ---
adminRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email: email?.toLowerCase() });
  if (!admin) {return res.status(400).json({ success: false, message: 'Invalid email or password' });}
  if (!admin.isActive) {return res.status(403).json({ success: false, message: 'Account deactivated' });}

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {return res.status(400).json({ success: false, message: 'Invalid email or password' });}

  admin.lastLogin = new Date();
  await admin.save();

  const token = signToken({ id: admin._id, email: admin.email, role: admin.role }, ADMIN_JWT_EXPIRES_IN);

  res.json({
    success: true,
    token,
    user: {
      id: admin._id,
      email: admin.email,
      role: admin.role,
      displayName: admin.displayName || ''
    }
  });
});

adminRouter.get('/profile', authMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id)
      .select('email displayName role isActive lastLogin createdAt updatedAt');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({
      success: true,
      user: {
        id: admin._id,
        email: admin.email,
        displayName: admin.displayName || '',
        role: admin.role,
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
      }
    });
  } catch (err) {
    console.error('Load admin profile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

adminRouter.put('/profile', authMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { email, displayName } = req.body;

    if (typeof email === 'undefined' && typeof displayName === 'undefined') {
      return res.status(400).json({ success: false, message: 'No profile fields provided' });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email || '').toLowerCase().trim();
      if (!normalizedEmail) {
        return res.status(400).json({ success: false, message: 'Email cannot be empty' });
      }

      const duplicate = await Admin.findOne({ email: normalizedEmail, _id: { $ne: admin._id } });
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
      admin.email = normalizedEmail;
    }

    if (typeof displayName !== 'undefined') {
      admin.displayName = String(displayName || '').trim();
    }

    await admin.save();

    const token = signToken({ id: admin._id, email: admin.email, role: admin.role }, ADMIN_JWT_EXPIRES_IN);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      token,
      user: {
        id: admin._id,
        email: admin.email,
        displayName: admin.displayName || '',
        role: admin.role,
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
      }
    });
  } catch (err) {
    console.error('Update admin profile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// --- Change Password (Admin / Recruiter) ---
adminRouter.put('/change-password', authMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ success: false, message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

adminRouter.get('/users', authMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
  try {
    const users = await Admin.find()
      .select('email role isActive displayName lastLogin createdAt updatedAt')
      .sort({ role: 1, email: 1 });

    res.json({ success: true, users });
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
});

adminRouter.post('/users', authMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
  try {
    const { email, password, role, displayName } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedRole = String(role || '').trim().toLowerCase();
    const requesterRole = req.user.role;

    if (!normalizedEmail || !password || !normalizedRole) {
      return res.status(400).json({ success: false, message: 'Email, password and role are required' });
    }

    if (!['admin', 'recruiter', 'user'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Role must be admin, recruiter or user' });
    }

    if (requesterRole === 'admin' && !['recruiter', 'user'].includes(normalizedRole)) {
      return res.status(403).json({ success: false, message: 'Admin can only create recruiter or user accounts' });
    }

    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const exists = await Admin.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Email is already in use' });
    }

    const user = await Admin.create({
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role: normalizedRole,
      displayName: String(displayName || '').trim(),
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        displayName: user.displayName || '',
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

adminRouter.put('/users/:id', authMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
  try {
    const { role, isActive, displayName, email } = req.body;
    const requesterRole = req.user.role;
    const updates = {};

    if (typeof role !== 'undefined') {
      if (requesterRole !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Only super admin can update role' });
      }
      const normalizedRole = String(role).trim().toLowerCase();
      if (!ADMIN_ROLES.includes(normalizedRole)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      updates.role = normalizedRole;
    }

    if (typeof isActive !== 'undefined') {
      updates.isActive = Boolean(isActive);
    }

    if (typeof displayName !== 'undefined') {
      updates.displayName = String(displayName || '').trim();
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email || '').toLowerCase().trim();
      if (!normalizedEmail) {
        return res.status(400).json({ success: false, message: 'Email cannot be empty' });
      }

      const duplicate = await Admin.findOne({ email: normalizedEmail, _id: { $ne: req.params.id } });
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
      updates.email = normalizedEmail;
    }

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (requesterRole === 'admin') {
      if (['super_admin', 'admin'].includes(user.role)) {
        return res.status(403).json({ success: false, message: 'Admin cannot edit admin or super admin accounts' });
      }
      if (typeof role !== 'undefined') {
        return res.status(403).json({ success: false, message: 'Admin cannot update role' });
      }
    }

    if (String(user._id) === String(req.user.id) && updates.role && updates.role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'Super admin cannot remove own super admin access' });
    }

    Object.assign(user, updates);
    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        displayName: user.displayName || '',
        lastLogin: user.lastLogin,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

adminRouter.delete('/users/:id', authMiddleware, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(user._id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'Super admin cannot delete own account' });
    }

    if (user.role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Super admin account cannot be deleted' });
    }

    await user.deleteOne();

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// --- Forgot Password OTP: Request ---
adminRouter.post('/forgot-password/request-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
    }

    const otp = createOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await AdminOtp.findOneAndUpdate(
      { email: normalizedEmail, purpose: 'forgot_password' },
      { otpHash, expiresAt, attempts: 0, verifiedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await transporter.sendMail({
      from: `"Nortek Admin" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: 'Your OTP for Admin Password Reset',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h3>Nortek Admin OTP Verification</h3>
          <p>Your OTP is:</p>
          <p style="font-size:24px;font-weight:700;letter-spacing:2px">${otp}</p>
          <p>This OTP is valid for 10 minutes.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Admin forgot password request OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// --- Forgot Password OTP: Verify ---
adminRouter.post('/forgot-password/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const otpEntry = await AdminOtp.findOne({ email: normalizedEmail, purpose: 'forgot_password' });
    if (!otpEntry) {
      return res.status(400).json({ success: false, message: 'OTP not requested or expired' });
    }

    if (otpEntry.expiresAt.getTime() < Date.now()) {
      await otpEntry.deleteOne();
      return res.status(400).json({ success: false, message: 'OTP expired. Request new OTP.' });
    }

    if (otpEntry.attempts >= 5) {
      await otpEntry.deleteOne();
      return res.status(429).json({ success: false, message: 'Too many attempts. Request new OTP.' });
    }

    const isValidOtp = await bcrypt.compare(String(otp).trim(), otpEntry.otpHash);
    if (!isValidOtp) {
      otpEntry.attempts += 1;
      await otpEntry.save();
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    otpEntry.verifiedAt = new Date();
    await otpEntry.save();

    const verificationToken = createAdminOtpVerificationToken(normalizedEmail);
    res.json({ success: true, message: 'OTP verified', verificationToken });
  } catch (err) {
    console.error('Admin forgot password verify OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

// --- Forgot Password OTP: Reset ---
adminRouter.post('/forgot-password/reset', authLimiter, async (req, res) => {
  try {
    const { email, newPassword, verificationToken } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail || !newPassword || !verificationToken) {
      return res.status(400).json({ success: false, message: 'Email, new password and verification token are required' });
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ success: false, message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const isVerified = verifyAdminOtpVerificationToken(verificationToken, normalizedEmail);
    if (!isVerified) {
      return res.status(401).json({ success: false, message: 'OTP verification required' });
    }

    const otpEntry = await AdminOtp.findOne({ email: normalizedEmail, purpose: 'forgot_password' });
    if (!otpEntry || !otpEntry.verifiedAt || otpEntry.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ success: false, message: 'OTP verification expired. Verify again.' });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    await AdminOtp.deleteOne({ _id: otpEntry._id });

    res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (err) {
    console.error('Admin forgot password reset OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

app.use('/admin', adminRouter);

// ================= CANDIDATE AUTH ROUTES =================
const candidateAuthRouter = express.Router();

candidateAuthRouter.post('/request-otp', otpLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail || !['signup', 'forgot_password'].includes(purpose)) {
      return res.status(400).json({ success: false, message: 'Valid email and purpose are required' });
    }

    const existingCandidate = await Candidate.findOne({ email: normalizedEmail });
    if (purpose === 'signup' && existingCandidate) {
      return res.status(409).json({ success: false, message: 'Account already exists. Please login.' });
    }
    if (purpose === 'forgot_password' && !existingCandidate) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const otp = createOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await CandidateOtp.findOneAndUpdate(
      { email: normalizedEmail, purpose },
      { otpHash, expiresAt, attempts: 0, verifiedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const purposeLabel = purpose === 'signup' ? 'signup verification' : 'password reset';
    await transporter.sendMail({
      from: `"Nortek Careers" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: `Your OTP for ${purposeLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h3>Nortek OTP Verification</h3>
          <p>Your one-time password (OTP) is:</p>
          <p style="font-size:24px;font-weight:700;letter-spacing:2px">${otp}</p>
          <p>This OTP is valid for 10 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Candidate request OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

candidateAuthRouter.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, purpose, otp } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail || !['signup', 'forgot_password'].includes(purpose) || !otp) {
      return res.status(400).json({ success: false, message: 'Valid email, purpose and OTP are required' });
    }

    const otpEntry = await CandidateOtp.findOne({ email: normalizedEmail, purpose });
    if (!otpEntry) {
      return res.status(400).json({ success: false, message: 'OTP not requested or expired' });
    }

    if (otpEntry.expiresAt.getTime() < Date.now()) {
      await otpEntry.deleteOne();
      return res.status(400).json({ success: false, message: 'OTP expired. Request a new OTP.' });
    }

    if (otpEntry.attempts >= 5) {
      await otpEntry.deleteOne();
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new OTP.' });
    }

    const isValidOtp = await bcrypt.compare(String(otp).trim(), otpEntry.otpHash);
    if (!isValidOtp) {
      otpEntry.attempts += 1;
      await otpEntry.save();
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    otpEntry.verifiedAt = new Date();
    await otpEntry.save();

    const verificationToken = createCandidateOtpVerificationToken(normalizedEmail, purpose);
    res.json({ success: true, message: 'OTP verified', verificationToken });
  } catch (err) {
    console.error('Candidate verify OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

candidateAuthRouter.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, verificationToken } = req.body;
    if (!name || !email || !password || !verificationToken) {
      return res.status(400).json({ success: false, message: 'Name, email, password and OTP verification are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpVerified = verifyCandidateOtpVerificationToken(verificationToken, 'signup', normalizedEmail);
    if (!otpVerified) {
      return res.status(401).json({ success: false, message: 'OTP verification required for signup' });
    }

    const otpEntry = await CandidateOtp.findOne({ email: normalizedEmail, purpose: 'signup' });
    if (!otpEntry || !otpEntry.verifiedAt || otpEntry.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ success: false, message: 'OTP verification expired. Please verify again.' });
    }

    const existing = await Candidate.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Candidate already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const candidate = await Candidate.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    const token = signToken({
      id: candidate._id,
      email: candidate.email,
      role: 'candidate'
    }, '7d');

    await CandidateOtp.deleteOne({ _id: otpEntry._id });

    res.status(201).json({
      success: true,
      token,
      user: { id: candidate._id, name: candidate.name, email: candidate.email, role: 'candidate' }
    });
  } catch (err) {
    console.error('Candidate register error:', err.message);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

candidateAuthRouter.post('/forgot-password/reset', authLimiter, async (req, res) => {
  try {
    const { email, newPassword, verificationToken } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail || !newPassword || !verificationToken) {
      return res.status(400).json({ success: false, message: 'Email, new password and OTP verification are required' });
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ success: false, message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const otpVerified = verifyCandidateOtpVerificationToken(verificationToken, 'forgot_password', normalizedEmail);
    if (!otpVerified) {
      return res.status(401).json({ success: false, message: 'OTP verification required for password reset' });
    }

    const otpEntry = await CandidateOtp.findOne({ email: normalizedEmail, purpose: 'forgot_password' });
    if (!otpEntry || !otpEntry.verifiedAt || otpEntry.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ success: false, message: 'OTP verification expired. Please verify again.' });
    }

    const candidate = await Candidate.findOne({ email: normalizedEmail });
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    candidate.password = await bcrypt.hash(newPassword, 10);
    await candidate.save();
    await CandidateOtp.deleteOne({ _id: otpEntry._id });

    res.json({ success: true, message: 'Password reset successful. Please login.' });
  } catch (err) {
    console.error('Candidate forgot password reset error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

candidateAuthRouter.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const candidate = await Candidate.findOne({ email: email.toLowerCase().trim() });
    if (!candidate || !candidate.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, candidate.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    candidate.lastLogin = new Date();
    await candidate.save();

    const token = signToken({
      id: candidate._id,
      email: candidate.email,
      role: 'candidate'
    }, '7d');

    res.json({
      success: true,
      token,
      user: { id: candidate._id, name: candidate.name, email: candidate.email, role: 'candidate' }
    });
  } catch (err) {
    console.error('Candidate login error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

candidateAuthRouter.get('/me', authMiddleware, authorizeRoles('candidate'), async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.user.id).select('-password');
    if (!candidate) {return res.status(404).json({ success: false, message: 'Candidate not found' });}
    res.json({ success: true, user: candidate });
  } catch (err) {
    console.error('Candidate profile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

app.use('/auth/candidate', candidateAuthRouter);

// ================= JOB ROUTES =================
const jobRoutes = require('./routes/jobs.routes');
app.use('/jobs', jobRoutes);

// ================= CONTACT ROUTE =================
app.post('/contact', formLimiter, async (req, res) => {
  try {
    const { firstName, email, phone, subject, message, consent } = req.body;

    if (!firstName || !email || !phone || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const safe = (value = '') => String(value).replace(/[<>]/g, '');

    await transporter.sendMail({
      from: `"Nortek Website Contact" <${process.env.EMAIL_USER}>`,
      to: CONTACT_RECEIVER_EMAIL,
      replyTo: safe(email),
      subject: `Contact Form: ${safe(subject)}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h3>New Contact Form Submission</h3>
          <p><strong>Name:</strong> ${safe(firstName)}</p>
          <p><strong>Email:</strong> ${safe(email)}</p>
          <p><strong>Phone:</strong> ${safe(phone)}</p>
          <p><strong>Subject:</strong> ${safe(subject)}</p>
          <p><strong>Message:</strong><br>${safe(message)}</p>
          <p><strong>SMS Consent:</strong> ${consent ? 'Yes' : 'No'}</p>
          <p><strong>Submitted At:</strong> ${new Date().toISOString()}</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    console.error('Contact form error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// ================= APPLICATION ROUTES =================

// --- Submit Application (public) ---
app.post('/apply', formLimiter, upload.single('cv'), async (req, res) => {
  try {
    const submittedName = String(req.body.name || '').trim();
    const submittedEmail = String(req.body.email || '').toLowerCase().trim();

    if (!submittedName || !submittedEmail) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    const matchedCandidate = await Candidate.findOne({ email: submittedEmail }).select('_id');

    //  Save application
    const application = await Application.create({
      ...req.body,
      candidateId: matchedCandidate?._id || undefined,
      name: submittedName,
      email: submittedEmail,
      cv: req.file?.filename
    });

   try {
  await transporter.sendMail({
    from: `"Nortek Careers" <${process.env.EMAIL_USER}>`,
    to: application.email,
    subject: `Application Received - ${application.designation} (${application.jobCode})`,
    html: `
      <div style="font-family:Arial;background:#f4f6f9;padding:20px">
        <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
          
          <div style="text-align:center">
            <img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />
            <h2 style="color:#2f3291;">Application Received</h2>
          </div>

          <p>Dear <b>${application.name}</b>,</p>

          <p>Thank you for applying for the position of 
             <b>${application.designation}</b>.
          </p>

          <p><b>Job Code:</b> ${application.jobCode}</p>

          <p>Your application has been successfully received.</p>
          <p>Our HR team will review your profile and contact you if shortlisted.</p>

          <p style="font-size:12px;color:gray;text-align:center">
            © 2026 Nortek Consulting. All rights reserved.
          </p>

        </div>
      </div>
    `,
    
    attachments: [
      {
        filename: "nortek_white.png",
        path: path.join(__dirname, 'assets/email/nortek_white.png'),
        cid: "norteklogo" 
      }
    ]
  });

} catch (error) {
  console.error("Email sending failed:", error);
}


    // 3️ Return response
    res.json({ success: true, application });

  } catch (err) {
    console.error("Application submission error:", err);
    res.status(500).json({ success: false, message: "Submission failed" });
  }
});

// --- Get All Applications ---
app.get('/apply/all', authMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (_, res) => {
  const applications = await Application.find().sort({ appliedAt: -1 });
  res.json({ success: true, applications });
});


// --- Update Application (HR Management) ---
app.put('/apply/update/:id', authMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (req, res) => {
  try {
    const { status, notes, rejectionReason, interviewDate } = req.body;
    const updatePayload = {};
    if (typeof status !== 'undefined') {updatePayload.status = status;}
    if (typeof notes !== 'undefined') {updatePayload.notes = notes;}
    if (typeof rejectionReason !== 'undefined') {updatePayload.rejectionReason = rejectionReason;}
    if (typeof interviewDate !== 'undefined') {updatePayload.interviewDate = interviewDate;}

    updatePayload.isRead = true;
    updatePayload.readAt = new Date();

    const updated = await Application.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    // ================= SEND EMAIL BASED ON STATUS =================
    const { name, email, designation, jobCode } = updated;
    let subject = '';
    let html = '';

    switch (status) {
      case 'Reviewed':
        subject = `Application Update - ${designation} (${jobCode})`;
        html = `
        <div style="font-family:Arial;background:#f4f6f9;padding:20px">
          <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
            <div style="text-align:center">
              <img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />
              <h2 style="color:#2f3291;">Application Under Review</h2>
            </div>
            <p>Dear <b>${name}</b>,</p>
            <p><b>Job Code:</b> ${jobCode}</p>
            <p>Your application for <b>${designation}</b> is currently under review.</p>
            <p>We will contact you once a decision is made.</p>
            <p style="font-size:12px;color:gray;text-align:center">
              © 2026 Nortek Consulting. All rights reserved.
            </p>
          </div>
        </div>`;
        break;

      case 'Rejected':
        subject = `Application Update - ${designation} (${jobCode})`;
        html = `
        <div style="font-family:Arial;background:#f4f6f9;padding:20px">
          <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
            <div style="text-align:center">
              <img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />
              <h2 style="color:#d9534f;">Application Rejected</h2>
            </div>
            <p>Dear <b>${name}</b>,</p>
            <p><b>Job Code:</b> ${jobCode}</p>
            <p>We regret to inform you that your application has been <b>rejected</b>.</p>
            ${rejectionReason ? `<p>Reason: ${rejectionReason}</p>` : ''}
            <p style="font-size:12px;color:gray;text-align:center">
              © 2026 Nortek Consulting. All rights reserved.
            </p>
          </div>
        </div>`;
        break;

      case 'Selected':
        subject = `Congratulations! Selected for ${designation} (${jobCode})`;
        html = `
        <div style="font-family:Arial;background:#f4f6f9;padding:20px">
          <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
            <div style="text-align:center">
              <img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />
              <h2 style="color:#2f3291;">Congratulations!</h2>
            </div>
            <p>Dear <b>${name}</b>,</p>
            <p><b>Job Code:</b> ${jobCode}</p>
            <p>You have been <b>selected</b> for the position of <b>${designation}</b>.</p>
            <p>Our HR team will contact you with the next steps.</p>
            <p style="font-size:12px;color:gray;text-align:center">
              © 2026 Nortek Consulting. All rights reserved.
            </p>
          </div>
        </div>`;
        break;

      case 'Pending':
  subject = `Application Update - ${designation} (${jobCode})`;
  html = `
  <div style="font-family:Arial;background:#f4f6f9;padding:20px">
    <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
      <div style="text-align:center">
        <img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />
        <h2 style="color:#2f3291;">Application Status Updated</h2>
      </div>
      <p>Dear <b>${name}</b>,</p>
      <p><b>Job Code:</b> ${jobCode}</p>
      <p>Your application for <b>${designation}</b> is now marked as <b>Pending</b>.</p>
      <p>We will keep you updated on further progress.</p>
      <p style="font-size:12px;color:gray;text-align:center">
        © 2026 Nortek Consulting. All rights reserved.
      </p>
    </div>
  </div>`;
break;
    }

    if (subject && html) {
      try {
        await transporter.sendMail({
          from: `"Nortek Careers" <${process.env.EMAIL_USER}>`,
          to: email,
          subject,
          html,
          attachments: [
            {
              filename: "nortek_white.png",
              path: path.join(__dirname, 'assets/email/nortek_white.png'),
              cid: "norteklogo"
            }
          ]
        });
      } catch (err) {
        console.error('Status email failed:', err);
      }
    }

    // ================================================================

    res.json({ success: true, application: updated });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

app.put('/apply/mark-read/:id', authMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (req, res) => {
  try {
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, application });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark application as read' });
  }
});

app.put('/apply/mark-all-read', authMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (_, res) => {
  try {
    await Application.updateMany(
      { isRead: { $ne: true } },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark all applications as read' });
  }
});

app.delete('/apply/delete/:id', authMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
  try {
    const deletedApplication = await Application.findByIdAndDelete(req.params.id);

    if (!deletedApplication) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, message: 'Application deleted successfully' });
  } catch (err) {
    console.error('Delete application error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete application' });
  }
});

// ================= START SERVER =================
app.listen(PORT, () =>
  console.log(` Server running at http://localhost:${PORT}`)
);
