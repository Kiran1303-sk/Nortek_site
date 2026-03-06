const mongoose = require('mongoose');
const fs = require('fs');
const Job = require('./models/Job');

mongoose.connect('mongodb://127.0.0.1:27017/nortek', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const jobs = JSON.parse(fs.readFileSync('./jobs.json', 'utf-8'));

async function importData() {
  try {
    await Job.deleteMany(); 
    await Job.insertMany(jobs);
    console.log(' Jobs imported successfully');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

importData();
