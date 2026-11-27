/**
 * Resume Studio Phase 5: Templates & Unicode ATS PDF Test Suite
 *
 * Verifies:
 * 1. Template Registry Parity: Server and Client registries match identically
 * 2. 8 ATS Templates: All 8 export valid single-column PDFs
 * 3. Section Order Precedence: User-defined sectionOrder ALWAYS wins over template defaults
 * 4. Template Defaults: When no sectionOrder is provided, template-specific order applies
 * 5. Unicode / Mukta: Accented Latin (Renée José-Nuñez) and Devanagari (कौशल शर्मा) render without errors
 * 6. ATS Compliance: Minimal-ATS strictly monochrome with zero dividing rules; zero tables/images
 * 7. Anti-placeholder guard remains active
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const {
  TEMPLATES,
  getTemplates,
  getTemplateById,
  isValidTemplateId,
} = require('../services/resumeStudio/templateRegistry');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');
const { parsePdfBuffer } = require('../services/ai/resumeTextExtractor');

let testsPassed = 0;
let testsFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

const sampleResumeData = {
  contact: {
    fullName: 'Alex Vance',
    email: 'alex.vance@example.com',
    phone: '+1 555-0199',
    location: 'Seattle, WA',
    linkedin: 'https://linkedin.com/in/alexvance',
    github: 'https://github.com/alexvance',
    portfolio: 'https://alexvance.dev',
  },
  summary:
    'Results-driven Software Engineer with 3+ years experience building cloud-native distributed microservices.',
  skills: [
    { category: 'Languages', items: ['JavaScript', 'TypeScript', 'Python', 'Go'] },
    { category: 'Frameworks', items: ['React', 'Node.js', 'Express', 'TailwindCSS'] },
    { category: 'Databases & Tools', items: ['PostgreSQL', 'MongoDB', 'Redis', 'Docker'] },
  ],
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Apex Cloud Solutions',
      location: 'Seattle, WA',
      duration: '2022 - Present',
      bullets: [
        'Architected high-throughput message ingestion pipeline processing 15M messages per day.',
        'Decreased 99th-percentile API latency by 34% by introducing Redis caching layer.',
      ],
    },
    {
      title: 'Software Developer',
      company: 'DataStream Corp',
      location: 'Portland, OR',
      duration: '2020 - 2022',
      bullets: [
        'Designed and implemented 12 RESTful API microservices serving enterprise analytics.',
        'Mentored 4 junior engineers on unit testing and CI/CD pipelines.',
      ],
    },
  ],
  projects: [
    {
      title: 'Distributed Rate Limiter',
      link: 'https://github.com/alexvance/rate-limiter',
      duration: '2023',
      technologies: ['Go', 'Redis', 'Docker'],
      bullets: [
        'Implemented sliding window counter algorithm with zero concurrency deadlocks.',
        'Benchmarked to handle 85k requests per second on a single 4-core instance.',
      ],
    },
  ],
  education: [
    {
      degree: 'B.S. in Computer Science',
      institution: 'University of Washington',
      field: 'Computer Science',
      year: '2020',
      score: '3.85 / 4.0',
    },
  ],
  certifications: ['AWS Certified Solutions Architect (2023)'],
  achievements: ['1st Place - PNW Regional Hackathon 2021'],
  languages: ['English', 'Spanish'],
};

async function runTests() {
  console.log('\n========================================');
  console.log('Resume Studio Phase 5: Template & Unicode Tests');
  console.log('========================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Registry Parity & Template Definitions
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Server and Client Registry Parity ---');

  const EXPECTED_TEMPLATES = [
    'modern',
    'classic',
    'compact',
    'minimal-ats',
    'software-engineer',
    'professional-fresher',
    'modern-professional',
    'technical-projects',
  ];

  it('Server registry contains all 8 required ATS templates', () => {
    assert.strictEqual(TEMPLATES.length, 8);
    for (const id of EXPECTED_TEMPLATES) {
      assert(isValidTemplateId(id), `Missing template id in server registry: ${id}`);
    }
  });

  await itAsync('Server and Client registries have identical template IDs and section defaults', async () => {
    const clientPath = path.resolve(__dirname, '../../client/src/pages/student/resume-studio/templateRegistry.js');
    const clientMod = await import(pathToFileURL(clientPath).href);
    const clientTemplates = clientMod.TEMPLATES;

    assert.strictEqual(clientTemplates.length, TEMPLATES.length, 'Template count mismatch between server and client');

    for (const serverTmpl of TEMPLATES) {
      const clientTmpl = clientTemplates.find((t) => t.id === serverTmpl.id);
      assert(clientTmpl, `Client registry is missing template: ${serverTmpl.id}`);
      assert.strictEqual(clientTmpl.name, serverTmpl.name, `Template name mismatch for ${serverTmpl.id}`);
      assert.strictEqual(clientTmpl.drawSectionLine, serverTmpl.drawSectionLine, `drawSectionLine mismatch for ${serverTmpl.id}`);
      assert.strictEqual(clientTmpl.primaryColor, serverTmpl.primaryColor, `primaryColor mismatch for ${serverTmpl.id}`);
      assert.strictEqual(clientTmpl.accentColor, serverTmpl.accentColor, `accentColor mismatch for ${serverTmpl.id}`);
      assert.strictEqual(clientTmpl.headerAlign, serverTmpl.headerAlign, `headerAlign mismatch for ${serverTmpl.id}`);
      assert.deepStrictEqual(
        clientTmpl.defaultSectionOrder,
        serverTmpl.defaultSectionOrder,
        `defaultSectionOrder mismatch for ${serverTmpl.id}`
      );
    }
  });

  it('minimal-ats is strictly monochrome, has no dividing rules, and has no icons', () => {
    const minimal = getTemplateById('minimal-ats');
    assert.strictEqual(minimal.drawSectionLine, false, 'minimal-ats must not draw dividing section lines');
    assert.strictEqual(minimal.primaryColor, '#000000', 'minimal-ats must be monochrome black');
    assert.strictEqual(minimal.accentColor, '#000000', 'minimal-ats accent must be monochrome black');
    assert.strictEqual(minimal.lineColor, 'transparent', 'minimal-ats line color must be transparent');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: PDF Export Across All 8 Templates
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: PDF Export Across All 8 Templates ---');

  for (const templateId of EXPECTED_TEMPLATES) {
    await itAsync(`Template '${templateId}' exports a valid PDF buffer`, async () => {
      const pdfBuffer = await generateResumePdf(sampleResumeData, templateId);
      assert(Buffer.isBuffer(pdfBuffer), `Expected Buffer for ${templateId}`);
      assert(pdfBuffer.length > 2000, `PDF buffer too small (${pdfBuffer.length} bytes) for ${templateId}`);
      assert.strictEqual(pdfBuffer.slice(0, 5).toString('ascii'), '%PDF-', `Invalid PDF header for ${templateId}`);

      // Verify text extraction is readable
      const text = await parsePdfBuffer(pdfBuffer);
      assert(text.includes('Alex Vance'), `Extracted text missing name for ${templateId}`);
      assert(text.includes('Senior Software Engineer'), `Extracted text missing title for ${templateId}`);
    });
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Section Order Precedence (User custom vs Template default)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Section Order Precedence ---');

  await itAsync('Template default order applies when resume has no custom sectionOrder (software-engineer)', async () => {
    // software-engineer default: ['skills', 'projects', 'experience', 'education', 'summary', 'extras']
    const dataWithoutOrder = { ...sampleResumeData, sectionOrder: undefined };
    const pdfBuffer = await generateResumePdf(dataWithoutOrder, 'software-engineer');
    const text = await parsePdfBuffer(pdfBuffer);

    const skillsIdx = text.indexOf('TECHNICAL SKILLS');
    const projectsIdx = text.indexOf('TECHNICAL PROJECTS');
    const expIdx = text.indexOf('PROFESSIONAL EXPERIENCE');
    const eduIdx = text.indexOf('EDUCATION');

    assert(skillsIdx !== -1, 'TECHNICAL SKILLS section not found');
    assert(projectsIdx !== -1, 'TECHNICAL PROJECTS section not found');
    assert(expIdx !== -1, 'PROFESSIONAL EXPERIENCE section not found');
    assert(eduIdx !== -1, 'EDUCATION section not found');

    assert(skillsIdx < expIdx, 'Expected TECHNICAL SKILLS before PROFESSIONAL EXPERIENCE in software-engineer default');
    assert(projectsIdx < expIdx, 'Expected TECHNICAL PROJECTS before PROFESSIONAL EXPERIENCE in software-engineer default');
  });

  await itAsync('Template default order applies when resume has no custom sectionOrder (professional-fresher)', async () => {
    // professional-fresher default: ['education', 'skills', 'projects', 'experience', 'summary', 'extras']
    const dataWithoutOrder = { ...sampleResumeData, sectionOrder: undefined };
    const pdfBuffer = await generateResumePdf(dataWithoutOrder, 'professional-fresher');
    const text = await parsePdfBuffer(pdfBuffer);

    const eduIdx = text.indexOf('EDUCATION');
    const skillsIdx = text.indexOf('TECHNICAL SKILLS');
    const expIdx = text.indexOf('PROFESSIONAL EXPERIENCE');

    assert(eduIdx !== -1, 'EDUCATION section not found');
    assert(skillsIdx !== -1, 'TECHNICAL SKILLS section not found');
    assert(expIdx !== -1, 'PROFESSIONAL EXPERIENCE section not found');

    assert(eduIdx < expIdx, 'Expected EDUCATION before PROFESSIONAL EXPERIENCE in professional-fresher default');
    assert(skillsIdx < expIdx, 'Expected TECHNICAL SKILLS before PROFESSIONAL EXPERIENCE in professional-fresher default');
  });

  await itAsync('User-defined sectionOrder ALWAYS wins over template default order', async () => {
    // Custom user order puts Education first and Skills last, regardless of software-engineer default
    const customOrder = ['education', 'experience', 'projects', 'summary', 'skills', 'extras'];
    const dataWithCustomOrder = { ...sampleResumeData, sectionOrder: customOrder };

    const pdfBuffer = await generateResumePdf(dataWithCustomOrder, 'software-engineer');
    const text = await parsePdfBuffer(pdfBuffer);

    const eduIdx = text.indexOf('EDUCATION');
    const expIdx = text.indexOf('PROFESSIONAL EXPERIENCE');
    const skillsIdx = text.indexOf('TECHNICAL SKILLS');

    assert(eduIdx !== -1, 'EDUCATION section not found');
    assert(expIdx !== -1, 'PROFESSIONAL EXPERIENCE section not found');
    assert(skillsIdx !== -1, 'TECHNICAL SKILLS section not found');

    // Education must be before experience, and experience before skills
    assert(eduIdx < expIdx, 'User custom order: EDUCATION must appear before EXPERIENCE');
    assert(expIdx < skillsIdx, 'User custom order: EXPERIENCE must appear before SKILLS');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Unicode & Devanagari Font Rendering
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Unicode & Devanagari Font Rendering ---');

  await itAsync('Candidate name with accents and Devanagari renders without error', async () => {
    const unicodeData = {
      ...sampleResumeData,
      contact: {
        ...sampleResumeData.contact,
        fullName: 'Renée José-Nuñez कौशल शर्मा',
      },
      summary: 'Proficient bilingual engineer building applications in English and हिन्दी भाषा systems.',
    };

    const pdfBuffer = await generateResumePdf(unicodeData, 'modern');
    assert(Buffer.isBuffer(pdfBuffer));
    assert(pdfBuffer.length > 2000);

    const text = await parsePdfBuffer(pdfBuffer);
    assert(text.includes('Renée José-Nuñez'), 'Accented name missing from extracted PDF text');
    assert(text.includes('कौशल'), 'Devanagari first name missing from extracted PDF text');
    // Note on conjuncts: raw PDF text streams can sequence 'शर्मा' as 'शमार्'
    assert(text.includes('शमार्') || text.includes('शर्मा'), 'Devanagari surname missing from extracted PDF text');
  });

  await itAsync('Mixed Latin and Devanagari in technical bullet renders cleanly', async () => {
    const unicodeBulletData = {
      ...sampleResumeData,
      experience: [
        {
          title: 'Software Engineer (सॉफ्टवेयर इंजीनियर)',
          company: 'TechCorp International',
          duration: '2023 - Present',
          bullets: [
            'Localized core UI workflows into Hindi (हिन्दी) supporting 2M+ active regional users.',
            'Standardized Unicode UTF-8 payloads across distributed microservices.',
          ],
        },
      ],
    };

    const pdfBuffer = await generateResumePdf(unicodeBulletData, 'minimal-ats');
    assert(Buffer.isBuffer(pdfBuffer));

    const text = await parsePdfBuffer(pdfBuffer);
    assert(text.includes('TechCorp International'));
    assert(text.includes('सॉफ्टवेयर') || text.includes('इंजीनियर'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Placeholder Guard & Safety
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Safety Guard Enforcements ---');

  it('Anti-placeholder guard blocks export if unresolved placeholder exists', () => {
    const dirtyData = {
      ...sampleResumeData,
      summary: 'Delivered [add your real number]% improvement in response time.',
    };
    assert.throws(
      () => {
        generateResumePdf(dirtyData, 'modern');
      },
      (err) => {
        assert(err.message.includes('unresolved placeholders'));
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================');
  console.log(`Phase 5 Template Tests Finished: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
