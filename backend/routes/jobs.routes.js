const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const protect = require('../middleware/authMiddleware');
const authorize = require('../middleware/role.middleware');

/* =====================================================
   PUBLIC ROUTES (NO AUTH) — MUST BE FIRST
===================================================== */

// GET all jobs (Career page)
router.get('/public', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const jobs = await Job.find().sort({ updatedAt: -1, createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET single job by jobCode (Job Details page)
router.get('/public/:jobCode', async (req, res) => {
  try {
    const job = await Job.findOne({ jobCode: req.params.jobCode });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =====================================================
   ADMIN ROUTES (PROTECTED)
===================================================== */

// GET all jobs (Admin)
router.get('/', protect, authorize('super_admin', 'admin', 'recruiter', 'user'), async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const jobs = await Job.find().sort({ updatedAt: -1, createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET single job by ID (Admin)
router.get('/:id', protect, authorize('super_admin', 'admin', 'recruiter', 'user'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// CREATE new job (Admin)
router.post('/', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const {
      title,
      jobCode,
      openings,
      type,
      hours,
      location,
      experience,
      email,
      description,
      duties,
      education,
      postedOn
    } = req.body;

    if (!title || !jobCode) {
      return res.status(400).json({
        success: false,
        message: 'Title and Job Code are required'
      });
    }

    const exists = await Job.findOne({ jobCode });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Job code already exists'
      });
    }

    const job = await Job.create({
      title,
      jobCode,
      openings,
      type,
      hours,
      location,
      experience,
      email,
      description,
      duties,
      education,
      postedOn
    });

    res.status(201).json({ success: true, job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// UPDATE job (Admin)
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    Object.assign(job, req.body, { updatedAt: new Date() });
    const updatedJob = await job.save();

    res.json({ success: true, job: updatedJob });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE job (Admin)
router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    await job.deleteOne();
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
