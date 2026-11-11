import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { openResumeInNewTab, downloadResumePdf } from '../../utils/resumeViewer';
import { groupSkillsByCategory, SKILL_CATEGORIES } from '../../utils/skillCategorizer';
import { formatISTDate, formatISTDateTime } from '../../utils/dateTime';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  FileText,
  Save,
  Check,
  Building2,
  Briefcase,
  ExternalLink,
  GraduationCap,
  Award,
  Layers,
  ShieldCheck,
  Trash2,
  ArrowRight,
  TrendingUp,
  Info,
  Calendar,
  Clock,
  Download,
  Copy,
  Target,
  BookOpen,
  RefreshCw,
  ListOrdered,
  Lightbulb,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SKILL_REGEX = /^[a-z0-9+#.\-/ ]{1,40}$/i;

const ResumeAi = () => {
  const { user, student, updateStudent } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Data
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState([]);
  const [hasResume, setHasResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState(null);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, cap: 5, remaining: 5 });
  const [rateLimited, setRateLimited] = useState(false);
  const [newSkillInput, setNewSkillInput] = useState('');

  // Eligible Drives & Applications
  const [drives, setDrives] = useState([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [appliedDriveIds, setAppliedDriveIds] = useState(new Set());
  const [applyingId, setApplyingId] = useState(null);

  // Target Job Analyzer State
  const [activeTargetTab, setActiveTargetTab] = useState('jd'); // 'jd' | 'drive'
  const [jdInput, setJdInput] = useState('');
  const [selectedTargetDriveId, setSelectedTargetDriveId] = useState('');
  const [analyzingTarget, setAnalyzingTarget] = useState(false);
  const [targetAnalysis, setTargetAnalysis] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [targetError, setTargetError] = useState(null);

  // 1. Fetch Resume Profile & Usage
  const fetchResumeProfile = async () => {
    try {
      const res = await api.get('/students/me/resume-profile');
      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        setSkills(res.data.resumeProfile?.skills || []);
        setHasResume(Boolean(res.data.hasResume || student?.resumeUrl));
        setResumeFilename(res.data.resumeFilename);
        if (res.data.resumeAnalysis) {
          setTargetAnalysis(res.data.resumeAnalysis);
        }
        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
        if (res.data.resumeProfile?.status === 'rate_limited') {
          setRateLimited(true);
        }
      }
    } catch (err) {
      console.warn('Could not load resume profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Eligible Drives & Matching
  const fetchEligibleDrives = async () => {
    setLoadingDrives(true);
    try {
      const [drivesRes, appsRes] = await Promise.all([
        api.get('/drives/eligible'),
        api.get('/applications/my'),
      ]);

      if (drivesRes.data.success) {
        setDrives(drivesRes.data.drives || []);
      }
      if (appsRes.data.success) {
        const idSet = new Set(
          (appsRes.data.applications || []).map((app) =>
            typeof app.drive === 'object' ? app.drive?._id : app.drive
          )
        );
        setAppliedDriveIds(idSet);
      }
    } catch (err) {
      console.warn('Could not load drives for matching:', err);
    } finally {
      setLoadingDrives(false);
    }
  };

  useEffect(() => {
    fetchResumeProfile();
    fetchEligibleDrives();
  }, []);

  // Compute "Skills to Learn Next" from open drives (ignoring drives without skill requirements)
  const skillsToLearnNext = useMemo(() => {
    const missingCounts = {};
    drives.forEach((d) => {
      if (d.match?.score !== null && d.match?.score !== undefined) {
        const missing = d.match?.missingSkills || [];
        missing.forEach((sk) => {
          const norm = sk.toLowerCase().trim();
          missingCounts[norm] = (missingCounts[norm] || 0) + 1;
        });
      }
    });

    return Object.entries(missingCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [drives]);

  // Evidence-based project counts for skills
  const projectCountMap = useMemo(() => {
    const counts = {};
    const projects = profile?.projects || [];
    skills.forEach((sk) => {
      const name = (sk?.name || '').toLowerCase().trim();
      if (!name) return;
      let count = 0;
      for (const p of projects) {
        const pTechs = (p.technologies || []).map((t) =>
          typeof t === 'string' ? t.toLowerCase().trim() : ''
        );
        if (pTechs.includes(name)) {
          count++;
          continue;
        }
        const pText = `${p.title || ''} ${p.description || ''} ${(p.bullets || []).join(' ')}`.toLowerCase();
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?:^|[^a-z0-9+#.-])${escaped}(?:$|[^a-z0-9+#.-])`, 'i').test(pText)) {
          count++;
        }
      }
      counts[name] = count;
    });
    return counts;
  }, [skills, profile?.projects]);

  // Handle Resume Analysis
  const handleParseResume = async () => {
    if (!hasResume && !student?.resumeUrl) {
      toast.error('Please upload your resume under Profile before analyzing it.');
      return;
    }

    setParsing(true);
    setRateLimited(false);
    try {
      const isReanalyze = profile?.status === 'parsed';
      const res = await api.post('/students/me/resume/parse', { force: isReanalyze });
      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        setSkills(res.data.resumeProfile?.skills || []);
        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
        if (res.data.resumeFilename) {
          setResumeFilename(res.data.resumeFilename);
        }
        toast.success(
          res.data.cached
            ? 'Resume profile retrieved from instant cache.'
            : 'Resume parsed and skills extracted successfully!'
        );
        // Refresh drives to update match scores with freshly extracted skills
        fetchEligibleDrives();
      }
    } catch (err) {
      console.error('Failed to parse resume:', err);
      if (err.response?.status === 429) {
        setRateLimited(true);
        if (err.response.data?.dailyUsage) {
          setDailyUsage(err.response.data.dailyUsage);
        }
        toast.error('Daily AI parsing cap reached. Please try again tomorrow.');
      } else {
        toast.error(err.response?.data?.message || 'Resume parsing failed.');
      }
    } finally {
      setParsing(false);
    }
  };

  // Skill Management
  const handleToggleConfirmSkill = (index) => {
    setSkills((prev) =>
      prev.map((s, i) => (i === index ? { ...s, confirmedByStudent: !s.confirmedByStudent } : s))
    );
  };

  const handleRemoveSkill = (index) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (!trimmed) return;

    if (!SKILL_REGEX.test(trimmed)) {
      toast.error('Skill name can only contain letters, numbers, spaces, and + # . - / (max 40 chars).');
      return;
    }

    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Skill already exists in your list.');
      return;
    }

    if (skills.length >= 50) {
      toast.error('Maximum limit of 50 skills reached.');
      return;
    }

    setSkills((prev) => [
      ...prev,
      { name: trimmed.toLowerCase(), confirmedByStudent: true, foundInResume: false },
    ]);
    setNewSkillInput('');
  };

  const handleSaveConfirmedSkills = async () => {
    setSavingSkills(true);
    try {
      const res = await api.put('/students/me/resume-profile', {
        skills,
      });

      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        toast.success('Confirmed skills saved for AI matching!');
        fetchEligibleDrives();
      }
    } catch (err) {
      console.error('Failed to save skills:', err);
      toast.error(err.response?.data?.message || 'Failed to save skills');
    } finally {
      setSavingSkills(false);
    }
  };

  // Delete Parsed Data
  const handleDeleteParsedData = async () => {
    setDeleting(true);
    try {
      const res = await api.delete('/students/me/resume-profile');
      if (res.data.success) {
        setProfile(null);
        setSkills([]);
        setTargetAnalysis(null);
        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
        setShowDeleteModal(false);
        toast.success('Parsed resume data deleted successfully.');
        fetchEligibleDrives();
      }
    } catch (err) {
      console.error('Failed to delete parsed data:', err);
      toast.error(err.response?.data?.message || 'Failed to delete parsed data');
    } finally {
      setDeleting(false);
    }
  };

  // Apply to Drive
  const handleApplyToDrive = async (driveId) => {
    setApplyingId(driveId);
    try {
      const res = await api.post('/applications', { driveId });
      if (res.data.success) {
        toast.success('Application submitted successfully!');
        setAppliedDriveIds((prev) => new Set([...prev, driveId]));
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit application';
      toast.error(msg);
    } finally {
      setApplyingId(null);
    }
  };

  // Sample JD helper
  const handleUseSampleJd = () => {
    const sample = `Role: Full Stack Software Engineer
Responsibilities:
- Build responsive frontend interfaces and reusable components
- Design and implement scalable RESTful APIs and backend services
- Integrate relational and NoSQL databases with query optimization
- Configure CI/CD pipelines, automated tests, and containerized deployments

Requirements:
- Strong hands-on experience with Python, JavaScript, React, and Node.js
- Proficiency with SQL, PostgreSQL, MongoDB, and Redis
- Familiarity with Docker, Git, REST APIs, and microservices architecture
- Preferred: Experience with AWS/Cloud, TypeScript, GraphQL, and Agile workflows`;
    setJdInput(sample);
    setActiveTargetTab('jd');
    toast.success('Sample job description loaded!');
  };

  // Analyze against Target (Job Description or Eligible Drive)
  const handleAnalyzeTarget = async ({ force = false } = {}) => {
    if (!profile || profile.status !== 'parsed') {
      toast.error('Please analyze your resume with AI first.');
      return;
    }

    if (activeTargetTab === 'jd') {
      if (!jdInput.trim()) {
        toast.error('Please paste a job description first.');
        return;
      }
      if (jdInput.length > 6000) {
        toast.error('Job description cannot exceed 6000 characters.');
        return;
      }
    } else {
      if (!selectedTargetDriveId) {
        toast.error('Please select an eligible placement drive.');
        return;
      }
    }

    setAnalyzingTarget(true);
    setTargetError(null);

    try {
      const payload = {
        force,
        ...(activeTargetTab === 'jd'
          ? { jdText: jdInput.trim() }
          : { driveId: selectedTargetDriveId }),
      };

      const res = await api.post('/students/me/resume/analyze', payload);
      if (res.data.success) {
        setTargetAnalysis(res.data);
        if (res.data.dailyUsage) {
          setDailyUsage(res.data.dailyUsage);
        }
        toast.success(
          res.data.cached
            ? 'Loaded cached ATS readiness estimate!'
            : 'ATS readiness estimate complete!'
        );
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Failed to analyze resume against target.';
      if (status === 429) {
        setRateLimited(true);
        toast.error('Daily AI analysis cap reached. Try again tomorrow.');
      } else {
        toast.error(msg);
      }
      setTargetError(msg);
    } finally {
      setAnalyzingTarget(false);
    }
  };

  const handleCopyRewrite = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    toast.success('Rewrite copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const renderHighlightedRewrite = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Match bracketed placeholders like [add your real number], [X%], [metric], [tool]
    const parts = text.split(/(\[[^\]]+\])/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return (
          <span
            key={i}
            className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-amber-200 text-amber-950 font-bold border border-amber-400 text-[11px] shadow-2xs"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Group skills by category
  const categorizedSkills = useMemo(() => {
    return groupSkillsByCategory(skills);
  }, [skills]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading Resume AI Insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Title & File details */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">
                  Resume AI Insights
                </h1>
                <p className="text-xs text-slate-500">
                  AI proficiency parsing, categorized skill alignment & real-time drive match
                </p>
              </div>
            </div>

            {/* Resume File details */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{resumeFilename || student?.resumeOriginalName || (hasResume ? 'Uploaded Resume.pdf' : 'No Resume Uploaded')}</span>
              </span>

              {hasResume && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openResumeInNewTab('me', 'My Resume')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    <span>View PDF</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => downloadResumePdf('me', resumeFilename || student?.resumeOriginalName || 'Resume.pdf')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    <span>Download</span>
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              )}

              {profile?.parsedAt && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Last analyzed: {formatISTDateTime(profile.parsedAt)}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: Badges, Quota & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Analysis Method Badge */}
            {profile?.status === 'parsed' ? (
              profile.source === 'rules' ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                  title="Analysed with the basic keyword reader. AI was unavailable or turned off"
                >
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  <span>Rule Extracted</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>AI Analyzed</span>
                </div>
              )
            ) : profile?.status === 'rate_limited' ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Rate Limited</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                <span>Not Analyzed Yet</span>
              </div>
            )}

            {/* Daily Quota Counter */}
            <div className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <strong className="text-indigo-600 font-bold">{dailyUsage.remaining}</strong> of{' '}
              {dailyUsage.cap} analyses left today
            </div>

            {/* Analyze / Re-Analyze Button */}
            <button
              type="button"
              onClick={handleParseResume}
              disabled={parsing || !hasResume}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {parsing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Analyzing Resume...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{profile?.status === 'parsed' ? 'Re-Analyze Resume' : 'Analyze Resume with AI'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Rule source clarification note */}
        {profile?.status === 'parsed' && profile.source === 'rules' && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center gap-2 text-xs text-amber-800">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Note:</strong> Analysed with the basic keyword reader. AI was unavailable or turned off. Extracted skills are matched deterministically.
            </span>
          </div>
        )}

        {/* Rate limited note */}
        {rateLimited && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center gap-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Daily parsing cap reached.</strong> Your confirmed skills remain active for drive matching, but new resume analyses are paused until tomorrow.
            </span>
          </div>
        )}

        {!hasResume && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200/80 rounded-xl flex items-center justify-between gap-2 text-xs text-blue-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>You have not uploaded a resume yet. Upload a PDF resume in your Profile to enable AI parsing.</span>
            </div>
            <Link
              to="/student/profile"
              className="font-bold underline hover:text-blue-950 shrink-0"
            >
              Go to Profile &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* 2. Full Resume Analyzer & ATS Readiness Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 lg:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Analyze Against a Job (ATS Readiness)
              </h2>
              <p className="text-xs text-slate-500">
                Deterministic 0-100 ATS-readiness estimate, keyword coverage, and bullet rewrites
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTargetTab('jd')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTargetTab === 'jd'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Paste Job Description</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTargetTab('drive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTargetTab === 'drive'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Pick a Drive</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Paste JD */}
        {activeTargetTab === 'jd' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Paste Job Description or Requirements</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseSampleJd}
                  className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                >
                  Try Sample JD
                </button>
                <span>•</span>
                <span className={jdInput.length > 5500 ? 'text-amber-600 font-bold' : ''}>
                  {jdInput.length} / 6000 chars
                </span>
              </div>
            </div>

            <textarea
              value={jdInput}
              onChange={(e) => setJdInput(e.target.value.slice(0, 6000))}
              placeholder="Paste the target job description here (e.g. required skills, responsibilities, role details)..."
              rows={4}
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
          </div>
        )}

        {/* Tab 2: Pick Drive */}
        {activeTargetTab === 'drive' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Select an Eligible Placement Drive</span>
              <span>{drives.length} available drives</span>
            </div>

            {drives.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 text-center italic">
                No eligible placement drives available at this time.
              </div>
            ) : (
              <select
                value={selectedTargetDriveId}
                onChange={(e) => setSelectedTargetDriveId(e.target.value)}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
              >
                <option value="">-- Choose an open placement drive --</option>
                {drives.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.company?.name || 'Company'} — {d.role} ({d.packageLpa} LPA)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Action Button & Quota Note */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Target analysis quota: <strong className="text-indigo-600 font-bold">{dailyUsage.analyze?.remaining ?? dailyUsage.analyzeRemaining ?? 10}</strong> of {dailyUsage.analyze?.cap ?? dailyUsage.analyzeCap ?? 10} remaining today.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {targetAnalysis && (
              <button
                type="button"
                onClick={() => handleAnalyzeTarget({ force: true })}
                disabled={analyzingTarget || profile?.status !== 'parsed'}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analyzingTarget ? 'animate-spin' : ''}`} />
                <span>Re-Analyze</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleAnalyzeTarget({ force: false })}
              disabled={analyzingTarget || profile?.status !== 'parsed'}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzingTarget ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Evaluating ATS Fit...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Analyze Target Job</span>
                </>
              )}
            </button>
          </div>
        </div>

        {targetError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{targetError}</span>
          </div>
        )}

        {/* ANALYSIS RESULTS VIEW */}
        {targetAnalysis && (
          <div className="pt-4 border-t border-slate-100 space-y-6">
            {/* Top Row: Score Ring + Breakdown Bars */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              {/* Score Ring (4 cols) */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-5 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-center">
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="transparent"
                      stroke="#e2e8f0"
                      strokeWidth="9"
                    />
                    {targetAnalysis.atsScore !== null && (
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="transparent"
                        stroke={
                          targetAnalysis.atsScore >= 75
                            ? '#10b981'
                            : targetAnalysis.atsScore >= 50
                            ? '#6366f1'
                            : '#f43f5e'
                        }
                        strokeWidth="9"
                        strokeDasharray="263.89"
                        strokeDashoffset={263.89 - (targetAnalysis.atsScore / 100) * 263.89}
                        strokeLinecap="round"
                        className="transition-all duration-700 ease-out"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {targetAnalysis.atsScore === null ? (
                      <span className="text-xl font-bold text-slate-400">N/A</span>
                    ) : (
                      <>
                        <span className="text-2xl font-black text-slate-900 leading-none">
                          {targetAnalysis.atsScore}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 mt-0.5">/ 100</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <span className="text-xs font-bold text-slate-900 block leading-tight">
                    ATS-Readiness Estimate
                  </span>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Target: {targetAnalysis.target?.title || 'Job Description'}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                      {targetAnalysis.source === 'ai' ? 'AI' : 'Rules'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 max-w-[200px] leading-tight mx-auto italic">
                    Note: Real ATS systems differ. This estimate is a deterministic guideline.
                  </p>
                </div>
              </div>

              {/* 5-Part Breakdown Bars (8 cols) */}
              <div className="md:col-span-8 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-1 border-b border-slate-100">
                  ATS Score Breakdown (Deterministic)
                </h3>

                <div className="space-y-3">
                  {/* Keywords Match (40 pts) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Keywords & Evidence Match</span>
                      <span className="text-slate-900 font-bold">
                        {targetAnalysis.breakdown?.keywordMatch !== null && targetAnalysis.breakdown?.keywordMatch !== undefined
                          ? `${targetAnalysis.breakdown.keywordMatch} / 40 pts`
                          : 'No Requirements'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((targetAnalysis.breakdown?.keywordMatch || 0) / 40) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Structure (20 pts) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Structure & Standard Sections</span>
                      <span className="text-slate-900 font-bold">
                        {targetAnalysis.breakdown?.structure || 0} / 20 pts
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((targetAnalysis.breakdown?.structure || 0) / 20) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Impact (15 pts) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Quantifiable Metrics & Scale</span>
                      <span className="text-slate-900 font-bold">
                        {targetAnalysis.breakdown?.impact || 0} / 15 pts
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((targetAnalysis.breakdown?.impact || 0) / 15) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Verbs (10 pts) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Action Verbs Usage</span>
                      <span className="text-slate-900 font-bold">
                        {targetAnalysis.breakdown?.actionVerbs || 0} / 10 pts
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((targetAnalysis.breakdown?.actionVerbs || 0) / 10) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Formatting (15 pts) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Formatting, Length & Density</span>
                      <span className="text-slate-900 font-bold">
                        {targetAnalysis.breakdown?.formatting || 0} / 15 pts
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, ((targetAnalysis.breakdown?.formatting || 0) / 15) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Matched vs Missing Skills */}
            <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Skills Alignment Overview</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {targetAnalysis.matchedSkills?.length || 0} matched proficiencies
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Matched Skills */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                    Matched Skills ({targetAnalysis.matchedSkills?.length || 0})
                  </span>
                  {(!targetAnalysis.matchedSkills || targetAnalysis.matchedSkills.length === 0) ? (
                    <span className="text-[11px] text-slate-400 italic">No matching skills found</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {targetAnalysis.matchedSkills.map((sk) => (
                        <span
                          key={sk}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>{sk}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing Required */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                    Missing Required ({targetAnalysis.missingRequired?.length || 0})
                  </span>
                  {(!targetAnalysis.missingRequired || targetAnalysis.missingRequired.length === 0) ? (
                    <span className="text-[11px] text-slate-400 italic">None — all required skills matched!</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {targetAnalysis.missingRequired.map((sk) => (
                        <span
                          key={sk}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          <span>{sk}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing Preferred */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                    Missing Preferred ({targetAnalysis.missingPreferred?.length || 0})
                  </span>
                  {(!targetAnalysis.missingPreferred || targetAnalysis.missingPreferred.length === 0) ? (
                    <span className="text-[11px] text-slate-400 italic">No missing preferred skills</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {targetAnalysis.missingPreferred.map((sk) => (
                        <span
                          key={sk}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                        >
                          <span>{sk}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Improvement Suggestions */}
            {targetAnalysis.suggestions && targetAnalysis.suggestions.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                      <span>Targeted Improvement Suggestions ({targetAnalysis.suggestions.length})</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Actionable recommendations to improve ATS compatibility and recruiter evaluation
                    </p>
                  </div>
                  <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold self-start sm:self-auto">
                    AI-generated • Verify accuracy
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {targetAnalysis.suggestions.map((sug, idx) => {
                    const priorityBadge =
                      sug.priority === 'high'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : sug.priority === 'medium'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200';

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {sug.category || 'General'}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${priorityBadge}`}>
                            {sug.priority} Priority
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-snug">
                          {sug.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bullet Rewrites */}
            {targetAnalysis.rewrites && targetAnalysis.rewrites.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Suggested Bullet Rewrites</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Rephrased to lead with technical action verbs and prompt for measurable scale
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 italic">
                    Nothing is auto-applied — review and copy.
                  </span>
                </div>

                {/* Warning Banner */}
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    <strong>Action Required:</strong> Replace <code>[add your real number]</code> with your real figure before using any text, and only keep claims that are true.
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {targetAnalysis.rewrites.map((rw, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-2.5"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Original */}
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            Original Bullet
                          </span>
                          <p className="text-slate-600 italic">&ldquo;{rw.original}&rdquo;</p>
                        </div>

                        {/* Suggested */}
                        <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-200/80 text-xs relative group">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                              Suggested Rewrite
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyRewrite(rw.suggested, idx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                              title="Copy to clipboard"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-indigo-600" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-slate-900 font-medium leading-relaxed">
                            {renderHighlightedRewrite(rw.suggested)}
                          </p>
                        </div>
                      </div>

                      {rw.why && (
                        <div className="text-[11px] text-indigo-800 bg-indigo-50/80 px-2.5 py-1 rounded-md border border-indigo-100/80 flex items-center gap-1.5">
                          <Info className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span><strong>Why this helps:</strong> {rw.why}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Learning Order */}
            {targetAnalysis.learningOrder && targetAnalysis.learningOrder.length > 0 && (
              <div className="space-y-3">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ListOrdered className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Recommended Skill Learning Order</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Prioritized sequence of missing proficiencies to bridge target job requirements
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {targetAnalysis.learningOrder.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full truncate">
                          {item.resourceType || 'Resource'}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-900 capitalize">
                        {item.skill}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Two columns on desktop, one on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ========================================================= */}
        {/* LEFT COLUMN (7 Cols): Skills & Parsed Details Cards       */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: Categorized Skills */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight">
                  Technical Proficiencies ({skills.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Categorized skills used for drive ranking. Click a chip to toggle confirmation.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">In Resume</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-slate-600">Added by You</span>
                </span>
              </div>
            </div>

            {/* Categorized Skills List */}
            {skills.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No skills extracted yet. Click &quot;Analyze Resume with AI&quot; above or add skills below.
              </div>
            ) : (
              <div className="space-y-3.5">
                {SKILL_CATEGORIES.map((category) => {
                  const catSkills = categorizedSkills[category] || [];
                  if (catSkills.length === 0) return null;

                  return (
                    <div key={category} className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        {category} ({catSkills.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {catSkills.map((sk) => {
                          const originalIndex = skills.findIndex((s) => s.name === sk.name);
                          const isConfirmed = Boolean(sk.confirmedByStudent);
                          const isInResume = sk.foundInResume !== false;

                          return (
                            <span
                              key={sk.name}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                isInResume
                                  ? isConfirmed
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                                    : 'bg-emerald-50/40 text-emerald-700/80 border-emerald-200 opacity-80'
                                  : isConfirmed
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                                  : 'bg-amber-50/40 text-amber-700/80 border-amber-200 opacity-80'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleConfirmSkill(originalIndex)}
                                title={
                                  isConfirmed
                                    ? `Confirmed skill (${isInResume ? 'Verified in resume' : 'Added by you'})`
                                    : 'Click to confirm for job matching'
                                }
                                className="inline-flex items-center gap-1 cursor-pointer"
                              >
                                {isConfirmed ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
                                )}
                                <span className="font-semibold">{sk.name}</span>
                              </button>

                              {/* Self-declared marker */}
                              {!isInResume && (
                                <span className="text-[9px] font-normal px-1 py-0.2 bg-amber-100 text-amber-900 rounded">
                                  added by you
                                </span>
                              )}

                              {/* Evidence: Used in N projects */}
                              {((sk.projectCount ?? projectCountMap[sk.name.toLowerCase().trim()]) > 0) && (
                                <span className="text-[9px] font-medium px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded">
                                  used in {sk.projectCount ?? projectCountMap[sk.name.toLowerCase().trim()]} project{(sk.projectCount ?? projectCountMap[sk.name.toLowerCase().trim()]) > 1 ? 's' : ''}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRemoveSkill(originalIndex)}
                                className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                                title="Remove skill"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Skill Input Form */}
            <form onSubmit={handleAddSkill} className="flex gap-2 pt-2 border-t border-slate-100">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                placeholder="Add skill (e.g. Docker, TypeScript, Microservices)..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Skill</span>
              </button>
            </form>

            {/* Save Button */}
            {skills.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfirmedSkills}
                  disabled={savingSkills}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-60 cursor-pointer"
                >
                  {savingSkills ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Confirmed Skills for Matching</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Parsed Details Cards */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              Parsed Resume Sections
            </h2>

            {/* Professional Summary */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" />
                <span>Professional Summary</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {profile?.summary || (
                  <span className="text-slate-400 italic">
                    No summary extracted yet. Analyze your resume to generate a professional overview.
                  </span>
                )}
              </p>
            </div>

            {/* Education */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <GraduationCap className="w-4 h-4" />
                <span>Education</span>
              </div>
              {!profile?.education || profile.education.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No education entries parsed.</p>
              ) : (
                <div className="divide-y divide-slate-100 space-y-2.5">
                  {profile.education.map((edu, i) => (
                    <div key={i} className="pt-2 first:pt-0">
                      <div className="font-bold text-xs text-slate-900">{edu.degree || 'Degree'}</div>
                      <div className="text-[11px] text-slate-500">
                        {edu.institution} {edu.year ? `• ${edu.year}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Work Experience */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <Briefcase className="w-3.5 h-3.5" />
                <span>Experience</span>
              </div>
              {!profile?.experience || profile.experience.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No experience records parsed.</p>
              ) : (
                <div className="divide-y divide-slate-100 space-y-3">
                  {profile.experience.map((exp, i) => (
                    <div key={i} className="pt-2 first:pt-0 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900">{exp.title}</span>
                        <span className="text-[10px] text-slate-400">{exp.duration}</span>
                      </div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {exp.company}
                        {exp.location ? ` • ${exp.location}` : ''}
                      </div>
                      {exp.bullets && exp.bullets.length > 0 ? (
                        <ul className="list-disc pl-4 text-xs text-slate-500 space-y-1 pt-1">
                          {exp.bullets.map((b, bIdx) => (
                            <li key={bIdx}>{b}</li>
                          ))}
                        </ul>
                      ) : exp.description ? (
                        <p className="text-xs text-slate-500 leading-relaxed">{exp.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5" />
                <span>Projects</span>
              </div>
              {!profile?.projects || profile.projects.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No key projects parsed.</p>
              ) : (
                <div className="divide-y divide-slate-100 space-y-3">
                  {profile.projects.map((proj, i) => (
                    <div key={i} className="pt-2 first:pt-0 space-y-1">
                      <div className="font-bold text-xs text-slate-900">{proj.title}</div>
                      {proj.bullets && proj.bullets.length > 0 ? (
                        <ul className="list-disc pl-4 text-xs text-slate-500 space-y-1 pt-1">
                          {proj.bullets.map((b, bIdx) => (
                            <li key={bIdx}>{b}</li>
                          ))}
                        </ul>
                      ) : proj.description ? (
                        <p className="text-xs text-slate-500 leading-relaxed">{proj.description}</p>
                      ) : null}
                      {proj.technologies && proj.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {proj.technologies.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Certifications */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <Award className="w-3.5 h-3.5" />
                <span>Certifications</span>
              </div>
              {!profile?.certifications || profile.certifications.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No certifications parsed.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {profile.certifications.map((cert, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                    >
                      <Award className="w-3 h-3 text-indigo-600" />
                      <span>{typeof cert === 'object' ? cert.title || cert.name : cert}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN (5 Cols): Drive Matches, Skills to Learn,    */}
        {/* Privacy Note & Actions                                    */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Your match with open drives */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight">
                  Your Match with Open Drives
                </h2>
                <p className="text-[11px] text-slate-500">
                  Computed live using your confirmed skills & academic fit
                </p>
              </div>
              <Link
                to="/student/drives"
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              >
                <span>All Drives</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loadingDrives ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Evaluating open drive alignment...</span>
              </div>
            ) : drives.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl">
                No active eligible placement drives at this time.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                {drives.slice(0, 6).map((drive) => {
                  const score = drive.match?.score || 0;
                  const hasApplied = appliedDriveIds.has(drive._id);
                  const isApplying = applyingId === drive._id;
                  const missing = drive.match?.missingSkills || [];

                  return (
                    <div key={drive._id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-slate-900">
                            {drive.company?.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <span>{drive.role}</span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-600">
                              {drive.packageLpa} LPA
                            </span>
                          </div>
                        </div>

                        {/* Match % Badge */}
                        {drive.match?.score === null || drive.match?.score === undefined ? (
                          <div className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 shrink-0">
                            No skill requirements listed
                          </div>
                        ) : (
                          <div
                            className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${
                              score >= 80
                                ? 'bg-emerald-100 text-emerald-800'
                                : score >= 60
                                ? 'bg-indigo-100 text-indigo-800'
                                : score >= 40
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {score}% Match
                          </div>
                        )}
                      </div>

                      {/* Missing skills tags */}
                      {drive.match?.score === null || drive.match?.score === undefined ? null : (
                        missing.length > 0 ? (
                          <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1">
                            <span className="font-semibold text-rose-600">Missing:</span>
                            {missing.slice(0, 3).map((sk) => (
                              <span
                                key={sk}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px]"
                              >
                                {sk}
                              </span>
                            ))}
                            {missing.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{missing.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            All required skills matched!
                          </div>
                        )
                      )}

                      {/* Action */}
                      <div className="pt-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          Apply by: {formatISTDate(drive.lastDateToApply)}
                        </span>
                        {hasApplied ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Applied</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApplyToDrive(drive._id)}
                            disabled={isApplying || drive.applicationsClosed}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {isApplying ? 'Applying...' : 'Apply Now'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card: Skills to Learn Next */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight">
                  Skills to Learn Next
                </h2>
                <p className="text-[11px] text-slate-500">
                  Most in-demand missing skills across active drives
                </p>
              </div>
            </div>

            {skillsToLearnNext.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                <p className="font-semibold text-emerald-900">You match all open drive skills!</p>
                <p className="text-[11px] text-emerald-700">
                  No missing proficiencies detected across current open opportunities. Keep building projects to stay sharp!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Adding these competencies will boost your match percentage across multiple campus openings:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {skillsToLearnNext.map(({ name, count }) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span>{name}</span>
                      <span className="text-[10px] text-indigo-500 font-normal">
                        ({count} {count === 1 ? 'drive' : 'drives'})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card: Privacy & Data Safeguards */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight">
                  Privacy & Data Safeguards
                </h2>
                <p className="text-[11px] text-slate-500">How your resume is handled by AI</p>
              </div>
            </div>

            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict PII Redaction:</strong> Personal identifiers (phone numbers, email addresses, national IDs, and home address) are automatically stripped before text is sent to the LLM.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Bias Immunity:</strong> Protected attributes (gender, caste, religion, college) are explicitly excluded from all scoring formulas.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Transparent Assistance:</strong> Match scores are deterministic. AI generates explainable summaries only; final shortlisting decisions always rest with recruiters.
                </span>
              </li>
            </ul>

            {/* Delete Parsed Data Action */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={!profile}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Parsed AI Profile Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Delete */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Delete Parsed AI Profile?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  This will remove all parsed summary, education, experience, and extracted skill data from the server. Your uploaded resume PDF file will remain safe in storage.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteParsedData}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeAi;
