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
const { renderResumeDataToText } = require('../ai/resumeAnalyzer');
const { extractResumeText, defaultExtractor, streamToBuffer } = require('../ai/resumeTextExtractor');
const { analyzeJobDescription } = require('../ai/jdAnalyzer');
const { callAiWithQuotaAndRetry } = require('../ai/aiClient');
const { redactPII } = require('../ai/redactor');
const { normalizeSkill, extractSkillsFromText, matchSkillInText } = require('../ai/skillsDictionary');
const { extractAllLinksAndContacts } = require('./resumeLinkExtractor');
const { tokenizeText, detokenize } = require('./tokenMasker');
const { getResumeStream } = require('../../utils/storage');

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
/**
 * Validates bullet rewrite with strict diff checking and returns reason codes:
 * 1. Rejects banned inflation words (seamlessly, comprehensive, robust, cutting-edge,
 *    architected, orchestrated, spearheaded, pioneered, leveraged).
 * 2. Rejects conditionally banned words (scalable, collaborative) unless present in original bullet.
 * 3. Allows opening verb replacement only with truthful stronger synonyms from allow-list.
 * 4. Diff check: Every content word in rewrite (excluding stopwords and allow-listed opening verb)
 *    must exist in original bullet, entry context, or candidate skills list.
 * 5. Rejects invented metrics without [add your real number] placeholder.
 *
 * Logs reason CODES and item type only, never user text.
 */
function validateBulletRewriteDetailed(
  { original, suggested },
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  existingBullets = [],
  entryContext = ''
) {
  const reasonCodes = [];
  const items = [];

  if (!original || !suggested || typeof original !== 'string' || typeof suggested !== 'string') {
    return { valid: false, reasonCodes: ['invalid_input'], items: [] };
  }
  const cleanOrig = original.trim();
  const cleanSugg = suggested.trim();
  if (cleanOrig.length < 5 || cleanSugg.length < 5) {
    return { valid: false, reasonCodes: ['invalid_length'], items: [] };
  }

  const origLower = cleanOrig.toLowerCase();
  const suggLower = cleanSugg.toLowerCase();

  // 1. Must refer to an existing bullet in candidate resume
  const exists = existingBullets.some((b) => {
    const bLower = b.toLowerCase();
    return bLower.includes(origLower) || origLower.includes(bLower);
  });
  if (!exists && existingBullets.length > 0) {
    reasonCodes.push('bullet_not_in_resume');
  }

  // 2. Reject banned inflation words
  const suggTokens = suggLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of suggTokens) {
    if (BANNED_INFLATION_WORDS.has(token)) {
      reasonCodes.push('inflation_word');
      items.push(token);
    }
  }

  // 3. Reject conditionally banned words unless present in original bullet
  for (const token of suggTokens) {
    if (CONDITIONALLY_BANNED_WORDS.has(token)) {
      if (!origLower.includes(token)) {
        reasonCodes.push('inflation_word');
        items.push(token);
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
      reasonCodes.push('unverified_number');
      items.push(cleanNum);
    }
  }

  // 5. Technologies and skills check
  const suggSkills = extractSkillsFromText(cleanSugg);
  for (const sk of suggSkills) {
    const skLower = sk.toLowerCase();
    const inOriginal = matchSkillInText(sk, cleanOrig);
    const inCandidateSkills = candidateSkillsSet.has(skLower);
    const inCorpus = matchSkillInText(sk, corpus);

    if (!inOriginal && !inCandidateSkills && !inCorpus) {
      reasonCodes.push('unverified_skill');
      items.push(sk);
    }
  }

  // 6. Content word diff check
  const cleanForDiff = suggWithoutPlaceholders
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase();
  const words = cleanForDiff.split(/\s+/).filter(Boolean);

  if (words.length > 0) {
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
        reasonCodes.push('unsupported_content');
        items.push(word);
      }
    }
  }

  const uniqueCodes = Array.from(new Set(reasonCodes));
  const uniqueItems = Array.from(new Set(items));

  if (uniqueCodes.length > 0) {
    console.warn('[ResumeBuilder] Bullet validation rejected:', {
      reasonCodes: uniqueCodes,
      itemTypes: uniqueItems,
    });
  }

  return {
    valid: uniqueCodes.length === 0,
    reasonCodes: uniqueCodes,
    items: uniqueItems,
  };
}

function validateBulletRewrite(
  rewrite,
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  existingBullets = [],
  entryContext = ''
) {
  const res = validateBulletRewriteDetailed(
    rewrite,
    resumeCorpus,
    candidateSkillsSet,
    existingBullets,
    entryContext
  );
  return res.valid;
}

/**
 * Validates rewritten summary with detailed reason codes:
 * Checks unverified numbers, unverified skills, unknown employers, and dropped facts.
 * Logs reason CODES and item types only, never user text.
 */
function validateSummaryRewriteDetailed(
  suggestedSummary,
  originalSummary = '',
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  knownEmployers = []
) {
  const reasonCodes = [];
  const items = [];

  if (!suggestedSummary || typeof suggestedSummary !== 'string') {
    return { valid: false, reasonCodes: ['invalid_input'], items: [] };
  }
  const cleanSugg = suggestedSummary.trim();
  if (cleanSugg.length < 10) {
    return { valid: false, reasonCodes: ['invalid_length'], items: [] };
  }

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
      reasonCodes.push('unverified_number');
      items.push(cleanNum);
    }
  }

  // 2. Technical skills check
  const suggSkills = extractSkillsFromText(cleanSugg);
  for (const sk of suggSkills) {
    const skLower = sk.toLowerCase();
    const inOriginal = matchSkillInText(sk, originalSummary);
    const inCandidateSkills = candidateSkillsSet.has(skLower);
    const inCorpus = matchSkillInText(sk, resumeCorpus);

    if (!inOriginal && !inCandidateSkills && !inCorpus) {
      reasonCodes.push('unverified_skill');
      items.push(sk);
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
        reasonCodes.push('unknown_employer');
        items.push(candidateCompany);
      }
    }
  }

  // 4. Must keep EVERY number and metric fact from original summary (e.g. "250+", "8.8")
  const origNumbers = (originalSummary.match(/\b\d+(?:[.,]\d+)?\+?%?\b/g) || []).map((n) => n.toLowerCase());
  for (const origNum of origNumbers) {
    const numBase = origNum.replace(/[+%]/g, '');
    if (!cleanSuggLower.includes(origNum) && !cleanSuggLower.includes(numBase)) {
      reasonCodes.push('dropped_fact');
      items.push(origNum);
    }
  }

  // 5. Must keep named platform / achievement facts from original summary (e.g. "LeetCode", "CodeChef")
  const factKeywords = ['leetcode', 'codechef', 'hackerrank', 'codeforces', 'kaggle', 'github'];
  for (const fact of factKeywords) {
    if (origLower.includes(fact) && !cleanSuggLower.includes(fact)) {
      reasonCodes.push('dropped_fact');
      items.push(fact);
    }
  }

  const uniqueCodes = Array.from(new Set(reasonCodes));
  const uniqueItems = Array.from(new Set(items));

  if (uniqueCodes.length > 0) {
    console.warn('[ResumeBuilder] Summary validation rejected:', {
      reasonCodes: uniqueCodes,
      itemTypes: uniqueItems,
    });
  }

  return {
    valid: uniqueCodes.length === 0,
    reasonCodes: uniqueCodes,
    items: uniqueItems,
  };
}

