const mongoose = require('mongoose');
const { Round, RoundParticipant, TestAttempt, Question } = require('../models');

// In-memory timestamp tracker for throttled error logging (at most once per round per 15 minutes)
const failedRoundLogTimestamps = new Map();
const LOG_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Evaluates a single attempt and computes score / percentage.
 */
const evaluateAttemptLocally = async (attempt, round, preloadedQuestions = null) => {
  const questions = preloadedQuestions || (await Question.find({ round: round._id }));
  const questionMap = new Map();
  let totalPossibleMarks = 0;
  questions.forEach((q) => {
    questionMap.set(q._id.toString(), q);
    totalPossibleMarks += q.marks || 1;
  });

  let rawScore = 0;
  for (const ans of attempt.answers || []) {
    const q = questionMap.get(ans.question?.toString());
    if (!q) continue;

    if (ans.selectedIndex !== null && ans.selectedIndex !== undefined && ans.selectedIndex >= 0) {
      if (ans.selectedIndex === q.correctIndex) {
        rawScore += q.marks || 1;
      } else if (round.negativeMarking && (q.negativeMarks || 0) > 0) {
        rawScore -= q.negativeMarks;
      }
    }
  }

  const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);
  const percentage = totalPossibleMarks > 0 ? Math.round((finalScore / totalPossibleMarks) * 1000) / 10 : 0;

  attempt.score = finalScore;
  attempt.percentage = percentage;

  return { finalScore, percentage, totalPossibleMarks };
};

/**
 * Auto-complete platform_test rounds whose testWindowEnd has passed.
 * Fully idempotent: safe to call repeatedly with zero duplicates or secondary side-effects.
 *
 * Resilience Guarantees:
 * 1. Schema-validated participant results using 'cleared' | 'rejected'.
 * 2. Pre-computes all updates in memory before writing.
 * 3. Atomic apply via MongoDB transaction where supported, with graceful fallback.
 * 4. Per-round try/catch isolation: one failing round never blocks others.
 * 5. Releasing isFinalizing lock on failure to avoid wedged rounds.
 * 6. Throttled error logging (at most once per round per 15 minutes).
 *
 * @param {Object} [options]
 * @param {string|mongoose.Types.ObjectId} [options.roundId] - Optional specific round
 * @param {Date} [options.now=new Date()] - Reference timestamp
 * @returns {Promise<{ completedRoundIds: string[], autoSubmittedCount: number, absentCount: number }>}
 */
