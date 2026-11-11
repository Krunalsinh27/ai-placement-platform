import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Sparkles,
  Award,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FileText,
  User,
  Info,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

const RankedApplicantsView = ({ driveId, driveRole = 'Drive' }) => {
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [disclaimer, setDisclaimer] = useState('AI-assisted suggestion. The final decision is yours.');
  const [rateLimited, setRateLimited] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Explanation Modal State
  const [explanationModalOpen, setExplanationModalOpen] = useState(false);
  const [activeApplicant, setActiveApplicant] = useState(null);
  const [explanationText, setExplanationText] = useState('');
  const [isCachedExplanation, setIsCachedExplanation] = useState(false);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const fetchRanked = async (pageNum = 1) => {
    setLoading(true);
    setRateLimited(false);
    setErrorMessage('');
    try {
      const res = await api.get(`/drives/${driveId}/ranked-applicants?page=${pageNum}&limit=15`);
      if (res.data.success) {
        setApplicants(res.data.applicants || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
        setPages(res.data.pages || 1);
        if (res.data.disclaimer) setDisclaimer(res.data.disclaimer);
      }
    } catch (err) {
      console.error('Failed to load ranked applicants:', err);
      if (err.response?.status === 429) {
        setRateLimited(true);
      } else {
        setErrorMessage(err.response?.data?.message || 'Failed to rank applicants');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (driveId) {
      fetchRanked(page);
    }
  }, [driveId, page]);

  const handleOpenExplanation = async (applicant) => {
    setActiveApplicant(applicant);
    setExplanationModalOpen(true);
    setExplanationText('');
    setLoadingExplanation(true);

    try {
      const res = await api.get(
        `/drives/${driveId}/applicants/${applicant.applicationId}/explanation`
      );
      if (res.data.success) {
        setExplanationText(res.data.explanation);
        setIsCachedExplanation(Boolean(res.data.cached));
      }
    } catch (err) {
      console.error('Failed to get applicant explanation:', err);
      toast.error(err.response?.data?.message || 'Could not load explanation');
      setExplanationText('Unable to retrieve AI explanation at this time.');
    } finally {
      setLoadingExplanation(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
    if (score >= 60) return { bar: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
    if (score >= 40) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
    return { bar: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' };
  };

  return (
    <div className="space-y-4">
      {/* Disclaimer Banner */}
      <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/80 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2.5 text-indigo-950 font-medium">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Deterministic AI Match Ranking:</strong> {disclaimer}
          </span>
        </div>
        <button
          type="button"
          onClick={() => fetchRanked(page)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors shadow-2xs cursor-pointer"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {rateLimited && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Daily AI request limit reached. AI features have safely fallen back to deterministic rule-based analysis.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 font-medium">Computing deterministic candidate match scores...</p>
        </div>
      ) : applicants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-xs">
          No applicants found for this drive yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">Rank</th>
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4 w-44">Match Score</th>
                  <th className="py-3 px-4">Skill Alignment</th>
                  <th className="py-3 px-4">Eligibility Fit</th>
                  <th className="py-3 px-4 text-right w-28">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((item, index) => {
                  const rank = (page - 1) * 15 + index + 1;
                  const score = item.match?.score || 0;
                  const color = getScoreColor(score);
                  const matched = item.match?.matchedSkills || [];
                  const missing = item.match?.missingSkills || [];
                  const breakdown = item.match?.breakdown || {};

                  return (
                    <tr key={item.applicationId} className="hover:bg-slate-50/80 transition-colors">
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            rank === 1
                              ? 'bg-amber-100 text-amber-800'
                              : rank === 2
                              ? 'bg-slate-200 text-slate-800'
                              : rank === 3
                              ? 'bg-orange-100 text-orange-800'
                              : 'text-slate-500'
                          }`}
                        >
                          {rank}
                        </span>
                      </td>

                      {/* Candidate */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs">{item.student?.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{item.student?.enrollmentNo}</span>
                          <span>•</span>
                          <span>{item.student?.branch}</span>
                        </div>
                      </td>

                      {/* Match Score & Progress Bar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className={color.text}>{score} / 100</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Req: {breakdown.requiredSkillCoverage || 0}/50
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full ${color.bar} rounded-full transition-all duration-300`}
                            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                          />
                        </div>
                      </td>

                      {/* Skills Alignment */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {matched.slice(0, 3).map((sk) => {
                            const isSelfDeclared = item.match?.matchedSkillDetails?.find((d) => d.name === sk)?.selfDeclared;
                            return (
                              <span
                                key={sk}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  isSelfDeclared
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                                title={isSelfDeclared ? 'Self-declared by candidate (not verified in resume)' : 'Verified in resume'}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>{sk}</span>
                                {isSelfDeclared && (
                                  <span className="text-[9px] font-medium px-1 bg-amber-100/90 text-amber-900 rounded">
                                    self-declared
                                  </span>
                                )}
                              </span>
                            );
                          })}
                          {missing.slice(0, 2).map((sk) => (
                            <span
                              key={sk}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"
                            >
                              <XCircle className="w-2.5 h-2.5" />
                              {sk}
                            </span>
                          ))}
                          {matched.length + missing.length > 5 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{matched.length + missing.length - 5} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Academic & Eligibility */}
                      <td className="py-3.5 px-4">
                        <div className="text-[11px] text-slate-700 font-medium">
                          CGPA: <strong>{item.student?.cgpa ?? '-'}</strong> • Backlogs:{' '}
                          <strong>{item.student?.backlogs ?? 0}</strong>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Eligibility: {breakdown.eligibilityFit ?? 20}/20 pts
                        </div>
                      </td>

                      {/* Explain Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenExplanation(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Explain</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
              <span>
                Showing page <strong>{page}</strong> of <strong>{pages}</strong> ({total} applicants)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="p-1.5 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explanation Modal */}
      {explanationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>AI Evaluation Breakdown</span>
              </div>
              <button
                type="button"
                onClick={() => setExplanationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{activeApplicant?.student?.name}</h4>
                <p className="text-xs text-slate-500">
                  {activeApplicant?.student?.branch} • CGPA {activeApplicant?.student?.cgpa} • Match Score:{' '}
                  <strong className="text-indigo-600">{activeApplicant?.match?.score}/100</strong>
                </p>
              </div>

              {loadingExplanation ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Generating explainable evaluation from structured metrics...
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 leading-relaxed">
                    {explanationText}
                  </div>

                  {activeApplicant?.match?.reasons && activeApplicant.match.reasons.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Key Alignment Factors:
                      </span>
                      <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
                        {activeApplicant.match.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                    <span>
                      {isCachedExplanation ? 'Retrieved from cache' : 'Generated via AI evaluation engine'}
                    </span>
                    <span className="font-semibold text-slate-600">
                      Final decision rests with recruiter
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => setExplanationModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RankedApplicantsView;

