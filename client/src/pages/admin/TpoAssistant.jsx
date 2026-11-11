import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
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

const DEFAULT_SUGGESTIONS = [
  {
    label: '📊 Placement Summary',
    question: 'What is our overall placement summary?',
    tool: 'placementSummary',
    params: {},
  },
  {
    label: '🏢 Department Breakdown',
    question: 'Show placement breakdown by department',
    tool: 'departmentBreakdown',
    params: {},
  },
  {
    label: '⏳ Unplaced CSE Students',
    question: 'How many students are unplaced in CSE?',
    tool: 'unplacedStudents',
    params: { department: 'CSE' },
  },
  {
    label: '📅 Upcoming Drives (30d)',
    question: 'What placement drives are scheduled in the next 30 days?',
    tool: 'upcomingDrives',
    params: { days: 30 },
  },
  {
    label: '✉️ Offer Status',
    question: 'What is the current status of extended offers?',
    tool: 'offerStatus',
    params: {},
  },
  {
    label: '🏆 Top 5 Packages',
    question: 'Show the top 5 highest placement packages offered',
    tool: 'topPackages',
    params: { limit: 5 },
  },
  {
    label: '📄 Without Resume',
    question: 'How many students have not uploaded or analyzed a resume?',
    tool: 'studentsWithoutResume',
    params: {},
  },
  {
    label: '🐍 Students with Python',
    question: 'Which students have Python in their verified resume skills?',
    tool: 'studentsWithSkill',
    params: { skill: 'python' },
  },
  {
    label: '💼 Company Stats',
    question: 'Show hiring statistics across all recruiting companies',
    tool: 'companyStats',
    params: {},
  },
];

const TpoAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, cap: 400, remaining: 400 });
  const [rateLimited, setRateLimited] = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [expandedHowMap, setExpandedHowMap] = useState({});

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load initial suggestions and usage quota
  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const res = await api.get('/assistant/suggestions');
        if (res.data.success) {
          if (res.data.suggestedQuestions) {
            setSuggestions(res.data.suggestedQuestions);
          }
          if (res.data.dailyUsage) {
            setDailyUsage(res.data.dailyUsage);
          }
        }
      } catch (err) {
        // Fallback to static suggestions
      }
    };
    loadSuggestions();
  }, []);

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
          source: 'direct',
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
      toast.error(err.response?.data?.message || 'Failed to run analytics tool.');
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

    // 2. Department Breakdown (Chart + Table)
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

    // 4. Company Stats List
    if (tool === 'companyStats' && Array.isArray(data) && data.length > 0) {
      return (
        <div className="my-3 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-right">Drives</th>
                <th className="px-3 py-2 text-right">Applicants</th>
                <th className="px-3 py-2 text-right">Offers</th>
                <th className="px-3 py-2 text-right">Accepted</th>
                <th className="px-3 py-2 text-right">Avg Package</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800">{c.company}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{c.drives}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{c.applicants}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-indigo-600">{c.offers}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-emerald-600">{c.accepted}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">
                    {c.avgPackage ? `${c.avgPackage} LPA` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // 5. Drive Funnel
    if (tool === 'driveFunnel' && data.found) {
      return (
        <div className="my-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span>{data.company} — {data.driveTitle}</span>
            <span className="text-emerald-600 font-bold">{data.conversionRate}% Conversion</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Applied</span>
              <span className="text-base font-bold text-slate-800 block mt-0.5">{data.applied}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Shortlisted</span>
              <span className="text-base font-bold text-indigo-600 block mt-0.5">{data.shortlisted}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Offered</span>
              <span className="text-base font-bold text-amber-600 block mt-0.5">{data.offered}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Accepted</span>
              <span className="text-base font-bold text-emerald-600 block mt-0.5">{data.accepted}</span>
            </div>
          </div>
        </div>
      );
    }

    // 6. Upcoming Drives
    if (tool === 'upcomingDrives' && Array.isArray(data) && data.length > 0) {
      return (
        <div className="my-3 space-y-2">
          {data.map((d, i) => (
            <div
              key={i}
              className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-bold text-slate-800 block text-sm">{d.company}</span>
                <span className="text-slate-500">{d.role} • Eligible: {d.eligibleBranches.join(', ') || 'All'}</span>
              </div>
              <div className="text-right">
                <span className="text-indigo-600 font-bold block">{d.driveDate}</span>
                <span className="text-[10px] text-slate-400">Deadline: {d.applicationDeadline}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // 7. Offer Status
    if (tool === 'offerStatus') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
          <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-center">
            <span className="text-[10px] font-bold text-emerald-700 uppercase block">Accepted</span>
            <span className="text-xl font-black text-emerald-700 block mt-0.5">{data.accepted}</span>
          </div>
          <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-center">
            <span className="text-[10px] font-bold text-amber-700 uppercase block">Pending</span>
            <span className="text-xl font-black text-amber-700 block mt-0.5">{data.pending}</span>
          </div>
          <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-xl text-center">
            <span className="text-[10px] font-bold text-rose-700 uppercase block">Expiring Soon (7d)</span>
            <span className="text-xl font-black text-rose-700 block mt-0.5">{data.expiringSoon}</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Declined / Revoked</span>
            <span className="text-xl font-black text-slate-700 block mt-0.5">{data.declined}</span>
          </div>
        </div>
      );
    }

    // 8 & 9. Students with Skill or Without Resume
    if ((tool === 'studentsWithSkill' || tool === 'studentsWithoutResume') && Array.isArray(data.students)) {
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

    // 10. Top Packages Leaderboard
    if (tool === 'topPackages' && Array.isArray(data) && data.length > 0) {
      return (
        <div className="my-3 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-3 py-2 text-left">Rank</th>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-left">Branch</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-right">Package</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-bold text-amber-600">#{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{r.studentName}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.branch}</td>
                  <td className="px-3 py-1.5 text-slate-800">{r.company}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.role}</td>
                  <td className="px-3 py-1.5 text-right font-extrabold text-indigo-600">
                    {r.packageLpa ? `${r.packageLpa} LPA` : '—'}
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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Ask AI — Placement Analytics Assistant
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Instant analytics answering powered by intent routing • Strict college data isolation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Daily Quota Indicator */}
            <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <strong className="text-indigo-600 font-bold">{dailyUsage.remaining}</strong> of{' '}
              {dailyUsage.cap} requests left today
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
            <strong>Isolated College Scope:</strong> Answers are strictly computed over your college's student, drive, and placement records.
          </span>
        </div>
      </div>

      {/* Suggested Questions Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Quick Analytics Queries (Runs directly with 0 AI tokens)
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

      {/* Chat Messages Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs min-h-[420px] flex flex-col justify-between">
        <div className="space-y-6">
          {messages.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                How can I assist your placement operations today?
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Ask natural questions about placement rates, unplaced candidates, company statistics, drive funnels, upcoming schedules, or specific skills.
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
                        <span className="font-bold text-slate-800">TPO Assistant</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            msg.source === 'ai'
                              ? 'bg-purple-100 text-purple-700'
                              : msg.source === 'direct'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {msg.source === 'ai' && <Sparkles className="w-2.5 h-2.5" />}
                          {msg.source === 'direct' && <Zap className="w-2.5 h-2.5" />}
                          {msg.source === 'rules' && <ShieldCheck className="w-2.5 h-2.5" />}
                          <span className="uppercase">{msg.source}</span>
                        </span>
                      </div>
                    </div>

                    {/* Natural language template answer */}
                    <p className="text-slate-800 text-sm leading-relaxed">{msg.answer}</p>

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
                    {msg.canAnswer && (
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
                placeholder="Ask about placement summary, unplaced candidates, company stats, funnels..."
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

