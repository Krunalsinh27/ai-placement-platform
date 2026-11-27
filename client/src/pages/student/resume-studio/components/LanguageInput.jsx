import React, { useState } from 'react';
import { Plus, X, Globe } from 'lucide-react';
import {
  normalizeLanguages,
  formatLanguageName,
  COMMON_LANGUAGE_SUGGESTIONS,
} from '../utils/languagesHelper';

const LanguageInput = ({ languages = [], onChange, label = 'Languages Spoken' }) => {
  const currentList = normalizeLanguages(languages);
  const [buffer, setBuffer] = useState('');

  const commit = (newList) => {
    if (typeof onChange === 'function') {
      onChange(newList);
    }
  };

  const handleAddTokens = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const tokens = normalizeLanguages(rawText);
    if (tokens.length === 0) return;

    const seen = new Set(currentList.map((l) => l.toLowerCase()));
    const next = [...currentList];

    for (const token of tokens) {
      if (!seen.has(token.toLowerCase())) {
        seen.add(token.toLowerCase());
        next.push(token);
      }
    }

    commit(next);
    setBuffer('');
  };

  const handleRemove = (idx) => {
    const next = currentList.filter((_, i) => i !== idx);
    commit(next);
  };

  const handleSuggestionClick = (lang) => {
    handleAddTokens(lang);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTokens(buffer);
    }
  };

  const handleBlur = () => {
    if (buffer.trim()) {
      handleAddTokens(buffer);
    }
  };

  const unusedSuggestions = COMMON_LANGUAGE_SUGGESTIONS.filter(
    (s) => !currentList.some((l) => l.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-2" data-testid="language-input-container">
      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-indigo-600" />
        <span>{label}</span>
      </label>

      {/* Selected Language Chips */}
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[34px] p-2 bg-slate-50 border border-slate-200 rounded-xl"
        data-testid="language-chips-wrapper"
      >
        {currentList.length === 0 ? (
          <span className="text-xs text-slate-400 italic">
            No languages added yet. Type below or select from suggestions.
          </span>
        ) : (
          currentList.map((lang, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-indigo-700 border border-indigo-200/80 shadow-2xs transition-all hover:border-indigo-300"
              data-testid={`language-chip-${idx}`}
            >
              <span>{lang}</span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="text-slate-400 hover:text-rose-600 focus:outline-none transition-colors"
                title={`Remove ${lang}`}
                aria-label={`Remove ${lang}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Separate Input Buffer */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Type language and press Enter or comma (e.g. English, Hindi, Gujarati)"
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          data-testid="language-buffer-input"
        />
        <button
          type="button"
          onClick={() => handleAddTokens(buffer)}
          disabled={!buffer.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition disabled:opacity-40 shrink-0"
          data-testid="add-language-button"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Quick Suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="pt-1">
          <div className="text-[10px] font-semibold text-slate-500 mb-1">Suggestions:</div>
          <div className="flex flex-wrap items-center gap-1">
            {unusedSuggestions.slice(0, 8).map((sugg) => (
              <button
                key={sugg}
                type="button"
                onClick={() => handleSuggestionClick(sugg)}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition-colors"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>{sugg}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageInput;
