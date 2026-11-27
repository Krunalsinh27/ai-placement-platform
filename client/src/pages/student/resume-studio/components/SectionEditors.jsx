import React, { useState } from 'react';
import CategorizedSkillsEditor from './CategorizedSkillsEditor';
import LanguageInput from './LanguageInput';
import {
  User,
  FileText,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Sparkles,
  Award,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
} from 'lucide-react';

const SECTION_METADATA = {
  summary: { label: 'Professional Summary', icon: FileText },
  skills: { label: 'Technical Skills', icon: Sparkles },
  experience: { label: 'Experience', icon: Briefcase },
  projects: { label: 'Technical Projects', icon: FolderGit2 },
  education: { label: 'Education', icon: GraduationCap },
  extras: { label: 'Extras & Certifications', icon: Award },
};

const SectionEditors = ({
  resumeData = {},
  sectionOrder = ['summary', 'skills', 'experience', 'projects', 'education', 'extras'],
  sectionVisibility = {},
  onChange,
  onOrderChange,
  onVisibilityChange,
  onRequestSuggestion,
  isSuggesting = false,
  initialOpenSections = {},
}) => {
  const [openSections, setOpenSections] = useState({
    personal: true,
    summary: false,
    skills: false,
    experience: false,
    projects: false,
    education: false,
    extras: false,
    ...initialOpenSections,
  });

  const toggleOpen = (sectionKey) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const handleContactChange = (field, value) => {
    const updated = {
      ...resumeData,
      contact: {
        ...(resumeData.contact || {}),
        [field]: value,
      },
    };
    onChange(updated);
  };

  const moveSection = (index, direction) => {
    const newOrder = [...sectionOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    onOrderChange(newOrder);
  };

  const toggleVisibility = (sectionKey) => {
    const current = sectionVisibility[sectionKey] !== false;
    onVisibilityChange({
      ...sectionVisibility,
      [sectionKey]: !current,
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. PERSONAL INFORMATION (Fixed Header Section) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div
          onClick={() => toggleOpen('personal')}
          className="flex items-center justify-between p-4 bg-slate-50/70 border-b border-slate-100 cursor-pointer hover:bg-slate-100/70 transition"
        >
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-xs text-slate-900 uppercase tracking-wider">
              Personal Information
            </h3>
          </div>
          {openSections.personal ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>

        {openSections.personal && (
          <div className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  value={resumeData.contact?.fullName || ''}
                  onChange={(e) => handleContactChange('fullName', e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={resumeData.contact?.email || ''}
                  onChange={(e) => handleContactChange('email', e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone</label>
                <input
                  type="text"
                  value={resumeData.contact?.phone || ''}
                  onChange={(e) => handleContactChange('phone', e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Location</label>
                <input
                  type="text"
                  value={resumeData.contact?.location || ''}
                  onChange={(e) => handleContactChange('location', e.target.value)}
                  placeholder="e.g. Mumbai, India"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-600">LinkedIn URL</label>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>Display:</span>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="linkedinDisplay-editor"
                        value="short"
                        checked={resumeData.contact?.linkedinDisplay !== 'full'}
                        onChange={() => handleContactChange('linkedinDisplay', 'short')}
                        className="text-indigo-600 focus:ring-0 text-[10px]"
                      />
                      <span>Short (LinkedIn)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="linkedinDisplay-editor"
                        value="full"
                        checked={resumeData.contact?.linkedinDisplay === 'full'}
                        onChange={() => handleContactChange('linkedinDisplay', 'full')}
                        className="text-indigo-600 focus:ring-0 text-[10px]"
                      />
                      <span>Full URL</span>
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  value={resumeData.contact?.linkedin || ''}
                  onChange={(e) => handleContactChange('linkedin', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  data-testid="input-linkedin"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-600">GitHub URL</label>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>Display:</span>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="githubDisplay-editor"
                        value="short"
                        checked={resumeData.contact?.githubDisplay !== 'full'}
                        onChange={() => handleContactChange('githubDisplay', 'short')}
                        className="text-indigo-600 focus:ring-0 text-[10px]"
                      />
                      <span>Short (GitHub)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="githubDisplay-editor"
                        value="full"
                        checked={resumeData.contact?.githubDisplay === 'full'}
                        onChange={() => handleContactChange('githubDisplay', 'full')}
                        className="text-indigo-600 focus:ring-0 text-[10px]"
                      />
                      <span>Full URL</span>
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  value={resumeData.contact?.github || ''}
                  onChange={(e) => handleContactChange('github', e.target.value)}
                  placeholder="https://github.com/username"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  data-testid="input-github"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Portfolio / Website</label>
              <input
                type="text"
                value={resumeData.contact?.portfolio || ''}
                onChange={(e) => handleContactChange('portfolio', e.target.value)}
                placeholder="portfolio.dev"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. DYNAMIC ORDERABLE SECTIONS */}
      {sectionOrder.map((sectionKey, index) => {
        const meta = SECTION_METADATA[sectionKey] || { label: sectionKey, icon: FileText };
        const Icon = meta.icon;
        const isVisible = sectionVisibility[sectionKey] !== false;
        const isOpen = openSections[sectionKey];

        return (
          <div
            key={sectionKey}
            className={`bg-white rounded-xl border transition shadow-xs overflow-hidden ${
              isVisible ? 'border-slate-200' : 'border-slate-200/60 opacity-60'
            }`}
          >
            {/* Header with Reorder, Show/Hide, and Accordion Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50/70 border-b border-slate-100 select-none">
              <div className="flex items-center gap-2">
                {/* Reorder Buttons */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    title="Move Section Up"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sectionOrder.length - 1}
                    title="Move Section Down"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Icon className="w-4 h-4 text-indigo-600" />
                <span
                  onClick={() => toggleOpen(sectionKey)}
                  className="font-semibold text-xs text-slate-900 cursor-pointer hover:text-indigo-600"
                >
                  {meta.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Visibility Toggle */}
                <button
                  type="button"
                  onClick={() => toggleVisibility(sectionKey)}
                  title={isVisible ? 'Hide Section from Preview & PDF' : 'Show Section'}
                  className={`p-1.5 rounded-lg text-xs font-medium transition ${
                    isVisible
                      ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                      : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                  }`}
                >
                  {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                {/* Expand Toggle */}
                <button
                  type="button"
                  onClick={() => toggleOpen(sectionKey)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Section Form Editors */}
            {isOpen && (
              <div className="p-4 text-xs space-y-4">
                {/* SUMMARY */}
                {sectionKey === 'summary' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Professional Summary
                      </label>
                      {onRequestSuggestion && (
                        <button
                          type="button"
                          onClick={() => onRequestSuggestion({ type: 'summary', originalText: resumeData.summary })}
                          disabled={isSuggesting}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          Polish with AI
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={4}
                      value={resumeData.summary || ''}
                      onChange={(e) => onChange({ ...resumeData, summary: e.target.value })}
                      placeholder="Concise overview of your technical background, competencies, and career goals..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* SKILLS */}
                {sectionKey === 'skills' && (
                  <CategorizedSkillsEditor
                    skills={resumeData.skills || []}
                    onChange={(newSkills) => onChange({ ...resumeData, skills: newSkills })}
                    onRequestSuggestion={onRequestSuggestion}
                    isSuggesting={isSuggesting}
                  />
                )}

                {/* EXPERIENCE */}
                {sectionKey === 'experience' && (
                  <div className="space-y-4">
                    {(resumeData.experience || []).map((exp, expIdx) => (
                      <div key={expIdx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 text-xs">Role #{expIdx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newExp = resumeData.experience.filter((_, i) => i !== expIdx);
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={exp.title || ''}
                            onChange={(e) => {
                              const newExp = [...(resumeData.experience || [])];
                              newExp[expIdx] = { ...newExp[expIdx], title: e.target.value };
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            placeholder="Job Title"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={exp.company || ''}
                            onChange={(e) => {
                              const newExp = [...(resumeData.experience || [])];
                              newExp[expIdx] = { ...newExp[expIdx], company: e.target.value };
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            placeholder="Company Name"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={exp.location || ''}
                            onChange={(e) => {
                              const newExp = [...(resumeData.experience || [])];
                              newExp[expIdx] = { ...newExp[expIdx], location: e.target.value };
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            placeholder="Location (e.g. Bangalore, India)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={exp.duration || ''}
                            onChange={(e) => {
                              const newExp = [...(resumeData.experience || [])];
                              newExp[expIdx] = { ...newExp[expIdx], duration: e.target.value };
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            placeholder="Duration (e.g. June 2024 - Present)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Bullet Points (one per line)
                          </label>
                          <textarea
                            rows={3}
                            value={(exp.bullets || []).join('\n')}
                            onChange={(e) => {
                              const newExp = [...(resumeData.experience || [])];
                              newExp[expIdx] = {
                                ...newExp[expIdx],
                                bullets: e.target.value.split('\n'),
                              };
                              onChange({ ...resumeData, experience: newExp });
                            }}
                            placeholder="• Built API endpoints improving latency..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          {onRequestSuggestion && (exp.bullets || []).some((b) => b && b.trim()) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {(exp.bullets || []).map((b, bIdx) => {
                                if (!b || !b.trim()) return null;
                                return (
                                  <button
                                    key={bIdx}
                                    type="button"
                                    onClick={() =>
                                      onRequestSuggestion({
                                        type: 'bullet',
                                        section: 'experience',
                                        itemIndex: expIdx,
                                        bulletIndex: bIdx,
                                        originalText: b.trim(),
                                      })
                                    }
                                    disabled={isSuggesting}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50"
                                    title="Polish this bullet with AI"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                                    Polish Bullet #{bIdx + 1}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newExp = [
                          ...(resumeData.experience || []),
                          { title: '', company: '', location: '', duration: '', bullets: [''] },
                        ];
                        onChange({ ...resumeData, experience: newExp });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-medium text-xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Experience
                    </button>
                  </div>
                )}

                {/* PROJECTS */}
                {sectionKey === 'projects' && (
                  <div className="space-y-4">
                    {(resumeData.projects || []).map((proj, projIdx) => (
                      <div key={projIdx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 text-xs">Project #{projIdx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newProj = resumeData.projects.filter((_, i) => i !== projIdx);
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={proj.title || ''}
                            onChange={(e) => {
                              const newProj = [...(resumeData.projects || [])];
                              newProj[projIdx] = { ...newProj[projIdx], title: e.target.value };
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            placeholder="Project Title"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={proj.duration || ''}
                            onChange={(e) => {
                              const newProj = [...(resumeData.projects || [])];
                              newProj[projIdx] = { ...newProj[projIdx], duration: e.target.value };
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            placeholder="Duration (e.g. Jan 2024)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={(proj.technologies || []).join(', ')}
                            onChange={(e) => {
                              const newProj = [...(resumeData.projects || [])];
                              newProj[projIdx] = {
                                ...newProj[projIdx],
                                technologies: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                              };
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            placeholder="Technologies (e.g. React, Node.js)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={proj.link || ''}
                            onChange={(e) => {
                              const newProj = [...(resumeData.projects || [])];
                              newProj[projIdx] = { ...newProj[projIdx], link: e.target.value };
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            placeholder="Project / GitHub Link"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Bullet Points (one per line)
                          </label>
                          <textarea
                            rows={3}
                            value={(proj.bullets || []).join('\n')}
                            onChange={(e) => {
                              const newProj = [...(resumeData.projects || [])];
                              newProj[projIdx] = {
                                ...newProj[projIdx],
                                bullets: e.target.value.split('\n'),
                              };
                              onChange({ ...resumeData, projects: newProj });
                            }}
                            placeholder="• Implemented authentication with JWT..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          {onRequestSuggestion && (proj.bullets || []).some((b) => b && b.trim()) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {(proj.bullets || []).map((b, bIdx) => {
                                if (!b || !b.trim()) return null;
                                return (
                                  <button
                                    key={bIdx}
                                    type="button"
                                    onClick={() =>
                                      onRequestSuggestion({
                                        type: 'bullet',
                                        section: 'projects',
                                        itemIndex: projIdx,
                                        bulletIndex: bIdx,
                                        originalText: b.trim(),
                                      })
                                    }
                                    disabled={isSuggesting}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50"
                                    title="Polish this bullet with AI"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                                    Polish Bullet #{bIdx + 1}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newProj = [
                          ...(resumeData.projects || []),
                          { title: '', duration: '', link: '', technologies: [], bullets: [''] },
                        ];
                        onChange({ ...resumeData, projects: newProj });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-medium text-xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Project
                    </button>
                  </div>
                )}

                {/* EDUCATION */}
                {sectionKey === 'education' && (
                  <div className="space-y-4">
                    {(resumeData.education || []).map((edu, eduIdx) => (
                      <div key={eduIdx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 text-xs">Degree #{eduIdx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newEdu = resumeData.education.filter((_, i) => i !== eduIdx);
                              onChange({ ...resumeData, education: newEdu });
                            }}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={edu.degree || ''}
                            onChange={(e) => {
                              const newEdu = [...(resumeData.education || [])];
                              newEdu[eduIdx] = { ...newEdu[eduIdx], degree: e.target.value };
                              onChange({ ...resumeData, education: newEdu });
                            }}
                            placeholder="Degree (e.g. B.Tech)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={edu.field || ''}
                            onChange={(e) => {
                              const newEdu = [...(resumeData.education || [])];
                              newEdu[eduIdx] = { ...newEdu[eduIdx], field: e.target.value };
                              onChange({ ...resumeData, education: newEdu });
                            }}
                            placeholder="Field of Study (e.g. Computer Science)"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={edu.institution || ''}
                            onChange={(e) => {
                              const newEdu = [...(resumeData.education || [])];
                              newEdu[eduIdx] = { ...newEdu[eduIdx], institution: e.target.value };
                              onChange({ ...resumeData, education: newEdu });
                            }}
                            placeholder="University / Institute"
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={edu.year || ''}
                              onChange={(e) => {
                                const newEdu = [...(resumeData.education || [])];
                                newEdu[eduIdx] = { ...newEdu[eduIdx], year: e.target.value };
                                onChange({ ...resumeData, education: newEdu });
                              }}
                              placeholder="Year (e.g. 2026)"
                              className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                            />
                            <input
                              type="text"
                              value={edu.score || ''}
                              onChange={(e) => {
                                const newEdu = [...(resumeData.education || [])];
                                newEdu[eduIdx] = { ...newEdu[eduIdx], score: e.target.value };
                                onChange({ ...resumeData, education: newEdu });
                              }}
                              placeholder="Score / CGPA"
                              className="px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newEdu = [
                          ...(resumeData.education || []),
                          { degree: '', field: '', institution: '', year: '', score: '' },
                        ];
                        onChange({ ...resumeData, education: newEdu });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-medium text-xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Education
                    </button>
                  </div>
                )}

                {/* EXTRAS */}
                {sectionKey === 'extras' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Certifications (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={(resumeData.certifications || []).join(', ')}
                        onChange={(e) =>
                          onChange({
                            ...resumeData,
                            certifications: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                          })
                        }
                        placeholder="AWS Certified Practitioner, Google Cloud Associate"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Achievements & Awards (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={(resumeData.achievements || []).join(', ')}
                        onChange={(e) =>
                          onChange({
                            ...resumeData,
                            achievements: e.target.value.split(',').map((a) => a.trim()).filter(Boolean),
                          })
                        }
                        placeholder="Smart India Hackathon Finalist, Dean's List 2025"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <LanguageInput
                      languages={resumeData.languages || []}
                      onChange={(newLanguages) =>
                        onChange({
                          ...resumeData,
                          languages: newLanguages,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SectionEditors;
