import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import SafeMarkdown from './SafeMarkdown';

describe('SafeMarkdown Component Tests', () => {
  const sampleMarkdown = `
# Main Placement Title
## Section Heading
### Sub Section
Here is a paragraph with **bold text**, an \`inline_code_variable\`, and a [Platform Guide](https://portal.com/guide).

1. First step in placement process
2. Second step with **bold note**

- Key technical skill: \`Python\`
- Another requirement

\`\`\`javascript
const greeting = "Hello Campus Placement";
console.log(greeting);
\`\`\`

| Branch | Placed | Percentage |
| --- | --- | --- |
| CSE | 45 | 92% |
| ECE | 38 | 85% |
`.trim();

  it('renders default (light) variant with light-theme classes', () => {
    const html = renderToString(<SafeMarkdown content={sampleMarkdown} />);

    // Default variant must output light-theme text colors
    expect(html).toContain('text-slate-800');
    expect(html).toContain('text-slate-900');
    expect(html).toContain('bg-slate-200/70');
    expect(html).toContain('text-indigo-700');
  });

  it('renders dark variant with high-contrast text and strictly NO text-slate-800 or text-slate-900', () => {
    const html = renderToString(<SafeMarkdown content={sampleMarkdown} variant="dark" />);

    // Dark variant must output high-contrast classes
    expect(html).toContain('text-slate-100'); // body paragraph text
    expect(html).toContain('text-white');     // headings and bold
    expect(html).toContain('text-slate-200');   // lists and table data
    expect(html).toContain('bg-slate-800');    // inline code container
    expect(html).toContain('text-indigo-300'); // inline code and link text
    expect(html).toContain('text-slate-400');   // link url

    // Fenced code block in dark mode
    expect(html).toContain('bg-slate-950');
    expect(html).toContain('border-slate-800');
    expect(html).toContain('Copy');

    // Simple markdown table in dark mode
    expect(html).toContain('<table');
    expect(html).toContain('CSE');
    expect(html).toContain('92%');

    // CRITICAL: Ensure NO text-slate-800 or text-slate-900 classes exist in dark variant
    expect(html).not.toContain('text-slate-800');
    expect(html).not.toContain('text-slate-900');
  });

  it('explicit variant="light" matches default variant behavior', () => {
    const defaultHtml = renderToString(<SafeMarkdown content="A simple **bold** test." />);
    const lightHtml = renderToString(<SafeMarkdown content="A simple **bold** test." variant="light" />);

    expect(defaultHtml).toBe(lightHtml);
    expect(lightHtml).toContain('text-slate-900');
    expect(lightHtml).toContain('text-slate-800');
  });
});
