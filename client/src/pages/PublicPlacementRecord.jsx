import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Pagination from '../components/common/Pagination';
import {
  GraduationCap,
  Award,
  TrendingUp,
  Building2,
  Users,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Search,
  Filter,
  RotateCw,
  GitCompare,
  X,
  ChevronRight,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  MapPin,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PrivacyBadge, PrivacyFootnote } from '../components/common/PrivacyBadge';
import { INDIAN_STATES_AND_UTS } from '../constants/aspirantConstants';
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

const PublicPlacementRecord = () => {
  const { user, isAspirant } = useAuth();
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortBy, setSortBy] = useState('placementPercentage');
  const [order, setOrder] = useState('desc');
  const [stateCounts, setStateCounts] = useState({});
  const [page, setPage] = useState(1);
  const limit = 10;

  // Aspirant Shortlist & Recommendations State
  const [shortlistedSet, setShortlistedSet] = useState(new Set());
  const [togglingShortlist, setTogglingShortlist] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [filterHomeStateOnly, setFilterHomeStateOnly] = useState(false);
  const [showOnlyMyBranches, setShowOnlyMyBranches] = useState(true);

  useEffect(() => {
    api
      .get('/colleges/public/filters')
      .then((res) => {
        if (res.data?.success && res.data?.states) {
          const counts = {};
          res.data.states.forEach((item) => {
            if (typeof item === 'object' && item.state) {
              counts[item.state] = item.count;
            } else if (typeof item === 'string') {
              counts[item] = (counts[item] || 0) + 1;
            }
          });
          setStateCounts(counts);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isAspirant) {
      setRecLoading(true);
      Promise.all([
        api.get('/aspirant/me').catch(() => ({ data: { success: false } })),
        api.get('/aspirant/recommendations').catch(() => ({ data: { success: false } })),
      ])
        .then(([meRes, recRes]) => {
          if (meRes.data?.success && meRes.data?.aspirant) {
            const asp = meRes.data.aspirant;
            const prefs = {
              state: asp.state || '',
              twelfthStream: asp.twelfthStream || '',
              interestedBranches: Array.isArray(asp.interestedBranches) ? asp.interestedBranches : [],
            };
            setPreferences(prefs);
            if (prefs.state) {
              setFilterHomeStateOnly(true);
            }
            if (prefs.interestedBranches.length > 0) {
              setShowOnlyMyBranches(true);
            }

            if (asp.shortlistedColleges) {
              const ids = asp.shortlistedColleges.map((c) =>
                typeof c === 'object' && c ? c._id : c
              ).filter(Boolean);
              setShortlistedSet(new Set(ids));
            }
          }
          if (recRes.data?.success) {
            setRecommendations(recRes.data.colleges || []);
          }
        })
        .finally(() => {
          setRecLoading(false);
        });
    }
  }, [isAspirant]);

  const handleToggleShortlist = async (collegeId) => {
    setTogglingShortlist(collegeId);
    try {
      if (shortlistedSet.has(collegeId)) {
        await api.delete(`/aspirant/shortlist/${collegeId}`);
        setShortlistedSet((prev) => {
          const next = new Set(prev);
          next.delete(collegeId);
          return next;
        });
        toast.success('Removed from shortlist');
      } else {
        await api.post(`/aspirant/shortlist/${collegeId}`);
        setShortlistedSet((prev) => {
          const next = new Set(prev);
          next.add(collegeId);
          return next;
        });
        toast.success('Saved to shortlist');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update shortlist');
    } finally {
      setTogglingShortlist(null);
    }
  };

  // Compare State (up to 3 colleges)
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [comparisonData, setComparisonData] = useState([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [comparingLoading, setComparingLoading] = useState(false);

  // Fetch all approved colleges placement data
  const fetchPlacements = async () => {
    setLoading(true);
    try {
      const params = {
        sortBy,
        order,
      };
      if (search.trim()) params.search = search.trim();
      if (stateFilter.trim()) params.state = stateFilter.trim();

      const res = await api.get('/colleges/public/placements', { params });
      if (res.data.success) {
        setColleges(res.data.colleges || []);
      }
    } catch (err) {
      console.error('Failed to load public placements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlacements();
  }, [sortBy, order, stateFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPlacements();
  };

  // Compare toggle
  const toggleCompare = (college) => {
    const isSelected = selectedForCompare.some((c) => c._id === college._id);
    if (isSelected) {
      setSelectedForCompare((prev) => prev.filter((c) => c._id !== college._id));
    } else {
      if (selectedForCompare.length >= 3) {
        toast.error('You can compare a maximum of 3 colleges simultaneously');
        return;
      }
      setSelectedForCompare((prev) => [...prev, college]);
    }
  };

  // Open Compare Modal
  const handleOpenCompare = async () => {
    if (selectedForCompare.length < 2) {
      toast.error('Please select at least 2 colleges to compare');
      return;
    }
    setComparingLoading(true);
    setCompareModalOpen(true);
    try {
      const codes = selectedForCompare.map((c) => c.code).join(',');
      const res = await api.get('/colleges/public/compare', {
        params: { colleges: codes },
      });
      if (res.data.success) {
        setComparisonData(res.data.colleges || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to compare colleges');
    } finally {
      setComparingLoading(false);
    }
  };

  // Unique list of states for filter dropdown
  const statesList = Array.from(
    new Set(colleges.map((c) => c.state).filter(Boolean))
  ).sort();

  const totalColleges = colleges.length;
  const totalPages = Math.ceil(totalColleges / limit) || 1;
  const paginatedColleges = colleges.slice((page - 1) * limit, page * limit);

  const renderMetric = (val, suffix = '') => {
    if (val === 'lt5') {
      return <PrivacyBadge />;
    }
    if (val === null || val === undefined) return '-';
    return `${val}${suffix}`;
  };

  const hasPreferences =
    preferences &&
    Array.isArray(preferences.interestedBranches) &&
    preferences.interestedBranches.length > 0;

  const isNonPcmStream =
    preferences?.twelfthStream &&
    !preferences.twelfthStream.toLowerCase().includes('pcm');

  const rankedNationwide = recommendations.filter((c) => c.hasSufficientData);
  const rankedHomeState = rankedNationwide.filter((c) => c.isHomeState);
  const inStateWithoutData = recommendations.filter(
    (c) => c.isHomeState && !c.hasSufficientData
  );

  const isHomeStateFilterActive = Boolean(filterHomeStateOnly && preferences?.state);
  const showNationwideFallback = Boolean(
    isHomeStateFilterActive && rankedHomeState.length === 0
  );

  const visibleRecommendations = isHomeStateFilterActive
    ? rankedHomeState.length > 0
      ? rankedHomeState
      : rankedNationwide
    : rankedNationwide;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-900 block leading-tight">
                National Campus Placement Records
              </span>
              <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide block">
                Public Institutional Verification & Benchmarking
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <span>Portal Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-indigo-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Public Anonymized Placement & Employability Statistics</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
            Institutional Placement Records & Benchmarks
          </h1>
          <p className="max-w-2xl mx-auto text-xs sm:text-sm text-slate-300 leading-relaxed">
            Transparent recruitment metrics across all accredited colleges. Compare institutional placement rates, compensation distributions, and hiring partner engagement.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Aspirant Personalized Section (when logged in as an Aspirant) */}
        {isAspirant && isNonPcmStream && (
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Academic Eligibility Notice: </span>
              You indicated a 12th standard stream of <strong>{preferences.twelfthStream}</strong>. Most technical and engineering programs (B.Tech / B.E.) typically require Physics, Chemistry, and Mathematics (PCM) at 10+2. Please verify individual college eligibility rules.
            </div>
          </div>
        )}

        {isAspirant && !hasPreferences && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-50 to-indigo-100/60 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-indigo-600/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-950">
                  Unlock Personalized College Recommendations
                </h3>
                <p className="text-xs text-indigo-800/90 mt-0.5 max-w-xl">
                  Set your target disciplines, home state, and 12th stream to get customized rankings and verified placement highlights for your preferred branches.
                </p>
              </div>
            </div>
            <Link
              to="/aspirant/preferences"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shrink-0 transition-colors shadow-xs"
            >
              <span>Set Preferences</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {isAspirant && hasPreferences && (
          <div className="space-y-4">
            {/* Section Header & Toggles */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-indigo-100 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Recommended For You
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ranked by placement rate and compensation in your target branches:{' '}
                  <span className="font-semibold text-indigo-700">
                    {preferences.interestedBranches.join(', ')}
                  </span>
                  {preferences.state && (
                    <span>
                      {' '}• Home state: <span className="font-semibold text-slate-800">{preferences.state}</span>
                    </span>
                  )}
                </p>
              </div>

              {/* Quick Controls */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {preferences.state && (
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer select-none transition-colors ${
                    filterHomeStateOnly
                      ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}>
                    <input
                      type="checkbox"
                      checked={filterHomeStateOnly}
                      onChange={(e) => setFilterHomeStateOnly(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                    />
                    <span>Colleges in my state</span>
                  </label>
                )}

                <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer select-none transition-colors ${
                  showOnlyMyBranches
                    ? 'bg-indigo-50 text-indigo-900 border-indigo-300 font-semibold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}>
                  <input
                    type="checkbox"
                    checked={showOnlyMyBranches}
                    onChange={(e) => setShowOnlyMyBranches(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Show only my branches</span>
                </label>
              </div>
            </div>

            {/* Nationwide Fallback Notice if no matching colleges in home state */}
            {showNationwideFallback && (
              <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  No colleges in <strong>{preferences.state}</strong> have enough data for your branches yet. Showing the best matches nationwide instead.
                </div>
              </div>
            )}

            {/* In Your State Spotlight for colleges with too little branch data */}
            {inStateWithoutData.length > 0 && (
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>In Your State ({preferences.state})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {inStateWithoutData.map((c) => (
                    <div
                      key={`instate-${c._id}`}
                      className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-xs flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-bold text-indigo-600 font-mono">
                            {c.code}
                          </span>
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                            In your state
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate" title={c.name}>
                          {c.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 italic">
                          Not enough branch data to show yet
                        </p>
                      </div>
                      <Link
                        to={`/placements/${c.code}`}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <span>View</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations Cards Grid */}
            {recLoading ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs font-semibold">Calculating personalized branch recommendations...</p>
              </div>
            ) : visibleRecommendations.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                <Building2 className="w-7 h-7 mx-auto mb-1.5 text-slate-300" />
                <p className="font-semibold text-slate-700">No matching colleges in this filter view</p>
                <p className="text-slate-400 mt-0.5">
                  Try broadening your target branches in Preferences.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleRecommendations.map((c) => {
                  const isSaved = shortlistedSet.has(c._id);
                  return (
                    <div
                      key={`rec-${c._id}`}
                      className={`bg-white rounded-2xl border transition-all flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                        c.isHomeState
                          ? 'border-amber-300 ring-1 ring-amber-200/60'
                          : 'border-slate-200/90'
                      }`}
                    >
                      <div className="p-5 space-y-3">
                        {/* Top Bar with Badges & Shortlist */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
                                {c.code}
                              </span>
                              {c.isHomeState && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <MapPin className="w-2.5 h-2.5" />
                                  <span>Home state</span>
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 truncate" title={c.name}>
                              {c.name}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {c.city}, {c.state}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleShortlist(c._id)}
                            disabled={togglingShortlist === c._id}
                            className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                              isSaved
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                            }`}
                            title={isSaved ? 'Remove from shortlist' : 'Save to shortlist'}
                          >
                            {isSaved ? (
                              <BookmarkCheck className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Targeted Branch Metrics */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                              Your Target Disciplines
                            </span>
                            {c.hasSufficientData ? (
                              <span className="text-xs font-bold text-indigo-600">
                                Avg {c.avgBranchPlacementRate}% placed
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400 italic">
                                Not enough branch data to show
                              </span>
                            )}
                          </div>

                          {/* Branch-by-branch details */}
                          <div className="space-y-1.5 pt-1 text-xs">
                            {c.myBranchStats && c.myBranchStats.length > 0 ? (
                              c.myBranchStats.map((br) => (
                                <div
                                  key={br.branch}
                                  className="flex items-center justify-between text-slate-700 text-xs py-0.5 border-b border-slate-100/80 last:border-0"
                                >
                                  <span className="font-semibold text-slate-800">{br.branch}:</span>
                                  <span className="text-slate-600">
                                    {br.isSmallGroup ? (
                                      <span className="inline-flex items-center gap-1">
                                        <PrivacyBadge />
                                        <span className="text-[10px] text-slate-400">(fewer than 5)</span>
                                      </span>
                                    ) : (
                                      <span>
                                        <strong>{br.placementPercentage}%</strong> placed
                                        {typeof br.averagePackage === 'number' && (
                                          <span className="text-slate-500">
                                            , avg <strong>{br.averagePackage} LPA</strong>
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">No direct branch records</p>
                            )}
                          </div>
                        </div>

                        {/* Overall College Figure in Smaller Text */}
                        <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between border-t border-slate-100">
                          <span>Overall college:</span>
                          <span className="font-medium text-slate-700">
                            {c.overallPlacementPercentage === 'lt5' ? (
                              '< 5 placed'
                            ) : (
                              <strong>{c.overallPlacementPercentage}% placed</strong>
                            )}
                            {' • '}
                            {typeof c.overallAveragePackage === 'number'
                              ? `Avg ${c.overallAveragePackage} LPA`
                              : 'Package suppressed'}
                            {' • '}
                            {c.overallTotalStudents} students
                          </span>
                        </div>
                      </div>

                      {/* Footer link */}
                      <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
                        <Link
                          to={`/placements/${c.code}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                        >
                          <span>Full Placement Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleToggleShortlist(c._id)}
                          disabled={togglingShortlist === c._id}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          {isSaved ? 'Saved' : '+ Shortlist'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Search, Filter & Sort Controls */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search college name, code, city, or state..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </form>

            {/* State Filter */}
            <div className="w-full sm:w-56">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
              >
                <option value="">All States</option>
                {INDIAN_STATES_AND_UTS.map((st) => {
                  const cnt = stateCounts[st] !== undefined ? stateCounts[st] : 0;
                  return (
                    <option key={st} value={st}>
                      {st} ({cnt})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="w-full sm:w-56">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
              >
                <option value="placementPercentage">Sort by Placement Rate</option>
                <option value="students">Sort by Total Students</option>
                <option value="averagePackage">Sort by Average Package</option>
                <option value="name">Sort by College Name</option>
              </select>
            </div>

            <button
              onClick={fetchPlacements}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Apply
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>
              Showing <strong>{colleges.length}</strong> approved institutions
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                Data Privacy: Small cohorts (&lt;5) are anonymized
              </span>
            </div>
          </div>
        </div>

        {/* Colleges Grid / Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                  <th className="py-3 px-4 w-12 text-center">Compare</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Total Students</th>
                  <th className="py-3 px-4 w-44">Placement Rate</th>
                  <th className="py-3 px-4 text-right">Avg Package</th>
                  <th className="py-3 px-4 text-right">Max Package</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <span>Loading institutional placement records...</span>
                    </td>
                  </tr>
                ) : colleges.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      {stateFilter ? (
                        <div className="space-y-3 max-w-md mx-auto">
                          <p className="text-sm font-semibold text-slate-700">
                            No colleges from {stateFilter} are on the platform yet.
                          </p>
                          <p className="text-xs text-slate-500">
                            Try nearby states or clear the filter to view all accredited institutions.
                          </p>
                          <button
                            type="button"
                            onClick={() => setStateFilter('')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold cursor-pointer transition-colors"
                          >
                            Clear filter
                          </button>
                        </div>
                      ) : (
                        <span>No approved colleges found matching the selected criteria.</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedColleges.map((c) => {
                    const isSelected = selectedForCompare.some((col) => col._id === c._id);
                    const isUnderFive =
                      c.placementPercentage === 'lt5' ||
                      c.students === 'lt5' ||
                      (typeof c.students === 'number' && c.students < 5);
                    return (
                      <tr key={c._id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Compare Checkbox */}
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCompare(c)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            title="Select to compare (up to 3)"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block truncate max-w-xs">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-indigo-600 font-mono font-semibold">
                            {c.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {c.city}, {c.state}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {renderMetric(c.students)}
                        </td>
                        <td className="py-3 px-4">
                          {isUnderFive ? (
                            <span className="text-[11px] text-slate-400 italic">
                              Not enough data to show statistics yet
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-600 h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, c.placementPercentage || 0)}%`,
                                  }}
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
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              to={`/placements/${c.code}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                            >
                              <span>View details</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>

                            {isAspirant && (
                              <button
                                type="button"
                                onClick={() => handleToggleShortlist(c._id)}
                                disabled={togglingShortlist === c._id}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                  shortlistedSet.has(c._id)
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                                }`}
                              >
                                {shortlistedSet.has(c._id) ? (
                                  <>
                                    <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Save</span>
                                  </>
                                )}
                              </button>
                            )}

                            {!user && (
                              <Link
                                to="/login"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border border-slate-200 transition-colors"
                                title="Sign in as prospective student to save"
                              >
                                <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                                <span>Log in to save</span>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalColleges}
            itemsPerPage={limit}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>

        <PrivacyFootnote className="mt-4" />
      </main>

      {/* Floating Compare Action Bar */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4">
          <div className="bg-slate-900 text-white py-3 px-5 rounded-2xl shadow-xl flex items-center gap-4 border border-slate-700">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold">
                Selected for comparison: <strong>{selectedForCompare.length} / 3</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {selectedForCompare.map((c) => (
                <span
                  key={c._id}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700"
                >
                  <span>{c.code}</span>
                  <button
                    onClick={() => toggleCompare(c)}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenCompare}
                disabled={selectedForCompare.length < 2}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Compare ({selectedForCompare.length})
              </button>
              <button
                onClick={() => setSelectedForCompare([])}
                className="text-xs text-slate-400 hover:text-white px-2 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="sticky top-0 bg-white p-4 border-b border-slate-200 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Side-by-Side Institutional Comparison
                </h3>
              </div>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {comparingLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Loading comparison metrics...</span>
                </div>
              ) : (
                <>
                  {/* Side-by-side cards */}
                  <div
                    className={`grid grid-cols-1 ${
                      comparisonData.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
                    } gap-4`}
                  >
                    {comparisonData.map((c) => (
                      <div
                        key={c._id}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                      >
                        <div>
                          <span className="text-[10px] font-bold font-mono uppercase text-indigo-600">
                            {c.code}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 truncate">
                            {c.name}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {c.city}, {c.state}
                          </p>
                        </div>

                        <div className="space-y-1.5 text-xs pt-2 border-t border-slate-200/80">
                          <div className="flex justify-between py-0.5">
                            <span className="text-slate-500">Total Students</span>
                            <span className="font-semibold">{renderMetric(c.students)}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-slate-500">Placed Students</span>
                            <span className="font-semibold text-emerald-600">
                              {renderMetric(c.placed)}
                            </span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-slate-500">Placement %</span>
                            <span className="font-bold text-slate-900">
                              {renderMetric(c.placementPercentage, '%')}
                            </span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-slate-500">Avg Package</span>
                            <span className="font-semibold text-indigo-600">
                              {c.averagePackage ? `${c.averagePackage} LPA` : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-slate-500">Highest Package</span>
                            <span className="font-semibold text-slate-900">
                              {c.highestPackage ? `${c.highestPackage} LPA` : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 text-center">
                          <Link
                            to={`/placements/${c.code}`}
                            className="text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            Full Placement Details &rarr;
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Grouped Comparison Chart */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Comparison Visualization
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={comparisonData.map((c) => ({
                            name: c.code || c.name,
                            Students: typeof c.students === 'number' ? c.students : 0,
                            Placed: typeof c.placed === 'number' ? c.placed : 0,
                            'Avg Package (LPA)':
                              typeof c.averagePackage === 'number' ? c.averagePackage : 0,
                          }))}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
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
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                          <Bar dataKey="Students" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Placed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Avg Package (LPA)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <PrivacyFootnote className="mt-2" />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicPlacementRecord;
