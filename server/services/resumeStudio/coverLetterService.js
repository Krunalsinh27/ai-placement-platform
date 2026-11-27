/**
 * Resume Studio Cover Letter Service
 *
 * Implements Phase 9:
 * 1. Reuses existing generateCoverLetter from resumeBuilderService (with AI rate limit & tokenMasker).
 * 2. Grounding validation: Ensures cover letter does not contain banned inflation words or invented facts.
 * 3. Persists cover letter in CoverLetter collection linked to Resume, optional ResumeVersion, and optional Drive.
 * 4. Syncs with ResumeVersion.coverLetter when linked to a version.
 * 5. Generates ATS-compliant, professional PDF using PDFKit on-the-fly (never stored in DB).
 */

const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const { CoverLetter, Drive, ResumeVersion } = require('../../models');
const {
  generateCoverLetter,
  BANNED_INFLATION_WORDS,
} = require('../resumeBuilder/resumeBuilderService');
const { extractSkillsFromText, matchSkillInText } = require('../ai/skillsDictionary');
const {
  getResumeWithOwnershipCheck,
  getStudentProfile,
  isVersionSubmittedOrReferenced,
} = require('./resumeStudioService');

/**
 * Validates cover letter text against resume facts and allowed target context.
 * AI-generated letters must NOT contain invented employers, metrics/numbers, or technical skills.
 */
