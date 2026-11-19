/**
 * AI Feature Flags Manager
 *
 * Controls availability of individual AI capabilities via granular environment variables.
 * Defaults to true unless explicitly disabled with 'false' or '0'.
 */

const FEATURE_ENV_MAP = {
  resume_parse: 'AI_FEATURE_RESUME_PARSE',
  resume_analyze: 'AI_FEATURE_RESUME_ANALYZE',
  assistant: 'AI_FEATURE_ASSISTANT',
  mock_interview: 'AI_FEATURE_MOCK_INTERVIEW',
  resume_builder: 'AI_FEATURE_RESUME_BUILDER',
  recommendations: 'AI_FEATURE_RECOMMENDATIONS',
  skill_gap: 'AI_FEATURE_SKILL_GAP',
  tpo_insights: 'AI_FEATURE_TPO_INSIGHTS',
};

/**
 * Checks if a specific AI feature is enabled
 *
 * @param {string} featureName - One of the keys in FEATURE_ENV_MAP
 * @returns {boolean}
 */
function isAiFeatureEnabled(featureName) {
  const normKey = (featureName || '').toLowerCase().trim();
  const envVar = FEATURE_ENV_MAP[normKey];

  if (!envVar) {
    return true; // Default enabled for unrecognized feature tags
  }

  const val = process.env[envVar];
  if (val === undefined || val === null || val === '') {
    return true; // Default true when unset
  }

  const valLower = String(val).toLowerCase().trim();
  return valLower !== 'false' && valLower !== '0' && valLower !== 'disabled';
}

/**
 * Returns current status of all AI feature flags
 */
function getAllAiFeatureFlags() {
  const result = {};
  for (const [feat, envKey] of Object.entries(FEATURE_ENV_MAP)) {
    result[feat] = {
      enabled: isAiFeatureEnabled(feat),
      envVar: envKey,
      currentValue: process.env[envKey] ?? 'true (default)',
    };
  }
  return result;
}

module.exports = {
  isAiFeatureEnabled,
  getAllAiFeatureFlags,
  FEATURE_ENV_MAP,
};
