const mongoose = require('mongoose');
const {
  Round,
  Question,
  TestAttempt,
  RoundParticipant,
  Student,
  Drive,
  User,
} = require('../models');

/**
 * Helper to check TPO or Recruiter drive ownership
 */
const verifyDriveAccess = (drive, user) => {
  if (user.role === 'superadmin') return true;

  if (user.role === 'tpo' || user.role === 'admin') {
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const driveCollegeId = (drive.college?._id || drive.college)?.toString();
    return userCollegeId && driveCollegeId && userCollegeId === driveCollegeId;
  }

  if (user.role === 'recruiter') {
    const userCompanyId = (user.company?._id || user.company)?.toString();
    const driveCompanyId = (drive.company?._id || drive.company)?.toString();
    return userCompanyId && driveCompanyId && userCompanyId === driveCompanyId;
  }

  return false;
};

/**
 * Helper to verify that only the owning company's recruiter (or superadmin) can modify questions
 */
const verifyOwningRecruiterAccess = (drive, user) => {
  if (user.role === 'superadmin') return { allowed: true };

  if (user.role === 'tpo' || user.role === 'admin') {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: TPO has read-only access to rounds and questions',
    };
  }

  if (user.role !== 'recruiter') {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: Only recruiters from the hiring company can manage questions',
    };
  }

  const userCompanyId = (user.company?._id || user.company)?.toString();
  const driveCompanyId = (drive.company?._id || drive.company)?.toString();
  if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: Only recruiters from the hiring company can manage questions',
    };
  }

  return { allowed: true };
};

/**
 * Helper to check if question bank is locked
 * Lock questions once the test window opens
 */
const isTestLocked = (round) => {
  if (!round.testWindowStart) return false;
  return new Date() >= new Date(round.testWindowStart);
};

/**
 * Recalculate and update round totalMarks and questionCount
 */
const updateRoundQuestionStats = async (roundId) => {
  const questions = await Question.find({ round: roundId });
  const questionCount = questions.length;
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
  await Round.findByIdAndUpdate(roundId, { questionCount, totalMarks });
  return { questionCount, totalMarks };
};

/**
 * Helper to evaluate a test attempt on submission or expiry
 */
const evaluateAttempt = async (attempt, round) => {
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

  // Score clamped at 0 minimum and rounded to 2 decimal places
  const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);
  const percentage = totalPossibleMarks > 0 ? Math.round((finalScore / totalPossibleMarks) * 1000) / 10 : 0;

  attempt.score = finalScore;
  attempt.percentage = percentage;

  // Update RoundParticipant
  await RoundParticipant.findOneAndUpdate(
    { round: round._id, student: attempt.student },
    {
      attendance: 'present',
      score: finalScore,
      feedback: `Test completed: ${finalScore}/${totalPossibleMarks} (${percentage}%)`,
    }
  );

  return { score: finalScore, percentage, totalPossibleMarks };
};

// =========================================================================
// 1. RECRUITER QUESTION BANK CRUD & SETTINGS
// =========================================================================

/**
 * Get all questions for a round (Recruiter & TPO preview)
 * @route GET /api/rounds/:id/questions
 * @access Private (Recruiter, TPO, Admin, Superadmin)
 */
