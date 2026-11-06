import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Building2,
  Users,
  Briefcase,
  CheckCircle2,
  TrendingUp,
  ShieldAlert,
  Clock,
  ArrowRight,
  Check,
  X,
  ExternalLink,
  UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/overview');
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      toast.error('Failed to load platform overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleApproveCollege = async (collegeId) => {
    try {
      await api.put(`/superadmin/colleges/${collegeId}/status`, { status: 'approved' });
      toast.success('College approved successfully!');
      fetchOverview();
    } catch (err) {
      toast.error('Failed to approve college');
    }
  };

  const handleApproveAnalyst = async (analystId) => {
    try {
      await api.put(`/superadmin/analysts/${analystId}/status`, { status: 'approved' });
      toast.success('Analyst approved successfully!');
      fetchOverview();
    } catch (err) {
      toast.error('Failed to approve analyst');
    }
  };

  const handleApproveAccount = async (accountId) => {
    try {
      await api.put(`/superadmin/pending-accounts/${accountId}/approve`);
      toast.success('Account approved successfully!');
      fetchOverview();
    } catch (err) {
      toast.error('Failed to approve account');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Platform Superadmin Overview
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Centralized administrative management across colleges, analysts, employers, and system records.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Colleges */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Colleges</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '...' : data?.totals?.colleges?.total ?? 0}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 font-medium">
            <span className="text-emerald-600 font-semibold">{data?.totals?.colleges?.approved ?? 0} approved</span>
            <span>•</span>
            <span className="text-amber-600 font-semibold">{data?.totals?.colleges?.pending ?? 0} pending</span>
          </div>
        </div>

        {/* Students */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Total Students</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '...' : data?.totals?.students ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Active enrolled profiles</span>
        </div>

        {/* Recruiters & Employers */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Employers</span>
            <Briefcase className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '...' : data?.totals?.recruiters?.totalCompanies ?? 0}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 mt-1 block">
            {data?.totals?.recruiters?.verifiedCompanies ?? 0} verified companies
          </span>
        </div>

        {/* Drives */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Recruitment Drives</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '...' : data?.totals?.drives ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Campus drives hosted</span>
        </div>

        {/* Placements */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Accepted Offers</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {loading ? '...' : data?.totals?.placements ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Verified placements</span>
        </div>

        {/* Pending Accounts Override Card */}
        <Link
          to="/superadmin/pending-accounts"
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-amber-300 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="group-hover:text-amber-700 font-semibold">Pending Accounts</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {loading ? '...' : data?.totals?.pendingAccounts ?? 0}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 font-medium">
            <span className="text-purple-600 font-semibold">{data?.pendingCounts?.tpos ?? 0} TPO</span>
            <span>•</span>
            <span className="text-indigo-600 font-semibold">{data?.pendingCounts?.students ?? 0} Student</span>
          </div>
        </Link>
      </div>

      {/* Pending Action Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Colleges */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Pending College Approvals ({data?.totals?.colleges?.pending ?? 0})
              </h2>
            </div>
            <Link
              to="/superadmin/colleges"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-0.5"
            >
              <span>Manage Colleges</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.recentPending?.colleges?.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No colleges currently pending approval.
              </p>
            ) : (
              data?.recentPending?.colleges?.map((c) => (
                <div key={c._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      Code: <strong className="font-mono">{c.code}</strong> • {c.city}, {c.state}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApproveCollege(c._id)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      Approve
                    </button>
                    <Link
                      to="/superadmin/colleges"
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Analysts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Pending Analyst Registrations ({data?.pendingCounts?.analysts ?? 0})
              </h2>
            </div>
            <Link
              to="/superadmin/analysts"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-0.5"
            >
              <span>View All Analysts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.recentPending?.analysts?.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No analyst registrations pending approval.
              </p>
            ) : (
              data?.recentPending?.analysts?.map((a) => (
                <div key={a._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {a.organisation} • {a.designation || 'Analyst'}
                    </p>
                    <span className="text-[10px] text-slate-400">{a.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApproveAnalyst(a._id)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      Approve
                    </button>
                    <Link
                      to="/superadmin/analysts"
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending TPO & Student Accounts Panel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Pending Accounts ({data?.pendingCounts?.accounts ?? 0})
              </h2>
            </div>
            <Link
              to="/superadmin/pending-accounts"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-0.5"
            >
              <span>Manage Accounts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.recentPending?.accounts?.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No TPO or student accounts awaiting approval.
              </p>
            ) : (
              data?.recentPending?.accounts?.map((acc) => (
                <div key={acc._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-800 truncate">{acc.name}</p>
                      <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded-md font-bold ${acc.role === 'tpo' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {acc.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {acc.college?.name || 'Unassigned College'}
                    </p>
                    <span className="text-[10px] text-slate-400">{acc.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApproveAccount(acc._id)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      Approve
                    </button>
                    <Link
                      to="/superadmin/pending-accounts"
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperadminDashboard;

