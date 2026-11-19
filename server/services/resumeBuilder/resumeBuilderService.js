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
const { computeAtsScore } = require('../ai/resumeAnalyzer');
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
// REWRITE HONESTY RULES & ALLOW-LISTS
// =============================================================================

const ALLOW_LISTED_OPENING_VERBS = new Set([
  'built', 'build', 'developed', 'develop', 'implemented', 'implement',
  'designed', 'design', 'integrated', 'integrate', 'tested', 'test',
  'validated', 'validate', 'deployed', 'deploy', 'managed', 'manage',
  'engineered', 'engineer', 'created', 'create', 'maintained', 'maintain',
  'configured', 'configure', 'refactored', 'refactor', 'optimized', 'optimize',
  'automated', 'automate', 'resolved', 'resolve', 'programmed', 'program',
  'supported', 'support', 'documented', 'document', 'analyzed', 'analyze'
]);

const BANNED_INFLATION_WORDS = new Set([
  'seamlessly', 'comprehensive', 'robust', 'cutting-edge',
  'architected', 'orchestrated', 'spearheaded', 'pioneered', 'leveraged'
]);

const CONDITIONALLY_BANNED_WORDS = new Set([
  'scalable', 'collaborative'
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
  'which', 'this', 'that', 'these', 'those', 'then', 'so', 'than', 'such',
  'both', 'through', 'about', 'for', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'of', 'while', 'during',
  'to', 'from', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'all', 'any', 'each', 'few', 'more', 'most', 'other',
  'some', 'no', 'nor', 'not', 'only', 'own', 'same', 'too', 'very', 'can',
  'will', 'just', 'should', 'now', 'into', 'with', 'by', 'at', 'our', 'my',
  'their', 'up', 'down', 'using', 'used', 'via', 'across', 'within', 'per',
  'between', 'based', 'including', 'well', 'also', 'etc',
  // Placeholder tokens inside [add your real number]
  'add', 'your', 'real', 'number', 'metric', 'x'
]);

/**
 * Validates bullet rewrite with strict diff checking:
 * 1. Rejects banned inflation words (seamlessly, comprehensive, robust, cutting-edge,
 *    architected, orchestrated, spearheaded, pioneered, leveraged).
 * 2. Rejects conditionally banned words (scalable, collaborative) unless present in original bullet.
 * 3. Allows opening verb replacement only with truthful stronger synonyms from allow-list.
 * 4. Diff check: Every content word in rewrite (excluding stopwords and allow-listed opening verb)
 *    must exist in original bullet, entry context, or candidate skills list.
 * 5. Rejects invented metrics without [add your real number] placeholder.
 */
