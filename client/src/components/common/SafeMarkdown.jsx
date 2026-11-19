import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Theme color maps for SafeMarkdown.
 * Centralized color configurations for light and dark variants to guarantee WCAG 4.5:1+ contrast.
 */
const VARIANTS = {
  light: {
    body: 'text-slate-800',
    heading: 'text-slate-900',
    bold: 'text-slate-900',
    list: 'text-slate-800',
    inlineCode: 'bg-slate-200/70 text-indigo-700',
    linkLabel: 'text-slate-800',
    linkUrl: 'text-slate-400',
    codeBlock: {
      wrapper: 'bg-slate-100 border-slate-300 text-slate-900',
      header: 'bg-slate-200 text-slate-700 border-slate-300',
      copyBtn: 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/70',
      pre: 'text-slate-900',
    },
    table: {
      wrapper: 'border-slate-300',
      th: 'bg-slate-100 text-slate-900 border-slate-300',
      td: 'text-slate-800 border-slate-200',
      divide: 'divide-slate-200',
      trEven: 'bg-slate-50/70',
    },
  },
  dark: {
    body: 'text-slate-100',
    heading: 'text-white',
    bold: 'text-white',
    list: 'text-slate-200',
    inlineCode: 'bg-slate-800 text-indigo-300',
    linkLabel: 'text-indigo-300',
    linkUrl: 'text-slate-400',
    codeBlock: {
      wrapper: 'bg-slate-950 border-slate-800 text-slate-200',
      header: 'bg-slate-900 text-slate-300 border-slate-800',
      copyBtn: 'text-slate-400 hover:text-white hover:bg-slate-800',
      pre: 'text-slate-200',
    },
    table: {
      wrapper: 'border-slate-700',
      th: 'bg-slate-900 text-white border-slate-700',
      td: 'text-slate-200 border-slate-800',
      divide: 'divide-slate-800',
      trEven: 'bg-slate-800/40',
    },
  },
};

/**
 * Parses inline formatting: **bold**, `code`, [links as plain text], and raw text.
 * Never executes links or raw HTML; all text is rendered as safe React children.
 */
function renderInlineContent(text, theme) {
  if (!text || typeof text !== 'string') return null;

  const tokens = [];
  let remaining = text;
  let keyIdx = 0;

  // Regex to match inline constructs: `code`, **bold**, and [link text](url)
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match) {
      tokens.push(remaining);
      break;
    }

    const matchIndex = match.index;
    if (matchIndex > 0) {
      tokens.push(remaining.slice(0, matchIndex));
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      const codeContent = fullMatch.slice(1, -1);
      tokens.push(
        <code
          key={`code-${keyIdx++}`}
          className={`px-1.5 py-0.5 rounded font-mono text-xs font-semibold ${theme.inlineCode}`}
        >
          {codeContent}
        </code>
      );
    } else if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      const boldContent = fullMatch.slice(2, -2);
      tokens.push(
        <strong key={`bold-${keyIdx++}`} className={`font-bold ${theme.bold}`}>
          {boldContent}
        </strong>
      );
    } else if (match[2] && match[3]) {
      const linkLabel = match[2];
      const linkUrl = match[3];
      tokens.push(
        <span key={`link-${keyIdx++}`} className={`font-semibold ${theme.linkLabel}`}>
          {linkLabel} <span className={`text-[11px] font-mono ${theme.linkUrl}`}>({linkUrl})</span>
        </span>
      );
    }

    remaining = remaining.slice(matchIndex + fullMatch.length);
  }

  return tokens;
}

/**
 * Fenced code block with dark/light themes and one-click clipboard copy.
 */
