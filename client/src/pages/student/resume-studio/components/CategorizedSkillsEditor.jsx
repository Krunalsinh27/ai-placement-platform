import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  X,
  Tag,
  Check,
} from 'lucide-react';
import {
  DEFAULT_SKILL_CATEGORIES,
  normalizeSkills,
} from '../utils/skillsHelper';

const CategorizedSkillsEditor = ({
  skills = [],
  onChange,
  onRequestSuggestion,
  isSuggesting = false,
}) => {
  // Normalize skills into canonical format: [{ category, items }]
  const categories = normalizeSkills(skills);

  // Fallback to initial defaults if completely empty
  const activeCategories =
    categories.length > 0
      ? categories
      : [
          { category: 'Programming Languages', items: [] },
          { category: 'Frontend Development', items: [] },
          { category: 'Backend Development', items: [] },
          { category: 'Databases', items: [] },
          { category: 'Developer Tools and Platforms', items: [] },
        ];

  const [inputBuffers, setInputBuffers] = useState({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  // Helper to commit changes up to parent
  const commit = (newCategories) => {
    if (typeof onChange === 'function') {
      onChange(newCategories);
    }
  };

  // Add a skill item to a specific category
  const handleAddSkill = (catIdx, skillName) => {
    const trimmed = (skillName || '').trim();
    if (!trimmed) return;

    const currentItems = activeCategories[catIdx]?.items || [];
    // Prevent duplicate within this category (case-insensitive)
    const exists = currentItems.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return;

    const updated = activeCategories.map((cat, idx) => {
      if (idx !== catIdx) return cat;
      return {
        ...cat,
        items: [...cat.items, trimmed],
      };
    });

    commit(updated);
    setInputBuffers((prev) => ({ ...prev, [catIdx]: '' }));
  };

  // Remove a skill item from a specific category
  const handleRemoveSkill = (catIdx, skillIdx) => {
    const updated = activeCategories.map((cat, idx) => {
      if (idx !== catIdx) return cat;
      return {
        ...cat,
        items: cat.items.filter((_, i) => i !== skillIdx),
      };
    });
    commit(updated);
  };

  // Rename a category
  const handleRenameCategory = (catIdx, newName) => {
    const updated = activeCategories.map((cat, idx) => {
      if (idx !== catIdx) return cat;
      return { ...cat, category: newName };
    });
    commit(updated);
  };

  // Remove an entire category
  const handleRemoveCategory = (catIdx) => {
    const updated = activeCategories.filter((_, idx) => idx !== catIdx);
    commit(updated);
  };

  // Move a category up or down
  const handleMoveCategory = (fromIdx, direction) => {
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= activeCategories.length) return;
    const next = [...activeCategories];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    commit(next);
  };

  // Add a new category
  const handleAddNewCategory = (catName) => {
    const trimmed = (catName || '').trim();
    if (!trimmed) return;

    const exists = activeCategories.some(
      (c) => c.category.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return;

    commit([...activeCategories, { category: trimmed, items: [] }]);
    setNewCategoryName('');
    setShowAddCategoryModal(false);
  };

  // Find example suggestions for this category
  const getSuggestionsForCategory = (catName, currentItems = []) => {
    const matched = DEFAULT_SKILL_CATEGORIES.find(
      (d) => d.name.toLowerCase() === catName.toLowerCase()
    );
    if (!matched) return [];
    const itemSet = new Set(currentItems.map((s) => s.toLowerCase()));
    return matched.examples.filter((ex) => !itemSet.has(ex.toLowerCase()));
  };

  return (
    <div className="space-y-4" data-testid="categorized-skills-editor">
      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="text-xs text-slate-500">
          Organize your skills by domain so ATS scanners and recruiters find matching qualifications quickly.
        </span>
        {onRequestSuggestion && (
          <button
            type="button"
            onClick={() => onRequestSuggestion({ type: 'skills' })}
            disabled={isSuggesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 font-medium text-xs transition disabled:opacity-50 shrink-0"
            title="AI Optimization of Skills"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Optimize Skills Order</span>
          </button>
        )}
      </div>

      {/* List of Skill Categories */}
      <div className="space-y-4">
        {activeCategories.map((cat, catIdx) => {
          const suggestions = getSuggestionsForCategory(cat.category, cat.items);
          const currentBuffer = inputBuffers[catIdx] || '';

          return (
            <div
              key={catIdx}
              className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3 transition-shadow hover:shadow-xs"
              data-testid={`skill-category-${catIdx}`}
            >
              {/* Category Header: Name + Order & Delete Controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Tag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <input
                    type="text"
                    value={cat.category}
                    onChange={(e) => handleRenameCategory(catIdx, e.target.value)}
                    placeholder="Category Name"
                    className="font-bold text-xs text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5 w-full max-w-xs transition"
                  />
                  <span className="text-[10px] text-slate-400 font-medium shrink-0">
                    ({cat.items.length} {cat.items.length === 1 ? 'skill' : 'skills'})
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveCategory(catIdx, -1)}
                    disabled={catIdx === 0}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded"
                    title="Move Category Up"
                    aria-label="Move Category Up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveCategory(catIdx, 1)}
                    disabled={catIdx === activeCategories.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded"
                    title="Move Category Down"
                    aria-label="Move Category Down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(catIdx)}
                    className="p-1 text-rose-500 hover:text-rose-700 rounded ml-1"
                    title="Remove Category"
                    aria-label="Remove Category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Selected Skill Chips */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                {cat.items.length === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">
                    No skills added yet. Click suggestions below or type custom skills.
                  </span>
                ) : (
                  cat.items.map((skill, skillIdx) => (
                    <span
                      key={skillIdx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/80 transition-all hover:bg-indigo-100"
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(catIdx, skillIdx)}
                        className="text-indigo-400 hover:text-indigo-700 focus:outline-none"
                        title={`Remove ${skill}`}
                        aria-label={`Remove ${skill}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Quick Suggestion Pills */}
              {suggestions.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <span>Quick Suggestions:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 max-h-20 overflow-y-auto pr-1">
                    {suggestions.slice(0, 10).map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => handleAddSkill(catIdx, ex)}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>{ex}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Skill Input Buffer */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={currentBuffer}
                  onChange={(e) =>
                    setInputBuffers((prev) => ({ ...prev, [catIdx]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddSkill(catIdx, currentBuffer);
                    }
                  }}
                  placeholder="Type a skill and press Enter or Add (e.g. C++, React, Docker)"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  data-testid={`skill-input-${catIdx}`}
                />
                <button
                  type="button"
                  onClick={() => handleAddSkill(catIdx, currentBuffer)}
                  disabled={!currentBuffer.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition disabled:opacity-40 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Bar: Add Category Actions */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddCategoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs transition"
            data-testid="add-category-button"
          >
            <Plus className="w-4 h-4" />
            <span>Add Skill Category</span>
          </button>
        </div>

        {/* Quick-add preset categories that aren't added yet */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Popular Categories:</span>
          {DEFAULT_SKILL_CATEGORIES.filter(
            (def) => !activeCategories.some((c) => c.category.toLowerCase() === def.name.toLowerCase())
          )
            .slice(0, 3)
            .map((def) => (
              <button
                key={def.name}
                type="button"
                onClick={() => handleAddNewCategory(def.name)}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition"
              >
                + {def.name}
              </button>
            ))}
        </div>
      </div>

      {/* Add Custom Category Popover / Mini-Modal */}
      {showAddCategoryModal && (
        <div className="p-3 bg-white rounded-xl border border-indigo-200 shadow-md space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">Add New Category</span>
            <button
              type="button"
              onClick={() => setShowAddCategoryModal(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddNewCategory(newCategoryName);
                }
              }}
              placeholder="e.g. Cloud and DevOps, Testing, etc."
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => handleAddNewCategory(newCategoryName)}
              disabled={!newCategoryName.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorizedSkillsEditor;
