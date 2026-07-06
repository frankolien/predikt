/**
 * Predikt brand mark — a monogram "P" whose counter cradles the ball, with a
 * single live-green pip as "the call". Monoline + two-tone so it holds from a
 * hero down to a favicon. The mono strokes take `currentColor` (so it follows
 * the text colour it sits in); the pip is always the live-green accent.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Predikt">
      <rect x="35" y="29" width="15.5" height="66" rx="7.75" fill="currentColor" />
      <circle cx="59" cy="46" r="21.5" fill="none" stroke="currentColor" strokeWidth="13.5" />
      <circle cx="60" cy="46" r="8.6" fill="var(--color-live, #2FE083)" />
    </svg>
  );
}

/** Mark + wordmark lockup for the nav. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <Mark className="h-[26px] w-[26px] text-chalk" />
      <span className="font-display text-[19px] font-semibold tracking-[-0.04em] text-chalk">
        Predikt<span className="text-live">.</span>
      </span>
    </span>
  );
}
