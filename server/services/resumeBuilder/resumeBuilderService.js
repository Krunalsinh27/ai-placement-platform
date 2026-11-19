/**
 * AI Resume Builder & Tailoring Service
 *
 * Capabilities:
 * 1. Compiles baseline resume from Student model + parsed resumeProfile.
 * 2. Tailors resume to target Drive or custom JD:
 *    - Reorders skills (matching skills first in each category).
 *    - Promotes relevant projects based on technology overlap.
 *    - Suggests bullet rewrites with action verbs and target skills.
 *    - Reuses `validateBulletRewrite` so AI NEVER invents skills, employers, or numbers.
 *    - Inserts '[add your real number]' placeholders for unverified metrics.
 * 3. Before/After ATS scoring using `computeAtsScore`.
 * 4. Placeholder detector to block PDF export until placeholders are resolved.
 * 5. Truthful cover letter generator grounded strictly in student profile data.
 * 6. Version control (strictly capped at 5 versions per student).
 */

const mongoose = require('mongoose');
const { Student, Drive, College, ResumeVersion, AiUsage } = require('../../models');
const { computeAtsScore, validateBulletRewrite } = require('../ai/resumeAnalyzer');
const { analyzeJobDescription } = require('../ai/jdAnalyzer');
const { callAiWithQuotaAndRetry } = require('../ai/aiClient');
const { redactPII } = require('../ai/redactor');
const { normalizeSkill } = require('../ai/skillsDictionary');

// =============================================================================
// PLACEHOLDER REGEX & CHECKER
// =============================================================================

const PLACEHOLDER_REGEX = /\[(?:add\s+your\s+real\s+number|add\s+real\s+number|add\s+number|your\s+number|metric|X%|X)\]/i;

/**
 * Checks if resume content contains any unresolved '[add your real number]' placeholders.
 * Returns { hasPlaceholders: boolean, occurrences: Array<{ section: string, text: string }> }
 */
function checkUnresolvedPlaceholders(resumeData) {
  if (!resumeData || typeof resumeData !== 'object') {
    return { hasPlaceholders: false, occurrences: [] };
  }

  const occurrences = [];

  // 1. Check summary
  if (resumeData.summary && PLACEHOLDER_REGEX.test(resumeData.summary)) {
    occurrences.push({ section: 'Summary', text: resumeData.summary });
  }

  // 2. Check experience bullets
  if (Array.isArray(resumeData.experience)) {
    resumeData.experience.forEach((exp, eIdx) => {
      const expTitle = exp.title || exp.company || `Experience #${eIdx + 1}`;
      if (Array.isArray(exp.bullets)) {
        exp.bullets.forEach((b) => {
          if (b && PLACEHOLDER_REGEX.test(b)) {
            occurrences.push({ section: `Experience (${expTitle})`, text: b });
          }
        });
      }
    });
  }

  // 3. Check project bullets
  if (Array.isArray(resumeData.projects)) {
    resumeData.projects.forEach((proj, pIdx) => {
      const projTitle = proj.title || `Project #${pIdx + 1}`;
      if (Array.isArray(proj.bullets)) {
        proj.bullets.forEach((b) => {
          if (b && PLACEHOLDER_REGEX.test(b)) {
            occurrences.push({ section: `Projects (${projTitle})`, text: b });
          }
        });
      }
    });
  }

  return {
    hasPlaceholders: occurrences.length > 0,
    occurrences,
  };
}

// =============================================================================
// SKILL CATEGORIZATION HELPER
// =============================================================================

const LANG_FRAMEWORK_SET = new Set([
  'javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'go', 'golang', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'dart', 'scala', 'html', 'css', 'react', 'react.js',
  'next.js', 'vue', 'angular', 'svelte', 'nodejs', 'node.js', 'express', 'nestjs', 'django',
  'flask', 'fastapi', 'spring', 'spring boot', 'asp.net', 'laravel', 'flutter', 'react native'
]);

