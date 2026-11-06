import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  GraduationCap,
  Building2,
  Users,
  CheckCircle2,
  Award,
  ArrowLeft,
  ExternalLink,
  Layers,
  Calendar,
  Briefcase,
  Sparkles,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PrivacyBadge, PrivacyFootnote } from '../components/common/PrivacyBadge';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import toast from 'react-hot-toast';

const PublicCollegeDetail = () => {
  const { user, isAspirant } = useAuth();
  const { collegeCode } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savingShortlist, setSavingShortlist] = useState(false);

  useEffect(() => {
    const fetchCollegeDetails = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/colleges/public/placements/${collegeCode}`);
        if (res.data.success) {
          setData(res.data);
        }
      } catch (err) {
        toast.error('Failed to load college placement details');
      } finally {
        setLoading(false);
      }
    };

    fetchCollegeDetails();
  }, [collegeCode]);

  useEffect(() => {
    if (isAspirant && data?.college?._id) {
      api
        .get('/aspirant/me')
        .then((res) => {
          if (res.data?.aspirant?.shortlistedColleges) {
            const ids = res.data.aspirant.shortlistedColleges.map((c) =>
              typeof c === 'object' ? c._id : c
            );
            setIsSaved(ids.includes(data.college._id));
          }
        })
        .catch(() => {});
    }
  }, [isAspirant, data?.college?._id]);

  const handleToggleShortlist = async () => {
    if (!data?.college?._id) return;
    setSavingShortlist(true);
    try {
      if (isSaved) {
        await api.delete(`/aspirant/shortlist/${data.college._id}`);
        setIsSaved(false);
        toast.success('Removed from shortlist');
      } else {
        await api.post(`/aspirant/shortlist/${data.college._id}`);
        setIsSaved(true);
        toast.success('Saved to shortlist');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update shortlist');
    } finally {
      setSavingShortlist(false);
    }
  };

  const renderMetric = (val, suffix = '') => {
    if (val === 'lt5') {
      return <PrivacyBadge />;
    }
    if (val === null || val === undefined) return '-';
    return `${val}${suffix}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 text-sm font-medium">Loading placement records...</p>
        </div>
      </div>
    );
  }

  if (!data?.college) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">College Record Not Found</h2>
          <p className="text-xs text-slate-500">
            No approved college record matching code "{collegeCode}".
          </p>
          <Link
            to="/placements"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Colleges</span>
          </Link>
        </div>
      </div>
    );
  }

  const { college, overview, byBranch, byYear, topRecruiters } = data;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <Link
            to="/placements"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Colleges</span>
          </Link>

          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <span>Portal Sign In</span>
          </Link>
        </div>
      </header>

      {/* College Profile Banner */}
      <section className="bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-300 text-xs font-semibold font-mono">
              <span>{college.code}</span>
              {college.accreditation && <span>• {college.accreditation}</span>}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {college.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              {college.city}, {college.state}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            {isAspirant && (
              <button
                type="button"
                onClick={handleToggleShortlist}
                disabled={savingShortlist}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSaved
                    ? 'bg-amber-400 text-slate-900 hover:bg-amber-300 shadow-md'
                    : 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20'
                }`}
              >
                {isSaved ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-slate-900" />
                    <span>Saved to Shortlist</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4 text-white" />
                    <span>Save to Shortlist</span>
                  </>
                )}
              </button>
            )}

            {!user && (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all"
              >
                <Bookmark className="w-4 h-4 text-slate-300" />
                <span>Log in to save</span>
              </Link>
            )}

            {college.website && (
              <a
                href={college.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all"
              >
                <span>Visit Official Website</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Enrolled Cohort</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {renderMetric(overview.students)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Placed Students (Unique)</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                {renderMetric(overview.placed)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Placement Rate</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {renderMetric(overview.placementPercentage, '%')}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Average Compensation</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                {overview.averagePackage ? `${overview.averagePackage} LPA` : '-'}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Highest: {overview.highestPackage ? `${overview.highestPackage} LPA` : '-'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Charts & Distributions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Branch Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Branch Placement Distribution</h2>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byBranch.map((b) => ({
                    branch: b.branch,
                    Students: typeof b.students === 'number' ? b.students : 0,
                    Placed: typeof b.placed === 'number' ? b.placed : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="branch" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="Students" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Placed" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto pt-2 border-t border-slate-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 font-semibold text-[11px]">
                    <th className="pb-1.5">Branch</th>
                    <th className="pb-1.5">Students</th>
                    <th className="pb-1.5">Placed</th>
                    <th className="pb-1.5 text-right">Placement %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byBranch.map((b) => (
                    <tr key={b.branch}>
                      <td className="py-1.5 font-semibold text-slate-800">{b.branch}</td>
                      <td className="py-1.5 text-slate-600">{renderMetric(b.students)}</td>
                      <td className="py-1.5 text-slate-600">{renderMetric(b.placed)}</td>
                      <td className="py-1.5 text-right font-medium">
                        {renderMetric(b.placementPercentage, '%')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Year-over-Year Progression */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Graduating Batch Year Trends</h2>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={byYear.map((y) => ({
                    year: y.batchYear,
                    Rate:
                      typeof y.placementPercentage === 'number' ? y.placementPercentage : 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Rate"
                    name="Placement %"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Top Hiring Companies */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Key Recruiting Partners
                </h3>
              </div>
              <div className="space-y-1.5 text-xs">
                {topRecruiters.length === 0 ? (
                  <p className="text-slate-400 py-2">No recruiter records yet</p>
                ) : (
                  topRecruiters.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1 text-slate-700">
                      <span className="font-semibold">{r.companyName}</span>
                      <span className="text-slate-500">
                        {renderMetric(r.hires)} hires •{' '}
                        {r.averagePackage ? `${r.averagePackage} LPA` : '-'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <PrivacyFootnote className="mt-4" />
      </main>
    </div>
  );
};

export default PublicCollegeDetail;

