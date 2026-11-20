import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { registerSessionResetHandler } from '../../utils/sessionManager';
import api from '../../services/api';
import {
  FileText,
  Sparkles,
  Download,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Building2,
  Trash2,
  Copy,
  Clock,
  Edit3,
  FileCheck2,
  X,
  Loader2,
  ExternalLink,
  Upload,
  BookOpen,
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

const PLACEHOLDER_REGEX = /\[(?:add\s+your\s+real\s+number|add\s+real\s+number|add\s+number|your\s+number|metric|X%|X)\]/i;

const ResumeBuilder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?._id || user?.id || null;

  // Storage key: sessionStorage only, scoped strictly to user id
  const draftKey = currentUserId
    ? `resume_builder_draft_${currentUserId}`
    : 'resume_builder_draft_guest';

  // ---------------------------------------------------------------------------
  // SOURCE STATE (Card 1)
  // ---------------------------------------------------------------------------
  const [sourceTab, setSourceTab] = useState('upload'); // 'upload' | 'resume_ai' | 'text'
  const [sourceType, setSourceType] = useState('upload'); // 'upload' | 'profile' | 'text'
  const [pastedText, setPastedText] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [sourceWarnings, setSourceWarnings] = useState([]);
  const [parseConfidence, setParseConfidence] = useState(1.0);

  // Resume AI parsed upload status
  const [hasUploadedResume, setHasUploadedResume] = useState(false);
  const [uploadedResumeName, setUploadedResumeName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Inline editor modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedResume, setEditedResume] = useState(null);

  // ---------------------------------------------------------------------------
  // TARGET JOB STATE (Card 2)
  // ---------------------------------------------------------------------------
  const [targetMode, setTargetMode] = useState('jd'); // 'jd' | 'drive'
  const [isGeneralMode, setIsGeneralMode] = useState(false);
  const [customJdText, setCustomJdText] = useState('');
  const [drives, setDrives] = useState([]);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [targetData, setTargetData] = useState(null);
  const [missingSkills, setMissingSkills] = useState([]);
  const [claimedSkills, setClaimedSkills] = useState(new Set());
  const [learningList, setLearningList] = useState([]);

  // ---------------------------------------------------------------------------
  // CREATION & PROGRESS STATES
  // ---------------------------------------------------------------------------
  const [isCreating, setIsCreating] = useState(false);
  const [creationStepMessage, setCreationStepMessage] = useState('');
  const [isBuildComplete, setIsBuildComplete] = useState(false);
  const [bulletRewrites, setBulletRewrites] = useState([]);
  const [metricInputs, setMetricInputs] = useState({});

  // ---------------------------------------------------------------------------
  // RESULTS & TABS
  // ---------------------------------------------------------------------------
  const [templateId, setTemplateId] = useState('modern');
  const [activeResultTab, setActiveResultTab] = useState('preview'); // 'preview' | 'bullets' | 'cover_letter' | 'versions'

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
  const [modelUsed, setModelUsed] = useState('');

  // Draft restore tracking
  const [draftRestoredAt, setDraftRestoredAt] = useState(null);
  const isInitialMount = useRef(true);

  // ---------------------------------------------------------------------------
  // MOUNT & USER CHANGE: Fetch metadata only (no resume content auto-load, no toast)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unregister = registerSessionResetHandler(() => {
      handleStartOver({ silent: true });
    });
    return unregister;
  }, []);

  useEffect(() => {
    handleStartOver({ silent: true });
    if (currentUserId) {
      checkUploadedResumeStatus();
      fetchEligibleDrives();
      fetchVersions();
      fetchQuota();
      restoreDraft();
    }
  }, [currentUserId]);

  // ---------------------------------------------------------------------------
  // AUTOSAVE DRAFT TO SESSION STORAGE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    try {
      if (currentUserId && draftKey && typeof window !== 'undefined' && window.sessionStorage) {
        const draft = {
          userId: currentUserId,
          sourceTab,
          sourceType,
          pastedText,
          resumeData,
          sourceWarnings,
          targetMode,
          isGeneralMode,
          customJdText,
          selectedDriveId,
          targetData,
          missingSkills,
          learningList,
          templateId,
          isBuildComplete,
          bulletRewrites,
          coverLetter,
          savedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(draftKey, JSON.stringify(draft));
      }
    } catch (_) {}
  }, [
    sourceTab,
    sourceType,
    pastedText,
    resumeData,
    sourceWarnings,
    targetMode,
    isGeneralMode,
    customJdText,
    selectedDriveId,
    targetData,
    missingSkills,
    learningList,
    templateId,
    isBuildComplete,
    bulletRewrites,
    coverLetter,
    draftKey,
    currentUserId,
  ]);

  const restoreDraft = () => {
    try {
      if (!currentUserId || !draftKey || typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.userId !== currentUserId) {
        sessionStorage.removeItem(draftKey);
        return;
      }
      if (d) {
        if (d.sourceTab) setSourceTab(d.sourceTab);
        if (d.sourceType) setSourceType(d.sourceType);
        if (d.pastedText) setPastedText(d.pastedText);
        if (d.resumeData) setResumeData(d.resumeData);
        if (d.sourceWarnings) setSourceWarnings(d.sourceWarnings);
        if (d.targetMode) setTargetMode(d.targetMode);
        if (typeof d.isGeneralMode === 'boolean') setIsGeneralMode(d.isGeneralMode);
        if (d.customJdText) setCustomJdText(d.customJdText);
        if (d.selectedDriveId) setSelectedDriveId(d.selectedDriveId);
        if (d.targetData) setTargetData(d.targetData);
        if (Array.isArray(d.missingSkills)) setMissingSkills(d.missingSkills);
        if (Array.isArray(d.learningList)) setLearningList(d.learningList);
        if (d.templateId) setTemplateId(d.templateId);
        if (typeof d.isBuildComplete === 'boolean') setIsBuildComplete(d.isBuildComplete);
        if (Array.isArray(d.bulletRewrites)) setBulletRewrites(d.bulletRewrites);
        if (d.coverLetter) setCoverLetter(d.coverLetter);
        if (d.savedAt) setDraftRestoredAt(new Date(d.savedAt).toLocaleTimeString());
      }
    } catch (_) {}
  };

  const handleStartOver = ({ silent = false } = {}) => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(draftKey);
      }
    } catch (_) {}
    setResumeData(null);
    setSourceWarnings([]);
    setPastedText('');
    setCustomJdText('');
    setIsGeneralMode(false);
    setTargetData(null);
    setMissingSkills([]);
    setClaimedSkills(new Set());
    setLearningList([]);
    setIsBuildComplete(false);
    setBulletRewrites([]);
    setCoverLetter('');
    setDraftRestoredAt(null);
    if (!silent) {
      toast.success('Draft reset. You can start fresh.');
    }
  };

  // ---------------------------------------------------------------------------
  // METADATA FETCHERS
  // ---------------------------------------------------------------------------
  const checkUploadedResumeStatus = async () => {
    try {
      const res = await api.get('/students/me/resume-profile');
      if (res.data?.success) {
        const hasUpload = Boolean(res.data.hasResume || res.data.resumeFilename || res.data.resumeUrl);
        setHasUploadedResume(hasUpload);
        setUploadedResumeName(res.data.resumeFilename || 'Uploaded Resume.pdf');
        if (hasUpload && !resumeData) {
          setSourceTab('resume_ai');
        }
      }
    } catch (_) {}
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
  // CARD 1: RESUME SOURCE HANDLERS
  // ---------------------------------------------------------------------------
  const handleLoadSource = async (typeToLoad, customText = '') => {
    if (typeToLoad === 'text') {
      const textToUse = customText || pastedText;
      if (!textToUse || !textToUse.trim()) {
        toast.error('Please paste your resume text before loading.');
        return;
      }
    }

    try {
      setLoadingSource(true);
      const payload = {
        type: typeToLoad,
        text: typeToLoad === 'text' ? (customText || pastedText).trim() : undefined,
      };

      const res = await api.post('/resume-builder/source', payload);
      if (res.data?.success && res.data.resumeData) {
        setResumeData(res.data.resumeData);
        setSourceWarnings(res.data.warnings || []);
        setParseConfidence(res.data.parseConfidence || 1.0);
        setSourceType(typeToLoad);
        setIsBuildComplete(false);
        const sourceLabel =
          typeToLoad === 'profile'
            ? 'college profile'
            : typeToLoad === 'resume_ai_file'
            ? 'Resume AI file bytes'
            : typeToLoad === 'upload'
            ? 'uploaded resume'
            : 'pasted text';
        toast.success(`Resume data loaded from ${sourceLabel}!`, {
          id: 'resume-source-loaded-notification',
        });
        updateMissingSkills(res.data.resumeData, targetData);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to load resume source');
    } finally {
      setLoadingSource(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isDocx =
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx');

    if (!isPdf && !isDocx) {
      toast.error('Only PDF or DOCX documents (.pdf, .docx) are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds the 5MB limit.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('type', 'upload');
      formData.append('file', file);

      // Memory-only upload to resume-builder/source: does NOT overwrite student profile or saved resume
      const res = await api.post('/resume-builder/source', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success && res.data.resumeData) {
        setResumeData(res.data.resumeData);
        setSourceWarnings(res.data.warnings || []);
        setParseConfidence(res.data.parseConfidence || 0.95);
        setSourceType('upload');
        setUploadedResumeName(file.name);
        setIsBuildComplete(false);
        toast.success(`Resume parsed from ${file.name}! (In-memory only)`, {
          id: 'resume-source-loaded-notification',
        });
        updateMissingSkills(res.data.resumeData, targetData);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to parse uploaded resume document.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveEditedResume = () => {
    if (!editedResume) return;
    setResumeData(editedResume);
    setShowEditModal(false);
    toast.success('Resume details updated.');
    updateMissingSkills(editedResume, targetData);
  };

  // ---------------------------------------------------------------------------
  // CARD 2: TARGET & MISSING SKILLS CHECKLIST
  // ---------------------------------------------------------------------------
  const updateMissingSkills = (currentResume, currentTarget) => {
    if (!currentResume || !currentTarget) {
      setMissingSkills([]);
      return;
    }

    const targetReqs = [
      ...(currentTarget.requiredSkills || []),
      ...(currentTarget.preferredSkills || []),
    ];

    const currentSkillSet = new Set(
      (currentResume.skills || [])
        .flatMap((cat) => (typeof cat === 'string' ? [cat] : cat.items || []))
        .map((s) => s.toLowerCase().trim())
    );

    const missing = Array.from(
      new Set(
        targetReqs
          .map((s) => s.toLowerCase().trim())
          .filter((s) => s && !currentSkillSet.has(s))
      )
    );

    setMissingSkills(missing);
  };

  const handleClaimSkill = (skill) => {
    if (!resumeData) return;
    const clean = skill.trim();

    const existing = (resumeData.skills || []).flatMap((c) =>
      typeof c === 'string' ? [c] : c.items || []
    );
    if (existing.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
      toast('Skill is already on your resume.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(resumeData));
    const declaredSkill = `${clean} (self-declared)`;

    if (!Array.isArray(updated.skills) || updated.skills.length === 0) {
      updated.skills = [{ category: 'Technical Skills', items: [declaredSkill] }];
    } else {
      updated.skills[0].items = [...(updated.skills[0].items || []), declaredSkill];
    }

    setResumeData(updated);
    setClaimedSkills((prev) => new Set([...prev, clean]));
    setMissingSkills((prev) => prev.filter((s) => s !== clean));
    toast.success(`Added "${clean}" (self-declared) to your resume.`);
  };

  const handleAddToLearningPlan = (skill) => {
    const clean = skill.trim();
    if (learningList.some((item) => item.skill.toLowerCase() === clean.toLowerCase())) {
      toast('Skill already in your learning list.');
      return;
    }

    const newItem = {
      skill: clean,
      resourceType: 'Official Documentation & Guides',
      url: null,
    };

    setLearningList((prev) => [...prev, newItem]);
    setMissingSkills((prev) => prev.filter((s) => s !== clean));
    toast.success(`Saved "${clean}" to personal learning list. (Not added to resume)`);
  };

  // ---------------------------------------------------------------------------
  // PRIMARY CTA: CREATE MY RESUME
  // ---------------------------------------------------------------------------
  const handleCreateResume = async () => {
    if (!resumeData) {
      toast.error('Please provide your resume first.');
      return;
    }

    if (!isGeneralMode) {
      if (targetMode === 'jd' && !customJdText.trim()) {
        toast.error('Please paste a target Job Description or switch to General resume.');
        return;
      }
      if (targetMode === 'drive' && !selectedDriveId) {
        toast.error('Please select an eligible campus drive.');
        return;
      }
    }

    try {
      setIsCreating(true);
      setCreationStepMessage('Reading resume & analyzing target requirements...');

      // 1. Analyze target job (deterministic, rules-based)
      let resolvedTarget = null;
      if (!isGeneralMode) {
        const analyzeRes = await api.post('/resume-builder/analyze-target', {
          driveId: targetMode === 'drive' ? selectedDriveId : null,
          jobDescription: targetMode === 'jd' ? customJdText.trim() : '',
        });
        if (analyzeRes.data?.success && analyzeRes.data.target) {
          resolvedTarget = analyzeRes.data.target;
          setTargetData(resolvedTarget);
          updateMissingSkills(resumeData, resolvedTarget);
        }
      }

      setCreationStepMessage('Writing tailored resume & optimizing action bullets...');

      // 2. Tailor resume (AI with strict honesty guards, fallback to deterministic)
      const tailorPayload = {
        resumeData,
        driveId: !isGeneralMode && targetMode === 'drive' ? selectedDriveId : null,
        jobDescription: !isGeneralMode && targetMode === 'jd' ? customJdText.trim() : '',
        sourceType,
      };

      const tailorRes = await api.post('/students/me/resume-builder/tailor', tailorPayload);

      if (tailorRes.data?.success && tailorRes.data.tailoredResume) {
        setResumeData(tailorRes.data.tailoredResume);
        setBulletRewrites(tailorRes.data.bulletRewrites || []);
        if (tailorRes.data.modelUsed) setModelUsed(tailorRes.data.modelUsed);
        setIsBuildComplete(true);
        setActiveResultTab('preview');
        toast.success('Your tailored resume is ready! Review the preview on the right.');
        fetchQuota();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to create resume.';
      toast.error(msg);
    } finally {
      setIsCreating(false);
      setCreationStepMessage('');
    }
  };

  // ---------------------------------------------------------------------------
  // RESULT ACTIONS: PLACEHOLDERS, PDF EXPORT, COVER LETTER, VERSIONS
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
        { responseType: 'blob' }
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

      toast.success('ATS Single-Column PDF downloaded successfully!');
    } catch (err) {
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    try {
      setIsGeneratingCoverLetter(true);
      const payload = {
        driveId: !isGeneralMode && targetMode === 'drive' ? selectedDriveId : null,
        jobDescription: !isGeneralMode && targetMode === 'jd' ? customJdText.trim() : '',
        role:
          !isGeneralMode && targetMode === 'drive'
            ? drives.find((d) => d._id === selectedDriveId)?.role || 'Software Engineer'
            : targetData?.roleTitle || 'Software Engineer',
        company:
          !isGeneralMode && targetMode === 'drive'
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
        coverLetter,
        targetDrive: !isGeneralMode && targetMode === 'drive' ? selectedDriveId : null,
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

  // ---------------------------------------------------------------------------
  // HELPERS FOR EXTRACTED RESUME SUMMARY
  // ---------------------------------------------------------------------------
  const getSectionCounts = () => {
    if (!resumeData) return null;
    const skillsCount = (resumeData.skills || []).reduce(
      (acc, cat) => acc + (cat.items?.length || 0),
      0
    );
    return {
      name: resumeData.contact?.fullName || 'Candidate',
      skills: skillsCount,
      experience: resumeData.experience?.length || 0,
      projects: resumeData.projects?.length || 0,
      education: resumeData.education?.length || 0,
    };
  };

  const sectionCounts = getSectionCounts();

  // Can Create?
  const isTargetReady =
    isGeneralMode ||
    (targetMode === 'jd' && customJdText.trim().length > 0) ||
    (targetMode === 'drive' && Boolean(selectedDriveId));
  const canCreate = Boolean(resumeData) && isTargetReady;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-full overflow-x-hidden">
      {/* ===================================================================== */}
      {/* DRAFT RESTORE BANNER                                                  */}
      {/* ===================================================================== */}
      {draftRestoredAt && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Loaded draft from {draftRestoredAt}</span>
          </div>
          <button
            type="button"
            onClick={handleStartOver}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Start over</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* HEADER                                                                */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Job-First ATS Resume Builder & Tailoring Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Resume Builder & Tailoring</h1>
          <p className="text-xs text-slate-500">
            Build a targeted, ATS-ready resume from your existing resume + a target job with zero hallucinations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={!resumeData}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 transition-colors flex items-center gap-1.5"
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

      {/* ===================================================================== */}
      {/* MAIN TWO-COLUMN LAYOUT                                                */}
      {/* Left (5 cols): Sticky Controls (No inner scrollbar)                   */}
      {/* Right (7 cols): Live ATS Single-Column Preview & Output               */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ------------------------------------------------------------------- */}
        {/* LEFT COLUMN: 2 INPUTS + CHECKLIST + CREATE BUTTON (STICKY)          */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-5 lg:sticky lg:top-4 self-start space-y-5">
          {/* ================================================================= */}
          {/* CARD 1: YOUR RESUME                                               */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h2 className="text-sm font-bold text-slate-900">Your Resume</h2>
              </div>
              <button
                type="button"
                onClick={() => handleLoadSource('profile')}
                disabled={loadingSource}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 transition-colors"
              >
                Start from my college profile
              </button>
            </div>

            {/* Source Tabs */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSourceTab('upload')}
                className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                  sourceTab === 'upload' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
              {hasUploadedResume && (
                <button
                  type="button"
                  onClick={() => setSourceTab('resume_ai')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    sourceTab === 'resume_ai' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>My Resume AI upload</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSourceTab('text')}
                className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                  sourceTab === 'text' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Paste text</span>
              </button>
            </div>

            {/* Tab 1: Upload */}
            {sourceTab === 'upload' && (
              <div className="space-y-2">
                <label className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/60 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors block text-center">
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  ) : (
                    <Upload className="w-6 h-6 text-slate-400" />
                  )}
                  <div className="text-xs text-slate-700 font-medium">
                    <span className="text-indigo-600 font-semibold">Click to upload</span> or drag and drop
                  </div>
                  <div className="text-[11px] text-slate-400">PDF or DOCX (max 5MB)</div>
                </label>
                <p className="text-[11px] text-slate-400 italic">
                  Note: Scanned or image-based PDFs will be processed via secure OCR.
                </p>
              </div>
            )}

            {/* Tab 2: Resume AI Upload */}
            {sourceTab === 'resume_ai' && (
              <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2 text-xs">
                <div className="flex items-center justify-between text-indigo-950 font-medium">
                  <span className="truncate">File: {uploadedResumeName || 'Uploaded Resume.pdf'}</span>
                  <span className="text-[10px] bg-indigo-200/60 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                    Resume AI
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadSource('resume_ai_file')}
                  disabled={loadingSource}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  {loadingSource ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Use stored resume file bytes</span>
                </button>
              </div>
            )}

            {/* Tab 3: Paste text */}
            {sourceTab === 'text' && (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste your resume sections, experience, and project bullets here..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleLoadSource('text')}
                  disabled={loadingSource || !pastedText.trim()}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  {loadingSource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Read pasted resume</span>
                </button>
              </div>
            )}

            {/* What we read summary (if resumeData loaded) */}
            {resumeData && sectionCounts && (
              <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>What we read</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedResume(JSON.parse(JSON.stringify(resumeData)));
                      setShowEditModal(true);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit parsed data</span>
                  </button>
                </div>

                {/* Source attribution badge */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700">
                    {sourceType === 'upload'
                      ? 'Extracted from uploaded document'
                      : sourceType === 'resume_ai_file'
                      ? 'Extracted from Resume AI file bytes'
                      : sourceType === 'profile'
                      ? 'Compiled from college profile'
                      : 'Extracted from pasted text'}
                  </span>
                </div>

                {/* Extracted contact fields & Not Found badges */}
                <div className="text-[11px] space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-900">Name:</span>{' '}
                      {resumeData.contact?.fullName || <span className="text-amber-600 italic">Not found</span>}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Email:</span>{' '}
                      {resumeData.contact?.email || <span className="text-amber-600 italic">Not found in your resume</span>}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Phone:</span>{' '}
                      {resumeData.contact?.phone || <span className="text-amber-600 italic">Not found in your resume</span>}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Location:</span>{' '}
                      {resumeData.contact?.location || <span className="text-slate-400 italic">Not found</span>}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">GitHub:</span>{' '}
                      {resumeData.contact?.github ? (
                        <span className="text-indigo-600 underline truncate max-w-[110px] inline-block align-bottom">{resumeData.contact.github}</span>
                      ) : (
                        <span className="text-slate-400 italic">Not found</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">LinkedIn:</span>{' '}
                      {resumeData.contact?.linkedin ? (
                        <span className="text-indigo-600 underline truncate max-w-[110px] inline-block align-bottom">{resumeData.contact.linkedin}</span>
                      ) : (
                        <span className="text-slate-400 italic">Not found</span>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-slate-600">
                    <div><span className="font-semibold text-slate-900">Skills:</span> {sectionCounts.skills} skills</div>
                    <div><span className="font-semibold text-slate-900">Experience:</span> {sectionCounts.experience} roles</div>
                    <div><span className="font-semibold text-slate-900">Projects:</span> {sectionCounts.projects} projects</div>
                    <div><span className="font-semibold text-slate-900">Education:</span> {sectionCounts.education} entries</div>
                  </div>
                </div>

                {/* Profile filled badges (only for profile source) */}
                {resumeData.filledFromProfile && sourceType === 'profile' && (
                  <div className="flex flex-wrap gap-1.5">
                    {resumeData.filledFromProfile.education && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium">
                        Education: (from your profile)
                      </span>
                    )}
                    {resumeData.filledFromProfile.phone && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium">
                        Phone: (from your profile)
                      </span>
                    )}
                  </div>
                )}

                {/* Warnings if any */}
                {sourceWarnings.length > 0 && (
                  <div className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span className="font-bold">Notice:</span> {sourceWarnings[0]}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* CARD 2: TARGET JOB                                                */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h2 className="text-sm font-bold text-slate-900">Target Job</h2>
              </div>

              {/* General Resume Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isGeneralMode}
                  onChange={(e) => {
                    setIsGeneralMode(e.target.checked);
                    if (e.target.checked) {
                      setTargetData({
                        type: 'general',
                        roleTitle: 'General Software Engineer',
                        company: '',
                        requiredSkills: [],
                        preferredSkills: [],
                        keywords: ['software engineering', 'problem solving', 'system design'],
                      });
                      setMissingSkills([]);
                    }
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span>General resume (no job)</span>
              </label>
            </div>

            {!isGeneralMode ? (
              <div className="space-y-3">
                {/* Target sub-tabs: Pasted JD vs Campus Drive */}
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTargetMode('jd')}
                    className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                      targetMode === 'jd' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Paste Job Description</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('drive')}
                    className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                      targetMode === 'drive' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Campus Drive</span>
                  </button>
                </div>

                {targetMode === 'jd' ? (
                  <div className="space-y-1">
                    <div className="relative">
                      <textarea
                        rows={5}
                        maxLength={6000}
                        value={customJdText}
                        onChange={(e) => setCustomJdText(e.target.value)}
                        placeholder="Paste the target job description or requirements..."
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <div className="text-[10px] text-slate-400 text-right pr-1">
                        {customJdText.length}/6000
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {loadingDrives ? (
                      <div className="py-4 text-center text-xs text-slate-400">Loading drives...</div>
                    ) : drives.length === 0 ? (
                      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 space-y-1">
                        <div className="font-bold text-slate-800">No eligible drives yet</div>
                        <div>There are currently no active placement drives for your batch.</div>
                      </div>
                    ) : (
                      <select
                        value={selectedDriveId}
                        onChange={(e) => setSelectedDriveId(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-slate-800"
                      >
                        {drives.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.role} — {d.company?.name || 'Recruiter'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/40 text-xs text-indigo-900 space-y-1">
                <div className="font-bold">General Mode Active</div>
                <div className="text-[11px] text-indigo-700">
                  Skills and achievements will be formatted into a clean, comprehensive engineering resume without tailoring to a specific posting.
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* OPTIONAL CHECKLIST: SKILLS IN THIS JOB THAT AREN'T IN YOUR RESUME */}
          {/* ================================================================= */}
          {missingSkills.length > 0 && !isGeneralMode && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Skills in this job that aren't in your resume</span>
                </div>
                <span className="text-[10px] text-slate-400 italic">Optional</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Unticked skills will never be added to your resume. Only claim skills you actually know.
              </p>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {missingSkills.slice(0, 8).map((sk) => (
                  <div
                    key={sk}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                  >
                    <span className="font-semibold text-slate-800 truncate">{sk}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleClaimSkill(sk)}
                        className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold transition-colors"
                        title="Add to resume marked as self-declared"
                      >
                        I have this skill
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToLearningPlan(sk)}
                        className="px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors"
                        title="Save to study queue without adding to resume"
                      >
                        Skills to learn
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {learningList.length > 0 && (
                <div className="pt-2 border-t border-slate-100 text-[11px] text-indigo-700 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>
                    Personal Learning Plan: {learningList.length} skill(s) queued. (Never injected into your resume)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* PRIMARY BUTTON: CREATE MY RESUME                                  */}
          {/* ================================================================= */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCreateResume}
              disabled={!canCreate || isCreating}
              className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                canCreate && !isCreating
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
              }`}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{creationStepMessage || 'Creating tailored resume...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create my resume</span>
                </>
              )}
            </button>
            {!canCreate && (
              <p className="text-[11px] text-slate-400 text-center">
                {!resumeData
                  ? 'Provide your resume (upload, paste, or profile) to continue'
                  : 'Specify a job description, select a campus drive, or choose General resume'}
              </p>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* RIGHT COLUMN: PREVIEW, RESULTS, VERSIONS (7 COLS)                   */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          {/* Top Control Bar: Template Switcher & Ready Status */}
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

            {/* Badges */}
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

          {/* Placeholder Alert Banner */}
          {unresolvedPlaceholderCount > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-900">
                <div className="font-bold">
                  Export Locked: {unresolvedPlaceholderCount} Metric Placeholder(s)
                </div>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Unverified metrics are held in{' '}
                  <code className="bg-amber-100/90 px-1 py-0.5 rounded text-amber-950 font-mono font-bold">
                    [add your real number]
                  </code>{' '}
                  tags to prevent automated AI hallucinations. <strong>PDF export is locked</strong> until you replace them with authentic metrics or remove them.
                </p>
              </div>
            </div>
          )}

          {/* Subtabs: Preview / Optimized Bullets / Cover Letter / Versions */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center justify-between gap-1 text-xs font-semibold">
            <button
              onClick={() => setActiveResultTab('preview')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeResultTab === 'preview' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Resume Preview</span>
            </button>
            <button
              onClick={() => setActiveResultTab('bullets')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeResultTab === 'bullets' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Optimized Bullets ({bulletRewrites.length})</span>
            </button>
            <button
              onClick={() => setActiveResultTab('cover_letter')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeResultTab === 'cover_letter' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Cover Letter</span>
            </button>
            <button
              onClick={() => setActiveResultTab('versions')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeResultTab === 'versions' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Versions ({versions.length}/5)</span>
            </button>
          </div>

          {/* TAB 1: RESUME PREVIEW */}
          {activeResultTab === 'preview' && (
            <div className="space-y-4">
              {!resumeData ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="text-xs font-semibold text-slate-500">No resume loaded yet</div>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Select an upload, paste text, or load your college profile on the left to see the live ATS single-column document.
                  </p>
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

                  {/* Skills */}
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

                  {/* Experience */}
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

                  {/* Projects */}
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

              {/* Link below preview to check ATS score in Resume AI */}
              <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-indigo-950">Want to test ATS parseability & score?</div>
                  <div className="text-[11px] text-indigo-700">
                    Resume AI provides full 7-factor rubric scoring against any JD.
                  </div>
                </div>
                <Link
                  to="/student/resume-ai"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                >
                  <span>Check your ATS score in Resume AI</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* TAB 2: OPTIMIZED BULLETS */}
          {activeResultTab === 'bullets' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 uppercase tracking-wider">
                <span>Action-Oriented Bullet Rewrites ({bulletRewrites.length})</span>
                {modelUsed && (
                  <span className="text-[10px] lowercase font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    model: {modelUsed}
                  </span>
                )}
              </div>
              {bulletRewrites.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Click "Create my resume" to generate tailored action verbs and impact rewrites.
                </div>
              ) : (
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                Kept Original
                              </span>
                              {Array.isArray(rw.reasonCodes) && rw.reasonCodes.length > 0 && (
                                rw.reasonCodes.map((code) => (
                                  <span key={code} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    {code}
                                  </span>
                                ))
                              )}
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
              )}
            </div>
          )}

          {/* TAB 3: COVER LETTER */}
          {activeResultTab === 'cover_letter' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
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
                    Generate a truthful 3-paragraph cover letter grounded strictly in your coursework and verified projects.
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

          {/* TAB 4: VERSIONS */}
          {activeResultTab === 'versions' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800">Saved Versions</div>
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={!resumeData}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
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
                          {new Date(v.createdAt).toLocaleDateString()}
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
      </div>

      {/* ===================================================================== */}
      {/* INLINE EDIT RESUME MODAL                                              */}
      {/* ===================================================================== */}
      {showEditModal && editedResume && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Extracted Resume Details</h3>
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
