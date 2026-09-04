// เพลงคลอตัวอย่าง 53 ลูป 11 หมวด — ไฟล์สังเคราะห์อยู่ใน public/bgm/
// ปั้นด้วย scripts/gen_bgm.py (numpy ล้วน ไม่มีตัวอย่างเสียงจากที่อื่น) แก้/เพิ่ม
// ได้จากที่นั่น แล้วก๊อปบล็อกแคตตาล็อกที่สคริปต์พิมพ์ท้ายการทำงานมาวางแทน BGM_LIST
//
// เข้าระบบทางเดียวกับเสียงเอฟเฟกต์เป๊ะ: ครั้งแรกที่ใช้ถูกอัปโหลดเข้าโฟลเดอร์
// assets ของโปรเจกต์ (ผ่าน /api/asset) จากนั้นเป็นแทร็กเพลงธรรมดาในสายตาเอนจิน
// ต่างกันแค่ค่าตั้งต้นตอนวาง — เพลงคลอเปิดวนซ้ำ เปิดหลบเสียงพูด และยาวจนจบเรื่อง
// ส่วนเสียงเอฟเฟกต์ยาวเท่าไฟล์ ไม่วน ไม่หลบ (ดู addBgmAt / addSfxAt ใน page.tsx)
//
// **ทุกลูปต่อหัว-ท้ายได้ไม่มีรอยต่อ** — หางเสียงสะท้อนของห้องสุดท้ายถูกพับกลับไป
// ทับหัวลูปตั้งแต่ตอนปั้น ยืดบล็อกบนไทม์ไลน์ยาวแค่ไหนก็ไม่ได้ยินรอยวน

// หกหมวดแรกเรียงตาม *อารมณ์เพลง* ใช้ได้กับหนังทุกแบบ · ห้าหมวดหลังเรียงตาม
// *ช่วงของเรื่อง* ในทริปเดินป่า/ขึ้นเขา เพราะคนตัด vlog แนวนี้เลือกเพลงจาก
// "ตอนนี้อยู่ช่วงไหนของทริป" ก่อน แล้วค่อยดูว่าจะเอาแบบมีพลังหรือเงียบ ๆ
export type BgmCat =
  | "travel" | "chill" | "warm" | "upbeat" | "tense" | "choir"
  | "depart" | "trek" | "summit" | "camp" | "back";

export const BGM_CATS: { key: BgmCat; label: string; hint: string }[] = [
  { key: "travel", label: "เดินทาง", hint: "ช็อตวิว ไทม์แลปส์ ออกเดินทาง" },
  { key: "chill", label: "ชิล / โลไฟ", hint: "รองบทพูดยาว ๆ ได้โดยไม่ชิงจังหวะ" },
  { key: "warm", label: "อบอุ่น / ซึ้ง", hint: "ท่อนสรุป ย้อนอดีต ปิดเรื่อง" },
  { key: "upbeat", label: "สนุก / มีพลัง", hint: "มอนทาจ ตัดเร็ว กิน-เล่น-เที่ยว" },
  { key: "tense", label: "ลุ้นระทึก", hint: "ก่อนถึงจุดเฉลย พายุ หลงทาง" },
  { key: "choir", label: "คอรัส (เสียงร้อง)", hint: "เสียงร้อง อา/อู/ฮัม สังเคราะห์ ไม่มีเนื้อ" },
  { key: "depart", label: "ออกเดินทาง", hint: "เตรียมของ ออกรถ ถึงปากทาง เปิดเรื่อง" },
  { key: "trek", label: "เดินป่า / ลุยทาง", hint: "จังหวะฝีเท้า ป่าดิบ ลำธาร ฝนกลางทาง" },
  { key: "summit", label: "ขึ้นถึงยอด", hint: "วิวใหญ่ ทะเลหมอก จุดพีคของเรื่อง" },
  { key: "camp", label: "แคมป์ / กลางคืน", hint: "กองไฟ ใต้ดาว ในเต็นท์ เช้าในป่า" },
  { key: "back", label: "ขากลับ / ปิดเรื่อง", hint: "ทางลง สรุปทริป ขอบคุณ เอนด์การ์ด" },
];

export interface BgmDef {
  file: string;
  label: string;
  dur: number; // ความยาวลูป (วินาที) — วางแล้ววนซ้ำไปจนจบหนัง
  cat: BgmCat;
}

