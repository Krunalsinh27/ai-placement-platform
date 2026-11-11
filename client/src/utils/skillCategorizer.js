/**
 * Skill categorization utility
 * Maps technical proficiencies into standardized categories
 */

export const SKILL_CATEGORIES = [
  'Languages',
  'Frontend',
  'Backend',
  'Databases',
  'Tools & Platforms',
  'Concepts',
  'Other',
];

const CATEGORY_MAP = {
  // Languages
  javascript: 'Languages',
  typescript: 'Languages',
  python: 'Languages',
  java: 'Languages',
  'c++': 'Languages',
  cpp: 'Languages',
  c: 'Languages',
  'c#': 'Languages',
  csharp: 'Languages',
  ruby: 'Languages',
  go: 'Languages',
  golang: 'Languages',
  rust: 'Languages',
  php: 'Languages',
  swift: 'Languages',
  kotlin: 'Languages',
  scala: 'Languages',
  r: 'Languages',
  dart: 'Languages',
  perl: 'Languages',
  bash: 'Languages',
  shell: 'Languages',

  // Frontend
  react: 'Frontend',
  reactjs: 'Frontend',
  'react.js': 'Frontend',
  'react native': 'Frontend',
  angular: 'Frontend',
  angularjs: 'Frontend',
  vue: 'Frontend',
  vuejs: 'Frontend',
  'vue.js': 'Frontend',
  svelte: 'Frontend',
  'next.js': 'Frontend',
  nextjs: 'Frontend',
  html: 'Frontend',
  html5: 'Frontend',
  css: 'Frontend',
  css3: 'Frontend',
  tailwind: 'Frontend',
  tailwindcss: 'Frontend',
  bootstrap: 'Frontend',
  sass: 'Frontend',
  scss: 'Frontend',
  redux: 'Frontend',
  zustand: 'Frontend',
  webpack: 'Frontend',
  vite: 'Frontend',
  jquery: 'Frontend',

  // Backend
  'node.js': 'Backend',
  nodejs: 'Backend',
  express: 'Backend',
  expressjs: 'Backend',
  django: 'Backend',
  fastapi: 'Backend',
  flask: 'Backend',
  spring: 'Backend',
  'spring boot': 'Backend',
  springboot: 'Backend',
  'nest.js': 'Backend',
  nestjs: 'Backend',
  'asp.net': 'Backend',
  dotnet: 'Backend',
  '.net': 'Backend',
  laravel: 'Backend',
  graphql: 'Backend',
  rest: 'Backend',
  'rest api': 'Backend',
  'restful api': 'Backend',
  microservices: 'Backend',
  grpc: 'Backend',

  // Databases
  mongodb: 'Databases',
  mysql: 'Databases',
  postgresql: 'Databases',
  postgres: 'Databases',
  sqlite: 'Databases',
  redis: 'Databases',
  cassandra: 'Databases',
  oracle: 'Databases',
  dynamodb: 'Databases',
  mariadb: 'Databases',
  firebase: 'Databases',
  elasticsearch: 'Databases',
  neo4j: 'Databases',
  sql: 'Databases',
  nosql: 'Databases',
  prisma: 'Databases',
  mongoose: 'Databases',

  // Tools & Platforms
  docker: 'Tools & Platforms',
  kubernetes: 'Tools & Platforms',
  k8s: 'Tools & Platforms',
  aws: 'Tools & Platforms',
  azure: 'Tools & Platforms',
  gcp: 'Tools & Platforms',
  'google cloud': 'Tools & Platforms',
  git: 'Tools & Platforms',
  github: 'Tools & Platforms',
  gitlab: 'Tools & Platforms',
  linux: 'Tools & Platforms',
  jenkins: 'Tools & Platforms',
  'ci/cd': 'Tools & Platforms',
  terraform: 'Tools & Platforms',
  ansible: 'Tools & Platforms',
  postman: 'Tools & Platforms',
  kafka: 'Tools & Platforms',
  rabbitmq: 'Tools & Platforms',
  nginx: 'Tools & Platforms',
  jira: 'Tools & Platforms',

  // Concepts
  'data structures': 'Concepts',
  dsa: 'Concepts',
  algorithms: 'Concepts',
  oop: 'Concepts',
  'object-oriented programming': 'Concepts',
  'system design': 'Concepts',
  'machine learning': 'Concepts',
  ml: 'Concepts',
  'deep learning': 'Concepts',
  ai: 'Concepts',
  'artificial intelligence': 'Concepts',
  nlp: 'Concepts',
  'computer vision': 'Concepts',
  devops: 'Concepts',
  agile: 'Concepts',
  scrum: 'Concepts',
  'unit testing': 'Concepts',
  cybersecurity: 'Concepts',
  web3: 'Concepts',
  blockchain: 'Concepts',
};

export function getSkillCategory(skillName) {
  if (!skillName) return 'Other';
  const norm = String(skillName).toLowerCase().trim();
  return CATEGORY_MAP[norm] || 'Other';
}

export function groupSkillsByCategory(skills = []) {
  const grouped = {
    Languages: [],
    Frontend: [],
    Backend: [],
    Databases: [],
    'Tools & Platforms': [],
    Concepts: [],
    Other: [],
  };

  skills.forEach((skill) => {
    const name = typeof skill === 'object' ? skill?.name : skill;
    if (!name) return;
    const cat = getSkillCategory(name);
    grouped[cat].push(skill);
  });

  return grouped;
}

