const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');

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

async function testPdfExportAndHyperlinks() {
  console.log('======================================================================');
  console.log('TEST SUITE: PDF EXPORT & PDFKIT HYPERLINK ANNOTATION VERIFICATION');
  console.log('======================================================================');

  const resumeData = {
    contact: {
      fullName: 'Krunal Patel',
      email: 's91453604@gmail.com',
      phone: '+91 9723621008',
      location: 'Gujarat, India',
      linkedin: 'https://linkedin.com/in/krunal-patel',
      linkedinDisplay: 'short',
      github: 'https://github.com/krunal-patel',
      githubDisplay: 'short',
    },
    summary: 'Full-stack software engineer proficient in MERN stack and cloud systems.',
    skills: [
      { category: 'Programming Languages', items: ['JavaScript', 'TypeScript', 'Python'] },
      { category: 'Backend Development', items: ['Node.js', 'Express', 'MongoDB'] },
    ],
    experience: [
      {
        company: 'Tech Solutions',
        role: 'Software Engineer Intern',
        startDate: 'Jan 2024',
        endDate: 'Present',
        bullets: ['Engineered scalable REST APIs', 'Implemented real-time BullMQ queues'],
      },
    ],
    education: [
      {
        institution: 'Engineering College',
        degree: 'B.Tech in Computer Engineering',
        year: '2024',
        gpa: '8.8',
      },
    ],
    languages: ['English', 'Hindi', 'Gujarati'],
  };

  // Test 1: Verify short display option renders "LinkedIn" and "GitHub" label in PDF text and PDFKit /Subtype /Link annotations
  const pdfBufferShort = await generateResumePdf(resumeData, 'modern');
  assert.ok(Buffer.isBuffer(pdfBufferShort), 'Must produce a Buffer');
  assert.strictEqual(pdfBufferShort.subarray(0, 4).toString(), '%PDF', 'Must start with %PDF magic bytes');

  const parsedTextShort = await extractTextFromPdf(pdfBufferShort);
  console.log('  Extracted text length:', parsedTextShort.length);
  assert.ok(parsedTextShort.includes('Krunal Patel'), 'PDF must include candidate name');
  assert.ok(parsedTextShort.includes('LinkedIn'), 'PDF must include short label "LinkedIn"');
  assert.ok(parsedTextShort.includes('GitHub'), 'PDF must include short label "GitHub"');
  assert.ok(parsedTextShort.includes('English'), 'PDF must include language English');
  assert.ok(parsedTextShort.includes('Hindi'), 'PDF must include language Hindi');
  assert.ok(parsedTextShort.includes('Gujarati'), 'PDF must include language Gujarati');

  const rawShort = pdfBufferShort.toString('binary');
  assert.ok(rawShort.includes('/Subtype /Link') || rawShort.includes('/Subtype/Link'), 'PDF must include /Subtype /Link');
  assert.ok(rawShort.includes('https://linkedin.com/in/krunal-patel'), 'PDF must contain LinkedIn URI annotation');
  assert.ok(rawShort.includes('https://github.com/krunal-patel'), 'PDF must contain GitHub URI annotation');
  console.log('  ✓ TEST 1: Short clickable labels with PDFKit URI annotations verified');

  // Test 2: Verify full URL display option
  const fullResumeData = {
    ...resumeData,
    contact: {
      ...resumeData.contact,
      linkedinDisplay: 'full',
      githubDisplay: 'full',
    },
  };
  const pdfBufferFull = await generateResumePdf(fullResumeData, 'modern');
  const parsedTextFull = await extractTextFromPdf(pdfBufferFull);
  const normalizedFullText = parsedTextFull.replace(/[\r\n\s]+/g, '');
  assert.ok(normalizedFullText.includes('linkedin.com/in/krunal-patel'), 'PDF must include full LinkedIn URL');
  assert.ok(normalizedFullText.includes('github.com/krunal-patel'), 'PDF must include full GitHub URL');
  console.log('  ✓ TEST 2: Full URL display option verified');

  // Test 3: Verify all 8 ATS templates generate valid PDFs with embedded links
  const { RESUME_TEMPLATES } = require('../models/Resume');
  for (const templateId of RESUME_TEMPLATES) {
    const buf = await generateResumePdf(resumeData, templateId);
    assert.ok(Buffer.isBuffer(buf), `${templateId} must produce buffer`);
    assert.strictEqual(buf.subarray(0, 4).toString(), '%PDF', `${templateId} must have %PDF header`);
    const raw = buf.toString('binary');
    assert.ok(raw.includes('linkedin.com/in/krunal-patel'), `${templateId} must embed LinkedIn link`);
    assert.ok(raw.includes('github.com/krunal-patel'), `${templateId} must embed GitHub link`);
    console.log(`  ✓ Template '${templateId}' generated valid PDF with clickable hyperlink annotations`);
  }

  console.log('\n======================================================================');
  console.log('ALL PDF TESTS PASSED (0 FAILURES)');
  console.log('======================================================================');
}

testPdfExportAndHyperlinks().catch((err) => {
  console.error('PDF Test Failed:', err);
  process.exit(1);
});
