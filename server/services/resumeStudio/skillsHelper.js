/**
 * Standard Skill Categories and Normalization Helpers for Resume Studio (Backend)
 */
const DEFAULT_SKILL_CATEGORIES = [
  'Programming Languages',
  'Frontend Development',
  'Backend Development',
  'Databases',
  'Core Computer Science Subjects',
  'Frameworks and Libraries',
  'Developer Tools and Platforms',
  'Cloud and DevOps',
  'AI and Machine Learning',
  'Other Technical Skills',
];

/**
 * Normalizes any legacy or structured skills representation into canonical:
 * [{ category: string, items: string[] }]
 */
function normalizeSkills(raw) {
  if (!raw) return [];

  // Case 1: Single string (e.g. "React, Node.js, Python")
  if (typeof raw === 'string') {
    const items = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? [{ category: 'Technical Skills', items }] : [];
  }

  // Case 2: Array
  if (Array.isArray(raw)) {
    // Flat array of strings
    if (raw.length > 0 && typeof raw[0] === 'string') {
      const items = raw
        .flatMap((s) => (typeof s === 'string' ? s.split(/[,;\n]+/) : []))
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length > 0 ? [{ category: 'Technical Skills', items }] : [];
    }

    // Array of category objects
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

      // Deduplicate case-insensitively
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
 * Filters out categories that have zero items (for PDF generation and exports)
 */
function filterNonEmptySkillCategories(skills) {
  const normalized = normalizeSkills(skills);
  return normalized.filter((cat) => Array.isArray(cat.items) && cat.items.length > 0);
}

module.exports = {
  DEFAULT_SKILL_CATEGORIES,
  normalizeSkills,
  filterNonEmptySkillCategories,
};