function validateSummaryRewrite(
  suggestedSummary,
  originalSummary = '',
  resumeCorpus = '',
  candidateSkillsSet = new Set(),
  knownEmployers = []
) {
  const res = validateSummaryRewriteDetailed(
    suggestedSummary,
    originalSummary,
    resumeCorpus,
    candidateSkillsSet,
    knownEmployers
  );
  return res.valid;
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

  const fullName = student.user?.name || '';
  const email = student.user?.email || '';
  const phone = student.phone || '';
  const location = [student.college?.city, student.college?.state].filter(Boolean).join(', ') || '';

  // Extract skills
  const profileSkills = (student.resumeProfile?.skills || []).map((s) => s.name || s).filter(Boolean);
  const rawSkills = (student.skills || []).filter(Boolean);
  const allSkills = Array.from(new Set([...profileSkills, ...rawSkills]));
  const categorizedSkills = categorizeSkillsList(allSkills);

  // Summary: Leave empty when missing, NEVER invent generic text
  const summary = (student.resumeProfile?.summary || '')
    .replace(/^[-*•·▪–—\s]+/, '')
    .trim();

  // Experience: Never invent titles, companies, or default bullets
  const experience = (student.resumeProfile?.experience || []).map((e) => ({
    title: e.title || '',
    company: e.company || '',
    location: e.location || '',
    duration: e.duration || '',
    bullets:
      Array.isArray(e.bullets) && e.bullets.length > 0
        ? e.bullets.map((b) => String(b).trim()).filter(Boolean)
        : e.description
        ? [e.description.trim()]
        : [],
  }));

  // Projects: Never invent titles or default bullets
  const projects = (student.resumeProfile?.projects || []).map((p) => ({
    title: p.title || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    duration: p.duration || '',
    link: p.link || '',
    bullets:
      Array.isArray(p.bullets) && p.bullets.length > 0
        ? p.bullets.map((b) => String(b).trim()).filter(Boolean)
        : p.description
        ? [p.description.trim()]
        : [],
  }));

  // Education: Never invent degrees, years, or institutions
  const educationList = [];
  if (Array.isArray(student.resumeProfile?.education) && student.resumeProfile.education.length > 0) {
    student.resumeProfile.education.forEach((edu) => {
      educationList.push({
        degree: edu.degree || student.degree || '',
        institution: edu.institution || student.college?.name || '',
        field: edu.field || student.branch || '',
        year: edu.year || (student.batchYear ? String(student.batchYear) : ''),
        score: edu.score || (student.cgpa ? `${student.cgpa} CGPA` : ''),
      });
    });
  } else if (student.degree) {
    educationList.push({
      degree: student.degree,
      institution: student.college?.name || '',
      field: student.branch || '',
      year: student.batchYear ? String(student.batchYear) : '',
      score: student.cgpa ? `${student.cgpa} CGPA` : '',
    });
  }

  // Certifications
  const certifications = (student.resumeProfile?.certifications || []).map((c) =>
    typeof c === 'string' ? c : c.title || c.name || ''
  ).filter(Boolean);

  // Missing fields audit array
  const missingFields = [];
  if (!fullName) missingFields.push('fullName');
  if (!email) missingFields.push('email');
  if (!phone) missingFields.push('phone');
  if (!location) missingFields.push('location');
  if (!summary) missingFields.push('summary');
  if (categorizedSkills.length === 0) missingFields.push('skills');
  if (experience.length === 0) missingFields.push('experience');
  if (projects.length === 0) missingFields.push('projects');
  if (educationList.length === 0) missingFields.push('education');

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
    missingFields,
  };
}

/**
 * Normalizes an arbitrary parsed profile (from LLM, rules, or Student model)
 * into the canonical resumeData shape that compileBaseResume returns.
 *
 * Source Merging Rule (Requirement 6):
 * The chosen resume is the source of truth for experience, projects, and skills.
 * The college profile only fills missing contact details and education; each filled
 * field is marked "from your profile". Projects, experience, and skills from the
 * profile are NEVER added to the chosen resume unless isProfileSource is true.
 */
function normalizeResumeDataFromProfile(profile, user = {}, student = {}, isProfileSource = false) {
  const filledFromProfile = {};

  let fullName = profile?.contact?.fullName || profile?.contact?.name;
  if (!fullName) {
    fullName = user?.name || student?.name || '';
    if (fullName) filledFromProfile.fullName = 'from your profile';
  }

  let email = profile?.contact?.email;
  if (!email) {
    email = user?.email || student?.email || '';
    if (email) filledFromProfile.email = 'from your profile';
  }

  let phone = profile?.contact?.phone;
  if (!phone) {
    phone = student?.phone || '';
    if (phone) filledFromProfile.phone = 'from your profile';
  }

  let location = profile?.contact?.location;
  if (!location) {
    location = [student?.college?.city, student?.college?.state].filter(Boolean).join(', ') || '';
    if (location) filledFromProfile.location = 'from your profile';
  }

  let linkedin = profile?.contact?.linkedin || '';
  if (!linkedin && student?.linkedin) {
    linkedin = student.linkedin;
    filledFromProfile.linkedin = 'from your profile';
  }

  let github = profile?.contact?.github || '';
  if (!github && student?.github) {
    github = student.github;
    filledFromProfile.github = 'from your profile';
  }

  let portfolio = profile?.contact?.portfolio || '';
  if (!portfolio && student?.portfolio) {
    portfolio = student.portfolio;
    filledFromProfile.portfolio = 'from your profile';
  }

  // Extract raw skills:
  // When isProfileSource is false, ONLY use skills from the chosen resume.
  // Never add skills from the student college profile.
  let skillsRaw = (profile?.skills || [])
    .map((s) => (typeof s === 'object' ? s.name || s.title || '' : s))
    .filter(Boolean);

  if (isProfileSource && Array.isArray(student?.skills)) {
    skillsRaw = Array.from(new Set([...skillsRaw, ...student.skills]));
  }
  const categorized = categorizeSkillsList(skillsRaw);

  // Experience:
  // ONLY from chosen resume unless isProfileSource is true. Never invent fallbacks.
  const experienceSource = profile?.experience || (isProfileSource ? student?.resumeProfile?.experience || [] : []);
  const experience = (experienceSource || []).map((e) => ({
    title: e.title || '',
    company: e.company || '',
    location: e.location || '',
    duration: e.duration || '',
    bullets:
      Array.isArray(e.bullets) && e.bullets.length > 0
        ? e.bullets.map((b) => String(b).trim()).filter(Boolean)
        : e.description
        ? [e.description.trim()]
        : [],
  }));

  // Projects:
  // ONLY from chosen resume unless isProfileSource is true. Never invent fallbacks.
  const projectsSource = profile?.projects || (isProfileSource ? student?.resumeProfile?.projects || [] : []);
  const projects = (projectsSource || []).map((p) => ({
    title: p.title || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    duration: p.duration || '',
    link: p.link || '',
    bullets:
      Array.isArray(p.bullets) && p.bullets.length > 0
        ? p.bullets.map((b) => String(b).trim()).filter(Boolean)
        : p.description
        ? [p.description.trim()]
        : [],
  }));

  // Education:
  // The chosen resume is the primary source; if missing, college profile fills missing education.
  const educationList = [];
  if (Array.isArray(profile?.education) && profile.education.length > 0) {
    profile.education.forEach((edu) => {
      if (typeof edu === 'string') {
        const { entries } = parseEducationSection([edu]);
        entries.forEach((e) => educationList.push(e));
      } else if (typeof edu === 'object' && edu !== null) {
        let degree = edu.degree || '';
        let institution = edu.institution || '';
        let field = edu.field || '';
        let year = edu.year || '';
        let score = edu.score || '';

        // If degree matches institution keywords but not degree keywords, swap
        if (
          INSTITUTION_KEYWORD_REGEX.test(degree) &&
          !DEGREE_REGEX.test(degree) &&
          (!institution || DEGREE_REGEX.test(institution))
        ) {
          const temp = degree;
          degree = institution;
          institution = temp;
        }

        if (degree && !field) {
          const inMatch =
            degree.match(/^(.*?)\s+in\s+(.*)$/i) || degree.match(/^(.*?)\s+[-–—]\s+(.*)$/i);
          if (inMatch) {
            degree = inMatch[1].trim();
            field = inMatch[2].trim();
          }
        }

        educationList.push({
          degree,
          institution,
          field,
          year,
          score,
        });
      }
    });
  } else if (student?.college?.name || student?.branch || student?.degree || student?.batchYear) {
    educationList.push({
      degree: student?.degree || '',
      institution: student?.college?.name || '',
      field: student?.branch || '',
      year: student?.batchYear ? String(student.batchYear) : '',
      score: student?.cgpa ? `${student.cgpa} CGPA` : '',
      fromProfile: 'from your profile',
    });
    filledFromProfile.education = 'from your profile';
  }

  // Certifications
  const certifications = (profile?.certifications || (isProfileSource ? student?.resumeProfile?.certifications || [] : []))
    .map((c) => (typeof c === 'string' ? c : c.title || c.name || ''))
    .filter(Boolean);

  return {
    contact: {
      fullName,
      email,
      phone,
      location,
      linkedin,
      github,
      portfolio,
      fromProfile: filledFromProfile,
    },
    summary: (profile?.summary || '').replace(/^[-*•·▪–—\s]+/, '').trim(),
    skills: categorized,
    experience,
    projects,
    education: educationList,
    certifications,
    filledFromProfile,
  };
}

