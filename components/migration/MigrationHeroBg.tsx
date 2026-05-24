'use client';
import { useEffect, useRef } from 'react';

export default function MigrationHeroBg() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';

    const linePaths = [
      'M270,398 Q420,435 550,398',
      'M550,398 Q660,428 750,398',
      'M750,398 Q860,428 955,398',
      'M955,398 Q1055,428 1145,402',
    ];

    const particles: { circle: SVGCircleElement; path: SVGPathElement; progress: number; speed: number }[] = [];
    const pathEls: SVGPathElement[] = [];

    linePaths.forEach((d) => {
      const dummy = document.createElementNS(svgNS, 'path') as SVGPathElement;
      dummy.setAttribute('d', d);
      dummy.setAttribute('fill', 'none');
      dummy.setAttribute('stroke', 'none');
      svg.appendChild(dummy);
      pathEls.push(dummy);

      for (let j = 0; j < 4; j++) {
        const c = document.createElementNS(svgNS, 'circle') as SVGCircleElement;
        c.setAttribute('r', j === 0 ? '5' : '3');
        c.setAttribute('fill', 'white');
        c.setAttribute('filter', 'url(#glow)');
        svg.appendChild(c);
        particles.push({ circle: c, path: dummy, progress: j / 4, speed: 0.004 + Math.random() * 0.003 });
      }
    });

    let frame: number;
    function tick() {
      particles.forEach(p => {
        p.progress = (p.progress + p.speed) % 1;
        const len = p.path.getTotalLength();
        const pt = p.path.getPointAtLength(p.progress * len);
        p.circle.setAttribute('cx', String(pt.x));
        p.circle.setAttribute('cy', String(pt.y));
        const alpha = Math.sin(p.progress * Math.PI);
        p.circle.setAttribute('opacity', (alpha * 0.9 + 0.1).toFixed(2));
      });
      frame = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(frame);
      particles.forEach(p => p.circle.remove());
      pathEls.forEach(p => p.remove());
    };
  }, []);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      background: '#000',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

        @keyframes spinCW { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes spinCW2 { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes steamRise {
          0%   { transform: translateY(0)   scaleX(1); opacity:.9 }
          100% { transform: translateY(-90px) scaleX(2.2); opacity:0 }
        }
        @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes blinkSlow { 0%,74%{opacity:1} 75%,100%{opacity:0} }
        @keyframes wobble { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes workArm { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-35deg)} }
        @keyframes pourArm { 0%,100%{transform:rotate(0deg)} 40%,60%{transform:rotate(-45deg)} }
        @keyframes legL { 0%,100%{transform:rotate(22deg)} 50%{transform:rotate(-22deg)} }
        @keyframes legR { 0%,100%{transform:rotate(-22deg)} 50%{transform:rotate(22deg)} }
        @keyframes walkX { 0%{transform:translateX(0)} 100%{transform:translateX(-420px)} }
        @keyframes bubble1 { 0%{cy:480;opacity:.9;r:2} 100%{cy:462;opacity:0;r:1} }
        @keyframes bubble2 { 0%{cy:475;opacity:.8;r:1.5} 100%{cy:456;opacity:0;r:.5} }
        @keyframes solarShimmer { 0%,100%{opacity:0} 50%{opacity:.85} }
        @keyframes powerWin {
          0%,100% { fill:#000 }
          30%,90% { fill:#fff }
        }
        @keyframes waveform {
          0%  {d:path("M162,559 L167,559 L170,551 L174,567 L178,551 L182,567 L185,559 L190,559 L193,553 L197,565 L201,559 L205,559")}
          33% {d:path("M162,559 L167,559 L170,554 L174,564 L178,554 L182,564 L185,559 L190,559 L193,556 L197,562 L201,559 L205,559")}
          66% {d:path("M162,559 L167,559 L170,547 L174,571 L178,547 L182,571 L185,559 L190,559 L193,549 L197,569 L201,559 L205,559")}
          100%{d:path("M162,559 L167,559 L170,551 L174,567 L178,551 L182,567 L185,559 L190,559 L193,553 L197,565 L201,559 L205,559")}
        }
        @keyframes flicker {0%,94%,100%{opacity:1}95%,98%{opacity:.25}}
        @keyframes electricArc {0%,100%{opacity:0}8%,9%{opacity:1}55%,56%{opacity:1}}
        @keyframes scroll18 { 0%{transform:translateY(0)} 100%{transform:translateY(-70px)} }
        @keyframes ticker { from{transform:translateX(1500px)} to{transform:translateX(-2400px)} }
        @keyframes pulse { 0%,100%{r:6;opacity:1} 50%{r:12;opacity:0} }
        @keyframes barSolar { 0%,100%{width:44px} 50%{width:52px} }
        @keyframes barWind  { 0%{width:46px}25%{width:32px}75%{width:50px}100%{width:36px} }
        @keyframes waveArm  { 0%,100%{transform:rotate(-20deg)} 50%{transform:rotate(20deg)} }
        @keyframes nod { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(8deg)} }

        .blade1 { animation: spinCW 2.8s linear infinite; transform-origin: 530px 303px; }
        .blade2 { animation: spinCW 3.8s linear infinite; transform-origin: 635px 312px; }
        .blade3 { animation: spinCW2 2.4s linear infinite; transform-origin: 715px 298px; }

        .steam1 { animation: steamRise 2.8s ease-out infinite; transform-origin: 115px 195px; }
        .steam2 { animation: steamRise 2.8s ease-out .9s infinite; transform-origin: 115px 195px; }
        .steam3 { animation: steamRise 2.8s ease-out 2s infinite; transform-origin: 205px 218px; }
        .steam4 { animation: steamRise 2.8s ease-out 1.3s infinite; transform-origin: 205px 218px; }

        .blink     { animation: blink .55s step-end infinite; }
        .blinkSlow { animation: blinkSlow 1.2s step-end infinite; }
        .flicker   { animation: flicker 5s ease-in-out infinite; }
        .electricArc { animation: electricArc 3.5s ease-in-out infinite; }
        .wobble    { animation: wobble .75s ease-in-out infinite; }
        .workerBob { animation: wobble .7s ease-in-out infinite; }
        .workerBob2{ animation: wobble .7s ease-in-out .35s infinite; }
        .nod       { animation: nod 2s ease-in-out infinite; }

        .arm1 { animation: workArm 1.4s ease-in-out infinite; transform-origin: 177px 424px; }
        .arm2 { animation: pourArm 2s ease-in-out infinite; transform-origin: 228px 420px; }
        .armWave { animation: waveArm 1.2s ease-in-out infinite; transform-origin: 1094px 484px; }
        .armWrench { animation: workArm .9s ease-in-out infinite; transform-origin: 250px 393px; }

        .walker { animation: walkX 6s linear infinite; }
        .legL  { animation: legL .45s ease-in-out infinite; transform-origin: 9px 0; }
        .legR  { animation: legR .45s ease-in-out infinite; transform-origin: 15px 0; }

        .ss1 { animation: solarShimmer 2.1s ease-in-out infinite; }
        .ss2 { animation: solarShimmer 2.1s ease-in-out .7s infinite; }
        .ss3 { animation: solarShimmer 2.1s ease-in-out 1.4s infinite; }

        .pw1 { animation: powerWin 3.8s ease-in-out infinite; }
        .pw2 { animation: powerWin 3.8s ease-in-out .5s infinite; }
        .pw3 { animation: powerWin 3.8s ease-in-out 1s infinite; }
        .pw4 { animation: powerWin 3.8s ease-in-out 1.5s infinite; }
        .pw5 { animation: powerWin 3.8s ease-in-out 2s infinite; }
        .pw6 { animation: powerWin 3.8s ease-in-out 2.5s infinite; }

        .waveformPath { animation: waveform 1.8s ease-in-out infinite; }
        .scrollFeed { animation: scroll18 4.5s linear infinite; }
        .ticker { animation: ticker 22s linear infinite; font-family:'Share Tech Mono',monospace; font-size:10px; fill:white; }

        .barSolar rect { animation: barSolar 3.5s ease-in-out infinite; }
        .barWind  rect { animation: barWind  2.8s ease-in-out infinite; }
      `}</style>

      <svg
        ref={svgRef}
        viewBox="0 0 1400 750"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: 0.55,
        }}
      >
        <defs>
          <pattern id="stars" patternUnits="userSpaceOnUse" width="120" height="120">
            <circle cx="12" cy="18" r=".8" fill="white"/>
            <circle cx="48" cy="8"  r="1.2" fill="white"/>
            <circle cx="78" cy="32" r=".7" fill="white"/>
            <circle cx="22" cy="74" r=".9" fill="white"/>
            <circle cx="92" cy="55" r="1.3" fill="white"/>
            <circle cx="58" cy="92" r=".7" fill="white"/>
            <circle cx="95" cy="12" r=".5" fill="white"/>
            <circle cx="4"  cy="52" r=".8" fill="white"/>
            <circle cx="68" cy="58" r=".5" fill="white"/>
            <circle cx="35" cy="44" r="1"  fill="white" opacity=".5"/>
            <circle cx="105" cy="82" r=".6" fill="white"/>
            <circle cx="15" cy="100" r=".8" fill="white"/>
          </pattern>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="white" strokeWidth="1.2"/>
          </pattern>
          <pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12">
            <circle cx="6" cy="6" r="1.2" fill="white"/>
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="softglow">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <clipPath id="feedClip"><rect x="1268" y="522" width="115" height="90"/></clipPath>
          <clipPath id="tickerClip"><rect x="140" y="720" width="1120" height="22"/></clipPath>
        </defs>

        {/* SKY */}
        <rect width="1400" height="750" fill="#000"/>
        <rect width="1400" height="460" fill="url(#stars)" opacity=".85"/>
        <ellipse cx="700" cy="478" rx="750" ry="90" fill="white" opacity=".04"/>

        {/* GROUND */}
        <rect y="478" width="1400" height="272" fill="#060606"/>
        <rect y="476" width="1400" height="4" fill="white" opacity=".35"/>
        <rect y="478" width="1400" height="272" fill="url(#dots)" opacity=".12"/>

        {[500,535,570,610,660,720].map((y,i)=>(
          <line key={y} x1="0" y1={y} x2="1400" y2={y} stroke="white" strokeWidth=".4" opacity={.18-i*.025}/>
        ))}
        <line x1="200" y1="478" x2="0"    y2="750" stroke="white" strokeWidth=".4" opacity=".1"/>
        <line x1="420" y1="478" x2="260"  y2="750" stroke="white" strokeWidth=".4" opacity=".1"/>
        <line x1="700" y1="478" x2="700"  y2="750" stroke="white" strokeWidth=".4" opacity=".1"/>
        <line x1="980" y1="478" x2="1140" y2="750" stroke="white" strokeWidth=".4" opacity=".1"/>
        <line x1="1200" y1="478" x2="1400" y2="750" stroke="white" strokeWidth=".4" opacity=".1"/>

        {/* NUCLEAR COOLING TOWERS */}
        <g opacity=".75">
          <path d="M62,210 Q50,328 82,385 L148,385 Q175,328 168,210 Q115,238 62,210Z" fill="#0e0e0e" stroke="white" strokeWidth="2"/>
          <path d="M62,210 Q50,328 82,385 L148,385 Q175,328 168,210 Q115,238 62,210Z" fill="url(#hatch)" opacity=".14"/>
          <ellipse cx="115" cy="210" rx="53" ry="13" fill="#0e0e0e" stroke="white" strokeWidth="2"/>
          <line x1="62" y1="262" x2="168" y2="262" stroke="white" strokeWidth="1" strokeDasharray="7,4" opacity=".5"/>
          <g className="steam1"><ellipse cx="115" cy="196" rx="22" ry="13" fill="white" opacity=".8"/><ellipse cx="100" cy="188" rx="16" ry="10" fill="white" opacity=".55"/><ellipse cx="130" cy="184" rx="18" ry="11" fill="white" opacity=".65"/></g>
          <g className="steam2"><ellipse cx="115" cy="182" rx="28" ry="15" fill="white" opacity=".4"/><ellipse cx="96"  cy="170" rx="20" ry="11" fill="white" opacity=".3"/></g>
          <circle cx="115" cy="208" r="5" fill="white" className="blink" filter="url(#glow)"/>
          <g transform="translate(115,340)">
            <circle cx="0" cy="0" r="6" fill="none" stroke="white" strokeWidth="1.5"/>
            <ellipse cx="0" cy="0" rx="18" ry="6" fill="none" stroke="white" strokeWidth="1.2"/>
            <ellipse cx="0" cy="0" rx="18" ry="6" fill="none" stroke="white" strokeWidth="1.2" transform="rotate(60)"/>
            <ellipse cx="0" cy="0" rx="18" ry="6" fill="none" stroke="white" strokeWidth="1.2" transform="rotate(120)"/>
          </g>
        </g>
        <g opacity=".72">
          <path d="M158,228 Q146,340 175,392 L235,392 Q258,340 252,228 Q205,255 158,228Z" fill="#0e0e0e" stroke="white" strokeWidth="2"/>
          <path d="M158,228 Q146,340 175,392 L235,392 Q258,340 252,228 Q205,255 158,228Z" fill="url(#hatch)" opacity=".12"/>
          <ellipse cx="205" cy="228" rx="47" ry="11" fill="#0e0e0e" stroke="white" strokeWidth="2"/>
          <g className="steam3"><ellipse cx="205" cy="215" rx="24" ry="14" fill="white" opacity=".75"/><ellipse cx="220" cy="205" rx="17" ry="10" fill="white" opacity=".5"/></g>
          <g className="steam4"><ellipse cx="205" cy="202" rx="20" ry="12" fill="white" opacity=".45"/></g>
          <circle cx="205" cy="225" r="5" fill="white" style={{animation:'blink .75s step-end infinite'}} filter="url(#glow)"/>
        </g>
        <rect x="50" y="385" width="225" height="95" fill="#0b0b0b" stroke="white" strokeWidth="2"/>
        <rect x="50" y="385" width="225" height="95" fill="url(#hatch)" opacity=".1"/>
        <text x="162" y="443" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="9" textAnchor="middle" letterSpacing="3">NUCLEAR FACILITY</text>
        <rect x="68" y="395" width="18" height="12" rx="1" fill="white" className="pw1"/>
        <rect x="98" y="395" width="18" height="12" rx="1" fill="white" className="pw3"/>
        <rect x="212" y="395" width="18" height="12" rx="1" fill="white" className="pw2"/>
        <rect x="242" y="395" width="18" height="12" rx="1" fill="white" className="pw5"/>
        <g transform="translate(72,396)">
          <circle cx="5" cy="4" r="3.5" fill="white"/>
          <rect x="2" y="7" width="6" height="8" rx="1" fill="white"/>
        </g>

        {/* CITY SKYLINE */}
        <rect x="292" y="322" width="58" height="158" fill="#0c0c0c" stroke="white" strokeWidth="1.5"/>
        <rect x="292" y="322" width="58" height="6" fill="white" opacity=".8"/>
        {[330,350,370,390].map((y,i)=>[0,1,2].map(j=>(
          <rect key={`a${i}${j}`} x={300+j*18} y={y} width="12" height="9" rx="1" fill="white" className={`pw${(i+j)%6+1}`}/>
        )))}
        <line x1="321" y1="322" x2="321" y2="298" stroke="white" strokeWidth="2"/>
        <circle cx="321" cy="296" r="4" fill="white" className="blinkSlow" filter="url(#glow)"/>

        <rect x="362" y="262" width="52" height="218" fill="#0c0c0c" stroke="white" strokeWidth="1.5"/>
        {[272,292,312,332,352,372].map((y,i)=>[0,1,2].map(j=>(
          <rect key={`b${i}${j}`} x={370+j*16} y={y} width="11" height="9" rx="1" fill="white" className={`pw${(i*2+j+1)%6+1}`}/>
        )))}
        <rect x="366" y="334" width="42" height="18" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1"/>
        <text x="387" y="347" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7" textAnchor="middle" className="flicker">⚡ 99%</text>

        <rect x="424" y="342" width="48" height="138" fill="#0c0c0c" stroke="white" strokeWidth="1.5"/>
        {[352,372,392].map((y,i)=>[0,1].map(j=>(
          <rect key={`c${i}${j}`} x={432+j*20} y={y} width="12" height="9" rx="1" fill="white" className={`pw${(i+j*2+1)%6+1}`}/>
        )))}

        {/* WIND TURBINES */}
        <polygon points="522,480 530,302 538,480" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
        <rect x="520" y="297" width="22" height="11" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
        <g className="blade1">
          <path d="M530,303 Q525,262 528,222" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M530,303 Q535,262 532,222" fill="white" stroke="white" strokeWidth="1"/>
          <path d="M530,303 Q558,332 574,362" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M530,303 Q548,337 567,364" fill="white" stroke="white" strokeWidth="1"/>
          <path d="M530,303 Q504,332 488,362" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M530,303 Q512,337 492,364" fill="white" stroke="white" strokeWidth="1"/>
          <circle cx="530" cy="303" r="8" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
          <circle cx="530" cy="303" r="3.5" fill="white"/>
        </g>
        <path d="M492,362 Q472,340 492,316" stroke="white" strokeWidth=".8" fill="none" opacity=".3" strokeDasharray="3,3"/>

        <polygon points="626,480 634,312 642,480" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
        <rect x="624" y="307" width="20" height="10" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
        <g className="blade2">
          <path d="M634,312 Q629,270 632,230" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M634,312 Q639,270 636,230" fill="white" stroke="white" strokeWidth="1"/>
          <path d="M634,312 Q661,340 678,368" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M634,312 Q649,344 670,370" fill="white" stroke="white" strokeWidth="1"/>
          <path d="M634,312 Q609,340 592,368" fill="#0d0d0d" stroke="white" strokeWidth="2.5"/>
          <path d="M634,312 Q617,344 594,370" fill="white" stroke="white" strokeWidth="1"/>
          <circle cx="634" cy="312" r="8" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
          <circle cx="634" cy="312" r="3.5" fill="white"/>
        </g>

        <g opacity=".72">
          <polygon points="706,462 713,296 720,462" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <rect x="704" y="292" width="18" height="9" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <g className="blade3">
            <path d="M713,296 Q709,264 711,234" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
            <path d="M713,296 Q717,264 715,234" fill="white" stroke="white" strokeWidth="1"/>
            <path d="M713,296 Q735,320 750,344" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
            <path d="M713,296 Q727,323 744,346" fill="white" stroke="white" strokeWidth="1"/>
            <path d="M713,296 Q692,320 678,344" fill="#0d0d0d" stroke="white" strokeWidth="2"/>
            <path d="M713,296 Q697,323 680,346" fill="white" stroke="white" strokeWidth="1"/>
            <circle cx="713" cy="296" r="6" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
            <circle cx="713" cy="296" r="2.5" fill="white"/>
          </g>
        </g>

        {/* SOLAR FARM */}
        {[0,68,136,204].map((dx,pi)=>(
          <g key={pi} transform={`translate(${758+dx},425)`}>
            <rect x="0" y="-32" width="58" height="36" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="2" transform="skewX(-14)"/>
            <line x1="14" y1="-32" x2="14" y2="4" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55"/>
            <line x1="29" y1="-32" x2="29" y2="4" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55"/>
            <line x1="44" y1="-32" x2="44" y2="4" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55"/>
            <line x1="0" y1="-15" x2="58" y2="-15" stroke="white" strokeWidth=".6" transform="skewX(-14)" opacity=".55"/>
            <rect x="4" y="-29" width="18" height="12" rx="1" fill="white" className={`ss${pi%3+1}`} transform="skewX(-14)"/>
            <rect x="34" y="-29" width="18" height="12" rx="1" fill="white" className={`ss${(pi+1)%3+1}`} transform="skewX(-14)"/>
            <line x1="10" y1="4"  x2="10" y2="20" stroke="white" strokeWidth="2"/>
            <line x1="48" y1="4"  x2="48" y2="20" stroke="white" strokeWidth="2"/>
          </g>
        ))}

        {/* POWER POLES + TRANSMISSION LINES */}
        {[278,562,762,962].map((x)=>(
          <g key={x}>
            <line x1={x} y1="392" x2={x} y2="480" stroke="white" strokeWidth="3"/>
            <line x1={x-22} y1="397" x2={x+22} y2="397" stroke="white" strokeWidth="2.2"/>
            <line x1={x-22} y1="407" x2={x+22} y2="407" stroke="white" strokeWidth="2.2"/>
            <circle cx={x-22} cy="397" r="3" fill="white" opacity=".6"/>
            <circle cx={x+22} cy="397" r="3" fill="white" opacity=".6"/>
            <circle cx={x-22} cy="407" r="3" fill="white" opacity=".6"/>
            <circle cx={x+22} cy="407" r="3" fill="white" opacity=".6"/>
          </g>
        ))}
        <path d="M256,397 Q420,432 540,397" fill="none" stroke="white" strokeWidth="1.4" opacity=".5"/>
        <path d="M256,407 Q420,442 540,407" fill="none" stroke="white" strokeWidth="1.4" opacity=".5"/>
        <path d="M540,397 Q652,428 740,397" fill="none" stroke="white" strokeWidth="1.4" opacity=".5"/>
        <path d="M740,397 Q852,428 940,397" fill="none" stroke="white" strokeWidth="1.4" opacity=".5"/>
        <path d="M940,397 Q1048,428 1148,402" fill="none" stroke="white" strokeWidth="1.4" opacity=".5"/>
        {[
          "M256,397 Q420,432 540,397",
          "M540,397 Q652,428 740,397",
          "M740,397 Q852,428 940,397",
          "M940,397 Q1048,428 1148,402",
        ].map((d,i)=>(
          <path key={i} d={d} fill="none" stroke="white" strokeWidth="3.5" strokeDasharray="10,14" opacity=".85">
            <animate attributeName="stroke-dashoffset" from="240" to="0" dur={`${1.7+i*0.3}s`} repeatCount="indefinite"/>
          </path>
        ))}

        {/* RESEARCH LAB */}
        <rect x="140" y="422" width="210" height="160" fill="#080808" stroke="white" strokeWidth="2.5"/>
        <rect x="140" y="418" width="210" height="8" fill="white"/>
        <rect x="168" y="396" width="14" height="26" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <rect x="202" y="406" width="12" height="16" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <rect x="158" y="426" width="130" height="18" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <text x="223" y="439" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="8.5" textAnchor="middle" letterSpacing="2">R&D ENERGY LAB</text>

        <rect x="148" y="456" width="72" height="78" rx="1" fill="#050505" stroke="white" strokeWidth="2"/>
        <rect x="153" y="520" width="62" height="5" rx="1" fill="white" opacity=".5"/>
        <g transform="translate(162,484)">
          <path d="M0,32 Q-5,16 -3,0 L9,0 Q11,16 6,32Z" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <line x1="-3" y1="0" x2="9" y2="0" stroke="white" strokeWidth="1.5"/>
          <path d="M-1,30 Q-4,20 -2,15 L7,15 Q9,20 6,30Z" fill="white" opacity=".25"/>
          <circle cx="3" cy="22" r="2" fill="white">
            <animate attributeName="cy" values="22;8" dur="1.1s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values=".9;0" dur="1.1s" repeatCount="indefinite"/>
          </circle>
          <circle cx="5" cy="19" r="1.5" fill="white">
            <animate attributeName="cy" values="19;5" dur="1.4s" begin=".35s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values=".7;0" dur="1.4s" begin=".35s" repeatCount="indefinite"/>
          </circle>
        </g>
        <g transform="translate(186,478)">
          <path d="M0,38 Q-6,20 -4,0 L11,0 Q13,20 7,38Z" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <line x1="-4" y1="0" x2="11" y2="0" stroke="white" strokeWidth="1.5"/>
          <path d="M-2,36 Q-5,24 -3,18 L9,18 Q11,24 8,36Z" fill="white" opacity=".3"/>
          <circle cx="3" cy="28" r="2" fill="white">
            <animate attributeName="cy" values="28;12" dur=".9s" begin=".2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values=".8;0" dur=".9s" begin=".2s" repeatCount="indefinite"/>
          </circle>
        </g>
        <g transform="translate(148,456)">
          <circle cx="22" cy="18" r="11" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <circle cx="18" cy="17" r="4.5" fill="none" stroke="white" strokeWidth="1"/>
          <circle cx="26" cy="17" r="4.5" fill="none" stroke="white" strokeWidth="1"/>
          <line x1="22" y1="17" x2="22" y2="17" stroke="white" strokeWidth="1"/>
          <line x1="13" y1="17" x2="13" y2="17" stroke="white" strokeWidth="1"/>
          <path d="M11,12 Q22,6 33,12" stroke="white" strokeWidth="1.8" fill="none"/>
          <rect x="14" y="29" width="16" height="26" rx="2" fill="white" stroke="white" strokeWidth="1"/>
          <line x1="14" y1="33" x2="3"  y2="44" stroke="white" strokeWidth="2.2"/>
          <circle cx="2" cy="45" r="3.5" fill="#0d0d0d" stroke="white" strokeWidth="1"/>
          <line x1="30" y1="33" x2="40" y2="41" stroke="white" strokeWidth="2.2"/>
          <line x1="18" y1="55" x2="16" y2="70" stroke="white" strokeWidth="2.2"/>
          <line x1="26" y1="55" x2="28" y2="70" stroke="white" strokeWidth="2.2"/>
        </g>

        <rect x="230" y="456" width="112" height="78" rx="1" fill="#050505" stroke="white" strokeWidth="2"/>
        <rect x="236" y="462" width="62" height="52" rx="1" fill="#080808" stroke="white" strokeWidth="1.2"/>
        <text x="267" y="477" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="8" textAnchor="middle">E = hν</text>
        <text x="267" y="490" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7" textAnchor="middle">P = I·V</text>
        <text x="267" y="502" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="6.5" textAnchor="middle">η = Pout/Pin</text>
        <text x="267" y="512" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="6" textAnchor="middle">ΔG = -nFE°</text>
        <g transform="translate(298,458)">
          <circle cx="14" cy="15" r="10" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <path d="M4,10 Q14,4 24,10" stroke="white" strokeWidth="1.5" fill="none"/>
          <rect x="6" y="25" width="16" height="22" rx="2" fill="white" stroke="white" strokeWidth="1"/>
          <line x1="6" y1="29" x2="-5" y2="42" stroke="white" strokeWidth="2"/>
          <rect x="-9" y="40" width="5" height="2" rx="1" fill="white"/>
          <line x1="22" y1="29" x2="32" y2="37" stroke="white" strokeWidth="2"/>
          <line x1="10" y1="47" x2="8"  y2="62" stroke="white" strokeWidth="2"/>
          <line x1="18" y1="47" x2="20" y2="62" stroke="white" strokeWidth="2"/>
        </g>

        <rect x="153" y="544" width="54" height="34" rx="3" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <rect x="156" y="547" width="48" height="26" fill="#000" stroke="white" strokeWidth=".5"/>
        <path className="waveformPath" d="M162,559 L167,559 L170,551 L174,567 L178,551 L182,567 L185,559 L190,559 L193,553 L197,565 L201,559 L205,559" fill="none" stroke="white" strokeWidth="1.8"/>
        <line x1="180" y1="573" x2="180" y2="580" stroke="white" strokeWidth="2"/>
        <line x1="173" y1="580" x2="187" y2="580" stroke="white" strokeWidth="2"/>

        {/* INSTALLATION WORKERS */}
        {[155,202].map((x,i)=>(
          <g key={i} transform={`translate(${x},418)`}>
            <rect x="0" y="-26" width="42" height="24" rx="1" fill="#0d0d0d" stroke="white" strokeWidth="1.5" transform="skewX(-18)"/>
            <line x1="10" y1="-26" x2="10" y2="-2" stroke="white" strokeWidth=".6" transform="skewX(-18)" opacity=".6"/>
            <line x1="21" y1="-26" x2="21" y2="-2" stroke="white" strokeWidth=".6" transform="skewX(-18)" opacity=".6"/>
            <line x1="32" y1="-26" x2="32" y2="-2" stroke="white" strokeWidth=".6" transform="skewX(-18)" opacity=".6"/>
            <line x1="0"  y1="-14" x2="42" y2="-14" stroke="white" strokeWidth=".6" transform="skewX(-18)" opacity=".6"/>
            <rect x="4" y="-23" width="13" height="9" rx="1" fill="white" className={`ss${i+1}`} transform="skewX(-18)"/>
          </g>
        ))}
        <g transform="translate(164,382)">
          <path d="M4,0 Q11,-9 20,0Z" fill="white" stroke="white" strokeWidth="1"/>
          <line x1="1" y1="0" x2="23" y2="0" stroke="white" strokeWidth="2.5"/>
          <circle cx="12" cy="6" r="9.5" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <rect x="5" y="15" width="14" height="21" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <line x1="5"  y1="19" x2="-4" y2="9"  stroke="white" strokeWidth="2.2"/>
          <line x1="19" y1="19" x2="28" y2="9"  stroke="white" strokeWidth="2.2"/>
          <line x1="5"  y1="29" x2="7"  y2="22" stroke="white" strokeWidth="2"/>
          <line x1="8"  y1="36" x2="6"  y2="50" stroke="white" strokeWidth="2.2"/>
          <line x1="14" y1="36" x2="16" y2="50" stroke="white" strokeWidth="2.2"/>
        </g>
        <g transform="translate(228,385)">
          <path d="M4,0 Q11,-9 20,0Z" fill="white" stroke="white" strokeWidth="1"/>
          <line x1="1" y1="0" x2="23" y2="0" stroke="white" strokeWidth="2.5"/>
          <circle cx="12" cy="6" r="9.5" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <rect x="5" y="15" width="14" height="21" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <line x1="19" y1="19" x2="28" y2="26" stroke="white" strokeWidth="2.2"/>
          <line x1="5" y1="19" x2="-4" y2="28" stroke="white" strokeWidth="2.2"/>
          <path d="M-7,26 Q-12,28 -9,33 Q-5,35 -2,30 L2,26Z" fill="white" stroke="white" strokeWidth=".8"/>
          <line x1="8"  y1="36" x2="6"  y2="50" stroke="white" strokeWidth="2.2"/>
          <line x1="14" y1="36" x2="16" y2="50" stroke="white" strokeWidth="2.2"/>
          <line x1="5"  y1="25" x2="19" y2="25" stroke="white" strokeWidth="2"/>
        </g>

        {/* TRANSFORMER STATION */}
        <rect x="940" y="432" width="65" height="52" rx="2" fill="#0a0a0a" stroke="white" strokeWidth="2"/>
        <rect x="940" y="432" width="65" height="52" rx="2" fill="url(#hatch)" opacity=".1"/>
        <ellipse cx="960" cy="448" rx="9"  ry="11" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <ellipse cx="983" cy="448" rx="9"  ry="11" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <line x1="951" y1="443" x2="974" y2="443" stroke="white" strokeWidth="1"/>
        <path d="M951,443 Q962,437 974,443" fill="none" stroke="white" strokeWidth="1.8" className="electricArc"/>
        <path d="M968,428 L963,438 L969,438 L964,452" fill="none" stroke="white" strokeWidth="2.5" className="blink" filter="url(#glow)"/>
        <text x="972" y="475" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7" textAnchor="middle" letterSpacing="1">XFMR</text>

        {/* BUSINESS DISTRICT */}
        <rect x="1048" y="352" width="85" height="128" fill="#090909" stroke="white" strokeWidth="2.5"/>
        {[362,384,406,426].map((y,row)=>[0,1,2].map(col=>(
          <rect key={`o1${row}${col}`} x={1057+col*24} y={y} width="16" height="12" rx="1" fill="white" className={`pw${(row+col*2)%6+1}`}/>
        )))}
        <rect x="1048" y="346" width="85" height="8" fill="white" opacity=".85"/>
        <rect x="1074" y="460" width="26" height="20" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <rect x="1051" y="448" width="79" height="14" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1"/>
        <text x="1090" y="459" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7" textAnchor="middle" className="flicker">POWERED ✓</text>

        <rect x="1152" y="302" width="94" height="178" fill="#090909" stroke="white" strokeWidth="2.5"/>
        {[312,334,356,378,400,422,444].map((y,row)=>[0,1,2].map(col=>(
          <rect key={`o2${row}${col}`} x={1160+col*28} y={y} width="18" height="12" rx="1" fill="white" className={`pw${(row+col)%6+1}`}/>
        )))}
        <rect x="1152" y="296" width="94" height="9" fill="white" opacity=".9"/>
        <line x1="1199" y1="296" x2="1199" y2="268" stroke="white" strokeWidth="2.5"/>
        <circle cx="1199" cy="266" r="5" fill="white" style={{animation:'blink .9s step-end infinite'}} filter="url(#glow)"/>
        <rect x="1155" y="462" width="88" height="18" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <text x="1199" y="474" fill="white" fontFamily="'Orbitron',monospace" fontSize="7.5" textAnchor="middle" letterSpacing="1" className="flicker">FOUNDATION-1</text>

        <rect x="1262" y="402" width="72" height="78" fill="#090909" stroke="white" strokeWidth="2"/>
        {[413,435].map((y,r)=>[0,1].map(c=>(
          <rect key={`cl${r}${c}`} x={1272+c*30} y={y} width="19" height="14" rx="1" fill="white" className={`pw${(r*3+c+1)%6+1}`}/>
        )))}
        <rect x="1285" y="458" width="18" height="22" rx="1" fill="#0a0a0a" stroke="white" strokeWidth="1.5"/>
        <line x1="1294" y1="454" x2="1294" y2="468" stroke="white" strokeWidth="3.5"/>
        <line x1="1288" y1="461" x2="1300" y2="461" stroke="white" strokeWidth="3.5"/>

        {/* FOREGROUND CHARACTER */}
        <g transform="translate(1078,470)">
          <circle cx="14" cy="0"  r="10" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <path d="M5,5 Q14,-1 23,5" stroke="white" strokeWidth="1.2" fill="none"/>
          <rect x="6" y="10" width="16" height="22" rx="2" fill="#0d0d0d" stroke="white" strokeWidth="1.5"/>
          <path d="M9,10 L11,24 L14,10" fill="white"/>
          <line x1="22" y1="15" x2="30" y2="10" stroke="white" strokeWidth="2.2"/>
          <circle cx="31" cy="9" r="3.5" fill="#0d0d0d" stroke="white" strokeWidth="1"/>
          <line x1="6"  y1="15" x2="-4" y2="24" stroke="white" strokeWidth="2.2"/>
          <line x1="9"  y1="32" x2="7"  y2="46" stroke="white" strokeWidth="2.2"/>
          <line x1="17" y1="32" x2="19" y2="46" stroke="white" strokeWidth="2.2"/>
        </g>

        {/* DATA PANELS */}
        <rect x="14" y="502" width="126" height="148" rx="4" fill="#040404" stroke="white" strokeWidth="2"/>
        <rect x="14" y="502" width="126" height="18"  fill="white"/>
        <text x="77" y="514" fill="black" fontFamily="'Orbitron',monospace" fontSize="8" textAnchor="middle" fontWeight="bold" letterSpacing="1">GRID STATUS</text>
        <text x="24" y="540" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="8">SOLAR</text>
        <rect x="66" y="530" width="64" height="8" rx="2" fill="#111" stroke="white" strokeWidth="1"/>
        <rect x="66" y="530" width="52" height="8" rx="2" fill="white" className="barSolar"/>
        <text x="24" y="562" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="8">WIND</text>
        <rect x="66" y="552" width="64" height="8" rx="2" fill="#111" stroke="white" strokeWidth="1"/>
        <rect x="66" y="552" width="46" height="8" rx="2" fill="white" className="barWind"/>
        <text x="24" y="584" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="8">NUCLEAR</text>
        <rect x="66" y="574" width="64" height="8" rx="2" fill="#111" stroke="white" strokeWidth="1"/>
        <rect x="66" y="574" width="62" height="8" rx="2" fill="white"/>
        <line x1="14" y1="591" x2="140" y2="591" stroke="white" strokeWidth="1" opacity=".3"/>
        <text x="24" y="606" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7.5">OUTPUT</text>
        <text x="80" y="606" fill="white" fontFamily="'Orbitron',monospace" fontSize="10" fontWeight="bold" className="flicker">4.2 MW</text>
        <text x="24" y="622" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7.5">CLIENTS</text>
        <text x="80" y="622" fill="white" fontFamily="'Orbitron',monospace" fontSize="10" fontWeight="bold">247</text>
        <text x="24" y="638" fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7.5">UPTIME</text>
        <text x="80" y="638" fill="white" fontFamily="'Orbitron',monospace" fontSize="10" fontWeight="bold" className="flicker">99.8%</text>

        <rect x="1260" y="502" width="126" height="148" rx="4" fill="#040404" stroke="white" strokeWidth="2"/>
        <rect x="1260" y="502" width="126" height="18" fill="white"/>
        <text x="1323" y="514" fill="black" fontFamily="'Orbitron',monospace" fontSize="7.5" textAnchor="middle" fontWeight="bold" letterSpacing="1">LIVE FEED</text>
        <g className="scrollFeed" clipPath="url(#feedClip)">
          {['▶ School #12   LIVE','▶ Lodge       ONLINE','▶ Clinic      ACTIVE','▶ Office B2   POWERED','▶ Factory     CHARGING','▶ Hotel       LIVE','▶ Market      CONNECTED','▶ School #12   LIVE','▶ Lodge       ONLINE'].map((t,i)=>(
            <text key={i} x="1268" y={538+i*18} fill="white" fontFamily="'Share Tech Mono',monospace" fontSize="7.5">{t}</text>
          ))}
        </g>
        <circle cx="1370" cy="504" r="5" fill="white" className="blink" filter="url(#glow)"/>

        {/* CORNER BRACKETS */}
        <path d="M10,10 L42,10 L42,16"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M10,10 L10,42 L16,42"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M1390,10 L1358,10 L1358,16"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M1390,10 L1390,42 L1384,42"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M10,740 L42,740 L42,734"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M10,740 L10,708 L16,708"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M1390,740 L1358,740 L1358,734"  fill="none" stroke="white" strokeWidth="2.5"/>
        <path d="M1390,740 L1390,708 L1384,708"  fill="none" stroke="white" strokeWidth="2.5"/>

        {/* TICKER BAR */}
        <rect x="140" y="718" width="1120" height="22" rx="2" fill="#040404" stroke="white" strokeWidth="1.2"/>
        <clipPath id="tickerClipInner"><rect x="144" y="720" width="1112" height="18"/></clipPath>
        <text className="ticker" y="733" clipPath="url(#tickerClipInner)">
          ◆ GENEROCITY PPA ACTIVE ◆ ZERO CAPEX SOLAR FOR SMBs ◆ LUMEN WHEELING ONLINE ◆ 247 CLIENTS CONNECTED ◆ OUTPUT: 4.2 MW ◆ UPTIME: 99.8% ◆ SOLAR + WIND + NUCLEAR ◆ FOUNDATION-1 EaaS ◆ SOUTH AFRICA ◆ GENEROCITY PPA ACTIVE ◆ ZERO CAPEX SOLAR FOR SMBs ◆
        </text>

        {/* SCANLINE OVERLAY */}
        <rect width="1400" height="750" fill="url(#scanlines)" opacity=".07"/>
        <pattern id="scanlines" patternUnits="userSpaceOnUse" width="1" height="5">
          <line x1="0" y1="0" x2="1400" y2="0" stroke="white" strokeWidth="1"/>
        </pattern>
      </svg>
    </div>
  );
}
