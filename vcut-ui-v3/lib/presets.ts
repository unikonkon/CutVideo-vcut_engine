// ตัวช่วยของชุดสไตล์ข้อความ — ใช้ร่วมกันระหว่างแผงข้อความกับการ์ดลอย
//
// อยู่ที่นี่เพราะ "สร้างชุดจากชิ้นนี้" กดได้จากสองที่แล้ว  ถ้าปล่อยให้แต่ละที่
// ประกอบชุดเอง วันหนึ่งจะได้ชุดที่ลอกค่ามาไม่ครบจากปุ่มหนึ่ง โดยที่อีกปุ่มยังถูก
//
// ส่วนตัว *รวม* ชุดลงชิ้น (resolveLook) อยู่ที่ lib/textfx.ts เพราะมันเป็นสูตร
// ที่ต้องตรงกับเอนจินทีละคีย์ และมีตัวเทียบ (scripts/check_preset.py) คุมอยู่

/** เอาเฉพาะช่องหน้าตาออกมาจากข้อความหรือชุด
 *
 *  `keys` มาจากเอนจิน (defaults.preset_keys) ไม่ใช่ค่าคงที่ฝั่งนี้ — วันที่มีคน
 *  เติมช่องใหม่ลงชุด หน้าเว็บตามทันเองโดยไม่ต้องแก้ไฟล์นี้
 */
export function lookOf(
  src: object,
  keys: readonly string[],
): Record<string, unknown> {
  const from = src as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (from[k] !== undefined) out[k] = from[k];
  return out;
}

/** ชื่อชุดที่ยังไม่ถูกใช้ — เติมเลขต่อท้ายจนกว่าจะว่าง
 *  ชื่อซ้ำถูกเอนจินตัดทิ้งตอนอ่าน (fx._preset_list) ปล่อยให้ตั้งซ้ำได้จึงเท่ากับ
 *  กดสร้างแล้วชุดหายไปเงียบ ๆ ตอนบันทึก */
export function uniqueName(want: string, taken: Set<string>) {
  const base = want.trim() || "ชุดใหม่";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** ชื่อชุดที่จะตั้งให้อัตโนมัติเมื่อสร้างจากข้อความชิ้นหนึ่ง */
export function nameFromText(text: string) {
  return text.trim().split("\n")[0].slice(0, 20);
}