function validateCoverLetterGrounding(
  text = '',
  resumeData = {},
  jdText = '',
  targetCompany = '',
  targetRole = '',
  candidateCollege = ''
) {
  if (!text || typeof text !== 'string') {
    return { valid: false, reasonCodes: ['empty_text'], items: [], reasons: ['empty_text'] };
  }

  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();
  const reasonCodes = [];
  const items = [];

  // 1. Inflation buzzwords
  for (const word of BANNED_INFLATION_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      reasonCodes.push('inflation_buzzword');
      items.push(word);
    }
  }

  // Build corpus from resumeData
  const resumeCorpusParts = [];
  if (candidateCollege) resumeCorpusParts.push(candidateCollege);
  if (resumeData.summary) resumeCorpusParts.push(resumeData.summary);
  if (Array.isArray(resumeData.experience)) {
    resumeData.experience.forEach((e) => {
      if (e.company) resumeCorpusParts.push(e.company);
      if (e.title) resumeCorpusParts.push(e.title);
      if (e.role) resumeCorpusParts.push(e.role);
      if (Array.isArray(e.bullets)) resumeCorpusParts.push(e.bullets.join(' '));
    });
  }
  if (Array.isArray(resumeData.projects)) {
    resumeData.projects.forEach((p) => {
      if (p.title) resumeCorpusParts.push(p.title);
      if (Array.isArray(p.technologies)) resumeCorpusParts.push(p.technologies.join(' '));
      if (Array.isArray(p.bullets)) resumeCorpusParts.push(p.bullets.join(' '));
    });
  }
  if (Array.isArray(resumeData.education)) {
    resumeData.education.forEach((ed) => {
      if (ed.institution) resumeCorpusParts.push(ed.institution);
      if (ed.degree) resumeCorpusParts.push(ed.degree);
      if (ed.field) resumeCorpusParts.push(ed.field);
      if (ed.grade) resumeCorpusParts.push(String(ed.grade));
    });
  }
  if (Array.isArray(resumeData.certifications)) {
    resumeData.certifications.forEach((c) => {
      if (typeof c === 'string') resumeCorpusParts.push(c);
      else if (c.name) resumeCorpusParts.push(c.name);
    });
  }
  if (resumeData.contact) {
    if (resumeData.contact.fullName) resumeCorpusParts.push(resumeData.contact.fullName);
    if (resumeData.contact.location) resumeCorpusParts.push(resumeData.contact.location);
    if (resumeData.contact.phone) resumeCorpusParts.push(resumeData.contact.phone);
  }

  const resumeCorpus = resumeCorpusParts.join(' ').toLowerCase();
  const fullContextCorpus = `${resumeCorpus} ${jdText || ''} ${targetCompany || ''} ${targetRole || ''}`.toLowerCase();

  // Known employers from resume
  const knownEmployers = [];
  if (Array.isArray(resumeData.experience)) {
    resumeData.experience.forEach((e) => {
      if (e.company) knownEmployers.push(e.company.toLowerCase());
      if (e.title) {
        const atMatch = e.title.match(/\bat\s+([A-Za-z0-9&.-]+)/i);
        if (atMatch) knownEmployers.push(atMatch[1].toLowerCase());
      }
    });
  }
  if (targetCompany) knownEmployers.push(targetCompany.toLowerCase());

  // Candidate skills set
  const candidateSkillsSet = new Set();
  (resumeData.skills || []).forEach((c) => {
    if (typeof c === 'string') {
      candidateSkillsSet.add(c.toLowerCase());
    } else if (Array.isArray(c.items)) {
      c.items.forEach((item) => candidateSkillsSet.add(item.toLowerCase()));
    }
  });

  // 2. Numbers check (exclude placeholders, standard dates/years 2010-2035)
  const placeholderRegex =
    /\[(?:add\s+your\s+real\s+number|add\s+number|your\s+number|number|metric|X%|X)\]/gi;
  const letterWithoutPlaceholders = cleanText.replace(placeholderRegex, '');
  const letterNumbers = letterWithoutPlaceholders.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];

  for (const num of letterNumbers) {
    const cleanNum = num.toLowerCase();
    const intVal = parseInt(cleanNum, 10);
    // Allow standard calendar years
    if (intVal >= 2010 && intVal <= 2035) {
      continue;
    }
    const numBase = cleanNum.replace(/[+%]/g, '');
    if (!fullContextCorpus.includes(cleanNum) && !fullContextCorpus.includes(numBase)) {
      reasonCodes.push('unverified_number');
      items.push(cleanNum);
    }
  }

  // 3. Technical skills check
  const extractedSkills = extractSkillsFromText(cleanText);
  for (const sk of extractedSkills) {
    const skLower = sk.toLowerCase();
    const inCandidateSkills = candidateSkillsSet.has(skLower);
    const inCorpus = matchSkillInText(sk, resumeCorpus);
    const inJd = jdText ? matchSkillInText(sk, jdText) : false;

    if (!inCandidateSkills && !inCorpus && !inJd) {
      reasonCodes.push('unverified_skill');
      items.push(sk);
    }
  }

  // 4. Employers check
  const employerRegex = /\b(?:at|for|with)\s+([A-Z][a-zA-Z0-9&.-]+(?:\s+[A-Z][a-zA-Z0-9&.-]+)?)\b/g;
  let match;
  const allowedNonCompanies = new Set([
    'scale', 'runtime', 'peak', 'speed', 'production', 'startup',
    'university', 'college', 'school', 'work', 'hand', 'first', 'excellence', 'passion',
    'technologies', 'solutions', 'systems', 'engineering'
  ]);
  while ((match = employerRegex.exec(cleanText)) !== null) {
    const candidateCompany = match[1].trim().toLowerCase();
    const isTechSkill =
      candidateSkillsSet.has(candidateCompany) ||
      matchSkillInText(candidateCompany, resumeCorpus) ||
      extractSkillsFromText(candidateCompany).length > 0;
    const isEducation =
      candidateCompany.includes('college') ||
      candidateCompany.includes('university') ||
      candidateCompany.includes('institute') ||
      candidateCompany.includes('school') ||
      candidateCompany.includes('academy') ||
      candidateCompany.includes('campus');

    if (!allowedNonCompanies.has(candidateCompany) && !isTechSkill && !isEducation) {
      const inContext = fullContextCorpus.includes(candidateCompany);
      const inEmployers = knownEmployers.some(
        (emp) => emp.includes(candidateCompany) || candidateCompany.includes(emp)
      );
      if (!inContext && !inEmployers) {
        reasonCodes.push('unknown_employer');
        items.push(candidateCompany);
      }
    }
  }

  const uniqueCodes = Array.from(new Set(reasonCodes));
  const uniqueItems = Array.from(new Set(items));

  return {
    valid: uniqueCodes.length === 0,
    reasonCodes: uniqueCodes,
    items: uniqueItems,
    reasons: uniqueCodes.map((code) => `Anti-hallucination guard: ${code}`),
  };
}

/**
 * 1. Generate Cover Letter for Studio Resume
 */
