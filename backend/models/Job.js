// models/Job.js
const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  title: { type: String, required: true },      
  jobCode: { type: String, required: true },    
  openings: Number,                            
  location: String,                            
  type: String,                                 
  hours: String,                               
  experience: String,                           
  email: String,                              
  description: String,                          
  duties: [String],                             
  education: [String],                          
  postedOn: Date                                
}, { timestamps: true });

JobSchema.index({ updatedAt: -1, createdAt: -1 });
JobSchema.index({ jobCode: 1 });

//  Prevent OverwriteModelError
const Job = mongoose.models.Job || mongoose.model('Job', JobSchema);

module.exports = Job;
