/**
 * Server-Side PDFKit ATS Resume Generator
 *
 * Implements 3 strictly single-column ATS-friendly templates:
 * 1. Modern Technical ('modern')
 * 2. Classic Academic ('classic')
 * 3. Compact Minimalist ('compact')
 *
 * Enforces strict anti-placeholder export guard:
 * Blocks PDF generation if any unresolved '[add your real number]' placeholder exists.
 */

const PDFDocument = require('pdfkit');
const { checkUnresolvedPlaceholders } = require('./resumeBuilderService');

/**
 * Generates an ATS-compliant single-column PDF and pipes it to the destination stream
 *
 * @param {Object} resumeData - Structured resume data
 * @param {string} templateId - 'modern' | 'classic' | 'compact'
 * @param {stream.Writable} outputStream - Response or file write stream
 */
function generateResumePdf(resumeData, templateId = 'modern', outputStream) {
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

  const template = ['modern', 'classic', 'compact'].includes(templateId) ? templateId : 'modern';

  // Template configuration
  const config = {
    modern: {
      fontHead: 'Helvetica-Bold',
      fontBody: 'Helvetica',
      fontItalic: 'Helvetica-Oblique',
      primaryColor: '#0f172a', // Deep slate
      accentColor: '#4338ca', // Indigo 700
      secondaryColor: '#475569',
      margin: 36,
      nameSize: 20,
      headerAlign: 'left',
      drawSectionLine: true,
      lineColor: '#cbd5e1',
      spacingAfterSection: 10,
      bulletIndent: 12,
      bulletTextSize: 9.5,
    },
    classic: {
      fontHead: 'Times-Bold',
      fontBody: 'Times-Roman',
      fontItalic: 'Times-Italic',
      primaryColor: '#000000',
      accentColor: '#111827',
      secondaryColor: '#374151',
      margin: 36,
      nameSize: 21,
      headerAlign: 'center',
      drawSectionLine: true,
      lineColor: '#9ca3af',
      spacingAfterSection: 10,
      bulletIndent: 14,
      bulletTextSize: 10,
    },
    compact: {
      fontHead: 'Helvetica-Bold',
      fontBody: 'Helvetica',
      fontItalic: 'Helvetica-Oblique',
      primaryColor: '#1e293b',
      accentColor: '#1e293b',
      secondaryColor: '#64748b',
      margin: 28,
      nameSize: 18,
      headerAlign: 'left',
      drawSectionLine: true,
      lineColor: '#e2e8f0',
      spacingAfterSection: 7,
      bulletIndent: 10,
      bulletTextSize: 9,
    },
  }[template];

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

  doc.pipe(outputStream);

  const contentWidth = doc.page.width - config.margin * 2;

  // Helper: Section Heading
  const drawSectionHeading = (title) => {
    doc.moveDown(0.6);
    doc
      .font(config.fontHead)
      .fontSize(template === 'compact' ? 10.5 : 11.5)
      .fillColor(config.accentColor)
      .text(title.toUpperCase(), { align: 'left' });

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
  doc
    .font(config.fontHead)
    .fontSize(config.nameSize)
    .fillColor(config.primaryColor)
    .text(contact.fullName || 'Candidate Name', { align: config.headerAlign });

  doc.moveDown(0.2);

  const contactItems = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin,
    contact.github,
    contact.portfolio,
  ].filter(Boolean);

  const contactSeparator = template === 'classic' ? '  |  ' : '  •  ';

  doc
    .font(config.fontBody)
    .fontSize(template === 'compact' ? 8.5 : 9)
    .fillColor(config.secondaryColor)
    .text(contactItems.join(contactSeparator), {
      align: config.headerAlign,
      lineGap: 2,
    });

  // =========================================================================
  // 2. SUMMARY (IF PRESENT)
  // =========================================================================
  if (resumeData.summary && resumeData.summary.trim()) {
    drawSectionHeading('Professional Summary');
    doc
      .font(config.fontBody)
      .fontSize(template === 'compact' ? 9 : 9.5)
      .fillColor(config.primaryColor)
      .text(resumeData.summary.trim(), {
        align: 'justify',
        lineGap: 2.5,
      });
  }

  // =========================================================================
  // 3. TECHNICAL SKILLS
  // =========================================================================
  if (Array.isArray(resumeData.skills) && resumeData.skills.length > 0) {
    drawSectionHeading('Technical Skills');
    resumeData.skills.forEach((cat) => {
      const catTitle = cat.category || 'Skills';
      const items = Array.isArray(cat.items) ? cat.items.join(', ') : '';
      if (!items) return;

      doc
        .font(config.fontHead)
        .fontSize(template === 'compact' ? 8.5 : 9.5)
        .fillColor(config.primaryColor)
        .text(`${catTitle}: `, { continued: true })
        .font(config.fontBody)
        .text(items, { lineGap: 2 });
    });
  }

  // =========================================================================
  // 4. WORK EXPERIENCE
  // =========================================================================
  if (Array.isArray(resumeData.experience) && resumeData.experience.length > 0) {
    drawSectionHeading('Professional Experience');
    resumeData.experience.forEach((exp, idx) => {
      if (idx > 0) doc.moveDown(0.4);

      // Title & Dates on top line
      doc
        .font(config.fontHead)
        .fontSize(template === 'compact' ? 9.5 : 10)
        .fillColor(config.primaryColor)
        .text(exp.title || 'Role Title', { continued: true });

      const dateStr = exp.duration ? `  |  ${exp.duration}` : '';
      doc
        .font(config.fontItalic)
        .fontSize(template === 'compact' ? 8.5 : 9)
        .fillColor(config.secondaryColor)
        .text(dateStr, { align: 'right' });

      // Company & Location on second line
      const compLoc = [exp.company, exp.location].filter(Boolean).join(' — ');
      if (compLoc) {
        doc
          .font(config.fontBody)
          .fontSize(template === 'compact' ? 8.5 : 9)
          .fillColor(config.secondaryColor)
          .text(compLoc);
      }

      // Bullets
      if (Array.isArray(exp.bullets)) {
        doc.moveDown(0.15);
        exp.bullets.forEach((bullet) => {
          if (!bullet || !bullet.trim()) return;
          doc
            .font(config.fontBody)
            .fontSize(config.bulletTextSize)
            .fillColor(config.primaryColor)
            .text(`•  ${bullet.trim()}`, {
              indent: config.bulletIndent,
              lineGap: 1.8,
              align: 'left',
            });
        });
      }
    });
  }

  // =========================================================================
  // 5. PROJECTS
  // =========================================================================
  if (Array.isArray(resumeData.projects) && resumeData.projects.length > 0) {
    drawSectionHeading('Technical Projects');
    resumeData.projects.forEach((proj, idx) => {
      if (idx > 0) doc.moveDown(0.4);

      doc
        .font(config.fontHead)
        .fontSize(template === 'compact' ? 9.5 : 10)
        .fillColor(config.primaryColor)
        .text(proj.title || 'Project Title', { continued: true });

      const techs = Array.isArray(proj.technologies) && proj.technologies.length > 0
        ? ` (${proj.technologies.join(', ')})`
        : '';

      doc
        .font(config.fontItalic)
        .fontSize(template === 'compact' ? 8.5 : 9)
        .fillColor(config.secondaryColor)
        .text(techs, { continued: Boolean(proj.duration || proj.link) });

      const linkOrDate = [proj.duration, proj.link].filter(Boolean).join('  |  ');
      if (linkOrDate) {
        doc
          .font(config.fontBody)
          .fontSize(template === 'compact' ? 8.5 : 9)
          .fillColor(config.secondaryColor)
          .text(`  |  ${linkOrDate}`, { align: 'right' });
      } else {
        doc.text('');
      }

      // Project Bullets
      if (Array.isArray(proj.bullets)) {
        doc.moveDown(0.15);
        proj.bullets.forEach((bullet) => {
          if (!bullet || !bullet.trim()) return;
          doc
            .font(config.fontBody)
            .fontSize(config.bulletTextSize)
            .fillColor(config.primaryColor)
            .text(`•  ${bullet.trim()}`, {
              indent: config.bulletIndent,
              lineGap: 1.8,
              align: 'left',
            });
        });
      }
    });
  }

  // =========================================================================
  // 6. EDUCATION
  // =========================================================================
  if (Array.isArray(resumeData.education) && resumeData.education.length > 0) {
    drawSectionHeading('Education');
    resumeData.education.forEach((edu, idx) => {
      if (idx > 0) doc.moveDown(0.3);

      doc
        .font(config.fontHead)
        .fontSize(template === 'compact' ? 9.5 : 10)
        .fillColor(config.primaryColor)
        .text(edu.degree || 'Degree', { continued: true });

      const yr = edu.year ? `  |  ${edu.year}` : '';
      doc
        .font(config.fontItalic)
        .fontSize(template === 'compact' ? 8.5 : 9)
        .fillColor(config.secondaryColor)
        .text(yr, { align: 'right' });

      const instField = [
        edu.institution,
        edu.field ? `in ${edu.field}` : '',
        edu.score ? `(CGPA / Score: ${edu.score})` : '',
      ]
        .filter(Boolean)
        .join(', ');

      if (instField) {
        doc
          .font(config.fontBody)
          .fontSize(template === 'compact' ? 8.5 : 9)
          .fillColor(config.secondaryColor)
          .text(instField);
      }
    });
  }

  // =========================================================================
  // 7. CERTIFICATIONS & ACHIEVEMENTS (IF PRESENT)
  // =========================================================================
  if (Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0) {
    drawSectionHeading('Certifications & Achievements');
    resumeData.certifications.forEach((cert) => {
      if (!cert || !cert.trim()) return;
      doc
        .font(config.fontBody)
        .fontSize(config.bulletTextSize)
        .fillColor(config.primaryColor)
        .text(`•  ${cert.trim()}`, {
          indent: config.bulletIndent,
          lineGap: 1.5,
        });
    });
  }

  doc.end();
  return doc;
}

module.exports = {
  generateResumePdf,
};
