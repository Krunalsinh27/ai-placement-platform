import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  RotateCw,
  Award,
  Layers,
  FileText,
  Save,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ResumeInsightsCard = ({ hasResume = false, onSkillsUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState([]);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [rateLimited, setRateLimited] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await api.get('/students/me/resume-profile');
      if (res.data.success && res.data.resumeProfile) {
        setProfile(res.data.resumeProfile);
        setSkills(res.data.resumeProfile.skills || []);
        if (res.data.resumeProfile.status === 'rate_limited') {
          setRateLimited(true);
        }
      }
    } catch (err) {
      console.warn('Could not load resume profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleParseResume = async () => {
    if (!hasResume) {
      toast.error('Please upload your resume first before analyzing it');
      return;
    }

    setParsing(true);
    setRateLimited(false);
    try {
      const res = await api.post('/students/me/resume/parse');
      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        setSkills(res.data.resumeProfile.skills || []);
        toast.success(
          res.data.cached
            ? 'Resume profile loaded from cache'
            : 'Resume parsed and skills extracted successfully!'
        );
        if (typeof onSkillsUpdated === 'function') {
          onSkillsUpdated(res.data.resumeProfile.skills.map((s) => s.name));
        }
      }
    } catch (err) {
      console.error('Failed to parse resume:', err);
      if (err.response?.status === 429) {
        setRateLimited(true);
        toast.error('Daily AI parsing limit reached. Please try again tomorrow.');
      } else {
        toast.error(err.response?.data?.message || 'Resume parsing failed');
      }
    } finally {
      setParsing(false);
    }
  };

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

    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Skill already exists in list');
      return;
    }

    setSkills((prev) => [...prev, { name: trimmed, confirmedByStudent: true }]);
    setNewSkillInput('');
  };

  const handleSaveConfirmedSkills = async () => {
    setSaving(true);
    try {
      const res = await api.put('/students/me/resume-profile', {
        skills,
      });

      if (res.data.success) {
        setProfile(res.data.resumeProfile);
        toast.success('Confirmed skills saved for AI matching!');
        if (typeof onSkillsUpdated === 'function') {
          onSkillsUpdated(skills.map((s) => s.name));
        }
      }
    } catch (err) {
      console.error('Failed to save skills:', err);
      toast.error(err.response?.data?.message || 'Failed to save skills');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = () => {
    if (rateLimited || profile?.status === 'rate_limited') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
          <AlertCircle className="w-3 h-3" />
          <span>Rate Limited</span>
        </span>
      );
    }
    if (profile?.status === 'parsed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          <span>{profile.source === 'rules' ? 'Rule Extracted' : 'AI Analyzed'}</span>
        </span>
      );
    }
    if (profile?.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
          <X className="w-3 h-3" />
          <span>Unreadable</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
        <span>Not Analyzed</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 leading-tight">Resume Insights</h3>
            <p className="text-[11px] text-slate-500">AI-extracted proficiencies & skills</p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {/* Rate Limited Banner */}
      {rateLimited && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Daily parsing cap reached.</strong> Your skills remain available for matching, but new resume parses are paused until tomorrow.
          </div>
        </div>
      )}

      {/* AI Analysis Note */}
      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        <span>Your resume is analyzed by AI. Extracted skills are matched against drive requirements.</span>
      </div>

      {/* Action Button */}
      <div>
        <button
          type="button"
          onClick={handleParseResume}
          disabled={parsing || !hasResume}
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
        >
          {parsing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Analyzing Resume with AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>{profile?.status === 'parsed' ? 'Re-Analyze Resume with AI' : 'Analyze Resume with AI'}</span>
            </>
          )}
        </button>
      </div>

      {/* Editable Skills Section */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-800">
            Confirmed Skills ({skills.length})
          </label>
          <span className="text-[10px] text-slate-400">Click chip to toggle confirmation</span>
        </div>

        {skills.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No skills extracted yet. Analyze your resume or add skills below.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill, index) => {
              const isConfirmed = Boolean(skill.confirmedByStudent);
              return (
                <span
                  key={index}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                    isConfirmed
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleConfirmSkill(index)}
                    title={isConfirmed ? 'Student Confirmed (used for matching)' : 'Click to confirm'}
                    className="flex items-center gap-1 cursor-pointer"
                  >
                    {isConfirmed && <Check className="w-3 h-3 text-emerald-600" />}
                    <span>{skill.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(index)}
                    className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Add Skill Input */}
        <form onSubmit={handleAddSkill} className="flex gap-2">
          <input
            type="text"
            value={newSkillInput}
            onChange={(e) => setNewSkillInput(e.target.value)}
            placeholder="Add a new skill (e.g. Docker, TypeScript)..."
            className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>

        {skills.length > 0 && (
          <button
            type="button"
            onClick={handleSaveConfirmedSkills}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Confirmed Skills for Matching</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default ResumeInsightsCard;

