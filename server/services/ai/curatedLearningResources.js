/**
 * Curated Learning Resources Allowlist
 *
 * Strict URL safety policy: The AI is NEVER allowed to invent arbitrary URLs.
 * Any link provided to students must match an entry in this verified allowlist
 * of official documentation, canonical tutorials, and trusted learning hubs.
 */

const CURATED_RESOURCES = {
  // Languages
  javascript: {
    title: 'MDN Web Docs: JavaScript Guide',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    resourceType: 'Official Documentation',
  },
  typescript: {
    title: 'TypeScript Official Handbook',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
    resourceType: 'Official Documentation',
  },
  python: {
    title: 'Python Official Tutorial',
    url: 'https://docs.python.org/3/tutorial/',
    resourceType: 'Official Documentation',
  },
  java: {
    title: 'Oracle Java Documentation & Tutorials',
    url: 'https://docs.oracle.com/javase/tutorial/',
    resourceType: 'Official Documentation',
  },
  'c++': {
    title: 'cppreference.com - C++ Reference',
    url: 'https://en.cppreference.com/w/cpp',
    resourceType: 'Official Documentation',
  },
  c: {
    title: 'GNU C Programming Tutorial',
    url: 'https://www.gnu.org/software/gnu-c-manual/gnu-c-manual.html',
    resourceType: 'Official Documentation',
  },
  golang: {
    title: 'A Tour of Go',
    url: 'https://go.dev/tour/welcome/1',
    resourceType: 'Interactive Tutorial',
  },
  go: {
    title: 'A Tour of Go',
    url: 'https://go.dev/tour/welcome/1',
    resourceType: 'Interactive Tutorial',
  },
  rust: {
    title: 'The Rust Programming Language Book',
    url: 'https://doc.rust-lang.org/book/',
    resourceType: 'Official Documentation',
  },
  sql: {
    title: 'PostgreSQL Tutorial & SQL Fundamentals',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
    resourceType: 'Official Documentation',
  },

  // Frontend
  react: {
    title: 'React Official Documentation (react.dev)',
    url: 'https://react.dev/learn',
    resourceType: 'Official Documentation',
  },
  'react.js': {
    title: 'React Official Documentation (react.dev)',
    url: 'https://react.dev/learn',
    resourceType: 'Official Documentation',
  },
  nextjs: {
    title: 'Next.js Official Documentation',
    url: 'https://nextjs.org/docs',
    resourceType: 'Official Documentation',
  },
  vue: {
    title: 'Vue.js Official Guide',
    url: 'https://vuejs.org/guide/introduction.html',
    resourceType: 'Official Documentation',
  },
  angular: {
    title: 'Angular Documentation',
    url: 'https://angular.dev/overview',
    resourceType: 'Official Documentation',
  },
  tailwind: {
    title: 'Tailwind CSS Documentation',
    url: 'https://tailwindcss.com/docs',
    resourceType: 'Official Documentation',
  },
  'tailwind css': {
    title: 'Tailwind CSS Documentation',
    url: 'https://tailwindcss.com/docs',
    resourceType: 'Official Documentation',
  },
  html: {
    title: 'MDN Web Docs: HTML Basics',
    url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML',
    resourceType: 'Official Documentation',
  },
  css: {
    title: 'MDN Web Docs: CSS Basics',
    url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS',
    resourceType: 'Official Documentation',
  },

  // Backend
  nodejs: {
    title: 'Node.js Documentation and Guides',
    url: 'https://nodejs.org/en/docs/guides',
    resourceType: 'Official Documentation',
  },
  'node.js': {
    title: 'Node.js Documentation and Guides',
    url: 'https://nodejs.org/en/docs/guides',
    resourceType: 'Official Documentation',
  },
  express: {
    title: 'Express.js Getting Started Guide',
    url: 'https://expressjs.com/en/starter/installing.html',
    resourceType: 'Official Documentation',
  },
  'express.js': {
    title: 'Express.js Getting Started Guide',
    url: 'https://expressjs.com/en/starter/installing.html',
    resourceType: 'Official Documentation',
  },
  django: {
    title: 'Django Documentation: Getting Started',
    url: 'https://docs.djangoproject.com/en/stable/intro/tutorial01/',
    resourceType: 'Official Documentation',
  },
  flask: {
    title: 'Flask Documentation: Quickstart',
    url: 'https://flask.palletsprojects.com/en/stable/quickstart/',
    resourceType: 'Official Documentation',
  },
  fastapi: {
    title: 'FastAPI Official Tutorial',
    url: 'https://fastapi.tiangolo.com/tutorial/',
    resourceType: 'Official Documentation',
  },
  spring: {
    title: 'Spring Boot Getting Started Guides',
    url: 'https://spring.io/guides',
    resourceType: 'Official Documentation',
  },
  'spring boot': {
    title: 'Spring Boot Getting Started Guides',
    url: 'https://spring.io/guides',
    resourceType: 'Official Documentation',
  },

  // Databases & Caching
  mongodb: {
    title: 'MongoDB University & Manual',
    url: 'https://www.mongodb.com/docs/manual/tutorial/getting-started/',
    resourceType: 'Official Documentation',
  },
  postgresql: {
    title: 'PostgreSQL Official Documentation',
    url: 'https://www.postgresql.org/docs/current/',
    resourceType: 'Official Documentation',
  },
  mysql: {
    title: 'MySQL Reference Manual',
    url: 'https://dev.mysql.com/doc/refman/8.0/en/tutorial.html',
    resourceType: 'Official Documentation',
  },
  redis: {
    title: 'Redis Documentation & Quickstart',
    url: 'https://redis.io/docs/latest/develop/get-started/',
    resourceType: 'Official Documentation',
  },

  // Cloud & DevOps
  docker: {
    title: 'Docker Getting Started Guide',
    url: 'https://docs.docker.com/get-started/',
    resourceType: 'Official Documentation',
  },
  kubernetes: {
    title: 'Kubernetes Official Tutorials',
    url: 'https://kubernetes.io/docs/tutorials/',
    resourceType: 'Official Documentation',
  },
  aws: {
    title: 'AWS Getting Started Resource Center',
    url: 'https://aws.amazon.com/getting-started/',
    resourceType: 'Official Documentation',
  },
  azure: {
    title: 'Microsoft Azure Fundamentals Documentation',
    url: 'https://learn.microsoft.com/en-us/azure/',
    resourceType: 'Official Documentation',
  },
  gcp: {
    title: 'Google Cloud Overview and Quickstarts',
    url: 'https://cloud.google.com/docs',
    resourceType: 'Official Documentation',
  },
  git: {
    title: 'Pro Git Book (Free Official Guide)',
    url: 'https://git-scm.com/book/en/v2',
    resourceType: 'Official Documentation',
  },
  linux: {
    title: 'Linux Journey (Free Interactive Fundamentals)',
    url: 'https://linuxjourney.com/',
    resourceType: 'Interactive Tutorial',
  },
  ci_cd: {
    title: 'GitHub Actions Documentation',
    url: 'https://docs.github.com/en/actions',
    resourceType: 'Official Documentation',
  },
  'ci/cd': {
    title: 'GitHub Actions Documentation',
    url: 'https://docs.github.com/en/actions',
    resourceType: 'Official Documentation',
  },

  // Testing & Quality
  jest: {
    title: 'Jest Getting Started Guide',
    url: 'https://jestjs.io/docs/getting-started',
    resourceType: 'Official Documentation',
  },
  selenium: {
    title: 'Selenium Official Documentation',
    url: 'https://www.selenium.dev/documentation/',
    resourceType: 'Official Documentation',
  },

  // Data Science & AI
  pandas: {
    title: 'Pandas User Guide & Tutorials',
    url: 'https://pandas.pydata.org/docs/user_guide/index.html',
    resourceType: 'Official Documentation',
  },
  numpy: {
    title: 'NumPy Quickstart Guide',
    url: 'https://numpy.org/doc/stable/user/quickstart.html',
    resourceType: 'Official Documentation',
  },
  'machine learning': {
    title: 'Scikit-Learn Getting Started Guide',
    url: 'https://scikit-learn.org/stable/getting_started.html',
    resourceType: 'Official Documentation',
  },
  tensorflow: {
    title: 'TensorFlow Core Tutorials',
    url: 'https://www.tensorflow.org/tutorials',
    resourceType: 'Official Documentation',
  },
  pytorch: {
    title: 'PyTorch Official Tutorials',
    url: 'https://pytorch.org/tutorials/',
    resourceType: 'Official Documentation',
  },
};

