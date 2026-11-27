/**
 * Server-Side PDFKit ATS Resume Generator
 *
 * Implements 8 strictly single-column ATS-friendly templates:
 * 1. modern ('Modern Clean')
 * 2. classic ('Classic Academic')
 * 3. compact ('Compact Single-Column')
 * 4. minimal-ats ('Minimal ATS' - strictly monochrome, no rules, no icons)
 * 5. software-engineer ('Software Engineer' - skills & repos/projects prioritized)
 * 6. professional-fresher ('Professional Fresher' - education & coursework prioritized)
 * 7. modern-professional ('Modern Professional' - executive/consulting layout)
 * 8. technical-projects ('Technical Projects' - architecture & tech stacks prioritized)
 *
 * Unicode Support:
 * Registers open-source Mukta font (SIL OFL 1.1) for non-Latin and Devanagari characters,
 * splitting text into font runs so Latin text renders in Helvetica/Times while non-WinAnsi
 * glyphs render cleanly in Mukta.
 *
 * Section Ordering:
 * User-defined resumeData.sectionOrder ALWAYS wins.
 * If no custom order is defined, template.defaultSectionOrder is used.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { checkUnresolvedPlaceholders } = require('./resumeBuilderService');
const { getTemplateById } = require('../resumeStudio/templateRegistry');
const { filterNonEmptySkillCategories } = require('../resumeStudio/skillsHelper');
const { normalizeLanguages } = require('../resumeStudio/languagesHelper');

// Paths to bundled open-license fonts (SIL OFL 1.1)
const FONT_MUKTA_REGULAR = path.resolve(__dirname, '../../assets/fonts/Mukta/Mukta-Regular.ttf');
const FONT_MUKTA_BOLD = path.resolve(__dirname, '../../assets/fonts/Mukta/Mukta-Bold.ttf');

// Characters mapped in PDFKit's standard WinAnsiEncoding
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/**
 * Checks whether a Unicode codepoint can be safely rendered by WinAnsi fonts
 */
function isWinAnsiCode(code) {
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    code === 0x0a ||
    code === 0x0d ||
    code === 0x09 ||
    WIN_ANSI_EXTRA.has(code)
  );
}

/**
 * Splits input text into contiguous runs of WinAnsi vs non-WinAnsi text
 */
function splitIntoFontRuns(text) {
  if (!text || typeof text !== 'string') return [];
  const runs = [];
  let currentRun = '';
  let currentIsWinAnsi = null;

  for (const char of text) {
    const code = char.codePointAt(0);
    const isWin = isWinAnsiCode(code);
    if (currentIsWinAnsi === null) {
      currentIsWinAnsi = isWin;
      currentRun = char;
    } else if (currentIsWinAnsi === isWin) {
      currentRun += char;
    } else {
      runs.push({ text: currentRun, isWinAnsi: currentIsWinAnsi });
      currentRun = char;
      currentIsWinAnsi = isWin;
    }
  }
  if (currentRun) {
    runs.push({ text: currentRun, isWinAnsi: currentIsWinAnsi });
  }
  return runs;
}

/**
 * Renders text on doc, choosing preferred font for WinAnsi runs and Mukta for non-WinAnsi runs.
 */
function drawTextWithRuns(doc, text, preferredFont, fallbackFont, options = {}) {
  if (text === undefined || text === null || text === '') return;
  const runs = splitIntoFontRuns(String(text));
  if (runs.length === 0) return;

  const willBeContinued = Boolean(options.continued);

  for (let i = 0; i < runs.length; i++) {
    const isLast = i === runs.length - 1;
    const fontToUse = runs[i].isWinAnsi ? preferredFont : fallbackFont;
    doc.font(fontToUse);
    doc.text(runs[i].text, {
      ...options,
      continued: !isLast || willBeContinued,
    });
  }
}

/**
 * Generates an ATS-compliant single-column PDF and pipes it to the destination stream
 *
 * @param {Object} resumeData - Structured resume data
 * @param {string} templateId - Template identifier from registry
 * @param {stream.Writable} outputStream - Response or file write stream
 */
