/**
 * Client-Side Resume Studio Template Registry Mirror
 *
 * Mirrors server/services/resumeStudio/templateRegistry.js
 * Used by the live HTML A4 preview so it exactly matches server-side PDF output.
 */

export const TEMPLATES = [
  {
    id: 'modern',
    name: 'Modern Clean',
    description: 'Clean single-column ATS layout with clear hierarchy and indigo accents',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#0f172a', // Slate 900
    accentColor: '#4338ca', // Indigo 700
    secondaryColor: '#475569', // Slate 600
    lineColor: '#cbd5e1', // Slate 300
    margin: 36, // pt
    nameSize: '1.5rem', // 24px (~20pt)
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'classic',
    name: 'Classic Academic',
    description: 'Traditional serif format ideal for academic, research, and core engineering roles',
    fontCategory: 'serif',
    fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
    primaryColor: '#000000',
    accentColor: '#111827', // Gray 900
    secondaryColor: '#374151', // Gray 700
    lineColor: '#9ca3af', // Gray 400
    margin: 36,
    nameSize: '1.625rem', // 26px (~21pt)
    headerAlign: 'center',
    drawSectionLine: true,
    defaultSectionOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'extras'],
  },
  {
    id: 'compact',
    name: 'Compact Single-Column',
    description: 'Dense layout maximizing vertical real estate for comprehensive experience',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#1e293b', // Slate 800
    accentColor: '#1e293b',
    secondaryColor: '#64748b', // Slate 500
    lineColor: '#e2e8f0', // Slate 200
    margin: 28, // pt
    nameSize: '1.25rem', // 20px (~18pt)
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'minimal-ats',
    name: 'Minimal ATS',
    description: 'Strictly monochrome, single-column layout without dividing lines for maximum ATS compliance',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#000000',
    accentColor: '#000000',
    secondaryColor: '#333333',
    lineColor: 'transparent',
    margin: 36,
    nameSize: '1.5rem',
    headerAlign: 'left',
    drawSectionLine: false,
    defaultSectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  },
  {
    id: 'software-engineer',
    name: 'Software Engineer',
    description: 'Technical layout prioritizing programming skills, repos, and architectural projects',
    fontCategory: 'sans',
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    primaryColor: '#0f172a',
    accentColor: '#0369a1', // Sky 700
    secondaryColor: '#475569',
    lineColor: '#bae6fd', // Sky 200
    margin: 36,
    nameSize: '1.5rem',
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['skills', 'projects', 'experience', 'education', 'summary', 'extras'],
  },
  {
    id: 'professional-fresher',
    name: 'Professional Fresher',
    description: 'Targeted for recent graduates and early-career candidates, highlighting education and coursework',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#1e293b',
    accentColor: '#1d4ed8', // Blue 700
    secondaryColor: '#475569',
    lineColor: '#bfdbfe', // Blue 200
    margin: 36,
    nameSize: '1.5rem',
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['education', 'skills', 'projects', 'experience', 'summary', 'extras'],
  },
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    description: 'Sophisticated executive layout balanced for consulting, leadership, and product roles',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#0f172a',
    accentColor: '#334155', // Slate 700
    secondaryColor: '#64748b',
    lineColor: '#cbd5e1', // Slate 300
    margin: 36,
    nameSize: '1.5625rem',
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'extras'],
  },
  {
    id: 'technical-projects',
    name: 'Technical Projects',
    description: 'Focused on complex engineering implementations, project architecture, and tech stacks',
    fontCategory: 'sans',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    primaryColor: '#0f172a',
    accentColor: '#0f766e', // Teal 700
    secondaryColor: '#334155',
    lineColor: '#99f6e4', // Teal 200
    margin: 34,
    nameSize: '1.5rem',
    headerAlign: 'left',
    drawSectionLine: true,
    defaultSectionOrder: ['projects', 'skills', 'experience', 'education', 'summary', 'extras'],
  },
];

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));

export const getTemplates = () => TEMPLATES;

export const getTemplateById = (templateId = 'modern') =>
  TEMPLATE_MAP.get(templateId) || TEMPLATE_MAP.get('modern');
