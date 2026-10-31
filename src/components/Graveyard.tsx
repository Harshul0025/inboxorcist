/** Decorative graveyard silhouette for the boss arena. */
export function Graveyard() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full"
      viewBox="0 0 800 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 95 Q200 70 400 92 T800 88 V120 H0Z" fill="#0b0616" />
      <g fill="#140b26" stroke="#3b2a5c" strokeWidth="2">
        <path d="M80 98v-40a22 22 0 0 1 44 0v40z" />
        <path d="M640 96v-34a18 18 0 0 1 36 0v34z" />
        <path d="M520 100v-24h-10v-10h10v-12h10v12h10v10h-10v24z" />
        <path d="M230 100v-28a15 15 0 0 1 30 0v28z" />
      </g>
      <g stroke="#3b2a5c" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M720 104c0-30 10-50 30-70M750 34c-10 0-18 6-22 14M742 52c10 0 18 4 22 10" />
      </g>
    </svg>
  );
}
