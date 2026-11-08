import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Pagination from '../../components/common/Pagination';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Building2,
  Mail,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminAnalysts = () => {
  const [analysts, setAnalysts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchAnalysts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/analysts', {
        params: { status: statusFilter },
      });
      if (res.data.success) {
        setAnalysts(res.data.analysts || []);
      }
    } catch (err) {
      toast.error('Failed to load analysts list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysts();
  }, [statusFilter]);

  const handleStatusChange = async (analystId, newStatus) => {
    try {
      const res = await api.put(`/superadmin/analysts/${analystId}/status`, {
        status: newStatus,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchAnalysts();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update analyst status');
    }
  };

  const filteredAnalysts = analysts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    (a.organisation && a.organisation.toLowerCase().includes(search.toLowerCase()))
  );

  const totalAnalysts = filteredAnalysts.length;
  const totalPages = Math.ceil(totalAnalysts / limit) || 1;
  const paginatedAnalysts = filteredAnalysts.slice((page - 1) * limit, page * limit);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Analyst Account Approvals
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Authorize or reject observer analyst accounts requesting access to cross-college recruitment intelligence.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          {['all', 'pending', 'approved'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search analyst, email, organisation..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Analysts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-3 px-4">Analyst Name</th>
                <th className="py-3 px-4">Contact Email</th>
                <th className="py-3 px-4">Organisation & Title</th>
                <th className="py-3 px-4">Email Status</th>
                <th className="py-3 px-4">Approval Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading analysts...</span>
                  </td>
                </tr>
              ) : filteredAnalysts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No analysts found matching current filters.
                  </td>
                </tr>
              ) : (
                paginatedAnalysts.map((a) => (
                  <tr key={a._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{a.name}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{a.email}</td>
                    <td className="py-3 px-4 text-slate-700">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900">{a.organisation}</span>
                        {a.organisationType && (
                          <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {a.organisationType}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block">{a.designation || 'Analyst'}</span>
                      {a.purpose && (
                        <div className="mt-1.5 p-1.5 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-900 leading-snug">
                          <span className="font-bold text-[9px] uppercase tracking-wider text-amber-700 block">
                            Stated Purpose:
                          </span>
                          "{a.purpose}"
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {a.isEmailVerified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Unverified</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {a.isApproved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          Pending Approval
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!a.isApproved ? (
                          <button
                            onClick={() => handleStatusChange(a._id, 'approved')}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(a._id, 'rejected')}
                            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalAnalysts}
          itemsPerPage={limit}
          onPageChange={(newPage) => setPage(newPage)}
        />
      </div>
    </div>
  );
};

export default SuperadminAnalysts;