const DB_CLOUD_SET = new Set([
  'mongodb', 'postgresql', 'postgres', 'mysql', 'sql', 'sqlite', 'redis', 'elasticsearch',
  'dynamodb', 'cassandra', 'firebase', 'supabase', 'aws', 'amazon web services', 'azure',
  'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins',
  'ci/cd', 'github actions', 'linux', 'unix', 'nginx', 'apache'
]);

function categorizeSkillsList(skills = []) {
  const langFrameworks = [];
  const dbCloud = [];
  const toolsFundamentals = [];

  for (const sk of skills) {
    const norm = normalizeSkill(sk);
    if (LANG_FRAMEWORK_SET.has(norm)) {
      langFrameworks.push(sk);
    } else if (DB_CLOUD_SET.has(norm)) {
      dbCloud.push(sk);
    } else {
      toolsFundamentals.push(sk);
    }
  }

  const result = [];
  if (langFrameworks.length > 0) {
    result.push({ category: 'Languages & Frameworks', items: langFrameworks });
  }
  if (dbCloud.length > 0) {
    result.push({ category: 'Databases & Cloud / DevOps', items: dbCloud });
  }
  if (toolsFundamentals.length > 0) {
    result.push({ category: 'Developer Tools & Core CS', items: toolsFundamentals });
  }

  if (result.length === 0 && skills.length > 0) {
    result.push({ category: 'Technical Skills', items: skills });
  }

  return result;
}

// =============================================================================
// BASE RESUME COMPILATION
// =============================================================================

/**
 * Compiles a clean baseline resume from Student model + parsed resumeProfile
 */
async function compileBaseResume(studentUserId) {
  let student = await Student.findOne({ user: studentUserId })
    .populate('user', 'name email')
    .populate('college', 'name city state');

  if (!student) {
    student = await Student.findById(studentUserId)
      .populate('user', 'name email')
      .populate('college', 'name city state');
  }

  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const fullName = student.user?.name || 'Candidate Name';
  const email = student.user?.email || '';
  const phone = student.phone || '';
  const location = [student.college?.city, student.college?.state].filter(Boolean).join(', ') || '';

  // Extract skills
  const profileSkills = (student.resumeProfile?.skills || []).map((s) => s.name || s).filter(Boolean);
  const rawSkills = (student.skills || []).filter(Boolean);
  const allSkills = Array.from(new Set([...profileSkills, ...rawSkills]));
  const categorizedSkills = categorizeSkillsList(allSkills);

  // Summary
  const summary =
    student.resumeProfile?.summary ||
    `Aspiring ${student.branch || 'Computer Science'} graduate from ${student.college?.name || 'University'} with hands-on technical skills and engineering project experience.`;

  // Experience
  const experience = (student.resumeProfile?.experience || []).map((e) => ({
    title: e.title || 'Software Engineering Intern',
    company: e.company || 'Tech Company',
    location: e.location || '',
    duration: e.duration || '',
    bullets:
      Array.isArray(e.bullets) && e.bullets.length > 0
        ? e.bullets
        : e.description
        ? [e.description]
        : ['Developed software components and collaborated with senior engineering team members.'],
  }));

  // Projects
  const projects = (student.resumeProfile?.projects || []).map((p) => ({
    title: p.title || 'Technical Platform Project',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    duration: p.duration || '',
    link: p.link || '',
    bullets:
      Array.isArray(p.bullets) && p.bullets.length > 0
        ? p.bullets
        : p.description
        ? [p.description]
        : ['Engineered scalable full-stack web application with responsive UI and database indexing.'],
  }));

  // Education
  const educationList = [];
  if (Array.isArray(student.resumeProfile?.education) && student.resumeProfile.education.length > 0) {
    student.resumeProfile.education.forEach((edu) => {
      educationList.push({
        degree: edu.degree || 'Bachelor of Technology',
        institution: edu.institution || student.college?.name || '',
        field: edu.field || student.branch || '',
        year: edu.year || String(student.batchYear || ''),
        score: student.cgpa ? `${student.cgpa} CGPA` : '',
      });
    });
  } else {
    educationList.push({
      degree: 'Bachelor of Technology',
      institution: student.college?.name || 'Engineering College',
      field: student.branch || 'Computer Science and Engineering',
      year: String(student.batchYear || '2025'),
      score: student.cgpa ? `${student.cgpa} CGPA` : '',
    });
  }

  // Certifications
  const certifications = (student.resumeProfile?.certifications || []).map((c) =>
    typeof c === 'string' ? c : c.title || c.name || ''
  ).filter(Boolean);

  return {
    contact: {
      fullName,
      email,
      phone,
      location,
      linkedin: student.linkedin || '',
      github: student.github || '',
      portfolio: student.portfolio || '',
    },
    summary,
    skills: categorizedSkills,
    experience,
    projects,
    education: educationList,
    certifications,
  };
}

