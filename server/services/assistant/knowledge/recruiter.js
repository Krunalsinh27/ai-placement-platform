/**
 * Curated Help Knowledge Base for Recruiters.
 * Pre-written step-by-step guides matching the exact PlacementPortal UI, routes, and button labels.
 */

const RECRUITER_HELP_TOPICS = [
  {
    id: 'recruiter-create-job-requirement',
    title: 'How to Post a New Job Requirement',
    role: 'recruiter',
    keywords: [
      'job requirement',
      'post job',
      'create requirement',
      'new requirement',
      'hiring profile',
      'create job',
      'post opening',
    ],
    answer: `Here is how to create and manage job requirements:
1. Navigate to "Job Requirements" (/recruiter/requirements) from your recruiter sidebar.
2. Click "Post New Requirement" in the top header.
3. Fill in Job Title, Openings, Package (CTC in LPA), Location, Selection Rounds, and Job Description.
4. Specify Required Skills and Preferred Skills (e.g. React, Node.js, Python, SQL) to drive deterministic candidate matching.
5. Set academic thresholds: Target Batch Year, Minimum CGPA, Maximum Backlogs permitted, and select Allowed Branches.
6. Set status to "Published" (so colleges can see it) and click "Save Requirement". You can now attach this profile to campus drive requests.`,
  },
  {
    id: 'recruiter-request-campus-drive',
    title: 'How to Request a Campus Drive with Colleges',
    role: 'recruiter',
    keywords: [
      'request drive',
      'request campus drive',
      'drive request',
      'invite college',
      'propose dates',
      'new drive request',
      'schedule drive request',
    ],
    answer: `To initiate a campus recruitment drive proposal with college partners:
1. Open "Drive Requests" (/recruiter/drive-requests) from your sidebar.
2. Click the "Send Drive Request" button in the header. (Note: You must have at least one published Job Requirement).
3. Select an existing published Job Requirement.
4. Choose the target partner College from the institutional directory.
5. Select Drive Mode (On-Campus or Virtual) and propose 1 to 3 preferred drive dates.
6. Click "Send Request to College". The college TPO will receive immediate notification to Accept, Reschedule, or coordinate details.`,
  },
  {
    id: 'recruiter-review-pipeline',
    title: 'How to Track Candidate Pipelines and Drive Funnels',
    role: 'recruiter',
    keywords: [
      'drive pipeline',
      'track candidates',
      'candidate stages',
      'pipeline list',
      'review applicants',
      'recruitment funnel',
      'pipeline progress',
    ],
    answer: `To track and manage candidates through evaluation rounds:
1. Open "Drive Pipeline" (/recruiter/pipeline) from your sidebar to see all confirmed campus drives.
2. Click on a drive to open its pipeline (/recruiter/drives/:id/pipeline).
3. The top navigation displays your sequential round tabs (e.g. Round 1, Round 2) plus the final "Offers & Selection" tab.
4. Review candidate participants, test results, and attendance.
5. Update candidate scores and outcomes (Cleared, Rejected, Pending) and click "Save Evaluation Results" or "Save Attendance Only" at the bottom of the table.`,
  },
  {
    id: 'recruiter-view-ranked-applicants',
    title: 'How to View AI Ranked Applicants and Skill Evidence',
    role: 'recruiter',
    keywords: [
      'ranked applicants',
      'top candidates',
      'ai ranking',
      'skill score',
      'evaluate candidates',
      'match percentage',
      'best applicants',
    ],
    answer: `To identify high-potential candidates aligned with your role requirements:
1. Open the Drive Pipeline (/recruiter/drives/:id/pipeline) for your active drive and click the "Rank by AI match" button in the header.
2. Applicants are ranked deterministically by their skill alignment score (0-100%):
   - Skills verified in projects or work experience receive full weight (1.0).
   - Skills declared without context in a skill list receive partial weight (0.7).
   - Missing required and preferred skills are clearly itemized.
   - Protected demographic attributes are strictly excluded from all ranking algorithms.
3. Click "AI Explanation" on any applicant card to review an explainable summary of candidate strengths before shortlisting.`,
  },
  {
    id: 'recruiter-schedule-interviews',
    title: 'How to Conduct Interviews and Log Feedback',
    role: 'recruiter',
    keywords: [
      'conduct interview',
      'evaluate candidate',
      'interview slot',
      'give feedback',
      'score candidate',
      'interview panel',
      'interview room',
    ],
    answer: `To manage interviews and evaluate candidates:
1. In Drive Pipeline (/recruiter/drives/:id/pipeline), click into your Interview Round tab.
2. Review your assigned interview panel cards and the candidate slots table.
3. Click "Call Next Candidate" on the panel card to admit the next checked-in candidate in queue.
4. Update slot status (in_progress, completed, no_show) and log candidate evaluation scores across technical competency, problem solving, and communication.
5. Click "Save Evaluation Results" to persist ratings and advance successful candidates.`,
  },
  {
    id: 'recruiter-extend-offers',
    title: 'How to Extend Job Offers to Selected Candidates',
    role: 'recruiter',
    keywords: [
      'extend offer',
      'make offer',
      'select candidate',
      'issue offer',
      'job offer',
      'offer package',
      'confirm selection',
    ],
    answer: `To extend official job offers to candidates who cleared all evaluation rounds:
1. In Drive Pipeline (/recruiter/drives/:id/pipeline), switch to the "Offers & Selection" tab.
2. Click the "Extend Bulk Offers" button in the header.
3. In the modal, review the candidates who cleared the final stage and check the boxes for students receiving offers.
4. Specify Role Designation, Package (CTC in LPA), Anticipated Joining Date, and Offer Acceptance Deadline.
5. Click "Send Offers". The candidates and college TPO receive instant notifications, and candidates can formally Accept or Decline via their portal.`,
  },
];

module.exports = {
  RECRUITER_HELP_TOPICS,
};
