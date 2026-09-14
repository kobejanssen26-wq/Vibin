/**
 * The VIBIN icon set — one consistent stroke style (1.75, round caps/joins),
 * 24×24 grid, `currentColor`. Used for app chrome and controls. Category
 * identity intentionally stays emoji (see @shared/constants).
 */
type P = { className?: string; size?: number };

function Svg({
  size = 22,
  className,
  children,
  fill = "none",
}: P & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Svg>
);
export const IconHelp = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7" />
    <path d="M12 17.5v.1" />
  </Svg>
);
export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 13l4 4 10-11" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 5 10l4-4" />
    <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
  </Svg>
);
export const IconHeart = (p: P) => (
  <Svg {...p} fill="currentColor">
    <path d="M12 21s-7.5-4.7-9.7-9C.9 8.6 2.5 5 6 5c2.1 0 3.6 1.2 4.5 2.6L12 9.8l1.5-2.2C14.4 6.2 15.9 5 18 5c3.5 0 5.1 3.6 3.7 7-2.2 4.3-9.7 9-9.7 9Z" />
  </Svg>
);
export const IconStar = (p: P) => (
  <Svg {...p} fill="currentColor">
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.9 6.8 19.6l1-5.9L3.5 9.5l5.9-.9L12 3Z" />
  </Svg>
);
export const IconMapPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </Svg>
);
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M5 18l-1 3 3.5-1.2A9 9 0 1 0 5 18Z" />
  </Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 12h10M17 9l3 3-3 3M10 4v16" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
export const IconTag = (p: P) => (
  <Svg {...p}>
    <path d="M4 4h7l9 9-7 7-9-9V4Z" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6M15.5 19a5.5 5.5 0 0 1 5-5.4" />
  </Svg>
);
