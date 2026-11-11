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
} from 'lucide-react';
import toast from 'react-hot-toast';

const EligibleDrives = () => {
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);
  const [appliedDriveIds, setAppliedDriveIds] = useState(new Set());
  const [applyingId, setApplyingId] = useState(null);
  const [search, setSearch] = useState('');
  const [studentCriteria, setStudentCriteria] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [drivesRes, appsRes] = await Promise.all([
        api.get('/drives/eligible'),
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
  }, []);

  const handleApply = async (driveId) => {
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Eligible Placement Drives
          </h1>
          <p className="text-sm text-slate-500">
            Drives matching your academic qualifications, branch, and current backlog status.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
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

      {/* Criteria Info Banner */}
      {studentCriteria && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-indigo-900 font-medium">
            <Award className="w-4 h-4 text-indigo-600" />
            <span>
              Your Filter Criteria: <strong>Branch:</strong> {studentCriteria.branch} •{' '}
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
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="font-semibold text-sm text-slate-800">{drive.role}</h4>
                    <div className="flex items-baseline gap-1 mt-1 text-emerald-600 font-extrabold text-base">
                      <span>{drive.packageLpa} LPA</span>
                      <span className="text-[11px] font-normal text-slate-400">CTC</span>
                    </div>
                  </div>

                  {/* AI Match Score & Skills */}
                  {drive.match && (
                    <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          AI Match
                        </span>
                        {drive.match.score === null || drive.match.score === undefined ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                            No skill requirements listed
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
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
                      {drive.match.score === null || drive.match.score === undefined ? null : (
                        drive.match.missingSkills && drive.match.missingSkills.length > 0 ? (
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1">
                            <span className="font-semibold text-rose-600">Missing:</span>
                            {drive.match.missingSkills.slice(0, 3).map((sk) => (
                              <span
                                key={sk}
                                className="px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 text-[10px]"
                              >
                                {sk}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            All required skills matched!
                          </div>
                        )
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
                      onClick={() => handleApply(drive._id)}
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
    </div>
  );
};

export default EligibleDrives;