export const BGM_LIST: BgmDef[] = [
  { file: "bgm-travel-open.m4a", label: "ออกเดินทาง", dur: 19.2, cat: "travel" },
  { file: "bgm-travel-ridge.m4a", label: "สันเขา", dur: 21.8, cat: "travel" },
  { file: "bgm-travel-drive.m4a", label: "ออกถนน", dur: 16.8, cat: "travel" },
  { file: "bgm-travel-sunrise.m4a", label: "อรุณ", dur: 22.9, cat: "travel" },
  { file: "bgm-lofi-cafe.m4a", label: "โลไฟคาเฟ่", dur: 24.6, cat: "chill" },
  { file: "bgm-lofi-rain.m4a", label: "โลไฟสายฝน", dur: 26.7, cat: "chill" },
  { file: "bgm-chill-float.m4a", label: "ล่องลอย", dur: 22.3, cat: "chill" },
  { file: "bgm-chill-night.m4a", label: "ดึกสงัด", dur: 27.4, cat: "chill" },
  { file: "bgm-warm-home.m4a", label: "กลับบ้าน", dur: 25.3, cat: "warm" },
  { file: "bgm-warm-memory.m4a", label: "ความทรงจำ", dur: 28.2, cat: "warm" },
  { file: "bgm-warm-family.m4a", label: "อบอุ่น", dur: 21.8, cat: "warm" },
  { file: "bgm-warm-hope.m4a", label: "ความหวัง", dur: 21.3, cat: "warm" },
  { file: "bgm-up-happy.m4a", label: "สนุกสดใส", dur: 16.0, cat: "upbeat" },
  { file: "bgm-up-pop.m4a", label: "ป๊อปสดใส", dur: 17.1, cat: "upbeat" },
  { file: "bgm-up-funk.m4a", label: "ฟังก์", dur: 18.5, cat: "upbeat" },
  { file: "bgm-up-energy.m4a", label: "มีพลัง", dur: 15.0, cat: "upbeat" },
  { file: "bgm-tense-pulse.m4a", label: "ชีพจร", dur: 19.2, cat: "tense" },
  { file: "bgm-tense-build.m4a", label: "ก่อตัว", dur: 20.9, cat: "tense" },
  { file: "bgm-tense-dark.m4a", label: "มืดหม่น", dur: 24.0, cat: "tense" },
  { file: "bgm-choir-aah.m4a", label: "คอรัส อา", dur: 26.7, cat: "choir" },
  { file: "bgm-choir-ooh.m4a", label: "คอรัส อู", dur: 29.1, cat: "choir" },
  { file: "bgm-choir-hum.m4a", label: "ฮัมเบา ๆ", dur: 30.0, cat: "choir" },
  { file: "bgm-choir-epic.m4a", label: "คอรัสยิ่งใหญ่", dur: 25.3, cat: "choir" },
  { file: "bgm-depart-checklist.m4a", label: "เก็บของเข้าเป้", dur: 17.8, cat: "depart" },
  { file: "bgm-depart-firstlight.m4a", label: "ออกก่อนฟ้าสาง", dur: 22.9, cat: "depart" },
  { file: "bgm-depart-roadout.m4a", label: "ออกนอกเมือง", dur: 16.6, cat: "depart" },
  { file: "bgm-depart-trailhead.m4a", label: "ถึงปากทาง", dur: 19.2, cat: "depart" },
  { file: "bgm-depart-backpack.m4a", label: "สะพายเป้ขึ้นบ่า", dur: 15.5, cat: "depart" },
  { file: "bgm-depart-mapout.m4a", label: "กางแผนที่", dur: 20.9, cat: "depart" },
  { file: "bgm-trek-steady.m4a", label: "ก้าวสม่ำเสมอ", dur: 18.5, cat: "trek" },
  { file: "bgm-trek-deepwood.m4a", label: "ป่าดิบชื้น", dur: 21.8, cat: "trek" },
  { file: "bgm-trek-stream.m4a", label: "ข้ามลำธาร", dur: 20.0, cat: "trek" },
  { file: "bgm-trek-uphill.m4a", label: "ทางชัน", dur: 17.1, cat: "trek" },
  { file: "bgm-trek-rainpass.m4a", label: "ฝนกลางทาง", dur: 24.0, cat: "trek" },
  { file: "bgm-trek-mist.m4a", label: "หมอกลงทาง", dur: 25.3, cat: "trek" },
  { file: "bgm-summit-arrive.m4a", label: "ถึงยอดแล้ว", dur: 22.9, cat: "summit" },
  { file: "bgm-summit-seaofmist.m4a", label: "ทะเลหมอก", dur: 26.7, cat: "summit" },
  { file: "bgm-summit-firstsun.m4a", label: "แสงแรกบนยอด", dur: 21.8, cat: "summit" },
  { file: "bgm-summit-vast.m4a", label: "กว้างสุดสายตา", dur: 25.3, cat: "summit" },
  { file: "bgm-summit-triumph.m4a", label: "พิชิต", dur: 20.0, cat: "summit" },
  { file: "bgm-summit-quiet.m4a", label: "เงียบบนที่สูง", dur: 30.0, cat: "summit" },
  { file: "bgm-camp-fire.m4a", label: "ล้อมกองไฟ", dur: 25.9, cat: "camp" },
  { file: "bgm-camp-stars.m4a", label: "ใต้ดาว", dur: 28.2, cat: "camp" },
  { file: "bgm-camp-cook.m4a", label: "ทำกับข้าวในป่า", dur: 20.0, cat: "camp" },
  { file: "bgm-camp-tent.m4a", label: "ค่ำในเต็นท์", dur: 27.4, cat: "camp" },
  { file: "bgm-camp-nightwalk.m4a", label: "เดินดูดาว", dur: 23.4, cat: "camp" },
  { file: "bgm-camp-dawn.m4a", label: "เช้าในป่า", dur: 24.6, cat: "camp" },
  { file: "bgm-back-downhill.m4a", label: "ทางลง", dur: 17.8, cat: "back" },
  { file: "bgm-back-lastview.m4a", label: "มองกลับไปครั้งสุดท้าย", dur: 24.0, cat: "back" },
  { file: "bgm-back-ridehome.m4a", label: "นั่งรถกลับ", dur: 21.8, cat: "back" },
  { file: "bgm-back-thanks.m4a", label: "ขอบคุณที่ดูจนจบ", dur: 21.3, cat: "back" },
  { file: "bgm-back-endcard.m4a", label: "เอนด์การ์ด", dur: 18.5, cat: "back" },
  { file: "bgm-back-tired.m4a", label: "เหนื่อยแต่คุ้ม", dur: 26.7, cat: "back" },
];

export const bgmUrl = (file: string) => `/bgm/${file}`;

export const bgmLabel = (file: string) =>
  BGM_LIST.find((b) => b.file === file)?.label;
