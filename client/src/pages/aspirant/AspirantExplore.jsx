import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Compass,
  Search,
  Building2,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  ExternalLink,
  Filter,
  Sparkles,
  ArrowRight,
  AlertCircle,
  MapPin,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PrivacyBadge, PrivacyFootnote } from '../../components/common/PrivacyBadge';
import { INDIAN_STATES_AND_UTS } from '../../constants/aspirantConstants';

const AspirantExplore = () => {
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortBy, setSortBy] = useState('placementPercentage');
  const [order, setOrder] = useState('desc');
  const [stateCounts, setStateCounts] = useState({});

  // Recommendations & Preferences State
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const [filterHomeStateOnly, setFilterHomeStateOnly] = useState(false);
  const [showOnlyMyBranches, setShowOnlyMyBranches] = useState(true);

  // Aspirant Shortlist State
  const [shortlistedSet, setShortlistedSet] = useState(new Set());
  const [togglingId, setTogglingId] = useState(null);

  // Fetch aspirant profile and recommendations
  const fetchPreferencesAndRecs = async () => {
    setRecLoading(true);
    try {
      const [meRes, recRes] = await Promise.all([
        api.get('/aspirant/me').catch(() => ({ data: { success: false } })),
        api.get('/aspirant/recommendations').catch(() => ({ data: { success: false } })),
      ]);

      if (meRes.data?.success && meRes.data?.aspirant) {
        const asp = meRes.data.aspirant;
        const prefs = {
          state: asp.state || '',
          twelfthStream: asp.twelfthStream || '',
          interestedBranches: Array.isArray(asp.interestedBranches) ? asp.interestedBranches : [],
        };
        setPreferences(prefs);

        // Pre-activate filters if preferences exist
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
    } catch (err) {
      console.error('Failed to load aspirant recommendations:', err);
    } finally {
      setRecLoading(false);
    }
  };

  // Fetch filter options (states with approved counts)
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const res = await api.get('/aspirant/filters');
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
      } catch (_) {}
    };
    fetchFilters();
    fetchPreferencesAndRecs();
  }, []);

  const fetchColleges = async () => {
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
      toast.error(err.response?.data?.message || 'Failed to load institutions', {
        id: 'colleges-fetch-error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, [sortBy, order, stateFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchColleges();
  };

  const handleToggleShortlist = async (collegeId) => {
    setTogglingId(collegeId);
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
      setTogglingId(null);
    }
  };

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
    <div className="space-y-8">
      {/* Page Title & Quick Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Explore College Placements
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Discover verified placement statistics and discover institutions aligned with your admission goals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/aspirant/preferences"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>Preferences</span>
          </Link>
          <Link
            to="/aspirant/shortlist"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-colors"
          >
            <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>Shortlist ({shortlistedSet.size})</span>
          </Link>
        </div>
      </div>

      {/* Non-PCM Eligibility Notice (if applicable) */}
      {isNonPcmStream && (
        <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Academic Eligibility Notice: </span>
            You indicated a 12th standard stream of <strong>{preferences.twelfthStream}</strong>. Most technical and engineering programs (B.Tech / B.E.) typically require Physics, Chemistry, and Mathematics (PCM) at 10+2. Please verify individual college eligibility rules.
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. RECOMMENDED FOR YOU SECTION                                        */}
      {/* ===================================================================== */}
      {!hasPreferences ? (
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
      ) : (
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
                          disabled={togglingId === c._id}
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
                        disabled={togglingId === c._id}
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

      {/* ===================================================================== */}
      {/* 2. ALL APPROVED COLLEGES DIRECTORY                                    */}
      {/* ===================================================================== */}
      <div className="pt-4 border-t border-slate-200/90 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            All Approved Institutions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Browse complete verified records across all participating colleges nationwide.
          </p>
        </div>

        {/* Search and Filters */}
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

            <div className="w-full sm:w-52">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
              >
                <option value="placementPercentage">Sort by Placement Rate</option>
                <option value="averagePackage">Sort by Avg Package</option>
                <option value="students">Sort by Total Students</option>
                <option value="name">Sort by College Name</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Colleges Grid */}
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-semibold">Loading college records...</p>
          </div>
        ) : colleges.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            {stateFilter ? (
              <div className="space-y-2 max-w-md mx-auto">
                <p className="text-sm font-semibold text-slate-800">
                  No colleges from {stateFilter} are on the platform yet.
                </p>
                <p className="text-xs text-slate-500">
                  Try nearby states or clear the filter to view all accredited institutions.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setStateFilter('')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Clear filter
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold">No institutions found</p>
                <p className="text-xs text-slate-400">Try adjusting your search criteria or state filter</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {colleges.map((c) => {
              const isSaved = shortlistedSet.has(c._id);
              const isUnderFive =
                c.placementPercentage === 'lt5' ||
                c.students === 'lt5' ||
                (typeof c.students === 'number' && c.students < 5);
              return (
                <div
                  key={c._id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
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

                      <button
                        type="button"
                        onClick={() => handleToggleShortlist(c._id)}
                        disabled={togglingId === c._id}
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

                    {/* Placement Rate Bar */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-slate-500 font-medium">Placement Rate</span>
                        {isUnderFive ? (
                          <span className="text-[11px] font-semibold text-slate-400 italic">
                            Not enough data to show statistics yet
                          </span>
                        ) : (
                          <span className="font-bold text-slate-900">{c.placementPercentage}%</span>
                        )}
                      </div>
                      {!isUnderFive && (
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
                  </div>

                  {/* Footer link */}
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
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
                      disabled={togglingId === c._id}
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

      <PrivacyFootnote className="mt-4" />
    </div>
  );
};

export default AspirantExplore;
