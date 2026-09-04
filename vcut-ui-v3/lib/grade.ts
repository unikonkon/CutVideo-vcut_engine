// โทนสีของขั้น 5 บนจอตัวอย่าง — ทำด้วยฟิลเตอร์ SVG ไม่ใช่ CSS filter สำเร็จรูป
//
// **ทำไมไม่ใช้ CSS filter อย่าง sepia()/hue-rotate()**
//
// สิ่งที่ ffmpeg ทำจริงคือ colorbalance (บวก/ลบทีละช่อง) กับ eq (contrast ·
// saturation) ซึ่งเป็นการแปลงเชิงเส้นบนค่า R/G/B ตรง ๆ  ส่วน sepia() ของ CSS
// เป็นเมทริกซ์ตายตัวที่ดันทุกสีเข้าหาน้ำตาลก่อน แล้ว hue-rotate หมุนวงล้อสีทั้ง
// วง — เอามาผสมกันให้ "ดูอุ่นขึ้น" ได้ก็จริง แต่มันคนละการแปลงกับที่จะออกมาใน
// ไฟล์ ภาพที่มีฟ้ากับผิวคนอยู่ในเฟรมเดียวกันจะเพี้ยนคนละทางกับของจริง
//
// feColorMatrix กับ feComponentTransfer แปลงตรงตัวได้ทั้งคู่ และ SVG ต่อ
// primitive เป็นลูกโซ่ได้เหมือนที่ ffmpeg ต่อฟิลเตอร์ด้วยจุลภาค — โครงจึงเป็น
// ตัวเดียวกัน อ่านเทียบกันได้ทีละบรรทัด
//
// ที่มา: vcut_engine/fx.py → GRADE_VF
//
// ยังเป็นการประมาณอยู่สองจุด ซึ่งยอมรับได้เพราะมันเล็กกว่าที่ตาจับได้บนจอ
// ตัวอย่างขนาดฝ่ามือ: (1) colorbalance ของ ffmpeg ถ่วงน้ำหนักเงา/กลาง/ไฮไลต์
// ไม่เท่ากันตามความสว่างของพิกเซล ที่นี่รวบเป็นค่าคงที่ชุดเดียว  (2) gamma ของ
// eq ทำในปริภูมิเชิงเส้น ที่นี่ทำบน sRGB ตรง ๆ ผ่าน feComponentTransfer

export interface GradeStep {
  /** เมทริกซ์ 4×5 ของ feColorMatrix type="matrix" */
  matrix?: number[];
  /** ค่าอิ่มสีของ feColorMatrix type="saturate" */
  saturate?: number;
  /** เลขชี้กำลังของ feComponentTransfer type="gamma" */
  gamma?: number;
}

/** slope/intercept ของ eq=contrast=c — ffmpeg หมุนรอบจุดกึ่งกลาง 0.5 */
function contrast(c: number): number[] {
  const b = 0.5 - 0.5 * c;
  return [c, 0, 0, 0, b, 0, c, 0, 0, b, 0, 0, c, 0, b, 0, 0, 0, 1, 0];
}

/** colorbalance — บวกค่าคงที่ทีละช่อง (รวบเงา/กลาง/ไฮไลต์เป็นชุดเดียว) */
function balance(r: number, g: number, b: number): number[] {
  return [1, 0, 0, 0, r, 0, 1, 0, 0, g, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
}

/** ลูกโซ่ฟิลเตอร์ของแต่ละโทน — เรียงตามลำดับเดียวกับใน GRADE_VF เป๊ะ */
export const GRADE_STEPS: Record<string, GradeStep[]> = {
  // colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:bm=-0.04 , eq=saturation=1.06
  warm: [{ matrix: balance(0.05, 0.005, -0.05) }, { saturate: 1.06 }],
  // colorbalance=rs=-0.06:bs=0.07:rm=-0.03:bm=0.05 , eq=saturation=1.02
  cool: [{ matrix: balance(-0.045, 0, 0.06) }, { saturate: 1.02 }],
  // eq=contrast=1.12:saturation=1.20:gamma=0.98
  punch: [{ matrix: contrast(1.12) }, { saturate: 1.2 }, { gamma: 0.98 }],
  // eq=contrast=0.92:saturation=0.88
  flat: [{ matrix: contrast(0.92) }, { saturate: 0.88 }],
  // hue=s=0 , eq=contrast=1.08
  bw: [{ saturate: 0 }, { matrix: contrast(1.08) }],
};

/** id ของฟิลเตอร์ในหน้า — ใช้ทั้งตอนประกาศ <filter> และตอนอ้างด้วย url(#…) */
export const gradeFilterId = (name: string) => `vcut-grade-${name}`;

/** ค่า CSS filter ของโทนนี้ · "" = ไม่แตะสี (รวมถึงชื่อโทนที่ไม่รู้จัก) */
export function gradeFilter(name: string | undefined): string {
  return name && GRADE_STEPS[name] ? `url(#${gradeFilterId(name)})` : "";
}
