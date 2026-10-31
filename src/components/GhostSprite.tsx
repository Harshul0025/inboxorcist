import { hashString } from '../../shared/text';

const HUES = [275, 300, 190, 140, 20, 340] as const;

/**
 * Decorative ghost illustration whose colour is derived from a seed
 * (usually the sender), so each boss looks different.
 */
export function GhostSprite({ seed, size = 160, glow = false }: { seed: string; size?: number; glow?: boolean }) {
  const hue = HUES[hashString(seed) % HUES.length] ?? 275;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={glow ? 'drop-shadow-[0_0_18px_rgba(250,204,21,0.8)]' : 'drop-shadow-[0_0_14px_rgba(168,85,247,0.6)]'}
    >
      <path
        d="M60 8C34 8 18 28 18 54v50l12-10 10 10 10-10 10 10 10-10 10 10 12-10V54C102 28 86 8 60 8z"
        fill={`hsl(${hue} 70% 82%)`}
        stroke={`hsl(${hue} 60% 40%)`}
        strokeWidth="3"
      />
      <ellipse cx="45" cy="52" rx="8" ry="11" fill="#1e1b2e" />
      <ellipse cx="75" cy="52" rx="8" ry="11" fill="#1e1b2e" />
      <path d="M48 76c8 7 16 7 24 0" stroke="#1e1b2e" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
