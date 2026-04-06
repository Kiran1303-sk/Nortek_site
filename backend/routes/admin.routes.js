const express = require('express');

module.exports = function createAdminRouter(deps) {
  const {
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
  } = deps;

  const router = express.Router();

  router.post('/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: email?.toLowerCase() });
    if (!admin) {return res.status(400).json({ success: false, message: 'Invalid email or password' });}
    if (!admin.isActive) {return res.status(403).json({ success: false, message: 'Account deactivated' });}

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {return res.status(400).json({ success: false, message: 'Invalid email or password' });}

    Admin.updateOne({ _id: admin._id }, { $set: { lastLogin: new Date() } })
      .catch((err) => console.error('Admin lastLogin update error:', err.message));

    const token = signAdminAccessToken({ id: admin._id, email: admin.email, role: admin.role });

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

  router.get('/profile', authAdminMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
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

  router.put('/profile', authAdminMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
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

      const token = signAdminAccessToken({ id: admin._id, email: admin.email, role: admin.role });

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

  router.put('/change-password', authAdminMiddleware, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Current and new password are required' });
      }

      if (String(newPassword || '').length < PASSWORD_MIN_LENGTH) {
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

  router.get('/users', authAdminMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
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

  router.post('/users', authAdminMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
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

      if (String(password || '').length < PASSWORD_MIN_LENGTH) {
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

  router.put('/users/:id', authAdminMiddleware, authorizeRoles('super_admin', 'admin'), async (req, res) => {
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

  router.delete('/users/:id', authAdminMiddleware, authorizeRoles('super_admin'), async (req, res) => {
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

  router.post('/forgot-password/request-otp', otpLimiter, async (req, res) => {
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

      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(503).json({
          success: false,
          message: 'Email service is not configured. Please contact support.'
        });
      }

      await transporter.sendMail({
        from: `"Nortek Admin" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: 'Your OTP for Admin Password Reset',
        text: `Your Nortek Admin OTP is ${otp}. It is valid for 10 minutes.`,
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

  router.post('/forgot-password/verify-otp', otpLimiter, async (req, res) => {
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

  router.post('/forgot-password/reset', authLimiter, async (req, res) => {
    try {
      const { email, newPassword, verificationToken } = req.body;
      const normalizedEmail = String(email || '').toLowerCase().trim();

      if (!normalizedEmail || !newPassword || !verificationToken) {
        return res.status(400).json({ success: false, message: 'Email, new password and verification token are required' });
      }

      if (String(newPassword || '').length < PASSWORD_MIN_LENGTH) {
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

  return router;
};
