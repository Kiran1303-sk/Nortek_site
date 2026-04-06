const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'candidate' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });

module.exports = mongoose.models.Candidate || mongoose.model('Candidate', CandidateSchema);
