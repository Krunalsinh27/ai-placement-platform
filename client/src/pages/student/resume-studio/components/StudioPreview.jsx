import React, { useRef, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getTemplateById } from '../templateRegistry';
import { filterNonEmptySkillCategories } from '../utils/skillsHelper';
import { normalizeLanguages } from '../utils/languagesHelper';

const A4_PAGE_HEIGHT_PX = 1050; // Standard single-page A4 printable canvas threshold

const StudioPreview = ({
  resumeData = {},
  templateId = 'modern',
  sectionOrder = null,
  sectionVisibility = {},
  scale = 1,
}) => {
  const containerRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  const template = getTemplateById(templateId);

  // Measure content height to detect page overflow
  useEffect(() => {
    if (containerRef.current) {
      const height = containerRef.current.scrollHeight;
      setContentHeight(height);
    }
  }, [resumeData, templateId, sectionOrder, sectionVisibility]);

  // Compute overflow estimation
  const isOverflowing = contentHeight > A4_PAGE_HEIGHT_PX;
  const estimatedPages = Math.max(1, Math.ceil(contentHeight / A4_PAGE_HEIGHT_PX));

  const contact = resumeData.contact || {};
  const isClassic = templateId === 'classic';
  const isCompact = templateId === 'compact';

  // Section Heading component respecting template styles and minimal-ats no-line rule
  const renderSectionHeading = (title) => (
    <h3
      className={`font-bold uppercase tracking-wider text-xs ${
        template.drawSectionLine ? 'border-b pb-1' : 'pb-0.5'
      }`}
      style={{
        borderColor: template.drawSectionLine ? template.lineColor : 'transparent',
        color: template.accentColor,
      }}
    >
      {title}
    </h3>
  );

  // Section renderers
  const renderSection = (sectionKey) => {
    if (sectionVisibility[sectionKey] === false) return null;

    switch (sectionKey) {
      case 'summary':
        if (!resumeData.summary?.trim()) return null;
        return (
          <div key="summary" className="space-y-1.5" data-testid="preview-section-summary">
            {renderSectionHeading('Professional Summary')}
            <p className="text-xs text-slate-700 leading-relaxed text-justify">
              {resumeData.summary}
            </p>
          </div>
        );

      case 'skills':
        const validCategories = filterNonEmptySkillCategories(resumeData.skills);
        if (validCategories.length === 0) return null;
        return (
          <div key="skills" className="space-y-1.5" data-testid="preview-section-skills">
            {renderSectionHeading('Technical Skills')}
            <div className="space-y-1 text-xs text-slate-800">
              {validCategories.map((cat, i) => (
                <div key={i}>
                  <strong className="font-semibold text-slate-900">{cat.category}: </strong>
                  <span>{(cat.items || []).join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'experience':
        if (!Array.isArray(resumeData.experience) || resumeData.experience.length === 0) return null;
        return (
          <div key="experience" className="space-y-3" data-testid="preview-section-experience">
            {renderSectionHeading('Experience')}
            <div className="space-y-3">
              {resumeData.experience.map((exp, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{exp.title}</span>
                    <span className="font-normal italic text-slate-500">{exp.duration}</span>
                  </div>
                  <div className="text-slate-600 font-medium">
                    {[exp.company, exp.location].filter(Boolean).join(' — ')}
                  </div>
                  {Array.isArray(exp.bullets) && exp.bullets.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                      {exp.bullets.filter(Boolean).map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'projects':
        if (!Array.isArray(resumeData.projects) || resumeData.projects.length === 0) return null;
        return (
          <div key="projects" className="space-y-3" data-testid="preview-section-projects">
            {renderSectionHeading('Technical Projects')}
            <div className="space-y-3">
              {resumeData.projects.map((proj, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>
                      {proj.title}
                      {Array.isArray(proj.technologies) && proj.technologies.length > 0 && (
                        <span className="font-normal italic text-slate-500 ml-1">
                          ({proj.technologies.join(', ')})
                        </span>
                      )}
                    </span>
                    <span className="font-normal italic text-slate-500">{proj.duration}</span>
                  </div>
                  {proj.link && (
                    <div
                      className="text-[11px] hover:underline flex items-center gap-1"
                      style={{ color: template.accentColor }}
                    >
                      <span>{proj.link}</span>
                    </div>
                  )}
                  {Array.isArray(proj.bullets) && proj.bullets.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                      {proj.bullets.filter(Boolean).map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'education':
        if (!Array.isArray(resumeData.education) || resumeData.education.length === 0) return null;
        return (
          <div key="education" className="space-y-2" data-testid="preview-section-education">
            {renderSectionHeading('Education')}
            <div className="space-y-2">
              {resumeData.education.map((edu, idx) => (
                <div key={idx} className="text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{[edu.degree, edu.field].filter(Boolean).join(' in ')}</span>
                    <span className="font-normal italic text-slate-500">{edu.year}</span>
                  </div>
                  <div className="text-slate-600 flex items-center justify-between">
                    <span>{edu.institution}</span>
                    {edu.score && <span className="font-medium text-slate-700">CGPA/Score: {edu.score}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'extras':
        const certs = resumeData.certifications || [];
        const achievements = resumeData.achievements || [];
        const languages = normalizeLanguages(resumeData.languages);
        const customSecs = resumeData.additionalSections || [];

        if (
          certs.length === 0 &&
          achievements.length === 0 &&
          languages.length === 0 &&
          customSecs.length === 0
        ) {
          return null;
        }

        return (
          <div key="extras" className="space-y-3" data-testid="preview-section-extras">
            {certs.length > 0 && (
              <div className="space-y-1">
                {renderSectionHeading('Certifications')}
                <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-700">
                  {certs.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {achievements.length > 0 && (
              <div className="space-y-1">
                {renderSectionHeading('Achievements & Awards')}
                <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-700">
                  {achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {languages.length > 0 && (
              <div className="space-y-1">
                {renderSectionHeading('Languages')}
                <p className="text-xs text-slate-700">{languages.join(', ')}</p>
              </div>
            )}

            {customSecs.map((sec, i) => (
              <div key={i} className="space-y-1">
                {renderSectionHeading(sec.title || 'Additional Information')}
                <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-700">
                  {(sec.lines || []).map((l, lIdx) => (
                    <li key={lIdx}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  // Construct structured, clickable contact items
  const contactItems = [];
  if (contact.email) {
    contactItems.push(
      <a
        key="email"
        href={`mailto:${contact.email}`}
        className="hover:underline text-slate-700 hover:text-indigo-600 transition-colors"
      >
        {contact.email}
      </a>
    );
  }
  if (contact.phone) {
    contactItems.push(<span key="phone">{contact.phone}</span>);
  }
  if (contact.location) {
    contactItems.push(<span key="location">{contact.location}</span>);
  }
  if (contact.linkedin) {
    const isShort = contact.linkedinDisplay !== 'full';
    const linkedinUrl = contact.linkedin.startsWith('http') ? contact.linkedin : `https://${contact.linkedin}`;
    contactItems.push(
      <a
        key="linkedin"
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-0.5"
      >
        <span>{isShort ? 'LinkedIn' : contact.linkedin}</span>
      </a>
    );
  }
  if (contact.github) {
    const isShort = contact.githubDisplay !== 'full';
    const githubUrl = contact.github.startsWith('http') ? contact.github : `https://${contact.github}`;
    contactItems.push(
      <a
        key="github"
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-0.5"
      >
        <span>{isShort ? 'GitHub' : contact.github}</span>
      </a>
    );
  }
  if (contact.portfolio) {
    const portfolioUrl = contact.portfolio.startsWith('http') ? contact.portfolio : `https://${contact.portfolio}`;
    contactItems.push(
      <a
        key="portfolio"
        href={portfolioUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-0.5"
      >
        <span>Portfolio</span>
      </a>
    );
  }

  // Condition 3: A user-defined sectionOrder ALWAYS wins.
  // Template default order applies only when resume has no custom sectionOrder.
  const effectiveSectionOrder =
    Array.isArray(sectionOrder) && sectionOrder.length > 0
      ? sectionOrder
      : template.defaultSectionOrder || ['summary', 'skills', 'experience', 'projects', 'education', 'extras'];

  const separator = isClassic ? '  |  ' : '  •  ';

  return (
    <div className="space-y-3">
      {/* Page Overflow Warning Alert */}
      {isOverflowing && (
        <div
          data-testid="overflow-warning"
          className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-medium shadow-xs"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Page Overflow:</strong> Resume exceeds 1 page (estimated ~{estimatedPages} pages).
            Consider trimming bullets or hiding secondary sections to preserve ATS 1-page standard.
          </span>
        </div>
      )}

      {/* A4 Live Preview Canvas */}
      <div className="relative bg-slate-300/60 p-4 sm:p-6 rounded-2xl overflow-x-auto shadow-inner">
        <div
          ref={containerRef}
          data-testid="live-a4-preview"
          style={{
            fontFamily: template.fontFamily,
            color: template.primaryColor,
          }}
          className={`relative mx-auto bg-white rounded shadow-md transition-all ${
            isClassic
              ? 'font-serif'
              : isCompact
              ? 'font-sans text-[11px]'
              : 'font-sans text-xs'
          } ${isCompact ? 'p-6 sm:p-7' : 'p-8 sm:p-10'} max-w-[794px] min-h-[1050px] space-y-5`}
        >
          {/* Header */}
          <div className={`space-y-1 ${template.headerAlign === 'center' ? 'text-center' : 'text-left'}`}>
            <h1
              className={`font-bold tracking-tight text-slate-900 ${
                isCompact ? 'text-xl' : 'text-2xl'
              }`}
            >
              {contact.fullName || 'Your Name'}
            </h1>
            <div className="text-slate-600 text-xs leading-normal flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
              {contactItems.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-400 select-none">{separator}</span>}
                  {item}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Dynamic Ordered Sections */}
          {effectiveSectionOrder.map((secKey) => renderSection(secKey))}

          {/* Dotted Page 1 Boundary Indicator */}
          {isOverflowing && (
            <div
              data-testid="page-boundary"
              className="absolute left-0 right-0 border-b-2 border-dashed border-rose-400 pointer-events-none"
              style={{ top: `${A4_PAGE_HEIGHT_PX}px` }}
            >
              <span className="absolute right-4 -top-3 bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200 shadow-xs">
                Page 1 Boundary (A4)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudioPreview;
