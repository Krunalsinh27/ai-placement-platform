import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import SafeMarkdown from '../../components/common/SafeMarkdown';
import {
  Bot,
  Sparkles,
  Mic,
  MicOff,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Award,
  BookOpen,
  Calendar,
  Clock,
  RotateCcw,
  Trash2,
  ChevronRight,
  ChevronDown,
  Layers,
  ArrowRight,
  TrendingUp,
  BarChart2,
  Target,
  ShieldCheck,
  Send,
  Loader2,
} from 'lucide-react';

const COMMON_ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Engineer',
  'Data Scientist',
  'DevOps Engineer',
  'Mobile Developer',
  'Software Engineer',
];

const MockInterview = () => {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState('interview'); // 'interview' | 'history'
  const [stage, setStage] = useState('setup'); // 'setup' | 'live' | 'feedback' | 'report'

  // Quota & Available Drives
  const [quota, setQuota] = useState({ used: 0, cap: 5, remaining: 5 });
  const [drives, setDrives] = useState([]);
  const [loadingQuota, setLoadingQuota] = useState(false);

  // Setup Form State
  const [targetRole, setTargetRole] = useState('Frontend Developer');
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [interviewType, setInterviewType] = useState('mixed'); // 'technical' | 'behavioral' | 'hr' | 'mixed'
  const [difficulty, setDifficulty] = useState('intermediate'); // 'beginner' | 'intermediate' | 'advanced'
  const [questionCount, setQuestionCount] = useState(5);
  const [isStarting, setIsStarting] = useState(false);

  // Active Session State
  const [currentSession, setCurrentSession] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState(null);
  const [showSampleAnswer, setShowSampleAnswer] = useState(false);

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef(null);

  // Speech-to-Text State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  // History State
  const [historySessions, setHistorySessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedReportDay, setSelectedReportDay] = useState(1);
  const [expandedTranscriptIdx, setExpandedTranscriptIdx] = useState(null);

  // ---------------------------------------------------------------------------
  // INITIALIZATION & QUOTA
  // ---------------------------------------------------------------------------

  const fetchQuota = async () => {
    try {
      setLoadingQuota(true);
      const res = await api.get('/students/me/mock-interviews/quota');
      if (res.data?.success && res.data.quota) {
        setQuota(res.data.quota);
      }
    } catch (err) {
      console.warn('Failed to fetch mock quota:', err.message);
    } finally {
      setLoadingQuota(false);
    }
  };

  const fetchEligibleDrives = async () => {
    try {
      const res = await api.get('/drives?limit=50');
      if (res.data?.success && Array.isArray(res.data.drives)) {
        setDrives(res.data.drives);
      }
    } catch (_) {}
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/students/me/mock-interviews?limit=30');
      if (res.data?.success && Array.isArray(res.data.sessions)) {
        setHistorySessions(res.data.sessions);
      }
    } catch (err) {
      toast.error('Failed to load past mock interviews');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchQuota();
    fetchEligibleDrives();

    // Setup Web Speech API if available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // TIMER HELPERS
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (stage === 'live') {
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------------------
  // WEB SPEECH API (SPEECH-TO-TEXT)
  // ---------------------------------------------------------------------------

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please type your answer.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        toast.success('Microphone active. Speak your answer clearly.');
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
          setStudentAnswer((prev) => (prev ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim()));
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          toast.error('Microphone permission denied.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // ---------------------------------------------------------------------------
  // INTERVIEW WORKFLOW ACTIONS
  // ---------------------------------------------------------------------------

  const handleStartInterview = async () => {
    if (quota.remaining <= 0) {
      toast.error('Daily mock interview quota reached. Please practice again tomorrow!');
      return;
    }

    try {
      setIsStarting(true);
      const payload = {
        role: targetRole,
        driveId: selectedDriveId || null,
        type: interviewType,
        difficulty,
        questionCount: parseInt(questionCount, 10),
      };

      const res = await api.post('/students/me/mock-interviews', payload);
      if (res.data?.success && res.data.session) {
        setCurrentSession(res.data.session);
        setCurrentQuestionIdx(0);
        setStudentAnswer('');
        setLatestEvaluation(null);
        setShowSampleAnswer(false);
        setTimerSeconds(0);
        setStage('live');
        if (res.data.quota) {
          setQuota(res.data.quota);
        }
        toast.success('Interview session initiated! Ready for Question 1.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to start interview';
      toast.error(msg);
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!studentAnswer.trim()) {
      toast.error('Please enter or dictate an answer before submitting.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    try {
      setIsSubmitting(true);
      const res = await api.post(`/students/me/mock-interviews/${currentSession._id}/answers`, {
        questionIndex: currentQuestionIdx,
        answer: studentAnswer.trim(),
      });

      if (res.data?.success) {
        setLatestEvaluation(res.data.evaluation);
        setCurrentSession(res.data.session);
        setShowSampleAnswer(false);

        if (res.data.isCompleted) {
          toast.success('All questions answered! Generating final evaluation report.');
          setStage('report');
        } else {
          setStage('feedback');
          toast.success('Answer evaluated! Review your breakdown below.');
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to submit answer';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    if (!currentSession) return;
    const nextIdx = currentQuestionIdx + 1;
    if (nextIdx < currentSession.questions.length) {
      setCurrentQuestionIdx(nextIdx);
      setStudentAnswer('');
      setLatestEvaluation(null);
      setShowSampleAnswer(false);
      setTimerSeconds(0);
      setStage('live');
    } else {
      setStage('report');
    }
  };

  const handleViewSessionDetails = async (sessionId) => {
    try {
      const res = await api.get(`/students/me/mock-interviews/${sessionId}`);
      if (res.data?.success && res.data.session) {
        setCurrentSession(res.data.session);
        setStage(res.data.session.status === 'completed' ? 'report' : 'live');
        setActiveTab('interview');
      }
    } catch (err) {
      toast.error('Failed to load session details');
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this mock interview record?')) {
      return;
    }

    try {
      await api.delete(`/students/me/mock-interviews/${sessionId}`);
      toast.success('Session deleted');
      setHistorySessions((prev) => prev.filter((s) => s._id !== sessionId));
      if (currentSession?._id === sessionId) {
        setCurrentSession(null);
        setStage('setup');
      }
    } catch (err) {
      toast.error('Failed to delete session');
    }
  };

  // Helper for score badge colors
  const getScoreBadgeColor = (val) => {
    if (val >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (val >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getScoreBarColor = (val) => {
    if (val >= 80) return 'bg-emerald-500';
    if (val >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // ---------------------------------------------------------------------------
  // RENDER: TOP HEADER & TABS
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden border border-indigo-900/40">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
              <Bot className="w-3.5 h-3.5" />
              <span>AI Technical & Behavioral Placement Simulator</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Mock Interview Studio</h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Practice role-tailored technical, coding architecture, and behavioral questions with instant AI multi-dimensional scoring, STAR evaluation, and actionable 7-day study roadmaps.
            </p>
          </div>

          {/* Daily Quota Indicator */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-xl p-4 flex items-center gap-4 min-w-[210px] shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Daily AI Practice Quota</div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <span>{quota.remaining}</span>
                <span className="text-xs text-slate-400 font-normal">/ {quota.cap} sessions left today</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('interview')}
            className={`pb-4 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'interview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Practice Session</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-4 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Past Sessions & Reports</span>
          </button>
        </div>

        {stage !== 'setup' && activeTab === 'interview' && (
          <button
            onClick={() => {
              if (window.confirm('Leave current interview session and start setup?')) {
                setStage('setup');
                setCurrentSession(null);
              }
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1.5 pb-3"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Exit to Setup</span>
          </button>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: PRACTICE SESSION                                              */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'interview' && (
        <div>
          {/* ================================================================= */}
          {/* STAGE 1: SETUP FORM                                               */}
          {/* ================================================================= */}
          {stage === 'setup' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 md:p-8 space-y-8">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-900">Configure Your Mock Interview</h2>
                <p className="text-xs text-slate-500">
                  Select your target job role, optionally link an upcoming campus placement drive, and customize round settings.
                </p>
              </div>

              {/* Target Role Chips & Input */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Target Job Role
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setTargetRole(role)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        targetRole === role
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="Or enter a custom role (e.g. Cloud Security Analyst, Machine Learning Intern)"
                    className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Optional Link to Campus Drive */}
              {drives.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Link to Eligible Campus Drive (Optional)
                  </label>
                  <p className="text-xs text-slate-400">
                    Questions will be automatically synthesized to match the specific drive's required technical proficiencies.
                  </p>
                  <select
                    value={selectedDriveId}
                    onChange={(e) => {
                      setSelectedDriveId(e.target.value);
                      const d = drives.find((item) => item._id === e.target.value);
                      if (d?.role) setTargetRole(d.role);
                    }}
                    className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-slate-800"
                  >
                    <option value="">-- No Drive Linked (General Preparation) --</option>
                    {drives.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.company?.name || 'Company'} — {d.role} ({d.packageLpa ? `${d.packageLpa} LPA` : 'Campus Drive'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Round Format & Difficulty Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {/* Interview Type */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Round Format
                  </label>
                  <select
                    value={interviewType}
                    onChange={(e) => setInterviewType(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option value="mixed">Mixed (Technical + CS + Behavioral)</option>
                    <option value="technical">Technical & System Architecture</option>
                    <option value="behavioral">Behavioral (STAR Method Scenarios)</option>
                    <option value="hr">HR & Cultural Fit Round</option>
                  </select>
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Difficulty Level
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option value="beginner">Beginner (Foundational / Fresher)</option>
                    <option value="intermediate">Intermediate (Standard Campus Tier)</option>
                    <option value="advanced">Advanced (Product / High Package)</option>
                  </select>
                </div>

                {/* Question Count */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Question Count
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option value="3">3 Questions (Quick 10-min Sprint)</option>
                    <option value="5">5 Questions (Standard Simulation)</option>
                    <option value="7">7 Questions (Comprehensive Assessment)</option>
                  </select>
                </div>
              </div>

              {/* Start Interview CTA */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Resume profile PII is automatically redacted before LLM processing.</span>
                </div>

                <button
                  onClick={handleStartInterview}
                  disabled={isStarting || quota.remaining <= 0}
                  className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 text-sm"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Custom Questions...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Start Mock Interview</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 2: LIVE QUESTION ANSWERING                                  */}
          {/* ================================================================= */}
          {stage === 'live' && currentSession && (
            <div className="space-y-6">
              {/* Progress & Header Bar */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                    {currentQuestionIdx + 1}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">
                      Question {currentQuestionIdx + 1} of {currentSession.questions.length}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {currentSession.targetRole} • {currentSession.difficulty}
                    </div>
                  </div>
                </div>

                {/* Progress bar and timer */}
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 transition-all duration-300"
                      style={{
                        width: `${((currentQuestionIdx + 1) / currentSession.questions.length) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-mono text-xs font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatTimer(timerSeconds)}</span>
                  </div>
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {currentSession.questions[currentQuestionIdx]?.category || 'Technical'}
                  </span>
                  {currentSession.questions[currentQuestionIdx]?.competency && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      Competency: {currentSession.questions[currentQuestionIdx].competency}
                    </span>
                  )}
                </div>

                <div className="text-lg md:text-xl font-bold text-slate-900 leading-snug">
                  {currentSession.questions[currentQuestionIdx]?.question}
                </div>

                {currentSession.questions[currentQuestionIdx]?.category === 'behavioral' && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>STAR Framework Recommended:</strong> Structure your response around <strong>Situation</strong>, <strong>Task</strong>, <strong>Action</strong>, and <strong>Result</strong> with concrete metrics.
                    </span>
                  </div>
                )}
              </div>

              {/* Answer Box */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Your Response</span>
                  </label>

                  {/* Speech-to-Text Button */}
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleSpeechRecognition}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        isListening
                          ? 'bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/30'
                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Listening... Click to Finish</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Voice Input (Speech-to-Text)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <textarea
                  rows={8}
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  placeholder="Type your structured answer here, or click 'Voice Input' to dictate in real time..."
                  className="w-full text-sm border border-slate-300 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed text-slate-800 resize-y"
                />

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{studentAnswer.length} / 4000 characters</span>
                  <span>Press submit when ready for instant AI evaluation</span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={isSubmitting || !studentAnswer.trim()}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-all shadow-sm shadow-indigo-600/30 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Evaluating Response...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Answer for Evaluation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 3: INSTANT FEEDBACK CARD                                    */}
          {/* ================================================================= */}
          {stage === 'feedback' && latestEvaluation && (
            <div className="space-y-6">
              {/* Question Recap */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Evaluated Question {currentQuestionIdx + 1}
                </div>
                <div className="text-base font-medium">
                  {currentSession.questions[currentQuestionIdx]?.question}
                </div>
              </div>

              {/* Score Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Overall</div>
                  <div className="text-2xl font-bold text-indigo-600">
                    {latestEvaluation.score?.overall || 0}%
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Correctness</div>
                  <div className="text-xl font-bold text-slate-800">
                    {latestEvaluation.score?.correctness || 0}%
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Clarity</div>
                  <div className="text-xl font-bold text-slate-800">
                    {latestEvaluation.score?.clarity || 0}%
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Depth</div>
                  <div className="text-xl font-bold text-slate-800">
                    {latestEvaluation.score?.depth || 0}%
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1 shadow-sm col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-500 font-medium">Structure</div>
                  <div className="text-xl font-bold text-slate-800">
                    {latestEvaluation.score?.structure || 0}%
                  </div>
                </div>
              </div>

              {/* STAR Framework Evaluation (if applicable) */}
              {latestEvaluation.starEvaluation && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    <span>STAR Methodology Alignment</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    {[
                      { key: 'situation', label: 'Situation (Context)' },
                      { key: 'task', label: 'Task (Responsibility)' },
                      { key: 'action', label: 'Action (Your Steps)' },
                      { key: 'result', label: 'Result (Metrics & Impact)' },
                    ].map(({ key, label }) => {
                      const present = Boolean(latestEvaluation.starEvaluation[key]);
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                            present
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <CheckCircle2
                            className={`w-4 h-4 ${present ? 'text-emerald-600' : 'text-slate-300'}`}
                          />
                          <span>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {latestEvaluation.starEvaluation.comment && (
                    <p className="text-xs text-slate-500 pt-1 italic">
                      {latestEvaluation.starEvaluation.comment}
                    </p>
                  )}
                </div>
              )}

              {/* Assessor Feedback */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Assessor Critique & Observations</span>
                </div>
                <div className="text-sm text-slate-800 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/70">
                  <SafeMarkdown content={latestEvaluation.feedback} />
                </div>
              </div>

              {/* Collapsible Ideal Sample Answer */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowSampleAnswer(!showSampleAnswer)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-slate-900">
                      View Benchmark Sample Answer
                    </span>
                  </div>
                  {showSampleAnswer ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showSampleAnswer && (
                  <div className="p-6 pt-2 bg-indigo-50/40 border-t border-slate-100 text-sm text-slate-800 leading-relaxed">
                    <SafeMarkdown content={latestEvaluation.sampleAnswer} />
                  </div>
                )}
              </div>

              {/* Proceed Action */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleNextQuestion}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2 text-sm"
                >
                  <span>
                    {currentQuestionIdx + 1 < currentSession.questions.length
                      ? 'Proceed to Next Question'
                      : 'View Final Report & 7-Day Plan'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 4: FINAL REPORT & 7-DAY STUDY PLAN                          */}
          {/* ================================================================= */}
          {stage === 'report' && currentSession && (
            <div className="space-y-8">
              {/* Report Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Interview Simulation Completed</span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900">
                      Performance Evaluation Report: {currentSession.targetRole}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Completed on {new Date(currentSession.completedAt || Date.now()).toLocaleDateString()} • {currentSession.type} round • {currentSession.difficulty} level
                    </p>
                  </div>

                  <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl px-6 py-4 text-center">
                    <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                      Overall Score
                    </div>
                    <div className="text-3xl font-extrabold text-indigo-600">
                      {currentSession.scores?.overall || 0}%
                    </div>
                  </div>
                </div>

                {/* Multi-Dimensional Score Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Technical Correctness & Accuracy', val: currentSession.scores?.correctness || 0 },
                    { label: 'Communication Clarity & Articulation', val: currentSession.scores?.clarity || 0 },
                    { label: 'Technical Depth & Internal Mechanics', val: currentSession.scores?.depth || 0 },
                    { label: 'Response Structure & Framework Adherence', val: currentSession.scores?.structure || 0 },
                  ].map(({ label, val }) => (
                    <div key={label} className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                        <span>{label}</span>
                        <span className="font-bold">{val}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${getScoreBarColor(val)}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Executive Summary */}
                {currentSession.feedback?.summary && (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Executive Summary
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                      {currentSession.feedback.summary}
                    </p>
                  </div>
                )}

                {/* Strengths & Weaknesses Chips */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>Key Demonstrated Strengths</span>
                    </div>
                    <ul className="space-y-2">
                      {(currentSession.feedback?.strengths || []).map((str, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-700 bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl flex items-start gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Areas for Improvement</span>
                    </div>
                    <ul className="space-y-2">
                      {(currentSession.feedback?.weaknesses || []).map((w, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-700 bg-amber-50/60 border border-amber-100 p-2.5 rounded-xl flex items-start gap-2"
                        >
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Personalized 7-Day Improvement Plan */}
              {Array.isArray(currentSession.feedback?.improvementPlan) &&
                currentSession.feedback.improvementPlan.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Targeted Action Roadmap</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Personalized 7-Day Placement Study Plan
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tailored day-by-day practice tasks targeting your evaluated weak spots for the {currentSession.targetRole} role.
                      </p>
                    </div>

                    {/* Day Selector Buttons */}
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
                      {currentSession.feedback.improvementPlan.map((p) => (
                        <button
                          key={p.day}
                          onClick={() => setSelectedReportDay(p.day)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            selectedReportDay === p.day
                              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <span>Day {p.day}</span>
                        </button>
                      ))}
                    </div>

                    {/* Active Day Content */}
                    {(() => {
                      const activeDayObj = currentSession.feedback.improvementPlan.find(
                        (p) => p.day === selectedReportDay
                      );
                      if (!activeDayObj) return null;
                      return (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 space-y-4">
                          <div>
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                              Day {activeDayObj.day} Focus
                            </span>
                            <h4 className="text-base font-bold text-slate-900 mt-0.5">
                              {activeDayObj.title}
                            </h4>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                              {activeDayObj.focus}
                            </p>
                          </div>

                          <div className="space-y-2 pt-2">
                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                              Recommended Action Items
                            </span>
                            <div className="space-y-2">
                              {(activeDayObj.tasks || []).map((task, tIdx) => (
                                <div
                                  key={tIdx}
                                  className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 flex items-start gap-3 shadow-xs"
                                >
                                  <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                                    {tIdx + 1}
                                  </div>
                                  <span className="leading-relaxed">{task}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

              {/* Complete Interview Transcript Review */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Full Session Transcript Review</h3>
                  <p className="text-xs text-slate-500">
                    Review all questions, your submitted responses, and benchmark sample answers.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  {(currentSession.answers || []).map((ans, idx) => {
                    const qObj = currentSession.questions.find((q) => q.questionId === ans.questionId);
                    const isExpanded = expandedTranscriptIdx === idx;
                    return (
                      <div
                        key={idx}
                        className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTranscriptIdx(isExpanded ? null : idx)}
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 line-clamp-1 max-w-lg">
                              {qObj?.question || `Question ${idx + 1}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getScoreBadgeColor(ans.score?.overall || 0)}`}>
                              {ans.score?.overall || 0}%
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-4 bg-white border-t border-slate-200 space-y-3 text-xs leading-relaxed">
                            <div>
                              <span className="font-semibold text-slate-700">Question: </span>
                              <span className="text-slate-800">{qObj?.question}</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                              <span className="font-semibold text-slate-700 block mb-1">Your Answer:</span>
                              <p className="text-slate-800 whitespace-pre-wrap">{ans.answer}</p>
                            </div>
                            <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100">
                              <span className="font-semibold text-indigo-900 block mb-1">Assessor Feedback:</span>
                              <p className="text-slate-800">{ans.feedback}</p>
                            </div>
                            {ans.sampleAnswer && (
                              <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                                <span className="font-semibold text-emerald-900 block mb-1">Sample Answer Benchmark:</span>
                                <SafeMarkdown content={ans.sampleAnswer} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setStage('setup');
                    setCurrentSession(null);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-all shadow-sm shadow-indigo-600/30 flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start New Practice Session</span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>View All Past Sessions</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: PAST SESSIONS & REPORT HISTORY                                */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 md:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Your Mock Interview History</h2>
            <p className="text-xs text-slate-500">
              Review your progress, past questions, and personalized improvement plans.
            </p>
          </div>

          {loadingHistory ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
              <p className="text-xs">Loading past interview records...</p>
            </div>
          ) : historySessions.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-3 border-2 border-dashed border-slate-200 rounded-2xl">
              <Bot className="w-10 h-10 mx-auto text-slate-300" />
              <div className="text-sm font-semibold text-slate-700">No mock interview sessions recorded yet</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Take your first role-tailored mock interview to unlock personalized scoring and a 7-day study plan.
              </p>
              <button
                onClick={() => {
                  setActiveTab('interview');
                  setStage('setup');
                }}
                className="mt-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
              >
                Start Your First Session
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {historySessions.map((session) => (
                <div
                  key={session._id}
                  onClick={() => handleViewSessionDetails(session._id)}
                  className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/70 p-3 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{session.targetRole}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                        {session.type}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                        {session.difficulty}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3">
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{session.answeredCount} / {session.totalQuestions} Questions</span>
                      <span>•</span>
                      <span className={session.status === 'completed' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                        {session.status === 'completed' ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    {session.status === 'completed' && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreBadgeColor(session.scores?.overall || 0)}`}>
                        Score: {session.scores?.overall || 0}%
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(session._id, e)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MockInterview;
