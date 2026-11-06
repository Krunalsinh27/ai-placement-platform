import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Building2,
  Search,
  Filter,
  RotateCw,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const BRANCH_OPTIONS = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const AnalystColleges = () => {
  const [colleges, setColleges] = useState([]);
  const [totalColleges, setTotalColleges] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('students');
  const [order, setOrder] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState({ states: [], batchYears: [] });

  // Filters
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

  const fetchColleges = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        sortBy,
        order,
      };
      if (search.trim()) params.search = search.trim();
      if (filters.state.trim()) params.state = filters.state.trim();
      if (filters.batchYear.trim()) params.batchYear = filters.batchYear.trim();
      if (filters.branch && filters.branch !== 'ALL') params.branch = filters.branch;

      const res = await api.get('/analytics/colleges', { params });
      if (res.data.success) {
        setColleges(res.data.colleges || []);
        setTotalColleges(res.data.totalColleges || 0);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      toast.error('Failed to load colleges data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, [page, limit, sortBy, order, filters]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchColleges();
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setOrder('desc');
    }
    setPage(1);
  };

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
            Approved Institutions Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-college institutional placement metrics and salary distributions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            Total Approved: <strong className="text-indigo-600">{totalColleges}</strong>
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by college name, code, city, or state..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">State</label>
            <select
              value={filters.state}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, state: e.target.value }));
                setPage(1);
              }}
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
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, batchYear: e.target.value }));
                setPage(1);
              }}
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
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, branch: e.target.value }));
                setPage(1);
              }}
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

      {/* Colleges Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase">
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100"
                >
                  <div className="flex items-center gap-1">
                    <span>College Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Location</th>
                <th
                  onClick={() => handleSort('students')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100"
                >
                  <div className="flex items-center gap-1">
                    <span>Students</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Applied</th>
                <th
                  onClick={() => handleSort('placed')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100"
                >
                  <div className="flex items-center gap-1">
                    <span>Placed</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('placementPercentage')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 w-40"
                >
                  <div className="flex items-center gap-1">
                    <span>Placement %</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('averagePackage')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Avg Package</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('highestPackage')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Max Package</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading institutions...</span>
                  </td>
                </tr>
              ) : colleges.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No approved institutions found matching your search.
                  </td>
                </tr>
              ) : (
                colleges.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {c.name}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] font-semibold">
                      {c.code}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {c.city}, {c.state}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {renderMetric(c.students)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {renderMetric(c.applied)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">
                      {renderMetric(c.placed)}
                    </td>
                    <td className="py-3 px-4">
                      {c.placementPercentage === 'lt5' ? (
                        renderMetric('lt5')
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, c.placementPercentage || 0)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 w-10 text-right">
                            {c.placementPercentage}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {c.averagePackage ? `${c.averagePackage} LPA` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {c.highestPackage ? `${c.highestPackage} LPA` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
          <div>
            Showing {(page - 1) * limit + 1} to{' '}
            {Math.min(page * limit, totalColleges)} of {totalColleges} institutions
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <PrivacyFootnote />
    </div>
  );
};

export default AnalystColleges;