function generateResumePdf(rawResumeData, templateId = 'modern', outputStream) {
  // Support either raw section data or full resume document ({ data: ... })
  const resumeData =
    rawResumeData && rawResumeData.data && typeof rawResumeData.data === 'object' && !rawResumeData.contact
      ? rawResumeData.data
      : (rawResumeData || {});

  // 1. Enforce Placeholder Blocking Guard
  const placeholderCheck = checkUnresolvedPlaceholders(resumeData);
  if (placeholderCheck.hasPlaceholders) {
    const err = new Error(
      "Cannot export PDF: Resume contains unresolved placeholders ('[add your real number]'). Please replace them with your actual metrics or remove them before exporting."
    );
    err.status = 400;
    err.statusCode = 400;
    err.occurrences = placeholderCheck.occurrences;
    throw err;
  }

  // Template configuration from shared template registry
  const config = getTemplateById(templateId);
  const template = config.id || 'modern';

  const doc = new PDFDocument({
    size: 'A4',
    margin: config.margin,
    bufferPages: true,
    info: {
      Title: `${resumeData.contact?.fullName || 'Candidate'} - Resume`,
      Author: resumeData.contact?.fullName || 'Placement Management System',
      Subject: 'ATS Optimized Resume',
      Keywords: 'Resume, ATS, Engineering, Placement',
    },
  });

  // Register open-license Mukta fonts for Unicode & non-Latin/Devanagari rendering
  const hasMuktaRegular = fs.existsSync(FONT_MUKTA_REGULAR);
  const hasMuktaBold = fs.existsSync(FONT_MUKTA_BOLD);
  if (hasMuktaRegular) doc.registerFont('Mukta', FONT_MUKTA_REGULAR);
  if (hasMuktaBold) doc.registerFont('Mukta-Bold', FONT_MUKTA_BOLD);

  const fallbackBody = hasMuktaRegular ? 'Mukta' : config.fontBody;
  const fallbackHead = hasMuktaBold ? 'Mukta-Bold' : config.fontHead;
  const fallbackItalic = hasMuktaRegular ? 'Mukta' : config.fontItalic;

  const chunks = [];
  if (outputStream && typeof outputStream.write === 'function') {
    doc.pipe(outputStream);
  } else {
    doc.on('data', (c) => chunks.push(c));
  }

  const contentWidth = doc.page.width - config.margin * 2;

  // Helper: Section Heading
  const drawSectionHeading = (title) => {
    doc.moveDown(0.6);
    doc.fontSize(template === 'compact' ? 10.5 : 11.5).fillColor(config.accentColor);

    drawTextWithRuns(doc, title.toUpperCase(), config.fontHead, fallbackHead, {
      align: 'left',
    });

    if (config.drawSectionLine) {
      doc
        .strokeColor(config.lineColor)
        .lineWidth(0.8)
        .moveTo(doc.x, doc.y + 2)
        .lineTo(doc.x + contentWidth, doc.y + 2)
        .stroke();
      doc.moveDown(0.4);
    } else {
      doc.moveDown(0.3);
    }
  };

  // =========================================================================
  // 1. HEADER & CONTACT DETAILS
  // =========================================================================
  const contact = resumeData.contact || {};
  if (contact.fullName) {
    doc.fontSize(config.nameSize).fillColor(config.primaryColor);
    drawTextWithRuns(doc, contact.fullName, config.fontHead, fallbackHead, {
      align: config.headerAlign,
    });
    doc.moveDown(0.2);
  }

  const contactParts = [];
  if (contact.email) {
    contactParts.push({ text: contact.email, link: `mailto:${contact.email}` });
  }
  if (contact.phone) {
    contactParts.push({
      text: contact.phone,
      link: `tel:${contact.phone.replace(/[^\d+]/g, '')}`,
    });
  }
  if (contact.location) {
    contactParts.push({ text: contact.location, link: null });
  }
  if (contact.linkedin) {
    const isShort = contact.linkedinDisplay !== 'full';
    const destinationUrl = contact.linkedin.startsWith('http')
      ? contact.linkedin
      : `https://${contact.linkedin}`;
    const label = isShort ? 'LinkedIn' : contact.linkedin;
    contactParts.push({ text: label, link: destinationUrl });
  }
  if (contact.github) {
    const isShort = contact.githubDisplay !== 'full';
    const destinationUrl = contact.github.startsWith('http')
      ? contact.github
      : `https://${contact.github}`;
    const label = isShort ? 'GitHub' : contact.github;
    contactParts.push({ text: label, link: destinationUrl });
  }
  if (contact.portfolio) {
    const destinationUrl = contact.portfolio.startsWith('http')
      ? contact.portfolio
      : `https://${contact.portfolio}`;
    const label =
      contact.portfolio.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '') ||
      'Portfolio';
    contactParts.push({ text: label, link: destinationUrl });
  }

  const contactSeparator = template === 'classic' ? '  |  ' : '  •  ';

  if (contactParts.length > 0) {
    doc.fontSize(template === 'compact' ? 8.5 : 9);
    for (let i = 0; i < contactParts.length; i++) {
      const part = contactParts[i];
      const isLast = i === contactParts.length - 1;

      if (part.link) {
        doc.fillColor(config.accentColor);
        drawTextWithRuns(doc, part.text, config.fontBody, fallbackBody, {
          link: part.link,
          underline: true,
          continued: !isLast,
          align: config.headerAlign,
        });
      } else {
        doc.fillColor(config.secondaryColor);
        drawTextWithRuns(doc, part.text, config.fontBody, fallbackBody, {
          continued: !isLast,
          align: config.headerAlign,
        });
      }

      if (!isLast) {
        doc.fillColor(config.secondaryColor);
        drawTextWithRuns(doc, contactSeparator, config.fontBody, fallbackBody, {
          underline: false,
          link: null,
          continued: true,
        });
      }
    }
    doc.text('', { continued: false }); // newline
  }

  // =========================================================================
  // SECTION RENDERERS
  // =========================================================================

  const renderSummary = () => {
    if (!resumeData.summary || !resumeData.summary.trim()) return;
    drawSectionHeading('Professional Summary');
    doc.fontSize(template === 'compact' ? 9 : 9.5).fillColor(config.primaryColor);
    drawTextWithRuns(doc, resumeData.summary.trim(), config.fontBody, fallbackBody, {
      align: 'justify',
      lineGap: 2.5,
    });
  };

  const renderSkills = () => {
    const validCats = filterNonEmptySkillCategories(resumeData.skills);
    if (validCats.length === 0) return;

    drawSectionHeading('Technical Skills');
    validCats.forEach((cat) => {
      const catTitle = cat.category || 'Skills';
      const items = cat.items.join(', ');
      if (!items) return;

      doc.fontSize(template === 'compact' ? 8.5 : 9.5).fillColor(config.primaryColor);
      drawTextWithRuns(doc, `${catTitle}: `, config.fontHead, fallbackHead, {
        continued: true,
      });
      drawTextWithRuns(doc, items, config.fontBody, fallbackBody, {
        lineGap: 2,
      });
    });
  };

  const renderExperience = () => {
    if (!Array.isArray(resumeData.experience) || resumeData.experience.length === 0) return;
    drawSectionHeading('Professional Experience');
    resumeData.experience.forEach((exp, idx) => {
      if (idx > 0) doc.moveDown(0.4);

      // Title & Dates on top line
      doc.fontSize(template === 'compact' ? 9.5 : 10).fillColor(config.primaryColor);
      drawTextWithRuns(doc, exp.title || '', config.fontHead, fallbackHead, {
        continued: true,
      });

      const dateStr = exp.duration ? `  |  ${exp.duration}` : '';
      doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
      drawTextWithRuns(doc, dateStr, config.fontItalic, fallbackItalic, {
        align: 'right',
      });

      // Company & Location on second line
      const compLoc = [exp.company, exp.location].filter(Boolean).join(' — ');
      if (compLoc) {
        doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
        drawTextWithRuns(doc, compLoc, config.fontBody, fallbackBody);
      }

      // Bullets
      if (Array.isArray(exp.bullets)) {
        doc.moveDown(0.15);
        exp.bullets.forEach((bullet) => {
          if (!bullet || !bullet.trim()) return;
          doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
          drawTextWithRuns(doc, `•  ${bullet.trim()}`, config.fontBody, fallbackBody, {
            indent: config.bulletIndent,
            lineGap: 1.8,
            align: 'left',
          });
        });
      }
    });
  };

  const renderProjects = () => {
    if (!Array.isArray(resumeData.projects) || resumeData.projects.length === 0) return;
    drawSectionHeading('Technical Projects');
    resumeData.projects.forEach((proj, idx) => {
      if (idx > 0) doc.moveDown(0.4);

      doc.fontSize(template === 'compact' ? 9.5 : 10).fillColor(config.primaryColor);
      drawTextWithRuns(doc, proj.title || '', config.fontHead, fallbackHead, {
        continued: true,
      });

      const techs =
        Array.isArray(proj.technologies) && proj.technologies.length > 0
          ? ` (${proj.technologies.join(', ')})`
          : '';

      const hasTechs = Boolean(techs);
      doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
      drawTextWithRuns(doc, techs, config.fontItalic, fallbackItalic, {
        continued: Boolean(proj.duration || proj.link),
      });

      if (proj.link) {
        doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.accentColor);
        drawTextWithRuns(
          doc,
          proj.duration ? '  |  ' : '  ',
          config.fontBody,
          fallbackBody,
          { continued: true, underline: false }
        );
        drawTextWithRuns(doc, '[Link]', config.fontBody, fallbackBody, {
          link: proj.link,
          underline: true,
          continued: Boolean(proj.duration),
        });
      }

      if (proj.duration) {
        doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
        drawTextWithRuns(
          doc,
          proj.link ? ` (${proj.duration})` : `  |  ${proj.duration}`,
          config.fontItalic,
          fallbackItalic,
          {
            align: 'right',
            underline: false,
          }
        );
      } else if (!proj.link && !hasTechs) {
        doc.text('');
      }

      // Project Bullets
      if (Array.isArray(proj.bullets)) {
        doc.moveDown(0.15);
        proj.bullets.forEach((bullet) => {
          if (!bullet || !bullet.trim()) return;
          doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
          drawTextWithRuns(doc, `•  ${bullet.trim()}`, config.fontBody, fallbackBody, {
            indent: config.bulletIndent,
            lineGap: 1.8,
            align: 'left',
          });
        });
      }
    });
  };

  const renderEducation = () => {
    if (!Array.isArray(resumeData.education) || resumeData.education.length === 0) return;
    drawSectionHeading('Education');
    resumeData.education.forEach((edu, idx) => {
      if (idx > 0) doc.moveDown(0.3);

      doc.fontSize(template === 'compact' ? 9.5 : 10).fillColor(config.primaryColor);
      drawTextWithRuns(doc, edu.degree || '', config.fontHead, fallbackHead, {
        continued: true,
      });

      const yr = edu.year ? `  |  ${edu.year}` : '';
      doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
      drawTextWithRuns(doc, yr, config.fontItalic, fallbackItalic, {
        align: 'right',
      });

      const instField = [
        edu.institution,
        edu.field ? `in ${edu.field}` : '',
        edu.score ? `(CGPA / Score: ${edu.score})` : '',
      ]
        .filter(Boolean)
        .join(', ');

      if (instField) {
        doc.fontSize(template === 'compact' ? 8.5 : 9).fillColor(config.secondaryColor);
        drawTextWithRuns(doc, instField, config.fontBody, fallbackBody);
      }
    });
  };

  const renderExtras = () => {
    const certs = resumeData.certifications || [];
    const achievements = [
      ...(Array.isArray(resumeData.achievements) ? resumeData.achievements : []),
      ...(Array.isArray(resumeData.awards) ? resumeData.awards : []),
    ].filter(Boolean);
    const positions = resumeData.positionsOfResponsibility || [];
    const languages = normalizeLanguages(resumeData.languages);
    const interests = resumeData.interests || [];
    const additionalSections = resumeData.additionalSections || [];

    // Certifications
    if (Array.isArray(certs) && certs.length > 0) {
      drawSectionHeading('Certifications');
      certs.forEach((cert) => {
        if (!cert || !cert.trim()) return;
        doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
        drawTextWithRuns(doc, `•  ${cert.trim()}`, config.fontBody, fallbackBody, {
          indent: config.bulletIndent,
          lineGap: 1.5,
        });
      });
    }

    // Achievements & Awards
    if (achievements.length > 0) {
      drawSectionHeading('Achievements & Awards');
      achievements.forEach((ach) => {
        const textStr = typeof ach === 'string' ? ach : ach.title || ach.text || '';
        if (!textStr || !textStr.trim()) return;
        doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
        drawTextWithRuns(doc, `•  ${textStr.trim()}`, config.fontBody, fallbackBody, {
          indent: config.bulletIndent,
          lineGap: 1.5,
        });
      });
    }

    // Positions of Responsibility
    if (Array.isArray(positions) && positions.length > 0) {
      drawSectionHeading('Positions of Responsibility');
      positions.forEach((pos) => {
        const textStr = typeof pos === 'string' ? pos : pos.title || pos.text || '';
        if (!textStr || !textStr.trim()) return;
        doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
        drawTextWithRuns(doc, `•  ${textStr.trim()}`, config.fontBody, fallbackBody, {
          indent: config.bulletIndent,
          lineGap: 1.5,
        });
      });
    }

    // Languages & Interests
    const extraItems = [];
    if (Array.isArray(languages) && languages.length > 0) {
      extraItems.push({ label: 'Languages', value: languages.join(', ') });
    }
    if (Array.isArray(interests) && interests.length > 0) {
      extraItems.push({ label: 'Interests', value: interests.join(', ') });
    }
    if (extraItems.length > 0) {
      drawSectionHeading('Languages & Interests');
      extraItems.forEach((item) => {
        doc.fontSize(template === 'compact' ? 8.5 : 9.5).fillColor(config.primaryColor);
        drawTextWithRuns(doc, `${item.label}: `, config.fontHead, fallbackHead, {
          continued: true,
        });
        drawTextWithRuns(doc, item.value, config.fontBody, fallbackBody, {
          lineGap: 2,
        });
      });
    }

    // Additional Sections
    if (Array.isArray(additionalSections) && additionalSections.length > 0) {
      additionalSections.forEach((sec) => {
        if (!sec || !sec.title) return;
        const lines = Array.isArray(sec.lines) ? sec.lines : [];
        if (lines.length === 0) return;

        drawSectionHeading(sec.title);
        lines.forEach((line) => {
          if (!line || !line.trim()) return;
          doc.fontSize(config.bulletTextSize).fillColor(config.primaryColor);
          drawTextWithRuns(doc, `•  ${line.trim()}`, config.fontBody, fallbackBody, {
            indent: config.bulletIndent,
            lineGap: 1.5,
          });
        });
      });
    }
  };

  const SECTION_MAP = {
    summary: renderSummary,
    skills: renderSkills,
    experience: renderExperience,
    projects: renderProjects,
    education: renderEducation,
    extras: renderExtras,
  };

  // Condition 3: A user-defined sectionOrder ALWAYS wins.
  // Template default order applies only when resume has no custom sectionOrder.
  const defaultOrder =
    config.defaultSectionOrder || [
      'summary',
      'skills',
      'experience',
      'projects',
      'education',
      'extras',
    ];
  const effectiveSectionOrder =
    Array.isArray(resumeData.sectionOrder) && resumeData.sectionOrder.length > 0
      ? resumeData.sectionOrder
      : defaultOrder;

  // Render sections in effective order
  effectiveSectionOrder.forEach((sectionKey) => {
    if (
      resumeData.sectionVisibility &&
      resumeData.sectionVisibility[sectionKey] === false
    ) {
      return;
    }
    const renderer = SECTION_MAP[sectionKey];
    if (typeof renderer === 'function') {
      renderer();
    }
  });

  doc.end();

  if (outputStream && typeof outputStream.write === 'function') {
    return doc;
  }

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

module.exports = {
  generateResumePdf,
};
