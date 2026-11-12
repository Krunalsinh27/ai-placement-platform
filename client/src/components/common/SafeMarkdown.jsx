import React from 'react';

/**
 * Parses inline formatting: **bold**, `code`, [links as plain text], and raw text.
 * Never executes links or raw HTML; all text is rendered as safe React children.
 */
function renderInlineContent(text) {
  if (!text || typeof text !== 'string') return null;

  // Tokenize by code (`...`), bold (**...**), and markdown links ([text](url))
  const tokens = [];
  let remaining = text;
  let keyIdx = 0;

  // Regex to match inline constructs
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
          className="px-1 py-0.5 rounded bg-slate-200/70 font-mono text-xs text-indigo-700 font-semibold"
        >
          {codeContent}
        </code>
      );
    } else if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      const boldContent = fullMatch.slice(2, -2);
      tokens.push(
        <strong key={`bold-${keyIdx++}`} className="font-bold text-slate-900">
          {boldContent}
        </strong>
      );
    } else if (match[2] && match[3]) {
      // Markdown link [label](url): Render as sanitized, non-executable plain text
      const linkLabel = match[2];
      const linkUrl = match[3];
      tokens.push(
        <span key={`link-${keyIdx++}`} className="font-semibold text-slate-800">
          {linkLabel} <span className="text-[11px] text-slate-400 font-mono">({linkUrl})</span>
        </span>
      );
    }

    remaining = remaining.slice(matchIndex + fullMatch.length);
  }

  return tokens;
}

/**
 * Safe Markdown renderer for Assistant Chat responses.
 * Renders headings, bold, ordered lists, bullet lists, and code blocks
 * WITHOUT using dangerouslySetInnerHTML, eliminating any raw HTML execution or XSS.
 * Links and URLs are rendered as unclickable plain text to prevent script/link execution.
 */
export default function SafeMarkdown({ content, className = '' }) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4
          key={`h3-${blockKey++}`}
          className="text-sm font-bold text-slate-900 mt-2.5 mb-1.5 flex items-center gap-1.5"
        >
          {renderInlineContent(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3
          key={`h2-${blockKey++}`}
          className="text-base font-bold text-slate-900 mt-3 mb-1.5"
        >
          {renderInlineContent(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2
          key={`h1-${blockKey++}`}
          className="text-lg font-extrabold text-slate-900 mt-3.5 mb-2"
        >
          {renderInlineContent(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // 2. Numbered / Ordered List items (e.g. "1. Step...")
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
          className="list-decimal pl-5 space-y-1.5 my-2 text-slate-800 leading-relaxed"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {renderInlineContent(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 3. Bullet / Unordered List items (e.g. "• Item", "- Item", "* Item")
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
          className="list-disc pl-5 space-y-1.5 my-2 text-slate-800 leading-relaxed"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {renderInlineContent(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 4. Empty line spacer
    if (!trimmed) {
      elements.push(<div key={`empty-${blockKey++}`} className="h-1" />);
      i++;
      continue;
    }

    // 5. Standard paragraph line
    elements.push(
      <p key={`p-${blockKey++}`} className="my-1 leading-relaxed text-slate-800">
        {renderInlineContent(trimmed)}
      </p>
    );
    i++;
  }

  return <div className={`safe-markdown text-sm ${className}`}>{elements}</div>;
}

