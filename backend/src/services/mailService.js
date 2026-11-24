import nodemailer from 'nodemailer';

/**
 * SMTP mail service (nodemailer). Credentials come from backend/.env only
 * (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM) - never the database.
 * Whether verification emails are actually used is an admin switch (see settingsService).
 */

const APP_NAME = () => process.env.APP_NAME || 'Minutes';
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

import { redisEnabled } from '../infrastructure/redis/redisClient.js';

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  return getTransporter().sendMail({ from, to, subject, html, text });
}

/**
 * Non-critical mail (invites, task assignments): durable queue with retries/backoff when Redis is configured,
 * otherwise sent inline as before. NOT used for verification mail, where the user needs the SMTP result immediately.
 */
export async function deliver(mail) {
  if (!redisEnabled()) return sendMail(mail);
  const { enqueue } = await import('../queues/index.js');
  try { return await enqueue('email', mail); }
  catch (e) { console.warn(`[mail] queue unavailable (${e.message}); sending inline`); return sendMail(mail); }
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

/** Team invitation. `joined` = the person already has an account and was added; otherwise they're asked to sign up. */
export async function sendTeamInviteEmail({ to, inviterName, team, role, joined, inviteCode }) {
  const name = APP_NAME();
  const link = joined ? `${appUrl()}/teams/${team.id}` : `${appUrl()}/signup`;
  const cta = joined ? 'Open team' : 'Create your account';
  const codeText = !joined && inviteCode ? `\nAfter signing up, join with invite code: ${inviteCode}\n` : '';
  const codeHtml = !joined && inviteCode
    ? `<p>After signing up, choose <b>Join team</b> and enter this invite code:</p><p style="font-family:monospace;font-size:20px;letter-spacing:2px;background:#f3f4f6;padding:10px 14px;border-radius:8px;display:inline-block;margin:0">${esc(inviteCode)}</p>`
    : '';
  return deliver({
    to,
    subject: `${inviterName} invited you to ${team.name} on ${name}`,
    text: `${inviterName} invited you to join the team "${team.name}" on ${name} as ${role}.\n\n${cta}: ${link}\n${codeText}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">You're invited to ${esc(team.name)}</h2>
      <p><b>${esc(inviterName)}</b> invited you to join the team <b>${esc(team.name)}</b> on ${esc(name)} as <b>${esc(role)}</b>.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${cta}</a></p>
      ${codeHtml}
      <p style="font-size:13px;color:#555;margin-top:20px">Or paste this link in your browser:<br><a href="${link}">${link}</a></p>
    </div>`
  });
}

/** Task assignment / reassignment notice for the new assignee. */
export async function sendTaskAssignedEmail({ to, assigneeName, assignerName, task, teamName, isNew }) {
  const name = APP_NAME();
  const link = `${appUrl()}/tasks`;
  const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date';
  const priority = task.priority || 'medium';
  const heading = isNew ? 'You have a new task' : 'A task was assigned to you';
  const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 0;font-size:14px"><b>${v}</b></td></tr>`;
  return deliver({
    to,
    subject: `${assignerName} assigned you: ${task.title}`,
    text: `Hi ${assigneeName},\n\n${assignerName} assigned you a task${teamName ? ` in ${teamName}` : ''}:\n\n${task.title}\n${task.description ? task.description + '\n' : ''}\nPriority: ${priority}\nDue: ${due}\n\nOpen it: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">${heading}</h2>
      <p>Hi ${esc(assigneeName)}, <b>${esc(assignerName)}</b> assigned you a task${teamName ? ` in <b>${esc(teamName)}</b>` : ''} on ${esc(name)}.</p>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:16px 0">
        <p style="margin:0 0 6px;font-size:16px"><b>${esc(task.title)}</b></p>
        ${task.description ? `<p style="margin:0 0 10px;color:#374151;font-size:14px;white-space:pre-wrap">${esc(String(task.description).slice(0, 500))}</p>` : ''}
        <table style="border-collapse:collapse">${row('Priority', esc(priority))}${row('Due', esc(due))}</table>
      </div>
      <p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open task</a></p>
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
