import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  FileCheck2,
  Calendar,
  Building2,
  Search,
  ArrowRight,
  Filter,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  ExternalLink,
  Sparkles,
  Check,
  X,
  ChevronRight,
  AlertCircle,
  Video,
  Star,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_BADGES = {
  applied: {
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Applied',
  },
  shortlisted: {
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Shortlisted',
  },
  interview: {
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    label: 'Interview Round',
  },
  selected: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Selected / Placed',
  },
  rejected: {
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'Not Selected',
  },
};

const MyApplications = () => {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [interviewSlots, setInterviewSlots] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const formatISTDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
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

  const formatISTTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const canJoinSlot = (slot) => {
    if (!slot?.meetingLink) return false;
    if (slot.status === 'in_progress') return true;
    if (!slot.startTime) return false;
    const start = new Date(slot.startTime).getTime();
    const now = Date.now();
    return now >= start - 10 * 60 * 1000;
  };

  // Timeline / Stepper Modal
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [respondingOffer, setRespondingOffer] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const [appsRes, slotsRes] = await Promise.allSettled([
        api.get('/applications/my'),
        api.get('/students/my-interview-slots'),
      ]);

      if (appsRes.status === 'fulfilled' && appsRes.value.data.success) {
        setApplications(appsRes.value.data.applications || []);
      }
      if (slotsRes.status === 'fulfilled' && slotsRes.value.data.success) {
        setInterviewSlots(slotsRes.value.data.slots || []);
      }
    } catch (err) {
      console.error('Failed to fetch applications:', err);
      toast.error('Unable to fetch applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  // Open timeline modal and fetch details
  const handleOpenTimeline = async (app) => {
    setSelectedApp(app);
    setTimelineModalOpen(true);
    setTimelineLoading(true);
    try {
      const res = await api.get(`/applications/${app._id}/timeline`);
      if (res.data.success) {
        setTimelineData(res.data);
      }
    } catch (err) {
      console.error('Failed to load application timeline:', err);
      toast.error('Unable to load recruitment pipeline details');
    } finally {
      setTimelineLoading(false);
    }
  };

  // Handle Offer Response within Timeline
  const handleOfferResponse = async (offerId, action) => {
    const promptMsg =
      action === 'accept'
        ? 'Are you sure you want to ACCEPT this employment offer? This will confirm your campus placement!'
        : 'Are you sure you want to DECLINE this employment offer?';

    if (!window.confirm(promptMsg)) return;

    setRespondingOffer(true);
    try {
      const endpoint = action === 'accept' ? `/offers/${offerId}/accept` : `/offers/${offerId}/decline`;
      const res = await api.put(endpoint);
      if (res.data.success) {
        toast.success(res.data.message);
        // Refresh timeline & applications list
        const refreshed = await api.get(`/applications/${selectedApp._id}/timeline`);
        if (refreshed.data.success) setTimelineData(refreshed.data);
        fetchApplications();
      }
    } catch (err) {
      console.error(`Offer ${action} error:`, err);
      toast.error(err.response?.data?.message || `Failed to ${action} offer`);
    } finally {
      setRespondingOffer(false);
    }
  };

  const filteredApplications = applications.filter((app) => {
    const compName = app.drive?.company?.name?.toLowerCase() || '';
    const role = app.drive?.role?.toLowerCase() || '';
    const matchesSearch =
      compName.includes(search.toLowerCase()) || role.includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            My Applications
          </h1>
          <p className="text-sm text-slate-500">
            Track real-time selection rounds, interview schedules, and placement offers.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="applied">Applied</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search application..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            />
          </div>
        </div>
      </div>

      {/* UPCOMING INTERVIEW SLOTS (Task 29B) */}
      {interviewSlots.length > 0 && (
        <div className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Scheduled Interview Slots</h3>
                <p className="text-[11px] text-slate-500">Live queue slots, panel details, and meeting room links</p>
              </div>
            </div>
            <span className="text-xs font-bold text-indigo-600">
              {interviewSlots.length} Scheduled
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interviewSlots.map((slot) => {
              const activeToJoin = canJoinSlot(slot);
              const isSlotInProgress = slot.status === 'in_progress';
              const isCompleted = slot.status === 'completed';
              const isNoShow = slot.status === 'no_show';

              let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
              if (slot.status === 'checked_in') statusBadge = 'bg-amber-100 text-amber-800 border-amber-200';
              else if (isSlotInProgress) statusBadge = 'bg-sky-100 text-sky-800 border-sky-300 animate-pulse';
              else if (isCompleted) statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              else if (isNoShow) statusBadge = 'bg-rose-100 text-rose-800 border-rose-200';

              return (
                <div
                  key={slot._id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    isSlotInProgress
                      ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/50 to-white shadow-md shadow-indigo-500/10'
                      : 'border-slate-200/80 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                          {slot.round?.drive?.company?.name || 'Recruiter'} • {slot.round?.drive?.role}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">{slot.round?.name || 'Interview Round'}</h4>
                      <p className="text-xs text-slate-500">
                        {slot.panel?.name} (Queue #{slot.queueNumber})
                      </p>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusBadge}`}>
                      {slot.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {formatISTDateTime(slot.startTime)} - {formatISTTime(slot.endTime)} IST
                      </span>
                    </div>

                    {slot.panel?.interviewers?.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">Interviewers:</span>{' '}
                        {slot.panel.interviewers.map((iv) => iv.name).join(', ')}
                      </div>
                    )}
                  </div>

                  {slot.meetingLink && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      {activeToJoin ? (
                        <a
                          href={slot.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm shadow-indigo-600/20 transition-all"
                        >
                          <Video className="w-4 h-4" />
                          <span>{isSlotInProgress ? 'Join Interview Room (Called!)' : 'Enter Interview Room'}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <div className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500 font-medium">
                          <span>Join active 10m before start ({formatISTTime(slot.startTime)} IST)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {slot.evaluation && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>Recruiter Evaluation Score</span>
                        </span>
                        <span className="font-black text-indigo-600 text-sm">{slot.evaluation.score}%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] text-center text-slate-600 pt-1">
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Tech: <strong>{slot.evaluation.criteriaScores?.technical}/5</strong>
                        </div>
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Problem: <strong>{slot.evaluation.criteriaScores?.problemSolving}/5</strong>
                        </div>
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Comm: <strong>{slot.evaluation.criteriaScores?.communication}/5</strong>
                        </div>
                      </div>
                      {slot.evaluation.comments && (
                        <p className="text-[11px] text-slate-600 italic pt-1">
                          "{slot.evaluation.comments}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Applications Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-4">
            {search || statusFilter !== 'all'
              ? 'No applications match your filter settings.'
              : 'You have not applied to any campus drives yet.'}
          </p>
          <Link
            to="/student/drives"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <span>Browse Eligible Drives</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Company</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Package</th>
                  <th className="py-3.5 px-4">Applied On</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Recruitment Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApplications.map((app) => {
                  const badge = STATUS_BADGES[app.status] || {
                    bg: 'bg-slate-100 text-slate-700',
                    label: app.status,
                  };

                  return (
                    <tr
                      key={app._id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Company */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                            {app.drive?.company?.name?.charAt(0) || 'C'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {app.drive?.company?.name || 'Company'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {app.drive?.location || 'Campus / Virtual'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-4 font-semibold text-slate-800">
                        {app.drive?.role || 'Engineer'}
                      </td>

                      {/* Package */}
                      <td className="py-4 px-4 font-extrabold text-emerald-600">
                        {app.drive?.packageLpa} LPA
                      </td>

                      {/* Applied On */}
                      <td className="py-4 px-4 text-slate-500">
                        {new Date(app.appliedOn).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Action: Open Stepper Timeline */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <button
                          onClick={() => handleOpenTimeline(app)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>View Pipeline</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECRUITMENT PIPELINE STEPPER MODAL */}
      {timelineModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                  Candidate Selection Timeline
                </span>
                <h3 className="text-lg font-black tracking-tight text-white mt-0.5">
                  {selectedApp?.drive?.company?.name} — {selectedApp?.drive?.role}
                </h3>
                <p className="text-xs text-slate-400">
                  Package: <span className="text-white font-semibold">{selectedApp?.drive?.packageLpa} LPA</span> •
                  Drive Date: {new Date(selectedApp?.drive?.driveDate).toLocaleDateString()}
                </p>
              </div>

              <button
                onClick={() => setTimelineModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body with Stepper */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {timelineLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Fetching recruitment milestones...</span>
                </div>
              ) : (
                <>
                  {/* STEP 0: APPLICATION SUBMISSION */}
                  <div className="relative pl-8 pb-6 border-l-2 border-indigo-600">
                    <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md shadow-indigo-600/30">
                      ✓
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">Application Submitted</span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(timelineData?.application?.appliedOn).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Profile and verified credentials shared with employer for screening.
                      </p>
                    </div>
                  </div>

                  {/* ROUNDS STEPPER */}
                  {timelineData?.rounds && timelineData.rounds.length > 0 ? (
                    timelineData.rounds.map((r, index) => {
                      const isCleared = r.result === 'cleared';
                      const isRejected = r.result === 'rejected';
                      const isPending = r.result === 'pending';
                      const isLast = index === timelineData.rounds.length - 1 && !timelineData.offer;

                      let nodeBg = 'bg-slate-300 text-slate-700';
                      let borderCol = 'border-slate-200';
                      if (isCleared) {
                        nodeBg = 'bg-emerald-600 text-white';
                        borderCol = 'border-emerald-600';
                      } else if (isRejected) {
                        nodeBg = 'bg-rose-600 text-white';
                        borderCol = 'border-rose-400';
                      } else if (r.isEnrolled) {
                        nodeBg = 'bg-sky-600 text-white';
                        borderCol = 'border-sky-500';
                      }

                      return (
                        <div
                          key={r.roundId}
                          className={`relative pl-8 ${isLast ? 'pb-2' : 'pb-6 border-l-2'} ${borderCol}`}
                        >
                          {/* Stepper Node Circle */}
                          <div
                            className={`absolute -left-[11px] top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${nodeBg}`}
                          >
                            {isCleared ? '✓' : isRejected ? '✕' : r.order}
                          </div>

                          {/* Round Details Box */}
                          <div
                            className={`rounded-2xl p-4 border transition-all ${
                              isCleared
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : isRejected
                                ? 'bg-rose-50/40 border-rose-200'
                                : r.isEnrolled
                                ? 'bg-white border-sky-200 shadow-xs'
                                : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Round {r.order} • {r.type.replace('_', ' ')}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900">{r.name}</h4>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    isCleared
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isRejected
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {isCleared ? 'Cleared' : isRejected ? 'Eliminated' : 'Evaluation Pending'}
                                </span>
                              </div>
                            </div>

                            {/* Batch & Venue Info */}
                            {r.isEnrolled ? (
                              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                                {(() => {
                                  const matchingSlot = interviewSlots.find((s) => s.round?._id === r.roundId);
                                  return (
                                    <>
                                      {r.batch ? (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                                            <Clock className="w-3.5 h-3.5 text-sky-600" />
                                            <span>
                                              {r.batch.batchName}:{' '}
                                              {new Date(r.batch.startTime).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}{' '}
                                              -{' '}
                                              {new Date(r.batch.endTime).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                            {r.batch.venueOrLink?.startsWith('http') ? (
                                              <a
                                                href={r.batch.venueOrLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-indigo-600 hover:underline font-semibold inline-flex items-center gap-1"
                                              >
                                                <span>Join Meeting</span>
                                                <ExternalLink className="w-3 h-3" />
                                              </a>
                                            ) : (
                                              <span>{r.batch.venueOrLink || 'To be announced'}</span>
                                            )}
                                          </div>
                                        </div>
                                      ) : matchingSlot ? null : (
                                        <div className="text-amber-700 italic text-[11px]">
                                          Batch scheduling is currently being assigned by the recruiter.
                                        </div>
                                      )}

                                      {r.instructions && (
                                        <p className="text-[11px] text-slate-500 italic pt-1">
                                          Instructions: "{r.instructions}"
                                        </p>
                                      )}

                                      {/* Score & Feedback */}
                                      {(r.score !== null || r.feedback) && (
                                        <div className="mt-2 p-2.5 rounded-xl bg-slate-100/70 text-slate-700 text-xs space-y-0.5">
                                          {r.score !== null && (
                                            <div>
                                              <span className="font-semibold text-slate-500">Score:</span>{' '}
                                              <span className="font-bold">{r.score}</span>
                                            </div>
                                          )}
                                          {r.feedback && (
                                            <div>
                                              <span className="font-semibold text-slate-500">Feedback:</span>{' '}
                                              <span>{r.feedback}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Interview Slot (Task 29B & Task 31A) */}
                                      {matchingSlot && (
                                        <div className="mt-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                                              <Video className="w-3.5 h-3.5 text-indigo-600" />
                                              <span>Interview Slot • Queue #{matchingSlot.queueNumber}</span>
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800">
                                              {matchingSlot.status.replace('_', ' ')}
                                            </span>
                                          </div>

                                          <div className="text-[11px] text-indigo-700 font-medium">
                                            Panel: {matchingSlot.panel?.name} • Time: {formatISTDateTime(matchingSlot.startTime)} - {formatISTTime(matchingSlot.endTime)} IST
                                          </div>

                                          <div>
                                            <Link
                                              to={`/student/interview/${matchingSlot._id}`}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                                            >
                                              <Video className="w-3.5 h-3.5" />
                                              <span>Enter Interview Room</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </Link>
                                          </div>

                                          {matchingSlot.evaluation && (
                                            <div className="pt-2 border-t border-indigo-200/60 text-[11px] text-slate-700 space-y-1">
                                              <div className="flex items-center justify-between">
                                                <span className="font-bold text-indigo-900">
                                                  Evaluation: {matchingSlot.evaluation.score}% • {matchingSlot.evaluation.recommendation?.replace('_', ' ')}
                                                </span>
                                              </div>
                                              {matchingSlot.evaluation.comments && (
                                                <p className="text-[11px] text-slate-600 italic">
                                                  "{matchingSlot.evaluation.comments}"
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="pt-2 text-xs text-slate-400 italic">
                                Candidate did not advance to this round.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="pl-8 text-xs text-slate-400 italic">
                      Recruitment rounds will appear once applications close.
                    </div>
                  )}

                  {/* FINAL STEP: EMPLOYMENT OFFER (if extended) */}
                  {timelineData?.offer && (
                    <div className="relative pl-8">
                      <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md shadow-amber-500/30">
                        ★
                      </div>

                      <div
                        className={`rounded-2xl p-5 border ${
                          timelineData.offer.status === 'accepted'
                            ? 'bg-emerald-50 border-emerald-300'
                            : timelineData.offer.status === 'declined'
                            ? 'bg-slate-100 border-slate-300'
                            : 'bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/60">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block">
                              Final Milestone
                            </span>
                            <h4 className="text-base font-extrabold text-slate-900">
                              Corporate Placement Offer
                            </h4>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                              timelineData.offer.status === 'accepted'
                                ? 'bg-emerald-600 text-white'
                                : timelineData.offer.status === 'declined'
                                ? 'bg-slate-400 text-white'
                                : 'bg-orange-500 text-white animate-pulse'
                            }`}
                          >
                            {timelineData.offer.status}
                          </span>
                        </div>

                        <div className="pt-3 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-slate-400 block font-medium">Designation</span>
                              <span className="font-bold text-slate-800">{timelineData.offer.role}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Annual CTC</span>
                              <span className="font-black text-emerald-600 text-sm">
                                {timelineData.offer.packageLpa} LPA
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-slate-600 pt-1">
                            {timelineData.offer.joiningDate && (
                              <span>
                                Joining Date:{' '}
                                <strong>{new Date(timelineData.offer.joiningDate).toLocaleDateString()}</strong>
                              </span>
                            )}
                            <span>
                              Accept Deadline:{' '}
                              <strong>{new Date(timelineData.offer.expiryDate).toLocaleDateString()}</strong>
                            </span>
                          </div>

                          {/* ACTION BUTTONS IF STATUS IS OFFERED */}
                          {timelineData.offer.status === 'offered' && (
                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-amber-200/60">
                              <button
                                onClick={() => handleOfferResponse(timelineData.offer._id, 'decline')}
                                disabled={respondingOffer}
                                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 transition-colors disabled:opacity-50"
                              >
                                Decline Offer
                              </button>
                              <button
                                onClick={() => handleOfferResponse(timelineData.offer._id, 'accept')}
                                disabled={respondingOffer}
                                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>{respondingOffer ? 'Processing...' : 'Accept & Confirm Placement'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setTimelineModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyApplications;
