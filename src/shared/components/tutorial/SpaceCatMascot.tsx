"use client";

import { useId } from "react";

/**
 * SpaceCatMascot – Ultra-fluid & lustiger AstroPet "Cosmo"
 *
 * 16 Emotionen (siehe SPACE_CAT_EMOTIONS).
 * Props: emotion, isTalking, size (default 130)
 */

export const SPACE_CAT_EMOTIONS = [
  "wave",
  "point",
  "excited",
  "reading",
  "sneaky",
  "laughing",
  "celebrate",
  "greeting",
  "farewell",
  "enthusiasm",
  "confused",
  "sleepy",
  "shocked",
  "love",
  "thinking",
  "dizzy",
] as const;

export type SpaceCatEmotion = (typeof SPACE_CAT_EMOTIONS)[number];

export type SpaceCatMascotProps = {
  emotion?: SpaceCatEmotion | string;
  isTalking?: boolean;
  size?: number;
};

const C = {
  dark: "#0B1120",
  cyan: "#7DF9FF",
  cyanMid: "#4FC3F7",
  cyanDark: "#29B6F6",
  gold: "#FFD54F",
  pink: "#FF9EAA",
  green: "#69F0AE",
  red: "#FF5252",
  purple: "#CE93D8",
  orange: "#FF6E40",
} as const;

