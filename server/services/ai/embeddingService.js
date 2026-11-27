/**
 * Embedding Service for Semantic Skill Matching.
 * Provides vector embeddings using Gemini API (or deterministic mock vectors in test/offline mode),
 * caches embeddings in MongoDB and in-memory, and computes cosine similarity.
 * Degrades gracefully to 0 similarity (exact matching only) if unavailable.
 */

const mongoose = require('mongoose');
const SkillEmbedding = require('../../models/SkillEmbedding');
const { getGeminiConfig } = require('./aiConfig');

// In-memory LRU cache to avoid repeated DB lookups during batch scoring
const memCache = new Map();
const MAX_MEM_CACHE_SIZE = 2000;

/**
 * Curated semantic taxonomy clusters for deterministic offline similarity
 */
const SEMANTIC_CLUSTERS = [
  ['express', 'rest api', 'restful api', 'api design', 'restful design', 'backend development'],
  ['react', 'frontend development', 'next.js', 'redux', 'web development'],
  ['sql', 'postgresql', 'mysql', 'database management systems', 'dbms', 'relational databases'],
  ['docker', 'containerization', 'kubernetes', 'devops', 'microservices'],
  ['python', 'django', 'flask', 'fastapi', 'backend development'],
  ['java', 'spring boot', 'hibernate', 'microservices', 'object oriented programming'],
  ['machine learning', 'deep learning', 'artificial intelligence', 'data science', 'scikit-learn', 'tensorflow', 'pytorch'],
  ['selenium', 'cypress', 'playwright', 'automated testing', 'qa automation', 'unit testing'],
  ['terraform', 'ansible', 'infrastructure as code', 'cloud infrastructure', 'devops'],
  ['flutter', 'dart', 'react native', 'mobile app development', 'android development', 'ios development'],
  ['tableau', 'power bi', 'business intelligence', 'data visualization', 'reporting'],
  ['html', 'css', 'javascript', 'frontend development', 'web development'],
  ['git', 'github', 'gitlab', 'version control'],
  ['agile', 'scrum', 'kanban', 'sprint planning', 'sdlc'],
  ['aws', 'cloud computing', 'azure', 'google cloud', 'cloud architecture'],
  ['data structures & algorithms', 'dsa', 'algorithms', 'problem solving', 'system design'],
];

/**
 * Generate a deterministic vector for any string (128 dimensions)
 * Injects cluster affinity so related skills have high cosine similarity (>= 0.82)
 */
function generateDeterministicVector(text) {
  const norm = String(text).toLowerCase().trim();
  const dims = 128;
  const vec = new Float64Array(dims);

  // Base pseudorandom hash seed
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  for (let i = 0; i < dims; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^ (h >>> 16)) >>> 0;
    vec[i] = (h / 4294967295) * 2 - 1;
  }

  // Inject cluster bias for known semantic neighbors
  SEMANTIC_CLUSTERS.forEach((cluster, clusterIdx) => {
    const isMember = cluster.some((member) => norm === member || norm.includes(member) || member.includes(norm));
    if (isMember) {
      const clusterOffset = (clusterIdx * 7) % dims;
      for (let k = 0; k < 32; k++) {
        const idx = (clusterOffset + k) % dims;
        vec[idx] += 3.5; // Strong aligned cluster signal
      }
    }
  });

  // Normalize to unit length
  let normSum = 0;
  for (let i = 0; i < dims; i++) normSum += vec[i] * vec[i];
  const mag = Math.sqrt(normSum) || 1;
  const result = [];
  for (let i = 0; i < dims; i++) {
    result.push(Number((vec[i] / mag).toFixed(6)));
  }
  return result;
}

/**
 * Cosine similarity between two numerical vectors
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} similarity score [-1.0, 1.0]
 */
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fetch embedding from Gemini API
 */
