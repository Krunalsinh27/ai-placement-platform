import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  Building2,
  Globe,
  Mail,
  Phone,
  User,
  Image,
  FileText,
  Save,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

const CompanyProfile = () => {
  const { user, updateUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    description: '',
    logoUrl: '',
    hrContact: {
      name: '',
      email: '',
      phone: '',
    },
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        const res = await api.get('/company/me');
        if (res.data.success) {
          const comp = res.data.company;
          setFormData({
            name: comp.name || '',
            industry: comp.industry || '',
            website: comp.website || '',
            description: comp.description || '',
            logoUrl: comp.logoUrl || '',
            hrContact: {
              name: comp.hrContact?.name || '',
              email: comp.hrContact?.email || '',
              phone: comp.hrContact?.phone || '',
            },
          });
        }
      } catch (err) {
        console.error('Failed to load company profile:', err);
        toast.error('Could not load company profile');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('hr_')) {
      const field = name.replace('hr_', '');
      setFormData((prev) => ({
        ...prev,
        hrContact: { ...prev.hrContact, [field]: value },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Company name is required');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.put('/company/me', {
        name: formData.name.trim(),
        industry: formData.industry.trim(),
        website: formData.website.trim(),
        description: formData.description.trim(),
        logoUrl: formData.logoUrl.trim(),
        hrContact: {
          name: formData.hrContact.name.trim(),
          email: formData.hrContact.email.trim(),
          phone: formData.hrContact.phone.trim(),
        },
      });

      if (res.data.success) {
        toast.success('Company profile updated successfully!');
        // Update user state locally
        if (user) {
          updateUser({
            ...user,
            company: res.data.company,
          });
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update company profile';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-96 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <Building2 className="w-6 h-6 text-sky-600" />
          <span>Company Profile & Branding</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your organization details, official web presence, and primary campus hiring contact.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Edit Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Section 1: General Info */}
            <h2 className="text-xs font-bold text-sky-700 uppercase tracking-wider border-b border-slate-100 pb-2">
              1. Corporate Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Legal / Brand Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Google India Private Limited"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Industry / Domain *
                </label>
                <input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Technology, Cloud & AI"
                  className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Website
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Globe className="h-4 w-4" />
                  </div>
                  <input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://company.com"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Logo URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Image className="h-4 w-4" />
                  </div>
                  <input
                    type="url"
                    name="logoUrl"
                    value={formData.logoUrl}
                    onChange={handleChange}
                    placeholder="https://company.com/logo.png"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Company Description / Overview
              </label>
              <textarea
                name="description"
                rows="4"
                value={formData.description}
                onChange={handleChange}
                placeholder="Introduce your organization's mission, work culture, engineering challenges, and graduate career tracks..."
                className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            {/* Section 2: HR Contact */}
            <h2 className="text-xs font-bold text-sky-700 uppercase tracking-wider border-b border-slate-100 pb-2 pt-2">
              2. Primary Talent & HR Contact
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Person Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    name="hr_name"
                    value={formData.hrContact.name}
                    onChange={handleChange}
                    placeholder="e.g. Sarah Connor"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    name="hr_email"
                    value={formData.hrContact.email}
                    onChange={handleChange}
                    placeholder="talent@company.com"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    name="hr_phone"
                    value={formData.hrContact.phone}
                    onChange={handleChange}
                    placeholder="+1-555-0199"
                    className="block w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl shadow-md text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Company Profile</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Live Preview Card */}
        <div className="space-y-4">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Student Portal Card Preview</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt={formData.name || 'Company'}
                    className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1.5 border border-slate-200 shrink-0"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
                    <Building2 className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    {formData.name || 'Your Company Name'}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {formData.industry || 'Industry Domain'}
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Verified</span>
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
              {formData.description ||
                'Company description will appear here on students eligible drives and recruiters list.'}
            </p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              {formData.website ? (
                <a
                  href={formData.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1"
                >
                  <Globe className="w-3 h-3" />
                  <span>Visit Website</span>
                </a>
              ) : (
                <span className="text-slate-400">No website</span>
              )}

              <span className="text-[11px] text-slate-500">Campus Hiring Partner</span>
            </div>
          </div>

          <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 text-xs text-sky-800 space-y-1">
            <span className="font-bold block">Corporate Verification Notice</span>
            <p className="text-[11px] leading-relaxed text-sky-700">
              Your company profile is active and verified by default. In upcoming updates, Superadmin
              verification badges will be certified after college MOU and corporate documentation review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyProfile;

