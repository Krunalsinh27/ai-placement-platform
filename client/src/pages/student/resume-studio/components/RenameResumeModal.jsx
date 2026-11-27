import React, { useState, useEffect } from 'react';
import { X, Edit2 } from 'lucide-react';

const RenameResumeModal = ({ isOpen, onClose, onSave, resume, isSubmitting }) => {
  const [title, setTitle] = useState(resume?.title || '');

  useEffect(() => {
    if (resume?.title) {
      setTitle(resume.title);
    }
  }, [resume?.title]);

  if (!isOpen || !resume) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Edit2 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Rename Resume</h2>
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
            <label htmlFor="rename-resume-title" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Resume Title
            </label>
            <input
              id="rename-resume-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SDE 1 - Backend Variant"
              maxLength={120}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-4">
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
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition"
            >
              {isSubmitting ? 'Saving...' : 'Save Title'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameResumeModal;
