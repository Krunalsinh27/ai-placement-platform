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

  // 1. Fetch Resume Profile & Usage
  const fetchResumeProfile = async () => {
    try {
      const res = await api.get('/students/me/resume-profile');
      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        setSkills(res.data.resumeProfile?.skills || []);
        setHasResume(Boolean(res.data.hasResume || student?.resumeUrl));
        setResumeFilename(res.data.resumeFilename);
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
