import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Send,
  HelpCircle,
  FileText,
  Award,
  RefreshCw,
  XCircle,
  ArrowLeft,
  Eye,
  Check,
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function StudentAptitudeTest() {
  const { roundId } = useParams();
  const navigate = useNavigate();

  // Test session state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roundInfo, setRoundInfo] = useState(null);
  const [attemptStatus, setAttemptStatus] = useState('not_started'); // not_started, in_progress, submitted, auto_submitted
  const [attemptId, setAttemptId] = useState(null);

  // Questions and student answers
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: selectedIndex }
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'

  // Timer and deadline
  const [deadlineAt, setDeadlineAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Monitoring
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false);

  // Modals & UI controls
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  const timerRef = useRef(null);
  const lastTabSwitchCall = useRef(0);

  // 1. Fetch current attempt status on mount
  const fetchAttempt = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/tests/${roundId}/attempt`);
      if (res.data.success) {
        setAttemptStatus(res.data.status);
        if (res.data.round) setRoundInfo(res.data.round);

        if (res.data.status === 'in_progress') {
          setAttemptId(res.data.attemptId);
          setQuestions(res.data.questions || []);
          setDeadlineAt(res.data.deadlineAt);
          setRemainingSeconds(res.data.remainingSeconds || 0);
          setTabSwitchCount(res.data.tabSwitchCount || 0);

          // Populate local answers map
          const initialAns = {};
          (res.data.questions || []).forEach((q) => {
            if (q.selectedIndex !== null && q.selectedIndex !== undefined && q.selectedIndex >= 0) {
              initialAns[q._id] = q.selectedIndex;
            }
          });
          setAnswers(initialAns);
        } else if (['submitted', 'auto_submitted', 'expired'].includes(res.data.status)) {
          setSubmissionResult(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to load test attempt:', err);
      setError(err.response?.data?.message || 'Failed to initialize aptitude test session.');
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchAttempt();
  }, [fetchAttempt]);

  // 2. Countdown Timer
  useEffect(() => {
    if (attemptStatus !== 'in_progress' || !deadlineAt) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(deadlineAt).getTime();
      const diffSec = Math.max(0, Math.floor((end - now) / 1000));
      setRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        clearInterval(timerRef.current);
        handleAutoSubmit();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attemptStatus, deadlineAt]);

  // 3. Tab Switch Detection (visibilitychange & blur)
  useEffect(() => {
    if (attemptStatus !== 'in_progress') return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const now = Date.now();
        // Debounce calls within 1.5s
        if (now - lastTabSwitchCall.current > 1500) {
          lastTabSwitchCall.current = now;
          try {
            const res = await api.post(`/tests/${roundId}/tab-switch`);
            if (res.data.success) {
              setTabSwitchCount(res.data.tabSwitchCount);
              setTabSwitchWarning(true);
            }
          } catch (e) {
            console.error('Tab switch report error:', e);
          }
        }
      }
    };

    const handleBlur = async () => {
      const now = Date.now();
      if (now - lastTabSwitchCall.current > 1500) {
        lastTabSwitchCall.current = now;
        try {
          const res = await api.post(`/tests/${roundId}/tab-switch`);
          if (res.data.success) {
            setTabSwitchCount(res.data.tabSwitchCount);
            setTabSwitchWarning(true);
          }
        } catch (e) {
          console.error('Tab switch blur error:', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [attemptStatus, roundId]);

  // 4. Start Test Handler
  const handleStartTest = async () => {
    try {
      setLoading(true);
      const res = await api.post(`/tests/${roundId}/start`);
      if (res.data.success) {
        toast.success(res.data.message || 'Test started!');
        setStartConfirmOpen(false);
        await fetchAttempt();
      }
    } catch (err) {
      console.error('Start test error:', err);
      toast.error(err.response?.data?.message || 'Could not start test. Please verify test window.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Autosave Choice Handler
  const handleSelectOption = async (optionIndex) => {
    if (attemptStatus !== 'in_progress') return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    // Optimistic UI update
    const previousChoice = answers[currentQ._id];
    const newChoice = previousChoice === optionIndex ? null : optionIndex; // clicking same clears selection

    setAnswers((prev) => {
      const updated = { ...prev };
      if (newChoice === null) delete updated[currentQ._id];
      else updated[currentQ._id] = newChoice;
      return updated;
    });

    setSaveStatus('saving');
    try {
      const res = await api.put(`/tests/${roundId}/answer`, {
        questionId: currentQ._id,
        selectedIndex: newChoice,
      });
      if (res.data.success) {
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('Autosave error:', err);
      setSaveStatus('error');
      // Revert if rejected due to deadline
      if (err.response?.data?.message?.includes('deadline')) {
        toast.error('Test deadline has passed.');
        handleAutoSubmit();
      }
    }
  };

  // 6. Manual Submit Handler
  const handleSubmitTest = async () => {
    try {
      setSubmitting(true);
      const res = await api.post(`/tests/${roundId}/submit`);
      if (res.data.success) {
        setAttemptStatus(res.data.status);
        setSubmissionResult(res.data);
        setSubmitConfirmOpen(false);
        toast.success('Assessment submitted successfully!');
      }
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Failed to submit test.');
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Auto-Submit on Timeout
  const handleAutoSubmit = async () => {
    try {
      setSubmitting(true);
      const res = await api.post(`/tests/${roundId}/submit`);
      if (res.data.success) {
        setAttemptStatus(res.data.status);
        setSubmissionResult(res.data);
        setSubmitConfirmOpen(false);
        toast('Time is up! Your responses were auto-submitted.', { icon: '⏰' });
      }
    } catch (err) {
      console.error('Auto-submit error:', err);
      // Fetch latest state if already auto-submitted on server
      fetchAttempt();
    } finally {
      setSubmitting(false);
    }
  };

  // Format MM:SS or HH:MM:SS
  const formatTimer = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Calculation of answered count
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const currentQ = questions[currentIndex];

  // ---------------------------------------------------------------------------
  // RENDER: LOADING & ERROR STATES
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center animate-spin mb-4">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Initializing Assessment Session...</h3>
        <p className="text-xs text-slate-500 mt-1">Connecting to server and checking schedule window</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 p-8 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Assessment Unavailable</h3>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
          <div className="pt-2">
            <Link
              to="/student/applications"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to My Applications</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: COMPLETED / SUBMITTED RESULT VIEW
  // ---------------------------------------------------------------------------
  if (['submitted', 'auto_submitted', 'expired'].includes(attemptStatus)) {
    const isAuto = attemptStatus === 'auto_submitted';
    const showScore = submissionResult?.showScore;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200/80 p-8 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {isAuto ? 'Auto-Submitted at Deadline' : 'Submitted Successfully'}
            </span>
            <h2 className="text-2xl font-black text-slate-900">Assessment Completed</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Your answers have been securely recorded on the placement portal server.
            </p>
          </div>

          {/* If recruiter permitted candidate score visibility */}
          {showScore ? (
            <div className="p-6 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-center space-y-3">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Your Test Performance</span>
              <div className="flex items-center justify-center gap-6">
                <div>
                  <span className="text-3xl font-black text-indigo-900">
                    {submissionResult.score ?? 0}
                  </span>
                  <span className="text-xs text-indigo-600 block font-medium">
                    Marks (out of {submissionResult.totalMarks || 100})
                  </span>
                </div>
                <div className="h-10 w-px bg-indigo-200" />
                <div>
                  <span className="text-3xl font-black text-indigo-900">
                    {submissionResult.percentage ?? 0}%
                  </span>
                  <span className="text-xs text-indigo-600 block font-medium">Percentage</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <span className="font-bold text-slate-800 block">Score Visibility Notice:</span>
              <p>
                Scores for this assessment are kept confidential until the hiring team completes evaluation and publishes shortlisting results.
              </p>
            </div>
          )}

          {tabSwitchCount > 0 && (
            <div className="flex items-center justify-center gap-2 text-xs text-amber-700 bg-amber-50 py-2 px-3 rounded-xl border border-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>{tabSwitchCount} tab switch event(s) recorded during this test session</span>
            </div>
          )}

          <div className="pt-2">
            <Link
              to="/student/applications"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to My Applications</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PRE-TEST / INSTRUCTIONS SCREEN (not_started)
  // ---------------------------------------------------------------------------
  if (attemptStatus === 'not_started') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200">
                Online Assessment
              </span>
              <h1 className="text-2xl font-black text-slate-900">
                {roundInfo?.name || 'Aptitude Test'}
              </h1>
              <p className="text-xs text-slate-500">
                {roundInfo?.companyName} • {roundInfo?.role}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Duration</span>
              <span className="text-base font-black text-slate-900">{roundInfo?.durationMinutes || 60} min</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Questions</span>
              <span className="text-base font-black text-slate-900">{roundInfo?.questionCount || 0}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Marks</span>
              <span className="text-base font-black text-slate-900">{roundInfo?.totalMarks || 0}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Negative Marking</span>
              <span className={`text-xs font-bold block mt-1 ${roundInfo?.negativeMarking ? 'text-amber-600' : 'text-emerald-600'}`}>
                {roundInfo?.negativeMarking ? 'Enabled' : 'None'}
              </span>
            </div>
          </div>

          {/* Test Guidelines */}
          <div className="space-y-3 bg-slate-50/80 rounded-2xl p-5 border border-slate-200 text-xs text-slate-700 leading-relaxed">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              <span>Assessment Instructions & Guidelines:</span>
            </h4>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                <strong>Timer begins immediately</strong> once you click &quot;Start Test&quot;. You cannot pause the timer.
              </li>
              <li>
                <strong>Automatic response saving:</strong> Every answer you select is autosaved to the server in real time.
              </li>
              <li>
                <strong>Tab-Switch Monitoring:</strong> Leaving or minimizing this browser window will be logged as a security alert and flagged to the recruiters.
              </li>
              <li>
                <strong>Server-side deadline:</strong> The test will automatically conclude when your duration expires or the test window closes.
              </li>
              <li>
                You can freely navigate between questions and update your selections before final submission.
              </li>
            </ul>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              to="/student/applications"
              className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel and Return
            </Link>
            <button
              onClick={() => setStartConfirmOpen(true)}
              className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              Begin Assessment
            </button>
          </div>
        </div>

        {/* Start Confirmation Dialog */}
        {startConfirmOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Ready to Start?</h3>
                <p className="text-xs text-slate-500">
                  Your {roundInfo?.durationMinutes || 60}-minute assessment timer will begin immediately upon confirmation.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStartConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={handleStartTest}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-xs cursor-pointer"
                >
                  Yes, Start Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: ACTIVE IN-PROGRESS TEST WORKSPACE
  // ---------------------------------------------------------------------------
  const isTimeCritical = remainingSeconds > 0 && remainingSeconds <= 300; // < 5 mins
  const isTimeWarning = remainingSeconds > 300 && remainingSeconds <= 600; // < 10 mins

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* 1. STICKY TOP TEST HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-8 py-3 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Round & Autosave status */}
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 leading-tight">
                {roundInfo?.name || 'Aptitude Assessment'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-500 font-medium">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  {saveStatus === 'saving' && (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-rose-600 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Save Error
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Server-synced Countdown & Submit action */}
          <div className="flex items-center gap-3">
            {/* Timer Badge */}
            <div
              className={`px-3.5 py-1.5 rounded-2xl border font-mono font-black text-sm flex items-center gap-2 transition-all ${
                isTimeCritical
                  ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                  : isTimeWarning
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <Clock className={`w-4 h-4 ${isTimeCritical ? 'text-rose-600' : 'text-slate-500'}`} />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

            <button
              onClick={() => setSubmitConfirmOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Submit Test</span>
              <span className="sm:hidden">Submit</span>
            </button>
          </div>
        </div>
      </header>

      {/* TAB SWITCH WARNING ALERT */}
      {tabSwitchWarning && (
        <div className="bg-amber-500 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-xs animate-bounce">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Warning: Tab switch detected! (Count: {tabSwitchCount}). Your screen activity is monitored and reported to the hiring company.
            </span>
          </div>
          <button
            onClick={() => setTabSwitchWarning(false)}
            className="text-white hover:text-amber-100 font-bold ml-2 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. MAIN SPLIT WORKSPACE: QUESTIONS & NAVIGATOR */}
      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        {/* LEFT / CENTER: ACTIVE QUESTION DISPLAY (3 cols) */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-xs">
          {currentQ ? (
            <div className="space-y-6">
              {/* Question metadata */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full">
                    Question {currentIndex + 1}
                  </span>
                  {currentQ.section && (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {currentQ.section}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="text-emerald-700">+{currentQ.marks || 1} mark(s)</span>
                  {roundInfo?.negativeMarking && currentQ.negativeMarks > 0 && (
                    <span className="text-rose-600">-{currentQ.negativeMarks} on wrong</span>
                  )}
                </div>
              </div>

              {/* Question text */}
              <div className="text-base md:text-lg font-bold text-slate-900 leading-relaxed">
                {currentQ.text}
              </div>

              {/* 4 Options cards */}
              <div className="space-y-3 pt-2">
                {currentQ.options.map((opt, oIdx) => {
                  const isSelected = answers[currentQ._id] === oIdx;
                  const optionLetters = ['A', 'B', 'C', 'D'];

                  return (
                    <button
                      key={oIdx}
                      type="button"
                      onClick={() => handleSelectOption(oIdx)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20 text-indigo-950 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {optionLetters[oIdx]}
                      </div>
                      <span className="text-sm font-medium pt-0.5 leading-snug">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {/* Clear selection option */}
              {answers[currentQ._id] !== undefined && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectOption(answers[currentQ._id])}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear selection for this question
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400">No question selected.</div>
          )}

          {/* Bottom Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-8">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">
              Autosaved to placement portal
            </span>

            {currentIndex < questions.length - 1 ? (
              <button
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer shadow-xs"
              >
                <span>Next Question</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setSubmitConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Review & Submit</span>
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: QUESTION NAVIGATOR PALETTE (1 col) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <h3 className="font-black text-slate-900 text-sm">Question Navigator</h3>

            {/* Status Legend */}
            <div className="grid grid-cols-2 gap-2 text-[11px] pb-3 border-b border-slate-100 font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300" />
                <span>Skipped ({unansweredCount})</span>
              </div>
            </div>

            {/* Question numbers grid */}
            <div className="grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto p-1">
              {questions.map((q, idx) => {
                const isAnswered = answers[q._id] !== undefined;
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q._id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl font-bold text-xs transition-all flex items-center justify-center cursor-pointer ${
                      isCurrent
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-black'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => setSubmitConfirmOpen(true)}
                className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs transition-colors cursor-pointer"
              >
                Submit Assessment
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SUBMIT CONFIRMATION MODAL */}
      {submitConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Send className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">Confirm Assessment Submission</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to finish this test? Once submitted, you cannot change any answers.
              </p>
            </div>

            {/* Answer summary counts */}
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Answered</span>
                <span className="text-xl font-black text-emerald-900">{answeredCount}</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Unanswered</span>
                <span className="text-xl font-black text-amber-900">{unansweredCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSubmitConfirmOpen(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Return to Test
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitTest}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Yes, Submit Final'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

