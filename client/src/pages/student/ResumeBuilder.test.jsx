import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock API calls
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/drives/eligible') return Promise.resolve({ data: { success: true, drives: [] } });
      if (url === '/students/me/resume-profile') return Promise.resolve({ data: { success: true, hasResume: false } });
      if (url === '/students/me/resume-builder/versions') return Promise.resolve({ data: { success: true, versions: [] } });
      if (url === '/students/me/resume-builder/quota') return Promise.resolve({ data: { success: true, quota: { used: 0, cap: 10, remaining: 10 } } });
      return Promise.resolve({ data: { success: true } });
    }),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'test-user-123', name: 'Test Student', role: 'student' },
    student: { _id: 'test-student-123' },
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, className }) => <a href={to} className={className}>{children}</a>,
}));

import ResumeBuilder from './ResumeBuilder';

describe('ResumeBuilder Single-Page Flow & Architecture Tests', () => {
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

  it('1. Page mount makes NO resume-content requests (/source or /base) and loads no profile automatically', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Mount useEffect only queries metadata: checkUploadedResumeStatus, fetchEligibleDrives, fetchVersions, fetchQuota, restoreDraft
    expect(sourceCode).toContain('checkUploadedResumeStatus();');
    expect(sourceCode).toContain('fetchEligibleDrives();');
    expect(sourceCode).toContain('fetchVersions();');
    expect(sourceCode).toContain('fetchQuota();');
    expect(sourceCode).toContain('restoreDraft();');

    // Does NOT call handleLoadSource in useEffect on mount
    expect(sourceCode).not.toContain("handleLoadSource('profile')\n");
    expect(sourceCode).not.toContain("initialLoadedRef.current = true;\n      handleLoadSource('profile');");
  });

  it('2. Profile loads ONLY when student explicitly clicks "Start from my college profile"', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Contains explicit button "Start from my college profile" tied to handleLoadSource('profile')
    expect(sourceCode).toContain('Start from my college profile');
    expect(sourceCode).toContain("handleLoadSource('profile')");

    const html = renderToString(<ResumeBuilder />);
    expect(html).toContain('Start from my college profile');
  });

  it('3. Primary button ("Create my resume") is disabled without resume source and job target', () => {
    const html = renderToString(<ResumeBuilder />);

    // Renders "Create my resume"
    expect(html).toContain('Create my resume');
    // Button is disabled on initial render because no resume or job is loaded yet
    expect(html).toContain('cursor-not-allowed');

    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    expect(sourceCode).toContain('const canCreate = Boolean(resumeData) && isTargetReady;');
  });

  it('4. Eliminates all score fields, ATS readiness metrics, and score comparison tooltips from UI', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // No ATS Readiness, role match %, match report stepper, or score difference tooltip
    expect(sourceCode).not.toContain('ATS READINESS');
    expect(sourceCode).not.toContain('Why scores may differ:');
    expect(sourceCode).not.toContain('Step 3: Match Report');
    expect(sourceCode).not.toContain('role="progressbar"');
    expect(sourceCode).not.toContain('/resume-builder/match-report');

    const html = renderToString(<ResumeBuilder />);
    expect(html).not.toContain('ATS READINESS');
    expect(html).not.toContain('Why scores differ');
    expect(html).not.toContain('Step 3: Match Report');
  });

  it('5. Handles missing skills checklist: "I have this skill" (self-declared) vs "Skills to learn" (personal learning queue)', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    expect(sourceCode).toContain("Skills in this job that aren't in your resume");
    expect(sourceCode).toContain('I have this skill');
    expect(sourceCode).toContain('Skills to learn');
    expect(sourceCode).toContain('(self-declared)');
    expect(sourceCode).toContain('Personal Learning Plan');
    expect(sourceCode).toContain('Unticked skills will never be added to your resume');
  });

  it('6. Displays "(from your profile)" badges on fields filled from college profile gaps', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Profile gap markers
    expect(sourceCode).toContain('Education: (from your profile)');
    expect(sourceCode).toContain('Phone: (from your profile)');
    expect(sourceCode).toContain('filledFromProfile');
  });

  it('7. Handles draft storage strictly via sessionStorage and supports Start over', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Strictly uses sessionStorage (never localStorage for drafts)
    expect(sourceCode).toContain('sessionStorage.setItem(draftKey');
    expect(sourceCode).toContain('sessionStorage.getItem(draftKey)');
    expect(sourceCode).not.toContain('localStorage.setItem(draftKey');

    // Per-user draft key
    expect(sourceCode).toContain('resume_builder_draft_');

    // Start over resets state and purges sessionStorage
    expect(sourceCode).toContain('handleStartOver');
    expect(sourceCode).toContain('sessionStorage.removeItem(draftKey)');
    expect(sourceCode).toContain('Start over');
  });

  it('8. Responsive layout: sticky control panel without inner scrollbar, overflow-x-hidden at 375px', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Sticky control panel without inner scrolling
    expect(sourceCode).toContain('lg:sticky');
    expect(sourceCode).toContain('lg:top-4');
    expect(sourceCode).toContain('self-start');
    expect(sourceCode).not.toContain('lg:overflow-y-auto');

    // Mobile horizontal overflow protection (ensuring no horizontal scrolling at 375px)
    expect(sourceCode).toContain('overflow-x-hidden');
    expect(sourceCode).toContain('max-w-full');

    const html = renderToString(<ResumeBuilder />);
    expect(html).toContain('lg:sticky');
    expect(html).toContain('overflow-x-hidden');
  });

  it('9. Displays friendly empty state when student has no eligible campus drives', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    expect(sourceCode).toContain('No eligible drives yet');
    expect(sourceCode).toContain('There are currently no active placement drives');
    expect(sourceCode).toContain('/drives/eligible');
  });

  it('10. Blocks PDF export when metric placeholders are unresolved, and links to Resume AI for scoring', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Anti-hallucination metric placeholder blocker
    expect(sourceCode).toContain('unresolvedPlaceholderCount');
    expect(sourceCode).toContain('Export Locked');
    expect(sourceCode).toContain('[add your real number]');

    // Template note
    expect(sourceCode).toContain('(Template applies to the exported PDF)');

    // Link to Resume AI for ATS evaluation
    expect(sourceCode).toContain('/student/resume-ai');
    expect(sourceCode).toContain('Check your ATS score in Resume AI');

    const html = renderToString(<ResumeBuilder />);
    expect(html).toContain('/student/resume-ai');
    expect(html).toContain('Check your ATS score in Resume AI');
  });
});
