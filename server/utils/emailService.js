const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');

/**
 * Clean responsive HTML email template generator
 */
const buildEmailHtml = ({ title, subtitle, name, otp, purposeText, warningText }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px 30px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">Placement Portal</h1>
              <p style="color: #c7d2fe; font-size: 13px; margin: 6px 0 0 0; font-weight: 500;">${subtitle}</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 35px 35px 25px 35px;">
              <p style="font-size: 15px; line-height: 24px; margin: 0 0 16px 0; color: #334155;">
                Hello <strong>${name || 'there'}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 22px; margin: 0 0 24px 0; color: #475569;">
                ${purposeText} Use the 6-digit one-time verification code below to proceed:
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 22px 15px; text-align: center; margin: 0 0 25px 0;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 9px; color: #4f46e5; display: inline-block; padding-left: 9px;">
                  ${otp}
                </span>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b; font-weight: 600;">
                  ⏰ Valid for 10 minutes (Single use only)
                </p>
              </div>

              <!-- Security Warning -->
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #991b1b;">
                  <strong>Security Reminder:</strong> ${warningText || 'Never share your one-time verification code with anyone. Placement Portal officials will never ask for your code.'}
                </p>
              </div>

              <p style="font-size: 13px; line-height: 20px; color: #64748b; margin: 0;">
                If you did not request this verification code, please ignore this email or reach out to your college training & placement cell immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                © ${new Date().getFullYear()} Placement Portal. All rights reserved. Automated security notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Print simulated OTP in terminal console for easy development & testing
 */
const printConsoleOtp = (to, name, otp, purpose) => {
  console.log('\n================================================================');
  console.log('                 📧  EMAIL OTP SIMULATOR  📧                   ');
  console.log('================================================================');
  console.log(` To:       ${to} (${name || 'User'})`);
  console.log(` Purpose:  ${purpose}`);
  console.log(` Code:     >>>  ${otp}  <<<`);
  console.log(` Valid:    10 minutes (Max 5 attempts)`);
  console.log('================================================================\n');
};

/**
 * Create nodemailer transporter with sanitized options
 */
const createTransporter = () => {
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;

  // Strip all whitespaces from password (supports Gmail 16-character app passwords with spaces)
  const cleanPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: cleanPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
};

// Blocked test/dummy domains that should NEVER receive real emails, even in production
const BLOCKED_DOMAINS = [
  'example.com',
  'example.org',
  'test.com',
  'portal.com',
  'college.com',
  'localhost',
  'invalid',
];

// In-memory sliding window for rate-limiting real SMTP sends
let smtpSendTimestamps = [];

/**
 * Check if domain is in the blocked list
 */
const isBlockedDomain = (email) => {
  if (!email || typeof email !== 'string') return true;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length < 2) return true;
  const domain = parts[parts.length - 1];
  return BLOCKED_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
  );
};

/**
 * Check if real SMTP delivery is permitted for the given recipient.
 * Returns { allowed: true } or { allowed: false, reason: string, mode: 'console' | 'skipped' }
 */