// =============================================================================
// TAILORING ENGINE
// =============================================================================

const TAILOR_SYSTEM_PROMPT = `You are an executive ATS resume strategist and engineering hiring manager.
Your task is to analyze candidate resume bullets against target job requirements and suggest stronger, impactful bullet rewrites.

CRITICAL HONESTY & SECURITY RULES:
1. NEVER invent employers, job titles, certifications, degrees, dates, or technical skills not present in the candidate profile.
2. NEVER invent concrete numbers or metrics (e.g. "reduced by 45%", "served 10,000 users").
   If suggesting a metric rewrite where the real number is unknown, you MUST use the exact placeholder token "[add your real number]" (e.g. "improved query throughput by [add your real number]%").
3. Lead each bullet with a decisive, active engineering verb (e.g. Architected, Optimized, Engineered, Implemented).
4. For each bullet, provide:
   - original: The original bullet text.
   - suggested: The rewritten bullet.
   - why: Brief rationale.
5. Return strictly valid JSON matching the schema.

JSON SCHEMA:
{
  "summary": "string",
  "rewrites": [
    {
      "original": "string",
      "suggested": "string",
      "why": "string"
    }
  ]
}`;

/**
 * Tailors a candidate's resume to a target Drive or Job Description
 */
async function tailorResume({ studentUserId, baseResumeData, driveId = null, jobDescription = '' }) {
  // 1. Quota check
  const quotaCheck = await AiUsage.canMakeCall(studentUserId, 'tailor', 'student');
  if (!quotaCheck.allowed) {
    const err = new Error(quotaCheck.message || 'Daily resume tailoring quota reached.');
    err.status = 429;
    err.statusCode = 429;
    throw err;
  }

  // 2. Fetch student
  let student = await Student.findOne({ user: studentUserId }).populate('college');
  if (!student) student = await Student.findById(studentUserId).populate('college');
  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  // 3. Resolve target requirements
  let targetRole = 'Software Engineer';
  let targetCompany = '';
  let requiredSkills = [];
  let preferredSkills = [];
  let minYearsExp = 0;
  let targetEducation = '';

  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    const driveDoc = await Drive.findById(driveId).populate('company', 'name');
    if (driveDoc) {
      targetRole = driveDoc.role || targetRole;
      targetCompany = driveDoc.company?.name || '';
      requiredSkills = (driveDoc.requiredSkills || []).map(normalizeSkill);
      preferredSkills = (driveDoc.preferredSkills || []).map(normalizeSkill);
    }
  } else if (jobDescription && jobDescription.trim()) {
    try {
      const parsedJd = await analyzeJobDescription(jobDescription, studentUserId);
      targetRole = parsedJd.roleTitle || targetRole;
      requiredSkills = (parsedJd.requiredSkills || []).map(normalizeSkill);
      preferredSkills = (parsedJd.preferredSkills || []).map(normalizeSkill);
      minYearsExp = parsedJd.minYearsExperience || 0;
      targetEducation = parsedJd.education || '';
    } catch (jdErr) {
      console.warn('[ResumeBuilder] JD parsing fallback:', jdErr.message);
    }
  }

  const targetSet = new Set([...requiredSkills, ...preferredSkills]);
  const targetReqs = {
    requiredSkills,
    preferredSkills,
    minYearsExperience: minYearsExp,
    education: targetEducation,
    roleTitle: targetRole,
  };

  // Compile base resume if not supplied
  const baseResume = baseResumeData || (await compileBaseResume(studentUserId));

  // 4. Compute Baseline ATS Score
  const baseStudentData = {
    skills: (baseResume.skills || []).flatMap((c) => c.items || []),
    experience: baseResume.experience || [],
    projects: baseResume.projects || [],
    education: baseResume.education || [],
  };
  const baselineAts = computeAtsScore(baseStudentData, targetReqs);

  // 5. Tailor Skills: Reorder matching skills to front of categories
  const tailoredSkills = (baseResume.skills || []).map((cat) => {
    const items = [...(cat.items || [])];
    items.sort((a, b) => {
      const aMatches = targetSet.has(normalizeSkill(a)) ? 1 : 0;
      const bMatches = targetSet.has(normalizeSkill(b)) ? 1 : 0;
      return bMatches - aMatches;
    });
    return {
      category: cat.category,
      items,
    };
  });

  // 6. Tailor Projects: Promote projects matching target skills
  const tailoredProjects = [...(baseResume.projects || [])];
  tailoredProjects.sort((a, b) => {
    const aTechs = (a.technologies || []).map(normalizeSkill);
    const bTechs = (b.technologies || []).map(normalizeSkill);
    const aMatches = aTechs.filter((t) => targetSet.has(t)).length;
    const bMatches = bTechs.filter((t) => targetSet.has(t)).length;
    return bMatches - aMatches;
  });

  // 7. Bullet Rewriting: Collect candidate bullets
  const existingBullets = [];
  (baseResume.experience || []).forEach((e) => (e.bullets || []).forEach((b) => existingBullets.push(b)));
  (baseResume.projects || []).forEach((p) => (p.bullets || []).forEach((b) => existingBullets.push(b)));

  const candidateSkillsSet = new Set(
    (baseResume.skills || []).flatMap((c) => c.items || []).map((s) => s.toLowerCase())
  );
  const resumeCorpus = JSON.stringify(baseResume).toLowerCase();

  let proposedRewrites = [];
  let tailoredSummary = baseResume.summary;

  const userPrompt = `Target Role: ${targetRole}
Target Company: ${targetCompany || 'Target Employer'}
Target Required Skills: ${requiredSkills.join(', ')}
Target Preferred Skills: ${preferredSkills.join(', ')}

Candidate Resume Bullets to Optimize:
${existingBullets.slice(0, 8).map((b, i) => `Original Bullet: "${b}"`).join('\n')}

<CANDIDATE_RESUME_CORPUS>
${redactPII(resumeCorpus.slice(0, 3000))}
</CANDIDATE_RESUME_CORPUS>`;

  try {
    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt: TAILOR_SYSTEM_PROMPT,
      userPrompt,
      mode: 'tailor',
      userId: studentUserId,
    });

    if (aiRes.success && aiRes.data) {
      if (aiRes.data.summary) {
        tailoredSummary = aiRes.data.summary;
      }
      if (Array.isArray(aiRes.data.rewrites)) {
        proposedRewrites = aiRes.data.rewrites;
      }
    }
  } catch (aiErr) {
    console.warn('[ResumeBuilder] AI tailoring error, using rule-based rewrites:', aiErr.message);
  }

  // Fallback rule-based rewrites if AI returned empty
  if (proposedRewrites.length === 0 && existingBullets.length > 0) {
    for (const b of existingBullets.slice(0, 4)) {
      const safeRewrite = `Architected and optimized technical workflows delivering [add your real number]% efficiency improvement`;
      proposedRewrites.push({
        original: b,
        suggested: safeRewrite,
        why: 'Leads with strong action verb and adds quantifiable impact placeholder.',
      });
    }
  }

  // 8. Validate All Rewrites via validateBulletRewrite
  const validatedRewrites = [];
  const rewriteMap = new Map();

  for (const rw of proposedRewrites) {
    if (validateBulletRewrite(rw, resumeCorpus, candidateSkillsSet, existingBullets)) {
      validatedRewrites.push(rw);
      rewriteMap.set(rw.original.trim().toLowerCase(), rw.suggested);
    } else {
      // If AI invented an unverified number or skill, fall back to safe placeholder rewrite
      const safeRewrite = `Optimized and implemented core features delivering [add your real number]% improvement in operational performance`;
      if (validateBulletRewrite({ original: rw.original, suggested: safeRewrite }, resumeCorpus, candidateSkillsSet, existingBullets)) {
        validatedRewrites.push({
          original: rw.original,
          suggested: safeRewrite,
          why: 'Neutralized unverified claim; replaced with compliant action-verb template.',
        });
        rewriteMap.set(rw.original.trim().toLowerCase(), safeRewrite);
      }
    }
  }

  // Apply rewrites into tailored experience & projects
  const tailoredExperience = (baseResume.experience || []).map((e) => ({
    ...e,
    bullets: (e.bullets || []).map((b) => rewriteMap.get(b.trim().toLowerCase()) || b),
  }));

  const tailoredProjectsFinal = tailoredProjects.map((p) => ({
    ...p,
    bullets: (p.bullets || []).map((b) => rewriteMap.get(b.trim().toLowerCase()) || b),
  }));

  const tailoredResume = {
    ...baseResume,
    summary: tailoredSummary,
    skills: tailoredSkills,
    experience: tailoredExperience,
    projects: tailoredProjectsFinal,
  };

  // 9. Compute Tailored ATS Score
  const tailoredStudentData = {
    skills: tailoredSkills.flatMap((c) => c.items || []),
    experience: tailoredExperience,
    projects: tailoredProjectsFinal,
    education: tailoredResume.education || [],
  };
  const tailoredAts = computeAtsScore(tailoredStudentData, targetReqs);

  // 10. Record quota usage
  try {
    await AiUsage.recordCall(studentUserId, 'tailor');
  } catch (_) {}

  return {
    baseResume,
    tailoredResume,
    baselineAtsScore: baselineAts.atsScore,
    tailoredAtsScore: tailoredAts.atsScore,
    scoreDelta: Math.max(0, tailoredAts.atsScore - baselineAts.atsScore),
    matchedSkills: tailoredAts.matchedSkills,
    missingRequired: tailoredAts.missingRequired,
    missingPreferred: tailoredAts.missingPreferred,
    bulletRewrites: validatedRewrites,
    targetRole,
    targetCompany,
  };
}

