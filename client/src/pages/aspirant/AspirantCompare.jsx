import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import {
  GitCompare,
  Plus,
  X,
  Building2,
  Bookmark,
  Trash2,
  Save,
  FolderOpen,
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

const AspirantCompare = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [collegesList, setCollegesList] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [loading, setLoading] = useState(false);

  // Saved Comparisons State
  const [savedComparisons, setSavedComparisons] = useState([]);
  const [comparisonName, setComparisonName] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savingComparison, setSavingComparison] = useState(false);
  const [myBranches, setMyBranches] = useState([]);

  // 1. Fetch all approved colleges for selector & fetch saved comparisons
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [collegesRes, savedRes, meRes] = await Promise.all([
          api.get('/colleges'),
          api.get('/aspirant/comparisons'),
          api.get('/aspirant/me').catch(() => ({ data: { success: false } })),
        ]);

        if (collegesRes.data.success) {
          setCollegesList(collegesRes.data.colleges || []);
        }
        if (savedRes.data.success) {
          setSavedComparisons(savedRes.data.comparisons || []);
        }
        if (meRes.data?.success && meRes.data?.aspirant?.interestedBranches) {
          setMyBranches(meRes.data.aspirant.interestedBranches);
        }

        // If URL params exist, initialize selectedIds from URL
        const urlColleges = searchParams.get('colleges');
        if (urlColleges) {
          const ids = urlColleges.split(',').filter(Boolean).slice(0, 3);
          setSelectedIds(ids);
        } else if (collegesRes.data?.colleges?.length >= 2) {
          // Preselect first 2 colleges if none provided
          setSelectedIds(collegesRes.data.colleges.slice(0, 2).map((c) => c._id));
        }
      } catch (err) {
        console.error('Failed to load comparison prerequisites:', err);
      }
    };

    fetchInitialData();
  }, []);

  // 2. Fetch comparison data whenever selectedIds change
  useEffect(() => {
    if (selectedIds.length === 0) {
      setComparison([]);
      return;
    }

    const fetchComparison = async () => {
      setLoading(true);
      try {
        const res = await api.get('/colleges/public/compare', {
          params: { colleges: selectedIds.join(',') },
        });
        if (res.data.success) {
          setComparison(res.data.colleges || []);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to fetch comparison statistics', {
          id: 'compare-fetch-error',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [selectedIds]);

  const handleAddCollege = (collegeId) => {
    if (!collegeId) return;
    if (selectedIds.includes(collegeId)) {
      toast.error('College is already selected');
      return;
    }
    if (selectedIds.length >= 3) {
      toast.error('You can compare a maximum of 3 colleges simultaneously');
      return;
    }
    const updated = [...selectedIds, collegeId];
    setSelectedIds(updated);
    setSearchParams({ colleges: updated.join(',') });
  };

  const handleRemoveCollege = (collegeId) => {
    const updated = selectedIds.filter((id) => id !== collegeId);
    setSelectedIds(updated);
    if (updated.length > 0) {
      setSearchParams({ colleges: updated.join(',') });
    } else {
      setSearchParams({});
    }
  };

  // Save comparison
  const handleSaveComparison = async (e) => {
    e.preventDefault();
    if (!comparisonName.trim()) {
      toast.error('Please enter a comparison name');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('No colleges selected to save');
      return;
    }

    setSavingComparison(true);
    try {
      const res = await api.post('/aspirant/comparisons', {
        name: comparisonName.trim(),
        colleges: selectedIds,
        collegeIds: selectedIds,
      });
      if (res.data.success) {
        toast.success('Comparison saved successfully');
        setSavedComparisons(res.data.comparisons || res.data.savedComparisons || []);
        setComparisonName('');
        setSaveModalOpen(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save comparison');
    } finally {
      setSavingComparison(false);
    }
  };

  // Delete saved comparison
  const handleDeleteSavedComparison = async (compId) => {
    try {
      const res = await api.delete(`/aspirant/comparisons/${compId}`);
      if (res.data.success) {
        toast.success('Saved comparison removed');
        setSavedComparisons(res.data.comparisons || res.data.savedComparisons || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove comparison');
    }
  };

  // Load saved comparison
  const handleLoadSavedComparison = (saved) => {
    const ids = (saved.colleges || [])
      .map((c) => (typeof c === 'object' && c ? c._id : c))
      .filter(Boolean);
    setSelectedIds(ids.slice(0, 3));
    setSearchParams({ colleges: ids.slice(0, 3).join(',') });
    toast.success(`Loaded "${saved.name}"`);
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
            Compare Institutions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side benchmark comparison of placement percentages, compensation, and branch trends.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSaveModalOpen(true)}
            disabled={selectedIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Comparison</span>
          </button>
        </div>
      </div>

      {/* Selector & Saved Comparisons bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Add Institution to Compare (Max 3)
            </label>
            <select
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

          {/* Active Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.map((id) => {
              const col = collegesList.find((c) => c._id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
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

        {/* Saved Comparisons List */}
        {savedComparisons.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Saved Comparisons ({savedComparisons.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {savedComparisons.map((sc, idx) => (
                <div
                  key={sc._id || idx}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <button
                    onClick={() => handleLoadSavedComparison(sc)}
                    className="flex items-center gap-1.5 hover:text-indigo-600 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{sc.name}</span>
                    <span className="text-[10px] text-slate-400">
                      ({sc.colleges?.length || 0})
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteSavedComparison(sc._id || idx)}
                    className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                    title="Delete saved comparison"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Grid */}
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
                    {typeof c.averagePackage === 'number'
                      ? `${c.averagePackage} LPA`
                      : renderMetric(c.averagePackage)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Max Package</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {typeof c.highestPackage === 'number'
                      ? `${c.highestPackage} LPA`
                      : renderMetric(c.highestPackage)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-slate-500 block">Median Package</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {typeof c.medianPackage === 'number'
                      ? `${c.medianPackage} LPA`
                      : renderMetric(c.medianPackage)}
                  </span>
                </div>
              </div>

              {/* Branch Snapshot */}
              {c.byBranch && c.byBranch.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Branch Distribution
                    </p>
                    {myBranches.length > 0 && (
                      <span className="text-[10px] text-indigo-600 font-medium">
                        Target branches highlighted
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-xs">
                    {c.byBranch.map((br) => {
                      const isTarget = myBranches.some(
                        (b) => b.trim().toUpperCase() === br.branch.trim().toUpperCase()
                      );
                      return (
                        <div
                          key={br.branch}
                          className={`flex items-center justify-between py-1 px-2 rounded-lg transition-colors ${
                            isTarget
                              ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-950 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium">{br.branch}</span>
                            {isTarget && (
                              <span className="text-[9px] bg-indigo-200 text-indigo-800 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Target
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-slate-800 text-right">
                            {renderMetric(br.placed)} / {renderMetric(br.students)} (
                            {renderMetric(br.placementPercentage, '%')})
                            {typeof br.averagePackage === 'number' && (
                              <span className="text-[10px] text-indigo-600 ml-1 font-medium">
                                • {br.averagePackage} LPA
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Benchmark Chart */}
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

      {/* Save Comparison Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Save This Comparison</h3>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveComparison} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comparison Name
                </label>
                <input
                  type="text"
                  value={comparisonName}
                  onChange={(e) => setComparisonName(e.target.value)}
                  placeholder="e.g. Maharashtra NITs vs BITS"
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="text-xs text-slate-500">
                Saving {selectedIds.length} college{selectedIds.length > 1 ? 's' : ''} to your account.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingComparison}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  {savingComparison ? 'Saving...' : 'Save Comparison'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrivacyFootnote className="mt-4" />
    </div>
  );
};

export default AspirantCompare;

