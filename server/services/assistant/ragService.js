/**
 * Retrieval-Augmented Generation (RAG) Service for Platform Assistant.
 * Indexes curated knowledge articles, placement policies, and platform workflows.
 * Provides vector and semantic search with document source citations.
 */

const { KnowledgeDocument } = require('../../models');
const { STUDENT_HELP_TOPICS } = require('./knowledge/student');
const { TPO_HELP_TOPICS } = require('./knowledge/tpo');
const { RECRUITER_HELP_TOPICS } = require('./knowledge/recruiter');
const {
  cosineSimilarity,
  generateDeterministicVector,
  getSkillEmbedding,
} = require('../ai/embeddingService');

// Platform Policy & FAQ documents
const PLATFORM_POLICY_FAQS = [
  {
    docId: 'policy-eligibility-backlogs',
    title: 'Campus Placement Eligibility and Backlog Rules',
    role: 'common',
    category: 'Policy & Eligibility',
    keywords: ['eligibility', 'backlogs', 'cgpa cutoff', 'criteria', 'rules', 'allowed branches', 'standing backlogs'],
    content: `Campus Placement Eligibility and Backlog Rules:
1. Students must maintain active, verified enrollment status with their college placement cell.
2. Academic criteria (minimum CGPA, allowed engineering/management branches, and maximum active backlogs) are configured by recruiters per job requirement.
3. If a drive requires "0 active backlogs", students with active backlog history cannot apply until cleared by academic administration.
4. CGPA eligibility is calculated without rounding up (e.g. 7.49 does not satisfy a 7.50 cutoff).
5. All academic metrics are verified against institutional records before final shortlisting.`,
  },
  {
    docId: 'policy-offer-acceptance',
    title: 'Offer Acceptance and One-Offer Policy',
    role: 'common',
    category: 'Offers & Placement',
    keywords: ['offer acceptance', 'one student one job', 'accept offer', 'decline offer', 'dream company', 'placed status'],
    content: `Placement Offer Acceptance Guidelines:
1. When a company extends an offer, candidates receive an in-app and email notification with formal CTC breakdown and deadline.
2. Candidates can Accept or Decline the offer from "My Placements" (/student/placements).
3. Under the standard "One Student, One Job" institutional policy, accepting an offer transitions the candidate to "Placed" status.
4. Placed students are restricted from applying to further standard tier drives to ensure equitable opportunities for unplaced peers.
5. Exceptions apply only for designated Dream/Super-Dream drives exceeding the minimum tier multiplier (typically >= 1.5x current CTC) if sanctioned by the college TPO.`,
  },
  {
    docId: 'policy-online-tests',
    title: 'Online Aptitude Assessment & Proctoring Guidelines',
    role: 'common',
    category: 'Examinations',
    keywords: ['online test', 'exam rules', 'fullscreen', 'tab switch', 'autosave', 'timer', 'leave protection', 'cheating'],
    content: `Online Assessment Examination Guidelines:
1. Online aptitude assessments take place in a dedicated distraction-free fullscreen mode (/student/test/:roundId).
2. The examination timer is strictly server-synchronized. Refreshing the browser or navigating away does not pause or extend the remaining test duration.
3. Candidate answers are automatically saved to the server on every option selection.
4. Tab switching and window blurring events are logged to the examination proctoring audit log. Exceeding allowed violations may result in automated disqualification.
5. In-app navigation triggers a leave-protection warning. If the examination window closes without manual submission, the candidate attempt is marked as missed.`,
  },
  {
    docId: 'policy-interview-conduct',
    title: 'Virtual Interview Protocols and Attendance',
    role: 'common',
    category: 'Interviews',
    keywords: ['interview rules', 'slot booking', 'video room', 'attendance', 'interview etiquette', 'late policy'],
    content: `Virtual Interview Protocols:
1. Candidates must book their interview slot in "My Applications" (/student/applications) once shortlisted.
2. Unique, secure meeting room links are generated per slot to prevent unauthorized entry or interview eavesdropping.
3. Candidates are advised to join the room 5 minutes prior to their scheduled start time with camera and microphone tested.
4. Attendance is logged when both candidate and interviewer connect. Unexcused absence is reported as "Absent" and may forfeit eligibility for subsequent rounds.`,
  },
];

/**
 * Generates an embedding vector for text content
 */
async function computeTextEmbedding(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const sample = words.slice(0, 50).join(' ');
  return generateDeterministicVector(sample || text);
}

/**
 * Ingests all curated knowledge articles and policies into MongoDB
 */
