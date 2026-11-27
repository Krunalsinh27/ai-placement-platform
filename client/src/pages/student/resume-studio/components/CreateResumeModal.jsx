import React, { useState } from 'react';
import { X, Sparkles, Layout } from 'lucide-react';

const TEMPLATE_OPTIONS = [
  { id: 'modern', name: 'Modern Clean', description: 'Clean single-column ATS layout with clear hierarchy' },
  { id: 'classic', name: 'Classic Academic', description: 'Traditional serif format ideal for research & core engineering' },
  { id: 'compact', name: 'Compact Single-Column', description: 'Dense layout for comprehensive experience on one page' },
  { id: 'minimal-ats', name: 'Minimal ATS', description: 'High-parsing single-column ATS layout with zero distractions' },
  { id: 'software-engineer', name: 'Software Engineer', description: 'Prioritizes technical skills, repositories, and projects' },
  { id: 'professional-fresher', name: 'Professional Fresher', description: 'Emphasizes coursework, certifications, and academic achievements' },
  { id: 'modern-professional', name: 'Modern Professional', description: 'Polished structure suitable for product and analyst roles' },
  { id: 'technical-projects', name: 'Technical & Projects', description: 'Expands project architectures, metrics, and technologies' },
];

const CreateResumeModal = ({ isOpen, onClose, onCreate, isSubmitting }) => {
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('modern');
  const [isPrimary, setIsPrimary] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      title: title.trim() || 'Untitled Resume',
      templateId,
      isPrimary,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Create New Resume</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="create-resume-title" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Resume Title
            </label>
            <input
              id="create-resume-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fullstack Engineer, Data Analyst Variant"
              maxLength={120}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Template Style
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {TEMPLATE_OPTIONS.map((tmpl) => (
                <label
                  key={tmpl.id}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    templateId === tmpl.id
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={tmpl.id}
                    checked={templateId === tmpl.id}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-1.5 font-medium text-xs text-slate-900">
                    <Layout className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{tmpl.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                    {tmpl.description}
                  </p>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <span className="text-xs text-slate-700 font-medium">
                Make this my primary resume for one-click job applications
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition"
            >
              {isSubmitting ? 'Creating...' : 'Create Resume'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateResumeModal;
