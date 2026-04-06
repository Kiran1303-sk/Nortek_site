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
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET;
const CANDIDATE_JWT_SECRET = process.env.CANDIDATE_JWT_SECRET || JWT_SECRET;
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '30m';
const CANDIDATE_JWT_EXPIRES_IN = process.env.CANDIDATE_JWT_EXPIRES_IN || '7d';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5500';
const DEFAULT_CORS_ORIGINS = [
  CLIENT_URL,
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://nortek-frontend.onrender.com',
  'https://nortek-site.onrender.com'
];
const ENV_CORS_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ALLOWED_ORIGINS = [...new Set([...DEFAULT_CORS_ORIGINS, ...ENV_CORS_ORIGINS])];
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

const signAdminAccessToken = (payload, expiresIn = ADMIN_JWT_EXPIRES_IN) =>
  jwt.sign({ ...payload, tokenType: 'admin_access' }, ADMIN_JWT_SECRET, { expiresIn });
const signCandidateAccessToken = (payload, expiresIn = CANDIDATE_JWT_EXPIRES_IN) =>
  jwt.sign({ ...payload, tokenType: 'candidate_access' }, CANDIDATE_JWT_SECRET, { expiresIn });

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
const Admin = require('./models/admin.model');
const Candidate = require('./models/candidate.model');
const CandidateOtp = require('./models/candidate-otp.model');
const AdminOtp = require('./models/admin-otp.model');

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
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================= AUTH MIDDLEWARE =================
const authAdminMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Admin authorization required' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded?.tokenType !== 'admin_access') {
      return res.status(401).json({ success: false, message: 'Invalid admin token' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid admin token' });
  }
};

const authCandidateMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Candidate authorization required' });
  }

  try {
    const decoded = jwt.verify(token, CANDIDATE_JWT_SECRET);
    if (decoded?.tokenType !== 'candidate_access' || decoded?.role !== 'candidate') {
      return res.status(401).json({ success: false, message: 'Invalid candidate token' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid candidate token' });
  }
};

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const createCandidateOtpVerificationToken = (email, purpose) => jwt.sign({
  type: 'candidate_otp_verified',
  tokenType: 'candidate_otp',
  email,
  purpose
}, CANDIDATE_JWT_SECRET, { expiresIn: '15m' });

const verifyCandidateOtpVerificationToken = (token, expectedPurpose, expectedEmail) => {
  try {
    const decoded = jwt.verify(token, CANDIDATE_JWT_SECRET);
    const email = String(expectedEmail || '').toLowerCase().trim();
    return (
      decoded &&
      decoded.type === 'candidate_otp_verified' &&
      decoded.tokenType === 'candidate_otp' &&
      decoded.purpose === expectedPurpose &&
      String(decoded.email || '').toLowerCase().trim() === email
    );
  } catch {
    return false;
  }
};

const createAdminOtpVerificationToken = (email) => jwt.sign({
  type: 'admin_otp_verified',
  tokenType: 'admin_otp',
  email,
  purpose: 'forgot_password'
}, ADMIN_JWT_SECRET, { expiresIn: '15m' });

const verifyAdminOtpVerificationToken = (token, expectedEmail) => {
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    const email = String(expectedEmail || '').toLowerCase().trim();
    return (
      decoded &&
      decoded.type === 'admin_otp_verified' &&
      decoded.tokenType === 'admin_otp' &&
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

// ================= AUTH ROUTES =================
const createAdminRouter = require('./routes/admin.routes');
const createCandidateAuthRouter = require('./routes/candidate-auth.routes');

const adminRouter = createAdminRouter({
  Admin,
  AdminOtp,
  bcrypt,
  authLimiter,
  otpLimiter,
  authAdminMiddleware,
  authorizeRoles,
  ADMIN_ROLES,
  PASSWORD_MIN_LENGTH,
  signAdminAccessToken,
  verifyAdminOtpVerificationToken,
  createAdminOtpVerificationToken,
  createOtpCode,
  transporter
});

const candidateAuthRouter = createCandidateAuthRouter({
  Candidate,
  CandidateOtp,
  bcrypt,
  authLimiter,
  otpLimiter,
  authCandidateMiddleware,
  authorizeRoles,
  PASSWORD_MIN_LENGTH,
  signCandidateAccessToken,
  createCandidateOtpVerificationToken,
  verifyCandidateOtpVerificationToken,
  createOtpCode,
  transporter
});

app.use('/admin', adminRouter);
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

    const application = await Application.create({
      ...req.body,
      candidateId: matchedCandidate?._id || undefined,
      name: submittedName,
      email: submittedEmail,
      cv: req.file?.filename
    });

    const emailUser = String(process.env.EMAIL_USER || '').trim();
    const logoPath = path.join(__dirname, 'assets/email/nortek_white.png');
    const hasLogo = fs.existsSync(logoPath);
    const designation = String(application.designation || 'Applied Position').trim();
    const jobCode = String(application.jobCode || 'N/A').trim();

    const mailHtml = `
      <div style="font-family:Arial;background:#f4f6f9;padding:20px">
        <div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:8px">
          <div style="text-align:center">
            ${hasLogo ? '<img src="cid:norteklogo" width="140" style="margin-bottom:10px;" />' : ''}
            <h2 style="color:#2f3291;">Application Received</h2>
          </div>
          <p>Dear <b>${application.name}</b>,</p>
          <p>Thank you for applying for the position of <b>${designation}</b>.</p>
          <p><b>Job Code:</b> ${jobCode}</p>
          <p>Your application has been successfully received.</p>
          <p>Our HR team will review your profile and contact you if shortlisted.</p>
          <p style="font-size:12px;color:gray;text-align:center">
            &copy; 2026 Nortek Consulting. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const mailText =
      `Dear ${application.name},\n\n` +
      `Thank you for applying for the position of ${designation}.\n` +
      `Job Code: ${jobCode}\n\n` +
      'Your application has been successfully received.\n' +
      'Our HR team will review your profile and contact you if shortlisted.\n\n' +
      'Nortek Consulting';

    let emailSent = false;

    if (!emailUser) {
      console.error('Application acknowledgement email skipped: EMAIL_USER is missing');
    } else {
      try {
        await transporter.sendMail({
          from: `"Nortek Careers" <${emailUser}>`,
          to: application.email,
          subject: `Application Received - ${designation} (${jobCode})`,
          text: mailText,
          html: mailHtml,
          ...(hasLogo
            ? {
                attachments: [
                  {
                    filename: 'nortek_white.png',
                    path: logoPath,
                    cid: 'norteklogo'
                  }
                ]
              }
            : {})
        });
        emailSent = true;
      } catch (error) {
        try {
          await transporter.sendMail({
            from: `"Nortek Careers" <${emailUser}>`,
            to: application.email,
            subject: `Application Received - ${designation} (${jobCode})`,
            text: mailText,
            html: mailHtml.replace(/<img[^>]*cid:norteklogo[^>]*>/i, '')
          });
          emailSent = true;
        } catch (retryError) {
          console.error('Application acknowledgement email failed:', retryError?.message || retryError);
        }
      }
    }

    res.json({
      success: true,
      application,
      emailSent,
      ...(emailSent ? {} : { warning: 'Application saved but acknowledgement email was not sent.' })
    });
  } catch (err) {
    console.error('Application submission error:', err);
    res.status(500).json({ success: false, message: 'Submission failed' });
  }
});
// --- Get All Applications ---
app.get('/apply/all', authAdminMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (_, res) => {
  const applications = await Application.find().sort({ appliedAt: -1 });
  res.json({ success: true, applications });
});


// --- Update Application (HR Management) ---
app.put('/apply/update/:id', authAdminMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (req, res) => {
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

app.put('/apply/mark-read/:id', authAdminMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (req, res) => {
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

app.put('/apply/mark-all-read', authAdminMiddleware, authorizeRoles('super_admin', 'admin', 'recruiter'), async (_, res) => {
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

app.delete('/apply/delete/:id', authAdminMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
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

