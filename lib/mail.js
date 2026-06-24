import nodemailer from "nodemailer";

export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/verify?token=${token}`;
  
  console.log("----------------------------------------");
  console.log(`[VERIFICATION EMAIL SENT TO: ${email}]`);
  console.log(`Verification URL: ${verifyUrl}`);
  console.log("----------------------------------------");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "placeholder-sender@gmail.com",
      pass: process.env.GMAIL_PASS || "qvoe qylg uncq vbyl",
    },
  });

  const mailOptions = {
    from: `"1v1 Grid Battleship" <${process.env.GMAIL_USER || "placeholder-sender@gmail.com"}>`,
    to: email,
    subject: "Verify your email for 1v1 Battle Grid",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; text-align: center;">Welcome to 1v1 Battle Grid!</h2>
        <p style="font-size: 16px; color: #334155;">Thank you for registering. Please click the button below to verify your email address and log in immediately:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email & Log In</a>
        </div>
        <p style="font-size: 14px; color: #64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="font-size: 14px; color: #4f46e5; word-break: break-all;">${verifyUrl}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">This link will expire in 24 hours.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${email}`);
  } catch (error) {
    console.error("Failed to send verification email:", error.message);
  }
}
