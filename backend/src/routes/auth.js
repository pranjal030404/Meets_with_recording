import express from 'express';
import crypto from 'crypto';
import { Op } from 'sequelize';
import User from '../models/User.js';
import { protect, generateToken, generateSocketTicket, clearSessionCookies, revokeToken, syncAssetCookie } from '../middleware/auth.js';
import { handOver } from '../lib/webSession.js';
import { knownDevice, rememberDevice } from '../lib/knownDevice.js';
import { getSubscriptionDetails, getPlanBySlug } from '../services/subscriptionService.js';
import { getSetting } from '../services/settingsService.js';
import { isSmtpConfigured, sendVerificationEmail, sendPasswordCodeEmail } from '../services/mailService.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { issueCode, consumeCode, clearCode } from '../services/otpService.js';
import { revokeUserSessions } from '../lib/sessionRevocation.js';
import { MIN_PASSWORD_LENGTH } from '../lib/password.js';
import { tooManyAttempts, recordFailure, clearFailures } from '../lib/loginThrottle.js';
import { disconnectSession, disconnectUser } from '../realtime/sessions.js';
import { contactIdsOf, maskEmail } from '../lib/access.js';
import { sendPasswordResetEmail } from '../services/mailService.js';
import { handleAvatarUpload, saveAvatar, clearAvatar, pickProfileFields } from '../services/avatarService.js';
import { exportAccount, eraseAccount, AccountError } from '../services/accountService.js';
import { sendAccountExistsEmail } from '../services/mailService.js';
import { hashPassword } from '../lib/password.js';

const router = express.Router();

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Verification is enforced only when an admin switched it on AND SMTP credentials exist.
const verificationRequired = async () => (await getSetting('emailVerificationEnabled')) === true && isSmtpConfigured();

// Issues a fresh token for the user and emails it. Throws if the email cannot be sent.
async function issueVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailVerifyToken = hashToken(token);
  user.emailVerifyExpires = new Date(Date.now() + VERIFY_TTL_MS);
  user.emailVerifySentAt = new Date();
  await user.save();
  await sendVerificationEmail(user, token);
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name needs at least 2 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    // The server must be set up before it creates anyone, or the account is left half made
    await getPlanBySlug('free');

    const needsVerification = await verificationRequired();

    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      // With verification on, the answer is the same as for a new address, so it does not tell who has an account:
      // the owner of the address is told by email instead. Without it a new account signs in at once, so it cannot be hidden.
      if (needsVerification) {
        await hashPassword(password); // costs what creating the account would
        sendAccountExistsEmail(existingUser).catch((e) => console.error('Account notice failed:', e.message));
        return res.status(201).json({
          success: true,
          message: 'Account created. Check your email to verify your address.',
          data: { requiresVerification: true, emailSent: true, email: existingUser.email }
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // When verification is off, accounts are treated as verified so turning it on later never locks them out.
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      isEmailVerified: !needsVerification
    });

    // Every new user starts on the Free plan
    const { subscription } = await getSubscriptionDetails(user.id);

    if (needsVerification) {
      let emailSent = true;
      try {
        await issueVerification(user);
      } catch (mailError) {
        emailSent = false;
        console.error('Verification email failed:', mailError.message);
      }
      return res.status(201).json({
        success: true,
        message: emailSent
          ? 'Account created. Check your email to verify your address.'
          : 'Account created, but the verification email could not be sent. Use "Resend email" on the login page.',
        data: { requiresVerification: true, emailSent, email: user.email }
      });
    }

    const token = generateToken(user.id);
    syncAssetCookie(req, res, token);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        subscription,
        ...handOver(req, res, token),
        ...rememberDevice(req, res, user.email)
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }
    if (error.code === 'PLAN_NOT_FOUND') {
      return res.status(503).json({ success: false, message: 'The server is not set up yet. Ask the administrator to run the database migrations.' });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating account',
      error: error.message
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const account = email.toLowerCase();
    if (await tooManyAttempts(req, res, account)) return;

    const user = await User.findOne({
      where: { email: account },
      attributes: { include: ['password'] }
    });

    if (!user) {
      await recordFailure(req, account);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      await recordFailure(req, account);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Contact an administrator.'
      });
    }

    if (!user.isEmailVerified && await verificationRequired()) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before signing in. Check your inbox or request a new link.'
      });
    }

    await clearFailures(req, account);
    // isOnline is owned by the socket connect/disconnect handlers, not by login
    const token = generateToken(user.id);
    syncAssetCookie(req, res, token);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        ...handOver(req, res, token),
        ...rememberDevice(req, res, user.email)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }
    const user = await User.findOne({ where: { emailVerifyToken: hashToken(token) } });
    if (!user || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'This verification link is invalid or has expired. Request a new one from the login page.' });
    }
    user.isEmailVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpires = null;
    await user.save();
    res.json({ success: true, message: 'Email verified. You can now sign in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Error verifying email' });
  }
});

