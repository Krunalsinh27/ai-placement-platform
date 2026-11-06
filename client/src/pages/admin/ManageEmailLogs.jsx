import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Mail,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Send,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

const EMAIL_TYPES = [
  { value: 'all', label: 'All Communication Types' },
  { value: 'drive_published', label: 'Drive Published' },
  { value: 'round_scheduled', label: 'Round Scheduled' },
  { value: 'slot_assigned', label: 'Interview Slot Assigned' },
  { value: 'slot_reminder_24h', label: 'Slot Reminder (24h)' },
  { value: 'slot_reminder_1h', label: 'Slot Reminder (1h)' },
  { value: 'batch_reminder_24h', label: 'Batch Reminder (24h)' },
  { value: 'batch_reminder_1h', label: 'Batch Reminder (1h)' },
  { value: 'called_next', label: 'Called Next' },
  { value: 'result_declared', label: 'Result Declared' },
  { value: 'offer_received', label: 'Offer Received' },
  { value: 'offer_expiring_48h', label: 'Offer Expiring (48h)' },
  { value: 'announcement', label: 'Announcement' },
];

const ManageEmailLogs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ sent: 0, failed: 0, queued: 0 });
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'sent' | 'failed' | 'queued'
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const formatIST = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/emails/logs', { params });
      if (res.data.success) {
        setLogs(res.data.logs || []);
        setStats(res.data.stats || { sent: 0, failed: 0, queued: 0 });
        setTotalPages(res.data.totalPages || 1);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load email logs:', err);
      toast.error(err.response?.data?.message || 'Failed to load email communications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailLogs();
  }, [statusFilter, typeFilter, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchEmailLogs();
  };

  const handleResend = async (logId, recipientEmail) => {
    setResendingId(logId);
    try {
      const res = await api.post(`/emails/logs/${logId}/resend`);
      if (res.data.success) {
        toast.success(res.data.message || `Queued re-delivery for ${recipientEmail}`);
        fetchEmailLogs();
      }
    } catch (err) {
      console.error('Failed to resend email:', err);
      toast.error(err.response?.data?.message || 'Failed to resend email');
    } finally {
      setResendingId(null);
    }
  };

  const totalAll = (stats.sent || 0) + (stats.failed || 0) + (stats.queued || 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Mail className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Delivery Logs</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Audit outbound notifications, interview schedules, reminders, and retry failed transmissions for your college.
          </p>
        </div>

        <button
          onClick={fetchEmailLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Stat Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => {
            setStatusFilter('all');
            setPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-indigo-50 border-indigo-200 shadow-xs ring-1 ring-indigo-500/20'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Volume</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{totalAll}</span>
        </button>

        <button
          onClick={() => {
            setStatusFilter('sent');
            setPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'sent'
              ? 'bg-emerald-50 border-emerald-200 shadow-xs ring-1 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Delivered</span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block">{stats.sent || 0}</span>
        </button>

        <button
          onClick={() => {
            setStatusFilter('failed');
            setPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'failed'
              ? 'bg-rose-50 border-rose-200 shadow-xs ring-1 ring-rose-500/20'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">Failed / Retry</span>
          <span className="text-2xl font-black text-rose-700 mt-1 block">{stats.failed || 0}</span>
        </button>

        <button
          onClick={() => {
            setStatusFilter('queued');
            setPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'queued'
              ? 'bg-amber-50 border-amber-200 shadow-xs ring-1 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">In Queue</span>
          <span className="text-2xl font-black text-amber-700 mt-1 block">{stats.queued || 0}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by recipient email or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {EMAIL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-5">Recipient</th>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Timestamp (IST)</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading delivery records...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No email records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {statusFilter !== 'all' || typeFilter !== 'all' || searchQuery
                        ? 'Try modifying your filters or search query.'
                        : 'Outbound notifications will appear here as drives, rounds, and interviews proceed.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isFailed = log.status === 'failed';
                  const isSent = log.status === 'sent';
                  const isQueued = log.status === 'queued';

                  return (
                    <tr key={log._id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Recipient */}
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-slate-900">{log.recipientEmail}</div>
                        {log.recipientName && (
                          <div className="text-[11px] text-slate-500">{log.recipientName}</div>
                        )}
                      </td>

                      {/* Subject */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 truncate" title={log.subject}>
                          {log.subject}
                        </div>
                        {log.error && (
                          <div
                            className="text-[11px] text-rose-600 mt-0.5 truncate"
                            title={log.error}
                          >
                            Err: {log.error}
                          </div>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px] tracking-wide uppercase">
                          {log.type.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSent && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Sent</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Failed ({log.attempts || 1}/3)</span>
                          </span>
                        )}
                        {isQueued && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Queued</span>
                          </span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {formatIST(log.sentAt || log.createdAt)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {isFailed ? (
                          <button
                            onClick={() => handleResend(log._id, log.recipientEmail)}
                            disabled={resendingId === log._id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer text-xs"
                            title="Retry sending this email immediately"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${resendingId === log._id ? 'animate-spin' : ''}`}
                            />
                            <span>{resendingId === log._id ? 'Retrying...' : 'Resend Failed'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total logs)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageEmailLogs;

