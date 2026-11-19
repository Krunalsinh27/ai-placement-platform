/**
 * Skill-Gap Learning Plan Service
 *
 * Generates an explainable, personalized 4-week learning roadmap for students
 * based on missing skills across their eligible placement drives.
 *
 * Strict Guarantees:
 * 1. Zod schema validation
 * 2. Strict URL safety: Never invents URLs. Curated allowlist links or null only.
 * 3. Deterministic offline fallback when AI is unavailable or rate-limited.
 */

const { z } = require('zod');
const { getCuratedResource, sanitizeResourceUrl } = require('./curatedLearningResources');
const { callAiWithQuotaAndRetry } = require('./aiClient');
const Student = require('../../models/Student');
const Drive = require('../../models/Drive');
const { computeMatchScore } = require('./matchingEngine');
const { getEndOfDayIST } = require('../../utils/pipelineService');

const SkillGapWeekSchema = z.object({
  week: z.number().int().min(1).max(8),
  skill: z.string().min(1),
  why: z.string().min(5),
  targetDrives: z.array(z.string()).default([]),
  resourceType: z.enum([
    'Official Documentation',
    'Hands-on Project',
    'Video Course',
    'Interactive Tutorial',
    'Practice Problems',
    'Technical Article',
  ]),
  resourceLink: z.string().url().nullable().optional(),
  estimatedHours: z.number().min(1).max(40),
  practiceTask: z.string().min(10),
});

const SkillGapPlanZodSchema = z.object({
  overview: z.string().min(10),
  targetSkills: z.array(z.string()).min(1),
  totalEstimatedHours: z.number().min(1),
  weeks: z.array(SkillGapWeekSchema).min(1).max(8),
});

/**
 * Extracts and prioritizes missing skills across a student's eligible drives.
 */
async function extractTopMissingSkillsForStudent(student, maxSkills = 4) {
  const now = new Date();
  const studentCollegeId =
    student.college?._id || student.college;

  const eligibleQuery = {
    minCgpa: { $lte: student.cgpa },
    maxBacklogs: { $gte: student.backlogs },
    allowedBranches: (student.branch || '').toUpperCase(),
  };

  if (studentCollegeId) {
    eligibleQuery.$or = [
      { college: studentCollegeId },
      { colleges: studentCollegeId },
    ];
  }

  const rawDrives = await Drive.find(eligibleQuery)
    .populate('company', 'name')
    .sort({ lastDateToApply: 1 });

  // Filter out drives whose deadline in IST has passed
  const activeDrives = rawDrives.filter((d) => {
    const deadlineEnd = getEndOfDayIST(d.lastDateToApply);
    return deadlineEnd && deadlineEnd >= now;
  });

  const skillWeightMap = new Map();

  for (const drive of activeDrives) {
    let match;
    try {
      match = computeMatchScore(student, drive);
    } catch {
      continue;
    }

    if (!match || !Array.isArray(match.missingSkills)) continue;

    const driveLabel = `${drive.role || 'Role'} (${drive.company?.name || 'Company'})`;

    for (const missing of match.missingSkills) {
      const norm = (typeof missing === 'string' ? missing : String(missing)).toLowerCase().trim();
      if (!norm) continue;

      if (!skillWeightMap.has(norm)) {
        skillWeightMap.set(norm, {
          name: norm,
          weight: 0,
          targetDrives: new Set(),
        });
      }

      const entry = skillWeightMap.get(norm);
      entry.weight += 1;
      entry.targetDrives.add(driveLabel);
    }
  }

  const sortedSkills = Array.from(skillWeightMap.values())
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .slice(0, maxSkills)
    .map((s) => ({
      name: s.name,
      weight: s.weight,
      targetDrives: Array.from(s.targetDrives),
    }));

  return {
    topMissingSkills: sortedSkills,
    activeDrivesCount: activeDrives.length,
  };
}

/**
 * Deterministic offline rule-based learning plan generator.
 */
