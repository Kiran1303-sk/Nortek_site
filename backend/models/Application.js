// models/Application.js
const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  //  Frontend Fields
  name: String,          // For frontend 'name' field
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  jobCode: String,
  designation: String,
  cv: String,

  //  HR Management Fields
  status: {
    type: String,
    enum: ["Pending", "Shortlisted", "Selected", "Rejected"],
    default: "Pending"
  },

  notes: {
    type: String,
    default: ""
  },

  rejectionReason: {
    type: String,
    default: ""
  },

  interviewDate: {
    type: Date,
    default: null
  },

  isRead: {
    type: Boolean,
    default: false
  },

  readAt: {
    type: Date,
    default: null
  },

  appliedAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

//  Virtual field to get fullName from firstName + lastName
ApplicationSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.name || '';
});

// Ensure virtual fields are included when converting to JSON
ApplicationSchema.set('toJSON', { virtuals: true });
ApplicationSchema.set('toObject', { virtuals: true });

//  Prevent OverwriteModelError
const Application =
  mongoose.models.Application ||
  mongoose.model('Application', ApplicationSchema);

module.exports = Application;
