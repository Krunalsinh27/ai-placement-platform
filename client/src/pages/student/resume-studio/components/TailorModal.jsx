import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Target,
  FileText,
  Briefcase,
  CheckCircle2,
  XCircle,
  Loader2,
  Check,
  RotateCcw,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import { tailorResume, applyTailorResume } from '../api';
import StudioPreview from './StudioPreview';

const TailorModal = ({
  resumeId,
  resumeData,
  templateId,
  sectionOrder,
  sectionVisibility,
  onClose,
  onApplied,
}) => {
  // Step: 'configure' | 'review'
  const [step, setStep] = useState('configure');
  const [targetMode, setTargetMode] = useState('drive'); // 'drive' | 'paste'

  // Drives state
  const [drives, setDrives] = useState([]);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [selectedDriveId, setSelectedDriveId] = useState('');

  // Paste JD state
  const [customJdText, setCustomJdText] = useState('');

  // Tailor proposal state
  const [isGenerating, setIsGenerating] = useState(false);
  const [tailorResult, setTailorResult] = useState(null);
  const [acceptedProposalIds, setAcceptedProposalIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'preview'
  const [versionName, setVersionName] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  // Fetch student drives on mount
  useEffect(() => {
    let isMounted = true;
    const fetchDrives = async () => {
      try {
        setLoadingDrives(true);
        const res = await api.get('/drives/eligible');
        if (isMounted) {
          const list = res.data?.drives || res.data?.data || [];
          setDrives(list);
          if (list.length > 0 && !selectedDriveId) {
            setSelectedDriveId(list[0]._id);
          }
        }
      } catch {
        // Fallback to /drives
        try {
          const fallback = await api.get('/drives?limit=50');
          if (isMounted) {
            const list = fallback.data?.drives || fallback.data?.data || [];
            setDrives(list);
            if (list.length > 0 && !selectedDriveId) {
              setSelectedDriveId(list[0]._id);
            }
          }
        } catch (_) {}
      } finally {
        if (isMounted) setLoadingDrives(false);
      }
    };
    fetchDrives();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Generate Proposals
  const handleGenerateProposals = async () => {
    if (targetMode === 'drive' && !selectedDriveId) {
      toast.error('Please select a campus drive');
      return;
    }
    if (targetMode === 'paste' && (!customJdText || customJdText.trim().length < 10)) {
      toast.error('Please paste a job description (at least 10 characters)');
      return;
    }

    try {
      setIsGenerating(true);
      const payload = {
        driveId: targetMode === 'drive' ? selectedDriveId : undefined,
        jobDescription: targetMode === 'paste' ? customJdText.trim() : undefined,
      };

      const res = await tailorResume(resumeId, payload);
      if (res && res.success) {
        setTailorResult(res);
        // By default accept all proposals
        const allIds = new Set((res.proposals || []).map((p) => p.id));
        setAcceptedProposalIds(allIds);
        setVersionName(`Tailored: ${res.targetRole || 'Software Engineer'}`);
        setStep('review');
        toast.success(`Generated ${res.proposals?.length || 0} tailored change proposal(s)!`);
      } else {
        toast.error(res?.message || 'Failed to tailor resume');
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || 'Tailoring failed';
      if (status === 429) {
        toast.error(`AI Quota Exceeded: ${msg}`, { duration: 6000 });
      } else {
        toast.error(`Tailoring Error: ${msg}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle single proposal acceptance
  const toggleProposal = (id) => {
    setAcceptedProposalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Accept All / Reject All
  const handleAcceptAll = () => {
    if (!tailorResult?.proposals) return;
    setAcceptedProposalIds(new Set(tailorResult.proposals.map((p) => p.id)));
  };

  const handleRejectAll = () => {
    setAcceptedProposalIds(new Set());
  };

  // Build projected resume data with currently accepted proposals
  const getProjectedResumeData = () => {
    if (!tailorResult?.proposals) return resumeData;
    const projected = JSON.parse(JSON.stringify(resumeData || {}));

    for (const prop of tailorResult.proposals) {
      if (!acceptedProposalIds.has(prop.id)) continue;

      if (prop.section === 'summary') {
        projected.summary = prop.proposed;
      } else if (prop.section === 'skills') {
        projected.skills = prop.proposed;
      } else if (prop.section === 'experience' && prop.target) {
        const { itemIndex, bulletIndex } = prop.target;
        if (projected.experience?.[itemIndex]?.bullets?.[bulletIndex] !== undefined) {
          projected.experience[itemIndex].bullets[bulletIndex] = prop.proposed;
        }
      } else if (prop.section === 'projects') {
        if (prop.id === 'projects-reorder') {
          const titles = prop.proposed || [];
          const curProjects = [...(projected.projects || [])];
          curProjects.sort((a, b) => {
            const aIdx = titles.indexOf(a.title);
            const bIdx = titles.indexOf(b.title);
            return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
          });
          projected.projects = curProjects;
        } else if (prop.target) {
          const { itemIndex, bulletIndex } = prop.target;
          if (projected.projects?.[itemIndex]?.bullets?.[bulletIndex] !== undefined) {
            projected.projects[itemIndex].bullets[bulletIndex] = prop.proposed;
          }
        }
      }
    }
    return projected;
  };

  // Apply accepted proposals
  const handleApply = async () => {
    if (acceptedProposalIds.size === 0) {
      toast.error('Please accept at least one change proposal');
      return;
    }

    try {
      setIsApplying(true);
      const payload = {
        sessionId: tailorResult.sessionId,
        acceptedProposalIds: Array.from(acceptedProposalIds),
        proposals: tailorResult.proposals || [],
        jdSnapshot: tailorResult.jdSnapshot || {},
        versionName: versionName.trim() || undefined,
      };

      const res = await applyTailorResume(resumeId, payload);
      if (res && res.success) {
        toast.success(res.message || 'Tailored resume version saved!');
        if (onApplied && res.resume) {
          onApplied(res.resume, res.version);
        }
        onClose();
      } else {
        toast.error(res?.message || 'Failed to apply proposals');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to apply proposals');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                AI Resume Tailoring Engine
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                  Phase 8
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Tailor your resume against a target job description with side-by-side proposal review.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =================================================================== */}
        {/* STEP 1: CONFIGURE TARGET JD                                        */}
        {/* =================================================================== */}
        {step === 'configure' && (
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Mode Picker Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setTargetMode('drive')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  targetMode === 'drive'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Pick from Campus Drives
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('paste')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  targetMode === 'paste'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4" />
                Paste Custom Job Description
              </button>
            </div>

            {/* Mode 1: Campus Drive Selector */}
            {targetMode === 'drive' && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Select Target Campus Placement Drive
                </label>
                {loadingDrives ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    Loading available campus drives...
                  </div>
                ) : drives.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    No active drives found. You can switch to "Paste Custom Job Description" above.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {drives.map((d) => {
                      const isSelected = selectedDriveId === d._id;
                      return (
                        <div
                          key={d._id}
                          onClick={() => setSelectedDriveId(d._id)}
                          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {d.role || 'Software Engineer'}{' '}
                              <span className="font-medium text-slate-500">
                                @ {d.company?.name || 'Recruiter'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-1">
                              <span>Batch: {d.batchYear || 'All'}</span>
                              {d.requiredSkills?.length > 0 && (
                                <span className="truncate">
                                  Skills: {d.requiredSkills.slice(0, 3).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Custom JD Paste */}
            {targetMode === 'paste' && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Target Job Description Text
                </label>
                <textarea
                  rows={8}
                  value={customJdText}
                  onChange={(e) => setCustomJdText(e.target.value)}
                  placeholder="Paste the target job description or requirements here... (e.g. roles, responsibilities, required skills, preferred qualifications)"
                  className="w-full p-3.5 border border-slate-300 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            )}

            {/* Honesty & Anti-Hallucination Guarantees Callout */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                Truthful & Grounded Tailoring Guarantees
              </div>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                The tailoring engine strictly never invents companies, dates, degrees, or tools. It reorders skills and projects to match target requirements, replaces passive verbs with active verbs, and inserts quantifiable metric placeholders for you to fill with your real numbers.
              </p>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 2: REVIEW PROPOSALS & PREVIEW                                  */}
        {/* =================================================================== */}
        {step === 'review' && tailorResult && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Target Role & Match Score Banner */}
            <div className="px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Target Posting
                </span>
                <div className="text-sm font-bold text-slate-900">
                  {tailorResult.targetRole}{' '}
                  {tailorResult.targetCompany && (
                    <span className="font-medium text-slate-600">
                      @ {tailorResult.targetCompany}
                    </span>
                  )}
                </div>
              </div>

              {/* Match Score Read-only Pill */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">
                    ATS Match Score
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    <span className="text-slate-500">{tailorResult.baselineScore}%</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="text-emerald-600">{tailorResult.projectedScore}%</span>
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center p-1 bg-white rounded-xl border border-purple-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      activeTab === 'list'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Proposals ({acceptedProposalIds.size}/{tailorResult.proposals?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      activeTab === 'preview'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Live Result
                  </button>
                </div>
              </div>
            </div>

            {/* TAB 1: Proposals List */}
            {activeTab === 'list' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Proposal Controls */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    Review each proposed change. Only accepted proposals will be applied.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAcceptAll}
                      className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
                    >
                      Accept All
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectAll}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
                    >
                      Reject All
                    </button>
                  </div>
                </div>

                {tailorResult.proposals?.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 italic">
                    Your resume already aligns strongly with this target posting! No changes needed.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {tailorResult.proposals.map((prop) => {
                      const isAccepted = acceptedProposalIds.has(prop.id);
                      return (
                        <div
                          key={prop.id}
                          className={`rounded-2xl border p-4 transition ${
                            isAccepted
                              ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                              : 'border-slate-200 bg-slate-50/50 opacity-70'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                                {prop.section}
                              </span>
                              {prop.matchedJdKeyword && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                  JD Match: {prop.matchedJdKeyword}
                                </span>
                              )}
                            </div>

                            {/* Toggle Button */}
                            <button
                              type="button"
                              onClick={() => toggleProposal(prop.id)}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition ${
                                isAccepted
                                  ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {isAccepted ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  Accepted
                                </>
                              ) : (
                                <>
                                  <X className="w-3.5 h-3.5" />
                                  Rejected
                                </>
                              )}
                            </button>
                          </div>

                          {/* Diff Comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-2.5">
                            <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-600 font-mono text-[11px] whitespace-pre-wrap">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                Original
                              </span>
                              {typeof prop.original === 'object'
                                ? JSON.stringify(prop.original, null, 1)
                                : prop.original}
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-emerald-200 text-slate-800 font-mono text-[11px] whitespace-pre-wrap">
                              <span className="block text-[10px] font-bold text-emerald-600 uppercase mb-1">
                                Proposed
                              </span>
                              {typeof prop.proposed === 'object'
                                ? JSON.stringify(prop.proposed, null, 1)
                                : prop.proposed}
                            </div>
                          </div>

                          {/* Reason */}
                          {prop.reason && (
                            <p className="text-[11px] text-slate-500 italic">
                              Why: {prop.reason}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Live Result Preview */}
            {activeTab === 'preview' && (
              <div className="flex-1 overflow-y-auto p-5 bg-slate-100/60">
                <StudioPreview
                  resumeData={getProjectedResumeData()}
                  templateId={templateId}
                  sectionOrder={sectionOrder}
                  sectionVisibility={sectionVisibility}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          {step === 'configure' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateProposals}
                disabled={isGenerating}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Change Proposals...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze & Generate Proposals
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('configure')}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs transition flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reconfigure
                </button>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="Version Name"
                  className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium w-48 sm:w-64"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs transition"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying || acceptedProposalIds.size === 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying Changes...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Apply {acceptedProposalIds.size} Changes & Save Version
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TailorModal;