const getRoundQuestions = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    const questions = await Question.find({ round: round._id }).sort({ order: 1, createdAt: 1 });
    const locked = isTestLocked(round);

    res.status(200).json({
      success: true,
      questions,
      questionCount: questions.length,
      totalMarks: questions.reduce((sum, q) => sum + (q.marks || 1), 0),
      isLocked: locked,
      round: {
        _id: round._id,
        name: round.name,
        type: round.type,
        deliveryMode: round.deliveryMode,
        testWindowStart: round.testWindowStart,
        testWindowEnd: round.testWindowEnd,
        durationMinutes: round.durationMinutes,
        shuffleQuestions: round.shuffleQuestions,
        shuffleOptions: round.shuffleOptions,
        negativeMarking: round.negativeMarking,
        showScoreToStudents: round.showScoreToStudents,
        cutoffScore: round.cutoffScore,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a new question to a round
 * @route POST /api/rounds/:id/questions
 * @access Private (Recruiter only)
 */
const createQuestion = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    if (isTestLocked(round)) {
      return res.status(400).json({
        success: false,
        message: 'Questions cannot be modified once the test window has opened.',
      });
    }

    const { text, options, correctIndex, marks = 1, negativeMarks = 0, section = '', order } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Question text is required' });
    }

    if (!Array.isArray(options) || options.length !== 4 || options.some((o) => !o || !o.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Question must have exactly 4 non-empty options (optionA, optionB, optionC, optionD).',
      });
    }

    const cIndex = Number(correctIndex);
    if (isNaN(cIndex) || cIndex < 0 || cIndex > 3) {
      return res.status(400).json({
        success: false,
        message: 'Correct option index must be between 0 and 3 (0=A, 1=B, 2=C, 3=D).',
      });
    }

    const currentCount = await Question.countDocuments({ round: round._id });

    const question = await Question.create({
      round: round._id,
      text: text.trim(),
      options: options.map((o) => o.trim()),
      correctIndex: cIndex,
      marks: Math.max(0.5, Number(marks) || 1),
      negativeMarks: Math.max(0, Number(negativeMarks) || 0),
      section: section.trim(),
      order: order !== undefined ? Number(order) : currentCount + 1,
    });

    const stats = await updateRoundQuestionStats(round._id);

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      question,
      questionCount: stats.questionCount,
      totalMarks: stats.totalMarks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing question
 * @route PUT /api/questions/:id
 * @access Private (Recruiter only)
 */
const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const authCheck = verifyOwningRecruiterAccess(question.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    if (isTestLocked(question.round)) {
      return res.status(400).json({
        success: false,
        message: 'Questions cannot be modified once the test window has opened.',
      });
    }

    const { text, options, correctIndex, marks, negativeMarks, section, order } = req.body;

    if (text !== undefined) {
      if (!text.trim()) return res.status(400).json({ success: false, message: 'Question text cannot be empty' });
      question.text = text.trim();
    }

    if (options !== undefined) {
      if (!Array.isArray(options) || options.length !== 4 || options.some((o) => !o || !o.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Question must have exactly 4 non-empty options.',
        });
      }
      question.options = options.map((o) => o.trim());
    }

    if (correctIndex !== undefined) {
      const cIndex = Number(correctIndex);
      if (isNaN(cIndex) || cIndex < 0 || cIndex > 3) {
        return res.status(400).json({
          success: false,
          message: 'Correct option index must be between 0 and 3.',
        });
      }
      question.correctIndex = cIndex;
    }

    if (marks !== undefined) {
      question.marks = Math.max(0.5, Number(marks) || 1);
    }
    if (negativeMarks !== undefined) {
      question.negativeMarks = Math.max(0, Number(negativeMarks) || 0);
    }
    if (section !== undefined) {
      question.section = section.trim();
    }
    if (order !== undefined) {
      question.order = Number(order);
    }

    await question.save();
    const stats = await updateRoundQuestionStats(question.round._id);

    res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      question,
      questionCount: stats.questionCount,
      totalMarks: stats.totalMarks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a question
 * @route DELETE /api/questions/:id
 * @access Private (Recruiter only)
 */
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const authCheck = verifyOwningRecruiterAccess(question.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    if (isTestLocked(question.round)) {
      return res.status(400).json({
        success: false,
        message: 'Questions cannot be modified once the test window has opened.',
      });
    }

    const roundId = question.round._id;
    await question.deleteOne();
    const stats = await updateRoundQuestionStats(roundId);

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
      questionCount: stats.questionCount,
      totalMarks: stats.totalMarks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Import questions via CSV with validation report
 * @route POST /api/rounds/:id/questions/import
 * @access Private (Recruiter only)
 * CSV Headers: text,optionA,optionB,optionC,optionD,correct,marks,negative,section
 */
const importQuestionsCSV = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    if (isTestLocked(round)) {
      return res.status(400).json({
        success: false,
        message: 'Questions cannot be modified once the test window has opened.',
      });
    }

    let csvContent = '';
    if (req.file && req.file.buffer) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body && req.body.csvData) {
      csvContent = req.body.csvData;
    } else {
      return res.status(400).json({ success: false, message: 'Please provide CSV file or csvData string' });
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      return res.status(400).json({ success: false, message: 'CSV is empty or contains only headers' });
    }

    // Split CSV line respecting quotes
    const parseCsvLine = (text) => {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          result.push(cur.trim().replace(/^"|"$/g, ''));
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const getIndex = (fieldNames) => {
      for (const f of fieldNames) {
        const idx = header.indexOf(f.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const textIdx = getIndex(['text', 'question', 'questiontext']);
    const optAIdx = getIndex(['optiona', 'a', 'opt1', 'option1']);
    const optBIdx = getIndex(['optionb', 'b', 'opt2', 'option2']);
    const optCIdx = getIndex(['optionc', 'c', 'opt3', 'option3']);
    const optDIdx = getIndex(['optiond', 'd', 'opt4', 'option4']);
    const correctIdxCol = getIndex(['correct', 'answer', 'correctoption', 'correctindex']);
    const marksIdx = getIndex(['marks', 'mark', 'score']);
    const negIdx = getIndex(['negative', 'negativemarks', 'negmark']);
    const secIdx = getIndex(['section', 'category', 'topic']);

    if (textIdx === -1 || optAIdx === -1 || optBIdx === -1 || optCIdx === -1 || optDIdx === -1 || correctIdxCol === -1) {
      return res.status(400).json({
        success: false,
        message: 'CSV must have columns: text, optionA, optionB, optionC, optionD, correct (marks, negative, section optional)',
      });
    }

    const validQuestions = [];
    const failedRows = [];
    let currentOrder = await Question.countDocuments({ round: round._id });

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const cols = parseCsvLine(lines[i]);

      const qText = cols[textIdx];
      const optA = cols[optAIdx];
      const optB = cols[optBIdx];
      const optC = cols[optCIdx];
      const optD = cols[optDIdx];
      const correctRaw = cols[correctIdxCol];
      const marksRaw = marksIdx !== -1 ? cols[marksIdx] : '1';
      const negRaw = negIdx !== -1 ? cols[negIdx] : '0';
      const section = secIdx !== -1 ? (cols[secIdx] || '').trim() : '';

      if (!qText || !qText.trim()) {
        failedRows.push({ row: rowNum, text: '', reason: 'Question text is empty' });
        continue;
      }

      if (!optA || !optB || !optC || !optD) {
        failedRows.push({
          row: rowNum,
          text: qText.slice(0, 30),
          reason: 'All four options (optionA, optionB, optionC, optionD) must be provided',
        });
        continue;
      }

      let correctIndex = -1;
      const cNormalized = (correctRaw || '').trim().toUpperCase();
      if (['A', '1'].includes(cNormalized)) correctIndex = 0;
      else if (['B', '2'].includes(cNormalized)) correctIndex = 1;
      else if (['C', '3'].includes(cNormalized)) correctIndex = 2;
      else if (['D', '4'].includes(cNormalized)) correctIndex = 3;
      else if (['0'].includes(cNormalized)) correctIndex = 0;

      if (correctIndex === -1) {
        failedRows.push({
          row: rowNum,
          text: qText.slice(0, 30),
          reason: `Invalid correct answer "${correctRaw}". Must be A, B, C, or D (or 1, 2, 3, 4).`,
        });
        continue;
      }

      const marks = Math.max(0.5, Number(marksRaw) || 1);
      const negativeMarks = Math.max(0, Number(negRaw) || 0);

      currentOrder++;
      validQuestions.push({
        round: round._id,
        text: qText.trim(),
        options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()],
        correctIndex,
        marks,
        negativeMarks,
        section,
        order: currentOrder,
      });
    }

    if (validQuestions.length > 0) {
      await Question.insertMany(validQuestions);
    }

    const stats = await updateRoundQuestionStats(round._id);

    res.status(200).json({
      success: true,
      message: `Import processed: ${validQuestions.length} questions imported, ${failedRows.length} failed.`,
      importedCount: validQuestions.length,
      failedCount: failedRows.length,
      failedRows,
      questionCount: stats.questionCount,
      totalMarks: stats.totalMarks,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// 2. STUDENT TEST FLOW (START, ATTEMPT, AUTOSAVE, SUBMIT, TAB SWITCH)
// =========================================================================

/**
 * Fisher-Yates deterministic or seeded shuffle
 */
const shuffleArray = (arr, seed = 42) => {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280;
    const j = Math.floor(rnd * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Student starts the aptitude test
 * @route POST /api/tests/:roundId/start
 * @access Private (Student only)
 */
const startTest = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const round = await Round.findById(roundId).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (round.deliveryMode !== 'platform_test') {
      return res.status(400).json({
        success: false,
        message: 'This round is not configured for on-platform testing',
      });
    }

    // Verify enrollment
    const participant = await RoundParticipant.findOne({ round: round._id, student: student._id });
    if (!participant) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled as a participant in this round',
      });
    }

    const now = new Date();

    // Check window rules
    if (!round.testWindowStart || !round.testWindowEnd) {
      return res.status(400).json({
        success: false,
        message: 'Test window has not been scheduled yet.',
      });
    }

    if (now < new Date(round.testWindowStart)) {
      return res.status(400).json({
        success: false,
        message: `Test window has not opened yet. Window opens on ${new Date(round.testWindowStart).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`,
      });
    }

    if (now > new Date(round.testWindowEnd)) {
      return res.status(400).json({
        success: false,
        message: 'Test window has already closed. Applications or attempts are no longer accepted.',
      });
    }

    // Check existing attempt
    let attempt = await TestAttempt.findOne({ round: round._id, student: student._id });
    if (attempt) {
      if (attempt.status === 'in_progress') {
        // If expired mid-session
        if (now >= new Date(attempt.deadlineAt)) {
          attempt.status = 'auto_submitted';
          attempt.submittedAt = new Date(attempt.deadlineAt);
          await evaluateAttempt(attempt, round);
          await attempt.save();
          return res.status(400).json({
            success: false,
            message: 'Your test time limit has expired. Your responses have been auto-submitted.',
          });
        }
        // Active attempt: resume seamlessly
        return res.status(200).json({
          success: true,
          message: 'Resuming active test session',
          attemptId: attempt._id,
          deadlineAt: attempt.deadlineAt,
          remainingSeconds: Math.max(0, Math.floor((attempt.deadlineAt.getTime() - now.getTime()) / 1000)),
        });
      }

      return res.status(400).json({
        success: false,
        message: 'You have already attempted this test. Multiple attempts are not permitted.',
      });
    }

    // Prepare questions
    const allQuestions = await Question.find({ round: round._id }).sort({ order: 1, createdAt: 1 });
    if (allQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No questions have been configured for this test yet. Please contact your TPO or recruiter.',
      });
    }

    // Deterministic shuffle seed per student
    const seed = parseInt(student._id.toString().slice(-6), 16) || 12345;
    let orderedQuestions = allQuestions;
    if (round.shuffleQuestions) {
      orderedQuestions = shuffleArray(allQuestions, seed);
    }

    // Calculate deadline = min(startedAt + duration, window end)
    const durationMs = (round.durationMinutes || 60) * 60 * 1000;
    const windowEndMs = new Date(round.testWindowEnd).getTime();
    const calculatedDeadlineMs = Math.min(now.getTime() + durationMs, windowEndMs);
    const deadlineAt = new Date(calculatedDeadlineMs);

    attempt = await TestAttempt.create({
      round: round._id,
      student: student._id,
      application: participant.application,
      startedAt: now,
      deadlineAt,
      answers: [],
      status: 'in_progress',
      tabSwitchCount: 0,
      questionOrder: orderedQuestions.map((q) => q._id),
      shuffleSeed: seed,
    });

    // Mark attendance present once student starts
    participant.attendance = 'present';
    await participant.save();

    res.status(200).json({
      success: true,
      message: 'Test started successfully. Your timer has begun.',
      attemptId: attempt._id,
      deadlineAt: attempt.deadlineAt,
      durationMinutes: round.durationMinutes,
      totalQuestions: orderedQuestions.length,
      remainingSeconds: Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000)),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's current test attempt and questions (WITHOUT correct answers)
 * @route GET /api/tests/:roundId/attempt
 * @access Private (Student only)
 */
const getStudentAttempt = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const round = await Round.findById(roundId).populate({
      path: 'drive',
      populate: ['company', 'college'],
    });
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const attempt = await TestAttempt.findOne({ round: round._id, student: student._id });
    if (!attempt) {
      return res.status(200).json({
        success: true,
        status: 'not_started',
        round: {
          _id: round._id,
          name: round.name,
          deliveryMode: round.deliveryMode,
          testWindowStart: round.testWindowStart,
          testWindowEnd: round.testWindowEnd,
          durationMinutes: round.durationMinutes,
          questionCount: round.questionCount,
          totalMarks: round.totalMarks,
          negativeMarking: round.negativeMarking,
          companyName: round.drive?.company?.name,
          role: round.drive?.role,
        },
      });
    }

    const now = new Date();

    // Check if in_progress attempt has expired past deadline -> auto-submit
    if (attempt.status === 'in_progress' && now >= new Date(attempt.deadlineAt)) {
      attempt.status = 'auto_submitted';
      attempt.submittedAt = new Date(attempt.deadlineAt);
      await evaluateAttempt(attempt, round);
      await attempt.save();
    }

    // If submitted or auto_submitted
    if (['submitted', 'auto_submitted', 'expired'].includes(attempt.status)) {
      return res.status(200).json({
        success: true,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        showScore: round.showScoreToStudents,
        score: round.showScoreToStudents ? attempt.score : undefined,
        percentage: round.showScoreToStudents ? attempt.percentage : undefined,
        totalMarks: round.showScoreToStudents ? round.totalMarks : undefined,
        tabSwitchCount: attempt.tabSwitchCount,
        message: round.showScoreToStudents
          ? `Test submitted. Score: ${attempt.score}/${round.totalMarks} (${attempt.percentage}%)`
          : 'Your test has been submitted. Results will be declared by the recruiter.',
      });
    }

    // Active in_progress attempt: fetch questions in student's exact questionOrder
    const questions = await Question.find({
      _id: { $in: attempt.questionOrder },
    });

    const questionMap = new Map();
    questions.forEach((q) => questionMap.set(q._id.toString(), q));

    const answerMap = new Map();
    (attempt.answers || []).forEach((a) => {
      answerMap.set(a.question.toString(), a.selectedIndex);
    });

    // Strip correctIndex completely! Candidate never receives correctIndex.
    const safeQuestions = [];
    for (const qId of attempt.questionOrder) {
      const q = questionMap.get(qId.toString());
      if (q) {
        safeQuestions.push({
          _id: q._id,
          text: q.text,
          options: q.options,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          section: q.section,
          selectedIndex: answerMap.has(q._id.toString()) ? answerMap.get(q._id.toString()) : null,
        });
      }
    }

    res.status(200).json({
      success: true,
      status: 'in_progress',
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds: Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - now.getTime()) / 1000)),
      tabSwitchCount: attempt.tabSwitchCount,
      questions: safeQuestions,
      totalQuestions: safeQuestions.length,
      round: {
        _id: round._id,
        name: round.name,
        durationMinutes: round.durationMinutes,
        negativeMarking: round.negativeMarking,
        companyName: round.drive?.company?.name,
        role: round.drive?.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student answer for a question
 * @route PUT /api/tests/:roundId/answer
 * @access Private (Student only)
 */
const saveAnswer = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const { questionId, selectedIndex } = req.body;

    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const round = await Round.findById(roundId);
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const attempt = await TestAttempt.findOne({ round: round._id, student: student._id });
    if (!attempt) {
      return res.status(400).json({ success: false, message: 'No active test attempt found. Please start test first.' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: `Test is already ${attempt.status}. Answers cannot be modified.`,
      });
    }

    const now = new Date();

    // SERVER-ENFORCED DEADLINE: Answers after deadline are strictly rejected!
    if (now > new Date(attempt.deadlineAt)) {
      attempt.status = 'auto_submitted';
      attempt.submittedAt = new Date(attempt.deadlineAt);
      await evaluateAttempt(attempt, round);
      await attempt.save();

      return res.status(400).json({
        success: false,
        message: 'Test deadline has passed. Answers after deadline are rejected and test has been auto-submitted.',
      });
    }

    if (!questionId) {
      return res.status(400).json({ success: false, message: 'questionId is required' });
    }

    const selIdx = selectedIndex === null || selectedIndex === undefined || selectedIndex === -1 ? null : Number(selectedIndex);
    if (selIdx !== null && (isNaN(selIdx) || selIdx < 0 || selIdx > 3)) {
      return res.status(400).json({ success: false, message: 'selectedIndex must be 0, 1, 2, 3, or null' });
    }

    const existingAnsIndex = attempt.answers.findIndex((a) => a.question.toString() === questionId.toString());
    if (existingAnsIndex >= 0) {
      attempt.answers[existingAnsIndex].selectedIndex = selIdx;
      attempt.answers[existingAnsIndex].savedAt = now;
    } else {
      attempt.answers.push({
        question: questionId,
        selectedIndex: selIdx,
        savedAt: now,
      });
    }

    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Answer saved successfully',
      questionId,
      selectedIndex: selIdx,
      savedAt: now,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit the aptitude test (Student action or time-up)
 * @route POST /api/tests/:roundId/submit
 * @access Private (Student only)
 */
const submitTest = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const round = await Round.findById(roundId);
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const attempt = await TestAttempt.findOne({ round: round._id, student: student._id });
    if (!attempt) {
      return res.status(400).json({ success: false, message: 'No test attempt found' });
    }

    if (['submitted', 'auto_submitted'].includes(attempt.status)) {
      return res.status(400).json({
        success: false,
        message: 'Test has already been submitted',
      });
    }

    const now = new Date();
    const isAuto = now > new Date(attempt.deadlineAt);

    attempt.status = isAuto ? 'auto_submitted' : 'submitted';
    attempt.submittedAt = now;

    const evaluation = await evaluateAttempt(attempt, round);
    await attempt.save();

    res.status(200).json({
      success: true,
      message: isAuto
        ? 'Time limit reached. Your test has been auto-submitted.'
        : 'Your test has been successfully submitted.',
      status: attempt.status,
      showScore: round.showScoreToStudents,
      score: round.showScoreToStudents ? evaluation.score : undefined,
      percentage: round.showScoreToStudents ? evaluation.percentage : undefined,
      totalMarks: round.showScoreToStudents ? evaluation.totalPossibleMarks : undefined,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Increment tab-switch monitoring counter
 * @route POST /api/tests/:roundId/tab-switch
 * @access Private (Student only)
 */
const recordTabSwitch = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const attempt = await TestAttempt.findOne({ round: roundId, student: student._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Active attempt not found' });

    if (attempt.status === 'in_progress') {
      attempt.tabSwitchCount = (attempt.tabSwitchCount || 0) + 1;
      await attempt.save();
    }

    res.status(200).json({
      success: true,
      tabSwitchCount: attempt.tabSwitchCount,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// 3. RECRUITER & TPO TEST RESULTS & RE-TEST
// =========================================================================

/**
 * Get comprehensive test results table for a round
 * @route GET /api/rounds/:id/test-results
 * @access Private (Recruiter, TPO, Admin, Superadmin)
 */
const getRoundTestResults = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    const participants = await RoundParticipant.find({ round: round._id })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .sort({ createdAt: 1 });

    const attempts = await TestAttempt.find({ round: round._id });
    const attemptMap = new Map();
    attempts.forEach((att) => {
      attemptMap.set(att.student.toString(), att);
    });

    const results = participants.map((p) => {
      const studentId = p.student?._id?.toString();
      const att = attemptMap.get(studentId);

      let status = 'not_started';
      let startedAt = null;
      let submittedAt = null;
      let timeTakenMinutes = null;
      let tabSwitchCount = 0;
      let score = p.score;
      let percentage = p.percentage || (score !== null && round.totalMarks > 0 ? Math.round((score / round.totalMarks) * 1000) / 10 : 0);

      if (att) {
        status = att.status;
        startedAt = att.startedAt;
        submittedAt = att.submittedAt;
        tabSwitchCount = att.tabSwitchCount || 0;
        score = att.score;
        percentage = att.percentage;

        if (att.startedAt && att.submittedAt) {
          const diffMs = new Date(att.submittedAt).getTime() - new Date(att.startedAt).getTime();
          timeTakenMinutes = Math.round((diffMs / 60000) * 10) / 10;
        }
      } else if (p.attendance === 'absent') {
        status = 'absent';
      }

      return {
        participantId: p._id,
        studentId: p.student?._id,
        name: p.student?.user?.name || 'N/A',
        email: p.student?.user?.email || 'N/A',
        rollNumber: p.student?.rollNumber || 'N/A',
        branch: p.student?.branch || 'N/A',
        status,
        attendance: p.attendance,
        result: p.result,
        score,
        percentage,
        totalMarks: round.totalMarks || 0,
        timeTakenMinutes,
        tabSwitchCount,
        startedAt,
        submittedAt,
        hasAttempt: Boolean(att),
      };
    });

    const completedAttempts = results.filter((r) => ['submitted', 'auto_submitted'].includes(r.status));
    const averageScore =
      completedAttempts.length > 0
        ? Math.round((completedAttempts.reduce((sum, r) => sum + (r.score || 0), 0) / completedAttempts.length) * 10) / 10
        : 0;

    const highestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map((r) => r.score || 0)) : 0;

    res.status(200).json({
      success: true,
      results,
      summary: {
        totalEnrolled: participants.length,
        submittedCount: completedAttempts.length,
        inProgressCount: results.filter((r) => r.status === 'in_progress').length,
        notStartedCount: results.filter((r) => r.status === 'not_started').length,
        absentCount: results.filter((r) => r.status === 'absent').length,
        averageScore,
        highestScore,
        totalMarks: round.totalMarks || 0,
        cutoffScore: round.cutoffScore,
        showScoreToStudents: round.showScoreToStudents,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TPO allows re-test for a candidate
 * @route PUT /api/tests/:roundId/retest/:studentId
 * @access Private (TPO, Admin, Superadmin)
 */
const allowStudentRetest = async (req, res, next) => {
  try {
    const { roundId, studentId } = req.params;

    const round = await Round.findById(roundId).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    // Delete existing attempt to permit fresh attempt
    await TestAttempt.deleteMany({ round: round._id, student: studentId });

    // Reset RoundParticipant
    const participant = await RoundParticipant.findOne({ round: round._id, student: studentId }).populate({
      path: 'student',
      populate: 'user',
    });

    if (participant) {
      participant.attendance = 'pending';
      participant.result = 'pending';
      participant.score = null;
      participant.feedback = 'Re-test granted by TPO coordinator';
      await participant.save();
    }

    res.status(200).json({
      success: true,
      message: `Re-test granted for candidate ${participant?.student?.user?.name || studentId}. Previous attempt has been cleared.`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoundQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  importQuestionsCSV,
  startTest,
  getStudentAttempt,
  saveAnswer,
  submitTest,
  recordTabSwitch,
  getRoundTestResults,
  allowStudentRetest,
  evaluateAttempt,
  updateRoundQuestionStats,
};

