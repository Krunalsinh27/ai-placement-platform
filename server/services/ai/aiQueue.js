/**
 * Asynchronous AI Job Queue Manager
 *
 * Dispatches heavy AI operations (resume parsing, ATS deep analysis, mock interview scoring)
 * to BullMQ background workers with status polling, preventing HTTP request timeouts.
 *
 * Hardened Architecture (Phase 0 Step 6):
 * - Jobs are pushed to BullMQ queue 'ai-jobs' with bounded exponential retry (2 attempts).
 * - Synchronous fallback in API process is completely removed for heavy AI workloads.
 * - If Redis/BullMQ is unavailable, returns structured { queued: false, status: 'unavailable', code: 'QUEUE_UNAVAILABLE' }.
 * - Deterministic, tenant-aware job IDs prevent duplicate concurrent jobs (using hyphens ONLY, no colons).
 * - Completed/failed jobs have bounded retention by both age and count.
 * - Raw resumes, raw JD texts, credentials, and unnecessary PII are not persisted in Redis payloads.
 */

const crypto = require('crypto');
const { isRedisConfigured, getRedisClient, getBullPrefix } = require('../../config/redis');

let aiQueue = null;
let testMockQueue = null;

const AI_QUEUE_NAME = 'ai-jobs';
const ALLOWED_JOB_TYPES = ['resume_parse', 'resume_analyze', 'mock_interview_eval'];

/**
 * Lazily initializes and returns the BullMQ 'ai-jobs' Queue
 */
function getAiQueue() {
  if (testMockQueue) {
    return testMockQueue;
  }

  if (!isRedisConfigured()) {
    return null;
  }

  if (!aiQueue) {
    const { Queue } = require('bullmq');
    aiQueue = new Queue(AI_QUEUE_NAME, {
      connection: getRedisClient(),
      prefix: getBullPrefix(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 3600, count: 1000 }, // Keep completed jobs for 1 hour, max 1000 jobs
        removeOnFail: { age: 86400, count: 5000 },    // Keep failed jobs for 24 hours, max 5000 jobs
      },
    });
  }

  return aiQueue;
}

/**
 * Generate a deterministic, tenant-aware BullMQ job ID.
 *
 * SECURITY & FORMAT RULES:
 * - Hyphens ONLY as separators (BullMQ internally reserves colons `:` for Redis keys).
 * - Must be tenant-aware (incorporates collegeId and userId).
 * - Must NOT contain raw resume text, candidate names, or sensitive credentials.
 *
 * @param {string} type
 * @param {string|null} collegeId
 * @param {string|null} userId
 * @param {Object} payload
 * @returns {string} Safe BullMQ jobId
 */
