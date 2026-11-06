import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  BookmarkCheck,
  Building2,
  Trash2,
  GitCompare,
  ArrowRight,
  Compass,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';

const AspirantShortlist = () => {
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [removingId, setRemovingId] = useState(null);
  const [myBranches, setMyBranches] = useState([]);
  const navigate = useNavigate();

  const fetchShortlist = async () => {
    setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        api.get('/aspirant/shortlist'),
        api.get('/aspirant/me').catch(() => ({ data: { success: false } })),
      ]);
      if (res.data.success) {
        setColleges(res.data.colleges || []);
      }
      if (meRes.data?.success && meRes.data?.aspirant?.interestedBranches) {
        setMyBranches(meRes.data.aspirant.interestedBranches);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load shortlisted institutions', {
        id: 'shortlist-fetch-error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShortlist();
  }, []);

  const handleRemove = async (collegeId) => {
    setRemovingId(collegeId);
    try {
      const res = await api.delete(`/aspirant/shortlist/${collegeId}`);
      if (res.data.success) {
        toast.success('Removed from shortlist');
        setColleges((prev) => prev.filter((c) => c._id !== collegeId));
        setSelectedForCompare((prev) => prev.filter((id) => id !== collegeId));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove from shortlist');
    } finally {
      setRemovingId(null);
    }
  };

  const toggleSelectForCompare = (collegeId) => {
    if (selectedForCompare.includes(collegeId)) {
      setSelectedForCompare((prev) => prev.filter((id) => id !== collegeId));
    } else {
      if (selectedForCompare.length >= 3) {
        toast.error('You can compare a maximum of 3 colleges simultaneously');
        return;
      }
      setSelectedForCompare((prev) => [...prev, collegeId]);
    }
  };

  const handleCompareClick = () => {
    if (selectedForCompare.length < 2) {
      toast.error('Please select at least 2 colleges to compare');
      return;
    }
    navigate(`/aspirant/compare?colleges=${selectedForCompare.join(',')}`);
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
            My Shortlisted Institutions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your saved target colleges and run side-by-side comparative evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCompareClick}
            disabled={selectedForCompare.length < 2}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <GitCompare className="w-4 h-4" />
            <span>Compare Selected ({selectedForCompare.length})</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold">Loading shortlisted institutions...</p>
        </div>
      ) : colleges.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
          <BookmarkCheck className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Your shortlist is currently empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Explore verified colleges and save them to your shortlist for easy tracking and side-by-side comparison.
          </p>
          <Link
            to="/aspirant/explore"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Explore Colleges</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>
              <strong>{colleges.length}</strong> college{colleges.length > 1 ? 's' : ''} saved
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">
              Select 2 or 3 colleges to compare side-by-side
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {colleges.map((c) => {
              const isSelected = selectedForCompare.includes(c._id);
              return (
                <div
                  key={c._id}
                  className={`bg-white rounded-2xl border transition-all flex flex-col justify-between overflow-hidden ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectForCompare(c._id)}
                          className="w-4 h-4 mt-1 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          title="Select to compare"
                        />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
                            {c.code}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 truncate" title={c.name}>
                            {c.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {c.city}, {c.state}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemove(c._id)}
                        disabled={removingId === c._id}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove from shortlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Placement Rate Bar */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-slate-500 font-medium">Placement Rate</span>
                        {c.placementPercentage === 'lt5' ? (
                          <PrivacyBadge />
                        ) : (
                          <span className="font-bold text-slate-900">
                            {c.placementPercentage}%
                          </span>
                        )}
                      </div>
                      {c.placementPercentage !== 'lt5' && (
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full rounded-full"
                            style={{ width: `${Math.min(100, c.placementPercentage || 0)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="p-2 rounded-xl bg-slate-50 text-center">
                        <span className="text-[10px] text-slate-400 block">Cohort</span>
                        <span className="font-bold text-slate-800">
                          {renderMetric(c.students)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 text-center">
                        <span className="text-[10px] text-slate-400 block">Avg Package</span>
                        <span className="font-bold text-indigo-600">
                          {typeof c.averagePackage === 'number'
                            ? `${c.averagePackage} LPA`
                            : renderMetric(c.averagePackage)}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 text-center">
                        <span className="text-[10px] text-slate-400 block">Highest</span>
                        <span className="font-bold text-slate-900">
                          {typeof c.highestPackage === 'number'
                            ? `${c.highestPackage} LPA`
                            : renderMetric(c.highestPackage)}
                        </span>
                      </div>
                    </div>

                    {/* Target Branches Highlight */}
                    {c.byBranch && c.byBranch.length > 0 && myBranches.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block mb-1.5">
                          Target Branches
                        </span>
                        <div className="space-y-1">
                          {c.byBranch
                            .filter((br) =>
                              myBranches.some(
                                (b) => b.trim().toUpperCase() === br.branch.trim().toUpperCase()
                              )
                            )
                            .map((br) => (
                              <div
                                key={br.branch}
                                className="flex items-center justify-between p-1.5 rounded-lg bg-indigo-50/70 border border-indigo-100 text-xs"
                              >
                                <span className="font-semibold text-indigo-950">{br.branch}</span>
                                <div className="text-right">
                                  <span className="font-bold text-indigo-900">
                                    {br.placementPercentage === 'lt5' ? (
                                      <PrivacyBadge />
                                    ) : (
                                      `${br.placementPercentage}%`
                                    )}
                                  </span>
                                  {typeof br.averagePackage === 'number' && (
                                    <span className="text-[10px] text-indigo-600 ml-1.5 font-medium">
                                      ({br.averagePackage} LPA)
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer link */}
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                    <Link
                      to={`/placements/${c.code}`}
                      className="font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                    >
                      <span>Public Record</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => toggleSelectForCompare(c._id)}
                      className={`font-semibold cursor-pointer ${
                        isSelected ? 'text-indigo-600' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : '+ Compare'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PrivacyFootnote className="mt-4" />
    </div>
  );
};

export default AspirantShortlist;

