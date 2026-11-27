import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Save,
  Download,
  Building2,
  Briefcase,
  FileText,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import {
  generateCoverLetterApi,
  saveCoverLetterApi,
  getCoverLetterApi,
  exportCoverLetterPdfApi,
} from '../api';

const CoverLetterModal = ({
  resumeId,
  candidateName = 'Candidate',
  contact = {},
  onClose,
}) => {
  const [role, setRole] = useState('Software Engineer');
  const [company, setCompany] = useState('');
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [content, setContent] = useState('');
  const [eligibleDrives, setEligibleDrives] = useState([]);

  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Load drives & existing cover letter
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setIsLoadingExisting(true);

        // 1. Fetch eligible drives
        const drivesRes = await api.get('/drives/eligible').catch(() => null);
        if (isMounted && drivesRes?.data?.success && Array.isArray(drivesRes.data.drives)) {
          setEligibleDrives(drivesRes.data.drives);
        }

        // 2. Fetch existing cover letter for this resume
        const coverRes = await getCoverLetterApi(resumeId).catch(() => null);
        if (isMounted && coverRes?.success && coverRes.coverLetter) {
          const doc = coverRes.coverLetter;
          if (doc.role) setRole(doc.role);
          if (doc.company) setCompany(doc.company);
          if (doc.content) setContent(doc.content);
        }
      } catch (_) {
        // silent fallback
      } finally {
        if (isMounted) setIsLoadingExisting(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [resumeId]);

  // Handle drive selection
  const handleDriveSelect = (e) => {
    const driveId = e.target.value;
    setSelectedDriveId(driveId);
    if (!driveId) return;

    const found = eligibleDrives.find((d) => d._id === driveId);
    if (found) {
      if (found.role) setRole(found.role);
      if (found.company?.name) setCompany(found.company.name);
      if (found.description) setJobDescription(found.description);
    }
  };

  // Generate Cover Letter
  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      const res = await generateCoverLetterApi(resumeId, {
        role: role.trim() || undefined,
        company: company.trim() || undefined,
        driveId: selectedDriveId || undefined,
        jobDescription: jobDescription.trim() || undefined,
      });

      if (res.success && res.coverLetter) {
        setContent(res.coverLetter);
        if (res.targetRole) setRole(res.targetRole);
        if (res.targetCompany) setCompany(res.targetCompany);
        toast.success('Cover letter generated with AI!');
      } else {
        toast.error(res.message || 'Failed to generate cover letter');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Error generating cover letter');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Cover Letter
  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Cover letter content cannot be empty');
      return;
    }
    try {
      setIsSaving(true);
      const res = await saveCoverLetterApi(resumeId, {
        role: role.trim() || 'Software Engineer',
        company: company.trim() || '',
        driveId: selectedDriveId || undefined,
        content: content.trim(),
      });

      if (res.success) {
        toast.success('Cover letter saved successfully!');
      } else {
        toast.error(res.message || 'Could not save cover letter');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save cover letter');
    } finally {
      setIsSaving(false);
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    if (!content.trim()) {
      toast.error('Please generate or write a cover letter first');
      return;
    }
    try {
      setIsExporting(true);
      await exportCoverLetterPdfApi(
        resumeId,
        {
          content: content.trim(),
          role: role.trim() || undefined,
          company: company.trim() || undefined,
        },
        candidateName
      );
      toast.success('Cover letter PDF downloaded!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to download cover letter PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 text-indigo-600 bg-indigo-50 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cover Letter Studio</h2>
              <p className="text-xs text-gray-500">
                Generate an ATS-aligned, grounded cover letter tailored to your target job
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoadingExisting ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm text-gray-500">Loading cover letter details...</p>
            </div>
          ) : (
            <>
              {/* Generation Settings Card */}
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Target Role & Company
                  </span>
                  {eligibleDrives.length > 0 && (
                    <span className="text-xs text-indigo-700">
                      {eligibleDrives.length} campus drive(s) eligible
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Pick Campus Drive */}
                  {eligibleDrives.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Select Campus Drive (Optional)
                      </label>
                      <select
                        value={selectedDriveId}
                        onChange={handleDriveSelect}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="">Custom / No drive</option>
                        {eligibleDrives.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.company?.name} — {d.role}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Role Title */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target Role Title
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Full Stack Engineer"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Company Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target Company Name
                    </label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Google, Microsoft"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Generate with AI
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Cover Letter Content Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Cover Letter Text (Editable)
                  </label>
                  <span className="text-xs text-gray-400">
                    {content.length} characters
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Your cover letter text will appear here. You can also write or edit it directly..."
                  rows={14}
                  className="w-full p-4 text-sm font-sans text-gray-800 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all leading-relaxed"
                />
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-gray-500" /> Save
                </>
              )}
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExporting || !content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoverLetterModal;
