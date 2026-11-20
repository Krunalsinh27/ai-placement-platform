/**
 * Hermetic deterministic mock AI provider for testing and offline environments.
 * Strictly makes NO network calls.
 */

const { extractSkillsFromText } = require('../skillsDictionary');

class MockProvider {
  constructor() {
    this.name = 'mock';
    this.lastReceivedPrompt = null;
    this.lastReceivedPayload = null;
    this.forceInvalidJsonCount = 0;
    this.forceRateLimit = false;
    this.mockAssistantResponse = null;
    this.mockAnalyzerResponse = null;
    this.mockJdResponse = null;
    this.mockOcrText = null;
    this.mockChatResponse = null;
    this.mockToolCalls = null;
    this.mockMockQuestionsResponse = null;
    this.mockMockEvalResponse = null;
    this.mockMockReportResponse = null;
    this.mockTailorResponse = null;
    this.mockTailorRepairResponse = null;
    this.mockCoverLetterResponse = null;
    this.mockSkillGapResponse = null;
    this.mockWeeklySummaryResponse = null;
    this.mockTitleResponse = null;
    this.mockTitleResponse = null;
    this.forceDelayMs = 0;
    this.forceFailCount = 0;
  }

  reset() {
    this.lastReceivedPrompt = null;
    this.lastReceivedPayload = null;
    this.forceInvalidJsonCount = 0;
    this.forceRateLimit = false;
    this.forceDelayMs = 0;
    this.forceFailCount = 0;
    this.mockAssistantResponse = null;
    this.mockAnalyzerResponse = null;
    this.mockJdResponse = null;
    this.mockOcrText = null;
    this.mockChatResponse = null;
    this.mockToolCalls = null;
    this.mockMockQuestionsResponse = null;
    this.mockMockEvalResponse = null;
    this.mockMockReportResponse = null;
    this.mockTailorResponse = null;
    this.mockTailorRepairResponse = null;
    this.mockCoverLetterResponse = null;
    this.mockSkillGapResponse = null;
    this.mockWeeklySummaryResponse = null;
    this.mockTitleResponse = null;
    this.lastTemperature = null;
  }

