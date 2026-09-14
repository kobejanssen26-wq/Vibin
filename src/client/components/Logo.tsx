/**
 * VIBIN mark: an abstract "V" built from two converging ribbons — the left
 * VIBIN Blue, the right VIBIN Lime — meeting at a point, like two paths
 * agreeing on one direction. Stays legible at favicon size.
 */
export function LogoMark({
  className = "h-8 w-8",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {/* left ribbon — VIBIN Blue */}
      <line x1="10" y1="8" x2="24" y2="40" stroke="#3155ff" strokeWidth="9" strokeLinecap="round" />
      {/* right ribbon — VIBIN Lime */}
      <line x1="38" y1="8" x2="24" y2="40" stroke="#b8f23d" strokeWidth="9" strokeLinecap="round" />
      {/* convergence dot */}
      <circle cx="24" cy="40" r="4.2" fill={onDark ? "#f7f8fc" : "#101426"} />
    </svg>
  );
}

export function Wordmark({
  className = "",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-extrabold ${
        onDark ? "text-white" : "text-navy"
      } ${className}`}
    >
      <LogoMark className="h-7 w-7" onDark={onDark} />
      <span className="text-xl font-extrabold tracking-[-0.02em]">VIBIN</span>
    </span>
  );
}
