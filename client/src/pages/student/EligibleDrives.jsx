import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Building2,
  MapPin,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  Search,
  ExternalLink,
  AlertCircle,
  Briefcase,
  Sparkles,
  Lightbulb,
  Zap,
  BookOpen,
  X,
  ArrowUpDown,
  BookMarked,
  Check,
  Eye,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import StudioPreview from './resume-studio/components/StudioPreview';

const EligibleDrives = () => {
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);
  const [appliedDriveIds, setAppliedDriveIds] = useState(new Set());
  const [applyingId, setApplyingId] = useState(null);
  const [search, setSearch] = useState('');
  const [studentCriteria, setStudentCriteria] = useState(null);
  const [sortBy, setSortBy] = useState('recommended'); // 'recommended' | 'deadline' | 'package'

  // Apply Modal & Resume Picker state (Phase 10)
  const [applyModalDrive, setApplyModalDrive] = useState(null);
  const [studentResumes, setStudentResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [resumesLoading, setResumesLoading] = useState(false);
  const [showResumePreview, setShowResumePreview] = useState(false);

  // Skill Gap Modal state
  const [showSkillGapModal, setShowSkillGapModal] = useState(false);
  const [skillGapLoading, setSkillGapLoading] = useState(false);
  const [skillGapPlan, setSkillGapPlan] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [drivesRes, appsRes] = await Promise.all([
        api.get('/drives/eligible', { params: { sort: sortBy } }),
        api.get('/applications/my'),
      ]);

      if (drivesRes.data.success) {
        setDrives(drivesRes.data.drives || []);
        if (drivesRes.data.studentCriteria) {
          setStudentCriteria(drivesRes.data.studentCriteria);
        }
      }

      if (appsRes.data.success) {
        const idSet = new Set(
          appsRes.data.applications.map((app) =>
            typeof app.drive === 'object' ? app.drive?._id : app.drive
          )
        );
        setAppliedDriveIds(idSet);
      }
    } catch (err) {
      console.error('Failed to load eligible drives:', err);
      toast.error('Unable to fetch eligible drives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sortBy]);

  const handleOpenApplyModal = async (drive) => {
    setApplyModalDrive(drive);
    setShowResumePreview(false);
    setResumesLoading(true);
    try {
      const res = await api.get('/resume-studio/resumes');
      if (res.data?.success && Array.isArray(res.data.resumes)) {
        const list = res.data.resumes;
        setStudentResumes(list);
        const primary = list.find((r) => r.isPrimary) || list[0];
        if (primary) {
          setSelectedResumeId(primary._id);
        } else {
          setSelectedResumeId('');
        }
      }
    } catch (err) {
      // Resume studio may be empty or error; fallback gracefully
      setStudentResumes([]);
      setSelectedResumeId('');
    } finally {
      setResumesLoading(false);
    }
  };

  const handleApply = async (driveId, resumeId = null) => {
    setApplyingId(driveId);
    try {
      const payload = { driveId };
      if (resumeId) {
        payload.resumeId = resumeId;
      }
      const res = await api.post('/applications', payload);
      if (res.data.success) {
        toast.success('Application submitted successfully!');
        setAppliedDriveIds((prev) => new Set([...prev, driveId]));
        setApplyModalDrive(null);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit application';
      toast.error(msg);
    } finally {
      setApplyingId(null);
    }
  };

  const handleOpenSkillGapPlan = async () => {
    setShowSkillGapModal(true);
    if (skillGapPlan) return; // already loaded

    setSkillGapLoading(true);
    try {
      const res = await api.get('/students/me/skill-gap-plan');
      if (res.data.success) {
        setSkillGapPlan(res.data.plan);
      }
    } catch (err) {
      console.error('Failed to load skill-gap plan:', err);
      toast.error('Could not generate skill-gap plan. Please try again.');
    } finally {
      setSkillGapLoading(false);
    }
  };

  const filteredDrives = drives.filter((d) => {
    const term = search.toLowerCase();
    const compName = d.company?.name?.toLowerCase() || '';
    const role = d.role?.toLowerCase() || '';
    const location = d.location?.toLowerCase() || '';
    return compName.includes(term) || role.includes(term) || location.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Eligible Placement Drives</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Smart Ranked
            </span>
          </h1>
          <p className="text-sm text-slate-500">
            Drives matching your academic qualifications, branch, and current backlog status.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Skill Gap Learning Plan Button */}
          <button
            type="button"
            onClick={handleOpenSkillGapPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            <span>Skill-Gap Learning Plan</span>
          </button>

          {/* Sort Selector */}
          <div className="relative inline-flex items-center">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs font-medium pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer text-slate-700"
            >
              <option value="recommended">🌟 Recommended (Best Match)</option>
              <option value="deadline">⏰ Application Deadline</option>
              <option value="package">💰 Highest CTC (LPA)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or role..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            />
          </div>
        </div>
      </div>

      {/* Criteria Info Banner */}
      {studentCriteria && (
        <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-indigo-900 font-medium">
            <Award className="w-4 h-4 text-indigo-600" />
            <span>
              Your Profile Filter: <strong>Branch:</strong> {studentCriteria.branch} •{' '}
              <strong>CGPA:</strong> {studentCriteria.cgpa} •{' '}
              <strong>Backlogs:</strong> {studentCriteria.backlogs}
            </span>
          </div>
          <span className="text-indigo-600 font-semibold">
            {filteredDrives.length} active matching opportunity(ies)
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredDrives.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Eligible Drives Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'No drives match your search query.'
              : 'There are currently no active drives matching your eligibility criteria or deadlines have passed.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDrives.map((drive) => {
            const hasApplied = appliedDriveIds.has(drive._id);
            const isApplying = applyingId === drive._id;
            const daysRemaining = Math.ceil(
              (new Date(drive.lastDateToApply) - new Date()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={drive._id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="space-y-3">
                  {/* Company Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold flex items-center justify-center text-sm shrink-0">
                        {drive.company?.name?.charAt(0) || 'C'}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 leading-snug">
                          {drive.company?.name}
                        </h3>
                        <p className="text-[11px] text-slate-500">{drive.company?.industry}</p>
                      </div>
                    </div>
                    {drive.company?.website && (
                      <a
                        href={drive.company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-slate-600 p-1"
                        title="Visit company website"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Role & Package */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">{drive.role}</h4>
                      <div className="flex items-baseline gap-1 mt-0.5 text-emerald-600 font-extrabold text-base">
                        <span>{drive.packageLpa} LPA</span>
                        <span className="text-[11px] font-normal text-slate-400">CTC</span>
                      </div>
                    </div>
                    {drive.match?.score !== null && drive.match?.score !== undefined && (
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                          drive.match.score >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : drive.match.score >= 60
                            ? 'bg-indigo-100 text-indigo-800'
                            : drive.match.score >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {drive.match.score}% Match
                      </span>
                    )}
                  </div>

                  {/* Explainable Why Recommended Card */}
                  {(drive.whyRecommended || drive.match?.whyRecommended) && (
                    <div className="p-3 bg-amber-50/60 border border-amber-200/50 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1 font-bold text-amber-900">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Why Recommended</span>
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed">
                        {drive.whyRecommended || drive.match?.whyRecommended}
                      </p>
                    </div>
                  )}

                  {/* Skills Breakdown */}
                  {drive.match && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1.5 text-xs">
                      {drive.match.missingSkills && drive.match.missingSkills.length > 0 ? (
                        <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1">
                          <span className="font-semibold text-rose-600">Missing Skills:</span>
                          {drive.match.missingSkills.slice(0, 4).map((sk) => (
                            <span
                              key={sk}
                              className="px-1.5 py-0.5 rounded bg-white text-rose-700 border border-rose-200 text-[10px] font-medium"
                            >
                              {sk}
                            </span>
                          ))}
                          <button
                            type="button"
                            onClick={handleOpenSkillGapPlan}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 ml-1 underline cursor-pointer"
                          >
                            Bridge gap →
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>All core technical requirements matched!</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Criteria & Details */}
                  <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{drive.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Deadline:{' '}
                        <strong className="text-slate-700">
                          {new Date(drive.lastDateToApply).toLocaleDateString()}
                        </strong>{' '}
                        ({daysRemaining > 0 ? `${daysRemaining}d left` : 'Today'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Award className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Min CGPA: <strong>{drive.minCgpa}</strong> • Max Backlogs:{' '}
                        <strong>{drive.maxBacklogs}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Allowed Branches Tags */}
                  <div className="pt-2 flex flex-wrap gap-1">
                    {drive.allowedBranches?.map((b) => (
                      <span
                        key={b}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-[10px]"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Apply Button */}
                <div className="pt-4 mt-3 border-t border-slate-100">
                  {hasApplied ? (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Applied</span>
                    </button>
                  ) : drive.applicationsClosed ? (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed"
                    >
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>Applications closed</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenApplyModal(drive)}
                      disabled={isApplying}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
                    >
                      {isApplying ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>Apply Now</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skill-Gap Learning Plan Modal */}
      {showSkillGapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-300">
                  <Zap className="w-5 h-5 fill-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Personalized Skill-Gap Learning Plan
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Targeted roadmap to master missing skills across your top eligible placement drives
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSkillGapModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {skillGapLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-medium text-slate-500">
                    Analyzing missing competencies across open placement drives...
                  </p>
                </div>
              ) : skillGapPlan ? (
                <div className="space-y-6">
                  {/* Overview Banner */}
                  <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-2">
                    <p className="text-xs text-indigo-950 leading-relaxed font-medium">
                      {skillGapPlan.overview}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-indigo-100/70 text-[11px]">
                      <span className="font-semibold text-indigo-900">
                        Total Study Time: {skillGapPlan.totalEstimatedHours} hours
                      </span>
                      <span className="text-indigo-400">•</span>
                      <span className="font-semibold text-indigo-900">
                        Focus Areas:{' '}
                        {skillGapPlan.targetSkills?.map((s) => s.toUpperCase()).join(', ')}
                      </span>
                    </div>
                  </div>

                  {/* Weekly Roadmap Cards */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <BookMarked className="w-3.5 h-3.5 text-indigo-500" />
                      Weekly Study & Practice Roadmap
                    </h4>

                    {skillGapPlan.weeks?.map((week) => (
                      <div
                        key={week.week}
                        className="bg-white border border-slate-200 rounded-2xl p-4.5 space-y-3 shadow-2xs hover:border-indigo-200 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs">
                              Week {week.week}
                            </span>
                            <h5 className="font-bold text-sm text-slate-900 capitalize">
                              {week.skill}
                            </h5>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            ~{week.estimatedHours} hrs
                          </span>
                        </div>

                        {/* Why needed */}
                        <p className="text-xs text-slate-600 leading-relaxed">{week.why}</p>

                        {/* Practice Task */}
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                            Hands-on Practice Task
                          </span>
                          <p className="text-xs text-slate-800 leading-relaxed">
                            {week.practiceTask}
                          </p>
                        </div>

                        {/* Resource Link & Resource Type */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-[11px] font-medium text-slate-500">
                            Resource: <strong className="text-slate-700">{week.resourceType}</strong>
                          </span>
                          {week.resourceLink && (
                            <a
                              href={week.resourceLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors"
                            >
                              <span>Official Guide</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No learning plan available at this time.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Roadmap automatically adapts as you apply and acquire new competencies.
              </span>
              <button
                type="button"
                onClick={() => setShowSkillGapModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Close Roadmap
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Resume Picker & Apply Modal (Phase 10) */}
      {applyModalDrive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Apply to {applyModalDrive.company?.name || 'Drive'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Role: <strong className="text-slate-700">{applyModalDrive.role}</strong> • Package:{' '}
                    <strong className="text-emerald-600">₹{applyModalDrive.packageLpa} LPA</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApplyModalDrive(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Select Resume for this Application
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  A snapshot of the selected resume will be attached to your application and preserved permanently.
                </p>

                {resumesLoading ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading your resumes...
                  </div>
                ) : studentResumes.length > 0 ? (
                  <div className="space-y-2.5">
                    {studentResumes.map((r) => {
                      const isSelected = selectedResumeId === r._id;
                      return (
                        <div
                          key={r._id}
                          onClick={() => setSelectedResumeId(r._id)}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600/30'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">{r.title}</span>
                                {r.isPrimary && (
                                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 capitalize">
                                Template: {r.templateId} • Updated {new Date(r.updatedAt || Date.now()).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <p className="font-semibold">No Resume Builder variants found.</p>
                    <p className="mt-0.5 text-amber-800">
                      Your application will proceed using your registered college profile and default resume.
                    </p>
                  </div>
                )}
              </div>

              {/* Resume Preview Toggle */}
              {selectedResumeId && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResumePreview(!showResumePreview)}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showResumePreview ? 'Hide Preview' : 'Preview Selected Resume'}</span>
                  </button>

                  {showResumePreview && (
                    <div className="mt-3 p-4 bg-slate-100 rounded-xl max-h-[350px] overflow-y-auto">
                      {(() => {
                        const curResume = studentResumes.find((r) => r._id === selectedResumeId);
                        if (!curResume) return null;
                        return (
                          <StudioPreview
                            resumeData={curResume.data || {}}
                            templateId={curResume.templateId || 'modern'}
                            sectionVisibility={{}}
                          />
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApplyModalDrive(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApply(applyModalDrive._id, selectedResumeId)}
                disabled={applyingId === applyModalDrive._id}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs disabled:opacity-60"
              >
                {applyingId === applyModalDrive._id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Submit Application</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EligibleDrives;
