import React from 'react';
import {
  FileText,
  Star,
  Copy,
  Edit2,
  Archive,
  ArrowUpRight,
  Clock,
  Layers,
  Trash2,
  RotateCcw,
} from 'lucide-react';

const TEMPLATE_NAMES = {
  modern: 'Modern Clean',
  classic: 'Classic Academic',
  compact: 'Compact Single-Column',
  'minimal-ats': 'Minimal ATS',
  'software-engineer': 'Software Engineer',
  'professional-fresher': 'Professional Fresher',
  'modern-professional': 'Modern Professional',
  'technical-projects': 'Technical & Projects',
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
};

const ResumeCard = ({
  resume,
  onOpen,
  onSetPrimary,
  onRename,
  onDuplicate,
  onArchive,
  onUnarchive,
  onTrash,
  onRestoreTrash,
  actionLoadingId,
  tab = 'active',
}) => {
  const isActionLoading = actionLoadingId === resume._id;
  const templateLabel = TEMPLATE_NAMES[resume.templateId] || 'Modern Clean';
  const isInTrash = Boolean(resume.deleted);
  const isArchived = Boolean(resume.archived && !resume.deleted);

  return (
    <div
      className={`group relative bg-white rounded-xl border transition-all duration-200 hover:shadow-lg flex flex-col justify-between ${
        resume.isPrimary && !isInTrash && !isArchived
          ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm'
          : isInTrash
          ? 'border-rose-200 bg-rose-50/20 shadow-sm'
          : isArchived
          ? 'border-amber-200 bg-amber-50/20 shadow-sm'
          : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
    >
      {/* Top Banner / Card Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                isInTrash
                  ? 'bg-rose-50 text-rose-600'
                  : isArchived
                  ? 'bg-amber-50 text-amber-600'
                  : resume.isPrimary
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                className={`font-semibold text-slate-900 text-base leading-snug truncate transition-colors ${
                  isInTrash
                    ? 'cursor-default'
                    : 'cursor-pointer hover:text-indigo-600'
                }`}
                onClick={() => (!isInTrash && onOpen ? onOpen(resume) : null)}
                title={resume.title}
              >
                {resume.title}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                {isInTrash && resume.deletedAt
                  ? `Deleted ${formatDate(resume.deletedAt)}`
                  : `Edited ${formatDate(resume.updatedAt || resume.createdAt)}`}
              </p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isInTrash && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                <Trash2 className="w-3 h-3" />
                Trash
              </span>
            )}
            {isArchived && !isInTrash && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Archive className="w-3 h-3" />
                Archived
              </span>
            )}
            {resume.isPrimary && !isInTrash && !isArchived && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                Primary
              </span>
            )}
          </div>
        </div>

        {/* Template & Meta Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
            {templateLabel}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200/60">
            <Layers className="w-3 h-3" />
            {`${resume.versionCount || 1} ${resume.versionCount === 1 ? 'version' : 'versions'}`}
          </span>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl flex items-center justify-between gap-2">
        {isInTrash ? (
          /* Trash tab actions */
          <div className="w-full flex items-center justify-between">
            <span className="text-xs text-slate-500 italic">In Trash</span>
            <button
              onClick={() => onRestoreTrash(resume)}
              disabled={isActionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
              data-testid="restore-trash-button"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore
            </button>
          </div>
        ) : (
          /* Active and Archived tab actions */
          <>
            <div className="flex items-center gap-1">
              {!resume.isPrimary && !isArchived && onSetPrimary && (
                <button
                  onClick={() => onSetPrimary(resume)}
                  disabled={isActionLoading}
                  title="Set as Primary Resume"
                  aria-label="Set as Primary Resume"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}

              {onRename && (
                <button
                  onClick={() => onRename(resume)}
                  disabled={isActionLoading}
                  title="Rename Resume"
                  aria-label="Rename Resume"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors disabled:opacity-50"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              {onDuplicate && (
                <button
                  onClick={() => onDuplicate(resume)}
                  disabled={isActionLoading}
                  title="Duplicate Resume"
                  aria-label="Duplicate Resume"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}

              {/* Archive / Unarchive toggle */}
              {isArchived ? (
                onUnarchive && (
                  <button
                    onClick={() => onUnarchive(resume)}
                    disabled={isActionLoading}
                    title="Restore to Active Resumes"
                    aria-label="Restore to Active Resumes"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )
              ) : (
                onArchive && (
                  <button
                    onClick={() => onArchive(resume)}
                    disabled={isActionLoading}
                    title="Archive Resume"
                    aria-label="Archive Resume"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )
              )}

              {/* Delete Resume action */}
              {onTrash && (
                <button
                  onClick={() => onTrash(resume)}
                  disabled={isActionLoading}
                  title="Delete Resume"
                  aria-label="Delete Resume"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                  data-testid="trash-resume-button"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Primary Open CTA */}
            {onOpen && (
              <button
                onClick={() => onOpen(resume)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 transition-colors"
              >
                Open Resume
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ResumeCard;