async function fetchGeminiEmbedding(text) {
  const geminiConfig = getGeminiConfig();
  if (!geminiConfig.configured) {
    throw new Error('Missing or unconfigured Gemini API key for embeddings');
  }

  const model = geminiConfig.modelEmbedding || 'text-embedding-004';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiConfig.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding API error: ${response.status}`);
  }

  const data = await response.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Invalid embedding response format from Gemini');
  }
  return values;
}

/**
 * Retrieve embedding vector with MongoDB persistence & memory caching
 * @param {string} skill
 * @returns {Promise<number[]>}
 */
async function getSkillEmbedding(skill) {
  if (!skill || typeof skill !== 'string') return [];
  const norm = skill.trim().toLowerCase();
  if (!norm) return [];

  // 1. In-memory cache
  if (memCache.has(norm)) {
    return memCache.get(norm);
  }

  // 2. MongoDB Cache (if connection is ready)
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const doc = await SkillEmbedding.findOne({ skill: norm }).lean();
      if (doc && Array.isArray(doc.embedding) && doc.embedding.length > 0) {
        if (memCache.size < MAX_MEM_CACHE_SIZE) memCache.set(norm, doc.embedding);
        return doc.embedding;
      }
    } catch (_) {}
  }

  // 3. Generate Embedding (Live Gemini or Deterministic fallback)
  let vector = null;
  const geminiConfig = getGeminiConfig();

  if (geminiConfig.configured) {
    try {
      vector = await fetchGeminiEmbedding(norm);
    } catch (apiErr) {
      // Degrade to deterministic fallback vector
      vector = generateDeterministicVector(norm);
    }
  } else {
    vector = generateDeterministicVector(norm);
  }

  // 4. Save to MongoDB & Memory
  if (memCache.size < MAX_MEM_CACHE_SIZE) {
    memCache.set(norm, vector);
  }

  if (mongoose.connection && mongoose.connection.readyState === 1 && vector) {
    try {
      await SkillEmbedding.updateOne(
        { skill: norm },
        { $set: { embedding: vector, dimensions: vector.length } },
        { upsert: true }
      );
    } catch (_) {}
  }

  return vector;
}

/**
 * Compute semantic similarity between two skills [0.0, 1.0]
 * @param {string} skillA
 * @param {string} skillB
 * @returns {Promise<number>}
 */
async function getSkillSimilarity(skillA, skillB) {
  if (!skillA || !skillB) return 0;
  const a = skillA.trim().toLowerCase();
  const b = skillB.trim().toLowerCase();
  if (a === b) return 1.0;

  try {
    const [vecA, vecB] = await Promise.all([getSkillEmbedding(a), getSkillEmbedding(b)]);
    const sim = cosineSimilarity(vecA, vecB);
    return Math.max(0, Math.min(1.0, sim));
  } catch (_) {
    // Graceful degradation: return 0 if similarity computation errors
    return 0;
  }
}

/**
 * Find highest semantic match from candidate skills for a target skill
 * @param {string} targetSkill
 * @param {string[]} candidateSkills
 * @param {number} [threshold=0.80]
 * @returns {Promise<{ matchedSkill: string|null, similarity: number, isMatch: boolean }>}
 */
async function findBestSemanticMatch(targetSkill, candidateSkills = [], threshold = 0.80) {
  if (!targetSkill || !Array.isArray(candidateSkills) || candidateSkills.length === 0) {
    return { matchedSkill: null, similarity: 0, isMatch: false };
  }

  const normTarget = targetSkill.trim().toLowerCase();

  // Check exact match first
  for (const cand of candidateSkills) {
    const normCand = String(cand).trim().toLowerCase();
    if (normCand === normTarget) {
      return { matchedSkill: cand, similarity: 1.0, isMatch: true };
    }
  }

  let bestSkill = null;
  let bestSim = 0;

  for (const cand of candidateSkills) {
    const sim = await getSkillSimilarity(normTarget, cand);
    if (sim > bestSim) {
      bestSim = sim;
      bestSkill = cand;
    }
  }

  return {
    matchedSkill: bestSim >= threshold ? bestSkill : null,
    similarity: bestSim,
    isMatch: bestSim >= threshold,
  };
}

/**
 * Synchronous skill similarity check leveraging in-memory cache and cluster centroids
 * @param {string} skillA
 * @param {string} skillB
 * @returns {number}
 */
function getSkillSimilaritySync(skillA, skillB) {
  if (!skillA || !skillB) return 0;
  const a = skillA.trim().toLowerCase();
  const b = skillB.trim().toLowerCase();
  if (a === b) return 1.0;

  try {
    const vecA = memCache.get(a) || generateDeterministicVector(a);
    const vecB = memCache.get(b) || generateDeterministicVector(b);
    return Math.max(0, Math.min(1.0, cosineSimilarity(vecA, vecB)));
  } catch (_) {
    return 0;
  }
}

module.exports = {
  getSkillEmbedding,
  cosineSimilarity,
  getSkillSimilarity,
  getSkillSimilaritySync,
  findBestSemanticMatch,
  generateDeterministicVector,
};
