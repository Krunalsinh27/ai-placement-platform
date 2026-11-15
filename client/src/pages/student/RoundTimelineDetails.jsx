import React from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  Clock,
  MapPin,
  ExternalLink,
  Play,
} from 'lucide-react';
import { getTestButtonState } from '../../utils/testWindowHelper';
import { formatISTDateTime } from '../../utils/dateTime';

/**
 * Renders round-specific timeline details for students.
 * For deliveryMode === 'platform_test': hides batch and venue lines, displays the test window and status.
 * For offline/external rounds: displays batch schedule timing and venue / meeting link.
 */
export function RoundTimelineDetails({ round: r, interviewSlots = [], timelineData = {} }) {
  if (r.deliveryMode === 'platform_test') {
    const btnState = getTestButtonState({
      testWindowStart: r.testWindowStart,
      testWindowEnd: r.testWindowEnd,
      durationMinutes: r.durationMinutes,
      attemptStatus: r.attemptStatus || 'not_started',
      showScore: r.showScoreToStudents,
      score: r.score ?? r.testAttempt?.score,
      serverNow: r.serverNow || timelineData?.serverNow,
      receivedAt: timelineData?.receivedAt,
    });

    return (
      <div className="mt-2.5 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-3 text-xs" data-testid="platform-test-timeline">
        <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-600 text-white">
              <Layers className="w-3.5 h-3.5" />
            </span>
            <div>
              <span className="font-black text-indigo-950 text-xs block">Online Assessment</span>
              <span className="text-[10px] text-indigo-700 font-medium">On-platform test</span>
            </div>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              btnState.statusBadge.color === 'emerald'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : btnState.statusBadge.color === 'amber'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : btnState.statusBadge.color === 'rose'
                ? 'bg-rose-100 text-rose-800 border-rose-200'
                : btnState.statusBadge.color === 'slate'
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-indigo-100 text-indigo-800 border-indigo-200'
            }`}
          >
            {btnState.statusBadge.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white/80 p-3 rounded-xl border border-indigo-100/60">
          <div>
            <span className="text-slate-400 block font-medium">Window Opens (IST):</span>
            <strong className="text-slate-800 font-semibold">
              {r.testWindowStart ? formatISTDateTime(r.testWindowStart) : 'TBD'}
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Window Closes (IST):</span>
            <strong className="text-slate-800 font-semibold">
              {r.testWindowEnd ? formatISTDateTime(r.testWindowEnd) : 'TBD'}
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Duration:</span>
            <strong className="text-slate-800 font-semibold">{r.durationMinutes || 60} minutes</strong>
          </div>
          {r.cutoffScore !== null && r.cutoffScore !== undefined && (
            <div>
              <span className="text-slate-400 block font-medium">Passing Cutoff:</span>
              <strong className="text-emerald-700 font-semibold">{r.cutoffScore}%</strong>
            </div>
          )}
        </div>

        {r.instructions && (
          <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60 text-[11px] text-amber-900">
            <strong className="block font-bold">Instructions:</strong>
            <span>{r.instructions}</span>
          </div>
        )}

        {r.showScoreToStudents && (r.score !== null || r.testAttempt?.score !== undefined) && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
            <span className="font-semibold">Your Test Score:</span>
            <span className="font-black text-sm">{r.score ?? r.testAttempt?.score} points</span>
          </div>
        )}

        <div className="pt-1">
          {btnState.disabled ? (
            <button
              type="button"
              disabled
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed text-center"
            >
              {btnState.label}
            </button>
          ) : (
            <Link
              to={`/student/test/${r.roundId}`}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all text-center ${
                btnState.action === 'resume'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
                  : btnState.action === 'view_result'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>{btnState.label}</span>
            </Link>
          )}
          <p className="text-[11px] text-slate-500 font-medium text-center mt-1.5">
            {btnState.reason}
          </p>
        </div>
      </div>
    );
  }

  // Offline / external / interview rounds
  const matchingSlot = interviewSlots.find((s) => s.round?._id === r.roundId);
  return (
    <div data-testid="offline-round-timeline">
      {r.batch ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>
              {r.batch.batchName}:{' '}
              {new Date(r.batch.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              -{' '}
              {new Date(r.batch.endTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {r.batch.venueOrLink?.startsWith('http') ? (
              <a
                href={r.batch.venueOrLink}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline font-semibold inline-flex items-center gap-1"
              >
                <span>Join Meeting</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span>{r.batch.venueOrLink || r.venueOrLink || 'To be announced'}</span>
            )}
          </div>
        </div>
      ) : matchingSlot ? null : (
        <div className="text-amber-700 italic text-[11px]">
          Batch scheduling is currently being assigned by the recruiter.
        </div>
      )}

      {r.instructions && (
        <p className="text-[11px] text-slate-500 italic pt-1">
          Instructions: "{r.instructions}"
        </p>
      )}

      {((r.score !== null && r.score !== undefined) || r.feedback) && (
        <div className="mt-2 p-2.5 rounded-xl bg-slate-100/70 text-slate-700 text-xs space-y-0.5">
          {r.score !== null && r.score !== undefined && (
            <div>
              <span className="font-semibold text-slate-500">Score:</span>{' '}
              <span className="font-bold">{r.score}</span>
            </div>
          )}
          {r.feedback && (
            <div>
              <span className="font-semibold text-slate-500">Feedback:</span>{' '}
              <span>{r.feedback}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RoundTimelineDetails;

