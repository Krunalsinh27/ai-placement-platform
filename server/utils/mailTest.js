/**
 * Standalone SMTP Mail Tester Utility
 * Usage: node utils/mailTest.js you@example.com
 */
require('dotenv').config();
const { createTransporter, isSmtpConfigured } = require('./emailService');

const targetEmail = process.argv[2];

if (!targetEmail || !targetEmail.includes('@')) {
  console.error('\n❌ Error: Please provide a valid recipient email address.');
  console.error('Usage: node utils/mailTest.js you@example.com\n');
  process.exit(1);
}

async function runMailTest() {
  console.log('\n======================================================');
  console.log('            🧪  SMTP EMAIL DELIVERY TESTER  🧪         ');
  console.log('======================================================');
  console.log('Target Email    :', targetEmail);
  console.log('EMAIL_MODE      :', process.env.EMAIL_MODE || 'not set (defaults to smtp if configured)');
  console.log('SMTP_HOST       :', process.env.SMTP_HOST || '(not set)');
  console.log('SMTP_PORT       :', process.env.SMTP_PORT || '587 (default)');
  console.log('SMTP_SECURE     :', process.env.SMTP_SECURE || 'auto');
  console.log('SMTP_USER       :', process.env.SMTP_USER || '(not set)');
  console.log('SMTP_PASS set   :', Boolean(process.env.SMTP_PASS));
  console.log('MAIL_FROM       :', process.env.MAIL_FROM || `Default: "Placement Portal" <${process.env.SMTP_USER || 'none'}>`);
  console.log('======================================================\n');

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Error: Incomplete SMTP configuration.');
    console.error('Please ensure SMTP_HOST, SMTP_USER, and SMTP_PASS are set in your .env file.\n');
    process.exit(1);
  }

  const transporter = createTransporter();

  // 1. Verify connection
  console.log('⏳ Step 1: Testing SMTP handshake & authentication...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection and credentials verified successfully!\n');
  } catch (verifyErr) {
    console.error('❌ SMTP Connection/Authentication Verification Failed!');
    console.error('Error Code   :', verifyErr.code || 'UNKNOWN');
    console.error('Error Message:', verifyErr.message);
    if (verifyErr.response) {
      console.error('SMTP Response:', verifyErr.response);
    }
    console.error('\nFull Stack Trace:');
    console.error(verifyErr);
    process.exit(1);
  }

  // 2. Dispatch test message
  console.log(`⏳ Step 2: Dispatching test email to ${targetEmail}...`);
  const mailFrom = process.env.MAIL_FROM || `"Placement Portal Test" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from: mailFrom,
      to: targetEmail,
      subject: '✅ Placement Portal - SMTP Test Email Delivery',
      text: 'Congratulations! Your SMTP settings are properly configured. You can now send real OTP verification emails and notifications.',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #4f46e5; margin-top: 0;">✅ SMTP Test Successful!</h2>
          <p style="color: #334155; font-size: 14px; line-height: 22px;">
            This email confirms that your Placement Portal SMTP delivery configuration is working correctly.
          </p>
          <div style="background: #f8fafc; border-left: 4px solid #10b981; padding: 12px; font-size: 13px; color: #065f46; margin: 16px 0;">
            Sent from Host: <strong>${process.env.SMTP_HOST}</strong><br/>
            Authenticated as: <strong>${process.env.SMTP_USER}</strong>
          </div>
          <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
            Timestamp: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    console.log('✅ Email delivered successfully!');
    console.log('Message ID:', info.messageId);
    if (info.response) {
      console.log('Server response:', info.response);
    }
    console.log('\n======================================================\n');
    process.exit(0);
  } catch (sendErr) {
    console.error('\n❌ Failed to dispatch test email!');
    console.error('Error Code   :', sendErr.code || 'UNKNOWN');
    console.error('Error Message:', sendErr.message);
    if (sendErr.response) {
      console.error('SMTP Response:', sendErr.response);
    }
    console.error('\nFull Stack Trace:');
    console.error(sendErr);
    process.exit(1);
  }
}

runMailTest();

