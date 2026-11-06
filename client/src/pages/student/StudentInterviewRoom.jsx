import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Video,
  Clock,
  Calendar,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Camera,
  Mic,
  MicOff,
  RefreshCw,
  ArrowLeft,
  MapPin,
  Sparkles,
  Info,
  ShieldCheck,
  Star,
  Radio,
  UserX,
  XCircle,
  Play,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Format timestamp into IST date and time
 */
const formatISTDateTime = (dateStr) => {
  if (!dateStr) return 'TBA';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatISTTime = (dateStr) => {
  if (!dateStr) return 'TBA';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function StudentInterviewRoom() {
  const { slotId } = useParams();
  const [slot, setSlot] = useState(null);
  const [candidatesAhead, setCandidatesAhead] = useState(0);
  const [currentCalledSlot, setCurrentCalledSlot] = useState(null);
  const [canJoin, setCanJoin] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  // Countdown timer state
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isJoinWindowActive, setIsJoinWindowActive] = useState(false);

  // AV Check state
  const [isTestingMedia, setIsTestingMedia] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [micVolume, setMicVolume] = useState(0);
  const [mediaError, setMediaError] = useState('');
  const videoPreviewRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Fetch slot details
  const fetchSlotDetails = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      const res = await api.get(`/slots/${slotId}`);
      if (res.data.success) {
        setSlot(res.data.slot);
        setCandidatesAhead(res.data.candidatesAhead || 0);
        setCurrentCalledSlot(res.data.currentCalledSlot || null);
        setCanJoin(Boolean(res.data.canJoin));
        setEvaluation(res.data.evaluation || null);
        setLastRefreshedAt(new Date());
        if (showToast) toast.success('Interview queue status refreshed');
      }
    } catch (err) {
      console.error('Error fetching interview slot:', err);
      toast.error(err.response?.data?.message || 'Failed to load interview slot');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSlotDetails();
    // Auto-refresh queue and status every 15 seconds
    const interval = setInterval(() => {
      fetchSlotDetails();
    }, 15000);
    return () => clearInterval(interval);
  }, [slotId]);

  // Live countdown calculation
  useEffect(() => {
    if (!slot?.startTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const startMs = new Date(slot.startTime).getTime();
      const diffMs = startMs - now;

      // Join window is active 10 minutes before start OR when status is in_progress
      const joinWindowActive = diffMs <= 10 * 60 * 1000 || slot.status === 'in_progress';
      setIsJoinWindowActive(joinWindowActive);

      if (slot.status === 'completed') {
        setTimeRemaining('Concluded');
        return;
      }

      if (slot.status === 'in_progress') {
        setTimeRemaining('In Progress Now');
        return;
      }

      if (diffMs <= 0) {
        setTimeRemaining('Slot time started');
        return;
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');
      setTimeRemaining(`${hStr}h ${mStr}m ${sStr}s`);
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [slot]);

  // Student Self Check-in
  const handleCheckIn = async () => {
    try {
      const res = await api.put(`/slots/${slotId}/status`, { status: 'checked_in' });
      if (res.data.success) {
        toast.success('You are checked in! The interviewer has been notified.');
        fetchSlotDetails();
      }
    } catch (err) {
      console.error('Check in error:', err);
      toast.error(err.response?.data?.message || 'Check in failed');
    }
  };

  // Copy Meeting Link
  const handleCopyLink = () => {
    if (!slot?.meetingLink) return;
    navigator.clipboard.writeText(slot.meetingLink);
    toast.success('Meeting link copied to clipboard!');
  };

  // AV Check Start
  const startMediaTest = async () => {
    setMediaError('');
    setIsTestingMedia(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setMediaStream(stream);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      // Audio volume monitoring
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize 0-100
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      console.error('Media error:', err);
      setMediaError(
        err.name === 'NotAllowedError'
          ? 'Camera/microphone access denied. Please allow permissions in your browser.'
          : 'Could not access camera or microphone hardware.'
      );
    }
  };

  // AV Check Stop
  const stopMediaTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
    setMicVolume(0);
    setIsTestingMedia(false);
  };

  useEffect(() => {
    return () => {
      // Cleanup tracks on unmount
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
    };
  }, [mediaStream]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center animate-spin text-indigo-600 mb-4">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Entering Interview Room...</h3>
        <p className="text-xs text-slate-500 mt-1">Retrieving scheduled slot and live panel queue info</p>
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Interview Slot Not Found</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          The requested interview slot could not be located or you may not be authorized to access it.
        </p>
        <Link
          to="/student/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-md hover:bg-indigo-500"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  const round = slot.round || {};
  const drive = round.drive || {};
  const company = drive.company || {};
  const panel = slot.panel || {};
  
  const deliveryMode = round.deliveryMode || (round.mode === 'online' ? 'online_external' : (round.mode === 'offline' ? 'offline_campus' : 'online_external'));
  const isPlatformTest = deliveryMode === 'platform_test';
  const isOffline = deliveryMode === 'offline_campus' || round.mode === 'offline';
  const isOnlineExternal = deliveryMode === 'online_external' || (!isOffline && !isPlatformTest);

  // Check state machine stage
  const isWaiting = slot.status === 'scheduled' || slot.status === 'checked_in';
  const isCalledNow = slot.status === 'in_progress';
  const isCompleted = slot.status === 'completed';
  const isNoShow = slot.status === 'no_show';
  const isCancelled = slot.status === 'cancelled';
  const isTerminal = isCompleted || isNoShow || isCancelled;
  const effectiveCanJoin = !isTerminal && (canJoin || isJoinWindowActive || isCalledNow);

  // Platform test window checks
  const winStart = round.testWindowStart ? new Date(round.testWindowStart) : null;
  const winEnd = round.testWindowEnd ? new Date(round.testWindowEnd) : null;
  const nowTime = new Date();
  const isTestWindowOpen = winStart && nowTime >= winStart && (!winEnd || nowTime <= winEnd);
  const isTestWindowPast = winEnd && nowTime > winEnd;

  // Report by time (configured reportByTime or 15 minutes prior to slot start)
  const reportByTimeStr = round.reportByTime || (slot.startTime
    ? new Date(new Date(slot.startTime).getTime() - 15 * 60 * 1000).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' IST'
    : 'TBA');

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Navigation & Live Sync Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/student/dashboard"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-xs"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                Candidate Interview Room
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="text-xs text-slate-500 font-medium">Queue #{slot.queueNumber}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {company.name || 'Company'} — {round.name || 'Interview Round'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] text-slate-400">
            Auto-refreshed (15s) • {lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={() => fetchSlotDetails(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* STATE MACHINE PROGRESS BAR */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Interview Status Progression</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Step 1: Waiting in Queue */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              isWaiting && !isCalledNow
                ? 'bg-amber-50/70 border-amber-300 text-amber-900 ring-2 ring-amber-400/20'
                : isCalledNow || isCompleted
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Step 1</span>
              {isCalledNow || isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Clock className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <div className="font-bold text-sm">
              {slot.status === 'checked_in' ? 'Checked In (Waiting)' : 'Scheduled in Queue'}
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {candidatesAhead === 0 ? 'You are next in line' : `${candidatesAhead} candidates ahead`}
            </p>
          </div>

          {/* Step 2: You are called, Join now */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              isCalledNow
                ? 'bg-sky-50 border-sky-400 text-sky-900 ring-2 ring-sky-400/30 animate-pulse'
                : effectiveCanJoin && !isCompleted
                ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900'
                : isCompleted
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Step 2</span>
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Radio className={`w-4 h-4 ${isCalledNow ? 'text-sky-600 animate-ping' : 'text-slate-400'}`} />
              )}
            </div>
            <div className="font-bold text-sm">
              {isCalledNow ? 'Called! Enter Now' : 'Join Window Open'}
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {effectiveCanJoin ? 'Room active for candidate' : 'Unlocks 10m before slot'}
            </p>
          </div>

          {/* Step 3: In Progress */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              isCalledNow
                ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-400/20'
                : isCompleted
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Step 3</span>
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Video className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="font-bold text-sm">In Progress</div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {isCalledNow ? 'Interview currently underway' : 'Discussion with panel'}
            </p>
          </div>

          {/* Step 4: Completed */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              isCompleted
                ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-400/20'
                : isNoShow
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Step 4</span>
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : isNoShow ? (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="font-bold text-sm">
              {isCompleted ? 'Completed' : isNoShow ? 'No-Show' : 'Evaluation'}
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {isCompleted ? 'Evaluation recorded' : isNoShow ? 'Marked absent' : 'Pending completion'}
            </p>
          </div>
        </div>
      </div>

      {/* PROMINENT CALLED-IN / ACTION BANNER */}
      {isCalledNow && (
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 p-6 text-white shadow-xl shadow-sky-900/10 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shrink-0">
                <Video className="w-7 h-7 text-white" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-white/20 text-white tracking-wider mb-1">
                  <Radio className="w-3.5 h-3.5 text-amber-300 animate-ping" />
                  YOU ARE CALLED — JOIN NOW
                </span>
                <h2 className="text-xl sm:text-2xl font-black">
                  {panel.name || 'The Interview Panel'} is Ready for You
                </h2>
                <p className="text-xs text-sky-100 mt-1 max-w-xl">
                  Your interview slot is now actively in progress. Please enter the meeting room immediately.
                </p>
              </div>
            </div>

            {slot.meetingLink && !isOffline && (
              <a
                href={slot.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white text-indigo-700 text-sm font-black hover:bg-slate-50 transition-all shadow-md shrink-0 cursor-pointer"
              >
                <Video className="w-4 h-4" />
                <span>Enter Meeting Room Now</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* NO SHOW NOTICE */}
      {isNoShow && (
        <div className="rounded-3xl bg-rose-50 border border-rose-200 p-6 text-rose-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <h3 className="font-bold text-base">You Were Marked as No-Show</h3>
          </div>
          <p className="text-xs text-rose-700">
            You were not present when called for this interview round. If this was due to an unforeseen emergency or technical failure, please contact your college TPO immediately. The TPO can review and authorize a re-test.
          </p>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Queue info, Countdown, Join Controls (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* TERMINAL STATUS CARDS FOR COMPLETED / NO-SHOW / CANCELLED */}
          {isCompleted ? (
            <div className="bg-white rounded-3xl border border-emerald-200/80 p-8 shadow-xs text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Interview Completed</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Your interview with <strong>{company.name}</strong> for <strong>{drive.role}</strong> has concluded. The recruiter has recorded attendance and evaluation for this session.
                </p>
              </div>
              {evaluation && evaluation.sharedWithStudent && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-left space-y-1.5 max-w-md mx-auto text-xs">
                  <span className="font-bold text-emerald-900 block">Feedback from Interviewer:</span>
                  <p className="text-emerald-800 italic">"{evaluation.comments || 'Good performance during interview.'}"</p>
                </div>
              )}
              <div className="pt-2">
                <Link
                  to="/student/applications"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Return to Applications
                </Link>
              </div>
            </div>
          ) : isNoShow ? (
            <div className="bg-white rounded-3xl border border-rose-200/80 p-8 shadow-xs text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <UserX className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Marked as No-Show</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  You were marked absent or did not report for this interview slot. If you believe this is an error or had an emergency, please contact your college TPO immediately.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/student/applications"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Return to Applications
                </Link>
              </div>
            </div>
          ) : isCancelled ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Slot Cancelled</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  This interview slot was cancelled by the coordinator. Please check your placement dashboard for updated instructions.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/student/applications"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Return to Applications
                </Link>
              </div>
            </div>
          ) : isPlatformTest ? (
            /* PLATFORM TEST MODE */
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assessment Delivery</span>
                  <h3 className="text-xl font-black text-slate-900">{round.name} (Online Test)</h3>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200/80 rounded-2xl text-center sm:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Duration</span>
                  <span className="text-lg font-mono font-black text-indigo-900">{round.durationMinutes || 60} min</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600 pb-2 border-b border-slate-200/60">
                  <span className="font-semibold">Test Window Opens:</span>
                  <strong className="text-slate-900">
                    {winStart ? formatISTDateTime(winStart) : 'Scheduled Date'}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-slate-600 pb-2 border-b border-slate-200/60">
                  <span className="font-semibold">Test Window Closes:</span>
                  <strong className="text-slate-900">
                    {winEnd ? formatISTDateTime(winEnd) : 'As per instructions'}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-slate-600 pb-2 border-b border-slate-200/60">
                  <span className="font-semibold">Allotted Duration:</span>
                  <strong className="text-slate-900">{round.durationMinutes || 60} minutes</strong>
                </div>
                {round.cutoffScore !== null && round.cutoffScore !== undefined && (
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-semibold">Passing Cutoff:</span>
                    <strong className="text-emerald-700">{round.cutoffScore}%</strong>
                  </div>
                )}
              </div>

              {round.instructions && (
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900 space-y-1">
                  <span className="font-bold block">Instructions:</span>
                  <p>{round.instructions}</p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  disabled={!isTestWindowOpen}
                  onClick={() => navigate(`/student/test/${round._id}`)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200"
                >
                  <Play className="w-4 h-4" />
                  <span>
                    {isTestWindowPast
                      ? 'Test Window Closed'
                      : isTestWindowOpen
                      ? 'Start Platform Test'
                      : `Test opens at ${winStart ? formatISTDateTime(winStart) : 'scheduled time'}`}
                  </span>
                </button>
                {!isTestWindowOpen && !isTestWindowPast && (
                  <p className="text-center text-[11px] text-amber-700 font-medium mt-2">
                    Test opens at {winStart ? formatISTDateTime(winStart) : 'scheduled date'}, duration {round.durationMinutes || 60} min. Start button is locked until window opens.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ACTIVE QUEUE & JOIN CARD FOR INTERVIEWS (ONLINE / OFFLINE) */
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Queue Position</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">Queue #{slot.queueNumber}</span>
                    <span className="text-xs font-bold text-indigo-600">({panel.name})</span>
                  </div>
                </div>

                {/* Countdown badge */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-center sm:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {isCalledNow ? 'Status' : 'Countdown to Slot'}
                  </span>
                  <span className="text-xl font-mono font-black text-indigo-700">{timeRemaining}</span>
                </div>
              </div>

              {/* Candidates Ahead Alert */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-200/80 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {candidatesAhead}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">
                      {candidatesAhead === 0 ? 'You are Next in Queue!' : `${candidatesAhead} Candidate(s) Ahead of You`}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {candidatesAhead === 0
                        ? 'Stay close and keep ready. The interviewer will call you momentarily.'
                        : 'Each slot typically lasts 20-30 minutes. The queue updates automatically as candidates complete.'}
                    </p>
                  </div>
                </div>

                {/* Self Check-in button */}
                {slot.status === 'scheduled' && (
                  <button
                    onClick={handleCheckIn}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    Mark Check-In
                  </button>
                )}
              </div>

              {/* MEETING / VENUE SECTION */}
              <div className="pt-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-sm text-slate-900">
                      {isOffline ? 'In-Person Interview Venue' : 'Online Interview Meeting'}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      effectiveCanJoin
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {effectiveCanJoin ? 'Join Window Open' : 'Locked Until 10m Prior'}
                  </span>
                </div>

                {/* Offline mode instructions */}
                {isOffline ? (
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-slate-900">
                          {round.venueOrLink || panel.venueOrLink || 'Campus Placement Center'}
                        </div>
                        <div className="text-xs text-slate-600">
                          Room / Desk: <span className="font-semibold text-slate-800">{panel.room ? `Room ${panel.room}` : (panel.name || 'Assigned Room')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px] uppercase">Official Report-By Time</span>
                        <span className="font-bold text-indigo-700 text-sm">{reportByTimeStr}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">(Scheduled slot: {formatISTTime(slot.startTime)} IST)</span>
                    </div>

                    <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
                      <span className="font-bold block">What to carry:</span>
                      <p className="text-[11px] text-indigo-800">
                        Please carry 2 printed copies of your updated resume, college ID card, government photo ID, and wear formal attire.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Online external meeting section (NO IFRAME) */
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/20 border border-slate-200 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Virtual Meeting Link
                        </span>
                        <div className="font-mono text-xs text-slate-700 truncate max-w-md">
                          {slot.meetingLink || 'Meeting link will be provisioned by panel'}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Slot Date & Time: <strong>{formatISTDateTime(slot.startTime)}</strong>
                        </p>
                      </div>

                      {slot.meetingLink && (
                        <button
                          onClick={handleCopyLink}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer self-start sm:self-auto"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy link</span>
                        </button>
                      )}
                    </div>

                    {/* Join Meeting Action Button */}
                    {slot.meetingLink ? (
                      effectiveCanJoin ? (
                        <div className="space-y-2">
                          <a
                            href={slot.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                          >
                            <Video className="w-4 h-4" />
                            <span>Join Meeting (Opens in New Tab)</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <p className="text-center text-[11px] text-slate-500">
                            Opens in full browser tab (Google Meet, Zoom, MS Teams, etc.) without connection drops.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            disabled
                            className="w-full py-3 rounded-2xl bg-slate-100 text-slate-400 font-bold text-sm cursor-not-allowed border border-slate-200 flex items-center justify-center gap-2"
                          >
                            <Video className="w-4 h-4" />
                            <span>Join Meeting Room (Locked)</span>
                          </button>
                          <p className="text-center text-[11px] text-amber-700 font-medium">
                            The Join button unlocks automatically 10 minutes before your slot ({formatISTTime(slot.startTime)} IST) or immediately when called by the interviewer.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                        Meeting room link is being prepared by the recruiter panel. Please check back shortly.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HARDWARE CHECK: CAMERA & MICROPHONE TEST - ONLY FOR ONLINE_EXTERNAL & NON-TERMINAL */}
          {isOnlineExternal && !isTerminal && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Pre-Interview Hardware Verification</h3>
                    <p className="text-[11px] text-slate-500">Test your webcam and audio clarity before joining the panel</p>
                  </div>
                </div>

                {!isTestingMedia ? (
                  <button
                    onClick={startMediaTest}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer border border-indigo-200/70"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Test Camera & Mic</span>
                  </button>
                ) : (
                  <button
                    onClick={stopMediaTest}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <span>Stop Hardware Test</span>
                  </button>
                )}
              </div>

              {/* AV Test Active Display */}
              {isTestingMedia && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-4">
                  {mediaError ? (
                    <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                      {mediaError}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      {/* Video preview */}
                      <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-slate-700">
                        <video
                          ref={videoPreviewRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-emerald-400">
                          Camera Live
                        </span>
                      </div>

                      {/* Mic volume meter */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <Mic className="w-4 h-4 text-emerald-400" />
                            <span>Microphone Input Level</span>
                          </span>
                          <span className="font-mono text-emerald-400 font-bold">{micVolume}%</span>
                        </div>

                        {/* Animated audio bar */}
                        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 p-0.5">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 rounded-full transition-all duration-75"
                            style={{ width: `${micVolume}%` }}
                          />
                        </div>

                        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300 space-y-1">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Hardware Access Granted</span>
                          </div>
                          <p className="text-slate-400">
                            Speak normally into your microphone. The green level bar should bounce as you speak.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* COMPLETED EVALUATION FEEDBACK (IF AVAILABLE & SHARED) */}
          {evaluation && (
            <div className="bg-white rounded-3xl border border-indigo-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <h3 className="font-bold text-sm text-slate-900">Interviewer Feedback & Score</h3>
                </div>
                <span className="text-sm font-black text-indigo-600">{evaluation.score}% Score</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Technical</span>
                  <span className="text-base font-black text-slate-900">
                    {evaluation.criteriaScores?.technical || 0}/5
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Problem Solving</span>
                  <span className="text-base font-black text-slate-900">
                    {evaluation.criteriaScores?.problemSolving || 0}/5
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Communication</span>
                  <span className="text-base font-black text-slate-900">
                    {evaluation.criteriaScores?.communication || 0}/5
                  </span>
                </div>
              </div>

              {evaluation.comments && (
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-xs text-indigo-950 italic">
                  "{evaluation.comments}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Drive, Panel, Interviewers, Instructions (1 col) */}
        <div className="space-y-6">
          {/* Slot Schedule Summary Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Scheduled Time (IST)</h3>
            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center gap-2.5 font-semibold text-slate-900">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>{formatISTDateTime(slot.startTime).split(',')[0]}</span>
              </div>
              <div className="flex items-center gap-2.5 font-semibold text-slate-900">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>
                  {formatISTTime(slot.startTime)} - {formatISTTime(slot.endTime)} IST
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Mode: <span className="font-bold uppercase text-slate-800">{round.mode || 'Online'}</span>
              </div>
            </div>
          </div>

          {/* Panel & Interviewers Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">Interview Panel</h4>
              </div>
              <span className="text-[11px] font-bold text-slate-500">Cap: {panel.capacity || 1}</span>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-sm text-slate-900">{panel.name || 'Assigned Panel'}</div>
              {panel.interviewers && panel.interviewers.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Interviewers</span>
                  {panel.interviewers.map((iv, i) => (
                    <div key={i} className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="font-bold text-slate-800">{iv.name}</div>
                      {iv.email && <div className="text-[11px] text-slate-500 truncate">{iv.email}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Interviewers assigned on arrival</p>
              )}
            </div>
          </div>

          {/* Round Instructions */}
          {round.instructions && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Info className="w-4 h-4 text-indigo-500" />
                <span>Round Instructions</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                "{round.instructions}"
              </p>
            </div>
          )}

          {/* Company Brief Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-600">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900">{company.name}</h4>
                <p className="text-[11px] text-slate-500">{drive.role} • {drive.packageLpa} LPA</p>
              </div>
            </div>
            {company.industry && (
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                Industry: <span className="font-semibold text-slate-700">{company.industry}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

