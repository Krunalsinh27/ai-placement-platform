/**
 * Curated Help Knowledge Base for TPOs & College Administrators.
 * Pre-written step-by-step guides matching the exact PlacementPortal UI, routes, and button labels.
 */

const TPO_HELP_TOPICS = [
  {
    id: 'tpo-schedule-drive',
    title: 'How to Schedule a Campus Drive',
    role: 'tpo',
    keywords: [
      'schedule drive',
      'how to schedule',
      'schedule the campus drive',
      'schedule campus drive',
      'create drive',
      'new drive',
      'set up drive',
      'create a drive',
      'post drive',
    ],
    answer: `Here is how to schedule and publish a campus placement drive:
1. Navigate to "Drives" (/admin/drives) from the sidebar and click the "Create Drive" button in the top header.
2. In the modal, select the recruiting Company from the registered partner list (or register them first under "Companies").
3. Enter the Role Title, CTC Package (in LPA), and Location.
4. Set Eligibility Criteria: Minimum CGPA, Maximum Backlogs permitted, Target Batch Year, and select Allowed Branches (e.g. CSE, IT, ECE).
5. Specify the Application Deadline (Last Date to Apply) and the Drive Date.
6. Click "Create Drive" to save and publish. Eligible students will immediately see the drive in their "Eligible Drives" list with real-time skill matching.`,
  },
  {
    id: 'tpo-verify-students',
    title: 'How to Verify and Approve Student Profiles',
    role: 'tpo',
    keywords: [
      'verify students',
      'approve students',
      'student approval',
      'verify student',
      'student verification',
      'pending students',
      'academic verification',
    ],
    answer: `To verify and approve newly registered student profiles:
1. Navigate to "Dashboard" (/admin/dashboard) from the sidebar.
2. Scroll to the "Pending Student Approvals" section (active when "TPO approval for new students" is toggled ON).
3. Review the candidate card: Student Name, Enrollment Number, Branch, Batch Year, CGPA, Email, and Phone.
4. If details match your college records, click "Approve" (or click "Reject" if invalid).
5. Approved students become verified in the system and are immediately eligible to register for matching campus drives. (You can also view all enrolled students anytime under "Students").`,
  },
  {
    id: 'tpo-drive-requests',
    title: 'How to Handle Incoming Recruiter Drive Requests',
    role: 'tpo',
    keywords: [
      'drive requests',
      'incoming requests',
      'recruiter requests',
      'accept request',
      'reschedule drive',
      'reject request',
      'manage requests',
    ],
    answer: `To manage campus drive proposals submitted by recruiters:
1. Open "Drive Requests" (/admin/drive-requests) from the sidebar.
2. Review incoming proposals showing Company, Role, Package (LPA), Openings, and proposed Drive Dates.
3. On any pending request card, choose an action:
   - Accept: Click "Accept" to lock the date and move the request to accepted status.
   - Reschedule: Click "Reschedule" to propose alternate dates aligned with your college calendar.
   - Decline: Click "Decline" with an optional note to turn down the invitation.
   - Chat: Click "Chat" to message the recruiter directly.
4. Once accepted, click "Schedule Drive" on the request card to prefill the drive form, set cutoffs, and publish to students.`,
  },
  {
    id: 'tpo-ranked-applicants',
    title: 'How AI Ranked Applicants & Explainable Matches Work',
    role: 'tpo',
    keywords: [
      'ranked applicants',
      'applicant ranking',
      'ai ranking',
      'match score',
      'explainable match',
      'skill evidence',
      'candidate ranking',
    ],
    answer: `The platform ranks applicants for each drive using a strictly deterministic scoring formula:
1. Go to "Drives" (/admin/drives) and click "Recruitment Pipeline & Progress" on any drive row.
2. Switch to the "Applicants List" tab and click the "Rank by AI match" toggle button.
3. Applicants are ranked by skill alignment score (0-100%):
   - Required skills carry 75% of the skill score; preferred skills carry 25%.
   - Skills verified in projects or work experience receive full weight (1.0).
   - Skills declared without context in a skill list receive partial weight (0.7).
   - Academic benchmarks (CGPA, backlogs, branch) determine hard eligibility.
   - Demographic attributes are strictly excluded from all calculations.
4. Click "AI Explanation" on any applicant card to see an explainable breakdown of why the candidate was ranked at that position.`,
  },
  {
    id: 'tpo-export-reports',
    title: 'How to Export Placement Reports and Analytics',
    role: 'tpo',
    keywords: [
      'export report',
      'placement report',
      'excel export',
      'download report',
      'csv export',
      'analytics export',
      'spreadsheet',
    ],
    answer: `To export college placement records and reports:
1. For comprehensive placement reports: Navigate to "Placement Report" (/admin/reports), select your Batch Year and Department filter, and click "Download Excel" or "Download CSV" in the top-right header.
2. For verified placement roster summaries: Navigate to "Placements" (/admin/placements), filter by Branch, Company, or Batch, and click "Export Excel" or "Export PDF".
3. Security: All user-supplied text values (names, titles) are automatically neutralized against spreadsheet formula injection (=, +, -, @).`,
  },
  {
    id: 'tpo-round-progress',
    title: 'How to Manage Rounds & Progress Candidates',
    role: 'tpo',
    keywords: [
      'round progress',
      'drive pipeline',
      'progress students',
      'advance candidates',
      'shortlist round',
      'manage rounds',
    ],
    answer: `To monitor evaluation rounds and candidate progress:
1. In "Drives" (/admin/drives), click "Recruitment Pipeline & Progress" (/admin/drives/:id/progress).
2. The "Round Pipeline" tab shows candidate participant counts across Applied, Online Assessment, Technical Interview, and HR / Final stages.
3. Review round metrics: Cleared, Pending, Rejected, and No Show.
4. If a student experienced technical difficulty or an unforeseen emergency during an aptitude test or interview, click "Allow Re-test" in the slots or test table to reset their attempt.`,
  },
  {
    id: 'tpo-freeze-applications',
    title: 'How to Close Applications and Freeze Candidate Lists',
    role: 'tpo',
    keywords: [
      'freeze applications',
      'close applications',
      'freeze candidate list',
      'reopen applications',
      'freeze list',
      'lock applications',
    ],
    answer: `To lock registrations and advance to evaluation rounds:
1. Open "Drives" (/admin/drives) and click "Recruitment Pipeline & Progress" (/admin/drives/:id/progress).
2. In the top action banner, click "Close Applications & Freeze List" before or at the application deadline.
3. Freezing locks the applicant roster and automatically seeds Round 1 with all eligible registered candidates.
4. If registrations closed prematurely and no round has started yet, you can click "Reopen Applications" before the deadline to allow additional student registrations.`,
  },
  {
    id: 'tpo-interview-panels',
    title: 'How to Configure Interview Panels and Slot Schedules',
    role: 'tpo',
    keywords: [
      'interview panel',
      'configure panel',
      'time slots',
      'schedule interview',
      'panelist',
      'interview slots',
      'slot timing',
    ],
    answer: `To oversee interview rounds and panel scheduling:
1. Under Drive Progress (/admin/drives/:id/progress), select an interview round in the "Round Pipeline" tab.
2. Review the "Configured Panels" cards: Panel Name, Assigned Interviewers, Meeting Link / Venue, and candidate capacity.
3. In the "Live Queue Slots & Re-Test Actions" table, monitor candidate queue numbers, scheduled slot times (IST), status (checked_in, in_progress, completed, no_show), and panelist evaluation scores.
4. If an absent candidate is excused, click "Allow Re-test" to reset their slot.`,
  },
];

module.exports = {
  TPO_HELP_TOPICS,
};
