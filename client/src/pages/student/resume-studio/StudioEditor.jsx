import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  ChevronLeft,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layout,
  Layers,
  Sparkles,
  MessageSquare,
  FileText,
  X,
  Archive,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import {
  getResume,
  updateResume,
  exportResumePdf,
  getResumeReviews,
  suggestResume,
  unarchiveResume,
  restoreTrashResume,
} from './api';
import { TEMPLATES, getTemplateById } from './templateRegistry';
import SectionEditors from './components/SectionEditors';
import StudioPreview from './components/StudioPreview';
import TailorModal from './components/TailorModal';
import CoverLetterModal from './components/CoverLetterModal';

const DEFAULT_SECTION_ORDER = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'extras',
];

const StudioEditor = ({ initialResume, initialLoading, initialError } = {}) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [resume, setResume] = useState(initialResume || null);
  const [loading, setLoading] = useState(initialLoading !== undefined ? initialLoading : true);
  const [error, setError] = useState(initialError !== undefined ? initialError : null);
  const [isArchived, setIsArchived] = useState(Boolean(initialResume?.archived));
  const [isDeleted, setIsDeleted] = useState(Boolean(initialResume?.deleted));
  const [isRestoring, setIsRestoring] = useState(false);

  const [title, setTitle] = useState(initialResume?.title || 'Untitled Resume');
  const [templateId, setTemplateId] = useState(initialResume?.templateId || 'modern');
  const [resumeData, setResumeData] = useState(initialResume?.data || {});
  const [sectionOrder, setSectionOrder] = useState(
    initialResume?.data?.sectionOrder || DEFAULT_SECTION_ORDER
  );
  const [sectionVisibility, setSectionVisibility] = useState(
    initialResume?.data?.sectionVisibility || {}
  );

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showTailorModal, setShowTailorModal] = useState(false);
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false);

  const debounceTimerRef = useRef(null);
  const isInitialMountRef = useRef(true);
  const hasCustomOrderRef = useRef(Boolean(Array.isArray(initialResume?.data?.sectionOrder) && initialResume?.data?.sectionOrder.length > 0));

  // 1. Fetch resume from API on mount
  const fetchDoc = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getResume(id);
      if (data && data.success && data.resume) {
        const doc = data.resume;
        setResume(doc);
        setIsArchived(Boolean(doc.archived));
        setIsDeleted(Boolean(doc.deleted));
        setTitle(doc.title || 'Untitled Resume');
        setTemplateId(doc.templateId || 'modern');
        setResumeData(doc.data || {});
        if (Array.isArray(doc.data?.sectionOrder) && doc.data.sectionOrder.length > 0) {
          hasCustomOrderRef.current = true;
          setSectionOrder(doc.data.sectionOrder);
        } else {
          hasCustomOrderRef.current = false;
          const tmpl = getTemplateById(doc.templateId || 'modern');
          if (tmpl && tmpl.defaultSectionOrder) {
            setSectionOrder(tmpl.defaultSectionOrder);
          }
        }
        if (doc.data?.sectionVisibility) {
          setSectionVisibility(doc.data.sectionVisibility);
        }
        setLastSaved(new Date(doc.updatedAt || Date.now()));

        // Fetch reviews
        try {
          const revRes = await getResumeReviews(id);
          if (revRes && revRes.success) {
            setReviews(revRes.reviews || []);
          }
        } catch {
          // Non-blocking
        }
      } else {
        setError(data?.message || 'The resume could not be retrieved. Please try again.');
      }
    } catch (err) {
      const status = err.response?.status;
      const isDeletedResponse =
        status === 410 ||
        Boolean(err.response?.data?.isDeleted) ||
        Boolean(err.response?.data?.message?.toLowerCase().includes('trash'));

      if (isDeletedResponse) {
        if (err.response?.data?.resume) {
          setResume(err.response.data.resume);
          setTitle(err.response.data.resume.title || 'Untitled Resume');
        }
        setIsDeleted(true);
        setError(null);
        return;
      }

      let msg = err.response?.data?.message || err.message;
      if (status === 404) {
        msg = 'Resume not found';
      } else if (status === 403) {
        msg = 'Access denied: You do not have permission to view this resume';
      } else if (status === 401) {
        msg = 'Session expired. Please log in again.';
      } else if (status >= 500) {
        msg = 'Server error — please try again later';
      } else if (!err.response) {
        msg = 'Network error: Unable to connect to backend server';
      }
      setError(msg || 'The resume could not be retrieved. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (initialResume) return;
    fetchDoc();
  }, [fetchDoc, initialResume]);

  // 2. Perform Save
  const performSave = useCallback(
    async (currentTitle, currentTemplate, currentData, currentOrder, currentVisibility) => {
      if (!id) return;
      try {
        setIsSaving(true);
        setSaveError(null);

        const payload = {
          title: currentTitle,
          templateId: currentTemplate,
          data: {
            ...currentData,
            sectionOrder: currentOrder,
            sectionVisibility: currentVisibility,
          },
        };

        const res = await updateResume(id, payload);
        if (res.success) {
          setIsDirty(false);
          setLastSaved(new Date());
        } else {
          setSaveError(res.message || 'Save failed');
        }
      } catch (err) {
        setSaveError(err.response?.data?.message || 'Error saving changes');
      } finally {
        setIsSaving(false);
      }
    },
    [id]
  );

  // 3. Debounced Autosave Trigger
  const triggerDebouncedSave = useCallback(() => {
    setIsDirty(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performSave(title, templateId, resumeData, sectionOrder, sectionVisibility);
    }, 1000); // 1000ms debounce
  }, [performSave, title, templateId, resumeData, sectionOrder, sectionVisibility]);

  // Trigger autosave when data, template, or order changes (after initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    triggerDebouncedSave();
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [resumeData, templateId, title, sectionOrder, sectionVisibility, triggerDebouncedSave]);

  // 4. Change Handlers
  const handleDataChange = (newData) => {
    setResumeData(newData);
  };

  const handleOrderChange = (newOrder) => {
    hasCustomOrderRef.current = true;
    setSectionOrder(newOrder);
  };

  const handleVisibilityChange = (newVisibility) => {
    setSectionVisibility(newVisibility);
  };

  const handleTemplateChange = (newTemplateId) => {
    setTemplateId(newTemplateId);
    if (!hasCustomOrderRef.current) {
      const tmpl = getTemplateById(newTemplateId);
      if (tmpl && tmpl.defaultSectionOrder) {
        setSectionOrder(tmpl.defaultSectionOrder);
      }
    }
  };

  const handleTitleChange = (newTitle) => {
    setTitle(newTitle);
  };

  // 5. PDF Export Handler
  const handleExportPdf = async () => {
    if (!id) return;
    try {
      setIsExporting(true);
      toast.loading('Generating ATS PDF...', { id: 'export-pdf' });
      await exportResumePdf(id, title);
      toast.success('Resume PDF exported successfully', { id: 'export-pdf' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export PDF', { id: 'export-pdf' });
    } finally {
      setIsExporting(false);
    }
  };

  // 7. AI Suggestion Handlers (Phase 7)
  const handleRequestSuggestion = async (payload) => {
    if (!id) return;
    try {
      setIsSuggesting(true);
      const res = await suggestResume(id, payload);
      if (res && res.success) {
        setActiveSuggestion(res);
      } else {
        toast.error(res?.message || 'Failed to generate AI suggestion');
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || 'Suggestion request failed';
      if (status === 429) {
        toast.error(`AI Quota Exceeded: ${msg}`, { duration: 5000 });
      } else if (status === 422) {
        const reasonCodes = err.response?.data?.reasonCodes || [];
        toast.error(`Verification Rejected: ${msg} (${reasonCodes.join(', ')})`, { duration: 6000 });
      } else {
        toast.error(`AI Error: ${msg}`);
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!activeSuggestion) return;
    const { type, target, proposed } = activeSuggestion;
    const updated = JSON.parse(JSON.stringify(resumeData || {}));

    if (type === 'summary') {
      updated.summary = proposed;
    } else if (type === 'bullet') {
      const sec = target?.section || 'experience';
      const items = Array.isArray(updated[sec]) ? updated[sec] : [];
      if (typeof target?.itemIndex === 'number' && items[target.itemIndex]) {
        const item = items[target.itemIndex];
        const bullets = Array.isArray(item.bullets) ? [...item.bullets] : [];
        if (typeof target.bulletIndex === 'number' && target.bulletIndex < bullets.length) {
          bullets[target.bulletIndex] = proposed;
        } else {
          bullets.push(proposed);
        }
        item.bullets = bullets;
      }
      updated[sec] = items;
    } else if (type === 'skills') {
      updated.skills = proposed;
    }

    handleDataChange(updated);
    setActiveSuggestion(null);
    toast.success('Suggestion accepted and applied!');
  };

  const handleRejectSuggestion = () => {
    setActiveSuggestion(null);
    toast('Suggestion discarded without changes', { icon: 'ℹ️' });
  };

  const handleRestoreResume = async () => {
    try {
      setIsRestoring(true);
      const res = await unarchiveResume(id);
      if (res.success) {
        setIsArchived(false);
        setResume((prev) => (prev ? { ...prev, archived: false } : prev));
        toast.success('Resume restored to active');
        await fetchDoc();
      } else {
        toast.error(res.message || 'Failed to restore resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore resume');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreFromTrash = async () => {
    try {
      setIsRestoring(true);
      const res = await restoreTrashResume(id);
      if (res.success) {
        setIsDeleted(false);
        setResume((prev) => (prev ? { ...prev, deleted: false } : prev));
        toast.success('Resume restored from Trash');
        await fetchDoc();
      } else {
        toast.error(res.message || 'Failed to restore resume from Trash');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore resume from Trash');
    } finally {
      setIsRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3" data-testid="editor-loading">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-xs text-slate-500 font-medium">Loading Resume Builder...</p>
      </div>
    );
  }

  if (isDeleted) {
    return (
      <div className="rounded-2xl bg-rose-50 border border-rose-200 p-8 text-center max-w-lg mx-auto my-12" data-testid="editor-deleted-state">
        <Trash2 className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-rose-900 mb-1">This Resume is in Trash</h3>
        <p className="text-xs text-rose-700 mb-6">
          This resume was moved to Trash. It is currently read-only. You can restore it from Trash anytime to resume editing, or return to your dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/student/resume-studio')}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-xs transition"
          >
            Return to Dashboard
          </button>
          <button
            onClick={handleRestoreFromTrash}
            disabled={isRestoring}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            data-testid="editor-restore-trash-button"
          >
            {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Restore from Trash
          </button>
        </div>
      </div>
    );
  }

  if (isArchived) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-8 text-center max-w-lg mx-auto my-12" data-testid="editor-archived-state">
        <Archive className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-amber-900 mb-1">This Resume is Archived</h3>
        <p className="text-xs text-amber-700 mb-6">
          This resume was archived and is currently read-only. You can restore it to your active resumes to continue editing, or return to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/student/resume-studio')}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-xs transition"
          >
            Return to Dashboard
          </button>
          <button
            onClick={handleRestoreResume}
            disabled={isRestoring}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            data-testid="editor-restore-button"
          >
            {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Restore Resume
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    let errorTitle = 'Unable to Open Resume';
    let errorDescription =
      'This resume may have been removed or the link is invalid. Check your dashboard to view all available resumes.';

    if (error === 'Resume not found') {
      errorTitle = 'Resume Not Found';
      errorDescription =
        'This resume does not exist or may have been permanently removed. Check your dashboard to view all available resumes.';
    } else if (error.includes('Access denied') || error.includes('permission')) {
      errorTitle = 'Access Denied';
      errorDescription =
        'You do not have permission to view or edit this resume. It may belong to another account or college.';
    } else if (error.includes('Session expired') || error.includes('log in')) {
      errorTitle = 'Session Expired';
      errorDescription = 'Your session has expired. Please log in again to continue working.';
    } else if (error.includes('Server error')) {
      errorTitle = 'Server Error';
      errorDescription =
        'The server encountered an unexpected error while retrieving this resume. Please try again.';
    } else if (error.includes('Network error')) {
      errorTitle = 'Connection Error';
      errorDescription =
        'Unable to reach the server. Please check your internet connection and try again.';
    }

    return (
      <div className="rounded-2xl bg-rose-50 border border-rose-200 p-8 text-center max-w-lg mx-auto my-12" data-testid="editor-error">
        <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-rose-900 mb-1">Unable to Open Resume</h3>
        {errorTitle !== 'Unable to Open Resume' && (
          <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-1">{errorTitle}</p>
        )}
        <p className="text-xs text-rose-700 font-medium mb-2">{error}</p>
        <p className="text-xs text-slate-600 mb-6">{errorDescription}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/student/resume-studio')}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-xs transition"
            data-testid="editor-error-dashboard-button"
          >
            Return to Dashboard
          </button>
          {(error.includes('Server error') || error.includes('Network error') || error.includes('retrieved')) && (
            <button
              onClick={() => fetchDoc()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
              data-testid="editor-error-retry-button"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* =================================================================== */}
      {/* TOP STICKY TOOLBAR                                                 */}
      {/* =================================================================== */}
      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/student/resume-studio')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title="Back to Studio Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Resume Title"
              className="text-base font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition px-1 py-0.5 truncate max-w-[240px] sm:max-w-md"
            />
          </div>
        </div>

        {/* Center/Right: Template Picker + Save Status + Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Template Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <Layout className="w-3.5 h-3.5 text-slate-500 ml-1 shrink-0" />
            <select
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="bg-transparent border-none text-slate-800 text-xs font-semibold focus:outline-none pr-2 cursor-pointer"
            >
              {TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dirty / Saved Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 px-2 select-none" data-testid="save-status">
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span className="text-slate-600 font-medium">Saving...</span>
              </>
            ) : isDirty ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-700 font-medium">Unsaved changes</span>
              </>
            ) : saveError ? (
              <span
                onClick={triggerDebouncedSave}
                className="text-rose-600 font-medium cursor-pointer hover:underline flex items-center gap-1"
                title={saveError}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Save failed (retry)
              </span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-600">Saved</span>
              </>
            )}
          </div>

          {/* TPO Feedback Button */}
          {reviews.length > 0 && (
            <button
              onClick={() => setShowFeedbackModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                reviews[0]?.status === 'needs_revision'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : reviews[0]?.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}
              title="View feedback from your placement officer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>
                Feedback ({reviews.length})
                {reviews[0]?.status === 'needs_revision' && ' • Action Needed'}
              </span>
            </button>
          )}

          {/* Open in Wizard Button */}
          {id && (
            <button
              onClick={() => navigate(`/student/resume-studio/${id}/wizard`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
              title="Switch to Step-by-Step Wizard mode"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Wizard</span>
            </button>
          )}

          {/* Phase 8: Tailor to Job Button */}
          {id && (
            <button
              onClick={() => setShowTailorModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold transition"
              title="Tailor this resume to a specific job or campus drive"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Tailor to Job</span>
            </button>
          )}

          {/* Phase 9: Cover Letter Button */}
          {id && (
            <button
              onClick={() => setShowCoverLetterModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition"
              title="Create or edit cover letter for this resume"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Cover Letter</span>
            </button>
          )}

          {/* Export PDF Button */}
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Export PDF
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MAIN TWO-COLUMN SPLIT: Left (Editors) | Right (Live A4 Preview)      */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Section Form Editors */}
        <div className="lg:col-span-5 space-y-4">
          {/* TPO Feedback Alert Banner */}
          {reviews.length > 0 && reviews[0]?.status === 'needs_revision' && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-900">
                    Placement Officer Feedback ({reviews[0]?.tpo?.name || 'TPO'}):
                  </div>
                  <p className="text-rose-700 mt-0.5 line-clamp-2">{reviews[0]?.comment}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(true)}
                className="text-xs font-bold text-rose-800 hover:underline shrink-0"
              >
                View
              </button>
            </div>
          )}

          <SectionEditors
            resumeData={resumeData}
            sectionOrder={sectionOrder}
            sectionVisibility={sectionVisibility}
            onChange={handleDataChange}
            onOrderChange={handleOrderChange}
            onVisibilityChange={handleVisibilityChange}
            onRequestSuggestion={handleRequestSuggestion}
            isSuggesting={isSuggesting}
          />
        </div>

        {/* Right Column (7 cols): Live A4 HTML Preview (Sticky) */}
        <div className="lg:col-span-7 lg:sticky lg:top-20 self-start">
          <StudioPreview
            resumeData={resumeData}
            templateId={templateId}
            sectionOrder={sectionOrder}
            sectionVisibility={sectionVisibility}
          />
        </div>
      </div>

      {/* TPO Feedback Slide-Over / Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">TPO Resume Feedback</h3>
              </div>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              {reviews.length === 0 ? (
                <p className="text-slate-400 italic text-center py-6">
                  No feedback received yet from your placement officer.
                </p>
              ) : (
                reviews.map((rev) => (
                  <div
                    key={rev._id}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{rev.tpo?.name || 'TPO Reviewer'}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          rev.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : rev.status === 'needs_revision'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {rev.status === 'approved'
                          ? 'Approved'
                          : rev.status === 'needs_revision'
                          ? 'Needs Revision'
                          : 'In Review'}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{rev.comment}</p>
                    <div className="text-[10px] text-slate-400">
                      {new Date(rev.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI Generating Indicator */}
      {isSuggesting && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-pulse border border-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Generating grounded AI suggestion...</span>
        </div>
      )}

      {/* Side-by-Side Suggestion Modal */}
      {activeSuggestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-indigo-100 text-indigo-700">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 capitalize">
                    AI Suggestion: {activeSuggestion.type === 'bullet' ? 'Bullet Rewrite' : activeSuggestion.type === 'summary' ? 'Summary Polish' : 'Skills Optimization'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Review side-by-side before accepting. Changes are only saved on Accept.
                  </p>
                </div>
              </div>
              <button
                onClick={handleRejectSuggestion}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
                title="Discard suggestion"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {activeSuggestion.explanation && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-indigo-900 text-xs flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Why this change: </span>
                    {activeSuggestion.explanation}
                  </div>
                </div>
              )}

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Original
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 min-h-[120px] font-mono text-[11px] whitespace-pre-wrap">
                    {activeSuggestion.type === 'skills'
                      ? JSON.stringify(activeSuggestion.original, null, 2)
                      : activeSuggestion.original}
                  </div>
                </div>

                {/* Proposed */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Proposed (AI)
                  </div>
                  <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200 text-slate-800 min-h-[120px] font-mono text-[11px] whitespace-pre-wrap">
                    {activeSuggestion.type === 'skills'
                      ? JSON.stringify(activeSuggestion.proposed, null, 2)
                      : activeSuggestion.proposed}
                  </div>
                </div>
              </div>

              {Array.isArray(activeSuggestion.reasonCodes) && activeSuggestion.reasonCodes.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 font-semibold">Verification Tags:</span>
                  {activeSuggestion.reasonCodes.map((code, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {code}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleRejectSuggestion}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs transition"
              >
                Reject (Keep Original)
              </button>
              <button
                type="button"
                onClick={handleAcceptSuggestion}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs shadow-sm transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Accept & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 8: Tailor Modal */}
      {showTailorModal && (
        <TailorModal
          resumeId={id}
          resumeData={resumeData}
          templateId={templateId}
          sectionOrder={sectionOrder}
          sectionVisibility={sectionVisibility}
          onClose={() => setShowTailorModal(false)}
          onApplied={(updatedResume) => {
            if (updatedResume?.data) {
              handleDataChange(updatedResume.data);
            }
          }}
        />
      )}

      {/* Phase 9: Cover Letter Modal */}
      {showCoverLetterModal && (
        <CoverLetterModal
          resumeId={id}
          candidateName={resumeData?.contact?.fullName}
          contact={resumeData?.contact || {}}
          onClose={() => setShowCoverLetterModal(false)}
        />
      )}
    </div>
  );
};

export default StudioEditor;
