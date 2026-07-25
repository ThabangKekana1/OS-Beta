import { ANALEMMA_PATH, ANALEMMA_SUN, ANALEMMA_VIEWBOX } from "@/lib/analemma";

/**
 * The Foundation-1 mark: one continuous analemma line, one Sun, one subtle
 * corona. Static completed state; the Sun breathes via CSS. Colors follow
 * currentColor so the mark works on any canvas.
 */
export default function FoundationMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={ANALEMMA_VIEWBOX}
      fill="none"
      className={`brand-analemma h-6 w-20 shrink-0 overflow-visible ${className}`}
    >
      <path className="brand-analemma__trace" d={ANALEMMA_PATH} />
      <g transform={`translate(${ANALEMMA_SUN.x} ${ANALEMMA_SUN.y})`}>
        <circle className="brand-analemma__corona" r="20">
          <animate attributeName="r" values="20;20.4;20" dur="7s" repeatCount="indefinite" />
        </circle>
        <circle className="brand-analemma__core" r="7" />
      </g>
    </svg>
  );
}

/**
 * Orbital waiting dot for buttons: a miniature breathing sun.
 * The motion language forbids spinning circles.
 */
export function OrbitalBusyDot({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" role="status" aria-label="Working" className={className}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14">
        <animate attributeName="r" values="8.6;10;8.6" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.1;0.2;0.1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
    </svg>
  );
}
