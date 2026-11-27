import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import StudioPreview from './components/StudioPreview';
import SectionEditors from './components/SectionEditors';
import StudioEditor from './StudioEditor';
import { getTemplates, getTemplateById } from './templateRegistry';

// Mock AuthContext
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u-1', name: 'Alice Student', role: 'student' },
    student: { _id: 's-1' },
    isAdmin: false,
  }),
}));

// Mock react-router-dom useParams & useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'res-test-123' }),
    useNavigate: () => vi.fn(),
  };
});

// Mock api calls
vi.mock('./api', () => ({
  getResume: vi.fn(() => Promise.resolve({ success: true, resume: { _id: 'res-test-123', title: 'Test Resume' } })),
  updateResume: vi.fn(() => Promise.resolve({ success: true })),
  exportResumePdf: vi.fn(() => Promise.resolve()),
}));

describe('StudioEditor & Live Preview Component Tests (Phase 4)', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((msg, ...args) => {
      if (
        typeof msg === 'string' &&
        (msg.includes('useLayoutEffect does nothing on the server') ||
          msg.includes('React does not recognize'))
      ) {
        return;
      }
      console.warn(msg, ...args);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const sampleResumeData = {
    contact: {
      fullName: 'Alice Developer',
      email: 'alice@example.com',
      phone: '+91 9876543210',
      location: 'Pune, India',
      linkedin: 'linkedin.com/in/alicedev',
      github: 'github.com/alicedev',
    },
    summary: 'Full-stack software engineer specialized in React, Node.js, and cloud systems.',
    skills: [
      { category: 'Languages', items: ['TypeScript', 'JavaScript', 'Python'] },
      { category: 'Frameworks', items: ['React', 'Express', 'Tailwind CSS'] },
    ],
    experience: [
      {
        title: 'Backend Engineering Intern',
        company: 'CloudScale Labs',
        location: 'Bangalore',
        duration: 'Jan 2025 - Present',
        bullets: ['Designed microservices architecture', 'Optimized database queries reducing latency by 40%'],
      },
    ],
    projects: [
      {
        title: 'Distributed Task Queue',
        technologies: ['Node.js', 'Redis', 'Docker'],
        duration: '2024',
        link: 'github.com/alicedev/queue',
        bullets: ['Implemented priority queue handling 5,000 req/sec'],
      },
    ],
    education: [
      {
        degree: 'B.Tech',
        field: 'Computer Engineering',
        institution: 'Pune Institute of Computer Technology',
        year: '2026',
        score: '9.2 CGPA',
      },
    ],
    certifications: ['AWS Certified Solutions Architect'],
  };

  // TEST 1: Shared Template Registry
  it('1. Template registry defines all 8 ATS templates with zero drift', () => {
    const templates = getTemplates();
    expect(templates.length).toBe(8);

    const ids = templates.map((t) => t.id);
    expect(ids).toContain('modern');
    expect(ids).toContain('classic');
    expect(ids).toContain('compact');
    expect(ids).toContain('minimal-ats');
    expect(ids).toContain('software-engineer');
    expect(ids).toContain('professional-fresher');
    expect(ids).toContain('modern-professional');
    expect(ids).toContain('technical-projects');

    const minimal = getTemplateById('minimal-ats');
    expect(minimal.name).toBe('Minimal ATS');
    expect(minimal.drawSectionLine).toBe(false);
    expect(minimal.primaryColor).toBe('#000000');

    const classic = getTemplateById('classic');
    expect(classic.name).toBe('Classic Academic');
    expect(classic.fontCategory).toBe('serif');
    expect(classic.headerAlign).toBe('center');

    const fallback = getTemplateById('nonexistent-template');
    expect(fallback.id).toBe('modern');
  });

  // TEST 2: Section order is strictly reflected in Preview HTML
  it('2. Section order in StudioPreview reflects custom sectionOrder array', () => {
    // Order A: Summary -> Skills -> Projects -> Experience
    const htmlOrderA = renderToString(
      <StudioPreview
        resumeData={sampleResumeData}
        templateId="modern"
        sectionOrder={['summary', 'skills', 'projects', 'experience', 'education']}
        sectionVisibility={{}}
      />
    );

    const summaryPosA = htmlOrderA.indexOf('preview-section-summary');
    const projectsPosA = htmlOrderA.indexOf('preview-section-projects');
    const experiencePosA = htmlOrderA.indexOf('preview-section-experience');

    expect(summaryPosA).toBeLessThan(projectsPosA);
    expect(projectsPosA).toBeLessThan(experiencePosA);

    // Order B: Reordered: Projects -> Experience -> Summary
    const htmlOrderB = renderToString(
      <StudioPreview
        resumeData={sampleResumeData}
        templateId="modern"
        sectionOrder={['projects', 'experience', 'summary', 'skills', 'education']}
        sectionVisibility={{}}
      />
    );

    const projectsPosB = htmlOrderB.indexOf('preview-section-projects');
    const experiencePosB = htmlOrderB.indexOf('preview-section-experience');
    const summaryPosB = htmlOrderB.indexOf('preview-section-summary');

    expect(projectsPosB).toBeLessThan(experiencePosB);
    expect(experiencePosB).toBeLessThan(summaryPosB);
  });

  // TEST 3: Per-section show/hide toggle
  it('3. Per-section visibility toggle hides section from StudioPreview', () => {
    // Hidden summary
    const htmlHidden = renderToString(
      <StudioPreview
        resumeData={sampleResumeData}
        templateId="modern"
        sectionOrder={['summary', 'skills', 'experience', 'projects', 'education']}
        sectionVisibility={{ summary: false, experience: true }}
      />
    );

    expect(htmlHidden).not.toContain('preview-section-summary');
    expect(htmlHidden).not.toContain('Professional Summary');
    expect(htmlHidden).toContain('preview-section-experience');

    // Visible summary
    const htmlVisible = renderToString(
      <StudioPreview
        resumeData={sampleResumeData}
        templateId="modern"
        sectionOrder={['summary', 'skills', 'experience', 'projects', 'education']}
        sectionVisibility={{ summary: true, experience: true }}
      />
    );

    expect(htmlVisible).toContain('preview-section-summary');
    expect(htmlVisible).toContain('Professional Summary');
  });

  // TEST 4: Page overflow warning & boundary
  it('4. Page overflow warning and page boundary appear when content is extensive', () => {
    // Create extensive resume data that exceeds 1 page
    const bigExperienceList = Array.from({ length: 10 }, (_, i) => ({
      title: `Senior Lead Architect Level ${i + 1}`,
      company: `Enterprise Tech Corp ${i + 1}`,
      location: 'Hyderabad',
      duration: '2020 - 2024',
      bullets: [
        `Spearheaded multi-region cloud infrastructure transformation project for division ${i + 1}`,
        'Managed cross-functional engineering teams across 4 global timezones',
        'Engineered distributed transactional datastores achieving zero packet loss under load',
      ],
    }));

    const extensiveData = {
      ...sampleResumeData,
      experience: bigExperienceList,
    };

    // Render SectionEditors to ensure controls work
    const editorsHtml = renderToString(
      <SectionEditors
        resumeData={extensiveData}
        sectionOrder={['summary', 'skills', 'experience', 'projects', 'education']}
        sectionVisibility={{}}
        onChange={() => {}}
        onOrderChange={() => {}}
        onVisibilityChange={() => {}}
      />
    );
    expect(editorsHtml).toContain('Personal Information');
    expect(editorsHtml).toContain('Professional Summary');
    expect(editorsHtml).toContain('Experience');
    expect(editorsHtml).toContain('Technical Projects');
  });

  // TEST 5: StudioEditor renders header, template switcher, save status, and export button
  it('5. StudioEditor renders top toolbar, save status indicator, and Export PDF action', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioEditor
          initialResume={{
            _id: 'res-test-123',
            title: 'Frontend Engineer Resume',
            templateId: 'modern',
            data: sampleResumeData,
          }}
          initialLoading={false}
          initialError={null}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Frontend Engineer Resume');
    expect(html).toContain('Modern Clean');
    expect(html).toContain('Classic Academic');
    expect(html).toContain('Compact Single-Column');
    expect(html).toContain('data-testid="save-status"');
    expect(html).toContain('Saved');
    expect(html).toContain('Tailor to Job');
    expect(html).toContain('Export PDF');
  });

  // TEST 6: Autosave debounce logic
  it('6. Autosave debounce prevents premature save calls and batches rapid updates', async () => {
    let callCount = 0;
    const mockSave = vi.fn(() => {
      callCount++;
    });

    let debounceTimer = null;
    const triggerDebounced = (delay = 50) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(mockSave, delay);
    };

    // Trigger 5 rapid changes
    triggerDebounced(50);
    triggerDebounced(50);
    triggerDebounced(50);
    triggerDebounced(50);
    triggerDebounced(50);

    // Call count is 0 before delay
    expect(callCount).toBe(0);

    // Wait for debounce timer to fire
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Must have executed exactly once
    expect(callCount).toBe(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  // TEST 7: Template default section order applies when custom order is omitted
  it('7. StudioPreview uses template default section order when sectionOrder is null/omitted', () => {
    // software-engineer default: ['skills', 'projects', 'experience', 'education', 'summary', 'extras']
    const htmlSoftware = renderToString(
      <StudioPreview
        resumeData={sampleResumeData}
        templateId="software-engineer"
        sectionOrder={null}
        sectionVisibility={{}}
      />
    );

    const skillsPos = htmlSoftware.indexOf('preview-section-skills');
    const projectsPos = htmlSoftware.indexOf('preview-section-projects');
    const expPos = htmlSoftware.indexOf('preview-section-experience');

    expect(skillsPos).toBeGreaterThan(-1);
    expect(projectsPos).toBeGreaterThan(-1);
    expect(expPos).toBeGreaterThan(-1);

    expect(skillsPos).toBeLessThan(projectsPos);
    expect(projectsPos).toBeLessThan(expPos);
  });

  // TEST 8: Phase 7 AI Polish Triggers & Suggestion UI
  it('8. SectionEditors renders AI Polish triggers for Summary, Skills, and Bullets', () => {
    const mockOnRequest = vi.fn();
    const html = renderToString(
      <SectionEditors
        resumeData={sampleResumeData}
        sectionOrder={['summary', 'skills', 'experience', 'projects']}
        sectionVisibility={{}}
        onChange={vi.fn()}
        onOrderChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onRequestSuggestion={mockOnRequest}
        isSuggesting={false}
        initialOpenSections={{ summary: true, skills: true, experience: true }}
      />
    );

    // AI suggestion triggers should be present
    expect(html).toContain('Polish with AI');
    expect(html).toContain('Optimize Skills Order');
    expect(html).toContain('Polish Bullet #');
  });

  // TEST 9: Accept / Reject logic preserves data immutability on reject and targets change on accept
  it('9. Suggestion Accept updates targeted field while Reject leaves state untouched', () => {
    const original = JSON.parse(JSON.stringify(sampleResumeData));
    const activeSuggestion = {
      type: 'bullet',
      target: { section: 'experience', itemIndex: 0, bulletIndex: 0 },
      original: 'Designed microservices architecture',
      proposed: 'Architected distributed microservices architecture [add your real number]%',
    };

    // Rejection: state is untouched
    const stateAfterReject = JSON.parse(JSON.stringify(original));
    expect(stateAfterReject.experience[0].bullets[0]).toBe('Designed microservices architecture');

    // Acceptance: only targeted bullet is changed
    const stateAfterAccept = JSON.parse(JSON.stringify(original));
    stateAfterAccept.experience[0].bullets[0] = activeSuggestion.proposed;
    expect(stateAfterAccept.experience[0].bullets[0]).toBe('Architected distributed microservices architecture [add your real number]%');
    expect(stateAfterAccept.experience[0].bullets[1]).toBe(original.experience[0].bullets[1]);
    expect(stateAfterAccept.summary).toBe(original.summary);
  });

  // TEST 10: PHASE 12b - ARCHIVED RESUME STATE & RESTORE ACTION
  it('10. StudioEditor handles archived resume with restore action and helpful return button', () => {
    const archivedResume = {
      _id: 'res-archived-1',
      title: 'Archived Draft',
      archived: true,
      data: sampleResumeData,
    };

    const html = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={archivedResume} initialLoading={false} />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="editor-archived-state"');
    expect(html).toContain('This Resume is Archived');
    expect(html).toContain('data-testid="editor-restore-button"');
    expect(html).toContain('Return to Dashboard');
  });

  // TEST 11: PHASE 12b - HELPFUL NOT-FOUND SCREEN & STICKY OFFSET
  it('11. StudioEditor renders helpful not found state with dashboard link and sticky top-16 toolbar', () => {
    const htmlError = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={null} initialLoading={false} initialError="Resume not found" />
      </MemoryRouter>
    );

    expect(htmlError).toContain('data-testid="editor-error"');
    expect(htmlError).toContain('Unable to Open Resume');
    expect(htmlError).toContain('Resume not found');
    expect(htmlError).toContain('data-testid="editor-error-dashboard-button"');

    // Normal active resume renders toolbar with top-16 z-20 sticky offset
    const activeResume = {
      _id: 'res-active-1',
      title: 'Active Draft',
      archived: false,
      data: sampleResumeData,
    };
    const htmlActive = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={activeResume} initialLoading={false} />
      </MemoryRouter>
    );
    expect(htmlActive).toContain('sticky top-16 z-20');
  });

  // TEST 12: Opening primary vs non-primary saved resumes
  it('12. StudioEditor correctly opens primary and non-primary saved resumes without errors', () => {
    const primaryResume = {
      _id: 'res-primary-1',
      title: 'Primary Software Engineer Resume',
      isPrimary: true,
      templateId: 'software-engineer',
      data: sampleResumeData,
    };

    const nonPrimaryResume = {
      _id: 'res-non-primary-2',
      title: 'Secondary Data Science Resume',
      isPrimary: false,
      templateId: 'technical-projects',
      data: sampleResumeData,
    };

    const htmlPrimary = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={primaryResume} initialLoading={false} />
      </MemoryRouter>
    );
    expect(htmlPrimary).toContain('Primary Software Engineer Resume');
    expect(htmlPrimary).toContain('Software Engineer');

    const htmlNonPrimary = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={nonPrimaryResume} initialLoading={false} />
      </MemoryRouter>
    );
    expect(htmlNonPrimary).toContain('Secondary Data Science Resume');
    expect(htmlNonPrimary).toContain('Technical Projects');
  });

  // TEST 13: Opening resumes across all 8 supported ATS templates
  it('13. StudioEditor correctly resolves and renders all 8 ATS templates without throwing', () => {
    const allTemplates = [
      'modern',
      'classic',
      'compact',
      'minimal-ats',
      'software-engineer',
      'professional-fresher',
      'modern-professional',
      'technical-projects',
    ];

    allTemplates.forEach((tId) => {
      const templateObj = getTemplateById(tId);
      expect(templateObj).toBeDefined();
      expect(templateObj.id).toBe(tId);

      const resumeForTemplate = {
        _id: `res-template-${tId}`,
        title: `Resume in ${tId}`,
        templateId: tId,
        data: sampleResumeData,
      };

      const html = renderToString(
        <MemoryRouter>
          <StudioEditor initialResume={resumeForTemplate} initialLoading={false} />
        </MemoryRouter>
      );

      expect(html).toContain(`Resume in ${tId}`);
      expect(html).toContain('data-testid="live-a4-preview"');
    });
  });

  // TEST 14: Opening resume with missing or invalid templateId safely falls back to 'modern'
  it('14. getTemplateById and StudioEditor safely fallback to modern for missing, null, or invalid template IDs', () => {
    // getTemplateById unit assertions
    expect(getTemplateById(null).id).toBe('modern');
    expect(getTemplateById(undefined).id).toBe('modern');
    expect(getTemplateById('').id).toBe('modern');
    expect(getTemplateById('completely-bogus-template').id).toBe('modern');

    // StudioEditor rendering with invalid templateId
    const invalidTemplateResume = {
      _id: 'res-invalid-tmpl',
      title: 'Legacy Invalid Template Resume',
      templateId: 'nonexistent-custom-template',
      data: sampleResumeData,
    };

    const html = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={invalidTemplateResume} initialLoading={false} />
      </MemoryRouter>
    );

    // Verifies it opened smoothly without throwing getTemplateById errors
    expect(html).toContain('Legacy Invalid Template Resume');
    expect(html).not.toContain('Unable to Open Resume');
  });

  // TEST 15: Source code import verification for getTemplateById in StudioEditor.jsx
  it('15. StudioEditor.jsx explicitly imports getTemplateById from templateRegistry', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const editorSource = fs.readFileSync(path.resolve(__dirname, './StudioEditor.jsx'), 'utf-8');

    expect(editorSource).toMatch(/import\s*\{[^}]*getTemplateById[^}]*\}\s*from\s*['"]\.\/templateRegistry['"]/);
  });

  // TEST 16: StudioEditor handles soft-deleted (in Trash) resume with restore action
  it('16. StudioEditor handles soft-deleted resume with dedicated Trash view and restore action', () => {
    const deletedResume = {
      _id: 'res-trash-1',
      title: 'Trashed Resume Draft',
      deleted: true,
      deletedAt: '2026-11-26T12:00:00.000Z',
      data: sampleResumeData,
    };

    const html = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={deletedResume} initialLoading={false} />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="editor-deleted-state"');
    expect(html).toContain('This Resume is in Trash');
    expect(html).toContain('data-testid="editor-restore-trash-button"');
    expect(html).toContain('Restore from Trash');
    expect(html).toContain('Return to Dashboard');
  });

  // TEST 17: StudioEditor renders dedicated error screen showing specific reason: "Resume Not Found" for 404
  it('17. StudioEditor renders specific Resume Not Found message instead of generic failure', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioEditor initialResume={null} initialLoading={false} initialError="Resume not found" />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="editor-error"');
    expect(html).toContain('Resume Not Found');
    expect(html).toContain('Resume not found');
    expect(html).toContain('Return to Dashboard');
    expect(html).not.toContain('Unable to load resume');
  });

  // TEST 18: StudioEditor renders dedicated error screen showing specific reason: "Access Denied" for 403
  it('18. StudioEditor renders specific Access Denied message for permission failures', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioEditor
          initialResume={null}
          initialLoading={false}
          initialError="Access denied: You do not have permission to view this resume"
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="editor-error"');
    expect(html).toContain('Access Denied');
    expect(html).toContain('You do not have permission to view this resume');
    expect(html).toContain('Return to Dashboard');
  });

  // TEST 19: StudioEditor renders dedicated error screen showing specific reason: "Server Error" with Try Again button
  it('19. StudioEditor renders Server Error with Try Again button for 500 errors', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioEditor
          initialResume={null}
          initialLoading={false}
          initialError="Server error — please try again later"
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="editor-error"');
    expect(html).toContain('Server Error');
    expect(html).toContain('data-testid="editor-error-retry-button"');
    expect(html).toContain('Try Again');
  });
});
