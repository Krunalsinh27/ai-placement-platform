/**
 * Resume Studio Suggestion Service
 *
 * Provides targeted AI polishing and rewriting for:
 * 1. Summary ('summary') - tailored summary rewrite maintaining all verified facts
 * 2. Bullets ('bullet') - action-verb led rewrite with quantifiable impact placeholders
 * 3. Skills ('skills') - relevancy reordering without introducing unlisted skills
 *
 * Strict Grounding & Anti-Hallucination Guarantees:
 * - Employs tokenMasker to anonymize PII before external LLM dispatch
 * - Validates suggested bullets with validateBulletRewriteDetailed
 * - Validates suggested summary with validateSummaryRewriteDetailed
 * - Rejects any invented skills, employers, or concrete unverified numbers
 * - Enforces daily user quota via AiUsage under mode 'tailor'
 */

const { AiUsage } = require('../../models');
const { callAiWithQuotaAndRetry } = require('../ai/aiClient');
const { tokenizeText, detokenize } = require('../resumeBuilder/tokenMasker');
const {
  validateBulletRewriteDetailed,
  validateSummaryRewriteDetailed,
} = require('../resumeBuilder/resumeBuilderService');

/**
 * Builds candidate profile corpus and context sets for validation
 */
function buildCorpusAndContext(resumeData = {}) {
  const parts = [];
  const candidateSkillsSet = new Set();
  const knownEmployers = [];
  const existingBullets = [];

  // Skills
  if (Array.isArray(resumeData.skills)) {
    for (const cat of resumeData.skills) {
      if (typeof cat === 'string') {
        const s = cat.toLowerCase().trim();
        if (s) {
          candidateSkillsSet.add(s);
          parts.push(cat);
        }
      } else if (cat && Array.isArray(cat.items)) {
        for (const item of cat.items) {
          if (item && typeof item === 'string') {
            const s = item.toLowerCase().trim();
            if (s) {
              candidateSkillsSet.add(s);
              parts.push(item);
            }
          }
        }
      }
    }
  }

  // Experience
  if (Array.isArray(resumeData.experience)) {
    for (const exp of resumeData.experience) {
      if (exp.company) {
        knownEmployers.push(exp.company);
        parts.push(exp.company);
      }
      if (exp.title) parts.push(exp.title);
      if (exp.location) parts.push(exp.location);
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          if (b && typeof b === 'string' && b.trim()) {
            existingBullets.push(b.trim());
            parts.push(b.trim());
          }
        }
      }
    }
  }

  // Projects
  if (Array.isArray(resumeData.projects)) {
    for (const proj of resumeData.projects) {
      if (proj.title) parts.push(proj.title);
      if (proj.technologies) {
        const techStr = Array.isArray(proj.technologies) ? proj.technologies.join(' ') : String(proj.technologies);
        parts.push(techStr);
      }
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) {
          if (b && typeof b === 'string' && b.trim()) {
            existingBullets.push(b.trim());
            parts.push(b.trim());
          }
        }
      }
    }
  }

  // Education
  if (Array.isArray(resumeData.education)) {
    for (const edu of resumeData.education) {
      if (edu.institution) parts.push(edu.institution);
      if (edu.degree) parts.push(edu.degree);
      if (edu.fieldOfStudy) parts.push(edu.fieldOfStudy);
    }
  }

  const resumeCorpus = parts.join(' ');
  return { resumeCorpus, candidateSkillsSet, knownEmployers, existingBullets };
}

/**
 * Checks and increments AI quota usage for user
 */
async function checkAndIncrementAiUsage(userId, role = 'student') {
  const quotaCheck = await AiUsage.canMakeCall(userId, 'tailor', role);
  if (!quotaCheck.allowed) {
    const err = new Error(quotaCheck.message || 'Daily resume AI quota reached. Please try again tomorrow.');
    err.status = 429;
    err.statusCode = 429;
    throw err;
  }
}

/**
 * Main Suggestion Generator
 */
