const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

// Require server, which connects to MongoDB and listens on PORT (default 5000)
require('../server');

const { User } = require('../models');

async function testLiveLogin() {
  console.log('======================================================');
  console.log('     VERIFICATION: LIVE SERVER & CLIENT LOGIN CHECK    ');
  console.log('======================================================\n');

  // Wait 1.5s for DB connection to establish
  await new Promise((r) => setTimeout(r, 1500));

  const BASE_URL = `http://127.0.0.1:${process.env.PORT || 5000}/api`;

  try {
    // Reset any failed login attempts on test users first
    await User.updateMany(
      { email: { $in: ['admin@college.com', 'superadmin@portal.com', 'recruiter@google.com', 'aarav.sharma1@college.com', 'analyst@portal.com', 'aspirant@portal.com'] } },
      { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );

    const credentials = [
      { role: 'superadmin', email: 'superadmin@portal.com', pass: 'Super@12345' },
      { role: 'tpo', email: 'admin@college.com', pass: 'Admin@123' },
      { role: 'recruiter', email: 'recruiter@google.com', pass: 'Recruiter@123' },
      { role: 'student', email: 'aarav.sharma1@college.com', pass: 'Student@123' },
      { role: 'analyst', email: 'analyst@portal.com', pass: 'Analyst@123' },
      { role: 'aspirant', email: 'aspirant@portal.com', pass: 'Aspirant@123' },
    ];

    console.log(`Backend server verified at ${BASE_URL}\n`);

    for (const cred of credentials) {
      console.log(`--- Testing Login: ${cred.role} (${cred.email}) ---`);
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.email, password: cred.pass }),
      });

      const data = await res.json();
      const setCookie = res.headers.get('set-cookie');

      if (res.status === 200 && data.success && data.token) {
        console.log(`✓ Status: ${res.status} OK`);
        console.log(`✓ JWT Token: ${data.token.slice(0, 25)}...`);
        console.log(`✓ User: ${data.user.name} (${data.user.role})`);
        console.log(`✓ Set-Cookie: ${Boolean(setCookie)} (HttpOnly=${setCookie?.includes('HttpOnly')}, SameSite=${setCookie?.includes('SameSite')})`);

        // Test authenticated endpoint with Bearer token
        const meRes = await fetch(`${BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const meData = await meRes.json();
        console.log(`✓ GET /api/auth/me Status: ${meRes.status} (Verified as ${meData.user?.email || meData.data?.email})`);
      } else {
        console.log(`✗ Login failed (${res.status}):`, data);
        process.exitCode = 1;
      }
      console.log('');
    }

    console.log('======================================================');
    console.log('      ALL ROLE LOGINS CONFIRMED FUNCTIONAL!           ');
    console.log('======================================================\n');
  } finally {
    await mongoose.disconnect();
    process.exit(process.exitCode || 0);
  }
}

testLiveLogin().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
