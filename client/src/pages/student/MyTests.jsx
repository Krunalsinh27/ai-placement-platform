import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Building2,
  Calendar,
  RefreshCw,
  Award,
} from 'lucide-react';
import api from '../../services/api';
import { getTestButtonState, categorizeTest } from '../../utils/testWindowHelper';
import { formatISTDateTime } from '../../utils/dateTime';

export default function MyTests() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tests, setTests] = useState([]);
  const [serverNow, setServerNow] = useState(null);
  const [receivedAt, setReceivedAt] = useState(null);
  const [activeTab, setActiveTab] = useState('open'); // 'open' | 'upcoming' | 'completed' | 'missed'

  const fetchMyTests = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const fetchTime = Date.now();
      const res = await api.get('/students/my-tests');
      if (res.data?.success) {
        setTests(res.data.tests || []);
        setServerNow(res.data.serverNow || null);
        setReceivedAt(fetchTime);
      } else {
        setError(res.data?.message || 'Failed to load your online tests.');
      }
    } catch (err) {
      console.error('Error fetching student tests:', err);
      setError(err.response?.data?.message || 'Failed to load tests. Please check connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMyTests();
  }, [fetchMyTests]);

  // Categorize tests into the 4 tabs
  const categorized = useMemo(() => {
    const groups = {
      open: [],
      upcoming: [],
      completed: [],
      missed: [],
    };

    tests.forEach((test) => {
      const category = categorizeTest(test, {
        serverNow,
        receivedAt,
      });
      if (groups[category]) {
        groups[category].push(test);
      } else {
        groups.upcoming.push(test);
      }
    });

    return groups;
  }, [tests, serverNow, receivedAt]);

  const tabs = [
    { id: 'open', label: 'Open now', count: categorized.open.length },
    { id: 'upcoming', label: 'Upcoming', count: categorized.upcoming.length },
    { id: 'completed', label: 'Completed', count: categorized.completed.length },
    { id: 'missed', label: 'Missed', count: categorized.missed.length },
  ];

  const currentTabTests = categorized[activeTab] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <FileText className="w-6 h-6" />
            </span>
            <span>My Tests</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Access active platform assessments, review upcoming test windows, and view your evaluation results.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchMyTests(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/80 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="min-h-[280px] bg-white rounded-3xl border border-slate-200/80 p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center animate-spin mb-3">
            <RefreshCw className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-800">Loading your assessments...</p>
          <p className="text-xs text-slate-400 mt-0.5">Fetching test windows and attempt statuses</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl border border-rose-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Failed to Load Assessments</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => fetchMyTests(false)}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : currentTabTests.length === 0 ? (
        /* Empty State */
        <div className="min-h-[260px] bg-white rounded-3xl border border-slate-200/80 p-12 flex flex-col items-center justify-center text-center space-y-3 shadow-2xs">
          <div className="w-14 h-14 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center">
            <Layers className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">No online tests scheduled</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              {activeTab === 'open'
                ? 'There are currently no active tests open for completion. Check the Upcoming tab for scheduled windows.'
                : activeTab === 'upcoming'
                ? 'You do not have any upcoming tests scheduled at this time.'
                : activeTab === 'completed'
                ? 'You have not submitted any online platform tests yet.'
                : 'No missed tests. Great job staying on top of your schedules!'}
            </p>
          </div>
          {activeTab !== 'open' && categorized.open.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('open')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors pt-1"
            >
              View Open Tests ({categorized.open.length}) →
            </button>
          )}
        </div>
      ) : (
        /* Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentTabTests.map((test) => {
            const btnState = getTestButtonState({
              testWindowStart: test.testWindowStart,
              testWindowEnd: test.testWindowEnd,
              durationMinutes: test.durationMinutes,
              attemptStatus: test.attemptStatus || test.status || 'not_started',
              showScore: test.showScore,
              score: test.score,
              serverNow: test.serverNow || serverNow,
              receivedAt,
            });

            return (
              <div
                key={test.roundId}
                data-testid={`test-card-${test.roundId}`}
                className="rounded-3xl border border-slate-200/80 p-5 bg-white hover:border-indigo-300 hover:shadow-xs transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top: Company, Drive Title & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-indigo-500" />
                        <span>{test.companyName || test.company}</span>
                      </span>
                      <h4 className="text-sm font-black text-slate-900 leading-snug">
                        {test.driveTitle || test.role || 'Placement Drive'}
                      </h4>
                      <p className="text-xs font-semibold text-slate-600">{test.roundName || test.name}</p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                        btnState.statusBadge.color === 'emerald'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : btnState.statusBadge.color === 'amber'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : btnState.statusBadge.color === 'rose'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : btnState.statusBadge.color === 'slate'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      {btnState.statusBadge.label}
                    </span>
                  </div>

                  {/* Window in IST & Duration Info */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60">
                    <div>
                      <span className="text-slate-400 block font-medium">Window Opens (IST):</span>
                      <strong className="text-slate-800 font-semibold">
                        {test.testWindowStart ? formatISTDateTime(test.testWindowStart) : 'TBD'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Window Closes (IST):</span>
                      <strong className="text-slate-800 font-semibold">
                        {test.testWindowEnd ? formatISTDateTime(test.testWindowEnd) : 'TBD'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Duration:</span>
                      <strong className="text-slate-800 font-semibold">
                        {test.durationMinutes || 60} mins
                      </strong>
                    </div>
                    {test.cutoffScore !== null && test.cutoffScore !== undefined ? (
                      <div>
                        <span className="text-slate-400 block font-medium">Cutoff Score:</span>
                        <strong className="text-emerald-700 font-semibold">{test.cutoffScore}%</strong>
                      </div>
                    ) : test.totalMarks ? (
                      <div>
                        <span className="text-slate-400 block font-medium">Total Marks:</span>
                        <strong className="text-slate-800 font-semibold">{test.totalMarks}</strong>
                      </div>
                    ) : null}
                  </div>

                  {test.instructions && (
                    <p className="text-[11px] text-slate-500 italic line-clamp-2 bg-amber-50/50 p-2 rounded-xl border border-amber-100">
                      Instructions: "{test.instructions}"
                    </p>
                  )}

                  {(btnState.action === 'closed' || test.attemptStatus === 'window_closed' || test.status === 'window_closed') && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                      <span className="font-semibold">Status:</span>
                      <span className="font-bold">Completed / Window closed</span>
                    </div>
                  )}

                  {test.showScore && test.score !== undefined && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Your Assessment Score:</span>
                      </span>
                      <span className="font-black text-sm">{test.score} points</span>
                    </div>
                  )}
                </div>

                {/* Bottom: Action button using testWindowHelper logic */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  {btnState.disabled ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed text-center"
                    >
                      {btnState.label}
                    </button>
                  ) : (
                    <Link
                      to={`/student/test/${test.roundId}`}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all text-center cursor-pointer ${
                        btnState.action === 'resume'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
                          : btnState.action === 'view_result'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{btnState.label}</span>
                    </Link>
                  )}
                  <p className="text-[10px] text-slate-500 font-medium text-center">
                    {btnState.reason}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

