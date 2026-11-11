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
  'CS Fundamentals',
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
  'tailwind css': 'Frontend',
  bootstrap: 'Frontend',
  sass: 'Frontend',
  scss: 'Frontend',
  redux: 'Frontend',
  'redux toolkit': 'Frontend',
  rtk: 'Frontend',
  'react query': 'Frontend',
  'tanstack query': 'Frontend',
  axios: 'Frontend',
  zustand: 'Frontend',
  webpack: 'Frontend',
  vite: 'Frontend',
  jquery: 'Frontend',

  // Backend
  'node.js': 'Backend',
  nodejs: 'Backend',
  express: 'Backend',
  expressjs: 'Backend',
  'express.js': 'Backend',
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
  'restful': 'Backend',
  'restful api': 'Backend',
  'restful apis': 'Backend',
  'rest apis': 'Backend',
  'rest/restful apis': 'Backend',
  jwt: 'Backend',
  jsonwebtoken: 'Backend',
  bcrypt: 'Backend',
  bcryptjs: 'Backend',
  nodemailer: 'Backend',
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
  vercel: 'Tools & Platforms',
  render: 'Tools & Platforms',
  netlify: 'Tools & Platforms',
  cloudinary: 'Tools & Platforms',
  'vs code': 'Tools & Platforms',
  vscode: 'Tools & Platforms',
  'visual studio code': 'Tools & Platforms',

  // CS Fundamentals
  dbms: 'CS Fundamentals',
  'database management systems': 'CS Fundamentals',
  'database management system': 'CS Fundamentals',
  os: 'CS Fundamentals',
  'operating systems': 'CS Fundamentals',
  'operating system': 'CS Fundamentals',
  'computer networks': 'CS Fundamentals',
  cn: 'CS Fundamentals',
  networking: 'CS Fundamentals',
  'data structures': 'CS Fundamentals',
  dsa: 'CS Fundamentals',
  'data structures & algorithms': 'CS Fundamentals',
  'data structures and algorithms': 'CS Fundamentals',
  algorithms: 'CS Fundamentals',
  oop: 'CS Fundamentals',
  oops: 'CS Fundamentals',
  'object-oriented programming': 'CS Fundamentals',
  'object oriented programming': 'CS Fundamentals',

  // Concepts
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
    'CS Fundamentals': [],
    Concepts: [],
    Other: [],
  };

  skills.forEach((skill) => {
    const name = typeof skill === 'object' ? skill?.name : skill;
    if (!name) return;
    const cat = getSkillCategory(name);
    if (grouped[cat]) {
      grouped[cat].push(skill);
    } else {
      grouped.Other.push(skill);
    }
  });

  return grouped;
}
