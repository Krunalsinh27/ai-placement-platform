/**
 * Curated Help Knowledge Base index and keyword matcher.
 */

const { STUDENT_HELP_TOPICS } = require('./student');
const { TPO_HELP_TOPICS } = require('./tpo');
const { RECRUITER_HELP_TOPICS } = require('./recruiter');

function getTopicsForRole(role) {
  const normRole = String(role || '').toLowerCase();
  if (normRole === 'student') return STUDENT_HELP_TOPICS;
  if (normRole === 'recruiter') return RECRUITER_HELP_TOPICS;
  if (normRole === 'tpo' || normRole === 'admin' || normRole === 'superadmin') {
    return TPO_HELP_TOPICS;
  }
  return [];
}

/**
 * Find help topic by exact id within role's allowed topics
 */
function findHelpTopicById(role, topicId) {
  if (!topicId) return null;
  const topics = getTopicsForRole(role);
  return topics.find((t) => t.id === topicId) || null;
}

/**
 * Match help topic by scanning question text for keywords within the role's allowed topics
 */
function matchHelpTopicByKeywords(role, questionText) {
  if (!questionText || typeof questionText !== 'string') return null;
  const q = questionText.toLowerCase().trim();
  const normRole = String(role || '').toLowerCase();
  const topics = getTopicsForRole(normRole);

  // If question is clearly an inquiry about the user's specific records/data, do NOT route to generic help
  if (normRole === 'student') {
    if (
      q.includes('my application') ||
      q.includes('status of my') ||
      q.includes('my upcoming') ||
      q.includes('my interview') ||
      q.includes('when is my interview') ||
      q.includes('what drives can i apply') ||
      q.includes('drives can i apply') ||
      q.includes('am i eligible') ||
      q.includes('eligible for') ||
      q.includes('check my resume') ||
      q.includes('my resume')
    ) {
      return null;
    }
  } else if (normRole === 'recruiter') {
    if (
      q.includes('my drive') ||
      q.includes('my applicant') ||
      q.includes('top candidate') ||
      q.includes('top applicant') ||
      q.includes('my request') ||
      q.includes('recruitment funnel') ||
      q.includes('applicant funnel')
    ) {
      return null;
    }
  } else {
    // TPO / Superadmin
    if (
      q.includes('placement summary') ||
      q.includes('overall summary') ||
      q.includes('unplaced') ||
      q.includes('company stats') ||
      q.includes('offer status') ||
      q.includes('students with') ||
      q.includes('without resume') ||
      q.includes('top package') ||
      q.includes('top 5 package') ||
      q.includes('funnel for') ||
      q.includes('breakdown by')
    ) {
      return null;
    }
  }

  const isHelpQuery =
    q.includes('how to') ||
    q.includes('how do i') ||
    q.includes('how can i') ||
    q.includes('what does') ||
    q.includes('can i') ||
    q.includes('steps to') ||
    q.includes('guide') ||
    q.includes('help') ||
    q.includes('explain how') ||
    q.includes('where do i');

  const qNormalized = q.replace(/\b(a|an|the)\b/gi, ' ').replace(/\s+/g, ' ');

  let bestMatch = null;
  let highestScore = 0;

  for (const topic of topics) {
    let score = 0;
    // Check if topic id or title is directly mentioned
    if (q.includes(topic.id)) score += 15;
    if (q.includes(topic.title.toLowerCase()) || qNormalized.includes(topic.title.toLowerCase())) score += 12;

    for (const kw of topic.keywords) {
      const kwLower = kw.toLowerCase();
      const kwNorm = kwLower.replace(/\b(a|an|the)\b/gi, ' ').replace(/\s+/g, ' ');
      const isMultiWord = kwLower.includes(' ');

      if (isMultiWord) {
        if (q.includes(kwLower) || qNormalized.includes(kwNorm)) {
          score += 8;
        }
      } else {
        // Whole-word regex for single word keyword
        const regex = new RegExp(`\\b${kwLower}\\b`, 'i');
        if (regex.test(q)) {
          score += 3;
        }
      }
    }

    if (isHelpQuery && score > 0) {
      score += 5;
    }

    if (score > highestScore && score >= 5) {
      highestScore = score;
      bestMatch = topic;
    }
  }

  return bestMatch;
}

module.exports = {
  STUDENT_HELP_TOPICS,
  TPO_HELP_TOPICS,
  RECRUITER_HELP_TOPICS,
  getTopicsForRole,
  findHelpTopicById,
  matchHelpTopicByKeywords,
};