const shouldSendRealSmtp = (recipientEmail) => {
  // 1. Never send real email in test environment
  if (process.env.NODE_ENV === 'test') {
    return { allowed: false, reason: 'NODE_ENV is test', mode: 'console' };
  }

  // 2. EMAIL_MODE must be explicitly "smtp"
  const emailMode = (process.env.EMAIL_MODE || '').trim().toLowerCase();
  if (emailMode !== 'smtp') {
    return {
      allowed: false,
      reason: `EMAIL_MODE is "${emailMode || 'unset'}"`,
      mode: 'console',
    };
  }

  // 3. SMTP must be configured
  if (!isSmtpConfigured()) {
    return { allowed: false, reason: 'SMTP is not configured', mode: 'console' };
  }

  // 4. Validate email and check blocked domains (applies in ALL environments including production)
  if (!recipientEmail || typeof recipientEmail !== 'string') {
    return { allowed: false, reason: 'Missing or invalid recipient address', mode: 'skipped' };
  }

  const cleanEmail = recipientEmail.trim().toLowerCase();
  if (isBlockedDomain(cleanEmail)) {
    const domain = cleanEmail.split('@')[1] || cleanEmail;
    return {
      allowed: false,
      reason: `Blocked domain "${domain}"`,
      mode: 'skipped',
    };
  }

  // 5. In non-production environments, recipient MUST be in EMAIL_DEV_ALLOWLIST
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const rawAllowlist = process.env.EMAIL_DEV_ALLOWLIST || '';
    const allowlist = rawAllowlist
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!allowlist.includes(cleanEmail)) {
      return {
        allowed: false,
        reason: `Recipient "${cleanEmail}" not in EMAIL_DEV_ALLOWLIST`,
        mode: 'skipped',
      };
    }
  }

  // 6. Real SMTP per-minute rate limit cap
  const maxPerMinute = Number(process.env.EMAIL_MAX_PER_MINUTE) || 20;
  const now = Date.now();
  smtpSendTimestamps = smtpSendTimestamps.filter((ts) => now - ts < 60000);
  if (smtpSendTimestamps.length >= maxPerMinute) {
    return {
      allowed: false,
      reason: `Per-minute SMTP send cap reached (${smtpSendTimestamps.length}/${maxPerMinute})`,
      mode: 'skipped',
    };
  }

  return { allowed: true };
};

const recordRealSmtpSend = () => {
  smtpSendTimestamps.push(Date.now());
};

const resetSmtpRateLimit = () => {
  smtpSendTimestamps = [];
};

/**
 * Check if SMTP is configured and allowed by EMAIL_MODE
 */
const isSmtpConfigured = () => {
  const emailMode = (process.env.EMAIL_MODE || '').toLowerCase();
  if (emailMode === 'console') return false;

  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
};

/**
 * Verify transporter connectivity on server boot
 */
const verifyTransporter = async () => {
  if (process.env.NODE_ENV === 'test') {
    return { ok: false, mode: 'console', reason: 'NODE_ENV=test configured' };
  }

  const emailMode = (process.env.EMAIL_MODE || '').toLowerCase();
  if (emailMode === 'console') {
    return { ok: false, mode: 'console', reason: 'EMAIL_MODE=console configured' };
  }

  const hasConfig = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

  if (!hasConfig) {
    const missing = [];
    if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
    if (!process.env.SMTP_USER) missing.push('SMTP_USER');
    if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
    return {
      ok: false,
      mode: 'console',
      reason: `SMTP credentials missing: ${missing.join(', ')}`,
    };
  }

  try {
    const transporter = createTransporter();
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection verification timed out after 5s')), 5000)
      ),
    ]);
    return { ok: true, mode: 'smtp', host: process.env.SMTP_HOST };
  } catch (err) {
    return {
      ok: false,
      mode: 'console',
      reason: `transporter.verify() failed: ${err.message}`,
      error: err.message,
    };
  }
};

/**
 * Send email with a strict timeout (default 10s)
 */
const sendWithTimeout = async (transporter, mailOptions, timeoutMs = 10000) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`SMTP send timeout exceeded (${timeoutMs / 1000}s)`));
    }, timeoutMs);
  });

  try {
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      timeoutPromise,
    ]);
    clearTimeout(timeoutHandle);
    return info;
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
};

/**
 * Internal email dispatcher
 */
