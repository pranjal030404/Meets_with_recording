import express from 'express';
import crypto from 'crypto';
import { Op } from 'sequelize';
import User from '../models/User.js';
import { protect, generateToken, clearAssetCookie, revokeToken } from '../middleware/auth.js';
import { ensureSubscription, getSubscriptionDetails } from '../services/subscriptionService.js';
import { getSetting } from '../services/settingsService.js';
import { isSmtpConfigured, sendVerificationEmail } from '../services/mailService.js';

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

    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const needsVerification = await verificationRequired();

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

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        subscription,
        token
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
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

    const user = await User.findOne({
      where: { email: email.toLowerCase() },
      attributes: { include: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
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

    // isOnline is owned by the socket connect/disconnect handlers, not by login
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
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
      if (Date.now() - last < RESEND_COOLDOWN_MS) {
        return res.status(429).json({ success: false, message: 'Please wait a minute before requesting another email.' });
      }
      await issueVerification(user);
    }
    res.json(generic);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Could not send the verification email. Try again later.' });
  }
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
    const { name, avatar, timezone, title, department } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (avatar) updateData.avatar = avatar;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (title !== undefined) updateData.title = title;
    if (department !== undefined) updateData.department = department;

    await User.update(updateData, { where: { id: req.user.id } });

    const user = await User.findByPk(req.user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toJSON() }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
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
    clearAssetCookie(res);
    const bearer = req.headers.authorization?.startsWith('Bearer') ? req.headers.authorization.split(' ')[1] : null;
    if (bearer) await revokeToken(bearer); // logout now really ends the session on every node

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