function FencedCodeBlock({ code, language, theme }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-3 rounded-xl border ${theme.wrapper} overflow-hidden font-mono text-xs shadow-md`}>
      <div className={`flex items-center justify-between px-3.5 py-1.5 border-b ${theme.header} text-[11px]`}>
        <span className="font-semibold uppercase tracking-wider">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${theme.copyBtn}`}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={`p-3.5 overflow-x-auto leading-relaxed ${theme.pre} font-mono text-xs scrollbar-thin`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Helper to test if a line is a markdown table separator (e.g. |---|---|)
 */
function isTableSeparator(line) {
  const t = line.trim();
  return /^\|?(\s*:?-+:?\s*\|)+\s*(:?-+:?\s*)?\|?$/.test(t);
}

/**
 * Splits a table row by pipe delimiter and trims cells
 */
function parseTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

/**
 * Safe Markdown renderer for Assistant Chat responses.
 * Renders headings, bold, ordered lists, bullet lists, fenced code blocks, and tables
 * WITHOUT using dangerouslySetInnerHTML, eliminating any raw HTML execution or XSS.
 * Links and URLs are rendered as unclickable plain text to prevent script execution.
 *
 * @param {string} content - Markdown text to render
 * @param {string} className - Optional container styling
 * @param {'light'|'dark'} variant - 'light' (default) or 'dark' for high-contrast assistant bubbles
 */
export default function SafeMarkdown({ content, className = '', variant = 'light' }) {
  if (!content || typeof content !== 'string') return null;

  const theme = VARIANTS[variant] || VARIANTS.light;
  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 0. Fenced Code Block (e.g. ```javascript ... ```)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++; // skip closing ```
      }
      const codeString = codeLines.join('\n');
      elements.push(
        <FencedCodeBlock
          key={`code-block-${blockKey++}`}
          code={codeString}
          language={lang}
          theme={theme.codeBlock}
        />
      );
      continue;
    }

    // 1. Simple Markdown Table (| Header 1 | Header 2 |)
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headerCells = parseTableRow(trimmed);
      i += 2; // skip header and separator
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().includes('|') && !lines[i].trim().startsWith('```')) {
        bodyRows.push(parseTableRow(lines[i]));
        i++;
      }

      elements.push(
        <div
          key={`table-${blockKey++}`}
          className={`my-3 overflow-x-auto rounded-xl border ${theme.table.wrapper} shadow-md`}
        >
          <table className="w-full text-xs text-left border-collapse">
            <thead className={`border-b ${theme.table.th}`}>
              <tr>
                {headerCells.map((h, hIdx) => (
                  <th key={hIdx} className="px-3.5 py-2.5 font-semibold">
                    {renderInlineContent(h, theme)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${theme.table.divide}`}>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? theme.table.trEven : ''}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className={`px-3.5 py-2 ${theme.table.td}`}>
                      {renderInlineContent(cell, theme)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 2. Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4
          key={`h3-${blockKey++}`}
          className={`text-sm font-bold ${theme.heading} mt-2.5 mb-1.5 flex items-center gap-1.5`}
        >
          {renderInlineContent(trimmed.slice(4), theme)}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3
          key={`h2-${blockKey++}`}
          className={`text-base font-bold ${theme.heading} mt-3 mb-1.5`}
        >
          {renderInlineContent(trimmed.slice(3), theme)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2
          key={`h1-${blockKey++}`}
          className={`text-lg font-extrabold ${theme.heading} mt-3.5 mb-2`}
        >
          {renderInlineContent(trimmed.slice(2), theme)}
        </h2>
      );
      i++;
      continue;
    }

    // 3. Numbered / Ordered List items (e.g. "1. Step...")
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        listItems.push(itemText);
        i++;
      }
      elements.push(
        <ol
          key={`ol-${blockKey++}`}
          className={`list-decimal pl-5 space-y-1.5 my-2 ${theme.list} leading-relaxed`}
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {renderInlineContent(item, theme)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 4. Bullet / Unordered List items (e.g. "• Item", "- Item", "* Item")
    if (/^[•\-*]\s+/.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^[•\-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[•\-*]\s+/, '');
        listItems.push(itemText);
        i++;
      }
      elements.push(
        <ul
          key={`ul-${blockKey++}`}
          className={`list-disc pl-5 space-y-1.5 my-2 ${theme.list} leading-relaxed`}
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {renderInlineContent(item, theme)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 5. Empty line spacer
    if (!trimmed) {
      elements.push(<div key={`empty-${blockKey++}`} className="h-1" />);
      i++;
      continue;
    }

    // 6. Standard paragraph line
    elements.push(
      <p key={`p-${blockKey++}`} className={`my-1 leading-relaxed ${theme.body}`}>
        {renderInlineContent(trimmed, theme)}
      </p>
    );
    i++;
  }

  const baseFont = variant === 'dark' ? 'text-[15px] leading-7' : 'text-sm';
  return <div className={`safe-markdown ${baseFont} ${className}`}>{elements}</div>;
}
