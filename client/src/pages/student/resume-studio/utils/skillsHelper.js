/**
 * Standard Skill Categories and Presets for Resume Studio
 */
export const DEFAULT_SKILL_CATEGORIES = [
  {
    name: 'Programming Languages',
    examples: ['C', 'C++', 'Java', 'Python', 'JavaScript', 'TypeScript', 'PHP', 'Go', 'Rust', 'Ruby'],
  },
  {
    name: 'Frontend Development',
    examples: ['HTML', 'CSS', 'JavaScript', 'React.js', 'Tailwind CSS', 'Bootstrap', 'Next.js', 'Redux', 'Vue.js'],
  },
  {
    name: 'Backend Development',
    examples: ['Node.js', 'Express.js', 'FastAPI', 'Django', 'Laravel', 'Spring Boot', 'REST APIs', 'GraphQL'],
  },
  {
    name: 'Databases',
    examples: ['MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'Firebase', 'SQLite', 'Oracle'],
  },
  {
    name: 'Core Computer Science Subjects',
    examples: ['Data Structures and Algorithms', 'Object-Oriented Programming', 'DBMS', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'System Design'],
  },
  {
    name: 'Frameworks and Libraries',
    examples: ['React', 'Mongoose', 'Axios', 'Pydantic', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'Prisma'],
  },
  {
    name: 'Developer Tools and Platforms',
    examples: ['Git', 'GitHub', 'Postman', 'VS Code', 'Docker', 'Linux', 'Jira', 'Figma'],
  },
  {
    name: 'Cloud and DevOps',
    examples: ['AWS', 'Vercel', 'Render', 'MongoDB Atlas', 'CI/CD', 'GitHub Actions', 'Google Cloud Platform', 'Azure', 'Kubernetes'],
  },
  {
    name: 'AI and Machine Learning',
    examples: ['Machine Learning', 'Deep Learning', 'NLP', 'Generative AI', 'Large Language Models', 'Computer Vision'],
  },
  {
    name: 'Other Technical Skills',
    examples: ['Agile Methodologies', 'Unit Testing', 'Jest', 'Vitest', 'Microservices Architecture', 'Cybersecurity Basics'],
  },
];

/**
 * Normalizes any legacy or structured skills representation into canonical:
 * [{ category: string, items: string[] }]
 */
export function normalizeSkills(raw) {
  if (!raw) return [];

  // Case 1: Single string (e.g. "React, Node.js, Python")
  if (typeof raw === 'string') {
    const items = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? [{ category: 'Technical Skills', items }] : [];
  }

  // Case 2: Array of items
  if (Array.isArray(raw)) {
    // Sub-case 2a: Flat array of strings (e.g. ["JavaScript", "Python"])
    if (raw.length > 0 && typeof raw[0] === 'string') {
      const items = raw
        .flatMap((s) => (typeof s === 'string' ? s.split(/[,;\n]+/) : []))
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length > 0 ? [{ category: 'Technical Skills', items }] : [];
    }

    // Sub-case 2b: Array of category objects
    const result = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const category = (entry.category || entry.name || 'Technical Skills').trim();
      let items = [];
      if (Array.isArray(entry.items)) {
        items = entry.items
          .flatMap((item) => (typeof item === 'string' ? item.split(/[,;\n]+/) : []))
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (typeof entry.items === 'string') {
        items = entry.items
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      // Deduplicate items within the category case-insensitively
      const seen = new Set();
      const dedupedItems = [];
      for (const item of items) {
        const lower = item.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          dedupedItems.push(item);
        }
      }
      result.push({
        category: category || 'Technical Skills',
        items: dedupedItems,
      });
    }
    return result;
  }

  return [];
}

/**
 * Filters out categories that have zero skill items (for preview and PDF export)
 */
export function filterNonEmptySkillCategories(skills) {
  const normalized = normalizeSkills(skills);
  return normalized.filter((cat) => Array.isArray(cat.items) && cat.items.length > 0);
}
