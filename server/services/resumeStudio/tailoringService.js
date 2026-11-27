/**
 * Resume Studio Tailoring Service
 *
 * Implements Phase 8 & 8b:
 * 1. Generates structured change proposals against target Drive or custom JD.
 * 2. Reuses existing analyzeJobDescription (cached) and tailorResume without duplication.
 * 3. Uses scoreResumeForTarget read-only (zero duplicate scoring engines).
 * 4. Strictly validates all proposed text via validateSummaryRewrite, validateBulletRewrite, and verifySourceFacts.
 * 5. Saves proposals server-side in TailorSession (short-lived, 30m TTL, bound to student + resume + contentHash).
 * 6. Base resume protection: saves pre-tailor state as ResumeVersion (source: manual, label "Before tailoring")
 *    unless an identical-hash version already exists.
 * 7. Server-trusted apply: proposals applied strictly from TailorSession proposals, ignoring client-sent proposed text.
 * 8. Applies accepted proposals to create a new ResumeVersion (source: 'ai-tailor') with jdSnapshot.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { Drive, Student, TailorSession, ResumeVersion } = require('../../models');
const { analyzeJobDescription } = require('../ai/jdAnalyzer');
const { scoreResumeForTarget } = require('../ai/resumeAnalyzer');
const {
  tailorResume,
  validateBulletRewrite,
  validateSummaryRewrite,
  verifySourceFacts,
} = require('../resumeBuilder/resumeBuilderService');
const {
  createResumeVersion,
  getResumeWithOwnershipCheck,
  getStudentProfile,
} = require('./resumeStudioService');
const { normalizeSkill } = require('../ai/skillsDictionary');

/**
 * Computes deterministic SHA-256 hash of resume data
 */
