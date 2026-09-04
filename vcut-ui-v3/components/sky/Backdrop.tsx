// พื้นหลังของทุกหน้า — ฟ้าค่ำไล่โทน · ดาวจาง · แสงอุ่นขอบฟ้า · แนวสนเงา 3 ชั้น + หมอก · เกรนฟิล์ม
//
// วาดจากโค้ดตัวเดียวกับ mockup v6 (gen_v6.py: treeline/stars) เลขสุ่มคงที่ (seed) จึงเหมือน
// เดิมทุกครั้ง  ต้นไม้เตี้ยลงตรงกลาง (dip) ให้แถวปุ่มด้านล่างโล่ง  ไม่มี state ไม่มี
// event — เป็น server component ได้ เรนเดอร์ครั้งเดียว

const W = 1440;
const H = 260;

/** ตัวสุ่มคงที่ (mulberry32) — เลขชุดเดิมทุกครั้งที่เรนเดอร์ */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pine(cx: number, base: number, h: number, w: number) {
  const pts: [number, number][] = [
    [cx - w / 2, base],
    [cx - w * 0.34, base - h * 0.33],
    [cx - w * 0.4, base - h * 0.33],
    [cx - w * 0.22, base - h * 0.62],
    [cx - w * 0.27, base - h * 0.62],
    [cx, base - h],
    [cx + w * 0.27, base - h * 0.62],
    [cx + w * 0.22, base - h * 0.62],
    [cx + w * 0.4, base - h * 0.33],
    [cx + w * 0.34, base - h * 0.33],
    [cx + w / 2, base],
  ];
  return pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ");
}

function treeline(seed: number, color: string, base: number, hmin: number, hmax: number, step: number, opacity: number, dip: number) {
  const r = rng(seed);
  const polys: string[] = [];
  let x = -30;
  while (x < W + 40) {
    let h = hmin + r() * (hmax - hmin);
    const t = Math.abs(x - W / 2) / (W / 2);
    h *= 1 - dip * Math.max(0, 1 - t * t * 1.6);
    const w = h * (0.42 + r() * 0.16);
    polys.push(pine(x, base, h, w));
    x += step * (0.55 + r() * 0.7);
  }
  return (
    <g fill={color} opacity={opacity}>
      {polys.map((p, i) => (
        <polygon key={i} points={p} />
      ))}
      <rect x="0" y={base - 1} width={W} height={H - base + 1} />
    </g>
  );
}

function stars(seed: number, n = 26) {
  const r = rng(seed);
  const out: { x: number; y: number; rr: number; o: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: r() * W, y: 8 + r() * 202, rr: [0.7, 0.9, 1.2][Math.floor(r() * 3)], o: 0.25 + r() * 0.35 });
  }
  return out;
}

export default function Backdrop() {
  const st = stars(5);
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none", background: "linear-gradient(180deg,var(--sky-0) 0%,var(--sky-1) 34%,var(--sky-2) 62%,var(--sky-3) 82%,var(--sky-4) 100%)" }}>
      {/* ดาว */}
      <svg viewBox={`0 0 ${W} 220`} preserveAspectRatio="xMidYMin slice" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "auto", minWidth: W }}>
        {st.map((s, i) => (
          <circle key={i} cx={s.x.toFixed(0)} cy={s.y.toFixed(0)} r={s.rr} fill="#f0f4ea" opacity={s.o.toFixed(2)} />
        ))}
      </svg>
      {/* แสงอุ่นขอบฟ้า */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: "radial-gradient(70% 70% at 50% 100%,rgba(255,186,110,.22),rgba(255,186,110,0) 70%)" }} />
      {/* แนวสน 3 ชั้น + หมอก */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: H }}>
        <defs>
          <linearGradient id="vcut-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfe6dc" stopOpacity="0" />
            <stop offset=".5" stopColor="#cfe6dc" stopOpacity=".10" />
            <stop offset="1" stopColor="#cfe6dc" stopOpacity="0" />
          </linearGradient>
        </defs>
        {treeline(11, "#2a5f5c", 214, 34, 78, 24, 0.62, 0.25)}
        <rect x="0" y="176" width={W} height="84" fill="url(#vcut-mist)" />
        {treeline(23, "#173f36", 236, 52, 118, 32, 1, 0.4)}
        {treeline(37, "#0a2620", 260, 70, 160, 44, 1, 0.62)}
      </svg>
      {/* เกรนฟิล์ม */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, mixBlendMode: "overlay" }}>
        <filter id="vcut-grain">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vcut-grain)" />
      </svg>
    </div>
  );
}
