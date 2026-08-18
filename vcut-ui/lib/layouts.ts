// ขนาดหนัง (layout) ยอดนิยม — เขียนลง config เป็น video.width/height ผ่าน /api/setup
// ขอบเขตตามเอนจิน: กว้าง 640-3840 · สูง 360-2160 · เลขคู่
// เปลี่ยนแล้วชิ้นที่ตัดไว้ถูก render ใหม่เองตอน Export (ขนาดฝังอยู่ในชื่อแคชของชิ้น)

export interface LayoutPreset {
  ratio: string;
  label: string;
  w: number;
  h: number;
}

export const LAYOUT_GROUPS: { label: string; items: LayoutPreset[] }[] = [
  {
    label: "แนวนอน",
    items: [
      { ratio: "16:9", label: "YouTube · Full HD", w: 1920, h: 1080 },
      { ratio: "16:9", label: "YouTube · 4K", w: 3840, h: 2160 },
      { ratio: "16:9", label: "HD ไฟล์เล็ก", w: 1280, h: 720 },
      { ratio: "21:9", label: "จอกว้าง Ultrawide", w: 2560, h: 1080 },
      { ratio: "2.39:1", label: "หนังโรง Cinemascope", w: 1920, h: 804 },
      { ratio: "4:3", label: "คลาสสิก · ทีวีเก่า", w: 1440, h: 1080 },
    ],
  },
  {
    label: "แนวตั้ง",
    items: [
      { ratio: "9:16", label: "TikTok · Reels · Shorts", w: 1080, h: 1920 },
      { ratio: "9:16", label: "แนวตั้ง HD ไฟล์เล็ก", w: 720, h: 1280 },
      { ratio: "4:5", label: "Instagram โพสต์แนวตั้ง", w: 1080, h: 1350 },
      { ratio: "3:4", label: "แนวตั้งคลาสสิก", w: 1080, h: 1440 },
      { ratio: "2:3", label: "Pinterest", w: 1080, h: 1620 },
    ],
  },
  {
    label: "จัตุรัส",
    items: [
      { ratio: "1:1", label: "Instagram · Facebook", w: 1080, h: 1080 },
      { ratio: "1:1", label: "จัตุรัสไฟล์เล็ก", w: 720, h: 720 },
    ],
  },
];

/** ป้ายสัดส่วนของขนาดใด ๆ — จับคู่ preset ก่อน ไม่เจอค่อยลดเศษส่วนเอง */
export function ratioLabel(w: number, h: number): string {
  for (const g of LAYOUT_GROUPS)
    for (const p of g.items) if (p.w === w && p.h === h) return p.ratio;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(w, h) || 1;
  const rw = w / d;
  const rh = h / d;
  return rw > 40 || rh > 40 ? (w / h).toFixed(2) + ":1" : `${rw}:${rh}`;
}
