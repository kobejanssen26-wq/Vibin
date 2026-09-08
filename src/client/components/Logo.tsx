/**
 * VIBIN mark — two converging blades meeting at a point: VIBIN Blue on the
 * left, VIBIN Lime on the right, a single dot where they agree. Flat, static,
 * legible down to favicon size. No ambient motion.
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
      <path d="M7 9h9.4l9.1 21.7L20.9 42 7 9Z" fill="#3155ff" />
      <path d="M41 9h-9.4L20.9 35.4 25.6 42 41 9Z" fill="#b8f23d" />
      <circle cx="23.2" cy="38.4" r="3.3" fill={onDark ? "#f7f8fc" : "#101426"} />
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
      <LogoMark className="h-6 w-6" onDark={onDark} />
      <span className="text-lg font-extrabold tracking-[-0.03em]">VIBIN</span>
    </span>
  );
}
