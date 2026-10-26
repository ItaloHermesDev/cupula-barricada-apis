import type { ReactNode } from "react";

export type IconName =
  | "overview"
  | "analytics"
  | "monitor"
  | "activity"
  | "reports"
  | "settings"
  | "users"
  | "search"
  | "bell"
  | "menu"
  | "panel"
  | "logout"
  | "calendar"
  | "robot"
  | "direct"
  | "alert"
  | "check";

export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  const hex = "M32 8.5 52 20v24L32 55.5 12 44V20L32 8.5Z";

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d={hex} fill="#151B20" stroke="#2AA99A" strokeWidth="3" />
      <path d="M32 23 41.5 32 32 41 22.5 32Z" fill="#2AA99A" />
      <path d="M32 27.6 36.4 32 32 36.4 27.6 32Z" fill="#E7ECEF" />
    </svg>
  );
}

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths(name)}
    </svg>
  );
}

function paths(name: IconName): ReactNode {
  switch (name) {
    case "overview":
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </>
      );
    case "analytics":
      return <path d="M4 16.5 9 11l3.2 3.2L20 7" />;
    case "monitor":
      return (
        <>
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" />
          <path d="M7.2 7.2 8.7 8.7M15.3 15.3l1.5 1.5M16.8 7.2 15.3 8.7M8.7 15.3 7.2 16.8" />
        </>
      );
    case "activity":
      return <path d="M3.5 12h4l2.2-5.5 3.6 11 2.2-5.5h5" />;
    case "reports":
      return (
        <>
          <path d="M7 3.5h7l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14 3.8V8.5h4.4M8.5 12.5h7M8.5 16h5" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 3.8v2.1M12 18.1v2.1M3.8 12h2.1M18.1 12h2.1M6.2 6.2l1.5 1.5M16.3 16.3l1.5 1.5M17.8 6.2l-1.5 1.5M7.7 16.3l-1.5 1.5" />
        </>
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="2.6" />
          <path d="M4.2 18.2a4.8 4.8 0 0 1 9.6 0" />
          <circle cx="17" cy="9" r="2" />
          <path d="M16.2 13.2a3.8 3.8 0 0 1 3.6 2.6" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="5.5" />
          <path d="M15.5 15.5 20 20" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M6.2 16.5h11.6l-1.2-2.1V10a4.6 4.6 0 0 0-9.2 0v4.4L6.2 16.5Z" />
          <path d="M10 16.6a2 2 0 0 0 4 0" />
        </>
      );
    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case "panel":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M9 4.5v15" />
        </>
      );
    case "logout":
      return (
        <>
          <path d="M10 6.5H7.5A1.5 1.5 0 0 0 6 8v8a1.5 1.5 0 0 0 1.5 1.5H10" />
          <path d="M11 12h8M16.5 8.5 20 12l-3.5 3.5" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="4" y="5.5" width="16" height="14" rx="2" />
          <path d="M8 3.8v3.2M16 3.8v3.2M4 10h16" />
        </>
      );
    case "robot":
      return (
        <>
          <path d="M12 3.2v2" />
          <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
          <rect x="5.2" y="5.4" width="13.6" height="12.2" rx="3" />
          <circle cx="9.4" cy="10.4" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="14.6" cy="10.4" r="1.15" fill="currentColor" stroke="none" />
          <path d="M9.2 14.2h5.6" />
        </>
      );
    case "direct":
      return (
        <>
          <path d="M14 4.8h5.2V10" />
          <path d="M19.2 4.8 10.2 13.8" />
          <path d="M11 4.8H6.4A1.6 1.6 0 0 0 4.8 6.4v11.2A1.6 1.6 0 0 0 6.4 19.2h11.2a1.6 1.6 0 0 0 1.6-1.6V13" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M12 4.2 20.2 19H3.8L12 4.2Z" />
          <path d="M12 9.4v4.2M12 16.5h.01" />
        </>
      );
    case "check":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.2 12.2 10.8 14.8 15.8 9.4" />
        </>
      );
  }
}
