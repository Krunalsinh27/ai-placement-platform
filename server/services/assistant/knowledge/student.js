/**
 * Curated Help Knowledge Base for Students.
 * Pre-written step-by-step guides matching the exact PlacementPortal UI, routes, and button labels.
 */

const STUDENT_HELP_TOPICS = [
  {
    id: 'student-apply-drive',
    title: 'How to Apply for a Placement Drive',
    role: 'student',
    keywords: [
      'apply',
      'how to apply',
      'apply drive',
      'apply to drive',
      'application process',
      'job application',
      'register drive',
      'enroll in drive',
    ],
    answer: `Here is how to apply for an active placement drive:
1. Navigate to "Eligible Drives" (/student/drives) from your sidebar.
2. Review the list of open campus drives. Each card displays your real-time skill match percentage (or "No skill requirements listed"), role designation, package (CTC in LPA), location, and deadline.
3. Review the allowed branches, minimum CGPA, and maximum backlogs to confirm your eligibility.
4. Click the "Apply Now" button before the stated deadline.
5. Once submitted, the button updates to "Applied", and you can track your status anytime under "My Applications" (/student/applications).`,
  },
  {
    id: 'student-resume-ai',
    title: 'How Resume AI & ATS Readiness Works',
    role: 'student',
    keywords: [
      'resume ai',
      'how resume ai works',
      'ats score',
      'ats readiness',
      'parse resume',
      'resume analysis',
      'bullet rewrites',
      'missing skills',
    ],
    answer: `Resume AI analyzes your PDF resume deterministically and aligns it with campus openings:
1. First, upload your resume PDF in "My Profile" (/student/profile) under "Upload New Resume (PDF only, max 2MB)" and click "Confirm Upload".
2. Navigate to "Resume AI" (/student/resume-ai) from your sidebar and click "Analyze Resume with AI" (or "Re-Analyze Resume").
3. Your skills are extracted into structured groups: Languages, Frontend, Backend, Databases, Tools & Platforms, Concepts, and CS Fundamentals.
4. Confirm or add your proficiencies and click "Save Confirmed Skills". (Project and experience evidence carries 1.0 weight vs 0.7 for list-only mentions).
5. In the "Target Job Analyzer" section, choose "Select Drive" or "Paste Job Description" and click "Analyze Against Job" to get your deterministic ATS Readiness Score (0-100), breakdown, missing skills, and bullet suggestions with "Copy Rewrite".`,
  },
  {
    id: 'student-interview-process',
    title: 'How to Attend Online Interviews',
    role: 'student',
    keywords: [
      'interview',
      'attend interview',
      'interview room',
      'join interview',
      'interview slot',
      'meeting link',
      'online interview',
    ],
    answer: `To attend your scheduled campus interview:
1. Open "My Applications" (/student/applications) and check the "Scheduled Interview Slots" section at the top.
2. When your slot approaches (active 10 minutes prior to start), click "Enter Interview Room" (or "Join Interview Room (Called!)").
3. Inside your interview room, check your assigned queue number, countdown timer, and interview panel name.
4. Click "Mark Check-In" to signal the panel that you have arrived in queue.
5. When called in, click the prominent banner button "Enter Meeting Room Now" to join the live meeting with your interviewers.`,
  },
  {
    id: 'student-aptitude-test',
    title: 'How to Take Online Aptitude Tests',
    role: 'student',
    keywords: [
      'aptitude test',
      'online test',
      'assessment',
      'mcq test',
      'take test',
      'exam',
      'start test',
    ],
    answer: `To take an assigned platform aptitude or technical test:
1. When an assessment round opens, navigate to "My Applications" (/student/applications) or open the test link from your candidate room.
2. On the assessment pre-test screen, review Duration, Questions, Total Marks, Negative Marking, and Guidelines.
3. Click "Begin Assessment" and then click "Confirm & Begin Assessment" in the confirmation dialog.
4. Answer the multiple-choice questions using the question palette. Every selection is automatically saved to the server in real time. (Note: Tab switches are monitored and logged for security).
5. Review your responses and click "Submit Assessment" before the timer expires.`,
  },
  {
    id: 'student-application-statuses',
    title: 'Understanding Application Statuses',
    role: 'student',
    keywords: [
      'status',
      'application status',
      'statuses',
      'status meaning',
      'shortlisted',
      'applied',
      'selected',
      'rejected',
      'what does status mean',
    ],
    answer: `Here is what each application status badge means in "My Applications":
• Applied: Your application was submitted successfully and is awaiting recruiter review.
• Shortlisted: The recruiter evaluated your academic profile & skill match and selected you for the evaluation rounds.
• Interview Round: You are actively participating in an assessment, technical test, or interview slot.
• Selected / Placed: You have cleared all rounds and an official placement offer has been recorded.
• Not Selected: You were not shortlisted or did not clear a specific evaluation stage for this particular drive.
Click "View Pipeline" on any application row to open the complete "Candidate Selection Timeline" modal.`,
  },
  {
    id: 'student-profile-update',
    title: 'How to Update Profile, CGPA, and Backlogs',
    role: 'student',
    keywords: [
      'update profile',
      'edit profile',
      'change cgpa',
      'backlogs',
      'profile details',
      'enrollment number',
      'change details',
    ],
    answer: `To review or update your student details:
1. Click "My Profile" (/student/profile) in the sidebar.
2. In the "Uploaded Resume" card, choose a PDF file under "Upload New Resume (PDF only, max 2MB)" and click "Confirm Upload".
3. Update your academic and contact details: Branch, Passing Batch Year, Current CGPA (0.00 - 10.00), Active Backlogs, Phone Number, LinkedIn, and GitHub links.
4. Toggle "Send me reminder emails" to receive 24h and 1h reminders before interview slots.
5. Click "Save Profile Changes" at the bottom of the form to save your updates.`,
  },
  {
    id: 'student-eligibility-criteria',
    title: 'Why Am I Ineligible for a Placement Drive?',
    role: 'student',
    keywords: [
      'not eligible',
      'eligibility criteria',
      'why not eligible',
      'ineligible',
      'why cannot apply',
      'branch criteria',
      'cgpa cutoff',
    ],
    answer: `Eligibility for every campus drive is governed by five strict criteria:
1. College: The drive must be hosted for your college or include your college in pooled drives.
2. Branch: Your discipline (e.g. CSE, IT, ECE) must be included under the drive's "Allowed Branches".
3. CGPA: Your current CGPA must be greater than or equal to the drive's minimum CGPA threshold.
4. Backlogs: Your active backlog count must not exceed the drive's maximum allowed backlogs.
5. Deadline: The drive application deadline must not have passed in Asia/Kolkata (IST).
You can ask me "Am I eligible for Google?" to view your exact pass/fail reasons.`,
  },
  {
    id: 'student-offers-placements',
    title: 'How to Review and Accept Placement Offers',
    role: 'student',
    keywords: [
      'accept offer',
      'job offer',
      'placement offer',
      'my placements',
      'offer letter',
      'decline offer',
      'package lpa',
    ],
    answer: `To review, accept, or track placement offers:
1. Go to "My Applications" (/student/applications) and locate the drive with an extended offer.
2. Click "View Pipeline" on the application row to open the "Candidate Selection Timeline".
3. Under the Final Milestone "Corporate Placement Offer", review the Role Designation, Annual CTC (LPA), Joining Date, and Acceptance Deadline.
4. Click "Accept & Confirm Placement" to confirm your placement (or click "Decline Offer" to decline).
5. All official confirmed placement packages and company confirmations are displayed under "My Placements" (/student/placements).`,
  },
];

module.exports = {
  STUDENT_HELP_TOPICS,
};
