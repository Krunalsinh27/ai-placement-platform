import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
  Filter,
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
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const BRANCH_OPTIONS = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const AnalystTrends = () => {
  const [byBranch, setByBranch] = useState([]);
  const [byYear, setByYear] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState({ states: [], batchYears: [] });
  const [filters, setFilters] = useState({
    state: '',
    batchYear: '',
    branch: 'ALL',
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/analytics/filters');
        if (res.data.success) {
          setFilterOptions({
            states: res.data.states || [],
            batchYears: res.data.batchYears || [],
          });
        }
      } catch (_) {}
    };
    fetchOptions();
  }, []);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;

      const [branchRes, yearRes] = await Promise.all([
        api.get('/analytics/by-branch', { params }),
        api.get('/analytics/by-year', { params }),
      ]);

      if (branchRes.data.success) setByBranch(branchRes.data.byBranch || []);
      if (yearRes.data.success) setByYear(yearRes.data.byYear || []);
    } catch (err) {
      toast.error('Failed to load trends data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [filters]);

  const renderMetric = (val, suffix = '') => {
    if (val === 'lt5') {
      return <PrivacyBadge />;
    }
    if (val === null || val === undefined) return '-';
    return `${val}${suffix}`;
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Academic & Annual Placement Trends
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated branch breakdown and historical cohort placement metrics across institutions.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">State</label>
            <select
              value={filters.state}
              onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value }))}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All States</option>
              {filterOptions.states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Batch Year
            </label>
            <select
              value={filters.batchYear}
              onChange={(e) => setFilters((prev) => ({ ...prev, batchYear: e.target.value }))}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All Years</option>
              {filterOptions.batchYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Branch</label>
            <select
              value={filters.branch}
              onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              {BRANCH_OPTIONS.map((br) => (
                <option key={br} value={br}>
                  {br === 'ALL' ? 'All Disciplines' : br}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 1: Branch Distribution */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Branch-Wise Benchmark Analysis</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Branch Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-1">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Cohort Volume & Placements
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byBranch.map((b) => ({
                    branch: b.branch,
                    Students: typeof b.students === 'number' ? b.students : 0,
                    Placed: typeof b.placed === 'number' ? b.placed : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="branch" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="Students" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Placed" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Branch Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-4">Branch</th>
                    <th className="py-2.5 px-4">Total Students</th>
                    <th className="py-2.5 px-4">Applied</th>
                    <th className="py-2.5 px-4">Placed</th>
                    <th className="py-2.5 px-4">Placement %</th>
                    <th className="py-2.5 px-4 text-right">Avg Package</th>
                    <th className="py-2.5 px-4 text-right">Max Package</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {byBranch.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No branch records found
                      </td>
                    </tr>
                  ) : (
                    byBranch.map((b) => (
                      <tr key={b.branch} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-800">{b.branch}</td>
                        <td className="py-2.5 px-4 text-slate-600">{renderMetric(b.students)}</td>
                        <td className="py-2.5 px-4 text-slate-600">{renderMetric(b.applied)}</td>
                        <td className="py-2.5 px-4 font-semibold text-emerald-600">
                          {renderMetric(b.placed)}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">
                          {renderMetric(b.placementPercentage, '%')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {b.averagePackage ? `${b.averagePackage} LPA` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                          {b.highestPackage ? `${b.highestPackage} LPA` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Year-over-Year Progression */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Graduating Batch Year Trends</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Year Trend Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-1">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Placement Rate (%) by Year
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={byYear.map((y) => ({
                    year: y.batchYear,
                    Rate:
                      typeof y.placementPercentage === 'number' ? y.placementPercentage : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
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
                    dataKey="Rate"
                    name="Placement %"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Year Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-4">Batch Year</th>
                    <th className="py-2.5 px-4">Cohort Size</th>
                    <th className="py-2.5 px-4">Applied</th>
                    <th className="py-2.5 px-4">Placed</th>
                    <th className="py-2.5 px-4">Placement Rate</th>
                    <th className="py-2.5 px-4 text-right">Avg Package</th>
                    <th className="py-2.5 px-4 text-right">Highest Package</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {byYear.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No annual batch records found
                      </td>
                    </tr>
                  ) : (
                    byYear.map((y) => (
                      <tr key={y.batchYear} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-800">{y.batchYear}</td>
                        <td className="py-2.5 px-4 text-slate-600">{renderMetric(y.students)}</td>
                        <td className="py-2.5 px-4 text-slate-600">{renderMetric(y.applied)}</td>
                        <td className="py-2.5 px-4 font-semibold text-emerald-600">
                          {renderMetric(y.placed)}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">
                          {renderMetric(y.placementPercentage, '%')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {y.averagePackage ? `${y.averagePackage} LPA` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                          {y.highestPackage ? `${y.highestPackage} LPA` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <PrivacyFootnote />
    </div>
  );
};

export default AnalystTrends;

