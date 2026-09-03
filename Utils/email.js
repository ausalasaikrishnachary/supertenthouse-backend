// utils/email.js
const nodemailer = require('nodemailer');

// Create transporter using Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // iiiqbets01@gmail.com
      pass: process.env.EMAIL_PASS // rava xoel gzai rkgx
    }
  });
};

const sendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🔐 Your OTP for Super Tent House',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px;">
          <div style="background-color: white; padding: 30px; border-radius: 8px;">
            <h2 style="color: #1a1a2e; text-align: center; margin-bottom: 20px;">🏕️ Super Tent House</h2>
            <p style="font-size: 16px; color: #333;">Hello ${name || 'User'},</p>
            <p style="font-size: 16px; color: #333;">Your verification code is:</p>
            <div style="text-align: center; padding: 20px 0; margin: 20px 0; background: #f8f9fa; border-radius: 8px;">
              <span style="font-size: 36px; font-weight: bold; color: #e67e22; letter-spacing: 10px; font-family: monospace;">
                ${otp}
              </span>
            </div>
            <p style="font-size: 14px; color: #666;">⏰ This code will expire in <strong>10 minutes</strong>.</p>
            <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="text-align: center; font-size: 12px; color: #999; margin: 0;">
              © 2024 Super Tent House. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    console.log(`📧 Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    console.error('Error details:', error.message);
    return false;
  }
};

module.exports = { sendOTPEmail };