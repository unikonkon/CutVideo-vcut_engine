// เสียงเอฟเฟกต์ตัวอย่าง 30 เสียง 6 หมวด — ไฟล์สังเคราะห์อยู่ใน public/sfx/
// ตอนใช้ครั้งแรกถูกอัปโหลดเข้าโฟลเดอร์ assets ของโปรเจกต์ให้เอง (ผ่าน /api/asset)
// จากนั้นก็เป็นแทร็กเพลงธรรมดาในสายตาเอนจิน (duck ปิด) — mix ด้วย amix ตามปกติ

export type SfxCat =
  | "transition"
  | "impact"
  | "ui"
  | "cartoon"
  | "ambience"
  | "stinger";

export const SFX_CATS: { key: SfxCat; label: string }[] = [
  { key: "transition", label: "เปลี่ยนฉาก" },
  { key: "impact", label: "อิมแพกต์" },
  { key: "ui", label: "UI / แจ้งเตือน" },
  { key: "cartoon", label: "การ์ตูน" },
  { key: "ambience", label: "บรรยากาศ" },
  { key: "stinger", label: "ดนตรีสั้น" },
];

export interface SfxDef {
  file: string;
  label: string;
  dur: number; // ความยาวจริงของไฟล์ (วินาที)
  cat: SfxCat;
  loop?: boolean; // เสียงบรรยากาศวนซ้ำได้ — ยืดบล็อกบนไทม์ไลน์แล้วเล่นต่อเนื่อง
}

export const SFX_LIST: SfxDef[] = [
  // เปลี่ยนฉาก
  { file: "sfx-whoosh.m4a", label: "วูช", dur: 0.9, cat: "transition" },
  { file: "sfx-swish.m4a", label: "สวิช", dur: 0.35, cat: "transition" },
  { file: "sfx-riser.m4a", label: "ไรเซอร์", dur: 1.6, cat: "transition" },
  { file: "sfx-sweep.m4a", label: "กวาดลง", dur: 1.0, cat: "transition" },
  { file: "sfx-zoom.m4a", label: "ซูม", dur: 0.35, cat: "transition" },
  // อิมแพกต์
  { file: "sfx-boom.m4a", label: "บูม", dur: 1.4, cat: "impact" },
  { file: "sfx-thud.m4a", label: "ตุบ", dur: 0.35, cat: "impact" },
  { file: "sfx-slam.m4a", label: "กระแทก", dur: 0.5, cat: "impact" },
  { file: "sfx-rumble.m4a", label: "สั่นสะเทือน", dur: 2.2, cat: "impact" },
  { file: "sfx-tom.m4a", label: "ดัมม์", dur: 0.5, cat: "impact" },
  // UI / แจ้งเตือน
  { file: "sfx-click.m4a", label: "คลิก", dur: 0.12, cat: "ui" },
  { file: "sfx-pop.m4a", label: "ป๊อป", dur: 0.25, cat: "ui" },
  { file: "sfx-ding.m4a", label: "ติ๊ง", dur: 1.3, cat: "ui" },
  { file: "sfx-notify.m4a", label: "แจ้งเตือน", dur: 0.6, cat: "ui" },
  { file: "sfx-success.m4a", label: "สำเร็จ", dur: 1.2, cat: "ui" },
  // การ์ตูน
  { file: "sfx-boing.m4a", label: "โบอิ้ง", dur: 1.0, cat: "cartoon" },
  { file: "sfx-slideup.m4a", label: "สไลด์ขึ้น", dur: 0.8, cat: "cartoon" },
  { file: "sfx-slidedown.m4a", label: "สไลด์ลง", dur: 0.8, cat: "cartoon" },
  { file: "sfx-bounce.m4a", label: "เด้ง", dur: 0.9, cat: "cartoon" },
  { file: "sfx-wah.m4a", label: "หยอด", dur: 1.0, cat: "cartoon" },
  // บรรยากาศ (วนซ้ำ — ยืดบล็อกได้ตามใจ)
  { file: "sfx-wind.m4a", label: "ลม", dur: 4.0, cat: "ambience", loop: true },
  { file: "sfx-rain.m4a", label: "ฝน", dur: 4.0, cat: "ambience", loop: true },
  { file: "sfx-waves.m4a", label: "คลื่นทะเล", dur: 5.0, cat: "ambience", loop: true },
  { file: "sfx-birds.m4a", label: "นกร้อง", dur: 3.5, cat: "ambience", loop: true },
  { file: "sfx-crickets.m4a", label: "กลางคืน", dur: 4.0, cat: "ambience", loop: true },
  // ดนตรีสั้น
  { file: "sfx-chime.m4a", label: "ไชม์", dur: 1.8, cat: "stinger" },
  { file: "sfx-bell.m4a", label: "ระฆัง", dur: 3.0, cat: "stinger" },
  { file: "sfx-laser.m4a", label: "เลเซอร์", dur: 0.4, cat: "stinger" },
  { file: "sfx-harp.m4a", label: "พิณ", dur: 1.8, cat: "stinger" },
  { file: "sfx-outro.m4a", label: "จบเพลง", dur: 2.2, cat: "stinger" },
];

export const sfxUrl = (file: string) => `/sfx/${file}`;
