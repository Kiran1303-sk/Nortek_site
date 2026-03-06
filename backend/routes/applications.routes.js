// routes/apply.routes.js
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const Application = require('../models/Application');
const auth = require('../middleware/authMiddleware');

/* =========================
   APPLY (Public)
========================= */
router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const { firstName, lastName, name, ...rest } = req.body;

    // Build full name safely
    const fullName =
      name ||
      `${firstName || ''} ${lastName || ''}`.trim();

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    const application = await Application.create({
      ...rest,
      name: fullName,
      cv: req.file ? req.file.filename : null,
      status: "New", // default status from schema
      appliedAt: new Date()
    });

    res.json({ success: true, application });

  } catch (err) {
    console.error('Application submission error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to submit application',
      error: err.message
    });
  }
});

/* =========================
   VIEW ALL APPLICATIONS (Admin)
========================= */
router.get('/all', auth, async (req, res) => {
  try {
    const applications = await Application.find().sort({ appliedAt: -1 });
    res.json({ success: true, applications });
  } catch (err) {
    console.error('Get all applications error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

/* =========================
   GET SINGLE APPLICATION (Admin)
========================= */
router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    res.json({ success: true, application });
  } catch (err) {
    console.error('Get application error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   UPDATE APPLICATION STATUS (Admin)
========================= */
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { status, notes, rejectionReason, interviewDate } = req.body;

  try {
    const updatedApp = await Application.findByIdAndUpdate(
      id,
      { status, notes, rejectionReason, interviewDate },
      { new: true }
    );

    if (!updatedApp) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    res.json({ success: true, application: updatedApp });
  } catch (err) {
    console.error('Update application error:', err);
    res.status(500).json({ success: false, message: 'Failed to update application', error: err.message });
  }
});

module.exports = router;
