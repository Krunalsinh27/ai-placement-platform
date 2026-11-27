import { describe, it, expect, vi } from 'vitest';
import {
  validateTestWindow,
  isMissingTestWindow,
  roundSettingsFlowReducer,
  createSafeSaveHandler,
} from '../../utils/recruiterPipelineValidation';
import {
  isRecruiterPipelineActive,
  isAdminDrivesActive,
  isStudentApplicationsActive,
} from '../../utils/navigationHelper';

describe('Recruiter Pipeline - Dialog Flow, Navigation & Window Validation', () => {
  // =========================================================================
  // 1. DIALOG FLOW TESTS
  // =========================================================================
  describe('1. Round Settings & Schedule Notification Dialog Flow', () => {
    it('1A. Saving settings hides settings modal and displays notify confirmation dialog on top', () => {
      const initialState = {
        roundSettingsModalOpen: true,
        notifyConfirmOpen: false,
        pendingSettingsPayload: null,
      };

      const updatedState = roundSettingsFlowReducer(initialState, {
        type: 'SUBMIT_SETTINGS',
        participantCount: 15,
        payload: {
          name: 'Online Aptitude Assessment',
          deliveryMode: 'platform_test',
          durationMinutes: 60,
        },
      });

      // Settings modal must be closed/hidden so stacked confirm dialog is not obscured
      expect(updatedState.roundSettingsModalOpen).toBe(false);
      expect(updatedState.notifyConfirmOpen).toBe(true);
      expect(updatedState.pendingSettingsPayload).toEqual({
        name: 'Online Aptitude Assessment',
        deliveryMode: 'platform_test',
        durationMinutes: 60,
      });
    });

    it('1B. Cancelling notify dialog returns to settings modal with values kept intact', () => {
      const dialogOpenState = {
        roundSettingsModalOpen: false,
        notifyConfirmOpen: true,
        pendingSettingsPayload: {
          name: 'Online Aptitude Assessment',
          deliveryMode: 'platform_test',
          durationMinutes: 60,
        },
      };

      const returnedState = roundSettingsFlowReducer(dialogOpenState, {
        type: 'CANCEL_NOTIFY',
      });

      expect(returnedState.notifyConfirmOpen).toBe(false);
      expect(returnedState.roundSettingsModalOpen).toBe(true);
      expect(returnedState.pendingSettingsPayload).toEqual({
        name: 'Online Aptitude Assessment',
        deliveryMode: 'platform_test',
        durationMinutes: 60,
      });
    });

    it('1C. "Save Without Notifying" completes the save and closes both dialogs', () => {
      const dialogOpenState = {
        roundSettingsModalOpen: false,
        notifyConfirmOpen: true,
        pendingSettingsPayload: { name: 'Round 1' },
      };

      const completedState = roundSettingsFlowReducer(dialogOpenState, {
        type: 'COMPLETE_SAVE',
      });

      expect(completedState.notifyConfirmOpen).toBe(false);
      expect(completedState.roundSettingsModalOpen).toBe(false);
      expect(completedState.pendingSettingsPayload).toBeNull();
    });

    it('1D. "Notify & Save" completes the save and closes both dialogs', () => {
      const dialogOpenState = {
        roundSettingsModalOpen: false,
        notifyConfirmOpen: true,
        pendingSettingsPayload: { name: 'Round 1' },
      };

      const completedState = roundSettingsFlowReducer(dialogOpenState, {
        type: 'COMPLETE_SAVE',
      });

      expect(completedState.notifyConfirmOpen).toBe(false);
      expect(completedState.roundSettingsModalOpen).toBe(false);
      expect(completedState.pendingSettingsPayload).toBeNull();
    });
  });

  // =========================================================================
  // 2. SIDEBAR ACTIVE NAVIGATION TESTS
  // =========================================================================
  describe('2. Sidebar Active Navigation Matching', () => {
    it('2A. Recruiter "Drive Pipeline" is active on both /recruiter/pipeline and /recruiter/drives/:id/pipeline', () => {
      expect(isRecruiterPipelineActive('/recruiter/pipeline')).toBe(true);
      expect(
        isRecruiterPipelineActive('/recruiter/drives/6735e8000000000000000001/pipeline')
      ).toBe(true);
      expect(isRecruiterPipelineActive('/recruiter/dashboard')).toBe(false);
      expect(isRecruiterPipelineActive('/recruiter/requirements')).toBe(false);
      expect(isRecruiterPipelineActive('/recruiter/drive-requests')).toBe(false);
    });

    it('2B. Admin / TPO "Drives" is active on both /admin/drives and /admin/drives/:id/progress', () => {
      expect(isAdminDrivesActive('/admin/drives')).toBe(true);
      expect(
        isAdminDrivesActive('/admin/drives/6735e8000000000000000001/progress')
      ).toBe(true);
      expect(isAdminDrivesActive('/admin/dashboard')).toBe(false);
      expect(isAdminDrivesActive('/admin/students')).toBe(false);
    });

    it('2C. Student "My Applications" is active on /student/applications, interview rooms, and tests', () => {
      expect(isStudentApplicationsActive('/student/applications')).toBe(true);
      expect(
        isStudentApplicationsActive('/student/interview/6735e8000000000000000002')
      ).toBe(true);
      expect(
        isStudentApplicationsActive('/student/test/6735e8000000000000000003')
      ).toBe(true);
      expect(isStudentApplicationsActive('/student/dashboard')).toBe(false);
      expect(isStudentApplicationsActive('/student/drives')).toBe(false);
    });
  });

  // =========================================================================
  // 3. ROUND SETTINGS WINDOW VALIDATION TESTS
  // =========================================================================
  describe('3. Test Window Validation', () => {
    it('3A. Blocks saving if testWindowEnd is before testWindowStart', () => {
      const res = validateTestWindow({
        testWindowStart: '2026-11-14T16:00',
        testWindowEnd: '2026-11-14T14:00',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Test Window End must be after Test Window Start.');
    });

    it('3B. Blocks saving if testWindowEnd equals testWindowStart', () => {
      const res = validateTestWindow({
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '2026-11-14T14:00',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Test Window End must be after Test Window Start.');
    });

    it('3C. Displays warning when test window is shorter than duration', () => {
      // 45 minute window, but test duration is 60 minutes
      const res = validateTestWindow({
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '2026-11-14T14:45',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(true);
      expect(res.warning).toBe(
        'Students who start late will get less than the full duration'
      );
    });

    it('3D. Valid window longer than or equal to duration passes without warnings', () => {
      // 120 minute window for 60 minute test
      const res = validateTestWindow({
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '2026-11-14T16:00',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(true);
      expect(res.warning).toBeUndefined();
    });

    it('3E. Rejects platform_test if testWindowStart is missing', () => {
      const res = validateTestWindow({
        deliveryMode: 'platform_test',
        testWindowStart: '',
        testWindowEnd: '2026-11-14T16:00',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Test Window Start is required for on-platform tests.');
    });

    it('3F. Rejects platform_test if testWindowEnd is missing', () => {
      const res = validateTestWindow({
        deliveryMode: 'platform_test',
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '',
        durationMinutes: 60,
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Test Window End is required for on-platform tests.');
    });

    it('3G. Rejects platform_test if durationMinutes is missing or non-positive', () => {
      const resMissing = validateTestWindow({
        deliveryMode: 'platform_test',
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '2026-11-14T16:00',
        durationMinutes: '',
      });
      expect(resMissing.isValid).toBe(false);
      expect(resMissing.error).toBe('Test duration is required for on-platform tests and must be at least 1 minute.');

      const resZero = validateTestWindow({
        deliveryMode: 'platform_test',
        testWindowStart: '2026-11-14T14:00',
        testWindowEnd: '2026-11-14T16:00',
        durationMinutes: 0,
      });
      expect(resZero.isValid).toBe(false);
      expect(resZero.error).toBe('Test duration is required for on-platform tests and must be at least 1 minute.');
    });

    it('3H. Other delivery modes without test window remain valid (unchanged)', () => {
      const resExternal = validateTestWindow({
        deliveryMode: 'online_external',
        testWindowStart: '',
        testWindowEnd: '',
      });
      expect(resExternal.isValid).toBe(true);

      const resOffline = validateTestWindow({
        deliveryMode: 'offline_campus',
        testWindowStart: null,
        testWindowEnd: null,
      });
      expect(resOffline.isValid).toBe(true);
    });
  });

  // =========================================================================
  // 4. MISSING WINDOW WARNING BANNER TESTS
  // =========================================================================
  describe('4. Missing Test Window Detection', () => {
    it('4A. Returns true for platform_test with enrolled students but no test window', () => {
      const roundWithParticipants = {
        deliveryMode: 'platform_test',
        participants: [{ _id: 'p1' }, { _id: 'p2' }],
        testWindowStart: null,
        testWindowEnd: null,
      };
      expect(isMissingTestWindow(roundWithParticipants)).toBe(true);

      const roundWithMetrics = {
        deliveryMode: 'platform_test',
        metrics: { totalEnrolled: 8 },
        testWindowStart: '',
        testWindowEnd: '',
      };
      expect(isMissingTestWindow(roundWithMetrics)).toBe(true);
    });

    it('4B. Returns false for platform_test with scheduled window', () => {
      const scheduledRound = {
        deliveryMode: 'platform_test',
        participants: [{ _id: 'p1' }],
        testWindowStart: '2026-11-14T10:00:00.000Z',
        testWindowEnd: '2026-11-14T12:00:00.000Z',
      };
      expect(isMissingTestWindow(scheduledRound)).toBe(false);
    });

    it('4C. Returns false for platform_test with zero enrolled students', () => {
      const emptyRound = {
        deliveryMode: 'platform_test',
        participants: [],
        metrics: { totalEnrolled: 0 },
        testWindowStart: null,
        testWindowEnd: null,
      };
      expect(isMissingTestWindow(emptyRound)).toBe(false);
    });

    it('4D. Returns false for non-platform test rounds (offline campus or interview)', () => {
      const offlineRound = {
        deliveryMode: 'offline_campus',
        participants: [{ _id: 'p1' }],
        testWindowStart: null,
        testWindowEnd: null,
      };
      expect(isMissingTestWindow(offlineRound)).toBe(false);
    });
  });

  // =========================================================================
  // 5. DOUBLE CLICK / CONCURRENT SAVE PREVENTION TESTS
  // =========================================================================
  describe('5. Double Click / Concurrent Save Prevention Tests', () => {
    it('5A. Double click on Save sends exactly one request and displays exactly one toast', async () => {
      const isSavingRef = { current: false };
      let apiCallCount = 0;
      let successToastCount = 0;
      let errorToastCount = 0;

      const mockApiCall = vi.fn(async () => {
        apiCallCount++;
        // Simulate in-flight asynchronous network latency
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: { success: true, message: 'Round settings updated successfully' } };
      });

      const onSuccess = vi.fn(() => {
        successToastCount++;
      });
      const onError = vi.fn(() => {
        errorToastCount++;
      });

      const safeSaveHandler = createSafeSaveHandler({
        apiCall: mockApiCall,
        onSuccess,
        onError,
        isSavingRef,
      });

      // Fire 2 rapid concurrent clicks (simulating double click)
      const [res1, res2] = await Promise.all([
        safeSaveHandler({ name: 'Round 1' }),
        safeSaveHandler({ name: 'Round 1' }),
      ]);

      expect(apiCallCount).toBe(1);
      expect(mockApiCall).toHaveBeenCalledTimes(1);
      expect(successToastCount).toBe(1);
      expect(errorToastCount).toBe(0);
      expect(res1).toBe(true);
      expect(res2).toBe(false);
      expect(isSavingRef.current).toBe(false);
    });

    it('5B. Subsequent save after first completes is allowed and succeeds', async () => {
      const isSavingRef = { current: false };
      let apiCallCount = 0;
      const mockApiCall = vi.fn(async () => {
        apiCallCount++;
        return { data: { success: true } };
      });
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const safeSaveHandler = createSafeSaveHandler({
        apiCall: mockApiCall,
        onSuccess,
        onError,
        isSavingRef,
      });

      const first = await safeSaveHandler({ cutoffScore: 60 });
      expect(first).toBe(true);
      expect(apiCallCount).toBe(1);

      const second = await safeSaveHandler({ cutoffScore: 70 });
      expect(second).toBe(true);
      expect(apiCallCount).toBe(2);
    });
  });
});

