import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Pagination from '../../components/common/Pagination';
import {
  Users,
  Building2,
  Check,
  X,
  Search,
  Clock,
  AlertTriangle,
  GraduationCap,
  ShieldAlert,
  RotateCw,
  Mail,
  Calendar,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminPendingAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'tpo' | 'student' | 'recruiter'
  const [search, setSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchPendingAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/pending-accounts', {
        params: { role: roleFilter },
      });
      if (res.data.success) {
        setAccounts(res.data.accounts || []);
      }
    } catch (err) {
      toast.error('Failed to load pending accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingAccounts();
  }, [roleFilter]);

  const handleApprove = async (account) => {
    setActionLoadingId(account._id);
    try {
      const res = await api.put(`/superadmin/pending-accounts/${account._id}/approve`);
      if (res.data.success) {
        toast.success(`Approved ${account.name} (${account.role.toUpperCase()}) successfully!`);
        fetchPendingAccounts();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve account');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (account) => {
    if (!window.confirm(`Are you sure you want to reject and remove registration for ${account.name}?`)) {
      return;
    }
    setActionLoadingId(account._id);
    try {
      const res = await api.put(`/superadmin/pending-accounts/${account._id}/reject`);
      if (res.data.success) {
        toast.success(`Rejected and deleted pending registration for ${account.name}`);
        fetchPendingAccounts();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject account');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredAccounts = accounts.filter((a) => {
    const q = search.toLowerCase();
    const nameMatch = a.name?.toLowerCase().includes(q);
    const emailMatch = a.email?.toLowerCase().includes(q);
    const collegeMatch =
      a.college?.name?.toLowerCase().includes(q) ||
      a.college?.code?.toLowerCase().includes(q);
    const enrollmentMatch =
      a.studentProfile?.enrollmentNo?.toLowerCase().includes(q);
    const branchMatch = a.studentProfile?.branch?.toLowerCase().includes(q);
    const companyMatch =
      a.company?.name?.toLowerCase().includes(q) ||
      a.company?.industry?.toLowerCase().includes(q);
    return nameMatch || emailMatch || collegeMatch || enrollmentMatch || branchMatch || companyMatch;
  });

  const totalAccounts = filteredAccounts.length;
  const totalPages = Math.ceil(totalAccounts / limit) || 1;
  const paginatedAccounts = filteredAccounts.slice((page - 1) * limit, page * limit);

  const tpoCount = accounts.filter((a) => a.role === 'tpo').length;
  const studentCount = accounts.filter((a) => a.role === 'student').length;
  const recruiterCount = accounts.filter((a) => a.role === 'recruiter').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Pending Accounts</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
              {accounts.length} Awaiting Approval
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Superadmin centralized override to review and manage pending TPO and Student accounts across all institutions.
          </p>
        </div>

        <button
          onClick={fetchPendingAccounts}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Role Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setRoleFilter('all')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              roleFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setRoleFilter('tpo')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              roleFilter === 'tpo'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending TPOs ({tpoCount})
          </button>
          <button
            onClick={() => setRoleFilter('student')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              roleFilter === 'student'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Students ({studentCount})
          </button>
          <button
            onClick={() => setRoleFilter('recruiter')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              roleFilter === 'recruiter'
                ? 'bg-white text-amber-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Recruiters ({recruiterCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, college, roll no..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <Clock className="w-6 h-6 animate-spin text-slate-400" />
            <span>Loading pending accounts across all colleges...</span>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <Check className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-800 text-sm">
              {search ? 'No matching pending accounts found' : 'All clear! No accounts awaiting approval'}
            </p>
            <p className="text-slate-400 max-w-sm mx-auto">
              {search
                ? 'Try adjusting your search criteria or clear the filter.'
                : 'All TPO and student registration requests have been approved or reviewed.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Institution / Company</th>
                  <th className="py-3 px-4">Registered On</th>
                  <th className="py-3 px-4">Notice / Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAccounts.map((account) => {
                  const isTpo = account.role === 'tpo';
                  const isStudent = account.role === 'student';
                  const isRecruiter = account.role === 'recruiter';
                  const regDate = account.createdAt
                    ? new Date(account.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-';

                  return (
                    <tr
                      key={account._id}
                      className="hover:bg-slate-50/75 transition-colors group"
                    >
                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{account.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{account.email}</span>
                        </div>
                        {isStudent && account.studentProfile && (
                          <div className="text-[10px] text-indigo-600 font-medium mt-1 flex items-center gap-1.5">
                            <span className="font-semibold">Roll: {account.studentProfile.enrollmentNo}</span>
                            <span>•</span>
                            <span>{account.studentProfile.branch} ({account.studentProfile.batchYear})</span>
                          </div>
                        )}
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            isTpo
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : isStudent
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {isTpo ? (
                            <Building2 className="w-3 h-3 text-purple-600" />
                          ) : isStudent ? (
                            <GraduationCap className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <Briefcase className="w-3 h-3 text-amber-600" />
                          )}
                          <span className="uppercase">{account.role}</span>
                        </span>
                      </td>

                      {/* Institution / Company Info */}
                      <td className="py-3 px-4">
                        {isRecruiter ? (
                          <div>
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <span>{account.company?.name || 'Unassigned Company'}</span>
                              {account.company?.verified ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                                  Unverified Company
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              {account.company?.industry && <span>{account.company.industry}</span>}
                              {account.company?.location && <span>• {account.company.location}</span>}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {account.college?.name || 'Unassigned College'}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              {account.college?.code && (
                                <span className="font-mono font-medium text-slate-600 uppercase">
                                  [{account.college.code}]
                                </span>
                              )}
                              {account.college?.city && (
                                <span>{account.college.city}, {account.college.state}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 text-slate-600">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{regDate}</span>
                        </div>
                      </td>

                      {/* Notice / Label (e.g. No active TPO) */}
                      <td className="py-3 px-4">
                        {account.noActiveTpo ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs"
                            title="Zero approved TPOs exist for this college. This candidate was the earliest to register."
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>No active TPO for this college</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>Standard approval</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(account)}
                            disabled={actionLoadingId === account._id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                            title="Approve account immediately"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleReject(account)}
                            disabled={actionLoadingId === account._id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                            title="Reject and delete registration"
                          >
                            <X className="w-3.5 h-3.5 text-rose-600" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalAccounts}
              itemsPerPage={limit}
              onPageChange={(newPage) => setPage(newPage)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperadminPendingAccounts;

