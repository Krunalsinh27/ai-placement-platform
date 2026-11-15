/**
 * Validates test window timing and duration for platform test rounds.
 *
 * @param {Object} params
 * @param {string|Date} params.testWindowStart
 * @param {string|Date} params.testWindowEnd
 * @param {number|string} [params.durationMinutes]
 * @returns {{
 *   isValid: boolean,
 *   error?: string,
 *   warning?: string
 * }}
 */
export function validateTestWindow({ testWindowStart, testWindowEnd, durationMinutes = 60 }) {
  if (!testWindowStart || !testWindowEnd) {
    return { isValid: true };
  }

  const startMs = new Date(testWindowStart).getTime();
  const endMs = new Date(testWindowEnd).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return { isValid: false, error: 'Invalid date/time format for test window.' };
  }

  if (endMs <= startMs) {
    return { isValid: false, error: 'Test Window End must be after Test Window Start.' };
  }

  const windowMinutes = (endMs - startMs) / (60 * 1000);
  const duration = Number(durationMinutes) || 60;

  if (windowMinutes < duration) {
    return {
      isValid: true,
      warning: 'Students who start late will get less than the full duration',
    };
  }

  return { isValid: true };
}

/**
 * Checks whether a platform_test round is missing its test window schedule.
 *
 * @param {Object} round
 * @returns {boolean}
 */
export function isMissingTestWindow(round) {
  if (!round || round.deliveryMode !== 'platform_test') return false;
  const enrolledCount = round.participants?.length || round.metrics?.totalEnrolled || 0;
  if (enrolledCount <= 0) return false;
  return !round.testWindowStart || !round.testWindowEnd;
}

/**
 * State reducer for managing round settings modal and schedule update notification dialog flow.
 *
 * @param {Object} state
 * @param {boolean} state.roundSettingsModalOpen
 * @param {boolean} state.notifyConfirmOpen
 * @param {Object|null} state.pendingSettingsPayload
 * @param {Object} action
 * @returns {Object}
 */
export function roundSettingsFlowReducer(state, action) {
  switch (action.type) {
    case 'SUBMIT_SETTINGS': {
      const { payload, participantCount } = action;
      if (participantCount > 0) {
        return {
          ...state,
          roundSettingsModalOpen: false, // Settings modal is hidden while confirmation is displayed
          notifyConfirmOpen: true,       // Notify confirmation dialog is displayed
          pendingSettingsPayload: payload,
        };
      }
      return {
        ...state,
        roundSettingsModalOpen: false,
        notifyConfirmOpen: false,
        pendingSettingsPayload: null,
      };
    }
    case 'CANCEL_NOTIFY': {
      return {
        ...state,
        notifyConfirmOpen: false,
        roundSettingsModalOpen: true, // Returns to settings modal with values kept
      };
    }
    case 'COMPLETE_SAVE': {
      return {
        ...state,
        roundSettingsModalOpen: false,
        notifyConfirmOpen: false,
        pendingSettingsPayload: null,
      };
    }
    default:
      return state;
  }
}