export function SpaceCatMascot({ emotion = "wave", isTalking = false, size = 130 }: SpaceCatMascotProps) {
  const h = size * (156 / 130);
  const u = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const e = emotion;

  // ─── EYES ───
  const ey = (()=>{
    const m={
      reading:{ly:52,ry:52,s:0.5,px:0,py:2},
      sneaky:{ly:50,ry:50,s:0.35,px:2,py:0},
      laughing:{ly:50,ry:50,s:0.12,px:0,py:0},
      excited:{ly:48,ry:48,s:1.3,px:0,py:-1},
      celebrate:{ly:49,ry:49,s:0.15,px:0,py:0},
      point:{ly:50,ry:50,s:1,px:3,py:-1},
      greeting:{ly:48,ry:48,s:1.2,px:0,py:-1},
      farewell:{ly:51,ry:51,s:0.85,px:0,py:1},
      enthusiasm:{ly:47,ry:47,s:1.4,px:0,py:-2},
      confused:{ly:49,ry:51,s:0.9,px:-1,py:0},
      sleepy:{ly:52,ry:52,s:0.2,px:0,py:1},
      shocked:{ly:46,ry:46,s:1.6,px:0,py:-2},
      love:{ly:48,ry:48,s:1.1,px:0,py:-1},
      thinking:{ly:49,ry:49,s:0.8,px:3,py:-2},
      dizzy:{ly:50,ry:50,s:0.9,px:0,py:0},
    };
    return (m as Record<string, { ly: number; ry: number; s: number; px: number; py: number }>)[e] ?? {
      ly: 50,
      ry: 50,
      s: 1,
      px: 0,
      py: 0,
    };
  })();

  // ─── MOUTH ───
  const mo = (()=>{
    if(isTalking){
      if(["laughing","enthusiasm","greeting","shocked"].includes(e))
        return "M 42 62 Q 50 74 58 62 Q 50 70 42 62";
      if(e==="sleepy") return "M 44 63 Q 50 66 56 63";
      return "M 44 62 Q 50 68 56 62 Q 50 66 44 62";
    }
    const m={
      wave:"M 43 62 Q 50 68 57 62",excited:"M 41 61 Q 50 72 59 61",
      sneaky:"M 45 63 Q 50 66 57 62",laughing:"M 40 60 Q 50 76 60 60 Q 50 72 40 60",
      celebrate:"M 40 60 Q 50 74 60 60 Q 50 70 40 60",reading:"M 46 63 Q 50 65 54 63",
      greeting:"M 39 60 Q 50 76 61 60 Q 50 72 39 60",farewell:"M 44 63 Q 50 66 56 63",
      enthusiasm:"M 38 59 Q 50 78 62 59 Q 50 74 38 59",
      confused:"M 44 64 Q 50 60 56 64",
      sleepy:"M 44 63 Q 50 68 56 63",
      shocked:"M 42 60 Q 50 78 58 60 Q 50 74 42 60",
      love:"M 40 61 Q 50 72 60 61",
      thinking:"M 46 63 Q 50 62 54 63",
      dizzy:"M 43 64 Q 50 68 57 64",
    };
    return (m as Record<string, string>)[e] ?? "M 44 62 Q 50 67 56 62";
  })();
  const mFill=["laughing","celebrate","greeting","enthusiasm","shocked","love","sleepy"].includes(e)||isTalking;

  // ─── ARMS ───
  const la={wave:"M 28 72 Q 12 55 10 38",celebrate:"M 28 72 Q 12 55 10 38",
    greeting:"M 28 72 Q 6 52 0 36",farewell:"M 28 72 Q 12 55 10 38",
    enthusiasm:"M 28 72 Q 8 48 4 30",reading:"M 28 72 Q 16 78 12 88",
    confused:"M 28 72 Q 14 58 18 48",
    sleepy:"M 28 72 Q 20 84 22 94",
    shocked:"M 28 72 Q 6 56 0 42",
    love:"M 28 72 Q 14 60 20 50",
    thinking:"M 28 72 Q 18 80 16 90",
    dizzy:"M 28 72 Q 16 78 14 88",
  }[e]||"M 28 72 Q 18 82 16 92";

  const ra={point:"M 72 72 Q 88 55 94 40",excited:"M 72 72 Q 88 55 94 40",
    sneaky:"M 72 72 Q 86 60 94 52",celebrate:"M 72 72 Q 88 52 86 38",
    greeting:"M 72 72 Q 94 52 100 36",farewell:"M 72 72 Q 88 55 90 40",
    enthusiasm:"M 72 72 Q 92 48 96 30",reading:"M 72 72 Q 84 78 88 88",
    confused:"M 72 72 Q 82 60 78 48",
    sleepy:"M 72 72 Q 80 84 78 94",
    shocked:"M 72 72 Q 94 56 100 42",
    love:"M 72 72 Q 86 60 80 50",
    thinking:"M 72 72 Q 88 62 90 54",
    dizzy:"M 72 72 Q 84 78 86 88",
  }[e]||"M 72 72 Q 82 82 84 92";

  const lp={wave:[10,36],celebrate:[10,36],greeting:[0,34],farewell:[10,36],
    enthusiasm:[4,28],reading:[12,88],confused:[18,46],sleepy:[22,94],
    shocked:[0,40],love:[20,48],thinking:[16,90],dizzy:[14,88]}[e]||[16,92];
  const rp={point:[94,38],excited:[94,38],sneaky:[94,50],celebrate:[86,36],
    greeting:[100,34],farewell:[90,38],enthusiasm:[96,28],reading:[88,88],
    confused:[78,46],sleepy:[78,94],shocked:[100,40],love:[80,48],
    thinking:[90,52],dizzy:[86,88]}[e]||[84,92];

  const armUp=["wave","celebrate","greeting","farewell","enthusiasm","shocked"].includes(e);
  const armSp=e==="enthusiasm"?"0.22s":e==="farewell"?"1.2s":e==="greeting"?"0.55s":e==="shocked"?"0.15s":"0.45s";

  // ─── SWAY ───
  const sw=e==="enthusiasm"?["-5;5;-5","0.28s"]:e==="excited"?["-3;3;-3","0.55s"]
    :["greeting","celebrate"].includes(e)?["-3;3;-3","0.7s"]
    :e==="farewell"?["-1;1;-1","4s"]:e==="sneaky"?["0;4;0","2.5s"]
    :e==="reading"?["-1;0;1;0;-1","5s"]
    :e==="confused"?["-4;0;4;0;-4","1.8s"]
    :e==="sleepy"?["0;3;5;3;0","3.5s"]
    :e==="shocked"?["-6;6;-4;4;-2;0","0.3s"]
    :e==="dizzy"?["-5;5;-3;3;-5","0.7s"]
    :e==="love"?["-2;2;-2","2s"]
    :e==="thinking"?["0;2;0","3s"]
    :["-1.5;1.5;-1.5","3.5s"];

  // ─── TAIL ───
  const tFast=["excited","celebrate","enthusiasm","shocked","love"].includes(e);
  const tD=tFast?"M 68 95 Q 88 85 92 70 Q 96 60 90 55"
    :e==="farewell"?"M 68 95 Q 78 92 80 84 Q 82 76 78 72"
    :e==="sneaky"?"M 68 95 Q 82 90 85 80 Q 88 72 82 70"
    :e==="sleepy"?"M 68 95 Q 74 96 72 100 Q 70 104 68 106"
    :e==="confused"?"M 68 95 Q 80 88 84 78 Q 82 72 76 74"
    :e==="dizzy"?"M 68 95 Q 82 86 88 78 Q 92 68 84 62"
    :"M 68 95 Q 80 88 84 78 Q 88 68 82 65";
  const tA=e==="enthusiasm"
    ?"M 68 95 Q 88 85 92 70 Q 96 60 90 55;M 68 95 Q 94 78 98 62 Q 102 46 90 44;M 68 95 Q 82 90 86 76 Q 90 64 84 60;M 68 95 Q 88 85 92 70 Q 96 60 90 55"
    :e==="shocked"
    ?"M 68 95 Q 88 82 94 66 Q 100 50 92 48;M 68 95 Q 90 78 96 60 Q 102 42 94 40;M 68 95 Q 88 82 94 66 Q 100 50 92 48"
    :tFast?"M 68 95 Q 88 85 92 70 Q 96 60 90 55;M 68 95 Q 92 80 96 64 Q 100 50 90 48;M 68 95 Q 84 88 88 74 Q 92 62 86 58;M 68 95 Q 88 85 92 70 Q 96 60 90 55"
    :e==="sleepy"?"M 68 95 Q 74 96 72 100 Q 70 104 68 106;M 68 95 Q 74 97 73 102 Q 72 106 70 108;M 68 95 Q 74 96 72 100 Q 70 104 68 106"
    :e==="dizzy"?"M 68 95 Q 82 86 88 78 Q 92 68 84 62;M 68 95 Q 86 82 92 72 Q 96 60 88 56;M 68 95 Q 78 90 82 82 Q 86 72 80 68;M 68 95 Q 82 86 88 78 Q 92 68 84 62"
    :`${tD};${tD.replace(/88 68/g,"86 66").replace(/80 88/g,"82 86")};${tD}`;
  const tS=e==="enthusiasm"?"0.28s":e==="shocked"?"0.2s":tFast?"0.5s":e==="farewell"?"3.5s":e==="sleepy"?"5s":e==="dizzy"?"0.5s":"2.5s";
  const tCx=e==="farewell"?78:e==="sleepy"?68:tFast?90:e==="confused"?76:82;
  const tCy=e==="farewell"?72:e==="sleepy"?106:tFast?55:e==="confused"?74:65;

  // ─── SQUASH/STRETCH ───
  const bRy=e==="enthusiasm"?"26;31;26":e==="shocked"?"24;32;24":e==="excited"?"27;30;27":e==="dizzy"?"27;29;27":"28;29;28";
  const bRx=e==="enthusiasm"?"26;21;26":e==="shocked"?"28;20;28":e==="excited"?"25;22;25":e==="dizzy"?"25;23;25":"24;23.5;24";
  const bSpd=e==="enthusiasm"?"0.28s":e==="shocked"?"0.2s":e==="excited"?"0.7s":e==="dizzy"?"0.5s":"2.8s";

  return (
    <svg viewBox="-12 -14 124 148" width={size} height={h} style={{overflow:"visible"}}>
      <defs>
        <radialGradient id={`${u}hg`} cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="rgba(125,249,255,0.14)"/><stop offset="100%" stopColor="rgba(125,249,255,0.02)"/>
        </radialGradient>
        <radialGradient id={`${u}cb`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5E6D3"/><stop offset="100%" stopColor="#E8D5BE"/>
        </radialGradient>
        <radialGradient id={`${u}np`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFB0B8"/><stop offset="100%" stopColor="#FF8A95"/>
        </radialGradient>
        <filter id={`${u}gl`}><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id={`${u}sh`}><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.25"/></filter>
        <linearGradient id={`${u}sg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3D3555"/><stop offset="100%" stopColor="#2A2240"/>
        </linearGradient>
        <clipPath id={`${u}vc`}><ellipse cx="50" cy="48" rx="28" ry="26"/></clipPath>
        <path id={`${u}hp`} d="M 0 -3 C-1.5 -6 -6 -6 -6 -2 C-6 2 0 6 0 6 C 0 6 6 2 6 -2 C 6 -6 1.5 -6 0 -3Z"/>
      </defs>

      {/* ═══ STARS ═══ */}
      {(
        [
          [6, 10, 1.3, "2.3s"],
          [96, 16, 1, "3s"],
          [10, 90, 0.9, "2.6s"],
          [92, 94, 1.1, "3.3s"],
          [2, 50, 0.7, "3.6s"],
          [98, 56, 0.8, "2s"],
          [50, -10, 1.4, "2.8s"],
          [22, 2, 0.6, "4s"],
        ] as const
      ).map(([x, y, r, d], i) => (
        <g key={`st${i}`}>
          <circle cx={x} cy={y} r={r} fill={C.cyan} opacity="0">
            <animate attributeName="opacity" values="0;0.7;0" dur={d} begin={`${i * 0.35}s`} repeatCount="indefinite" />
            <animate
              attributeName="r"
              values={`${r};${r * 2.2};${r}`}
              dur={d}
              begin={`${i * 0.35}s`}
              repeatCount="indefinite"
            />
          </circle>
        </g>
      ))}

      {/* ═══ BODY SWAY ═══ */}
      <g>
        <animateTransform attributeName="transform" type="rotate"
          values={sw[0].split(";").map(v=>`${v} 50 80`).join(";")} dur={sw[1]} repeatCount="indefinite"/>

        {/* ── EMOTION FX ── */}

        {/* Greeting sparkle burst */}
        {e==="greeting"&&[0,45,90,135,180,225,270,315].map((a,i)=>{
          const r=a*Math.PI/180;const cx=50+Math.cos(r)*52;const cy=48+Math.sin(r)*50;
          const cl=[C.gold,C.cyan,C.pink,C.green,C.gold,C.cyan,C.pink,C.green][i];
          return(<g key={`gx${i}`}><circle cx={cx} cy={cy} r="0" fill={cl}>
            <animate attributeName="r" values="0;4.5;0" dur={`${0.6+i*0.07}s`} repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;1;0" dur={`${0.6+i*0.07}s`} repeatCount="indefinite"/>
          </circle></g>);
        })}

        {/* Farewell moon + rising particles */}
        {e==="farewell"&&<g>
          <circle cx="14" cy="8" r="9" fill={C.gold} opacity="0.3">
            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="4s" repeatCount="indefinite"/>
          </circle><circle cx="18" cy="6" r="7" fill={C.dark}/>
          {[[22,"2.5s"],[40,"3s"],[58,"2.3s"],[76,"2.8s"]].map(([x,d],i)=>(
            <circle key={i} cx={x} cy="95" r="1.5" fill={C.cyan} opacity="0">
              <animate attributeName="cy" values="95;-15" dur={d} begin={`${i*0.3}s`} repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0;0.7;0" dur={d} begin={`${i*0.3}s`} repeatCount="indefinite"/>
            </circle>
          ))}
        </g>}

        {/* Enthusiasm hearts + speed lines */}
        {e==="enthusiasm"&&<g>
          {[[10,16,0.6,"1s"],[86,10,0.5,"1.3s"],[16,56,0.4,"0.8s"],[88,50,0.5,"1.1s"],[50,-6,0.7,"0.9s"],[30,-2,0.4,"1.2s"]].map(([x,y,s,d],i)=>(
            <g key={i} transform={`translate(${x},${y}) scale(${s})`}><use href={`#${u}hp`} fill={C.red}>
              <animate attributeName="opacity" values="0;1;0" dur={d} begin={`${i*0.12}s`} repeatCount="indefinite"/>
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -20" dur={d} begin={`${i*0.12}s`} repeatCount="indefinite"/>
            </use></g>
          ))}
          {[[-2,28,-12,26],[102,32,112,30],[-4,68,-14,70],[104,66,114,68]].map(([x1,y1,x2,y2],i)=>(
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.gold} strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="opacity" values="0;0.9;0" dur="0.35s" begin={`${i*0.07}s`} repeatCount="indefinite"/>
            </line>
          ))}
        </g>}

        {/* Confused question marks */}
        {e==="confused"&&<g>
          <text x="72" y="18" fontSize="14" fill={C.gold} fontWeight="900" fontFamily="system-ui" opacity="0">?
            <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="y" values="18;12;18" dur="1.8s" repeatCount="indefinite"/>
            <animateTransform attributeName="transform" type="rotate" values="-10 72 18;10 72 18;-10 72 18" dur="1.8s" repeatCount="indefinite"/>
          </text>
          <text x="82" y="28" fontSize="10" fill={C.cyan} fontWeight="900" fontFamily="system-ui" opacity="0">?
            <animate attributeName="opacity" values="0;0.7;0" dur="2.2s" begin="0.5s" repeatCount="indefinite"/>
            <animate attributeName="y" values="28;22;28" dur="2.2s" begin="0.5s" repeatCount="indefinite"/>
          </text>
        </g>}

        {/* Sleepy Zzz */}
        {e==="sleepy"&&<g>
          {(
            [
              [70, 20, 14, "Z", "2.5s", "0s"],
              [80, 12, 10, "z", "3s", "0.6s"],
              [88, 6, 8, "z", "3.5s", "1.2s"],
            ] as const
          ).map(([x, y, fs, letter, d, b], i) => (
            <text key={i} x={x} y={y} fontSize={fs} fill={C.cyan} fontWeight="800" fontFamily="system-ui" opacity="0">
              {letter}
              <animate attributeName="opacity" values="0;0.7;0" dur={d} begin={b} repeatCount="indefinite"/>
              <animate attributeName="y" values={`${y};${y - 16};${y}`} dur={d} begin={b} repeatCount="indefinite"/>
              <animate attributeName="x" values={`${x};${x + 6};${x}`} dur={d} begin={b} repeatCount="indefinite"/>
            </text>
          ))}
        </g>}

        {/* Shocked lightning bolts + sweat */}
        {e==="shocked"&&<g>
          {[[20,8],[78,6]].map(([x,y],i)=>(
            <g key={i}><path d={`M ${x} ${y} l 4 8 l -3 0 l 5 10`} stroke={C.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0">
              <animate attributeName="opacity" values="0;1;0;0" dur="0.4s" begin={`${i*0.15}s`} repeatCount="indefinite"/>
            </path></g>
          ))}
          {/* Sweat drops */}
          <ellipse cx="26" cy="34" rx="2" ry="3" fill={C.cyan} opacity="0.5">
            <animate attributeName="cy" values="34;44" dur="0.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.5;0" dur="0.8s" repeatCount="indefinite"/>
          </ellipse>
        </g>}

        {/* Love - floating hearts */}
        {e==="love"&&<g>
          {(
            [
              [18, 22, 0.55, "1.5s", C.red],
              [78, 18, 0.45, "1.8s", C.pink],
              [30, 8, 0.6, "1.3s", C.red],
              [68, 4, 0.5, "1.6s", C.pink],
              [50, -4, 0.7, "1.2s", C.red],
            ] as const
          ).map(([x, y, s, d, c], i) => (
            <g key={i} transform={`translate(${x},${y}) scale(${s})`}>
              <use href={`#${u}hp`} fill={c}>
                <animate attributeName="opacity" values="0;0.9;0" dur={d} begin={`${i * 0.25}s`} repeatCount="indefinite" />
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0;0 -14"
                  dur={d}
                  begin={`${i * 0.25}s`}
                  repeatCount="indefinite"
                />
              </use>
            </g>
          ))}
        </g>}

        {/* Thinking - dots */}
        {e==="thinking"&&<g>
          {[[72,46,3],[78,38,4],[86,28,5.5]].map(([x,y,r],i)=>(
            <circle key={i} cx={x} cy={y} r={r} fill="rgba(125,249,255,0.12)" stroke={C.cyan} strokeWidth="0.8" opacity="0">
              <animate attributeName="opacity" values="0;0.7;0.7;0" dur="2.5s" begin={`${i*0.4}s`} repeatCount="indefinite"/>
            </circle>
          ))}
          <text x="86" y="22" fontSize="10" fill={C.gold} fontFamily="system-ui" opacity="0" fontWeight="700">💡
            <animate attributeName="opacity" values="0;0;0;1;1;0" dur="2.5s" begin="1.2s" repeatCount="indefinite"/>
            <animate attributeName="y" values="22;18;22" dur="1s" begin="1.2s" repeatCount="indefinite"/>
          </text>
        </g>}

        {/* Dizzy spinning stars */}
        {e==="dizzy"&&<g>
          <g><animateTransform attributeName="transform" type="rotate" values="0 50 38;360 50 38" dur="1.2s" repeatCount="indefinite"/>
            {[0,72,144,216,288].map((a,i)=>{
              const r=a*Math.PI/180;
              return <text key={i} x={50+Math.cos(r)*24} y={38+Math.sin(r)*22} fontSize="8" fill={[C.gold,C.cyan,C.pink,C.green,C.orange][i]} textAnchor="middle">✦</text>;
            })}
          </g>
        </g>}

        {/* Celebrate confetti */}
        {e==="celebrate"&&<g>
          {(
            [
              [6, C.red, "0.6s", 10],
              [20, C.gold, "0.8s", 30],
              [34, C.green, "0.5s", 50],
              [48, C.cyan, "0.9s", 70],
              [62, C.purple, "0.7s", 20],
              [76, C.orange, "0.65s", 40],
              [90, C.cyanMid, "0.75s", 60],
            ] as const
          ).map(([x, c, d, rot], i) => (
            <g key={i}>
              <rect x={x} y="2" width="4" height="7" rx="1" fill={c}>
                <animate attributeName="y" values="2;-28;2" dur={d} repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.2;1" dur={d} repeatCount="indefinite" />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values={`${rot} ${x + 2} 5;${rot + 360} ${x + 2} 5`}
                  dur={d}
                  repeatCount="indefinite"
                />
              </rect>
            </g>
          ))}
        </g>}

        {/* ═══ SHADOW ═══ */}
        <ellipse cx="50" cy="114" rx="18" ry="3" fill="#000" opacity="0.12">
          <animate attributeName="rx" values="18;15;18" dur={bSpd} repeatCount="indefinite"/>
        </ellipse>

        {/* ═══ TAIL ═══ */}
        <g>
          <path d={tD} stroke="#3D3555" strokeWidth="6" fill="none" strokeLinecap="round">
            <animate attributeName="d" values={tA} dur={tS} repeatCount="indefinite"/>
          </path>
          <circle cx={tCx} cy={tCy} r="4.5" fill="#4A4458">
            <animate attributeName="r" values="4.5;5.5;4.5" dur={tS} repeatCount="indefinite"/>
          </circle>
          <circle cx={tCx} cy={tCy} r="2" fill="#5A4E6A" opacity="0.5"/>
        </g>

        {/* ═══ BODY ═══ */}
        <g filter={`url(#${u}sh)`}>
          <ellipse cx="50" cy="82" rx="24" ry="28" fill={`url(#${u}sg)`} stroke="#4FC3F7" strokeWidth="0.8" strokeOpacity="0.3">
            <animate attributeName="ry" values={bRy} dur={bSpd} repeatCount="indefinite"/>
            <animate attributeName="rx" values={bRx} dur={bSpd} repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="50" cy="85" rx="14" ry="16" fill={`url(#${u}cb)`} opacity="0.25"/>
          <ellipse cx="50" cy="60" rx="22" ry="5" fill="#3D3555" stroke={C.cyan} strokeWidth="0.6" strokeOpacity="0.4">
            <animate attributeName="strokeOpacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite"/>
          </ellipse>
          <text x="50" y="80" textAnchor="middle" fontSize="5" fontWeight="800" fill={C.cyan} opacity="0.6" fontFamily="system-ui" letterSpacing="0.1em">★ ASTROPET</text>
        </g>

        {/* ═══ LEFT ARM ═══ */}
        <g>
          <path d={la} stroke="#3D3555" strokeWidth="7" strokeLinecap="round" fill="none">
            {e==="wave"&&<animate attributeName="d" values="M 28 72 Q 12 55 10 38;M 28 72 Q 6 48 2 30;M 28 72 Q 14 58 14 44;M 28 72 Q 12 55 10 38" dur="0.45s" repeatCount="indefinite"/>}
            {e==="farewell"&&<animate attributeName="d" values="M 28 72 Q 12 55 10 38;M 28 72 Q 8 50 4 32;M 28 72 Q 14 58 14 44;M 28 72 Q 12 55 10 38" dur="1.2s" repeatCount="indefinite"/>}
            {e==="greeting"&&<animate attributeName="d" values="M 28 72 Q 6 52 0 36;M 28 72 Q 2 44 -6 26;M 28 72 Q 8 56 6 40;M 28 72 Q 6 52 0 36" dur="0.55s" repeatCount="indefinite"/>}
            {e==="enthusiasm"&&<animate attributeName="d" values="M 28 72 Q 8 48 4 30;M 28 72 Q 2 38 -4 18;M 28 72 Q 12 52 10 36;M 28 72 Q 8 48 4 30" dur="0.22s" repeatCount="indefinite"/>}
            {e==="shocked"&&<animate attributeName="d" values="M 28 72 Q 6 56 0 42;M 28 72 Q 4 52 -4 36;M 28 72 Q 6 56 0 42" dur="0.15s" repeatCount="indefinite"/>}
            {e==="confused"&&<animate attributeName="d" values="M 28 72 Q 14 58 18 48;M 28 72 Q 12 56 16 44;M 28 72 Q 14 58 18 48" dur="2s" repeatCount="indefinite"/>}
            {e==="sleepy"&&<animate attributeName="d" values="M 28 72 Q 20 84 22 94;M 28 72 Q 22 86 24 96;M 28 72 Q 20 84 22 94" dur="4s" repeatCount="indefinite"/>}
            {!["wave","farewell","greeting","enthusiasm","shocked","confused","sleepy","reading","love","thinking"].includes(e)&&
              <animate attributeName="d" values={`${la};${la.replace(/82/g,"84").replace(/92/g,"94")};${la}`} dur="3.5s" repeatCount="indefinite"/>
            }
          </path>
          <circle cx={lp[0]} cy={lp[1]} r="5" fill="#4A4458" stroke="#E8D5BE" strokeWidth="1.2">
            {armUp&&<animate attributeName="cy" values={`${lp[1]};${lp[1]-6};${lp[1]}`} dur={armSp} repeatCount="indefinite"/>}
          </circle>
          <g opacity="0.5"><circle cx={lp[0]-1.5} cy={lp[1]-2} r="1.1" fill="#FFB0B8"/><circle cx={lp[0]+1.5} cy={lp[1]-2} r="1.1" fill="#FFB0B8"/><circle cx={lp[0]} cy={lp[1]-3.5} r="0.9" fill="#FFB0B8"/></g>
        </g>

        {/* ═══ RIGHT ARM ═══ */}
        <g>
          <path d={ra} stroke="#3D3555" strokeWidth="7" strokeLinecap="round" fill="none">
            {e==="greeting"&&<animate attributeName="d" values="M 72 72 Q 94 52 100 36;M 72 72 Q 98 44 106 26;M 72 72 Q 90 56 94 40;M 72 72 Q 94 52 100 36" dur="0.55s" repeatCount="indefinite"/>}
            {e==="enthusiasm"&&<animate attributeName="d" values="M 72 72 Q 92 48 96 30;M 72 72 Q 98 38 104 18;M 72 72 Q 88 52 90 36;M 72 72 Q 92 48 96 30" dur="0.22s" repeatCount="indefinite"/>}
            {e==="farewell"&&<animate attributeName="d" values="M 72 72 Q 88 55 90 40;M 72 72 Q 92 50 96 34;M 72 72 Q 86 58 86 46;M 72 72 Q 88 55 90 40" dur="1.2s" repeatCount="indefinite"/>}
            {e==="shocked"&&<animate attributeName="d" values="M 72 72 Q 94 56 100 42;M 72 72 Q 96 52 104 36;M 72 72 Q 94 56 100 42" dur="0.15s" repeatCount="indefinite"/>}
            {(e==="point"||e==="excited")&&<animate attributeName="d" values="M 72 72 Q 88 55 94 40;M 72 72 Q 90 52 96 36;M 72 72 Q 86 58 92 44;M 72 72 Q 88 55 94 40" dur="1s" repeatCount="indefinite"/>}
            {e==="confused"&&<animate attributeName="d" values="M 72 72 Q 82 60 78 48;M 72 72 Q 84 58 80 44;M 72 72 Q 82 60 78 48" dur="2s" repeatCount="indefinite"/>}
            {e==="thinking"&&<animate attributeName="d" values="M 72 72 Q 88 62 90 54;M 72 72 Q 86 60 88 50;M 72 72 Q 88 62 90 54" dur="3s" repeatCount="indefinite"/>}
          </path>
          <circle cx={rp[0]} cy={rp[1]} r="5" fill="#4A4458" stroke="#E8D5BE" strokeWidth="1.2">
            {["point","excited","greeting","farewell","enthusiasm","shocked"].includes(e)&&
              <animate attributeName="cy" values={`${rp[1]};${rp[1]-6};${rp[1]}`} dur={armSp} repeatCount="indefinite"/>}
          </circle>
          <g opacity="0.5"><circle cx={rp[0]-1.5} cy={rp[1]-2} r="1.1" fill="#FFB0B8"/><circle cx={rp[0]+1.5} cy={rp[1]-2} r="1.1" fill="#FFB0B8"/><circle cx={rp[0]} cy={rp[1]-3.5} r="0.9" fill="#FFB0B8"/></g>
          {(e==="point"||e==="sneaky")&&<circle cx={100} cy={e==="sneaky"?48:34} r="2.5" fill={C.gold}>
            <animate attributeName="r" values="2;7;2" dur="0.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.9;0.05;0.9" dur="0.5s" repeatCount="indefinite"/>
          </circle>}
        </g>

        {/* ═══ FEET ═══ */}
        {[38,62].map((cx,i)=>(
          <g key={i}>
            <ellipse cx={cx} cy="108" rx="10" ry="4.5" fill="#2A2240" stroke="#4FC3F7" strokeWidth="0.5" strokeOpacity="0.3">
              {e==="enthusiasm"&&<animate attributeName="cy" values="108;102;108" dur="0.22s" begin={i?"0.11s":"0s"} repeatCount="indefinite"/>}
              {e==="shocked"&&<animate attributeName="cy" values="108;104;108" dur="0.15s" begin={i?"0.08s":"0s"} repeatCount="indefinite"/>}
              {e==="dizzy"&&<animate attributeName="cx" values={`${cx};${cx+(i?2:-2)};${cx}`} dur="0.5s" repeatCount="indefinite"/>}
              <animate attributeName="ry" values="4.5;5.2;4.5" dur={i?"2.8s":"3.2s"} repeatCount="indefinite"/>
            </ellipse>
            <line x1={cx-7} y1="107" x2={cx+7} y2="107" stroke={C.cyan} strokeWidth="0.5" opacity="0.2"/>
          </g>
        ))}

        {/* ═══ HEAD ═══ */}
        <g>
          {/* Head bob + tilt */}
          <animateTransform attributeName="transform" type="translate"
            values={e==="enthusiasm"?"0 0;0 -4;0 3;0 0":e==="shocked"?"0 0;0 -8;0 2;0 0"
              :e==="sleepy"?"0 0;0 2;0 4;0 2;0 0":e==="confused"?"0 0;-2 -1;2 1;0 0"
              :e==="dizzy"?"0 0;-3 -1;3 1;-1 -2;0 0":e==="reading"?"0 0;0 1;0 0"
              :"0 0;0 -2;0 0"}
            dur={e==="enthusiasm"?"0.28s":e==="shocked"?"0.3s":e==="sleepy"?"4s"
              :e==="confused"?"2s":e==="dizzy"?"0.6s":"3s"} repeatCount="indefinite"/>

          {/* Helmet glow */}
          <ellipse cx="50" cy="45" rx="31" ry="29" fill="none" stroke={C.cyan} strokeWidth="1.5" opacity="0.12">
            <animate attributeName="opacity" values="0.12;0.3;0.12" dur="3s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="50" cy="48" rx="28" ry="26" fill={`url(#${u}hg)`} stroke={C.cyan} strokeWidth="0.8" opacity="0.5"/>
          {/* Moving glass reflection */}
          <ellipse cx="36" cy="34" rx="8" ry="4" fill="white" opacity="0.04" transform="rotate(-25,36,34)">
            <animate attributeName="cx" values="36;44;36" dur="5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.04;0.1;0.04" dur="5s" repeatCount="indefinite"/>
          </ellipse>

          <g clipPath={`url(#${u}vc)`}>
            <ellipse cx="50" cy="50" rx="22" ry="20" fill="#4A4458"/>

            {/* Ears with reactive twitching */}
            <g><polygon points="34,28 28,16 40,30" fill="#4A4458"/>
              <polygon points="34,28 30,19 39,30" fill="#FFB0B8" opacity="0.5"/>
              <animateTransform attributeName="transform" type="rotate"
                values={e==="shocked"?"0 34 28;-12 34 28;0 34 28":"0 34 28;-7 34 28;0 34 28;0 34 28;0 34 28;0 34 28"}
                dur={e==="shocked"?"0.2s":"3.5s"} repeatCount="indefinite"/>
            </g>
            <g><polygon points="66,28 72,16 60,30" fill="#4A4458"/>
              <polygon points="66,28 70,19 61,30" fill="#FFB0B8" opacity="0.5"/>
              <animateTransform attributeName="transform" type="rotate"
                values={e==="shocked"?"0 66 28;12 66 28;0 66 28":"0 66 28;0 66 28;0 66 28;7 66 28;0 66 28;0 66 28"}
                dur={e==="shocked"?"0.2s":"4s"} repeatCount="indefinite"/>
            </g>

            {/* Tabby stripes */}
            <path d="M 44 34 L 50 30 L 56 34" stroke="#3A3050" strokeWidth="1.5" fill="none" opacity="0.5"/>

            {/* Cheeks with emotion reactivity */}
            {[36,64].map((cx,i)=>(
              <circle key={i} cx={cx} cy="56" r="6" fill="#FFB0B8"
                opacity={["laughing","celebrate","excited","greeting","enthusiasm","love","shocked"].includes(e)?"0.4":"0.18"}>
                <animate attributeName="r" values={["enthusiasm","shocked","love"].includes(e)?"6;9;6":"6;7;6"}
                  dur={e==="enthusiasm"?"0.28s":e==="shocked"?"0.3s":"2.5s"} repeatCount="indefinite"/>
                {["laughing","celebrate","enthusiasm","greeting","love"].includes(e)&&
                  <animate attributeName="opacity" values="0.4;0.65;0.4" dur="0.5s" repeatCount="indefinite"/>}
              </circle>
            ))}

            {/* ─── EYES ─── */}
            {[40,60].map((cx,i)=>{
              const ey2=i?ey.ry:ey.ly;
              return(<g key={i}>
                <ellipse cx={cx} cy={ey2} rx="7" ry={7*ey.s} fill="#1A1A2E" opacity="0.25"/>
                <ellipse cx={cx} cy={ey2} rx="5.5" ry={5.5*ey.s} fill="#1A1A2E">
                  {/* Double blink */}
                  <animate attributeName="ry"
                    values={`${5.5*ey.s};0.3;${5.5*ey.s};${5.5*ey.s};0.3;${5.5*ey.s};${5.5*ey.s};${5.5*ey.s};${5.5*ey.s};${5.5*ey.s}`}
                    dur={e==="sleepy"?"2.5s":"4.5s"} repeatCount="indefinite"/>
                </ellipse>
                {/* Shocked eye pop */}
                {e==="shocked"&&<>
                  <ellipse cx={cx} cy={ey2} rx="6.5" ry={6.5*ey.s} fill="none" stroke="#1A1A2E" strokeWidth="1">
                    <animate attributeName="rx" values="6.5;8;6.5" dur="0.3s" repeatCount="indefinite"/>
                    <animate attributeName="ry" values={`${6.5*ey.s};${8*ey.s};${6.5*ey.s}`} dur="0.3s" repeatCount="indefinite"/>
                  </ellipse>
                </>}
              </g>);
            })}

            {/* Pupils */}
            {ey.s>0.3&&<>
              {e==="enthusiasm"?[40,60].map((cx,i)=>(
                <text key={i} x={cx+ey.px} y={(i?ey.ry:ey.ly)+2.5} textAnchor="middle" fontSize="8" fill={C.gold}>★
                  <animate attributeName="font-size" values="8;11;8" dur="0.28s" repeatCount="indefinite"/>
                  <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${(i?ey.ry:ey.ly)+2};20 ${cx} ${(i?ey.ry:ey.ly)+2};-20 ${cx} ${(i?ey.ry:ey.ly)+2};0 ${cx} ${(i?ey.ry:ey.ly)+2}`} dur="0.5s" repeatCount="indefinite"/>
                </text>
              )):e==="love"?[40,60].map((cx,i)=>(
                <text key={i} x={cx+ey.px} y={(i?ey.ry:ey.ly)+3} textAnchor="middle" fontSize="9" fill={C.red}>♥
                  <animate attributeName="font-size" values="9;11;9" dur="0.8s" repeatCount="indefinite"/>
                </text>
              )):e==="dizzy"?[40,60].map((cx,i)=>(
                <g key={i}><animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${(i?ey.ry:ey.ly)};360 ${cx} ${(i?ey.ry:ey.ly)}`} dur="1s" repeatCount="indefinite"/>
                  <text x={cx} y={(i?ey.ry:ey.ly)+2} textAnchor="middle" fontSize="6" fill={C.gold}>✕</text>
                </g>
              )):[40,60].map((cx,i)=>{
                const eyy=(i?ey.ry:ey.ly)+ey.py;
                return(<g key={i}>
                  <ellipse cx={cx+ey.px} cy={eyy} rx="1.8" ry={4*ey.s} fill={C.cyan} opacity="0.7"/>
                  {/* Pupil idle wander */}
                  {!["point","sneaky","reading","thinking","confused"].includes(e)&&
                    <animateTransform attributeName="transform" type="translate" values="0 0;1.2 -0.8;-0.5 0.5;0 0" dur="5s" repeatCount="indefinite"/>}
                </g>);
              })}
              {/* Eye shine */}
              {!["dizzy"].includes(e)&&[42,62].map((cx,i)=>(
                <circle key={i} cx={cx+ey.px} cy={(i?ey.ry:ey.ly)-2.5} r="2" fill="white" opacity="0.9">
                  <animate attributeName="r" values="2;2.5;2" dur="2.5s" repeatCount="indefinite"/>
                </circle>
              ))}
            </>}

            {/* Farewell tears */}
            {e==="farewell"&&<g>
              <ellipse cx="67" cy="56" rx="1.5" ry="2.5" fill={C.cyan} opacity="0.7">
                <animate attributeName="cy" values="56;68" dur="2s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite"/>
              </ellipse>
              <ellipse cx="34" cy="58" rx="1" ry="2" fill={C.cyan} opacity="0">
                <animate attributeName="cy" values="58;70" dur="2.5s" begin="0.8s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0;0.5;0" dur="2.5s" begin="0.8s" repeatCount="indefinite"/>
              </ellipse>
            </g>}

            {/* Nose wiggle */}
            <ellipse cx="50" cy="57" rx="2.5" ry="2" fill={`url(#${u}np)`}>
              <animate attributeName="cx" values="50;50.5;49.5;50" dur="4s" repeatCount="indefinite"/>
              <animate attributeName="ry" values="2;2.3;2" dur="4s" repeatCount="indefinite"/>
            </ellipse>

            {/* 6 whiskers with bounce */}
            <g stroke="#8A7FA0" strokeWidth="0.8" opacity="0.5">
              {[[28,54,42,57,-1],[26,58,42,59.5,0],[30,62,42,61,1],[58,57,72,54,1],[58,59.5,74,58,0],[58,61,70,62,-1]].map(([x1,y1,x2,y2,d],i)=>(
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}>
                  <animate attributeName="y1" values={`${y1};${y1+d*2};${y1}`} dur={`${2.5+i*0.3}s`} repeatCount="indefinite"/>
                  <animate attributeName="x1" values={`${x1};${x1+(x1<50?-2:2)};${x1}`} dur={`${3+i*0.2}s`} repeatCount="indefinite"/>
                </line>
              ))}
            </g>

            {/* Mouth */}
            <path d={mo} stroke="#1A1A2E" strokeWidth="1.5" fill={mFill?"#FF8A80":"none"} strokeLinecap="round">
              {isTalking&&!["laughing","celebrate","greeting","enthusiasm","shocked","sleepy"].includes(e)&&
                <animate attributeName="d" values={`${mo};M 46 63 Q 50 60 54 63;M 45 64 Q 50 68 55 64;${mo}`} dur="0.28s" repeatCount="indefinite"/>}
              {!isTalking&&!mFill&&<animate attributeName="d" values={`${mo};${mo.replace(/67/g,"68")};${mo}`} dur="5s" repeatCount="indefinite"/>}
            </path>
            {/* Tongue */}
            {["laughing","enthusiasm","shocked","sleepy"].includes(e)&&
              <ellipse cx={e==="sleepy"?52:50} cy={e==="shocked"?72:e==="sleepy"?66:69} rx={e==="sleepy"?2:3.5} ry={e==="sleepy"?1.5:2.5} fill="#FF6B6B" opacity="0.7">
                <animate attributeName="ry" values={e==="enthusiasm"?"2.5;3.5;2.5":e==="shocked"?"2.5;4;2.5":"2.5;3;2.5"} dur={e==="enthusiasm"?"0.28s":"0.8s"} repeatCount="indefinite"/>
              </ellipse>}

            {/* Glasses */}
            {e==="reading"&&<g opacity="0.65">
              <circle cx="40" cy="52" r="8" fill="none" stroke={C.cyanDark} strokeWidth="1.3"/>
              <circle cx="60" cy="52" r="8" fill="none" stroke={C.cyanDark} strokeWidth="1.3"/>
              <line x1="48" y1="52" x2="52" y2="52" stroke={C.cyanDark} strokeWidth="1.3"/>
              <ellipse cx="37" cy="49" rx="3" ry="1.5" fill="white" opacity="0.08"/>
            </g>}

            {/* Eyebrows per emotion */}
            {e==="sneaky"&&<>{[["33","44"],["67","56"]].map(([x1,x2],i)=>(
              <line key={i} x1={x1} y1="43" x2={x2} y2="46" stroke="#2D2640" strokeWidth="2.2" strokeLinecap="round">
                <animate attributeName="y2" values="46;44.5;46" dur="2.5s" repeatCount="indefinite"/>
              </line>))}</>}
            {["greeting","enthusiasm"].includes(e)&&<>{[["34","44"],["66","56"]].map(([x1,x2],i)=>(
              <line key={i} x1={x1} y1="40" x2={x2} y2="41" stroke="#2D2640" strokeWidth="1.5" strokeLinecap="round">
                <animate attributeName="y1" values="40;36;40" dur={e==="enthusiasm"?"0.28s":"0.7s"} repeatCount="indefinite"/>
              </line>))}</>}
            {e==="farewell"&&<>{[["34","44"],["66","56"]].map(([x1,x2],i)=>(
              <line key={i} x1={x1} y1="44" x2={x2} y2="42" stroke="#2D2640" strokeWidth="1.5" strokeLinecap="round"/>))}</>}
            {e==="confused"&&<>
              <line x1="34" y1="42" x2="44" y2="40" stroke="#2D2640" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="66" y1="40" x2="56" y2="42" stroke="#2D2640" strokeWidth="1.5" strokeLinecap="round"/>
            </>}
            {e==="shocked"&&<>{[["32","44"],["68","56"]].map(([x1,x2],i)=>(
              <line key={i} x1={x1} y1="38" x2={x2} y2="40" stroke="#2D2640" strokeWidth="2" strokeLinecap="round">
                <animate attributeName="y1" values="38;34;38" dur="0.3s" repeatCount="indefinite"/>
              </line>))}</>}
            {e==="love"&&<>{[["34","44"],["66","56"]].map(([x1,x2],i)=>(
              <line key={i} x1={x1} y1="41" x2={x2} y2="42" stroke="#2D2640" strokeWidth="1.2" strokeLinecap="round">
                <animate attributeName="y1" values="41;39;41" dur="1.5s" repeatCount="indefinite"/>
              </line>))}</>}
          </g>

          {/* ═══ ANTENNA ═══ */}
          <g>
            <line x1="50" y1="22" x2="50" y2="4" stroke={C.cyanMid} strokeWidth="1.5" strokeLinecap="round">
              <animate attributeName="x2" values="50;54;46;50" dur={e==="shocked"?"0.3s":"2.8s"} repeatCount="indefinite"/>
              <animate attributeName="y2" values="4;3;5;4" dur="2.8s" repeatCount="indefinite"/>
            </line>
            <circle cx="50" cy="3" r="4"
              fill={e==="farewell"?C.cyan:e==="enthusiasm"?C.red:e==="love"?C.pink:e==="shocked"?C.gold:e==="sleepy"?"#8A7FA0":C.gold}
              filter={`url(#${u}gl)`}>
              <animate attributeName="cx" values="50;54;46;50" dur={e==="shocked"?"0.3s":"2.8s"} repeatCount="indefinite"/>
              <animate attributeName="r" values={e==="enthusiasm"||e==="shocked"?"4;6;4":"4;5;4"}
                dur={e==="enthusiasm"?"0.28s":e==="shocked"?"0.2s":"2s"} repeatCount="indefinite"/>
            </circle>
            <circle cx="50" cy="2" r="1.5" fill="white" opacity="0.4">
              <animate attributeName="cx" values="50;54;46;50" dur="2.8s" repeatCount="indefinite"/>
            </circle>
            {/* Signal rings */}
            {[1,2].map(n=>(
              <circle key={n} cx="50" cy="3" r={6+n*5} fill="none"
                stroke={e==="enthusiasm"?C.red:e==="love"?C.pink:C.gold} strokeWidth="0.5" opacity="0">
                <animate attributeName="cx" values="50;54;46;50" dur="2.8s" repeatCount="indefinite"/>
                <animate attributeName="r" values={`${6+n*5};${12+n*6};${6+n*5}`} dur={`${1.2+n*0.4}s`} repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0;0.2;0" dur={`${1.2+n*0.4}s`} repeatCount="indefinite"/>
              </circle>
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
