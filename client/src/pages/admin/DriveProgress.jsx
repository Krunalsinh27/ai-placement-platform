import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Briefcase,
  Calendar,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  AlertTriangle,
  Lock,
  Unlock,
  Layers,
  ChevronRight,
  UserCheck,
  UserX,
  Award,
  ArrowLeft,
  FileSpreadsheet,
  RotateCw,
  Search,
  Video,
  Star,
  ExternalLink,
  Play,
  Check,
  Megaphone,
  Send,
  X,
  AlertCircle,
  FileText,
  BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { toISTInputValue, formatISTDate } from '../../utils/dateTime';

const DriveProgress = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [driveData, setDriveData] = useState(null);
  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'applicants' | 'attendance' | 'clashes'
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);

  // Freeze Modal State
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [reopening, setReopening] = useState(false);

  // Clash report state
  const [clashDate, setClashDate] = useState(toISTInputValue(new Date(), { dateOnly: true }));
  const [clashReport, setClashReport] = useState(null);
  const [loadingClashes, setLoadingClashes] = useState(false);

  // Search filter
  const [applicantSearch, setApplicantSearch] = useState('');

  // Attendance editing state
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Interview Conduct Live Status State (Task 29B)
  const [interviewPanels, setInterviewPanels] = useState([]);
  const [interviewSlots, setInterviewSlots] = useState([]);
  const [loadingInterviewData, setLoadingInterviewData] = useState(false);
  const [allowingRetestId, setAllowingRetestId] = useState(null);

  // Aptitude Platform Test State (Task 32B)
  const [aptitudeResults, setAptitudeResults] = useState([]);
  const [aptitudeSummary, setAptitudeSummary] = useState(null);
  const [loadingAptitude, setLoadingAptitude] = useState(false);
  const [allowingAptitudeRetestId, setAllowingAptitudeRetestId] = useState(null);

  // Round Announcement Modal State
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ subject: '', message: '' });
  const [announcementPreview, setAnnouncementPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);

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

  const fetchInterviewData = async (roundId) => {
    if (!roundId) return;
    setLoadingInterviewData(true);
    try {
      const [panelsRes, slotsRes] = await Promise.allSettled([
        api.get(`/rounds/${roundId}/panels`),
        api.get(`/rounds/${roundId}/slots`),
      ]);
      if (panelsRes.status === 'fulfilled' && panelsRes.value.data.success) {
        setInterviewPanels(panelsRes.value.data.panels || []);
      }
      if (slotsRes.status === 'fulfilled' && slotsRes.value.data.success) {
        setInterviewSlots(slotsRes.value.data.slots || []);
      }
    } catch (err) {
      console.error('Failed to load interview round data:', err);
    } finally {
      setLoadingInterviewData(false);
    }
  };

  const handleAllowRetest = async (slotId, studentName) => {
    if (!window.confirm(`Are you sure you want to allow a re-test for ${studentName || 'this candidate'}? Their slot will be restored to scheduled and status reset to pending.`)) {
      return;
    }

    setAllowingRetestId(slotId);
    try {
      const res = await api.put(`/slots/${slotId}/allow-retest`);
      if (res.data.success) {
        toast.success(res.data.message);
        const activeRound = driveData?.rounds?.[selectedRoundIndex];
        if (activeRound) fetchInterviewData(activeRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Allow re-test error:', err);
      toast.error(err.response?.data?.message || 'Failed to allow re-test');
    } finally {
      setAllowingRetestId(null);
    }
  };

  const handleTpoUpdateSlotStatus = async (slotId, status) => {
    try {
      const res = await api.put(`/slots/${slotId}/status`, { status });
      if (res.data.success) {
        toast.success(res.data.message);
        const activeRound = driveData?.rounds?.[selectedRoundIndex];
        if (activeRound) fetchInterviewData(activeRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Update slot status error:', err);
      toast.error(err.response?.data?.message || 'Failed to update slot status');
    }
  };

  const fetchDriveProgress = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/drives/${id}/progress`);
      if (res.data.success) {
        setDriveData(res.data);
        if (res.data.drive?.driveDate) {
          setClashDate(toISTInputValue(res.data.drive.driveDate, { dateOnly: true }));
        }
      }
    } catch (err) {
      console.error('Failed to load drive progress:', err);
      toast.error('Unable to fetch drive progress');
    } finally {
      setLoading(false);
    }
  };

  const fetchAptitudeData = async (roundId) => {
    if (!roundId) return;
    setLoadingAptitude(true);
    try {
      const res = await api.get(`/rounds/${roundId}/test-results`);
      if (res.data.success) {
        setAptitudeResults(res.data.results || []);
        setAptitudeSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load aptitude test data:', err);
    } finally {
      setLoadingAptitude(false);
    }
  };

  const handleAllowAptitudeRetest = async (studentId, studentName) => {
    const activeRound = driveData?.rounds?.[selectedRoundIndex];
    if (!activeRound) return;

    if (!window.confirm(`Are you sure you want to allow a re-test for ${studentName || 'this candidate'}? Their previous attempt will be cleared and they will be able to start the test fresh.`)) {
      return;
    }

    setAllowingAptitudeRetestId(studentId);
    try {
      const res = await api.put(`/tests/${activeRound._id}/retest/${studentId}`);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchAptitudeData(activeRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Allow aptitude re-test error:', err);
      toast.error(err.response?.data?.message || 'Failed to allow re-test');
    } finally {
      setAllowingAptitudeRetestId(null);
    }
  };

  useEffect(() => {
    fetchDriveProgress();
  }, [id]);

  useEffect(() => {
    const activeRound = driveData?.rounds?.[selectedRoundIndex];
    if (activeRound && ['technical', 'hr', 'group_discussion'].includes(activeRound.type)) {
      fetchInterviewData(activeRound._id);
    } else {
      setInterviewPanels([]);
      setInterviewSlots([]);
    }

    if (activeRound && activeRound.deliveryMode === 'platform_test') {
      fetchAptitudeData(activeRound._id);
    } else {
      setAptitudeResults([]);
      setAptitudeSummary(null);
    }
  }, [driveData, selectedRoundIndex]);

  // Handle freeze applications
  const handleFreezeApplications = async () => {
    setFreezing(true);
    try {
      const res = await api.put(`/drives/${id}/freeze`);
      if (res.data.success) {
        toast.success(res.data.message);
        setFreezeModalOpen(false);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to freeze drive:', err);
      toast.error(err.response?.data?.message || 'Failed to freeze applications');
    } finally {
      setFreezing(false);
    }
  };

  // Handle reopen applications
  const handleReopenApplications = async () => {
    if (!window.confirm('Are you sure you want to reopen applications for this drive? Candidate list freeze will be undone.')) {
      return;
    }
    setReopening(true);
    try {
      const res = await api.put(`/drives/${id}/reopen`);
      if (res.data.success) {
        toast.success(res.data.message || 'Applications reopened successfully');
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to reopen applications:', err);
      toast.error(err.response?.data?.message || 'Failed to reopen applications');
    } finally {
      setReopening(false);
    }
  };

  // Handle exclude applicant before freeze
  const handleExcludeApplicant = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to exclude ${studentName} from this drive?`)) {
      return;
    }

    try {
      const res = await api.put(`/drives/${id}/remove-applicant/${studentId}`);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to exclude applicant:', err);
      toast.error(err.response?.data?.message || 'Failed to exclude candidate');
    }
  };

  // Fetch daily clashes report
  const fetchClashesReport = async (date) => {
    setLoadingClashes(true);
    try {
      const res = await api.get(`/drives/clashes?date=${date}`);
      if (res.data.success) {
        setClashReport(res.data.report);
      }
    } catch (err) {
      console.error('Failed to fetch clash report:', err);
      toast.error('Failed to generate clash report');
    } finally {
      setLoadingClashes(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'clashes' && clashDate) {
      fetchClashesReport(clashDate);
    }
  }, [activeTab, clashDate]);

  // Handle saving attendance from sheet
  const handleSaveAttendance = async (roundId, attendanceUpdates) => {
    setSavingAttendance(true);
    try {
      const res = await api.put(`/rounds/${roundId}/attendance`, {
        attendanceList: attendanceUpdates,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to save attendance:', err);
      toast.error(err.response?.data?.message || 'Failed to update attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!driveData || !driveData.drive) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-700">Drive Not Found</h3>
        <Link
          to="/admin/drives"
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Drives
        </Link>
      </div>
    );
  }

  const { drive, rounds = [], applications = [], metrics = {} } = driveData;
  const currentRound = rounds[selectedRoundIndex] || rounds[0];

  const filteredApplicants = applications.filter((app) => {
    const studentName = app.student?.user?.name || '';
    const enrollmentNo = app.student?.enrollmentNo || '';
    const branch = app.student?.branch || '';
    const query = applicantSearch.toLowerCase();
    return (
      studentName.toLowerCase().includes(query) ||
      enrollmentNo.toLowerCase().includes(query) ||
      branch.toLowerCase().includes(query)
    );
  });

  const isBeforeDeadline = () => {
    if (!drive?.lastDateToApply) return false;
    const deadline = new Date(drive.lastDateToApply);
    if (deadline.getUTCHours() === 0 && deadline.getUTCMinutes() === 0) {
      deadline.setUTCHours(18, 29, 59, 999);
    }
    return new Date() <= deadline;
  };

  const hasRoundStarted = rounds.some(
    (r) =>
      r.status !== 'scheduled' ||
      r.resultsPublished ||
      (r.metrics?.presentCount || 0) > 0 ||
      (r.metrics?.clearedCount || 0) > 0
  );

  const canReopen = Boolean(drive.applicationsClosed && isBeforeDeadline() && !hasRoundStarted);

  // Open Round Announcement Modal & Fetch Preview
  const handleOpenAnnouncementModal = async () => {
    if (!currentRound) return;
    setAnnouncementForm({ subject: '', message: '' });
    setShowConfirmSend(false);
    setAnnouncementModalOpen(true);
    setLoadingPreview(true);
    try {
      const res = await api.get(`/rounds/${currentRound._id}/announcements/preview`);
      if (res.data.success) {
        setAnnouncementPreview(res.data);
      }
    } catch (err) {
      console.error('Failed to load announcement preview:', err);
      toast.error(err.response?.data?.message || 'Failed to fetch candidate count');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Send Announcement Submit
  const handleSendAnnouncement = async (e) => {
    if (e) e.preventDefault();
    if (!currentRound) return;
    if (!announcementForm.subject.trim() || !announcementForm.message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    if (!showConfirmSend) {
      setShowConfirmSend(true);
      return;
    }

    setIsSendingAnnouncement(true);
    try {
      const res = await api.post(`/rounds/${currentRound._id}/announcements`, {
        subject: announcementForm.subject.trim(),
        message: announcementForm.message.trim(),
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Announcement sent successfully!');
        setAnnouncementModalOpen(false);
        setAnnouncementForm({ subject: '', message: '' });
        setShowConfirmSend(false);
      }
    } catch (err) {
      console.error('Failed to dispatch announcement:', err);
      toast.error(err.response?.data?.message || 'Failed to dispatch announcement');
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const handleDownloadAttendancePdf = async () => {
    if (!currentRound) return;
    try {
      const res = await api.get(`/rounds/${currentRound._id}/attendance/pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Attendance_${(currentRound.name || 'Round').replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Attendance sheet PDF downloaded');
    } catch (err) {
      console.error('Failed to download PDF:', err);
      toast.error('Failed to download attendance sheet PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/admin/drives" className="hover:text-indigo-600 font-medium inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Placement Drives
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">{drive.role}</span>
          <span>/</span>
          <span className="text-indigo-600 font-semibold">On-Campus Pipeline</span>
        </div>

        <button
          onClick={fetchDriveProgress}
          className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Drive Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {drive.company?.logoUrl ? (
              <img
                src={drive.company.logoUrl}
                alt={drive.company.name}
                className="w-16 h-16 rounded-2xl object-contain bg-slate-50 p-2 border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-700 font-bold text-2xl flex items-center justify-center shrink-0 border border-indigo-100">
                {drive.company?.name?.charAt(0) || 'C'}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {drive.role}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {drive.packageLpa != null && !isNaN(drive.packageLpa) ? `${drive.packageLpa} LPA` : '—'}
                </span>
                {drive.applicationsClosed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3" /> List Frozen
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Unlock className="w-3 h-3" /> Applications Open
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-semibold text-slate-800">{drive.company?.name}</span>
                <span>•</span>
                <span>Mode: <strong className="capitalize">{drive.mode}</strong></span>
                <span>•</span>
                <span>Drive Date: <strong>{new Date(drive.driveDate).toLocaleDateString()}</strong></span>
                <span>•</span>
                <span>Apply Deadline: <strong>{new Date(drive.lastDateToApply).toLocaleDateString()}</strong></span>
              </p>

              {drive.listFrozenAt && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Candidate list finalized on {new Date(drive.listFrozenAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Action Button: Freeze Applications */}
          <div className="shrink-0 flex items-center gap-3">
            {!drive.applicationsClosed ? (
              <button
                onClick={() => setFreezeModalOpen(true)}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Close Applications & Freeze List</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-semibold inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Rounds Active ({rounds.length} Total)</span>
                </div>
                {canReopen && (
                  <button
                    onClick={handleReopenApplications}
                    disabled={reopening}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>{reopening ? 'Reopening...' : 'Reopen Applications'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Applied</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{metrics.totalApplied || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Valid Enrolled</span>
          <p className="text-xl font-extrabold text-indigo-700 mt-1">{metrics.validApplicants || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Excluded</span>
          <p className="text-xl font-extrabold text-rose-600 mt-1">{metrics.excludedCount || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rounds</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{rounds.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Offers Made</span>
          <p className="text-xl font-extrabold text-amber-700 mt-1">{metrics.totalOffers || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Accepted Offers</span>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">{metrics.acceptedOffers || 0}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition-colors cursor-pointer ${
            activeTab === 'pipeline'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Round Pipeline ({rounds.length})
        </button>
        <button
          onClick={() => setActiveTab('applicants')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition-colors cursor-pointer ${
            activeTab === 'applicants'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Applicants List ({applications.length})
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition-colors cursor-pointer ${
            activeTab === 'attendance'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Attendance Sheet
        </button>
        <button
          onClick={() => setActiveTab('clashes')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'clashes'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span>Day-wise Clash Report</span>
        </button>
      </div>

      {/* TAB 1: ROUND PIPELINE */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {rounds.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-slate-800">No Rounds Scheduled Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Rounds will be initialized automatically from the job requirements when applications are closed and the candidate list is frozen.
              </p>
              {!drive.applicationsClosed && (
                <button
                  onClick={() => setFreezeModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" /> Freeze List & Create Default Rounds
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* Round Selector Pills */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {rounds.map((r, idx) => (
                  <button
                    key={r._id}
                    onClick={() => setSelectedRoundIndex(idx)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedRoundIndex === idx
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-black/10">
                      {r.metrics?.totalEnrolled || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Current Round Overview Card */}
              {currentRound && (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{currentRound.name}</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {currentRound.type}
                        </span>
                        {currentRound.deliveryMode && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200/50">
                            {currentRound.deliveryMode.replace('_', ' ')}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700">
                          {currentRound.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Mode: <span className="capitalize font-semibold text-slate-700">{currentRound.mode || 'N/A'}</span> •
                        Date: <span className="font-semibold text-slate-700">{currentRound.date ? new Date(currentRound.date).toLocaleDateString() : 'TBD'}</span>
                        {currentRound.reportByTime && <> • Report by: <span className="font-semibold text-slate-700">{currentRound.reportByTime}</span></>}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {(currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline') && (
                        <button
                          onClick={handleDownloadAttendancePdf}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors cursor-pointer border border-emerald-200/60"
                          title="Download candidate attendance sheet as printable PDF"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Attendance Sheet (PDF)</span>
                        </button>
                      )}

                      <button
                        onClick={handleOpenAnnouncementModal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-colors cursor-pointer border border-purple-200/60"
                        title="Broadcast announcement to all candidates in this round"
                      >
                        <Megaphone className="w-3.5 h-3.5 text-purple-600" />
                        <span>Send Announcement</span>
                      </button>

                      <div className="text-right text-xs">
                        <span className="text-slate-400 block text-[10px]">Round Progress</span>
                        <span className="font-bold text-emerald-600">
                          {currentRound.metrics?.clearedCount || 0} Cleared / {currentRound.metrics?.totalEnrolled || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Interview Live Status & Panel Queue (Task 29B) */}
                  {['technical', 'hr', 'group_discussion'].includes(currentRound.type) && (
                    <div className="space-y-4 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                              Live Interview Queue & Panels Status
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Real-time read-only status of panels, virtual meeting rooms, candidate attendance, and re-test authority.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => fetchInterviewData(currentRound._id)}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                            <span>Refresh Queue</span>
                          </button>
                        </div>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Slots</span>
                          <span className="text-base font-black text-slate-800">{interviewSlots.length}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                          <span className="text-[10px] uppercase font-bold text-amber-700 block">In Progress</span>
                          <span className="text-base font-black">{interviewSlots.filter((s) => s.status === 'in_progress').length}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Completed</span>
                          <span className="text-base font-black">{interviewSlots.filter((s) => s.status === 'completed').length}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
                          <span className="text-[10px] uppercase font-bold text-rose-700 block">No Show</span>
                          <span className="text-base font-black">{interviewSlots.filter((s) => s.status === 'no_show').length}</span>
                        </div>
                      </div>

                      {/* Panels Overview Cards */}
                      {interviewPanels.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Configured Panels ({interviewPanels.length})
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {interviewPanels.map((panel) => {
                              const panelSlotCount = interviewSlots.filter((s) => s.panel?._id === panel._id).length;
                              return (
                                <div key={panel._id} className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-900">{panel.name}</span>
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                      {panelSlotCount} Candidate(s)
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-600">
                                    <span className="font-semibold text-slate-700">Interviewers:</span>{' '}
                                    {panel.interviewers?.map((iv) => iv.name).join(', ') || 'None assigned'}
                                  </div>
                                  {panel.venueOrLink && (
                                    <div className="text-[10px] text-slate-400 truncate">
                                      Link / Venue: {panel.venueOrLink}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Live Interview Slots Table with Re-Test Button */}
                      {interviewSlots.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Live Queue Slots & Re-Test Actions ({interviewSlots.length})
                          </h4>
                          <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200 tracking-wider">
                                <tr>
                                  <th className="py-2.5 px-3 w-12 text-center">Queue</th>
                                  <th className="py-2.5 px-3">Candidate</th>
                                  <th className="py-2.5 px-3">Panel</th>
                                  <th className="py-2.5 px-3">Slot Time (IST)</th>
                                  <th className="py-2.5 px-3 text-center">Status</th>
                                  <th className="py-2.5 px-3 text-center">Evaluation</th>
                                  <th className="py-2.5 px-3 text-right">TPO Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {interviewSlots.map((s) => {
                                  const student = s.student;
                                  const evaluation = s.evaluation;

                                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                                  if (s.status === 'checked_in') statusBadge = 'bg-amber-100 text-amber-800 border-amber-200';
                                  else if (s.status === 'in_progress') statusBadge = 'bg-sky-100 text-sky-800 border-sky-300 animate-pulse';
                                  else if (s.status === 'completed') statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                  else if (s.status === 'no_show') statusBadge = 'bg-rose-100 text-rose-800 border-rose-200';

                                  return (
                                    <tr key={s._id} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                                        #{s.queueNumber}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <div className="font-bold text-slate-900">{student?.user?.name || 'Student'}</div>
                                        <div className="text-[11px] text-slate-500 font-mono">
                                          {student?.enrollmentNo} • {student?.branch}
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                                        {s.panel?.name || 'Panel'}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                                        {formatISTTime(s.startTime)} - {formatISTTime(s.endTime)}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusBadge}`}>
                                          {s.status.replace('_', ' ')}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        {evaluation ? (
                                          <span className="font-black text-indigo-700 text-xs">
                                            {evaluation.score}% ({evaluation.recommendation?.replace('_', ' ')})
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 italic text-[11px]">—</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                          {s.status === 'scheduled' && (
                                            <>
                                              <button
                                                onClick={() => handleTpoUpdateSlotStatus(s._id, 'checked_in')}
                                                className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold text-[10px] cursor-pointer"
                                              >
                                                Check In
                                              </button>
                                              <button
                                                onClick={() => handleTpoUpdateSlotStatus(s._id, 'no_show')}
                                                className="px-2 py-0.5 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-[10px] cursor-pointer"
                                              >
                                                No-Show
                                              </button>
                                            </>
                                          )}

                                          {s.status === 'checked_in' && (
                                            <button
                                              onClick={() => handleTpoUpdateSlotStatus(s._id, 'no_show')}
                                              className="px-2 py-0.5 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-[10px] cursor-pointer"
                                            >
                                              Mark No-Show
                                            </button>
                                          )}

                                          {s.status === 'no_show' && (
                                            <button
                                              onClick={() => handleAllowRetest(s._id, student?.user?.name)}
                                              disabled={allowingRetestId === s._id}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                                            >
                                              <RotateCw className="w-3 h-3" />
                                              <span>{allowingRetestId === s._id ? 'Allowing...' : 'Allow Re-test'}</span>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* On-Platform Aptitude Assessment Read-Only Status & Re-Test (Task 32B) */}
                  {currentRound.deliveryMode === 'platform_test' && (
                    <div className="space-y-4 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                              On-Platform Aptitude Assessment (Read-Only Status)
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Real-time assessment progress monitoring, completion rates, candidate scores, and re-test authority.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => fetchAptitudeData(currentRound._id)}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                            <span>Refresh Status</span>
                          </button>
                        </div>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center">
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Enrolled</span>
                          <span className="text-base font-black text-slate-800">
                            {aptitudeSummary?.totalEnrolled ?? currentRound.metrics?.totalEnrolled ?? 0}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Submitted</span>
                          <span className="text-base font-black">{aptitudeSummary?.submittedCount ?? 0}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800">
                          <span className="text-[10px] uppercase font-bold text-sky-700 block">In Progress</span>
                          <span className="text-base font-black">{aptitudeSummary?.inProgressCount ?? 0}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                          <span className="text-[10px] uppercase font-bold text-amber-700 block">Not Started</span>
                          <span className="text-base font-black">{aptitudeSummary?.notStartedCount ?? 0}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
                          <span className="text-[10px] uppercase font-bold text-rose-700 block">Absent</span>
                          <span className="text-base font-black">{aptitudeSummary?.absentCount ?? 0}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900">
                          <span className="text-[10px] uppercase font-bold text-indigo-700 block">Average Score</span>
                          <span className="text-base font-black">{aptitudeSummary?.averageScore ?? 0}%</span>
                        </div>
                      </div>

                      {/* Candidate Results Table */}
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="py-3 px-4">Candidate</th>
                                <th className="py-3 px-4">Branch</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-center">Time Taken</th>
                                <th className="py-3 px-4 text-center">Tab Switches</th>
                                <th className="py-3 px-4 text-center">Score / Total</th>
                                <th className="py-3 px-4 text-center">Outcome</th>
                                <th className="py-3 px-4 text-center">TPO Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {aptitudeResults.length === 0 ? (
                                <tr>
                                  <td colSpan="8" className="py-8 text-center text-slate-400">
                                    {loadingAptitude
                                      ? 'Loading assessment records...'
                                      : 'No candidates enrolled in this assessment round.'}
                                  </td>
                                </tr>
                              ) : (
                                aptitudeResults.map((r) => {
                                  const isSwitched = (r.tabSwitchCount || 0) > 0;
                                  const canRetest =
                                    ['submitted', 'auto_submitted', 'in_progress', 'absent'].includes(r.status) ||
                                    r.hasAttempt;

                                  return (
                                    <tr key={r.participantId} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="py-3 px-4">
                                        <div className="font-bold text-slate-900">{r.name}</div>
                                        <div className="text-[11px] text-slate-500 font-mono">
                                          {r.rollNumber} • {r.email}
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 font-medium">{r.branch}</td>
                                      <td className="py-3 px-4 text-center">
                                        <span
                                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            r.status === 'submitted'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : r.status === 'auto_submitted'
                                              ? 'bg-amber-100 text-amber-800'
                                              : r.status === 'in_progress'
                                              ? 'bg-sky-100 text-sky-800 animate-pulse'
                                              : r.status === 'absent'
                                              ? 'bg-rose-100 text-rose-800'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {r.status === 'auto_submitted'
                                            ? 'Auto-Submitted'
                                            : r.status.replace('_', ' ')}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono">
                                        {r.timeTakenMinutes !== null ? `${r.timeTakenMinutes}m` : '—'}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        {isSwitched ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                                            <span>{r.tabSwitchCount}</span>
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[11px]">0</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center font-bold">
                                        {r.score !== null ? (
                                          <span>
                                            {r.score} / {r.totalMarks} ({r.percentage}%)
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 italic font-normal">Pending</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <span
                                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                            r.result === 'cleared'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : r.result === 'rejected'
                                              ? 'bg-rose-100 text-rose-800'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {r.result}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        {canRetest ? (
                                          <button
                                            type="button"
                                            onClick={() => handleAllowAptitudeRetest(r.studentId, r.name)}
                                            disabled={allowingAptitudeRetestId === r.studentId}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] border border-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                                            title="Reset candidate's attempt and allow re-test"
                                          >
                                            <RotateCw className="w-3 h-3" />
                                            <span>
                                              {allowingAptitudeRetestId === r.studentId
                                                ? 'Resetting...'
                                                : 'Allow Re-test'}
                                            </span>
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 text-[11px]">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Batches in Current Round */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Scheduled Batches ({currentRound.batches?.length || 0})
                    </h3>
                    {currentRound.batches?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No batches created for this round yet. Recruiter will auto-split or create slots.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {currentRound.batches.map((b) => (
                          <div key={b._id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-slate-900">
                              <span>{b.batchName}</span>
                              <span className="text-[10px] font-semibold text-indigo-600">Cap: {b.capacity}</span>
                            </div>
                            <div className="text-slate-600 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-slate-500 truncate">
                              <strong>Venue/Link:</strong> {b.venueOrLink}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Participants Table */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Round Participants ({currentRound.participants?.length || 0})
                    </h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Enrollment</th>
                            <th className="py-2.5 px-3">Student Name</th>
                            <th className="py-2.5 px-3">Branch</th>
                            <th className="py-2.5 px-3">Batch Slot</th>
                            <th className="py-2.5 px-3">Attendance</th>
                            <th className="py-2.5 px-3">Result</th>
                            <th className="py-2.5 px-3 text-right">Score</th>
                            {['technical', 'hr', 'group_discussion'].includes(currentRound.type) && (
                              <th className="py-2.5 px-3 text-right">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentRound.participants?.map((p) => (
                            <tr key={p._id} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 font-mono font-semibold">{p.student?.enrollmentNo || '—'}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{p.student?.user?.name || 'Student'}</td>
                              <td className="py-2.5 px-3 text-slate-600">{p.student?.branch || '—'}</td>
                              <td className="py-2.5 px-3 text-slate-600">{p.batch?.batchName || 'Unassigned'}</td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  p.attendance === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                  p.attendance === 'absent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {p.attendance}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  p.result === 'cleared' ? 'bg-emerald-100 text-emerald-700' :
                                  p.result === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {p.result}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                {p.score !== null ? p.score : '—'}
                              </td>
                              {['technical', 'hr', 'group_discussion'].includes(currentRound.type) && (() => {
                                const matchingSlot = interviewSlots.find((s) => s.student?._id === p.student?._id);
                                return (
                                  <td className="py-2.5 px-3 text-right">
                                    {matchingSlot && matchingSlot.status === 'no_show' ? (
                                      <button
                                        onClick={() => handleAllowRetest(matchingSlot._id, p.student?.user?.name)}
                                        disabled={allowingRetestId === matchingSlot._id}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                                      >
                                        <RotateCw className="w-3 h-3" />
                                        <span>{allowingRetestId === matchingSlot._id ? 'Allowing...' : 'Allow Re-test'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">—</span>
                                    )}
                                  </td>
                                );
                              })()}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: APPLICANTS LIST */}
      {activeTab === 'applicants' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-sm text-slate-900">
              Registered Drive Applicants ({filteredApplicants.length})
            </h3>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={applicantSearch}
                onChange={(e) => setApplicantSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Enrollment</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Branch</th>
                  <th className="py-2.5 px-3">CGPA</th>
                  <th className="py-2.5 px-3">Backlogs</th>
                  <th className="py-2.5 px-3">Applied Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApplicants.map((app) => (
                  <tr key={app._id} className={app.isExcluded ? 'bg-rose-50/40 opacity-75' : 'hover:bg-slate-50/60'}>
                    <td className="py-2.5 px-3 font-mono font-semibold">{app.student?.enrollmentNo || '—'}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{app.student?.user?.name || 'Student'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{app.student?.branch || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{app.student?.cgpa || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{app.student?.backlogs ?? '0'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{new Date(app.appliedOn).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3">
                      {app.isExcluded ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          Excluded by TPO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                          {app.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!drive.applicationsClosed && !app.isExcluded && (
                        <button
                          onClick={() => handleExcludeApplicant(app.student._id, app.student?.user?.name)}
                          className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-[11px] font-semibold cursor-pointer"
                          title="Exclude candidate from drive before freezing list"
                        >
                          Exclude
                        </button>
                      )}
                      {drive.applicationsClosed && (
                        <span className="text-[11px] text-slate-400 italic">Frozen</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE SHEET */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Attendance Verification Sheet</h3>
              <p className="text-xs text-slate-500">
                Mark attendance for candidates appearing in rounds. Absent students are automatically excluded from subsequent rounds.
              </p>
            </div>
            {currentRound && (
              <span className="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
                Active: {currentRound.name}
              </span>
            )}
          </div>

          {currentRound?.participants?.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No participants enrolled in this round.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Enrollment</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Assigned Batch</th>
                    <th className="py-2.5 px-3">Current Attendance</th>
                    <th className="py-2.5 px-3 text-right">Set Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentRound?.participants?.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono font-semibold">{p.student?.enrollmentNo}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{p.student?.user?.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{p.batch?.batchName || 'Unassigned'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          p.attendance === 'present' ? 'bg-emerald-100 text-emerald-700' :
                          p.attendance === 'absent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.attendance}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleSaveAttendance(currentRound._id, [{ participantId: p._id, attendance: 'present' }])}
                            disabled={savingAttendance || !p.batch}
                            title={!p.batch ? 'Candidate must be assigned to a batch slot before marking present' : 'Mark present'}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                              !p.batch
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                : p.attendance === 'present'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            onClick={() => handleSaveAttendance(currentRound._id, [{ participantId: p._id, attendance: 'absent' }])}
                            disabled={savingAttendance}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                              p.attendance === 'absent'
                                ? 'bg-rose-600 text-white'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DAY-WISE CLASH REPORT */}
      {activeTab === 'clashes' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Institutional Clash Report
              </h3>
              <p className="text-xs text-slate-500">
                Detect student double-bookings and venue scheduling conflicts across all college drives for the day.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Select Date:</label>
              <input
                type="date"
                value={clashDate}
                onChange={(e) => setClashDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {loadingClashes ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <RotateCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
              Checking daily schedules for clashes...
            </div>
          ) : !clashReport ? (
            <p className="text-xs text-slate-400 py-6 text-center">No clash report available for selected date.</p>
          ) : clashReport.totalClashes === 0 ? (
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-emerald-900 text-sm">Zero Clashes Detected for {clashDate}</h4>
              <p className="text-xs text-emerald-700">
                All {clashReport.totalBatches} batch slots and student assignments on this day are completely conflict-free.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-semibold">
                ⚠️ Found {clashReport.totalClashes} clash conflict(s): {clashReport.studentClashes?.length || 0} student conflict(s) and {clashReport.venueClashes?.length || 0} venue double-booking(s).
              </div>

              {/* Student Clashes */}
              {clashReport.studentClashes?.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2">
                    Student Overlap Conflicts ({clashReport.studentClashes.length})
                  </h4>
                  <div className="space-y-2">
                    {clashReport.studentClashes.map((c, i) => (
                      <div key={i} className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl text-xs space-y-1">
                        <div className="font-bold text-slate-900">
                          {c.studentName} ({c.enrollmentNo} - {c.branch})
                        </div>
                        <div className="text-rose-700 space-y-0.5">
                          {c.conflict?.map((conf, j) => (
                            <p key={j}>• {conf.batchName} ({conf.venue}): <strong>{conf.time}</strong></p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Venue Clashes */}
              {clashReport.venueClashes?.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2">
                    Venue Double-Booking Conflicts ({clashReport.venueClashes.length})
                  </h4>
                  <div className="space-y-2">
                    {clashReport.venueClashes.map((vc, i) => (
                      <div key={i} className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl text-xs space-y-1">
                        <div className="font-bold text-slate-900">
                          Venue: <span className="text-amber-800 underline">{vc.venue}</span>
                        </div>
                        <div className="text-slate-600">
                          <p>1. {vc.batch1.driveRole} - {vc.batch1.roundName} ({vc.batch1.batchName}): <strong>{vc.batch1.time}</strong></p>
                          <p>2. {vc.batch2.driveRole} - {vc.batch2.roundName} ({vc.batch2.batchName}): <strong>{vc.batch2.time}</strong></p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal: Freeze List */}
      {freezeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Close Applications & Freeze List?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Closing applications locks the applicant roster for <strong>{drive.role}</strong>.
                No new students can apply or withdraw. Default selection rounds will be automatically initialized and Round 1 will be populated with all current valid applicants.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              <strong>Total applicants to enroll in Round 1:</strong> {metrics.validApplicants || 0} student(s)
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setFreezeModalOpen(false)}
                disabled={freezing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFreezeApplications}
                disabled={freezing}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {freezing ? <RotateCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{freezing ? 'Freezing List...' : 'Confirm & Freeze'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Round Announcement Modal */}
      {announcementModalOpen && currentRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Broadcast Round Announcement</h3>
                  <p className="text-xs text-slate-500">
                    Round {currentRound.order}: {currentRound.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingPreview ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Fetching participant count...</p>
              </div>
            ) : (
              <div>
                {/* Recipient Count Indicator */}
                <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-2xl flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-semibold text-purple-900">
                      Recipients: All enrolled candidates in this round
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white shadow-xs">
                    {announcementPreview?.participantCount ?? currentRound.metrics?.totalEnrolled ?? 0} Students
                  </span>
                </div>

                {!showConfirmSend ? (
                  <form onSubmit={handleSendAnnouncement} className="space-y-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Subject</label>
                      <input
                        type="text"
                        placeholder="e.g., Important Instructions for Technical Interview"
                        value={announcementForm.subject}
                        onChange={(e) =>
                          setAnnouncementForm({ ...announcementForm, subject: e.target.value })
                        }
                        required
                        className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Message Content</label>
                      <textarea
                        rows="4"
                        placeholder="Write your announcement message here. This will be formatted and delivered via email and in-app notification..."
                        value={announcementForm.message}
                        onChange={(e) =>
                          setAnnouncementForm({ ...announcementForm, message: e.target.value })
                        }
                        required
                        className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                      />
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Replies will be routed directly to your TPO desk email address.
                    </p>

                    <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setAnnouncementModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!announcementForm.subject.trim() || !announcementForm.message.trim()}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        Review & Send
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span>Confirm Announcement Broadcast</span>
                      </div>
                      <p className="text-amber-800 text-[11px]">
                        Are you sure you want to broadcast this message to all{' '}
                        <strong>
                          {announcementPreview?.participantCount ?? currentRound.metrics?.totalEnrolled ?? 0}
                        </strong>{' '}
                        participants? In-app notifications and email alerts will be dispatched immediately.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Subject</span>
                        <span className="font-bold text-slate-900">{announcementForm.subject}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Message</span>
                        <p className="text-slate-700 whitespace-pre-wrap">{announcementForm.message}</p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowConfirmSend(false)}
                        disabled={isSendingAnnouncement}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      >
                        Back to Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleSendAnnouncement}
                        disabled={isSendingAnnouncement}
                        className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                      >
                        {isSendingAnnouncement ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Confirm & Send Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DriveProgress;