function generateAiJobId(type, collegeId = null, userId = null, payload = {}) {
  const normType = String(type || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const tenantStr = collegeId ? String(collegeId).replace(/[^a-zA-Z0-9_-]/g, '') : 'global';
  const userStr = userId ? String(userId).replace(/[^a-zA-Z0-9_-]/g, '') : 'anon';

  // Build a minimal, sanitized fingerprint object without raw text or credentials
  let fingerprintKey = {};
  if (type === 'resume_parse') {
    fingerprintKey = {
      studentId: payload.studentId || null,
      force: Boolean(payload.force),
      textHash: payload.text ? crypto.createHash('sha256').update(String(payload.text)).digest('hex').slice(0, 12) : null,
    };
  } else if (type === 'resume_analyze') {
    fingerprintKey = {
      studentId: payload.studentId || null,
      driveId: payload.driveId || null,
      jdHash: payload.rawJdText || payload.jdText
        ? crypto.createHash('sha256').update(String(payload.rawJdText || payload.jdText)).digest('hex').slice(0, 12)
        : null,
      skillsHash: Array.isArray(payload.candidateSkills)
        ? crypto.createHash('sha256').update(payload.candidateSkills.slice().sort().join(',')).digest('hex').slice(0, 8)
        : null,
      force: Boolean(payload.force),
    };
  } else if (type === 'mock_interview_eval') {
    fingerprintKey = {
      sessionId: payload.sessionId || null,
      questionId: payload.question?._id || payload.questionId || null,
      intType: payload.type || 'technical',
      answerHash: payload.answer ? crypto.createHash('sha256').update(String(payload.answer)).digest('hex').slice(0, 12) : null,
    };
  } else {
    fingerprintKey = { ts: Date.now() };
  }

  const hash = crypto.createHash('sha256').update(JSON.stringify(fingerprintKey)).digest('hex').slice(0, 16);
  // Example: ai-resume_parse-67123abc-67456def-a1b2c3d4e5f67890
  return `ai-${normType}-${tenantStr}-${userStr}-${hash}`;
}

/**
 * Sanitize job payload before persisting in BullMQ Redis.
 * Avoids storing unbounded raw document texts or credentials.
 */
function sanitizeJobPayload(type, payload = {}) {
  const sanitized = { ...payload };

  // Never store secrets or auth tokens in job data
  delete sanitized.token;
  delete sanitized.password;
  delete sanitized.apiKey;
  delete sanitized.authorization;

  // For resume parsing, store studentId/userId reference rather than 50KB strings where possible
  if (type === 'resume_parse' && sanitized.text && sanitized.text.length > 500) {
    sanitized.textHash = crypto.createHash('sha256').update(sanitized.text).digest('hex');
    // Store only reference preview if studentId is present
    if (sanitized.studentId) {
      delete sanitized.text;
    } else {
      sanitized.text = sanitized.text.slice(0, 1000); // Bounded preview
    }
  }

  // For ATS analysis, do not store huge raw JD strings if driveId is present
  if (type === 'resume_analyze' && (sanitized.rawJdText || sanitized.jdText)) {
    const raw = sanitized.rawJdText || sanitized.jdText;
    sanitized.jdHash = crypto.createHash('sha256').update(raw).digest('hex');
    if (sanitized.driveId) {
      delete sanitized.rawJdText;
      delete sanitized.jdText;
    } else if (raw.length > 1000) {
      sanitized.rawJdText = raw.slice(0, 1000);
      delete sanitized.jdText;
    }
  }

  return sanitized;
}

/**
 * Directly processes an AI job in-process.
 * Strictly used by BullMQ worker processes or explicit test mocks.
 * NEVER called as synchronous fallback in API request threads.
 */
async function processAiJobDirectly(type, payload = {}, userId = null, collegeId = null) {
  switch (type) {
    case 'resume_parse': {
      const { parseResumeText, extractWithRules } = require('./resumeAnalyzer');
      let text = payload.text || '';
      // If student reference is provided, fetch resume from DB if text was pruned
      if (!text && payload.studentId) {
        const Student = require('../../models/Student');
        const student = await Student.findById(payload.studentId);
        if (student && collegeId && student.college && String(student.college) !== String(collegeId)) {
          throw new Error('Tenant isolation violation: student does not belong to specified college');
        }
        if (student?.resumeProfile?.summary) {
          text = student.resumeProfile.summary;
        }
      }
      let parsed;
      try {
        parsed = await parseResumeText(text, userId);
      } catch {
        parsed = extractWithRules(text);
      }
      return parsed;
    }

    case 'resume_analyze': {
      const { computeAtsScore } = require('./resumeAnalyzer');
      const { candidateSkills = [], targetRequirements = {}, rawJdText = '', jdText = '' } = payload;
      const studentData = { skills: candidateSkills, resumeProfile: { skills: candidateSkills } };
      const analysis = computeAtsScore(studentData, targetRequirements, rawJdText || jdText);
      return analysis;
    }

    case 'mock_interview_eval': {
      const { evaluateMockAnswer } = require('../mockInterview/mockInterviewService');
      const { question = {}, answer = '', type: intType = 'technical' } = payload;
      const evaluation = await evaluateMockAnswer({ question, answer, type: intType, userId });
      return evaluation;
    }

    default:
      throw new Error(`Unsupported AI job type: ${type}`);
  }
}

/**
 * Dispatches an AI job to BullMQ queue.
 *
 * RELIABILITY GUARANTEE (Phase 0 Step 6):
 * - If queue is unavailable or Redis is not configured, returns QUEUE_UNAVAILABLE (503).
 * - Never runs heavy jobs synchronously inside the API process.
 * - Deterministic, tenant-aware job IDs deduplicate identical requests.
 * - Controlled re-analysis is supported via `options.force = true`.
 *
 * @param {string} type - 'resume_parse' | 'resume_analyze' | 'mock_interview_eval'
 * @param {Object} payload - Task-specific parameters
 * @param {string|ObjectId} [userId=null]
 * @param {string|ObjectId} [collegeId=null]
 * @param {Object} [options={}] - Options (e.g. { force: boolean })
 * @returns {Promise<{ queued: boolean, jobId?: string, status: string, code?: string, error?: string, deduplicated?: boolean, result?: any }>}
 */
async function dispatchAiJob(type, payload = {}, userId = null, collegeId = null, options = {}) {
  if (!ALLOWED_JOB_TYPES.includes(type)) {
    return {
      queued: false,
      status: 'rejected',
      code: 'INVALID_JOB_TYPE',
      error: `Job type '${type}' is invalid. Allowed: ${ALLOWED_JOB_TYPES.join(', ')}`,
    };
  }

  const queue = getAiQueue();

  if (!queue || (!isRedisConfigured() && !testMockQueue)) {
    // Return explicit service unavailable - NO synchronous fallback in API
    return {
      queued: false,
      status: 'unavailable',
      code: 'QUEUE_UNAVAILABLE',
      error: 'Background processing is temporarily unavailable. Please try again later.',
    };
  }

  const isForce = Boolean(options.force || payload.force);
  const jobId = generateAiJobId(type, collegeId, userId, payload);

  try {
    // Check for existing job with same deterministic ID for deduplication
    let existingJob = null;
    try {
      if (typeof queue.getJob === 'function') {
        existingJob = await queue.getJob(jobId);
      }
    } catch (_) {
      // Ignore lookup errors
    }

    if (existingJob) {
      const state = typeof existingJob.getState === 'function' ? await existingJob.getState() : 'active';

      // 1. If job is currently active or waiting, deduplicate and return in-flight job
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return {
          queued: true,
          jobId: String(existingJob.id || jobId),
          status: state,
          deduplicated: true,
        };
      }

      // 2. If job completed, return existing result unless force is requested
      if (state === 'completed') {
        if (!isForce) {
          return {
            queued: false,
            jobId: String(existingJob.id || jobId),
            status: 'completed',
            result: existingJob.returnvalue || null,
            deduplicated: true,
          };
        }
        // Force re-analysis: remove previous job to allow fresh execution
        try {
          if (typeof existingJob.remove === 'function') {
            await existingJob.remove();
          }
        } catch (_) {}
      }

      // 3. If job failed, remove previous failure so it can be cleanly retried
      if (state === 'failed') {
        try {
          if (typeof existingJob.remove === 'function') {
            await existingJob.remove();
          }
        } catch (_) {}
      }
    }

    const sanitizedData = {
      type,
      payload: sanitizeJobPayload(type, payload),
      userId: userId ? String(userId) : null,
      collegeId: collegeId ? String(collegeId) : null,
      createdAt: new Date().toISOString(),
    };

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('BullMQ add timed out after 2500ms')), 2500);
    });

    const job = await Promise.race([
      queue.add(type, sanitizedData, {
        jobId,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 5000 },
      }),
      timeoutPromise,
    ]).finally(() => clearTimeout(timer));

    return {
      queued: true,
      jobId: String(job.id || jobId),
      status: job.isDuplicate ? (typeof job.getState === 'function' ? await job.getState() : 'active') : 'queued',
      ...(job.isDuplicate ? { deduplicated: true } : {}),
    };
  } catch (err) {
    // If a concurrent enqueue won the race and jobId already exists, fetch the in-flight job
    if (err.message && err.message.toLowerCase().includes('already exists')) {
      try {
        const raceJob = await queue.getJob(jobId);
        if (raceJob) {
          const state = typeof raceJob.getState === 'function' ? await raceJob.getState() : 'active';
          return {
            queued: true,
            jobId: String(raceJob.id || jobId),
            status: state,
            deduplicated: true,
          };
        }
      } catch (_) {}
    }

    console.warn('[AI Queue] BullMQ enqueue failed:', err.message);
    // Explicitly return QUEUE_UNAVAILABLE - NEVER execute heavy jobs in API process!
    return {
      queued: false,
      status: 'unavailable',
      code: 'QUEUE_UNAVAILABLE',
      error: 'Background processing is temporarily unavailable. Please try again later.',
    };
  }
}