function isBulletLine(str) {
  return /^[-*•·▪–—]\s+/.test(str) || /^\d+\.\s+/.test(str);
}

function cleanBulletText(str) {
  return str.replace(/^[-*•·▪–—]\s+/, '').replace(/^\d+\.\s+/, '').trim();
}

const DEGREE_REGEX =
  /\b(?:B\.?E\.?|B\.?Tech\.?|M\.?Tech\.?|B\.?Sc\.?|M\.?Sc\.?|B\.?C\.?A\.?|M\.?C\.?A\.?|B\.?B\.?A\.?|M\.?B\.?A\.?|B\.?Com\.?|M\.?Com\.?|B\.?A\.?|M\.?A\.?|Ph\.?D\.?|Doctorate|Diploma|HSC|SSC|12th(?:\s+Standard)?|10th(?:\s+Standard)?|Higher\s+Secondary|Secondary\s+School(?:\s+Certificate)?|Bachelor(?:'s)?(?:\s+of\s+[^,\n|]+)?|Master(?:'s)?(?:\s+of\s+[^,\n|]+)?|Associate(?:'s)?(?:\s+of\s+[^,\n|]+)?)\b/i;

const INSTITUTION_KEYWORD_REGEX =
  /\b(?:University|Institute|College|School|Academy|Polytechnic|Vidyalaya|Campus|Facult(?:y|ies)|IIT|NIT|IIIT|BITS|MIT|IISc)\b/i;

const DATE_RANGE_REGEX =
  /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4}\s*(?:-|–|—|to)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:\d{4}|present|current|expected)\b/i;

const SINGLE_DATE_REGEX =
  /\b(?:Expected\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;

const YEAR_ONLY_REGEX = /\b(19[7-9]\d|20[0-4]\d)\b/;

const SCORE_VALUE_REGEX =
  /(?:\b\d{1,2}(?:\.\d{1,3})?\s*\/\s*\d{1,2}(?:\.\d{1,2})?\b|\b\d{1,3}(?:\.\d{1,2})?%)/;

const SCORE_WITH_LABEL_REGEX =
  /(?:CGPA|GPA|Score|Percentage|Grade)[:\s]*([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[0-9]+(?:\.[0-9]+)?)?|[0-9]+(?:\.[0-9]+)?%)/i;

const SCORE_LABEL_ONLY_REGEX = /^(?:CGPA|GPA|Percentage|Score|Grade)[:\s]*$/i;

const FIELD_KEYWORD_REGEX =
  /\b(?:Computer(?:\s+Science|\s+Engineering)?|Information\s+Technology|Electronics|Electrical|Mechanical|Civil|Data\s+Science|Artificial\s+Intelligence|Cybersecurity|Biotechnology|Business\s+Administration|Commerce|Physics|Chemistry|Mathematics)\b/i;

/**
 * Parses education lines into structured education objects using pattern recognition
 * rather than line position.
 * Recognizes degree, institution, date/range, score, and field of study.
 * Groups on degree/institution boundaries and joins score labels with values.
 *
 * @param {Array<string>} rawLines
 * @param {Array<string>} [warnings]
 * @returns {{ entries: Array<Object>, warnings: Array<string> }}
 */
function parseEducationSection(rawLines = [], warnings = []) {
  const entries = [];
  let currentEntry = null;
  let pendingScoreLabel = '';

  const finalizeEntry = () => {
    if (!currentEntry) return;
    const hasDegree = Boolean(currentEntry.degree && currentEntry.degree.trim());
    const hasInst = Boolean(currentEntry.institution && currentEntry.institution.trim());
    const hasContent = hasDegree || hasInst || Boolean(currentEntry.score) || Boolean(currentEntry.year);

    if (hasContent) {
      if (!hasDegree || !hasInst) {
        warnings.push('Please check this education entry');
      }
      entries.push({
        degree: currentEntry.degree || '',
        institution: currentEntry.institution || '',
        field: currentEntry.field || '',
        year: currentEntry.year || '',
        score: currentEntry.score || '',
      });
    }
    currentEntry = null;
    pendingScoreLabel = '';
  };

  const getOrCreateEntry = () => {
    if (!currentEntry) {
      currentEntry = { degree: '', institution: '', field: '', year: '', score: '' };
    }
    return currentEntry;
  };

  const cleanLine = (str) =>
    (str || '')
      .replace(/^[-*•·▪–—\s]+/, '')
      .replace(/^[|•\s-]+|[|•\s-]+$/g, '')
      .trim();

  // Break lines into segments if delimited by | or •
  const segments = [];
  for (const rawLine of rawLines) {
    const cleaned = cleanLine(rawLine);
    if (!cleaned) continue;

    // Check if line contains explicit pipe or bullet delimiters
    if (/[|•]/.test(cleaned)) {
      const parts = cleaned.split(/[|•]/).map(cleanLine).filter(Boolean);
      segments.push(...parts);
    } else {
      segments.push(cleaned);
    }
  }

  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];

    // 1. Check if line is solely a score label (e.g. "CGPA", "Percentage")
    if (SCORE_LABEL_ONLY_REGEX.test(seg)) {
      pendingScoreLabel = seg.replace(/[:\s]+$/, '').trim();
      continue;
    }

    // 2. Check for explicit score with label (e.g. "CGPA: 8.9", "Grade: 7.23/10")
    const scoreWithLabelMatch = seg.match(SCORE_WITH_LABEL_REGEX);
    if (scoreWithLabelMatch) {
      const entry = getOrCreateEntry();
      const scoreStr = scoreWithLabelMatch[0].trim();
      if (!entry.score) {
        entry.score = scoreStr;
      }
      seg = seg.replace(scoreWithLabelMatch[0], '').trim();
      if (!seg) continue;
    }

    // 3. Check for standalone score value (e.g. "7.23/10", "85%")
    const scoreValMatch = seg.match(SCORE_VALUE_REGEX);
    if (scoreValMatch) {
      const entry = getOrCreateEntry();
      let val = scoreValMatch[0].trim();
      if (pendingScoreLabel && !val.toLowerCase().includes(pendingScoreLabel.toLowerCase())) {
        val = `${val} ${pendingScoreLabel}`.trim();
        pendingScoreLabel = '';
      }
      if (!entry.score) {
        entry.score = val;
      }
      seg = seg.replace(scoreValMatch[0], '').trim();
      if (!seg) continue;
    }

    // 4. Check for dates / date ranges
    let extractedDate = '';
    const dateRangeMatch = seg.match(DATE_RANGE_REGEX);
    if (dateRangeMatch) {
      extractedDate = dateRangeMatch[0].trim();
      seg = seg.replace(dateRangeMatch[0], '').trim();
    } else {
      const singleDateMatch = seg.match(SINGLE_DATE_REGEX);
      if (singleDateMatch) {
        extractedDate = singleDateMatch[0].trim();
        seg = seg.replace(singleDateMatch[0], '').trim();
      } else {
        const yearMatch = seg.match(YEAR_ONLY_REGEX);
        if (yearMatch) {
          const idx = seg.indexOf(yearMatch[0]);
          const beforeChar = idx > 0 ? seg[idx - 1] : ' ';
          const afterChar = idx + 4 < seg.length ? seg[idx + 4] : ' ';
          if (!/[a-zA-Z]/.test(beforeChar) && !/[a-zA-Z]/.test(afterChar)) {
            extractedDate = yearMatch[0].trim();
            seg = seg.replace(yearMatch[0], '').trim();
          }
        }
      }
    }

    if (extractedDate) {
      const entry = getOrCreateEntry();
      if (!entry.year) {
        entry.year = extractedDate;
      } else if (!entry.year.includes(extractedDate)) {
        entry.year = `${extractedDate} - ${entry.year}`;
      }
      seg = cleanLine(seg);
      if (!seg) continue;
    }

    // 5. Check if seg ends with a trailing score label like "CGPA" (e.g. "B.E. in Computer Engineering CGPA")
    const trailingScoreLabelMatch = seg.match(/\b(CGPA|GPA|Percentage|Score|Grade)\s*$/i);
    if (trailingScoreLabelMatch) {
      pendingScoreLabel = trailingScoreLabelMatch[1].trim();
      seg = seg.replace(/\b(CGPA|GPA|Percentage|Score|Grade)\s*$/i, '').trim();
    }

    // 6. Check for Degree pattern
    const degreeMatch = seg.match(DEGREE_REGEX);
    if (degreeMatch) {
      if (currentEntry && currentEntry.degree) {
        finalizeEntry();
      }
      const entry = getOrCreateEntry();

      const inMatch =
        seg.match(/^(.*?)\s+in\s+(.*)$/i) || seg.match(/^(.*?)\s+[-–—]\s+(.*)$/i);
      if (inMatch) {
        entry.degree = inMatch[1].trim();
        if (!entry.field) {
          entry.field = inMatch[2].trim();
        }
      } else {
        const degMatchExact = seg.match(DEGREE_REGEX);
        if (degMatchExact && degMatchExact[0].length < seg.length) {
          const degPrefix = degMatchExact[0].trim();
          const remainder = seg.replace(degMatchExact[0], '').replace(/^[-–—,\s]+/, '').trim();
          entry.degree = degPrefix;
          if (remainder && !entry.field) entry.field = remainder;
        } else {
          entry.degree = seg;
        }
      }
      continue;
    }

    // 7. Check for Institution pattern
    const instMatch = seg.match(INSTITUTION_KEYWORD_REGEX);
    if (instMatch) {
      if (currentEntry && currentEntry.degree && currentEntry.institution) {
        finalizeEntry();
      }
      const entry = getOrCreateEntry();
      if (!entry.institution) {
        entry.institution = seg;
      } else {
        entry.institution = `${entry.institution}, ${seg}`;
      }
      continue;
    }

    // 8. Check for Field of Study pattern
    const fieldPrefixMatch = seg.match(/^(?:major|branch|discipline|specialization|field(?: of study)?):\s*(.*)/i);
    if (fieldPrefixMatch) {
      const entry = getOrCreateEntry();
      if (!entry.field) entry.field = fieldPrefixMatch[1].trim();
      continue;
    } else if (FIELD_KEYWORD_REGEX.test(seg)) {
      const entry = getOrCreateEntry();
      if (!entry.field) {
        entry.field = seg;
        continue;
      }
    }

    // 9. Unmatched text chunk
    const entry = getOrCreateEntry();
    if (!entry.degree && !entry.institution) {
      entry.degree = seg;
      warnings.push('Please check this education entry');
    } else if (!entry.field && seg.length < 50) {
      entry.field = seg;
    } else {
      warnings.push('Please check this education entry');
    }
  }

  finalizeEntry();
  return { entries, warnings };
}