const sendEmail = async ({
  to,
  name,
  subject,
  otp,
  purpose,
  subtitle,
  purposeText,
  warningText,
  user = null,
}) => {
  const html = buildEmailHtml({
    title: subject,
    subtitle: subtitle || 'Campus Placement & Recruitment System',
    name,
    otp,
    purposeText,
    warningText,
  });

  const text = `Placement Portal Verification Code: ${otp}\n\nHello ${name || 'there'},\n${purposeText}\nYour code is: ${otp}\nThis code is valid for 10 minutes.\nNever share this code with anyone.`;

  const guard = shouldSendRealSmtp(to);

  // If real SMTP is not allowed by policy
  if (!guard.allowed) {
    console.log(`[EmailService:Simulated] To: ${to} | Mode: ${guard.mode} (${guard.reason})`);
    if (otp) {
      printConsoleOtp(to, name, otp, purpose);
    }

    // Record in EmailLog if user is provided
    if (user && user._id) {
      try {
        await EmailLog.create({
          user: user._id,
          recipientEmail: to,
          recipientName: name || '',
          type: purpose === 'RESET PASSWORD' ? 'password_reset' : 'verification_otp',
          subject,
          htmlBody: html,
          textBody: text,
          status: 'sent',
          attempts: 1,
          sentAt: new Date(),
          metadata: { mode: guard.mode, reason: guard.reason },
        });
      } catch (_) {}
    }

    return { success: true, mode: guard.mode, reason: guard.reason };
  }

  // Use SMTP when guard permits
  try {
    const transporter = createTransporter();
    const mailFrom = process.env.MAIL_FROM || `"Placement Portal" <${process.env.SMTP_USER}>`;

    const info = await sendWithTimeout(
      transporter,
      {
        from: mailFrom,
        to,
        subject,
        text,
        html,
      },
      10000
    );

    recordRealSmtpSend();

    // Log successful send in EmailLog
    if (user && user._id) {
      try {
        await EmailLog.create({
          user: user._id,
          recipientEmail: to,
          recipientName: name || '',
          type: purpose === 'RESET PASSWORD' ? 'password_reset' : 'verification_otp',
          subject,
          htmlBody: html,
          textBody: text,
          status: 'sent',
          attempts: 1,
          sentAt: new Date(),
          metadata: { messageId: info.messageId, mode: 'smtp' },
        });
      } catch (_) {}
    }

    return { success: true, messageId: info.messageId, mode: 'smtp' };
  } catch (error) {
    console.error(`[EmailService] Failed to send email via SMTP to ${to}:`, error.message);

    // Log failure in EmailLog
    if (user && user._id) {
      try {
        await EmailLog.create({
          user: user._id,
          recipientEmail: to,
          recipientName: name || '',
          type: purpose === 'RESET PASSWORD' ? 'password_reset' : 'verification_otp',
          subject,
          htmlBody: html,
          textBody: text,
          status: 'failed',
          attempts: 1,
          error: error.message,
          metadata: { mode: 'smtp' },
        });
      } catch (_) {}
    }

    return { success: false, error: error.message };
  }
};

/**
 * Send email verification code directly
 */
const sendVerificationEmail = async (to, name, otp, user = null) => {
  return await sendEmail({
    to,
    name,
    subject: `Your Placement Portal Verification Code: ${otp}`,
    otp,
    purpose: 'VERIFY EMAIL ADDRESS',
    subtitle: 'Account Verification',
    purposeText: 'Thank you for registering on Placement Portal! To activate your account and verify your email address,',
    warningText: 'Do not share this verification code with anyone. Our support team will never request this code.',
    user,
  });
};

/**
 * Send password reset code directly
 */
const sendPasswordResetEmail = async (to, name, otp, user = null) => {
  return await sendEmail({
    to,
    name,
    subject: `Your Password Reset Code: ${otp}`,
    otp,
    purpose: 'RESET PASSWORD',
    subtitle: 'Password Reset Request',
    purposeText: 'We received a request to reset the password for your Placement Portal account.',
    warningText: 'If you did not request a password reset, please secure your account immediately or notify your administrator.',
    user,
  });
};

/**
 * Send raw email with support for attachments and reply-to (used by background queue)
 */
