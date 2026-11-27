import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Sparkles,
  Plus,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Archive,
  Trash2,
  RotateCcw,
} from 'lucide-react';

import {
  listResumes,
  createResume,
  updateResume,
  archiveResume,
  unarchiveResume,
  trashResume,
  listTrashResumes,
  restoreTrashResume,
  duplicateResume,
  setPrimaryResume,
} from './api';

import ResumeCard from './components/ResumeCard';
import CreateResumeModal from './components/CreateResumeModal';
import RenameResumeModal from './components/RenameResumeModal';

const StudioDashboard = ({
  initialResumes,
  initialLoading,
  initialError,
} = {}) => {
  const navigate = useNavigate();

  const [resumes, setResumes] = useState(initialResumes !== undefined ? initialResumes : []);
  const [loading, setLoading] = useState(initialLoading !== undefined ? initialLoading : true);
  const [error, setError] = useState(initialError !== undefined ? initialError : null);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived' | 'trash'

  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 9,
    pages: 1,
  });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [trashTarget, setTrashTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchResumes = useCallback(
    async (pageNumber = 1, tab = activeTab) => {
      try {
        setLoading(true);
        setError(null);

        let data;
        if (tab === 'trash') {
          data = await listTrashResumes({
            page: pageNumber,
            limit: pagination.limit,
          });
        } else {
          data = await listResumes({
            page: pageNumber,
            limit: pagination.limit,
            archived: tab === 'archived',
          });
        }

        if (data.success) {
          setResumes(data.resumes || []);
          setPagination(
            data.pagination || {
              total: data.resumes?.length || 0,
              page: pageNumber,
              limit: pagination.limit,
              pages: 1,
            }
          );
        } else {
          setError(data.message || 'Failed to load resumes');
        }
      } catch (err) {
        setError(
          err.response?.data?.message || err.message || 'Error connecting to Resume Builder'
        );
      } finally {
        setLoading(false);
      }
    },
    [activeTab, pagination.limit]
  );

  useEffect(() => {
    fetchResumes(1, activeTab);
  }, [fetchResumes, activeTab]);

  const handleTabChange = (newTab) => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
  };

  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      const res = await createResume(formData);
      if (res.success) {
        toast.success(`Created "${res.resume.title}"`);
        setCreateModalOpen(false);
        fetchResumes(1, 'active');
        setActiveTab('active');
      } else {
        toast.error(res.message || 'Failed to create resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error creating resume');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async (newTitle) => {
    if (!renameTarget) return;
    try {
      setIsSubmitting(true);
      const res = await updateResume(renameTarget._id, { title: newTitle });
      if (res.success) {
        toast.success('Resume renamed');
        setRenameTarget(null);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to rename resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error renaming resume');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (resume) => {
    try {
      setActionLoadingId(resume._id);
      const res = await duplicateResume(resume._id);
      if (res.success) {
        toast.success(`Duplicated "${resume.title}"`);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to duplicate resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error duplicating resume');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSetPrimary = async (resume) => {
    try {
      setActionLoadingId(resume._id);
      const res = await setPrimaryResume(resume._id);
      if (res.success) {
        toast.success(`"${resume.title}" set as Primary`);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to set primary resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error setting primary resume');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchive = async (resume) => {
    try {
      setActionLoadingId(resume._id);
      const res = await archiveResume(resume._id);
      if (res.success) {
        toast.success(`Archived "${resume.title}"`);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to archive resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error archiving resume');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnarchive = async (resume) => {
    try {
      setActionLoadingId(resume._id);
      const res = await unarchiveResume(resume._id);
      if (res.success) {
        toast.success(`Restored "${resume.title}" to Active Resumes`);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to unarchive resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error unarchiving resume');
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmTrash = async () => {
    if (!trashTarget) return;
    try {
      setIsSubmitting(true);
      const res = await trashResume(trashTarget._id);
      if (res.success) {
        toast.success(`Deleted "${trashTarget.title}"`);
        setTrashTarget(null);
        fetchResumes(pagination.page, activeTab);
      } else {
        toast.error(res.message || 'Failed to delete resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error deleting resume');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreTrash = async (resume) => {
    try {
      setActionLoadingId(resume._id);
      const res = await restoreTrashResume(resume._id);
      if (res.success) {
        toast.success(`Restored "${resume.title}" from Trash`);
        fetchResumes(pagination.page, 'trash');
      } else {
        toast.error(res.message || 'Failed to restore resume');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error restoring resume');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpen = (resume) => {
    const resumeId = typeof resume === 'string' ? resume : (resume?._id || resume?.id);
    if (!resumeId) return;
    navigate(`/student/resume-studio/${resumeId}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resume Builder</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Build, tailor, and maintain multiple role-specific resume variants from one central hub.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchResumes(pagination.page, activeTab)}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition"
            title="Refresh Resumes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => navigate('/student/resume-studio/wizard')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold transition"
            title="Build Step-by-Step with Wizard"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Wizard</span>
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Resume
          </button>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => handleTabChange('active')}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === 'active'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="tab-active"
          >
            Active Resumes
          </button>
          <button
            onClick={() => handleTabChange('archived')}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'archived'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="tab-archived"
          >
            <Archive className="w-4 h-4" />
            Archived
          </button>
          <button
            onClick={() => handleTabChange('trash')}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'trash'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            data-testid="tab-trash"
          >
            <Trash2 className="w-4 h-4" />
            Trash
          </button>
        </div>

        {pagination.total > 0 && (
          <span className="text-xs text-slate-500 pb-3">
            Showing {resumes.length} of {pagination.total} {activeTab}
          </span>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        /* Loading Skeleton */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="loading-state">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 animate-pulse"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 w-3/4">
                  <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-5/6" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="w-12 h-5 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <div className="w-20 h-6 bg-slate-100 rounded" />
                <div className="w-24 h-6 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* Error State */
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-6 text-center" data-testid="error-state">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-rose-900 mb-1">Failed to Load Resumes</h3>
          <p className="text-sm text-rose-700 max-w-md mx-auto mb-4">{error}</p>
          <button
            onClick={() => fetchResumes(pagination.page, activeTab)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
          >
            Try Again
          </button>
        </div>
      ) : resumes.length === 0 ? (
        /* Empty State */
        <div
          className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center"
          data-testid="empty-state"
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            {activeTab === 'trash' ? (
              <Trash2 className="w-8 h-8 text-slate-400" />
            ) : activeTab === 'archived' ? (
              <Archive className="w-8 h-8 text-amber-500" />
            ) : (
              <FileText className="w-8 h-8 text-indigo-600" />
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {activeTab === 'trash'
              ? 'Trash is Empty'
              : activeTab === 'archived'
              ? 'No Archived Resumes'
              : 'No Resumes Created Yet'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {activeTab === 'trash'
              ? 'Resumes you delete will be moved here. You can restore them anytime.'
              : activeTab === 'archived'
              ? 'Resumes you archive will be stored here safely. You can unarchive or restore them anytime.'
              : 'Create your primary resume or specialized variants for software engineering, product management, and core placement drives.'}
          </p>
          {activeTab === 'active' && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Create First Resume
            </button>
          )}
        </div>
      ) : (
        /* Resumes Grid */
        <div className="space-y-6" data-testid="resumes-list">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {resumes.map((resume) => (
              <ResumeCard
                key={resume._id}
                resume={resume}
                tab={activeTab}
                onOpen={handleOpen}
                onSetPrimary={handleSetPrimary}
                onRename={(res) => setRenameTarget(res)}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onTrash={(res) => setTrashTarget(res)}
                onRestoreTrash={handleRestoreTrash}
                actionLoadingId={actionLoadingId}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                Page {pagination.page} of {pagination.pages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchResumes(pagination.page - 1, activeTab)}
                  disabled={pagination.page <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  onClick={() => fetchResumes(pagination.page + 1, activeTab)}
                  disabled={pagination.page >= pagination.pages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateResumeModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreate}
        isSubmitting={isSubmitting}
      />

      <RenameResumeModal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        onSave={handleRename}
        resume={renameTarget}
        isSubmitting={isSubmitting}
      />

      {/* Delete Resume Confirmation Modal */}
      {trashTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          data-testid="trash-confirm-modal"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Resume?</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to delete this resume? This action may affect its saved versions and associated resume data.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs text-slate-700 font-medium">
              &quot;{trashTarget.title}&quot;
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTrashTarget(null)}
                disabled={isSubmitting}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTrash}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                data-testid="confirm-trash-button"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isSubmitting ? 'Deleting...' : 'Delete Resume'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioDashboard;
