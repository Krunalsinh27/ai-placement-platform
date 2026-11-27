/**
 * Resume Studio Phase 9 Test Suite
 *
 * Verifies:
 * 1. Import creates a Resume draft from upload / text / profile using existing loadResumeSource and consolidated parser
 * 2. Honest missingFields reporting with zero invented filler
 * 3. Real-file regression tests for GitHub/LinkedIn link extraction (PDF and DOCX)
 * 4. Cover letter generation reusing generateCoverLetter (with AI quota & tokenMasker)
 * 5. Cover letter storage (CoverLetter model + sync with ResumeVersion.coverLetter)
 * 6. Cover letter editing, saving, and PDF streaming export
 * 7. Multi-tenant security and cross-student access denial (403/404)
 * 8. Strict Zod parameter and body validation
 */

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');

process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.AI_PROVIDER_CHAIN = 'mock';

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Resume,
  ResumeVersion,
  CoverLetter,
  AiUsage,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const resumeStudioRoutes = require('../routes/resumeStudioRoutes');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_dev_mode_only_change_in_production';

let server;
let baseUrl;
let testsPassed = 0;
let testsFailed = 0;

function createToken(userId, role, collegeId = null) {
  return jwt.sign(
    {
      id: userId,
      role,
      college: collegeId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ ${name} FAILED:`);
    console.error(err);
    testsFailed++;
  }
}

/**
 * Helper to create a real PDF buffer with clickable link annotations
 */
function makeAnnotatedPdf({ name, email, githubUrl, linkedinUrl }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const bufs = [];
    doc.on('data', (d) => bufs.push(d));
    doc.on('end', () => resolve(Buffer.concat(bufs)));

    doc.fontSize(16).text(name);
    doc.fontSize(10).text(`Email: ${email}`);
    doc.text('View My Open Source Projects', {
      link: githubUrl,
      underline: true,
    });
    doc.text('Professional LinkedIn Profile', {
      link: linkedinUrl,
      underline: true,
    });
    doc.moveDown();
    doc.fontSize(12).text('Skills');
    doc.fontSize(10).text('JavaScript, TypeScript, Node.js, Express, React, Docker');
    doc.moveDown();
    doc.fontSize(12).text('Experience');
    doc.fontSize(10).text('Software Developer at DevCorp - Built backend microservices.');
    doc.end();
  });
}

/**
 * Helper to create a real DOCX buffer with external hyperlink relationships
 */
async function makeAnnotatedDocx({ name, email, githubUrl, linkedinUrl }) {
  const zip = new JSZip();

  // Document XML with visible text
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Email: ${email}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Technical Skills: Python, Node.js, MongoDB, Redis</w:t></w:r></w:p>
    <w:p><w:r><w:t>Experience: Backend Intern at CloudSys</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  // Hyperlink relationships XML
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${githubUrl}" TargetMode="External"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${linkedinUrl}" TargetMode="External"/>
</Relationships>`;

  zip.folder('word').file('document.xml', docXml);
  zip.folder('word').folder('_rels').file('document.xml.rels', relsXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function runImportAndCoverLetterTests() {
  console.log('\n======================================================================');
  console.log('TEST SUITE: RESUME STUDIO PHASE 9 - IMPORT & COVER LETTER STUDIO');
  console.log('======================================================================');

  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);

  const app = express();
  app.use(express.json());
  app.use('/api/resume-studio', resumeStudioRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
    });
  });

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api/resume-studio`;

  let collegeA, collegeB;
  let userStudentA, studentA, tokenStudentA;
  let userStudentB, studentB, tokenStudentB;
  let company, driveA, driveB;
  let textImportedResumeId = null;

  try {
    // Clean test leftovers
    await Resume.deleteMany({ title: { $regex: /Phase9/ } });
    await ResumeVersion.deleteMany({ name: { $regex: /Phase9/ } });
    await CoverLetter.deleteMany({ role: { $regex: /Phase9/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^P9/ } });
    await User.deleteMany({ email: { $regex: /phase9/ } });
    await Drive.deleteMany({ role: { $regex: /Phase9/ } });
    await Company.deleteMany({ name: { $regex: /Phase9/ } });
    await College.deleteMany({ code: { $regex: /^P9/ } });
    await AiUsage.deleteMany({});

    mockProvider.reset();

    // 1. Setup Colleges
    collegeA = await College.create({
      name: 'Phase9 Engineering College',
      code: 'P9A',
      city: 'Bangalore',
      state: 'Karnataka',
      approved: true,
    });

    collegeB = await College.create({
      name: 'Phase9 Institute of Technology',
      code: 'P9B',
      city: 'Hyderabad',
      state: 'Telangana',
      approved: true,
    });

    // 2. Setup Company & Drives
    company = await Company.create({
      name: 'Phase9 Enterprise Cloud Systems',
      website: 'https://cloud.phase9.example.com',
      industry: 'Software',
    });

    driveA = await Drive.create({
      company: company._id,
      college: collegeA._id,
      role: 'Phase9 Fullstack Cloud Engineer',
      description: 'Design and build cloud-native services in Node.js and React.',
      requiredSkills: ['Node.js', 'React', 'MongoDB'],
      allowedBranches: ['Computer Science'],
      location: 'Bangalore',
      packageLpa: 16,
      driveDate: new Date(Date.now() + 7 * 86400000),
      lastDateToApply: new Date(Date.now() + 3 * 86400000),
      status: 'open',
    });

    driveB = await Drive.create({
      company: company._id,
      college: collegeB._id, // College B only
      role: 'Phase9 Exclusive College B Role',
      description: 'Exclusive role for College B students.',
      requiredSkills: ['Java', 'Spring Boot'],
      allowedBranches: ['Information Technology'],
      location: 'Hyderabad',
      packageLpa: 14,
      driveDate: new Date(Date.now() + 7 * 86400000),
      lastDateToApply: new Date(Date.now() + 3 * 86400000),
      status: 'open',
    });

    // 3. Setup Students
    userStudentA = await User.create({
      name: 'Phase9 Alice Johnson',
      email: 'student_alice_phase9@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
    });

    studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'P9A001',
      batchYear: 2026,
      branch: 'Computer Science',
      phone: '9876543301',
      cgpa: 9.2,
      resumeProfile: {
        summary: 'Driven software engineer with passion for distributed architectures.',
        skills: [{ name: 'Node.js' }, { name: 'React' }, { name: 'MongoDB' }],
        projects: [{ title: 'Autonomous Drone Fleet' }],
      },
    });
    tokenStudentA = createToken(userStudentA._id, 'student', collegeA._id);

    userStudentB = await User.create({
      name: 'Phase9 Bob Vance',
      email: 'student_bob_phase9@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeB._id,
    });

    studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'P9B001',
      batchYear: 2026,
      branch: 'Information Technology',
      phone: '9876543302',
      cgpa: 8.8,
    });
    tokenStudentB = createToken(userStudentB._id, 'student', collegeB._id);

    // ------------------------------------------------------------------------
    // TEST 1: Import from Pasted Text creates draft & reports missingFields
    // ------------------------------------------------------------------------
    await test('1. POST /resumes/import from pasted text creates Resume draft and reports missingFields honestly', async () => {
      const sampleText = `
        Kiran Sharma
        Email: kiran.sharma@example.com
        Phone: +91 9123456789

        Summary
        Full stack developer passionate about microservices and scalable systems.

        Technical Skills
        JavaScript, Node.js, Express, MongoDB, Docker

        Experience
        Software Developer Intern at AlphaTech (Jun 2025 - Dec 2025)
        - Built REST endpoints and improved database query speeds by 25%.
      `;

      const res = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'text',
          text: sampleText,
          title: 'Phase9 Text Imported Draft',
          templateId: 'software-engineer',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.resume, 'Response must include created resume');
      assert.strictEqual(body.resume.title, 'Phase9 Text Imported Draft');
      assert.strictEqual(body.resume.templateId, 'software-engineer');

      textImportedResumeId = body.resume._id;

      // Contact extracted accurately
      assert.strictEqual(body.resume.data.contact.fullName, 'Kiran Sharma');
      assert.strictEqual(body.resume.data.contact.email, 'kiran.sharma@example.com');
      assert.strictEqual(body.resume.data.contact.phone, '+91 9123456789');

      // Missing fields: location, education, projects were NOT in sampleText
      assert.ok(Array.isArray(body.missingFields));
      assert.ok(body.missingFields.includes('location'), 'location should be in missingFields');
      assert.ok(body.missingFields.includes('education'), 'education should be in missingFields');
      assert.ok(body.missingFields.includes('projects'), 'projects should be in missingFields');

      // Zero dummy filler: unmentioned education and projects must be empty arrays, not hallucinated
      assert.deepStrictEqual(body.resume.data.education, [], 'Missing education must remain empty');
      assert.deepStrictEqual(body.resume.data.projects, [], 'Missing projects must remain empty');
    });

    // ------------------------------------------------------------------------
    // TEST 2: Real-file regression: Link extraction from real PDF buffer
    // ------------------------------------------------------------------------
    await test('2. Real-file regression: PDF with clickable link annotations extracts GitHub and LinkedIn links', async () => {
      const pdfBuffer = await makeAnnotatedPdf({
        name: 'Priya Patel',
        email: 'priya.patel@dev.io',
        githubUrl: 'https://github.com/priyapatel-cloud',
        linkedinUrl: 'https://linkedin.com/in/priyapatel-dev',
      });

      assert.strictEqual(pdfBuffer.slice(0, 4).toString(), '%PDF', 'Must be valid PDF');

      // Create multipart FormData
      const formData = new FormData();
      formData.append('type', 'upload');
      formData.append('title', 'Phase9 PDF Imported Resume');
      formData.append(
        'file',
        new Blob([pdfBuffer], { type: 'application/pdf' }),
        'priya_resume.pdf'
      );

      const res = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: formData,
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.resume);

      // Verify GitHub and LinkedIn links were extracted from PDF annotations
      assert.strictEqual(body.resume.data.contact.github, 'https://github.com/priyapatel-cloud');
      assert.strictEqual(body.resume.data.contact.linkedin, 'https://linkedin.com/in/priyapatel-dev');
    });

    // ------------------------------------------------------------------------
    // TEST 3: Real-file regression: Link extraction from real DOCX buffer
    // ------------------------------------------------------------------------
    await test('3. Real-file regression: DOCX with external hyperlink rels extracts GitHub and LinkedIn links', async () => {
      const docxBuffer = await makeAnnotatedDocx({
        name: 'Devika Sen',
        email: 'devika.sen@cloudlabs.io',
        githubUrl: 'https://github.com/devika-systems',
        linkedinUrl: 'https://linkedin.com/in/devikasen',
      });

      const formData = new FormData();
      formData.append('type', 'upload');
      formData.append('title', 'Phase9 DOCX Imported Resume');
      formData.append(
        'file',
        new Blob([docxBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        'devika_resume.docx'
      );

      const res = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: formData,
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.resume);

      // Verify GitHub and LinkedIn links extracted from DOCX rels
      assert.strictEqual(body.resume.data.contact.github, 'https://github.com/devika-systems');
      assert.strictEqual(body.resume.data.contact.linkedin, 'https://linkedin.com/in/devikasen');
    });

    // ------------------------------------------------------------------------
    // TEST 4: Import from College Profile mode
    // ------------------------------------------------------------------------
    await test('4. POST /resumes/import from profile mode creates draft from verified profile data', async () => {
      const res = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'profile',
          title: 'Phase9 Profile Draft',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.resume.data.contact.fullName, 'Phase9 Alice Johnson');
      assert.ok(body.resume.data.skills.length > 0);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Cover letter generation with AI & grounding
    // ------------------------------------------------------------------------
    await test('5. POST /resumes/:id/cover-letter/generate generates grounded cover letter', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          role: 'Backend Systems Engineer',
          company: 'Acme Cloud Solutions',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.coverLetter && typeof body.coverLetter === 'string');
      assert.ok(body.coverLetter.includes('Acme Cloud Solutions') || body.coverLetter.includes('Backend Systems Engineer'));
    });

    // ------------------------------------------------------------------------
    // TEST 6: Cover letter generation with Campus Drive & college isolation
    // ------------------------------------------------------------------------
    await test('6. Cover letter generation respects multi-college isolation on Drive', async () => {
      mockProvider.reset();
      // Drive A belongs to College A -> Allowed (200)
      const resAllowed = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: String(driveA._id),
        }),
      });
      assert.strictEqual(resAllowed.status, 200);

      // Drive B belongs to College B -> Forbidden (403)
      const resForbidden = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: String(driveB._id),
        }),
      });
      assert.strictEqual(resForbidden.status, 403);
    });

    // ------------------------------------------------------------------------
    // TEST 7: Save Cover Letter and sync with ResumeVersion
    // ------------------------------------------------------------------------
    let versionAId;
    await test('7. PUT /resumes/:id/cover-letter saves content and syncs with ResumeVersion', async () => {
      // Create a version snapshot
      const verRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          name: 'Phase9 Version For CoverLetter',
        }),
      });
      const verBody = await verRes.json();
      assert.strictEqual(verRes.status, 201);
      versionAId = verBody.version._id;

      const coverContent =
        'Dear Hiring Team,\n\nI am writing to express my strong interest in the Backend Engineering position at Phase9 Cloud Systems. My technical background in Node.js and distributed databases aligns well with your team needs.\n\nSincerely,\nKiran Sharma';

      const saveRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          versionId: versionAId,
          role: 'Backend Engineering',
          company: 'Phase9 Cloud Systems',
          content: coverContent,
        }),
      });

      const saveBody = await saveRes.json();
      assert.strictEqual(saveRes.status, 200);
      assert.strictEqual(saveBody.success, true);
      assert.ok(saveBody.coverLetter);

      // Verify CoverLetter document exists in database
      const coverDoc = await CoverLetter.findById(saveBody.coverLetter._id).lean();
      assert.ok(coverDoc);
      assert.strictEqual(coverDoc.content, coverContent);
      assert.strictEqual(String(coverDoc.version), String(versionAId));

      // Verify ResumeVersion.coverLetter was synchronized
      const updatedVersion = await ResumeVersion.findById(versionAId).lean();
      assert.strictEqual(updatedVersion.coverLetter, coverContent);
    });

    // ------------------------------------------------------------------------
    // TEST 8: GET /resumes/:id/cover-letter retrieves saved cover letter
    // ------------------------------------------------------------------------
    await test('8. GET /resumes/:id/cover-letter retrieves stored cover letter', async () => {
      const getRes = await fetch(
        `${baseUrl}/resumes/${textImportedResumeId}/cover-letter?versionId=${versionAId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenStudentA}`,
          },
        }
      );

      const getBody = await getRes.json();
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getBody.success, true);
      assert.ok(getBody.coverLetter);
      assert.ok(getBody.coverLetter.content.includes('Backend Engineering position'));
    });

    // ------------------------------------------------------------------------
    // TEST 9: POST /resumes/:id/cover-letter/export-pdf streams ATS PDF
    // ------------------------------------------------------------------------
    await test('9. POST /resumes/:id/cover-letter/export-pdf streams valid ATS-compliant PDF buffer', async () => {
      const exportRes = await fetch(
        `${baseUrl}/resumes/${textImportedResumeId}/cover-letter/export-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenStudentA}`,
          },
          body: JSON.stringify({
            versionId: versionAId,
          }),
        }
      );

      assert.strictEqual(exportRes.status, 200);
      assert.strictEqual(exportRes.headers.get('content-type'), 'application/pdf');

      const arrayBuffer = await exportRes.arrayBuffer();
      const pdfBuf = Buffer.from(arrayBuffer);
      assert.ok(pdfBuf.length > 500, 'PDF buffer should be substantial');
      assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF', 'Must start with %PDF header');
    });

    // ------------------------------------------------------------------------
    // TEST 10: Multi-tenant security: Student B cannot access Student A cover letter
    // ------------------------------------------------------------------------
    await test('10. Security: Student B cannot generate, save, or export cover letter for Student A resume (403/404)', async () => {
      // Generate attempt
      const genRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({ role: 'Hacker' }),
      });
      assert.ok(genRes.status === 403 || genRes.status === 404);

      // Save attempt
      const saveRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({ content: 'Malicious cover letter' }),
      });
      assert.ok(saveRes.status === 403 || saveRes.status === 404);

      // Export attempt
      const exportRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({ content: 'Hacked PDF export' }),
      });
      assert.ok(exportRes.status === 403 || exportRes.status === 404);
    });

    // ------------------------------------------------------------------------
    // TEST 11: Zod validation blocks invalid requests
    // ------------------------------------------------------------------------
    await test('11. Zod validation blocks empty cover letter content and invalid import types (400)', async () => {
      // Empty content in save cover letter
      const resEmpty = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ content: '   ' }),
      });
      assert.strictEqual(resEmpty.status, 400);

      // Invalid import type
      const resType = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ type: 'invalid_source_type' }),
      });
      assert.strictEqual(resType.status, 400);
    });

    // ------------------------------------------------------------------------
    // TEST 12: Anti-hallucination: Rejects AI cover letter with invented employer (422)
    // ------------------------------------------------------------------------
    await test('12. Anti-hallucination: Rejects AI-generated cover letter with invented employer (422)', async () => {
      mockProvider.reset();
      mockProvider.mockCoverLetterResponse = {
        coverLetter:
          'Dear Hiring Team,\n\nI am writing to express my interest in the Backend Systems Engineer role at Acme Cloud Solutions. During my time as an engineer at Goldman Sachs, I architected high-volume transaction microservices.\n\nSincerely,\nKiran Sharma',
      };

      const res = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          role: 'Backend Systems Engineer',
          company: 'Acme Cloud Solutions',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        (body.reasonCodes && body.reasonCodes.includes('unknown_employer')) ||
          (body.message && body.message.includes('unknown_employer')),
        `Expected unknown_employer in reasonCodes, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 13: Anti-hallucination: Rejects AI cover letter with invented number (422)
    // ------------------------------------------------------------------------
    await test('13. Anti-hallucination: Rejects AI-generated cover letter with invented number/metric (422)', async () => {
      mockProvider.reset();
      mockProvider.mockCoverLetterResponse = {
        coverLetter:
          'Dear Hiring Team,\n\nI am writing to apply for the Backend Systems Engineer role at Acme Cloud Solutions. At AlphaTech, I boosted query efficiency by 95% and reduced cloud hosting costs by $500000.\n\nSincerely,\nKiran Sharma',
      };

      const res = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          role: 'Backend Systems Engineer',
          company: 'Acme Cloud Solutions',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        (body.reasonCodes && body.reasonCodes.includes('unverified_number')) ||
          (body.message && body.message.includes('unverified_number')),
        `Expected unverified_number in reasonCodes, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 14: Anti-hallucination: Rejects AI cover letter with invented skill (422)
    // ------------------------------------------------------------------------
    await test('14. Anti-hallucination: Rejects AI-generated cover letter with invented technical skill (422)', async () => {
      mockProvider.reset();
      mockProvider.mockCoverLetterResponse = {
        coverLetter:
          'Dear Hiring Team,\n\nI am excited to apply for the Backend Systems Engineer role at Acme Cloud Solutions. I am an expert in Rust and Solana, having built decentralized cryptographic ledger protocols.\n\nSincerely,\nKiran Sharma',
      };

      const res = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          role: 'Backend Systems Engineer',
          company: 'Acme Cloud Solutions',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        (body.reasonCodes && body.reasonCodes.includes('unverified_skill')) ||
          (body.message && body.message.includes('unverified_skill')),
        `Expected unverified_skill in reasonCodes, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 15: Grounded cover letter passes verification (200)
    // ------------------------------------------------------------------------
    await test('15. Grounded cover letter passes verification with 200 OK', async () => {
      mockProvider.reset();
      mockProvider.mockCoverLetterResponse = {
        coverLetter:
          'Dear Hiring Team,\n\nI am writing to express my enthusiastic interest in the Backend Systems Engineer position at Acme Cloud Solutions. During my internship at AlphaTech, I worked with Node.js and MongoDB to build backend endpoints and optimize query speeds by 25%. I look forward to bringing these technical skills to Acme Cloud Solutions.\n\nSincerely,\nKiran Sharma',
      };

      const res = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          role: 'Backend Systems Engineer',
          company: 'Acme Cloud Solutions',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.coverLetter.includes('Acme Cloud Solutions'));
    });

    // ------------------------------------------------------------------------
    // TEST 16: Manual edits allow student's own words and label source 'manual'
    // ------------------------------------------------------------------------
    await test('16. Manual edits allow student own words and label source manual', async () => {
      const manualContent =
        'Dear Engineering Leads,\n\nI am writing to present my candidacy for software roles. I bring dedicated enthusiasm, strong collaborative focus, and an appetite for learning complex engineering paradigms.\n\nWarm regards,\nKiran Sharma';

      const saveRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          content: manualContent,
          source: 'manual',
        }),
      });

      const saveBody = await saveRes.json();
      assert.strictEqual(saveRes.status, 200);
      assert.strictEqual(saveBody.success, true);
      assert.strictEqual(saveBody.coverLetter.source, 'manual');
      assert.strictEqual(saveBody.coverLetter.content, manualContent);
    });

    // ------------------------------------------------------------------------
    // TEST 17: Submitted version immutability on cover letter save
    // ------------------------------------------------------------------------
    await test('17. Submitted version immutability: saving cover letter skips locked ResumeVersion', async () => {
      // Create a new version snapshot
      const verRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ name: 'Locked Version For Immutability Test' }),
      });
      const verBody = await verRes.json();
      const lockedVerId = verBody.version._id;

      // Lock the version directly in database
      const originalCover = 'Original unmodifiable snapshot cover letter';
      await ResumeVersion.findByIdAndUpdate(lockedVerId, {
        submitted: true,
        coverLetter: originalCover,
      });

      // Attempt to save new cover letter targeted at this locked version
      const updateRes = await fetch(`${baseUrl}/resumes/${textImportedResumeId}/cover-letter`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          versionId: lockedVerId,
          content: 'Attacked or altered cover letter text attempting to mutate locked version',
        }),
      });

      const updateBody = await updateRes.json();
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateBody.versionSkipped, true, 'Should flag versionSkipped as true');

      // Verify CoverLetter doc was updated
      const coverDoc = await CoverLetter.findOne({ version: lockedVerId }).lean();
      assert.ok(coverDoc);
      assert.strictEqual(
        coverDoc.content,
        'Attacked or altered cover letter text attempting to mutate locked version'
      );

      // Verify ResumeVersion was NOT modified
      const verDocAfter = await ResumeVersion.findById(lockedVerId).lean();
      assert.strictEqual(
        verDocAfter.coverLetter,
        originalCover,
        'Submitted ResumeVersion coverLetter MUST remain strictly immutable'
      );
    });

    // ------------------------------------------------------------------------
    // TEST 18: Upload safety: Oversized file (> 5MB) rejected with 400
    // ------------------------------------------------------------------------
    await test('18. Upload safety: Oversized file (> 5MB) rejected with 400', async () => {
      const bigFormData = new FormData();
      bigFormData.append('type', 'upload');
      bigFormData.append('title', 'Oversized Resume');
      bigFormData.append(
        'file',
        new Blob([Buffer.alloc(5.5 * 1024 * 1024)], { type: 'application/pdf' }),
        'oversized.pdf'
      );

      const resOver = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: bigFormData,
      });

      assert.strictEqual(resOver.status, 400);
      const overBody = await resOver.json();
      assert.strictEqual(overBody.success, false);
      assert.ok(overBody.message.includes('exceeds') || overBody.message.includes('limit'));
    });

    // ------------------------------------------------------------------------
    // TEST 19: Upload safety: Spoofed file without PDF/DOCX magic bytes rejected with 400
    // ------------------------------------------------------------------------
    await test('19. Upload safety: Spoofed file without PDF/DOCX magic header rejected with 400', async () => {
      const fakeFormData = new FormData();
      fakeFormData.append('type', 'upload');
      fakeFormData.append('title', 'Spoofed Resume');
      fakeFormData.append(
        'file',
        new Blob([Buffer.from('This is a plain text file renamed to fake_resume.pdf')], {
          type: 'application/pdf',
        }),
        'fake_resume.pdf'
      );

      const resFake = await fetch(`${baseUrl}/resumes/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: fakeFormData,
      });

      assert.strictEqual(resFake.status, 400);
      const fakeBody = await resFake.json();
      assert.strictEqual(fakeBody.success, false);
      assert.ok(
        fakeBody.message.includes('Invalid file format') || fakeBody.message.includes('magic header')
      );
    });

  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 9 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('----------------------------------------------------------------------');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runImportAndCoverLetterTests().catch((err) => {
  console.error('Test runner unexpected failure:', err);
  process.exit(1);
});
