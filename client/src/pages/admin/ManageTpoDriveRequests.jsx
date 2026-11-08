import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Modal from '../../components/common/Modal';
import {
  CalendarCheck,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
  Ban,
  ArrowRight,
  Plus,
  Trash2,
  Search,
  Filter,
  Check,
  Send,
  Laptop,
  GraduationCap,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  FileCheck2,
  MapPin,
  Link as LinkIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { toISTInputValue, formatISTDate } from '../../utils/dateTime';

const ManageTpoDriveRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active top-level view: 'requests' | 'schedule_form'
  const [activeTab, setActiveTab] = useState('requests');

  // Filter state for incoming requests
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Respond Modal State (Accept / Reject / Propose Reschedule)
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isRespondModalOpen, setIsRespondModalOpen] = useState(false);
  const [actionType, setActionType] = useState('accept'); // 'accept' | 'propose_reschedule' | 'reject'
  const [selectedAcceptDate, setSelectedAcceptDate] = useState('');
  const [tpoProposedDates, setTpoProposedDates] = useState(['']);
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);

  // Detail / Timeline / Chat Modal State
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // SCHEDULE DRIVE FORM STATE
  const [scheduleRequestId, setScheduleRequestId] = useState('');
  const [scheduleDriveDate, setScheduleDriveDate] = useState('');
  const [scheduleVenueOrLink, setScheduleVenueOrLink] = useState('');
  const [scheduleLastDate, setScheduleLastDate] = useState('');
  const [scheduleMinCgpa, setScheduleMinCgpa] = useState('');
  const [scheduleMaxBacklogs, setScheduleMaxBacklogs] = useState('');
  const [scheduleBranches, setScheduleBranches] = useState([]);
  const [scheduleNote, setScheduleNote] = useState('');
  const [submittingFinalize, setSubmittingFinalize] = useState(false);
  const [cgpaError, setCgpaError] = useState('');
  const [backlogsError, setBacklogsError] = useState('');

  const fetchIncomingRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/drive-requests');
      if (res.data.success) {
        setRequests(res.data.requests || []);
      }
    } catch (err) {
      console.error('Failed to load incoming drive requests:', err);
      toast.error('Failed to load drive requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomingRequests();
  }, []);

  // Filtered requests list
  const filteredRequests = requests.filter((r) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'scheduled'
        ? ['accepted', 'scheduled'].includes(r.status)
        : r.status === statusFilter);

    const matchesSearch =
      r.company?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.jobRequirement?.title?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  // KPI counts
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const rescheduleCount = requests.filter((r) => r.status === 'reschedule_proposed').length;
  const scheduledCount = requests.filter((r) => ['accepted', 'scheduled'].includes(r.status)).length;
  const totalCount = requests.length;

  // Currently active request selected in Schedule Drive Form
  const activeScheduleRequest = requests.find((r) => r._id === scheduleRequestId);

  // When activeScheduleRequest changes, initialize form defaults from company requirement
  useEffect(() => {
    if (activeScheduleRequest) {
      const jobReq = activeScheduleRequest.jobRequirement || {};
      const confirmedOrFirstDate =
        activeScheduleRequest.confirmedDate ||
        activeScheduleRequest.proposedDates?.[0] ||
        '';

      if (confirmedOrFirstDate) {
        setScheduleDriveDate(toISTInputValue(confirmedOrFirstDate, { dateOnly: true }));
        // Default deadline: 2 days before drive date
        const defaultDeadline = new Date(
          new Date(confirmedOrFirstDate).getTime() - 2 * 24 * 60 * 60 * 1000
        );
        setScheduleLastDate(toISTInputValue(defaultDeadline, { dateOnly: true }));
      } else {
        setScheduleDriveDate('');
        setScheduleLastDate('');
      }

      setScheduleVenueOrLink(
        activeScheduleRequest.mode === 'virtual'
          ? 'https://meet.google.com/xyz-placement-drive'
          : 'Campus Auditorium, Tech Block'
      );
      setScheduleMinCgpa(jobReq.minCgpa !== undefined ? jobReq.minCgpa : '0');
      setScheduleMaxBacklogs(jobReq.maxBacklogs !== undefined ? jobReq.maxBacklogs : '0');
      setScheduleBranches(jobReq.allowedBranches || ['CSE', 'IT']);
      setScheduleNote('');
      setCgpaError('');
      setBacklogsError('');
    }
  }, [scheduleRequestId]);

  // Live validate stricter eligibility
  const handleCgpaChange = (val) => {
    setScheduleMinCgpa(val);
    if (!activeScheduleRequest) return;
    const companyMin = activeScheduleRequest.jobRequirement?.minCgpa || 0;
    if (val !== '' && Number(val) < companyMin) {
      setCgpaError(`Cannot be weaker than company requirement (${companyMin}). College cutoff can only be ≥ ${companyMin}.`);
    } else {
      setCgpaError('');
    }
  };

  const handleBacklogsChange = (val) => {
    setScheduleMaxBacklogs(val);
    if (!activeScheduleRequest) return;
    const companyMax = activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0;
    if (val !== '' && Number(val) > companyMax) {
      setBacklogsError(`Cannot be weaker than company requirement (${companyMax}). College backlogs limit can only be ≤ ${companyMax}.`);
    } else {
      setBacklogsError('');
    }
  };

  const toggleBranch = (branch) => {
    if (!activeScheduleRequest) return;
    const companyBranches = activeScheduleRequest.jobRequirement?.allowedBranches || [];
    if (!companyBranches.includes(branch)) {
      toast.error(`Company did not approve branch ${branch}`);
      return;
    }
    setScheduleBranches((prev) =>
      prev.includes(branch) ? prev.filter((b) => b !== branch) : [...prev, branch]
    );
  };

  // Submit Schedule & Finalize Drive
  const handleFinalizeDrive = async (e) => {
    e.preventDefault();

    if (!activeScheduleRequest) {
      toast.error('Please select a drive request to schedule');
      return;
    }
    if (!scheduleDriveDate) {
      toast.error('Please specify the final drive date');
      return;
    }
    if (!scheduleVenueOrLink.trim()) {
      toast.error('Please specify the venue or virtual meeting link');
      return;
    }
    if (!scheduleLastDate) {
      toast.error('Please specify the application deadline');
      return;
    }
    if (new Date(scheduleLastDate) > new Date(scheduleDriveDate)) {
      toast.error('Last date to apply cannot be after the final drive date');
      return;
    }

    const companyMinCgpa = activeScheduleRequest.jobRequirement?.minCgpa || 0;
    if (scheduleMinCgpa !== '' && Number(scheduleMinCgpa) < companyMinCgpa) {
      toast.error(`Eligibility error: Minimum CGPA cannot be lower than company requirement of ${companyMinCgpa}`);
      return;
    }

    const companyMaxBacklogs = activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0;
    if (scheduleMaxBacklogs !== '' && Number(scheduleMaxBacklogs) > companyMaxBacklogs) {
      toast.error(`Eligibility error: Maximum allowed backlogs cannot exceed company limit of ${companyMaxBacklogs}`);
      return;
    }

    if (scheduleBranches.length === 0) {
      toast.error('Must allow at least one branch');
      return;
    }

    try {
      setSubmittingFinalize(true);
      const res = await api.put(`/drive-requests/${activeScheduleRequest._id}/finalize`, {
        finalDriveDate: scheduleDriveDate,
        venueOrMeetingLink: scheduleVenueOrLink.trim(),
        lastDateToApply: scheduleLastDate,
        minCgpa: Number(scheduleMinCgpa),
        maxBacklogs: Number(scheduleMaxBacklogs),
        allowedBranches: scheduleBranches,
        note: scheduleNote.trim(),
      });

      if (res.data.success) {
        toast.success(
          `Drive finalized! Published for eligible students from your college.`
        );
        fetchIncomingRequests();
        setActiveTab('requests');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to finalize drive');
    } finally {
      setSubmittingFinalize(false);
    }
  };

  // Open Respond Modal
  const openRespondModal = (req, defaultAction = 'accept') => {
    setSelectedRequest(req);
    setActionType(defaultAction);
    if (req.proposedDates && req.proposedDates.length > 0) {
      setSelectedAcceptDate(req.proposedDates[0]);
    }
    setTpoProposedDates(['']);
    setRescheduleNote('');
    setRejectionReason('');
    setResponseMessage('');
    setIsRespondModalOpen(true);
  };

  // Switch to Schedule Form for a specific request
  const openScheduleFormForRequest = (req) => {
    setScheduleRequestId(req._id);
    setActiveTab('schedule_form');
  };

  // Submit standard response (Accept / Reschedule / Reject)
  const handleSubmitResponse = async (e) => {
    e.preventDefault();
    if (!selectedRequest) return;

    const payload = { action: actionType };

    if (actionType === 'accept') {
      if (!selectedAcceptDate) {
        toast.error('Please select a confirmed drive date');
        return;
      }
      payload.selectedDate = selectedAcceptDate;
      payload.note = responseMessage || `TPO accepted drive schedule`;
    } else if (actionType === 'propose_reschedule') {
      const validDates = tpoProposedDates.filter((d) => d && d.trim() !== '');
      if (validDates.length === 0) {
        toast.error('Please specify at least one proposed alternative date');
        return;
      }
      payload.proposedDates = validDates;
      payload.note = rescheduleNote || 'TPO proposed alternative drive dates';
    } else if (actionType === 'reject') {
      if (!rejectionReason.trim()) {
        toast.error('Please state a reason for declining this drive request');
        return;
      }
      payload.rejectionReason = rejectionReason.trim();
    }

    if (responseMessage.trim()) {
      payload.message = responseMessage.trim();
    }

    try {
      setSubmittingResponse(true);
      const res = await api.put(`/drive-requests/${selectedRequest._id}/respond`, payload);

      if (res.data.success) {
        toast.success(
          actionType === 'accept'
            ? 'Drive accepted! You can now finalize venue and publish it to students.'
            : actionType === 'propose_reschedule'
            ? 'Reschedule proposal sent to the company recruiter.'
            : 'Drive request declined.'
        );
        setIsRespondModalOpen(false);
        fetchIncomingRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit response');
    } finally {
      setSubmittingResponse(false);
    }
  };

  // Collaborative message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !selectedRequest) return;

    try {
      setSendingMessage(true);
      const res = await api.post(`/drive-requests/${selectedRequest._id}/messages`, {
        text: chatMessage.trim(),
      });

      if (res.data.success) {
        setSelectedRequest((prev) => ({
          ...prev,
          messages: res.data.messages,
        }));
        setChatMessage('');
        fetchIncomingRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Needs Review</span>
          </span>
        );
      case 'reschedule_proposed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Reschedule Awaiting Recruiter</span>
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
            <span>Accepted • Ready to Finalize</span>
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Published & Open for Students</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Declined</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            <span>Cancelled by Recruiter</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 mb-2">
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>TPO Campus Recruitment Control</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Drive Requests & Scheduling
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Accept proposals from corporate partners, negotiate dates, set venue and stricter eligibility cutoffs, and publish live placement drives to your students.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shrink-0">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-white hover:text-sky-300'
            }`}
          >
            Incoming Requests ({requests.length})
          </button>
          <button
            onClick={() => {
              // Pre-select first eligible request if none chosen
              if (!scheduleRequestId && requests.length > 0) {
                const schedulable = requests.find((r) => ['pending', 'accepted'].includes(r.status));
                if (schedulable) setScheduleRequestId(schedulable._id);
                else setScheduleRequestId(requests[0]._id);
              }
              setActiveTab('schedule_form');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'schedule_form'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-white hover:text-sky-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Schedule Drive Form</span>
          </button>
        </div>
      </div>

      {activeTab === 'requests' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Proposals
                </span>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                  <CalendarCheck className="w-4 h-4" />
                </div>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-slate-900">{totalCount}</span>
              <span className="text-[11px] text-slate-500 block mt-1">Corporate proposals</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Needs Review
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-amber-600">{pendingCount}</span>
              <span className="text-[11px] text-slate-500 block mt-1">Awaiting TPO action</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Negotiating
                </span>
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-sky-600">{rescheduleCount}</span>
              <span className="text-[11px] text-slate-500 block mt-1">Reschedule proposed</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Published Drives
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-emerald-600">
                {scheduledCount}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">Open for students</span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Status Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                {[
                  { id: 'all', label: 'All Requests', count: requests.length },
                  { id: 'pending', label: 'Needs Review', count: pendingCount },
                  { id: 'reschedule_proposed', label: 'Reschedule', count: rescheduleCount },
                  { id: 'scheduled', label: 'Published & Open', count: scheduledCount },
                  {
                    id: 'rejected',
                    label: 'Declined',
                    count: requests.filter((r) => r.status === 'rejected').length,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                        statusFilter === tab.id
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by company or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Requests List */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-slate-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl bg-white border border-dashed border-slate-200 shadow-xs">
              <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">No drive requests found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try modifying your search or status filters.'
                  : 'Incoming campus recruitment requests from companies will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((req) => (
                <div
                  key={req._id}
                  className={`bg-white rounded-2xl border p-5 sm:p-6 transition-all hover:shadow-md ${
                    req.status === 'pending'
                      ? 'border-amber-300 ring-2 ring-amber-500/10'
                      : req.status === 'scheduled'
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : 'border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      {req.company?.logoUrl ? (
                        <img
                          src={req.company.logoUrl}
                          alt={req.company?.name}
                          className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1 border border-slate-200 shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                          <Building2 className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-slate-900">
                            {req.company?.name}
                          </h2>
                          {getStatusBadge(req.status)}
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{req.company?.industry || 'Technology'}</span>
                          <span>•</span>
                          <span className="capitalize font-medium text-slate-700 flex items-center gap-1">
                            {req.mode === 'virtual' ? (
                              <>
                                <Laptop className="w-3.5 h-3.5 text-sky-600" />
                                Virtual Drive
                              </>
                            ) : (
                              <>
                                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                On-Campus Drive
                              </>
                            )}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Explicit Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                      {/* SCHEDULE DRIVE FORM BUTTON */}
                      {!['rejected', 'cancelled'].includes(req.status) && (
                        <button
                          onClick={() => openScheduleFormForRequest(req)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {req.status === 'scheduled' ? 'Edit Drive Schedule' : 'Schedule Drive'}
                          </span>
                        </button>
                      )}

                      {/* ACCEPT BUTTON */}
                      {['pending', 'reschedule_proposed'].includes(req.status) && (
                        <button
                          onClick={() => openRespondModal(req, 'accept')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                      )}

                      {/* RESCHEDULE BUTTON */}
                      {['pending', 'accepted'].includes(req.status) && (
                        <button
                          onClick={() => openRespondModal(req, 'propose_reschedule')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Reschedule</span>
                        </button>
                      )}

                      {/* REJECT BUTTON */}
                      {['pending', 'reschedule_proposed'].includes(req.status) && (
                        <button
                          onClick={() => openRespondModal(req, 'reject')}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-all cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      )}

                      {/* CHAT / TIMELINE BUTTON */}
                      <button
                        onClick={() => {
                          setSelectedRequest(req);
                          setIsDetailModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                        <span>Chat ({req.messages?.length || 0})</span>
                      </button>
                    </div>
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
                    {/* Role Details */}
                    <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                        Designation & Package
                      </span>
                      <p className="font-bold text-slate-800 text-sm">
                        {req.jobRequirement?.title}
                      </p>
                      <p className="text-indigo-600 font-extrabold mt-0.5">
                        {req.jobRequirement?.packageLpa} LPA • {req.jobRequirement?.openings} Openings (Batch {req.jobRequirement?.batchYear})
                      </p>
                    </div>

                    {/* Recruiter Proposed Dates */}
                    <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                        Recruiter Proposed Dates
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {req.proposedDates?.map((d, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 font-semibold text-slate-700 text-[11px]"
                          >
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(d).toLocaleDateString()}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Status-specific highlight */}
                    <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      {req.status === 'scheduled' ? (
                        <div>
                          <span className="text-[11px] font-bold text-emerald-600 block uppercase tracking-wider mb-1">
                            Live Drive Confirmed
                          </span>
                          <p className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            {new Date(req.confirmedDate).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      ) : req.status === 'reschedule_proposed' ? (
                        <div>
                          <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wider mb-1">
                            Your Proposed Alternate Dates
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {req.tpoProposedDates?.map((d, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 font-bold text-indigo-700 text-[11px]"
                              >
                                <Calendar className="w-3 h-3 text-indigo-500" />
                                {new Date(d).toLocaleDateString()}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : req.rejectionReason ? (
                        <div>
                          <span className="text-[11px] font-bold text-red-600 block uppercase tracking-wider mb-1">
                            Reason for Declining
                          </span>
                          <p className="text-slate-700 italic">"{req.rejectionReason}"</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                            Eligibility Cutoff
                          </span>
                          <p className="text-slate-700 font-medium">
                            {req.jobRequirement?.allowedBranches?.join(', ') || 'All Branches'} (CGPA ≥ {req.jobRequirement?.minCgpa || 0})
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ========================================================
           SCHEDULE DRIVE & FINALIZE FORM VIEW
           ======================================================== */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-600" />
                <span>Schedule & Finalize Placement Drive</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Lock drive logistical details, apply optional stricter college cutoffs, and publish to your college's students.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50 text-slate-600 cursor-pointer"
            >
              Back to Requests List
            </button>
          </div>

          <form onSubmit={handleFinalizeDrive} className="space-y-6 text-xs">
            {/* 1. Request Selector */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Select Drive Request to Schedule *
              </label>
              <select
                value={scheduleRequestId}
                onChange={(e) => setScheduleRequestId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              >
                <option value="">-- Choose a drive request --</option>
                {requests
                  .filter((r) => !['rejected', 'cancelled'].includes(r.status))
                  .map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.company?.name} — {r.jobRequirement?.title} ({r.jobRequirement?.packageLpa} LPA, Batch {r.jobRequirement?.batchYear}) [{r.status.toUpperCase()}]
                    </option>
                  ))}
              </select>
            </div>

            {activeScheduleRequest && (
              <>
                {/* Company Specs Summary Card */}
                <div className="bg-gradient-to-r from-slate-50 to-indigo-50/30 p-4 sm:p-5 rounded-2xl border border-indigo-100/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-sm">
                      {activeScheduleRequest.company?.name} • {activeScheduleRequest.jobRequirement?.title}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 capitalize">
                      {activeScheduleRequest.mode} Mode
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Package</span>
                      <strong className="text-indigo-600 font-black">{activeScheduleRequest.jobRequirement?.packageLpa} LPA</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Company CGPA Cutoff</span>
                      <strong className="text-slate-800">≥ {activeScheduleRequest.jobRequirement?.minCgpa || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Company Max Backlogs</span>
                      <strong className="text-slate-800">≤ {activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Approved Branches</span>
                      <strong className="text-slate-800">{activeScheduleRequest.jobRequirement?.allowedBranches?.join(', ')}</strong>
                    </div>
                  </div>
                </div>

                {/* 2. Logistical Fields Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Final Drive Date */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Final Drive Date *
                    </label>
                    <input
                      type="date"
                      value={scheduleDriveDate}
                      min={toISTInputValue(new Date(), { dateOnly: true })}
                      onChange={(e) => setScheduleDriveDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Date when assessments / interviews will be conducted.
                    </p>
                  </div>

                  {/* Last Date to Apply */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Last Date to Apply (Registration Deadline) *
                    </label>
                    <input
                      type="date"
                      value={scheduleLastDate}
                      min={toISTInputValue(new Date(), { dateOnly: true })}
                      max={scheduleDriveDate || undefined}
                      onChange={(e) => setScheduleLastDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Drive automatically closes to student applications after this date.
                    </p>
                  </div>

                  {/* Venue or Meeting Link */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Venue or Virtual Meeting Link *</span>
                    </label>
                    <input
                      type="text"
                      value={scheduleVenueOrLink}
                      onChange={(e) => setScheduleVenueOrLink(e.target.value)}
                      placeholder={
                        activeScheduleRequest.mode === 'virtual'
                          ? 'e.g. https://meet.google.com/xyz-placement-drive'
                          : 'e.g. Main Auditorium / CSE Seminar Hall, Ground Floor'
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* 3. OPTIONAL STRICTER ELIGIBILITY SECTION */}
                <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 bg-amber-50/30 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <div>
                      <h3 className="font-bold text-slate-800 text-xs">
                        Optional Stricter College Eligibility Criteria
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        You may increase college cutoff standards, but you <strong>cannot make them weaker</strong> than the company's requirement.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Minimum CGPA */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Minimum CGPA Cutoff (≥ {activeScheduleRequest.jobRequirement?.minCgpa || 0})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={activeScheduleRequest.jobRequirement?.minCgpa || 0}
                        max="10"
                        value={scheduleMinCgpa}
                        onChange={(e) => handleCgpaChange(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                          cgpaError
                            ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-500'
                            : 'border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                      {cgpaError ? (
                        <p className="text-[10px] text-red-600 font-bold mt-1">{cgpaError}</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Company cutoff is {activeScheduleRequest.jobRequirement?.minCgpa || 0}.
                        </p>
                      )}
                    </div>

                    {/* Maximum Backlogs */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Maximum Allowed Backlogs (≤ {activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0}
                        value={scheduleMaxBacklogs}
                        onChange={(e) => handleBacklogsChange(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                          backlogsError
                            ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-500'
                            : 'border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                      {backlogsError ? (
                        <p className="text-[10px] text-red-600 font-bold mt-1">{backlogsError}</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Company allows maximum {activeScheduleRequest.jobRequirement?.maxBacklogs ?? 0} backlog(s).
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Allowed Branches */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Allowed College Branches (Subset of Company Approved: {activeScheduleRequest.jobRequirement?.allowedBranches?.join(', ')})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'].map((b) => {
                        const isApprovedByCompany =
                          activeScheduleRequest.jobRequirement?.allowedBranches?.includes(b);
                        const isSelected = scheduleBranches.includes(b);

                        return (
                          <button
                            key={b}
                            type="button"
                            disabled={!isApprovedByCompany}
                            onClick={() => toggleBranch(b)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : isApprovedByCompany
                                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-100 text-slate-300 border border-slate-200 line-through'
                            }`}
                          >
                            <span>{b}</span>
                            {isSelected && <Check className="w-3 h-3" />}
                            {!isApprovedByCompany && (
                              <span className="text-[9px] not-italic text-slate-400 font-normal">
                                (Not approved)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 4. Notes / Announcement */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Announcement Notes for Students / Recruiter (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={scheduleNote}
                    onChange={(e) => setScheduleNote(e.target.value)}
                    placeholder="e.g. Students must carry college ID card, 2 copies of resume, and laptop for coding round."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Submit button */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('requests')}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingFinalize || !!cgpaError || !!backlogsError}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/25 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{submittingFinalize ? 'Publishing Drive...' : 'Finalize & Publish Drive'}</span>
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* RESPOND MODAL (ACCEPT / RESCHEDULE / DECLINE) */}
      <Modal
        isOpen={isRespondModalOpen}
        onClose={() => setIsRespondModalOpen(false)}
        title={selectedRequest ? `Respond to ${selectedRequest.company?.name}` : 'Respond to Drive Request'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitResponse} className="space-y-5 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-2">
              Select Response Action *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setActionType('accept')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  actionType === 'accept'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Accept Drive</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('propose_reschedule')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  actionType === 'propose_reschedule'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Propose Reschedule</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('reject')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  actionType === 'reject'
                    ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <XCircle className="w-4 h-4 text-red-600" />
                <span>Decline Drive</span>
              </button>
            </div>
          </div>

          {actionType === 'accept' && (
            <div className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
              <label className="block text-slate-700 font-bold">
                Confirm Placement Drive Date *
              </label>
              <div className="space-y-2">
                {selectedRequest?.proposedDates?.map((d, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedAcceptDate === d
                        ? 'border-emerald-600 bg-white font-bold text-emerald-900 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="acceptDate"
                      checked={selectedAcceptDate === d}
                      onChange={() => setSelectedAcceptDate(d)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      {new Date(d).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {actionType === 'propose_reschedule' && (
            <div className="space-y-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <div className="flex items-center justify-between">
                <label className="block text-slate-700 font-bold">
                  Propose Alternative Dates *
                </label>
                <button
                  type="button"
                  onClick={() => setTpoProposedDates([...tpoProposedDates, ''])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add another date</span>
                </button>
              </div>

              <div className="space-y-2">
                {tpoProposedDates.map((dateVal, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateVal}
                      min={toISTInputValue(new Date(), { dateOnly: true })}
                      onChange={(e) => {
                        const updated = [...tpoProposedDates];
                        updated[index] = e.target.value;
                        setTpoProposedDates(updated);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                    {tpoProposedDates.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setTpoProposedDates(tpoProposedDates.filter((_, i) => i !== index))
                        }
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Reason for Rescheduling
                </label>
                <input
                  type="text"
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  placeholder="e.g. Semester examinations or lab tests ongoing..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {actionType === 'reject' && (
            <div className="space-y-3 bg-red-50/50 p-4 rounded-xl border border-red-100">
              <label className="block text-slate-700 font-bold">
                Reason for Declining Drive *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State why this drive cannot be accommodated (e.g. Academic calendar full, etc.)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Note to Recruiter (Optional)
            </label>
            <input
              type="text"
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              placeholder="e.g. Looking forward to welcoming your team on campus."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRespondModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingResponse}
              className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 text-white ${
                actionType === 'accept'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : actionType === 'propose_reschedule'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>
                {submittingResponse
                  ? 'Submitting...'
                  : actionType === 'accept'
                  ? 'Accept Drive'
                  : actionType === 'propose_reschedule'
                  ? 'Send Reschedule Proposal'
                  : 'Confirm Decline'}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* DETAIL / TIMELINE / CHAT MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedRequest ? `Drive Request: ${selectedRequest.company?.name}` : 'Request Details'}
        maxWidth="max-w-4xl"
      >
        {selectedRequest && (
          <div className="space-y-6 text-xs">
            {/* Top Summary Banner */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="font-black text-slate-900 text-sm">
                  {selectedRequest.company?.name} — {selectedRequest.jobRequirement?.title}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  Package: <strong className="text-indigo-600">{selectedRequest.jobRequirement?.packageLpa} LPA</strong> •
                  Batch: {selectedRequest.jobRequirement?.batchYear} •
                  Openings: {selectedRequest.jobRequirement?.openings} •
                  Mode: <strong className="capitalize">{selectedRequest.mode}</strong>
                </p>
              </div>
              <div>{getStatusBadge(selectedRequest.status)}</div>
            </div>

            {/* Grid: Timeline on Left, Chat on Right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Status Timeline */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>Workflow Status Timeline</span>
                </h4>

                <div className="relative pl-6 border-l-2 border-indigo-100 space-y-4 py-1">
                  {(selectedRequest.statusTimeline || selectedRequest.timeline || []).map(
                    (step, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-indigo-600 ring-4 ring-indigo-50 flex items-center justify-center text-white text-[9px]">
                          ✓
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-xs">
                              {step.label || step.status}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                step.updatedByRole === 'recruiter'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {step.updatedByRole}
                            </span>
                          </div>

                          {step.note && (
                            <p className="text-slate-600 text-xs mt-1 bg-white p-2 rounded-lg border border-slate-100">
                              {step.note}
                            </p>
                          )}

                          <span className="text-[10px] text-slate-400 block mt-1">
                            {new Date(step.date).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Right Column: Discussion / Chat Thread */}
              <div className="flex flex-col h-[380px] bg-slate-50/70 rounded-2xl border border-slate-200/80 p-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5 pb-2 border-b border-slate-200">
                  <MessageSquare className="w-4 h-4 text-sky-600" />
                  <span>Discussion with Company Recruiter</span>
                </h4>

                {/* Messages scroll box */}
                <div className="flex-1 overflow-y-auto space-y-2.5 p-1">
                  {!selectedRequest.messages || selectedRequest.messages.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-1 opacity-50" />
                      <p>No messages yet. Send a note to the company recruiter.</p>
                    </div>
                  ) : (
                    selectedRequest.messages.map((m, idx) => {
                      const isMe = ['tpo', 'admin', 'superadmin'].includes(m.senderRole);
                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-700">
                              {m.senderName || (isMe ? 'You (TPO)' : 'Company Recruiter')}
                            </span>
                            <span>• {new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                              isMe
                                ? 'bg-indigo-600 text-white rounded-br-none shadow-xs'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Message input */}
                <form onSubmit={handleSendMessage} className="pt-2 flex items-center gap-2 border-t border-slate-200">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Type a message to the company recruiter..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !chatMessage.trim()}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageTpoDriveRequests;
