// ตัวเลขที่นับขึ้น + ข้อความที่โผล่ทีละคำ — ฝั่งจอตัวอย่าง
//
// **ที่มา: vcut_engine/fxtext.py → _fmt_count · count_steps · stagger_words**
//
// สูตรชุดนี้มีสองชุดโดยตั้งใจ (เอนจินหนึ่ง หน้าเว็บหนึ่ง) เพราะจอตัวอย่างต้อง
// วาดตามเส้นหัวเล่นที่ลากอยู่ ซึ่งเป็นสถานะที่เอนจินไม่รู้จักจนกว่าจะบันทึก
// ความเสี่ยงคือวันหนึ่งสองชุดเพี้ยนจากกัน — กันด้วย scripts/check_text_parity.py
// ที่เทียบผลทีละตัวอักษรกับ Python

/**
 *  ปัดเลขแบบเดียวกับ format(v, ".Nf") ของ Python
 *
 *  สำเนาจาก lib/shapes.ts โดยตั้งใจ ไม่ได้แยกเป็นโมดูลกลาง เพราะตัวเทียบสูตร
 *  (check_shape_parity.py) แปลง shapes.ts เป็น JS แล้ว import ผ่าน data: URL
 *  ซึ่ง resolve import ข้ามไฟล์ไม่ได้ — แยกเมื่อไรตัวเทียบพังทันที
 *
 *  ที่ต้องมีเลย: Python ปัดครึ่งเข้าหาเลขคู่ ส่วน toFixed ปัดครึ่งออกจากศูนย์
 *  1250/1000 = 1.25 → Python ได้ "1.2" · toFixed ได้ "1.3" ซึ่งเป็นเลขกลม ๆ
 *  ที่คนตั้งเป้าใช้จริงตลอด
 */
function pyfmt(v: number, nd: 0 | 1): string {
  const p = nd === 0 ? 1 : 10;
  const tie = nd === 0 ? 2 : 4;
  const a = Math.abs(v);
  let body: string;
  if (Number.isInteger(a * tie) && !Number.isInteger(a * (tie / 2))) {
    const fl = Math.floor(a * p);
    body = ((fl % 2 === 0 ? fl : fl + 1) / p).toFixed(nd);
  } else {
    body = a.toFixed(nd);
  }
  const sign = v < 0 || Object.is(v, -0) ? "-" : "";
  return sign + body;
}