/**
 * Extracts rich, comprehensive resume sections deterministically via rule-based parsing.
 * Captures core sections, achievements, positions of responsibility, awards, languages,
 * interests, and any non-standard sections in additionalSections.
 */
function extractComprehensiveWithRules(text = '', extractedContacts = {}) {
  const extractedSkills = extractSkillsFromText(text);
  const rawLines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let fullName = '';
  let location = '';
  let summary = '';
  const skillsList = [...extractedSkills];
  const education = [];
  const eduLines = [];
  const experience = [];
  const projects = [];
  const certifications = [];
  const achievements = [];
  const positionsOfResponsibility = [];
  const awards = [];
  const languages = [];
  const interests = [];
  const additionalSections = [];

  let currentSection = 'header';
  let activeExp = null;
  let activeProj = null;
  let activeEdu = null;
  let activeCustom = null;

  const finalizeExp = () => {
    if (activeExp && (activeExp.title || activeExp.company || activeExp.bullets.length > 0)) {
      experience.push(activeExp);
      activeExp = null;
    }
  };

  const finalizeProj = () => {
    if (activeProj && (activeProj.title || activeProj.bullets.length > 0)) {
      activeProj.technologies = Array.from(new Set(activeProj.technologies));
      projects.push(activeProj);
      activeProj = null;
    }
  };

  const finalizeEdu = () => {
    if (activeEdu && (activeEdu.degree || activeEdu.institution)) {
      education.push(activeEdu);
      activeEdu = null;
    }
  };

  const finalizeCustom = () => {
    if (activeCustom && activeCustom.title && activeCustom.lines.length > 0) {
      additionalSections.push(activeCustom);
      activeCustom = null;
    }
  };

  const finalizeAll = () => {
    finalizeExp();
    finalizeProj();
    finalizeEdu();
    finalizeCustom();
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const lower = line.toLowerCase();

    // Section header identification
    if (/^(?:education|academics|qualifications|academic background)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'edu';
      continue;
    } else if (
      /^(?:experience|work history|employment|internships|work experience|professional experience)\b/i.test(
        lower
      )
    ) {
      finalizeAll();
      currentSection = 'exp';
      continue;
    } else if (/^(?:projects|technical projects|academic projects|key projects)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'proj';
      continue;
    } else if (
      /^(?:technical skills|skills & tools|skills|core competencies|technologies)\b/i.test(lower)
    ) {
      finalizeAll();
      currentSection = 'skills';
      continue;
    } else if (/^(?:certifications|certificates|licenses|courses)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'cert';
      continue;
    } else if (/^(?:achievements|accomplishments|honors)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'achievements';
      continue;
    } else if (
      /^(?:positions of responsibility|leadership|extracurricular|activities)\b/i.test(lower)
    ) {
      finalizeAll();
      currentSection = 'responsibility';
      continue;
    } else if (/^(?:awards|honors & awards)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'awards';
      continue;
    } else if (/^(?:languages|language proficiencies)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'languages';
      continue;
    } else if (/^(?:interests|hobbies)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'interests';
      continue;
    } else if (/^(?:summary|professional summary|about me|profile)\b/i.test(lower)) {
      finalizeAll();
      currentSection = 'summary';
      continue;
    } else if (
      /^[A-Z0-9\s&-]{3,35}:?$/.test(line) &&
      line.length < 35 &&
      !line.includes('•') &&
      !line.includes('|') &&
      !line.includes('@') &&
      !line.includes('http')
    ) {
      // Unrecognized section header -> additionalSections
      finalizeAll();
      currentSection = 'custom';
      activeCustom = { title: line.replace(/:$/, '').trim(), lines: [] };
      continue;
    }

    if (currentSection === 'header') {
      if (
        !fullName &&
        !line.includes('@') &&
        !line.includes('http') &&
        !line.includes('[[') &&
        !/^\+?\d/.test(line)
      ) {
        if (line.length < 40 && !/developer|engineer|resume|curriculum/i.test(line)) {
          fullName = line;
          continue;
        }
      }
      if (
        !location &&
        /(?:bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|noida|gurgaon|california|san francisco|london|remote|[A-Za-z]+,\s*[A-Za-z]+)/i.test(
          line
        )
      ) {
        location = line.replace(/^[|•\s-]+|[|•\s-]+$/g, '').trim();
      }
    } else if (currentSection === 'summary') {
      summary = summary ? `${summary} ${line}` : line;
    } else if (currentSection === 'skills') {
      const skillsInLine = extractSkillsFromText(line);
      skillsInLine.forEach((s) => skillsList.push(s));
    } else if (currentSection === 'exp') {
      if (isBulletLine(line)) {
        if (!activeExp) {
          activeExp = {
            title: '',
            company: '',
            location: '',
            duration: '',
            bullets: [],
          };
        }
        activeExp.bullets.push(cleanBulletText(line));
      } else {
        finalizeExp();
        const parts = line.split(/[|•–—,-]/).map((p) => p.trim()).filter(Boolean);
        activeExp = {
          title: parts[0] || '',
          company: parts[1] || '',
          location: parts[2] || '',
          duration: '',
          bullets: [],
        };
      }
    } else if (currentSection === 'proj') {
      if (isBulletLine(line)) {
        if (!activeProj) {
          activeProj = {
            title: '',
            technologies: [],
            duration: '',
            link: '',
            bullets: [],
          };
        }
        activeProj.bullets.push(cleanBulletText(line));
      } else {
        finalizeProj();
        const techInLine = extractSkillsFromText(line);
        const parts = line.split(/[|•–—]/).map((p) => p.trim()).filter(Boolean);
        activeProj = {
          title: parts[0] || '',
          technologies: techInLine,
          duration: '',
          link: '',
          bullets: [],
        };
      }
    } else if (currentSection === 'edu') {
      eduLines.push(line);
    } else if (currentSection === 'cert') {
      certifications.push(cleanBulletText(line));
    } else if (currentSection === 'achievements') {
      achievements.push(cleanBulletText(line));
    } else if (currentSection === 'responsibility') {
      positionsOfResponsibility.push(cleanBulletText(line));
    } else if (currentSection === 'awards') {
      awards.push(cleanBulletText(line));
    } else if (currentSection === 'languages') {
      const langs = line.split(/[,|•]/).map((l) => l.trim()).filter(Boolean);
      langs.forEach((l) => languages.push(l));
    } else if (currentSection === 'interests') {
      const ints = line.split(/[,|•]/).map((l) => l.trim()).filter(Boolean);
      ints.forEach((l) => interests.push(l));
    } else if (currentSection === 'custom' && activeCustom) {
      activeCustom.lines.push(cleanBulletText(line));
    }
  }

  finalizeAll();

  const { entries: parsedEducation, warnings: eduWarnings } = parseEducationSection(eduLines);
  parsedEducation.forEach((e) => education.push(e));

  const categorized = categorizeSkillsList(Array.from(new Set(skillsList)));

  const cleanSummary = summary
    ? summary.replace(/^[-*•·▪–—\s]+/, '').replace(/\s+/g, ' ').trim()
    : '';

  return {
    contact: {
      fullName: fullName || '',
      email: '',
      phone: '',
      location: location || '',
      linkedin: '',
      github: '',
      portfolio: '',
    },
    summary: cleanSummary,
    skills: categorized,
    experience,
    projects,
    education,
    certifications,
    achievements,
    positionsOfResponsibility,
    awards,
    languages,
    interests,
    additionalSections,
    _educationWarnings: eduWarnings,
  };
}

