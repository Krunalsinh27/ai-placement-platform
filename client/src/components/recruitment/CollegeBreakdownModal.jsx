import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  X,
  Building2,
  Users,
  Briefcase,
  ExternalLink,
  Download,
  Search,
  Filter,
  AlertCircle,
  RotateCw,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

const CollegeBreakdownModal = ({ isOpen, onClose, requirement, initialData = null }) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchBreakdown = async () => {
    if (!requirement?._id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/job-requirements/${requirement._id}/college-breakdown`);
      if (res.data.success) {
        setData(res.data);
      } else {
        setError(res.data.message || 'Failed to load breakdown data');
      }
    } catch (err) {
      console.error('Failed to load college breakdown:', err);
      setError(err.response?.data?.message || 'Failed to load college breakdown');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      return;
    }
    if (isOpen && requirement?._id) {
      setStatusFilter('all');
      setSearchQuery('');
      fetchBreakdown();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, requirement?._id, initialData]);

  // Handle CSV export
  const handleExportCsv = async () => {
    if (!requirement?._id) return;
    setIsExporting(true);
    try {
      const res = await api.get(`/job-requirements/${requirement._id}/college-breakdown?format=csv`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = (requirement.title || 'Requirement').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.setAttribute('download', `college_breakdown_${safeTitle}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('College breakdown CSV exported successfully');
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error('Failed to export breakdown CSV');
    } finally {
      setIsExporting(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      // Status filter
      if (statusFilter === 'has_applicants' && (row.applied || 0) <= 0) return false;
      if (statusFilter === 'zero_applicants' && (row.applied || 0) > 0) return false;
      if (statusFilter === 'drive_live' && !row.driveId) return false;
      if (statusFilter === 'pending' && row.driveRequestStatus !== 'pending') return false;
      if (statusFilter === 'scheduled' && row.driveRequestStatus !== 'scheduled') return false;

      // Search term
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = row.name?.toLowerCase().includes(query);
        const matchesCode = row.code?.toLowerCase().includes(query);
        const matchesCity = row.city?.toLowerCase().includes(query);
        return matchesName || matchesCode || matchesCity;
      }

      return true;
    });
  }, [data?.rows, statusFilter, searchQuery]);

  // Max applied count for proportional bar scaling
  const maxApplied = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) return 1;
    const max = Math.max(...data.rows.map((r) => r.applied || 0));
    return max > 0 ? max : 1;
  }, [data?.rows]);

  if (!isOpen) return null;

  const totals = data?.totals || { colleges: 0, requestsSent: 0, drivesCreated: 0, applicants: 0 };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      <div className="flex min-h-full items-center justify-center p-3 sm:p-4 text-center">
        <div
          className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all w-full max-w-5xl border border-slate-200/90 my-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/70 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Applicants by College
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">
                    Breakdown
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Requirement: <span className="text-slate-800 font-bold">{requirement?.title}</span> • Package: {requirement?.packageLpa} LPA
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={loading || isExporting || !data?.rows?.length}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                title="Download spreadsheet report"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              <button
                type="button"
                onClick={fetchBreakdown}
                disabled={loading}
                className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                title="Refresh breakdown"
              >
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            {/* Summary KPI Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 block">
                    Colleges Contacted
                  </span>
                  <div className="text-2xl font-black text-slate-900">
                    {loading ? '—' : totals.colleges}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {totals.requestsSent} requests dispatched
                  </span>
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                    Drives Live / Created
                  </span>
                  <div className="text-2xl font-black text-slate-900">
                    {loading ? '—' : totals.drivesCreated}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Active campus pipelines
                  </span>
                </div>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 block">
                    Total Applicants
                  </span>
                  <div className="text-2xl font-black text-slate-900">
                    {loading ? '—' : totals.applicants}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Across all partner campuses
                  </span>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter colleges by name, code, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  <option value="all">All Colleges ({data?.rows?.length || 0})</option>
                  <option value="has_applicants">Has Applicants</option>
                  <option value="zero_applicants">Zero Applicants</option>
                  <option value="drive_live">Drive Live</option>
                  <option value="pending">Request Pending</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>

            {/* Content View: Loading, Error, Empty, or Table */}
            {loading ? (
              <div className="py-16 text-center space-y-3">
                <RotateCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-600">Loading college application breakdown...</p>
              </div>
            ) : error ? (
              <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={fetchBreakdown}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs"
                >
                  Retry
                </button>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-14 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 space-y-2">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Colleges Match Filters</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {data?.rows?.length === 0
                    ? 'No drive requests have been dispatched to colleges for this requirement yet. Use "Send to Colleges" to start hiring.'
                    : 'Try clearing your search or status filter to see other colleges.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">College</th>
                        <th className="py-3 px-3 text-center">Request Status</th>
                        <th className="py-3 px-3 text-center">Drive Status</th>
                        <th className="py-3 px-4 min-w-[190px]">Applicants</th>
                        <th className="py-3 px-4">Stages</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => {
                        const appliedCount = row.applied || 0;
                        const percent = Math.min(100, Math.round((appliedCount / maxApplied) * 100));
                        const counts = row.statusCounts || {};

                        return (
                          <tr key={row.collegeId} className="hover:bg-slate-50/60 transition-colors">
                            {/* College info */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 text-xs">
                                {row.name}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                <span className="font-mono bg-slate-100 px-1 py-0.2 rounded font-semibold text-slate-600">
                                  {row.code}
                                </span>
                                <span>•</span>
                                <span>{row.city || 'Campus'}</span>
                              </div>
                            </td>

                            {/* Drive Request Status */}
                            <td className="py-3.5 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  row.driveRequestStatus === 'accepted' || row.driveRequestStatus === 'scheduled'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : row.driveRequestStatus === 'pending'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : row.driveRequestStatus === 'rejected'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {row.driveRequestStatus || 'pending'}
                              </span>
                            </td>

                            {/* Drive Status */}
                            <td className="py-3.5 px-3 text-center">
                              {row.driveId ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    row.driveStatus === 'open'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {row.driveStatus === 'open' ? 'Drive Live' : row.driveStatus || 'Drive Created'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium italic">
                                  No Drive Yet
                                </span>
                              )}
                            </td>

                            {/* Proportional Bar & Applied Count */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-black text-slate-900">
                                  {appliedCount} {appliedCount === 1 ? 'student' : 'students'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {percent}% of max
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    appliedCount > 0 ? 'bg-indigo-600' : 'bg-slate-200'
                                  }`}
                                  style={{ width: `${appliedCount > 0 ? Math.max(6, percent) : 0}%` }}
                                />
                              </div>
                            </td>

                            {/* Stage counts chips */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                                {appliedCount === 0 ? (
                                  <span className="text-slate-400 italic">0 applicants</span>
                                ) : (
                                  <>
                                    {counts.applied > 0 && (
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">
                                        App: {counts.applied}
                                      </span>
                                    )}
                                    {counts.shortlisted > 0 && (
                                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-semibold">
                                        Short: {counts.shortlisted}
                                      </span>
                                    )}
                                    {counts.interview > 0 && (
                                      <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded font-semibold">
                                        Int: {counts.interview}
                                      </span>
                                    )}
                                    {counts.selected > 0 && (
                                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold">
                                        Sel: {counts.selected}
                                      </span>
                                    )}
                                    {counts.rejected > 0 && (
                                      <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-semibold">
                                        Rej: {counts.rejected}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Action: Open drive pipeline if driveId exists */}
                            <td className="py-3.5 px-3 text-right">
                              {row.driveId ? (
                                <Link
                                  to={`/recruiter/drives/${row.driveId}/pipeline`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors"
                                  title="View applicants pipeline for this college drive"
                                >
                                  <span>Pipeline</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-normal italic">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollegeBreakdownModal;
