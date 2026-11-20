import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Square,
  RefreshCw,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Plus,
  MessageSquare,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  TrendingUp,
  Building2,
  Users,
  Award,
  Layers,
  ArrowRight,
  Clock,
  Shield,
  SendHorizontal,
  Search,
  Pin,
  PinOff,
  MoreHorizontal,
  Edit2,
  X,
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
import api, { getAccessToken } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { registerSessionResetHandler } from '../../utils/sessionManager';
import SafeMarkdown from '../common/SafeMarkdown';
import { groupConversationsByDate } from '../../utils/dateGrouping';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * AssistantChat: Reusable, multi-role AI Placement Assistant component.
 * Supports SSE token streaming, conversation memory management,
 * tool data visualizations, feedback ratings, and TPO escalation.
 */
const AssistantChat = ({ role: propRole = null }) => {
  const { user } = useAuth();
  const currentUserId = user?._id || user?.id || null;
  const activeRole = String(propRole || user?.role || 'tpo').toLowerCase();

  // State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState(null);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, cap: 30, remaining: 30 });
  const [suggestions, setSuggestions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [ratedMap, setRatedMap] = useState({});
  const [escalating, setEscalating] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const renameInputRef = useRef(null);
  const isUserScrolledUpRef = useRef(false);

  // Close conversation action dropdown menu on click outside
  useEffect(() => {
    if (!activeMenuId) return;
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  // Auto-scroll to bottom with user-scroll awareness
  const scrollToBottom = (force = false) => {
    if (force || !isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 120;
    isUserScrolledUpRef.current = isUp;
    setShowScrollToLatest(isUp);
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, streamStatus]);

  // Load suggestions & usage on mount
  useEffect(() => {
    const fetchSuggestions = async () => {
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
      } catch (_) {}
    };
    fetchSuggestions();
  }, [activeRole]);

  const resetChatState = React.useCallback(() => {
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setInputQuestion('');
    setIsStreaming(false);
    setStreamStatus(null);
    setDailyUsage({ used: 0, cap: 30, remaining: 30 });
    setSuggestions([]);
  }, []);

  // Listen to session reset (logout, 401, cross-tab)
  useEffect(() => {
    return registerSessionResetHandler(() => {
      resetChatState();
    });
  }, [resetChatState]);

  // Load user conversation list
  const loadConversations = async () => {
    try {
      const res = await api.get('/assistant/conversations');
      if (res.data?.success && Array.isArray(res.data.conversations)) {
        setConversations(res.data.conversations);
      }
    } catch (_) {}
  };

  useEffect(() => {
    resetChatState();
    if (currentUserId) {
      loadConversations();
    }
  }, [currentUserId, resetChatState]);

  // Load specific conversation thread
  const selectConversation = async (conversationId) => {
    if (!conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      return;
    }
    setActiveConversationId(conversationId);
    try {
      const res = await api.get(`/assistant/conversations/${conversationId}`);
      if (res.data?.success && Array.isArray(res.data.messages)) {
        const loaded = res.data.messages.map((m) => ({
          messageId: m.messageId || m._id,
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.content || m.question || '',
          tool: m.tool,
          data: m.data,
          sources: m.sources || [],
          timestamp: m.createdAt,
          feedback: m.feedback,
        }));
        setMessages(loaded);
        isUserScrolledUpRef.current = false;
        setShowScrollToLatest(false);
      }
    } catch (err) {
      toast.error('Failed to load conversation messages');
    }
  };

  // Start a fresh conversation
  const handleNewChat = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveConversationId(null);
    setMessages([]);
    setInputQuestion('');
    setStreamStatus(null);
    isUserScrolledUpRef.current = false;
    setShowScrollToLatest(false);
  };

  // Start inline rename for a conversation
  const handleStartRename = (e, c) => {
    e.stopPropagation();
    setActiveMenuId(null);
    setEditingId(c.conversationId);
    setEditTitle(c.title || c.firstQuestion || '');
  };

  // Save inline rename
  const handleSaveRename = async (conversationId) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await api.patch(`/assistant/conversations/${conversationId}`, { title: trimmed });
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === conversationId ? { ...c, title: trimmed } : c))
      );
      toast.success('Conversation renamed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rename conversation');
    } finally {
      setEditingId(null);
    }
  };

  // Toggle pinned status
  const handleTogglePin = async (e, conv) => {
    e.stopPropagation();
    setActiveMenuId(null);
    const newPinned = !conv.pinned;
    try {
      await api.patch(`/assistant/conversations/${conv.conversationId}`, { pinned: newPinned });
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.conversationId === conv.conversationId ? { ...c, pinned: newPinned } : c
        );
        return [...updated].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
          const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
          return timeB - timeA;
        });
      });
      toast.success(newPinned ? 'Conversation pinned' : 'Conversation unpinned');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update pin status');
    }
  };

  // Delete a single conversation with confirmation
  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    setActiveMenuId(null);
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    try {
      await api.delete(`/assistant/conversations/${convId}`);
      setConversations((prev) => prev.filter((c) => c.conversationId !== convId));
      if (activeConversationId === convId) {
        handleNewChat();
      }
      toast.success('Conversation removed');
    } catch (err) {
      toast.error('Failed to delete conversation');
    }
  };

  // Clear all conversations
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete all conversations?')) return;
    try {
      await api.delete('/assistant/conversations');
      setConversations([]);
      handleNewChat();
      toast.success('All conversations cleared');
    } catch (err) {
      toast.error('Failed to clear conversations');
    }
  };

  // Copy text to clipboard
  const handleCopy = (id, text) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit feedback rating
  const handleFeedback = async (messageId, rating) => {
    if (!messageId || ratedMap[messageId]) return;
    try {
      await api.post('/assistant/feedback', {
        messageId,
        conversationId: activeConversationId,
        rating,
      });
      setRatedMap((prev) => ({ ...prev, [messageId]: rating }));
      toast.success(rating === 1 ? 'Thanks for the positive feedback!' : 'Feedback recorded');
    } catch (err) {
      toast.error('Failed to submit feedback');
    }
  };

  // Escalate to TPO (for students)
  const handleEscalateToTpo = async (unansweredQuestion) => {
    const q = unansweredQuestion || messages[messages.length - 2]?.content || inputQuestion;
    if (!q) return;
    setEscalating(true);
    try {
      const res = await api.post('/assistant/escalate', {
        question: q,
        conversationId: activeConversationId,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Question forwarded to college TPO');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to forward to TPO');
    } finally {
      setEscalating(false);
    }
  };

  // Submit question (via SSE Stream with fallback)
  const handleSubmit = async (overrideText = null) => {
    const q = (overrideText || inputQuestion).trim();
    if (!q || isStreaming) return;

    if (q.length > 1500) {
      toast.error('Questions must be 1,500 characters or less.');
      return;
    }

    isUserScrolledUpRef.current = false;
    setShowScrollToLatest(false);

    const userMessage = {
      messageId: `user_${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date(),
    };

    const tempAssistantId = `assistant_${Date.now()}`;
    const initialAssistantMessage = {
      messageId: tempAssistantId,
      role: 'assistant',
      content: '',
      tool: null,
      data: null,
      sources: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setInputQuestion('');
    setIsStreaming(true);
    setStreamStatus('Connecting...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/assistant/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: q,
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Fallback or rate limited
        if (res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.message || 'Daily AI chat quota reached.');
          setMessages((prev) =>
            prev.map((m) =>
              m.messageId === tempAssistantId
                ? { ...m, content: errData.message || 'Daily quota reached. Please try again tomorrow.' }
                : m
            )
          );
          setIsStreaming(false);
          setStreamStatus(null);
          return;
        }
        throw new Error(`Stream request failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let dataStr = '';
          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
          }

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'status') {
                if (data.state === 'thinking') setStreamStatus('Thinking...');
                else if (data.state === 'calling_tool') setStreamStatus(`Querying platform: ${data.tool}...`);
                else if (data.state === 'synthesizing') setStreamStatus('Synthesizing answer...');
                else if (data.state === 'fallback') setStreamStatus('Running fallback...');
              } else if (eventType === 'delta') {
                accumulatedContent += data.text || '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.messageId === tempAssistantId
                      ? { ...m, content: accumulatedContent }
                      : m
                  )
                );
              } else if (eventType === 'tool_data') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.messageId === tempAssistantId
                      ? { ...m, tool: data.tool, data: data.data }
                      : m
                  )
                );
              } else if (eventType === 'done') {
                if (data.conversationId) {
                  setActiveConversationId(data.conversationId);
                }
                if (data.dailyUsage) {
                  setDailyUsage(data.dailyUsage);
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.messageId === tempAssistantId
                      ? {
                          ...m,
                          messageId: data.messageId || tempAssistantId,
                          content: accumulatedContent || data.answer || m.content,
                          tool: data.tool || m.tool,
                          data: data.data || m.data,
                          sources: data.sources || m.sources,
                          canEscalateToTpo: data.canEscalateToTpo,
                        }
                      : m
                  )
                );
                loadConversations();
              } else if (eventType === 'conversation_title') {
                if (data.conversationId && data.title) {
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.conversationId === data.conversationId
                        ? { ...c, title: data.title, isNewTitle: true }
                        : c
                    )
                  );
                  // Remove pulse highlight after 2.5 seconds
                  setTimeout(() => {
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.conversationId === data.conversationId
                          ? { ...c, isNewTitle: false }
                          : c
                      )
                    );
                  }, 2500);
                }
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        toast('Generation stopped');
      } else {
        // Fallback to standard ask endpoint
        try {
          const fallbackRes = await api.post('/assistant/ask', {
            question: q,
            conversationId: activeConversationId,
          });
          if (fallbackRes.data?.success) {
            const data = fallbackRes.data;
            if (data.conversationId) setActiveConversationId(data.conversationId);
            if (data.dailyUsage) setDailyUsage(data.dailyUsage);
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === tempAssistantId
                  ? {
                      ...m,
                      messageId: data.messageId || tempAssistantId,
                      content: data.answer,
                      tool: data.tool,
                      data: data.data,
                      sources: data.sources || [],
                      canEscalateToTpo: data.canEscalateToTpo,
                    }
                  : m
              )
            );
            loadConversations();
          }
        } catch (fbErr) {
          toast.error(fbErr.response?.data?.message || 'Assistant response failed');
        }
      }
    } finally {
      setIsStreaming(false);
      setStreamStatus(null);
      abortControllerRef.current = null;
      // Guarantee up-to-date titles by polling ~3s after reply completes
      setTimeout(() => {
        loadConversations();
      }, 3000);
    }
  };

  // Stop generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    let lastUserQ = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserQ = messages[i].content;
        break;
      }
    }
    if (lastUserQ) {
      handleSubmit(lastUserQ);
    }
  };

  // Render Tool Data Charts & Cards
  const renderToolData = (tool, data) => {
    if (!data) return null;

    if (tool === 'departmentBreakdown' && Array.isArray(data.departments)) {
      const chartData = data.departments.map((d) => ({
        name: d.branch,
        total: d.totalStudents,
        placed: d.placedCount,
        rate: parseFloat(d.percentage) || 0,
      }));

      return (
        <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-700 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Department Breakdown
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} />
                <YAxis stroke="#cbd5e1" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#475569', borderRadius: '8px' }}
                  itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                />
                <Bar dataKey="total" fill="#64748b" name="Total Students" radius={[4, 4, 0, 0]} />
                <Bar dataKey="placed" fill="#6366f1" name="Placed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if ((tool === 'driveFunnel' || tool === 'myDriveFunnel') && typeof data === 'object') {
      const stages = [
        { label: 'Applied', val: data.applied ?? 0, bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60' },
        { label: 'Shortlisted', val: data.shortlisted ?? 0, bg: 'bg-sky-950/80 text-sky-300 border-sky-800/60' },
        { label: 'Interview', val: data.interview ?? 0, bg: 'bg-amber-950/80 text-amber-300 border-amber-800/60' },
        { label: 'Selected', val: data.accepted ?? data.selected ?? 0, bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' },
      ];

      return (
        <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-700 text-white shadow-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5 mb-3">
            <Layers className="w-3.5 h-3.5 text-indigo-400" /> Recruitment Funnel
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stages.map((stg) => (
              <div key={stg.label} className={`p-3 rounded-lg text-center ${stg.bg} border`}>
                <div className="text-xl font-bold text-white">{stg.val}</div>
                <div className="text-xs text-slate-300 font-medium">{stg.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const roleTheme = {
    student: {
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      heroGrad: 'from-emerald-600 to-teal-700',
      label: 'Student Career & Placement Assistant',
    },
    recruiter: {
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      heroGrad: 'from-amber-600 to-orange-700',
      label: 'Recruiter Hiring & Pipeline Assistant',
    },
    tpo: {
      badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
      heroGrad: 'from-indigo-600 to-blue-700',
      label: 'University TPO Placement Intelligence',
    },
    superadmin: {
      badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
      heroGrad: 'from-purple-600 to-indigo-700',
      label: 'Superadmin Multi-Campus Assistant',
    },
  }[activeRole] || {
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    heroGrad: 'from-indigo-600 to-blue-700',
    label: 'AI Placement Assistant',
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    const title = (c.title || c.firstQuestion || '').toLowerCase();
    return title.includes(query);
  });

  const conversationGroups = groupConversationsByDate(filteredConversations);

  return (
    <div className="flex flex-1 min-h-0 w-full h-full bg-slate-950 text-slate-100 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
      {/* Sidebar / Conversation Drawer */}
      <div
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } md:w-72 flex-shrink-0 transition-all duration-300 ease-in-out bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden`}
      >
        <div className="p-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>

        {/* Client-Side Conversation Search Box */}
        <div className="px-3 py-2 border-b border-slate-800/80 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              aria-label="Search conversation history"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Thread History List with Date Grouping */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">No past conversations</div>
          ) : conversationGroups.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">No matching conversations</div>
          ) : (
            conversationGroups.map((group) => (
              <div key={group.key} className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 select-none flex items-center gap-1.5">
                  {group.key === 'pinned' && <Pin className="w-3 h-3 text-indigo-400 inline" />}
                  <span>{group.label}</span>
                </div>
                {group.items.map((c) => {
                  const isActive = c.conversationId === activeConversationId;
                  const isEditing = editingId === c.conversationId;
                  const isMenuOpen = activeMenuId === c.conversationId;
                  const displayTitle = c.title || c.firstQuestion || 'Conversation';

                  return (
                    <div
                      key={c.conversationId}
                      onClick={() => !isEditing && selectConversation(c.conversationId)}
                      className={`group relative flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs transition-all ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-200 font-medium border border-indigo-500/30'
                          : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                      } ${c.isNewTitle ? 'animate-pulse bg-indigo-500/10' : ''}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isEditing) {
                          selectConversation(c.conversationId);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 truncate flex-1 mr-1 min-w-0">
                        {c.pinned ? (
                          <Pin className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        )}

                        {isEditing ? (
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation();
                                handleSaveRename(c.conversationId);
                              } else if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingId(null);
                              }
                            }}
                            onBlur={() => handleSaveRename(c.conversationId)}
                            onClick={(e) => e.stopPropagation()}
                            maxLength={60}
                            className="flex-1 bg-slate-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                          />
                        ) : (
                          <span
                            className="truncate flex-1 transition-opacity duration-300"
                            title={displayTitle}
                          >
                            {displayTitle}
                          </span>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="relative flex items-center flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : c.conversationId);
                            }}
                            className={`p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-opacity ${
                              isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                            }`}
                            aria-label="Conversation options"
                            title="More options"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>

                          {/* Action Dropdown Menu */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-7 w-36 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 z-30 text-xs"
                            >
                              <button
                                type="button"
                                onClick={(e) => handleTogglePin(e, c)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                              >
                                {c.pinned ? (
                                  <>
                                    <PinOff className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Unpin</span>
                                  </>
                                ) : (
                                  <>
                                    <Pin className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Pin</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleStartRename(e, c)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                                <span>Rename</span>
                              </button>
                              <div className="h-px bg-slate-800 my-1" />
                              <button
                                type="button"
                                onClick={(e) => handleDeleteConversation(e, c.conversationId)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {conversations.length > 0 && (
          <div className="p-3 border-t border-slate-800 flex-shrink-0">
            <button
              onClick={handleClearAll}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All History
            </button>
          </div>
        )}
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-h-0 h-full bg-slate-950 overflow-hidden relative">
        {/* Header Bar */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="md:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              aria-label="Toggle conversation history"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">AI Placement Assistant</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${roleTheme.badge}`}>
                  {activeRole}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{roleTheme.label}</p>
            </div>
          </div>

          {/* Daily Quota Pill */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px]">
              {dailyUsage.remaining ?? (dailyUsage.cap - dailyUsage.used)} / {dailyUsage.cap || 30} chats left today
            </span>
          </div>
        </div>

        {/* Floating Scroll to Latest Button */}
        {showScrollToLatest && (
          <button
            type="button"
            onClick={() => {
              isUserScrolledUpRef.current = false;
              setShowScrollToLatest(false);
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="absolute bottom-24 right-6 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xl border border-indigo-400/30 active:scale-95 transition-all"
            aria-label="Scroll to latest message"
          >
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            <span>Scroll to latest</span>
          </button>
        )}

        {/* Messages Scroll Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center py-10">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
                <Sparkles className="w-8 h-8" />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-100 mb-2">
                Ask me anything about placements, interview prep, coding, or data
              </h1>
              <p className="text-sm text-slate-400 mb-8 max-w-lg">
                I can assist you with campus recruitment policies, technical algorithms, personal applications, and real-time institutional statistics.
              </p>

              {/* Suggested Questions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {suggestions.slice(0, 4).map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSubmit(sug.question)}
                    className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 text-slate-300 text-xs transition-all hover:border-indigo-500/50 group flex items-start gap-2.5 shadow-sm"
                  >
                    <span className="text-indigo-400 mt-0.5 group-hover:translate-x-0.5 transition-transform">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-200">{sug.label}</div>
                      <div className="text-slate-400 text-[11px] line-clamp-1">{sug.question}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isCurrentStreaming = isStreaming && index === messages.length - 1;

              return (
                <div
                  key={msg.messageId || index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-start gap-2.5 max-w-[95%] md:max-w-[85%]">
                    {!isUser && (
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 flex-shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3.5 shadow-md max-w-full break-words ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-tr-none text-sm leading-relaxed'
                          : 'bg-slate-800/80 border border-slate-700 text-slate-100 text-[15px] leading-7 rounded-tl-none'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div>
                          {msg.tool && msg.tool !== 'none' && msg.tool !== 'general' && (
                            <div className="mb-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 text-[11px] font-mono">
                              <Shield className="w-3 h-3 text-indigo-400" /> Tool: {msg.tool}
                            </div>
                          )}

                          {msg.content ? (
                            <>
                              <SafeMarkdown content={msg.content} variant="dark" />
                              {isCurrentStreaming && (
                                <div className="mt-2.5 flex items-center gap-2 text-indigo-300 text-xs">
                                  <span className="w-1.5 h-3.5 bg-indigo-400 animate-pulse inline-block rounded-xs" />
                                  <span className="text-[11px] text-slate-400 italic">
                                    {streamStatus || 'Streaming...'}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            /* Typing indicator with three animated bouncing dots */
                            <div className="flex items-center gap-2.5 py-1 text-slate-300">
                              <span className="text-xs font-medium text-indigo-300">
                                {streamStatus || 'Thinking...'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                              </div>
                            </div>
                          )}

                          {/* Render Tool Data Visualizations */}
                          {renderToolData(msg.tool, msg.data)}

                          {/* Source Citations */}
                          {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                            <div className="mt-3.5 pt-2.5 border-t border-slate-700/60 flex flex-wrap gap-1.5">
                              {msg.sources.map((src, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-2.5 py-1 rounded-md bg-slate-900/90 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center gap-1.5 shadow-sm hover:border-slate-600 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3 text-indigo-300 flex-shrink-0" />
                                  <span className="text-slate-200 font-medium">{src.title || src}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Message Actions */}
                          <div className="mt-3.5 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
                            <div className="flex items-center gap-2">
                              {/* Copy Button */}
                              <button
                                onClick={() => handleCopy(msg.messageId, msg.content)}
                                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-700/60 transition-colors"
                                title="Copy answer"
                              >
                                {copiedId === msg.messageId ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* Feedback Thumbs */}
                              <button
                                onClick={() => handleFeedback(msg.messageId, 1)}
                                className={`p-1.5 rounded-lg hover:bg-slate-700/60 transition-colors ${
                                  ratedMap[msg.messageId] === 1
                                    ? 'text-indigo-400 font-bold bg-indigo-950/60'
                                    : 'text-slate-300 hover:text-white'
                                }`}
                                title="Helpful"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleFeedback(msg.messageId, -1)}
                                className={`p-1.5 rounded-lg hover:bg-slate-700/60 transition-colors ${
                                  ratedMap[msg.messageId] === -1
                                    ? 'text-rose-400 font-bold bg-rose-950/60'
                                    : 'text-slate-300 hover:text-white'
                                }`}
                                title="Not helpful"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Escalate to TPO option for students */}
                            {activeRole === 'student' && (
                              <button
                                onClick={() => handleEscalateToTpo(messages[index - 1]?.content)}
                                disabled={escalating}
                                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline px-2.5 py-1 rounded-lg bg-indigo-950/40 border border-indigo-800/50 hover:bg-indigo-900/50 transition-colors"
                              >
                                <SendHorizontal className="w-3.5 h-3.5" /> Ask College TPO
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Area */}
        <div className="flex-shrink-0 p-3 sm:p-4 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur z-10">
          {/* Quick Suggestions Pills */}
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
              {suggestions.slice(0, 4).map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(sug.question)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] font-medium whitespace-nowrap border border-slate-700 transition-colors shadow-xs"
                >
                  {sug.label}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex flex-col gap-2 bg-slate-900/90 border border-slate-800 focus-within:border-indigo-500/70 rounded-2xl p-2.5 shadow-xl transition-colors"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`Ask a question (e.g. placement statistics, technical prep, platform workflows)...`}
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none outline-none px-2 py-1 max-h-32"
              maxLength={1500}
            />

            <div className="flex items-center justify-between px-2 pt-1 border-t border-slate-800/50">
              <span className="text-[10px] text-slate-500 font-mono">
                {inputQuestion.length} / 1500
              </span>

              <div className="flex items-center gap-2">
                {messages.length > 0 && !isStreaming && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Regenerate last response"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" /> Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputQuestion.trim()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" /> Send
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AssistantChat;
