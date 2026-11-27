import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Modal from '../../components/common/Modal';
import {
  CalendarCheck,
  Send,
  Building2,
  Briefcase,
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
  Globe,
  MapPin,
  Laptop,
  GitBranch,
  Layers,
  Users,
  Award,
  Archive,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { toISTInputValue } from '../../utils/dateTime';

const ManageDriveRequests = () => {
  const [requests, setRequests] = useState([]);
  const [groupedRequirements, setGroupedRequirements] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  // Section switcher: 'active' | 'previous'
  const [section, setSection] = useState('active');

  // View mode: 'job_wise' | 'list'
  const [viewMode, setViewMode] = useState('job_wise');

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Send Request Modal State
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState('');
  const [selectedColleges, setSelectedColleges] = useState([]);
  const [driveMode, setDriveMode] = useState('on-campus');
  const [proposedDates, setProposedDates] = useState(['']);
  const [initialMessage, setInitialMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Detail / Timeline / Chat Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Confirm Schedule Modal State (Recruiter confirmation)
  const [isConfirmScheduleOpen, setIsConfirmScheduleOpen] = useState(false);
  const [selectedConfirmDate, setSelectedConfirmDate] = useState('');
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);

  // Accept Reschedule Modal State (TPO proposed dates)
  const [isAcceptRescheduleOpen, setIsAcceptRescheduleOpen] = useState(false);
  const [selectedTpoDate, setSelectedTpoDate] = useState('');
  const [acceptingReschedule, setAcceptingReschedule] = useState(false);

  // Cancel Request State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchData = async (targetSection = section) => {
    try {
      setLoading(true);
      const [reqsRes, jobsRes, colRes] = await Promise.allSettled([
        api.get(`/drive-requests?section=${targetSection}`),
        api.get('/job-requirements'),
        api.get('/colleges'),
      ]);

      if (reqsRes.status === 'fulfilled' && reqsRes.value.data.success) {
        setRequests(reqsRes.value.data.requests || []);
        setGroupedRequirements(reqsRes.value.data.groupedRequirements || []);
        setSummary(reqsRes.value.data.summary || {});
      }
      if (jobsRes.status === 'fulfilled' && jobsRes.value.data.success) {
        const publishedOnly = (jobsRes.value.data.requirements || []).filter(
          (j) => j.status === 'published'
        );
        setRequirements(publishedOnly);
      }
      if (colRes.status === 'fulfilled' && colRes.value.data.success) {
        setColleges(colRes.value.data.colleges || []);
      }
    } catch (err) {
      console.error('Failed to load drive requests data:', err);
      toast.error('Failed to load drive requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(section);
  }, [section]);

  // Filter requests for list view
  const filteredRequests = requests.filter((r) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'scheduled'
        ? ['accepted', 'recruiter_confirmed', 'scheduled'].includes(r.status)
        : r.status === statusFilter);

    const matchesSearch =
      r.college?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.college?.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.jobRequirement?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.jobRequirementSnapshot?.title?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  // Filter grouped requirements for job-wise view
  const filteredGrouped = groupedRequirements
    .map((grp) => {
      const matchingColleges = grp.collegeRequests.filter((r) => {
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'scheduled'
            ? ['accepted', 'recruiter_confirmed', 'scheduled'].includes(r.status)
            : r.status === statusFilter);

        const matchesSearch =
          r.college?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.college?.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          grp.requirement?.title?.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesStatus && matchesSearch;
      });

      return {
        ...grp,
        collegeRequests: matchingColleges,
      };
    })
    .filter((grp) => grp.collegeRequests.length > 0);

  // Add / Remove Proposed Dates
  const handleAddDateInput = () => {
    setProposedDates([...proposedDates, '']);
  };

  const handleDateChange = (index, value) => {
    const updated = [...proposedDates];
    updated[index] = value;
    setProposedDates(updated);
  };

  const handleRemoveDate = (index) => {
    if (proposedDates.length === 1) return;
    setProposedDates(proposedDates.filter((_, i) => i !== index));
  };

  // Toggle College Selection
  const toggleCollege = (collegeId) => {
    setSelectedColleges((prev) =>
      prev.includes(collegeId)
        ? prev.filter((id) => id !== collegeId)
        : [...prev, collegeId]
    );
  };

  // Submit Send Request
  const handleSendRequest = async (e) => {
    e.preventDefault();

    if (!selectedRequirement) {
      toast.error('Please select a published Job Requirement');
      return;
    }
    if (selectedColleges.length === 0) {
      toast.error('Please select at least one college');
      return;
    }
    const validDates = proposedDates.filter((d) => d && d.trim() !== '');
    if (validDates.length === 0) {
      toast.error('Please specify at least one proposed drive date');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/drive-requests', {
        jobRequirementId: selectedRequirement,
        collegeIds: selectedColleges,
        proposedDates: validDates,
        mode: driveMode,
        initialMessage,
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Drive request(s) sent successfully!');
        setIsSendModalOpen(false);
        setSelectedRequirement('');
        setSelectedColleges([]);
        setProposedDates(['']);
        setInitialMessage('');
        fetchData(section);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send drive request';
      toast.error(msg, { duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  // Send collaborative message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !selectedRequest) return;

    try {
      setSendingMessage(true);
      const res = await api.post(`/drive-requests/${selectedRequest._id}/messages`, {
        text: chatMessage.trim(),
      });

      if (res.data.success) {
        const updatedMessages = res.data.messages;
        setSelectedRequest((prev) => ({
          ...prev,
          messages: updatedMessages,
        }));
        setChatMessage('');
        fetchData(section);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  // Confirm Schedule
  const handleConfirmSchedule = async () => {
    if (!selectedRequest) return;
    const dateToConfirm =
      selectedConfirmDate ||
      selectedRequest.confirmedDate ||
      selectedRequest.proposedDates?.[0];

    if (!dateToConfirm) {
      toast.error('Please select a drive date to confirm');
      return;
    }

    try {
      setConfirmingSchedule(true);
      const res = await api.put(`/drive-requests/${selectedRequest._id}/confirm-schedule`, {
        selectedDate: dateToConfirm,
      });

      if (res.data.success) {
        toast.success('Drive schedule confirmed! Awaiting TPO publication to students.');
        setIsConfirmScheduleOpen(false);
        setIsDetailModalOpen(false);
        fetchData(section);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm drive schedule');
    } finally {
      setConfirmingSchedule(false);
    }
  };

  // Accept TPO proposed date
  const handleAcceptTpoDate = async () => {
    if (!selectedTpoDate || !selectedRequest) {
      toast.error('Please select one of the proposed dates');
      return;
    }

    try {
      setAcceptingReschedule(true);
      const res = await api.patch(
        `/drive-requests/${selectedRequest._id}/accept-date`,
        { selectedDate: selectedTpoDate }
      );

      if (res.data.success) {
        toast.success('Confirmed drive date! Ready for TPO to publish to students.');
        setIsAcceptRescheduleOpen(false);
        setIsDetailModalOpen(false);
        fetchData(section);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept proposed date');
    } finally {
      setAcceptingReschedule(false);
    }
  };

  // Cancel Request
  const handleCancelRequest = async () => {
    if (!selectedRequest) return;

    try {
      setCancelling(true);
      const res = await api.patch(`/drive-requests/${selectedRequest._id}/cancel`, {
        reason: cancelReason || 'Cancelled by recruiter',
      });

      if (res.data.success) {
        toast.success('Drive request cancelled');
        setIsCancelModalOpen(false);
        setIsDetailModalOpen(false);
        fetchData(section);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            <span>Pending TPO Review</span>
          </span>
        );
      case 'reschedule_proposed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Action Required: TPO Proposed New Date</span>
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>Action Required: TPO Accepted • Confirm Schedule</span>
          </span>
        );
      case 'recruiter_confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
            <span>Confirmed by You • Ready for TPO to Publish</span>
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Published to Students • Live</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Request Declined</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            <span>Cancelled</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Drive Completed</span>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 mb-2">
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Recruiter Campus Drive Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Drive Requests &amp; Placement Lifecycle
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Propose recruitment drives, negotiate dates with college TPOs, confirm locked drive dates, and track applicant conversions from interview to offer.
          </p>
        </div>

        <button
          onClick={() => {
            if (requirements.length === 0) {
              toast.error(
                'You must have at least one published Job Requirement before sending drive requests'
              );
              return;
            }
            setIsSendModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/25 transition-all shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>Send Drive Request</span>
        </button>
      </div>

      {/* Primary Section Switcher Tabs: Active Drives vs Previous Drives */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setSection('active')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              section === 'active'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4 text-indigo-600" />
            <span>Active Drives</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700">
              {summary.totalActive ?? requests.length}
            </span>
          </button>

          <button
            onClick={() => setSection('previous')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              section === 'previous'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-4 h-4 text-slate-500" />
            <span>Previous Drives (Archive)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
              {summary.totalPrevious ?? 0}
            </span>
          </button>
        </div>

        {/* View Mode Toggle: Job-wise vs List */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setViewMode('job_wise')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'job_wise'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Job-wise View</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-slate-600" />
            <span>All Requests</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section === 'active' ? 'Active Outreach' : 'Historical Outreaches'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900">
            {section === 'active' ? (summary.totalActive ?? requests.length) : (summary.totalPrevious ?? requests.length)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Colleges contacted</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Action Required
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-amber-600">
            {summary.actionRequired ?? (summary.awaitingRecruiterConfirmation || 0) + (summary.rescheduleProposed || 0)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            {summary.awaitingRecruiterConfirmation
              ? `${summary.awaitingRecruiterConfirmation} awaiting your confirmation`
              : 'TPO responses ready'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ready / Confirmed
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-indigo-600">
            {summary.recruiterConfirmed ?? 0}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Ready for TPO publication</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Published &amp; Live
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-emerald-600">
            {summary.publishedDrives ?? 0}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Open for student applications</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            {[
              { id: 'all', label: 'All', count: requests.length },
              ...(section === 'active'
                ? [
                    { id: 'pending', label: 'Pending TPO', count: summary.pendingTpoReview ?? 0 },
                    { id: 'accepted', label: 'Awaiting Your Confirmation', count: summary.awaitingRecruiterConfirmation ?? 0 },
                    { id: 'reschedule_proposed', label: 'Reschedule Proposed', count: summary.rescheduleProposed ?? 0 },
                    { id: 'recruiter_confirmed', label: 'Ready to Publish', count: summary.recruiterConfirmed ?? 0 },
                    { id: 'scheduled', label: 'Published & Live', count: summary.publishedDrives ?? 0 },
                  ]
                : [
                    { id: 'completed', label: 'Completed Drives', count: requests.filter((r) => r.status === 'completed').length },
                    { id: 'cancelled', label: 'Cancelled', count: requests.filter((r) => r.status === 'cancelled').length },
                    { id: 'rejected', label: 'Declined', count: requests.filter((r) => r.status === 'rejected').length },
                  ]),
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
                    statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
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
              placeholder="Search by college or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-200 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl bg-white border border-dashed border-slate-200 shadow-xs">
          <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {section === 'active' ? 'No active drive requests' : 'No previous drive records in archive'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            {section === 'active'
              ? 'Send recruitment proposals to accredited institutions to schedule placement drives.'
              : 'Past, rejected, and completed placement drives will appear here.'}
          </p>
          {requirements.length > 0 && section === 'active' && (
            <button
              onClick={() => setIsSendModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Drive Request</span>
            </button>
          )}
        </div>
      ) : viewMode === 'job_wise' ? (
        /* =========================================================================
           JOB-WISE BREAKDOWN VIEW (Parent Requirement with College Responses)
           ========================================================================= */
        <div className="space-y-6">
          {filteredGrouped.map((grp) => {
            const req = grp.requirement || {};
            const isArchived = Boolean(req.isArchivedRequirement);

            return (
              <div
                key={grp.requirementId}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
              >
                {/* Parent Requirement Header Card */}
                <div className="p-6 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-white border-b border-slate-200/80">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs">
                          <Briefcase className="w-4 h-4" />
                        </span>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">
                          {req.title}
                        </h2>
                        {isArchived ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Archived Requirement (Historical Snapshot Preserved)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Published Requirement
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                        <span className="font-bold text-indigo-700 text-sm">
                          {req.packageLpa ? `${req.packageLpa} LPA` : 'Competitive'}
                        </span>
                        <span>•</span>
                        <span>Batch: <strong className="text-slate-800">{req.batchYear || 'All'}</strong></span>
                        <span>•</span>
                        <span>Location: <strong className="text-slate-800">{req.location || 'Multiple'}</strong></span>
                        {req.allowedBranches && req.allowedBranches.length > 0 && (
                          <>
                            <span>•</span>
                            <span>Branches: <strong className="text-slate-800">{req.allowedBranches.join(', ')}</strong></span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Aggregate Stats Pill */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{grp.collegeRequests.length} Colleges Reached</span>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{grp.stats.applied} Applied</span>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-800 flex items-center gap-1.5">
                        <span>{grp.stats.shortlisted} Shortlisted</span>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{grp.stats.offers} Offers</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Child College Responses List */}
                <div className="divide-y divide-slate-100">
                  {grp.collegeRequests.map((collegeReq) => {
                    const driveId = collegeReq.drive?._id || collegeReq.drive;
                    const collegeStats = collegeReq.stats || { applied: 0, shortlisted: 0, selected: 0, offers: 0 };

                    return (
                      <div
                        key={collegeReq._id}
                        className={`p-5 transition-colors hover:bg-slate-50/60 ${
                          collegeReq.status === 'accepted'
                            ? 'bg-amber-50/30'
                            : collegeReq.status === 'reschedule_proposed'
                            ? 'bg-indigo-50/20'
                            : ''
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* College Identification & Details */}
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-900 text-sm">
                                {collegeReq.college?.name}
                              </h3>
                              <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700">
                                {collegeReq.college?.code}
                              </span>
                              {getStatusBadge(collegeReq.status)}
                            </div>

                            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {collegeReq.college?.city}, {collegeReq.college?.state}
                              </span>
                              <span>•</span>
                              <span className="capitalize font-medium text-slate-700 flex items-center gap-1">
                                {collegeReq.mode === 'virtual' ? (
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
                              <span>•</span>
                              <span>
                                Drive Date:{' '}
                                <strong className="text-slate-800">
                                  {collegeReq.confirmedDate
                                    ? new Date(collegeReq.confirmedDate).toLocaleDateString()
                                    : collegeReq.proposedDates?.[0]
                                    ? `${new Date(collegeReq.proposedDates[0]).toLocaleDateString()} (Proposed)`
                                    : 'Pending'}
                                </strong>
                              </span>
                            </p>

                            {/* College Specific Applicant Conversion Metrics */}
                            <div className="flex items-center gap-2 pt-1 text-[11px]">
                              <span className="text-slate-500 font-medium">Conversion:</span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                                {collegeStats.applied} Applied
                              </span>
                              <span>→</span>
                              <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold">
                                {collegeStats.shortlisted} Shortlisted
                              </span>
                              <span>→</span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                                {collegeStats.selected} Selected
                              </span>
                              <span>→</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold">
                                {collegeStats.offers} Offers
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons for this specific college response */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* CONFIRM SCHEDULE: Shown when TPO accepted the request */}
                            {collegeReq.status === 'accepted' && (
                              <button
                                onClick={() => {
                                  setSelectedRequest(collegeReq);
                                  setSelectedConfirmDate(
                                    collegeReq.confirmedDate || collegeReq.proposedDates?.[0] || ''
                                  );
                                  setIsConfirmScheduleOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer animate-pulse"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm Schedule</span>
                              </button>
                            )}

                            {/* RESCHEDULE ACTION: Shown when TPO proposed alternative dates */}
                            {collegeReq.status === 'reschedule_proposed' && (
                              <button
                                onClick={() => {
                                  setSelectedRequest(collegeReq);
                                  if (collegeReq.tpoProposedDates && collegeReq.tpoProposedDates.length > 0) {
                                    setSelectedTpoDate(collegeReq.tpoProposedDates[0]);
                                  }
                                  setIsAcceptRescheduleOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Review Proposed Date</span>
                              </button>
                            )}

                            {/* PIPELINE LINK: Shown when drive is confirmed / published */}
                            {['scheduled'].includes(collegeReq.status) && (
                              <Link
                                to={
                                  driveId
                                    ? `/recruiter/drives/${driveId}/pipeline`
                                    : '/recruiter/pipeline'
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                <span>View Pipeline</span>
                              </Link>
                            )}

                            {/* TIMELINE & CHAT */}
                            <button
                              onClick={() => {
                                setSelectedRequest(collegeReq);
                                setIsDetailModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                              <span>Timeline &amp; Chat ({collegeReq.messages?.length || 0})</span>
                            </button>

                            {/* CANCEL REQUEST */}
                            {['pending', 'reschedule_proposed'].includes(collegeReq.status) && (
                              <button
                                onClick={() => {
                                  setSelectedRequest(collegeReq);
                                  setIsCancelModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-all cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* =========================================================================
           ALL REQUESTS LIST VIEW (Flat Cards)
           ========================================================================= */
        <div className="space-y-4">
          {filteredRequests.map((req) => (
            <div
              key={req._id}
              className={`bg-white rounded-2xl border p-5 sm:p-6 transition-all hover:shadow-md ${
                req.status === 'accepted'
                  ? 'border-amber-300 ring-2 ring-amber-500/10'
                  : req.status === 'reschedule_proposed'
                  ? 'border-indigo-300 ring-2 ring-indigo-500/10'
                  : 'border-slate-200/80 shadow-xs'
              }`}
            >
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {req.college?.name}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700">
                      {req.college?.code}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>

                  <p className="text-xs text-slate-500 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {req.college?.city}, {req.college?.state}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 capitalize font-medium text-slate-700">
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

                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  {/* CONFIRM SCHEDULE */}
                  {req.status === 'accepted' && (
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setSelectedConfirmDate(
                          req.confirmedDate || req.proposedDates?.[0] || ''
                        );
                        setIsConfirmScheduleOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm Schedule</span>
                    </button>
                  )}

                  {/* ACTION FOR RESCHEDULE */}
                  {req.status === 'reschedule_proposed' && (
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        if (req.tpoProposedDates && req.tpoProposedDates.length > 0) {
                          setSelectedTpoDate(req.tpoProposedDates[0]);
                        }
                        setIsAcceptRescheduleOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Review Proposed Date</span>
                    </button>
                  )}

                  {/* PIPELINE LINK */}
                  {['scheduled'].includes(req.status) && (
                    <Link
                      to={
                        req.drive?._id || req.drive
                          ? `/recruiter/drives/${req.drive?._id || req.drive}/pipeline`
                          : '/recruiter/pipeline'
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-indigo-500/20 transition-all cursor-pointer"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Open Pipeline</span>
                    </Link>
                  )}

                  <button
                    onClick={() => {
                      setSelectedRequest(req);
                      setIsDetailModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span>Timeline &amp; Chat ({req.messages?.length || 0})</span>
                  </button>

                  {['pending', 'reschedule_proposed'].includes(req.status) && (
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setIsCancelModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-all cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Requirement & Dates Specs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
                {/* Role Details */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                    Job Requirement
                  </span>
                  <p className="font-bold text-slate-800 text-sm">
                    {req.jobRequirement?.title || req.jobRequirementSnapshot?.title}
                  </p>
                  <p className="text-indigo-600 font-extrabold mt-0.5">
                    {req.jobRequirement?.packageLpa || req.jobRequirementSnapshot?.packageLpa} LPA
                    {req.jobRequirement?.openings ? ` • ${req.jobRequirement.openings} Openings` : ''}
                  </p>
                </div>

                {/* Recruiter Proposed Dates */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                    Proposed Dates
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
                  {req.confirmedDate ? (
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 block uppercase tracking-wider mb-1">
                        Confirmed Drive Date
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
                        TPO Alternative Dates
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
                        Reason for Decline
                      </span>
                      <p className="text-slate-700 italic">"{req.rejectionReason}"</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                        Latest Step
                      </span>
                      <p className="text-slate-600 font-medium">
                        {req.statusTimeline?.[req.statusTimeline.length - 1]?.note ||
                          'Waiting for college placement cell evaluation.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONFIRM SCHEDULE MODAL (Recruiter confirms TPO's accepted date) */}
      <Modal
        isOpen={isConfirmScheduleOpen}
        onClose={() => setIsConfirmScheduleOpen(false)}
        title="Confirm Drive Schedule"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            The placement cell of <strong>{selectedRequest?.college?.name}</strong> has accepted the drive. Confirm the schedule date below so the TPO can finalize venue and publish it to eligible students.
          </p>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Select or Verify Drive Date *
            </label>
            <input
              type="date"
              value={
                selectedConfirmDate
                  ? toISTInputValue(selectedConfirmDate, { dateOnly: true })
                  : ''
              }
              onChange={(e) => setSelectedConfirmDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsConfirmScheduleOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSchedule}
              disabled={confirmingSchedule}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{confirmingSchedule ? 'Confirming...' : 'Lock & Confirm Date'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* SEND DRIVE REQUEST MODAL */}
      <Modal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        title="Send Drive Request to Colleges"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSendRequest} className="space-y-4 text-xs">
          {/* Step 1: Select Requirement */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              1. Select Published Job Requirement *
            </label>
            <select
              value={selectedRequirement}
              onChange={(e) => setSelectedRequirement(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            >
              <option value="">-- Choose a requirement --</option>
              {requirements.map((req) => (
                <option key={req._id} value={req._id}>
                  {req.title} — {req.packageLpa} LPA ({req.openings} Openings, Batch {req.batchYear})
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Select Target College(s) */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              2. Target College(s) * ({selectedColleges.length} selected)
            </label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 p-1">
              {colleges.map((col) => {
                const isChecked = selectedColleges.includes(col._id);
                return (
                  <label
                    key={col._id}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isChecked ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCollege(col._id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-bold text-slate-800">{col.name}</span>
                        <span className="text-[11px] text-slate-400 block">
                          {col.code} • {col.city}, {col.state}
                        </span>
                      </div>
                    </div>
                    {col.accreditation && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {col.accreditation}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Step 3: Drive Mode */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">3. Drive Mode *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDriveMode('on-campus')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  driveMode === 'on-campus'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>On-Campus Drive</span>
              </button>
              <button
                type="button"
                onClick={() => setDriveMode('virtual')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  driveMode === 'virtual'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>Virtual Drive</span>
              </button>
            </div>
          </div>

          {/* Step 4: Proposed Dates */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-700 font-bold">
                4. Proposed Drive Dates * (Offer 1 or more options)
              </label>
              <button
                type="button"
                onClick={handleAddDateInput}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another date</span>
              </button>
            </div>

            <div className="space-y-2">
              {proposedDates.map((dateVal, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateVal}
                    min={toISTInputValue(new Date(), { dateOnly: true })}
                    onChange={(e) => handleDateChange(index, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                  {proposedDates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(index)}
                      className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 5: Optional Message */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              5. Introductory Message / Logistical Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="e.g. We require a 200-seater auditorium and lab facilities for online assessments..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsSendModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Sending...' : 'Send Drive Request(s)'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* DETAIL / TIMELINE / CHAT MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedRequest ? `Drive Request: ${selectedRequest.college?.name}` : 'Request Details'}
        maxWidth="max-w-4xl"
      >
        {selectedRequest && (
          <div className="space-y-6 text-xs">
            {/* Top Summary Banner */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="font-black text-slate-900 text-sm">
                  {selectedRequest.jobRequirement?.title || selectedRequest.jobRequirementSnapshot?.title}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  Package: <strong className="text-indigo-600">{selectedRequest.jobRequirement?.packageLpa || selectedRequest.jobRequirementSnapshot?.packageLpa} LPA</strong> •
                  Batch: {selectedRequest.jobRequirement?.batchYear || selectedRequest.jobRequirementSnapshot?.batchYear || 'All'} •
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
                  <span>College Placement Cell Discussion</span>
                </h4>

                {/* Messages scroll box */}
                <div className="flex-1 overflow-y-auto space-y-2.5 p-1">
                  {!selectedRequest.messages || selectedRequest.messages.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-1 opacity-50" />
                      <p>No messages yet. Send a note to the TPO.</p>
                    </div>
                  ) : (
                    selectedRequest.messages.map((m, idx) => {
                      const isMe = m.senderRole === 'recruiter';
                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-700">
                              {m.senderName || (isMe ? 'You (Recruiter)' : 'TPO Officer')}
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
                    placeholder="Type a message to the college TPO..."
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

      {/* ACCEPT TPO RESCHEDULE MODAL */}
      <Modal
        isOpen={isAcceptRescheduleOpen}
        onClose={() => setIsAcceptRescheduleOpen(false)}
        title="Accept TPO Proposed Drive Date"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            The placement cell of <strong>{selectedRequest?.college?.name}</strong> has proposed the following alternate dates for the drive:
          </p>

          <div className="space-y-2">
            {selectedRequest?.tpoProposedDates?.map((d, idx) => (
              <label
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedTpoDate === d
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="tpoDate"
                  checked={selectedTpoDate === d}
                  onChange={() => setSelectedTpoDate(d)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
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

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAcceptRescheduleOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAcceptTpoDate}
              disabled={acceptingReschedule || !selectedTpoDate}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{acceptingReschedule ? 'Confirming...' : 'Confirm Date'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* CANCEL DRIVE REQUEST MODAL */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Drive Request"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Are you sure you want to cancel the drive request sent to{' '}
            <strong>{selectedRequest?.college?.name}</strong>?
          </p>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Cancellation Reason (Optional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Schedule conflicts, positions filled, etc."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Keep Request
            </button>
            <button
              type="button"
              onClick={handleCancelRequest}
              disabled={cancelling}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{cancelling ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ManageDriveRequests;
