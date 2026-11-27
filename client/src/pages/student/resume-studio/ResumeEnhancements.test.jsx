import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import {
  DEFAULT_SKILL_CATEGORIES,
  normalizeSkills,
  filterNonEmptySkillCategories,
} from './utils/skillsHelper';
import {
  normalizeLanguages,
  formatLanguageName,
} from './utils/languagesHelper';
import CategorizedSkillsEditor from './components/CategorizedSkillsEditor';
import LanguageInput from './components/LanguageInput';
import StudioPreview from './components/StudioPreview';

describe('Phase 3, 4, 5 Resume Enhancements Unit Tests', () => {
  // =========================================================================
  // 1. SKILLS NORMALIZATION & CATEGORIZATION TESTS
  // =========================================================================
  describe('Skills Normalization & Categories', () => {
    it('1.1 should define all 10 required standard skill categories', () => {
      const categoryNames = DEFAULT_SKILL_CATEGORIES.map((c) => c.name);
      expect(categoryNames).toContain('Programming Languages');
      expect(categoryNames).toContain('Frontend Development');
      expect(categoryNames).toContain('Backend Development');
      expect(categoryNames).toContain('Databases');
      expect(categoryNames).toContain('Core Computer Science Subjects');
      expect(categoryNames).toContain('Frameworks and Libraries');
      expect(categoryNames).toContain('Developer Tools and Platforms');
      expect(categoryNames).toContain('Cloud and DevOps');
      expect(categoryNames).toContain('AI and Machine Learning');
      expect(categoryNames).toContain('Other Technical Skills');
      expect(categoryNames.length).toBe(10);
    });

    it('1.2 should normalize legacy comma-separated string into structured category', () => {
      const raw = 'JavaScript, TypeScript, React, Node.js';
      const normalized = normalizeSkills(raw);
      expect(normalized).toEqual([
        {
          category: 'Technical Skills',
          items: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
        },
      ]);
    });

    it('1.3 should normalize legacy flat string array into structured category', () => {
      const raw = ['C++', 'Python', 'Java'];
      const normalized = normalizeSkills(raw);
      expect(normalized).toEqual([
        {
          category: 'Technical Skills',
          items: ['C++', 'Python', 'Java'],
        },
      ]);
    });

    it('1.4 should preserve and deduplicate already categorized skills', () => {
      const raw = [
        {
          category: 'Programming Languages',
          items: ['Python', 'python', 'Go', 'GO'],
        },
        {
          category: 'Databases',
          items: ['MongoDB', 'PostgreSQL'],
        },
      ];
      const normalized = normalizeSkills(raw);
      expect(normalized).toEqual([
        {
          category: 'Programming Languages',
          items: ['Python', 'Go'],
        },
        {
          category: 'Databases',
          items: ['MongoDB', 'PostgreSQL'],
        },
      ]);
    });

    it('1.5 filterNonEmptySkillCategories should exclude empty categories', () => {
      const raw = [
        { category: 'Languages', items: ['Rust'] },
        { category: 'Empty Category', items: [] },
      ];
      const filtered = filterNonEmptySkillCategories(raw);
      expect(filtered.length).toBe(1);
      expect(filtered[0].category).toBe('Languages');
    });

    it('1.6 CategorizedSkillsEditor should render categories and input buffers', () => {
      const skills = [
        { category: 'Programming Languages', items: ['C++', 'Python'] },
      ];
      const html = renderToString(
        <CategorizedSkillsEditor skills={skills} onChange={() => {}} />
      );
      expect(html).toContain('data-testid="categorized-skills-editor"');
      expect(html).toContain('Programming Languages');
      expect(html).toContain('C++');
      expect(html).toContain('Python');
      expect(html).toContain('data-testid="skill-input-0"');
      expect(html).toContain('data-testid="add-category-button"');
    });
  });

  // =========================================================================
  // 2. LANGUAGES NORMALIZATION & CHIPS TESTS
  // =========================================================================
  describe('Languages Normalization & Chips', () => {
    it('2.1 should format language names to Title Case', () => {
      expect(formatLanguageName('english')).toBe('English');
      expect(formatLanguageName('HINDI')).toBe('Hindi');
      expect(formatLanguageName('gujarati')).toBe('Gujarati');
    });

    it('2.2 should normalize comma-separated languages with whitespace', () => {
      const input = 'English, Hindi, Gujarati';
      const result = normalizeLanguages(input);
      expect(result).toEqual(['English', 'Hindi', 'Gujarati']);
    });

    it('2.3 should normalize newline-separated languages', () => {
      const input = 'English\nHindi\nGujarati';
      const result = normalizeLanguages(input);
      expect(result).toEqual(['English', 'Hindi', 'Gujarati']);
    });

    it('2.4 should deduplicate languages case-insensitively', () => {
      const input = 'English, english, ENGLISH, Hindi, hindi';
      const result = normalizeLanguages(input);
      expect(result).toEqual(['English', 'Hindi']);
    });

    it('2.5 should handle array input cleanly', () => {
      const input = ['English, Hindi', 'Gujarati', 'english'];
      const result = normalizeLanguages(input);
      expect(result).toEqual(['English', 'Hindi', 'Gujarati']);
    });

    it('2.6 LanguageInput component should render chips and separate buffer input', () => {
      const html = renderToString(
        <LanguageInput
          languages={['English', 'Hindi', 'Gujarati']}
          onChange={() => {}}
        />
      );
      expect(html).toContain('data-testid="language-input-container"');
      expect(html).toContain('data-testid="language-chip-0"');
      expect(html).toContain('English');
      expect(html).toContain('Hindi');
      expect(html).toContain('Gujarati');
      expect(html).toContain('data-testid="language-buffer-input"');
      expect(html).toContain('data-testid="add-language-button"');
    });
  });

  // =========================================================================
  // 3. PROFILE LINKS DISPLAY & PREVIEW TESTS
  // =========================================================================
  describe('Profile Links Display & Live Preview', () => {
    const baseResumeData = {
      contact: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+91 9999999999',
        location: 'Mumbai, India',
        linkedin: 'https://linkedin.com/in/janedoe',
        linkedinDisplay: 'short',
        github: 'https://github.com/janedoe',
        githubDisplay: 'short',
      },
      summary: 'Experienced software engineer.',
      skills: [
        { category: 'Programming Languages', items: ['Python', 'TypeScript'] },
      ],
      education: [],
      experience: [],
      projects: [],
      languages: ['English', 'Hindi'],
    };

    it('3.1 should render short clickable text for LinkedIn and GitHub when display is short', () => {
      const html = renderToString(
        <StudioPreview resumeData={baseResumeData} templateId="modern" />
      );
      expect(html).toContain('LinkedIn');
      expect(html).toContain('GitHub');
      expect(html).toContain('href="https://linkedin.com/in/janedoe"');
      expect(html).toContain('href="https://github.com/janedoe"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it('3.2 should render full URL for LinkedIn and GitHub when display preference is full', () => {
      const fullDisplayData = {
        ...baseResumeData,
        contact: {
          ...baseResumeData.contact,
          linkedinDisplay: 'full',
          githubDisplay: 'full',
        },
      };
      const html = renderToString(
        <StudioPreview resumeData={fullDisplayData} templateId="modern" />
      );
      expect(html).toContain('https://linkedin.com/in/janedoe');
      expect(html).toContain('https://github.com/janedoe');
    });

    it('3.3 should render categorized skills cleanly in preview without duplicate headers', () => {
      const html = renderToString(
        <StudioPreview resumeData={baseResumeData} templateId="modern" />
      );
      expect(html).toContain('data-testid="preview-section-skills"');
      expect(html).toContain('Programming Languages');
      expect(html).toContain('Python, TypeScript');
    });

    it('3.4 should render normalized languages in preview', () => {
      const html = renderToString(
        <StudioPreview resumeData={baseResumeData} templateId="modern" />
      );
      expect(html).toContain('data-testid="preview-section-extras"');
      expect(html).toContain('Languages');
      expect(html).toContain('English, Hindi');
    });
  });
});
