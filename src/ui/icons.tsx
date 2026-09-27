import type { SVGProps } from 'react';

/** Small stroke icons (24×24 grid) so the app has no icon-font dependency. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const icons = {
  library: () => (
    <Icon>
      <path d="M4 5h5v14H4zM10 5h4v14h-4zM15.5 5.5l3.8-1 3 14-3.8 1z" />
    </Icon>
  ),
  sidebar: () => (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Icon>
  ),
  undo: () => (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  ),
  redo: () => (
    <Icon>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Icon>
  ),
  download: () => (
    <Icon>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Icon>
  ),
  upload: () => (
    <Icon>
      <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />
    </Icon>
  ),
  pdf: () => (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  ),
  settings: () => (
    <Icon>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Icon>
  ),
  help: () => (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01" />
    </Icon>
  ),
  plus: () => (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  ),
  close: () => (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  ),
  trash: () => (
    <Icon>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  ),
  copy: () => (
    <Icon>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  ),
  note: () => (
    <Icon>
      <path d="M5 4h14v11l-5 5H5z" />
      <path d="M14 20v-5h5" />
    </Icon>
  ),
  edit: () => (
    <Icon>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </Icon>
  ),
};
