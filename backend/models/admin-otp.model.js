const mongoose = require('mongoose');

const AdminOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['forgot_password'], required: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });

AdminOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.models.AdminOtp || mongoose.model('AdminOtp', AdminOtpSchema);
