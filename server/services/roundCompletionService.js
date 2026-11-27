const { Round, RoundParticipant, TestAttempt, Question } = require('../models');

/**
 * Evaluates a single attempt and computes score / percentage.
 */
const evaluateAttemptLocally = async (attempt, round) => {
  const questions = await Question.find({ round: round._id });
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
      // ATOMIC CLAIM: Claim the round with findOneAndUpdate to eliminate races between cron and lazy reads
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
        // 1. Auto-submit any in-progress test attempts whose deadline has passed or window has closed
        const inProgressAttempts = await TestAttempt.find({
          round: round._id,
          status: 'in_progress',
        });

        for (const attempt of inProgressAttempts) {
          attempt.status = 'auto_submitted';
          attempt.submittedAt = attempt.deadlineAt && attempt.deadlineAt < now ? attempt.deadlineAt : now;
          const evaluation = await evaluateAttemptLocally(attempt, round);
          await attempt.save();
          result.autoSubmittedCount++;

          // Update participant score and cutoff result
          const updateDoc = {
            attendance: 'present',
            score: evaluation.finalScore,
            feedback: `Test completed: ${evaluation.finalScore}/${evaluation.totalPossibleMarks} (${evaluation.percentage}%)`,
          };
          if (round.cutoffScore !== null && round.cutoffScore !== undefined) {
            updateDoc.result = evaluation.finalScore >= round.cutoffScore ? 'shortlisted' : 'rejected';
          }
          await RoundParticipant.findOneAndUpdate(
            { round: round._id, student: attempt.student },
            updateDoc
          );
        }

        // 2. Process all round participants
        const participants = await RoundParticipant.find({ round: round._id });

        for (const p of participants) {
          const attempt = await TestAttempt.findOne({ round: round._id, student: p.student });

          if (!attempt || attempt.status === 'not_started') {
            // Student never started the test -> mark absent and rejected
            if (p.attendance !== 'absent') {
              p.attendance = 'absent';
              p.result = 'rejected';
              p.feedback = p.feedback || 'Absent: Did not start test before window closed';
              await p.save();
              result.absentCount++;
            }
          } else if (['submitted', 'auto_submitted'].includes(attempt.status)) {
            // Student finished test -> calculate score & cutoff result
            let changed = false;
            if (p.attendance !== 'present') {
              p.attendance = 'present';
              changed = true;
            }
            if (attempt.score !== undefined && attempt.score !== null && p.score !== attempt.score) {
              p.score = attempt.score;
              changed = true;
            }
            if (round.cutoffScore !== null && round.cutoffScore !== undefined) {
              const expectedResult = (p.score ?? 0) >= round.cutoffScore ? 'shortlisted' : 'rejected';
              if (p.result !== expectedResult && (p.result === 'pending' || !p.result)) {
                p.result = expectedResult;
                changed = true;
              }
            }
            if (changed) {
              await p.save();
            }
          }
        }

        // 3. Mark round as completed, release lock (resultsPublished is strictly preserved as is, NOT auto-published!)
        round.status = 'completed';
        round.isFinalizing = false;
        round.finalizingStartedAt = null;
        await round.save();

        result.completedRoundIds.push(round._id.toString());
      } catch (roundError) {
        await Round.updateOne(
          { _id: round._id },
          { $set: { isFinalizing: false, finalizingStartedAt: null } }
        );
        throw roundError;
      }
    }
  } catch (error) {
    console.error('[AutoCompletePlatformTests] Error completing platform test rounds:', error);
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
};
