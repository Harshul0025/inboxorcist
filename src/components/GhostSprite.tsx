import { useId } from 'react';
import { hashString } from '../../shared/text';

const HUES = [275, 300, 190, 140, 20, 340] as const;

/**
 * Decorative ghost illustration whose colour is derived from a seed
 * (usually the sender), so each boss looks different.
 */
export function GhostSprite({ seed, size = 160, glow = false }: { seed: string; size?: number; glow?: boolean }) {
  const hue = HUES[hashString(seed) % HUES.length] ?? 275;
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={
        glow ? 'drop-shadow-[0_0_22px_rgba(250,204,21,0.85)]' : 'drop-shadow-[0_0_26px_rgba(192,132,252,0.65)]'
      }
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor={`hsl(${hue} 85% 88%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 70% 70%)`} />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="114" rx="30" ry="4" fill="#000" opacity="0.35" />
      <path
        d="M60 8C34 8 18 28 18 54v50l12-10 10 10 10-10 10 10 10-10 10 10 12-10V54C102 28 86 8 60 8z"
        fill={`url(#body-${id})`}
        stroke={`hsl(${hue} 60% 40%)`}
        strokeWidth="2.5"
      />
      <ellipse cx="45" cy="52" rx="8" ry="11" fill="#1e1b2e" />
      <ellipse cx="75" cy="52" rx="8" ry="11" fill="#1e1b2e" />
      <circle cx="48" cy="48" r="2.6" fill="#fff" />
      <circle cx="78" cy="48" r="2.6" fill="#fff" />
      <ellipse cx="36" cy="66" rx="6" ry="3.5" fill="#fb7185" opacity="0.45" />
      <ellipse cx="84" cy="66" rx="6" ry="3.5" fill="#fb7185" opacity="0.45" />
      <path d="M50 72c6 6 14 6 20 0" stroke="#1e1b2e" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
