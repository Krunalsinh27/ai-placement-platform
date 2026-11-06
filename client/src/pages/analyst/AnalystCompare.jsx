import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  GitCompare,
  Plus,
  X,
  Building2,
  Users,
  Award,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
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
} from 'recharts';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const AnalystCompare = () => {
  const [collegesList, setCollegesList] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all colleges for the selection dropdown
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const res = await api.get('/colleges');
        if (res.data.success && res.data.colleges.length > 0) {
          setCollegesList(res.data.colleges);
          // Preselect first 2 colleges if available
          const initialIds = res.data.colleges.slice(0, 2).map((c) => c._id);
          setSelectedIds(initialIds);
        }
      } catch (err) {
        console.error('Failed to load colleges for comparison:', err);
      }
    };
    fetchColleges();
  }, []);

  // Fetch comparison data when selectedIds changes
  useEffect(() => {
    if (selectedIds.length === 0) {
      setComparison([]);
      return;
    }

    const fetchComparison = async () => {
      setLoading(true);
      try {
        const res = await api.get('/analytics/compare', {
          params: { colleges: selectedIds.join(',') },
        });
        if (res.data.success) {
          setComparison(res.data.colleges || []);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to compare colleges');
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [selectedIds]);

  const handleAddCollege = (collegeId) => {
    if (!collegeId) return;
    if (selectedIds.includes(collegeId)) {
      toast.error('College is already added to comparison');
      return;
    }
    if (selectedIds.length >= 3) {
      toast.error('You can compare a maximum of 3 colleges simultaneously');
      return;
    }
    setSelectedIds((prev) => [...prev, collegeId]);
  };

  const handleRemoveCollege = (collegeId) => {
    setSelectedIds((prev) => prev.filter((id) => id !== collegeId));
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
            Institutional Comparison
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare key placement benchmarks and compensation metrics across up to 3 colleges.
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-600">
          Comparing: <strong className="text-indigo-600">{selectedIds.length} / 3</strong>
        </div>
      </div>

      {/* College Selector Control */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Add Institution to Compare (Max 3)
            </label>
            <div className="flex gap-2">
              <select
                id="college-select"
                defaultValue=""
                onChange={(e) => {
                  handleAddCollege(e.target.value);
                  e.target.value = '';
                }}
                disabled={selectedIds.length >= 3}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white disabled:bg-slate-100"
              >
                <option value="" disabled>
                  {selectedIds.length >= 3
                    ? 'Maximum 3 colleges reached'
                    : 'Choose a college to add...'}
                </option>
                {collegesList
                  .filter((c) => !selectedIds.includes(c._id))
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.code}) - {c.city}, {c.state}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Active Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            {selectedIds.map((id) => {
              const col = collegesList.find((c) => c._id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{col?.code || 'College'}</span>
                  <button
                    onClick={() => handleRemoveCollege(id)}
                    className="hover:text-rose-600 p-0.5 rounded-full cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side-by-Side Cards */}
      {selectedIds.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
          <GitCompare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold">Select colleges to view comparison</p>
          <p className="text-xs">Choose up to 3 institutions from the selector above</p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            comparison.length === 2
              ? 'md:grid-cols-2'
              : comparison.length === 3
              ? 'md:grid-cols-3'
              : 'md:grid-cols-1 max-w-md mx-auto'
          } gap-4`}
        >
          {comparison.map((c) => (
            <div
              key={c._id}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
                    {c.code}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 truncate">{c.name}</h3>
                  <p className="text-xs text-slate-500">
                    {c.city}, {c.state}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveCollege(c._id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Metric stats list */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Total Cohort</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {renderMetric(c.students)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Placed (Unique)</span>
                  <span className="font-bold text-emerald-600 text-sm">
                    {renderMetric(c.placed)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Placement Rate</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {renderMetric(c.placementPercentage, '%')}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Avg Package</span>
                  <span className="font-bold text-indigo-600 text-sm">
                    {c.averagePackage ? `${c.averagePackage} LPA` : renderMetric(c.averagePackage)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Max Package</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {c.highestPackage ? `${c.highestPackage} LPA` : renderMetric(c.highestPackage)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Median Package</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {c.medianPackage ? `${c.medianPackage} LPA` : renderMetric(c.medianPackage)}
                  </span>
                </div>
              </div>

              {/* Branch Snapshot */}
              {c.byBranch && c.byBranch.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Branch Distribution
                  </p>
                  <div className="space-y-1 text-xs">
                    {c.byBranch.map((br) => (
                      <div
                        key={br.branch}
                        className="flex items-center justify-between py-0.5 text-slate-600"
                      >
                        <span className="font-medium">{br.branch}</span>
                        <span className="font-semibold text-slate-800">
                          {renderMetric(br.placed)} / {renderMetric(br.students)} (
                          {renderMetric(br.placementPercentage, '%')})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grouped Comparison Chart */}
      {comparison.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Comparative Benchmark Visualization
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Side-by-side comparison of total students, placements, and average compensation (LPA).
          </p>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparison.map((c) => ({
                  name: c.code || c.name,
                  Students: typeof c.students === 'number' ? c.students : 0,
                  Placed: typeof c.placed === 'number' ? c.placed : 0,
                  'Avg Package': typeof c.averagePackage === 'number' ? c.averagePackage : 0,
                }))}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Students" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Placed" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Avg Package" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <PrivacyFootnote />
    </div>
  );
};

export default AnalystCompare;

