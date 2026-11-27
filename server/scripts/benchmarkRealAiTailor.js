/**
 * Benchmark: First-Attempt Pass Rate of Real AI Provider Tailoring
 *
 * Runs 5 realistic resume + job description pairs against the REAL AI provider chain (e.g. Groq).
 * Evaluates:
 * 1. First-attempt summary rewrite against validateSummaryRewriteDetailed
 * 2. First-attempt bullet rewrites against validateBulletRewriteDetailed
 *
 * NEVER logs confidential candidate resume text.
 * Outputs pass rates, latency, and rejection reason codes / item types.
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

// Force real provider and non-test mode
process.env.NODE_ENV = 'development';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'groq';

const {
  validateSummaryRewriteDetailed,
  validateBulletRewriteDetailed,
  ALLOW_LISTED_OPENING_VERBS,
} = require('../services/resumeBuilder/resumeBuilderService');
const { callAiWithQuotaAndRetry } = require('../services/ai/aiClient');

const TAILOR_SYSTEM_PROMPT = `You are an executive ATS resume strategist and engineering hiring manager.
Your task is to analyze candidate resume bullets against target job requirements and suggest truthful, concise bullet rewrites.

CRITICAL HONESTY & SECURITY RULES:
1. NEVER invent employers, job titles, certifications, degrees, dates, or technical skills not present in the candidate profile.
2. NEVER invent concrete numbers or metrics (e.g. "reduced by 45%", "served 10,000 users").
   If suggesting a metric rewrite where the real number is unknown, you MUST use the exact placeholder token "[add your real number]" (e.g. "improved query throughput by [add your real number]%").
3. DO NOT add new outcomes, adjectives, adverbs, team or scale claims, or technologies not in the original text.
   A rewrite may ONLY:
   (a) change the opening verb to a truthful stronger synonym from the allow-list (built, developed, implemented, designed, integrated, tested, validated, deployed, managed),
   (b) reorder elements,
   (c) tighten wording.
4. BANNED INFLATION WORDS: You must NEVER use "seamlessly", "comprehensive", "robust", "cutting-edge", "scalable" (unless in the original), "collaborative" (unless in the original), "architected", "orchestrated", "spearheaded", "pioneered", "leveraged".
5. For the summary rewrite, you MUST keep every number and concrete fact from the original summary (e.g. "250+ problems on LeetCode", specific CGPA, platforms). Never drop verified metrics or facts.
6. Return strictly valid JSON.`;

const REALISTIC_PAIRS = [
  {
    domain: 'Frontend Engineering',
    targetRole: 'Frontend React Engineer',
    targetCompany: 'FinTech Platform Labs',
    baseResume: {
      summary: 'Frontend developer who built 3 responsive web applications with React and Redux, achieving 98% Lighthouse performance.',
      skills: [{ category: 'Frontend', items: ['react', 'redux', 'javascript', 'html', 'css', 'tailwind'] }],
      experience: [
        {
          company: 'FinTech Platform Labs',
          bullets: [
            'Built responsive user interface components using React and Tailwind',
            'Implemented state management with Redux across interactive dashboard views',
          ],
        },
      ],
      projects: [],
    },
  },
  {
    domain: 'Backend & Cloud Systems',
    targetRole: 'Backend Systems Engineer',
    targetCompany: 'CloudScale Infrastructure',
    baseResume: {
      summary: 'Backend engineer experienced in developing microservices with Node.js and MongoDB, serving 15,000 daily API requests.',
      skills: [{ category: 'Backend', items: ['nodejs', 'express', 'mongodb', 'redis', 'docker'] }],
      experience: [
        {
          company: 'CloudScale Infrastructure',
          bullets: [
            'Developed RESTful API endpoints with Node.js and Express',
            'Integrated Redis caching to reduce database query execution times',
          ],
        },
      ],
      projects: [],
    },
  },
  {
    domain: 'Data Engineering & Analytics',
    targetRole: 'Data Pipeline Engineer',
    targetCompany: 'DataStream Analytics',
    baseResume: {
      summary: 'Data engineer who implemented 4 automated ETL pipelines with Python and PostgreSQL, processing 50GB weekly telemetry.',
      skills: [{ category: 'Data', items: ['python', 'pandas', 'sql', 'postgresql'] }],
      experience: [
        {
          company: 'DataStream Analytics',
          bullets: [
            'Developed data extraction and transformation pipelines using Python and Pandas',
            'Optimized PostgreSQL table indexing and analytical queries',
          ],
        },
      ],
      projects: [],
    },
  },
  {
    domain: 'DevOps & Site Reliability',
    targetRole: 'DevOps Cloud Engineer',
    targetCompany: 'Nexus Cloud Platforms',
    baseResume: {
      summary: 'DevOps practitioner who automated CI/CD workflows across 8 microservices using Docker and GitHub Actions with 99.9% build reliability.',
      skills: [{ category: 'DevOps', items: ['docker', 'linux', 'bash', 'git', 'aws'] }],
      experience: [
        {
          company: 'Nexus Cloud Platforms',
          bullets: [
            'Automated containerized deployment workflows using Docker and Bash scripts',
            'Configured infrastructure monitoring and alert policies on Linux cloud servers',
          ],
        },
      ],
      projects: [],
    },
  },
  {
    domain: 'Full-Stack Product Engineering',
    targetRole: 'Full-Stack Software Engineer',
    targetCompany: 'Pulse Social Technologies',
    baseResume: {
      summary: 'Full-stack software developer who engineered 2 web platforms with React and Node.js, engaging 1,200 active registered users.',
      skills: [{ category: 'FullStack', items: ['react', 'nodejs', 'mongodb', 'typescript'] }],
      experience: [
        {
          company: 'Pulse Social Technologies',
          bullets: [
            'Developed full-stack web applications with React frontend and Node.js backend',
            'Implemented user authentication and role-based access control with MongoDB',
          ],
        },
      ],
      projects: [],
    },
  },
];

async function runRealAiBenchmark() {
  console.log('========================================================================');
  console.log('   REAL AI PROVIDER BENCHMARK: 1ST-ATTEMPT TAILORING PASS RATE');
  console.log('========================================================================\n');

  console.log(`Active Provider: ${process.env.AI_PROVIDER}`);
  console.log(`Active Model:    ${process.env.AI_MODEL || 'default'}`);
  console.log(`Has API Key:     ${Boolean(process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY)}\n`);

  if (!process.env.AI_API_KEY && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('ERROR: Real AI provider API key is not configured.');
    console.error('Please configure AI_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY) in server/.env and re-run.');
    process.exit(1);
  }

  const dbUri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_management_test';
  await mongoose.connect(dbUri);

  try {

  let totalSummaries = 0;
  let passedSummaries = 0;
  let totalBullets = 0;
  let passedBullets = 0;

  const rejectionReports = [];

  for (let i = 0; i < REALISTIC_PAIRS.length; i++) {
    const pair = REALISTIC_PAIRS[i];
    console.log(`Evaluating Pair ${i + 1}/${REALISTIC_PAIRS.length}: [${pair.domain}] -> ${pair.targetRole}`);

    const baseResume = pair.baseResume;
    const allowedSkills = (baseResume.skills || []).flatMap((c) => c.items || []);
    const candidateSkillsSet = new Set(allowedSkills.map((s) => s.toLowerCase()));
    const allowedEmployers = (baseResume.experience || []).map((e) => e.company).filter(Boolean);
    const allowedNumbers = (JSON.stringify(baseResume).match(/\b\d+(?:[.,]\d+)?\+?%?\b/g) || []).map((n) => n.toLowerCase());
    const allowedVerbsList = Array.from(ALLOW_LISTED_OPENING_VERBS).slice(0, 20).join(', ');
    const resumeCorpus = JSON.stringify(baseResume).toLowerCase();

    // 1. First-attempt summary rewrite
    totalSummaries++;
    const summaryPrompt = `Target Role: ${pair.targetRole}
Target Company: ${pair.targetCompany}
Original Summary: "${baseResume.summary}"

EXPLICIT ALLOWED FACTS:
Allowed Skills: ${allowedSkills.join(', ')}
Allowed Employers: ${allowedEmployers.join(', ')}
Allowed Numbers/Metrics: ${allowedNumbers.join(', ')}

Rewrite candidate summary to align with the target role. You MUST keep every concrete number and verified fact from the original summary. Return strictly JSON: { "summary": "string" }`;

    const summaryStartTime = Date.now();
    try {
      const summaryAiRes = await callAiWithQuotaAndRetry({
        systemPrompt: TAILOR_SYSTEM_PROMPT,
        userPrompt: summaryPrompt,
        mode: 'tailor',
        skipQuota: true,
      });

      const summaryLatency = Date.now() - summaryStartTime;
      const proposedSummary = summaryAiRes?.data?.summary;

      if (proposedSummary) {
        const val = validateSummaryRewriteDetailed(
          proposedSummary,
          baseResume.summary,
          resumeCorpus,
          candidateSkillsSet,
          allowedEmployers
        );

        if (val.valid) {
          passedSummaries++;
          console.log(`  ✓ Summary 1st attempt: PASSED (${summaryLatency}ms)`);
        } else {
          console.log(`  ✗ Summary 1st attempt: REJECTED (${summaryLatency}ms)`);
          rejectionReports.push({
            pairIndex: i + 1,
            target: `${pair.domain} Summary`,
            reasonCodes: val.reasonCodes,
            itemTypes: val.items,
          });
        }
      } else {
        console.log(`  ✗ Summary 1st attempt: FAILED (Empty AI response)`);
        rejectionReports.push({
          pairIndex: i + 1,
          target: `${pair.domain} Summary`,
          reasonCodes: ['empty_response'],
          itemTypes: [],
        });
      }
    } catch (summaryErr) {
      console.log(`  ✗ Summary 1st attempt: ERROR (${summaryErr.message})`);
      rejectionReports.push({
        pairIndex: i + 1,
        target: `${pair.domain} Summary`,
        reasonCodes: ['request_error'],
        itemTypes: [summaryErr.message],
      });
    }

    // 2. First-attempt bullet rewrites
    const bullets = (baseResume.experience || []).flatMap((e) => e.bullets || []);
    for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
      const originalBullet = bullets[bIdx];
      totalBullets++;

      const bulletPrompt = `Target Role: ${pair.targetRole}
Target Company: ${pair.targetCompany}
Original Bullet: "${originalBullet}"

EXPLICIT ALLOWED FACTS:
Allowed Skills: ${allowedSkills.join(', ')}
Allowed Employers: ${allowedEmployers.join(', ')}
Allowed Opening Verbs: ${allowedVerbsList}

Suggest a truthful bullet rewrite aligning with the target role. Lead with an allow-listed verb. Never invent numbers; if metric is unknown use exact placeholder "[add your real number]". Return JSON: { "suggested": "...", "why": "..." }`;

      const bulletStartTime = Date.now();
      try {
        const bulletAiRes = await callAiWithQuotaAndRetry({
          systemPrompt: TAILOR_SYSTEM_PROMPT,
          userPrompt: bulletPrompt,
          mode: 'tailor',
          skipQuota: true,
        });

        const bulletLatency = Date.now() - bulletStartTime;
        const proposedSuggested =
          bulletAiRes?.data?.suggested ||
          (Array.isArray(bulletAiRes?.data?.rewrites) && bulletAiRes?.data?.rewrites[0]?.suggested);

        if (proposedSuggested) {
          const val = validateBulletRewriteDetailed(
            { original: originalBullet, suggested: proposedSuggested },
            resumeCorpus,
            candidateSkillsSet,
            bullets
          );

          if (val.valid) {
            passedBullets++;
            console.log(`    ✓ Bullet #${bIdx + 1} 1st attempt: PASSED (${bulletLatency}ms)`);
          } else {
            console.log(`    ✗ Bullet #${bIdx + 1} 1st attempt: REJECTED (${bulletLatency}ms)`);
            rejectionReports.push({
              pairIndex: i + 1,
              target: `${pair.domain} Bullet #${bIdx + 1}`,
              reasonCodes: val.reasonCodes,
              itemTypes: val.items,
            });
          }
        } else {
          console.log(`    ✗ Bullet #${bIdx + 1} 1st attempt: FAILED (Empty AI response)`);
          rejectionReports.push({
            pairIndex: i + 1,
            target: `${pair.domain} Bullet #${bIdx + 1}`,
            reasonCodes: ['empty_response'],
            itemTypes: [],
          });
        }
      } catch (bulletErr) {
        console.log(`    ✗ Bullet #${bIdx + 1} 1st attempt: ERROR (${bulletErr.message})`);
        rejectionReports.push({
          pairIndex: i + 1,
          target: `${pair.domain} Bullet #${bIdx + 1}`,
          reasonCodes: ['request_error'],
          itemTypes: [bulletErr.message],
        });
      }
    }
    console.log('');
  }

  const summaryPassRate = ((passedSummaries / totalSummaries) * 100).toFixed(1);
  const bulletPassRate = ((passedBullets / totalBullets) * 100).toFixed(1);
  const overallTotal = totalSummaries + totalBullets;
  const overallPassed = passedSummaries + passedBullets;
  const overallPassRate = ((overallPassed / overallTotal) * 100).toFixed(1);

  console.log('========================================================================');
  console.log('                         BENCHMARK RESULTS');
  console.log('========================================================================');
  console.log(`Summaries First-Attempt Pass Rate: ${passedSummaries}/${totalSummaries} (${summaryPassRate}%)`);
  console.log(`Bullets First-Attempt Pass Rate:   ${passedBullets}/${totalBullets} (${bulletPassRate}%)`);
  console.log(`Overall First-Attempt Pass Rate:   ${overallPassed}/${overallTotal} (${overallPassRate}%)`);
  console.log('------------------------------------------------------------------------');

  if (rejectionReports.length === 0) {
    console.log('Zero first-attempt rejections observed across all 5 test pairs.');
  } else {
    console.log(`Total Rejections Observed: ${rejectionReports.length}`);
    console.log('Rejection Breakdown (Reason Codes and Item Types only; zero resume text):');
    rejectionReports.forEach((rep, idx) => {
      console.log(`  [${idx + 1}] Target: ${rep.target}`);
      console.log(`      Reason Codes: [${rep.reasonCodes.join(', ')}]`);
      if (rep.itemTypes.length > 0) {
        console.log(`      Flagged Items: [${rep.itemTypes.join(', ')}]`);
      }
    });
    }
    console.log('========================================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runRealAiBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark execution error:', err.message);
      process.exit(1);
    });
}

module.exports = { runRealAiBenchmark };
