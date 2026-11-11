import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { formatISTDate } from '../../utils/dateTime';
import {
  Users,
  FileCheck2,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Award,
  Filter,
  RotateCcw,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  UserCheck,
  UserX,
  Briefcase,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
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

const DEPARTMENT_OPTIONS = [
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

const BATCH_YEAR_OPTIONS = ['ALL', '2026', '2025', '2024', '2023'];

const PlacementReport = () => {
  // Filters
  const [department, setDepartment] = useState('ALL');
  const [batchYear, setBatchYear] = useState('ALL');

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (department !== 'ALL') params.department = department;
      if (batchYear !== 'ALL') params.batch = batchYear;

      const res = await api.get('/reports/placement', { params });
      if (res.data?.success) {
        setReport(res.data.data || res.data);
      } else {
        throw new Error(res.data?.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Failed to load placement report:', err);
      setError(err.response?.data?.message || err.message || 'Error loading placement report');
      toast.error('Failed to load placement report');
    } finally {
      setLoading(false);
    }
  }, [department, batchYear]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async (format) => {
    const isCsv = format === 'csv';
    if (isCsv) setExportingCsv(true);
    else setExportingXlsx(true);

    try {
      const params = { format };
      if (department !== 'ALL') params.department = department;
      if (batchYear !== 'ALL') params.batch = batchYear;

      const res = await api.get('/reports/placement/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: isCsv
          ? 'text/csv;charset=utf-8;'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `placement_report_${batchYear !== 'ALL' ? batchYear : 'all'}_${Date.now()}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${isCsv ? 'CSV' : 'Excel'} report downloaded successfully!`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(`Failed to export ${isCsv ? 'CSV' : 'Excel'} report`);
    } finally {
      if (isCsv) setExportingCsv(false);
      else setExportingXlsx(false);
    }
  };

  const resetFilters = () => {
    setDepartment('ALL');
    setBatchYear('ALL');
  };

  const summary = report?.summary || {};
  const departmentWise = report?.departmentWise || [];
  const companyWise = report?.companyWise || [];
  const driveWise = report?.driveWise || [];
  const monthlyTrend = report?.monthlyTrend || [];
  const packageDistribution = report?.packageDistribution || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Placement Report
            </h1>
          </div>
          <p className="text-sm text-slate-500">
            Official institutional recruitment analytics, cohort metrics, and placed student logs.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exportingXlsx || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
            title="Download full multi-sheet Excel report"
          >
            {exportingXlsx ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Download Excel</span>
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={exportingCsv || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
            title="Download CSV roster of placed students"
          >
            {exportingCsv ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-600 text-sm font-medium mr-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Filters:</span>
          </div>

          {/* Academic Batch Year */}
          <div className="flex items-center gap-2">
            <label htmlFor="report-batch-year" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Batch:
            </label>
            <select
              id="report-batch-year"
              value={batchYear}
              onChange={(e) => setBatchYear(e.target.value)}
              className="text-xs sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {BATCH_YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y === 'ALL' ? 'All Batches' : `Class of ${y}`}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div className="flex items-center gap-2">
            <label htmlFor="report-department" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Department:
            </label>
            <select
              id="report-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="text-xs sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Departments' : d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reset Filter Button */}
        {(department !== 'ALL' || batchYear !== 'ALL') && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-700">Generating placement report...</p>
          <p className="text-xs text-slate-400 mt-1">Aggregating records and running pipeline metrics</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          <div>
            <h3 className="text-sm font-bold">Failed to load placement report</h3>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
            <button
              onClick={fetchReport}
              className="mt-3 text-xs font-semibold px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && summary.totalStudents === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Student Records Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No students found matching the selected filters. Try broadening your filter criteria.
          </p>
        </div>
      )}

      {!loading && !error && summary.totalStudents > 0 && (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* Total Students */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Students
                </span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{summary.totalStudents ?? 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Enrolled cohort size</p>
            </div>

            {/* Verified Students */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Verified Students
                </span>
                <UserCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{summary.verifiedStudents ?? 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Email verified profiles</p>
            </div>

            {/* Registered for Placement */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Registered
                </span>
                <FileCheck2 className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{summary.registeredForPlacement ?? 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Active drive applicants</p>
            </div>

            {/* Placed Students */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Placed Students
                </span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">{summary.placedStudents ?? 0}</p>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {summary.placementPercentage ?? 0}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Unique accepted offers</p>
            </div>

            {/* Unplaced Count */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Unplaced
                </span>
                <UserX className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{summary.unplacedCount ?? 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Seeking placement</p>
            </div>

            {/* Total Offers */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Offers
                </span>
                <CheckCircle2 className="w-4 h-4 text-sky-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{summary.totalOffers ?? 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Offers extended</p>
            </div>

            {/* Average Package */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Average Package
                </span>
                <TrendingUp className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-indigo-600">
                {summary.averagePackage ? `${summary.averagePackage} LPA` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Accepted compensation</p>
            </div>

            {/* Median Package */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Median Package
                </span>
                <Layers className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {summary.medianPackage ? `${summary.medianPackage} LPA` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">50th percentile</p>
            </div>

            {/* Highest Package */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Highest Package
                </span>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600">
                {summary.highestPackage ? `${summary.highestPackage} LPA` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Peak compensation</p>
            </div>

            {/* Lowest Package */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Lowest Package
                </span>
                <Award className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl font-bold text-slate-700">
                {summary.lowestPackage ? `${summary.lowestPackage} LPA` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Baseline compensation</p>
            </div>
          </div>

          {/* Visual Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Department-wise Placement % */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Department-wise Placement %
                  </h3>
                  <p className="text-xs text-slate-500">
                    Placement rate across academic departments
                  </p>
                </div>
              </div>
              <div className="h-64">
                {departmentWise.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={departmentWise}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="department" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                      <Tooltip
                        formatter={(val) => [`${val}%`, 'Placement Rate']}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          color: '#fff',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="placementPercentage" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Placement %" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No department data available
                  </div>
                )}
              </div>
            </div>

            {/* Chart 2: Monthly Offer Trend */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Monthly Offer Trajectory
                  </h3>
                  <p className="text-xs text-slate-500">
                    Offers issued and accepted per calendar month (IST)
                  </p>
                </div>
              </div>
              <div className="h-64">
                {monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={monthlyTrend}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          color: '#fff',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line
                        type="monotone"
                        dataKey="offers"
                        name="Offers Issued"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accepted"
                        name="Offers Accepted"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No monthly trend data available
                  </div>
                )}
              </div>
            </div>

            {/* Chart 3: Package Distribution */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Package (LPA) Tier Distribution
                  </h3>
                  <p className="text-xs text-slate-500">
                    Number of placed students across salary brackets
                  </p>
                </div>
              </div>
              <div className="h-64">
                {packageDistribution.some((p) => p.count > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={packageDistribution}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        formatter={(val) => [`${val} students`, 'Placed']}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          color: '#fff',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Placed Students" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No compensation packages recorded
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Department-wise Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Department Performance Roster</h3>
              <p className="text-xs text-slate-500">
                Detailed student counts, placement ratios, and compensation statistics per discipline
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-center">Total Students</th>
                    <th className="py-3 px-4 text-center">Placed</th>
                    <th className="py-3 px-4 text-center">Placement Rate</th>
                    <th className="py-3 px-4 text-right">Avg Package</th>
                    <th className="py-3 px-4 text-right">Highest Package</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentWise.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                        No department records
                      </td>
                    </tr>
                  ) : (
                    departmentWise.map((d) => (
                      <tr key={d.department} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800">{d.department}</td>
                        <td className="py-3.5 px-4 text-center text-slate-600">{d.total}</td>
                        <td className="py-3.5 px-4 text-center text-slate-600 font-medium">
                          {d.placed}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              d.placementPercentage >= 70
                                ? 'bg-emerald-50 text-emerald-700'
                                : d.placementPercentage >= 40
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {d.placementPercentage}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                          {d.avgPackage ? `${d.avgPackage} LPA` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                          {d.highestPackage ? `${d.highestPackage} LPA` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Company-wise Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Hiring Partner Engagement
                </h3>
                <p className="text-xs text-slate-500">
                  Company drive participation, applicant volumes, and conversion metrics
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                {companyWise.length} Partner{companyWise.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4 text-center">Drives</th>
                    <th className="py-3 px-4 text-center">Applicants</th>
                    <th className="py-3 px-4 text-center">Offers Extended</th>
                    <th className="py-3 px-4 text-center">Offers Accepted</th>
                    <th className="py-3 px-4 text-right">Avg Package</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companyWise.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                        No company hiring records for this filter selection
                      </td>
                    </tr>
                  ) : (
                    companyWise.map((c) => (
                      <tr key={c.company} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{c.company}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-600">{c.drives}</td>
                        <td className="py-3.5 px-4 text-center text-slate-600 font-medium">
                          {c.applicants}
                        </td>
                        <td className="py-3.5 px-4 text-center text-sky-600 font-semibold">
                          {c.offers}
                        </td>
                        <td className="py-3.5 px-4 text-center text-emerald-600 font-bold">
                          {c.accepted}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                          {c.avgPackage ? `${c.avgPackage} LPA` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drive-wise Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Campus Drive Performance Summary
                </h3>
                <p className="text-xs text-slate-500">
                  End-to-end recruitment funnel per campus drive (applied, shortlisted, offers)
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                {driveWise.length} Drive{driveWise.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Role / Title</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4 text-center">Drive Date (IST)</th>
                    <th className="py-3 px-4 text-center">Applied</th>
                    <th className="py-3 px-4 text-center">Shortlisted</th>
                    <th className="py-3 px-4 text-center">Offered</th>
                    <th className="py-3 px-4 text-center">Accepted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {driveWise.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                        No drive records for this filter selection
                      </td>
                    </tr>
                  ) : (
                    driveWise.map((d, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>{d.driveTitle}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium">{d.company}</td>
                        <td className="py-3.5 px-4 text-center text-slate-500 text-xs">
                          {formatISTDate(d.date)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-600">{d.applied}</td>
                        <td className="py-3.5 px-4 text-center text-purple-600 font-semibold">
                          {d.shortlisted}
                        </td>
                        <td className="py-3.5 px-4 text-center text-sky-600 font-semibold">
                          {d.offered}
                        </td>
                        <td className="py-3.5 px-4 text-center text-emerald-600 font-bold">
                          {d.accepted}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlacementReport;

