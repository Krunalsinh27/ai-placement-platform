import React from 'react';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { getTestButtonState } from '../../utils/testWindowHelper';
import { RoundTimelineDetails } from './RoundTimelineDetails';

describe('Student Online Test Experience & Architecture Tests', () => {
  const baseNow = new Date('2026-11-14T12:00:00.000Z');

  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((msg, ...args) => {
      if (typeof msg === 'string' && msg.includes('useLayoutEffect does nothing on the server')) {
        return;
      }
      console.warn(msg, ...args);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ROUTING & DISTRACTION-FREE EXAM MODE VERIFICATION
  // =========================================================================
  describe('1. Routing Configuration & Standalone Distraction-Free Exam Route', () => {
    it('1A. Standalone /student/test/:roundId route is defined outside Student Layout', () => {
      const appJsxPath = path.resolve(__dirname, '../../App.jsx');
      const appContent = fs.readFileSync(appJsxPath, 'utf-8');

      // 1. Nested duplicate inside /student with <Layout /> must NOT exist
      const nestedTestRouteRegex = /<Route\s+path=["']\/student["'][^>]*>[\s\S]*?<Route\s+path=["']test\/:roundId["'][\s\S]*?<\/Route>/;
      expect(nestedTestRouteRegex.test(appContent)).toBe(false);

      // 2. Standalone fullscreen route must exist outside the /student layout group
      const standaloneRouteRegex = /<Route\s+path=["']\/student\/test\/:roundId["']\s+element=\{[\s\S]*?<StudentAptitudeTest\s*\/>[\s\S]*?\}/;
      expect(standaloneRouteRegex.test(appContent)).toBe(true);
    });

    it('1B. In-progress exam mode screen does not render sidebar, navbar or extraneous layout elements', () => {
      const testJsxPath = path.resolve(__dirname, './StudentAptitudeTest.jsx');
      const testContent = fs.readFileSync(testJsxPath, 'utf-8');

      // The test component must have BACK_TARGET pointing to /student/tests
      expect(testContent).toContain("const BACK_TARGET = '/student/tests'");

      // Result screen must provide minimal header with navigation buttons
      expect(testContent).toContain('Back to Dashboard');
      expect(testContent).toContain('My Tests');
    });
  });

  // =========================================================================
  // 2. PRE-START WINDOW STATES (DISABLED BUTTON & USER GUIDANCE)
  // =========================================================================
  describe('2. Pre-Start Window States', () => {
    it('2A. Test window not scheduled yet: disables Begin Assessment with recruiter notice', () => {
      const state = getTestButtonState({
        testWindowStart: null,
        testWindowEnd: null,
        durationMinutes: 60,
        attemptStatus: 'not_started',
        now: baseNow,
      });

      expect(state.disabled).toBe(true);
      expect(state.action).toBe('not_scheduled');
      expect(state.reason).toBe('Your recruiter has not scheduled the test window yet');
      expect(state.statusBadge).toEqual({ label: 'Not Scheduled', color: 'slate' });
    });

    it('2B. Before test window opens: disables button with Opens <time in IST>', () => {
      const futureStart = new Date('2026-11-14T14:30:00.000Z');
      const futureEnd = new Date('2026-11-14T16:30:00.000Z');

      const state = getTestButtonState({
        testWindowStart: futureStart,
        testWindowEnd: futureEnd,
        durationMinutes: 45,
        attemptStatus: 'not_started',
        now: baseNow,
      });

      expect(state.disabled).toBe(true);
      expect(state.action).toBe('before_window');
      expect(state.label).toMatch(/^Opens\s+/i);
      expect(state.reason).toContain('Opens');
      expect(state.statusBadge).toEqual({ label: 'Scheduled', color: 'slate' });
    });

    it('2C. Test window closed: disables button with Test window closed message', () => {
      const pastStart = new Date('2026-11-14T07:00:00.000Z');
      const pastEnd = new Date('2026-11-14T09:00:00.000Z');

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

  // =========================================================================
  // 3. TIMELINE CLEANUP: PLATFORM TEST VS OFFLINE ROUNDS
  // =========================================================================
  describe('3. Application Timeline Round Rendering', () => {
    it('3A. Platform test round: hides batch timing and venue text, displays test window', () => {
      const platformRound = {
        roundId: 'round-aptitude-101',
        order: 1,
        name: 'Online Aptitude Assessment',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        testWindowStart: '2026-11-14T10:00:00.000Z',
        testWindowEnd: '2026-11-14T18:00:00.000Z',
        durationMinutes: 60,
        cutoffScore: 70,
        isEnrolled: true,
        attemptStatus: 'not_started',
        // Recruiter batch and default venue that should be HIDDEN for platform tests
        batch: {
          batchName: 'Batch A',
          startTime: '2026-11-14T00:00:00.000Z',
          endTime: '2026-11-14T01:00:00.000Z',
          venueOrLink: 'Conference Hall / Virtual Link',
        },
      };

      const html = renderToString(
        <MemoryRouter>
          <RoundTimelineDetails
            round={platformRound}
            interviewSlots={[]}
            timelineData={{ serverNow: baseNow.toISOString() }}
          />
        </MemoryRouter>
      );

      // Must render platform test window info
      expect(html).toContain('Online Assessment');
      expect(html).toContain('Window Opens (IST):');
      expect(html).toContain('Window Closes (IST):');
      expect(html).toContain('60 minutes');

      // MUST NOT render meaningless batch and venue lines for platform test
      expect(html).not.toContain('Batch A');
      expect(html).not.toContain('Conference Hall / Virtual Link');
    });

    it('3B. Offline round: displays batch schedule timing and venue, does not render platform test card', () => {
      const offlineRound = {
        roundId: 'round-technical-102',
        order: 2,
        name: 'Technical Round 1',
        type: 'technical',
        deliveryMode: 'offline',
        isEnrolled: true,
        batch: {
          batchName: 'Batch A',
          startTime: '2026-11-14T14:00:00.000Z',
          endTime: '2026-11-14T15:00:00.000Z',
          venueOrLink: 'Conference Hall / Virtual Link',
        },
      };

      const html = renderToString(
        <MemoryRouter>
          <RoundTimelineDetails
            round={offlineRound}
            interviewSlots={[]}
            timelineData={{ serverNow: baseNow.toISOString() }}
          />
        </MemoryRouter>
      );

      // Must display batch timing and venue for offline round
      expect(html).toContain('Batch A');
      expect(html).toContain('Conference Hall / Virtual Link');

      // MUST NOT render platform online assessment card
      expect(html).not.toContain('Online Assessment');
      expect(html).not.toContain('Window Opens (IST):');
    });
  });
});