async function generateCoverLetterForStudio(resumeId, payload, user, options = {}) {
  const { signal = null, isAborted = null } = options;
  const { versionId, driveId, role, company, jobDescription } = payload;

  const student = await getStudentProfile(user);
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  let targetRole = role || 'Software Engineer';
  let targetCompany = company || '';

  // College isolation check on Drive if driveId is provided
  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    const driveDoc = await Drive.findById(driveId).populate('company', 'name');
    if (!driveDoc) {
      const err = new Error('Target Drive not found');
      err.status = 404;
      throw err;
    }

    const userCollegeId = user.college?._id ? String(user.college._id) : String(user.college || '');
    const driveCollegeId = driveDoc.college?._id ? String(driveDoc.college._id) : String(driveDoc.college || '');
    if (driveCollegeId && userCollegeId && driveCollegeId !== userCollegeId) {
      const err = new Error('Access denied: Campus drive is restricted to another college');
      err.status = 403;
      throw err;
    }

    targetRole = driveDoc.role || targetRole;
    targetCompany = driveDoc.company?.name || targetCompany;
  }

  // Reuse existing generateCoverLetter (grounded, quota-protected)
  const result = await generateCoverLetter({
    studentUserId: user._id,
    role: targetRole,
    company: targetCompany,
    driveId: driveId || null,
    jobDescription: jobDescription || '',
    signal,
    isAborted,
    resumeData: resume.data || {},
  });

  // Anti-hallucination grounding validation on AI-generated cover letter
  const collegeName = student.college?.name || user.college?.name || '';
  const validation = validateCoverLetterGrounding(
    result.coverLetter,
    resume.data || {},
    jobDescription || '',
    targetCompany,
    targetRole,
    collegeName
  );

  if (!validation.valid) {
    const err = new Error(
      `AI generated cover letter failed anti-hallucination verification: ${validation.reasonCodes.join(', ')}`
    );
    err.status = 422;
    err.statusCode = 422;
    err.reasonCodes = validation.reasonCodes;
    err.items = validation.items;
    throw err;
  }

  return {
    success: true,
    coverLetter: result.coverLetter,
    targetRole: result.targetRole,
    targetCompany: result.targetCompany,
    candidateName: result.candidateName,
  };
}

/**
 * 2. Save / Update Cover Letter for Studio Resume
 */
async function saveCoverLetterForStudio(resumeId, payload, student) {
  const { versionId, driveId, role, company, content, source } = payload;

  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (!content || typeof content !== 'string' || !content.trim()) {
    const err = new Error('Cover letter content cannot be empty');
    err.status = 400;
    throw err;
  }

  // Optional: check version ownership if versionId provided
  let versionDoc = null;
  if (versionId) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      const err = new Error('Invalid version ID');
      err.status = 400;
      throw err;
    }
    versionDoc = await ResumeVersion.findOne({
      _id: versionId,
      resume: resume._id,
      student: student._id,
    });
    if (!versionDoc) {
      const err = new Error('Resume version not found or belongs to another student');
      err.status = 404;
      throw err;
    }
  }

  // Optional: verify college isolation on driveId
  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    const driveDoc = await Drive.findById(driveId);
    if (!driveDoc) {
      const err = new Error('Drive not found');
      err.status = 404;
      throw err;
    }
    const studentCollegeStr = String(student.college?._id || student.college || '');
    const driveCollegeStr = String(driveDoc.college?._id || driveDoc.college || '');
    if (driveCollegeStr && studentCollegeStr && driveCollegeStr !== studentCollegeStr) {
      const err = new Error('Access denied: Campus drive is restricted to another college');
      err.status = 403;
      throw err;
    }
  }

  // Find existing cover letter for this resume/version/drive
  const query = {
    resume: resume._id,
    student: student._id,
  };
  if (versionId) query.version = versionId;
  if (driveId) query.drive = driveId;

  let coverDoc = await CoverLetter.findOne(query);

  if (coverDoc) {
    coverDoc.content = content.trim();
    if (role) coverDoc.role = role.trim();
    if (company) coverDoc.company = company.trim();
    coverDoc.source = source || coverDoc.source || 'manual';
    await coverDoc.save();
  } else {
    coverDoc = await CoverLetter.create({
      student: student._id,
      college: student.college,
      resume: resume._id,
      version: versionId || null,
      drive: driveId || null,
      role: (role || 'Software Engineer').trim(),
      company: (company || '').trim(),
      content: content.trim(),
      source: source || 'manual',
    });
  }

  // Submitted version immutability:
  // Synchronize to ResumeVersion ONLY if version is NOT submitted or referenced by an Application
  let versionUpdated = false;
  let versionSkipped = false;
  if (versionDoc) {
    const isLocked = await isVersionSubmittedOrReferenced(versionDoc._id);
    if (!isLocked) {
      versionDoc.coverLetter = content.trim();
      await versionDoc.save();
      versionUpdated = true;
    } else {
      versionSkipped = true;
      console.log(
        `[CoverLetterService] Skipped sync to version ${versionDoc._id}: version is submitted or referenced by an application.`
      );
    }
  }

  return {
    success: true,
    coverLetter: coverDoc,
    versionUpdated,
    versionSkipped,
  };
}

