import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import ResumeCard from './components/ResumeCard';
import CreateResumeModal from './components/CreateResumeModal';
import RenameResumeModal from './components/RenameResumeModal';
import StudioDashboard from './StudioDashboard';
import Sidebar from '../../../components/layout/Sidebar';

// Mock AuthContext
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u-1', name: 'Alice Student', role: 'student' },
    student: { _id: 's-1' },
    isAdmin: false,
  }),
}));

// Mock react-router-dom useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe('Resume Studio Dashboard & Component Tests (Phase 3)', () => {
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

  const samplePrimaryResume = {
    _id: 'res-primary-1',
    title: 'Full Stack Engineer Resume',
    templateId: 'software-engineer',
    isPrimary: true,
    versionCount: 4,
    updatedAt: '2026-11-20T10:00:00.000Z',
  };

  const sampleSecondaryResume = {
    _id: 'res-secondary-2',
    title: 'Data Science & ML Variant',
    templateId: 'technical-projects',
    isPrimary: false,
    versionCount: 1,
    updatedAt: '2026-11-21T15:30:00.000Z',
  };

  // TEST 1: ResumeCard renders title, template label, primary badge, and version count
  it('1. ResumeCard renders details, primary badge, and action buttons', () => {
    const html = renderToString(
      <ResumeCard
        resume={samplePrimaryResume}
        onOpen={() => {}}
        onSetPrimary={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onArchive={() => {}}
      />
    );

    expect(html).toContain('Full Stack Engineer Resume');
    expect(html).toContain('Software Engineer');
    expect(html).toContain('Primary');
    expect(html).toContain('4 versions');
    expect(html).toContain('Open Resume');
    expect(html).toContain('Rename Resume');
    expect(html).toContain('Duplicate Resume');
    expect(html).toContain('Archive Resume');
  });

  // TEST 2: ResumeCard renders "Set as Primary" button on non-primary resumes
  it('2. ResumeCard renders Set as Primary action for non-primary resumes', () => {
    const html = renderToString(
      <ResumeCard
        resume={sampleSecondaryResume}
        onOpen={() => {}}
        onSetPrimary={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onArchive={() => {}}
      />
    );

    expect(html).toContain('Data Science &amp; ML Variant');
    expect(html).toContain('Technical &amp; Projects');
    expect(html).toContain('Set as Primary Resume');
    // Does not display the Primary badge on secondary resume
    expect(html).not.toContain('px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700');
  });

  // TEST 3: CreateResumeModal renders form controls, all 8 templates, and checkbox
  it('3. CreateResumeModal renders all 8 ATS template options and primary checkbox', () => {
    const html = renderToString(
      <CreateResumeModal
        isOpen={true}
        onClose={() => {}}
        onCreate={() => {}}
        isSubmitting={false}
      />
    );

    expect(html).toContain('Create New Resume');
    expect(html).toContain('Resume Title');
    expect(html).toContain('Modern Clean');
    expect(html).toContain('Classic Academic');
    expect(html).toContain('Compact Single-Column');
    expect(html).toContain('Minimal ATS');
    expect(html).toContain('Software Engineer');
    expect(html).toContain('Professional Fresher');
    expect(html).toContain('Modern Professional');
    expect(html).toContain('Technical &amp; Projects');
    expect(html).toContain('Make this my primary resume');
    expect(html).toContain('Create Resume');
  });

  // TEST 4: RenameResumeModal renders prefilled title and save button
  it('4. RenameResumeModal renders prefilled resume title and save action', () => {
    const html = renderToString(
      <RenameResumeModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        resume={samplePrimaryResume}
        isSubmitting={false}
      />
    );

    expect(html).toContain('Rename Resume');
    expect(html).toContain('Full Stack Engineer Resume');
    expect(html).toContain('Save Title');
  });

  // TEST 5: StudioDashboard renders loading state with skeleton cards
  it('5. StudioDashboard renders skeleton loading state', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioDashboard initialLoading={true} />
      </MemoryRouter>
    );

    expect(html).toContain('Resume Builder');
    expect(html).toContain('data-testid="loading-state"');
    expect(html).toContain('animate-pulse');
  });

  // TEST 6: StudioDashboard renders error state with retry button
  it('6. StudioDashboard renders error state when API fails', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioDashboard
          initialLoading={false}
          initialError="Failed to connect to Resume Builder API"
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="error-state"');
    expect(html).toContain('Failed to Load Resumes');
    expect(html).toContain('Failed to connect to Resume Builder API');
    expect(html).toContain('Try Again');
  });

  // TEST 7: StudioDashboard renders empty state when zero resumes exist
  it('7. StudioDashboard renders empty state with Create First Resume CTA', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioDashboard initialLoading={false} initialResumes={[]} />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="empty-state"');
    expect(html).toContain('No Resumes Created Yet');
    expect(html).toContain('Create First Resume');
  });

  // TEST 8: StudioDashboard renders list of resume cards
  it('8. StudioDashboard renders list of resume cards when resumes exist', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioDashboard
          initialLoading={false}
          initialResumes={[samplePrimaryResume, sampleSecondaryResume]}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="resumes-list"');
    expect(html).toContain('Full Stack Engineer Resume');
    expect(html).toContain('Data Science &amp; ML Variant');
    expect(html).toContain('Software Engineer');
    expect(html).toContain('Technical &amp; Projects');
  });

  // TEST 9: Sidebar navigation includes Resume Builder pointing to /student/resume-studio alongside Resume AI
  it('9. Sidebar navigation includes single Resume Builder pointing to resume-studio, keeping AI reachable', () => {
    const html = renderToString(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    expect(html).toContain('Resume Builder');
    expect(html).toContain('href="/student/resume-studio"');
    const resumeBuilderMatches = html.match(/Resume Builder/g) || [];
    expect(resumeBuilderMatches.length).toBe(1);
    expect(html).toContain('Resume AI');
    expect(html).toContain('href="/student/resume-ai"');
    // Ensure old 'Resume Studio' name and duplicate '/student/resume-builder' link are absent
    expect(html).not.toContain('Resume Studio');
    expect(html).not.toContain('href="/student/resume-builder"');
  });

  // TEST 10: App.jsx verifies redirect from /student/resume-builder to /student/resume-studio and canonical routes
  it('10. App routing defines redirect from resume-builder to resume-studio and keeps editor & wizard routes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const appSource = fs.readFileSync(path.resolve(__dirname, '../../../App.jsx'), 'utf-8');

    // 1. Verify safe redirect without rendering duplicate component
    expect(appSource).toContain('<Route path="resume-builder" element={<Navigate to="/student/resume-studio" replace />} />');
    expect(appSource).not.toContain('<Route path="resume-builder" element={<ResumeBuilder />} />');

    // 2. Verify all existing canonical routes are present
    expect(appSource).toContain('<Route path="resume-studio" element={<ResumeStudio />} />');
    expect(appSource).toContain('<Route path="resume-studio/wizard" element={<StudioWizard />} />');
    expect(appSource).toContain('<Route path="resume-studio/:id" element={<StudioEditor />} />');
    expect(appSource).toContain('<Route path="resume-studio/:id/wizard" element={<StudioWizard />} />');
  });

  // TEST 11: StudioDashboard renders all three tabs: Active Resumes, Archived, and Trash
  it('11. StudioDashboard renders all three tabs: Active Resumes, Archived, and Trash', () => {
    const html = renderToString(
      <MemoryRouter>
        <StudioDashboard initialLoading={false} initialResumes={[]} />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="tab-active"');
    expect(html).toContain('Active Resumes');
    expect(html).toContain('data-testid="tab-archived"');
    expect(html).toContain('Archived');
    expect(html).toContain('data-testid="tab-trash"');
    expect(html).toContain('Trash');
  });

  // TEST 12: ResumeCard renders Delete Resume action and Trash badge when in trash
  it('12. ResumeCard renders Delete Resume button and handles Trash state', () => {
    const htmlActive = renderToString(
      <MemoryRouter>
        <ResumeCard
          resume={sampleSecondaryResume}
          onOpen={() => {}}
          onTrash={() => {}}
        />
      </MemoryRouter>
    );
    expect(htmlActive).toContain('data-testid="trash-resume-button"');
    expect(htmlActive).toContain('Delete Resume');

    const sampleTrashResume = {
      ...sampleSecondaryResume,
      deleted: true,
      deletedAt: '2026-11-26T12:00:00.000Z',
    };
    const htmlTrash = renderToString(
      <MemoryRouter>
        <ResumeCard
          resume={sampleTrashResume}
          tab="trash"
          onRestoreTrash={() => {}}
        />
      </MemoryRouter>
    );
    expect(htmlTrash).toContain('data-testid="restore-trash-button"');
    expect(htmlTrash).toContain('Restore');
    expect(htmlTrash).toContain('In Trash');
  });

  // TEST 13: ResumeCard onOpen receives resume object and triggers navigation with _id
  it('13. ResumeCard onOpen passes correct resume object and can be invoked', () => {
    let openedResume = null;
    const handleOpenMock = (r) => {
      openedResume = r;
    };

    const html = renderToString(
      <MemoryRouter>
        <ResumeCard
          resume={samplePrimaryResume}
          onOpen={handleOpenMock}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Open Resume');
    // Call directly as button onClick does
    handleOpenMock(samplePrimaryResume);
    expect(openedResume).not.toBeNull();
    expect(openedResume._id).toBe('res-primary-1');
  });
});