/**
 * Verifies that all parsed facts (skills, companies, roles, project names)
 * appear in raw source text (case and whitespace normalized).
 * Drops unverified items and generates explanatory warnings.
 */
function verifySourceFacts(resumeData, rawText = '') {
  if (!resumeData || typeof resumeData !== 'object') {
    return { verifiedData: resumeData, warnings: [] };
  }
  const warnings = [];
  const normCorpus = (rawText || '').toLowerCase().replace(/\s+/g, ' ');
  const alphaCorpus = normCorpus.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');

  const data = JSON.parse(JSON.stringify(resumeData));

  // 1. Verify skills
  if (Array.isArray(data.skills)) {
    data.skills = data.skills
      .map((cat) => {
        const items = (cat.items || []).filter((sk) => {
          const skNorm = sk.toLowerCase().trim();
          const skAlpha = skNorm.replace(/[^\w\s]/g, ' ');
          const found =
            normCorpus.includes(skNorm) ||
            alphaCorpus.includes(skAlpha) ||
            matchSkillInText(sk, rawText);
          if (!found) {
            warnings.push(`Unverified skill "${sk}" not found in resume and was removed.`);
            return false;
          }
          return true;
        });
        return { ...cat, items };
      })
      .filter((cat) => (cat.items || []).length > 0);
  }

  // 2. Verify experience companies and titles
  if (Array.isArray(data.experience)) {
    data.experience = data.experience.filter((exp) => {
      const comp = (exp.company || '').trim().toLowerCase();
      const title = (exp.title || '').trim().toLowerCase();
      const compInCorpus = comp
        ? normCorpus.includes(comp) || alphaCorpus.includes(comp.replace(/[^\w\s]/g, ' '))
        : true;
      const titleInCorpus = title
        ? normCorpus.includes(title) || alphaCorpus.includes(title.replace(/[^\w\s]/g, ' '))
        : true;

      if (!compInCorpus) {
        warnings.push(`Unverified employer "${exp.company}" not found in resume and was removed.`);
        exp.company = '';
      }
      if (!compInCorpus && !titleInCorpus) {
        return false; // Drop hallucinated entry
      }
      return true;
    });
  }

  // 3. Verify projects
  if (Array.isArray(data.projects)) {
    data.projects = data.projects.filter((proj) => {
      const title = (proj.title || '').trim().toLowerCase();
      if (!title) return true;
      const titleInCorpus =
        normCorpus.includes(title) || alphaCorpus.includes(title.replace(/[^\w\s]/g, ' '));
      if (!titleInCorpus) {
        warnings.push(`Unverified project "${proj.title}" not found in resume and was removed.`);
        return false;
      }
      return true;
    });
  }

  return { verifiedData: data, warnings };
}

/**
 * Loads and normalizes resume data according to chosen source type:
 * - 'profile': uses compileBaseResume(studentUserId) - ONLY mode that reads profile data.
 * - 'upload': parses directly from uploaded file buffer in memory, zero profile mixing, zero DB overwrite.
 * - 'resume_ai_file': reads raw GridFS stream from storage (NOT resumeProfile JSON), zero profile mixing.
 * - 'text': extracts structure from raw text, zero profile mixing.
 *
 * @param {Object} params
 * @param {string} params.studentUserId
 * @param {string} params.type - 'profile' | 'upload' | 'resume_ai_file' | 'text'
 * @param {Object} [params.file] - Multer file object for type='upload'
 * @param {string} [params.text] - Raw resume text (required for type='text')
 * @returns {Promise<{ resumeData: Object, warnings: string[], parseConfidence: number, sourceType: string }>}
 */
