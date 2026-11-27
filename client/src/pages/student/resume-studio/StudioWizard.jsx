import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  User,
  GraduationCap,
  Briefcase,
  FolderGit2,
  Sparkles,
  Award,
  Layout,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Upload,
  ClipboardPaste,
  Building2,
  Plus,
  Trash2,
  AlertCircle,
  Download,
  ExternalLink,
  Edit3,
  Loader2,
  Check,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getResume,
  createResume,
  updateResume,
  loadResumeSource,
  exportResumePdf,
} from './api';
import { TEMPLATES, getTemplateById } from './templateRegistry';
import StudioPreview from './components/StudioPreview';
import CategorizedSkillsEditor from './components/CategorizedSkillsEditor';
import LanguageInput from './components/LanguageInput';

export const WIZARD_STEPS = [
  { id: 'start', label: 'Start Source', icon: FileText, subtitle: 'Choose how to begin your resume' },
  { id: 'personal', label: 'Personal Info', icon: User, subtitle: 'Name and contact details' },
  { id: 'education', label: 'Education', icon: GraduationCap, subtitle: 'Academic degrees and institutions' },
  { id: 'experience', label: 'Experience', icon: Briefcase, subtitle: 'Internships and employment' },
  { id: 'projects', label: 'Projects', icon: FolderGit2, subtitle: 'Technical engineering projects' },
  { id: 'skills', label: 'Skills', icon: Sparkles, subtitle: 'Languages, frameworks, and tools' },
  { id: 'extras', label: 'Extras', icon: Award, subtitle: 'Certifications and achievements' },
  { id: 'template', label: 'Template', icon: Layout, subtitle: 'Select an ATS-friendly layout' },
  { id: 'review', label: 'Review & Finish', icon: CheckCircle2, subtitle: 'Inspect your completed resume' },
];

/**
 * Computes missing field prompts according to Phase 0 audit rules
 * Friendly prompts ONLY: Never fills them with invented or generated content.
 */
export function getMissingFieldPrompts(data = {}) {
  const prompts = [];
  const contact = data.contact || {};

  if (!contact.fullName || !contact.fullName.trim()) {
    prompts.push({
      key: 'fullName',
      field: 'Full Name',
      step: 'personal',
      message: 'Full name is missing. Recruiters need your identity for identification.',
    });
  }
  if (!contact.email || !contact.email.trim()) {
    prompts.push({
      key: 'email',
      field: 'Email Address',
      step: 'personal',
      message: 'Email address is missing. Add an active email for interview invitations.',
    });
  }
  if (!contact.phone || !contact.phone.trim()) {
    prompts.push({
      key: 'phone',
      field: 'Phone Number',
      step: 'personal',
      message: 'Phone number is missing. Contact details are essential for recruiter outreach.',
    });
  }
  if (!contact.location || !contact.location.trim()) {
    prompts.push({
      key: 'location',
      field: 'Location',
      step: 'personal',
      message: 'Location (City, State) is missing. Used by recruiters for time-zone and proximity matching.',
    });
  }
  if (!Array.isArray(data.education) || data.education.length === 0) {
    prompts.push({
      key: 'education',
      field: 'Education',
      step: 'education',
      message: 'Education history is missing. Add your degree, college, and expected graduation year.',
    });
  }
  if (
    !Array.isArray(data.skills) ||
    data.skills.length === 0 ||
    !data.skills.some((c) => Array.isArray(c.items) && c.items.length > 0)
  ) {
    prompts.push({
      key: 'skills',
      field: 'Technical Skills',
      step: 'skills',
      message: 'Technical skills are missing. Adding core skills helps pass automated ATS keyword filters.',
    });
  }
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    prompts.push({
      key: 'projects',
      field: 'Technical Projects',
      step: 'projects',
      message: 'Technical projects are missing. Practical engineering projects showcase your skills.',
    });
  }
  if (!Array.isArray(data.experience) || data.experience.length === 0) {
    prompts.push({
      key: 'experience',
      field: 'Experience',
      step: 'experience',
      message: 'Experience is empty. If you have internships, add them; freshers can safely skip this.',
      isOptional: true,
    });
  }

  return prompts;
}

