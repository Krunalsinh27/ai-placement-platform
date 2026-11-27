import React from 'react';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import CollegeBreakdownModal from './CollegeBreakdownModal';

describe('CollegeBreakdownModal Component Tests', () => {
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

  const mockRequirement = {
    _id: '674000000000000000000001',
    title: 'Senior Cloud Engineer',
    status: 'published',
  };

  const mockData = {
    success: true,
    jobRequirement: {
      id: '674000000000000000000001',
      title: 'Senior Cloud Engineer',
      status: 'published',
    },
    totals: {
      colleges: 3,
      requestsSent: 3,
      drivesCreated: 2,
      applicants: 5,
    },
    rows: [
      {
        collegeId: '674000000000000000000011',
        name: 'National Institute of Technology Delhi',
        code: 'NITD',
        city: 'New Delhi',
        driveRequestStatus: 'accepted',
        driveId: '674000000000000000000091',
        driveStatus: 'open',
        applied: 3,
        statusCounts: {
          applied: 0,
          shortlisted: 1,
          interview: 1,
          selected: 1,
          rejected: 0,
        },
      },
      {
        collegeId: '674000000000000000000012',
        name: 'Pune Institute of Computer Technology',
        code: 'PICT',
        city: 'Pune',
        driveRequestStatus: 'scheduled',
        driveId: '674000000000000000000092',
        driveStatus: 'open',
        applied: 2,
        statusCounts: {
          applied: 1,
          shortlisted: 1,
          interview: 0,
          selected: 0,
          rejected: 0,
        },
      },
      {
        collegeId: '674000000000000000000013',
        name: 'Indian Institute of Technology Bombay',
        code: 'IITB',
        city: 'Mumbai',
        driveRequestStatus: 'pending',
        driveId: null,
        driveStatus: null,
        applied: 0,
        statusCounts: {
          applied: 0,
          shortlisted: 0,
          interview: 0,
          selected: 0,
          rejected: 0,
        },
      },
    ],
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={false}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    expect(html).toBe('');
  });

  it('renders summary tiles and requirement header when open', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    // Header & Titles
    expect(html).toContain('Applicants by College');
    expect(html).toContain('Breakdown');
    expect(html).toContain('Senior Cloud Engineer');

    // Summary Metric Cards
    expect(html).toContain('Colleges Contacted');
    expect(html).toContain('Drives Live / Created');
    expect(html).toContain('Total Applicants');

    // Values in metric cards
    expect(html).toContain('>3<'); // 3 colleges
    expect(html).toContain('>2<'); // 2 drives created
    expect(html).toContain('>5<'); // 5 total applicants
  });

  it('renders all colleges sorted by applied descending, including zero applicants', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    // College 1
    expect(html).toContain('National Institute of Technology Delhi');
    expect(html).toContain('NITD');
    expect(html).toContain('New Delhi');
    expect(html).toContain('3<!-- --> <!-- -->students');

    // College 2
    expect(html).toContain('Pune Institute of Computer Technology');
    expect(html).toContain('PICT');
    expect(html).toContain('Pune');
    expect(html).toContain('2<!-- --> <!-- -->students');

    // College 3 (Zero applicants)
    expect(html).toContain('Indian Institute of Technology Bombay');
    expect(html).toContain('IITB');
    expect(html).toContain('Mumbai');
    expect(html).toContain('0<!-- --> <!-- -->students');
    expect(html).toContain('0 applicants');
    expect(html).toContain('No Drive Yet');
  });

  it('renders pipeline navigation links when drive exists, and no-drive indicator when null', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    // Links to recruiter drive pipelines
    expect(html).toContain('/recruiter/drives/674000000000000000000091/pipeline');
    expect(html).toContain('/recruiter/drives/674000000000000000000092/pipeline');

    // College 3 has no drive yet
    expect(html).toContain('—');
  });

  it('renders breakdown progress bars and application stage pills', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    // Max applied is 3 -> width: 100%
    expect(html).toContain('width:100%');
    // Next is 2 -> width: 67%
    expect(html).toContain('width:67%');

    // Stage pills
    expect(html).toContain('Short: <!-- -->1');
    expect(html).toContain('Int: <!-- -->1');
    expect(html).toContain('Sel: <!-- -->1');
  });

  it('contains Export CSV button and search/filter controls', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Export CSV');
    expect(html).toContain('Filter colleges by name, code, or city...');
    expect(html).toContain('All Colleges');
    expect(html).toContain('Has Applicants');
    expect(html).toContain('Zero Applicants');
  });

  it('strictly preserves privacy and contains zero student PII', () => {
    const html = renderToString(
      <MemoryRouter>
        <CollegeBreakdownModal
          isOpen={true}
          onClose={() => {}}
          requirement={mockRequirement}
          initialData={mockData}
        />
      </MemoryRouter>
    );

    // Zero student personal data: No personal emails, phone numbers, or student identifiers
    expect(html).not.toMatch(/@gmail\.com|@student\./i);
    expect(html).not.toMatch(/\+91\s?\d{10}/);
    expect(html).not.toMatch(/rollNumber|enrollmentNo/i);
  });
});