function validateBulletRewrite(
  { original, suggested },
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  existingBullets = [],
  entryContext = ''
) {
  if (!original || !suggested || typeof original !== 'string' || typeof suggested !== 'string') {
    return false;
  }
  const cleanOrig = original.trim();
  const cleanSugg = suggested.trim();
  if (cleanOrig.length < 5 || cleanSugg.length < 5) return false;

  const origLower = cleanOrig.toLowerCase();
  const suggLower = cleanSugg.toLowerCase();

  // 1. Must refer to an existing bullet in candidate resume
  const exists = existingBullets.some((b) => {
    const bLower = b.toLowerCase();
    return bLower.includes(origLower) || origLower.includes(bLower);
  });
  if (!exists && existingBullets.length > 0) {
    return false;
  }

  // 2. Reject banned inflation words
  const suggTokens = suggLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of suggTokens) {
    if (BANNED_INFLATION_WORDS.has(token)) {
      return false;
    }
  }

  // 3. Reject conditionally banned words unless present in original bullet
  for (const token of suggTokens) {
    if (CONDITIONALLY_BANNED_WORDS.has(token)) {
      if (!origLower.includes(token)) {
        return false;
      }
    }
  }

  // 4. Concrete numbers check (strip allowed placeholders like [add your real number])
  const placeholderRegex =
    /\[(?:add\s+your\s+real\s+number|add\s+number|your\s+number|number|metric|X%|X)\]/gi;
  const suggWithoutPlaceholders = cleanSugg.replace(placeholderRegex, '');
  const suggNumbers = suggWithoutPlaceholders.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
  const corpus = `${resumeCorpus} ${entryContext} ${original}`.toLowerCase();

  for (const num of suggNumbers) {
    const cleanNum = num.toLowerCase();
    if (!corpus.includes(cleanNum)) {
      return false; // Introduced unverified concrete number
    }
  }

  // 5. Technologies and skills check
  const { extractSkillsFromText, matchSkillInText } = require('../ai/skillsDictionary');
  const suggSkills = extractSkillsFromText(cleanSugg);
  for (const sk of suggSkills) {
    const skLower = sk.toLowerCase();
    const inOriginal = matchSkillInText(sk, cleanOrig);
    const inCandidateSkills = candidateSkillsSet.has(skLower);
    const inCorpus = matchSkillInText(sk, corpus);

    if (!inOriginal && !inCandidateSkills && !inCorpus) {
      return false; // Introduced new technical skill
    }
  }

  // 6. Content word diff check
  const cleanForDiff = suggWithoutPlaceholders
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase();
  const words = cleanForDiff.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const allowedText = `${cleanOrig} ${entryContext} ${Array.from(candidateSkillsSet).join(' ')}`.toLowerCase();
  const allowedTokens = new Set(
    allowedText
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );

  const firstWord = words[0];
  const isAllowListedOpening = ALLOW_LISTED_OPENING_VERBS.has(firstWord);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (i === 0 && isAllowListedOpening) continue;
    if (STOPWORDS.has(word) || /^\d+$/.test(word)) continue;

    const singular = word.endsWith('s') ? word.slice(0, -1) : word;
    const isAllowed =
      allowedTokens.has(word) ||
      allowedTokens.has(singular) ||
      Array.from(allowedTokens).some((t) => t.includes(word) || word.includes(t));

    if (!isAllowed) {
      return false; // Content word not in original bullet, entry, or candidate skills
    }
  }

  return true;
}

/**
 * Validates that a rewritten summary does not invent skills, numbers, or employers,
 * AND preserves every number and concrete fact from the original summary.
 *
 * @param {string} suggestedSummary
 * @param {string} originalSummary
 * @param {string} resumeCorpus
 * @param {Set<string>} candidateSkillsSet
 * @param {string[]} knownEmployers
 * @returns {boolean} true if valid, false if invented claims exist or facts dropped
 */
function validateSummaryRewrite(
  suggestedSummary,
  originalSummary = '',
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  knownEmployers = []
) {
  if (!suggestedSummary || typeof suggestedSummary !== 'string') return false;
  const cleanSugg = suggestedSummary.trim();
  if (cleanSugg.length < 10) return false;

  const cleanSuggLower = cleanSugg.toLowerCase();
  const origLower = (originalSummary || '').toLowerCase();

  // 1. Numbers check (strip allowed placeholders like [add your real number])
  const placeholderRegex =
    /\[(?:add\s+your\s+real\s+number|add\s+number|your\s+number|number|metric|X%|X)\]/gi;
  const suggWithoutPlaceholders = cleanSugg.replace(placeholderRegex, '');
  const suggNumbers = suggWithoutPlaceholders.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
  const corpus = `${resumeCorpus} ${originalSummary}`.toLowerCase();

  for (const num of suggNumbers) {
    const cleanNum = num.toLowerCase();
    if (!corpus.includes(cleanNum)) {
      // Introduced a new concrete number not in original resume!
      return false;
    }
  }

  // 2. Technical skills check
  const { extractSkillsFromText, matchSkillInText } = require('../ai/skillsDictionary');
  const suggSkills = extractSkillsFromText(cleanSugg);
  for (const sk of suggSkills) {
    const skLower = sk.toLowerCase();
    const inOriginal = matchSkillInText(sk, originalSummary);
    const inCandidateSkills = candidateSkillsSet.has(skLower);
    const inCorpus = matchSkillInText(sk, resumeCorpus);

    if (!inOriginal && !inCandidateSkills && !inCorpus) {
      // Introduced an unverified technical skill!
      return false;
    }
  }

  // 3. Employers check
  const employerRegex = /\b(?:at|for|with)\s+([A-Z][a-zA-Z0-9&.-]+(?:\s+[A-Z][a-zA-Z0-9&.-]+)?)\b/g;
  let match;
  const allowedNonCompanies = new Set([
    'scale', 'runtime', 'peak', 'speed', 'production', 'startup',
    'university', 'college', 'school', 'work', 'hand', 'first'
  ]);
  while ((match = employerRegex.exec(cleanSugg)) !== null) {
    const candidateCompany = match[1].trim().toLowerCase();
    if (!allowedNonCompanies.has(candidateCompany)) {
      const inCorpus = corpus.includes(candidateCompany);
      const inEmployers = knownEmployers.some(
        (emp) =>
          emp.toLowerCase().includes(candidateCompany) ||
          candidateCompany.includes(emp.toLowerCase())
      );
      if (!inCorpus && !inEmployers) {
        // Introduced an unverified employer!
        return false;
      }
    }
  }

  // 4. Must keep EVERY number and metric fact from original summary (e.g. "250+", "8.8")
  const origNumbers = (originalSummary.match(/\b\d+(?:[.,]\d+)?\+?%?\b/g) || []).map((n) => n.toLowerCase());
  for (const origNum of origNumbers) {
    const numBase = origNum.replace(/[+%]/g, '');
    if (!cleanSuggLower.includes(origNum) && !cleanSuggLower.includes(numBase)) {
      // Dropped a concrete number/metric fact from the original summary!
      return false;
    }
  }

  // 5. Must keep named platform / achievement facts from original summary (e.g. "LeetCode", "CodeChef")
  const factKeywords = ['leetcode', 'codechef', 'hackerrank', 'codeforces', 'kaggle', 'github'];
  for (const fact of factKeywords) {
    if (origLower.includes(fact) && !cleanSuggLower.includes(fact)) {
      // Dropped a concrete fact/platform from original summary!
      return false;
    }
  }

  return true;
}