const sendRawEmail = async ({ to, subject, text, html, attachments, replyTo }) => {
  const guard = shouldSendRealSmtp(to);

  if (!guard.allowed) {
    console.log(
      `[EmailService:Simulated] To: ${to} | Subject: "${subject}" | Mode: ${guard.mode} (${guard.reason})`
    );
    return { success: true, mode: guard.mode, reason: guard.reason };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.MAIL_FROM || `"Placement Portal" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || 'Please view this notification in an HTML-compatible email client.',
      html,
    };

    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await sendWithTimeout(transporter, mailOptions, 10000);
    recordRealSmtpSend();
    return { success: true, messageId: info.messageId, mode: 'smtp' };
  } catch (error) {
    console.error(`[EmailService] Failed to send email via SMTP to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to an approver (TPO or Admin) about a pending student or TPO registration
 */
const sendApprovalNoticeEmail = async ({ to, approverName, registrantName, registrantRole, collegeName, reviewLink }) => {
  const subject = `Action Required: New ${registrantRole === 'tpo' ? 'TPO' : 'Student'} Registration Pending Approval`;
  const text = `Hello ${approverName || 'TPO'},\n\nA new ${registrantRole === 'tpo' ? 'TPO colleague' : 'student'}, ${registrantName}, has registered for ${collegeName} and requires your approval.\n\nPlease review and approve at:\n${reviewLink || 'your dashboard'}\n\nPlacement Portal`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #4f46e5; margin-top: 0;">New Account Pending Approval</h2>
      <p style="color: #334155; font-size: 14px;">Hello <strong>${approverName || 'TPO'}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">A new <strong>${registrantRole === 'tpo' ? 'TPO colleague' : 'student'}</strong>, <strong>${registrantName}</strong>, has registered for <strong>${collegeName}</strong> and requires your approval before they can access the portal.</p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${reviewLink}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Review & Approve</a>
      </div>
      <p style="color: #64748b; font-size: 12px;">Link: <a href="${reviewLink}">${reviewLink}</a></p>
    </div>
  `;
  return await sendRawEmail({ to, subject, text, html });
};

/**
 * Send notification to user that their account was approved
 */
const sendAccountApprovedEmail = async ({ to, name, role, collegeName }) => {
  const subject = 'Your Placement Portal Account Has Been Approved!';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const text = `Hello ${name || 'there'},\n\nGreat news! Your ${role?.toUpperCase() || 'user'} account for ${collegeName || 'your college'} has been approved.\n\nYou can now log in to your account: ${clientUrl}/login\n\nPlacement Portal`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #10b981; margin-top: 0;">Account Approved!</h2>
      <p style="color: #334155; font-size: 14px;">Hello <strong>${name || 'there'}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your <strong>${role?.toUpperCase() || 'account'}</strong> for <strong>${collegeName || 'your institution'}</strong> has been approved by your administrator.</p>
      <p style="color: #334155; font-size: 14px;">You can now log in to the Placement Portal to access your dashboard.</p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${clientUrl}/login" style="background-color: #10b981; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Go to Login</a>
      </div>
    </div>
  `;
  return await sendRawEmail({ to, subject, text, html });
};

/**
 * Send notification to user that their account was rejected
 */
const sendAccountRejectedEmail = async ({ to, name, role, collegeName, reason }) => {
  const subject = 'Placement Portal Account Registration Status';
  const text = `Hello ${name || 'there'},\n\nYour registration request for ${collegeName || 'your college'} as a ${role || 'user'} could not be approved at this time.\n${reason ? `Reason: ${reason}\n` : ''}\nPlease contact your college Training & Placement cell if you believe this was in error.\n\nPlacement Portal`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #e11d48; margin-top: 0;">Registration Status Update</h2>
      <p style="color: #334155; font-size: 14px;">Hello <strong>${name || 'there'}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your registration request for <strong>${collegeName || 'your college'}</strong> as a <strong>${role || 'user'}</strong> could not be approved at this time.</p>
      ${reason ? `<p style="color: #64748b; font-size: 13px;">Reason: <em>${reason}</em></p>` : ''}
      <p style="color: #64748b; font-size: 12px; margin-top: 20px;">If you believe this was in error, please reach out to your college Training & Placement cell directly.</p>
    </div>
  `;
  return await sendRawEmail({ to, subject, text, html });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRawEmail,
  sendApprovalNoticeEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  buildEmailHtml,
  createTransporter,
  verifyTransporter,
  isSmtpConfigured,
  shouldSendRealSmtp,
  isBlockedDomain,
  BLOCKED_DOMAINS,
  resetSmtpRateLimit,
};