function generateRuleBasedSkillGapPlan({ missingSkills = [], studentName = 'Student' }) {
  if (!missingSkills || missingSkills.length === 0) {
    const curated = getCuratedResource('git');
    return {
      overview: `Great job! Your profile currently meets all core skill requirements across your open eligible drives. Here is a recommended refinement track to sharpen industry workflows.`,
      targetSkills: ['git', 'ci_cd'],
      totalEstimatedHours: 12,
      weeks: [
        {
          week: 1,
          skill: 'git',
          why: 'Master professional version control workflows and branch collaboration required across software engineering teams.',
          targetDrives: ['General Technical Standard'],
          resourceType: curated ? curated.resourceType : 'Official Documentation',
          resourceLink: curated ? curated.url : null,
          estimatedHours: 6,
          practiceTask:
            'Practice interactive rebase, squashing commits, and resolving three-way merge conflicts on a sample Git repository.',
        },
        {
          week: 2,
          skill: 'ci_cd',
          why: 'Understand automated testing and continuous integration pipelines used in modern engineering environments.',
          targetDrives: ['DevOps Standard'],
          resourceType: 'Hands-on Project',
          resourceLink: sanitizeResourceUrl('https://docs.github.com/en/actions'),
          estimatedHours: 6,
          practiceTask:
            'Configure a GitHub Actions workflow to run unit tests and linting on every pull request automatically.',
        },
      ],
    };
  }

  const weeks = missingSkills.map((sk, idx) => {
    const weekNum = idx + 1;
    const skillName = typeof sk === 'string' ? sk : sk.name;
    const targetDrives = (sk.targetDrives && Array.isArray(sk.targetDrives)) ? sk.targetDrives : [];
    const curated = getCuratedResource(skillName);

    const whyText =
      targetDrives.length > 0
        ? `Identified as a core requirement for ${targetDrives.slice(0, 2).join(' and ')}${
            targetDrives.length > 2 ? ` and ${targetDrives.length - 2} more` : ''
          }.`
        : `Essential industry competency that boosts candidate qualification across technical placement drives.`;

    let resourceType = curated ? curated.resourceType : 'Hands-on Project';
    let resourceLink = curated ? curated.url : null;

    let practiceTask = `Design and implement a mini-project module utilizing ${skillName}. Build unit tests and document key architecture decisions.`;
    if (skillName.includes('docker') || skillName.includes('container')) {
      practiceTask = 'Create a multi-stage Dockerfile and docker-compose.yml to run a web service and database with isolated volumes.';
    } else if (skillName.includes('sql') || skillName.includes('database') || skillName.includes('mongo')) {
      practiceTask = `Design a normalized schema, write complex queries with aggregation/indexing, and benchmark query performance for ${skillName}.`;
    } else if (skillName.includes('test') || skillName.includes('jest')) {
      practiceTask = 'Write 10+ unit and integration tests covering edge cases and error handling for an existing API endpoint.';
    }

    return {
      week: weekNum,
      skill: skillName,
      why: whyText,
      targetDrives,
      resourceType,
      resourceLink,
      estimatedHours: 6,
      practiceTask,
    };
  });

  const targetSkills = weeks.map((w) => w.skill);
  const totalEstimatedHours = weeks.reduce((sum, w) => sum + w.estimatedHours, 0);

  return {
    overview: `Personalized ${weeks.length}-week technical roadmap targeted directly at closing high-frequency skill gaps across your eligible placement opportunities.`,
    targetSkills,
    totalEstimatedHours,
    weeks,
  };
}

/**
 * Generates an end-to-end skill gap plan for the given student user ID.
 */
async function generateSkillGapPlan({ studentUserId }) {
  const student = await Student.findOne({ user: studentUserId });
  if (!student) {
    throw new Error('Student profile not found');
  }

  const { topMissingSkills, activeDrivesCount } = await extractTopMissingSkillsForStudent(student, 4);

  // If there are no missing skills or no active drives
  if (topMissingSkills.length === 0) {
    return generateRuleBasedSkillGapPlan({ missingSkills: [], studentName: student.name });
  }

  // Attempt AI generation
  const skillsContext = topMissingSkills.map((s) => ({
    skill: s.name,
    frequencyAcrossDrives: s.weight,
    relevantDrives: s.targetDrives,
  }));

  const systemPrompt = `You are a university career & technical training strategist. Generate a structured weekly technical learning roadmap to help a student close identified skill gaps for upcoming campus placement drives.
CRITICAL CONSTRAINTS:
1. Valid JSON output only conforming to:
{
  "overview": string (2-3 sentences explaining the roadmap objective),
  "targetSkills": [string],
  "totalEstimatedHours": number,
  "weeks": [
    {
      "week": number (1 to 8),
      "skill": string,
      "why": string,
      "targetDrives": [string],
      "resourceType": "Official Documentation" | "Hands-on Project" | "Video Course" | "Interactive Tutorial" | "Practice Problems" | "Technical Article",
      "resourceLink": string or null,
      "estimatedHours": number,
      "practiceTask": string
    }
  ]
}
2. ABSOLUTE URL SAFETY RULE: NEVER invent, hallucinate, or construct speculative external URLs.
If you know the official documentation link, specify it; otherwise set "resourceLink": null.
3. Keep practice tasks actionable, hands-on, and focused on verifiable engineering deliverables.`;

  const userPrompt = `Student missing skills data block:\n<DATA_BLOCK>\n${JSON.stringify(skillsContext, null, 2)}\n</DATA_BLOCK>\n\nGenerate the structured weekly plan JSON:`;

  const aiResult = await callAiWithQuotaAndRetry({
    systemPrompt,
    userPrompt,
    mode: 'skill_gap_plan',
    userId: studentUserId,
    validateFn: (data) => {
      return SkillGapPlanZodSchema.parse(data);
    },
  });

  if (aiResult.success && aiResult.data?.weeks) {
    const plan = aiResult.data;
    // Strict URL sanitization and curated allowlist lookup
    for (const week of plan.weeks) {
      const curated = getCuratedResource(week.skill);
      if (week.resourceLink) {
        week.resourceLink = sanitizeResourceUrl(week.resourceLink);
      }
      // If AI returned null or invalid, fallback to curated resource if available
      if (!week.resourceLink && curated) {
        week.resourceLink = curated.url;
        week.resourceType = curated.resourceType;
      }
    }
    return plan;
  }

  // Graceful deterministic fallback
  return generateRuleBasedSkillGapPlan({
    missingSkills: topMissingSkills,
    studentName: student.name,
  });
}

module.exports = {
  SkillGapWeekSchema,
  SkillGapPlanZodSchema,
  extractTopMissingSkillsForStudent,
  generateRuleBasedSkillGapPlan,
  generateSkillGapPlan,
};
