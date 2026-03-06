const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = async (application) => {
  await transporter.sendMail({
    from: '"Nortek Careers"',
    to: 'hr@nortekconsulting.com',
    subject: `New Application: ${application.jobCode}`,
    html: `
      <p>Name: ${application.firstName}</p>
      <p>Email: ${application.email}</p>
      <p>Job: ${application.designation}</p>
    `
  });
};