/**
 * 3. Get Cover Letter for Studio Resume
 */
async function getCoverLetterForStudio(resumeId, queryParams, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);
  const { versionId, driveId } = queryParams;

  const query = {
    resume: resume._id,
    student: student._id,
  };
  if (versionId && mongoose.Types.ObjectId.isValid(versionId)) {
    query.version = versionId;
  }
  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    query.drive = driveId;
  }

  let coverDoc = await CoverLetter.findOne(query).sort({ updatedAt: -1 });

  // Fallback: If querying by version, check if versionDoc has embedded coverLetter
  if (!coverDoc && versionId && mongoose.Types.ObjectId.isValid(versionId)) {
    const vDoc = await ResumeVersion.findById(versionId).lean();
    if (vDoc && vDoc.coverLetter) {
      coverDoc = {
        resume: resume._id,
        version: vDoc._id,
        role: vDoc.targetRole || 'Software Engineer',
        company: vDoc.targetCompany || '',
        content: vDoc.coverLetter,
        createdAt: vDoc.createdAt,
        updatedAt: vDoc.updatedAt,
      };
    }
  }

  return {
    success: true,
    coverLetter: coverDoc || null,
  };
}

/**
 * 4. Generate ATS-Compliant PDF Stream for Cover Letter
 */
function generateCoverLetterPdfStream({
  candidateName = 'Candidate Name',
  contact = {},
  targetRole = 'Software Engineer',
  targetCompany = '',
  content = '',
  outputStream = null,
}) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    info: {
      Title: `Cover Letter - ${candidateName}`,
      Author: candidateName,
      Subject: `Cover Letter for ${targetRole}`,
    },
  });

  const chunks = [];
  if (outputStream && typeof outputStream.write === 'function') {
    doc.pipe(outputStream);
  } else {
    doc.on('data', (c) => chunks.push(c));
  }

  // Header - Candidate Info
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827').text(candidateName, { align: 'left' });

  const contactParts = [];
  if (contact.email) contactParts.push(contact.email);
  if (contact.phone) contactParts.push(contact.phone);
  if (contact.location) contactParts.push(contact.location);
  if (contact.linkedin) contactParts.push(contact.linkedin);
  if (contact.github) contactParts.push(contact.github);

  if (contactParts.length > 0) {
    doc.fontSize(9.5).font('Helvetica').fillColor('#4B5563').moveDown(0.3).text(contactParts.join('  |  '));
  }

  // Divider Line
  doc.moveDown(0.5);
  doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(54, doc.y).lineTo(541, doc.y).stroke();
  doc.moveDown(1.2);

  // Date
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.fontSize(10).font('Helvetica').fillColor('#374151').text(dateStr);
  doc.moveDown(1.0);

  // Recipient Block
  if (targetCompany) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(`Hiring Team`);
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(targetCompany);
    if (targetRole) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#4B5563').text(`Position: ${targetRole}`);
    }
    doc.moveDown(1.2);
  }

  // Body Paragraphs
  const paragraphs = (content || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  doc.fontSize(10.5).font('Helvetica').fillColor('#1F2937');

  for (const para of paragraphs) {
    // If paragraph is a greeting like "Dear...", use bold or standard
    if (para.toLowerCase().startsWith('dear ')) {
      doc.font('Helvetica-Bold').text(para);
      doc.font('Helvetica').moveDown(0.8);
    } else if (para.toLowerCase().startsWith('sincerely') || para.toLowerCase().startsWith('warm regards') || para.toLowerCase().startsWith('best regards')) {
      doc.moveDown(0.8);
      doc.text(para);
      doc.moveDown(0.4);
    } else {
      doc.text(para, { lineGap: 3.5, align: 'left' });
      doc.moveDown(0.8);
    }
  }

  doc.end();

  if (outputStream && typeof outputStream.write === 'function') {
    return doc;
  }

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

module.exports = {
  validateCoverLetterGrounding,
  generateCoverLetterForStudio,
  saveCoverLetterForStudio,
  getCoverLetterForStudio,
  generateCoverLetterPdfStream,
};
