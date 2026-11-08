import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Pagination from '../../components/common/Pagination';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminColleges = () => {
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchColleges = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/colleges', {
        params: { status: statusFilter === 'all' ? undefined : statusFilter },
      });
      if (res.data.success) {
        setColleges(res.data.colleges || []);
      }
    } catch (err) {
      toast.error('Failed to load colleges list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, [statusFilter]);

  const handleUpdateStatus = async (collegeId, newStatus) => {
    try {
      const res = await api.put(`/superadmin/colleges/${collegeId}/status`, {
        status: newStatus,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchColleges();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update college status');
    }
  };

  const filteredColleges = colleges.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    c.state.toLowerCase().includes(search.toLowerCase())
  );

  const totalColleges = filteredColleges.length;
  const totalPages = Math.ceil(totalColleges / limit) || 1;
  const paginatedColleges = filteredColleges.slice((page - 1) * limit, page * limit);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Institutional Verification & Approvals
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review and approve registered colleges before they appear in public placement records and TPO portals.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          {['all', 'pending', 'approved', 'rejected'].map((tab) => (
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
            placeholder="Search college, code, city..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Colleges Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-3 px-4">Institution Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Primary TPO Lead</th>
                <th className="py-3 px-4">Verification Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading colleges...</span>
                  </td>
                </tr>
              ) : filteredColleges.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No colleges found in this category.
                  </td>
                </tr>
              ) : (
                paginatedColleges.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div>{c.name}</div>
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                        >
                          <span>{c.website}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] font-semibold">
                      {c.code}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {c.city}, {c.state}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {c.tpo ? (
                        <div>
                          <span className="font-semibold block">{c.tpo.name}</span>
                          <span className="text-[10px] text-slate-400">{c.tpo.email}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No primary TPO</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {c.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Approved</span>
                        </span>
                      ) : c.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pending Review</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>Rejected</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status !== 'approved' && (
                          <button
                            onClick={() => handleUpdateStatus(c._id, 'approved')}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                        )}
                        {c.status !== 'rejected' && (
                          <button
                            onClick={() => handleUpdateStatus(c._id, 'rejected')}
                            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          >
                            Reject
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
          totalItems={totalColleges}
          itemsPerPage={limit}
          onPageChange={(newPage) => setPage(newPage)}
        />
      </div>
    </div>
  );
};

export default SuperadminColleges;

