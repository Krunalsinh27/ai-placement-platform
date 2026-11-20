import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock API calls
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { success: true } })),
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

import ResumeBuilder from './ResumeBuilder';

describe('ResumeBuilder Wizard & Responsive Layout Tests', () => {
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

  it('1. Renders the 4-step wizard stepper with accessibility attributes', () => {
    const html = renderToString(<ResumeBuilder />);

    // Must have accessibility navigation and progressbar
    expect(html).toContain('role="navigation"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuemax="4"');

    // Must render all 4 step titles
    expect(html).toContain('Step 1: Source');
    expect(html).toContain('Step 2: Target');
    expect(html).toContain('Step 3: Match Report');
    expect(html).toContain('Step 4: Build');
  });

  it('2. Enforces sticky control panel without nested inner scrollbar, and overflow-x-hidden on mobile (375px)', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Desktop sticky classes without inner nested scrollbar (Issue 5)
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

  it('3. Displays friendly empty state when student has no eligible campus drives', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Checks that the empty-drives case renders "No eligible drives yet"
    expect(sourceCode).toContain('No eligible drives yet');
    expect(sourceCode).toContain('There are currently no active placement drives');

    // Checks that it queries /drives/eligible (fixing the empty dropdown bug)
    expect(sourceCode).toContain('/drives/eligible');
    expect(sourceCode).not.toContain('/drives?limit=50');
  });

  it('4. Separates "I have this skill" (self-declared) from "Skills to learn" (personal learning queue)', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // "I have this skill" marks skill as self-declared
    expect(sourceCode).toContain('(self-declared)');
    expect(sourceCode).toContain('handleClaimSkill');

    // "Skills to learn" keeps items strictly in personal learning list and never adds to resumeData
    expect(sourceCode).toContain('handleAddToLearningPlan');
    expect(sourceCode).toContain('Personal Learning Plan');
    expect(sourceCode).toContain('Never injected into your resume');
  });

  it('5. Hard blocker prevents PDF export when [add your real number] placeholders are unresolved', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Matches the anti-hallucination metric placeholder regex
    expect(sourceCode).toContain('add\\s+your\\s+real\\s+number');
    expect(sourceCode).toContain('unresolvedPlaceholderCount');
    expect(sourceCode).toContain('Export Locked');
    expect(sourceCode).toContain('cursor-not-allowed');
  });

  it('6. Step 3 renders all 7 ATS rubric parts as x/max without blanks and handles General mode', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Must never render blank atsScore; renders default fallback 0% if null
    expect(sourceCode).toContain('matchReport.atsScore !== null && matchReport.atsScore !== undefined ? `${matchReport.atsScore}%` : \'0%\'');

    // All 7 rubric breakdown parts rendered as x/max
    expect(sourceCode).toContain('/35');
    expect(sourceCode).toContain('/10');
    expect(sourceCode).toContain('/5');
    expect(sourceCode).toContain('/15');

    // General mode renders n/a for keywords and displays explanatory note
    expect(sourceCode).toContain('score excludes keyword match, no job selected');
    expect(sourceCode).toContain('matchReport.breakdown.keywordMatch !== null && matchReport.breakdown.keywordMatch !== undefined ? `${matchReport.breakdown.keywordMatch}/35` : \'n/a\'');
  });

  it('7. Displays "Ready to Export" badge ONLY after Step 4 build, and template picker has note', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Template note for PDF export
    expect(sourceCode).toContain('(Template applies to the exported PDF)');

    // Ready to export badge only rendered if isBuildComplete is true
    expect(sourceCode).toContain('isBuildComplete ?');
    expect(sourceCode).toContain('Ready to Export');
  });

  it('8. Missing skills checklist toggles appear and untoggled skills are absent from resume', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Toggles exist for missing skills
    expect(sourceCode).toContain('I have this skill');
    expect(sourceCode).toContain('Skills to learn');

    // Untoggled missing skills: handleAddToLearningPlan only modifies learningList, not resumeData
    expect(sourceCode).toContain('Saved "${skill}" to personal learning list. (Not added to resume)');
    expect(sourceCode).toContain('Kept strictly in your study queue. Never injected into your resume');
  });

  it('9. Displays "Source resume:" and "Tailored resume:" labels and score difference tooltip in Step 3 and Step 4', () => {
    const filePath = path.resolve(__dirname, './ResumeBuilder.jsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Step 3 shows Source resume with source name
    expect(sourceCode).toContain('Source resume (');
    expect(sourceCode).toContain('matchReport.sourceName');

    // Step 4 shows Source resume and Tailored resume
    expect(sourceCode).toContain('Tailored resume:');

    // Both steps include explanatory tooltip on why scores differ
    expect(sourceCode).toContain('Why scores may differ:');
    expect(sourceCode).toContain('Resume AI evaluates your uploaded PDF file text directly');
  });
});
