/**
 * Master export for AI Service Layer
 */

const {
  SYNONYMS,
  KNOWN_SKILLS,
  SKILL_REGEX,
  isValidSkillName,
  normalizeSkill,
  sanitizeSkillList,
  extractSkillsFromText,
} = require('./skillsDictionary');

const { redactPII } = require('./redactor');

const {
  getActiveProviderName,
  getProvider,
  isAiConfigured,
  callAiWithQuotaAndRetry,
} = require('./aiClient');

const {
  extractResumeText,
  defaultExtractor,
  computeBufferHash,
  streamToBuffer,
} = require('./resumeTextExtractor');

const {
  parseStudentResume,
  extractWithRules,
  ResumeProfileZodSchema,
} = require('./resumeParser');

const {
  computeMatchScore,
  normalizeSkillList,
  buildRuleBasedExplanation,
  generateApplicantExplanation,
} = require('./matchingEngine');

module.exports = {
  // Skills
  SYNONYMS,
  KNOWN_SKILLS,
  SKILL_REGEX,
  isValidSkillName,
  normalizeSkill,
  sanitizeSkillList,
  extractSkillsFromText,

  // Redaction
  redactPII,

  // Client & Provider
  getActiveProviderName,
  getProvider,
  isAiConfigured,
  callAiWithQuotaAndRetry,

  // Resume Text Extraction
  extractResumeText,
  defaultExtractor,
  computeBufferHash,
  streamToBuffer,

  // Resume Parser
  parseStudentResume,
  extractWithRules,
  ResumeProfileZodSchema,

  // Matching Engine
  computeMatchScore,
  normalizeSkillList,
  buildRuleBasedExplanation,
  generateApplicantExplanation,
};