async function loadResumeSource({ studentUserId, type, file = null, text = '' }) {
  if (!['profile', 'upload', 'resume_ai_file', 'text'].includes(type)) {
    const err = new Error("Invalid source type. Must be 'profile', 'upload', 'resume_ai_file', or 'text'.");
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

  // 1. Profile mode: the ONLY mode that reads profile data
  if (type === 'profile') {
    const resumeData = await compileBaseResume(studentUserId);
    const warnings = computeResumeWarnings(resumeData);
    return {
      resumeData,
      warnings,
      parseConfidence: 1.0,
      sourceType: 'profile',
    };
  }

  let rawText = '';
  let buffer = null;
  let isDocx = false;

  // 2. Upload mode: direct file upload in memory, never overwrites student record
  if (type === 'upload') {
    if (file && file.buffer) {
      if (file.buffer.length > 5 * 1024 * 1024) {
        const err = new Error('Resume file size exceeds the 5MB limit for parsing.');
        err.status = 400;
        err.statusCode = 400;
        throw err;
      }

      buffer = file.buffer;
      isDocx =
        (file.originalname || '').toLowerCase().endsWith('.docx') ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        buffer.slice(0, 2).toString('ascii') === 'PK';

      if (!isDocx && !buffer.slice(0, 4).toString('ascii').startsWith('%PDF')) {
        const err = new Error('Invalid file format: PDF must start with %PDF magic header.');
        err.status = 400;
        err.statusCode = 400;
        throw err;
      }

      const extracted = await defaultExtractor(buffer, {
        filename: file.originalname || (isDocx ? 'resume.docx' : 'resume.pdf'),
      });
      rawText = extracted.text;
    } else if (student.resumeUrl) {
      // Re-read raw stored file stream if no new file supplied
      const { stream, filename } = await getResumeStream(student.resumeUrl);
      buffer = await streamToBuffer(stream);
      isDocx = (filename || student.resumeUrl || '').toLowerCase().endsWith('.docx');
      const extracted = await defaultExtractor(buffer, {
        filename: file?.originalname || filename || (isDocx ? 'resume.docx' : 'resume.pdf'),
      });
      rawText = extracted.text;
    } else if (student.resumeProfile && (student.resumeProfile.summary || (student.resumeProfile.skills && student.resumeProfile.skills.length > 0))) {
      const normalized = normalizeResumeDataFromProfile(
        student.resumeProfile,
        { name: student.user?.name },
        {},
        false
      );
      normalized.contact.phone = student.resumeProfile.contact?.phone || '';
      normalized.education = (student.resumeProfile.education || []).map((edu) => ({
        degree: edu.degree || '',
        institution: edu.institution || '',
        field: edu.field || '',
        year: edu.year || '',
        score: edu.score || '',
      }));
      delete normalized.filledFromProfile;
      delete normalized.contact.fromProfile;
      const warnings = computeResumeWarnings(normalized);
      return {
        resumeData: normalized,
        warnings,
        parseConfidence: 0.95,
        sourceType: type,
        extractedLinks: [],
      };
    } else {
      const err = new Error('No uploaded resume found in your account. Resume file is required for upload source type.');
      err.status = 400;
      err.statusCode = 400;
      throw err;
    }
  }

  // 3. resume_ai_file mode: read stored GridFS bytes, NOT resumeProfile JSON
  else if (type === 'resume_ai_file') {
    if (student.resumeUrl) {
      const { stream, filename } = await getResumeStream(student.resumeUrl);
      buffer = await streamToBuffer(stream);
      isDocx = (filename || student.resumeUrl || '').toLowerCase().endsWith('.docx');
      const extracted = await defaultExtractor(buffer, {
        filename: file.originalname || (isDocx ? 'resume.docx' : 'resume.pdf'),
      });
      rawText = extracted.text;
    } else if (student.resumeProfile && (student.resumeProfile.summary || (student.resumeProfile.skills && student.resumeProfile.skills.length > 0))) {
      const normalized = normalizeResumeDataFromProfile(
        student.resumeProfile,
        { name: student.user?.name },
        {},
        false
      );
      normalized.contact.phone = student.resumeProfile.contact?.phone || '';
      normalized.education = (student.resumeProfile.education || []).map((edu) => ({
        degree: edu.degree || '',
        institution: edu.institution || '',
        field: edu.field || '',
        year: edu.year || '',
        score: edu.score || '',
      }));
      delete normalized.filledFromProfile;
      delete normalized.contact.fromProfile;
      const warnings = computeResumeWarnings(normalized);
      return {
        resumeData: normalized,
        warnings,
        parseConfidence: 0.95,
        sourceType: type,
        extractedLinks: [],
      };
    } else {
      const err = new Error('No uploaded resume found in your account.');
      err.status = 400;
      err.statusCode = 400;
      throw err;
    }
  }

  // 4. text mode: raw text
  else if (type === 'text') {
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
    rawText = text.trim();
  }

  // Deterministic link and contact extraction (visible text regex + PDF link annotations / DOCX rels)
  const linksAndContacts = await extractAllLinksAndContacts({
    buffer,
    text: rawText,
    isDocx,
  });

  // Reversible tokenization: replace sensitive contact info and URLs with non-PII tokens before AI
  const { tokenizedText, tokenMap } = tokenizeText(rawText, {
    emails: linksAndContacts.emails,
    phones: linksAndContacts.phones,
    urls: linksAndContacts.links.map((l) => l.url),
  });

  // Parse structured data
  const parsedTokenized = extractComprehensiveWithRules(tokenizedText, linksAndContacts);

  // Detokenize to restore real URLs
  const detokenized = detokenize(parsedTokenized, tokenMap);

  // Assign deterministic contacts (Zero profile mixing! Never fallback to student profile)
  detokenized.contact = {
    fullName: detokenized.contact?.fullName || '',
    email: linksAndContacts.emails[0] || '',
    phone: linksAndContacts.phones[0] || '',
    location: detokenized.contact?.location || '',
    linkedin: linksAndContacts.classified.linkedin || '',
    github: linksAndContacts.classified.github || '',
    portfolio: linksAndContacts.classified.portfolio || '',
  };

  // Source fact verification: verify every fact appears in raw text
  const { verifiedData, warnings: factWarnings } = verifySourceFacts(detokenized, rawText);
  const generalWarnings = computeResumeWarnings(verifiedData);
  const eduWarnings = Array.isArray(parsedTokenized._educationWarnings)
    ? parsedTokenized._educationWarnings
    : [];
  delete verifiedData._educationWarnings;
  delete detokenized._educationWarnings;
  const warnings = [...factWarnings, ...generalWarnings, ...eduWarnings];

  return {
    resumeData: verifiedData,
    warnings,
    parseConfidence: type === 'text' ? 0.85 : 0.95,
    sourceType: type,
    extractedLinks: linksAndContacts.links,
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
    const parsed = await analyzeJobDescription(jobDescription.trim(), { userId: studentUserId });

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
        company: parsed.company || 'Target Employer',
        requiredSkills: parsed.requiredSkills || [],
        preferredSkills: parsed.preferredSkills || [],
        minYearsExperience: parsed.minYearsExperience || 0,
        education: parsed.education || '',
        keywords,
        source: parsed.source || 'rules',
        cached: Boolean(parsed.cached),
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
 * Tailors a candidate's resume to a target Drive or Job Description.
 * Performs section-by-section parallel rewrites with 25s timeout per call and 60s total budget.
 * Injects explicit allowed-facts list in prompt and performs 1 repair call on rejection without extra quota.
 * Never alters contact data or links.
 */
async function tailorResume({
  studentUserId,
  baseResumeData,
  driveId = null,
  jobDescription = '',
  sourceType = 'profile',
  signal = null,
  isAborted = null,
}) {
  // 1. Quota check (checked once at request initiation)
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
      const parsedJd = await analyzeJobDescription(jobDescription.trim(), { userId: studentUserId });
      targetRole = parsedJd.roleTitle || targetRole;
      targetCompany = parsedJd.company || targetCompany;
      requiredSkills = (parsedJd.requiredSkills || []).map(normalizeSkill);
      preferredSkills = (parsedJd.preferredSkills || []).map(normalizeSkill);
      minYearsExp = parsedJd.minYearsExperience || 0;
      targetEducation = parsedJd.education || '';
    } catch (jdErr) {
      console.warn('[ResumeBuilder] JD parsing fallback:', jdErr.message);
    }
  }

  const targetSet = new Set([...requiredSkills, ...preferredSkills]);

  // Compile base resume if not supplied
  const baseResume = baseResumeData || (await compileBaseResume(studentUserId));

  // 4. Tailor Skills: Reorder matching skills to front of categories
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

  // 5. Tailor Projects: Promote projects matching target skills
  const tailoredProjects = [...(baseResume.projects || [])];
  tailoredProjects.sort((a, b) => {
    const aTechs = (a.technologies || []).map(normalizeSkill);
    const bTechs = (b.technologies || []).map(normalizeSkill);
    const aMatches = aTechs.filter((t) => targetSet.has(t)).length;
    const bMatches = bTechs.filter((t) => targetSet.has(t)).length;
    return bMatches - aMatches;
  });

  // 6. Allowed Facts Extraction (Grounded strictly in verified baseResumeData)
  const allowedSkills = Array.from(
    new Set((baseResume.skills || []).flatMap((c) => c.items || []))
  );
  const allowedEmployers = Array.from(
    new Set((baseResume.experience || []).map((e) => e.company).filter(Boolean))
  );
  const allowedProjects = Array.from(
    new Set((baseResume.projects || []).map((p) => p.title).filter(Boolean))
  );
  const allowedNumbers = Array.from(
    new Set(
      (JSON.stringify(baseResume).match(/\b\d+(?:[.,]\d+)?\+?%?\b/g) || []).map((n) =>
        n.toLowerCase()
      )
    )
  );
  const allowedVerbsList = Array.from(ALLOW_LISTED_OPENING_VERBS).slice(0, 20).join(', ');

  const candidateSkillsSet = new Set(allowedSkills.map((s) => s.toLowerCase()));
  const resumeCorpus = JSON.stringify(baseResume).toLowerCase();

  const SECTION_TIMEOUT_MS = parseInt(process.env.SECTION_TIMEOUT_MS, 10) || 25000;
  const timeoutWrapper = (promise, ms = SECTION_TIMEOUT_MS) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`Section rewrite timed out after ${ms / 1000}s`);
        err.code = 'SECTION_TIMEOUT';
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  };

  const modelUsed =
    process.env.AI_PROVIDER === 'mock' || process.env.NODE_ENV === 'test'
      ? 'mock'
      : process.env.AI_MODEL || 'gemini-1.5-flash';

  const existingBullets = [];
  (baseResume.experience || []).forEach((e) =>
    (e.bullets || []).forEach((b) => existingBullets.push(b))
  );
  (baseResume.projects || []).forEach((p) =>
    (p.bullets || []).forEach((b) => existingBullets.push(b))
  );
  const targetBullets = existingBullets.slice(0, 8);

  // Parallel Task 1: Summary rewrite with 25s timeout and 1 repair call on rejection
  const rewriteSummaryTask = async () => {
    if (!baseResume.summary || !baseResume.summary.trim()) {
      return { summary: baseResume.summary, reasonCodes: [] };
    }
    const summaryUserPrompt = `Target Role: ${targetRole}
Target Company: ${targetCompany || 'Target Employer'}
Original Summary: "${baseResume.summary}"

EXPLICIT ALLOWED FACTS:
Allowed Skills: ${allowedSkills.join(', ')}
Allowed Employers: ${allowedEmployers.join(', ')}
Allowed Numbers/Metrics: ${allowedNumbers.join(', ')}

Rewrite candidate summary to align with the target role. You MUST keep every concrete number and verified platform (e.g. LeetCode, CodeChef) from the original summary. Return strictly JSON: { "summary": "string" }`;

    try {
      const aiRes = await timeoutWrapper(
        callAiWithQuotaAndRetry({
          systemPrompt: TAILOR_SYSTEM_PROMPT,
          userPrompt: summaryUserPrompt,
          mode: 'tailor',
          userId: studentUserId,
          skipQuota: true,
          abortSignal: signal,
          isAborted,
        })
      );

      if (aiRes.success && aiRes.data && aiRes.data.summary) {
        const val1 = validateSummaryRewriteDetailed(
          aiRes.data.summary,
          baseResume.summary,
          resumeCorpus,
          candidateSkillsSet,
          allowedEmployers
        );
        if (val1.valid) {
          return { summary: aiRes.data.summary, reasonCodes: [] };
        }

        // Trigger 1 repair call (no extra quota usage)
        const repairPrompt = `Your previous summary rewrite was rejected for honesty violations:
Violations: ${val1.reasonCodes.join(', ')}
Violating items: ${val1.items.join(', ')}
Allowed facts you MUST preserve: ${allowedSkills.slice(0, 10).join(', ')}, ${allowedNumbers.join(', ')}
Please repair the summary: remove all violating items, keep all verified metrics and platform facts, and do not introduce any unverified claims. Return strictly JSON: { "summary": "string" }`;

        try {
          const repRes = await timeoutWrapper(
            callAiWithQuotaAndRetry({
              systemPrompt: TAILOR_SYSTEM_PROMPT,
              userPrompt: repairPrompt,
              mode: 'tailor_repair',
              userId: studentUserId,
              skipQuota: true,
              abortSignal: signal,
              isAborted,
            })
          );
          if (repRes.success && repRes.data && repRes.data.summary) {
            const val2 = validateSummaryRewriteDetailed(
              repRes.data.summary,
              baseResume.summary,
              resumeCorpus,
              candidateSkillsSet,
              allowedEmployers
            );
            if (val2.valid) {
              return { summary: repRes.data.summary, reasonCodes: [] };
            }
            return { summary: baseResume.summary, reasonCodes: val2.reasonCodes };
          }
        } catch (_) {}

        return { summary: baseResume.summary, reasonCodes: val1.reasonCodes };
      }
    } catch (err) {
      if (err.code === 'SECTION_TIMEOUT') {
        return { summary: baseResume.summary, reasonCodes: ['timeout'] };
      }
    }

    return { summary: baseResume.summary, reasonCodes: [] };
  };

  // Parallel Task 2: Bullet rewrites (each bullet run in parallel with 25s timeout and 1 repair call)
  const rewriteBulletTask = async (bulletText) => {
    const bulletUserPrompt = `Target Role: ${targetRole}
Target Company: ${targetCompany || 'Target Employer'}
Original Bullet: "${bulletText}"

EXPLICIT ALLOWED FACTS:
Allowed Skills: ${allowedSkills.join(', ')}
Allowed Employers: ${allowedEmployers.join(', ')}
Allowed Opening Verbs: ${allowedVerbsList}

Suggest a truthful bullet rewrite aligning with the target role. Lead with an allow-listed verb. Never invent numbers; if metric is unknown use exact placeholder "[add your real number]". Return JSON: { "rewrites": [{ "original": "${bulletText}", "suggested": "...", "why": "..." }] }`;

    try {
      const aiRes = await timeoutWrapper(
        callAiWithQuotaAndRetry({
          systemPrompt: TAILOR_SYSTEM_PROMPT,
          userPrompt: bulletUserPrompt,
          mode: 'tailor',
          userId: studentUserId,
          skipQuota: true,
          abortSignal: signal,
          isAborted,
        })
      );

      let proposed = null;
      if (aiRes.success && aiRes.data) {
        if (Array.isArray(aiRes.data.rewrites) && aiRes.data.rewrites.length > 0) {
          proposed = aiRes.data.rewrites[0];
        } else if (aiRes.data.suggested) {
          proposed = {
            original: bulletText,
            suggested: aiRes.data.suggested,
            why: aiRes.data.why || 'Optimized for target role',
          };
        }
      }

      if (proposed && proposed.suggested) {
        const val1 = validateBulletRewriteDetailed(
          proposed,
          resumeCorpus,
          candidateSkillsSet,
          existingBullets
        );
        if (val1.valid) {
          return {
            original: bulletText,
            suggested: proposed.suggested,
            why: proposed.why || 'Optimized for target role',
            status: 'rewritten',
            reasonCodes: [],
          };
        }

        // Trigger 1 repair call on rejection sending violations without extra quota usage
        const repairPrompt = `Your previous bullet rewrite was rejected:
Violations: ${val1.reasonCodes.join(', ')}
Violating items to remove: ${val1.items.join(', ')}
Allowed candidate facts: ${allowedSkills.slice(0, 10).join(', ')}
Allowed verbs: ${allowedVerbsList}
Repair bullet: remove ${val1.items.join(', ')}, use allowed verb, use only allowed facts. Return JSON: { "suggested": "...", "why": "..." }`;

        try {
          const repRes = await timeoutWrapper(
            callAiWithQuotaAndRetry({
              systemPrompt: TAILOR_SYSTEM_PROMPT,
              userPrompt: repairPrompt,
              mode: 'tailor_repair',
              userId: studentUserId,
              skipQuota: true,
              abortSignal: signal,
              isAborted,
            })
          );

          if (repRes.success && repRes.data) {
            const repSugg =
              repRes.data.suggested ||
              (Array.isArray(repRes.data.rewrites) && repRes.data.rewrites[0]?.suggested);
            if (repSugg) {
              const repObj = {
                original: bulletText,
                suggested: repSugg,
                why: repRes.data.why || 'Repaired rewrite',
              };
              const val2 = validateBulletRewriteDetailed(
                repObj,
                resumeCorpus,
                candidateSkillsSet,
                existingBullets
              );
              if (val2.valid) {
                return {
                  original: bulletText,
                  suggested: repSugg,
                  why: repObj.why,
                  status: 'rewritten',
                  reasonCodes: [],
                };
              }
              return {
                original: bulletText,
                suggested: bulletText,
                why: 'Kept original: rewrite contained unsupported claims.',
                status: 'kept original',
                reasonCodes: val2.reasonCodes,
              };
            }
          }
        } catch (_) {}

        return {
          original: bulletText,
          suggested: bulletText,
          why: 'Kept original: rewrite contained unsupported claims.',
          status: 'kept original',
          reasonCodes: val1.reasonCodes,
        };
      }
    } catch (err) {
      if (err.code === 'SECTION_TIMEOUT') {
        return {
          original: bulletText,
          suggested: bulletText,
          why: 'Kept original: rewrite timed out after 25 seconds.',
          status: 'kept original',
          reasonCodes: ['timeout'],
        };
      }
    }

    // Default fallback if no rewrite produced
    return {
      original: bulletText,
      suggested: bulletText,
      why: 'Kept original.',
      status: 'kept original',
      reasonCodes: [],
    };
  };

  // Run Summary and all target bullets concurrently
  const [summaryResult, ...bulletResults] = await Promise.all([
    rewriteSummaryTask(),
    ...targetBullets.map((b) => rewriteBulletTask(b)),
  ]);

  const tailoredSummary = summaryResult.summary;
  const summaryReasonCodes = summaryResult.reasonCodes || [];
  const validatedRewrites = bulletResults;

  const rewriteMap = new Map();
  for (const rw of validatedRewrites) {
    if (rw && rw.original) {
      rewriteMap.set(rw.original.trim().toLowerCase(), rw.suggested);
    }
  }

  // Apply rewrites into tailored experience & projects
  const tailoredExperience = (baseResume.experience || []).map((e) => ({
    ...e,
    bullets: (e.bullets || []).map(
      (b) => rewriteMap.get(b.trim().toLowerCase()) || b
    ),
  }));

  const tailoredProjectsFinal = tailoredProjects.map((p, pIdx) => ({
    ...p,
    link: (baseResume.projects && baseResume.projects[pIdx]?.link) || p.link || '',
    bullets: (p.bullets || []).map(
      (b) => rewriteMap.get(b.trim().toLowerCase()) || b
    ),
  }));

  const tailoredResume = {
    ...baseResume,
    contact: { ...baseResume.contact }, // Tailoring must NEVER alter contact data or links
    summary: tailoredSummary,
    skills: tailoredSkills,
    experience: tailoredExperience,
    projects: tailoredProjectsFinal,
  };

  // Record quota usage for this tailoring session (strictly 1 call per tailor request)
  const isCancelled = Boolean(signal?.aborted || (typeof isAborted === 'function' && isAborted()));
  if (!isCancelled) {
    try {
      await AiUsage.recordCall(studentUserId, 'tailor');
    } catch (_) {}
  }

  return {
    baseResume,
    tailoredResume,
    bulletRewrites: validatedRewrites,
    summaryReasonCodes,
    modelUsed,
    targetRole,
    targetCompany,
    sourceType,
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
async function generateCoverLetter({
  studentUserId,
  role = 'Software Engineer',
  company = '',
  driveId = null,
  jobDescription = '',
  signal = null,
  isAborted = null,
  resumeData = null,
}) {
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

  let confirmedSkills = [];
  if (resumeData?.skills && Array.isArray(resumeData.skills)) {
    confirmedSkills = resumeData.skills.flatMap((c) =>
      typeof c === 'string' ? [c] : c.items || []
    );
  }
  if (confirmedSkills.length === 0) {
    confirmedSkills = (student.resumeProfile?.skills || []).map((s) => s.name || s);
  }

  let projects = [];
  if (resumeData?.projects && Array.isArray(resumeData.projects)) {
    projects = resumeData.projects.map((p) => p.title || p.name).filter(Boolean);
  }
  if (projects.length === 0) {
    projects = (student.resumeProfile?.projects || []).map((p) => p.title);
  }

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
      abortSignal: signal,
      isAborted,
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
    } to build scalable and reliable software solutions. My hands-on experience designing modular components and optimizing application performance directly aligns with the technical rigor expected at ${effectiveCompany}.\n\nThank you for your time and consideration. I welcome the opportunity to discuss how my technical proficiencies and collaborative drive can support your team's upcoming milestones.\n\nSincerely,\n${candidateName}`;
  }

  // Record usage if fallback occurred (not already recorded by callAiWithQuotaAndRetry)
  const isCancelled = Boolean(signal?.aborted || (typeof isAborted === 'function' && isAborted()));
  if (!aiCoverSuccess && !isCancelled) {
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
async function saveResumeVersion(arg1, arg2) {
  let studentUserId;
  let versionData;
  if (arg1 && typeof arg1 === 'object' && arg1.studentUserId) {
    studentUserId = arg1.studentUserId;
    versionData = arg1.versionData || arg1;
  } else {
    studentUserId = arg1;
    versionData = arg2 || {};
  }

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

async function listResumeVersions(studentUserId, options = {}) {
  let student = await Student.findOne({ user: studentUserId });
  if (!student) student = await Student.findById(studentUserId);
  if (!student) return { versions: [], count: 0, total: 0, maxVersions: MAX_VERSIONS_PER_STUDENT };

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const total = await ResumeVersion.countDocuments({ student: student._id });
  const versions = await ResumeVersion.find({ student: student._id })
    .select('name targetRole targetCompany targetDrive templateId atsScore baselineScore isDefault createdAt updatedAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    versions,
    count: versions.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    maxVersions: MAX_VERSIONS_PER_STUDENT,
  };
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
  extractComprehensiveWithRules,
  parseEducationSection,
  DEGREE_REGEX,
  INSTITUTION_KEYWORD_REGEX,
  verifySourceFacts,
  loadResumeSource,
  analyzeResumeTarget,
  validateSummaryRewrite,
  validateSummaryRewriteDetailed,
  validateBulletRewrite,
  validateBulletRewriteDetailed,
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