const autoCompletePlatformTestRounds = async (options = {}) => {
  const { roundId = null, now = new Date() } = options;
  const result = {
    completedRoundIds: [],
    autoSubmittedCount: 0,
    absentCount: 0,
  };

  try {
    const filter = {
      deliveryMode: 'platform_test',
      status: { $ne: 'completed' },
      testWindowEnd: { $ne: null, $lte: now },
      $or: [
        { isFinalizing: { $ne: true } },
        { finalizingStartedAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } },
      ],
    };

    if (roundId) {
      filter._id = roundId;
    }

    const eligibleRounds = await Round.find(filter).select('_id');

    for (const candidate of eligibleRounds) {
      // ATOMIC CLAIM: Claim the round with findOneAndUpdate to eliminate races
      const round = await Round.findOneAndUpdate(
        {
          _id: candidate._id,
          status: { $ne: 'completed' },
          $or: [
            { isFinalizing: { $ne: true } },
            { finalizingStartedAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } },
          ],
        },
        {
          $set: {
            isFinalizing: true,
            finalizingStartedAt: now,
          },
        },
        { new: true }
      );

      // If another process already claimed or completed this round, skip gracefully
      if (!round) {
        continue;
      }

      try {
        // --- STEP 1: COMPUTE EVERYTHING IN MEMORY FIRST ---
        const questions = await Question.find({ round: round._id });

        // Evaluate in-progress attempts
        const inProgressAttempts = await TestAttempt.find({
          round: round._id,
          status: 'in_progress',
        });

        const evaluationsByStudent = new Map();
        for (const attempt of inProgressAttempts) {
          attempt.status = 'auto_submitted';
          attempt.submittedAt = attempt.deadlineAt && attempt.deadlineAt < now ? attempt.deadlineAt : now;
          const evaluation = await evaluateAttemptLocally(attempt, round, questions);
          evaluationsByStudent.set(attempt.student.toString(), {
            attempt,
            finalScore: evaluation.finalScore,
            percentage: evaluation.percentage,
            totalPossibleMarks: evaluation.totalPossibleMarks,
          });
        }

        // Fetch all attempts for round to build full student attempt map
        const allAttempts = await TestAttempt.find({ round: round._id });
        const studentAttemptMap = new Map();
        for (const att of allAttempts) {
          const sId = att.student.toString();
          if (evaluationsByStudent.has(sId)) {
            studentAttemptMap.set(sId, evaluationsByStudent.get(sId).attempt);
          } else {
            studentAttemptMap.set(sId, att);
          }
        }

        // Stage participant changes
        const participants = await RoundParticipant.find({ round: round._id });
        const modifiedParticipants = [];
        let roundAbsentCount = 0;

        for (const p of participants) {
          const sId = p.student.toString();
          const attempt = studentAttemptMap.get(sId);

          if (!attempt || attempt.status === 'not_started') {
            // Student never started the test -> absent and rejected
            let changed = false;
            if (p.attendance !== 'absent') {
              p.attendance = 'absent';
              changed = true;
            }
            if (p.result !== 'rejected') {
              p.result = 'rejected';
              changed = true;
            }
            if (!p.feedback) {
              p.feedback = 'Absent: Did not start test before window closed';
              changed = true;
            }
            if (changed) {
              modifiedParticipants.push(p);
              roundAbsentCount++;
            }
          } else if (['submitted', 'auto_submitted'].includes(attempt.status)) {
            // Student finished / auto-submitted test
            let changed = false;
            if (p.attendance !== 'present') {
              p.attendance = 'present';
              changed = true;
            }
            const evaluation = evaluationsByStudent.get(sId);
            if (evaluation && !p.feedback) {
              p.feedback = `Test completed: ${evaluation.finalScore}/${evaluation.totalPossibleMarks} (${evaluation.percentage}%)`;
              changed = true;
            }
            if (attempt.score !== undefined && attempt.score !== null && p.score !== attempt.score) {
              p.score = attempt.score;
              changed = true;
            }
            if (round.cutoffScore !== null && round.cutoffScore !== undefined) {
              // Valid enum values: 'pending' | 'cleared' | 'rejected'
              const expectedResult = (p.score ?? 0) >= round.cutoffScore ? 'cleared' : 'rejected';
              if (p.result !== expectedResult && (p.result === 'pending' || !p.result)) {
                p.result = expectedResult;
                changed = true;
              }
            }
            if (changed) {
              modifiedParticipants.push(p);
            }
          }
        }

        // Prepare round completion state
        round.status = 'completed';
        round.isFinalizing = false;
        round.finalizingStartedAt = null;

        // --- STEP 2: APPLY UPDATES ATOMICALLY THROUGH VALIDATED PATH ---
        const executeAtomicCommit = async () => {
          const applyWrites = async (activeSession) => {
            const sessionOpts = activeSession ? { session: activeSession } : {};

            // 1. Save auto-submitted attempts
            for (const attempt of inProgressAttempts) {
              await attempt.save(sessionOpts);
            }

            // 2. Save modified participants (runs schema validation via .save)
            for (const p of modifiedParticipants) {
              await p.save(sessionOpts);
            }

            // 3. Save completed round status
            await round.save(sessionOpts);
          };

          let session = null;
          let inTx = false;
          try {
            session = await mongoose.startSession();
            session.startTransaction();
            inTx = true;
          } catch (_) {
            inTx = false;
            if (session) {
              try {
                await session.endSession();
              } catch (_) {}
              session = null;
            }
          }

          if (inTx && session) {
            try {
              await applyWrites(session);
              await session.commitTransaction();
            } catch (txErr) {
              try {
                await session.abortTransaction();
              } catch (_) {}
              if (
                txErr.message &&
                (txErr.message.includes('replica set member') ||
                  txErr.message.includes('Transaction numbers') ||
                  txErr.message.includes('standalone'))
              ) {
                // Standalone fallback: execute idempotent ordered writes
                await applyWrites(null);
              } else {
                throw txErr;
              }
            } finally {
              try {
                await session.endSession();
              } catch (_) {}
            }
          } else {
            await applyWrites(null);
          }
        };

        await executeAtomicCommit();

        // Round finalized successfully
        result.completedRoundIds.push(round._id.toString());
        result.autoSubmittedCount += inProgressAttempts.length;
        result.absentCount += roundAbsentCount;
        failedRoundLogTimestamps.delete(round._id.toString());
      } catch (roundError) {
        // Release lock on failure so round is never wedged
        try {
          await Round.updateOne(
            { _id: round._id },
            { $set: { isFinalizing: false, finalizingStartedAt: null } }
          );
        } catch (_) {}

        // Log failing round at most once per round per 15 minutes
        const roundIdStr = round._id.toString();
        const nowMs = Date.now();
        const lastLogged = failedRoundLogTimestamps.get(roundIdStr);
        if (!lastLogged || nowMs - lastLogged >= LOG_THROTTLE_MS) {
          failedRoundLogTimestamps.set(roundIdStr, nowMs);
          console.error(`[AutoCompletePlatformTests] Error completing round ${roundIdStr}: ${roundError.message || roundError}`);
        }

        // Clean up log cache if it grows large
        if (failedRoundLogTimestamps.size > 1000) {
          for (const [id, ts] of failedRoundLogTimestamps.entries()) {
            if (nowMs - ts > LOG_THROTTLE_MS) {
              failedRoundLogTimestamps.delete(id);
            }
          }
        }

        // Do not rethrow: isolated per-round failure allows other rounds to proceed
      }
    }
  } catch (error) {
    console.error('[AutoCompletePlatformTests] Unexpected top-level error completing platform test rounds:', error);
  }

  return result;
};

/**
 * Derives round status dynamically based on server time and lifecycle.
 *
 * @param {Object} round
 * @param {Date} [now=new Date()]
 * @returns {string} 'scheduled' | 'live' | 'completed' | 'cancelled'
 */
const deriveRoundStatus = (round, now = new Date()) => {
  if (!round || round.deliveryMode !== 'platform_test' || !round.testWindowStart || !round.testWindowEnd) {
    return round?.status || 'scheduled';
  }
  if (round.status === 'completed' || round.status === 'cancelled') {
    return round.status;
  }
  const start = new Date(round.testWindowStart);
  const end = new Date(round.testWindowEnd);
  if (now < start) {
    return 'scheduled';
  }
  if (now >= start && now <= end) {
    return 'live';
  }
  return 'completed';
};

module.exports = {
  autoCompletePlatformTestRounds,
  deriveRoundStatus,
  evaluateAttemptLocally,
};
