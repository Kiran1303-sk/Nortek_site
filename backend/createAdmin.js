require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nortek';

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['super_admin', 'admin', 'recruiter', 'user'], default: 'admin' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
});

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

async function run() {
  const [, , emailArg, passwordArg, roleArg] = process.argv;

  if (!emailArg || !passwordArg) {
    console.log('Usage: node createAdmin.js <email> <password> [super_admin|admin|recruiter|user]');
    process.exit(1);
  }

  const allowedRoles = ['super_admin', 'admin', 'recruiter', 'user'];
  const role = allowedRoles.includes(String(roleArg || '').toLowerCase()) ? String(roleArg).toLowerCase() : 'admin';
  const email = emailArg.toLowerCase().trim();

  await mongoose.connect(MONGO_URI);

  // Legacy cleanup: older schema used unique username index.
  // Drop it so email-based accounts (admin/recruiter) can be created safely.
  try {
    const indexes = await Admin.collection.indexes();
    const hasLegacyUsernameIndex = indexes.some((idx) => idx.name === 'username_1');
    if (hasLegacyUsernameIndex) {
      await Admin.collection.dropIndex('username_1');
      console.log('Dropped legacy index: username_1');
    }
  } catch (err) {
    console.log(`Index check/cleanup skipped: ${err.message}`);
  }

  const existing = await Admin.findOne({ email });
  if (existing) {
    existing.password = await bcrypt.hash(passwordArg, 10);
    existing.role = role;
    existing.isActive = true;
    await existing.save();
    console.log(`Updated ${role} account: ${email}`);
  } else {
    await Admin.create({
      email,
      password: await bcrypt.hash(passwordArg, 10),
      role,
      isActive: true
    });
    console.log(`Created ${role} account: ${email}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Failed to create/update account:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
