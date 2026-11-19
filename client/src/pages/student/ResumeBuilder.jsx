import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import SafeMarkdown from '../../components/common/SafeMarkdown';
import {
  FileText,
  Sparkles,
  Download,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  Briefcase,
  Building2,
  Trash2,
  Copy,
  Clock,
  Eye,
  Edit3,
  HelpCircle,
  FileCheck2,
  Check,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';

const TEMPLATES = [
  {
    id: 'modern',
    name: 'Modern Technical',
    desc: 'Clean sans-serif with bold section divides. Default choice for software & cloud roles.',
    badge: 'Popular',
  },
  {
    id: 'classic',
    name: 'Classic Academic',
    desc: 'Traditional serif typography with centered header. Ideal for traditional core & consulting.',
  },
  {
    id: 'compact',
    name: 'Compact Minimalist',
    desc: 'High information density. Ideal for fitting extensive technical projects into 1 page.',
  },
];

const ResumeBuilder = () => {
  // Active state
  const [templateId, setTemplateId] = useState('modern');
  const [activeTab, setActiveTab] = useState('tailor'); // 'tailor' | 'cover_letter' | 'versions'
  const [loadingBase, setLoadingBase] = useState(true);

  // Resume Content
  const [resumeData, setResumeData] = useState(null);
  const [baselineAtsScore, setBaselineAtsScore] = useState(null);
  const [tailoredAtsScore, setTailoredAtsScore] = useState(null);

  // Tailoring Target Configuration
  const [targetType, setTargetType] = useState('drive'); // 'drive' | 'jd'
  const [drives, setDrives] = useState([]);
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [customJdText, setCustomJdText] = useState('');
  const [isTailoring, setIsTailoring] = useState(false);

  // Bullet Rewrites Review State
  const [bulletRewrites, setBulletRewrites] = useState([]);
  const [metricInputs, setMetricInputs] = useState({});

  // Cover Letter State
  const [coverLetter, setCoverLetter] = useState('');
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);

  // Versions State
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [quota, setQuota] = useState({ used: 0, cap: 10, remaining: 10 });

  // ---------------------------------------------------------------------------
  // INITIAL DATA FETCHING
  // ---------------------------------------------------------------------------

  const fetchBaseResume = async () => {
    try {
      setLoadingBase(true);
      const res = await api.get('/students/me/resume-builder/base');
      if (res.data?.success && res.data.resumeData) {
        setResumeData(res.data.resumeData);
      }
    } catch (err) {
      toast.error('Failed to compile base resume profile');
    } finally {
      setLoadingBase(false);
    }
  };

  const fetchEligibleDrives = async () => {
    try {
      const res = await api.get('/drives?limit=50');
      if (res.data?.success && Array.isArray(res.data.drives)) {
        setDrives(res.data.drives);
        if (res.data.drives.length > 0) {
          setSelectedDriveId(res.data.drives[0]._id);
        }
      }
    } catch (_) {}
  };

  const fetchVersions = async () => {
    try {
      setLoadingVersions(true);
      const res = await api.get('/students/me/resume-builder/versions');
      if (res.data?.success && Array.isArray(res.data.versions)) {
        setVersions(res.data.versions);
      }
    } catch (_) {
    } finally {
      setLoadingVersions(false);
    }
  };

  const fetchQuota = async () => {
    try {
      const res = await api.get('/students/me/resume-builder/quota');
      if (res.data?.success && res.data.quota) {
        setQuota(res.data.quota);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchBaseResume();
    fetchEligibleDrives();
    fetchVersions();
    fetchQuota();
  }, []);

  // ---------------------------------------------------------------------------
  // PLACEHOLDER DETECTION
  // ---------------------------------------------------------------------------

  const placeholderRegex = /\[(?:add\s+your\s+real\s+number|add\s+real\s+number|add\s+number|your\s+number|metric|X%|X)\]/i;

  const countPlaceholders = () => {
    if (!resumeData) return 0;
    let count = 0;
    if (resumeData.summary && placeholderRegex.test(resumeData.summary)) count++;

    (resumeData.experience || []).forEach((e) => {
      (e.bullets || []).forEach((b) => {
        if (b && placeholderRegex.test(b)) count++;
      });
    });

    (resumeData.projects || []).forEach((p) => {
      (p.bullets || []).forEach((b) => {
        if (b && placeholderRegex.test(b)) count++;
      });
    });

    return count;
  };

  const unresolvedPlaceholderCount = countPlaceholders();

  // ---------------------------------------------------------------------------
  // TAILORING WORKFLOW
  // ---------------------------------------------------------------------------

  const handleTailorResume = async () => {
    if (targetType === 'drive' && !selectedDriveId) {
      toast.error('Please select an eligible campus drive.');
      return;
    }
    if (targetType === 'jd' && !customJdText.trim()) {
      toast.error('Please paste the target Job Description.');
      return;
    }

    try {
      setIsTailoring(true);
      const payload = {
        resumeData,
        driveId: targetType === 'drive' ? selectedDriveId : null,
        jobDescription: targetType === 'jd' ? customJdText.trim() : '',
      };

      const res = await api.post('/students/me/resume-builder/tailor', payload);
      if (res.data?.success) {
        setResumeData(res.data.tailoredResume);
        setBaselineAtsScore(res.data.baselineAtsScore);
        setTailoredAtsScore(res.data.tailoredAtsScore);
        setBulletRewrites(res.data.bulletRewrites || []);
        toast.success(
          `Resume tailored! ATS score increased by +${res.data.scoreDelta} points (${res.data.baselineAtsScore}% ➔ ${res.data.tailoredAtsScore}%).`
        );
        fetchQuota();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to tailor resume';
      toast.error(msg);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleApplyMetricToBullet = (index, originalBullet, suggestedTemplate) => {
    const userMetric = metricInputs[index];
    if (!userMetric || !userMetric.trim()) {
      toast.error('Please enter your actual metric number (e.g. 40%, 1500 users).');
      return;
    }

    const resolved = suggestedTemplate.replace(placeholderRegex, userMetric.trim());

    // Update in resumeData projects or experience
    const updated = { ...resumeData };

    let replaced = false;
    (updated.experience || []).forEach((exp) => {
      exp.bullets = (exp.bullets || []).map((b) => {
        if (b.trim().toLowerCase() === originalBullet.trim().toLowerCase() || b.trim().toLowerCase() === suggestedTemplate.trim().toLowerCase()) {
          replaced = true;
          return resolved;
        }
        return b;
      });
    });

    (updated.projects || []).forEach((proj) => {
      proj.bullets = (proj.bullets || []).map((b) => {
        if (b.trim().toLowerCase() === originalBullet.trim().toLowerCase() || b.trim().toLowerCase() === suggestedTemplate.trim().toLowerCase()) {
          replaced = true;
          return resolved;
        }
        return b;
      });
    });

    if (replaced) {
      setResumeData(updated);
      toast.success('Real metric applied to resume!');
    } else {
      toast.success('Metric recorded.');
    }
  };

  // ---------------------------------------------------------------------------
  // COVER LETTER GENERATOR
  // ---------------------------------------------------------------------------

  const handleGenerateCoverLetter = async () => {
    try {
      setIsGeneratingCoverLetter(true);
      const payload = {
        driveId: targetType === 'drive' ? selectedDriveId : null,
        jobDescription: targetType === 'jd' ? customJdText.trim() : '',
        role: targetType === 'drive' ? drives.find((d) => d._id === selectedDriveId)?.role : 'Software Engineer',
        company: targetType === 'drive' ? drives.find((d) => d._id === selectedDriveId)?.company?.name : '',
      };

      const res = await api.post('/students/me/resume-builder/cover-letter', payload);
      if (res.data?.success && res.data.coverLetter) {
        setCoverLetter(res.data.coverLetter);
        toast.success('Truthful cover letter synthesized based on your verified projects!');
        fetchQuota();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate cover letter');
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleCopyCoverLetter = () => {
    if (!coverLetter) return;
    navigator.clipboard.writeText(coverLetter);
    toast.success('Cover letter copied to clipboard!');
  };

  // ---------------------------------------------------------------------------
  // VERSION CONTROL WORKFLOW
  // ---------------------------------------------------------------------------

  const handleSaveVersion = async () => {
    if (!versionNameInput.trim()) {
      toast.error('Please enter a name for this resume version.');
      return;
    }

    try {
      setIsSavingVersion(true);
      const payload = {
        name: versionNameInput.trim(),
        templateId,
        resumeData,
        atsScore: tailoredAtsScore || 0,
        baselineScore: baselineAtsScore || 0,
        coverLetter,
        targetDrive: targetType === 'drive' ? selectedDriveId : null,
      };

      const res = await api.post('/students/me/resume-builder/versions', payload);
      if (res.data?.success) {
        toast.success(`Version "${versionNameInput.trim()}" saved (${res.data.totalVersions}/5)!`);
        setShowSaveModal(false);
        setVersionNameInput('');
        fetchVersions();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save version');
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleLoadVersion = async (versionId) => {
    try {
      const res = await api.get(`/students/me/resume-builder/versions/${versionId}`);
      if (res.data?.success && res.data.version) {
        const v = res.data.version;
        setResumeData(v.resumeData);
        setTemplateId(v.templateId || 'modern');
        setTailoredAtsScore(v.atsScore || null);
        setBaselineAtsScore(v.baselineScore || null);
        if (v.coverLetter) setCoverLetter(v.coverLetter);
        toast.success(`Loaded version "${v.name}"!`);
      }
    } catch (err) {
      toast.error('Failed to load version');
    }
  };

  const handleDeleteVersion = async (versionId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this resume version snapshot?')) return;

    try {
      await api.delete(`/students/me/resume-builder/versions/${versionId}`);
      toast.success('Version deleted');
      setVersions((prev) => prev.filter((v) => v._id !== versionId));
    } catch (err) {
      toast.error('Failed to delete version');
    }
  };

  // ---------------------------------------------------------------------------
  // PDF EXPORT WORKFLOW
  // ---------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (unresolvedPlaceholderCount > 0) {
      toast.error(
        `Cannot export PDF: ${unresolvedPlaceholderCount} unresolved '[add your real number]' placeholder(s) remaining. Replace them with your real metrics or remove them first.`
      );
      return;
    }

    try {
      setIsExporting(true);
      const response = await api.post(
        '/students/me/resume-builder/export-pdf',
        {
          resumeData,
          templateId,
        },
        {
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const candidateName = (resumeData.contact?.fullName || 'Candidate').replace(/\s+/g, '_');
      a.href = url;
      a.download = `Resume_${candidateName}_${templateId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('ATS Single-Column PDF exported successfully!');
    } catch (err) {
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingBase) {
    return (
      <div className="py-24 text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
        <div className="text-sm font-semibold text-slate-700">Compiling ATS resume profile from student records...</div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ===================================================================== */}
      {/* TOP CONTROLS & HEADER                                                 */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 md:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>100% ATS Single-Column Builder & Tailoring Engine</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Resume Builder & Tailoring</h1>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Version Save Button */}
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Version ({versions.length}/5)</span>
            </button>

            {/* Export PDF Button (with blocker indicator) */}
            <button
              onClick={handleExportPdf}
              disabled={isExporting || unresolvedPlaceholderCount > 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-sm ${
                unresolvedPlaceholderCount > 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
              }`}
              title={
                unresolvedPlaceholderCount > 0
                  ? `Blocked: ${unresolvedPlaceholderCount} unresolved placeholder(s)`
                  : 'Download ATS-friendly PDF'
              }
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export ATS PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Template Selector & ATS Score Gauge Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          {/* Template Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Template:</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  templateId === t.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{t.name}</span>
                {t.badge && (
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-bold">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ATS Score Progress */}
          {tailoredAtsScore !== null && (
            <div className="inline-flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-xs">
              <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex items-center gap-2 font-medium text-emerald-900">
                <span>Baseline: <strong className="font-bold">{baselineAtsScore}%</strong></span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-500" />
                <span>Tailored: <strong className="font-bold text-emerald-700 text-sm">{tailoredAtsScore}%</strong></span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                  +{Math.max(0, tailoredAtsScore - (baselineAtsScore || 0))} pts
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unresolved Placeholder Warning Banner */}
      {unresolvedPlaceholderCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-900">
            <div className="font-bold">
              Action Required: {unresolvedPlaceholderCount} Metric Placeholder(s) Detected
            </div>
            <p className="text-amber-800 leading-relaxed">
              To strictly prevent automated AI hallucinations, unverified metrics are held in{' '}
              <code className="bg-amber-100/90 px-1 py-0.5 rounded text-amber-950 font-mono font-bold">
                [add your real number]
              </code>{' '}
              placeholders. <strong>PDF export is locked</strong> until you enter your authentic numbers in the left review panel or remove them.
            </p>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2-COLUMN WORKSPACE: LEFT (TAILORING CONTROLS) | RIGHT (LIVE PREVIEW)  */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ------------------------------------------------------------------- */}
        {/* LEFT PANEL: 5 COLS                                                  */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-6">
          {/* Sub-tabs */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-sm flex items-center justify-between gap-1">
            <button
              onClick={() => setActiveTab('tailor')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'tailor'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tailor to Job</span>
            </button>
            <button
              onClick={() => setActiveTab('cover_letter')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'cover_letter'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Cover Letter</span>
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'versions'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Versions ({versions.length}/5)</span>
            </button>
          </div>

          {/* TAB 1: TAILOR RESUME */}
          {activeTab === 'tailor' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Target Role & Requirements</h3>
                <p className="text-xs text-slate-500">
                  Select an eligible campus placement drive or paste a full Job Description.
                </p>
              </div>

              {/* Target Type Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTargetType('drive')}
                  className={`py-1.5 rounded-lg transition-all ${
                    targetType === 'drive' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Campus Drive
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('jd')}
                  className={`py-1.5 rounded-lg transition-all ${
                    targetType === 'jd' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Custom Job Description
                </button>
              </div>

              {targetType === 'drive' ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Select Eligible Campus Drive
                  </label>
                  <select
                    value={selectedDriveId}
                    onChange={(e) => setSelectedDriveId(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-slate-800"
                  >
                    {drives.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.company?.name || 'Company'} — {d.role} ({d.packageLpa ? `${d.packageLpa} LPA` : 'Drive'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Paste Job Description
                  </label>
                  <textarea
                    rows={6}
                    value={customJdText}
                    onChange={(e) => setCustomJdText(e.target.value)}
                    placeholder="Paste job description, required technical stack, and responsibilities here..."
                    className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed text-slate-800 resize-y"
                  />
                </div>
              )}

              {/* Tailor Action Button */}
              <button
                onClick={handleTailorResume}
                disabled={isTailoring}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {isTailoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Keywords & Rewriting Bullets...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tailor Resume to Target</span>
                  </>
                )}
              </button>

              {/* Bullet Rewrites Review Panel */}
              {bulletRewrites.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                      Optimized Bullet Points
                    </span>
                    <p className="text-xs text-slate-500">
                      Fill in your authentic metric to resolve placeholders and unlock PDF download.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {bulletRewrites.map((rw, idx) => {
                      const hasPlaceholder = placeholderRegex.test(rw.suggested);
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 space-y-2 text-xs"
                        >
                          <div className="text-slate-500 line-through italic text-[11px]">
                            {rw.original}
                          </div>
                          <div className="font-medium text-slate-900 leading-relaxed">
                            {rw.suggested}
                          </div>
                          {rw.why && (
                            <div className="text-[11px] text-indigo-700 bg-indigo-50/70 p-2 rounded-lg">
                              💡 {rw.why}
                            </div>
                          )}

                          {hasPlaceholder && (
                            <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Your real number (e.g. 35%, 1500, 2x)"
                                value={metricInputs[idx] || ''}
                                onChange={(e) =>
                                  setMetricInputs({ ...metricInputs, [idx]: e.target.value })
                                }
                                className="flex-1 text-xs border border-amber-300 bg-amber-50/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyMetricToBullet(idx, rw.original, rw.suggested)}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-[11px] transition-colors"
                              >
                                Insert
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COVER LETTER */}
          {activeTab === 'cover_letter' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-slate-900">Truthful Cover Letter</h3>
                  <p className="text-xs text-slate-500">
                    Grounded strictly in your verified coursework, branch, and projects.
                  </p>
                </div>
                {coverLetter && (
                  <button
                    onClick={handleCopyCoverLetter}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Copy to Clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>

              {!coverLetter ? (
                <div className="py-10 text-center space-y-3 border-2 border-dashed border-slate-200 rounded-xl">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Synthesize a concise, truthful 3-paragraph cover letter tailored to your target company.
                  </p>
                  <button
                    onClick={handleGenerateCoverLetter}
                    disabled={isGeneratingCoverLetter}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold"
                  >
                    {isGeneratingCoverLetter ? 'Synthesizing...' : 'Generate Truthful Cover Letter'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={12}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    className="w-full text-xs font-serif leading-relaxed border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleGenerateCoverLetter}
                      disabled={isGeneratingCoverLetter}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={handleCopyCoverLetter}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Cover Letter</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VERSIONS */}
          {activeTab === 'versions' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Saved Resume Versions</h3>
                  <p className="text-xs text-slate-500">Maximum 5 snapshots per student.</p>
                </div>
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                >
                  + Save Current
                </button>
              </div>

              {versions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  No saved versions yet. Click "Save Current" to preserve snapshots for specific roles.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <div
                      key={v._id}
                      onClick={() => handleLoadVersion(v._id)}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 p-2 rounded-xl transition-colors cursor-pointer"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>{v.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full uppercase font-medium bg-slate-100 text-slate-600">
                            {v.templateId}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(v.createdAt).toLocaleDateString()} • ATS: {v.atsScore || 0}%
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteVersion(v._id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* RIGHT PANEL: 7 COLS (LIVE ATS-FRIENDLY RESUME PREVIEW)             */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-7">
          <div
            className={`bg-white rounded-2xl border shadow-sm p-8 transition-all min-h-[750px] space-y-6 ${
              templateId === 'classic'
                ? 'font-serif border-slate-300'
                : templateId === 'compact'
                ? 'font-sans text-xs border-slate-200'
                : 'font-sans border-slate-200'
            }`}
          >
            {/* Template Header */}
            <div className={`space-y-1.5 ${templateId === 'classic' ? 'text-center' : 'text-left'}`}>
              <h2
                className={`font-bold tracking-tight text-slate-900 ${
                  templateId === 'compact' ? 'text-xl' : 'text-2xl'
                }`}
              >
                {resumeData.contact?.fullName || 'Candidate Name'}
              </h2>
              <div
                className={`text-slate-600 leading-normal ${
                  templateId === 'compact' ? 'text-[11px]' : 'text-xs'
                }`}
              >
                {[
                  resumeData.contact?.email,
                  resumeData.contact?.phone,
                  resumeData.contact?.location,
                  resumeData.contact?.linkedin,
                  resumeData.contact?.github,
                ]
                  .filter(Boolean)
                  .join(templateId === 'classic' ? '  |  ' : '  •  ')}
              </div>
            </div>

            {/* Summary */}
            {resumeData.summary && (
              <div className="space-y-1.5">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Professional Summary
                </div>
                <p className="text-xs text-slate-700 leading-relaxed text-justify">
                  {resumeData.summary}
                </p>
              </div>
            )}

            {/* Technical Skills */}
            {Array.isArray(resumeData.skills) && resumeData.skills.length > 0 && (
              <div className="space-y-1.5">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Technical Skills
                </div>
                <div className="space-y-1 text-xs text-slate-800">
                  {resumeData.skills.map((cat, i) => (
                    <div key={i}>
                      <strong className="font-semibold text-slate-900">{cat.category}: </strong>
                      <span>{cat.items?.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Professional Experience */}
            {Array.isArray(resumeData.experience) && resumeData.experience.length > 0 && (
              <div className="space-y-3">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Professional Experience
                </div>
                <div className="space-y-3">
                  {resumeData.experience.map((exp, idx) => (
                    <div key={idx} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>{exp.title}</span>
                        <span className="font-normal italic text-slate-500">{exp.duration}</span>
                      </div>
                      <div className="text-slate-600 font-medium">
                        {[exp.company, exp.location].filter(Boolean).join(' — ')}
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                        {(exp.bullets || []).map((b, bIdx) => {
                          const isPlaceholder = placeholderRegex.test(b);
                          return (
                            <li key={bIdx} className={isPlaceholder ? 'bg-amber-100/70 p-1 rounded font-medium text-amber-900' : ''}>
                              {b}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Technical Projects */}
            {Array.isArray(resumeData.projects) && resumeData.projects.length > 0 && (
              <div className="space-y-3">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Technical Projects
                </div>
                <div className="space-y-3">
                  {resumeData.projects.map((proj, idx) => (
                    <div key={idx} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>
                          {proj.title}
                          {proj.technologies?.length > 0 && (
                            <span className="font-normal italic text-slate-500 ml-1">
                              ({proj.technologies.join(', ')})
                            </span>
                          )}
                        </span>
                        <span className="font-normal italic text-slate-500">{proj.duration}</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                        {(proj.bullets || []).map((b, bIdx) => {
                          const isPlaceholder = placeholderRegex.test(b);
                          return (
                            <li key={bIdx} className={isPlaceholder ? 'bg-amber-100/70 p-1 rounded font-medium text-amber-900' : ''}>
                              {b}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {Array.isArray(resumeData.education) && resumeData.education.length > 0 && (
              <div className="space-y-2">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Education
                </div>
                <div className="space-y-2">
                  {resumeData.education.map((edu, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{edu.degree}</div>
                        <div className="text-slate-600">
                          {[edu.institution, edu.field ? `in ${edu.field}` : '', edu.score ? `(CGPA: ${edu.score})` : '']
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      </div>
                      <div className="font-normal italic text-slate-500">{edu.year}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0 && (
              <div className="space-y-1.5">
                <div
                  className={`font-bold text-slate-900 uppercase tracking-wider text-xs border-b pb-1 ${
                    templateId === 'modern' ? 'border-indigo-600 text-indigo-700' : 'border-slate-300'
                  }`}
                >
                  Certifications
                </div>
                <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                  {resumeData.certifications.map((cert, idx) => (
                    <li key={idx}>{cert}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SAVE VERSION MODAL                                                    */}
      {/* ===================================================================== */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Save Resume Version</h3>
              <p className="text-xs text-slate-500">
                Give this version a memorable label (e.g., "Google SWE Tailored", "Fintech Analyst v2").
              </p>
            </div>

            <div>
              <input
                type="text"
                value={versionNameInput}
                onChange={(e) => setVersionNameInput(e.target.value)}
                placeholder="e.g. Google - Full Stack Tailored"
                className="w-full text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVersion}
                disabled={isSavingVersion || !versionNameInput.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl"
              >
                {isSavingVersion ? 'Saving...' : 'Save Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeBuilder;
