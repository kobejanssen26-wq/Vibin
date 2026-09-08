/**
 * VIBIN mark: an abstract "V" built from two converging blades — the left blade
 * VIBIN Blue, the right blade VIBIN Lime — meeting at a point, like two paths
 * agreeing on one direction. Stays legible at favicon size.
 *
 * `animated` adds a slow, low-amplitude "breathe" (the blades lean toward each
 * other and the convergence dot pulses) for hero / loading / match moments.
 * It's decorative and CSS-driven, so prefers-reduced-motion neutralises it.
 */
export function LogoMark({
  className = "h-8 w-8",
  onDark = false,
  animated = false,
}: {
  className?: string;
  onDark?: boolean;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={`${className} ${animated ? "animate-logo-breathe" : ""}`}
      aria-hidden="true"
      style={animated ? { transformOrigin: "23px 40px" } : undefined}
    >
      {/* left blade — VIBIN Blue */}
      <path d="M7 9h9.4l9.1 21.7L20.9 42 7 9Z" fill="#3155ff" />
      {/* right blade — VIBIN Lime */}
      <path d="M41 9h-9.4L20.9 35.4 25.6 42 41 9Z" fill="#b8f23d" />
      {/* convergence dot */}
      <circle
        cx="23.2"
        cy="38.4"
        r="3.3"
        fill={onDark ? "#f7f8fc" : "#101426"}
        className={animated ? "animate-dot-blink" : ""}
        style={animated ? { transformOrigin: "23.2px 38.4px" } : undefined}
      />
    </svg>
  );
}

export function Wordmark({
  className = "",
  onDark = false,
  animated = false,
}: {
  className?: string;
  onDark?: boolean;
  animated?: boolean;
}) {
  return (
    <span
      className={`group inline-flex items-center gap-2 font-extrabold ${
        onDark ? "text-white" : "text-navy"
      } ${className}`}
    >
      <span className="transition-transform duration-300 ease-spring group-hover:-translate-y-0.5 group-hover:rotate-[-6deg]">
        <LogoMark className="h-7 w-7" onDark={onDark} animated={animated} />
      </span>
      <span className="text-xl font-extrabold tracking-[-0.02em]">VIBIN</span>
    </span>
  );
}
