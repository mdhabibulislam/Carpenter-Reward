import type { CSSProperties } from 'react';

/**
 * Login motion background: drifting corrugated-sheet waves (from the logo's roof line).
 * Lightweight by design — a ~200-byte inline SVG tile repeated with CSS, animated with transform only
 * (GPU-composited, no JS, no image/video download). Stops under prefers-reduced-motion (index.css).
 */
const PERIOD = 96; // px — one wave; each row slides by a whole number of periods so the loop is seamless

const tile = (stroke: string, width: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${PERIOD}' height='24' viewBox='0 0 ${PERIOD} 24'><path d='M0 12 Q ${PERIOD / 4} 0 ${PERIOD / 2} 12 T ${PERIOD} 12' fill='none' stroke='${stroke}' stroke-width='${width}' stroke-linecap='round'/></svg>`,
  )}")`;

interface Row { top: string; opacity: number; seconds: number; reverse?: boolean; scale?: number; width?: number }

const ROWS: Row[] = [
  { top: '8%', opacity: 0.16, seconds: 26, scale: 1.4 },
  { top: '20%', opacity: 0.1, seconds: 34, reverse: true },
  { top: '33%', opacity: 0.22, seconds: 22, scale: 1.8, width: 3 },
  { top: '47%', opacity: 0.12, seconds: 40, reverse: true, scale: 1.2 },
  { top: '60%', opacity: 0.18, seconds: 28, scale: 1.6 },
  { top: '74%', opacity: 0.1, seconds: 36, reverse: true },
  { top: '87%', opacity: 0.2, seconds: 24, scale: 2, width: 3 },
];

export function LoginBackdrop({ color = '#FFFFFF', rows = ROWS }: { color?: string; rows?: Row[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {rows.map((r, i) => {
        const shift = PERIOD * (r.scale ?? 1) * 2;
        const style = {
          top: r.top, opacity: r.opacity, height: 24 * (r.scale ?? 1),
          backgroundImage: tile(color, r.width ?? 2), backgroundRepeat: 'repeat-x', backgroundSize: `${PERIOD * (r.scale ?? 1)}px 100%`,
          width: `calc(100% + ${shift}px)`, left: r.reverse ? 0 : -shift,
          animation: `acs-wave-${r.reverse ? 'r' : 'f'} ${r.seconds}s linear infinite`,
          ['--shift' as string]: `${shift}px`,
        } as CSSProperties;
        return <div key={i} className="absolute will-change-transform" style={style} />;
      })}
    </div>
  );
}