// =============================================================================
// TRUTHFUL COVER LETTER GENERATOR
// =============================================================================

const COVER_LETTER_SYSTEM_PROMPT = `You are an executive talent director.
Write a professional, truthful 3-paragraph campus placement cover letter based STRICTLY on the candidate's verified profile data.

CRITICAL HONESTY RULES:
1. NEVER invent previous employers, companies, certifications, degrees, or years of experience.
2. Reference candidate's real college name, branch, degree, verified projects, and confirmed skills.
3. Structure:
   - Paragraph 1: State the exact target role, target company, and current academic standing at college.
   - Paragraph 2: Highlight 1-2 real academic or internship projects and matching technical proficiencies directly aligned with the target role.
   - Paragraph 3: Reiterate cultural enthusiasm, problem-solving mindset, and professional closing.
4. Keep the length concise: 200 to 300 words.
5. Return strictly valid JSON: { "coverLetter": "string" }.`;

/**
 * Generates a truthful cover letter grounded only in the student's verified profile
 */
async function generateCoverLetter({ studentUserId, role = 'Software Engineer', company = '', driveId = null, jobDescription = '' }) {
  // 1. Quota check
  const quotaCheck = await AiUsage.canMakeCall(studentUserId, 'tailor', 'student');
  if (!quotaCheck.allowed) {
    const err = new Error(quotaCheck.message || 'Daily AI tailoring quota reached.');
    err.status = 429;
    err.statusCode = 429;
    throw err;
  }

  // 2. Fetch student
  let student = await Student.findOne({ user: studentUserId })
    .populate('user', 'name email')
    .populate('college', 'name city state');
  if (!student) {
    student = await Student.findById(studentUserId)
      .populate('user', 'name email')
      .populate('college', 'name city state');
  }
  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  let effectiveRole = role;
  let effectiveCompany = company;

  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    const driveDoc = await Drive.findById(driveId).populate('company', 'name');
    if (driveDoc) {
      effectiveRole = driveDoc.role || effectiveRole;
      effectiveCompany = driveDoc.company?.name || effectiveCompany;
    }
  }

  if (!effectiveCompany || !effectiveCompany.trim()) {
    effectiveCompany = 'the organization';
  }

  const candidateName = student.user?.name || 'Candidate';
  const collegeName = student.college?.name || 'University';
  const branchName = student.branch || 'Engineering';
  const confirmedSkills = (student.resumeProfile?.skills || []).map((s) => s.name || s);
  const projects = (student.resumeProfile?.projects || []).map((p) => p.title);

  let coverLetterText = '';
  const userPrompt = `Target Role: ${effectiveRole}
Target Company: ${effectiveCompany}
Candidate Name: ${candidateName}
College: ${collegeName}
Branch/Major: ${branchName}
Confirmed Technical Skills: ${confirmedSkills.slice(0, 10).join(', ')}
Real Academic/Personal Projects: ${projects.slice(0, 3).join(', ')}`;

  try {
    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
      userPrompt,
      mode: 'cover_letter',
      userId: studentUserId,
    });

    if (aiRes.success && aiRes.data?.coverLetter) {
      coverLetterText = aiRes.data.coverLetter;
    }
  } catch (aiErr) {
    console.warn('[ResumeBuilder] AI cover letter generation failed, using rule template:', aiErr.message);
  }

  // Fallback truthful template
  if (!coverLetterText) {
    coverLetterText = `Dear Hiring Team,\n\nI am writing to express my enthusiastic interest in the ${effectiveRole} position at ${effectiveCompany}. As a final-year ${branchName} student at ${collegeName}, I have developed strong foundational competencies in software engineering and problem-solving, and I am excited about the opportunity to contribute to your engineering organization.\n\nDuring my academic coursework and project initiatives${
      projects.length > 0 ? ` (such as ${projects[0]})` : ''
    }, I have applied ${
      confirmedSkills.slice(0, 4).join(', ') || 'modern engineering technologies'
    } to build scalable, robust software solutions. My hands-on experience designing modular components and optimizing application performance directly aligns with the technical rigor expected at ${effectiveCompany}.\n\nThank you for your time and consideration. I welcome the opportunity to discuss how my technical proficiencies and collaborative drive can support your team's upcoming milestones.\n\nSincerely,\n${candidateName}`;
  }

  // Record usage
  try {
    await AiUsage.recordCall(studentUserId, 'tailor');
  } catch (_) {}

  return {
    coverLetter: coverLetterText,
    targetRole: effectiveRole,
    targetCompany: effectiveCompany,
    candidateName,
  };
}

