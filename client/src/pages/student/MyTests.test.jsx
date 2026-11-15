import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import {
  categorizeTest,
  countOpenNowTests,
  getTestButtonState,
} from '../../utils/testWindowHelper';

// Mock AuthContext for testing Sidebar
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'st-101', name: 'Student Tester', email: 'student@college.edu', role: 'student' },
    isAdmin: false,
  }),
}));

import Sidebar from '../../components/layout/Sidebar';

describe('Student My Tests Page & Sidebar Badge Tests', () => {
  const baseNow = new Date('2026-11-15T10:00:00.000Z');

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

  // Mock fake test datasets
  const fakeTests = [
    // 1. Open Now (Window is currently open)
    {
      roundId: 'round-open-1',
      roundName: 'Aptitude Screening',
      name: 'Aptitude Screening',
      companyName: 'Acme Corp',
      driveTitle: 'Full Stack Engineer',
      testWindowStart: '2026-11-15T09:00:00.000Z',
      testWindowEnd: '2026-11-15T12:00:00.000Z',
      durationMinutes: 60,
      attemptStatus: 'not_started',
    },
    // 2. Open Now (In progress session)
    {
      roundId: 'round-open-2',
      roundName: 'Coding Assessment',
      name: 'Coding Assessment',
      companyName: 'Stripe',
      driveTitle: 'Backend Engineer',
      testWindowStart: '2026-11-15T08:00:00.000Z',
      testWindowEnd: '2026-11-15T11:00:00.000Z',
      durationMinutes: 90,
      attemptStatus: 'in_progress',
    },
    // 3. Upcoming (Opens in the future)
    {
      roundId: 'round-upcoming-1',
      roundName: 'Technical Aptitude',
      name: 'Technical Aptitude',
      companyName: 'Google',
      driveTitle: 'Software Engineer',
      testWindowStart: '2026-11-15T14:00:00.000Z',
      testWindowEnd: '2026-11-15T16:00:00.000Z',
      durationMinutes: 60,
      attemptStatus: 'not_started',
    },
    // 4. Upcoming (Unscheduled test window)
    {
      roundId: 'round-upcoming-2',
      roundName: 'Quant Test',
      name: 'Quant Test',
      companyName: 'Citadel',
      driveTitle: 'Quantitative Analyst',
      testWindowStart: null,
      testWindowEnd: null,
      durationMinutes: 45,
      attemptStatus: 'not_started',
    },
    // 5. Completed (Submitted test)
    {
      roundId: 'round-completed-1',
      roundName: 'General Aptitude',
      name: 'General Aptitude',
      companyName: 'Microsoft',
      driveTitle: 'Cloud Engineer',
      testWindowStart: '2026-11-14T10:00:00.000Z',
      testWindowEnd: '2026-11-14T14:00:00.000Z',
      durationMinutes: 60,
      attemptStatus: 'submitted',
      showScore: true,
      score: 88,
    },
    // 6. Missed (Window closed without submission)
    {
      roundId: 'round-missed-1',
      roundName: 'Logic Round',
      name: 'Logic Round',
      companyName: 'Amazon',
      driveTitle: 'SDE 1',
      testWindowStart: '2026-11-14T08:00:00.000Z',
      testWindowEnd: '2026-11-14T09:00:00.000Z',
      durationMinutes: 60,
      attemptStatus: 'window_closed',
    },
  ];

  // =========================================================================
  // 1. TABS CATEGORIZATION TESTS
  // =========================================================================
  describe('1. Test Categorization across the 4 Tabs', () => {
    it('1A. Correctly categorizes open tests into "open" tab', () => {
      const cat1 = categorizeTest(fakeTests[0], { now: baseNow });
      expect(cat1).toBe('open');

      const cat2 = categorizeTest(fakeTests[1], { now: baseNow });
      expect(cat2).toBe('open');
    });

    it('1B. Correctly categorizes future and unscheduled tests into "upcoming" tab', () => {
      const cat1 = categorizeTest(fakeTests[2], { now: baseNow });
      expect(cat1).toBe('upcoming');

      const cat2 = categorizeTest(fakeTests[3], { now: baseNow });
      expect(cat2).toBe('upcoming');
    });

    it('1C. Correctly categorizes submitted attempts into "completed" tab', () => {
      const cat = categorizeTest(fakeTests[4], { now: baseNow });
      expect(cat).toBe('completed');
    });

    it('1D. Correctly categorizes closed windows without submission into "missed" tab', () => {
      const cat = categorizeTest(fakeTests[5], { now: baseNow });
      expect(cat).toBe('missed');
    });
  });

  // =========================================================================
  // 2. EMPTY STATE TESTS
  // =========================================================================
  describe('2. Empty State Handling', () => {
    it('2A. Empty state message "No online tests scheduled" is defined for empty lists', () => {
      const myTestsPath = path.resolve(__dirname, './MyTests.jsx');
      const content = fs.readFileSync(myTestsPath, 'utf-8');

      // Must display the exact empty state text required by spec
      expect(content).toContain('No online tests scheduled');
    });

    it('2B. countOpenNowTests returns 0 for empty test array', () => {
      expect(countOpenNowTests([], { now: baseNow })).toBe(0);
      expect(countOpenNowTests(null, { now: baseNow })).toBe(0);
    });
  });

  // =========================================================================
  // 3. SIDEBAR BADGE & REFRESH SPECIFICATION TESTS
  // =========================================================================
  describe('3. Sidebar Item & Open Now Badge', () => {
    it('3A. countOpenNowTests accurately counts only currently open or active tests', () => {
      const openCount = countOpenNowTests(fakeTests, { now: baseNow });
      // Exactly 2 tests in fakeTests are open (Acme Corp open window, Stripe in_progress)
      expect(openCount).toBe(2);
    });

    it('3B. Sidebar links include "My Tests" between "My Applications" and "Ask AI"', () => {
      const sidebarPath = path.resolve(__dirname, '../../components/layout/Sidebar.jsx');
      const content = fs.readFileSync(sidebarPath, 'utf-8');

      const studentLinksMatch = content.match(/const studentLinks = \[([\s\S]*?)\];/);
      expect(studentLinksMatch).toBeTruthy();
      const studentLinksStr = studentLinksMatch[1];

      const applicationsIdx = studentLinksStr.indexOf("name: 'My Applications'");
      const testsIdx = studentLinksStr.indexOf("name: 'My Tests'");
      const assistantIdx = studentLinksStr.indexOf("name: 'Ask AI'");

      expect(applicationsIdx).toBeGreaterThan(-1);
      expect(testsIdx).toBeGreaterThan(applicationsIdx);
      expect(assistantIdx).toBeGreaterThan(testsIdx);
    });

    it('3C. Sidebar item highlights on /student/tests route', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/student/tests']}>
          <Sidebar isOpen={true} onClose={() => {}} />
        </MemoryRouter>
      );

      // Must render link to /student/tests
      expect(html).toContain('href="/student/tests"');
      expect(html).toContain('My Tests');

      // Active link has bg-indigo-600
      expect(html).toContain('bg-indigo-600');
    });

    it('3D. Sidebar polling respects visibilitychange and 60-second intervals', () => {
      const sidebarPath = path.resolve(__dirname, '../../components/layout/Sidebar.jsx');
      const content = fs.readFileSync(sidebarPath, 'utf-8');

      // Verifies 60,000 ms refresh interval
      expect(content).toContain('60000');
      // Verifies document.hidden check (only while tab is visible)
      expect(content).toContain('document.hidden');
      // Verifies visibilitychange listener
      expect(content).toContain('visibilitychange');
      // Verifies hits the rate-limited endpoint
      expect(content).toContain('/students/my-tests');
    });
  });

  // =========================================================================
  // 4. DASHBOARD "VIEW ALL" LINK & TEST ENGINE SAFETY
  // =========================================================================
  describe('4. Dashboard Link & Test Engine Safety', () => {
    it('4A. Student Dashboard contains "View all" link to /student/tests', () => {
      const dashPath = path.resolve(__dirname, './StudentDashboard.jsx');
      const content = fs.readFileSync(dashPath, 'utf-8');

      expect(content).toContain('to="/student/tests"');
      expect(content).toContain('View all');
    });

    it('4B. StudentAptitudeTest back links target /student/tests', () => {
      const testPath = path.resolve(__dirname, './StudentAptitudeTest.jsx');
      const content = fs.readFileSync(testPath, 'utf-8');

      expect(content).toContain("const BACK_TARGET = '/student/tests'");
      expect(content).toContain('to="/student/tests"');
      expect(content).toContain('My Tests');
    });
  });
});
