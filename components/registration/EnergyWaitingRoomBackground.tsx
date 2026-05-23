"use client";

import { useEffect, useRef } from "react";

const energyLines = [
  "M248,398 Q420,433 548,398",
  "M548,398 Q658,427 750,398",
  "M750,398 Q858,427 956,398",
  "M956,398 Q1054,428 1148,402",
];

export function EnergyWaitingRoomBackground() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const particles: Array<{
      circle: SVGCircleElement;
      path: SVGPathElement;
      progress: number;
      speed: number;
    }> = [];
    const pathEls: SVGPathElement[] = [];

    energyLines.forEach((d) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "none");
      svg.appendChild(path);
      pathEls.push(path);

      for (let index = 0; index < 4; index += 1) {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("r", index === 0 ? "4.5" : "2.6");
        circle.setAttribute("fill", "white");
        circle.setAttribute("filter", "url(#energy-bg-glow)");
        svg.appendChild(circle);
        particles.push({
          circle,
          path,
          progress: index / 4,
          speed: 0.003 + Math.random() * 0.0024,
        });
      }
    });

    let frame = 0;
    const tick = () => {
      particles.forEach((particle) => {
        particle.progress = (particle.progress + particle.speed) % 1;
        const len = particle.path.getTotalLength();
        const pt = particle.path.getPointAtLength(particle.progress * len);
        const alpha = Math.sin(particle.progress * Math.PI);
        particle.circle.setAttribute("cx", String(pt.x));
        particle.circle.setAttribute("cy", String(pt.y));
        particle.circle.setAttribute("opacity", (alpha * 0.55 + 0.08).toFixed(2));
      });
      frame = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(frame);
      particles.forEach((particle) => particle.circle.remove());
      pathEls.forEach((path) => path.remove());
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      <style>{`
        @keyframes energy-bg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes energy-bg-steam {
          0% { transform: translateY(0) scaleX(1); opacity: .26; }
          100% { transform: translateY(-80px) scaleX(2); opacity: 0; }
        }
        @keyframes energy-bg-blink { 0%, 56%, 100% { opacity: .52; } 57%, 72% { opacity: .12; } }
        @keyframes energy-bg-shimmer { 0%, 100% { opacity: .07; } 50% { opacity: .35; } }
        @keyframes energy-bg-dash { from { stroke-dashoffset: 220; } to { stroke-dashoffset: 0; } }
        @keyframes energy-bg-scroll { from { transform: translateX(1020px); } to { transform: translateX(-1500px); } }
        .energy-bg-blade-a { animation: energy-bg-spin 6s linear infinite; transform-origin: 535px 302px; }
        .energy-bg-blade-b { animation: energy-bg-spin 8s linear infinite; transform-origin: 642px 314px; }
        .energy-bg-steam-a { animation: energy-bg-steam 4s ease-out infinite; transform-origin: 112px 206px; }
        .energy-bg-steam-b { animation: energy-bg-steam 4.4s ease-out 1.3s infinite; transform-origin: 204px 224px; }
        .energy-bg-window { animation: energy-bg-blink 5s ease-in-out infinite; }
        .energy-bg-panel { animation: energy-bg-shimmer 3.8s ease-in-out infinite; }
        .energy-bg-cable { animation: energy-bg-dash 3.2s linear infinite; }
        .energy-bg-ticker { animation: energy-bg-scroll 24s linear infinite; }
      `}</style>
      <svg
        ref={svgRef}
        viewBox="0 0 1400 750"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-[0.22]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="energy-bg-stars" patternUnits="userSpaceOnUse" width="120" height="120">
            <circle cx="12" cy="18" r=".8" fill="white" />
            <circle cx="48" cy="8" r="1.2" fill="white" />
            <circle cx="78" cy="32" r=".7" fill="white" />
            <circle cx="22" cy="74" r=".9" fill="white" />
            <circle cx="92" cy="55" r="1.3" fill="white" />
            <circle cx="58" cy="92" r=".7" fill="white" />
            <circle cx="95" cy="12" r=".5" fill="white" />
            <circle cx="4" cy="52" r=".8" fill="white" />
          </pattern>
          <pattern id="energy-bg-dots" patternUnits="userSpaceOnUse" width="12" height="12">
            <circle cx="6" cy="6" r="1.1" fill="white" />
          </pattern>
          <filter id="energy-bg-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="energy-bg-ticker-clip">
            <rect x="170" y="716" width="1060" height="24" />
          </clipPath>
        </defs>

        <rect width="1400" height="750" fill="#000" />
        <rect width="1400" height="458" fill="url(#energy-bg-stars)" opacity=".8" />
        <ellipse cx="700" cy="478" rx="760" ry="92" fill="white" opacity=".04" />
        <rect y="478" width="1400" height="272" fill="#050505" />
        <rect y="478" width="1400" height="272" fill="url(#energy-bg-dots)" opacity=".12" />
        <rect y="476" width="1400" height="4" fill="white" opacity=".28" />

        {[500, 535, 570, 610, 660, 720].map((y, index) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="1400"
            y2={y}
            stroke="white"
            strokeWidth=".5"
            opacity={0.18 - index * 0.02}
          />
        ))}
        <line x1="200" y1="478" x2="0" y2="750" stroke="white" strokeWidth=".5" opacity=".1" />
        <line x1="700" y1="478" x2="700" y2="750" stroke="white" strokeWidth=".5" opacity=".1" />
        <line x1="1200" y1="478" x2="1400" y2="750" stroke="white" strokeWidth=".5" opacity=".1" />

        <g opacity=".7">
          <path d="M62,210 Q50,328 82,385 L148,385 Q175,328 168,210 Q115,238 62,210Z" fill="#0d0d0d" stroke="white" strokeWidth="2" />
          <ellipse cx="115" cy="210" rx="53" ry="13" fill="#0d0d0d" stroke="white" strokeWidth="2" />
          <g className="energy-bg-steam-a">
            <ellipse cx="115" cy="196" rx="24" ry="13" fill="white" />
            <ellipse cx="99" cy="188" rx="17" ry="10" fill="white" opacity=".65" />
          </g>
          <path d="M158,228 Q146,340 175,392 L235,392 Q258,340 252,228 Q205,255 158,228Z" fill="#0d0d0d" stroke="white" strokeWidth="2" />
          <ellipse cx="205" cy="228" rx="47" ry="11" fill="#0d0d0d" stroke="white" strokeWidth="2" />
          <g className="energy-bg-steam-b">
            <ellipse cx="205" cy="216" rx="24" ry="13" fill="white" />
            <ellipse cx="222" cy="206" rx="17" ry="9" fill="white" opacity=".55" />
          </g>
          <rect x="50" y="385" width="225" height="95" fill="#090909" stroke="white" strokeWidth="2" />
          <text x="162" y="443" fill="white" fontFamily="monospace" fontSize="9" textAnchor="middle" letterSpacing="3">ENERGY FACILITY</text>
        </g>

        {[292, 362, 424, 1048, 1152, 1262].map((x, index) => {
          const width = [58, 52, 48, 85, 94, 72][index];
          const y = [322, 262, 342, 352, 302, 402][index];
          const height = 480 - y;
          return (
            <g key={x}>
              <rect x={x} y={y} width={width} height={height} fill="#090909" stroke="white" strokeWidth="1.6" />
              {[0, 1, 2, 3, 4].map((row) =>
                [0, 1, 2].map((col) => (
                  <rect
                    key={`${row}-${col}`}
                    x={x + 8 + col * Math.max(15, width / 3)}
                    y={y + 12 + row * 22}
                    width="12"
                    height="9"
                    rx="1"
                    fill="white"
                    className="energy-bg-window"
                    style={{ animationDelay: `${(row + col + index) * 0.35}s` }}
                  />
                )),
              )}
            </g>
          );
        })}

        <polygon points="526,480 535,302 544,480" fill="#0c0c0c" stroke="white" strokeWidth="2" />
        <g className="energy-bg-blade-a">
          <path d="M535,302 Q530,258 533,220" fill="none" stroke="white" strokeWidth="4" />
          <path d="M535,302 Q566,330 584,363" fill="none" stroke="white" strokeWidth="4" />
          <path d="M535,302 Q505,330 487,363" fill="none" stroke="white" strokeWidth="4" />
          <circle cx="535" cy="302" r="8" fill="#0c0c0c" stroke="white" strokeWidth="2" />
        </g>
        <polygon points="634,480 642,314 650,480" fill="#0c0c0c" stroke="white" strokeWidth="2" />
        <g className="energy-bg-blade-b">
          <path d="M642,314 Q637,272 640,232" fill="none" stroke="white" strokeWidth="3.5" />
          <path d="M642,314 Q670,340 688,370" fill="none" stroke="white" strokeWidth="3.5" />
          <path d="M642,314 Q614,340 596,370" fill="none" stroke="white" strokeWidth="3.5" />
          <circle cx="642" cy="314" r="8" fill="#0c0c0c" stroke="white" strokeWidth="2" />
        </g>

        {[760, 832, 904, 976].map((x, index) => (
          <g key={x} transform={`translate(${x},425)`}>
            <rect x="0" y="-32" width="58" height="36" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="2" transform="skewX(-14)" />
            <line x1="14" y1="-32" x2="14" y2="4" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55" />
            <line x1="29" y1="-32" x2="29" y2="4" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55" />
            <line x1="0" y1="-15" x2="58" y2="-15" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55" />
            <rect x="4" y="-29" width="18" height="12" rx="1" fill="white" className="energy-bg-panel" style={{ animationDelay: `${index * 0.45}s` }} transform="skewX(-14)" />
          </g>
        ))}

        {[278, 562, 762, 962].map((x) => (
          <g key={x}>
            <line x1={x} y1="392" x2={x} y2="480" stroke="white" strokeWidth="3" />
            <line x1={x - 22} y1="397" x2={x + 22} y2="397" stroke="white" strokeWidth="2.2" />
            <line x1={x - 22} y1="407" x2={x + 22} y2="407" stroke="white" strokeWidth="2.2" />
          </g>
        ))}
        {energyLines.map((d, index) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeDasharray="9,15"
            opacity=".45"
            className="energy-bg-cable"
            style={{ animationDuration: `${2.2 + index * 0.35}s` }}
          />
        ))}

        <rect x="140" y="422" width="210" height="160" fill="#080808" stroke="white" strokeWidth="2.5" />
        <rect x="140" y="418" width="210" height="8" fill="white" opacity=".8" />
        <text x="223" y="439" fill="white" fontFamily="monospace" fontSize="8.5" textAnchor="middle" letterSpacing="2">R&D ENERGY LAB</text>
        <rect x="154" y="456" width="72" height="78" rx="1" fill="#050505" stroke="white" strokeWidth="2" />
        <rect x="236" y="462" width="86" height="52" rx="1" fill="#050505" stroke="white" strokeWidth="1.2" />
        <path d="M162,559 L167,559 L170,551 L174,567 L178,551 L182,567 L185,559 L190,559 L193,553 L197,565 L201,559 L205,559" fill="none" stroke="white" strokeWidth="1.8" />

        <rect x="940" y="432" width="65" height="52" rx="2" fill="#0a0a0a" stroke="white" strokeWidth="2" />
        <path d="M968,428 L963,438 L969,438 L964,452" fill="none" stroke="white" strokeWidth="2.5" filter="url(#energy-bg-glow)" />
        <text x="972" y="475" fill="white" fontFamily="monospace" fontSize="7" textAnchor="middle" letterSpacing="1">XFMR</text>

        <rect x="488" y="14" width="424" height="54" rx="3" fill="#030303" stroke="white" strokeWidth="2" />
        <rect x="488" y="14" width="424" height="4" fill="white" opacity=".8" />
        <text x="700" y="40" fill="white" fontFamily="monospace" fontSize="20" textAnchor="middle" fontWeight="900" letterSpacing="7">FOUNDATION-1</text>
        <text x="700" y="57" fill="white" fontFamily="monospace" fontSize="9" textAnchor="middle" letterSpacing="5" opacity=".7">ENERGY AS A SERVICE</text>

        <rect x="170" y="716" width="1060" height="24" rx="2" fill="#040404" stroke="white" strokeWidth="1.2" />
        <text className="energy-bg-ticker" y="733" clipPath="url(#energy-bg-ticker-clip)" fill="white" fontFamily="monospace" fontSize="10">
          FOUNDATION-1 ZERO CAPEX SOLAR - GENEROCITY PPA ACTIVE - LUMEN WHEELING ONLINE - SOUTH AFRICA - FOUNDATION-1 ZERO CAPEX SOLAR
        </text>
      </svg>
      <div className="absolute inset-0 bg-black/76" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,transparent_0%,rgba(0,0,0,0.42)_58%,rgba(0,0,0,0.9)_100%)]" />
    </div>
  );
}