// Always answers the same way so it can't be used to discover which emails have accounts.
router.post('/resend-verification', async (req, res) => {
  const generic = { success: true, message: 'If that account exists and is not verified yet, a new verification email has been sent.' };
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!(await verificationRequired())) return res.json(generic);

    const user = await User.findOne({ where: { email: String(email).toLowerCase() } });
    if (user && !user.isEmailVerified && user.isActive !== false) {
      const last = user.emailVerifySentAt ? user.emailVerifySentAt.getTime() : 0;
      // inside the cooldown nothing is sent, and the answer does not change
      if (Date.now() - last >= RESEND_COOLDOWN_MS) await issueVerification(user);
    }
    res.json(generic);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Could not send the verification email. Try again later.' });
  }
});

// Forgotten password: a one-time code by email, then a new password. Never says whether an account exists.
const RESET_SENT = { success: true, message: 'If that account exists, a reset code has been emailed to it.' };
const resetKey = (userId) => `reset:${userId}`;
// A six-digit code can be re-requested every minute, so the wrong guesses themselves are counted, whether or not an
// account exists: 10 a day from one place and 50 for the address as a whole. A device that has signed in before has
// its own 10, so strangers cannot use up the owner's chances.
const DAY = 24 * 60 * 60 * 1000;
const resetGuesses = createRateLimiter({ windowMs: DAY, max: 10, prefix: 'rl:reset', durable: true });
const resetForAddress = createRateLimiter({ windowMs: DAY, max: 50, prefix: 'rl:reset-all', durable: true });
const resetCounters = (req, email) => {
  const device = knownDevice(req, email);
  return device ? [[resetGuesses, `${email}|${device}`, 10]] : [[resetGuesses, `${email}|${req.ip}`, 10], [resetForAddress, email, 50]];
};

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!isSmtpConfigured()) {
      return res.status(503).json({ success: false, message: 'Password reset by email is not set up on this server. Ask your administrator.' });
    }
    const user = await User.findOne({ where: { email } });
    if (user && user.isActive !== false) {
      const code = await issueCode(resetKey(user.id)); // null inside the one-minute cooldown
      if (code) sendPasswordResetEmail(user, code).catch((e) => console.error('Reset email failed:', e.message));
    }
    res.json(RESET_SENT);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Could not start the password reset' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { code, newPassword } = req.body;
    if (!email || !code || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, message: 'Email, code and new password are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const counters = resetCounters(req, email);
    for (const [limiter, key, max] of counters) {
      if (await limiter.count(key) >= max) {
        return res.status(429).json({ success: false, message: 'Too many wrong codes. Try again tomorrow, or ask your administrator.' });
      }
    }
    const user = await User.findOne({ where: { email }, attributes: { include: ['password'] } });
    if (!user || user.isActive === false || !(await consumeCode(resetKey(user.id), code))) {
      for (const [limiter, key] of counters) await limiter.hit(key);
      return res.status(400).json({ success: false, message: 'That code is wrong or has expired' });
    }
    user.password = newPassword; // hashed by the model hook
    user.isEmailVerified = true; // they have just shown they read this address
    await user.save();
    await revokeUserSessions(user.id);
    disconnectUser(req.app.get('io'), user.id);
    // reading the emailed code proves ownership: this device can sign in even while strangers are guessing
    res.json({ success: true, message: 'Password changed. Sign in with your new password.', data: rememberDevice(req, res, email) });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Could not reset the password' });
  }
});

// Everything the service holds about the signed-in person, as one download
router.get('/me/export', protect, async (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    res.json(await exportAccount(req.user.id));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Could not export your data' });
  }
});

// Delete the signed-in person's account. The password is asked again: a borrowed session must not be enough.
router.delete('/me', protect, async (req, res) => {
  try {
    const account = `delete:${req.user.id}`;
    if (await tooManyAttempts(req, res, account)) return;
    if (!req.body?.password || !(await req.user.comparePassword(req.body.password))) {
      await recordFailure(req, account);
      return res.status(403).json({ success: false, message: 'The password is not correct' });
    }
    await eraseAccount(req.user.id, req.app.get('io'));
    clearSessionCookies(req, res);
    res.json({ success: true, message: 'Your account has been deleted' });
  } catch (error) {
    if (error instanceof AccountError) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Account deletion error:', error);
    res.status(500).json({ success: false, message: 'Could not delete the account' });
  }
});