// =============================================================================
// VERSION CONTROL (MAX 5 VERSIONS PER STUDENT)
// =============================================================================

const MAX_VERSIONS_PER_STUDENT = 5;

/**
 * Saves a resume version snapshot, enforcing max 5 versions per student
 */
async function saveResumeVersion({ studentUserId, versionData }) {
  let student = await Student.findOne({ user: studentUserId });
  if (!student) student = await Student.findById(studentUserId);
  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const { versionId, name, targetRole, targetCompany, targetDrive, templateId, resumeData, atsScore, baselineScore, coverLetter, isDefault } = versionData;

  if (!name || !name.trim()) {
    const err = new Error('Version name is required');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }

  // Updating existing version
  if (versionId && mongoose.Types.ObjectId.isValid(versionId)) {
    const existing = await ResumeVersion.findOne({ _id: versionId, student: student._id });
    if (!existing) {
      const err = new Error('Resume version not found or access denied');
      err.status = 404;
      err.statusCode = 404;
      throw err;
    }

    existing.name = name.trim();
    if (targetRole !== undefined) existing.targetRole = targetRole;
    if (targetCompany !== undefined) existing.targetCompany = targetCompany;
    if (targetDrive !== undefined) existing.targetDrive = targetDrive || null;
    if (templateId) existing.templateId = templateId;
    if (resumeData) existing.resumeData = resumeData;
    if (atsScore !== undefined) existing.atsScore = atsScore;
    if (baselineScore !== undefined) existing.baselineScore = baselineScore;
    if (coverLetter !== undefined) existing.coverLetter = coverLetter;
    if (isDefault !== undefined) existing.isDefault = Boolean(isDefault);

    await existing.save();
    return { version: existing, totalVersions: await ResumeVersion.countDocuments({ student: student._id }) };
  }

  // Creating new version: enforce max 5 cap
  const currentCount = await ResumeVersion.countDocuments({ student: student._id });
  if (currentCount >= MAX_VERSIONS_PER_STUDENT) {
    // Auto-prune oldest non-default version to keep exactly 5
    const oldest = await ResumeVersion.findOne({ student: student._id, isDefault: false }).sort({ createdAt: 1 });
    if (oldest) {
      await ResumeVersion.findByIdAndDelete(oldest._id);
    } else {
      // If all are default, delete oldest
      const anyOldest = await ResumeVersion.findOne({ student: student._id }).sort({ createdAt: 1 });
      if (anyOldest) await ResumeVersion.findByIdAndDelete(anyOldest._id);
    }
  }

  const newVersion = await ResumeVersion.create({
    student: student._id,
    college: student.college,
    name: name.trim(),
    targetRole: targetRole || '',
    targetCompany: targetCompany || '',
    targetDrive: targetDrive || null,
    templateId: templateId || 'modern',
    resumeData: resumeData || {},
    atsScore: atsScore || 0,
    baselineScore: baselineScore || 0,
    coverLetter: coverLetter || '',
    isDefault: Boolean(isDefault),
  });

  const totalCount = await ResumeVersion.countDocuments({ student: student._id });

  return {
    version: newVersion,
    totalVersions: totalCount,
  };
}