// Approved domain patterns for allowlist verification
const ALLOWED_DOMAINS = [
  'developer.mozilla.org',
  'typescriptlang.org',
  'docs.python.org',
  'docs.oracle.com',
  'en.cppreference.com',
  'gnu.org',
  'go.dev',
  'rust-lang.org',
  'postgresql.org',
  'react.dev',
  'nextjs.org',
  'vuejs.org',
  'angular.dev',
  'tailwindcss.com',
  'nodejs.org',
  'expressjs.com',
  'djangoproject.com',
  'palletsprojects.com',
  'fastapi.tiangolo.com',
  'spring.io',
  'mongodb.com',
  'dev.mysql.com',
  'redis.io',
  'docs.docker.com',
  'kubernetes.io',
  'aws.amazon.com',
  'learn.microsoft.com',
  'cloud.google.com',
  'git-scm.com',
  'linuxjourney.com',
  'docs.github.com',
  'jestjs.io',
  'selenium.dev',
  'pandas.pydata.org',
  'numpy.org',
  'scikit-learn.org',
  'tensorflow.org',
  'pytorch.org',
];

/**
 * Normalizes a skill key for dictionary lookup
 */
function normalizeKey(skill) {
  if (!skill || typeof skill !== 'string') return '';
  return skill.toLowerCase().trim().replace(/[\s\-_.]+/g, '');
}

/**
 * Looks up verified curated resource for a given skill.
 * Returns null if no verified resource is found.
 */
function getCuratedResource(skill) {
  if (!skill || typeof skill !== 'string') return null;
  const rawLower = skill.toLowerCase().trim();
  if (CURATED_RESOURCES[rawLower]) {
    return CURATED_RESOURCES[rawLower];
  }

  const norm = normalizeKey(skill);
  for (const [key, res] of Object.entries(CURATED_RESOURCES)) {
    if (normalizeKey(key) === norm) {
      return res;
    }
  }

  return null;
}

/**
 * Validates whether a given URL belongs to the approved curated allowlist.
 * If invalid or unknown, returns null.
 */
function sanitizeResourceUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    return isAllowed ? url : null;
  } catch {
    return null;
  }
}

module.exports = {
  CURATED_RESOURCES,
  ALLOWED_DOMAINS,
  getCuratedResource,
  sanitizeResourceUrl,
};
