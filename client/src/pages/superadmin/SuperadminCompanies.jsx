import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Building2,
  ExternalLink,
  Search,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminCompanies = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifiedFilter, setVerifiedFilter] = useState('all'); // 'all' | 'true' | 'false'
  const [search, setSearch] = useState('');

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/companies', {
        params: { verified: verifiedFilter === 'all' ? undefined : verifiedFilter },
      });
      if (res.data.success) {
        setCompanies(res.data.companies || []);
      }
    } catch (err) {
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [verifiedFilter]);

  const handleToggleVerification = async (companyId, currentVerified) => {
    try {
      const res = await api.put(`/superadmin/companies/${companyId}/verify`, {
        verified: !currentVerified,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchCompanies();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update company verification');
    }
  };

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry && c.industry.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Employer Verification Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit and verify corporate employers participating in campus hiring drives.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Companies' },
            { id: 'true', label: 'Verified' },
            { id: 'false', label: 'Unverified' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setVerifiedFilter(tab.id)}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                verifiedFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
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
            placeholder="Search company or industry..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Industry</th>
                <th className="py-3 px-4">HR Contact Lead</th>
                <th className="py-3 px-4">Total Drives</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading companies...</span>
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No employers found matching active criteria.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((c) => (
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
                    <td className="py-3 px-4 text-slate-600">{c.industry || 'Technology'}</td>
                    <td className="py-3 px-4 text-slate-700">
                      {c.hrContact?.name ? (
                        <div>
                          <span className="font-semibold block">{c.hrContact.name}</span>
                          <span className="text-[10px] text-slate-400">{c.hrContact.email}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not specified</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium font-mono text-[11px]">
                      {c.drivesCount ?? 0}
                    </td>
                    <td className="py-3 px-4">
                      {c.verified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Verified Employer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          <ShieldAlert className="w-3 h-3 text-amber-600" />
                          <span>Unverified</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleVerification(c._id, c.verified)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          c.verified
                            ? 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {c.verified ? 'Unverify' : 'Verify'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperadminCompanies;