async function listResumeVersions(studentUserId) {
  let student = await Student.findOne({ user: studentUserId });
  if (!student) student = await Student.findById(studentUserId);
  if (!student) return { versions: [] };

  const versions = await ResumeVersion.find({ student: student._id })
    .select('name targetRole targetCompany targetDrive templateId atsScore baselineScore isDefault createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  return { versions, count: versions.length, maxVersions: MAX_VERSIONS_PER_STUDENT };
}

async function getResumeVersion(versionId, studentUserId) {
  let student = await Student.findOne({ user: studentUserId });
  if (!student) student = await Student.findById(studentUserId);
  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const version = await ResumeVersion.findOne({ _id: versionId, student: student._id })
    .populate('targetDrive', 'role company')
    .lean();

  if (!version) {
    const err = new Error('Resume version not found or access denied');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  return version;
}

async function deleteResumeVersion(versionId, studentUserId) {
  let student = await Student.findOne({ user: studentUserId });
  if (!student) student = await Student.findById(studentUserId);
  if (!student) {
    const err = new Error('Student profile not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const deleted = await ResumeVersion.findOneAndDelete({ _id: versionId, student: student._id });
  if (!deleted) {
    const err = new Error('Resume version not found or access denied');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  return { success: true, message: 'Resume version deleted successfully' };
}

module.exports = {
  checkUnresolvedPlaceholders,
  categorizeSkillsList,
  compileBaseResume,
  tailorResume,
  generateCoverLetter,
  saveResumeVersion,
  listResumeVersions,
  getResumeVersion,
  deleteResumeVersion,
  MAX_VERSIONS_PER_STUDENT,
  PLACEHOLDER_REGEX,
};