async function generateSuggestion(resumeDoc, payload, user, options = {}) {
  const { signal = null, isAborted = null } = options;
  const resumeData = resumeDoc.data || {};
  const { type, section, itemIndex, bulletIndex, originalText, targetRole, jdText } = payload;

  // 1. Quota Check
  await checkAndIncrementAiUsage(user._id, user.role || 'student');

  // 2. Extract Corpus & Context
  const { resumeCorpus, candidateSkillsSet, knownEmployers, existingBullets } = buildCorpusAndContext(resumeData);

  // Hints for PII token masking
  const piiHints = {
    emails: resumeData.contact?.email ? [resumeData.contact.email] : [],
    phones: resumeData.contact?.phone ? [resumeData.contact.phone] : [],
    urls: [
      resumeData.contact?.linkedin,
      resumeData.contact?.github,
      resumeData.contact?.portfolio,
    ].filter(Boolean),
  };

  let result = null;

  if (type === 'bullet') {
    // Determine target bullet text
    let originalBullet = (originalText || '').trim();
    let entryContext = '';

    const targetSection = section || 'experience';
    const items = Array.isArray(resumeData[targetSection]) ? resumeData[targetSection] : [];
    const item = typeof itemIndex === 'number' && items[itemIndex] ? items[itemIndex] : null;

    if (item) {
      entryContext = [item.title, item.company, item.technologies ? (Array.isArray(item.technologies) ? item.technologies.join(' ') : item.technologies) : '']
        .filter(Boolean)
        .join(' ');

      if (!originalBullet && Array.isArray(item.bullets) && typeof bulletIndex === 'number' && item.bullets[bulletIndex]) {
        originalBullet = item.bullets[bulletIndex].trim();
      }
    }

    if (!originalBullet) {
      const err = new Error('Original bullet text is required for rewrite');
      err.status = 400;
      throw err;
    }

    // Ensure bullet is recognized in existing bullets
    if (!existingBullets.some((b) => b.toLowerCase().includes(originalBullet.toLowerCase()) || originalBullet.toLowerCase().includes(b.toLowerCase()))) {
      existingBullets.push(originalBullet);
    }

    const systemPrompt = `You are an expert resume writer. Rewrite the provided single resume bullet to lead with a decisive action verb, highlight quantifiable impact, and align with ATS standards.
STRICT ANTI-HALLUCINATION RULES:
1. NEVER invent any companies, projects, tools, metrics, percentages, dates, or degrees not present in the candidate's bullet or entry context.
2. If measurable impact is implied but no number is present, insert '[add your real number]' or '[add your real number]%' placeholder instead of fabricating numbers.
3. Keep the content truthful and grounded in the source text.
4. Return ONLY valid JSON formatted as: {"proposed": "...", "explanation": "..."}`;

    const rawUserPrompt = `Target Role: ${targetRole || 'Software Engineer'}
Entry Context: ${entryContext || 'None'}
Original Bullet: "${originalBullet}"`;

    const { tokenizedText, tokenMap } = tokenizeText(rawUserPrompt, piiHints);

    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt,
      userPrompt: tokenizedText,
      mode: 'tailor',
      userId: user._id,
      skipQuota: true, // Quota checked upfront, recorded on validation success
      abortSignal: signal,
      isAborted,
    });

    if (!aiRes.success) {
      const err = new Error(aiRes.error || 'AI suggestion failed');
      err.status = aiRes.status === 'rate_limited' ? 429 : 502;
      throw err;
    }

    let parsed = aiRes.data;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        const err = new Error('Failed to parse AI suggestion response');
        err.status = 502;
        throw err;
      }
    }

    let proposed = parsed.proposed || parsed.suggested || '';
    if (typeof proposed !== 'string' || !proposed.trim()) {
      const err = new Error('AI returned an empty suggestion');
      err.status = 502;
      throw err;
    }

    // Restore any masked tokens
    proposed = detokenize(proposed.trim(), tokenMap);

    // Validate proposed bullet strictly
    const validation = validateBulletRewriteDetailed(
      { original: originalBullet, suggested: proposed },
      resumeCorpus,
      candidateSkillsSet,
      existingBullets,
      entryContext
    );

    if (!validation.valid) {
      const err = new Error(`AI suggestion failed anti-hallucination verification: ${validation.reasonCodes.join(', ')}`);
      err.status = 422;
      err.reasonCodes = validation.reasonCodes;
      err.items = validation.items;
      throw err;
    }

    result = {
      type: 'bullet',
      target: {
        section: targetSection,
        itemIndex: typeof itemIndex === 'number' ? itemIndex : null,
        bulletIndex: typeof bulletIndex === 'number' ? bulletIndex : null,
      },
      original: originalBullet,
      proposed,
      reasonCodes: validation.reasonCodes,
      explanation: parsed.explanation || 'Polished phrasing with active impact and professional verbs.',
    };
  } else if (type === 'summary') {
    let originalSummary = (originalText || resumeData.summary || '').trim();
    if (!originalSummary) {
      originalSummary = 'Aspiring professional seeking opportunities to leverage technical skills in software engineering.';
    }

    const systemPrompt = `You are an expert resume writer. Rewrite the professional summary to be concise, impactful, and tailored to the target role.
STRICT ANTI-HALLUCINATION RULES:
1. NEVER invent any companies, degrees, tools, metrics, or achievements.
2. Retain all existing numbers, GPA, years of experience, and platform achievements (e.g. LeetCode, CodeChef) from the original summary.
3. Return ONLY valid JSON formatted as: {"proposed": "...", "explanation": "..."}`;

    const rawUserPrompt = `Target Role: ${targetRole || 'Software Engineer'}
Original Summary: "${originalSummary}"
Resume Highlights: ${resumeCorpus.slice(0, 500)}`;

    const { tokenizedText, tokenMap } = tokenizeText(rawUserPrompt, piiHints);

    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt,
      userPrompt: tokenizedText,
      mode: 'tailor',
      userId: user._id,
      skipQuota: true,
      abortSignal: signal,
      isAborted,
    });

    if (!aiRes.success) {
      const err = new Error(aiRes.error || 'AI suggestion failed');
      err.status = aiRes.status === 'rate_limited' ? 429 : 502;
      throw err;
    }

    let parsed = aiRes.data;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        const err = new Error('Failed to parse AI suggestion response');
        err.status = 502;
        throw err;
      }
    }

    let proposed = parsed.proposed || parsed.suggested || parsed.summary || '';
    if (typeof proposed !== 'string' || !proposed.trim()) {
      const err = new Error('AI returned an empty summary suggestion');
      err.status = 502;
      throw err;
    }

    proposed = detokenize(proposed.trim(), tokenMap);

    const validation = validateSummaryRewriteDetailed(
      proposed,
      originalSummary,
      resumeCorpus,
      candidateSkillsSet,
      knownEmployers
    );

    if (!validation.valid) {
      const err = new Error(`AI suggestion failed anti-hallucination verification: ${validation.reasonCodes.join(', ')}`);
      err.status = 422;
      err.reasonCodes = validation.reasonCodes;
      err.items = validation.items;
      throw err;
    }

    result = {
      type: 'summary',
      target: {
        section: 'summary',
        itemIndex: null,
        bulletIndex: null,
      },
      original: originalSummary,
      proposed,
      reasonCodes: validation.reasonCodes,
      explanation: parsed.explanation || 'Refined summary with strong positioning for target role.',
    };
  } else if (type === 'skills') {
    const originalSkills = Array.isArray(resumeData.skills) ? resumeData.skills : [];
    if (originalSkills.length === 0) {
      const err = new Error('Cannot optimize skills: no skills found in resume');
      err.status = 400;
      throw err;
    }

    const systemPrompt = `You are an expert resume writer. Reorder the candidate's existing technical skills categories and items to highlight relevance for the target role or job description.
CRITICAL RULES:
1. NEVER add any new skills, tools, or libraries not already present in the candidate's skills list.
2. Keep only the existing skills, reordering them so the most relevant appear first.
3. Return ONLY valid JSON formatted as: {"proposed": [{"category": "...", "items": ["..."]}], "explanation": "..."}`;

    const rawUserPrompt = `Target Role: ${targetRole || 'Software Engineer'}
Target Job Description: ${jdText || 'Standard software engineering competencies'}
Candidate Existing Skills: ${JSON.stringify(originalSkills)}`;

    const { tokenizedText } = tokenizeText(rawUserPrompt, piiHints);

    const aiRes = await callAiWithQuotaAndRetry({
      systemPrompt,
      userPrompt: tokenizedText,
      mode: 'tailor',
      userId: user._id,
      skipQuota: true,
      abortSignal: signal,
      isAborted,
    });

    if (!aiRes.success) {
      const err = new Error(aiRes.error || 'AI suggestion failed');
      err.status = aiRes.status === 'rate_limited' ? 429 : 502;
      throw err;
    }

    let parsed = aiRes.data;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        const err = new Error('Failed to parse AI suggestion response');
        err.status = 502;
        throw err;
      }
    }

    const proposedSkills = parsed.proposed || parsed.skills || [];
    if (!Array.isArray(proposedSkills) || proposedSkills.length === 0) {
      const err = new Error('AI returned an invalid skills structure');
      err.status = 502;
      throw err;
    }

    // Anti-hallucination check: NO invented skills allowed
    const originalSkillItems = new Set();
    for (const cat of originalSkills) {
      const items = Array.isArray(cat.items) ? cat.items : typeof cat === 'string' ? [cat] : [];
      for (const item of items) {
        if (item) originalSkillItems.add(String(item).toLowerCase().trim());
      }
    }

    const inventedSkills = [];
    for (const cat of proposedSkills) {
      const items = Array.isArray(cat.items) ? cat.items : [];
      for (const item of items) {
        if (item && !originalSkillItems.has(String(item).toLowerCase().trim())) {
          inventedSkills.push(String(item).trim());
        }
      }
    }

    if (inventedSkills.length > 0) {
      const err = new Error(`AI suggestion invented skills not in candidate profile: ${inventedSkills.join(', ')}`);
      err.status = 422;
      err.reasonCodes = ['invented_skills'];
      err.items = inventedSkills;
      throw err;
    }

    result = {
      type: 'skills',
      target: {
        section: 'skills',
        itemIndex: null,
        bulletIndex: null,
      },
      original: originalSkills,
      proposed: proposedSkills,
      reasonCodes: [],
      explanation: parsed.explanation || 'Reordered skills to emphasize relevant competencies first.',
    };
  } else {
    const err = new Error(`Unsupported suggestion type: ${type}`);
    err.status = 400;
    throw err;
  }

  // Record successful AI call against user's daily quota
  try {
    await AiUsage.recordCall(user._id, 'tailor');
  } catch (recErr) {
    console.warn('[SuggestionService] Failed to record AI usage:', recErr.message);
  }

  return {
    success: true,
    ...result,
  };
}

module.exports = {
  buildCorpusAndContext,
  checkAndIncrementAiUsage,
  generateSuggestion,
};