function computeContentHash(data = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * Helper to identify matched JD keywords in a text
 */
function findMatchedKeyword(text = '', keywords = []) {
  if (!text || typeof text !== 'string') return '';
  const textLower = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && textLower.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return '';
}

/**
 * 1. POST /resumes/:id/tailor
 * Generates structured change proposals without applying them.
 * Validates each proposal with existing validators and persists them in TailorSession.
 */
async function generateTailorProposals(resumeDoc, payload, user, options = {}) {
  const { signal = null, isAborted = null } = options;
  const { driveId, jobDescription } = payload;
  const resumeData = resumeDoc.data || {};
  const currentContentHash = computeContentHash(resumeData);

  let targetRole = 'Software Engineer';
  let targetCompany = '';
  let requiredSkills = [];
  let preferredSkills = [];
  let jdAnalysis = null;
  let targetDriveId = null;

  // 1. Resolve Target Context
  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    targetDriveId = driveId;
    const driveDoc = await Drive.findById(driveId).populate('company', 'name');
    if (!driveDoc) {
      const err = new Error('Target Drive not found');
      err.status = 404;
      throw err;
    }

    // Verify college isolation if drive is college-scoped
    const userCollegeId = user.college?._id ? String(user.college._id) : String(user.college || '');
    const driveCollegeId = driveDoc.college?._id ? String(driveDoc.college._id) : String(driveDoc.college || '');
    if (driveCollegeId && userCollegeId && driveCollegeId !== userCollegeId) {
      const err = new Error('Access denied: Campus drive is restricted to another college');
      err.status = 403;
      throw err;
    }

    targetRole = driveDoc.role || targetRole;
    targetCompany = driveDoc.company?.name || '';
    requiredSkills = (driveDoc.requiredSkills || []).map(normalizeSkill);
    preferredSkills = (driveDoc.preferredSkills || []).map(normalizeSkill);

    jdAnalysis = {
      roleTitle: targetRole,
      company: targetCompany,
      requiredSkills: driveDoc.requiredSkills || [],
      preferredSkills: driveDoc.preferredSkills || [],
      minYearsExperience: 0,
      education: driveDoc.eligibleBranches ? driveDoc.eligibleBranches.join(', ') : '',
    };
  } else if (jobDescription && jobDescription.trim()) {
    jdAnalysis = await analyzeJobDescription(jobDescription.trim(), { userId: user._id });
    targetRole = jdAnalysis.roleTitle || targetRole;
    targetCompany = jdAnalysis.company || targetCompany;
    requiredSkills = (jdAnalysis.requiredSkills || []).map(normalizeSkill);
    preferredSkills = (jdAnalysis.preferredSkills || []).map(normalizeSkill);
  } else {
    const err = new Error('Either a driveId or a jobDescription must be provided');
    err.status = 400;
    throw err;
  }

  // 2. Read-only Baseline ATS Score
  const baselineScore = scoreResumeForTarget({
    resumeData,
    jdAnalysis,
  });

  // 3. Invoke Existing Tailor Engine (reuses AI quota, tokenMasker, and grounding checks)
  const tailorResult = await tailorResume({
    studentUserId: user._id,
    baseResumeData: resumeData,
    driveId: targetDriveId,
    jobDescription: jobDescription || '',
    sourceType: 'profile',
    signal,
    isAborted,
  });

  const baseResume = tailorResult.baseResume || resumeData;
  const tailoredResume = tailorResult.tailoredResume || resumeData;
  const allJdKeywords = [...(jdAnalysis.requiredSkills || []), ...(jdAnalysis.preferredSkills || [])];

  // Build candidate corpus and sets for validator enforcement
  const existingBullets = [];
  const candidateSkillsSet = new Set();
  const knownEmployers = [];
  const corpusParts = [];

  if (Array.isArray(baseResume.skills)) {
    for (const cat of baseResume.skills) {
      if (typeof cat === 'string') {
        const s = cat.toLowerCase().trim();
        if (s) {
          candidateSkillsSet.add(s);
          corpusParts.push(cat);
        }
      } else if (cat && Array.isArray(cat.items)) {
        for (const item of cat.items) {
          if (typeof item === 'string') {
            const s = item.toLowerCase().trim();
            if (s) {
              candidateSkillsSet.add(s);
              corpusParts.push(item);
            }
          }
        }
      }
    }
  }

  if (Array.isArray(baseResume.experience)) {
    for (const exp of baseResume.experience) {
      if (exp.company) {
        knownEmployers.push(exp.company.toLowerCase().trim());
        corpusParts.push(exp.company);
      }
      if (exp.title) corpusParts.push(exp.title);
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          if (b && typeof b === 'string') {
            existingBullets.push(b);
            corpusParts.push(b);
          }
        }
      }
    }
  }

  if (Array.isArray(baseResume.projects)) {
    for (const proj of baseResume.projects) {
      if (proj.title) corpusParts.push(proj.title);
      if (Array.isArray(proj.technologies)) {
        for (const tech of proj.technologies) {
          if (tech) {
            candidateSkillsSet.add(tech.toLowerCase().trim());
            corpusParts.push(tech);
          }
        }
      }
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) {
          if (b && typeof b === 'string') {
            existingBullets.push(b);
            corpusParts.push(b);
          }
        }
      }
    }
  }

  const resumeCorpus = corpusParts.join(' ');

  // 4. Convert Tailoring Results into Change Proposals with Validator Checks
  const proposals = [];

  // (a) Professional Summary Proposal
  if (
    tailoredResume.summary &&
    tailoredResume.summary.trim() !== (baseResume.summary || '').trim()
  ) {
    // Validator: validateSummaryRewrite
    const isSummaryValid = validateSummaryRewrite(
      tailoredResume.summary,
      baseResume.summary || '',
      resumeCorpus,
      candidateSkillsSet,
      knownEmployers
    );

    if (isSummaryValid) {
      const matchedKw =
        findMatchedKeyword(tailoredResume.summary, allJdKeywords) ||
        targetRole ||
        'Target Alignment';

      proposals.push({
        id: 'summary-tailor',
        section: 'summary',
        target: { section: 'summary' },
        original: baseResume.summary || '',
        proposed: tailoredResume.summary,
        reason: 'Tailored summary highlighting relevant technical competencies and role alignment.',
        matchedJdKeyword: matchedKw,
      });
    }
  }

  // (b) Skills Reordering Proposal
  if (
    Array.isArray(tailoredResume.skills) &&
    JSON.stringify(tailoredResume.skills) !== JSON.stringify(baseResume.skills || [])
  ) {
    // Validator: verifySourceFacts ensuring no invented skills
    const { verifiedData } = verifySourceFacts(
      { skills: tailoredResume.skills },
      resumeCorpus
    );
    if (verifiedData?.skills && verifiedData.skills.length > 0) {
      const topKeywords = allJdKeywords.slice(0, 3).join(', ');
      proposals.push({
        id: 'skills-reorder',
        section: 'skills',
        target: { section: 'skills' },
        original: baseResume.skills || [],
        proposed: verifiedData.skills,
        reason: 'Reordered technical skill categories and items prioritizing technologies in target job description.',
        matchedJdKeyword: topKeywords || targetRole,
      });
    }
  }

  // (c) Experience Bullet Proposals
  const baseExperience = Array.isArray(baseResume.experience) ? baseResume.experience : [];
  const tailoredExperience = Array.isArray(tailoredResume.experience) ? tailoredResume.experience : [];

  for (let eIdx = 0; eIdx < baseExperience.length; eIdx++) {
    const baseExp = baseExperience[eIdx];
    const tailExp = tailoredExperience[eIdx];
    if (!baseExp || !tailExp) continue;

    const baseBullets = Array.isArray(baseExp.bullets) ? baseExp.bullets : [];
    const tailBullets = Array.isArray(tailExp.bullets) ? tailExp.bullets : [];

    for (let bIdx = 0; bIdx < baseBullets.length; bIdx++) {
      const origB = baseBullets[bIdx] || '';
      const propB = tailBullets[bIdx] || '';

      if (origB.trim() && propB.trim() && origB.trim() !== propB.trim()) {
        // Validator: validateBulletRewrite
        const isBulletValid = validateBulletRewrite(
          { original: origB, suggested: propB },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets,
          baseExp.company || baseExp.title || ''
        );

        if (isBulletValid) {
          const rw = (tailorResult.bulletRewrites || []).find(
            (r) => r.original?.trim().toLowerCase() === origB.trim().toLowerCase()
          );
          const matchedKw = findMatchedKeyword(propB, allJdKeywords) || targetRole;

          proposals.push({
            id: `exp-${eIdx}-bullet-${bIdx}`,
            section: 'experience',
            target: {
              section: 'experience',
              itemIndex: eIdx,
              bulletIndex: bIdx,
            },
            original: origB,
            proposed: propB,
            reason: rw?.why || 'Replaces passive wording with active verbs and quantifiable metric placeholders.',
            matchedJdKeyword: matchedKw,
          });
        }
      }
    }
  }

  // (d) Projects Bullet Proposals
  const baseProjects = Array.isArray(baseResume.projects) ? baseResume.projects : [];
  const tailoredProjects = Array.isArray(tailoredResume.projects) ? tailoredResume.projects : [];

  for (let pIdx = 0; pIdx < baseProjects.length; pIdx++) {
    const baseProj = baseProjects[pIdx];
    const tailProj = tailoredProjects[pIdx];
    if (!baseProj || !tailProj) continue;

    const baseBullets = Array.isArray(baseProj.bullets) ? baseProj.bullets : [];
    const tailBullets = Array.isArray(tailProj.bullets) ? tailProj.bullets : [];

    for (let bIdx = 0; bIdx < baseBullets.length; bIdx++) {
      const origB = baseBullets[bIdx] || '';
      const propB = tailBullets[bIdx] || '';

      if (origB.trim() && propB.trim() && origB.trim() !== propB.trim()) {
        // Validator: validateBulletRewrite
        const isBulletValid = validateBulletRewrite(
          { original: origB, suggested: propB },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets,
          baseProj.title || ''
        );

        if (isBulletValid) {
          const rw = (tailorResult.bulletRewrites || []).find(
            (r) => r.original?.trim().toLowerCase() === origB.trim().toLowerCase()
          );
          const matchedKw = findMatchedKeyword(propB, allJdKeywords) || targetRole;

          proposals.push({
            id: `proj-${pIdx}-bullet-${bIdx}`,
            section: 'projects',
            target: {
              section: 'projects',
              itemIndex: pIdx,
              bulletIndex: bIdx,
            },
            original: origB,
            proposed: propB,
            reason: rw?.why || 'Emphasizes technical implementation and measurable project contribution.',
            matchedJdKeyword: matchedKw,
          });
        }
      }
    }
  }

  // (e) Projects Order Proposal
  const baseProjTitles = baseProjects.map((p) => p.title || '');
  const tailProjTitles = tailoredProjects.map((p) => p.title || '');
  if (
    baseProjTitles.length > 1 &&
    JSON.stringify(baseProjTitles) !== JSON.stringify(tailProjTitles)
  ) {
    proposals.push({
      id: 'projects-reorder',
      section: 'projects',
      target: { section: 'projects' },
      original: baseProjTitles,
      proposed: tailProjTitles,
      reason: 'Reordered projects prioritizing technology stack overlap with target job description.',
      matchedJdKeyword: allJdKeywords.slice(0, 3).join(', '),
    });
  }

  // 5. Read-only Tailored ATS Score
  const tailoredScore = scoreResumeForTarget({
    resumeData: tailoredResume,
    jdAnalysis,
  });

  const jdSnapshot = {
    driveId: targetDriveId,
    targetRole,
    targetCompany,
    jobDescription: jobDescription || '',
    requiredSkills: jdAnalysis.requiredSkills || [],
    preferredSkills: jdAnalysis.preferredSkills || [],
    baselineScore: baselineScore?.overallScore ?? baselineScore?.atsScore ?? 0,
    projectedScore: tailoredScore?.overallScore ?? tailoredScore?.atsScore ?? 0,
  };

  // 6. Persist Server-Trusted TailorSession (short-lived with 30m TTL)
  let studentDocId = user._id;
  try {
    const studentDoc = await getStudentProfile(user);
    if (studentDoc && studentDoc._id) {
      studentDocId = studentDoc._id;
    }
  } catch (_) {}

  const userCollegeId = user.college?._id || user.college || resumeDoc.college;
  const session = await TailorSession.create({
    student: studentDocId,
    college: userCollegeId,
    resume: resumeDoc._id,
    contentHash: currentContentHash,
    proposals,
    jdSnapshot,
    targetRole,
    targetCompany,
    baselineScore: baselineScore?.overallScore ?? baselineScore?.atsScore ?? 0,
    projectedScore: tailoredScore?.overallScore ?? tailoredScore?.atsScore ?? 0,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  return {
    success: true,
    sessionId: session._id,
    targetRole,
    targetCompany,
    proposals,
    jdSnapshot,
    baselineScore: baselineScore?.overallScore ?? baselineScore?.atsScore ?? 0,
    projectedScore: tailoredScore?.overallScore ?? tailoredScore?.atsScore ?? 0,
    matchInfo: {
      matchedKeywords: baselineScore?.matchedKeywords || [],
      missingKeywords: baselineScore?.missingKeywords || [],
      breakdown: baselineScore?.breakdown || {},
    },
  };
}

/**
 * 2. POST /resumes/:id/tailor/apply
 * Applies selected proposals strictly from server-trusted TailorSession proposals.
 * Preserves pre-tailoring state as a ResumeVersion (source: manual, label "Before tailoring").
 * Creates a NEW ResumeVersion (source: 'ai-tailor') with jdSnapshot.
 */
async function applyTailorProposals(resumeId, payload, student) {
  const { sessionId, acceptedProposalIds = [], versionName } = payload;

  const resume = await getResumeWithOwnershipCheck(resumeId, student);
  const currentContentHash = computeContentHash(resume.data || {});

  if (!Array.isArray(acceptedProposalIds) || acceptedProposalIds.length === 0) {
    const err = new Error('No proposal IDs accepted. Nothing was applied.');
    err.status = 400;
    throw err;
  }

  // 1. Resolve & Validate Server-Trusted TailorSession
  let session = null;
  if (sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      const err = new Error('Invalid tailor session ID');
      err.status = 400;
      throw err;
    }
    session = await TailorSession.findById(sessionId);
  } else {
    // Fallback: look up latest active session for this student and resume
    session = await TailorSession.findOne({
      student: student._id,
      resume: resume._id,
      contentHash: currentContentHash,
    }).sort({ createdAt: -1 });
  }

  if (!session) {
    const err = new Error('Tailor session not found. Please regenerate proposals.');
    err.status = 400;
    throw err;
  }

  // Check TTL expiry
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    const err = new Error('Tailor session has expired. Please regenerate proposals.');
    err.status = 400;
    throw err;
  }

  // Multi-tenant student isolation: verify session belongs to authenticated student
  const studentIdStr = String(student._id || student);
  const studentUserStr = String(student.user?._id || student.user || '');
  const sessionStudentStr = String(session.student);

  if (sessionStudentStr !== studentIdStr && sessionStudentStr !== studentUserStr) {
    const err = new Error('Forbidden: Tailor session belongs to another student');
    err.status = 403;
    throw err;
  }

  // Verify session belongs to the requested resume
  if (String(session.resume) !== String(resume._id)) {
    const err = new Error('Tailor session does not match this resume');
    err.status = 400;
    throw err;
  }

  // Verify content hash matches current resume (detect concurrent modifications)
  if (session.contentHash && session.contentHash !== currentContentHash) {
    const err = new Error('Resume has been modified since tailoring proposals were generated. Please regenerate.');
    err.status = 409;
    throw err;
  }

  // 2. Validate Accepted Proposal IDs strictly against Server-Stored Proposals
  const serverProposalMap = new Map();
  for (const p of session.proposals || []) {
    if (p && p.id) {
      serverProposalMap.set(p.id, p);
    }
  }

  for (const propId of acceptedProposalIds) {
    if (!serverProposalMap.has(propId)) {
      const err = new Error(`Unknown or invalid proposal ID: ${propId}`);
      err.status = 400;
      throw err;
    }
  }

  // 3. Base Resume Protection: Save Pre-Tailoring State unless identical-hash version exists
  const existingHashVersion = await ResumeVersion.findOne({
    resume: resume._id,
    contentHash: currentContentHash,
  });

  let preTailorWarning = null;
  if (!existingHashVersion) {
    const { warning } = await createResumeVersion(resumeId, student, {
      name: 'Before tailoring',
      source: 'manual',
      label: 'Before tailoring',
      templateId: resume.templateId || 'modern',
      resumeData: resume.data || {},
      contentHash: currentContentHash,
      targetRole: '',
      targetCompany: '',
      atsScore: 0,
    });
    preTailorWarning = warning;
  }

  // 4. Apply Accepted Proposals using SERVER-STORED text ONLY (client-supplied proposed text ignored)
  const updatedResumeData = JSON.parse(JSON.stringify(resume.data || {}));
  let appliedCount = 0;

  for (const propId of acceptedProposalIds) {
    const trustedProp = serverProposalMap.get(propId);
    if (!trustedProp) continue;

    if (trustedProp.section === 'summary') {
      updatedResumeData.summary = trustedProp.proposed;
      appliedCount++;
    } else if (trustedProp.section === 'skills') {
      updatedResumeData.skills = trustedProp.proposed;
      appliedCount++;
    } else if (trustedProp.section === 'experience' && trustedProp.target) {
      const { itemIndex, bulletIndex } = trustedProp.target;
      if (
        Array.isArray(updatedResumeData.experience) &&
        typeof itemIndex === 'number' &&
        updatedResumeData.experience[itemIndex]
      ) {
        const item = updatedResumeData.experience[itemIndex];
        if (Array.isArray(item.bullets) && typeof bulletIndex === 'number') {
          item.bullets[bulletIndex] = trustedProp.proposed;
          appliedCount++;
        }
      }
    } else if (trustedProp.section === 'projects') {
      if (trustedProp.id === 'projects-reorder') {
        const proposedTitles = trustedProp.proposed || [];
        const existingProjects = [...(updatedResumeData.projects || [])];
        existingProjects.sort((a, b) => {
          const aIdx = proposedTitles.indexOf(a.title);
          const bIdx = proposedTitles.indexOf(b.title);
          return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        });
        updatedResumeData.projects = existingProjects;
        appliedCount++;
      } else if (trustedProp.target) {
        const { itemIndex, bulletIndex } = trustedProp.target;
        if (
          Array.isArray(updatedResumeData.projects) &&
          typeof itemIndex === 'number' &&
          updatedResumeData.projects[itemIndex]
        ) {
          const item = updatedResumeData.projects[itemIndex];
          if (Array.isArray(item.bullets) && typeof bulletIndex === 'number') {
            item.bullets[bulletIndex] = trustedProp.proposed;
            appliedCount++;
          }
        }
      }
    }
  }

  // 5. Compute Final ATS Score with Accepted Changes Applied
  const effectiveJdSnapshot = session.jdSnapshot || payload.jdSnapshot || {};
  let finalScore = 0;
  if (effectiveJdSnapshot) {
    const scoreRes = scoreResumeForTarget({
      resumeData: updatedResumeData,
      jdAnalysis: {
        roleTitle: effectiveJdSnapshot.targetRole || '',
        company: effectiveJdSnapshot.targetCompany || '',
        requiredSkills: effectiveJdSnapshot.requiredSkills || [],
        preferredSkills: effectiveJdSnapshot.preferredSkills || [],
      },
    });
    finalScore = scoreRes?.overallScore || 0;
  }

  // 6. Create NEW ResumeVersion with source: 'ai-tailor' and jdSnapshot
  const defaultVersionName = `Tailored: ${effectiveJdSnapshot?.targetRole || 'Software Engineer'}`;
  const effectiveVersionName = (versionName || '').trim() || defaultVersionName;

  const { version: newVersion, warning: tailorWarning } = await createResumeVersion(
    resumeId,
    student,
    {
      name: effectiveVersionName,
      source: 'ai-tailor',
      label: `Tailored for ${effectiveJdSnapshot?.targetCompany || effectiveJdSnapshot?.targetRole || 'target job'}`,
      templateId: resume.templateId || 'modern',
      resumeData: updatedResumeData,
      targetRole: effectiveJdSnapshot?.targetRole || '',
      targetCompany: effectiveJdSnapshot?.targetCompany || '',
      targetDrive: effectiveJdSnapshot?.driveId || null,
      atsScore: finalScore,
      baselineScore: effectiveJdSnapshot?.baselineScore || 0,
      jdSnapshot: effectiveJdSnapshot || null,
    }
  );

  // 7. Update active Resume document data
  resume.data = updatedResumeData;
  await resume.save();

  // 8. Clean up consumed session
  await TailorSession.findByIdAndDelete(session._id);

  return {
    success: true,
    message: `Applied ${appliedCount} change proposal(s) and created new version`,
    appliedCount,
    version: newVersion,
    resume,
    warning: tailorWarning || preTailorWarning,
  };
}

module.exports = {
  generateTailorProposals,
  applyTailorProposals,
  computeContentHash,
};
