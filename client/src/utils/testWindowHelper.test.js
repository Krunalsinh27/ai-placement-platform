import { describe, it, expect } from 'vitest';
import { getTestButtonState } from './testWindowHelper';

describe('Platform Test Button State Logic', () => {
  const baseNow = new Date('2026-11-14T12:00:00.000Z');

  it('1. Before test window opens: button is disabled with opening time', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T14:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T16:00:00.000Z'),
      durationMinutes: 45,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(state.disabled).toBe(true);
    expect(state.action).toBe('before_window');
    expect(state.label).toContain('Opens');
    expect(state.reason).toContain('Test window opens on');
  });

  it('2. During test window: button is enabled to Start Test', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T10:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T14:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(state.disabled).toBe(false);
    expect(state.action).toBe('start');
    expect(state.label).toBe('Start Test');
    expect(state.reason).toContain('Assessment window is currently open');
  });

  it('3. In progress session: button is enabled to Resume Test', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T10:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T14:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'in_progress',
      now: baseNow,
    });

    expect(state.disabled).toBe(false);
    expect(state.action).toBe('resume');
    expect(state.label).toBe('Resume Test');
    expect(state.reason).toContain('active');
  });

  it('4. After test window closed without attempt: button is disabled with closed message', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T08:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T11:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'window_closed',
      now: baseNow,
    });

    expect(state.disabled).toBe(true);
    expect(state.action).toBe('closed');
    expect(state.label.toLowerCase()).toBe('test window closed');
  });

  it('5. Submitted test with showScore=true: button is enabled to View Result', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T08:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T14:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'submitted',
      showScore: true,
      score: 85,
      now: baseNow,
    });

    expect(state.disabled).toBe(false);
    expect(state.action).toBe('view_result');
    expect(state.label).toBe('View Result');
    expect(state.reason).toContain('85');
  });

  it('6. Submitted test with showScore=false: button is disabled with Submitted status', () => {
    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T08:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T14:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'submitted',
      showScore: false,
      now: baseNow,
    });

    expect(state.disabled).toBe(true);
    expect(state.action).toBe('submitted');
    expect(state.label).toBe('Submitted');
  });

  it('7. Device clock 30 minutes FAST: uses server time, does not open test early', () => {
    // True server time is 09:45:00 (15 minutes BEFORE window opens at 10:00:00)
    const serverNow = new Date('2026-11-14T09:45:00.000Z');
    // Device clock is 30 mins fast, so device reads 10:15:00 (which would be inside window if local clock trusted)
    const fastDeviceNow = new Date('2026-11-14T10:15:00.000Z');
    const receivedAt = fastDeviceNow; // Received right now on fast device

    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T10:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T12:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'not_started',
      serverNow,
      receivedAt,
      deviceNow: fastDeviceNow,
    });

    // Must be disabled because real server time is 09:45 (before window)
    expect(state.disabled).toBe(true);
    expect(state.action).toBe('before_window');
    expect(state.label).toContain('Opens');
  });

  it('8. Device clock 30 minutes SLOW: uses server time, enables Start Test when window is open', () => {
    // True server time is 10:15:00 (15 minutes AFTER window opened at 10:00:00)
    const serverNow = new Date('2026-11-14T10:15:00.000Z');
    // Device clock is 30 mins slow, so device reads 09:45:00 (which would appear before window if local clock trusted)
    const slowDeviceNow = new Date('2026-11-14T09:45:00.000Z');
    const receivedAt = slowDeviceNow; // Received right now on slow device

    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T10:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T12:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'not_started',
      serverNow,
      receivedAt,
      deviceNow: slowDeviceNow,
    });

    // Must be enabled because real server time is 10:15 (inside open window)
    expect(state.disabled).toBe(false);
    expect(state.action).toBe('start');
    expect(state.label).toBe('Start Test');
  });

  it('9. Elapsed time tracked accurately despite device clock skew', () => {
    // Server says 09:50:00 when response is fetched (10 min before 10:00:00 opening)
    const serverNow = new Date('2026-11-14T09:50:00.000Z');
    const fastDeviceReceivedAt = new Date('2026-11-14T10:20:00.000Z'); // Fast clock at fetch
    // 15 minutes later on client: device reads 10:35:00
    const fastDeviceLater = new Date('2026-11-14T10:35:00.000Z'); // Elapsed = 15 minutes

    const state = getTestButtonState({
      testWindowStart: new Date('2026-11-14T10:00:00.000Z'),
      testWindowEnd: new Date('2026-11-14T12:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'not_started',
      serverNow,
      receivedAt: fastDeviceReceivedAt,
      deviceNow: fastDeviceLater,
    });

    // Server time advanced by 15 mins (09:50 + 15m = 10:05), so window is now open!
    expect(state.disabled).toBe(false);
    expect(state.action).toBe('start');
    expect(state.label).toBe('Start Test');
  });

  it('10. Pre-start state: window not scheduled yet disables button with recruiter notice', () => {
    const stateMissingStart = getTestButtonState({
      testWindowStart: null,
      testWindowEnd: new Date('2026-11-14T12:00:00.000Z'),
      durationMinutes: 60,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(stateMissingStart.disabled).toBe(true);
    expect(stateMissingStart.action).toBe('not_scheduled');
    expect(stateMissingStart.label).toBe('Not Scheduled');
    expect(stateMissingStart.reason).toBe('Your recruiter has not scheduled the test window yet');
    expect(stateMissingStart.statusBadge).toEqual({ label: 'Not Scheduled', color: 'slate' });

    const stateMissingBoth = getTestButtonState({
      testWindowStart: undefined,
      testWindowEnd: undefined,
      durationMinutes: 60,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(stateMissingBoth.disabled).toBe(true);
    expect(stateMissingBoth.action).toBe('not_scheduled');
    expect(stateMissingBoth.reason).toBe('Your recruiter has not scheduled the test window yet');
  });

  it('11. Pre-start state: before window opens disables button with Opens <time in IST>', () => {
    const futureStart = new Date('2026-11-14T15:30:00.000Z');
    const futureEnd = new Date('2026-11-14T17:30:00.000Z');
    const state = getTestButtonState({
      testWindowStart: futureStart,
      testWindowEnd: futureEnd,
      durationMinutes: 60,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(state.disabled).toBe(true);
    expect(state.action).toBe('before_window');
    expect(state.label).toMatch(/^Opens\s+/i);
    expect(state.reason).toContain('Opens');
  });

  it('12. Pre-start state: closed window disables button with Test window closed', () => {
    const pastStart = new Date('2026-11-14T06:00:00.000Z');
    const pastEnd = new Date('2026-11-14T08:00:00.000Z');
    const state = getTestButtonState({
      testWindowStart: pastStart,
      testWindowEnd: pastEnd,
      durationMinutes: 60,
      attemptStatus: 'not_started',
      now: baseNow,
    });

    expect(state.disabled).toBe(true);
    expect(state.action).toBe('closed');
    expect(state.label).toBe('Test window closed');
    expect(state.reason).toBe('Test window closed');
    expect(state.statusBadge).toEqual({ label: 'Window Closed', color: 'rose' });
  });
});

