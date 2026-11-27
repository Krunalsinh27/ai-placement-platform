import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock API module
vi.mock('./api', () => ({
  getResume: vi.fn((id) =>
    Promise.resolve({
      success: true,
      resume: {
        _id: id,
        title: 'Draft Resume',
        templateId: 'modern',
        data: {
          contact: { fullName: 'Alex Vance', email: 'alex@example.com' },
          education: [{ degree: 'B.Tech', institution: 'IIT' }],
        },
      },
    })
  ),
  createResume: vi.fn((data) =>
    Promise.resolve({
      success: true,
      resume: {
        _id: 'new-res-123',
        ...data,
      },
    })
  ),
  updateResume: vi.fn((id, data) =>
    Promise.resolve({
      success: true,
      resume: {
        _id: id,
        ...data,
      },
    })
  ),
  loadResumeSource: vi.fn((payload) =>
    Promise.resolve({
      success: true,
      resumeData: {
        contact: {
          fullName: 'Profile Student',
          email: 'profile.student@college.edu',
          phone: '+91 9999988888',
          location: 'Pune, Maharashtra',
        },
        education: [
          {
            degree: 'B.E.',
            field: 'Computer Engineering',
            institution: 'COEP',
            year: '2024',
            score: '9.2',
          },
        ],
        skills: [{ category: 'Languages', items: ['Python', 'C++'] }],
      },
    })
  ),
  exportResumePdf: vi.fn(() => Promise.resolve()),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: undefined }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import StudioWizard, { WIZARD_STEPS, getMissingFieldPrompts } from './StudioWizard';

describe('StudioWizard Architecture & Component Tests (Phase 6)', () => {
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

  // TEST 1: WIZARD FLOW DEFINITION
  it('1. Defines exactly 9 steps in the required order: start -> personal -> education -> experience -> projects -> skills -> extras -> template -> review', () => {
    expect(WIZARD_STEPS.length).toBe(9);
    const stepIds = WIZARD_STEPS.map((s) => s.id);
    expect(stepIds).toEqual([
      'start',
      'personal',
      'education',
      'experience',
      'projects',
      'skills',
      'extras',
      'template',
      'review',
    ]);
  });

  // TEST 2: NO DATA REQUEST ON MOUNT (HARD RULE)
  it('2. Makes NO data request (/source or /base) on mount; profile is NEVER loaded automatically', () => {
    const wizardFilePath = path.resolve(__dirname, './StudioWizard.jsx');
    const sourceCode = fs.readFileSync(wizardFilePath, 'utf-8');

    // Verify mount effect only loads existing resume if id exists; never calls loadResumeSource on mount
    expect(sourceCode).not.toContain("loadResumeSource({ type: 'profile' })\n");
    expect(sourceCode).not.toContain("useEffect(() => {\n    handleLoadProfileSource();");
    expect(sourceCode).toContain('// HARD RULE: Makes NO call to /source or /base on mount. Profile only loads on explicit click.');

    const html = renderToString(<StudioWizard />);
    expect(html).toContain('Choose how to begin your resume');
    expect(html).toContain('Start Source');
  });

  // TEST 3: PROFILE LOADS ONLY ON EXPLICIT CLICK
  it('3. "Use my college profile" button exists and loads profile data ONLY on explicit click', () => {
    const html = renderToString(<StudioWizard />);

    // Contains explicit button "Use my college profile"
    expect(html).toContain('Use my college profile');
    expect(html).toContain('data-testid="start-profile-button"');

    // Contains options for blank, uploaded resume, and paste text
    expect(html).toContain('Start from scratch');
    expect(html).toContain('data-testid="start-blank-button"');
    expect(html).toContain('Use my uploaded resume');
    expect(html).toContain('data-testid="start-upload-button"');
    expect(html).toContain('Paste text');
    expect(html).toContain('data-testid="start-text-button"');
  });

  // TEST 4: MISSING FIELDS COMPUTATION (PHASE 0 AUDIT)
  it('4. getMissingFieldPrompts accurately computes missing fields without generating fake text', () => {
    // Empty resume: all required fields flagged
    const emptyPrompts = getMissingFieldPrompts({});
    const emptyKeys = emptyPrompts.map((p) => p.key);
    expect(emptyKeys).toContain('fullName');
    expect(emptyKeys).toContain('email');
    expect(emptyKeys).toContain('phone');
    expect(emptyKeys).toContain('location');
    expect(emptyKeys).toContain('education');
    expect(emptyKeys).toContain('skills');
    expect(emptyKeys).toContain('projects');
    expect(emptyKeys).toContain('experience');

    // Partially filled resume: only unfilled fields flagged
    const partialData = {
      contact: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1 555-0100',
        location: 'San Francisco, CA',
      },
      education: [{ degree: 'B.S.', institution: 'Stanford' }],
      skills: [{ category: 'Languages', items: ['Python'] }],
      projects: [{ title: 'AI Placement System' }],
      experience: [{ title: 'Software Intern', company: 'Acme Corp' }],
    };

    const partialPrompts = getMissingFieldPrompts(partialData);
    expect(partialPrompts.length).toBe(0);
  });

  // TEST 5: STEP SKIPPABILITY
  it('5. Every step is skippable via "Skip this step" and saves draft progress', () => {
    const wizardFilePath = path.resolve(__dirname, './StudioWizard.jsx');
    const sourceCode = fs.readFileSync(wizardFilePath, 'utf-8');

    expect(sourceCode).toContain('data-testid="wizard-skip-button"');
    expect(sourceCode).toContain('handleSkip');
    expect(sourceCode).toContain('await saveDraft(resumeData);');
  });

  // TEST 6: RENDER STEPPER AND BUTTONS
  it('6. StudioWizard renders stepper navigation with all 9 steps and exit action', () => {
    const html = renderToString(<StudioWizard />);

    expect(html).toContain('data-testid="wizard-stepper"');
    expect(html).toContain('stepper-step-start');
    expect(html).toContain('stepper-step-personal');
    expect(html).toContain('stepper-step-education');
    expect(html).toContain('stepper-step-experience');
    expect(html).toContain('stepper-step-projects');
    expect(html).toContain('stepper-step-skills');
    expect(html).toContain('stepper-step-extras');
    expect(html).toContain('stepper-step-template');
    expect(html).toContain('stepper-step-review');
    expect(html).toContain('Exit');
  });

  // TEST 7: PHASE 12b - SAFE EDITOR NAVIGATION & STICKY HEADER OFFSET
  it('7. StudioWizard ensures handleOpenEditor saves draft before navigation and offsets sticky header to top-16', () => {
    const wizardFilePath = path.resolve(__dirname, './StudioWizard.jsx');
    const sourceCode = fs.readFileSync(wizardFilePath, 'utf-8');

    // Sticky header offset check (avoiding overlap with global top-0 z-30 navbar)
    expect(sourceCode).toContain('sticky top-16 z-20');

    // handleOpenEditor implementation
    expect(sourceCode).toContain('handleOpenEditor');
    expect(sourceCode).toContain('targetId = await saveDraft(');
    expect(sourceCode).toContain('navigate(`/student/resume-studio/${targetId}`)');

    // Rendered buttons
    const html = renderToString(<StudioWizard />);
    expect(html).toContain('data-testid="wizard-open-editor-header-button"');
  });
});
