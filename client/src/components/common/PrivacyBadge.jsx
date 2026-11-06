import React from 'react';
import { Info } from 'lucide-react';

/**
 * Reusable Privacy-Protected Metric Badge with Tooltip
 */
export const PrivacyBadge = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 cursor-help ${className}`}
      title="Groups with fewer than 5 students are hidden to protect individual privacy."
    >
      <span>&lt; 5 (Privacy)</span>
      <Info className="w-3 h-3 text-amber-600 inline" />
    </span>
  );
};

/**
 * Reusable One-line Privacy Footnote
 */
export const PrivacyFootnote = ({ className = '' }) => {
  return (
    <p className={`text-[11px] text-slate-500 italic flex items-center gap-1.5 mt-2 ${className}`}>
      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span>Groups with fewer than 5 students are hidden to protect individual privacy.</span>
    </p>
  );
};

export default PrivacyBadge;

