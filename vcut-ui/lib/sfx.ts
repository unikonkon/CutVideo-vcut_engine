// เสียงเอฟเฟกต์ตัวอย่าง 10 เสียง — ไฟล์สังเคราะห์อยู่ใน public/sfx/
// ตอนใช้ครั้งแรกถูกอัปโหลดเข้าโฟลเดอร์ assets ของโปรเจกต์ให้เอง (ผ่าน /api/asset)
// จากนั้นก็เป็นแทร็กเพลงธรรมดาในสายตาเอนจิน (loop/duck ปิด) — mix ด้วย amix ตามปกติ

export interface SfxDef {
  file: string;
  label: string;
  dur: number; // ความยาวจริงของไฟล์ (วินาที)
}

export const SFX_LIST: SfxDef[] = [
  { file: "sfx-whoosh.m4a", label: "วูช", dur: 0.9 },
  { file: "sfx-swish.m4a", label: "สวิช", dur: 0.35 },
  { file: "sfx-ding.m4a", label: "ติ๊ง", dur: 1.3 },
  { file: "sfx-pop.m4a", label: "ป๊อป", dur: 0.25 },
  { file: "sfx-click.m4a", label: "คลิก", dur: 0.12 },
  { file: "sfx-boom.m4a", label: "บูม", dur: 1.4 },
  { file: "sfx-riser.m4a", label: "ไรเซอร์", dur: 1.6 },
  { file: "sfx-chime.m4a", label: "ไชม์", dur: 1.8 },
  { file: "sfx-laser.m4a", label: "เลเซอร์", dur: 0.4 },
  { file: "sfx-success.m4a", label: "สำเร็จ", dur: 1.2 },
];

export const sfxUrl = (file: string) => `/sfx/${file}`;