// For the web app, which cannot read its session cookie, to open its live connection
router.get('/socket-ticket', protect, (req, res) => {
  res.json({ success: true, data: { ticket: generateSocketTicket(req.user.id, req.sessionToken) } });
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const { subscription, usage } = await getSubscriptionDetails(req.user.id);

    res.json({
      success: true,
      data: { user: user.toJSON(), subscription, usage }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

router.put('/profile', protect, async (req, res) => {
  try {
    if (req.body.name !== undefined && String(req.body.name).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name needs at least 2 characters' });
    }
    const updateData = pickProfileFields(req.body);
    if (Object.keys(updateData).length) await User.update(updateData, { where: { id: req.user.id } });

    const user = await User.findByPk(req.user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toJSON() }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Error updating profile' });
  }
});

// Per account, so a stolen session can't be used to guess the current password
const passwordAttempts = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'rl:password' });
const otpKey = (userId) => `password:${userId}`;

// Checks shared by both steps. Answers the request and returns false when something is wrong.
// 400, not 401: the client treats 401 as "session expired" and would sign the user out.
const passwordChangeAllowed = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const fail = (status, message) => { res.status(status).json({ success: false, message }); return false; };
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
    return fail(400, 'Current and new password are required');
  }
  if (newPassword.length < 6) return fail(400, 'Password must be at least 6 characters');
  if (await passwordAttempts.hit(req.user.id) > 10) return fail(429, 'Too many attempts. Try again in 15 minutes.');
  if (!(await req.user.comparePassword(currentPassword))) return fail(400, 'Current password is incorrect');
  if (newPassword === currentPassword) return fail(400, 'Choose a password different from the current one');
  return true;
};

// Step 1: email a one-time code
router.post('/change-password/code', protect, async (req, res) => {
  try {
    if (!(await passwordChangeAllowed(req, res))) return;
    if (!isSmtpConfigured()) {
      return res.status(503).json({ success: false, message: 'Email is not set up on this server, so a code cannot be sent. Contact an administrator.' });
    }
    const code = await issueCode(otpKey(req.user.id));
    if (!code) return res.status(429).json({ success: false, message: 'A code was just sent. Wait a minute before asking for another.' });
    try {
      await sendPasswordCodeEmail(req.user, code);
    } catch (mailError) {
      await clearCode(otpKey(req.user.id));
      console.error('Password code email failed:', mailError.message);
      return res.status(502).json({ success: false, message: 'The code could not be emailed. Try again later.' });
    }
    res.json({ success: true, message: 'Code sent', data: { email: req.user.email } });
  } catch (error) {
    console.error('Password code error:', error);
    res.status(500).json({ success: false, message: 'Error sending the code' });
  }
});

// Step 2: change it, with the code
router.post('/change-password', protect, async (req, res) => {
  try {
    if (!(await passwordChangeAllowed(req, res))) return;
    if (!(await consumeCode(otpKey(req.user.id), req.body.code))) {
      return res.status(400).json({ success: false, message: 'That code is wrong or has expired' });
    }

    req.user.password = req.body.newPassword; // hashed by the model hook
    await req.user.save();
    await revokeUserSessions(req.user.id);
    disconnectUser(req.app.get('io'), req.user.id);

    const token = generateToken(req.user.id);
    syncAssetCookie(req, res, token); // replaces the cookie holding the just-revoked token
    res.json({ success: true, message: 'Password changed', data: handOver(req, res, token) });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Error changing password' });
  }
});

// Profile photo: multipart field "avatar" (JPG/PNG/WebP/GIF, max 5 MB)
router.post('/profile/avatar', protect, handleAvatarUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    const user = await User.findByPk(req.user.id);
    await saveAvatar(user, req.file);
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not save photo' });
  }
});

router.delete('/profile/avatar', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    await clearAvatar(user);
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not remove photo' });
  }
});

// Public profile card of another (active) user: only fields that are safe to show to any signed-in user.
router.get('/users/:id', protect, async (req, res) => {
  try {
    const u = await User.findOne({
      where: { id: req.params.id, isActive: true },
      attributes: ['id', 'name', 'email', 'avatar', 'title', 'department', 'location', 'timezone', 'bio',
        'customStatus', 'statusEmoji', 'statusExpiresAt', 'isOnline', 'lastSeen']
    });
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    const user = u.toJSON();
    // the full address is for yourself, teammates and people who have written to you
    if (u.id !== req.user.id && !(await contactIdsOf(req.user.id)).has(u.id)) {
      user.email = maskEmail(user.email);
      delete user.phone;
    }
    res.json({ success: true, data: { user } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading profile' });
  }
});

// Presence: custom status with optional expiry
router.put('/status', protect, async (req, res) => {
  try {
    const { customStatus, statusEmoji, statusExpiresAt } = req.body;

    const updateData = {
      customStatus: customStatus ? String(customStatus).slice(0, 100) : null,
      statusEmoji: statusEmoji ? String(statusEmoji).slice(0, 10) : null,
      statusExpiresAt: statusExpiresAt ? new Date(statusExpiresAt) : null
    };

    await User.update(updateData, { where: { id: req.user.id } });

    const user = await User.findByPk(req.user.id);

    res.json({
      success: true,
      message: 'Status updated',
      data: { user: user.toJSON() }
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating status',
      error: error.message
    });
  }
});

router.post('/logout', protect, async (req, res) => {
  try {
    await User.update(
      { isOnline: false, lastSeen: new Date() },
      { where: { id: req.user.id } }
    );
    clearSessionCookies(req, res);
    await revokeToken(req.sessionToken); // logout now really ends the session on every node
    disconnectSession(req.app.get('io'), req.sessionToken);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging out',
      error: error.message
    });
  }
});

export default router;
