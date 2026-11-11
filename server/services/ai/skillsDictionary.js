/**
 * Skills dictionary with synonym mapping and normalization for matching.
 */

const SYNONYMS = {
  'js': 'javascript',
  'javascript': 'javascript',
  'ecmascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
  'py': 'python',
  'python': 'python',
  'python3': 'python',
  'node': 'nodejs',
  'nodejs': 'nodejs',
  'node.js': 'nodejs',
  'react': 'react',
  'reactjs': 'react',
  'react.js': 'react',
  'react native': 'react native',
  'vue': 'vue',
  'vuejs': 'vue',
  'vue.js': 'vue',
  'angular': 'angular',
  'angularjs': 'angular',
  'express': 'express',
  'expressjs': 'express',
  'express.js': 'express',
  'mongo': 'mongodb',
  'mongodb': 'mongodb',
  'sql': 'sql',
  'mysql': 'mysql',
  'postgres': 'postgresql',
  'postgresql': 'postgresql',
  'sqlite': 'sqlite',
  'redis': 'redis',
  'c': 'c',
  'cpp': 'c++',
  'c++': 'c++',
  'cplusplus': 'c++',
  'c#': 'c#',
  'csharp': 'c#',
  'java': 'java',
  'spring': 'spring boot',
  'springboot': 'spring boot',
  'spring boot': 'spring boot',
  'go': 'go',
  'golang': 'go',
  'rust': 'rust',
  'ruby': 'ruby',
  'rails': 'ruby on rails',
  'ruby on rails': 'ruby on rails',
  'php': 'php',
  'laravel': 'laravel',
  'django': 'django',
  'flask': 'flask',
  'fastapi': 'fastapi',
  'html': 'html',
  'html5': 'html',
  'css': 'css',
  'css3': 'css',
  'tailwind': 'tailwind css',
  'tailwindcss': 'tailwind css',
  'bootstrap': 'bootstrap',
  'sass': 'sass',
  'scss': 'sass',
  'axios': 'axios',
  'redux toolkit': 'redux toolkit',
  'rtk': 'redux toolkit',
  'react query': 'react query',
  'tanstack query': 'react query',
  'graphql': 'graphql',
  'rest': 'rest api',
  'rest api': 'rest api',
  'restful': 'rest api',
  'restful api': 'rest api',
  'restful apis': 'rest api',
  'rest apis': 'rest api',
  'rest/restful apis': 'rest api',
  'jwt': 'jwt',
  'jsonwebtoken': 'jwt',
  'bcrypt': 'bcrypt',
  'bcryptjs': 'bcrypt',
  'nodemailer': 'nodemailer',
  'docker': 'docker',
  'k8s': 'kubernetes',
  'kubernetes': 'kubernetes',
  'aws': 'aws',
  'amazon web services': 'aws',
  'azure': 'azure',
  'gcp': 'google cloud',
  'google cloud': 'google cloud',
  'git': 'git',
  'github': 'github',
  'gitlab': 'gitlab',
  'vercel': 'vercel',
  'render': 'render',
  'netlify': 'netlify',
  'cloudinary': 'cloudinary',
  'postman': 'postman',
  'vs code': 'vs code',
  'vscode': 'vs code',
  'visual studio code': 'vs code',
  'ci/cd': 'ci/cd',
  'cicd': 'ci/cd',
  'jenkins': 'jenkins',
  'linux': 'linux',
  'bash': 'bash',
  'shell': 'bash',
  'kafka': 'kafka',
  'rabbitmq': 'rabbitmq',
  'microservices': 'microservices',
  'agile': 'agile',
  'scrum': 'scrum',
  '.net': '.net',
  'dotnet': '.net',
  'asp.net': '.net',
  'dbms': 'dbms',
  'database management systems': 'dbms',
  'database management system': 'dbms',
  'os': 'os',
  'operating systems': 'os',
  'operating system': 'os',
  'computer networks': 'computer networks',
  'cn': 'computer networks',
  'networking': 'computer networks',
  'machine learning': 'machine learning',
  'ml': 'machine learning',
  'deep learning': 'deep learning',
  'nlp': 'nlp',
  'natural language processing': 'nlp',
  'computer vision': 'computer vision',
  'tensorflow': 'tensorflow',
  'pytorch': 'pytorch',
  'scikit-learn': 'scikit-learn',
  'pandas': 'pandas',
  'numpy': 'numpy',
  'data structures': 'data structures & algorithms',
  'data structures & algorithms': 'data structures & algorithms',
  'data structures and algorithms': 'data structures & algorithms',
  'algorithms': 'data structures & algorithms',
  'dsa': 'data structures & algorithms',
  'system design': 'system design',
  'oop': 'object oriented programming',
  'oops': 'object oriented programming',
  'object-oriented programming': 'object oriented programming',
  'object oriented programming': 'object oriented programming',
  'prisma': 'prisma',
  'nextjs': 'next.js',
  'next.js': 'next.js',
  'socket.io': 'socket.io',
  'web sockets': 'websockets',
  'websockets': 'websockets',
  'figma': 'figma',
};

// Skill aliases lookup
const KNOWN_SKILLS = Array.from(new Set(Object.values(SYNONYMS)));