/**
 * Sanitize error message to prevent leaking internal Redis/provider stack traces or credentials
 */
function sanitizeErrorMessage(errMsg) {
  if (!errMsg || typeof errMsg !== 'string') {
    return 'An internal processing error occurred';
  }
  if (errMsg.includes('ECONNREFUSED') || errMsg.includes('Redis') || errMsg.includes('ioredis')) {
    return 'Background processing error: Queue service is temporarily unavailable';
  }
  if (errMsg.includes('apiKey') || errMsg.includes('Bearer') || errMsg.includes('token')) {
    return 'Processing error: Internal configuration issue';
  }
  return errMsg.slice(0, 300);
}

/**
 * Queries the real-time status and progress of an AI job with strict tenant and ownership verification.
 *
 * @param {string} jobId
 * @param {Object} [requestingUser=null] - Authenticated req.user object
 * @returns {Promise<{ status: string, progress: number, result?: any, error?: string, code?: string }>}
 */
async function getAiJobStatus(jobId, requestingUser = null) {
  if (!jobId) {
    return { status: 'not_found', progress: 0, error: 'jobId is required' };
  }

  const queue = getAiQueue();
  if (!queue || (!isRedisConfigured() && !testMockQueue)) {
    return {
      status: 'unavailable',
      code: 'QUEUE_UNAVAILABLE',
      progress: 0,
      error: 'Queue service is temporarily unavailable',
    };
  }

  // Helper to assert owner / tenant consistency
  const assertOwnership = (jobUserId, jobCollegeId) => {
    if (!requestingUser) return true; // Internal or unauthenticated check
    if (requestingUser.role === 'superadmin') return true; // Global admin access

    const reqUserId = requestingUser._id ? String(requestingUser._id) : null;
    if (jobUserId && reqUserId && String(jobUserId) !== reqUserId) {
      return false;
    }

    if (jobCollegeId && requestingUser.college) {
      const userColId = String(requestingUser.college._id || requestingUser.college);
      if (String(jobCollegeId) !== userColId) {
        return false;
      }
    }

    return true;
  };

  try {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('BullMQ getJob timed out after 2000ms')), 2000);
    });

    const job = await Promise.race([
      queue.getJob(jobId),
      timeoutPromise,
    ]).finally(() => clearTimeout(timer));

    if (!job) {
      return { status: 'not_found', progress: 0, error: 'Job not found in queue' };
    }

    // Verify ownership on BullMQ job data
    if (!assertOwnership(job.data?.userId, job.data?.collegeId)) {
      return { status: 'forbidden', progress: 0, error: 'Access denied: You do not own this AI job' };
    }

    const state = typeof job.getState === 'function' ? await job.getState() : (job.status || 'active');
    const isCompleted = state === 'completed';
    const isFailed = state === 'failed';

    return {
      status: state, // 'queued' | 'active' | 'completed' | 'failed' | 'delayed'
      progress: isCompleted ? 100 : typeof job.progress === 'number' ? job.progress : (state === 'active' ? 25 : 10),
      result: isCompleted ? (job.returnvalue || null) : null,
      error: isFailed ? sanitizeErrorMessage(job.failedReason || job.error) : null,
    };
  } catch (err) {
    return {
      status: 'failed',
      progress: 0,
      error: sanitizeErrorMessage(err.message),
    };
  }
}

