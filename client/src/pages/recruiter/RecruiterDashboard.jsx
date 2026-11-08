import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  Building2,
  Briefcase,
  Users,
  CheckCircle2,
  Calendar,
  Globe,
  Mail,
  Phone,
  ArrowRight,
  Edit3,
  Award,
  Sparkles,
  ExternalLink,
  PlusCircle,
  FileText,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

const RecruiterDashboard = () => {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [drives, setDrives] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [compRes, reqRes] = await Promise.allSettled([
          api.get('/companies/me'),
          api.get('/job-requirements'),
        ]);

        if (compRes.status === 'fulfilled' && compRes.value.data.success) {
          setCompany(compRes.value.data.company);
          setDrives(compRes.value.data.drives || []);
        }

        if (reqRes.status === 'fulfilled' && reqRes.value.data.success) {
          setRequirements(reqRes.value.data.requirements || []);
        }
      } catch (err) {
        console.error('Failed to load recruiter data:', err);
        toast.error('Could not load company dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const openDrives = drives.filter((d) => d.status === 'open');
  const closedDrives = drives.filter((d) => d.status === 'closed');
  const publishedReqs = requirements.filter((r) => r.status === 'published');
  const draftReqs = requirements.filter((r) => r.status === 'draft');
  const totalOpenings = requirements.reduce((acc, r) => acc + (Number(r.openings) || 0), 0);

  const allPackages = [
    ...drives.map((d) => Number(d.packageLpa) || 0),
    ...requirements.map((r) => Number(r.packageLpa) || 0),
  ].filter((p) => p > 0);
  const maxPackage = allPackages.length > 0 ? Math.max(...allPackages) : 0;

  return (
    <div className="space-y-6">
      {/* Welcome & Company Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 border border-slate-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={company?.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white p-2 border border-white/20 shadow-md shrink-0"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-sky-500/30 shrink-0">
                <Building2 className="w-10 h-10" />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {company?.name || 'Recruiter Company'}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified Corporate Partner</span>
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 font-medium">
                {company?.industry || 'Technology & Engineering'}
              </p>

              {company?.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{company.website.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <Link
              to="/recruiter/requirements"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/25"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Job Requirements</span>
            </Link>
            <Link
              to="/recruiter/profile"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold backdrop-blur-sm border border-white/15 transition-all shadow-sm"
            >
              <Edit3 className="w-4 h-4 text-sky-300" />
              <span>Edit Profile</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Requirements Metric */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Job Postings
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900">
            {requirements.length}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            {publishedReqs.length} published • {draftReqs.length} draft
          </span>
        </div>

        {/* Total Openings Metric */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Openings
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-emerald-600">
            {totalOpenings}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Across {requirements.length} requirements
          </span>
        </div>

        {/* Drives count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Campus Drives
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900">
            {drives.length}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            {openDrives.length} active campus drives
          </span>
        </div>

        {/* Highest Package */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Max Package
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900">
            {maxPackage > 0 ? `${maxPackage} LPA` : '—'}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Highest CTC offered
          </span>
        </div>
      </div>

      {/* Job Requirements Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Active Job Requirements</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Role profiles, eligibility criteria, and hiring pipelines
            </p>
          </div>
          <Link
            to="/recruiter/requirements"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <span>Manage All ({requirements.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {requirements.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
            <FileText className="w-9 h-9 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No requirements posted yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-3">
              Define your talent needs, eligibility criteria, and interview rounds to begin campus hiring.
            </p>
            <Link
              to="/recruiter/requirements"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Requirement</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {requirements.slice(0, 3).map((r) => (
              <div
                key={r._id}
                className="p-4 rounded-xl border border-slate-200/80 hover:border-indigo-300 transition-all bg-gradient-to-b from-white to-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-1">{r.title}</h3>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${r.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'draft'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{r.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-slate-400">Package</span>
                    <span className="font-black text-indigo-600">{r.packageLpa} LPA</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-slate-400">Openings / Batch</span>
                    <span className="font-semibold text-slate-700">
                      {r.openings} positions • {r.batchYear}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-slate-400">Cutoff</span>
                    <span className="font-medium text-slate-700">CGPA ≥ {r.minCgpa}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid: Posted Drives & Company Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Drives Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Company Recruitment Drives
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Campus recruitment drives registered under {company?.name}
              </p>
            </div>
          </div>

          {drives.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <Briefcase className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                No drives listed yet
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Collaborate with the college Training & Placement Officers to schedule placement drives.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase font-semibold tracking-wider border-b border-slate-200/80">
                    <th className="py-3 px-3">Designation / Role</th>
                    <th className="py-3 px-3">Package</th>
                    <th className="py-3 px-3">Location</th>
                    <th className="py-3 px-3">Drive Date</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-right">Pipeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drives.map((d) => (
                    <tr key={d._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {d.role}
                      </td>
                      <td className="py-3 px-3 font-bold text-indigo-600">
                        {d.packageLpa} LPA
                      </td>
                      <td className="py-3 px-3 text-slate-600">{d.location || 'Pan India'}</td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(d.driveDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${d.status === 'open'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/recruiter/drives/${d._id}/pipeline`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-[11px] transition-colors border border-sky-200"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Pipeline</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Company Info Snapshot */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" />
              <span>Company Information</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Industry</span>
                <span className="text-slate-800 font-semibold mt-0.5 block">
                  {company?.industry || 'Not specified'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block font-medium">Official Website</span>
                {company?.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>{company.website}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-slate-500">Not provided</span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block font-medium">About / Description</span>
                <p className="text-slate-600 mt-1 leading-relaxed line-clamp-4">
                  {company?.description || 'No company overview provided yet.'}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                  HR / Talent Contact
                </span>
                <div className="space-y-1.5 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{company?.hrContact?.name || user?.name || 'Talent Lead'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{company?.hrContact?.email || user?.email}</span>
                  </div>
                  {company?.hrContact?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{company.hrContact.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/recruiter/profile"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Update Company Profile</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruiterDashboard;

