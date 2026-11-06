import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Briefcase,
  Building2,
  Users,
  Award,
  Filter,
  RotateCw,
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
} from 'recharts';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const BRANCH_OPTIONS = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const AnalystRecruiters = () => {
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState({ states: [], batchYears: [] });
  const [filters, setFilters] = useState({
    state: '',
    batchYear: '',
    branch: 'ALL',
  });
  const [search, setSearch] = useState('');

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

  const fetchRecruiters = async () => {
    setLoading(true);
    try {
      const params = { limit: 20 };
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;

      const res = await api.get('/analytics/top-recruiters', { params });
      if (res.data.success) {
        setRecruiters(res.data.recruiters || []);
      }
    } catch (err) {
      toast.error('Failed to load top recruiters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecruiters();
  }, [filters]);

  const filteredRecruiters = recruiters.filter((r) =>
    r.companyName.toLowerCase().includes(search.toLowerCase()) ||
    (r.industry && r.industry.toLowerCase().includes(search.toLowerCase()))
  );

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
            Top Recruiting Companies
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-college employer hiring volume, institutional spread, and salary offerings.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies by name or industry..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
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

      {/* Bar Chart Visualization */}
      {filteredRecruiters.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Hiring Volume by Recruiter</h3>
          <p className="text-xs text-slate-500 mb-4">Total accepted offers across colleges</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredRecruiters.slice(0, 8).map((r) => ({
                  name: r.companyName,
                  hires: typeof r.hires === 'number' ? r.hires : 0,
                  avgPackage: typeof r.averagePackage === 'number' ? r.averagePackage : 0,
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="hires" name="Total Hires" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recruiters Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-3 px-4">Employer Name</th>
                <th className="py-3 px-4">Industry Sector</th>
                <th className="py-3 px-4">Institutions Hired From</th>
                <th className="py-3 px-4">Unique Hires</th>
                <th className="py-3 px-4 text-right">Avg Package</th>
                <th className="py-3 px-4 text-right">Highest Package</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading recruiters...</span>
                  </td>
                </tr>
              ) : filteredRecruiters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No recruiters found matching the active criteria.
                  </td>
                </tr>
              ) : (
                filteredRecruiters.map((r, i) => (
                  <tr key={r.companyId || i} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{r.companyName}</td>
                    <td className="py-3 px-4 text-slate-600">{r.industry}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {renderMetric(r.collegesHiredFrom, ' colleges')}
                    </td>
                    <td className="py-3 px-4 font-bold text-indigo-600">
                      {renderMetric(r.hires)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {r.averagePackage ? `${r.averagePackage} LPA` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {r.highestPackage ? `${r.highestPackage} LPA` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PrivacyFootnote />
    </div>
  );
};

export default AnalystRecruiters;

