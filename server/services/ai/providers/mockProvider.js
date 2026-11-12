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
  }

  reset() {
    this.lastReceivedPrompt = null;
    this.lastReceivedPayload = null;
    this.forceInvalidJsonCount = 0;
    this.forceRateLimit = false;
    this.mockAssistantResponse = null;
    this.mockAnalyzerResponse = null;
  }

  /**
   * Mock chat completion
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {string} [options.mode] - 'parse' | 'explain'
   */
  async generateCompletion({ systemPrompt, userPrompt, mode = 'parse' }) {
    this.lastReceivedPrompt = { systemPrompt, userPrompt };
    this.lastReceivedPayload = userPrompt;

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

    if (mode === 'explain') {
      return JSON.stringify({
        explanation: 'Candidate demonstrates strong alignment with required technical proficiencies. Academic performance and backlogs record satisfy all placement eligibility criteria. Relevant project background reinforces domain readiness for this role.',
      });
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
}

// Singleton mock provider instance
const mockProvider = new MockProvider();

module.exports = mockProvider;

