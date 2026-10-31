/** Simplified ecosystem marks, sized by className. Chain marks for the landing page live in components/site/ChainMarks.tsx. */

type IconProps = { className?: string };

export function FarcasterIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#855DCD" />
      <path d="M7 6.5h10v11h-1.8v-4.6a3.2 3.2 0 0 0-6.4 0v4.6H7v-11Z" fill="#fff" />
      <path d="M5.6 7.8h12.8" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

export function LayerZeroIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a6 6 0 0 0-6 6v6a6 6 0 0 0 6 6" />
      <path d="M12 21a6 6 0 0 0 6-6V9a6 6 0 0 0-6-6" opacity="0.45" />
      <path d="M12 7v10" />
    </svg>
  );
}

export function IntentStandardIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 2.8 20 6v6c0 4.6-3.4 8-8 9.2C7.4 20 4 16.6 4 12V6l8-3.2Z" />
      <path d="m8.6 12.2 2.4 2.4 4.6-4.8" strokeLinecap="round" />
    </svg>
  );
}

export function HyperliquidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M22 12c0 5-3.2 7.4-5.6 6-2-1.2-2.4-3.8-4.4-4-2-.2-2.6 2.6-5 3.4C4.6 18.2 2 16.2 2 12s2.6-6.2 5-5.4c2.4.8 3 3.6 5 3.4 2-.2 2.4-2.8 4.4-4C18.8 4.6 22 7 22 12Z" fill="#97FCE4" />
    </svg>
  );
}

export function XIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
    </svg>
  );
}
