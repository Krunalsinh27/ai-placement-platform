/**
 * Asynchronous AI Job Queue Manager
 *
 * Dispatches heavy AI operations (resume parsing, ATS deep analysis, mock interview scoring)
 * to BullMQ background workers with status polling, preventing HTTP request timeouts.
 *
 * Resilient Architecture:
 * - If Redis is active, jobs are pushed to BullMQ queue 'ai-jobs' with exponential retry.
 * - If Redis is absent (or in local dev/testing), jobs execute immediately in-process with
 *   identical status response semantics, ensuring zero downtime and zero breaks in existing tests.
 */

const { isRedisConfigured, getRedisClient, createRedisClient, getBullPrefix } = require('../../config/redis');

let aiQueue = null;
const inProcessJobs = new Map(); // In-memory status store for sync / local fallback jobs

/**
 * Lazily initializes and returns the BullMQ 'ai-jobs' Queue
 */
function getAiQueue() {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!aiQueue) {
    const { Queue } = require('bullmq');
    aiQueue = new Queue('ai-jobs', {
      connection: getRedisClient(),
      prefix: getBullPrefix(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 3600 }, // Keep completed jobs for 1 hour
        removeOnFail: { age: 7200 },     // Keep failed jobs for 2 hours
      },
    });
  }

  return aiQueue;
}

/**
 * Directly processes an AI job in-process
 */
async function processAiJobDirectly(type, payload = {}, userId = null) {
  switch (type) {
    case 'resume_parse': {
      const { parseResumeText, extractWithRules } = require('./resumeAnalyzer');
      const { text = '' } = payload;
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
      const { candidateSkills = [], targetRequirements = {}, rawJdText = '' } = payload;
      const analysis = computeAtsScore(candidateSkills, targetRequirements, rawJdText);
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
 * Dispatches an AI job to BullMQ or in-process queue
 *
 * @param {string} type - 'resume_parse' | 'resume_analyze' | 'mock_interview_eval'
 * @param {Object} payload - Task-specific parameters
 * @param {string|ObjectId} [userId=null]
 * @returns {Promise<{ queued: boolean, jobId: string, status: string, result?: any }>}
 */
async function dispatchAiJob(type, payload = {}, userId = null) {
  const queue = getAiQueue();

  if (queue && isRedisConfigured()) {
    try {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('BullMQ add timed out after 1500ms')), 1500);
      });
      const job = await Promise.race([
        queue.add(type, {
          type,
          payload,
          userId: userId ? String(userId) : null,
          createdAt: new Date().toISOString(),
        }),
        timeoutPromise,
      ]).finally(() => clearTimeout(timer));

      return {
        queued: true,
        jobId: String(job.id),
        status: 'queued',
      };
    } catch (err) {
      console.warn('[AI Queue] BullMQ enqueue failed; falling back to in-process execution:', err.message);
    }
  }

  // Fallback: synchronous in-process execution
  const jobId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  inProcessJobs.set(jobId, {
    status: 'active',
    progress: 25,
    result: null,
    error: null,
  });

  try {
    const result = await processAiJobDirectly(type, payload, userId);
    inProcessJobs.set(jobId, {
      status: 'completed',
      progress: 100,
      result,
      error: null,
    });

    return {
      queued: false,
      jobId,
      status: 'completed',
      result,
    };
  } catch (err) {
    inProcessJobs.set(jobId, {
      status: 'failed',
      progress: 100,
      result: null,
      error: err.message,
    });

    return {
      queued: false,
      jobId,
      status: 'failed',
      error: err.message,
    };
  }
}

/**
 * Queries the real-time status and progress of an AI job
 *
 * @param {string} jobId
 * @returns {Promise<{ status: string, progress: number, result?: any, error?: string }>}
 */
async function getAiJobStatus(jobId) {
  if (!jobId) {
    return { status: 'not_found', progress: 0, error: 'jobId is required' };
  }

  // Check in-process map first
  if (inProcessJobs.has(jobId)) {
    return inProcessJobs.get(jobId);
  }

  const queue = getAiQueue();
  if (!queue || !isRedisConfigured()) {
    return { status: 'not_found', progress: 0, error: 'Job not found' };
  }

  try {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('BullMQ getJob timed out after 1500ms')), 1500);
    });
    const job = await Promise.race([
      queue.getJob(jobId),
      timeoutPromise,
    ]).finally(() => clearTimeout(timer));

    if (!job) {
      return { status: 'not_found', progress: 0, error: 'Job not found in queue' };
    }

    const state = await Promise.race([
      job.getState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('BullMQ getState timed out after 1000ms')), 1000)),
    ]);
    const isCompleted = state === 'completed';
    const isFailed = state === 'failed';

    return {
      status: state, // 'queued' | 'active' | 'completed' | 'failed' | 'delayed'
      progress: isCompleted ? 100 : typeof job.progress === 'number' ? job.progress : 10,
      result: isCompleted ? job.returnvalue : null,
      error: isFailed ? job.failedReason : null,
    };
  } catch (err) {
    return { status: 'failed', progress: 0, error: err.message };
  }
}

module.exports = {
  getAiQueue,
  dispatchAiJob,
  getAiJobStatus,
  processAiJobDirectly,
};
