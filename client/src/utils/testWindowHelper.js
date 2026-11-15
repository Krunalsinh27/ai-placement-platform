/**
 * Computes button status and user guidance for platform aptitude test entry points.
 *
 * @param {Object} options
 * @param {string|Date} [options.testWindowStart]
 * @param {string|Date} [options.testWindowEnd]
 * @param {number} [options.durationMinutes]
 * @param {string} [options.attemptStatus] - 'not_started' | 'in_progress' | 'submitted' | 'auto_submitted' | 'window_closed'
 * @param {boolean} [options.showScore]
 * @param {number} [options.score]
 * @param {string|Date} [options.serverNow] - Server timestamp from API response
 * @param {number|Date} [options.receivedAt] - Client timestamp when API response was received
 * @param {number|Date} [options.deviceNow] - Client timestamp when evaluating state (defaults to Date.now())
 * @param {Date} [options.now] - Optional fallback timestamp if serverNow is not provided
 * @returns {{
 *   label: string,
 *   disabled: boolean,
 *   action: 'start' | 'resume' | 'view_result' | 'closed' | 'before_window' | 'submitted',
 *   reason: string,
 *   statusBadge: { label: string, color: string }
 * }}
 */
export function getTestButtonState({
  testWindowStart,
  testWindowEnd,
  durationMinutes = 60,
  attemptStatus = 'not_started',
  showScore = false,
  score,
  serverNow,
  receivedAt,
  deviceNow,
  now,
}) {
  let effectiveNow;
  if (serverNow) {
    const serverBaseMs = new Date(serverNow).getTime();
    const currentDeviceMs = deviceNow
      ? (typeof deviceNow === 'number' ? deviceNow : new Date(deviceNow).getTime())
      : Date.now();
    const receivedMs = receivedAt
      ? (typeof receivedAt === 'number' ? receivedAt : new Date(receivedAt).getTime())
      : currentDeviceMs;
    const elapsedMs = Math.max(0, currentDeviceMs - receivedMs);
    effectiveNow = new Date(serverBaseMs + elapsedMs);
  } else if (now) {
    effectiveNow = new Date(now);
  } else {
    effectiveNow = new Date();
  }

  const winStart = testWindowStart ? new Date(testWindowStart) : null;
  const winEnd = testWindowEnd ? new Date(testWindowEnd) : null;
  const isStartValid = winStart && !isNaN(winStart.getTime());
  const isEndValid = winEnd && !isNaN(winEnd.getTime());

  // 1. In Progress attempt: candidate can resume immediately
  if (attemptStatus === 'in_progress') {
    return {
      label: 'Resume Test',
      disabled: false,
      action: 'resume',
      reason: 'Your test session is currently active. Click to resume answering questions.',
      statusBadge: { label: 'In Progress', color: 'amber' },
    };
  }

  // 2. Already submitted
  if (attemptStatus === 'submitted' || attemptStatus === 'auto_submitted') {
    if (showScore) {
      return {
        label: 'View Result',
        disabled: false,
        action: 'view_result',
        reason: score !== undefined && score !== null ? `Score: ${score} points` : 'Test results are published.',
        statusBadge: { label: 'Submitted', color: 'emerald' },
      };
    }
    return {
      label: 'Submitted',
      disabled: true,
      action: 'submitted',
      reason: 'Assessment completed. Results will be published by the recruiter.',
      statusBadge: { label: 'Submitted', color: 'slate' },
    };
  }

  // 3. Not Scheduled Yet (missing or invalid testWindowStart or testWindowEnd)
  if (!isStartValid || !isEndValid) {
    return {
      label: 'Not Scheduled',
      disabled: true,
      action: 'not_scheduled',
      reason: 'Your recruiter has not scheduled the test window yet',
      statusBadge: { label: 'Not Scheduled', color: 'slate' },
    };
  }

  const isBeforeWindow = effectiveNow < winStart;
  const isAfterWindow = effectiveNow > winEnd;

  // 4. Window Closed or attempt status marked closed
  if (attemptStatus === 'window_closed' || isAfterWindow) {
    return {
      label: 'Test window closed',
      disabled: true,
      action: 'closed',
      reason: 'Test window closed',
      statusBadge: { label: 'Window Closed', color: 'rose' },
    };
  }

  // 5. Not started - Before Window Opens
  if (isBeforeWindow) {
    const timeStr = winStart.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    return {
      label: `Opens ${timeStr}`,
      disabled: true,
      action: 'before_window',
      reason: `Opens ${timeStr} IST. Test window opens on ${timeStr} IST.`,
      statusBadge: { label: 'Scheduled', color: 'slate' },
    };
  }

  // 6. Not started - Window Open
  return {
    label: 'Start Test',
    disabled: false,
    action: 'start',
    reason: `Assessment window is currently open! You have ${durationMinutes} minutes once started.`,
    statusBadge: { label: 'Window Open', color: 'emerald' },
  };
}

/**
 * Categorizes a platform test into one of four lifecycle tabs:
 * 'open' | 'upcoming' | 'completed' | 'missed'
 *
 * @param {Object} test
 * @param {Object} [options]
 * @returns {'open' | 'upcoming' | 'completed' | 'missed'}
 */
export function categorizeTest(test, options = {}) {
  const btnState = getTestButtonState({
    testWindowStart: test.testWindowStart,
    testWindowEnd: test.testWindowEnd,
    durationMinutes: test.durationMinutes,
    attemptStatus: test.attemptStatus || test.status || 'not_started',
    showScore: test.showScore,
    score: test.score,
    serverNow: test.serverNow || options.serverNow,
    receivedAt: options.receivedAt,
    deviceNow: options.deviceNow,
    now: options.now,
  });

  if (btnState.action === 'start' || btnState.action === 'resume') {
    return 'open';
  }
  if (btnState.action === 'before_window' || btnState.action === 'not_scheduled') {
    return 'upcoming';
  }
  if (btnState.action === 'submitted' || btnState.action === 'view_result') {
    return 'completed';
  }
  if (btnState.action === 'closed') {
    return 'missed';
  }
  return 'upcoming';
}

/**
 * Counts the number of tests currently open or in-progress for the student.
 *
 * @param {Array} tests
 * @param {Object} [options]
 * @returns {number}
 */
export function countOpenNowTests(tests, options = {}) {
  if (!Array.isArray(tests)) return 0;
  return tests.filter((t) => categorizeTest(t, options) === 'open').length;
}