/**
 * Return current AI queue job counts for health reporting: { waiting, active, completed, failed }
 */
async function getAiJobCounts() {
  const defaultCounts = { waiting: 0, active: 0, completed: 0, failed: 0 };
  if (!isRedisConfigured() && !testMockQueue) {
    return defaultCounts;
  }
  const queue = getAiQueue();
  if (!queue) {
    return defaultCounts;
  }

  try {
    if (typeof queue.getJobCounts === 'function') {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
      };
    }
  } catch (_) {}

  return defaultCounts;
}

/**
 * Gracefully close the BullMQ AI Queue instance
 */
async function closeAiQueue() {
  if (aiQueue) {
    const q = aiQueue;
    aiQueue = null;
    try {
      await q.close();
    } catch (_) {}
  }
  testMockQueue = null;
}

/**
 * Create an in-memory mock queue instance conforming to BullMQ interface.
 * Strictly for unit/integration testing when Redis daemon is not running.
 */
function createMockAiQueue(defaultState = 'completed') {
  const jobs = new Map();
  return {
    isMock: true,
    async add(type, data, opts = {}) {
      const id = opts.jobId || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (jobs.has(id)) {
        const existing = jobs.get(id);
        return { ...existing, isDuplicate: true };
      }
      const job = {
        id,
        name: type,
        data,
        opts,
        progress: opts.progress !== undefined ? opts.progress : (defaultState === 'completed' ? 100 : 10),
        returnvalue: opts.returnvalue !== undefined ? opts.returnvalue : { mock: true, analysis: 'completed' },
        failedReason: opts.failedReason || null,
        _state: opts.state || defaultState,
        async getState() { return this._state; },
        async updateProgress(p) { this.progress = p; },
        async remove() { jobs.delete(id); },
      };
      jobs.set(id, job);
      return job;
    },
    async getJob(jobId) {
      return jobs.get(jobId) || null;
    },
    async getJobCounts() {
      let waiting = 0;
      let active = 0;
      let completed = 0;
      let failed = 0;
      for (const j of jobs.values()) {
        if (j._state === 'waiting' || j._state === 'queued') waiting++;
        else if (j._state === 'active') active++;
        else if (j._state === 'completed') completed++;
        else if (j._state === 'failed') failed++;
      }
      return { waiting, active, completed, failed };
    },
    async close() {
      jobs.clear();
    },
  };
}

/**
 * Set a mock queue instance for isolated unit and regression testing
 */
function setAiQueueForTesting(mock) {
  testMockQueue = mock;
}

module.exports = {
  getAiQueue,
  dispatchAiJob,
  getAiJobStatus,
  getAiJobCounts,
  processAiJobDirectly,
  generateAiJobId,
  sanitizeJobPayload,
  closeAiQueue,
  setAiQueueForTesting,
  createMockAiQueue,
};
