/* =========================================================================
   utils/mailer.js
   Nodemailer transporter + confirmation email for camp registrations.

   Env vars required:
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
   For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=your@gmail.com,
   SMTP_PASS=<app password, not your login password>.
   ========================================================================= */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function buildConfirmationHtml({ name, referenceNumber, campDateLabel, preferredTime }) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
    <div style="background:#ffc107; padding: 24px; border-radius: 10px 10px 0 0; text-align:center;">
      <h1 style="margin:0; font-size:20px;">Reboot Mental Health Center</h1>
    </div>
    <div style="border: 1px solid #eee; border-top: none; padding: 28px 24px; border-radius: 0 0 10px 10px;">
      <h2 style="font-size:20px; margin: 0 0 12px;">You're registered, ${name}!</h2>
      <p style="font-size:14.5px; line-height:1.6; color:#333;">
        Thank you for taking the first step. Your seat at the Mental Health
        Camp is confirmed. Here are your details:
      </p>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0; font-size:14.5px;">
        <tr>
          <td style="padding:8px 0; color:#777;">Reference Number</td>
          <td style="padding:8px 0; font-weight:bold; text-align:right;">${referenceNumber}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#777; border-top:1px solid #f2f2f2;">Camp Date</td>
          <td style="padding:8px 0; font-weight:bold; text-align:right; border-top:1px solid #f2f2f2;">${campDateLabel}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#777; border-top:1px solid #f2f2f2;">Preferred Time</td>
          <td style="padding:8px 0; font-weight:bold; text-align:right; border-top:1px solid #f2f2f2;">${preferredTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#777; border-top:1px solid #f2f2f2;">Location</td>
          <td style="padding:8px 0; font-weight:bold; text-align:right; border-top:1px solid #f2f2f2;">In-Person Camp, Tiruppur</td>
        </tr>
      </table>
      <p style="font-size:14.5px; line-height:1.6; color:#333;">
        No judgment. No pressure. Just reply to this email if anything
        changes or if you have questions before the camp.
      </p>
      <p style="font-size:12.5px; color:#999; margin-top:28px;">
        © 2026 Reboot Mental Health Center. All rights reserved.
      </p>
    </div>
  </div>`;
}

async function sendConfirmationEmail({ to, name, referenceNumber, campDateLabel, preferredTime }) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM || `"Reboot Mental Health Center" <${process.env.SMTP_USER}>`,
    to,
    subject: `Registration Confirmed — ${referenceNumber}`,
    html: buildConfirmationHtml({ name, referenceNumber, campDateLabel, preferredTime }),
  });
}

module.exports = { sendConfirmationEmail };