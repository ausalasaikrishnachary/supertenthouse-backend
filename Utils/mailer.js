const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTP = async (email, otp) => {
  await transporter.sendMail({
    from: `"Admin Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🔐 Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
        
        <div style="max-width: 500px; margin: auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(to right, #ec4899, #facc15, #3b82f6); padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0;">Password Reset</h2>
          </div>

          <!-- Body -->
          <div style="padding: 30px; text-align: center;">
            
            <p style="font-size: 16px; color: #333;">
              We received a request to reset your password.
            </p>

            <p style="font-size: 16px; color: #333;">
              Use the OTP below to proceed:
            </p>

            <!-- OTP Box -->
            <div style="margin: 20px 0;">
              <span style="
                display: inline-block;
                background: #0c2d67;
                color: #ffffff;
                padding: 12px 25px;
                font-size: 22px;
                letter-spacing: 4px;
                border-radius: 8px;
                font-weight: bold;
              ">
                ${otp}
              </span>
            </div>

            <p style="color: #666; font-size: 14px;">
              This OTP is valid for <strong>5 minutes</strong>.
            </p>

            <p style="color: #999; font-size: 13px; margin-top: 20px;">
              If you didn’t request this, please ignore this email.
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #f4f6f9; padding: 15px; text-align: center;">
            <p style="font-size: 12px; color: #888; margin: 0;">
              © ${new Date().getFullYear()} Admin Panel. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    `,
  });
};
module.exports = sendOTP;