const express = require('express');

module.exports = function createCandidateAuthRouter(deps) {
  const {
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
  } = deps;

  const router = express.Router();

  router.post('/request-otp', otpLimiter, async (req, res) => {
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
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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

  router.post('/verify-otp', otpLimiter, async (req, res) => {
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

  router.post('/register', authLimiter, async (req, res) => {
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

      const token = signCandidateAccessToken({
        id: candidate._id,
        email: candidate.email,
        role: 'candidate'
      });

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

  router.post('/forgot-password/reset', authLimiter, async (req, res) => {
    try {
      const { email, newPassword, verificationToken } = req.body;
      const normalizedEmail = String(email || '').toLowerCase().trim();

      if (!normalizedEmail || !newPassword || !verificationToken) {
        return res.status(400).json({ success: false, message: 'Email, new password and OTP verification are required' });
      }

      if (String(newPassword || '').length < PASSWORD_MIN_LENGTH) {
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

  router.post('/login', authLimiter, async (req, res) => {
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

      const token = signCandidateAccessToken({
        id: candidate._id,
        email: candidate.email,
        role: 'candidate'
      });

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

  router.get('/me', authCandidateMiddleware, authorizeRoles('candidate'), async (req, res) => {
    try {
      const candidate = await Candidate.findById(req.user.id).select('-password');
      if (!candidate) {return res.status(404).json({ success: false, message: 'Candidate not found' });}
      res.json({ success: true, user: candidate });
    } catch (err) {
      console.error('Candidate profile error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to load profile' });
    }
  });

  return router;
};
