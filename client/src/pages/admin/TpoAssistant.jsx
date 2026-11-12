import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Sparkles,
  Send,
  Zap,
  ShieldCheck,
  Building2,
  Users,
  Award,
  Calendar,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  Layers,
  ArrowRight,
  TrendingUp,
  Briefcase,
  FileText,
  Trash2,
  Lightbulb,
  Info,
  CheckCircle2,
  UserCheck,
  Check,
  Target,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';
import SafeMarkdown from '../../components/common/SafeMarkdown';

const TpoAssistant = () => {
  const { user } = useAuth();
  const role = String(user?.role || 'tpo').toLowerCase();

  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, cap: 30, remaining: 30 });
  const [rateLimited, setRateLimited] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedHowMap, setExpandedHowMap] = useState({});

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load role-tailored suggestions and usage quota
  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const res = await api.get('/assistant/suggestions');
        if (res.data?.success) {
          if (res.data.suggestedQuestions) {
            setSuggestions(res.data.suggestedQuestions);
          }
          if (res.data.dailyUsage) {
            setDailyUsage(res.data.dailyUsage);
          }
        }
      } catch (err) {
        // Fallback gracefully
      }
    };
    loadSuggestions();
  }, [role]);

  const toggleHow = (index) => {
    setExpandedHowMap((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Find the last successful answer for follow-up context
  const getLastToolContext = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool && msg.tool !== 'unknown') {
        return { tool: msg.tool, params: msg.params || {} };
      }
    }
    return null;
  };

  // Submit via Ask AI (/api/assistant/ask)
  const handleAsk = async (e) => {
    if (e) e.preventDefault();
    const q = inputQuestion.trim();
    if (!q || loading) return;

    if (q.length > 300) {
      toast.error('Question must be 300 characters or less.');
      return;
    }

    const previous = getLastToolContext();
    const userMessage = {
      role: 'user',
      text: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuestion('');
    setLoading(true);

    try {
      const res = await api.post('/assistant/ask', {
        question: q,
        previous,
      });

      if (res.data) {
        const assistantMessage = {
          role: 'assistant',
          answer: res.data.answer,
          data: res.data.data,
          tool: res.data.tool,
          params: res.data.params,
          source: res.data.source || 'ai',
          canAnswer: res.data.canAnswer !== false,
          suggestedQuestions: res.data.suggestedQuestions,
          generatedAt: res.data.generatedAt || new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
      }
    } catch (err) {
      console.error('Assistant error:', err);
      if (err.response?.status === 429) {
        setRateLimited(true);
        toast.error('Daily AI rate limit reached. Please try again tomorrow.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to get answer from assistant.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Direct tool execution via chip (/api/assistant/run)
  const handleRunTool = async (chip) => {
    if (loading) return;

    const userMessage = {
      role: 'user',
      text: chip.question || chip.label,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await api.post('/assistant/run', {
        tool: chip.tool,
        params: chip.params || {},
      });

      if (res.data) {
        const assistantMessage = {
          role: 'assistant',
          answer: res.data.answer,
          data: res.data.data,
          tool: res.data.tool,
          params: res.data.params,
          source: res.data.source || 'direct',
          canAnswer: res.data.canAnswer !== false,
          suggestedQuestions: res.data.suggestedQuestions,
          generatedAt: res.data.generatedAt || new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
      }
    } catch (err) {
      console.error('Direct run error:', err);
      toast.error(err.response?.data?.message || 'Failed to run tool.');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setExpandedHowMap({});
  };

  // Render Visualizer component based on tool and data
  const renderDataVisualizer = (tool, data) => {
    if (!data) return null;

    // --- TPO Tools ---

    // 1. Placement Summary KPIs Grid
    if (tool === 'placementSummary') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Placement Rate
            </span>
            <span className="text-lg font-extrabold text-indigo-600 block mt-0.5">
              {data.placementPercentage ?? 0}%
            </span>
            <span className="text-[11px] text-slate-500">
              {data.placedStudents} of {data.totalStudents} placed
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Total Offers
            </span>
            <span className="text-lg font-extrabold text-emerald-600 block mt-0.5">
              {data.totalOffers ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">
              {data.registeredForPlacement} registered
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Highest Package
            </span>
            <span className="text-lg font-extrabold text-amber-600 block mt-0.5">
              {data.highestPackage ? `${data.highestPackage} LPA` : 'N/A'}
            </span>
            <span className="text-[11px] text-slate-500">Top accepted offer</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Avg / Median
            </span>
            <span className="text-lg font-extrabold text-slate-800 block mt-0.5">
              {data.averagePackage ? `${data.averagePackage}` : 'N/A'}
              <span className="text-xs font-normal text-slate-500"> / {data.medianPackage ?? 'N/A'} LPA</span>
            </span>
            <span className="text-[11px] text-slate-500">Package metrics</span>
          </div>
        </div>
      );
    }

    // 2. Department Breakdown
    if (tool === 'departmentBreakdown' && Array.isArray(data) && data.length > 0) {
      return (
        <div className="space-y-3 my-3">
          <div className="h-48 w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="department" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                <Tooltip
                  formatter={(val, name) => [
                    name === 'placementPercentage' ? `${val}%` : val,
                    name === 'placementPercentage' ? 'Placement %' : name,
                  ]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="placementPercentage" fill="#4f46e5" radius={[4, 4, 0, 0]} name="placementPercentage" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Placed</th>
                  <th className="px-3 py-2 text-right">Placement %</th>
                  <th className="px-3 py-2 text-right">Avg Package</th>
                  <th className="px-3 py-2 text-right">Top Package</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{row.department}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{row.total}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-emerald-600">{row.placed}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-indigo-600">{row.placementPercentage}%</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">
                      {row.avgPackage ? `${row.avgPackage} LPA` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-600">
                      {row.highestPackage ? `${row.highestPackage} LPA` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 3. Unplaced Students List
    if (tool === 'unplacedStudents' && Array.isArray(data.students)) {
      if (data.students.length === 0) return null;
      return (
        <div className="my-3 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Enrollment No</th>
                <th className="px-3 py-2 text-left">Branch</th>
                <th className="px-3 py-2 text-right">CGPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.students.map((st, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{st.name}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{st.enrollmentNo || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{st.branch}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                    {st.cgpa ? Number(st.cgpa).toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // --- Student Tools ---

    // S1. My Applications
    if (tool === 'myApplications' && Array.isArray(data.applications)) {
      if (data.applications.length === 0) return null;
      return (
        <div className="my-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.applications.map((app, idx) => (
            <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-slate-900 text-xs">{app.company}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  app.status === 'offered' || app.status === 'selected'
                    ? 'bg-emerald-100 text-emerald-800'
                    : app.status === 'shortlisted'
                    ? 'bg-indigo-100 text-indigo-800'
                    : app.status === 'rejected'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {app.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {app.role} {app.packageLpa ? `• ${app.packageLpa} LPA` : ''}
              </div>
              <div className="text-[10px] text-slate-400">
                Applied on: {app.appliedAt}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // S2. My Upcoming Interviews
    if (tool === 'myUpcomingInterviews' && Array.isArray(data.interviews)) {
      if (data.interviews.length === 0) return null;
      return (
        <div className="my-3 space-y-2">
          {data.interviews.map((slot, idx) => (
            <div key={idx} className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-900 block">{slot.company} — {slot.role}</span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  {slot.round} • Queue #{slot.queueNumber}
                </span>
                <span className="text-[10px] text-indigo-700 font-semibold block mt-0.5">
                  {new Date(slot.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-600 text-white uppercase tracking-wider">
                {slot.status}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // S3. Upcoming Eligible Drives
    if (tool === 'upcomingEligibleDrives' && Array.isArray(data.drives)) {
      if (data.drives.length === 0) return null;
      return (
        <div className="my-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.drives.map((d, idx) => (
            <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-slate-900 text-xs">{d.company}</span>
                {d.matchScore !== null && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                    {d.matchScore}% Match
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600">
                {d.role} {d.packageLpa ? `• ${d.packageLpa} LPA` : ''}
              </div>
              <div className="text-[10px] text-slate-400">
                Deadline: {d.lastDateToApply}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // S4. My Eligibility
    if (tool === 'myEligibility' && data.found) {
      return (
        <div className={`my-3 p-3.5 rounded-xl border ${
          data.isEligible ? 'bg-emerald-50/70 border-emerald-300' : 'bg-amber-50/70 border-amber-300'
        } space-y-2 text-xs`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">{data.company} — {data.role}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase ${
              data.isEligible ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
            }`}>
              {data.isEligible ? 'Eligible' : 'Not Eligible'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200/60">
            <div className="p-2 bg-white/80 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Department</span>
              <span className={`font-semibold ${data.checks?.branch?.pass ? 'text-emerald-700' : 'text-rose-600'}`}>
                {data.checks?.branch?.pass ? '✓ Match' : '✗ Ineligible'}
              </span>
            </div>
            <div className="p-2 bg-white/80 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">CGPA Cutoff</span>
              <span className={`font-semibold ${data.checks?.cgpa?.pass ? 'text-emerald-700' : 'text-rose-600'}`}>
                {data.checks?.cgpa?.pass ? '✓ Satisfied' : '✗ Below Cutoff'}
              </span>
            </div>
            <div className="p-2 bg-white/80 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Backlogs</span>
              <span className={`font-semibold ${data.checks?.backlogs?.pass ? 'text-emerald-700' : 'text-rose-600'}`}>
                {data.checks?.backlogs?.pass ? '✓ Allowed' : '✗ Exceeded'}
              </span>
            </div>
            <div className="p-2 bg-white/80 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Deadline</span>
              <span className={`font-semibold ${data.checks?.deadline?.pass ? 'text-emerald-700' : 'text-rose-600'}`}>
                {data.checks?.deadline?.pass ? '✓ Open' : '✗ Expired'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // --- Recruiter Tools ---

    // R1. My Drives Summary
    if (tool === 'myDrivesSummary') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Total Drives</span>
            <span className="text-lg font-extrabold text-indigo-600 block mt-0.5">{data.totalDrives ?? 0}</span>
            <span className="text-[11px] text-slate-500">{data.activeDrivesCount ?? 0} active</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Applicants</span>
            <span className="text-lg font-extrabold text-slate-900 block mt-0.5">{data.totalApplicants ?? 0}</span>
            <span className="text-[11px] text-slate-500">Across campuses</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Offers Accepted</span>
            <span className="text-lg font-extrabold text-emerald-600 block mt-0.5">{data.totalOffers ?? 0}</span>
            <span className="text-[11px] text-slate-500">Placed talent</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Completed</span>
            <span className="text-lg font-extrabold text-slate-700 block mt-0.5">{data.completedDrivesCount ?? 0}</span>
            <span className="text-[11px] text-slate-500">Concluded</span>
          </div>
        </div>
      );
    }

    // R3. My Top Applicants
    if (tool === 'myTopApplicants' && Array.isArray(data.applicants)) {
      if (data.applicants.length === 0) return null;
      return (
        <div className="my-3 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Applicant</th>
                <th className="px-3 py-2 text-left">College</th>
                <th className="px-3 py-2 text-left">Branch</th>
                <th className="px-3 py-2 text-right">Match Score</th>
                <th className="px-3 py-2 text-right">CGPA</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.applicants.map((a, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-1.5 font-bold text-slate-800">{a.name}</td>
                  <td className="px-3 py-1.5 text-slate-600">{a.collegeCode || a.college}</td>
                  <td className="px-3 py-1.5 text-slate-600">{a.branch}</td>
                  <td className="px-3 py-1.5 text-right font-extrabold text-emerald-600">
                    {a.matchScore !== null ? `${a.matchScore}%` : 'N/A'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                    {a.cgpa ? Number(a.cgpa).toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  // UI Header Configuration per role
  const getHeaderConfig = () => {
    if (role === 'student') {
      return {
        title: 'Ask AI — Student Placement Assistant',
        subtitle: 'Instant answers on your applications, upcoming interview slots, eligible drives, and career advice',
        welcomeTitle: 'How can I help with your placements today?',
        welcomeDesc: 'Ask about your applied drives, upcoming interviews, check eligibility for specific companies, your resume ATS score, or interview preparation tips.',
        scopeBadge: 'Strictly scoped to your student record and enrolled college',
        placeholder: 'Ask about applications, upcoming interviews, eligibility for Google, resume score...',
      };
    }
    if (role === 'recruiter') {
      return {
        title: 'Ask AI — Recruiter Assistant',
        subtitle: 'Real-time analytics on your active campus drives, funnels, top candidates, and requests',
        welcomeTitle: 'How can I assist your campus hiring today?',
        welcomeDesc: 'Ask questions about your drives overview, applicant funnels, top ranked candidates, or campus drive requests.',
        scopeBadge: 'Strictly scoped to your company\'s campus drives and invitations',
        placeholder: 'Ask about drives summary, applicant funnels, top ranked candidates, requests...',
      };
    }
    return {
      title: 'Ask AI — TPO Analytics Assistant',
      subtitle: 'Instant natural language answers to placement statistics, drive pipeline funnels, and student tracking',
      welcomeTitle: 'How can I assist your placement operations today?',
      welcomeDesc: 'Ask natural questions about placement rates, unplaced candidates, company statistics, drive funnels, upcoming schedules, or specific skills.',
      scopeBadge: 'Strictly computed over your college\'s student, drive, and placement records',
      placeholder: 'Ask about placement summary, unplaced candidates, company stats, funnels...',
    };
  };

  const headerConfig = getHeaderConfig();
  const chatRemaining = dailyUsage.chat?.remaining ?? dailyUsage.chatRemaining ?? dailyUsage.remaining ?? 30;
  const chatCap = dailyUsage.chat?.cap ?? dailyUsage.chatCap ?? dailyUsage.cap ?? 30;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                {headerConfig.title}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {headerConfig.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Daily Quota Indicator */}
            <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <strong className="text-indigo-600 font-bold">{chatRemaining}</strong> of{' '}
              {chatCap} AI chats left today
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer transition-colors"
                title="Clear current chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Security & Data Scope Notice */}
        <div className="mt-4 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center gap-2 text-xs text-indigo-900">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Isolated Data Scope:</strong> {headerConfig.scopeBadge}
          </span>
        </div>
      </div>

      {/* Suggested Questions Strip */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Quick Queries (Runs directly with 0 AI chat tokens)
          </span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleRunTool(chip)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Messages Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs min-h-[420px] flex flex-col justify-between">
        <div className="space-y-6">
          {messages.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                {headerConfig.welcomeTitle}
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {headerConfig.welcomeDesc}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isExpanded = Boolean(expandedHowMap[index]);

              if (isUser) {
                return (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-2xl bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-xs text-xs">
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              }

              // Assistant Response Card
              return (
                <div key={index} className="flex justify-start">
                  <div className="max-w-3xl w-full bg-slate-50/70 border border-slate-200 rounded-2xl rounded-bl-sm p-4 text-xs space-y-3">
                    {/* Header badge & source */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center">
                          <Sparkles className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-slate-800">
                          {role === 'student' ? 'Student Assistant' : role === 'recruiter' ? 'Recruiter Assistant' : 'TPO Assistant'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            msg.source === 'ai'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : msg.source === 'direct'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : msg.source === 'help'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : msg.source === 'general'
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {msg.source === 'ai' && <Sparkles className="w-2.5 h-2.5" />}
                          {msg.source === 'direct' && <Zap className="w-2.5 h-2.5" />}
                          {msg.source === 'help' && <HelpCircle className="w-2.5 h-2.5" />}
                          {msg.source === 'general' && <Lightbulb className="w-2.5 h-2.5" />}
                          {msg.source === 'rules' && <ShieldCheck className="w-2.5 h-2.5" />}
                          <span>{msg.source}</span>
                        </span>
                      </div>
                    </div>

                    {/* Disclaimer banner for General Mode */}
                    {msg.source === 'general' && (
                      <div className="text-[11px] font-medium text-sky-800 bg-sky-50 px-2.5 py-1.5 rounded-lg border border-sky-200 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>General answer, not from your college data</span>
                      </div>
                    )}

                    {/* Natural language template or guide answer with safe markdown rendering */}
                    <SafeMarkdown content={msg.answer} />

                    {/* Data Visualizer (Table, Chart, KPIs, or Funnel) */}
                    {msg.canAnswer && renderDataVisualizer(msg.tool, msg.data)}

                    {/* Suggested questions chips if cannot answer */}
                    {!msg.canAnswer && Array.isArray(msg.suggestedQuestions) && (
                      <div className="space-y-2 pt-2">
                        <span className="text-[11px] font-semibold text-slate-500">
                          Try asking one of these:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.suggestedQuestions.slice(0, 4).map((sq, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleRunTool(sq)}
                              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 hover:text-indigo-600 hover:border-indigo-300 text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              {sq.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* "How I got this" collapsible section */}
                    {msg.canAnswer && msg.tool && (
                      <div className="pt-2 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => toggleHow(index)}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                          <span>How I got this</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 p-3 bg-white border border-slate-200 rounded-xl text-[11px] space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-medium">Selected Tool:</span>
                              <code className="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-semibold">
                                {msg.tool}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-medium">Validated Filters:</span>
                              <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                {JSON.stringify(msg.params || {})}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-medium">Routing Engine:</span>
                              <span className="text-slate-600 capitalize">{msg.source}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-bl-sm p-4 text-xs flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-600 font-medium">
                  Routing question and computing placement analytics...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Question Input Bar */}
        <form onSubmit={handleAsk} className="mt-6 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value.slice(0, 300))}
                disabled={loading}
                placeholder={headerConfig.placeholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                {inputQuestion.length}/300
              </span>
            </div>

            <button
              type="submit"
              disabled={!inputQuestion.trim() || loading}
              className="inline-flex items-center justify-center p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-colors cursor-pointer"
              title="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TpoAssistant;
