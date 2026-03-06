require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nortek';

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['super_admin', 'admin', 'recruiter', 'user'], default: 'admin' },
  isActive: { type: Boolean, default: true },
  displayName: { type: String, default: '' },
  lastLogin: Date
});

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

function usage() {
  console.log(`
Usage:
  node manageAdminAccount.js change-email <currentEmail> <currentPassword> <newEmail>
  node manageAdminAccount.js change-password <email> <currentPassword> <newPassword>
  node manageAdminAccount.js change-display-name <email> <currentPassword> <newDisplayName>
  node manageAdminAccount.js view <email> <currentPassword>
`);
}

async function findAndVerify(email, currentPassword) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const account = await Admin.findOne({ email: normalizedEmail });
  if (!account) {
    throw new Error('Account not found');
  }

  if (!account.isActive) {
    throw new Error('Account is deactivated');
  }

  const valid = await bcrypt.compare(currentPassword, account.password);
  if (!valid) {
    throw new Error('Current password is incorrect');
  }

  return account;
}

async function run() {
  const [, , action, ...args] = process.argv;
  if (!action) {
    usage();
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  try {
    if (action === 'change-email') {
      const [currentEmail, currentPassword, newEmailRaw] = args;
      if (!currentEmail || !currentPassword || !newEmailRaw) {
        usage();
        process.exit(1);
      }

      const newEmail = newEmailRaw.toLowerCase().trim();
      const account = await findAndVerify(currentEmail, currentPassword);

      const existing = await Admin.findOne({ email: newEmail });
      if (existing && String(existing._id) !== String(account._id)) {
        throw new Error('New email is already used by another account');
      }

      account.email = newEmail;
      await account.save();
      console.log(`Email updated successfully: ${newEmail}`);
    } else if (action === 'change-password') {
      const [email, currentPassword, newPassword] = args;
      if (!email || !currentPassword || !newPassword) {
        usage();
        process.exit(1);
      }

      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters');
      }

      const account = await findAndVerify(email, currentPassword);
      account.password = await bcrypt.hash(newPassword, 10);
      await account.save();
      console.log('Password updated successfully');
    } else if (action === 'change-display-name') {
      const [email, currentPassword, ...nameParts] = args;
      const newDisplayName = nameParts.join(' ').trim();

      if (!email || !currentPassword || !newDisplayName) {
        usage();
        process.exit(1);
      }

      const account = await findAndVerify(email, currentPassword);
      account.displayName = newDisplayName;
      await account.save();
      console.log(`Display name updated successfully: ${newDisplayName}`);
    } else if (action === 'view') {
      const [email, currentPassword] = args;
      if (!email || !currentPassword) {
        usage();
        process.exit(1);
      }

      const account = await findAndVerify(email, currentPassword);
      console.log({
        email: account.email,
        role: account.role,
        isActive: account.isActive,
        displayName: account.displayName || ''
      });
    } else {
      usage();
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (err) => {
  console.error(`Failed: ${err.message}`);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
