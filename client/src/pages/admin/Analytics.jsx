import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import AdminDashboard from './AdminDashboard';
import {
  BarChart3,
  AlertTriangle,
  FileText,
  Sparkles,
  Users,
  ShieldAlert,
  CheckCircle2,
  Filter,
  RotateCw,
  Copy,
  Check,
  TrendingUp,
  Award,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

const Analytics = () => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'atRisk' | 'weeklySummary'

  // At-Risk State
  const [atRiskLoading, setAtRiskLoading] = useState(false);
  const [atRiskData, setAtRiskData] = useState({
    totalStudents: 0,
    counts: { high: 0, medium: 0, low: 0, atRiskTotal: 0 },
    students: [],
  });
  const [riskTierFilter, setRiskTierFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');

  // Weekly Summary State
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [weeklySummaryData, setWeeklySummaryData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Fetch At-Risk Students
  const fetchAtRiskStudents = async () => {
    setAtRiskLoading(true);
    try {
      const params = {};
      if (riskTierFilter !== 'ALL') params.riskTier = riskTierFilter;
      if (branchFilter !== 'ALL') params.branch = branchFilter;

      const res = await api.get('/tpo/insights/at-risk', { params });
      if (res.data.success) {
        setAtRiskData({
          totalStudents: res.data.totalStudents || 0,
          counts: res.data.counts || { high: 0, medium: 0, low: 0, atRiskTotal: 0 },
          students: res.data.students || [],
        });
      }
    } catch (err) {
      console.error('Failed to load at-risk students:', err);
      toast.error('Could not fetch at-risk student insights');
    } finally {
      setAtRiskLoading(false);
    }
  };

  // Fetch Weekly Placement Summary
  const fetchWeeklySummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get('/tpo/insights/weekly-summary');
      if (res.data.success) {
        setWeeklySummaryData(res.data);
      }
    } catch (err) {
      console.error('Failed to load weekly summary:', err);
      toast.error('Could not generate weekly placement summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'atRisk') {
      fetchAtRiskStudents();
    } else if (activeTab === 'weeklySummary' && !weeklySummaryData) {
      fetchWeeklySummary();
    }
  }, [activeTab, riskTierFilter, branchFilter]);

  const handleCopySummary = () => {
    if (!weeklySummaryData?.summary) return;
    const s = weeklySummaryData.summary;
    const text = `Weekly Placement Intelligence Summary (${s.weekEndingDate})\n\n${s.executiveSummary}\n\nKey Highlights:\n${(s.keyHighlights || []).map((h) => `• ${h}`).join('\n')}\n\nAreas of Concern:\n${(s.areasOfConcern || []).map((c) => `• ${c}`).join('\n')}\n\nRecommended Interventions:\n${(s.recommendedInterventions || []).map((i) => `• ${i}`).join('\n')}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Summary copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Placement Intelligence & Analytics</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional overview, transparent student risk monitoring, and grounded AI summaries.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Placement Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('atRisk')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'atRisk'
                ? 'bg-white text-rose-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>At-Risk Students</span>
            {atRiskData.counts.high > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 ml-0.5">
                {atRiskData.counts.high}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('weeklySummary')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'weeklySummary'
                ? 'bg-white text-violet-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span>Weekly AI Summary</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Original Placement Overview */}
      {activeTab === 'overview' && <AdminDashboard />}

      {/* Tab 2: Explainable At-Risk Students */}
      {activeTab === 'atRisk' && (
        <div className="space-y-6">
          {/* Risk Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4.5 rounded-2xl border border-rose-100 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-rose-600 font-semibold mb-1">
                <span>High Risk Cohort</span>
                <ShieldAlert className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-700">
                {atRiskData.counts.high}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                $\ge$ 3 flags or missing resume + 0 applications
              </p>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-amber-100 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-amber-600 font-semibold mb-1">
                <span>Medium Risk</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-700">
                {atRiskData.counts.medium}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                1 - 2 academic or application flags
              </p>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-emerald-100 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-emerald-600 font-semibold mb-1">
                <span>On Track / Low Risk</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-700">
                {atRiskData.counts.low}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Active resume, applications & qualifying CGPA
              </p>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-600 font-semibold mb-1">
                <span>Total Enrolled</span>
                <Users className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-black text-slate-800">
                {atRiskData.totalStudents}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Total candidates in institutional directory
              </p>
            </div>
          </div>

          {/* Table Filters & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span>Filter By:</span>
              </div>

              {/* Risk Tier Filter */}
              <select
                value={riskTierFilter}
                onChange={(e) => setRiskTierFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Risk Tiers</option>
                <option value="high">High Risk Only</option>
                <option value="medium">Medium Risk Only</option>
                <option value="low">Low Risk / On Track</option>
              </select>

              {/* Branch Filter */}
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Branches</option>
                <option value="CSE">CSE</option>
                <option value="IT">IT</option>
                <option value="ECE">ECE</option>
                <option value="EE">EE</option>
                <option value="ME">ME</option>
                <option value="CE">CE</option>
                <option value="AI & DS">AI & DS</option>
              </select>
            </div>

            <button
              type="button"
              onClick={fetchAtRiskStudents}
              disabled={atRiskLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${atRiskLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Evaluation</span>
            </button>
          </div>

          {/* Transparent At-Risk Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Student Risk Registry (Transparent Rule-Based)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Scores calculated objectively from CGPA, active backlogs, submitted applications, and resume profile.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Showing {atRiskData.students.length} student(s)
              </span>
            </div>

            {atRiskLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500">Evaluating transparent risk formulas...</p>
              </div>
            ) : atRiskData.students.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                No students match the specified risk criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">CGPA / Backlogs</th>
                      <th className="py-3 px-4">Applications</th>
                      <th className="py-3 px-4">Risk Tier</th>
                      <th className="py-3 px-4">Triggered Flags</th>
                      <th className="py-3 px-4">Suggested Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {atRiskData.students.map((st) => (
                      <tr key={st.studentId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{st.studentName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {st.enrollmentNo}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">{st.branch}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{st.cgpa} CGPA</div>
                          <div
                            className={`text-[10px] font-semibold ${
                              st.backlogs > 0 ? 'text-rose-600' : 'text-slate-400'
                            }`}
                          >
                            {st.backlogs} Backlog(s)
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              st.applicationsCount === 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {st.applicationsCount} Applied
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                              st.riskTier === 'high'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : st.riskTier === 'medium'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {st.riskTier}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {st.flags?.length > 0 ? (
                              st.flags.map((f) => (
                                <span
                                  key={f.code}
                                  title={f.detail}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    f.severity === 'high'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {f.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-emerald-700 font-medium">
                                No risk flags
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1 max-w-xs text-[11px] text-slate-600">
                            {st.suggestions?.slice(0, 1).map((sug, i) => (
                              <div
                                key={i}
                                className="p-1.5 rounded-lg bg-indigo-50/60 text-indigo-900 border border-indigo-100/70"
                              >
                                {sug}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Grounded Weekly AI Summary */}
      {activeTab === 'weeklySummary' && (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span>Executive Weekly Placement Intelligence</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                AI brief generated strictly from live database transactions. Zero speculative figures.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                disabled={!weeklySummaryData?.summary}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
              </button>

              <button
                type="button"
                onClick={fetchWeeklySummary}
                disabled={summaryLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
                <span>Re-generate Brief</span>
              </button>
            </div>
          </div>

          {summaryLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white rounded-2xl border border-slate-200">
              <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">
                Grounding database metrics and preparing executive placement brief...
              </p>
            </div>
          ) : weeklySummaryData?.summary ? (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <div className="bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-lg space-y-3">
                <div className="flex items-center justify-between text-xs text-violet-300">
                  <span className="font-semibold uppercase tracking-wider">
                    Executive Briefing
                  </span>
                  <span>Week Ending: {weeklySummaryData.summary.weekEndingDate}</span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-slate-100 font-medium">
                  {weeklySummaryData.summary.executiveSummary}
                </p>
              </div>

              {/* Key Insights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Highlights */}
                <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Key Highlights</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {weeklySummaryData.summary.keyHighlights?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Areas of Concern */}
                <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Areas of Concern</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {weeklySummaryData.summary.areasOfConcern?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Interventions */}
                <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Recommended Interventions</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {weeklySummaryData.summary.recommendedInterventions?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Grounded Underlying Metrics Grid */}
              {weeklySummaryData.metrics && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Live Verified Database Metrics Grounding
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Students
                      </span>
                      <span className="text-base font-bold text-slate-800">
                        {weeklySummaryData.metrics.totalStudents}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Applied
                      </span>
                      <span className="text-base font-bold text-slate-800">
                        {weeklySummaryData.metrics.appliedStudents}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Placed
                      </span>
                      <span className="text-base font-bold text-emerald-700">
                        {weeklySummaryData.metrics.placedStudents}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Placement %
                      </span>
                      <span className="text-base font-bold text-indigo-700">
                        {weeklySummaryData.metrics.placementRate}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Open Drives
                      </span>
                      <span className="text-base font-bold text-slate-800">
                        {weeklySummaryData.metrics.openDrivesCount}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Avg CTC
                      </span>
                      <span className="text-base font-bold text-slate-800">
                        {weeklySummaryData.metrics.averagePackage}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs bg-white rounded-2xl border border-slate-200">
              No placement summary generated yet. Click "Re-generate Brief" to synthesize insights.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Analytics;
