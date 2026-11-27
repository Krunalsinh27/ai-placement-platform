import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Award,
  Send,
  X,
  Layers,
  Sparkles,
  Building2,
  Calendar,
} from 'lucide-react';

import { listTpoResumes, getTpoResume, createTpoReview } from '../student/resume-studio/api';
import StudioPreview from '../student/resume-studio/components/StudioPreview';

const STATUS_BADGES = {
  approved: {
    label: 'Approved',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  needs_revision: {
    label: 'Needs Revision',
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: AlertCircle,
  },
  in_review: {
    label: 'In Review',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Clock,
  },
  unreviewed: {
    label: 'Unreviewed',
    bg: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Clock,
  },
};

const TpoResumeReviews = () => {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');

  // Review Drawer / Modal State
  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resumeDetail, setResumeDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('needs_revision');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchResumes = async (pageNum = 1) => {
    try {
      setLoading(true);
      const params = { page: pageNum, limit };
      if (search) params.search = search;
      if (branch) params.branch = branch;
      if (reviewStatus !== 'all') params.reviewStatus = reviewStatus;

      const data = await listTpoResumes(params);
      if (data.success) {
        setResumes(data.resumes || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load resumes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes(page);
  }, [page, branch, reviewStatus]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchResumes(1);
  };

  const handleOpenDetail = async (id) => {
    setSelectedResumeId(id);
    setDetailLoading(true);
    setComment('');
    setStatus('needs_revision');
    try {
      const data = await getTpoResume(id);
      if (data.success) {
        setResumeDetail(data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load resume details');
      setSelectedResumeId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!comment.trim()) {
      toast.error('Please enter a feedback comment');
      return;
    }

    try {
      setSubmittingReview(true);
      const res = await createTpoReview(selectedResumeId, { comment, status });
      if (res.success) {
        toast.success('Feedback posted successfully!');
        setComment('');
        // Refresh details and list
        const refreshed = await getTpoResume(selectedResumeId);
        if (refreshed.success) {
          setResumeDetail(refreshed);
        }
        fetchResumes(page);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600" />
            Student Resumes & Feedback
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review student Resume Builder profiles, inspect drive submissions, and provide targeted feedback.
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name, enrollment no, or resume title..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={reviewStatus}
            onChange={(e) => {
              setReviewStatus(e.target.value);
              setPage(1);
            }}
            className="text-xs font-medium py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">All Review Statuses</option>
            <option value="approved">Approved</option>
            <option value="needs_revision">Needs Revision</option>
            <option value="in_review">In Review</option>
            <option value="unreviewed">Unreviewed</option>
          </select>
        </div>
      </div>

      {/* Resumes Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading student resumes...
          </div>
        ) : resumes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No student resumes match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Branch & CGPA</th>
                  <th className="py-3 px-4">Resume Title</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Submissions</th>
                  <th className="py-3 px-4">Latest Feedback</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumes.map((r) => {
                  const statusKey = r.latestReview?.status || 'unreviewed';
                  const badge = STATUS_BADGES[statusKey] || STATUS_BADGES.unreviewed;
                  const Icon = badge.icon;

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{r.student?.user?.name || 'Student'}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {r.student?.enrollmentNo} • {r.student?.user?.email}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-700">{r.student?.branch || '—'}</div>
                        <div className="text-[11px] text-slate-500">
                          CGPA: <strong>{r.student?.cgpa ?? '—'}</strong> ({r.student?.backlogs ?? 0} backlogs)
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {r.title}
                        {r.isPrimary && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                            Primary
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {r.templateId}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {r.submissionCount} drives
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(r._id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Review</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} resumes)
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review & Inspection Modal */}
      {selectedResumeId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <span>Resume Review & Drive Submissions</span>
                </h3>
                {resumeDetail?.resume && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {resumeDetail.resume.student?.user?.name} ({resumeDetail.resume.student?.enrollmentNo}) •{' '}
                    <strong>{resumeDetail.resume.title}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedResumeId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading resume details...
              </div>
            ) : resumeDetail ? (
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Preview & Submissions */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Submitted Applications Box */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      Drive Submissions ({resumeDetail.submittedApplications?.length || 0})
                    </h4>
                    {resumeDetail.submittedApplications?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        This resume has not been submitted to any placement drives yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {resumeDetail.submittedApplications.map((app) => (
                          <div
                            key={app._id}
                            className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-slate-900">
                                {app.drive?.role} • {app.drive?.company?.name}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Applied: {new Date(app.appliedOn).toLocaleDateString()} • Version:{' '}
                                <span className="font-semibold text-slate-700">
                                  {app.resumeVersion?.name || 'Default'}
                                </span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                              {app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live A4 Preview */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="p-2.5 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-700 flex justify-between items-center">
                      <span>Resume Preview (Read-Only)</span>
                      <span className="font-mono text-[10px] uppercase">{resumeDetail.resume?.templateId}</span>
                    </div>
                    <div className="p-4 bg-slate-100 flex justify-center">
                      <StudioPreview
                        resumeData={resumeDetail.resume?.data || {}}
                        templateId={resumeDetail.resume?.templateId || 'modern'}
                        sectionOrder={resumeDetail.resume?.data?.sectionOrder}
                        sectionVisibility={resumeDetail.resume?.data?.sectionVisibility}
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Feedback & Reviews */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Feedback Form */}
                  <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 uppercase tracking-wider">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                      Post TPO Review
                    </h4>
                    <form onSubmit={handleSubmitReview} className="space-y-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Review Decision
                        </label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="needs_revision">Needs Revision</option>
                          <option value="approved">Approved</option>
                          <option value="in_review">In Review</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Feedback & Suggestions
                        </label>
                        <textarea
                          rows={4}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Provide actionable feedback on structure, formatting, metrics, or technical content..."
                          className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{submittingReview ? 'Posting...' : 'Post Review'}</span>
                      </button>
                    </form>
                  </div>

                  {/* Previous Reviews History */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Review History ({resumeDetail.reviews?.length || 0})
                    </h4>
                    {resumeDetail.reviews?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No feedback has been recorded yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {resumeDetail.reviews.map((rev) => {
                          const badge = STATUS_BADGES[rev.status] || STATUS_BADGES.needs_revision;
                          return (
                            <div
                              key={rev._id}
                              className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{rev.tpo?.name || 'TPO Reviewer'}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-slate-600 whitespace-pre-wrap">{rev.comment}</p>
                              <div className="text-[10px] text-slate-400">
                                {new Date(rev.createdAt).toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default TpoResumeReviews;
