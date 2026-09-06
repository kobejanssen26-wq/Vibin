/**
 * Mingo mark: two overlapping speech/"swipe" petals forming an M-ish heart —
 * a group agreeing, not a dating flame. Works as favicon, app icon and header.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mingo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2d55" />
          <stop offset="0.5" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#8b3dff" />
        </linearGradient>
      </defs>
      <path
        fill="url(#mingo-g)"
        d="M12 6c6.2 0 10 3.9 12 9 2-5.1 5.8-9 12-9 6.6 0 12 5.2 12 12.5C48 32 36.5 40 24 46 11.5 40 0 32 0 18.5 0 11.2 5.4 6 12 6Z"
      />
      <circle cx="17.5" cy="20" r="3.1" fill="#fff" />
      <circle cx="30.5" cy="20" r="3.1" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold ${className}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-xl tracking-tight">Mingo</span>
    </span>
  );
}