/**
 * Analyzes resumeData and generates user-facing warnings for missing or weak sections
 */
function computeResumeWarnings(resumeData) {
  if (!resumeData || typeof resumeData !== 'object') {
    return ['No valid resume data provided.'];
  }
  const warnings = [];

  // 1. Summary
  if (!resumeData.summary || resumeData.summary.trim().length === 0) {
    warnings.push('No professional summary found. Adding a concise 2-3 sentence overview strengthens ATS score.');
  }

  // 2. Skills
  const flatSkills = (resumeData.skills || []).flatMap((c) =>
    typeof c === 'string' ? [c] : c.items || []
  );
  if (flatSkills.length === 0) {
    warnings.push('No technical skills listed. Add programming languages, frameworks, or developer tools.');
  } else if (flatSkills.length < 4) {
    warnings.push('Fewer than 4 technical skills found. Consider adding more relevant technologies.');
  }

  // 3. Experience
  if (!Array.isArray(resumeData.experience) || resumeData.experience.length === 0) {
    warnings.push('No work or internship experience listed.');
  }

  // 4. Projects
  if (!Array.isArray(resumeData.projects) || resumeData.projects.length === 0) {
    warnings.push('No technical projects found. Projects are critical for engineering evaluation.');
  }

  // 5. Contact links
  const contact = resumeData.contact || {};
  if (!contact.linkedin && !contact.github && !contact.portfolio) {
    warnings.push('No professional links (GitHub, LinkedIn, Portfolio) found.');
  }

  // 6. Quantifiable Metrics in bullets
  const bullets = [];
  (resumeData.experience || []).forEach((e) => (e.bullets || []).forEach((b) => bullets.push(b)));
  (resumeData.projects || []).forEach((p) => (p.bullets || []).forEach((b) => bullets.push(b)));

  if (bullets.length > 0) {
    const metricCount = bullets.filter(
      (b) => PLACEHOLDER_REGEX.test(b) || /\b\d+(?:[.,]\d+)?%?\b/.test(b)
    ).length;
    if (metricCount === 0) {
      warnings.push('No quantifiable metrics (%, numbers, scale) found in bullets. High-performing resumes quantify outcomes.');
    }
  }

  return warnings;
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

/**
 * Normalizes an arbitrary parsed profile (from LLM, rules, or Student model)
 * into the canonical resumeData shape that compileBaseResume returns.
 */
function normalizeResumeDataFromProfile(profile, user = {}, student = {}) {
  const fullName = user?.name || student?.name || 'Candidate Name';
  const email = user?.email || student?.email || '';
  const phone = student?.phone || '';
  const location = [student?.college?.city, student?.college?.state].filter(Boolean).join(', ') || '';

  // Extract raw skills
  const skillsRaw = (profile?.skills || [])
    .map((s) => (typeof s === 'object' ? s.name || s.title || '' : s))
    .filter(Boolean);
  const categorized = categorizeSkillsList(skillsRaw);

  // Experience
  const experience = (profile?.experience || []).map((e, idx) => ({
    title: e.title || `Engineering Role #${idx + 1}`,
    company: e.company || 'Tech Company',
    location: e.location || '',
    duration: e.duration || '',
    bullets:
      Array.isArray(e.bullets) && e.bullets.length > 0
        ? e.bullets.map((b) => String(b).trim()).filter(Boolean)
        : e.description
        ? [e.description.trim()]
        : ['Collaborated on software design, code implementation, and deployment.'],
  }));

  // Projects
  const projects = (profile?.projects || []).map((p, idx) => ({
    title: p.title || `Technical Project #${idx + 1}`,
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    duration: p.duration || '',
    link: p.link || '',
    bullets:
      Array.isArray(p.bullets) && p.bullets.length > 0
        ? p.bullets.map((b) => String(b).trim()).filter(Boolean)
        : p.description
        ? [p.description.trim()]
        : ['Designed and implemented application architecture with core technical components.'],
  }));

  // Education
  const educationList = [];
  if (Array.isArray(profile?.education) && profile.education.length > 0) {
    profile.education.forEach((edu) => {
      educationList.push({
        degree: edu.degree || 'Bachelor of Technology',
        institution: edu.institution || student?.college?.name || 'Engineering College',
        field: edu.field || student?.branch || 'Computer Science',
        year: edu.year || String(student?.batchYear || '2025'),
        score: edu.score || (student?.cgpa ? `${student.cgpa} CGPA` : ''),
      });
    });
  } else {
    educationList.push({
      degree: 'Bachelor of Technology',
      institution: student?.college?.name || 'Engineering College',
      field: student?.branch || 'Computer Science and Engineering',
      year: String(student?.batchYear || '2025'),
      score: student?.cgpa ? `${student.cgpa} CGPA` : '',
    });
  }

  // Certifications
  const certifications = (profile?.certifications || [])
    .map((c) => (typeof c === 'string' ? c : c.title || c.name || ''))
    .filter(Boolean);

  return {
    contact: {
      fullName,
      email,
      phone,
      location,
      linkedin: student?.linkedin || '',
      github: student?.github || '',
      portfolio: student?.portfolio || '',
    },
    summary:
      profile?.summary ||
      `Aspiring ${student?.branch || 'Computer Science'} graduate with hands-on technical skills and engineering project experience.`,
    skills: categorized,
    experience,
    projects,
    education: educationList,
    certifications,
  };
}

/**
 * Loads and normalizes resume data according to chosen source type:
 * - 'profile': uses compileBaseResume(studentUserId)
 * - 'upload': reuses existing parsed resumeProfile or parses student's uploaded file via parseStudentResume
 * - 'text': extracts structure using extractWithRules (works offline with 0 AI quota)
 *
 * @param {Object} params
 * @param {string} params.studentUserId
 * @param {string} params.type - 'profile' | 'upload' | 'text'
 * @param {string} [params.text] - Raw resume text (required for type='text')
 * @returns {Promise<{ resumeData: Object, warnings: string[], parseConfidence: number }>}
 */
async function loadResumeSource({ studentUserId, type, text = '' }) {
  if (!['profile', 'upload', 'text'].includes(type)) {
    const err = new Error("Invalid source type. Must be 'profile', 'upload', or 'text'.");
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }

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

  let resumeData;
  let parseConfidence = 1.0;

  if (type === 'profile') {
    resumeData = await compileBaseResume(studentUserId);
    parseConfidence = 1.0;
  } else if (type === 'upload') {
    // Tenant safety check: strictly reads the authenticated student's record
    if (student.resumeProfile && student.resumeProfile.status === 'parsed') {
      resumeData = normalizeResumeDataFromProfile(student.resumeProfile, student.user, student);
      parseConfidence = student.resumeProfile.source === 'llm' ? 0.95 : 0.85;
    } else if (student.resumeUrl) {
      // Reuse existing parseStudentResume from resumeParser.js
      const { parseStudentResume } = require('../ai/resumeParser');
      const parseResult = await parseStudentResume(student, { force: false });
      if (parseResult.status === 'failed') {
        const err = new Error(parseResult.error || 'Failed to parse uploaded resume document.');
        err.status = 400;
        err.statusCode = 400;
        throw err;
      }
      resumeData = normalizeResumeDataFromProfile(student.resumeProfile, student.user, student);
      parseConfidence = 0.9;
    } else {
      const err = new Error('No uploaded resume found. Please upload a resume first.');
      err.status = 400;
      err.statusCode = 400;
      throw err;
    }
  } else if (type === 'text') {
    if (!text || typeof text !== 'string' || !text.trim()) {
      const err = new Error('Resume text content is required for source type text.');
      err.status = 400;
      err.statusCode = 400;
      throw err;
    }
    if (text.length > 50000) {
      const err = new Error('Resume text is too large (maximum 50,000 characters).');
      err.status = 400;
      err.statusCode = 400;
      throw err;
    }

    // Reuse extractWithRules from resumeParser.js (guaranteed zero AI quota, deterministic)
    const { extractWithRules } = require('../ai/resumeParser');
    const parsedTextProfile = extractWithRules(text.trim());
    resumeData = normalizeResumeDataFromProfile(parsedTextProfile, student.user, student);
    parseConfidence = 0.85;
  }

  const warnings = computeResumeWarnings(resumeData);

  return {
    resumeData,
    warnings,
    parseConfidence,
  };
}

/**
 * Analyzes target requirement for Step 2 of Resume Builder wizard.
 * Uses rules / drive documents directly to avoid unnecessary AI quota usage.
 *
 * @param {Object} params
 * @param {string} params.studentUserId
 * @param {string} [params.driveId]
 * @param {string} [params.jobDescription]
 * @returns {Promise<{ target: Object }>}
 */
async function analyzeResumeTarget({ studentUserId, driveId = null, jobDescription = '' }) {
  if (driveId && mongoose.Types.ObjectId.isValid(driveId)) {
    const driveDoc = await Drive.findById(driveId).populate('company', 'name');
    if (!driveDoc) {
      const err = new Error('Target drive not found');
      err.status = 404;
      err.statusCode = 404;
      throw err;
    }

    const requiredSkills = (driveDoc.requiredSkills || []).map(normalizeSkill).filter(Boolean);
    const preferredSkills = (driveDoc.preferredSkills || []).map(normalizeSkill).filter(Boolean);
    const keywords = Array.from(
      new Set([
        ...requiredSkills,
        ...preferredSkills,
        ...(driveDoc.role ? driveDoc.role.toLowerCase().split(/\s+/) : []),
      ])
    ).filter((k) => k && k.length > 2);

    return {
      target: {
        type: 'drive',
        driveId: driveDoc._id.toString(),
        roleTitle: driveDoc.role || 'Software Engineer',
        company: driveDoc.company?.name || 'Campus Recruiter',
        requiredSkills,
        preferredSkills,
        minYearsExperience: 0,
        education: driveDoc.allowedBranches ? driveDoc.allowedBranches.join(', ') : '',
        keywords,
      },
    };
  }

  if (jobDescription && typeof jobDescription === 'string' && jobDescription.trim()) {
    // Zero quota / rules path if rules are sufficient or AI is disabled
    const { extractJdRequirementsWithRules } = require('../ai/jdAnalyzer');
    const parsed = extractJdRequirementsWithRules(jobDescription.trim().slice(0, 10000));

    const keywords = Array.from(
      new Set([
        ...(parsed.requiredSkills || []),
        ...(parsed.preferredSkills || []),
        ...(parsed.softSkills || []),
        ...(parsed.roleTitle ? parsed.roleTitle.toLowerCase().split(/\s+/) : []),
      ])
    ).filter((k) => k && k.length > 2);

    return {
      target: {
        type: 'jd',
        roleTitle: parsed.roleTitle || 'Target Role',
        company: 'Target Employer',
        requiredSkills: parsed.requiredSkills || [],
        preferredSkills: parsed.preferredSkills || [],
        minYearsExperience: parsed.minYearsExperience || 0,
        education: parsed.education || '',
        keywords,
      },
    };
  }

  // General resume mode (no specific job)
  return {
    target: {
      type: 'general',
      roleTitle: 'General Software Engineer',
      company: '',
      requiredSkills: [],
      preferredSkills: [],
      minYearsExperience: 0,
      education: '',
      keywords: ['software engineering', 'problem solving', 'system design', 'clean code'],
    },
  };
}

/**
 * Generates match report for Step 3 of Resume Builder wizard:
 * - ATS Score & category breakdown via computeAtsScore
 * - Match Score via computeMatchScore
 * - Missing skills mapped to curated learning resources (never inventing URLs)
 * - Weak sections analysis & prioritized fixes list
 *
 * @param {Object} params
 * @param {Object} params.resumeData
 * @param {Object} params.target
 * @returns {Object} Match report payload
 */
function generateMatchReport({ resumeData, target }) {
  if (!resumeData || typeof resumeData !== 'object') {
    const err = new Error('Valid resume data is required');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }

  const effectiveTarget = target || {
    type: 'general',
    roleTitle: 'General Software Engineer',
    requiredSkills: [],
    preferredSkills: [],
    minYearsExperience: 0,
    education: '',
  };

  const flatSkills = (resumeData.skills || []).flatMap((c) =>
    typeof c === 'string' ? [c] : c.items || []
  );

  const studentData = {
    skills: flatSkills,
    resumeProfile: {
      skills: flatSkills.map((s) => ({ name: s })),
      experience: resumeData.experience || [],
      projects: resumeData.projects || [],
      education: resumeData.education || [],
      summary: resumeData.summary || '',
    },
    phone: resumeData.contact?.phone || '',
    user: { email: resumeData.contact?.email || '' },
  };

  // 1. Compute ATS Score
  const atsResult = computeAtsScore(studentData, effectiveTarget);

  // 2. Compute Match Score
  let matchScore = null;
  const isGeneral =
    effectiveTarget.type === 'general' ||
    ((effectiveTarget.requiredSkills || []).length === 0 &&
      (effectiveTarget.preferredSkills || []).length === 0);

  if (!isGeneral) {
    const { computeMatchScore } = require('../ai/matchingEngine');
    const match = computeMatchScore(studentData, effectiveTarget);
    matchScore = match.score;
  }

  // 3. Matched and Missing Skills
  const matchedSkills = atsResult.matchedSkills || [];
  const missingRequired = atsResult.missingRequired || [];
  const missingPreferred = atsResult.missingPreferred || [];
  const allMissing = Array.from(new Set([...missingRequired, ...missingPreferred]));

  // 4. Map curated learning resources for missing skills
  const { getCuratedResource } = require('../ai/curatedLearningResources');
  const learningResources = allMissing.map((skill) => {
    const res = getCuratedResource(skill);
    return {
      skill,
      title: res?.title || `${skill.charAt(0).toUpperCase() + skill.slice(1)} Documentation`,
      url: res?.url || null,
      resourceType: res?.resourceType || 'Official Documentation',
      isCurated: Boolean(res?.url),
    };
  });

  // 5. Weak sections
  const weakSections = [];
  const bullets = [];
  (resumeData.experience || []).forEach((e) => (e.bullets || []).forEach((b) => bullets.push(b)));
  (resumeData.projects || []).forEach((p) => (p.bullets || []).forEach((b) => bullets.push(b)));

  const metricBullets = bullets.filter(
    (b) => PLACEHOLDER_REGEX.test(b) || /\b\d+(?:[.,]\d+)?%?\b/.test(b)
  );
  if (bullets.length > 0 && metricBullets.length === 0) {
    weakSections.push({
      section: 'impact',
      severity: 'high',
      title: 'No Quantified Metrics',
      description: 'Your experience and project bullets lack quantifiable outcomes (%, numbers, scale).',
    });
  }

  const summary = (resumeData.summary || '').trim();
  if (!summary) {
    weakSections.push({
      section: 'summary',
      severity: 'medium',
      title: 'Missing Summary',
      description: 'A 2-3 sentence technical summary highlights your core strengths immediately.',
    });
  } else if (summary.length > 500) {
    weakSections.push({
      section: 'summary',
      severity: 'low',
      title: 'Summary Too Long',
      description: 'Keep your technical summary under 500 characters for optimal scanability.',
    });
  }

  const contact = resumeData.contact || {};
  if (!contact.linkedin && !contact.github && !contact.portfolio) {
    weakSections.push({
      section: 'links',
      severity: 'medium',
      title: 'Missing Professional Links',
      description: 'Add GitHub or LinkedIn links to help employers verify your projects and profile.',
    });
  }

  // 6. Ranked Fixes
  const fixes = [];
  if (missingRequired.length > 0) {
    fixes.push({
      rank: 1,
      priority: 'high',
      title: `Add or Learn Missing Required Skills (${missingRequired.length})`,
      action: 'Declare skills you possess or add to your learning plan.',
    });
  }
  if (bullets.length > 0 && metricBullets.length === 0) {
    fixes.push({
      rank: 2,
      priority: 'high',
      title: 'Quantify Your Bullet Points',
      action: 'Use concrete metrics (e.g. latency, scale, user count, % improvement).',
    });
  }
  if (!contact.linkedin && !contact.github) {
    fixes.push({
      rank: 3,
      priority: 'medium',
      title: 'Add GitHub & LinkedIn Links',
      action: 'Ensure recruiters can inspect your public code repositories and profile.',
    });
  }
  if (missingPreferred.length > 0) {
    fixes.push({
      rank: 4,
      priority: 'low',
      title: `Review Preferred Skills (${missingPreferred.length})`,
      action: 'Preferred skills give you a competitive advantage for top percentiles.',
    });
  }

  const breakdown = {
    keywordMatch: isGeneral ? null : (atsResult.breakdown?.keywordMatch ?? 0),
    experience: atsResult.breakdown?.experienceMatch ?? 10,
    experienceMatch: atsResult.breakdown?.experienceMatch ?? 10,
    education: atsResult.breakdown?.educationMatch ?? 5,
    educationMatch: atsResult.breakdown?.educationMatch ?? 5,
    structure: atsResult.breakdown?.structure ?? 0,
    impact: atsResult.breakdown?.impact ?? 0,
    actionVerbs: atsResult.breakdown?.actionVerbs ?? 0,
    formatting: atsResult.breakdown?.formatting ?? 0,
  };

  const applicableSum =
    breakdown.experienceMatch +
    breakdown.educationMatch +
    breakdown.structure +
    breakdown.impact +
    breakdown.actionVerbs +
    breakdown.formatting;
  const generalAtsScore = Math.min(100, Math.round((applicableSum / 65) * 100));

  const effectiveAtsScore =
    isGeneral || atsResult.atsScore === null || atsResult.atsScore === undefined
      ? generalAtsScore
      : atsResult.atsScore;

  return {
    matchScore,
    atsScore: effectiveAtsScore,
    isGeneral,
    generalNote: isGeneral ? 'score excludes keyword match, no job selected' : null,
    breakdown,
    matchedSkills,
    missingRequired,
    missingPreferred,
    learningResources,
    weakSections,
    fixes,
  };
}

// =============================================================================
// TAILORING ENGINE
// =============================================================================

const TAILOR_SYSTEM_PROMPT = `You are an executive ATS resume strategist and engineering hiring manager.
Your task is to analyze candidate resume bullets against target job requirements and suggest truthful, concise bullet rewrites.

CRITICAL HONESTY & SECURITY RULES:
1. NEVER invent employers, job titles, certifications, degrees, dates, or technical skills not present in the candidate profile.
2. NEVER invent concrete numbers or metrics (e.g. "reduced by 45%", "served 10,000 users").
   If suggesting a metric rewrite where the real number is unknown, you MUST use the exact placeholder token "[add your real number]" (e.g. "improved query throughput by [add your real number]%").
3. DO NOT add new outcomes, adjectives, adverbs, team or scale claims, or technologies not in the original text.
   A rewrite may ONLY:
   (a) change the opening verb to a truthful stronger synonym from the allow-list (built, developed, implemented, designed, integrated, tested, validated, deployed, managed),
   (b) reorder elements,
   (c) tighten wording.
4. BANNED INFLATION WORDS: You must NEVER use "seamlessly", "comprehensive", "robust", "cutting-edge", "scalable" (unless in the original), "collaborative" (unless in the original), "architected", "orchestrated", "spearheaded", "pioneered", "leveraged".
5. For the summary rewrite, you MUST keep every number and concrete fact from the original summary (e.g. "250+ problems on LeetCode", specific CGPA, platforms). Never drop verified metrics or facts.
6. For each bullet, provide:
   - original: The original bullet text.
   - suggested: The rewritten bullet.
   - why: Brief rationale.
7. Return strictly valid JSON matching the schema.

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

  const knownEmployers = (baseResume.experience || []).map((e) => e.company).filter(Boolean);
  let aiSuccess = false;

  try {
    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt: TAILOR_SYSTEM_PROMPT,
      userPrompt,
      mode: 'tailor',
      userId: studentUserId,
    });

    if (aiRes.success && aiRes.data) {
      aiSuccess = true;
      if (aiRes.data.summary) {
        if (
          validateSummaryRewrite(
            aiRes.data.summary,
            baseResume.summary,
            resumeCorpus,
            candidateSkillsSet,
            knownEmployers
          )
        ) {
          tailoredSummary = aiRes.data.summary;
        } else {
          console.warn(
            '[ResumeBuilder] AI invented unverified claims in summary, failing closed to deterministic baseline.'
          );
          tailoredSummary = baseResume.summary;
        }
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
      proposedRewrites.push({
        original: b,
        suggested: b,
        why: 'Kept original.',
        status: 'kept original',
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
      // On rejection fall back to the original bullet and mark it "kept original"
      validatedRewrites.push({
        original: rw.original,
        suggested: rw.original,
        why: 'Kept original: rewrite contained unsupported claims or unverified inflation words.',
        status: 'kept original',
      });
      rewriteMap.set(rw.original.trim().toLowerCase(), rw.original);
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

  // 10. Record quota usage if rule-based fallback occurred (not already recorded by callAiWithQuotaAndRetry)
  if (!aiSuccess) {
    try {
      await AiUsage.recordCall(studentUserId, 'tailor');
    } catch (_) {}
  }

  const getScoreNumber = (scoreObj) => {
    if (scoreObj && typeof scoreObj.atsScore === 'number') {
      return scoreObj.atsScore;
    }
    const bd = scoreObj?.breakdown || {};
    const appSum =
      (bd.experienceMatch ?? 10) +
      (bd.educationMatch ?? 5) +
      (bd.structure ?? 0) +
      (bd.impact ?? 0) +
      (bd.actionVerbs ?? 0) +
      (bd.formatting ?? 0);
    return Math.min(100, Math.round((appSum / 65) * 100));
  };

  const baselineScoreNum = getScoreNumber(baselineAts);
  const tailoredScoreNum = getScoreNumber(tailoredAts);

  return {
    baseResume,
    tailoredResume,
    baselineAtsScore: baselineScoreNum,
    tailoredAtsScore: tailoredScoreNum,
    scoreDelta: Math.max(0, tailoredScoreNum - baselineScoreNum),
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
  let aiCoverSuccess = false;
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
      aiCoverSuccess = true;
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

  // Record usage if fallback occurred (not already recorded by callAiWithQuotaAndRetry)
  if (!aiCoverSuccess) {
    try {
      await AiUsage.recordCall(studentUserId, 'tailor');
    } catch (_) {}
  }

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
  normalizeResumeDataFromProfile,
  computeResumeWarnings,
  loadResumeSource,
  analyzeResumeTarget,
  generateMatchReport,
  validateSummaryRewrite,
  validateBulletRewrite,
  tailorResume,
  generateCoverLetter,
  saveResumeVersion,
  listResumeVersions,
  getResumeVersion,
  deleteResumeVersion,
  MAX_VERSIONS_PER_STUDENT,
  PLACEHOLDER_REGEX,
  ALLOW_LISTED_OPENING_VERBS,
  BANNED_INFLATION_WORDS,
  CONDITIONALLY_BANNED_WORDS,
};
