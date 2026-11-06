import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Users,
  FileCheck2,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Award,
  Filter,
  RotateCw,
  Building2,
  Calendar,
  Layers,
  FileText,
  FileSpreadsheet,
  Download,
  UserCheck,
  UserX,
  Clock,
  Mail,
  Phone,
  GraduationCap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import toast from 'react-hot-toast';

const BRANCH_OPTIONS = [
  'ALL',
  'CSE',
  'IT',
  'ECE',
  'EE',
  'ME',
  'CE',
  'AI & DS',
  'Chemical',
];

const PIE_COLORS = ['#10b981', '#cbd5e1']; // Emerald for placed, Slate for unplaced

const AdminDashboard = () => {
  // Global Filters
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const params = {};
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.batchYear = yearFilter;

      const res = await api.get('/stats/export/pdf', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `placement_summary_report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Executive PDF report downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export summary report');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const params = {};
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.batchYear = yearFilter;

      const res = await api.get('/placements/export/excel', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `placement_records_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel workbook downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel spreadsheet');
    } finally {
      setExportingExcel(false);
    }
  };

  // Stats States
  const [overview, setOverview] = useState({
    totalStudents: 0,
    totalApplied: 0,
    totalPlaced: 0,
    placementPercentage: 0,
    highestPackage: 0,
    lowestPackage: 0,
    averagePackage: 0,
  });
  const [branchStats, setBranchStats] = useState([]);
  const [yearStats, setYearStats] = useState([]);
  const [companyStats, setCompanyStats] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);

  const fetchAllStats = async () => {
    setLoading(true);
    try {
      const params = {};
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.batchYear = yearFilter;

      const [
        overviewRes,
        branchRes,
        yearRes,
        companyRes,
        topRes,
      ] = await Promise.all([
        api.get('/stats/overview', { params }),
        api.get('/stats/by-branch', { params }),
        api.get('/stats/by-year', { params }),
        api.get('/stats/by-company', { params }),
        api.get('/stats/top-companies', { params }),
      ]);

      if (overviewRes.data.success) setOverview(overviewRes.data.data);
      if (branchRes.data.success) setBranchStats(branchRes.data.data || []);
      if (yearRes.data.success) setYearStats(yearRes.data.data || []);
      if (companyRes.data.success) setCompanyStats(companyRes.data.data || []);
      if (topRes.data.success) setTopCompanies(topRes.data.data || []);
    } catch (err) {
      console.error('Failed to load placement stats:', err);
      toast.error('Unable to fetch latest analytics');
    } finally {
      setLoading(false);
    }
  };

  // Pending TPOs states
  const [pendingTpos, setPendingTpos] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);

  const fetchPendingTpos = async () => {
    setLoadingPending(true);
    try {
      const res = await api.get('/tpo/pending');
      if (res.data.success) {
        setPendingTpos(res.data.data || res.data.pendingTpos || []);
      }
    } catch (err) {
      console.error('Failed to fetch pending TPOs:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  const handleApproveTpo = async (id, name) => {
    setApprovingId(id);
    try {
      const res = await api.put(`/tpo/${id}/approve`);
      if (res.data.success) {
        toast.success(`${name || 'TPO'} has been approved successfully!`);
        setPendingTpos((prev) => prev.filter((t) => t._id !== id));
      } else {
        toast.error(res.data.message || 'Failed to approve TPO');
      }
    } catch (err) {
      console.error('Error approving TPO:', err);
      toast.error(err.response?.data?.message || 'Failed to approve TPO');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectTpo = async (id, name) => {
    if (!window.confirm(`Are you sure you want to reject the registration request for ${name}? This will permanently remove their request.`)) {
      return;
    }
    setRejectingId(id);
    try {
      const res = await api.put(`/tpo/${id}/reject`);
      if (res.data.success) {
        toast.success(`Registration request for ${name || 'TPO'} rejected.`);
        setPendingTpos((prev) => prev.filter((t) => t._id !== id));
      } else {
        toast.error(res.data.message || 'Failed to reject TPO request');
      }
    } catch (err) {
      console.error('Error rejecting TPO:', err);
      toast.error(err.response?.data?.message || 'Failed to reject TPO request');
    } finally {
      setRejectingId(null);
    }
  };

  // Pending Students states
  const [pendingStudents, setPendingStudents] = useState([]);
  const [loadingPendingStudents, setLoadingPendingStudents] = useState(false);
  const [approvingStudentId, setApprovingStudentId] = useState(null);
  const [rejectingStudentId, setRejectingStudentId] = useState(null);

  const fetchPendingStudents = async () => {
    setLoadingPendingStudents(true);
    try {
      const res = await api.get('/tpo/pending-students');
      if (res.data.success) {
        setPendingStudents(res.data.data || res.data.pendingStudents || []);
      }
    } catch (err) {
      console.error('Failed to fetch pending students:', err);
    } finally {
      setLoadingPendingStudents(false);
    }
  };

  const handleApproveStudent = async (studentId, studentName) => {
    setApprovingStudentId(studentId);
    try {
      const res = await api.put(`/tpo/students/${studentId}/approve`);
      if (res.data.success) {
        toast.success(res.data.message || `Approved ${studentName}`);
        setPendingStudents((prev) => prev.filter((s) => s._id !== studentId && s.user?._id !== studentId));
        fetchAllStats();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve student');
    } finally {
      setApprovingStudentId(null);
    }
  };

  const handleRejectStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to reject the student account request for ${studentName}? This will permanently remove their profile.`)) {
      return;
    }
    setRejectingStudentId(studentId);
    try {
      const res = await api.put(`/tpo/students/${studentId}/reject`);
      if (res.data.success) {
        toast.success(res.data.message || `Rejected student request for ${studentName}`);
        setPendingStudents((prev) => prev.filter((s) => s._id !== studentId && s.user?._id !== studentId));
        fetchAllStats();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject student');
    } finally {
      setRejectingStudentId(null);
    }
  };

  // College Settings state (requireStudentApproval)
  const [requireStudentApproval, setRequireStudentApproval] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchCollegeSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await api.get('/colleges/my/settings');
      if (res.data.success && res.data.settings) {
        setRequireStudentApproval(Boolean(res.data.settings.requireStudentApproval));
      }
    } catch (err) {
      console.error('Failed to load college settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleToggleStudentApproval = async () => {
    const nextVal = !requireStudentApproval;
    setSavingSettings(true);
    try {
      const res = await api.put('/colleges/my/settings', {
        requireStudentApproval: nextVal,
      });
      if (res.data.success) {
        setRequireStudentApproval(nextVal);
        toast.success(
          nextVal
            ? 'TPO approval is now REQUIRED for new student accounts'
            : 'New students can now log in immediately without TPO approval'
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update college settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRefreshAll = () => {
    fetchAllStats();
    fetchPendingTpos();
    fetchPendingStudents();
    fetchCollegeSettings();
  };

  useEffect(() => {
    fetchAllStats();
    fetchPendingTpos();
    fetchPendingStudents();
    fetchCollegeSettings();
  }, [branchFilter, yearFilter]);

  // Derived data for placed vs unplaced pie chart
  const unplacedCount = Math.max(0, overview.totalStudents - overview.totalPlaced);
  const pieData = [
    { name: 'Placed', value: overview.totalPlaced },
    { name: 'Unplaced', value: unplacedCount },
  ];

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header & Global Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Placement Performance Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Real-time analytics, institutional metrics, and company recruitment statistics.
          </p>
        </div>

        {/* Global Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 shadow-xs">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-slate-700 font-semibold cursor-pointer"
            >
              {BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b === 'ALL' ? 'All Disciplines' : b}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Year Input */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="number"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              placeholder="Batch Year..."
              className="w-24 text-xs bg-transparent focus:outline-none text-slate-700"
            />
          </div>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title="Download PDF Executive Summary"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
          </button>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            title="Download Placements Excel"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exportingExcel ? 'Exporting...' : 'Export Excel'}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefreshAll}
            title="Refresh Metrics & Pending Requests"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${loading || loadingPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Row 1: Top Metric Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Students */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Students
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-slate-900">
                {overview.totalStudents}
              </span>
            )}
          </div>
        </div>

        {/* Total Applied */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Applied
            </span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-slate-900">
                {overview.totalApplied}
              </span>
            )}
          </div>
        </div>

        {/* Total Placed */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Placed
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-slate-900">
                {overview.totalPlaced}
              </span>
            )}
          </div>
        </div>

        {/* Placement Percentage */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Rate
            </span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-purple-700">
                {overview.placementPercentage}%
              </span>
            )}
          </div>
        </div>

        {/* Highest Package */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Highest CTC
            </span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-slate-900">
                {overview.highestPackage} <span className="text-xs font-semibold text-slate-400">LPA</span>
              </span>
            )}
          </div>
        </div>

        {/* Average Package */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Average CTC
            </span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 rounded-md animate-pulse" />
            ) : (
              <span className="text-xl font-extrabold text-emerald-600">
                {overview.averagePackage} <span className="text-xs font-semibold text-slate-400">LPA</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* College Settings Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0 border border-indigo-100">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  College Settings
                </h3>
                {savingSettings && (
                  <span className="text-[11px] font-medium text-indigo-600 inline-flex items-center gap-1">
                    <RotateCw className="w-3 h-3 animate-spin" /> Saving...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage institutional verification rules and security controls for your college.
              </p>
            </div>
          </div>
        </div>

        {/* Setting Switch Row */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/60">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-900">
              Require TPO approval for new students
            </span>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
              When enabled, newly registered students from your college must be approved by a TPO administrator before they can log in.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={requireStudentApproval}
            disabled={savingSettings || loadingSettings}
            onClick={handleToggleStudentApproval}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 ${
              requireStudentApproval ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                requireStudentApproval ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Pending TPO Colleague Approvals */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${pendingTpos.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Pending TPO Approvals
                </h3>
                {pendingTpos.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                    {pendingTpos.length} Action{pendingTpos.length > 1 ? 's' : ''} Needed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Review and approve TPO colleague registrations for your institution
              </p>
            </div>
          </div>
          <button
            onClick={fetchPendingTpos}
            disabled={loadingPending}
            className="self-start sm:self-auto text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loadingPending ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </div>

        <div className="pt-4">
          {loadingPending ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              <RotateCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
              Checking pending colleague requests...
            </div>
          ) : pendingTpos.length === 0 ? (
            <div className="py-4 px-4 text-center text-xs text-slate-500 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <span className="font-semibold text-slate-700">No pending TPO approval requests.</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All TPO accounts for your college are verified. When colleagues join, their requests will appear here for approval.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingTpos.map((tpo) => (
                <div
                  key={tpo._id}
                  className="p-4 bg-amber-50/40 border border-amber-200 rounded-xl flex flex-col justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{tpo.name}</h4>
                        <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md mt-0.5">
                          Pending Approval
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{tpo.email}</span>
                      </div>
                      {tpo.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{tpo.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Registered {new Date(tpo.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApproveTpo(tpo._id, tpo.name)}
                      disabled={approvingId === tpo._id || rejectingId === tpo._id}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{approvingId === tpo._id ? 'Approving...' : 'Approve'}</span>
                    </button>
                    <button
                      onClick={() => handleRejectTpo(tpo._id, tpo.name)}
                      disabled={approvingId === tpo._id || rejectingId === tpo._id}
                      className="py-2 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>{rejectingId === tpo._id ? 'Rejecting...' : 'Reject'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Student Approvals (when requireStudentApproval is true) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${pendingStudents.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Pending Student Approvals
                </h3>
                {pendingStudents.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                    {pendingStudents.length} Action{pendingStudents.length > 1 ? 's' : ''} Needed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Institutional verification for newly registered candidates
              </p>
            </div>
          </div>
          <button
            onClick={fetchPendingStudents}
            disabled={loadingPendingStudents}
            className="self-start sm:self-auto text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loadingPendingStudents ? 'animate-spin' : ''}`} />
            Refresh Students
          </button>
        </div>

        <div className="pt-4">
          {loadingPendingStudents ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              <RotateCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
              Checking pending student requests...
            </div>
          ) : pendingStudents.length === 0 ? (
            <div className="py-4 px-4 text-center text-xs text-slate-500 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <span className="font-semibold text-slate-700">No pending student approval requests.</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All registered students for your college are verified and active.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingStudents.map((st) => (
                <div
                  key={st._id}
                  className="p-4 bg-indigo-50/30 border border-indigo-200/80 rounded-xl flex flex-col justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{st.user?.name || 'Student'}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                            {st.enrollmentNo}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {st.branch} ({st.batchYear})
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-700">
                        {st.cgpa} CGPA
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{st.user?.email}</span>
                      </div>
                      {st.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{st.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Registered {new Date(st.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApproveStudent(st._id, st.user?.name || st.enrollmentNo)}
                      disabled={approvingStudentId === st._id || rejectingStudentId === st._id}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{approvingStudentId === st._id ? 'Approving...' : 'Approve'}</span>
                    </button>
                    <button
                      onClick={() => handleRejectStudent(st._id, st.user?.name || st.enrollmentNo)}
                      disabled={approvingStudentId === st._id || rejectingStudentId === st._id}
                      className="py-2 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>{rejectingStudentId === st._id ? 'Rejecting...' : 'Reject'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Placed vs Unplaced Pie Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Placement Conversion Ratio
            </h3>
            <p className="text-[11px] text-slate-500">
              Placed vs eligible unplaced candidates
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center pt-4 min-h-[250px]">
            {loading ? (
              <div className="w-36 h-36 rounded-full bg-slate-100 animate-pulse" />
            ) : overview.totalStudents === 0 ? (
              <div className="text-center text-slate-400 text-xs">No candidate records available</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`${val} students`, name]}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Placement Percentage by Branch Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Branch-Wise Placement Percentage
            </h3>
            <p className="text-[11px] text-slate-500">
              Success percentage across academic departments
            </p>
          </div>

          <div className="flex-1 pt-4 min-h-[250px]">
            {loading ? (
              <div className="h-56 bg-slate-100 rounded-xl animate-pulse" />
            ) : branchStats.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-slate-400 text-xs">
                No branch records match filters
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={branchStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="branch" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `${val}% (${props.payload.placed}/${props.payload.totalStudents} placed)`,
                      'Placement Rate',
                    ]}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="placementPercentage" fill="#6366f1" radius={[6, 6, 0, 0]} name="Placement %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Top Recruiting Companies & Year-Wise Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Recruiting Companies */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Top Recruiting Companies
            </h3>
            <p className="text-[11px] text-slate-500">
              Organizations ranked by total candidates recruited
            </p>
          </div>

          <div className="flex-1 pt-4 min-h-[240px]">
            {loading ? (
              <div className="h-52 bg-slate-100 rounded-xl animate-pulse" />
            ) : topCompanies.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">
                No recruiter placement offers recorded yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={topCompanies}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="companyName" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(val, name, item) => [
                      `${val} Hires (Avg: ${item.payload.averagePackage} LPA)`,
                      'Selected Students',
                    ]}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="hiresCount" fill="#0d9488" radius={[0, 6, 6, 0]} name="Total Hires" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Year-Wise Placement Trend */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Year-Wise Placement Trend
            </h3>
            <p className="text-[11px] text-slate-500">
              Placement percentage and average CTC package by graduating batch
            </p>
          </div>

          <div className="flex-1 pt-4 min-h-[240px]">
            {loading ? (
              <div className="h-52 bg-slate-100 rounded-xl animate-pulse" />
            ) : yearStats.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">
                No annual historical records found
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={yearStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="batchYear" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(val, name) => [`${val}%`, name]}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="placementPercentage"
                    stroke="#6366f1"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    name="Placement %"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Company Recruitment Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            Company Recruitment Analytics
          </h3>
          <p className="text-[11px] text-slate-500">
            Drive participation, candidate conversion, and salary package breakdown by partner company
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-5">Recruiter Company</th>
                <th className="py-3 px-4">Drives</th>
                <th className="py-3 px-4">Applicants</th>
                <th className="py-3 px-4">Selected</th>
                <th className="py-3 px-4">Selection Rate</th>
                <th className="py-3 px-5 text-right">Package CTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading analytics...</span>
                    </div>
                  </td>
                </tr>
              ) : companyStats.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No company drive activity recorded.
                  </td>
                </tr>
              ) : (
                companyStats.map((comp) => (
                  <tr key={comp._id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Company */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                          {comp.companyName?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{comp.companyName}</span>
                          <span className="text-[10px] text-slate-400">{comp.industry}</span>
                        </div>
                      </div>
                    </td>

                    {/* Drives count */}
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {comp.drivesCount}
                    </td>

                    {/* Total applicants */}
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {comp.totalApplicants}
                    </td>

                    {/* Selected */}
                    <td className="py-3.5 px-4 font-bold text-emerald-600">
                      {comp.selectedCount}
                    </td>

                    {/* Selection rate */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-1.5 rounded-full"
                            style={{ width: `${Math.min(comp.selectionRate || 0, 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-slate-700 text-[11px]">
                          {comp.selectionRate}%
                        </span>
                      </div>
                    </td>

                    {/* Package */}
                    <td className="py-3.5 px-5 text-right font-extrabold text-slate-900">
                      {comp.highestPackage > 0 ? (
                        <span>
                          {comp.highestPackage}{' '}
                          <span className="text-[10px] font-normal text-slate-400">LPA</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
