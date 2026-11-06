import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  ArrowRight,
  ArrowLeft,
  Layers,
  Sparkles,
  Award,
  ChevronRight,
  Split,
  FileSpreadsheet,
  Send,
  HelpCircle,
  FileText,
  BookOpen,
  RotateCw,
  Search,
  Filter,
  Settings,
  Video,
  Play,
  Star,
  MessageSquare,
  ExternalLink,
  Plus,
  Trash2,
  UserCheck,
  Check,
  X,
  Radio,
  Eye,
  AlertCircle,
  PhoneCall,
  Copy,
  MapPin,
  Megaphone,
} from 'lucide-react';
import toast from 'react-hot-toast';

const DrivePipeline = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [driveData, setDriveData] = useState(null);
  const [activeTab, setActiveTab] = useState(0); // number for round index, or 'offers'
  const [batchFilter, setBatchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('all');

  // Modals
  const [autoSplitModalOpen, setAutoSplitModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [moveBatchModalOpen, setMoveBatchModalOpen] = useState(false);
  const [roundSettingsModalOpen, setRoundSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    type: 'technical',
    deliveryMode: '',
    mode: '',
    date: '',
    durationMinutes: '',
    venueOrLink: '',
    reportByTime: '',
    testWindowStart: '',
    testWindowEnd: '',
    instructions: '',
    cutoffScore: '',
    shuffleQuestions: true,
    shuffleOptions: false,
    negativeMarking: false,
    showScoreToStudents: false,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [notifyConfirmOpen, setNotifyConfirmOpen] = useState(false);
  const [pendingSettingsPayload, setPendingSettingsPayload] = useState(null);

  // Question Bank & Platform Test State (Task 32B)
  const [questionBankModalOpen, setQuestionBankModalOpen] = useState(false);
  const [questionsList, setQuestionsList] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionStats, setQuestionStats] = useState({ questionCount: 0, totalMarks: 0, isLocked: false });

  // Question Add/Edit Form Modal State
  const [questionFormModalOpen, setQuestionFormModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    marks: 1,
    negativeMarks: 0,
    section: '',
  });
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Question CSV Import Modal State
  const [questionCsvModalOpen, setQuestionCsvModalOpen] = useState(false);
  const [questionCsvText, setQuestionCsvText] = useState('');
  const [questionCsvFile, setQuestionCsvFile] = useState(null);
  const [isImportingQuestions, setIsImportingQuestions] = useState(false);
  const [questionCsvReport, setQuestionCsvReport] = useState(null);

  // Platform Test Results State
  const [testResults, setTestResults] = useState([]);
  const [testSummary, setTestSummary] = useState(null);
  const [loadingTestResults, setLoadingTestResults] = useState(false);

  const [shortlistModalOpen, setShortlistModalOpen] = useState(false);
  const [cutoffInput, setCutoffInput] = useState('');
  const [isApplyingShortlist, setIsApplyingShortlist] = useState(false);

  // Round Announcement Modal State
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ subject: '', message: '' });
  const [announcementPreview, setAnnouncementPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);

  // Auto Split Form State
  const [splitForm, setSplitForm] = useState({
    capacity: 30,
    startTime: '',
    slotDurationMinutes: 60,
    venueOrLink: 'Conference Hall / Virtual Link',
    mode: 'offline',
  });
  const [isSplitting, setIsSplitting] = useState(false);

  // Move Participant State
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [targetBatchId, setTargetBatchId] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [csvReport, setCsvReport] = useState(null);

  // Bulk Edit State (in-table attendance & results)
  const [localParticipants, setLocalParticipants] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Offer Form State
  const [offerForm, setOfferForm] = useState({
    packageLpa: '',
    joiningDate: '',
    expiryDate: '',
    role: '',
    selectedStudentIds: [],
  });
  const [isSubmittingOffers, setIsSubmittingOffers] = useState(false);

  // Interview Conduct Feature State (Task 29B)
  const [roundViewMode, setRoundViewMode] = useState('conduct'); // 'conduct' | 'roster'
  const [panels, setPanels] = useState([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedPanelFilter, setSelectedPanelFilter] = useState('all');
  const [selectedSlotStatusFilter, setSelectedSlotStatusFilter] = useState('all');
  const [activeVideoSlot, setActiveVideoSlot] = useState(null);

  // Panel Setup Modal State
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [editingPanelId, setEditingPanelId] = useState(null);
  const [panelForm, setPanelForm] = useState({
    name: '',
    venueOrLink: '',
    room: '',
    capacity: 1,
    interviewers: [{ name: '', email: '' }],
  });
  const [isSavingPanel, setIsSavingPanel] = useState(false);

  // Auto-Schedule Modal State
  const [autoScheduleModalOpen, setAutoScheduleModalOpen] = useState(false);
  const [autoScheduleForm, setAutoScheduleForm] = useState({
    startTime: '',
    slotDurationMinutes: 30,
    breakMinutes: 0,
  });
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);

  // Evaluation Modal State
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
  const [activeSlotForEval, setActiveSlotForEval] = useState(null);
  const [evalForm, setEvalForm] = useState({
    technical: 4,
    problemSolving: 4,
    communication: 4,
    comments: '',
    recommendation: 'hire',
    sharedWithStudent: false,
  });
  const [isSubmittingEval, setIsSubmittingEval] = useState(false);
  const [callingNextPanelId, setCallingNextPanelId] = useState(null);

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

  const getISTDateDefault = (dateVal) => {
    const d = dateVal ? new Date(dateVal) : new Date();
    const istDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return `${istDateStr}T10:00`;
  };

  const fetchDriveProgress = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/drives/${id}/progress`);
      if (res.data.success) {
        setDriveData(res.data);
      }
    } catch (err) {
      console.error('Failed to load drive pipeline:', err);
      toast.error(err.response?.data?.message || 'Unable to fetch recruitment pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDriveProgress();
  }, [id]);

  // Sync active round participants into local editable state
  useEffect(() => {
    if (!driveData || !driveData.rounds || driveData.rounds.length === 0) return;

    if (activeTab !== 'offers' && driveData.rounds[activeTab]) {
      const currentRound = driveData.rounds[activeTab];
      setLocalParticipants(
        currentRound.participants.map((p) => ({
          _id: p._id,
          student: p.student,
          batch: p.batch,
          attendance: p.attendance || 'pending',
          result: p.result || 'pending',
          score: p.score ?? '',
          feedback: p.feedback || '',
        }))
      );
      setSelectedIds([]);
      setBatchFilter('all');
    }
  }, [driveData, activeTab]);

  const rounds = driveData?.rounds || [];
  const drive = driveData?.drive;
  const currentRound = typeof activeTab === 'number' ? rounds[activeTab] : null;
  const batches = currentRound?.batches || [];

  const isInterviewRound = Boolean(currentRound && ['technical', 'hr', 'group_discussion'].includes(currentRound.type));
  const isPlatformTest = Boolean(currentRound && currentRound.deliveryMode === 'platform_test');

  const fetchPanelsAndSlots = async (roundId) => {
    if (!roundId) return;
    setLoadingPanels(true);
    setLoadingSlots(true);
    try {
      const [panelsRes, slotsRes] = await Promise.allSettled([
        api.get(`/rounds/${roundId}/panels`),
        api.get(`/rounds/${roundId}/slots`),
      ]);

      if (panelsRes.status === 'fulfilled' && panelsRes.value.data.success) {
        setPanels(panelsRes.value.data.panels || []);
      }
      if (slotsRes.status === 'fulfilled' && slotsRes.value.data.success) {
        const fetchedSlots = slotsRes.value.data.slots || [];
        setSlots(fetchedSlots);
        // Spotlight must never render automatically; only refresh currently active slot if still valid and not completed/no-show
        setActiveVideoSlot((prev) => {
          if (!prev) return null;
          const updated = fetchedSlots.find((s) => s._id === prev._id);
          if (!updated || ['completed', 'no_show', 'cancelled'].includes(updated.status)) {
            return null;
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to load interview panels and slots:', err);
    } finally {
      setLoadingPanels(false);
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (isInterviewRound && currentRound?._id) {
      fetchPanelsAndSlots(currentRound._id);
      setRoundViewMode('conduct');
    } else {
      setRoundViewMode('roster');
    }
  }, [currentRound?._id, currentRound?.type]);

  const fetchQuestions = async (roundId) => {
    if (!roundId) return;
    setLoadingQuestions(true);
    try {
      const res = await api.get(`/rounds/${roundId}/questions`);
      if (res.data.success) {
        setQuestionsList(res.data.questions || []);
        setQuestionStats({
          questionCount: res.data.questionCount || 0,
          totalMarks: res.data.totalMarks || 0,
          isLocked: Boolean(res.data.isLocked),
        });
      }
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const fetchTestResults = async (roundId) => {
    if (!roundId) return;
    setLoadingTestResults(true);
    try {
      const res = await api.get(`/rounds/${roundId}/test-results`);
      if (res.data.success) {
        setTestResults(res.data.results || []);
        setTestSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load test results:', err);
    } finally {
      setLoadingTestResults(false);
    }
  };

  useEffect(() => {
    if (currentRound && currentRound.deliveryMode === 'platform_test') {
      fetchQuestions(currentRound._id);
      fetchTestResults(currentRound._id);
    }
  }, [currentRound?._id, currentRound?.deliveryMode]);

  const handleOpenQuestionForm = (question = null) => {
    if (question) {
      setEditingQuestionId(question._id);
      setQuestionForm({
        text: question.text || '',
        options: question.options && question.options.length === 4 ? [...question.options] : ['', '', '', ''],
        correctIndex: question.correctIndex ?? 0,
        marks: question.marks ?? 1,
        negativeMarks: question.negativeMarks ?? 0,
        section: question.section || '',
      });
    } else {
      setEditingQuestionId(null);
      setQuestionForm({
        text: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        marks: 1,
        negativeMarks: 0,
        section: '',
      });
    }
    setQuestionFormModalOpen(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!currentRound) return;

    if (!questionForm.text.trim()) {
      toast.error('Question text is required');
      return;
    }
    if (questionForm.options.some((o) => !o.trim())) {
      toast.error('All 4 options must be non-empty');
      return;
    }

    setIsSavingQuestion(true);
    try {
      if (editingQuestionId) {
        const res = await api.put(`/questions/${editingQuestionId}`, questionForm);
        if (res.data.success) {
          toast.success('Question updated successfully');
          setQuestionFormModalOpen(false);
          fetchQuestions(currentRound._id);
          fetchDriveProgress();
        }
      } else {
        const res = await api.post(`/rounds/${currentRound._id}/questions`, questionForm);
        if (res.data.success) {
          toast.success('Question added successfully');
          setQuestionFormModalOpen(false);
          fetchQuestions(currentRound._id);
          fetchDriveProgress();
        }
      }
    } catch (err) {
      console.error('Failed to save question:', err);
      toast.error(err.response?.data?.message || 'Failed to save question');
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      const res = await api.delete(`/questions/${questionId}`);
      if (res.data.success) {
        toast.success('Question deleted successfully');
        fetchQuestions(currentRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
      toast.error(err.response?.data?.message || 'Failed to delete question');
    }
  };

  const handleImportQuestionsCsv = async (e) => {
    e.preventDefault();
    if (!currentRound) return;

    setIsImportingQuestions(true);
    setQuestionCsvReport(null);
    try {
      let res;
      if (questionCsvFile) {
        const formData = new FormData();
        formData.append('file', questionCsvFile);
        res = await api.post(`/rounds/${currentRound._id}/questions/import`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else if (questionCsvText.trim()) {
        res = await api.post(`/rounds/${currentRound._id}/questions/import`, { csvData: questionCsvText });
      } else {
        toast.error('Please upload a CSV file or paste CSV text');
        setIsImportingQuestions(false);
        return;
      }

      if (res.data.success) {
        setQuestionCsvReport(res.data);
        if (res.data.importedCount > 0) {
          toast.success(`Successfully imported ${res.data.importedCount} questions!`);
          fetchQuestions(currentRound._id);
          fetchDriveProgress();
        }
      }
    } catch (err) {
      console.error('CSV import error:', err);
      toast.error(err.response?.data?.message || 'CSV import failed');
    } finally {
      setIsImportingQuestions(false);
    }
  };

  const addInterviewerRow = () => {
    setPanelForm((prev) => ({
      ...prev,
      interviewers: [...prev.interviewers, { name: '', email: '' }],
    }));
  };

  const removeInterviewerRow = (idx) => {
    setPanelForm((prev) => ({
      ...prev,
      interviewers: prev.interviewers.filter((_, i) => i !== idx),
    }));
  };

  const updateInterviewerRow = (idx, field, value) => {
    setPanelForm((prev) => ({
      ...prev,
      interviewers: prev.interviewers.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    }));
  };

  const handleOpenCreatePanel = () => {
    setEditingPanelId(null);
    setPanelForm({
      name: `Panel ${panels.length + 1}`,
      venueOrLink: '',
      room: '',
      capacity: 1,
      interviewers: [{ name: '', email: '' }],
    });
    setPanelModalOpen(true);
  };

  const handleOpenEditPanel = (panel) => {
    setEditingPanelId(panel._id);
    setPanelForm({
      name: panel.name,
      venueOrLink: panel.venueOrLink || '',
      room: panel.room || '',
      capacity: panel.capacity || 1,
      interviewers: panel.interviewers?.length
        ? panel.interviewers.map((iv) => ({ name: iv.name, email: iv.email }))
        : [{ name: '', email: '' }],
    });
    setPanelModalOpen(true);
  };

  const handleSavePanel = async (e) => {
    e.preventDefault();
    if (!currentRound) return;
    if (!panelForm.name.trim()) {
      toast.error('Panel name is required');
      return;
    }
    const validInterviewers = panelForm.interviewers.filter((iv) => iv.name.trim());
    if (validInterviewers.length === 0) {
      toast.error('Please specify at least one interviewer with a name');
      return;
    }

    setIsSavingPanel(true);
    try {
      const payload = {
        name: panelForm.name.trim(),
        venueOrLink: panelForm.venueOrLink.trim(),
        room: (panelForm.room || '').trim(),
        capacity: Number(panelForm.capacity) || 1,
        interviewers: validInterviewers,
      };

      if (editingPanelId) {
        const res = await api.put(`/panels/${editingPanelId}`, payload);
        if (res.data.success) {
          toast.success(res.data.message);
          setPanelModalOpen(false);
          fetchPanelsAndSlots(currentRound._id);
        }
      } else {
        const res = await api.post(`/rounds/${currentRound._id}/panels`, payload);
        if (res.data.success) {
          toast.success(res.data.message);
          setPanelModalOpen(false);
          fetchPanelsAndSlots(currentRound._id);
        }
      }
    } catch (err) {
      console.error('Save panel error:', err);
      toast.error(err.response?.data?.message || 'Failed to save panel');
    } finally {
      setIsSavingPanel(false);
    }
  };

  const handleDeletePanel = async (panelId) => {
    if (!window.confirm('Are you sure you want to delete this panel? Associated scheduled slots may be affected.')) return;
    try {
      const res = await api.delete(`/panels/${panelId}`);
      if (res.data.success) {
        toast.success(res.data.message);
        if (selectedPanelFilter === panelId) setSelectedPanelFilter('all');
        fetchPanelsAndSlots(currentRound._id);
      }
    } catch (err) {
      console.error('Delete panel error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete panel');
    }
  };

  const handleAutoSchedule = async (e) => {
    e.preventDefault();
    if (!currentRound) return;
    if (!autoScheduleForm.startTime) {
      toast.error('Please select interview start date and time');
      return;
    }
    if (panels.length === 0) {
      toast.error('Please create at least one panel before auto-scheduling slots');
      return;
    }

    setIsAutoScheduling(true);
    try {
      const res = await api.post(`/rounds/${currentRound._id}/slots/auto-schedule`, {
        startTime: autoScheduleForm.startTime,
        slotDurationMinutes: Number(autoScheduleForm.slotDurationMinutes) || 30,
        breakMinutes: Number(autoScheduleForm.breakMinutes) || 0,
      });

      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.clashWarnings?.length > 0) {
          toast((t) => (
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-600 block">Candidate Clash Warnings ({res.data.clashWarnings.length}):</span>
              <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                {res.data.clashWarnings.slice(0, 3).map((w, idx) => (
                  <li key={idx}>{w.candidate ? `${w.candidate}: ${w.reason}` : `${w.panel}: ${w.reason}`}</li>
                ))}
              </ul>
            </div>
          ), { duration: 6000 });
        }
        if (res.data.timeWarnings?.length > 0) {
          toast((t) => (
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-700 block">Schedule Time Warnings ({res.data.timeWarnings.length}):</span>
              <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                {res.data.timeWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          ), { duration: 7000 });
        }
        setAutoScheduleModalOpen(false);
        fetchPanelsAndSlots(currentRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Auto schedule slots error:', err);
      toast.error(err.response?.data?.message || 'Failed to auto-schedule interview slots');
    } finally {
      setIsAutoScheduling(false);
    }
  };

  const handleUpdateSlotStatus = async (slotId, status) => {
    try {
      const res = await api.put(`/slots/${slotId}/status`, { status });
      if (res.data.success) {
        toast.success(res.data.message);
        if (status === 'in_progress') {
          setActiveVideoSlot(res.data.slot);
        } else if (['completed', 'no_show', 'cancelled'].includes(status)) {
          setActiveVideoSlot(null);
        }
        fetchPanelsAndSlots(currentRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Update slot status error:', err);
      toast.error(err.response?.data?.message || 'Failed to update slot status');
    }
  };

  const handleCallNext = async (panelId) => {
    setCallingNextPanelId(panelId);
    try {
      const res = await api.post(`/panels/${panelId}/call-next`);
      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.slot) {
          setActiveVideoSlot(res.data.slot);
        }
        fetchPanelsAndSlots(currentRound._id);
        fetchDriveProgress();
      } else {
        toast.info(res.data.message || 'No candidates currently waiting');
      }
    } catch (err) {
      console.error('Call next error:', err);
      toast.error(err.response?.data?.message || 'Failed to call next candidate');
    } finally {
      setCallingNextPanelId(null);
    }
  };

  const handleOpenEvaluation = (slot) => {
    setActiveSlotForEval(slot);
    if (slot.evaluation) {
      setEvalForm({
        technical: slot.evaluation.criteriaScores?.technical || 4,
        problemSolving: slot.evaluation.criteriaScores?.problemSolving || 4,
        communication: slot.evaluation.criteriaScores?.communication || 4,
        comments: slot.evaluation.comments || '',
        recommendation: slot.evaluation.recommendation || 'hire',
        sharedWithStudent: Boolean(slot.evaluation.sharedWithStudent),
      });
    } else {
      setEvalForm({
        technical: 4,
        problemSolving: 4,
        communication: 4,
        comments: '',
        recommendation: 'hire',
        sharedWithStudent: false,
      });
    }
    setEvaluationModalOpen(true);
  };

  const handleSubmitEvaluation = async (e) => {
    e.preventDefault();
    if (!activeSlotForEval) return;

    setIsSubmittingEval(true);
    try {
      const payload = {
        criteriaScores: {
          technical: Number(evalForm.technical),
          problemSolving: Number(evalForm.problemSolving),
          communication: Number(evalForm.communication),
        },
        comments: evalForm.comments.trim(),
        recommendation: evalForm.recommendation,
        sharedWithStudent: Boolean(evalForm.sharedWithStudent),
      };

      const res = await api.post(`/slots/${activeSlotForEval._id}/evaluation`, payload);
      if (res.data.success) {
        toast.success(res.data.message);
        setEvaluationModalOpen(false);
        setActiveSlotForEval(null);
        fetchPanelsAndSlots(currentRound._id);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Submit evaluation error:', err);
      toast.error(err.response?.data?.message || 'Failed to submit evaluation');
    } finally {
      setIsSubmittingEval(false);
    }
  };

  // Initialize offer form when drive loads
  useEffect(() => {
    if (drive) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 7);
      setOfferForm((prev) => ({
        ...prev,
        packageLpa: drive.packageLpa || '',
        role: drive.role || '',
        expiryDate: expDate.toISOString().split('T')[0],
      }));
    }
  }, [drive]);

  // Handle participant change
  const handleParticipantChange = (id, field, value) => {
    if (field === 'attendance' && value === 'present') {
      const target = localParticipants.find((item) => item._id === id);
      if (target && !target.batch) {
        toast.error('Cannot mark candidate as present without an assigned batch slot.');
        return;
      }
    }

    setLocalParticipants((prev) =>
      prev.map((item) => {
        if (item._id === id) {
          const updated = { ...item, [field]: value };
          // If marked absent, auto set result to rejected
          if (field === 'attendance' && value === 'absent') {
            updated.result = 'rejected';
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Select all / toggle
  const toggleSelectAll = (filteredList) => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map((p) => p._id));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Bulk set attendance for selected
  const applyBulkAttendance = (status) => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one candidate first');
      return;
    }

    if (status === 'present') {
      const unbatched = localParticipants.filter(
        (p) => selectedIds.includes(p._id) && !p.batch
      );
      if (unbatched.length > 0) {
        toast.error(
          `Cannot mark ${unbatched.length} candidate(s) without an assigned batch as present. Please auto-split or assign them to a batch first.`
        );
        return;
      }
    }

    setLocalParticipants((prev) =>
      prev.map((item) => {
        if (selectedIds.includes(item._id)) {
          const updated = { ...item, attendance: status };
          if (status === 'absent') updated.result = 'rejected';
          return updated;
        }
        return item;
      })
    );
    toast.success(`Marked ${selectedIds.length} candidate(s) as ${status}`);
  };

  // Bulk set results for selected
  const applyBulkResult = (result) => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one candidate first');
      return;
    }
    setLocalParticipants((prev) =>
      prev.map((item) => {
        if (selectedIds.includes(item._id)) {
          return { ...item, result };
        }
        return item;
      })
    );
    toast.success(`Marked ${selectedIds.length} candidate(s) as ${result}`);
  };

  // Save Attendance to API
  const handleSaveAttendance = async () => {
    if (!currentRound) return;
    setIsSavingAttendance(true);
    try {
      const attendanceList = localParticipants.map((p) => ({
        participantId: p._id,
        attendance: p.attendance,
      }));

      const res = await api.put(`/rounds/${currentRound._id}/attendance`, { attendanceList });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to update attendance:', err);
      toast.error(err.response?.data?.message || 'Failed to update attendance');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Save Results to API
  const handleSaveResults = async () => {
    if (!currentRound) return;
    setIsSavingResults(true);
    try {
      const resultsList = localParticipants.map((p) => ({
        participantId: p._id,
        result: p.result,
        score: p.score,
        feedback: p.feedback,
      }));

      const res = await api.put(`/rounds/${currentRound._id}/results`, { resultsList });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to update results:', err);
      toast.error(err.response?.data?.message || 'Failed to update candidate results');
    } finally {
      setIsSavingResults(false);
    }
  };

  // Save Round Settings
  const handleSaveRoundSettings = async (e) => {
    e.preventDefault();
    if (!currentRound) return;

    // Delivery mode validation
    if (settingsForm.deliveryMode === 'platform_test') {
      if (settingsForm.type !== 'aptitude' && settingsForm.type !== 'coding') {
        toast.error('Platform test is only available for aptitude and coding rounds. Interviews and group discussions cannot use platform test.');
        return;
      }
    } else if (settingsForm.deliveryMode === 'online_external') {
      if (settingsForm.venueOrLink && !/^https?:\/\//i.test(settingsForm.venueOrLink.trim())) {
        toast.error('Online meeting link must be a valid URL starting with http:// or https://');
        return;
      }
    } else if (settingsForm.deliveryMode === 'offline_campus') {
      if (!settingsForm.venueOrLink || !settingsForm.venueOrLink.trim()) {
        toast.error('Physical Campus Venue is required for offline campus rounds.');
        return;
      }
    }

    const payload = {
      name: settingsForm.name,
      type: settingsForm.type,
      deliveryMode: settingsForm.deliveryMode,
      mode: settingsForm.deliveryMode === 'offline_campus' ? 'offline' : (settingsForm.deliveryMode ? 'online' : settingsForm.mode),
      date: settingsForm.date ? new Date(settingsForm.date) : null,
      testWindowStart: settingsForm.testWindowStart ? new Date(settingsForm.testWindowStart) : null,
      testWindowEnd: settingsForm.testWindowEnd ? new Date(settingsForm.testWindowEnd) : null,
      reportByTime: settingsForm.reportByTime ? settingsForm.reportByTime.trim() : '',
      durationMinutes:
        settingsForm.durationMinutes !== '' && settingsForm.durationMinutes !== null
          ? Number(settingsForm.durationMinutes)
          : null,
      venueOrLink: settingsForm.venueOrLink,
      instructions: settingsForm.instructions,
      cutoffScore:
        settingsForm.cutoffScore !== '' && settingsForm.cutoffScore !== null
          ? Number(settingsForm.cutoffScore)
          : null,
      shuffleQuestions: Boolean(settingsForm.shuffleQuestions),
      shuffleOptions: Boolean(settingsForm.shuffleOptions),
      negativeMarking: Boolean(settingsForm.negativeMarking),
      showScoreToStudents: Boolean(settingsForm.showScoreToStudents),
    };

    const participantCount = currentRound.participants?.length || 0;
    if (participantCount > 0) {
      setPendingSettingsPayload(payload);
      setNotifyConfirmOpen(true);
    } else {
      await executeSaveRoundSettings(payload, false);
    }
  };

  const executeSaveRoundSettings = async (payloadToSave, notifyStudents) => {
    setIsSavingSettings(true);
    try {
      const payload = {
        ...(payloadToSave || pendingSettingsPayload),
        notifyStudents: Boolean(notifyStudents),
      };

      const res = await api.put(`/rounds/${currentRound._id}/settings`, payload);
      if (res.data.success) {
        toast.success(res.data.message || 'Round settings updated successfully');
        setRoundSettingsModalOpen(false);
        setNotifyConfirmOpen(false);
        setPendingSettingsPayload(null);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to update round settings:', err);
      toast.error(err.response?.data?.message || 'Failed to update round settings');
    } finally {
      setIsSavingSettings(false);
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
      console.error('Download attendance PDF error:', err);
      toast.error('Failed to download attendance sheet PDF');
    }
  };

  // Apply Shortlist by Cutoff
  const handleApplyShortlist = async () => {
    if (!currentRound) return;
    const numCutoff = Number(cutoffInput);
    if (cutoffInput === '' || isNaN(numCutoff) || numCutoff < 0) {
      toast.error('Please enter a valid non-negative cutoff score');
      return;
    }

    setIsApplyingShortlist(true);
    try {
      const res = await api.post(`/rounds/${currentRound._id}/shortlist-by-cutoff`, {
        cutoffScore: numCutoff,
        apply: true,
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setShortlistModalOpen(false);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to apply cutoff shortlist:', err);
      toast.error(err.response?.data?.message || 'Failed to apply cutoff shortlist');
    } finally {
      setIsApplyingShortlist(false);
    }
  };

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

  // Auto Split Batches Submission
  const handleAutoSplit = async (e) => {
    e.preventDefault();
    if (!currentRound) return;

    if (!splitForm.startTime) {
      toast.error('Please provide a start date and time');
      return;
    }

    setIsSplitting(true);
    try {
      const res = await api.post(`/rounds/${currentRound._id}/batches/auto-split`, {
        capacity: Number(splitForm.capacity),
        startTime: splitForm.startTime,
        slotDurationMinutes: Number(splitForm.slotDurationMinutes),
        venueOrLink: splitForm.venueOrLink,
        mode: splitForm.mode,
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setAutoSplitModalOpen(false);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Auto split error:', err);
      toast.error(err.response?.data?.message || 'Failed to auto split into batches');
    } finally {
      setIsSplitting(false);
    }
  };

  // Move Participant Batch Submission
  const handleMoveBatch = async () => {
    if (!selectedParticipant || !targetBatchId) return;

    setIsMoving(true);
    try {
      const res = await api.put(`/rounds/${currentRound._id}/move-participant`, {
        participantId: selectedParticipant._id,
        targetBatchId,
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setMoveBatchModalOpen(false);
        setSelectedParticipant(null);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Move batch error:', err);
      toast.error(err.response?.data?.message || 'Failed to transfer participant');
    } finally {
      setIsMoving(false);
    }
  };

  // Import Results CSV Submission
  const handleImportCSV = async (e) => {
    e.preventDefault();
    if (!currentRound) return;

    setIsImporting(true);
    setCsvReport(null);
    try {
      let payload;
      let headers = {};

      if (csvFile) {
        const formData = new FormData();
        formData.append('file', csvFile);
        payload = formData;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else if (csvText.trim()) {
        payload = { csvData: csvText };
      } else {
        toast.error('Please provide a CSV file or paste CSV text');
        setIsImporting(false);
        return;
      }

      const res = await api.post(`/rounds/${currentRound._id}/results/import`, payload, { headers });

      if (res.data.success) {
        toast.success(res.data.message);
        setCsvReport(res.data);
        if (res.data.failedCount === 0) {
          setTimeout(() => {
            setCsvModalOpen(false);
            setCsvText('');
            setCsvFile(null);
            fetchDriveProgress();
          }, 1200);
        } else {
          fetchDriveProgress();
        }
      }
    } catch (err) {
      console.error('CSV import error:', err);
      toast.error(err.response?.data?.message || 'CSV Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  // Publish Round Results Submission
  const handlePublishResults = async () => {
    if (!currentRound) return;

    setIsPublishing(true);
    try {
      const res = await api.post(`/rounds/${currentRound._id}/publish-results`);
      if (res.data.success) {
        toast.success(res.data.message);
        setPublishModalOpen(false);
        await fetchDriveProgress();
        // If there's a next round, move to it, otherwise go to offers
        const nextIndex = activeTab + 1;
        if (nextIndex < rounds.length) {
          setActiveTab(nextIndex);
        } else {
          setActiveTab('offers');
        }
      }
    } catch (err) {
      console.error('Publish error:', err);
      toast.error(err.response?.data?.message || 'Failed to publish results');
    } finally {
      setIsPublishing(false);
    }
  };

  // Extend Bulk Offers Submission
  const handleExtendOffers = async (e) => {
    e.preventDefault();
    if (offerForm.selectedStudentIds.length === 0) {
      toast.error('Select at least one candidate to extend an offer');
      return;
    }

    if (!offerForm.expiryDate) {
      toast.error('Please specify an offer acceptance deadline');
      return;
    }

    setIsSubmittingOffers(true);
    try {
      const offersPayload = offerForm.selectedStudentIds.map((studentId) => ({
        studentId,
        packageLpa: offerForm.packageLpa,
        joiningDate: offerForm.joiningDate || null,
        expiryDate: offerForm.expiryDate,
        role: offerForm.role,
      }));

      const res = await api.post(`/drives/${id}/offers`, { offers: offersPayload });
      if (res.data.success) {
        toast.success(res.data.message);
        setOfferModalOpen(false);
        fetchDriveProgress();
      }
    } catch (err) {
      console.error('Failed to extend offers:', err);
      toast.error(err.response?.data?.message || 'Failed to extend employment offers');
    } finally {
      setIsSubmittingOffers(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold text-slate-500">Loading drive recruitment pipeline...</span>
      </div>
    );
  }

  if (!drive) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Drive Not Found</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">The requested campus recruitment drive does not exist.</p>
        <Link
          to="/recruiter/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  // Filter local participants
  const filteredParticipants = localParticipants.filter((p) => {
    const student = p.student;
    const name = student?.user?.name?.toLowerCase() || '';
    const email = student?.user?.email?.toLowerCase() || '';
    const roll = student?.enrollmentNo?.toLowerCase() || '';

    const matchesSearch =
      name.includes(searchQuery.toLowerCase()) ||
      email.includes(searchQuery.toLowerCase()) ||
      roll.includes(searchQuery.toLowerCase());

    const matchesBatch =
      batchFilter === 'all'
        ? true
        : batchFilter === 'unassigned'
          ? !p.batch
          : p.batch?._id === batchFilter || p.batch === batchFilter;

    const matchesResult = resultFilter === 'all' ? true : p.result === resultFilter;

    return matchesSearch && matchesBatch && matchesResult;
  });

  // Calculate final cleared candidates from the last published round
  const lastPublishedRound = [...rounds].reverse().find((r) => r.resultsPublished);
  const eligibleForOfferCandidates = lastPublishedRound
    ? lastPublishedRound.participants.filter((p) => p.result === 'cleared')
    : [];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Drive Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Link to="/recruiter/dashboard" className="hover:text-sky-600 flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>
              <span>/</span>
              <span className="text-slate-700">Recruitment Pipeline</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{drive.role}</h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${drive.status === 'open'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
              >
                {drive.status === 'open' ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : (
                  <XCircle className="w-3 h-3 text-slate-400" />
                )}
                <span className="capitalize">{drive.status}</span>
              </span>
              {drive.applicationsClosed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                  <span>Applications Frozen</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Applications In Progress</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              College: <span className="font-semibold text-slate-700">{drive.college?.name}</span> • Package:{' '}
              <span className="font-bold text-sky-600">{drive.packageLpa} LPA</span> • Drive Date:{' '}
              <span className="font-semibold text-slate-700">{new Date(drive.driveDate).toLocaleDateString()}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={fetchDriveProgress}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              title="Refresh Pipeline"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Pipeline Key Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Applied</span>
            <span className="text-xl font-black text-slate-900">{driveData.metrics?.totalApplied || 0}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Verified Candidates</span>
            <span className="text-xl font-black text-sky-600">{driveData.metrics?.validApplicants || 0}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Rounds Configured</span>
            <span className="text-xl font-black text-indigo-600">{rounds.length}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Offers Extended</span>
            <span className="text-xl font-black text-emerald-600">
              {driveData.metrics?.totalOffers || 0}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({driveData.metrics?.acceptedOffers || 0} accepted)
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Warning banner if applications not closed */}
      {!drive.applicationsClosed && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">Applications are still open for this drive.</span> Candidate registrations will close
            automatically after the deadline ({new Date(drive.lastDateToApply).toLocaleDateString()}), or when the college TPO
            manually freezes the list. Once frozen, Round 1 will be automatically seeded with all verified candidates.
          </div>
        </div>
      )}

      {/* Rounds Navigation Tabs */}
      {rounds.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Recruitment Rounds Not Initialized</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Recruitment rounds and batches are automatically generated when candidate applications close.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-thin">
            {rounds.map((r, idx) => {
              const isSelected = activeTab === idx;
              return (
                <button
                  key={r._id}
                  onClick={() => setActiveTab(idx)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${isSelected
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                    {r.order}
                  </span>
                  <span>{r.name}</span>
                  {r.resultsPublished ? (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'
                        }`}
                    >
                      Published
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      Draft
                    </span>
                  )}
                </button>
              );
            })}

            {/* Final Tab: Offers & Selection */}
            <button
              onClick={() => setActiveTab('offers')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${activeTab === 'offers'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <Award className="w-4 h-4" />
              <span>Offers & Selection</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === 'offers' ? 'bg-white/25 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
              >
                {driveData.metrics?.totalOffers || 0}
              </span>
            </button>
          </div>

          {/* TAB CONTENT: ROUND DETAILS */}
          {activeTab !== 'offers' && currentRound && (
            <div className="space-y-4">
              {/* Round Summary Card & Action Bar */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold text-xs uppercase">
                        Round {currentRound.order}: {currentRound.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-slate-400 capitalize">
                        • {currentRound.deliveryMode ? currentRound.deliveryMode.replace('_', ' ') : (currentRound.mode || 'mode pending')}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{currentRound.name}</h2>
                    {currentRound.instructions && (
                      <p className="text-xs text-slate-500 italic max-w-2xl">{currentRound.instructions}</p>
                    )}
                  </div>

                  {/* Actions Header */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {(currentRound.deliveryMode === 'offline_campus' || currentRound.mode === 'offline') && (
                      <button
                        onClick={handleDownloadAttendancePdf}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors cursor-pointer border border-emerald-200/60"
                        title="Download printable candidate attendance sheet as PDF"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Attendance Sheet (PDF)</span>
                      </button>
                    )}

                    {currentRound?.deliveryMode === 'platform_test' && (
                      <button
                        onClick={() => {
                          fetchQuestions(currentRound._id);
                          setQuestionBankModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer border border-indigo-200/60"
                        title="Manage questions, CSV import, and test settings"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Question Bank ({questionStats.questionCount || currentRound.questionCount || 0})</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setSettingsForm({
                          name: currentRound.name || '',
                          type: currentRound.type || 'technical',
                          deliveryMode: currentRound.deliveryMode || (currentRound.mode === 'online' ? 'online_external' : (currentRound.mode === 'offline' ? 'offline_campus' : '')),
                          mode: currentRound.mode || '',
                          date: currentRound.date ? new Date(currentRound.date).toISOString().slice(0, 10) : '',
                          testWindowStart: currentRound.testWindowStart ? new Date(currentRound.testWindowStart).toISOString().slice(0, 16) : '',
                          testWindowEnd: currentRound.testWindowEnd ? new Date(currentRound.testWindowEnd).toISOString().slice(0, 16) : '',
                          reportByTime: currentRound.reportByTime || '',
                          durationMinutes: currentRound.durationMinutes ?? '',
                          venueOrLink: currentRound.venueOrLink || '',
                          instructions: currentRound.instructions || '',
                          cutoffScore: currentRound.cutoffScore ?? '',
                          shuffleQuestions: currentRound.shuffleQuestions ?? true,
                          shuffleOptions: currentRound.shuffleOptions ?? false,
                          negativeMarking: currentRound.negativeMarking ?? false,
                          showScoreToStudents: currentRound.showScoreToStudents ?? false,
                        });
                        setRoundSettingsModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-600" />
                      <span>Round Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setCutoffInput(currentRound.cutoffScore ?? '');
                        setShortlistModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer border border-indigo-200/60"
                    >
                      <Award className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Shortlist by Cutoff</span>
                    </button>

                    <button
                      onClick={() => {
                        setSplitForm((prev) => ({
                          ...prev,
                          mode: currentRound.mode || 'offline',
                          startTime: currentRound.date
                            ? new Date(currentRound.date).toISOString().slice(0, 16)
                            : new Date().toISOString().slice(0, 16),
                        }));
                        setAutoSplitModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Split className="w-3.5 h-3.5 text-sky-600" />
                      <span>Auto-Split Batches</span>
                    </button>

                    <button
                      onClick={() => {
                        setCsvReport(null);
                        setCsvModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Import CSV Results</span>
                    </button>

                    <button
                      onClick={handleOpenAnnouncementModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-colors cursor-pointer border border-purple-200/60"
                      title="Send announcement to participants in this round"
                    >
                      <Megaphone className="w-3.5 h-3.5 text-purple-600" />
                      <span>Send Announcement</span>
                    </button>

                    <button
                      onClick={() => setPublishModalOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm cursor-pointer ${currentRound.resultsPublished
                          ? 'bg-slate-500 hover:bg-slate-600'
                          : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                        }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {currentRound.resultsPublished
                          ? 'Re-Publish Results'
                          : 'Publish Results & Advance'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Metrics Pill Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-slate-100 text-center">
                  <div className="p-2 rounded-xl bg-slate-50">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Enrolled</span>
                    <span className="text-sm font-black text-slate-800">{currentRound.metrics?.totalEnrolled || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">Present</span>
                    <span className="text-sm font-black">{currentRound.metrics?.presentCount || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-rose-50 text-rose-800">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block">Absent</span>
                    <span className="text-sm font-black">{currentRound.metrics?.absentCount || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-sky-50 text-sky-800">
                    <span className="text-[10px] uppercase font-bold text-sky-600 block">Cleared</span>
                    <span className="text-sm font-black">{currentRound.metrics?.clearedCount || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Rejected</span>
                    <span className="text-sm font-black">{currentRound.metrics?.rejectedCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* View Mode Switcher for Interview Rounds */}
              {isInterviewRound && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setRoundViewMode('conduct')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        roundViewMode === 'conduct'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Conduct Interviews (Live Queue)</span>
                    </button>
                    <button
                      onClick={() => setRoundViewMode('roster')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        roundViewMode === 'roster'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Candidate Roster & Batches</span>
                    </button>
                  </div>

                  {roundViewMode === 'conduct' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleOpenCreatePanel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-sky-600" />
                        <span>Add Panel</span>
                      </button>
                      <button
                        onClick={() => {
                          setAutoScheduleForm({
                            startTime: getISTDateDefault(currentRound.date || driveData?.drive?.driveDate),
                            slotDurationMinutes: currentRound.slotDurationMinutes || 30,
                            breakMinutes: 0,
                          });
                          setAutoScheduleModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer border border-indigo-200/60"
                      >
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Auto-Schedule Slots</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* BRANCH 1: INTERVIEW CONDUCT (LIVE QUEUE) */}
              {isInterviewRound && roundViewMode === 'conduct' ? (
                <div className="space-y-4">
                  {/* Summary metrics for interview conduct */}
                  <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5 text-center">
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Enrolled</span>
                      <span className="text-lg font-black text-slate-800">{currentRound.participants?.length || 0}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Panels</span>
                      <span className="text-lg font-black text-indigo-600">{panels.length}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled Slots</span>
                      <span className="text-lg font-black text-sky-600">{slots.length}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/70 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-amber-700 block">In Progress</span>
                      <span className="text-lg font-black text-amber-800">{slots.filter((s) => s.status === 'in_progress').length}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/70 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">Completed</span>
                      <span className="text-lg font-black text-emerald-800">{slots.filter((s) => s.status === 'completed').length}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200/70 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-rose-700 block">No Show</span>
                      <span className="text-lg font-black text-rose-800">{slots.filter((s) => s.status === 'no_show').length}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200/70 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-purple-700 block">Avg. Score</span>
                      <span className="text-lg font-black text-purple-800">
                        {(() => {
                          const evals = slots.filter((s) => s.evaluation?.score != null);
                          if (evals.length === 0) return '—';
                          const sum = evals.reduce((acc, s) => acc + s.evaluation.score, 0);
                          return Math.round(sum / evals.length) + '%';
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Empty State: No Panels Configured */}
                  {panels.length === 0 && (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center space-y-3">
                      <Users className="w-10 h-10 text-slate-300 mx-auto" />
                      <h3 className="text-sm font-bold text-slate-800">No Interview Panels Configured</h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Create interview panels (e.g. Panel 1 - Technical, Panel 2 - HR) with interviewer names. Once panels are set up, run Auto-Schedule to allocate candidate interview slots and generate meeting links.
                      </p>
                      <button
                        onClick={handleOpenCreatePanel}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create First Panel</span>
                      </button>
                    </div>
                  )}

                  {/* Empty State: Panels exist but slots not yet auto-scheduled */}
                  {panels.length > 0 && slots.length === 0 && (
                    <div className="bg-sky-50 rounded-3xl border border-sky-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-sky-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-sky-900">
                            {panels.length} Panel(s) Ready for Scheduling
                          </h4>
                        </div>
                        <p className="text-xs text-sky-800">
                          Click Auto-Schedule to distribute all {currentRound.participants?.length || 0} enrolled candidates across your configured panels, check for schedule clashes across campus, and generate unique video links.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setAutoScheduleForm({
                            startTime: getISTDateDefault(currentRound.date || driveData?.drive?.driveDate),
                            slotDurationMinutes: currentRound.slotDurationMinutes || 30,
                            breakMinutes: 0,
                          });
                          setAutoScheduleModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 shrink-0 cursor-pointer"
                      >
                        <Clock className="w-4 h-4" />
                        <span>Auto-Schedule Slots Now</span>
                      </button>
                    </div>
                  )}

                  {/* ACTIVE VIDEO / INTERVIEW MEETING ROOM SPOTLIGHT */}
                  {activeVideoSlot && !['completed', 'no_show', 'cancelled'].includes(activeVideoSlot.status) && (
                    <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black shrink-0 mt-0.5">
                            <Video className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
                                Interview Room • Queue #{activeVideoSlot.queueNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  activeVideoSlot.status === 'in_progress'
                                    ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 animate-pulse'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {activeVideoSlot.status.replace('_', ' ')}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white mt-0.5">
                              {activeVideoSlot.student?.user?.name || 'Candidate'} ({activeVideoSlot.student?.enrollmentNo})
                            </h3>
                            <p className="text-xs text-slate-400">
                              {activeVideoSlot.student?.branch} • CGPA: {activeVideoSlot.student?.cgpa} • Panel: {activeVideoSlot.panel?.name} • Time: {formatISTTime(activeVideoSlot.startTime)} - {formatISTTime(activeVideoSlot.endTime)} IST
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {activeVideoSlot.meetingLink && (
                            <>
                              <button
                                onClick={() => {
                                  window.open(activeVideoSlot.meetingLink, '_blank');
                                  if (activeVideoSlot.status !== 'in_progress') {
                                    handleUpdateSlotStatus(activeVideoSlot._id, 'in_progress');
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Start interview</span>
                              </button>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(activeVideoSlot.meetingLink);
                                  toast.success('Meeting link copied to clipboard');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy link</span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleOpenEvaluation(activeVideoSlot)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                            <span>{activeVideoSlot.evaluation ? 'Edit Evaluation' : 'Evaluate'}</span>
                          </button>
                          <button
                            onClick={() => handleUpdateSlotStatus(activeVideoSlot._id, 'completed')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Complete</span>
                          </button>
                          <button
                            onClick={() => handleUpdateSlotStatus(activeVideoSlot._id, 'no_show')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>No-Show</span>
                          </button>
                          <button
                            onClick={() => setActiveVideoSlot(null)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Close Spotlight"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Venue Info or External Meeting Controls (NO IFRAME) */}
                      {currentRound.mode === 'offline' || currentRound.deliveryMode === 'offline_campus' ? (
                        <div className="p-6 text-center rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                          <MapPin className="w-8 h-8 text-sky-400 mx-auto" />
                          <h4 className="font-bold text-sm text-slate-200">In-Person Interview Session</h4>
                          <p className="text-xs text-slate-300 max-w-md mx-auto">
                            Venue: <strong className="text-white">{currentRound.venueOrLink || activeVideoSlot.panel?.venueOrLink || 'Campus Placement Cell'}</strong>
                            {activeVideoSlot.panel?.room && <> • Room: <strong className="text-white">{activeVideoSlot.panel.room}</strong></>}
                          </p>
                          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 inline-block text-xs text-slate-300">
                            Candidate Report By Time:{' '}
                            <strong className="text-sky-300">
                              {currentRound.reportByTime || (activeVideoSlot.startTime
                                ? new Date(new Date(activeVideoSlot.startTime).getTime() - 15 * 60 * 1000).toLocaleTimeString('en-IN', {
                                    timeZone: 'Asia/Kolkata',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }) + ' IST'
                                : '15m prior')}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 text-center rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                          <Video className="w-8 h-8 text-sky-400 mx-auto mb-1" />
                          <h4 className="font-bold text-sm text-slate-200">Virtual Meeting Room Link</h4>
                          <p className="text-xs font-mono text-slate-400 max-w-md mx-auto truncate">
                            {activeVideoSlot.meetingLink || 'No meeting link assigned yet'}
                          </p>
                          {activeVideoSlot.meetingLink && (
                            <div className="flex items-center justify-center gap-3 pt-1">
                              <button
                                onClick={() => {
                                  window.open(activeVideoSlot.meetingLink, '_blank');
                                  if (activeVideoSlot.status !== 'in_progress') {
                                    handleUpdateSlotStatus(activeVideoSlot._id, 'in_progress');
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Start interview (new tab)</span>
                              </button>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(activeVideoSlot.meetingLink);
                                  toast.success('Meeting link copied to clipboard');
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy link</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Panels Filter Pills & Panel Specific Control Bar */}
                  {panels.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        <span className="text-xs font-bold text-slate-500 shrink-0">Filter Panel:</span>
                        <button
                          onClick={() => setSelectedPanelFilter('all')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            selectedPanelFilter === 'all'
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          All Panels ({slots.length})
                        </button>
                        {panels.map((p) => {
                          const panelSlotCount = slots.filter((s) => s.panel?._id === p._id).length;
                          return (
                            <button
                              key={p._id}
                              onClick={() => setSelectedPanelFilter(p._id)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                                selectedPanelFilter === p._id
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                              }`}
                            >
                              {p.name} ({panelSlotCount})
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Panel Information & Action Bar */}
                      {selectedPanelFilter !== 'all' && (() => {
                        const activePanelObj = panels.find((p) => p._id === selectedPanelFilter);
                        if (!activePanelObj) return null;
                        return (
                          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">{activePanelObj.name}</h4>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  (Capacity: {activePanelObj.capacity || 1})
                                </span>
                              </div>
                              <div className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">Interviewers:</span>{' '}
                                {activePanelObj.interviewers?.map((iv) => `${iv.name} (${iv.email})`).join(', ') || 'None assigned'}
                              </div>
                              {activePanelObj.venueOrLink && (
                                <div className="text-[11px] text-slate-500 truncate max-w-lg">
                                  Venue/Link: {activePanelObj.venueOrLink}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCallNext(activePanelObj._id)}
                                disabled={callingNextPanelId === activePanelObj._id}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-sm shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                                <span>{callingNextPanelId === activePanelObj._id ? 'Calling...' : 'Call Next Candidate'}</span>
                              </button>
                              <button
                                onClick={() => handleOpenEditPanel(activePanelObj)}
                                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeletePanel(activePanelObj._id)}
                                className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Panel"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Slots Search & Status Filter */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search candidate name or roll..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50"
                        />
                      </div>

                      <select
                        value={selectedSlotStatusFilter}
                        onChange={(e) => setSelectedSlotStatusFilter(e.target.value)}
                        className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 font-medium cursor-pointer"
                      >
                        <option value="all">All Slot Statuses</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="checked_in">Checked In</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="no_show">No Show</option>
                      </select>
                    </div>

                    <div className="text-xs font-semibold text-slate-500">
                      Showing {slots.filter((s) => {
                        const student = s.student;
                        const name = student?.user?.name?.toLowerCase() || '';
                        const email = student?.user?.email?.toLowerCase() || '';
                        const roll = student?.enrollmentNo?.toLowerCase() || '';
                        const matchesSearch = name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase()) || roll.includes(searchQuery.toLowerCase());
                        const matchesPanel = selectedPanelFilter === 'all' || s.panel?._id === selectedPanelFilter;
                        const matchesStatus = selectedSlotStatusFilter === 'all' || s.status === selectedSlotStatusFilter;
                        return matchesSearch && matchesPanel && matchesStatus;
                      }).length} of {slots.length} Slots
                    </div>
                  </div>

                  {/* Interview Slots Queue Table */}
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200/80 tracking-wider">
                          <tr>
                            <th className="py-3 px-4 w-12 text-center">Queue</th>
                            <th className="py-3 px-4">Candidate</th>
                            <th className="py-3 px-4">Panel</th>
                            <th className="py-3 px-4">Slot Time (IST)</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-center">Score / Recommendation</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {slots
                            .filter((s) => {
                              const student = s.student;
                              const name = student?.user?.name?.toLowerCase() || '';
                              const email = student?.user?.email?.toLowerCase() || '';
                              const roll = student?.enrollmentNo?.toLowerCase() || '';
                              const matchesSearch =
                                name.includes(searchQuery.toLowerCase()) ||
                                email.includes(searchQuery.toLowerCase()) ||
                                roll.includes(searchQuery.toLowerCase());
                              const matchesPanel = selectedPanelFilter === 'all' || s.panel?._id === selectedPanelFilter;
                              const matchesStatus = selectedSlotStatusFilter === 'all' || s.status === selectedSlotStatusFilter;
                              return matchesSearch && matchesPanel && matchesStatus;
                            })
                            .map((s) => {
                              const student = s.student;
                              const panel = s.panel;
                              const evaluation = s.evaluation;

                              let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                              if (s.status === 'checked_in') statusBadge = 'bg-amber-100 text-amber-800 border-amber-200';
                              else if (s.status === 'in_progress') statusBadge = 'bg-sky-100 text-sky-800 border-sky-300 animate-pulse';
                              else if (s.status === 'completed') statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                              else if (s.status === 'no_show') statusBadge = 'bg-rose-100 text-rose-800 border-rose-200';

                              return (
                                <tr key={s._id} className="hover:bg-slate-50/70 transition-colors">
                                  {/* Queue Number */}
                                  <td className="py-3 px-4 text-center font-black text-slate-800">
                                    <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 inline-flex items-center justify-center text-xs">
                                      #{s.queueNumber}
                                    </span>
                                  </td>

                                  {/* Candidate Info */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900">{student?.user?.name}</div>
                                    <div className="text-[11px] text-slate-500 font-mono">
                                      {student?.enrollmentNo} • {student?.branch} • CGPA: {student?.cgpa}
                                    </div>
                                  </td>

                                  {/* Panel */}
                                  <td className="py-3 px-4">
                                    <span className="font-semibold text-slate-800">{panel?.name || 'Assigned Panel'}</span>
                                    <div className="text-[10px] text-slate-500 truncate max-w-xs">
                                      {panel?.interviewers?.map((iv) => iv.name).join(', ')}
                                    </div>
                                  </td>

                                  {/* Slot Time */}
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-slate-800">
                                      {formatISTTime(s.startTime)} - {formatISTTime(s.endTime)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                      {formatISTDateTime(s.startTime).split(',')[0]}
                                    </div>
                                  </td>

                                  {/* Status Badge */}
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border capitalize ${statusBadge}`}>
                                      {s.status.replace('_', ' ')}
                                    </span>
                                  </td>

                                  {/* Score / Recommendation */}
                                  <td className="py-3 px-4 text-center">
                                    {evaluation ? (
                                      <div>
                                        <span className="font-black text-xs text-indigo-700">{evaluation.score}%</span>
                                        <span
                                          className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                            evaluation.recommendation === 'strong_hire' || evaluation.recommendation === 'hire'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : evaluation.recommendation === 'hold'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-rose-100 text-rose-800'
                                          }`}
                                        >
                                          {evaluation.recommendation.replace('_', ' ')}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic">Not evaluated</span>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                      {!['completed', 'no_show', 'cancelled'].includes(s.status) ? (
                                        <>
                                          {/* Start Interview (opens link in new tab and sets slot in_progress) */}
                                          {s.meetingLink && (
                                            <>
                                              <button
                                                onClick={() => {
                                                  window.open(s.meetingLink, '_blank');
                                                  if (s.status !== 'in_progress') {
                                                    handleUpdateSlotStatus(s._id, 'in_progress');
                                                  }
                                                  setActiveVideoSlot(s);
                                                }}
                                                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-xs inline-flex items-center gap-1"
                                                title="Opens meeting link in a new tab and marks slot as in-progress"
                                              >
                                                <ExternalLink className="w-3 h-3" />
                                                <span>Start interview</span>
                                              </button>
                                              <button
                                                onClick={() => {
                                                  navigator.clipboard.writeText(s.meetingLink);
                                                  toast.success('Meeting link copied');
                                                }}
                                                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                                                title="Copy meeting link"
                                              >
                                                <Copy className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          )}

                                          <button
                                            onClick={() => handleOpenEvaluation(s)}
                                            className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold cursor-pointer transition-colors"
                                          >
                                            Evaluate
                                          </button>
                                          <button
                                            onClick={() => handleUpdateSlotStatus(s._id, 'completed')}
                                            className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold cursor-pointer transition-colors"
                                          >
                                            Complete
                                          </button>
                                          <button
                                            onClick={() => handleUpdateSlotStatus(s._id, 'no_show')}
                                            className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-bold cursor-pointer transition-colors"
                                          >
                                            No-Show
                                          </button>
                                        </>
                                      ) : s.status === 'completed' ? (
                                        <button
                                          onClick={() => handleOpenEvaluation(s)}
                                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer transition-colors"
                                        >
                                          Edit Eval
                                        </button>
                                      ) : s.status === 'no_show' ? (
                                        <span className="text-[11px] text-rose-600 font-semibold italic">Absent / No-Show</span>
                                      ) : (
                                        <span className="text-[11px] text-slate-400 font-semibold italic">Cancelled</span>
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
                </div>
              ) : isPlatformTest ? (
                /* BRANCH 1B: PLATFORM APTITUDE TEST MONITOR & RESULTS */
                <div className="space-y-4">
                  {/* Top Action & Question Bank Banner */}
                  <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/60 text-indigo-700 flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 text-sm md:text-base">
                            On-Platform Aptitude Assessment
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              questionStats.isLocked
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {questionStats.isLocked ? 'Window Open (Questions Locked)' : 'Draft / Editable'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {questionStats.questionCount} questions configured • {questionStats.totalMarks} total marks •{' '}
                          {currentRound.negativeMarking ? 'Negative marking active' : 'No negative marking'} • Duration:{' '}
                          {currentRound.durationMinutes || 60}m
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          fetchQuestions(currentRound._id);
                          setQuestionBankModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Manage Questions</span>
                      </button>
                      <button
                        onClick={() => handleOpenQuestionForm()}
                        disabled={questionStats.isLocked}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Question</span>
                      </button>
                      <button
                        onClick={() => setQuestionCsvModalOpen(true)}
                        disabled={questionStats.isLocked}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span>Import CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center">
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Enrolled</span>
                      <span className="text-lg font-black text-slate-800">
                        {testSummary?.totalEnrolled ?? currentRound.participants?.length ?? 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">Submitted</span>
                      <span className="text-lg font-black">{testSummary?.submittedCount ?? 0}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-sky-700 block">In Progress</span>
                      <span className="text-lg font-black">{testSummary?.inProgressCount ?? 0}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-amber-700 block">Not Started</span>
                      <span className="text-lg font-black">{testSummary?.notStartedCount ?? 0}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-rose-700 block">Absent</span>
                      <span className="text-lg font-black">{testSummary?.absentCount ?? 0}</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-indigo-700 block">Average Score</span>
                      <span className="text-lg font-black">{testSummary?.averageScore ?? 0}%</span>
                    </div>
                  </div>

                  {/* Test Results Table */}
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 text-sm">Candidate Assessment Results</h4>
                        <span className="text-xs text-slate-400">({testResults.length} candidates)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchTestResults(currentRound._id)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>

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
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {testResults.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-slate-400">
                                {loadingTestResults ? 'Loading assessment records...' : 'No candidates enrolled in this round.'}
                              </td>
                            </tr>
                          ) : (
                            testResults.map((r) => {
                              const isSwitched = (r.tabSwitchCount || 0) > 0;

                              return (
                                <tr key={r.participantId} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-3.5 px-4">
                                    <div className="font-bold text-slate-900">{r.name}</div>
                                    <div className="text-[11px] text-slate-500 font-mono">
                                      {r.rollNumber} • {r.email}
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 font-medium">{r.branch}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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
                                      {r.status === 'auto_submitted' ? 'Auto-Submitted' : r.status.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-mono">
                                    {r.timeTakenMinutes !== null ? `${r.timeTakenMinutes} min` : '—'}
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    {isSwitched ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                                        <span>{r.tabSwitchCount} switch(es)</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[11px]">0</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    {r.score !== null ? (
                                      <div>
                                        <span className="font-black text-slate-900 text-sm">
                                          {r.score} / {r.totalMarks}
                                        </span>
                                        <span className="text-[11px] text-slate-500 block">({r.percentage}%)</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">Pending</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
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
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* BRANCH 2: CANDIDATE ROSTER & BATCHES (ORIGINAL VIEW) */
                <div className="space-y-4">
                  {/* Batches Pill Bar */}
                  {batches.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      <span className="text-xs font-bold text-slate-500 shrink-0">Batches:</span>
                      <button
                        onClick={() => setBatchFilter('all')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${batchFilter === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                      >
                        All Batches ({localParticipants.length})
                      </button>
                      {batches.map((b) => (
                    <button
                      key={b._id}
                      onClick={() => setBatchFilter(b._id)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${batchFilter === b._id
                          ? 'bg-sky-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                    >
                      {b.batchName} ({new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </button>
                  ))}
                  <button
                    onClick={() => setBatchFilter('unassigned')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${batchFilter === 'unassigned'
                        ? 'bg-amber-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                  >
                    Unassigned ({localParticipants.filter((p) => !p.batch).length})
                  </button>
                </div>
              )}

              {/* Filter & Search Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search candidate or roll no..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50"
                    />
                  </div>

                  <select
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                    className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 font-medium"
                  >
                    <option value="all">All Outcomes</option>
                    <option value="pending">Pending</option>
                    <option value="cleared">Cleared</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {/* Bulk Actions for Selected Rows */}
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">
                    {selectedIds.length} selected
                  </span>

                  <button
                    onClick={() => applyBulkAttendance('present')}
                    disabled={selectedIds.length === 0}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                  >
                    Present
                  </button>
                  <button
                    onClick={() => applyBulkAttendance('absent')}
                    disabled={selectedIds.length === 0}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 transition-colors"
                  >
                    Absent (Auto-Reject)
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => applyBulkResult('cleared')}
                    disabled={selectedIds.length === 0}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-40 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => applyBulkResult('rejected')}
                    disabled={selectedIds.length === 0}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Participants Interactive Table */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200/80 tracking-wider">
                      <tr>
                        <th className="py-3 px-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredParticipants.length > 0 &&
                              selectedIds.length === filteredParticipants.length
                            }
                            onChange={() => toggleSelectAll(filteredParticipants)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                        </th>
                        <th className="py-3 px-4">Candidate</th>
                        <th className="py-3 px-4">Batch / Slot</th>
                        <th className="py-3 px-4 text-center">Attendance</th>
                        <th className="py-3 px-4 text-center">Outcome</th>
                        <th className="py-3 px-4 w-20">Score</th>
                        <th className="py-3 px-4">Feedback</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParticipants.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            No candidates found matching the active filter.
                          </td>
                        </tr>
                      ) : (
                        filteredParticipants.map((p) => {
                          const isSelected = selectedIds.includes(p._id);
                          const student = p.student;
                          const batch = p.batch;

                          return (
                            <tr
                              key={p._id}
                              className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-sky-50/40' : ''
                                }`}
                            >
                              {/* Checkbox */}
                              <td className="py-3 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectOne(p._id)}
                                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                              </td>

                              {/* Student Info */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{student?.user?.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {student?.enrollmentNo} • {student?.branch} • CGPA: {student?.cgpa}
                                </div>
                              </td>

                              {/* Batch */}
                              <td className="py-3 px-4">
                                {batch ? (
                                  <div>
                                    <span className="font-semibold text-slate-800">{batch.batchName}</span>
                                    <div className="text-[10px] text-slate-500">
                                      {new Date(batch.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                      {new Date(batch.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate max-w-xs">{batch.venueOrLink}</div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-amber-600 italic font-medium">Unassigned</span>
                                )}
                              </td>

                              {/* Attendance Toggle */}
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={p.attendance}
                                  onChange={(e) => handleParticipantChange(p._id, 'attendance', e.target.value)}
                                  className={`text-xs py-1 px-2 rounded-lg font-bold border transition-colors ${p.attendance === 'present'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : p.attendance === 'absent'
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="present" disabled={!batch}>
                                    Present {!batch ? '(Slot required)' : ''}
                                  </option>
                                  <option value="absent">Absent</option>
                                </select>
                              </td>

                              {/* Result Toggle */}
                              <td className="py-3 px-4 text-center">
                                <select
                                  value={p.result}
                                  onChange={(e) => handleParticipantChange(p._id, 'result', e.target.value)}
                                  disabled={p.attendance === 'absent'}
                                  className={`text-xs py-1 px-2 rounded-lg font-bold border transition-colors ${p.result === 'cleared'
                                      ? 'bg-sky-50 text-sky-800 border-sky-200'
                                      : p.result === 'rejected'
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    } disabled:opacity-60`}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="cleared">Cleared</option>
                                  <option value="rejected">Rejected</option>
                                </select>
                              </td>

                              {/* Score */}
                              <td className="py-3 px-4">
                                <input
                                  type="number"
                                  value={p.score}
                                  onChange={(e) => handleParticipantChange(p._id, 'score', e.target.value)}
                                  placeholder="—"
                                  className="w-16 px-2 py-1 text-xs rounded-lg border border-slate-200 text-center font-bold"
                                />
                              </td>

                              {/* Feedback */}
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  value={p.feedback}
                                  onChange={(e) => handleParticipantChange(p._id, 'feedback', e.target.value)}
                                  placeholder="Observations / remarks..."
                                  className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200"
                                />
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => {
                                    setSelectedParticipant(p);
                                    setTargetBatchId(p.batch?._id || batches[0]?._id || '');
                                    setMoveBatchModalOpen(true);
                                  }}
                                  className="text-[11px] font-semibold text-sky-600 hover:text-sky-800"
                                >
                                  Move Batch
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sticky Action Footer */}
                <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Candidate attendance and outcomes are saved immediately to the server upon clicking below.
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveAttendance}
                      disabled={isSavingAttendance}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {isSavingAttendance ? 'Saving Attendance...' : 'Save Attendance Only'}
                    </button>
                    <button
                      onClick={handleSaveResults}
                      disabled={isSavingResults}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm shadow-sky-600/20 transition-all disabled:opacity-50"
                    >
                      {isSavingResults ? 'Saving Results...' : 'Save Evaluation Results'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

          {/* TAB CONTENT: OFFERS & SELECTION */}
          {activeTab === 'offers' && (
            <div className="space-y-6">
              {/* Offers Header Card */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs uppercase">
                      Final Hiring Step
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900">Employment Offers & Selection</h2>
                  <p className="text-xs text-slate-500 max-w-xl">
                    Extend official corporate employment offers to shortlisted candidates. Selected candidates will be able to
                    Accept or Decline within their student portal.
                  </p>
                </div>

                <button
                  onClick={() => {
                    // pre-select all eligible candidates
                    const candidateIds = eligibleForOfferCandidates.map((c) => c.student._id);
                    setOfferForm((prev) => ({
                      ...prev,
                      selectedStudentIds: candidateIds,
                    }));
                    setOfferModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all self-start sm:self-auto"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Extend Bulk Offers</span>
                </button>
              </div>

              {/* Extended Offers Table */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm">Extended Offers Log</h3>
                  <span className="text-xs text-slate-500">
                    Total: {driveData.metrics?.totalOffers || 0} • Accepted: {driveData.metrics?.acceptedOffers || 0}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200/80 tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Candidate</th>
                        <th className="py-3 px-4">Role / Title</th>
                        <th className="py-3 px-4">Package</th>
                        <th className="py-3 px-4">Offered On</th>
                        <th className="py-3 px-4">Expiry Date</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibleForOfferCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            No candidates have cleared all rounds yet, or no offers have been recorded.
                          </td>
                        </tr>
                      ) : (
                        eligibleForOfferCandidates.map((cand) => {
                          const student = cand.student;
                          return (
                            <tr key={cand._id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900">{student?.user?.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {student?.enrollmentNo} • {student?.branch}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-700">{drive.role}</td>
                              <td className="py-3.5 px-4 font-black text-emerald-600">{drive.packageLpa} LPA</td>
                              <td className="py-3.5 px-4 text-slate-500">
                                {new Date().toLocaleDateString()}
                              </td>
                              <td className="py-3.5 px-4 text-slate-500">
                                {offerForm.expiryDate ? new Date(offerForm.expiryDate).toLocaleDateString() : '7 Days'}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Pending Acceptance</span>
                                </span>
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
        </div>
      )}

      {/* AUTO SPLIT BATCHES MODAL */}
      {autoSplitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Split className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">Auto-Split Candidates Into Batches</h3>
              </div>
              <button
                onClick={() => setAutoSplitModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Splits candidate participants in enrollment number order across sequential time slots, checking for student
              and venue clashes across other concurrent drives.
            </p>

            <form onSubmit={handleAutoSplit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Batch Capacity (Max Candidates per Batch)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={splitForm.capacity}
                  onChange={(e) => setSplitForm({ ...splitForm, capacity: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">First Batch Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={splitForm.startTime}
                  onChange={(e) => setSplitForm({ ...splitForm, startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Slot Duration (Minutes)</label>
                  <input
                    type="number"
                    min="10"
                    max="480"
                    required
                    value={splitForm.slotDurationMinutes}
                    onChange={(e) => setSplitForm({ ...splitForm, slotDurationMinutes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Round Mode</label>
                  <select
                    value={splitForm.mode}
                    onChange={(e) => setSplitForm({ ...splitForm, mode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="offline">Offline (Venue)</option>
                    <option value="online">Online (Virtual)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {splitForm.mode === 'offline' ? 'Venue / Room Name' : 'Meeting / Video Conference Link'}
                </label>
                <input
                  type="text"
                  required
                  value={splitForm.venueOrLink}
                  onChange={(e) => setSplitForm({ ...splitForm, venueOrLink: e.target.value })}
                  placeholder={splitForm.mode === 'offline' ? 'Computer Lab 3, 2nd Floor' : 'https://meet.google.com/xyz'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAutoSplitModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSplitting}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-50"
                >
                  {isSplitting ? 'Splitting...' : 'Generate Batches'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Import Evaluation Results (CSV)</h3>
              </div>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Upload a CSV file or paste spreadsheet text containing candidates' evaluation results. Required columns:{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">
                enrollmentNo,result,score,feedback
              </code>
            </p>

            <form onSubmit={handleImportCSV} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Upload .CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsvFile(e.target.files[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400">
                  <span className="bg-white px-2">OR PASTE CSV DATA</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Raw CSV Text</label>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="enrollmentNo,result,score,feedback&#10;2024CSE001,cleared,88,Excellent communication&#10;2024CSE002,rejected,42,Needs stronger DSA fundamentals"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Validation Report Alert */}
              {csvReport && (
                <div
                  className={`p-3.5 rounded-2xl text-xs space-y-2 ${csvReport.failedCount > 0
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      Imported {csvReport.importedCount} rows successfully. ({csvReport.failedCount} failures)
                    </span>
                  </div>
                  {csvReport.failedRows && csvReport.failedRows.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1 pt-1 border-t border-amber-200/60 font-mono text-[11px]">
                      {csvReport.failedRows.map((f, i) => (
                        <div key={i} className="text-rose-700">
                          Row {f.row} [{f.enrollmentNo || 'N/A'}]: {f.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCsvModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
                >
                  {isImporting ? 'Processing...' : 'Upload & Validate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MOVE BATCH MODAL */}
      {moveBatchModalOpen && selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-900">Transfer Participant to Batch</h3>
            <p className="text-slate-500">
              Moving <span className="font-bold text-slate-800">{selectedParticipant.student?.user?.name}</span> (
              {selectedParticipant.student?.enrollmentNo})
            </p>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Target Batch</label>
              <select
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              >
                {batches.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.batchName} ({new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) — Capacity: {b.capacity}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMoveBatchModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMoveBatch}
                disabled={isMoving}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold"
              >
                {isMoving ? 'Moving...' : 'Confirm Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PUBLISH RESULTS CONFIRMATION MODAL */}
      {publishModalOpen && currentRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Send className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Publish Round Results & Advance Candidates</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to officially publish results for{' '}
              <span className="font-bold text-slate-900">{currentRound.name}</span>?
            </p>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Candidates Cleared (Moving to next round):</span>
                <span className="font-bold text-emerald-600">
                  {localParticipants.filter((p) => p.result === 'cleared').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Candidates Rejected:</span>
                <span className="font-bold text-rose-600">
                  {localParticipants.filter((p) => p.result === 'rejected').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Candidates Pending:</span>
                <span className="font-bold text-amber-600">
                  {localParticipants.filter((p) => p.result === 'pending').length}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Note: Cleared candidates will be automatically enrolled in Round {currentRound.order + 1}. All candidates
              will receive an in-app notification regarding their result.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublishResults}
                disabled={isPublishing}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {isPublishing ? 'Publishing...' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTEND BULK OFFERS MODAL */}
      {offerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Sparkles className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Extend Bulk Employment Offers</h3>
            </div>

            <form onSubmit={handleExtendOffers} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation / Role</label>
                  <input
                    type="text"
                    required
                    value={offerForm.role}
                    onChange={(e) => setOfferForm({ ...offerForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Package (CTC in LPA)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={offerForm.packageLpa}
                    onChange={(e) => setOfferForm({ ...offerForm, packageLpa: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Anticipated Joining Date</label>
                  <input
                    type="date"
                    value={offerForm.joiningDate}
                    onChange={(e) => setOfferForm({ ...offerForm, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Offer Acceptance Deadline</label>
                  <input
                    type="date"
                    required
                    value={offerForm.expiryDate}
                    onChange={(e) => setOfferForm({ ...offerForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Select Candidates */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Selected Candidates ({offerForm.selectedStudentIds.length} checked)
                </label>
                <div className="max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {eligibleForOfferCandidates.length === 0 ? (
                    <div className="text-center py-4 text-slate-400">No candidates available.</div>
                  ) : (
                    eligibleForOfferCandidates.map((cand) => {
                      const student = cand.student;
                      const isChecked = offerForm.selectedStudentIds.includes(student._id);
                      return (
                        <label key={student._id} className="flex items-center gap-2 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setOfferForm((prev) => ({
                                ...prev,
                                selectedStudentIds: isChecked
                                  ? prev.selectedStudentIds.filter((id) => id !== student._id)
                                  : [...prev.selectedStudentIds, student._id],
                              }));
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-bold text-slate-800">{student.user?.name}</span>
                          <span className="text-slate-400">({student.enrollmentNo})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOfferModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOffers}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {isSubmittingOffers ? 'Sending Offers...' : 'Issue Offers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROUND SETTINGS MODAL */}
      {roundSettingsModalOpen && currentRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 text-base">
                  Round Settings: {currentRound.name}
                </h3>
              </div>
              <button
                onClick={() => setRoundSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRoundSettings} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Round Name</label>
                <input
                  type="text"
                  required
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Round Type</label>
                <select
                  value={settingsForm.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    const isTestType = newType === 'aptitude' || newType === 'coding';
                    setSettingsForm({
                      ...settingsForm,
                      type: newType,
                      deliveryMode: !isTestType && settingsForm.deliveryMode === 'platform_test' ? 'online_external' : settingsForm.deliveryMode,
                    });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="aptitude">Online Assessment / Aptitude</option>
                  <option value="coding">Coding Assessment</option>
                  <option value="technical">Technical Interview</option>
                  <option value="hr">HR Interview</option>
                  <option value="group_discussion">Group Discussion</option>
                  <option value="pre_placement_talk">Pre-Placement Talk</option>
                </select>
              </div>

              {/* Delivery Mode Selector */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Round Delivery Mode <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={settingsForm.type !== 'aptitude' && settingsForm.type !== 'coding'}
                    onClick={() => setSettingsForm({ ...settingsForm, deliveryMode: 'platform_test', mode: 'online' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      settingsForm.deliveryMode === 'platform_test'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20'
                        : settingsForm.type !== 'aptitude' && settingsForm.type !== 'coding'
                        ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">Platform Test</div>
                    <div className="text-[10px] text-slate-500 leading-tight">Built-in test window & timer</div>
                    {settingsForm.type !== 'aptitude' && settingsForm.type !== 'coding' && (
                      <span className="text-[9px] text-rose-500 block mt-1 font-semibold">Aptitude/Coding only</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsForm({ ...settingsForm, deliveryMode: 'online_external', mode: 'online' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      settingsForm.deliveryMode === 'online_external'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">Online External</div>
                    <div className="text-[10px] text-slate-500 leading-tight">Google Meet, Zoom, Teams, slots</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsForm({ ...settingsForm, deliveryMode: 'offline_campus', mode: 'offline' })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      settingsForm.deliveryMode === 'offline_campus'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs mb-0.5">Offline Campus</div>
                    <div className="text-[10px] text-slate-500 leading-tight">Physical venue, panel rooms, PDF</div>
                  </button>
                </div>
              </div>

              {/* MODE SPECIFIC FIELDS: PLATFORM TEST */}
              {settingsForm.deliveryMode === 'platform_test' && (
                <div className="space-y-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Test Window Start</label>
                      <input
                        type="datetime-local"
                        value={settingsForm.testWindowStart}
                        onChange={(e) => setSettingsForm({ ...settingsForm, testWindowStart: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Test Window End</label>
                      <input
                        type="datetime-local"
                        value={settingsForm.testWindowEnd}
                        onChange={(e) => setSettingsForm({ ...settingsForm, testWindowEnd: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Duration (minutes)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 60"
                        value={settingsForm.durationMinutes}
                        onChange={(e) => setSettingsForm({ ...settingsForm, durationMinutes: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Cutoff Score (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="e.g. 60"
                        value={settingsForm.cutoffScore}
                        onChange={(e) => setSettingsForm({ ...settingsForm, cutoffScore: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  {/* Question Bank Manager Card */}
                  <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">Question Bank</span>
                        <p className="text-[10px] text-slate-500">
                          {questionStats.questionCount || currentRound.questionCount || 0} questions configured • {questionStats.totalMarks || currentRound.totalMarks || 0} total marks
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRoundSettingsModalOpen(false);
                        fetchQuestions(currentRound._id);
                        setQuestionBankModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      Manage Questions
                    </button>
                  </div>

                  {/* Test Setting Toggles */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                    <span className="font-bold text-slate-900 block text-xs">Assessment Options:</span>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-slate-700">Shuffle questions per candidate</span>
                      <input
                        type="checkbox"
                        checked={settingsForm.shuffleQuestions}
                        onChange={(e) => setSettingsForm({ ...settingsForm, shuffleQuestions: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-slate-700">Shuffle answer choices</span>
                      <input
                        type="checkbox"
                        checked={settingsForm.shuffleOptions}
                        onChange={(e) => setSettingsForm({ ...settingsForm, shuffleOptions: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-slate-700">Enable negative marking on wrong answers</span>
                      <input
                        type="checkbox"
                        checked={settingsForm.negativeMarking}
                        onChange={(e) => setSettingsForm({ ...settingsForm, negativeMarking: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-slate-700">Show score to candidates upon submission</span>
                      <input
                        type="checkbox"
                        checked={settingsForm.showScoreToStudents}
                        onChange={(e) => setSettingsForm({ ...settingsForm, showScoreToStudents: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Instructions for Candidates</label>
                    <textarea
                      rows="2"
                      placeholder="e.g. No calculators allowed, test will auto-submit when timer expires..."
                      value={settingsForm.instructions}
                      onChange={(e) => setSettingsForm({ ...settingsForm, instructions: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              )}

              {/* MODE SPECIFIC FIELDS: ONLINE EXTERNAL */}
              {settingsForm.deliveryMode === 'online_external' && (
                <div className="space-y-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Scheduled Date</label>
                      <input
                        type="date"
                        value={settingsForm.date}
                        onChange={(e) => setSettingsForm({ ...settingsForm, date: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Duration per Candidate (mins)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 30"
                        value={settingsForm.durationMinutes}
                        onChange={(e) => setSettingsForm({ ...settingsForm, durationMinutes: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Panel Meeting Link (Google Meet, Zoom, Teams, HackerRank, Google Form)
                    </label>
                    <input
                      type="url"
                      placeholder="https://meet.google.com/xyz or https://zoom.us/j/..."
                      value={settingsForm.venueOrLink}
                      onChange={(e) => setSettingsForm({ ...settingsForm, venueOrLink: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Cutoff Score</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 70"
                      value={settingsForm.cutoffScore}
                      onChange={(e) => setSettingsForm({ ...settingsForm, cutoffScore: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Instructions for Candidates</label>
                    <textarea
                      rows="2"
                      placeholder="Instructions, meeting guidelines, or technical requirements..."
                      value={settingsForm.instructions}
                      onChange={(e) => setSettingsForm({ ...settingsForm, instructions: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              )}

              {/* MODE SPECIFIC FIELDS: OFFLINE CAMPUS */}
              {settingsForm.deliveryMode === 'offline_campus' && (
                <div className="space-y-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Scheduled Date</label>
                      <input
                        type="date"
                        value={settingsForm.date}
                        onChange={(e) => setSettingsForm({ ...settingsForm, date: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Duration per Candidate (mins)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 30"
                        value={settingsForm.durationMinutes}
                        onChange={(e) => setSettingsForm({ ...settingsForm, durationMinutes: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Physical Campus Venue <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Auditorium / Main Seminar Hall"
                        value={settingsForm.venueOrLink}
                        onChange={(e) => setSettingsForm({ ...settingsForm, venueOrLink: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Report-by Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 09:00 AM IST"
                        value={settingsForm.reportByTime}
                        onChange={(e) => setSettingsForm({ ...settingsForm, reportByTime: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Cutoff Score</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 70"
                      value={settingsForm.cutoffScore}
                      onChange={(e) => setSettingsForm({ ...settingsForm, cutoffScore: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Instructions & What to carry</label>
                    <textarea
                      rows="2"
                      placeholder="Instructions, materials to carry, dress code..."
                      value={settingsForm.instructions}
                      onChange={(e) => setSettingsForm({ ...settingsForm, instructions: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRoundSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings || !settingsForm.deliveryMode}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG FOR SCHEDULE NOTIFICATIONS */}
      {notifyConfirmOpen && currentRound && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-indigo-600" />
              <h3 className="font-black text-slate-900 text-base">Notify Students of Schedule Update?</h3>
            </div>
            <p className="text-xs text-slate-600">
              You updated the schedule parameters for <strong>{currentRound.name}</strong>. Would you like to dispatch updated schedule emails and in-app notifications with old and new values to all <strong>{currentRound.participants?.length || 0}</strong> enrolled students?
            </p>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-800">
              Emails include the modified mode, timing, venue/link, and IST details. If nothing has actually changed, duplicate emails are skipped.
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNotifyConfirmOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingSettings}
                onClick={() => executeSaveRoundSettings(null, false)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Save Without Notifying
              </button>
              <button
                type="button"
                disabled={isSavingSettings}
                onClick={() => executeSaveRoundSettings(null, true)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                {isSavingSettings ? 'Saving...' : `Notify ${currentRound.participants?.length || 0} Students & Save`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHORTLIST BY CUTOFF MODAL */}
      {shortlistModalOpen && currentRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 text-base">Shortlist by Cutoff Score</h3>
              </div>
              <button
                onClick={() => setShortlistModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              <p className="text-slate-500">
                Enter a cutoff score to automatically mark candidates with score &ge; cutoff as{' '}
                <strong className="text-emerald-700">Cleared</strong>, and candidates below cutoff (or without score/absent) as{' '}
                <strong className="text-rose-700">Rejected</strong>.
              </p>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cutoff Score</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter minimum score required (e.g. 60)"
                  value={cutoffInput}
                  onChange={(e) => setCutoffInput(e.target.value)}
                  className="w-full p-2.5 text-sm font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Live Preview Counts */}
              {cutoffInput !== '' && !isNaN(Number(cutoffInput)) && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Outcome Preview
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-emerald-600 block">
                        Will be Cleared
                      </span>
                      <span className="text-xl font-black text-emerald-800">
                        {
                          localParticipants.filter(
                            (p) =>
                              p.attendance !== 'absent' &&
                              p.score !== null &&
                              p.score !== '' &&
                              Number(p.score) >= Number(cutoffInput)
                          ).length
                        }
                      </span>
                      <span className="text-[10px] text-emerald-600 block">&ge; {cutoffInput} points</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                      <span className="text-[10px] font-bold uppercase text-rose-600 block">
                        Will be Rejected
                      </span>
                      <span className="text-xl font-black text-rose-800">
                        {
                          localParticipants.filter(
                            (p) =>
                              p.attendance === 'absent' ||
                              p.score === null ||
                              p.score === '' ||
                              Number(p.score) < Number(cutoffInput)
                          ).length
                        }
                      </span>
                      <span className="text-[10px] text-rose-600 block">&lt; {cutoffInput} or no score</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShortlistModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyShortlist}
                  disabled={isApplyingShortlist || cutoffInput === '' || isNaN(Number(cutoffInput))}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isApplyingShortlist ? 'Applying Shortlist...' : 'Confirm & Apply Shortlist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. INTERVIEW PANEL SETUP MODAL */}
      {panelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingPanelId ? 'Edit Interview Panel' : 'Create Interview Panel'}
                </h3>
              </div>
              <button
                onClick={() => setPanelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePanel} className="space-y-3.5 text-xs flex-1 overflow-y-auto pr-1">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Panel Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Panel 1 - Systems & Core Java"
                  value={panelForm.name}
                  onChange={(e) => setPanelForm({ ...panelForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Capacity (Parallel slots)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={panelForm.capacity}
                    onChange={(e) => setPanelForm({ ...panelForm, capacity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline'
                      ? 'Room Number / Cabin'
                      : 'Meeting Link (Google Meet, Zoom, Teams)'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline'
                        ? 'e.g. Room 302, Cabin B'
                        : 'https://meet.google.com/xyz or Zoom URL'
                    }
                    value={
                      currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline'
                        ? panelForm.room
                        : panelForm.venueOrLink
                    }
                    onChange={(e) => {
                      if (currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline') {
                        setPanelForm({ ...panelForm, room: e.target.value, venueOrLink: e.target.value });
                      } else {
                        setPanelForm({ ...panelForm, venueOrLink: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {currentRound?.deliveryMode === 'offline_campus' || currentRound?.mode === 'offline'
                      ? 'Specific physical room where this panel conducts interviews'
                      : 'Paste the video conference URL for this panel (opens in new tab)'}
                  </p>
                </div>
              </div>

              {/* Interviewers Dynamic List */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">Panel Interviewers</label>
                  <button
                    type="button"
                    onClick={addInterviewerRow}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Interviewer</span>
                  </button>
                </div>

                {panelForm.interviewers.map((iv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Interviewer Name"
                      value={iv.name}
                      onChange={(e) => updateInterviewerRow(idx, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs"
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={iv.email}
                      onChange={(e) => updateInterviewerRow(idx, 'email', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs"
                    />
                    {panelForm.interviewers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInterviewerRow(idx)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Remove Interviewer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPanelModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPanel}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSavingPanel ? 'Saving Panel...' : editingPanelId ? 'Update Panel' : 'Create Panel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. AUTO-SCHEDULE SLOTS MODAL */}
      {autoScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Auto-Schedule Interview Slots</h3>
              </div>
              <button
                onClick={() => setAutoScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Distribute all <strong>{currentRound?.participants?.length || 0}</strong> enrolled candidates across your{' '}
              <strong>{panels.length}</strong> active panel(s) in sequential queue order. Unique meeting links (or panel custom links) will be generated.
            </p>

            <form onSubmit={handleAutoSchedule} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  First Slot Start Date & Time (IST - Default 10:00 AM)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={autoScheduleForm.startTime}
                  onChange={(e) => setAutoScheduleForm({ ...autoScheduleForm, startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Standard interview start is 10:00 AM IST. Warning triggers if scheduled before 8:00 AM, after 9:00 PM IST, or outside the drive date.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Slot Duration (Minutes)</label>
                  <input
                    type="number"
                    min="10"
                    max="180"
                    required
                    value={autoScheduleForm.slotDurationMinutes}
                    onChange={(e) => setAutoScheduleForm({ ...autoScheduleForm, slotDurationMinutes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Break Between Slots (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={autoScheduleForm.breakMinutes}
                    onChange={(e) => setAutoScheduleForm({ ...autoScheduleForm, breakMinutes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  The scheduler automatically verifies each candidate against other ongoing drives and checks that no panel is double-booked.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAutoScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAutoScheduling}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isAutoScheduling ? 'Scheduling Slots...' : 'Generate Interview Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. EVALUATION MODAL */}
      {evaluationModalOpen && activeSlotForEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h3 className="text-base font-bold text-slate-900">Candidate Evaluation</h3>
              </div>
              <button
                onClick={() => setEvaluationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Candidate Header Summary */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
              <div>
                <h4 className="font-black text-slate-900 text-sm">
                  {activeSlotForEval.student?.user?.name || 'Candidate'}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">
                  {activeSlotForEval.student?.enrollmentNo} • {activeSlotForEval.student?.branch} • CGPA: {activeSlotForEval.student?.cgpa}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Queue & Panel</span>
                <span className="text-xs font-black text-sky-600">
                  #{activeSlotForEval.queueNumber} • {activeSlotForEval.panel?.name}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitEvaluation} className="space-y-4 text-xs flex-1 overflow-y-auto pr-1">
              {/* Criteria 1: Technical */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">1. Technical Proficiency</label>
                  <span className="font-black text-sky-600">{evalForm.technical} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEvalForm({ ...evalForm, technical: val })}
                      className={`flex-1 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                        evalForm.technical === val
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Criteria 2: Problem Solving */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">2. Problem Solving & Aptitude</label>
                  <span className="font-black text-sky-600">{evalForm.problemSolving} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEvalForm({ ...evalForm, problemSolving: val })}
                      className={`flex-1 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                        evalForm.problemSolving === val
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Criteria 3: Communication */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">3. Communication & Cultural Fit</label>
                  <span className="font-black text-sky-600">{evalForm.communication} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEvalForm({ ...evalForm, communication: val })}
                      className={`flex-1 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                        evalForm.communication === val
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time Computed Score Banner */}
              <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Calculated Aggregate Score</span>
                  <span className="text-xs text-indigo-600 font-medium">Out of 100 percentage points</span>
                </div>
                <div className="text-2xl font-black text-indigo-700">
                  {Math.round(((Number(evalForm.technical) + Number(evalForm.problemSolving) + Number(evalForm.communication)) / 15) * 100)}%
                </div>
              </div>

              {/* Recommendation Choice */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block">Hiring Recommendation</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'strong_hire', label: 'Strong Hire', desc: 'Distinction / Clears', color: 'emerald' },
                    { key: 'hire', label: 'Hire', desc: 'Meets bar / Clears', color: 'sky' },
                    { key: 'hold', label: 'Hold', desc: 'Under review / Pending', color: 'amber' },
                    { key: 'reject', label: 'Reject', desc: 'Eliminate candidate', color: 'rose' },
                  ].map((rec) => {
                    const isSelected = evalForm.recommendation === rec.key;
                    return (
                      <button
                        key={rec.key}
                        type="button"
                        onClick={() => setEvalForm({ ...evalForm, recommendation: rec.key })}
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div className="font-bold text-xs">{rec.label}</div>
                        <div className={`text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {rec.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Comments / Notes */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">Interview Comments & Feedback</label>
                <textarea
                  rows="3"
                  placeholder="Strengths, technical observations, areas for improvement..."
                  value={evalForm.comments}
                  onChange={(e) => setEvalForm({ ...evalForm, comments: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                />
              </div>

              {/* Share With Student Checkbox */}
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={evalForm.sharedWithStudent}
                  onChange={(e) => setEvalForm({ ...evalForm, sharedWithStudent: e.target.checked })}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-[11px] font-semibold text-slate-700">
                  Share evaluation scores and feedback with candidate on their dashboard
                </span>
              </label>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEvaluationModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEval}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmittingEval ? 'Saving Evaluation...' : 'Submit Evaluation'}
                </button>
              </div>
            </form>
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
                      Replies will be routed directly to the college TPO desk. Your personal email address is never exposed.
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

      {/* QUESTION BANK MANAGER MODAL */}
      {questionBankModalOpen && currentRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    Question Bank: {currentRound.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 font-medium">
                      {questionsList.length} questions • {questionStats.totalMarks} total marks
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        questionStats.isLocked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {questionStats.isLocked ? 'Locked (Test window opened)' : 'Editable'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={questionStats.isLocked}
                  onClick={() => handleOpenQuestionForm()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
                <button
                  type="button"
                  disabled={questionStats.isLocked}
                  onClick={() => setQuestionCsvModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Import CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionBankModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Questions list body */}
            <div className="overflow-y-auto flex-1 py-4 space-y-3.5 pr-1">
              {loadingQuestions ? (
                <div className="text-center py-12 text-slate-400">Loading question bank...</div>
              ) : questionsList.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 text-sm">No Questions Added Yet</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Click &quot;Add Question&quot; to build questions manually or &quot;Import CSV&quot; to upload your question pool in bulk.
                    </p>
                  </div>
                </div>
              ) : (
                questionsList.map((q, idx) => (
                  <div key={q._id} className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full text-[10px]">
                            Q{idx + 1}
                          </span>
                          {q.section && (
                            <span className="text-slate-500 font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded-full text-[10px]">
                              {q.section}
                            </span>
                          )}
                          <span className="text-emerald-700 font-bold text-[10px]">+{q.marks || 1} mark(s)</span>
                          {q.negativeMarks > 0 && (
                            <span className="text-rose-600 font-bold text-[10px]">-{q.negativeMarks} neg</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 leading-snug pt-1">{q.text}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={questionStats.isLocked}
                          onClick={() => handleOpenQuestionForm(q)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={questionStats.isLocked}
                          onClick={() => handleDeleteQuestion(q._id)}
                          className="p-1 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Choices with correct answer highlighted */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = q.correctIndex === oIdx;
                        const letters = ['A', 'B', 'C', 'D'];

                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                              isCorrect
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {letters[oIdx]}
                            </span>
                            <span className="truncate">{opt}</span>
                            {isCorrect && (
                              <span className="ml-auto text-[10px] uppercase font-black text-emerald-700 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 text-xs text-slate-500">
              <span>{questionsList.length} total questions in test pool</span>
              <button
                type="button"
                onClick={() => setQuestionBankModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT QUESTION MODAL */}
      {questionFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">
                {editingQuestionId ? 'Edit Question' : 'Add New Question'}
              </h3>
              <button
                type="button"
                onClick={() => setQuestionFormModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Question Text</label>
                <textarea
                  rows="3"
                  required
                  placeholder="Enter the question statement..."
                  value={questionForm.text}
                  onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
                />
              </div>

              {/* Options A-D & Correct Answer Selector */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 block">Answer Choices & Correct Option</label>
                {['A', 'B', 'C', 'D'].map((letter, idx) => (
                  <div key={letter} className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                      <input
                        type="radio"
                        name="correctChoice"
                        checked={questionForm.correctIndex === idx}
                        onChange={() => setQuestionForm({ ...questionForm, correctIndex: idx })}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-700 w-5">({letter})</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={`Option ${letter} text...`}
                      value={questionForm.options[idx]}
                      onChange={(e) => {
                        const newOpts = [...questionForm.options];
                        newOpts[idx] = e.target.value;
                        setQuestionForm({ ...questionForm, options: newOpts });
                      }}
                      className="flex-1 p-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ))}
                <p className="text-[10px] text-slate-400">Select the radio button beside the correct answer.</p>
              </div>

              {/* Marks & Section */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Marks (+)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={questionForm.marks}
                    onChange={(e) => setQuestionForm({ ...questionForm, marks: e.target.value })}
                    className="w-full p-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Negative (-)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={questionForm.negativeMarks}
                    onChange={(e) => setQuestionForm({ ...questionForm, negativeMarks: e.target.value })}
                    className="w-full p-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Section</label>
                  <input
                    type="text"
                    placeholder="e.g. Logic"
                    value={questionForm.section}
                    onChange={(e) => setQuestionForm({ ...questionForm, section: e.target.value })}
                    className="w-full p-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuestion}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingQuestion ? 'Saving...' : editingQuestionId ? 'Update Question' : 'Add Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUESTION CSV IMPORT MODAL */}
      {questionCsvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-900 text-base">Bulk Import Questions from CSV</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuestionCsvModalOpen(false);
                  setQuestionCsvReport(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportQuestionsCsv} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">CSV Column Structure:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const template = `text,optionA,optionB,optionC,optionD,correct,marks,negative,section\n"What is 2+2?","3","4","5","6",B,1,0.25,"Math"\n"Capital of India?","Mumbai","New Delhi","Chennai","Kolkata",B,1,0,"General"`;
                      setQuestionCsvText(template);
                      toast.success('Sample template inserted into text box');
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Insert Sample Template
                  </button>
                </div>
                <p className="text-slate-500 text-[11px] font-mono leading-relaxed">
                  text, optionA, optionB, optionC, optionD, correct (A/B/C/D), marks, negative, section
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Paste CSV Data</label>
                <textarea
                  rows="6"
                  placeholder="Paste CSV rows here..."
                  value={questionCsvText}
                  onChange={(e) => setQuestionCsvText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Or Upload CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setQuestionCsvFile(e.target.files[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {/* Validation Report if present */}
              {questionCsvReport && (
                <div className="p-4 rounded-2xl border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">Import Validation Report:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {questionCsvReport.importedCount} Imported
                    </span>
                    {questionCsvReport.failedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                        {questionCsvReport.failedCount} Failed
                      </span>
                    )}
                  </div>

                  {questionCsvReport.failedRows && questionCsvReport.failedRows.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-rose-200 bg-white p-2 divide-y divide-slate-100 text-[11px]">
                      {questionCsvReport.failedRows.map((fr, idx) => (
                        <div key={idx} className="py-1.5 flex items-start justify-between gap-2 text-rose-700">
                          <span>
                            <strong>Row {fr.row}:</strong> {fr.text ? `"${fr.text}"` : 'Empty statement'}
                          </span>
                          <span className="text-rose-600 italic shrink-0">{fr.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuestionCsvModalOpen(false);
                    setQuestionCsvReport(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isImportingQuestions}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isImportingQuestions ? 'Processing...' : 'Run Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrivePipeline;

