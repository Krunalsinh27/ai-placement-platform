import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Sliders, Save, CheckCircle2, User, Sparkles, Compass, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  INDIAN_STATES_AND_UTS,
  TWELFTH_STREAMS,
  BRANCH_OPTIONS,
} from '../../constants/aspirantConstants';

const AspirantPreferences = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    state: '',
    twelfthStream: '',
    interestedBranches: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/aspirant/me');

        if (res.data.success) {
          const asp = res.data.aspirant || {};
          const usr = res.data.user || asp.user || {};
          setFormData({
            name: usr.name || asp.user?.name || res.data.user?.name || '',
            email: usr.email || asp.user?.email || res.data.user?.email || '',
            state: asp.state || '',
            twelfthStream: asp.twelfthStream || '',
            interestedBranches: Array.isArray(asp.interestedBranches)
              ? asp.interestedBranches
              : [],
          });
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load profile preferences', {
          id: 'pref-fetch-error',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleBranchToggle = (branch) => {
    setFormData((prev) => {
      const exists = prev.interestedBranches.includes(branch);
      const updated = exists
        ? prev.interestedBranches.filter((b) => b !== branch)
        : [...prev.interestedBranches, branch];
      return { ...prev, interestedBranches: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.state) {
      toast.error('Please select your home state');
      return;
    }
    if (formData.interestedBranches.length === 0) {
      toast.error('Please select at least one target discipline / branch');
      return;
    }

    setSaving(true);
    setJustSaved(false);
    try {
      const res = await api.put('/aspirant/me', {
        state: formData.state,
        twelfthStream: formData.twelfthStream,
        interestedBranches: formData.interestedBranches,
      });
      if (res.data.success) {
        toast.success('Preferences updated successfully');
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3000);

        // Reload fresh values from response
        const asp = res.data.aspirant || {};
        const usr = res.data.user || asp.user || {};
        setFormData((prev) => ({
          name: usr.name || asp.user?.name || prev.name,
          email: usr.email || asp.user?.email || prev.email,
          state: asp.state || prev.state,
          twelfthStream: asp.twelfthStream || prev.twelfthStream,
          interestedBranches: Array.isArray(asp.interestedBranches)
            ? asp.interestedBranches
            : prev.interestedBranches,
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs font-semibold">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Title */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Prospective Student Preferences
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Customize your geographic and discipline preferences to discover best-fit colleges.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        {/* Account Snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
              Full Name
            </label>
            <p className="text-xs font-bold text-slate-800">{formData.name || '-'}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
              Email Address
            </label>
            <p className="text-xs font-bold text-slate-800">{formData.email || '-'}</p>
          </div>
        </div>

        {/* State Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Home State / Region
          </label>
          <select
            value={formData.state}
            onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
            className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          >
            <option value="">Select your home state...</option>
            {formData.state && !INDIAN_STATES_AND_UTS.includes(formData.state) && (
              <option value={formData.state}>{formData.state}</option>
            )}
            {INDIAN_STATES_AND_UTS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Used to highlight institutions in your home state with a 'Home state' badge and give them priority on ranking ties.
          </p>
        </div>

        {/* 12th Standard Stream */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            12th Standard Academic Stream
          </label>
          <select
            value={formData.twelfthStream}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, twelfthStream: e.target.value }))
            }
            className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          >
            <option value="" disabled>Select your 12th standard stream...</option>
            {formData.twelfthStream && !TWELFTH_STREAMS.includes(formData.twelfthStream) && (
              <option value={formData.twelfthStream}>{formData.twelfthStream}</option>
            )}
            {TWELFTH_STREAMS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Used to check general admission prerequisites (e.g. Science/PCM requirements) for technical and engineering programs.
          </p>
        </div>

        {/* Interested Disciplines / Branches */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Target Disciplines / Engineering Branches
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {BRANCH_OPTIONS.map((br) => {
              const selected = formData.interestedBranches.includes(br);
              return (
                <button
                  type="button"
                  key={br}
                  onClick={() => handleBranchToggle(br)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    selected
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 ring-1 ring-indigo-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{br}</span>
                  {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Used to rank colleges by placement % and average package in these branches in 'Recommended for you'.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {justSaved && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
            {formData.interestedBranches.length > 0 && (
              <Link
                to="/aspirant/explore"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 transition-colors cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-indigo-600" />
                <span>See my recommendations</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default AspirantPreferences;