// Strict skill name validation: max 40 chars, only letters, digits, space and + # . - /
const SKILL_REGEX = /^[a-z0-9+#.\-/ ]{1,40}$/;

/**
 * Validate skill name against strict character and length constraints
 * @param {string} skill
 * @returns {boolean}
 */
function isValidSkillName(skill) {
  if (!skill || typeof skill !== 'string') return false;
  const trimmed = skill.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  return SKILL_REGEX.test(trimmed);
}

/**
 * Normalize and validate any user-supplied or extracted skill string.
 * Returns empty string if invalid (dropped).
 *
 * @param {string} skill
 * @returns {string} normalized skill name (lowercase, mapped, max 40 chars)
 */
function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'string') return '';
  let cleaned = skill.trim().toLowerCase().replace(/^[•\-\*\s]+/, '');
  if (!cleaned || cleaned.length > 40) return '';
  if (!SKILL_REGEX.test(cleaned)) return '';

  if (SYNONYMS[cleaned]) {
    cleaned = SYNONYMS[cleaned];
  }

  // Ensure canonical mapped form also conforms
  if (cleaned.length > 40 || !SKILL_REGEX.test(cleaned)) return '';

  return cleaned;
}

/**
 * Normalizes, validates, and caps an array of skills.
 * Drops invalid entries and enforces max list size (default 50).
 *
 * @param {Array<string|Object>} skills
 * @param {number} [maxSkills=50]
 * @returns {Array} Sanitized skills (strings or objects)
 */
function sanitizeSkillList(skills = [], maxSkills = 50) {
  if (!Array.isArray(skills)) return [];
  const result = [];
  const seen = new Set();

  for (const item of skills) {
    let rawName = '';
    let isObject = false;

    if (typeof item === 'string') {
      rawName = item;
    } else if (item && typeof item === 'object') {
      rawName = item.name;
      isObject = true;
    }

    const norm = normalizeSkill(rawName);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      if (isObject) {
        result.push({
          ...item,
          name: norm,
        });
      } else {
        result.push(norm);
      }
      if (result.length >= maxSkills) break;
    }
  }

  return result;
}

/**
 * Accurately determines if a skill token appears in the given text.
 * Enforces whole-token boundaries and handles special skill names.
 *
 * @param {string} skill
 * @param {string} text
 * @returns {boolean}
 */
function matchSkillInText(skill, text) {
  if (!skill || !text || typeof text !== 'string') return false;
  const s = skill.toLowerCase().trim();
  if (!s) return false;

  let regex;
  if (s === 'c') {
    // Negative lookbehind: not preceded by alphanumeric
    // Negative lookahead: not followed by alphanumeric, +, or #
    regex = /(?<![a-z0-9])c(?![a-z0-9+#])/i;
  } else if (s === 'r') {
    // Negative lookbehind: not preceded by alphanumeric
    // Negative lookahead: not followed by alphanumeric
    regex = /(?<![a-z0-9])r(?![a-z0-9])/i;
  } else if (s === 'go' || s === 'golang') {
    regex = /(?<![a-z0-9])(?:go|golang)(?![a-z0-9])/i;
  } else if (s === 'c++' || s === 'cpp' || s === 'cplusplus') {
    regex = /(?<![a-z0-9])(?:c\+\+(?:11|14|17|20)?|cpp|cplusplus)(?![a-z0-9+])/i;
  } else if (s === 'c#' || s === 'csharp') {
    regex = /(?<![a-z0-9])(?:c#|csharp)(?![a-z0-9#])/i;
  } else if (s === '.net' || s === 'dotnet' || s === 'asp.net') {
    regex = /(?:(?<![a-z0-9])(?:\.net|dotnet)|asp\.net)(?![a-z0-9])/i;
  } else if (s === 'node.js' || s === 'nodejs') {
    regex = /(?<![a-z0-9])node(?:\.|\s+)?js(?![a-z0-9])/i;
  } else if (s === 'next.js' || s === 'nextjs') {
    regex = /(?<![a-z0-9])next(?:\.|\s+)?js(?![a-z0-9])/i;
  } else if (s === 'vue.js' || s === 'vuejs') {
    regex = /(?<![a-z0-9])vue(?:\.|\s+)?js(?![a-z0-9])/i;
  } else if (s === 'react.js' || s === 'reactjs') {
    regex = /(?<![a-z0-9])react(?:\.|\s+)?js(?![a-z0-9])/i;
  } else if (s === 'ci/cd' || s === 'cicd' || s === 'ci-cd') {
    regex = /(?<![a-z0-9])ci[\s/\-]?cd(?![a-z0-9])/i;
  } else if (
    s === 'rest api' ||
    s === 'rest' ||
    s === 'restful' ||
    s === 'restful api' ||
    s === 'restful apis' ||
    s === 'rest apis' ||
    s === 'rest/restful apis'
  ) {
    regex = /(?<![a-z0-9])(?:rest(?:ful)?(?:\s+apis?)?|rest\s+api)(?![a-z0-9])/i;
  } else {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
  }

  return regex.test(text);
}

/**
 * Extract skills from raw text using rule-based keyword matching with accurate token boundaries
 * @param {string} text
 * @returns {string[]} array of unique normalized skill names
 */
function extractSkillsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matched = new Set();

  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    if (matchSkillInText(alias, text)) {
      matched.add(canonical);
    }
  }

  return Array.from(matched);
}

module.exports = {
  SYNONYMS,
  KNOWN_SKILLS,
  SKILL_REGEX,
  isValidSkillName,
  normalizeSkill,
  sanitizeSkillList,
  matchSkillInText,
  extractSkillsFromText,
};