/** คั่นหลักพันด้วยลูกน้ำ — เทียบเท่า f"{v:,.0f}" */
function withCommas(v: number): string {
  const s = pyfmt(v, 0);
  const neg = s.startsWith("-");
  const d = neg ? s.slice(1) : s;
  return (neg ? "-" : "") + d.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** รูปแบบเลขที่ใช้ได้ — ชื่อคีย์ตรงกับ fx.COUNT ของเอนจิน */
export function formatCount(v: number, kind: string): string {
  if (kind === "comma") return withCommas(v);
  if (kind === "k") {
    const a = Math.abs(v);
    if (a >= 1e6) return pyfmt(v / 1e6, 1) + "M";
    if (a >= 1e3) return pyfmt(v / 1e3, 1) + "K";
    return pyfmt(v, 0);
  }
  if (kind === "pct") return pyfmt(v, 0) + "%";
  if (kind === "1dp") return pyfmt(v, 1);
  return pyfmt(v, 0);
}

/**
 *  ค่าที่ควรโชว์ตอนเดินมาถึง p (0–1) ของชิ้น
 *
 *  ชะลอตอนท้ายด้วย 1−(1−p)³ เหมือนเอนจิน — เลขที่วิ่งเร็วเท่ากันจนวินาทีสุดท้าย
 *  อ่านว่า "ยังไม่จบ" ทั้งที่จบแล้ว
 */
export function countValue(p: number, from: number, to: number): number {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
  return from + (to - from) * e;
}

/** เอาเลขไปแทน `{n}` · whole = ไม่มี `{n}` ให้เลขแทนข้อความทั้งก้อน */
export function applyCount(text: string, value: string | null, whole: boolean): string {
  if (value === null) return text;
  if (text.includes("{n}")) return text.split("{n}").join(value);
  return whole ? value : text;
}

/**
 *  ชิ้นนี้มีที่ให้เลขไปลงจริงไหม — การ์ดต้องมี `{n}` ชัด ๆ
 *  (ตรงกับ fxtext.uses_count)
 */
export function usesCount(text: string, lines: { text?: string }[] | undefined): boolean {
  if (lines && lines.length) return lines.some((l) => String(l.text ?? "").includes("{n}"));
  return true;
}

/**
 *  จังหวะของแต่ละคำเป็นมิลลิวินาที — (เริ่มที่ t0, ใช้เวลา d)
 *
 *  แยกออกมาจาก wordStates เพื่อให้ตัวเทียบสูตรถามได้ตรง ๆ ว่าหน้าเว็บคิดจังหวะ
 *  ตรงกับแท็ก \t(...) ที่เอนจินเขียนลงไฟล์ไหม — เทียบจากความทึบที่วาดออกมาต้อง
 *  ย้อนแก้สมการ ซึ่งพลาดง่ายและอ่านไม่ออกว่าอะไรเพี้ยน
 */
export function wordTimings(
  n: number,
  inSec: number,
  durSec: number,
  outSec: number,
): { t0: number; d: number }[] {
  const room0 = durSec * 1000 * 0.9;
  let ti = Math.max(0, inSec * 1000);
  let to = Math.max(0, outSec * 1000);
  if (ti + to > room0 && ti + to > 0) {
    const sc = room0 / (ti + to);
    ti = Math.floor(ti * sc);
    to = Math.floor(to * sc);
  }
  let d = Math.max(60, Math.floor(ti || 180));
  let step = Math.max(40, Math.floor(d * 0.55));
  const room = Math.max(0, durSec * 1000 - to);
  const span = (n - 1) * step + d;
  if (room > 0 && span > room) {
    const sc = room / span;
    d = Math.max(40, Math.floor(d * sc));
    step = Math.max(20, Math.floor(step * sc));
  }
  return Array.from({ length: n }, (_, i) => ({ t0: i * step, d }));
}

export interface WordState {
  w: string;
  /** ความทึบ 0–1 */
  o: number;
  /** อัตราย่อ-ขยาย (1 = ปกติ) */
  s: number;
}

/**
 *  สถานะของแต่ละคำ ณ วินาทีที่ t ของชิ้น — ตรงกับ fxtext.stagger_words
 *
 *  คืนค่าว่างเมื่อไม่ใช่แอนิเมชันแบบทีละคำ ผู้เรียกจะได้วาดแบบเดิมโดยไม่ต้อง
 *  มีทางแยกสองทางในโค้ดวาด
 */
export function wordStates(
  text: string,
  kind: string,
  tSec: number,
  inSec: number,
  durSec: number,
  outSec: number,
): WordState[] | null {
  if (kind !== "pop_words" && kind !== "fade_words") return null;
  const words = text.split(" ").filter((w) => w !== "");
  if (words.length < 2) return null;
  // งบเวลาเดียวกับ _budget ของเอนจิน: หดให้พอดีชิ้นสั้น
  const tm = wordTimings(words.length, inSec, durSec, outSec);
  const ms = tSec * 1000;
  return words.map((w, i) => {
    const { t0, d } = tm[i];
    const p = Math.min(1, Math.max(0, (ms - t0) / Math.max(1, d)));
    if (kind === "fade_words") return { w, o: p, s: 1 };
    // เด้ง: โต 100→112 ครึ่งแรก แล้วกลับมา 100 — ไม่ย่อจาก 58 เพราะบรรทัดที่
    // จัดกลางจะไหลทั้งแถบ (ดูเหตุผลเต็มที่ fxtext.stagger_words)
    const k = 0.62;
    const s = p <= 0 ? 1 : p < k ? 1 + 0.12 * (p / k) : 1 + 0.12 * (1 - (p - k) / (1 - k));
    return { w, o: p, s };
  });
}
