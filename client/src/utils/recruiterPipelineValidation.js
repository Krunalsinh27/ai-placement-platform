import { parseISTInputValue } from './dateTime';

/**
 * Validates test window timing and duration for platform test rounds.
 *
 * @param {Object} params
 * @param {string|Date} [params.testWindowStart]
 * @param {string|Date} [params.testWindowEnd]
 * @param {number|string} [params.durationMinutes]
 * @param {string} [params.deliveryMode]
 * @returns {{
 *   isValid: boolean,
 *   error?: string,
 *   warning?: string
 * }}
 */
export function validateTestWindow({
  testWindowStart,
  testWindowEnd,
  durationMinutes = 60,
  deliveryMode,
  enforceFutureStart = false,
}) {
  if (deliveryMode === 'platform_test') {
    if (!testWindowStart || (typeof testWindowStart === 'string' && !testWindowStart.trim())) {
      return { isValid: false, error: 'Test Window Start is required for on-platform tests.' };
    }
    if (!testWindowEnd || (typeof testWindowEnd === 'string' && !testWindowEnd.trim())) {
      return { isValid: false, error: 'Test Window End is required for on-platform tests.' };
    }
    const durNum = Number(durationMinutes);
    if (durationMinutes === undefined || durationMinutes === null || durationMinutes === '' || isNaN(durNum) || durNum <= 0) {
      return { isValid: false, error: 'Test duration is required for on-platform tests and must be at least 1 minute.' };
    }
  } else if (!testWindowStart || !testWindowEnd) {
    return { isValid: true };
  }

  const sDate = parseISTInputValue(testWindowStart);
  const eDate = parseISTInputValue(testWindowEnd);
  const startMs = sDate ? sDate.getTime() : NaN;
  const endMs = eDate ? eDate.getTime() : NaN;

  if (isNaN(startMs) || isNaN(endMs)) {
    return { isValid: false, error: 'Invalid date/time format for test window.' };
  }

  if (endMs <= startMs) {
    return { isValid: false, error: 'Test Window End must be after Test Window Start.' };
  }

  if (enforceFutureStart && startMs < Date.now() - 2 * 60 * 1000) {
    return { isValid: false, error: 'Test Window Start cannot be in the past. Please select a current or future time.' };
  }

  const windowMinutes = Math.round((endMs - startMs) / (60 * 1000));
  const duration = Number(durationMinutes) || 60;

  if (deliveryMode === 'platform_test' && duration > windowMinutes) {
    return {
      isValid: false,
      error: `Test duration (${duration} mins) cannot exceed test window length (${windowMinutes} mins).`,
    };
  }

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

/**
 * Synchronized save coordinator that ensures only one API request dispatches
 * and exactly one toast notification triggers during rapid clicks / double clicks.
 *
 * @param {Object} options
 * @param {Function} options.apiCall - Async API call returning { data: { success: boolean, message?: string } }
 * @param {Function} options.onSuccess - Callback on successful response
 * @param {Function} options.onError - Callback on error
 * @param {{ current: boolean }} options.isSavingRef - React ref tracking in-flight save state
 * @returns {(payload: any) => Promise<boolean>}
 */
export function createSafeSaveHandler({ apiCall, onSuccess, onError, isSavingRef }) {
  return async (payload) => {
    if (isSavingRef.current) {
      return false;
    }
    isSavingRef.current = true;
    try {
      const res = await apiCall(payload);
      if (res?.data?.success) {
        onSuccess(res.data);
        return true;
      }
      return false;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      isSavingRef.current = false;
    }
  };
}

