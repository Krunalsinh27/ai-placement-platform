import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
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
  ArrowLeft,
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
  Upload,
  Plus,
  Info,
  BookOpen,
  AlertCircle,
  ShieldAlert,
  ListChecks,
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

const STEPS = [
  { id: 1, title: 'Source', desc: 'Select or import profile' },
  { id: 2, title: 'Target', desc: 'Drive, JD, or General' },
  { id: 3, title: 'Match Report', desc: 'ATS analysis & skills' },
  { id: 4, title: 'Build', desc: 'Tailor & export PDF' },
];

const PLACEHOLDER_REGEX = /\[(?:add\s+your\s+real\s+number|add\s+real\s+number|add\s+number|your\s+number|metric|X%|X)\]/i;

const ResumeBuilder = () => {
  // Wizard Stepper State
  const [currentStep, setCurrentStep] = useState(1);

  // ---------------------------------------------------------------------------
  // STEP 1: SOURCE STATE
  // ---------------------------------------------------------------------------
  const [sourceType, setSourceType] = useState('profile'); // 'profile' | 'upload' | 'text'
  const [pastedText, setPastedText] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [sourceWarnings, setSourceWarnings] = useState([]);
  const [parseConfidence, setParseConfidence] = useState(1.0);

  // Uploaded resume status from Student / Resume AI
  const [hasUploadedResume, setHasUploadedResume] = useState(false);
  const [uploadedResumeName, setUploadedResumeName] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Inline editor modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedResume, setEditedResume] = useState(null);

  // ---------------------------------------------------------------------------
  // STEP 2: TARGET STATE
  // ---------------------------------------------------------------------------
  const [targetType, setTargetType] = useState('drive'); // 'drive' | 'jd' | 'general'
  const [drives, setDrives] = useState([]);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [customJdText, setCustomJdText] = useState('');
  const [analyzingTarget, setAnalyzingTarget] = useState(false);
  const [targetData, setTargetData] = useState(null);
  const [keywordChips, setKeywordChips] = useState([]);
  const [newKeywordInput, setNewKeywordInput] = useState('');

  // ---------------------------------------------------------------------------
  // STEP 3: MATCH REPORT STATE
  // ---------------------------------------------------------------------------
  const [matchReport, setMatchReport] = useState(null);
  const [loadingMatchReport, setLoadingMatchReport] = useState(false);
  const [learningList, setLearningList] = useState([]);

  // Step 4 Build & Export State
  const [templateId, setTemplateId] = useState('modern');
  const [activeTab, setActiveTab] = useState('tailor'); // 'tailor' | 'cover_letter' | 'versions'
  const [isTailoring, setIsTailoring] = useState(false);
  const [isBuildComplete, setIsBuildComplete] = useState(false);
  const [baselineAtsScore, setBaselineAtsScore] = useState(null);
  const [tailoredAtsScore, setTailoredAtsScore] = useState(null);
  const [bulletRewrites, setBulletRewrites] = useState([]);
  const [metricInputs, setMetricInputs] = useState({});

  // Cover Letter
  const [coverLetter, setCoverLetter] = useState('');
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);

  // Versions
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  // PDF Export
  const [isExporting, setIsExporting] = useState(false);
  const [quota, setQuota] = useState({ used: 0, cap: 10, remaining: 10 });

  // Initial load tracking ref to prevent duplicate effect executions
  const initialLoadedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // INITIAL FETCHING
  // ---------------------------------------------------------------------------
  useEffect(() => {
    checkUploadedResumeStatus();
    fetchEligibleDrives();
    fetchVersions();
    fetchQuota();
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      handleLoadSource('profile');
    }
  }, []);

  const checkUploadedResumeStatus = async () => {
    try {
      const res = await api.get('/students/me/resume-profile');
      if (res.data?.success) {
        setHasUploadedResume(Boolean(res.data.hasResume || res.data.resumeFilename));
        setUploadedResumeName(res.data.resumeFilename || 'Uploaded Resume.pdf');
      }
    } catch (_) {
      // Ignore if not found
    }
  };

  const fetchEligibleDrives = async () => {
    try {
      setLoadingDrives(true);
      const res = await api.get('/drives/eligible');
      if (res.data?.success && Array.isArray(res.data.drives)) {
        setDrives(res.data.drives);
        if (res.data.drives.length > 0) {
          setSelectedDriveId(res.data.drives[0]._id);
        }
      }
    } catch (_) {
    } finally {
      setLoadingDrives(false);
    }
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

  // ---------------------------------------------------------------------------
  // STEP 1 HANDLERS: SOURCE
  // ---------------------------------------------------------------------------
  const handleLoadSource = async (typeToLoad = sourceType) => {
    if (typeToLoad === 'text' && (!pastedText || !pastedText.trim())) {
      toast.error('Please paste your resume text before proceeding.');
      return;
    }

    try {
      setLoadingSource(true);
      const payload = {
        type: typeToLoad,
        text: typeToLoad === 'text' ? pastedText.trim() : undefined,
      };

      const res = await api.post('/resume-builder/source', payload);
      if (res.data?.success && res.data.resumeData) {
        setResumeData(res.data.resumeData);
        setSourceWarnings(res.data.warnings || []);
        setParseConfidence(res.data.parseConfidence || 1.0);
        setSourceType(typeToLoad);
        toast.success(`Resume data loaded from ${typeToLoad === 'profile' ? 'college profile' : typeToLoad === 'upload' ? 'uploaded PDF' : 'pasted text'}!`, {
          id: 'resume-source-loaded',
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to load resume source';
      toast.error(msg);
    } finally {
      setLoadingSource(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF documents (.pdf) are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('resume', file);

      const res = await api.post('/students/resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        setHasUploadedResume(true);
        setUploadedResumeName(file.name);
        toast.success('Resume uploaded! Now extracting structured profile...');
        await handleLoadSource('upload');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload resume file.');
    } finally {
      setIsUploading(false);
      setUploadFile(null);
    }
  };

  const handleOpenEditModal = () => {
    if (!resumeData) return;
    setEditedResume(JSON.parse(JSON.stringify(resumeData)));
    setShowEditModal(true);
  };

  const handleSaveEditedResume = () => {
    if (!editedResume) return;
    setResumeData(editedResume);
    setShowEditModal(false);
    toast.success('Resume edits saved in memory!');
  };

  // ---------------------------------------------------------------------------
  // STEP 2 HANDLERS: TARGET
  // ---------------------------------------------------------------------------
  const handleAnalyzeTarget = async () => {
    if (targetType === 'drive' && !selectedDriveId) {
      toast.error('Please select an eligible campus drive.');
      return;
    }
    if (targetType === 'jd' && !customJdText.trim()) {
      toast.error('Please paste the target Job Description.');
      return;
    }

    try {
      setAnalyzingTarget(true);
      const payload = {
        driveId: targetType === 'drive' ? selectedDriveId : null,
        jobDescription: targetType === 'jd' ? customJdText.trim() : '',
      };

      const res = await api.post('/resume-builder/analyze-target', payload);
      if (res.data?.success && res.data.target) {
        setTargetData(res.data.target);
        setKeywordChips(res.data.target.keywords || []);
        toast.success(`Target role analyzed: ${res.data.target.roleTitle}`);
        // Advance to Step 3
        handleFetchMatchReport(resumeData, res.data.target);
        setCurrentStep(3);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to analyze target requirements.');
    } finally {
      setAnalyzingTarget(false);
    }
  };

  const handleRemoveKeywordChip = (chipToRemove) => {
    setKeywordChips((prev) => prev.filter((k) => k !== chipToRemove));
  };

  const handleAddKeywordChip = () => {
    const val = newKeywordInput.trim().toLowerCase();
    if (!val) return;
    if (!keywordChips.includes(val)) {
      setKeywordChips((prev) => [...prev, val]);
      if (targetData) {
        setTargetData({
          ...targetData,
          keywords: [...(targetData.keywords || []), val],
        });
      }
    }
    setNewKeywordInput('');
  };

  // ---------------------------------------------------------------------------
  // STEP 3 HANDLERS: MATCH REPORT
  // ---------------------------------------------------------------------------
  const handleFetchMatchReport = async (activeResume = resumeData, activeTarget = targetData) => {
    if (!activeResume) return;

    try {
      setLoadingMatchReport(true);
      const res = await api.post('/resume-builder/match-report', {
        resumeData: activeResume,
        target: activeTarget || {
          type: 'general',
          roleTitle: 'General Software Engineer',
          keywords: keywordChips,
        },
        sourceType,
      });

      if (res.data?.success && res.data.matchReport) {
        setMatchReport(res.data.matchReport);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to compute match report');
    } finally {
      setLoadingMatchReport(false);
    }
  };

  const handleClaimSkill = async (skill) => {
    if (!resumeData) return;
    const cleanSkill = skill.trim();

    // Check if already in skills
    const existing = (resumeData.skills || []).flatMap((c) =>
      typeof c === 'string' ? [c] : c.items || []
    );
    if (existing.map((s) => s.toLowerCase()).includes(cleanSkill.toLowerCase())) {
      toast('Skill is already on your resume!');
      return;
    }

    const updated = JSON.parse(JSON.stringify(resumeData));
    if (!Array.isArray(updated.skills) || updated.skills.length === 0) {
      updated.skills = [{ category: 'Technical Skills', items: [`${cleanSkill} (self-declared)`] }];
    } else {
      updated.skills[0].items = [
        ...(updated.skills[0].items || []),
        `${cleanSkill} (self-declared)`,
      ];
    }

    setResumeData(updated);
    toast.success(`Added "${cleanSkill}" (self-declared). Recalculating ATS match...`);

    // Recalculate match report immediately
    await handleFetchMatchReport(updated, targetData);
  };

  const handleAddToLearningPlan = (skill) => {
    const existing = learningList.find((item) => item.skill.toLowerCase() === skill.toLowerCase());
    if (existing) {
      toast('Skill already in your learning list!');
      return;
    }

    const resource = (matchReport?.learningResources || []).find(
      (r) => r.skill.toLowerCase() === skill.toLowerCase()
    );

    const newItem = {
      skill,
      title: resource?.title || `${skill} Documentation`,
      resourceType: resource?.resourceType || 'Official Documentation',
      url: resource?.url || null,
      isCurated: Boolean(resource?.url),
    };

    setLearningList((prev) => [...prev, newItem]);
    toast.success(`Saved "${skill}" to personal learning list. (Not added to resume)`);
  };

  // ---------------------------------------------------------------------------
  // STEP 4 HANDLERS: BUILD & TAILOR
  // ---------------------------------------------------------------------------
  const countPlaceholders = () => {
    if (!resumeData) return 0;
    let count = 0;
    if (resumeData.summary && PLACEHOLDER_REGEX.test(resumeData.summary)) count++;

    (resumeData.experience || []).forEach((e) => {
      (e.bullets || []).forEach((b) => {
        if (b && PLACEHOLDER_REGEX.test(b)) count++;
      });
    });

    (resumeData.projects || []).forEach((p) => {
      (p.bullets || []).forEach((b) => {
        if (b && PLACEHOLDER_REGEX.test(b)) count++;
      });
    });

    return count;
  };

  const unresolvedPlaceholderCount = countPlaceholders();

  const handleTailorResume = async () => {
    try {
      setIsTailoring(true);
      const payload = {
        resumeData,
        driveId: targetType === 'drive' ? selectedDriveId : null,
        jobDescription: targetType === 'jd' ? customJdText.trim() : '',
        sourceType,
      };

      const res = await api.post('/students/me/resume-builder/tailor', payload);
      if (res.data?.success) {
        setResumeData(res.data.tailoredResume);
        setBaselineAtsScore(res.data.baselineAtsScore);
        setTailoredAtsScore(res.data.tailoredAtsScore);
        setBulletRewrites(res.data.bulletRewrites || []);
        setIsBuildComplete(true);
        toast.success(
          `Resume tailored! ATS score: ${res.data.baselineAtsScore}% ➔ ${res.data.tailoredAtsScore}% (+${res.data.scoreDelta} pts).`
        );
        fetchQuota();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to tailor resume');
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

    const resolved = suggestedTemplate.replace(PLACEHOLDER_REGEX, userMetric.trim());

    const updated = JSON.parse(JSON.stringify(resumeData));
    let replaced = false;

    (updated.experience || []).forEach((exp) => {
      exp.bullets = (exp.bullets || []).map((b) => {
        if (
          b.trim().toLowerCase() === originalBullet.trim().toLowerCase() ||
          b.trim().toLowerCase() === suggestedTemplate.trim().toLowerCase()
        ) {
          replaced = true;
          return resolved;
        }
        return b;
      });
    });

    (updated.projects || []).forEach((proj) => {
      proj.bullets = (proj.bullets || []).map((b) => {
        if (
          b.trim().toLowerCase() === originalBullet.trim().toLowerCase() ||
          b.trim().toLowerCase() === suggestedTemplate.trim().toLowerCase()
        ) {
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

  const handleGenerateCoverLetter = async () => {
    try {
      setIsGeneratingCoverLetter(true);
      const payload = {
        driveId: targetType === 'drive' ? selectedDriveId : null,
        jobDescription: targetType === 'jd' ? customJdText.trim() : '',
        role:
          targetType === 'drive'
            ? drives.find((d) => d._id === selectedDriveId)?.role || 'Software Engineer'
            : targetData?.roleTitle || 'Software Engineer',
        company:
          targetType === 'drive'
            ? drives.find((d) => d._id === selectedDriveId)?.company?.name || ''
            : targetData?.company || '',
      };

      const res = await api.post('/students/me/resume-builder/cover-letter', payload);
      if (res.data?.success && res.data.coverLetter) {
        setCoverLetter(res.data.coverLetter);
        toast.success('Truthful cover letter synthesized based on your verified records!');
        fetchQuota();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate cover letter');
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

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
        atsScore: tailoredAtsScore || matchReport?.atsScore || 0,
        baselineScore: baselineAtsScore || matchReport?.atsScore || 0,
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
        setIsBuildComplete(true);
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

  const handleExportPdf = async () => {
    if (unresolvedPlaceholderCount > 0) {
      toast.error(
        `Cannot export PDF: ${unresolvedPlaceholderCount} unresolved '[add your real number]' placeholder(s) remaining.`
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
      const candidateName = (resumeData?.contact?.fullName || 'Candidate').replace(/\s+/g, '_');
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

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-full overflow-x-hidden">
      {/* ===================================================================== */}
      {/* HEADER & STEPPER                                                      */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 md:p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Job-First ATS Resume Builder & Tailoring Engine</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Resume Builder & Tailoring</h1>
            <p className="text-xs text-slate-500">
              Transform your profile into high-scoring, single-column ATS resumes with zero hallucinations.
            </p>
          </div>

          {/* Quick Stats or Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Version ({versions.length}/5)</span>
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isExporting || unresolvedPlaceholderCount > 0 || !resumeData}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                unresolvedPlaceholderCount > 0 || !resumeData
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
              }`}
              title={
                unresolvedPlaceholderCount > 0
                  ? `Blocked: ${unresolvedPlaceholderCount} unresolved placeholder(s)`
                  : 'Download ATS-friendly PDF'
              }
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* 4-Step Stepper Bar */}
        <nav
          aria-label="Resume Builder Wizard Stepper"
          role="navigation"
          className="border-t border-slate-100 pt-4"
        >
          <div
            role="progressbar"
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={4}
            className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4"
          >
            {STEPS.map((s) => {
              const isDone = currentStep > s.id;
              const isCurrent = currentStep === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    // Only allow moving to completed or accessible steps
                    if (s.id <= currentStep || (s.id === 2 && resumeData) || (s.id === 3 && targetData)) {
                      setCurrentStep(s.id);
                      if (s.id === 3 && !matchReport && resumeData) {
                        handleFetchMatchReport(resumeData, targetData);
                      }
                    }
                  }}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                    isCurrent
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                      : isDone
                      ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 text-slate-700'
                      : 'border-slate-200 bg-slate-50/50 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.id}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-bold truncate ${
                        isCurrent ? 'text-indigo-900' : isDone ? 'text-emerald-900' : 'text-slate-500'
                      }`}
                    >
                      {`Step ${s.id}: ${s.title}`}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* ===================================================================== */}
      {/* 2-COLUMN WORKSPACE: LEFT (WIZARD STEPS) | RIGHT (LIVE PREVIEW)        */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ------------------------------------------------------------------- */}
        {/* LEFT COLUMN: CONTROLS & WIZARD STEPS (5 COLS)                       */}
        {/* Sticky on large screens with natural page scroll                    */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-4 self-start pr-1">
          {/* ================================================================= */}
          {/* STEP 1: SOURCE                                                    */}
          {/* ================================================================= */}
          {currentStep === 1 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Step 1: Choose Resume Source</h2>
                  {resumeData && (
                    <button
                      type="button"
                      onClick={handleOpenEditModal}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Details</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Select your source document. We normalize all inputs into an ATS single-column baseline.
                </p>
              </div>

              {/* Source Option Tabs */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setSourceType('profile');
                    handleLoadSource('profile');
                  }}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    sourceType === 'profile'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Saved Profile
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('upload')}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    sourceType === 'upload'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Uploaded PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('text')}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    sourceType === 'text'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Paste Text
                </button>
              </div>

              {/* Source Content Panel */}
              {sourceType === 'profile' && (
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2 text-xs text-indigo-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    <span>Loaded from Verified Academic Profile</span>
                  </div>
                  <p className="text-indigo-800/90 leading-relaxed text-[11px]">
                    Includes verified CGPA, branch coursework, registered skills, and saved project records.
                  </p>
                </div>
              )}

              {sourceType === 'upload' && (
                <div className="space-y-3">
                  {hasUploadedResume ? (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-slate-600" />
                          <span className="truncate max-w-[200px]">{uploadedResumeName}</span>
                        </div>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                          Ready
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Reusing parsed profile data from Resume AI.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleLoadSource('upload')}
                        disabled={loadingSource}
                        className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        {loadingSource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Reload From Uploaded Resume</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center space-y-2 text-xs">
                      <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                      <div className="font-semibold text-slate-700">No uploaded resume found yet</div>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        Upload a PDF resume (max 5MB). Parsed on-device or via secure OCR with zero PII retention.
                      </p>
                      <label className="inline-block mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl cursor-pointer text-xs transition-colors">
                        {isUploading ? 'Uploading...' : 'Choose PDF File'}
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                      <div className="text-[10px] text-slate-400 italic pt-1">
                        OCR Consent Note: Your uploaded file is processed strictly for ATS scoring and tailoring.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sourceType === 'text' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <label className="font-semibold text-slate-700">Paste Full Resume Text</label>
                    <span className="text-[11px] text-slate-400">{pastedText.length}/50,000</span>
                  </div>
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    maxLength={50000}
                    placeholder="Paste education, work experience, projects, and skills here..."
                    className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed text-slate-800 resize-y"
                  />
                  <button
                    type="button"
                    onClick={() => handleLoadSource('text')}
                    disabled={loadingSource || !pastedText.trim()}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {loadingSource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Extract Structured Resume</span>
                  </button>
                </div>
              )}

              {/* Source Warnings */}
              {sourceWarnings.length > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 space-y-1.5 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Missing Section Warnings ({sourceWarnings.length})</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 pl-1">
                    {sourceWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Loaded Section Summary Chips */}
              {resumeData && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Extracted Sections Preview
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Candidate</div>
                      <div className="font-bold text-slate-800 truncate">{resumeData.contact?.fullName || 'Not specified'}</div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Technical Skills</div>
                      <div className="font-bold text-slate-800">
                        {(resumeData.skills || []).flatMap((c) => c.items || []).length} skills
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Experience</div>
                      <div className="font-bold text-slate-800">
                        {(resumeData.experience || []).length} positions
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Projects</div>
                      <div className="font-bold text-slate-800">
                        {(resumeData.projects || []).length} projects
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 Continue CTA */}
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                disabled={!resumeData}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>Continue to Target Role (Step 2)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2: TARGET ROLE                                               */}
          {/* ================================================================= */}
          {currentStep === 2 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Step 2: Define Target Role</h2>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Select a campus placement drive, paste a custom Job Description, or build a General resume.
                </p>
              </div>

              {/* Target Type Selector */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTargetType('drive')}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    targetType === 'drive'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Campus Drive
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('jd')}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    targetType === 'jd'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Custom JD
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('general')}
                  className={`py-2 px-1 text-center rounded-lg transition-all ${
                    targetType === 'general'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  General Mode
                </button>
              </div>

              {/* Drive Selection Panel */}
              {targetType === 'drive' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Eligible Campus Drives
                  </label>
                  {loadingDrives ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600 mx-auto mb-1" />
                      Loading eligible drives...
                    </div>
                  ) : drives.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">No eligible drives yet</div>
                        <p className="text-amber-700 mt-0.5 leading-relaxed text-[11px]">
                          There are currently no active placement drives matching your branch or batch. You can paste a custom Job Description or choose General Resume mode.
                        </p>
                      </div>
                    </div>
                  ) : (
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
                  )}
                </div>
              )}

              {/* Custom JD Panel */}
              {targetType === 'jd' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Target Job Description Text
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

              {/* General Mode Panel */}
              {targetType === 'general' && (
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2 text-xs text-indigo-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>General Engineering Resume Mode</span>
                  </div>
                  <p className="text-indigo-800/90 leading-relaxed text-[11px]">
                    Optimizes your resume layout, action verbs, and structure for software engineering roles without coupling to a specific job description.
                  </p>
                </div>
              )}

              {/* Target Analysis CTA */}
              <button
                type="button"
                onClick={handleAnalyzeTarget}
                disabled={analyzingTarget || (targetType === 'drive' && drives.length === 0)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {analyzingTarget ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Extracting Keywords & Requirements...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analyze Target & Match (Step 3)</span>
                  </>
                )}
              </button>

              {/* Target Data Display if already analyzed */}
              {targetData && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Target Profile: {targetData.roleTitle}
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="text-slate-600 font-medium">Keywords & Skills:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {keywordChips.map((chip, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[11px] font-medium"
                        >
                          <span>{chip}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeywordChip(chip)}
                            className="hover:text-rose-600 rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {/* Add Keyword Input */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeywordChip())}
                        placeholder="Add keyword chip..."
                        className="flex-1 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddKeywordChip}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: MATCH REPORT                                              */}
          {/* ================================================================= */}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Step 3: ATS Match & Skill Gap</h2>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Detailed analysis of keyword overlap, missing skills, and prioritized fixes.
                </p>
              </div>

              {loadingMatchReport ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                  <div>Computing ATS score & skill gap analysis...</div>
                </div>
              ) : matchReport ? (
                <div className="space-y-4">
                  {/* Score Highlights */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40">
                      <div className="text-[11px] font-semibold text-indigo-700 uppercase">
                        Source resume ({matchReport.sourceName || (sourceType === 'upload' ? 'Uploaded PDF' : sourceType === 'text' ? 'Pasted Text' : 'College Profile')}):
                      </div>
                      <div className="text-2xl font-bold text-indigo-900 mt-0.5">
                        {matchReport.atsScore !== null && matchReport.atsScore !== undefined ? `${matchReport.atsScore}%` : '0%'}
                      </div>
                      {matchReport.isGeneral && (
                        <div className="text-[10px] text-indigo-700/80 mt-1 italic leading-tight">
                          score excludes keyword match, no job selected
                        </div>
                      )}
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40">
                      <div className="text-[11px] font-semibold text-emerald-700 uppercase">Role Match</div>
                      <div className="text-2xl font-bold text-emerald-900 mt-0.5">
                        {matchReport.matchScore !== null && matchReport.matchScore !== undefined ? `${matchReport.matchScore}%` : 'N/A (General)'}
                      </div>
                    </div>
                  </div>

                  {/* Help Tooltip */}
                  <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5 border border-slate-200/70 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Why scores may differ:</strong> Resume AI evaluates your uploaded PDF file text directly, while Resume Builder evaluates your active source ({matchReport.sourceName || (sourceType === 'upload' ? 'Uploaded PDF' : sourceType === 'text' ? 'Pasted Text' : 'College Profile')}).
                    </span>
                  </div>

                  {/* ATS Breakdown Bars */}
                  {matchReport.breakdown && (
                    <div className="space-y-2 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 text-xs">
                      <div className="font-bold text-slate-800">Scoring Breakdown</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div>Keywords: <strong className="text-slate-900">{matchReport.breakdown.keywordMatch !== null && matchReport.breakdown.keywordMatch !== undefined ? `${matchReport.breakdown.keywordMatch}/35` : 'n/a'}</strong></div>
                        <div>Experience: <strong className="text-slate-900">{matchReport.breakdown.experience !== null && matchReport.breakdown.experience !== undefined ? `${matchReport.breakdown.experience}/10` : '0/10'}</strong></div>
                        <div>Education: <strong className="text-slate-900">{matchReport.breakdown.education !== null && matchReport.breakdown.education !== undefined ? `${matchReport.breakdown.education}/5` : '0/5'}</strong></div>
                        <div>Structure: <strong className="text-slate-900">{matchReport.breakdown.structure !== null && matchReport.breakdown.structure !== undefined ? `${matchReport.breakdown.structure}/15` : '0/15'}</strong></div>
                        <div>Quantified Impact: <strong className="text-slate-900">{matchReport.breakdown.impact !== null && matchReport.breakdown.impact !== undefined ? `${matchReport.breakdown.impact}/15` : '0/15'}</strong></div>
                        <div>Action Verbs: <strong className="text-slate-900">{matchReport.breakdown.actionVerbs !== null && matchReport.breakdown.actionVerbs !== undefined ? `${matchReport.breakdown.actionVerbs}/10` : '0/10'}</strong></div>
                        <div>Formatting: <strong className="text-slate-900">{matchReport.breakdown.formatting !== null && matchReport.breakdown.formatting !== undefined ? `${matchReport.breakdown.formatting}/10` : '0/10'}</strong></div>
                      </div>
                    </div>
                  )}

                  {/* Matched Skills */}
                  {(matchReport.matchedSkills || []).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Matched Skills ({(matchReport.matchedSkills || []).length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {matchReport.matchedSkills.map((sk, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Skills with 2 Actions */}
                  {((matchReport.missingRequired || []).length > 0 || (matchReport.missingPreferred || []).length > 0) && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Missing Skills Checklist</span>
                      </div>
                      <div className="text-[11px] text-amber-800/90 leading-tight">
                        Only add skills you actually possess. For unlearned skills, add to your separate learning plan.
                      </div>

                      <div className="space-y-2">
                        {Array.from(new Set([...(matchReport.missingRequired || []), ...(matchReport.missingPreferred || [])])).map(
                          (sk, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <span className="font-semibold text-slate-800">{sk}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleClaimSkill(sk)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold transition-colors"
                                  title="Add to resume marked as self-declared"
                                >
                                  I have this skill
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddToLearningPlan(sk)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors"
                                  title="Add to personal learning list without changing resume"
                                >
                                  Skills to learn
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Learning Plan Section if items added */}
                  {learningList.length > 0 && (
                    <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2 text-xs">
                      <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Personal Learning Plan ({learningList.length})</span>
                      </div>
                      <p className="text-[11px] text-indigo-700 italic">
                        Kept strictly in your study queue. Never injected into your resume.
                      </p>
                      <ul className="space-y-1">
                        {learningList.map((item, idx) => (
                          <li key={idx} className="flex items-center justify-between text-[11px] text-indigo-950">
                            <span className="font-semibold">{item.skill}</span>
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <span>{item.resourceType}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-500">{item.resourceType}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weak Sections & Ranked Fixes */}
                  {(matchReport.weakSections || []).length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-slate-800">Priority Fixes</div>
                      <div className="space-y-1">
                        {matchReport.weakSections.map((sec, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] space-y-0.5"
                          >
                            <div className="font-bold text-slate-900 flex items-center justify-between">
                              <span>{sec.title}</span>
                              <span
                                className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                                  sec.severity === 'high'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {sec.severity}
                              </span>
                            </div>
                            <div className="text-slate-600 leading-tight">{sec.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Proceed to Step 4 Button */}
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
                  >
                    <span>Proceed to Build & Tailor (Step 4)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 4: BUILD & TAILOR                                            */}
          {/* ================================================================= */}
          {currentStep === 4 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Step 4: Tailor & Export</h2>
                  <p className="text-xs text-slate-500">
                    Re-order skills, quantify bullets, and generate an ATS-ready single-column PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              {/* Sub-tabs: Tailor / Cover Letter / Versions */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center justify-between gap-1 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('tailor')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'tailor' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tailor</span>
                </button>
                <button
                  onClick={() => setActiveTab('cover_letter')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'cover_letter' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Cover Letter</span>
                </button>
                <button
                  onClick={() => setActiveTab('versions')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'versions' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Versions ({versions.length}/5)</span>
                </button>
              </div>

              {/* SUBTAB: TAILOR */}
              {activeTab === 'tailor' && (
                <div className="space-y-4">
                  {/* Tailor CTA Button */}
                  <button
                    onClick={handleTailorResume}
                    disabled={isTailoring}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                    {isTailoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Reordering Skills & Rewriting Bullets...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Build Tailored Resume</span>
                      </>
                    )}
                  </button>

                  {/* ATS Score Progress Gauge */}
                  {tailoredAtsScore !== null && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-emerald-900 font-medium">
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                          <span>
                            Source resume ({sourceType === 'upload' ? 'Uploaded PDF' : sourceType === 'text' ? 'Pasted Text' : 'College Profile'}): <strong>{baselineAtsScore}%</strong>
                          </span>
                          <ArrowRight className="w-3 h-3 text-emerald-500" />
                          <span>
                            Tailored resume: <strong className="text-emerald-700 text-sm">{tailoredAtsScore}%</strong>
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                          +{Math.max(0, tailoredAtsScore - (baselineAtsScore || 0))} pts
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 bg-white/80 rounded-lg p-1.5 border border-emerald-100 flex items-start gap-1">
                        <Info className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                          Why scores differ: Resume AI evaluates your uploaded PDF file text directly, while Resume Builder evaluates your active source document ({sourceType === 'upload' ? 'Uploaded PDF' : sourceType === 'text' ? 'Pasted Text' : 'College Profile'}) and updates as you tailor.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bullet Rewrites Review */}
                  {bulletRewrites.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Optimized Bullet Points
                      </div>
                      <div className="space-y-3">
                        {bulletRewrites.map((rw, idx) => {
                          const isKept = rw.status === 'kept original' || rw.original === rw.suggested;
                          const hasPlaceholder = !isKept && PLACEHOLDER_REGEX.test(rw.suggested);
                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                            >
                              {isKept ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                      Kept Original
                                    </span>
                                  </div>
                                  <div className="font-medium text-slate-800 leading-relaxed">
                                    {rw.original}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-slate-500 line-through italic text-[11px]">
                                    {rw.original}
                                  </div>
                                  <div className="font-medium text-slate-900 leading-relaxed">
                                    {rw.suggested}
                                  </div>
                                </>
                              )}
                              {rw.why && (
                                <div className="text-[11px] text-indigo-700 bg-indigo-50/70 p-2 rounded-lg">
                                  💡 {rw.why}
                                </div>
                              )}
                              {hasPlaceholder && (
                                <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Your real number (e.g. 35%, 1500 users)"
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

              {/* SUBTAB: COVER LETTER */}
              {activeTab === 'cover_letter' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800">Truthful Cover Letter</div>
                    {coverLetter && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(coverLetter);
                          toast.success('Cover letter copied!');
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    )}
                  </div>
                  {!coverLetter ? (
                    <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                      <FileText className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Generate a 3-paragraph truthful cover letter grounded strictly in your coursework and verified projects.
                      </p>
                      <button
                        onClick={handleGenerateCoverLetter}
                        disabled={isGeneratingCoverLetter}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold"
                      >
                        {isGeneratingCoverLetter ? 'Synthesizing...' : 'Generate Cover Letter'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        rows={10}
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        className="w-full text-xs font-serif leading-relaxed border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
                      />
                      <button
                        onClick={handleGenerateCoverLetter}
                        disabled={isGeneratingCoverLetter}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Regenerate
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB: VERSIONS */}
              {activeTab === 'versions' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800">Saved Versions</div>
                    <button
                      onClick={() => setShowSaveModal(true)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                    >
                      + Save Current
                    </button>
                  </div>
                  {versions.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No saved versions yet (max 5 snapshots).
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {versions.map((v) => (
                        <div
                          key={v._id}
                          onClick={() => handleLoadVersion(v._id)}
                          className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 p-2 rounded-xl transition-colors cursor-pointer text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{v.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full uppercase bg-slate-100 text-slate-600">
                                {v.templateId}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(v.createdAt).toLocaleDateString()} • ATS: {v.atsScore || 0}%
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteVersion(v._id, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* RIGHT COLUMN: LIVE ATS SINGLE-COLUMN PREVIEW (7 COLS)               */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          {/* Top Bar: Template Switcher & Status */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Template:</span>
              <span className="text-[11px] text-slate-400 italic mr-1">(Template applies to the exported PDF)</span>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    templateId === t.id
                      ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{t.name}</span>
                  {t.badge && (
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-bold ml-1.5">
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Placeholder Indicator */}
            {unresolvedPlaceholderCount > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>{unresolvedPlaceholderCount} Metric Placeholder(s)</span>
              </div>
            ) : isBuildComplete ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ready to Export</span>
              </div>
            ) : null}
          </div>

          {/* Placeholder Blocker Alert Banner */}
          {unresolvedPlaceholderCount > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-900">
                <div className="font-bold">
                  Export Locked: {unresolvedPlaceholderCount} Metric Placeholder(s)
                </div>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Unverified metrics are kept in{' '}
                  <code className="bg-amber-100/90 px-1 py-0.5 rounded text-amber-950 font-mono font-bold">
                    [add your real number]
                  </code>{' '}
                  tags to prevent automated AI hallucinations. <strong>PDF export is locked</strong> until you replace them with authentic metrics or remove them.
                </p>
              </div>
            </div>
          )}

          {/* Single-Column ATS Render Document */}
          {!resumeData ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
              <div className="text-xs font-semibold">Compiling ATS resume profile...</div>
            </div>
          ) : (
            <div
              className={`bg-white rounded-2xl border shadow-sm p-6 sm:p-8 transition-all min-h-[750px] space-y-6 ${
                templateId === 'classic'
                  ? 'font-serif border-slate-300'
                  : templateId === 'compact'
                  ? 'font-sans text-xs border-slate-200'
                  : 'font-sans border-slate-200'
              }`}
            >
              {/* Header */}
              <div className={`space-y-1 ${templateId === 'classic' ? 'text-center' : 'text-left'}`}>
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

              {/* Professional Summary */}
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
                        <strong className="font-semibold text-slate-900">{cat.category || 'Skills'}: </strong>
                        <span>{(cat.items || []).join(', ')}</span>
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
                            const isPlaceholder = PLACEHOLDER_REGEX.test(b);
                            return (
                              <li
                                key={bIdx}
                                className={isPlaceholder ? 'bg-amber-100/80 p-1 rounded font-medium text-amber-950' : ''}
                              >
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
                            const isPlaceholder = PLACEHOLDER_REGEX.test(b);
                            return (
                              <li
                                key={bIdx}
                                className={isPlaceholder ? 'bg-amber-100/80 p-1 rounded font-medium text-amber-950' : ''}
                              >
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
                            {[
                              edu.institution,
                              edu.field ? `in ${edu.field}` : '',
                              edu.score ? `(CGPA: ${edu.score})` : '',
                            ]
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
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* INLINE EDIT MODAL                                                     */}
      {/* ===================================================================== */}
      {showEditModal && editedResume && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Resume Details</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editedResume.contact?.fullName || ''}
                  onChange={(e) =>
                    setEditedResume({
                      ...editedResume,
                      contact: { ...editedResume.contact, fullName: e.target.value },
                    })
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Professional Summary</label>
                <textarea
                  rows={3}
                  value={editedResume.summary || ''}
                  onChange={(e) => setEditedResume({ ...editedResume, summary: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Technical Skills (Comma-separated)
                </label>
                <input
                  type="text"
                  value={(editedResume.skills || []).flatMap((c) => c.items || []).join(', ')}
                  onChange={(e) => {
                    const items = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                    setEditedResume({
                      ...editedResume,
                      skills: [{ category: 'Technical Skills', items }],
                    });
                  }}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedResume}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SAVE VERSION MODAL                                                    */}
      {/* ===================================================================== */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Save Resume Version</h3>
              <p className="text-xs text-slate-500">
                Give this version a label (e.g. "Google SWE Tailored", "Fintech Analyst v2"). Max 5 versions.
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
