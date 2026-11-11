import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Award,
  ArrowRight,
  Sparkles,
  Building2,
  Calendar,
  MapPin,
  ExternalLink,
  Check,
  X,
  Layers,
  AlertCircle,
  Video,
  Star,
  PhoneCall,
} from 'lucide-react';
import toast from 'react-hot-toast';

const StudentDashboard = () => {
  const { user, student } = useAuth();

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [eligibleDrives, setEligibleDrives] = useState([]);
  const [upcomingRounds, setUpcomingRounds] = useState([]);
  const [interviewSlots, setInterviewSlots] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [respondingOfferId, setRespondingOfferId] = useState(null);

  const formatISTDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatISTTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const canJoinSlot = (slot) => {
    if (!slot?.meetingLink) return false;
    if (slot.status === 'in_progress') return true;
    if (!slot.startTime) return false;
    const start = new Date(slot.startTime).getTime();
    const now = Date.now();
    // 10 minutes before start
    return now >= start - 10 * 60 * 1000;
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [appsRes, placeRes, drivesRes, upcomingRes, offersRes, slotsRes] = await Promise.allSettled([
        api.get('/applications/my'),
        api.get('/placements/my'),
        api.get('/drives/eligible'),
        api.get('/students/upcoming-rounds'),
        api.get('/offers/my'),
        api.get('/students/my-interview-slots'),
      ]);

      if (appsRes.status === 'fulfilled' && appsRes.value.data.success) {
        setApplications(appsRes.value.data.applications || []);
      }
      if (placeRes.status === 'fulfilled' && placeRes.value.data.success) {
        setPlacements(placeRes.value.data.placements || []);
      }
      if (drivesRes.status === 'fulfilled' && drivesRes.value.data.success) {
        setEligibleDrives(drivesRes.value.data.drives || []);
      }
      if (upcomingRes.status === 'fulfilled' && upcomingRes.value.data.success) {
        setUpcomingRounds(upcomingRes.value.data.upcoming || []);
      }
      if (offersRes.status === 'fulfilled' && offersRes.value.data.success) {
        setMyOffers(offersRes.value.data.offers || []);
      }
      if (slotsRes.status === 'fulfilled' && slotsRes.value.data.success) {
        setInterviewSlots(slotsRes.value.data.slots || []);
      }
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
      toast.error('Unable to fetch latest placement metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Handle Accept Offer
  const handleAcceptOffer = async (offerId, companyName, role) => {
    if (
      !window.confirm(
        `Are you sure you want to ACCEPT the employment offer for ${role} at ${companyName}? This will confirm your official campus placement!`
      )
    ) {
      return;
    }

    setRespondingOfferId(offerId);
    try {
      const res = await api.put(`/offers/${offerId}/accept`);
      if (res.data.success) {
        toast.success(res.data.message);
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Accept offer error:', err);
      toast.error(err.response?.data?.message || 'Failed to accept offer');
    } finally {
      setRespondingOfferId(null);
    }
  };

  // Handle Decline Offer
  const handleDeclineOffer = async (offerId, companyName, role) => {
    if (
      !window.confirm(
        `Are you sure you want to DECLINE the employment offer for ${role} at ${companyName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setRespondingOfferId(offerId);
    try {
      const res = await api.put(`/offers/${offerId}/decline`);
      if (res.data.success) {
        toast.success(res.data.message);
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Decline offer error:', err);
      toast.error(err.response?.data?.message || 'Failed to decline offer');
    } finally {
      setRespondingOfferId(null);
    }
  };

  // Compute status counts
  const counts = {
    applied: applications.filter((a) => a.status === 'applied').length,
    shortlisted: applications.filter((a) => a.status === 'shortlisted' || a.status === 'interview').length,
    selected: applications.filter((a) => a.status === 'selected').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const isPlaced = placements.length > 0;
  const primaryPlacement = isPlaced ? placements[0] : null;

  // Filter pending active offers that need student response
  const activeOffers = myOffers.filter((o) => o.status === 'offered');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, {user?.name || 'Student'}! 👋
          </h1>
          <p className="text-sm text-slate-500">
            {student?.branch} • Batch {student?.batchYear} • CGPA: {student?.cgpa}
          </p>
        </div>
        <Link
          to="/student/drives"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors self-start sm:self-auto"
        >
          <Briefcase className="w-4 h-4" />
          <span>Explore Eligible Drives</span>
        </Link>
      </div>

      {/* PROMINENT ACTIVE OFFERS CARD (if student has pending offer) */}
      {activeOffers.length > 0 && (
        <div className="space-y-3">
          {activeOffers.map((offer) => (
            <div
              key={offer._id}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white shadow-xl shadow-orange-500/20 border border-amber-400"
            >
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shrink-0">
                    <Sparkles className="w-8 h-8 text-amber-100" />
                  </div>
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-white text-orange-700 uppercase tracking-wider">
                      Official Employment Offer Extended!
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                      {offer.company?.name || 'Corporate Recruiter'}
                    </h2>
                    <p className="text-xs sm:text-sm text-amber-50 font-medium">
                      Designation: <span className="font-bold text-white">{offer.role}</span> • Package:{' '}
                      <span className="font-black text-amber-200 text-base">{offer.packageLpa ? `${offer.packageLpa} LPA` : 'As per policy'}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-amber-100 pt-1">
                      {offer.joiningDate && (
                        <span>Joining Date: {new Date(offer.joiningDate).toLocaleDateString()}</span>
                      )}
                      <span>•</span>
                      <span className="font-bold underline">
                        Accept before: {new Date(offer.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
                  <button
                    onClick={() => handleDeclineOffer(offer._id, offer.company?.name, offer.role)}
                    disabled={respondingOfferId === offer._id}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-sm border border-white/30 transition-all disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={() => handleAcceptOffer(offer._id, offer.company?.name, offer.role)}
                    disabled={respondingOfferId === offer._id}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-orange-700 hover:bg-amber-50 text-xs font-black shadow-lg shadow-black/10 transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span>{respondingOfferId === offer._id ? 'Processing...' : 'Accept Offer'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Placement Status Banner */}
      {isPlaced ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-6 text-white shadow-lg shadow-emerald-900/10">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shrink-0">
                <Award className="w-8 h-8 text-amber-300" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>CONGRATULATIONS! YOU ARE PLACED</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                  Selected at {primaryPlacement.company?.name}
                </h2>
                <p className="text-sm text-emerald-100 mt-0.5">
                  Role: <span className="font-semibold text-white">{primaryPlacement.drive?.role || 'Engineer'}</span> •
                  Package: <span className="font-bold text-amber-200">{primaryPlacement.packageLpa ? `${primaryPlacement.packageLpa} LPA` : 'As per policy'}</span>
                </p>
              </div>
            </div>
            <Link
              to="/student/placements"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition-colors shadow-sm self-start md:self-auto"
            >
              <span>View Offer Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Active Candidate Status
              </span>
              <h2 className="text-xl font-bold">Seeking Campus Placement Opportunities</h2>
              <p className="text-xs text-slate-300 max-w-xl">
                You have {eligibleDrives.length} active drive(s) matching your branch and academic criteria. Keep your resume up to date.
              </p>
            </div>
            <Link
              to="/student/drives"
              className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors shrink-0 self-start sm:self-auto shadow-sm"
            >
              Browse Open Drives ({eligibleDrives.length})
            </Link>
          </div>
        </div>
      )}

      {/* UPCOMING INTERVIEW SLOTS (Task 29B) */}
      {interviewSlots.length > 0 && (
        <div className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Scheduled Interview Slots</h3>
                <p className="text-[11px] text-slate-500">Live queue slots, panel details, and virtual interview meeting rooms</p>
              </div>
            </div>
            <Link
              to="/student/applications"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View Pipeline
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interviewSlots.map((slot) => {
              const activeToJoin = canJoinSlot(slot);
              const isSlotInProgress = slot.status === 'in_progress';
              const isCompleted = slot.status === 'completed';
              const isNoShow = slot.status === 'no_show';

              let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
              if (slot.status === 'checked_in') statusBadge = 'bg-amber-100 text-amber-800 border-amber-200';
              else if (isSlotInProgress) statusBadge = 'bg-sky-100 text-sky-800 border-sky-300 animate-pulse';
              else if (isCompleted) statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              else if (isNoShow) statusBadge = 'bg-rose-100 text-rose-800 border-rose-200';

              return (
                <div
                  key={slot._id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    isSlotInProgress
                      ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/50 to-white shadow-md shadow-indigo-500/10'
                      : 'border-slate-200/80 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                          {slot.round?.drive?.company?.name || 'Recruiter'} • {slot.round?.drive?.role}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">{slot.round?.name || 'Interview Round'}</h4>
                      <p className="text-xs text-slate-500">
                        {slot.panel?.name} (Queue #{slot.queueNumber})
                      </p>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusBadge}`}>
                      {slot.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {formatISTDateTime(slot.startTime)} - {formatISTTime(slot.endTime)} IST
                      </span>
                    </div>

                    {slot.panel?.interviewers?.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">Interviewers:</span>{' '}
                        {slot.panel.interviewers.map((iv) => iv.name).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Join Room Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Link
                      to={`/student/interview/${slot._id}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                      <span>{isSlotInProgress ? 'Join Interview Room (Called!)' : activeToJoin ? 'Enter Interview Room' : 'View Interview Room'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* Feedback Shared with Student */}
                  {slot.evaluation && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>Recruiter Evaluation Score</span>
                        </span>
                        <span className="font-black text-indigo-600 text-sm">{slot.evaluation.score}%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] text-center text-slate-600 pt-1">
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Tech: <strong>{slot.evaluation.criteriaScores?.technical}/5</strong>
                        </div>
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Problem: <strong>{slot.evaluation.criteriaScores?.problemSolving}/5</strong>
                        </div>
                        <div className="p-1 bg-white rounded-lg border border-slate-200">
                          Comm: <strong>{slot.evaluation.criteriaScores?.communication}/5</strong>
                        </div>
                      </div>
                      {slot.evaluation.comments && (
                        <p className="text-[11px] text-slate-600 italic pt-1">
                          "{slot.evaluation.comments}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* UPCOMING ROUNDS CARD */}
      {(() => {
        const validUpcomingRounds = upcomingRounds.filter((item) => {
          const startTime = item.startTime || item.batch?.startTime;
          const company = item.companyName || item.drive?.company?.name;
          const roundName = item.roundName || item.round?.name;
          return Boolean(startTime && (company || roundName));
        });

        if (validUpcomingRounds.length === 0) return null;

        return (
          <div className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Upcoming Interview & Evaluation Rounds</h3>
                  <p className="text-[11px] text-slate-500">Scheduled batch times and venue or virtual meeting links</p>
                </div>
              </div>
              <Link
                to="/student/applications"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                View All Applications
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {validUpcomingRounds.map((item, idx) => {
                const companyName = item.companyName || item.drive?.company?.name || 'Recruiter';
                const roleName = item.role || item.drive?.role || '';
                const roundTitle = item.roundName || item.round?.name || 'Recruitment Round';
                const startTime = item.startTime || item.batch?.startTime;
                const endTime = item.endTime || item.batch?.endTime;
                const venueOrLink = item.venueOrLink || item.batch?.venueOrLink;
                const mode = item.mode || item.batch?.mode || item.round?.mode || 'Offline';
                const instructions = item.instructions || item.round?.instructions;
                const batchName = item.batchName || item.batch?.batchName;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 space-y-2.5 hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                          {companyName} {roleName ? `• ${roleName}` : ''}
                        </span>
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {roundTitle} {batchName ? `(${batchName})` : ''}
                        </h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          mode === 'online'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {mode}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {startTime
                            ? `${formatISTDateTime(startTime).split(',')[0]} • ${formatISTTime(startTime)} - ${formatISTTime(endTime)} IST`
                            : 'Slot Scheduled'}
                        </span>
                      </div>

                      {venueOrLink && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {venueOrLink.startsWith('http') ? (
                            <a
                              href={venueOrLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold truncate"
                            >
                              <span>Join Meeting Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-700 font-medium truncate">{venueOrLink}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {instructions && (
                      <p className="text-[11px] text-slate-500 italic line-clamp-1 border-t border-slate-100 pt-1.5">
                        "{instructions}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Applied */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Applied
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{counts.applied}</span>
          </div>
        </div>

        {/* Shortlisted / Interview */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              In Review
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{counts.shortlisted}</span>
          </div>
        </div>

        {/* Selected */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Selected
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{counts.selected}</span>
          </div>
        </div>

        {/* Rejected */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Rejected
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{counts.rejected}</span>
          </div>
        </div>
      </div>

      {/* Grid: Recent Applications & Eligible Drives Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Applications Preview */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="font-bold text-slate-900 text-sm">Recent Applications</h3>
            <Link
              to="/student/applications"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
            >
              View All ({applications.length})
            </Link>
          </div>

          {applications.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              You haven't submitted any applications yet.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {applications.slice(0, 3).map((app) => (
                <div
                  key={app._id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-xs">
                      {app.drive?.company?.name?.charAt(0) || 'C'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {app.drive?.company?.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {app.drive?.role} • {app.drive?.packageLpa} LPA
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize shrink-0 ${
                      app.status === 'selected'
                        ? 'bg-emerald-100 text-emerald-700'
                        : app.status === 'rejected'
                        ? 'bg-rose-100 text-rose-700'
                        : app.status === 'shortlisted' || app.status === 'interview'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Eligible Drives Preview */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="font-bold text-slate-900 text-sm">Open Eligible Drives</h3>
            <Link
              to="/student/drives"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
            >
              Browse All ({eligibleDrives.length})
            </Link>
          </div>

          {eligibleDrives.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No matching drives available right now.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {eligibleDrives.slice(0, 3).map((drive) => (
                <div
                  key={drive._id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {drive.company?.name} - {drive.role}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-2">
                        <span>{drive.packageLpa} LPA</span>
                        <span>•</span>
                        <span>Apply by {new Date(drive.lastDateToApply).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/student/drives"
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
