// สิ่งที่ mockup v6 วาดไว้แต่เอนจินวันนี้ยังไม่มี — ปิดไว้ก่อน (ตัดสินใจ 2026-09-04 ข้อ 4)
//
// ทุกจุดในหน้าเว็บที่แตะฟีเจอร์พวกนี้ต้องผ่านธงตรงนี้ ไม่โชว์ปุ่มหลอก  เปิดธงเมื่อ
// เอนจินทำส่วนของมันเสร็จ (รายละเอียดงานฝั่งเอนจินอยู่ในคอมเมนต์ของแต่ละธง)
// แล้วหน้าเว็บที่รอไว้ด้วย `FEATURES.x` จะติดขึ้นมาเองโดยไม่ต้องเขียนใหม่

export const FEATURES = {
  /** "N บรรทัดไม่มั่นใจ" ในลิ้นชักซับ — whisper-cli ต้องส่งความมั่นใจต่อท่อน
   *  (listen.py: อ่าน `-ojf` / token probabilities → transcript.json เพิ่ม `conf` ต่อท่อน
   *   · /api/captions ส่ง conf ต่อ cue) แล้วเปิดธงนี้ · UI: components/step3/edit/Sub.tsx
   *   ระบายบรรทัด conf < 0.7 เป็นเหลืองอุ่น + แถบความมั่นใจ */
  subConfidence: false,

  /** ซับ "ทีละคำ" (karaoke) ในขั้น ④/⑤ — caption.py/fxtext ต้องมี mode word-by-word
   *  ที่ใช้เวลาต่อคำจาก whisper (ตอนนี้มีแค่ pop_words ของการ์ด HOOK)
   *  · UI: ตัวเลือก "ทีละคำ" ใน StylePanel (กำหนดเอง) และ Sub.tsx */
  wordSub: false,

  /** ปุ่ม "เปิดโฟลเดอร์" หลังส่งออก — serve.py ต้องมี POST /api/reveal {path}
   *  (subprocess `open -R`) · UI: ปุ่มไอคอนโฟลเดอร์ข้าง CTA ส่งออกใน Variants.tsx */
  openFinder: false,

  /** "ลิงก์โฟลเดอร์" ในหน้า ① — ชี้โฟลเดอร์ฟุตเทจแทนอัปโหลด (/api/probe_dir มีแล้ว
   *  แต่ต้องมีทางตั้ง project.source ให้ปลอดภัย) · UI: ปุ่มในช่องวางไฟล์ของ Input.tsx */
  linkFolder: false,
} as const;

export type Feature = keyof typeof FEATURES;
