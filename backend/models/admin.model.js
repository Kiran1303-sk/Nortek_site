const mongoose = require('mongoose');

const ADMIN_ROLES = ['super_admin', 'admin', 'recruiter', 'user'];

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

module.exports = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
