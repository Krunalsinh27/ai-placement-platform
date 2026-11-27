/**
 * Shared Resume Studio Template Registry
 *
 * Defines the canonical single-column ATS templates, typography, colors,
 * margins, and layout rules shared between the server-side PDFKit generator
 * and the client-side live HTML A4 preview.
 */

const TEMPLATES = [
  {
    id: 'modern',
    name: 'Modern Clean',
    description: 'Clean single-column ATS layout with clear hierarchy and indigo accents',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#0f172a', // Slate 900
    accentColor: '#4338ca', // Indigo 700
    secondaryColor: '#475569', // Slate 600
    lineColor: '#cbd5e1', // Slate 300
    margin: 36, // ~0.5 inch (36pt)
    nameSize: 20,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 10,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'classic',
    name: 'Classic Academic',
    description: 'Traditional serif format ideal for academic, research, and core engineering roles',
    fontCategory: 'serif',
    fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
    fontHead: 'Times-Bold',
    fontBody: 'Times-Roman',
    fontItalic: 'Times-Italic',
    primaryColor: '#000000',
    accentColor: '#111827', // Gray 900
    secondaryColor: '#374151', // Gray 700
    lineColor: '#9ca3af', // Gray 400
    margin: 36,
    nameSize: 21,
    headerAlign: 'center',
    drawSectionLine: true,
    spacingAfterSection: 10,
    bulletIndent: 14,
    bulletTextSize: 10,
    defaultSectionOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'extras'],
  },
  {
    id: 'compact',
    name: 'Compact Single-Column',
    description: 'Dense layout maximizing vertical real estate for comprehensive experience',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#1e293b', // Slate 800
    accentColor: '#1e293b',
    secondaryColor: '#64748b', // Slate 500
    lineColor: '#e2e8f0', // Slate 200
    margin: 28, // ~0.39 inch
    nameSize: 18,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 7,
    bulletIndent: 10,
    bulletTextSize: 9,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'minimal-ats',
    name: 'Minimal ATS',
    description: 'Strictly monochrome, single-column layout without dividing lines for maximum ATS compliance',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#000000',
    accentColor: '#000000',
    secondaryColor: '#333333',
    lineColor: 'transparent',
    margin: 36,
    nameSize: 20,
    headerAlign: 'left',
    drawSectionLine: false,
    spacingAfterSection: 9,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'software-engineer',
    name: 'Software Engineer',
    description: 'Technical layout prioritizing programming skills, repos, and architectural projects',
    fontCategory: 'sans',
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#0f172a',
    accentColor: '#0369a1', // Sky 700
    secondaryColor: '#475569',
    lineColor: '#bae6fd', // Sky 200
    margin: 36,
    nameSize: 20,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 10,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['skills', 'projects', 'experience', 'education', 'summary', 'extras'],
  },
  {
    id: 'professional-fresher',
    name: 'Professional Fresher',
    description: 'Targeted for recent graduates and early-career candidates, highlighting education and coursework',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#1e293b',
    accentColor: '#1d4ed8', // Blue 700
    secondaryColor: '#475569',
    lineColor: '#bfdbfe', // Blue 200
    margin: 36,
    nameSize: 20,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 10,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['education', 'skills', 'projects', 'experience', 'summary', 'extras'],
  },
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    description: 'Sophisticated executive layout balanced for consulting, leadership, and product roles',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#0f172a',
    accentColor: '#334155', // Slate 700
    secondaryColor: '#64748b',
    lineColor: '#cbd5e1', // Slate 300
    margin: 36,
    nameSize: 21,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 10,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'extras'],
  },
  {
    id: 'technical-projects',
    name: 'Technical Projects',
    description: 'Focused on complex engineering implementations, project architecture, and tech stacks',
    fontCategory: 'sans',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontHead: 'Helvetica-Bold',
    fontBody: 'Helvetica',
    fontItalic: 'Helvetica-Oblique',
    primaryColor: '#0f172a',
    accentColor: '#0f766e', // Teal 700
    secondaryColor: '#334155',
    lineColor: '#99f6e4', // Teal 200
    margin: 34,
    nameSize: 20,
    headerAlign: 'left',
    drawSectionLine: true,
    spacingAfterSection: 9,
    bulletIndent: 12,
    bulletTextSize: 9.5,
    defaultSectionOrder: ['projects', 'skills', 'experience', 'education', 'summary', 'extras'],
  },
];

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));

function getTemplates() {
  return TEMPLATES;
}

function getTemplateById(templateId = 'modern') {
  return TEMPLATE_MAP.get(templateId) || TEMPLATE_MAP.get('modern');
}

function isValidTemplateId(templateId) {
  return TEMPLATE_MAP.has(templateId);
}

module.exports = {
  TEMPLATES,
  getTemplates,
  getTemplateById,
  isValidTemplateId,
};