const StudioWizard = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Wizard state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [resumeId, setResumeId] = useState(id || null);
  const [title, setTitle] = useState('My Resume Draft');
  const [templateId, setTemplateId] = useState('modern');
  const [resumeData, setResumeData] = useState({
    contact: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      portfolio: '',
    },
    summary: '',
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
    achievements: [],
    languages: [],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(id ? 'Saved' : 'Draft not saved');
  const [isExporting, setIsExporting] = useState(false);

  // Source selection state (Start step)
  const [startMode, setStartMode] = useState(null); // 'profile' | 'upload' | 'text' | 'blank'
  const [pasteText, setPasteText] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // Mount effect: Fetch existing resume IF ID is in URL
  // HARD RULE: Makes NO call to /source or /base on mount. Profile only loads on explicit click.
  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const fetchExisting = async () => {
      try {
        setIsLoading(true);
        const res = await getResume(id);
        if (isMounted && res.success && res.resume) {
          const doc = res.resume;
          setResumeId(doc._id);
          setTitle(doc.title || 'My Resume Draft');
          setTemplateId(doc.templateId || 'modern');
          if (doc.data) {
            setResumeData(doc.data);
          }
        }
      } catch (err) {
        toast.error('Failed to load existing resume');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchExisting();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const currentStep = WIZARD_STEPS[currentStepIndex];
  const missingPrompts = getMissingFieldPrompts(resumeData);

  // Auto-save draft helper
  const saveDraft = async (updatedData = resumeData, updatedTemplate = templateId, updatedTitle = title) => {
    try {
      setIsSaving(true);
      setSaveStatus('Saving...');
      let activeId = resumeId;

      if (!activeId) {
        // Create new draft
        const res = await createResume({
          title: updatedTitle,
          templateId: updatedTemplate,
          data: updatedData,
        });
        if (res.success && res.resume) {
          activeId = res.resume._id;
          setResumeId(activeId);
        }
      } else {
        // Update existing draft
        await updateResume(activeId, {
          title: updatedTitle,
          templateId: updatedTemplate,
          data: updatedData,
        });
      }

      setSaveStatus('Draft saved');
      setTimeout(() => setSaveStatus('Saved'), 1500);
      return activeId;
    } catch (err) {
      setSaveStatus('Save error');
      toast.error('Could not save draft progress');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Navigates to full editor, ensuring draft is persisted and real ID is acquired
  const handleOpenEditor = async () => {
    let targetId = resumeId;
    if (!targetId) {
      targetId = await saveDraft(resumeData, templateId, title);
    } else {
      await saveDraft(resumeData, templateId, title);
    }
    if (targetId) {
      navigate(`/student/resume-studio/${targetId}`);
    } else {
      toast.error('Could not save resume draft before opening editor');
    }
  };

  // Explicit Source Loading (ONLY triggers on user click)
  const handleLoadProfileSource = async () => {
    try {
      setSourceLoading(true);
      const res = await loadResumeSource({ type: 'profile' });
      if (res.success && res.resumeData) {
        const loadedData = res.resumeData;
        setResumeData(loadedData);
        toast.success('College profile loaded successfully');
        await saveDraft(loadedData);
        setCurrentStepIndex(1); // Advance to personal step
      } else {
        toast.error('Failed to load profile data');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error loading profile data');
    } finally {
      setSourceLoading(false);
    }
  };

  const handleLoadUploadSource = async () => {
    if (!uploadFile) {
      toast.error('Please select a PDF or DOCX file first');
      return;
    }
    try {
      setSourceLoading(true);
      const formData = new FormData();
      formData.append('type', 'upload');
      formData.append('file', uploadFile);

      const res = await loadResumeSource(formData);
      if (res.success && res.resumeData) {
        const loadedData = res.resumeData;
        setResumeData(loadedData);
        toast.success('Resume parsed successfully from file');
        await saveDraft(loadedData);
        setCurrentStepIndex(1);
      } else {
        toast.error('Could not extract content from file');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error parsing uploaded file');
    } finally {
      setSourceLoading(false);
    }
  };

  const handleLoadTextSource = async () => {
    if (!pasteText.trim()) {
      toast.error('Please paste your resume text');
      return;
    }
    try {
      setSourceLoading(true);
      const res = await loadResumeSource({ type: 'text', text: pasteText });
      if (res.success && res.resumeData) {
        const loadedData = res.resumeData;
        setResumeData(loadedData);
        toast.success('Resume text parsed successfully');
        await saveDraft(loadedData);
        setCurrentStepIndex(1);
      } else {
        toast.error('Could not extract structured data from text');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error parsing text');
    } finally {
      setSourceLoading(false);
    }
  };

  const handleStartBlank = async () => {
    await saveDraft(resumeData);
    setCurrentStepIndex(1);
  };

  // Step Navigation: Every step is skippable
  const handleNext = async () => {
    await saveDraft(resumeData);
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleSkip = async () => {
    await saveDraft(resumeData);
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleStepClick = async (targetIndex) => {
    await saveDraft(resumeData);
    setCurrentStepIndex(targetIndex);
  };

  const handleExportPdf = async () => {
    if (!resumeId) {
      const savedId = await saveDraft(resumeData);
      if (!savedId) return;
    }
    try {
      setIsExporting(true);
      toast.loading('Exporting ATS PDF...', { id: 'wizard-pdf' });
      await exportResumePdf(resumeId, title);
      toast.success('Resume PDF exported successfully', { id: 'wizard-pdf' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export PDF', { id: 'wizard-pdf' });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3" data-testid="wizard-loading">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-xs text-slate-500 font-medium">Loading Resume Wizard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="studio-wizard-container">
      {/* Top Header */}
      <header className="sticky top-16 z-20 bg-white border-b border-slate-200 px-4 py-3 sm:px-8 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/student/resume-studio')}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title="Return to Studio Dashboard"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => saveDraft(resumeData, templateId, title)}
                  placeholder="Resume Title"
                  className="text-base font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition px-1 py-0.5 truncate max-w-[200px] sm:max-w-sm"
                />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Resume Builder Step-by-Step Wizard</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Auto-save status */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 select-none" data-testid="wizard-save-status">
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span className="text-slate-600 font-medium">Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-500 font-medium">{saveStatus}</span>
                </>
              )}
            </div>

            <button
              onClick={handleOpenEditor}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
              data-testid="wizard-open-editor-header-button"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Open in Full Editor</span>
            </button>

            <button
              onClick={() => navigate('/student/resume-studio')}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Stepper Navigation Bar */}
        <div className="max-w-6xl mx-auto mt-3 pt-2 border-t border-slate-100 overflow-x-auto">
          <nav className="flex items-center gap-1 min-w-max pb-1" data-testid="wizard-stepper">
            {WIZARD_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStepIndex;
              const isPast = idx < currentStepIndex;
              return (
                <button
                  key={step.id}
                  onClick={() => handleStepClick(idx)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition select-none ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isPast
                      ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                  data-testid={`stepper-step-${step.id}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{step.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Wizard Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Step Header */}
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight" data-testid="step-heading">
            {currentStep.label}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">{currentStep.subtitle}</p>
        </div>

        {/* Missing Fields Friendly Prompt Banner (Phase 0 Audit) */}
        {currentStep.id !== 'start' && currentStep.id !== 'review' && (
          <div className="space-y-2">
            {missingPrompts
              .filter((p) => p.step === currentStep.id)
              .map((p) => (
                <div
                  key={p.key}
                  data-testid={`missing-field-prompt-${p.key}`}
                  className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">{p.field} is missing: </strong>
                    <span>{p.message}</span>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Dynamic Step Component */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-xs">
          {/* STEP 1: START */}
          {currentStep.id === 'start' && (
            <div className="space-y-6" data-testid="wizard-step-start">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option A: Blank */}
                <div
                  onClick={() => setStartMode('blank')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left space-y-2.5 ${
                    startMode === 'blank'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  data-testid="start-option-blank"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Start from scratch</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Begin with an empty form and build each section step-by-step.
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartBlank();
                    }}
                    className="mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
                    data-testid="start-blank-button"
                  >
                    Start Blank Resume
                  </button>
                </div>

                {/* Option B: College Profile */}
                <div
                  onClick={() => setStartMode('profile')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left space-y-2.5 ${
                    startMode === 'profile'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  data-testid="start-option-profile"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Use my college profile</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pre-fill your contact, verified academic grades, and student projects.
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadProfileSource();
                    }}
                    disabled={sourceLoading}
                    className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                    data-testid="start-profile-button"
                  >
                    {sourceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Use my college profile</span>
                  </button>
                </div>

                {/* Option C: Upload Resume */}
                <div
                  onClick={() => setStartMode('upload')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left space-y-2.5 ${
                    startMode === 'upload'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  data-testid="start-option-upload"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Use my uploaded resume</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload an existing PDF or DOCX file to extract and refine its content.
                    </p>
                  </div>
                  <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={(e) => setUploadFile(e.target.files[0] || null)}
                      className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                    />
                    <button
                      onClick={handleLoadUploadSource}
                      disabled={sourceLoading || !uploadFile}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                      data-testid="start-upload-button"
                    >
                      {sourceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Upload & Parse Resume</span>
                    </button>
                  </div>
                </div>

                {/* Option D: Paste Text */}
                <div
                  onClick={() => setStartMode('text')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left space-y-2.5 ${
                    startMode === 'text'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  data-testid="start-option-text"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                    <ClipboardPaste className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Paste text</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Paste raw resume text directly from Word, LinkedIn, or text file.
                    </p>
                  </div>
                  <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      rows={3}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste your resume text here..."
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                    />
                    <button
                      onClick={handleLoadTextSource}
                      disabled={sourceLoading || !pasteText.trim()}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                      data-testid="start-text-button"
                    >
                      {sourceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Parse and Load Text</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PERSONAL INFO */}
          {currentStep.id === 'personal' && (
            <div className="space-y-4" data-testid="wizard-step-personal">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={resumeData.contact?.fullName || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), fullName: e.target.value },
                      })
                    }
                    placeholder="e.g. Renée José-Nuñez"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    data-testid="input-fullName"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={resumeData.contact?.email || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), email: e.target.value },
                      })
                    }
                    placeholder="e.g. renee.jose@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={resumeData.contact?.phone || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), phone: e.target.value },
                      })
                    }
                    placeholder="e.g. +91 9876543210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    data-testid="input-phone"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Location *</label>
                  <input
                    type="text"
                    value={resumeData.contact?.location || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), location: e.target.value },
                      })
                    }
                    placeholder="e.g. Mumbai, Maharashtra"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    data-testid="input-location"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">LinkedIn Profile</label>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Display:</span>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="linkedinDisplay-wizard"
                          value="short"
                          checked={resumeData.contact?.linkedinDisplay !== 'full'}
                          onChange={() =>
                            setResumeData({
                              ...resumeData,
                              contact: { ...(resumeData.contact || {}), linkedinDisplay: 'short' },
                            })
                          }
                          className="text-indigo-600 focus:ring-0 text-[10px]"
                        />
                        <span>Short (LinkedIn)</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="linkedinDisplay-wizard"
                          value="full"
                          checked={resumeData.contact?.linkedinDisplay === 'full'}
                          onChange={() =>
                            setResumeData({
                              ...resumeData,
                              contact: { ...(resumeData.contact || {}), linkedinDisplay: 'full' },
                            })
                          }
                          className="text-indigo-600 focus:ring-0 text-[10px]"
                        />
                        <span>Full URL</span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={resumeData.contact?.linkedin || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), linkedin: e.target.value },
                      })
                    }
                    placeholder="https://linkedin.com/in/username"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">GitHub / Code Repository</label>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Display:</span>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="githubDisplay-wizard"
                          value="short"
                          checked={resumeData.contact?.githubDisplay !== 'full'}
                          onChange={() =>
                            setResumeData({
                              ...resumeData,
                              contact: { ...(resumeData.contact || {}), githubDisplay: 'short' },
                            })
                          }
                          className="text-indigo-600 focus:ring-0 text-[10px]"
                        />
                        <span>Short (GitHub)</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="githubDisplay-wizard"
                          value="full"
                          checked={resumeData.contact?.githubDisplay === 'full'}
                          onChange={() =>
                            setResumeData({
                              ...resumeData,
                              contact: { ...(resumeData.contact || {}), githubDisplay: 'full' },
                            })
                          }
                          className="text-indigo-600 focus:ring-0 text-[10px]"
                        />
                        <span>Full URL</span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={resumeData.contact?.github || ''}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        contact: { ...(resumeData.contact || {}), github: e.target.value },
                      })
                    }
                    placeholder="https://github.com/username"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Professional Summary</label>
                <textarea
                  rows={3}
                  value={resumeData.summary || ''}
                  onChange={(e) => setResumeData({ ...resumeData, summary: e.target.value })}
                  placeholder="Concise 2-3 sentence overview of your technical background, core skills, and engineering focus..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* STEP 3: EDUCATION */}
          {currentStep.id === 'education' && (
            <div className="space-y-4" data-testid="wizard-step-education">
              {(resumeData.education || []).map((edu, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Education #{idx + 1}</span>
                    <button
                      onClick={() => {
                        const next = [...(resumeData.education || [])];
                        next.splice(idx, 1);
                        setResumeData({ ...resumeData, education: next });
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Degree</label>
                      <input
                        type="text"
                        value={edu.degree || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.education || [])];
                          next[idx] = { ...next[idx], degree: e.target.value };
                          setResumeData({ ...resumeData, education: next });
                        }}
                        placeholder="e.g. B.Tech"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Field of Study</label>
                      <input
                        type="text"
                        value={edu.field || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.education || [])];
                          next[idx] = { ...next[idx], field: e.target.value };
                          setResumeData({ ...resumeData, education: next });
                        }}
                        placeholder="e.g. Computer Science and Engineering"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Institution</label>
                      <input
                        type="text"
                        value={edu.institution || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.education || [])];
                          next[idx] = { ...next[idx], institution: e.target.value };
                          setResumeData({ ...resumeData, education: next });
                        }}
                        placeholder="e.g. IIT Bombay"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Year</label>
                        <input
                          type="text"
                          value={edu.year || ''}
                          onChange={(e) => {
                            const next = [...(resumeData.education || [])];
                            next[idx] = { ...next[idx], year: e.target.value };
                            setResumeData({ ...resumeData, education: next });
                          }}
                          placeholder="e.g. 2024"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Score / CGPA</label>
                        <input
                          type="text"
                          value={edu.score || ''}
                          onChange={(e) => {
                            const next = [...(resumeData.education || [])];
                            next[idx] = { ...next[idx], score: e.target.value };
                            setResumeData({ ...resumeData, education: next });
                          }}
                          placeholder="e.g. 8.9 / 10"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  const next = [
                    ...(resumeData.education || []),
                    { degree: '', field: '', institution: '', year: '', score: '' },
                  ];
                  setResumeData({ ...resumeData, education: next });
                }}
                className="w-full py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                data-testid="add-education-button"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Education Entry</span>
              </button>
            </div>
          )}

          {/* STEP 4: EXPERIENCE */}
          {currentStep.id === 'experience' && (
            <div className="space-y-4" data-testid="wizard-step-experience">
              {(resumeData.experience || []).map((exp, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Experience #{idx + 1}</span>
                    <button
                      onClick={() => {
                        const next = [...(resumeData.experience || [])];
                        next.splice(idx, 1);
                        setResumeData({ ...resumeData, experience: next });
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role / Job Title</label>
                      <input
                        type="text"
                        value={exp.title || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.experience || [])];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setResumeData({ ...resumeData, experience: next });
                        }}
                        placeholder="e.g. Software Engineer Intern"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Company</label>
                      <input
                        type="text"
                        value={exp.company || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.experience || [])];
                          next[idx] = { ...next[idx], company: e.target.value };
                          setResumeData({ ...resumeData, experience: next });
                        }}
                        placeholder="e.g. Google India"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Location</label>
                      <input
                        type="text"
                        value={exp.location || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.experience || [])];
                          next[idx] = { ...next[idx], location: e.target.value };
                          setResumeData({ ...resumeData, experience: next });
                        }}
                        placeholder="e.g. Bengaluru, Karnataka"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Duration</label>
                      <input
                        type="text"
                        value={exp.duration || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.experience || [])];
                          next[idx] = { ...next[idx], duration: e.target.value };
                          setResumeData({ ...resumeData, experience: next });
                        }}
                        placeholder="e.g. May 2023 - Aug 2023"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Achievement Bullets (one per line)
                    </label>
                    <textarea
                      rows={3}
                      value={(exp.bullets || []).join('\n')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const next = [...(resumeData.experience || [])];
                        next[idx] = { ...next[idx], bullets: lines };
                        setResumeData({ ...resumeData, experience: next });
                      }}
                      placeholder="• Built a caching layer using Redis reducing query latency by 35%&#10;• Collaborated with backend team to ship 4 REST microservices"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  const next = [
                    ...(resumeData.experience || []),
                    { title: '', company: '', location: '', duration: '', bullets: [''] },
                  ];
                  setResumeData({ ...resumeData, experience: next });
                }}
                className="w-full py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                data-testid="add-experience-button"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Experience Entry</span>
              </button>
            </div>
          )}

          {/* STEP 5: PROJECTS */}
          {currentStep.id === 'projects' && (
            <div className="space-y-4" data-testid="wizard-step-projects">
              {(resumeData.projects || []).map((proj, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Project #{idx + 1}</span>
                    <button
                      onClick={() => {
                        const next = [...(resumeData.projects || [])];
                        next.splice(idx, 1);
                        setResumeData({ ...resumeData, projects: next });
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Project Title</label>
                      <input
                        type="text"
                        value={proj.title || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.projects || [])];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setResumeData({ ...resumeData, projects: next });
                        }}
                        placeholder="e.g. Distributed Rate Limiter"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Technologies Used</label>
                      <input
                        type="text"
                        value={Array.isArray(proj.technologies) ? proj.technologies.join(', ') : ''}
                        onChange={(e) => {
                          const techs = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                          const next = [...(resumeData.projects || [])];
                          next[idx] = { ...next[idx], technologies: techs };
                          setResumeData({ ...resumeData, projects: next });
                        }}
                        placeholder="e.g. Go, Redis, Docker"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Project Link / Repo</label>
                      <input
                        type="text"
                        value={proj.link || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.projects || [])];
                          next[idx] = { ...next[idx], link: e.target.value };
                          setResumeData({ ...resumeData, projects: next });
                        }}
                        placeholder="https://github.com/user/project"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Duration / Year</label>
                      <input
                        type="text"
                        value={proj.duration || ''}
                        onChange={(e) => {
                          const next = [...(resumeData.projects || [])];
                          next[idx] = { ...next[idx], duration: e.target.value };
                          setResumeData({ ...resumeData, projects: next });
                        }}
                        placeholder="e.g. Fall 2023"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Key Highlights / Bullets (one per line)
                    </label>
                    <textarea
                      rows={3}
                      value={(proj.bullets || []).join('\n')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const next = [...(resumeData.projects || [])];
                        next[idx] = { ...next[idx], bullets: lines };
                        setResumeData({ ...resumeData, projects: next });
                      }}
                      placeholder="• Implemented sliding window counter algorithm handling 85k req/sec"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  const next = [
                    ...(resumeData.projects || []),
                    { title: '', technologies: [], link: '', duration: '', bullets: [''] },
                  ];
                  setResumeData({ ...resumeData, projects: next });
                }}
                className="w-full py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                data-testid="add-project-button"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Project Entry</span>
              </button>
            </div>
          )}

          {/* STEP 6: SKILLS */}
          {currentStep.id === 'skills' && (
            <div className="space-y-4" data-testid="wizard-step-skills">
              <CategorizedSkillsEditor
                skills={resumeData.skills || []}
                onChange={(newSkills) => setResumeData({ ...resumeData, skills: newSkills })}
              />
            </div>
          )}

          {/* STEP 7: EXTRAS */}
          {currentStep.id === 'extras' && (
            <div className="space-y-4" data-testid="wizard-step-extras">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Certifications (one per line)
                </label>
                <textarea
                  rows={3}
                  value={(resumeData.certifications || []).join('\n')}
                  onChange={(e) =>
                    setResumeData({
                      ...resumeData,
                      certifications: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                  placeholder="AWS Certified Solutions Architect&#10;Google Professional Cloud Developer"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Achievements & Awards (one per line)
                </label>
                <textarea
                  rows={3}
                  value={(resumeData.achievements || []).join('\n')}
                  onChange={(e) =>
                    setResumeData({
                      ...resumeData,
                      achievements: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                  placeholder="1st Place - Smart India Hackathon 2023&#10;Dean's Honor Roll 2022"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <LanguageInput
                languages={resumeData.languages || []}
                onChange={(newLanguages) =>
                  setResumeData({
                    ...resumeData,
                    languages: newLanguages,
                  })
                }
              />
            </div>
          )}

          {/* STEP 8: TEMPLATE */}
          {currentStep.id === 'template' && (
            <div className="space-y-4" data-testid="wizard-step-template">
              <p className="text-xs text-slate-600 mb-2">
                Choose an ATS-compliant single-column template. All templates follow strict linear order with zero tables or image text.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEMPLATES.map((tmpl) => {
                  const isSelected = templateId === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => setTemplateId(tmpl.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition text-left space-y-2 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                      data-testid={`template-card-${tmpl.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-sm">{tmpl.name}</h4>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-normal">{tmpl.description}</p>
                      <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                        <span
                          className="w-3 h-3 rounded-full border border-slate-300"
                          style={{ backgroundColor: tmpl.accentColor }}
                        />
                        <span className="capitalize">{tmpl.fontCategory} font</span>
                        <span>•</span>
                        <span>{tmpl.drawSectionLine ? 'Dividing rules' : 'No rules (Monochrome)'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 9: REVIEW */}
          {currentStep.id === 'review' && (
            <div className="space-y-6" data-testid="wizard-step-review">
              {/* Completeness Checklist */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Resume Completeness Audit
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Personal */}
                  <div className="flex items-center gap-2">
                    {resumeData.contact?.fullName && resumeData.contact?.email ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Personal Contact Info</span>
                  </div>
                  {/* Education */}
                  <div className="flex items-center gap-2">
                    {Array.isArray(resumeData.education) && resumeData.education.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Education Details</span>
                  </div>
                  {/* Projects */}
                  <div className="flex items-center gap-2">
                    {Array.isArray(resumeData.projects) && resumeData.projects.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Technical Projects</span>
                  </div>
                  {/* Skills */}
                  <div className="flex items-center gap-2">
                    {Array.isArray(resumeData.skills) && resumeData.skills.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Technical Skills</span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs disabled:opacity-60"
                  data-testid="wizard-export-pdf-button"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Export ATS PDF</span>
                </button>

                <button
                  onClick={handleOpenEditor}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                  data-testid="wizard-open-editor-button"
                >
                  <Edit3 className="w-4 h-4 text-slate-600" />
                  <span>Open in Studio Editor</span>
                </button>
              </div>

              {/* Live A4 Preview */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">Live Resume Preview</h4>
                <StudioPreview
                  resumeData={resumeData}
                  templateId={templateId}
                  sectionVisibility={{}}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Wizard Controls (Back / Skip / Continue) */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200">
          <div>
            {currentStepIndex > 0 ? (
              <button
                onClick={handleBack}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                data-testid="wizard-back-button"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {currentStepIndex > 0 && currentStepIndex < WIZARD_STEPS.length - 1 && (
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium transition"
                data-testid="wizard-skip-button"
              >
                Skip this step
              </button>
            )}

            {currentStepIndex < WIZARD_STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
                data-testid="wizard-next-button"
              >
                <span>Save & Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/student/resume-studio')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
                data-testid="wizard-finish-button"
              >
                <Check className="w-4 h-4" />
                <span>Finish & Go to Studio</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudioWizard;
