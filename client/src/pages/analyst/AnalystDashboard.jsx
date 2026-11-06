import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Building2,
  Users,
  CheckCircle2,
  TrendingUp,
  Award,
  Filter,
  RotateCw,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  ChevronRight,
  Search,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const BRANCH_OPTIONS = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const AnalystDashboard = () => {
  // Global Filter State
  const [filters, setFilters] = useState({
    state: '',
    batchYear: '',
    branch: 'ALL',
    collegeId: '',
  });

  const [collegesList, setCollegesList] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ states: [], batchYears: [], branches: [] });
  const [overview, setOverview] = useState(null);
  const [colleges, setColleges] = useState([]);
  const [byBranch, setByBranch] = useState([]);
  const [byYear, setByYear] = useState([]);
  const [topRecruiters, setTopRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Fetch directory colleges and dynamic filter options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [collegesRes, filterRes] = await Promise.all([
          api.get('/colleges'),
          api.get('/analytics/filters').catch(() => ({ data: { success: false } })),
        ]);
        if (collegesRes.data.success) {
          setCollegesList(collegesRes.data.colleges || []);
        }
        if (filterRes.data.success) {
          setFilterOptions({
            states: filterRes.data.states || [],
            batchYears: filterRes.data.batchYears || [],
            branches: filterRes.data.branches || [],
          });
        }
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    fetchOptions();
  }, []);

  // Fetch all analytics data with filters
  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;
      if (filters.collegeId) params.collegeIds = filters.collegeId;

      const [overviewRes, collegesRes, branchRes, yearRes, recruitersRes] =
        await Promise.all([
          api.get('/analytics/overview', { params }),
          api.get('/analytics/colleges', { params: { ...params, limit: 10 } }),
          api.get('/analytics/by-branch', { params }),
          api.get('/analytics/by-year', { params }),
          api.get('/analytics/top-recruiters', { params: { ...params, limit: 5 } }),
        ]);

      if (overviewRes.data.success) setOverview(overviewRes.data);
      if (collegesRes.data.success) setColleges(collegesRes.data.colleges || []);
      if (branchRes.data.success) setByBranch(branchRes.data.byBranch || []);
      if (yearRes.data.success) setByYear(yearRes.data.byYear || []);
      if (recruitersRes.data.success) setTopRecruiters(recruitersRes.data.recruiters || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      toast.error(err.response?.data?.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [filters]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetFilters = () => {
    setFilters({ state: '', batchYear: '', branch: 'ALL', collegeId: '' });
  };

  // Trigger Excel Export
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;
      if (filters.collegeId) params.collegeIds = filters.collegeId;

      const res = await api.get('/analytics/export/excel', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'cross_college_analytics.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel analytics report downloaded');
    } catch (err) {
      toast.error('Failed to export Excel report');
    } finally {
      setExporting(false);
    }
  };

  // Trigger PDF Export
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;
      if (filters.collegeId) params.collegeIds = filters.collegeId;

      const res = await api.get('/analytics/export/pdf', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'cross_college_analytics.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('PDF analytics report downloaded');
    } catch (err) {
      toast.error('Failed to export PDF report');
    } finally {
      setExporting(false);
    }
  };

  // Helper formatting for suppressed counts
  const renderMetricValue = (val, suffix = '') => {
    if (val === 'lt5') {
      return <PrivacyBadge />;
    }
    if (val === null || val === undefined) return '-';
    return `${val}${suffix}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Cross-College Placement Overview
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Read-Only</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            System-wide anonymized recruitment intelligence across approved institutions.
          </p>
        </div>

        {/* Export Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel Export</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>PDF Export</span>
          </button>
        </div>
      </div>

      {/* Universal Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Global Scope Filters</span>
          </div>
          {(filters.state || filters.batchYear || filters.branch !== 'ALL' || filters.collegeId) && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* State Filter Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              State / Region
            </label>
            <select
              value={filters.state}
              onChange={(e) => handleFilterChange('state', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All States / Regions</option>
              {filterOptions.states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Year Filter Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Graduating Batch Year
            </label>
            <select
              value={filters.batchYear}
              onChange={(e) => handleFilterChange('batchYear', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All Batch Years</option>
              {filterOptions.batchYears.map((yr) => (
                <option key={yr} value={yr}>
                  Class of {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Academic Branch
            </label>
            <select
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              {BRANCH_OPTIONS.map((br) => (
                <option key={br} value={br}>
                  {br === 'ALL' ? 'All Disciplines' : br}
                </option>
              ))}
            </select>
          </div>

          {/* College Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Filter By Specific College
            </label>
            <select
              value={filters.collegeId}
              onChange={(e) => handleFilterChange('collegeId', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All Approved Colleges</option>
              {collegesList.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Colleges */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Approved Institutions</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? '...' : overview?.collegesCount ?? 0}
            </h3>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Excludes pending colleges
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* Total Students */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Enrolled Cohort</p>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? '...' : renderMetricValue(overview?.totalStudents)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Applied: {renderMetricValue(overview?.applied)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Placed Students & Placement % */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Placed (Unique)</p>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {loading ? '...' : renderMetricValue(overview?.placed)}
            </div>
            <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">
              Placement Rate: {renderMetricValue(overview?.placementPercentage, '%')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Compensation Metrics */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Package Benchmarks (LPA)</p>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {loading
                ? '...'
                : overview?.averagePackage
                ? `${overview.averagePackage} LPA`
                : overview?.averagePackage === null
                ? renderMetricValue('lt5')
                : '0 LPA'}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
              <span>Max: {overview?.highestPackage ? `${overview.highestPackage}L` : '-'}</span>
              <span>•</span>
              <span>Median: {overview?.medianPackage ? `${overview.medianPackage}L` : '-'}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Recharts Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branch Placement Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Placement by Academic Branch</h3>
              <p className="text-xs text-slate-500">Total students vs. placed students</p>
            </div>
            <span className="text-[10px] font-medium text-slate-400">&lt;5 buckets suppressed</span>
          </div>

          <div className="h-64">
            {byBranch.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No branch data available for current filter
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byBranch.map((b) => ({
                    branch: b.branch,
                    students: typeof b.students === 'number' ? b.students : 0,
                    placed: typeof b.placed === 'number' ? b.placed : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="branch" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="students" name="Total Cohort" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="placed" name="Placed" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Year-over-Year Trend Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Year-over-Year Trend</h3>
              <p className="text-xs text-slate-500">Graduating cohort placement progression</p>
            </div>
            <span className="text-[10px] font-medium text-slate-400">Batch Year</span>
          </div>

          <div className="h-64">
            {byYear.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No annual trend data available for current filter
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={byYear.map((y) => ({
                    year: y.batchYear,
                    placementRate:
                      typeof y.placementPercentage === 'number' ? y.placementPercentage : 0,
                    avgPackage: typeof y.averagePackage === 'number' ? y.averagePackage : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="placementRate"
                    name="Placement %"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top Recruiters Snapshot & Colleges Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Recruiters */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Top Recruiters</h3>
            <Link
              to="/analyst/recruiters"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {topRecruiters.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No hiring data yet</p>
            ) : (
              topRecruiters.slice(0, 5).map((r, i) => (
                <div key={r.companyId || i} className="py-2.5 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{r.companyName}</p>
                    <p className="text-[10px] text-slate-500">
                      Hired across {renderMetricValue(r.collegesHiredFrom)} colleges
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-indigo-600 block">
                      {renderMetricValue(r.hires)} hires
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Avg: {r.averagePackage ? `${r.averagePackage} LPA` : '-'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Institutions Summary Table */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Institutions Summary</h3>
              <p className="text-xs text-slate-500">Approved colleges ranking by placement %</p>
            </div>
            <Link
              to="/analyst/colleges"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
            >
              <span>Explore All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="pb-2">Institution</th>
                  <th className="pb-2">Students</th>
                  <th className="pb-2">Placed</th>
                  <th className="pb-2 w-32">Placement %</th>
                  <th className="pb-2 text-right">Avg Package</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {colleges.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      No colleges match selected filters
                    </td>
                  </tr>
                ) : (
                  colleges.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 pr-2">
                        <span className="font-bold text-slate-800 block truncate max-w-[180px]">
                          {c.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {c.code} • {c.city}, {c.state}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-600">{renderMetricValue(c.students)}</td>
                      <td className="py-2.5 text-slate-600">{renderMetricValue(c.placed)}</td>
                      <td className="py-2.5">
                        {c.placementPercentage === 'lt5' ? (
                          renderMetricValue('lt5')
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full rounded-full"
                                style={{ width: `${Math.min(100, c.placementPercentage || 0)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-semibold text-slate-700 w-8 text-right">
                              {c.placementPercentage}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-700">
                        {c.averagePackage ? `${c.averagePackage} LPA` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PrivacyFootnote className="mt-3" />
        </div>
      </div>
    </div>
  );
};

export default AnalystDashboard;

