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
  }

  reset() {
    this.lastReceivedPrompt = null;
    this.lastReceivedPayload = null;
    this.forceInvalidJsonCount = 0;
    this.forceRateLimit = false;
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

    // Default: Resume parsing mode
    // Extract skills from userPrompt deterministically
    const detectedSkills = extractSkillsFromText(userPrompt);

    return JSON.stringify({
      skills: detectedSkills.length > 0 ? detectedSkills : ['javascript', 'react', 'nodejs'],
      education: [
        {
          degree: 'Bachelor of Technology',
          field: 'Computer Science and Engineering',
          institution: 'State Engineering College',
          year: '2025',
        },
      ],
      experience: [
        {
          title: 'Software Development Intern',
          company: 'Tech Solutions Inc.',
          duration: '3 months',
          description: 'Developed REST APIs and responsive web interfaces using modern frameworks.',
        },
      ],
      projects: [
        {
          title: 'Full Stack Web Platform',
          description: 'Engineered a scalable web application with authentication, database indexing, and dashboard.',
          technologies: detectedSkills.slice(0, 4),
        },
      ],
      certifications: ['Full Stack Web Development'],
      summary: 'Proactive engineering student with hands-on software development and problem solving skills.',
    });
  }
}

// Singleton mock provider instance
const mockProvider = new MockProvider();

module.exports = mockProvider;

