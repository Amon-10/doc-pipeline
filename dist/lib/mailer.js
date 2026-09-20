"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSummaryEmail = sendSummaryEmail;
const resend_1 = require("resend");
// Uses Resend's HTTPS API rather than SMTP — most cloud platforms, including
// Railway on non-Pro plans, block outbound SMTP entirely to prevent spam abuse.
// HTTPS-based email APIs aren't subject to that restriction.
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
/**
 * Sends the final document summary to the user's email. *
 * @param to - recipient email address
 * @param summary - final merged summary text to include in the email body
*/
async function sendSummaryEmail(to, summary) {
    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
        throw new Error("EMAIL_FROM environment variable is not set");
    }
    const { error } = await resend.emails.send({
        from: emailFrom,
        to,
        subject: "Your document summary is ready",
        text: summary,
    });
    if (error) {
        throw new Error(`Failed to send summary email: ${error.message}`);
    }
}
