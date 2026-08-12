import nodemailer from "nodemailer";

// authenticates as this Gmail account to send mail
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASS,
  },
} as nodemailer.TransportOptions);

/**
 * Sends the final document summary to the user's email.
 *
 * @param to - recipient email address
 * @param summary - final merged summary text to include in the email body
 */
export async function sendSummaryEmail(to: string, summary: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your document summary is ready",
    text: summary,
  });
}