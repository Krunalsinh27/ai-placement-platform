const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

async function extractTextFromPdf(buffer) {
  const pdfModule = require('pdf-parse');
  if (typeof pdfModule === 'function') {
    const data = await pdfModule(buffer);
    return data.text || '';
  }
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      return res.text || '';
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy().catch(() => {});
      }
    }
  }
  throw new Error('Unsupported pdf-parse module format');
}

async function runLiveStudentAudit() {
  console.log('======================================================================');
  console.log('TEST SUITE: LIVE STUDENT END-TO-END ACCEPTANCE AUDIT');
  console.log('======================================================================');

  const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:5000/api';

  // Step 1: Student Authentication (via environment variables or JWT signing)
  console.log('\n--- Step 1: Student Authentication ---');
  let token = null;
  const studentEmail = process.env.TEST_STUDENT_EMAIL || 's91453604@gmail.com';
  const studentPassword = process.env.TEST_STUDENT_PASSWORD;

  if (studentPassword) {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: studentEmail,
        password: studentPassword,
      }),
    });
    assert.strictEqual(loginRes.status, 200, 'Login must succeed with HTTP 200');
    const loginData = await loginRes.json();
    token = loginData.token;
  } else {
    // Secure token generation without hardcoding passwords
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    const { User } = require('../models');
    const user = await User.findOne({ email: studentEmail });
    assert.ok(user, `Student user ${studentEmail} must exist`);
    token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
        college: (user.college?._id || user.college)?.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
  assert.ok(token, 'Must possess a valid authorized token');
  const maskedEmail = studentEmail.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '***' + c);
  console.log(`  ✓ Successfully authorized for student ${maskedEmail}`);

  // Step 2: Open Resume Builder Dashboard
  console.log('\n--- Step 2: Resume Builder Dashboard ---');
  const dashRes = await fetch(`${BASE_URL}/resume-studio/resumes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(dashRes.status, 200);
  const dashData = await dashRes.json();
  assert.ok(dashData.resumes.length >= 1, 'Must have at least one active resume');
  console.log(`  ✓ Dashboard retrieved: ${dashData.resumes.length} active resume(s) visible`);

  // Step 3 & 4: Open existing resume and verify saved content
  console.log('\n--- Step 3 & 4: Open Existing Resume ---');
  const targetResume = dashData.resumes.find((r) => r.isPrimary) || dashData.resumes[0];
  const resumeId = targetResume._id;
  const detailRes = await fetch(`${BASE_URL}/resume-studio/resumes/${resumeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(detailRes.status, 200);
  const detailData = await detailRes.json();
  const existingResume = detailData.resume;
  console.log(`  ✓ Opened resume "${existingResume.title}" (ID: ${existingResume._id})`);
  assert.ok(existingResume.title, 'Resume must have title');
  assert.ok(existingResume.templateId, 'Resume must have templateId');

  // Step 5, 6, 7: Update Categorized Skills, Languages (English, Hindi, Gujarati), and Link Display Preferences
  console.log('\n--- Step 5, 6 & 7: Edit Skills, Languages & Link Display Options ---');
  const updatedData = {
    ...existingResume.data,
    contact: {
      ...(existingResume.data?.contact || {}),
      fullName: 'Krunalsinh',
      email: 's91453604@gmail.com',
      phone: '9723621008',
      linkedin: 'https://linkedin.com/in/krunal-patel',
      linkedinDisplay: 'short',
      github: 'https://github.com/krunal-patel',
      githubDisplay: 'short',
    },
    skills: [
      {
        category: 'Programming Languages',
        items: ['JavaScript', 'TypeScript', 'Python', 'C++'],
      },
      {
        category: 'Frontend Development',
        items: ['React', 'Tailwind CSS', 'Vite'],
      },
      {
        category: 'Backend Development',
        items: ['Node.js', 'Express', 'MongoDB'],
      },
    ],
    languages: ['English', 'Hindi', 'Gujarati'],
  };

  const saveRes = await fetch(`${BASE_URL}/resume-studio/resumes/${resumeId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: existingResume.title,
      templateId: existingResume.templateId,
      data: updatedData,
    }),
  });
  assert.strictEqual(saveRes.status, 200, 'Save must succeed with HTTP 200');
  console.log('  ✓ Resume successfully saved with categorized skills, 3 languages, and short links');

  // Step 8 & 9: Simulate page refresh and verify persistence
  console.log('\n--- Step 8 & 9: Reload and Verify Persistence ---');
  const reloadRes = await fetch(`${BASE_URL}/resume-studio/resumes/${resumeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(reloadRes.status, 200);
  const reloadedData = (await reloadRes.json()).resume;
  
  // Verify skills persistence
  assert.strictEqual(reloadedData.data.skills.length, 3, 'Must have 3 skill categories');
  assert.strictEqual(reloadedData.data.skills[0].category, 'Programming Languages');
  assert.ok(reloadedData.data.skills[0].items.includes('TypeScript'));
  console.log('  ✓ Verified: Categorized skills persisted across reload');

  // Verify languages persistence
  assert.deepStrictEqual(reloadedData.data.languages, ['English', 'Hindi', 'Gujarati']);
  console.log('  ✓ Verified: Languages [English, Hindi, Gujarati] persisted across reload');

  // Verify link display preference persistence
  assert.strictEqual(reloadedData.data.contact.linkedinDisplay, 'short');
  assert.strictEqual(reloadedData.data.contact.githubDisplay, 'short');
  console.log('  ✓ Verified: LinkedIn & GitHub short display preferences persisted');

  // Step 10 & 11: Download and verify PDF export with clickable links
  console.log('\n--- Step 10 & 11: Export PDF and Verify Embedded Hyperlinks ---');
  const exportRes = await fetch(`${BASE_URL}/resume-studio/resumes/${resumeId}/export-pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(exportRes.status, 200, 'PDF export must return HTTP 200');
  assert.strictEqual(exportRes.headers.get('content-type'), 'application/pdf');
  const pdfArrayBuffer = await exportRes.arrayBuffer();
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  assert.ok(pdfBuffer.length > 1000, 'PDF buffer must be valid size');
  assert.strictEqual(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'Must start with %PDF');

  const pdfText = await extractTextFromPdf(pdfBuffer);
  assert.ok(pdfText.includes('LinkedIn'), 'PDF text must contain short label "LinkedIn"');
  assert.ok(pdfText.includes('GitHub'), 'PDF text must contain short label "GitHub"');
  assert.ok(pdfText.includes('English'), 'PDF text must contain English');
  assert.ok(pdfText.includes('Hindi'), 'PDF text must contain Hindi');
  assert.ok(pdfText.includes('Gujarati'), 'PDF text must contain Gujarati');

  const rawPdfString = pdfBuffer.toString('binary');
  assert.ok(rawPdfString.includes('/Subtype /Link') || rawPdfString.includes('/Subtype/Link'), 'Must contain PDFKit /Subtype /Link annotation');
  assert.ok(rawPdfString.includes('https://linkedin.com/in/krunal-patel'), 'Must contain LinkedIn destination URL');
  assert.ok(rawPdfString.includes('https://github.com/krunal-patel'), 'Must contain GitHub destination URL');
  console.log('  ✓ PDF generated: Verified text content, short labels, and clickable PDFKit hyperlink annotations');

  // Step 12 & 13: Delete only disposable test resume and verify primary promotion
  console.log('\n--- Step 12 & 13: Disposable Test Resume Creation & Atomic Promotion ---');
  const createTempRes = await fetch(`${BASE_URL}/resume-studio/resumes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: '__TEST_LIVE_DISPOSABLE__',
      templateId: 'modern',
      isPrimary: true,
      data: { contact: { fullName: 'Temp Student' } },
    }),
  });
  assert.strictEqual(createTempRes.status, 201);
  const tempResume = (await createTempRes.json()).resume;
  assert.strictEqual(tempResume.isPrimary, true);
  console.log(`  ✓ Created temporary primary resume "${tempResume.title}" (ID: ${tempResume._id})`);

  // Soft delete (move to trash) ONLY the disposable resume
  const deleteTempRes = await fetch(`${BASE_URL}/resume-studio/resumes/${tempResume._id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(deleteTempRes.status, 200);
  console.log(`  ✓ Soft-deleted temporary resume ${tempResume._id}`);

  // Verify original resume was atomically promoted back to primary
  const checkPromotedRes = await fetch(`${BASE_URL}/resume-studio/resumes/${resumeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(checkPromotedRes.status, 200);
  const promotedResume = (await checkPromotedRes.json()).resume;
  assert.strictEqual(promotedResume.isPrimary, true, 'Original resume must be auto-promoted back to primary');
  console.log(`  ✓ Verified: Original resume "${promotedResume.title}" (${promotedResume._id}) automatically re-promoted to isPrimary: true`);

  console.log('\n======================================================================');
  console.log('ALL 13 LIVE STUDENT AUDIT STEPS COMPLETED SUCCESSFULLY (0 FAILURES)');
  console.log('======================================================================');
}

runLiveStudentAudit().catch((err) => {
  console.error('\n❌ Live Student Audit Failed:', err);
  process.exit(1);
});