  /**
   * Mock chat completion
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {string} [options.mode] - 'parse' | 'explain'
   */
  async generateCompletion({ systemPrompt, userPrompt, mode = 'parse', model = null, temperature = 0.1 }) {
    this.lastReceivedPrompt = { systemPrompt, userPrompt };
    this.lastReceivedPayload = userPrompt;
    this.lastTemperature = temperature;

    if (this.forceDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.forceDelayMs));
    }

    if (this.forceFailCount > 0) {
      this.forceFailCount--;
      throw new Error('Simulated upstream provider outage');
    }

    if (this.forceRateLimit) {
      const err = new Error('Rate limit exceeded: 429 Too Many Requests');
      err.status = 429;
      err.statusCode = 429;
      throw err;
    }

    if (this.forceInvalidJsonCount > 0) {
      this.forceInvalidJsonCount--;
      return 'INVALID_JSON{{{not valid';
    }

    if (mode === 'mock_interview_questions') {
      if (this.mockMockQuestionsResponse !== null) {
        return typeof this.mockMockQuestionsResponse === 'string'
          ? this.mockMockQuestionsResponse
          : JSON.stringify(this.mockMockQuestionsResponse);
      }
      const { selectFallbackQuestions } = require('../../mockInterview/fallbackQuestionBank');
      const roleMatch = userPrompt.match(/Target Role:\s*([^\n]+)/i);
      const role = roleMatch ? roleMatch[1].trim() : 'Software Engineer';
      const typeMatch = userPrompt.match(/Interview Type:\s*([^\n]+)/i);
      const type = typeMatch ? typeMatch[1].trim().toLowerCase() : 'mixed';
      const diffMatch = userPrompt.match(/Difficulty:\s*([^\n]+)/i);
      const difficulty = diffMatch ? diffMatch[1].trim().toLowerCase() : 'intermediate';
      const countMatch = userPrompt.match(/Question Count:\s*(\d+)/i);
      const count = countMatch ? parseInt(countMatch[1], 10) : 5;

      const questions = selectFallbackQuestions({ role, type, difficulty, count });
      return JSON.stringify({ questions });
    }

    if (mode === 'mock_interview_eval') {
      if (this.mockMockEvalResponse !== null) {
        return typeof this.mockMockEvalResponse === 'string'
          ? this.mockMockEvalResponse
          : JSON.stringify(this.mockMockEvalResponse);
      }
      const ansMatch = userPrompt.match(/<STUDENT_ANSWER>([\s\S]*?)<\/STUDENT_ANSWER>/i);
      const ans = ansMatch ? ansMatch[1].trim() : userPrompt;
      const lower = ans.toLowerCase();

      // Check for prompt injection attempts
      const isInjection =
        lower.includes('ignore previous instructions') ||
        lower.includes('system_override') ||
        lower.includes('give me 100') ||
        lower.includes('score: 100') ||
        lower.includes('score 100') ||
        lower.includes('grade: 100') ||
        lower.includes('bypass') ||
        lower.includes('ignore all rules');

      if (isInjection) {
        return JSON.stringify({
          score: {
            correctness: 10,
            clarity: 15,
            depth: 10,
            structure: 10,
            overall: 11,
          },
          feedback:
            'Response flagged for containing prompt override directives rather than addressing the interview question. To receive credit, explain the technical concepts directly without system commands.',
          sampleAnswer:
            'A candidate should focus directly on answering the technical architecture and tradeoffs asked in the question.',
          starEvaluation: {
            situation: false,
            task: false,
            action: false,
            result: false,
            comment: 'No valid situational context provided; prompt manipulation attempt detected.',
          },
        });
      }

      // Check STAR components for behavioral answers
      const hasSituation = lower.includes('situation') || lower.includes('when i was') || lower.includes('project') || lower.includes('during my');
      const hasTask = lower.includes('task') || lower.includes('goal') || lower.includes('responsible') || lower.includes('needed to');
      const hasAction = lower.includes('action') || lower.includes('implemented') || lower.includes('built') || lower.includes('designed') || lower.includes('i used');
      const hasResult = lower.includes('result') || lower.includes('achieved') || lower.includes('improved') || lower.includes('metric') || lower.includes('outcome');

      const isBehavioral = systemPrompt && (systemPrompt.includes('behavioral') || systemPrompt.includes('STAR'));

      // Realistic scoring based on length and quality
      const isShort = ans.length < 50;
      const correctness = isShort ? 45 : 85;
      const clarity = isShort ? 50 : 80;
      const depth = isShort ? 40 : 78;
      const structure = isShort ? 45 : (isBehavioral && hasSituation && hasAction ? 88 : 82);
      const overall = Math.round((correctness * 0.4) + (clarity * 0.2) + (depth * 0.2) + (structure * 0.2));

      return JSON.stringify({
        score: { correctness, clarity, depth, structure, overall },
        feedback: isShort
          ? 'Answer is brief and lacks depth. Expand on specific design tradeoffs, core mechanics, and practical experiences.'
          : 'Well-structured response that clearly addresses the core prompt. Good technical depth and logical articulation.',
        sampleAnswer:
          'A strong response would clearly state the definition, explain the internal mechanics with relevant examples, discuss time/space tradeoffs, and conclude with real-world edge cases.',
        starEvaluation: {
          situation: hasSituation,
          task: hasTask,
          action: hasAction,
          result: hasResult,
          comment: isBehavioral
            ? (hasSituation && hasTask && hasAction && hasResult ? 'Excellent complete STAR framework execution.' : 'Consider explicitly covering all STAR elements (Situation, Task, Action, Result) for behavioral questions.')
            : 'Not a behavioral question; evaluated on technical substance and clarity.',
        },
      });
    }

    if (mode === 'mock_interview_report') {
      if (this.mockMockReportResponse !== null) {
        return typeof this.mockMockReportResponse === 'string'
          ? this.mockMockReportResponse
          : JSON.stringify(this.mockMockReportResponse);
      }
      return JSON.stringify({
        overall: 80,
        scores: {
          correctness: 82,
          clarity: 80,
          depth: 76,
          structure: 82,
          overall: 80,
        },
        summary:
          'Solid overall interview performance. Demonstrated good grasp of core concepts, clear communication, and structured thought process. Deepening system design and performance optimization expertise will further strengthen candidate readiness.',
        strengths: [
          'Clear and articulate conceptual explanations',
          'Good awareness of standard data structures and algorithmic patterns',
          'Logical structure and professional communication tone',
        ],
        weaknesses: [
          'Could elaborate more thoroughly on edge cases and failure modes',
          'Provide deeper architectural tradeoffs and performance benchmarking numbers',
        ],
        improvementPlan: [
          {
            day: 1,
            title: 'Foundational Concepts & Complexity Analysis',
            focus: 'Review asymptotic complexity (Big-O time and space) and foundational data structures.',
            tasks: [
              'Review time/space complexity of search, sort, and graph traversal algorithms.',
              'Solve 2 medium array/hashmap problems focusing on optimal runtime.',
            ],
          },
          {
            day: 2,
            title: 'Tree & Graph Traversal Deep Dive',
            focus: 'Master DFS, BFS, and tree manipulation edge cases.',
            tasks: [
              'Implement recursive and iterative BFS/DFS for binary trees.',
              'Practice cycle detection in directed and undirected graphs.',
            ],
          },
          {
            day: 3,
            title: 'Dynamic Programming & Memoization Patterns',
            focus: 'Formulate state transitions and space-optimized subproblems.',
            tasks: [
              'Break down 0/1 knapsack and longest common subsequence patterns.',
              'Convert top-down recursive solutions to bottom-up tabular DP.',
            ],
          },
          {
            day: 4,
            title: 'System Architecture & Database Indexing',
            focus: 'High-level system design fundamentals and database indexing strategies.',
            tasks: [
              'Understand B-Tree indexes, composite keys, and query execution plans.',
              'Design a URL shortener or rate limiter with caching considerations.',
            ],
          },
          {
            day: 5,
            title: 'API Design, Security & Microservices',
            focus: 'RESTful API principles, JWT authentication, and idempotent operations.',
            tasks: [
              'Review idempotent HTTP methods and status code specifications.',
              'Audit auth middleware patterns (token expiry, refresh tokens, role checks).',
            ],
          },
          {
            day: 6,
            title: 'Behavioral STAR Framework Polish',
            focus: 'Structure behavioral scenarios using Situation, Task, Action, and Result.',
            tasks: [
              'Write down 3 STAR stories from academic or internship projects.',
              'Practice out-loud delivery of conflict resolution and leadership examples.',
            ],
          },
          {
            day: 7,
            title: 'Full Mock Interview Simulation',
            focus: 'Complete a timed mock interview session under realistic constraints.',
            tasks: [
              'Take a full 5-question mixed mock interview on the platform.',
              'Review answer feedback and revise sample answers.',
            ],
          },
        ],
      });
    }

    if (mode === 'tailor' || mode === 'tailor_repair') {
      if (mode === 'tailor_repair' && this.mockTailorRepairResponse !== null) {
        return typeof this.mockTailorRepairResponse === 'string'
          ? this.mockTailorRepairResponse
          : JSON.stringify(this.mockTailorRepairResponse);
      }
      if (this.mockTailorResponse !== null) {
        return typeof this.mockTailorResponse === 'string'
          ? this.mockTailorResponse
          : JSON.stringify(this.mockTailorResponse);
      }
      // Extract original bullets from userPrompt
      const bulletMatches = userPrompt.match(/Original Bullet:\s*"([^"]+)"/g) || [];
      const rewrites = [];
      for (const m of bulletMatches) {
        const orig = m.replace(/^Original Bullet:\s*"/, '').replace(/"$/, '').trim();
        const core = orig.replace(/^(worked|collaborated|built|developed|handled|helped|created|assisted)\s+(on|with|in)?\s*/i, '');
        rewrites.push({
          original: orig,
          suggested: `Developed ${core} [add your real number]%`,
          why: 'Replaces passive wording with a decisive action verb and highlights quantifiable performance impact.',
        });
      }
      return JSON.stringify({
        summary: 'Passionate computer science engineer with experience in distributed backend APIs and database indexing with [add your real number]% latency reduction.',
        rewrites: rewrites.length > 0 ? rewrites : [
          {
            original: 'Worked on backend apis and web features',
            suggested: 'Developed backend apis and web features [add your real number]%',
            why: 'Leads with an active verb and frames contribution with quantifiable impact.',
          },
        ],
      });
    }

    if (mode === 'cover_letter') {
      if (this.mockCoverLetterResponse !== null) {
        return typeof this.mockCoverLetterResponse === 'string'
          ? this.mockCoverLetterResponse
          : JSON.stringify(this.mockCoverLetterResponse);
      }
      const roleMatch = userPrompt.match(/Target Role:\s*([^\n]+)/i);
      const companyMatch = userPrompt.match(/Target Company:\s*([^\n]+)/i);
      const role = roleMatch ? roleMatch[1].trim() : 'Software Engineer';
      const company = companyMatch ? companyMatch[1].trim() : 'the company';

      return JSON.stringify({
        coverLetter: `Dear Hiring Team,\n\nI am writing to express my enthusiastic interest in the ${role} position at ${company}. Having built scalable full-stack applications and focused heavily on performance optimization, I am excited about the opportunity to contribute to your engineering team.\n\nThroughout my academic coursework and hands-on projects, I have developed strong proficiencies in data structures, API design, and database indexing. In my recent full-stack platform project, I engineered core services and integrated asynchronous pipelines to maintain sub-second response times under peak usage. My practical experience directly aligns with the technical challenges and quality standards at ${company}.\n\nThank you for considering my application. I look forward to discussing how my technical background and problem-solving mindset can bring immediate value to ${company}.\n\nSincerely,\nCandidate`,
      });
    }

    if (mode === 'skill_gap_plan') {
      if (this.mockSkillGapResponse !== null) {
        return typeof this.mockSkillGapResponse === 'string'
          ? this.mockSkillGapResponse
          : JSON.stringify(this.mockSkillGapResponse);
      }
      return JSON.stringify({
        overview: 'Targeted technical skill enhancement roadmap generated to accelerate qualification for eligible placement drives.',
        targetSkills: ['docker', 'redis'],
        totalEstimatedHours: 12,
        weeks: [
          {
            week: 1,
            skill: 'docker',
            why: 'Required by top cloud and backend drives.',
            targetDrives: ['Full Stack Developer (Acme Corp)'],
            resourceType: 'Official Documentation',
            resourceLink: 'https://docs.docker.com/get-started/',
            estimatedHours: 6,
            practiceTask: 'Containerize a Node.js REST API with Docker and compose.',
          },
          {
            week: 2,
            skill: 'redis',
            why: 'Required for high-performance caching in modern web architectures.',
            targetDrives: ['Backend Engineer (Beta Labs)'],
            resourceType: 'Official Documentation',
            resourceLink: 'https://redis.io/docs/latest/develop/get-started/',
            estimatedHours: 6,
            practiceTask: 'Implement cache-aside pattern with Redis for database queries.',
          },
        ],
      });
    }

    if (mode === 'weekly_placement_summary') {
      if (this.mockWeeklySummaryResponse !== null) {
        return typeof this.mockWeeklySummaryResponse === 'string'
          ? this.mockWeeklySummaryResponse
          : JSON.stringify(this.mockWeeklySummaryResponse);
      }
      return JSON.stringify({
        weekEndingDate: new Date().toISOString().split('T')[0],
        executiveSummary: 'This week campus recruitment activity progressed solidly with active participation across computer science and electronics departments. Overall conversion remains healthy and aligned with seasonal targets.',
        keyHighlights: [
          'Strong student turnout across technical assessments and preliminary interviews.',
          'Multiple multi-national employers extended competitive offers to top academic percentiles.',
        ],
        areasOfConcern: [
          'A cohort of candidates requires targeted remediation on cloud and caching competencies.',
          'Unplaced students who have submitted zero applications need proactive TPO reminders.',
        ],
        recommendedInterventions: [
          'Organize targeted hands-on workshops on high-frequency missing technical skills.',
          'Schedule 1-on-1 counseling sessions with students lacking uploaded ATS resumes.',
        ],
      });
    }

    if (mode === 'explain') {
      return JSON.stringify({
        explanation: 'Candidate demonstrates strong alignment with required technical proficiencies. Academic performance and backlogs record satisfy all placement eligibility criteria. Relevant project background reinforces domain readiness for this role.',
      });
    }

    if (mode === 'assistant_title') {
      if (this.mockTitleResponse !== null && this.mockTitleResponse !== undefined) {
        return typeof this.mockTitleResponse === 'string'
          ? this.mockTitleResponse
          : JSON.stringify(this.mockTitleResponse);
      }
      return 'Placement Drive Guidelines';
    }

    if (mode === 'assistant' || mode === 'career') {
      // 1. General Mode Career Advisory prompt check
      if (mode === 'career' || (systemPrompt && (systemPrompt.includes('career and placement') || systemPrompt.includes('CAREER_ADVISOR')))) {
        if (this.mockCareerAdvisorResponse !== null && this.mockCareerAdvisorResponse !== undefined) {
          return typeof this.mockCareerAdvisorResponse === 'string'
            ? this.mockCareerAdvisorResponse
            : JSON.stringify(this.mockCareerAdvisorResponse);
        }

        const qMatch = userPrompt.match(/<USER_QUESTION>([\s\S]*?)<\/USER_QUESTION>/);
        const rawQ = (qMatch ? qMatch[1].trim() : userPrompt).toLowerCase();

        // Check for off-topic, non-career questions or prompt injection
        const isOffTopic =
          rawQ.includes('pizza') ||
          rawQ.includes('recipe') ||
          rawQ.includes('weather') ||
          rawQ.includes('movie') ||
          rawQ.includes('song') ||
          rawQ.includes('president') ||
          rawQ.includes('system_override') ||
          rawQ.includes('ignore previous instructions') ||
          rawQ.includes('hack') ||
          rawQ.includes('capital of');

        if (isOffTopic) {
          return 'I can only answer questions related to careers, placement preparation, interviews, and technical skills.';
        }

        return 'To prepare effectively for technical placement interviews: focus on core data structures and algorithms (arrays, trees, graphs, dynamic programming), practice problem-solving daily on standard platforms, and review CS fundamentals (DBMS, OS, and Networks). For behavioral rounds, structure answers using the STAR method (Situation, Task, Action, Result) with concrete metrics from your academic projects.';
      }

      // 2. Intent routing prompt check
      if (this.mockAssistantResponse !== null && this.mockAssistantResponse !== undefined) {
        return typeof this.mockAssistantResponse === 'string'
          ? this.mockAssistantResponse
          : JSON.stringify(this.mockAssistantResponse);
      }
      const { matchRuleBasedIntent } = require('../../assistant/intentRouter');
      const qMatch = userPrompt.match(/<USER_QUESTION>([\s\S]*?)<\/USER_QUESTION>/);
      const rawQ = qMatch ? qMatch[1].trim() : userPrompt;

      let prev = null;
      const prevMatch = userPrompt.match(/<PREVIOUS_CONTEXT>([\s\S]*?)<\/PREVIOUS_CONTEXT>/);
      if (prevMatch) {
        try {
          const toolM = prevMatch[1].match(/Previous Tool:\s*([a-zA-Z0-9_]+)/);
          const paramsM = prevMatch[1].match(/Previous Params:\s*(\{.*\})/);
          if (toolM) {
            prev = {
              tool: toolM[1],
              params: paramsM ? JSON.parse(paramsM[1]) : {},
            };
          }
        } catch (_) {}
      }

      const isStudentPrompt = Boolean(systemPrompt && (systemPrompt.includes('STUDENT TOOLS') || systemPrompt.includes('myApplications')));
      const isRecruiterPrompt = Boolean(systemPrompt && (systemPrompt.includes('RECRUITER TOOLS') || systemPrompt.includes('myDrivesSummary')));
      const detectedRole = isStudentPrompt ? 'student' : isRecruiterPrompt ? 'recruiter' : 'tpo';

      const isConversationalGeneral =
        rawQ.includes('capital of') ||
        rawQ.includes('recipe') ||
        rawQ.includes('pizza') ||
        rawQ.includes('weather');

      if (isConversationalGeneral) {
        return JSON.stringify({ tool: 'general', params: { question: rawQ } });
      }

      const intent = matchRuleBasedIntent(rawQ, prev, detectedRole);
      return JSON.stringify(intent);
    }

    if (mode === 'analyze') {
      if (this.mockAnalyzerResponse !== null && this.mockAnalyzerResponse !== undefined) {
        return typeof this.mockAnalyzerResponse === 'string'
          ? this.mockAnalyzerResponse
          : JSON.stringify(this.mockAnalyzerResponse);
      }

      // Extract candidate bullets from prompt if available
      const bulletsMatch = userPrompt.match(/Candidate Bullets:\s*([\s\S]*?)Calculated ATS Breakdown:/i);
      let sampleOrig = 'Worked on backend apis and web features';
      if (bulletsMatch) {
        const lines = bulletsMatch[1]
          .split('\n')
          .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
          .filter(Boolean);
        if (lines.length > 0) sampleOrig = lines[0];
      }

      return JSON.stringify({
        suggestions: [
          {
            category: 'Impact',
            priority: 'high',
            reason: 'Quantify technical contributions with numbers (e.g. latency reduced by [add your real number]%, users served).',
          },
          {
            category: 'Action Verbs',
            priority: 'medium',
            reason: 'Begin project bullets with direct action verbs such as Architected, Implemented, or Optimized.',
          },
        ],
        rewrites: [
          {
            original: sampleOrig,
            suggested: `Architected scalable services delivering [add your real number]% faster response times`,
            why: 'Leads with a decisive action verb and highlights quantifiable performance impact.',
          },
        ],
        learningOrder: [
          {
            skill: 'docker',
            reason: 'High-frequency containerization requirement across backend roles.',
            resourceType: 'Hands-on Project',
          },
        ],
      });
    }

    // JD Parsing Mode
    if (userPrompt && userPrompt.includes('<JOB_DESCRIPTION>')) {
      if (this.mockJdResponse) {
        return typeof this.mockJdResponse === 'string'
          ? this.mockJdResponse
          : JSON.stringify(this.mockJdResponse);
      }
      const match = userPrompt.match(/<JOB_DESCRIPTION>([\s\S]*?)<\/JOB_DESCRIPTION>/);
      const jdBody = match ? match[1] : userPrompt;
      const { extractJdRequirementsWithRules } = require('../jdAnalyzer');
      const parsed = extractJdRequirementsWithRules(jdBody);
      return JSON.stringify({
        roleTitle: parsed.roleTitle,
        requiredSkills: parsed.requiredSkills,
        preferredSkills: parsed.preferredSkills,
        minYearsExperience: parsed.minYearsExperience,
        education: parsed.education,
        softSkills: parsed.softSkills,
      });
    }

    // Default: Resume parsing mode
    // Extract skills and structured sections from userPrompt deterministically
    const detectedSkills = extractSkillsFromText(userPrompt);

    let extracted = null;
    try {
      const { extractWithRules } = require('../resumeParser');
      extracted = extractWithRules(userPrompt);
    } catch (_) {}

    const skills =
      extracted?.skills?.length > 0
        ? Array.from(new Set([...extracted.skills, ...detectedSkills]))
        : detectedSkills.length > 0
        ? detectedSkills
        : ['javascript', 'react', 'nodejs'];

    const projects =
      extracted?.projects?.length > 0
        ? extracted.projects
        : [
            {
              title: 'Full Stack Web Platform',
              description: 'Engineered a scalable web application with authentication, database indexing, and dashboard.',
              technologies: detectedSkills.slice(0, 4),
              bullets: [
                'Engineered a scalable web application with authentication and database indexing.',
                'Built responsive client interfaces and integrated analytics.',
              ],
            },
          ];

    const experience =
      extracted?.experience?.length > 0
        ? extracted.experience
        : [
            {
              title: 'Software Development Intern',
              company: 'Tech Solutions Inc.',
              location: 'Remote',
              duration: '3 months',
              technologies: [],
              bullets: [
                'Developed REST APIs and responsive web interfaces using modern frameworks.',
                'Collaborated with senior engineers on backend database query optimization.',
              ],
              description: 'Developed REST APIs and responsive web interfaces using modern frameworks.',
            },
          ];

    const education =
      extracted?.education?.length > 0
        ? extracted.education
        : [
            {
              degree: 'Bachelor of Technology',
              field: 'Computer Science and Engineering',
              institution: 'State Engineering College',
              year: '2025',
            },
          ];

    return JSON.stringify({
      skills,
      education,
      experience,
      projects,
      certifications: extracted?.certifications?.length > 0 ? extracted.certifications : ['Full Stack Web Development'],
      summary: extracted?.summary || 'Proactive engineering student with hands-on software development and problem solving skills.',
    });
  }

  /**
   * Multi-turn chat completion with native function calling (mock implementation)
   */
  async generateChatCompletionWithTools({ messages = [], tools = [], model = null, temperature = 0.2 }) {
    if (this.forceRateLimit) {
      const err = new Error('Rate limit exceeded: 429 Too Many Requests');
      err.status = 429;
      err.statusCode = 429;
      throw err;
    }

    if (this.forceInvalidJsonCount > 0) {
      this.forceInvalidJsonCount--;
      throw new Error('AI provider error: Malformed response / invalid JSON');
    }

    if (this.mockChatResponse !== null) {
      const content = typeof this.mockChatResponse === 'string' ? this.mockChatResponse : JSON.stringify(this.mockChatResponse);
      return {
        message: { content, tool_calls: this.mockToolCalls || [] },
        content,
        toolCalls: this.mockToolCalls || [],
      };
    }

    // Inspect recent messages
    const lastMsg = messages[messages.length - 1] || {};
    const toolMessages = messages.filter((m) => m.role === 'tool');

    // 1. Post-tool synthesis turn (a tool was executed and returned result)
    if (lastMsg.role === 'tool' || toolMessages.length > 0) {
      const lastToolMsg = toolMessages[toolMessages.length - 1];
      const toolName = lastToolMsg.name;
      let toolData = {};
      try {
        toolData = typeof lastToolMsg.content === 'string' ? JSON.parse(lastToolMsg.content) : lastToolMsg.content;
      } catch (_) {
        toolData = { text: lastToolMsg.content };
      }

      let answer = '';
      if (toolName === 'placementSummary') {
        const total = toolData.totalStudents ?? 120;
        const placed = toolData.placedStudents ?? 85;
        const pct = toolData.placementPercentage ?? '70.8%';
        const avg = toolData.avgPackage ?? '6.5';
        answer = `Based on your college placement records, there are ${total} total students in the cohort, with ${placed} students successfully placed (${pct} placement rate). The average package secured is ${avg} LPA.`;
      } else if (toolName === 'departmentBreakdown') {
        const depts = toolData.departments || [];
        answer = `Here is the department breakdown: ${depts.map((d) => `${d.branch}: ${d.placedCount}/${d.totalStudents} placed (${d.percentage}%)`).join(', ') || 'all branches report active placements.'}`;
      } else if (toolName === 'unplacedStudents') {
        const count = toolData.totalUnplaced ?? 0;
        answer = `There are currently ${count} eligible unplaced students available for upcoming placement drives.`;
      } else if (toolName === 'myApplications') {
        const total = toolData.totalApplications ?? toolData.count ?? 0;
        const apps = toolData.applications || [];
        answer = `You have ${total} application(s) submitted. ${apps.map((a) => `${a.company || 'Drive'}: ${a.status} (Stage: ${a.currentRound || 'Review'})`).join('; ') || 'No active applications found.'}`;
      } else if (toolName === 'myUpcomingInterviews') {
        const total = toolData.totalInterviews ?? toolData.count ?? 0;
        answer = `You have ${total} upcoming interview slot(s) scheduled. Make sure to check your room link 5 minutes before start.`;
      } else if (toolName === 'upcomingEligibleDrives') {
        const count = toolData.totalEligibleDrives ?? toolData.count ?? (toolData.drives?.length || 0);
        answer = `Found ${count} upcoming campus placement drive(s) you are academically eligible to apply for.`;
      } else if (toolName === 'myEligibility') {
        const eligible = toolData.isEligible ? 'eligible' : 'not eligible';
        answer = `You are academically ${eligible} for ${toolData.company || 'this drive'}. Reason: ${toolData.reason || 'Criteria met'}.`;
      } else if (toolName === 'myResumeStatus') {
        answer = `Your resume has an ATS score of ${toolData.atsScore ?? 0} with ${toolData.skillsCount ?? 0} verified skills.`;
      } else if (toolName === 'myDrivesSummary') {
        const total = toolData.totalDrives ?? 0;
        answer = `Your company has ${total} active campus hiring drive(s) listed on the platform.`;
      } else if (toolName === 'myDriveFunnel' || toolName === 'driveFunnel') {
        answer = `Drive recruitment funnel: Applied: ${toolData.applied ?? 0}, Shortlisted: ${toolData.shortlisted ?? 0}, Interview: ${toolData.interview ?? 0}, Selected: ${toolData.accepted ?? toolData.selected ?? 0}.`;
      } else if (toolName === 'myTopApplicants') {
        const total = toolData.totalApplicants ?? toolData.count ?? (toolData.applicants?.length || 0);
        answer = `Here are the top-ranked ${total} applicants based on ATS match score, verified skills, and academic eligibility.`;
      } else if (toolName === 'myDriveRequests') {
        answer = `You have ${toolData.totalRequests ?? 0} campus drive request(s) on the platform.`;
      } else if (toolName === 'companyStats') {
        answer = `Company statistics: ${toolData.totalCompanies ?? 0} companies participating with ${toolData.activeDrives ?? 0} active drives.`;
      } else if (toolName === 'upcomingDrives') {
        answer = `There are ${toolData.totalUpcoming ?? (toolData.drives?.length || 0)} upcoming drives scheduled.`;
      } else if (toolName === 'offerStatus') {
        answer = `Offer status: ${toolData.totalOffers ?? 0} total offers extended, with ${toolData.acceptedOffers ?? 0} accepted.`;
      } else if (toolName === 'studentsWithSkill') {
        answer = `Found ${toolData.totalStudents ?? (toolData.students?.length || 0)} student(s) with skill ${toolData.skill || ''}.`;
      } else if (toolName === 'studentsWithoutResume') {
        answer = `There are ${toolData.totalWithoutResume ?? 0} student(s) without an uploaded or analyzed resume.`;
      } else if (toolName === 'topPackages') {
        answer = `The highest packages offered are: ${(toolData.packages || []).map((p) => `${p.company}: ${p.package} LPA`).join(', ') || 'No package data available.'}`;
      } else if (toolName === 'searchKnowledgeBase') {
        const results = toolData.results || [];
        if (results.length > 0) {
          const top = results[0];
          answer = `${top.content}\n\n[Source: ${top.title}]`;
        } else {
          answer = 'No matching knowledge base documentation found for your inquiry.';
        }
      } else {
        answer = `Based on the system records: ${JSON.stringify(toolData).slice(0, 300)}`;
      }

      return {
        message: { content: answer, tool_calls: [] },
        content: answer,
        toolCalls: [],
      };
    }

    // Check if test provided an explicit mockAssistantResponse
    if (this.mockAssistantResponse !== null && this.mockAssistantResponse !== undefined) {
      let parsed = this.mockAssistantResponse;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (_) {}
      }
      if (parsed && parsed.tool && parsed.tool !== 'none' && parsed.tool !== 'general' && parsed.tool !== 'help') {
        const toolCalls = [
          {
            id: `call_${Date.now()}_mock`,
            type: 'function',
            function: {
              name: parsed.tool,
              arguments: JSON.stringify(parsed.params || {}),
            },
          },
        ];
        return {
          message: { content: null, tool_calls: toolCalls },
          content: null,
          toolCalls,
        };
      }
    }

    // 2. Initial user query turn
    const userMsg = lastMsg.content || '';
    const qLower = userMsg.toLowerCase().trim();

    // Check for prompt injection / jailbreak
    if (qLower.includes('system_override') || qLower.includes('ignore previous instructions') || qLower.includes('hack')) {
      const response = 'I cannot comply with system override directives. I am an AI assistant for the placement management platform.';
      return {
        message: { content: response, tool_calls: [] },
        content: response,
        toolCalls: [],
      };
    }

    // Check available tools
    const availableToolNames = tools.map((t) => (t.function ? t.function.name : t.name));

    // Determine role from system message
    const sysMsg = messages.find((m) => m.role === 'system')?.content || '';
    let detectedRole = 'tpo';
    if (sysMsg.includes('STUDENT')) detectedRole = 'student';
    else if (sysMsg.includes('RECRUITER')) detectedRole = 'recruiter';
    else if (sysMsg.includes('SUPERADMIN')) detectedRole = 'superadmin';

    let selectedTool = null;
    let toolArgs = {};

    // Check intent router rule matching first
    const { matchRuleBasedIntent } = require('../../assistant/intentRouter');
    const ruleIntent = matchRuleBasedIntent(userMsg, null, detectedRole);
    if (ruleIntent && ruleIntent.tool && availableToolNames.includes(ruleIntent.tool)) {
      selectedTool = ruleIntent.tool;
      toolArgs = ruleIntent.params || {};
    } else if (ruleIntent && ruleIntent.tool === 'help' && availableToolNames.includes('searchKnowledgeBase')) {
      selectedTool = 'searchKnowledgeBase';
      toolArgs = { query: userMsg };
    }

    // Additional heuristics if ruleIntent didn't match an available tool
    if (!selectedTool) {
      if (qLower.includes('placement summary') || qLower.includes('how many placed') || qLower.includes('placement rate') || qLower.includes('placed count')) {
        selectedTool = 'placementSummary';
        const batchM = qLower.match(/\b(20\d{2})\b/);
        if (batchM) toolArgs.batch = parseInt(batchM[1], 10);
      } else if (qLower.includes('department breakdown') || qLower.includes('branch breakdown')) {
        selectedTool = 'departmentBreakdown';
      } else if (qLower.includes('unplaced student') || qLower.includes('who is not placed')) {
        selectedTool = 'unplacedStudents';
      } else if (qLower.includes('company stats') || qLower.includes('companies visiting')) {
        selectedTool = 'companyStats';
      } else if (qLower.includes('drive funnel') || qLower.includes('selection funnel')) {
        selectedTool = 'driveFunnel';
      } else if (qLower.includes('upcoming drive') || qLower.includes('scheduled drive')) {
        selectedTool = 'upcomingDrives';
      } else if (qLower.includes('offer status') || qLower.includes('offers breakdown')) {
        selectedTool = 'offerStatus';
      } else if (qLower.includes('students with') || qLower.includes('who knows python') || qLower.includes('who knows react')) {
        selectedTool = 'studentsWithSkill';
        toolArgs.skill = qLower.includes('react') ? 'react' : 'python';
      } else if (qLower.includes('without resume')) {
        selectedTool = 'studentsWithoutResume';
      } else if (qLower.includes('top package') || qLower.includes('highest package')) {
        selectedTool = 'topPackages';
      } else if (qLower.includes('application') || qLower.includes('status of my')) {
        selectedTool = 'myApplications';
      } else if (qLower.includes('my interview') || qLower.includes('upcoming interview')) {
        selectedTool = 'myUpcomingInterviews';
      } else if (qLower.includes('drives can i apply') || qLower.includes('eligible drive')) {
        selectedTool = 'upcomingEligibleDrives';
      } else if (qLower.includes('am i eligible')) {
        selectedTool = 'myEligibility';
      } else if (qLower.includes('my resume') || qLower.includes('resume status')) {
        selectedTool = 'myResumeStatus';
      } else if (qLower.includes('my drive') || qLower.includes('recruiter drive')) {
        selectedTool = 'myDrivesSummary';
      } else if (qLower.includes('top applicant') || qLower.includes('top candidate')) {
        selectedTool = 'myTopApplicants';
      } else if (qLower.includes('drive request')) {
        selectedTool = 'myDriveRequests';
      } else if (qLower.includes('backlog rule') || qLower.includes('eligibility policy') || qLower.includes('how to apply') || qLower.includes('how do i apply')) {
        selectedTool = 'searchKnowledgeBase';
        toolArgs.query = qLower;
      }
    }

    if (selectedTool) {
      const toolCalls = [
        {
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'function',
          function: {
            name: selectedTool,
            arguments: JSON.stringify(toolArgs),
          },
        },
      ];
      return {
        message: { content: null, tool_calls: toolCalls },
        content: null,
        toolCalls,
      };
    }

    // Direct conversational answers (no tools called)
    let directAnswer = '';
    if (qLower.includes('capital of france') || qLower.includes('capital of')) {
      directAnswer = 'The capital of France is Paris. For campus placements and interview preparation, you can ask about data structures, system design, or company hiring processes.';
    } else if (qLower.includes('quicksort') || qLower.includes('sort algorithm')) {
      directAnswer = 'Quicksort is an efficient divide-and-conquer sorting algorithm. It selects a pivot element, partitions the array into sub-arrays less than and greater than the pivot, and recursively sorts the sub-arrays with average O(n log n) runtime complexity.';
    } else if (qLower.includes('technical interview') || qLower.includes('prepare for interview') || qLower.includes('star method')) {
      directAnswer = 'To prepare effectively for technical placement interviews: focus on core data structures and algorithms (arrays, trees, graphs, dynamic programming), practice problem-solving daily on standard platforms, and review CS fundamentals (DBMS, OS, and Networks). For behavioral rounds, structure answers using the STAR method (Situation, Task, Action, Result) with concrete metrics from your academic projects.';
    } else if (qLower.includes('hello') || qLower.includes('hi') || qLower.includes('help me')) {
      directAnswer = 'Hello! I am your AI placement assistant. I can help answer questions about campus recruitment, your application status, interview schedules, technical preparation, and institutional placement statistics. What would you like to explore?';
    } else {
      directAnswer = `I can help with campus recruitment, technical interview prep, and platform workflows. You asked: "${userMsg.slice(0, 100)}". Let me know if you would like me to retrieve specific data or guide you through a platform process.`;
    }

    return {
      message: { content: directAnswer, tool_calls: [] },
      content: directAnswer,
      toolCalls: [],
    };
  }
}

// Singleton mock provider instance
const mockProvider = new MockProvider();

module.exports = mockProvider;

