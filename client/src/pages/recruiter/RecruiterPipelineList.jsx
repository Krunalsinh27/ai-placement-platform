import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  GitBranch,
  Building2,
  Calendar,
  MapPin,
  Clock,
  Search,
  Filter,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

const RecruiterPipelineList = () => {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchDrives = async () => {
    try {
      setLoading(true);
      const res = await api.get('/drives');
      if (res.data.success) {
        setDrives(res.data.drives || []);
      }
    } catch (err) {
      console.error('Failed to load company drives:', err);
      toast.error('Failed to load confirmed drives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrives();
  }, []);

  const filteredDrives = drives.filter((d) => {
    const collegeName = d.college?.name || '';
    const collegeCode = d.college?.code || '';
    const role = d.role || '';
    const matchesSearch =
      collegeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collegeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open' && d.status === 'open' && !d.applicationsClosed) ||
      (statusFilter === 'closed' && (d.status === 'closed' || d.applicationsClosed));

    return matchesSearch && matchesStatus;
  });

  const totalDrives = drives.length;
  const openDrives = drives.filter((d) => d.status === 'open' && !d.applicationsClosed).length;
  const pipelineActiveDrives = drives.filter((d) => d.applicationsClosed || d.status === 'closed').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <GitBranch className="w-7 h-7 text-indigo-600" />
            Recruitment Drive Pipeline
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Access multi-round evaluation pipelines, schedule batches, track attendance, and shortlist candidates.
          </p>
        </div>

        <Link
          to="/recruiter/drive-requests"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs shrink-0 self-start sm:self-auto"
        >
          <span>View Drive Requests</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Confirmed Drives
          </span>
          <div className="text-3xl font-black text-slate-900">{totalDrives}</div>
          <span className="text-xs text-slate-500 mt-1 block">Scheduled on academic calendars</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Accepting Applications
          </span>
          <div className="text-3xl font-black text-emerald-600">{openDrives}</div>
          <span className="text-xs text-slate-500 mt-1 block">Eligible students can still apply</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block mb-1">
            Pipeline Active / Frozen
          </span>
          <div className="text-3xl font-black text-indigo-600">{pipelineActiveDrives}</div>
          <span className="text-xs text-slate-500 mt-1 block">Rounds ready for batching & scoring</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by college, code, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Drives
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'open' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setStatusFilter('closed')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'closed' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Pipeline
            </button>
          </div>
        </div>
      </div>

      {/* Drives List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading company recruitment pipelines...</p>
        </div>
      ) : filteredDrives.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80">
          <GitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-sm">No Confirmed Drives Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'all'
              ? 'No drives matched your filter criteria. Try clearing the search or status filter.'
              : 'Once college TPOs accept and finalize your drive requests, confirmed drives will appear here ready for pipeline management.'}
          </p>
          <div className="mt-4">
            <Link
              to="/recruiter/drive-requests"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs"
            >
              <span>Manage Drive Requests</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDrives.map((d) => {
            const isFrozen = d.applicationsClosed || d.status === 'closed';

            return (
              <div
                key={d._id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: College & Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {d.college?.code || 'COLLEGE'}
                        </span>
                        <h2 className="font-bold text-sm text-slate-900 truncate">
                          {d.college?.name || 'Partner College'}
                        </h2>
                      </div>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {d.college?.city || 'Campus'}, {d.college?.state || ''}
                      </p>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                        isFrozen
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isFrozen ? 'Pipeline Active' : 'Applications Open'}
                    </span>
                  </div>

                  {/* Role Title & Specs */}
                  <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 mb-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-900 text-base">{d.role}</h3>
                      <span className="text-sm font-black text-indigo-600">{d.packageLpa} LPA</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Drive: {d.driveDate ? new Date(d.driveDate).toLocaleDateString() : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Deadline: {d.lastDateToApply ? new Date(d.lastDateToApply).toLocaleDateString() : 'TBD'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mode & Venue Info */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 font-semibold text-slate-700 text-[11px]">
                      {d.mode === 'virtual' ? (
                        <>
                          <Laptop className="w-3.5 h-3.5 text-sky-600" />
                          Virtual
                        </>
                      ) : (
                        <>
                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                          On-Campus
                        </>
                      )}
                    </span>

                    {d.venueOrMeetingLink && (
                      <span className="text-[11px] text-slate-500 truncate max-w-[200px]" title={d.venueOrMeetingLink}>
                        📍 {d.venueOrMeetingLink}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-400">
                    {isFrozen ? 'Candidate list frozen' : 'Open for student enrollment'}
                  </span>

                  <Link
                    to={`/recruiter/drives/${d._id}/pipeline`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-indigo-500/20 transition-all cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Open Pipeline</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecruiterPipelineList;

