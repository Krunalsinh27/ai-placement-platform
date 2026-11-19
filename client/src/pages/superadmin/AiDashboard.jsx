import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Sparkles,
  RotateCw,
  Activity,
  Zap,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Server,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const AiDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState('7'); // '1' | '7' | '30'
  const [data, setData] = useState(null);

  const fetchAiMetrics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/ai-analytics', {
        params: { days: timeWindow },
      });
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load AI analytics:', err);
      toast.error('Unable to fetch AI analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAiMetrics();
  }, [timeWindow]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <span>AI Operations & Cost Telemetry</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time provider health, circuit breaker state, token expenditure, and feature performance.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Time Window Selector */}
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            className="text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer text-slate-700"
          >
            <option value="1">Today (24h)</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </select>

          <button
            type="button"
            onClick={fetchAiMetrics}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Aggregating telemetry logs and token costs...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Top KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Calls */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Total Calls</span>
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {data.overview.totalCalls.toLocaleString()}
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                <span className="text-emerald-600 font-semibold">
                  {data.overview.successRate}% Success
                </span>
                <span className="text-slate-400">
                  {data.overview.successfulCalls} completed
                </span>
              </div>
            </div>

            {/* Estimated Spend */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Estimated Cost</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-700">
                ${data.overview.totalCostEstimateUsd.toFixed(4)}
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 text-slate-500">
                <span>Tokens Tracked:</span>
                <span className="font-mono font-semibold">
                  {data.overview.totalTokensEstimated.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Daily Quota Utilization */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Today's Quota</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {data.quota.todayCalls}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {data.quota.dailyCap}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.quota.utilizationPercentage > 85
                      ? 'bg-rose-500'
                      : data.quota.utilizationPercentage > 60
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, data.quota.utilizationPercentage)}%` }}
                />
              </div>
            </div>

            {/* Resiliency & Latency */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Average Latency</span>
                <Clock className="w-4 h-4 text-violet-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {data.overview.avgLatencyMs} ms
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                <span className="text-slate-500">Fallback Rate:</span>
                <span className="font-semibold text-indigo-600">
                  {data.overview.fallbackRate}%
                </span>
              </div>
            </div>
          </div>

          {/* Circuit Breakers & Provider Health */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Provider Circuit Breakers & Operational States
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Auto-trips after 3 failures • 60s cooldown probing
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(data.circuitBreakers || {}).map(([provider, cb]) => {
                const isOpen = cb.state === 'OPEN';
                const isHalfOpen = cb.state === 'HALF-OPEN';

                return (
                  <div
                    key={provider}
                    className={`p-4 rounded-xl border transition-all ${
                      isOpen
                        ? 'bg-rose-50/70 border-rose-200'
                        : isHalfOpen
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-emerald-50/50 border-emerald-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-extrabold text-sm uppercase text-slate-800 tracking-wider">
                        {provider}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${
                          isOpen
                            ? 'bg-rose-600 text-white'
                            : isHalfOpen
                            ? 'bg-amber-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {cb.state}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Consecutive Failures:</span>
                        <strong className={cb.consecutiveFailures > 0 ? 'text-rose-600' : 'text-slate-800'}>
                          {cb.consecutiveFailures}
                        </strong>
                      </div>
                      {isOpen && cb.cooldownRemainingMs > 0 && (
                        <div className="flex justify-between text-rose-700 font-semibold">
                          <span>Cooldown Remaining:</span>
                          <span>{Math.round(cb.cooldownRemainingMs / 1000)}s</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feature Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Feature Telemetry & Resource Breakdown
                </h3>
                <p className="text-[11px] text-slate-500">
                  Performance and error rates partitioned by user-facing AI capability.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {data.featureBreakdown?.length || 0} Features Logged
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Feature Name</th>
                    <th className="py-3 px-4">Calls Count</th>
                    <th className="py-3 px-4">Avg Latency</th>
                    <th className="py-3 px-4">Failure Rate</th>
                    <th className="py-3 px-4">Est. Cost (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.featureBreakdown?.length > 0 ? (
                    data.featureBreakdown.map((row) => (
                      <tr key={row.feature} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900 capitalize">
                          {row.feature.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {row.calls.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${
                              row.avgLatencyMs > 5000
                                ? 'bg-rose-50 text-rose-700'
                                : row.avgLatencyMs > 2000
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {row.avgLatencyMs} ms
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          <span
                            className={row.failureRate > 0 ? 'text-rose-600' : 'text-emerald-600'}
                          >
                            {row.failureRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                          ${row.costEstimateUsd.toFixed(4)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No feature calls recorded in this time window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feature Flags Registry */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Active AI Capability Feature Flags
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Granular environment toggles to selectively enable or disable individual AI modules.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {Object.entries(data.featureFlags || {}).map(([feature, flag]) => (
                <div
                  key={feature}
                  className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-xs text-slate-800 capitalize block">
                      {feature.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {flag.envVar}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      flag.enabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AiDashboard;
