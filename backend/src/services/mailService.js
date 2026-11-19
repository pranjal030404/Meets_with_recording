import nodemailer from 'nodemailer';

/**
 * SMTP mail service (nodemailer). Credentials come from backend/.env only
 * (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM) - never the database.
 * Whether verification emails are actually used is an admin switch (see settingsService).
 */

const APP_NAME = () => process.env.APP_NAME || 'MeetClone';
export const appUrl = () => (process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');

export const isSmtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export const smtpSummary = () => ({
  configured: isSmtpConfigured(),
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  user: process.env.SMTP_USER || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || ''
});

let transporter = null;
let transporterKey = '';

function getTransporter() {
  if (!isSmtpConfigured()) throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env)');
  const key = [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_SECURE, process.env.SMTP_USER, process.env.SMTP_PASS].join('|');
  if (!transporter || key !== transporterKey) {
    const { host, port, secure } = smtpSummary();
    transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
    transporterKey = key;
  }
  return transporter;
}

export async function verifySmtpConnection() {
  await getTransporter().verify();
  return true;
}

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  return getTransporter().sendMail({ from, to, subject, html, text });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendVerificationEmail(user, token) {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const name = APP_NAME();
  return sendMail({
    to: user.email,
    subject: `Verify your email for ${name}`,
    text: `Hi ${user.name},\n\nConfirm your email to activate your ${name} account:\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Hi ${esc(user.name)},</p>
      <p>Confirm your email address to activate your ${esc(name)} account.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>
      <p style="font-size:13px;color:#555">Or paste this link in your browser:<br><a href="${link}">${link}</a></p>
      <p style="font-size:12px;color:#888">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    </div>`
  });
}

export async function sendTestEmail(to) {
  const name = APP_NAME();
  return sendMail({
    to,
    subject: `${name} SMTP test`,
    text: `This is a test email from ${name}. Your SMTP settings work.`,
    html: `<p>This is a test email from <b>${esc(name)}</b>. Your SMTP settings work.</p>`
  });
}