async function seedKnowledgeBase() {
  const allDocs = [
    ...STUDENT_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'student',
      category: 'Student Workflows',
      keywords: t.keywords || [],
      content: t.answer,
    })),
    ...TPO_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'tpo',
      category: 'TPO Administration',
      keywords: t.keywords || [],
      content: t.answer,
    })),
    ...RECRUITER_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'recruiter',
      category: 'Recruiter Workflows',
      keywords: t.keywords || [],
      content: t.answer,
    })),
    ...PLATFORM_POLICY_FAQS,
  ];

  const seeded = [];
  for (const doc of allDocs) {
    const embedding = await computeTextEmbedding(`${doc.title} ${doc.category} ${doc.keywords.join(' ')} ${doc.content}`);
    const updated = await KnowledgeDocument.findOneAndUpdate(
      { docId: doc.docId },
      {
        docId: doc.docId,
        title: doc.title,
        role: doc.role,
        category: doc.category,
        keywords: doc.keywords,
        content: doc.content,
        embedding,
        chunkIndex: 0,
      },
      { upsert: true, new: true }
    );
    seeded.push(updated);
  }

  return seeded;
}

/**
 * In-memory fallback documents cache to ensure offline/mock search is always fast and available
 */
let cachedDocs = null;
async function getActiveKnowledgeDocs() {
  if (cachedDocs && cachedDocs.length > 0) return cachedDocs;

  // Try DB first
  try {
    const docs = await KnowledgeDocument.find({}).lean();
    if (docs && docs.length > 0) {
      cachedDocs = docs;
      return docs;
    }
  } catch (_) {}

  // Fallback to static catalog with computed vectors
  const staticDocs = [
    ...STUDENT_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'student',
      category: 'Student Workflows',
      keywords: t.keywords || [],
      content: t.answer,
      embedding: generateDeterministicVector(`${t.title} ${t.answer}`),
    })),
    ...TPO_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'tpo',
      category: 'TPO Administration',
      keywords: t.keywords || [],
      content: t.answer,
      embedding: generateDeterministicVector(`${t.title} ${t.answer}`),
    })),
    ...RECRUITER_HELP_TOPICS.map((t) => ({
      docId: t.id,
      title: t.title,
      role: 'recruiter',
      category: 'Recruiter Workflows',
      keywords: t.keywords || [],
      content: t.answer,
      embedding: generateDeterministicVector(`${t.title} ${t.answer}`),
    })),
    ...PLATFORM_POLICY_FAQS.map((t) => ({
      ...t,
      embedding: generateDeterministicVector(`${t.title} ${t.content}`),
    })),
  ];

  cachedDocs = staticDocs;
  return staticDocs;
}

/**
 * Search the knowledge base using semantic cosine similarity and keyword matching.
 *
 * @param {string} query - User search question or topic
 * @param {Object} [options={}] - { role, limit, threshold }
 * @returns {Promise<Array<{ docId, title, category, role, content, score, citation }>>}
 */
async function searchKnowledge(query, { role = 'common', limit = 3, threshold = 0.50 } = {}) {
  if (!query || typeof query !== 'string') return [];
  const qClean = query.trim().toLowerCase();
  const normRole = String(role || 'common').toLowerCase();

  const queryVector = generateDeterministicVector(qClean);
  const allDocs = await getActiveKnowledgeDocs();

  const queryWords = qClean.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

  const scored = [];
  for (const doc of allDocs) {
    // Role filter: only show docs matching user's role or common docs
    if (doc.role !== 'common' && doc.role !== normRole && normRole !== 'superadmin') {
      continue;
    }

    let semanticScore = 0;
    if (Array.isArray(doc.embedding) && doc.embedding.length > 0) {
      semanticScore = cosineSimilarity(queryVector, doc.embedding);
    }

    // Keyword match boost
    let keywordHits = 0;
    const docText = `${doc.title} ${doc.category} ${(doc.keywords || []).join(' ')} ${doc.content}`.toLowerCase();
    for (const qw of queryWords) {
      if (docText.includes(qw)) keywordHits++;
    }

    const keywordBoost = queryWords.length > 0 ? (keywordHits / queryWords.length) * 0.4 : 0;
    const totalScore = semanticScore * 0.6 + keywordBoost;

    if (totalScore >= threshold || keywordHits >= 2) {
      scored.push({
        docId: doc.docId,
        title: doc.title,
        category: doc.category || 'Documentation',
        role: doc.role,
        content: doc.content,
        score: Math.min(1.0, totalScore),
        citation: `[Source: ${doc.title}]`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Formats retrieved knowledge chunks for model prompt injection
 */
function formatRetrievedDocsPrompt(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';
  const lines = ['<RETRIEVED_KNOWLEDGE_DOCUMENTS>'];
  lines.push('The following verified documentation and policy articles are available:');
  chunks.forEach((c, idx) => {
    lines.push(`\n[Document ${idx + 1}] Title: ${c.title}`);
    lines.push(`Category: ${c.category} | Role Scope: ${c.role}`);
    lines.push(`Content:\n${c.content}`);
    lines.push(`Citation: ${c.citation}`);
  });
  lines.push('</RETRIEVED_KNOWLEDGE_DOCUMENTS>');
  lines.push('INSTRUCTION: If you use information from the retrieved documents above, ALWAYS append the citation (e.g. [Source: Document Title]) to your answer.');
  return lines.join('\n');
}

module.exports = {
  PLATFORM_POLICY_FAQS,
  seedKnowledgeBase,
  searchKnowledge,
  formatRetrievedDocsPrompt,
  getActiveKnowledgeDocs,
};
