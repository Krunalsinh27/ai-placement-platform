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
  matchSkillInText,
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
  getSkillEvidence,
  buildRuleBasedExplanation,
  generateApplicantExplanation,
} = require('./matchingEngine');

const {
  SCORING_VERSION,
  ACTION_VERBS,
  METRICS_REGEX,
  ResumeAnalysisZodSchema,
  computeAtsScore,
  validateBulletRewrite,
  generateRuleBasedAnalysis,
  analyzeResumeAgainstTarget,
  renderResumeDataToText,
  scoreResumeForTarget,
} = require('./resumeAnalyzer');

const {
  analyzeJobDescription,
  extractJdRequirementsWithRules,
  JdAnalysisZodSchema,
  isSkillIndividuallyRequired,
} = require('./jdAnalyzer');

const {
  getSkillEmbedding,
  getSkillSimilarity,
  getSkillSimilaritySync,
  findBestSemanticMatch,
} = require('./embeddingService');

module.exports = {
  // Skills
  SYNONYMS,
  KNOWN_SKILLS,
  SKILL_REGEX,
  isValidSkillName,
  normalizeSkill,
  sanitizeSkillList,
  matchSkillInText,
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
  getSkillEvidence,
  buildRuleBasedExplanation,
  generateApplicantExplanation,

  // Resume Analyzer
  SCORING_VERSION,
  ACTION_VERBS,
  METRICS_REGEX,
  ResumeAnalysisZodSchema,
  computeAtsScore,
  validateBulletRewrite,
  generateRuleBasedAnalysis,
  analyzeResumeAgainstTarget,
  renderResumeDataToText,
  scoreResumeForTarget,

  // JD Analyzer
  analyzeJobDescription,
  extractJdRequirementsWithRules,
  JdAnalysisZodSchema,
  isSkillIndividuallyRequired,

  // Embeddings & Semantic Matching
  getSkillEmbedding,
  getSkillSimilarity,
  getSkillSimilaritySync,
  findBestSemanticMatch,
};

