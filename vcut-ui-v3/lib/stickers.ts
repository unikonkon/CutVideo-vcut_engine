// สติกเกอร์ตัวอย่าง 200 แบบ 12 หมวด — ไฟล์ PNG โปร่งใสอยู่ใน public/stickers/
// (วาดด้วย scripts/gen_stickers.py แก้สี/ทรงแล้วรันซ้ำได้ทั้งชุด)
//
// ตอนใช้ครั้งแรกถูกอัปโหลดเข้าโฟลเดอร์ assets ของโปรเจกต์ให้เอง (ผ่าน /api/asset)
// จากนั้นก็เป็นภาพซ้อนธรรมดาในสายตาเอนจิน — fx.json เก็บแค่ชื่อไฟล์เหมือนกันหมด
//
// ค่า width/x/y ที่ติดมากับแต่ละแบบคือ "ท่าที่ของชิ้นนั้นควรอยู่" — แบดจ์เกาะมุมขวาบน
// แถบ lower-third นอนอยู่ล่างซ้าย กรอบเต็มจอกินทั้งเฟรม วางแล้วได้ทรงที่ใช้ได้ทันที
// โดยไม่ต้องไล่ปรับตัวเลขทีละช่อง (ปรับต่อได้ตามปกติหลังวาง)

export type StickerCat =
  | "badge"
  | "bubble"
  | "arrow"
  | "frame"
  | "decor"
  | "react"
  | "emotion"
  | "social"
  | "travel"
  | "food"
  | "number"
  | "weather";

export const STICKER_CATS: { key: StickerCat; label: string }[] = [
  { key: "badge", label: "ป้าย / แบดจ์" },
  { key: "bubble", label: "บับเบิลคำพูด" },
  { key: "arrow", label: "ลูกศร / ชี้จุด" },
  { key: "frame", label: "กรอบ / แถบ" },
  { key: "decor", label: "ตกแต่ง / ลายมือ" },
  { key: "react", label: "รีแอ็กชัน" },
  { key: "emotion", label: "อารมณ์" },
  { key: "social", label: "โซเชียล" },
  { key: "travel", label: "เดินทาง" },
  { key: "food", label: "อาหาร / คาเฟ่" },
  { key: "number", label: "ตัวเลข" },
  { key: "weather", label: "อากาศ / เวลา" },
];

export interface StickerDef {
  file: string;
  label: string;
  cat: StickerCat;
  width: number; // กว้างกี่ส่วนของจอ (เท่ากับช่อง "กว้าง" ในแผง)
  x: number; // จุดกึ่งกลางแนวนอน 0-1
  y: number; // จุดกึ่งกลางแนวตั้ง 0-1
  anim?: string; // ไม่ใส่ = fade ตามค่าตั้งต้นของเอนจิน
}

const badge = (file: string, label: string, width = 0.2): StickerDef => ({
  file, label, cat: "badge", width, x: 0.8, y: 0.13, anim: "slide",
});
// บับเบิลว่างไว้พิมพ์ข้อความทับ = ตัวใหญ่กลางบน · บับเบิลที่มีคำอยู่แล้ว = เล็กกว่า มุมขวา
const bub = (file: string, label: string, width = 0.26): StickerDef => ({
  file, label, cat: "bubble", width, x: width > 0.3 ? 0.5 : 0.68, y: 0.3, anim: "rise",
});
// ของกิน — ป้ายเล็กมุมซ้ายบน คู่กับข้อความบอกชื่อร้าน/เมนู (ท่าเดียวกับหมวดเดินทาง)
const food = (file: string, label: string, width: number): StickerDef => ({
  file, label, cat: "food", width, x: 0.13, y: 0.2,
});
const num = (n: number): StickerDef => ({
  file: `st-no${n}.png`, label: `เลข ${n}`, cat: "number",
  width: 0.09, x: 0.12, y: 0.15, anim: "slide",
});

const emo = (file: string, label: string): StickerDef => ({
  file, label, cat: "emotion", width: 0.12, x: 0.79, y: 0.71, anim: "rise",
});

export const STICKER_LIST: StickerDef[] = [
  // ป้าย / แบดจ์ — มุมขวาบน ไถลเข้าจากขอบ
  badge("st-new.png", "NEW"),
  badge("st-live.png", "LIVE"),
  badge("st-4k.png", "4K"),
  badge("st-hot.png", "HOT"),
  badge("st-ep.png", "EP.01"),
  badge("st-vlog.png", "VLOG"),
  badge("st-th-new.png", "ใหม่", 0.15),
  badge("st-th-must.png", "ห้ามพลาด", 0.22),
  badge("st-th-tip.png", "เคล็ดลับ", 0.22),
  badge("st-th-follow.png", "กดติดตาม", 0.22),
  badge("st-th-ep.png", "ตอนที่ 1", 0.22),
  // บับเบิลคำพูด — สี่แบบแรกว่างไว้พิมพ์ข้อความทับในแท็บข้อความ
  bub("st-bub-round.png", "บับเบิลกลม", 0.32),
  bub("st-bub-rect.png", "บับเบิลเหลี่ยม", 0.34),
  bub("st-bub-dark.png", "บับเบิลโทนเข้ม", 0.34),
  bub("st-bub-think.png", "บับเบิลความคิด", 0.32),
  bub("st-bub-shout.png", "บับเบิลตะโกน", 0.34),
  bub("st-bub-wow.png", "ว้าว!"),
  bub("st-bub-best.png", "สุดยอด"),
  bub("st-bub-real.png", "จริงดิ?"),
  bub("st-bub-go.png", "ไปกันเลย"),
  bub("st-bub-omg.png", "OMG!"),
  // ลูกศร / ชี้จุด — กลางจอ ผู้ใช้ลากไปชี้ของที่ต้องการเอง
  { file: "st-arrow-r.png", label: "ลูกศรขวา", cat: "arrow", width: 0.18, x: 0.4, y: 0.5 },
  { file: "st-arrow-curve.png", label: "ลูกศรโค้ง", cat: "arrow", width: 0.16, x: 0.4, y: 0.42 },
  { file: "st-pointer.png", label: "สามเหลี่ยมชี้ลง", cat: "arrow", width: 0.1, x: 0.5, y: 0.34 },
  { file: "st-ring.png", label: "วงกลมล้อม", cat: "arrow", width: 0.3, x: 0.5, y: 0.5 },
  { file: "st-zigzag.png", label: "ลูกศรหักศอก", cat: "arrow", width: 0.16, x: 0.42, y: 0.44 },
  { file: "st-arrow-l.png", label: "ลูกศรซ้าย", cat: "arrow", width: 0.18, x: 0.6, y: 0.5 },
  { file: "st-arrow-up.png", label: "ลูกศรขึ้น", cat: "arrow", width: 0.07, x: 0.5, y: 0.62 },
  { file: "st-arrow-down.png", label: "ลูกศรลง", cat: "arrow", width: 0.07, x: 0.5, y: 0.34 },
  { file: "st-cursor.png", label: "ลูกศรเมาส์", cat: "arrow", width: 0.06, x: 0.5, y: 0.5 },
  { file: "st-arrow-dashed.png", label: "ลูกศรเส้นประ", cat: "arrow", width: 0.2, x: 0.4, y: 0.5 },
  { file: "st-arrow-u.png", label: "ลูกศรวนกลับ", cat: "arrow", width: 0.16, x: 0.45, y: 0.42 },
  { file: "st-ring-dash.png", label: "วงกลมประล้อม", cat: "arrow", width: 0.3, x: 0.5, y: 0.5 },
  { file: "st-underline.png", label: "ขีดเส้นใต้เน้น", cat: "arrow", width: 0.3, x: 0.5, y: 0.62 },
  { file: "st-arrow-thin.png", label: "ลูกศรเส้นบาง", cat: "arrow", width: 0.18, x: 0.4, y: 0.5 },
  { file: "st-chevrons.png", label: "ลูกศรซ้อนสามชั้น", cat: "arrow", width: 0.14, x: 0.45, y: 0.5 },
  { file: "st-arrow-diag.png", label: "ลูกศรเฉียงขึ้น", cat: "arrow", width: 0.13, x: 0.45, y: 0.52 },
  { file: "st-arrow-double.png", label: "ลูกศรสองหัว", cat: "arrow", width: 0.2, x: 0.5, y: 0.5 },
  { file: "st-arrow-loop.png", label: "ลูกศรวนรอบ", cat: "arrow", width: 0.11, x: 0.5, y: 0.45 },
  { file: "st-hand-point.png", label: "นิ้วชี้", cat: "arrow", width: 0.12, x: 0.36, y: 0.5 },
  { file: "st-arrow-scribble.png", label: "ลูกศรลายมือ", cat: "arrow", width: 0.2, x: 0.44, y: 0.44 },
  { file: "st-crosshair.png", label: "เป้าเล็ง", cat: "arrow", width: 0.15, x: 0.5, y: 0.5 },
  { file: "st-scribble-circle.png", label: "วงลายมือ", cat: "arrow", width: 0.3, x: 0.5, y: 0.5 },
  { file: "st-arrow-bend.png", label: "ลูกศรหักมุม", cat: "arrow", width: 0.14, x: 0.44, y: 0.48 },
  // กรอบ / แถบ — แผ่นรองสำหรับพิมพ์ข้อความทับในแท็บข้อความ
  { file: "st-lower3.png", label: "แถบชื่อ (lower-third)", cat: "frame", width: 0.52, x: 0.32, y: 0.8, anim: "slide" },
  { file: "st-strip.png", label: "แถบดำโปร่ง", cat: "frame", width: 0.6, x: 0.35, y: 0.84, anim: "slide" },
  { file: "st-corner.png", label: "กรอบมุม", cat: "frame", width: 1, x: 0.5, y: 0.5 },
  { file: "st-film.png", label: "ขอบฟิล์ม", cat: "frame", width: 1, x: 0.5, y: 0.5 },
  { file: "st-banner.png", label: "ป้ายริบบิ้น", cat: "frame", width: 0.34, x: 0.5, y: 0.17, anim: "rise" },
  { file: "st-lower3-dark.png", label: "แถบชื่อโทนเข้ม", cat: "frame", width: 0.52, x: 0.32, y: 0.8, anim: "slide" },
  { file: "st-tag.png", label: "ป้ายลูกศร", cat: "frame", width: 0.24, x: 0.2, y: 0.16, anim: "slide" },
  { file: "st-frame-round.png", label: "กรอบมนเต็มจอ", cat: "frame", width: 1, x: 0.5, y: 0.5 },
  { file: "st-frame-dash.png", label: "กรอบเส้นประ", cat: "frame", width: 1, x: 0.5, y: 0.5 },
  { file: "st-scrim.png", label: "แถบไล่เฉดล่าง", cat: "frame", width: 1, x: 0.5, y: 0.86, anim: "none" },
  { file: "st-polaroid.png", label: "กรอบโพลารอยด์", cat: "frame", width: 0.42, x: 0.5, y: 0.5 },
  { file: "st-title-plate.png", label: "แผ่นไตเติล", cat: "frame", width: 0.5, x: 0.5, y: 0.5, anim: "rise" },
  { file: "st-caption-box.png", label: "กล่องคำบรรยาย", cat: "frame", width: 0.62, x: 0.5, y: 0.82, anim: "slide" },
  { file: "st-vignette.png", label: "ขอบมืดรอบเฟรม", cat: "frame", width: 1, x: 0.5, y: 0.5, anim: "none" },
  // ตกแต่ง / ลายมือ — ของประกอบหน้ากระดาษสไตล์สมุดเดินทาง
  { file: "st-tape.png", label: "เทปกาว", cat: "decor", width: 0.22, x: 0.22, y: 0.12, anim: "none" },
  { file: "st-note.png", label: "โน้ตกาว", cat: "decor", width: 0.16, x: 0.82, y: 0.3, anim: "rise" },
  { file: "st-torn.png", label: "กระดาษฉีก", cat: "decor", width: 0.42, x: 0.5, y: 0.8, anim: "rise" },
  { file: "st-highlight.png", label: "ไฮไลต์ปากกาเมจิก", cat: "decor", width: 0.32, x: 0.5, y: 0.62, anim: "none" },
  { file: "st-brush.png", label: "แถบพู่กัน", cat: "decor", width: 0.32, x: 0.5, y: 0.62, anim: "none" },
  { file: "st-doodle.png", label: "เส้นหยักลายมือ", cat: "decor", width: 0.3, x: 0.5, y: 0.66 },
  { file: "st-dots.png", label: "จุดไข่ปลา", cat: "decor", width: 0.26, x: 0.5, y: 0.66 },
  { file: "st-confetti.png", label: "คอนเฟตติ", cat: "decor", width: 0.7, x: 0.5, y: 0.32, anim: "rise" },
  { file: "st-starburst.png", label: "ประกายแฉก", cat: "decor", width: 0.16, x: 0.74, y: 0.3, anim: "rise" },
  { file: "st-sparkles3.png", label: "ประกายสามดวง", cat: "decor", width: 0.16, x: 0.72, y: 0.3 },
  { file: "st-clip.png", label: "คลิปหนีบกระดาษ", cat: "decor", width: 0.05, x: 0.3, y: 0.14, anim: "none" },
  { file: "st-pushpin.png", label: "หมุดปัก", cat: "decor", width: 0.06, x: 0.5, y: 0.16, anim: "rise" },
  // รีแอ็กชัน — มุมขวาล่าง ลอยขึ้นมา
  { file: "st-heart.png", label: "หัวใจ", cat: "react", width: 0.12, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-star.png", label: "ดาว", cat: "react", width: 0.12, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-fire.png", label: "ไฟ", cat: "react", width: 0.1, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-sparkle.png", label: "ประกาย", cat: "react", width: 0.14, x: 0.72, y: 0.3 },
  { file: "st-wow.png", label: "ระเบิด WOW", cat: "react", width: 0.2, x: 0.74, y: 0.68, anim: "rise" },
  { file: "st-check.png", label: "ถูกต้อง", cat: "react", width: 0.11, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-thumbup.png", label: "ยกนิ้วโป้ง", cat: "react", width: 0.11, x: 0.8, y: 0.7, anim: "rise" },
  { file: "st-hundred.png", label: "100 คะแนน", cat: "react", width: 0.16, x: 0.78, y: 0.72, anim: "rise" },
  { file: "st-laugh.png", label: "หน้ายิ้ม", cat: "react", width: 0.12, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-shock.png", label: "หน้าตกใจ", cat: "react", width: 0.12, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-question.png", label: "เครื่องหมายคำถาม", cat: "react", width: 0.11, x: 0.78, y: 0.3 },
  { file: "st-warning.png", label: "คำเตือน", cat: "react", width: 0.12, x: 0.5, y: 0.4 },
  { file: "st-cross.png", label: "กากบาท", cat: "react", width: 0.11, x: 0.8, y: 0.72, anim: "rise" },
  { file: "st-crown.png", label: "มงกุฎ", cat: "react", width: 0.13, x: 0.5, y: 0.26, anim: "rise" },
  // อารมณ์ — หน้ากลมชุดเดียวกัน วางมุมขวาล่างให้ไม่บังหน้าคนในเฟรม
  emo("st-em-smile.png", "ยิ้ม"),
  emo("st-em-joy.png", "ขำน้ำตาไหล"),
  emo("st-em-love.png", "ตาหัวใจ"),
  emo("st-em-cool.png", "เท่ แว่นดำ"),
  emo("st-em-sad.png", "เศร้า"),
  emo("st-em-cry.png", "ร้องไห้"),
  emo("st-em-angry.png", "โกรธ"),
  emo("st-em-sleep.png", "ง่วง / หลับ"),
  emo("st-em-think.png", "คิดหนัก"),
  emo("st-em-wink.png", "ขยิบตา"),
  emo("st-em-sweat.png", "เหงื่อตก"),
  emo("st-em-hungry.png", "หิว"),
  emo("st-em-sick.png", "ป่วย"),
  emo("st-em-dizzy.png", "หน้ามืด"),
  emo("st-em-party.png", "ฉลอง"),
  // โซเชียล — ล่างซ้าย/ล่างกลาง เหมือนแถบเรียกให้กด
  { file: "st-subscribe.png", label: "ปุ่ม SUBSCRIBE", cat: "social", width: 0.26, x: 0.5, y: 0.82, anim: "rise" },
  { file: "st-like.png", label: "ปุ่ม LIKE", cat: "social", width: 0.18, x: 0.24, y: 0.82, anim: "rise" },
  { file: "st-comment.png", label: "คอมเมนต์", cat: "social", width: 0.13, x: 0.24, y: 0.7, anim: "rise" },
  { file: "st-share.png", label: "แชร์", cat: "social", width: 0.11, x: 0.24, y: 0.7, anim: "rise" },
  { file: "st-bell.png", label: "กระดิ่งเตือน", cat: "social", width: 0.1, x: 0.72, y: 0.8, anim: "rise" },
  { file: "st-hashtag.png", label: "แฮชแท็ก", cat: "social", width: 0.1, x: 0.86, y: 0.8 },
  { file: "st-views.png", label: "ยอดวิว", cat: "social", width: 0.12, x: 0.24, y: 0.7, anim: "rise" },
  { file: "st-save.png", label: "บันทึกไว้ดูทีหลัง", cat: "social", width: 0.08, x: 0.24, y: 0.7, anim: "rise" },
  // เดินทาง
  { file: "st-pin.png", label: "หมุดแผนที่", cat: "travel", width: 0.08, x: 0.5, y: 0.42, anim: "rise" },
  { file: "st-compass.png", label: "เข็มทิศ", cat: "travel", width: 0.12, x: 0.13, y: 0.2 },
  { file: "st-mountain.png", label: "ภูเขา", cat: "travel", width: 0.14, x: 0.13, y: 0.2 },
  { file: "st-route.png", label: "เส้นทางประ", cat: "travel", width: 0.3, x: 0.5, y: 0.42 },
  { file: "st-plane.png", label: "เครื่องบิน", cat: "travel", width: 0.12, x: 0.7, y: 0.24, anim: "slide" },
  { file: "st-camera.png", label: "กล้อง", cat: "travel", width: 0.12, x: 0.13, y: 0.2 },
  { file: "st-suitcase.png", label: "กระเป๋าเดินทาง", cat: "travel", width: 0.12, x: 0.13, y: 0.2 },
  { file: "st-tent.png", label: "เต็นท์", cat: "travel", width: 0.14, x: 0.13, y: 0.2 },
  { file: "st-coffee.png", label: "กาแฟ", cat: "travel", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-food.png", label: "อาหาร", cat: "travel", width: 0.1, x: 0.13, y: 0.2 },
  { file: "st-car.png", label: "รถ", cat: "travel", width: 0.16, x: 0.7, y: 0.76, anim: "slide" },
  { file: "st-flag.png", label: "ธงพิชิตยอด", cat: "travel", width: 0.09, x: 0.5, y: 0.4, anim: "rise" },
  { file: "st-sunset.png", label: "พระอาทิตย์ตก", cat: "travel", width: 0.14, x: 0.13, y: 0.2 },
  { file: "st-backpack.png", label: "เป้สะพายหลัง", cat: "travel", width: 0.1, x: 0.13, y: 0.2 },
  { file: "st-map.png", label: "แผนที่", cat: "travel", width: 0.16, x: 0.13, y: 0.2 },
  { file: "st-binoculars.png", label: "กล้องส่องทางไกล", cat: "travel", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-campfire.png", label: "กองไฟ", cat: "travel", width: 0.12, x: 0.13, y: 0.2 },
  { file: "st-wave.png", label: "คลื่นทะเล", cat: "travel", width: 0.16, x: 0.13, y: 0.2 },
  { file: "st-palm.png", label: "ต้นมะพร้าว", cat: "travel", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-boat.png", label: "เรือใบ", cat: "travel", width: 0.15, x: 0.72, y: 0.74, anim: "slide" },
  { file: "st-train.png", label: "รถไฟ", cat: "travel", width: 0.18, x: 0.7, y: 0.76, anim: "slide" },
  { file: "st-bicycle.png", label: "จักรยาน", cat: "travel", width: 0.16, x: 0.7, y: 0.76, anim: "slide" },
  { file: "st-ticket.png", label: "ตั๋ว", cat: "travel", width: 0.2, x: 0.5, y: 0.5, anim: "rise" },
  { file: "st-passport.png", label: "พาสปอร์ต", cat: "travel", width: 0.09, x: 0.13, y: 0.22 },
  { file: "st-bed.png", label: "ที่พัก", cat: "travel", width: 0.15, x: 0.13, y: 0.2 },
  { file: "st-signpost.png", label: "ป้ายบอกทาง", cat: "travel", width: 0.14, x: 0.16, y: 0.42 },
  { file: "st-footprints.png", label: "รอยเท้า", cat: "travel", width: 0.08, x: 0.5, y: 0.55 },
  { file: "st-temple.png", label: "วัด / เจดีย์", cat: "travel", width: 0.13, x: 0.13, y: 0.2 },
  { file: "st-motorbike.png", label: "มอเตอร์ไซค์", cat: "travel", width: 0.18, x: 0.7, y: 0.76, anim: "slide" },
  { file: "st-boot.png", label: "รองเท้าเดินป่า", cat: "travel", width: 0.13, x: 0.13, y: 0.2 },
  { file: "st-bottle.png", label: "ขวดน้ำ", cat: "travel", width: 0.06, x: 0.13, y: 0.22 },
  { file: "st-balloon.png", label: "บอลลูน", cat: "travel", width: 0.11, x: 0.78, y: 0.28, anim: "rise" },
  { file: "st-globe.png", label: "ลูกโลก", cat: "travel", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-lighthouse.png", label: "ประภาคาร", cat: "travel", width: 0.1, x: 0.13, y: 0.22 },
  { file: "st-beach-umbrella.png", label: "ร่มชายหาด", cat: "travel", width: 0.14, x: 0.13, y: 0.2 },
  { file: "st-noodle.png", label: "ชามก๋วยเตี๋ยว", cat: "travel", width: 0.13, x: 0.13, y: 0.2 },
  { file: "st-drink.png", label: "เครื่องดื่ม", cat: "travel", width: 0.08, x: 0.13, y: 0.2 },
  { file: "st-snorkel.png", label: "หน้ากากดำน้ำ", cat: "travel", width: 0.13, x: 0.13, y: 0.2 },
  { file: "st-waterfall.png", label: "น้ำตก", cat: "travel", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-forest.png", label: "ป่าสน", cat: "travel", width: 0.16, x: 0.13, y: 0.2 },
  { file: "st-bridge.png", label: "สะพานแขวน", cat: "travel", width: 0.2, x: 0.15, y: 0.2 },
  { file: "st-hammock.png", label: "เปลญวน", cat: "travel", width: 0.18, x: 0.15, y: 0.2 },
  { file: "st-lantern.png", label: "ตะเกียง", cat: "travel", width: 0.08, x: 0.13, y: 0.22 },
  { file: "st-headlamp.png", label: "ไฟฉายคาดหัว", cat: "travel", width: 0.13, x: 0.13, y: 0.2 },
  { file: "st-firstaid.png", label: "ชุดปฐมพยาบาล", cat: "travel", width: 0.12, x: 0.13, y: 0.2 },
  { file: "st-altitude.png", label: "ป้ายระดับความสูง", cat: "travel", width: 0.16, x: 0.15, y: 0.24, anim: "rise" },
  { file: "st-island.png", label: "เกาะ", cat: "travel", width: 0.16, x: 0.13, y: 0.2 },
  { file: "st-sleepbag.png", label: "ถุงนอน", cat: "travel", width: 0.16, x: 0.15, y: 0.2 },
  { file: "st-elephant.png", label: "ช้าง", cat: "travel", width: 0.18, x: 0.7, y: 0.74, anim: "slide" },
  { file: "st-tuktuk.png", label: "ตุ๊กตุ๊ก", cat: "travel", width: 0.18, x: 0.7, y: 0.76, anim: "slide" },
  // อาหาร / คาเฟ่ — สาย vlog กิน-เที่ยว
  food("st-fd-rice.png", "ข้าวจานเดียว", 0.13),
  food("st-fd-somtam.png", "ส้มตำ (ครกไม้)", 0.11),
  food("st-fd-grill.png", "ปิ้งย่าง", 0.14),
  food("st-fd-cake.png", "เค้ก", 0.12),
  food("st-fd-bread.png", "ครัวซองต์", 0.13),
  food("st-fd-fruit.png", "ผลไม้", 0.09),
  food("st-fd-icecream.png", "ไอศกรีม", 0.09),
  food("st-fd-beer.png", "เบียร์", 0.1),
  food("st-fd-tea.png", "ชาเย็น", 0.08),
  food("st-fd-chopsticks.png", "ตะเกียบ", 0.13),
  food("st-fd-spicy.png", "เผ็ด", 0.08),
  { file: "st-fd-yummy.png", label: "ป้าย อร่อย!", cat: "food", width: 0.2, x: 0.8, y: 0.13, anim: "slide" },
  // ตัวเลข — นับสเต็ป/อันดับ มุมซ้ายบน
  num(1), num(2), num(3), num(4), num(5),
  num(6), num(7), num(8), num(9), num(10),
  // อากาศ / เวลา — ป้ายเล็กมุมซ้ายบน คู่กับข้อความบอกที่/เวลา
  { file: "st-sun.png", label: "แดด", cat: "weather", width: 0.1, x: 0.13, y: 0.18 },
  { file: "st-cloud.png", label: "เมฆ", cat: "weather", width: 0.12, x: 0.13, y: 0.18 },
  { file: "st-rain.png", label: "ฝน", cat: "weather", width: 0.12, x: 0.13, y: 0.18 },
  { file: "st-thermo.png", label: "อุณหภูมิ", cat: "weather", width: 0.06, x: 0.13, y: 0.18 },
  { file: "st-moon.png", label: "กลางคืน", cat: "weather", width: 0.09, x: 0.13, y: 0.18 },
  { file: "st-clock.png", label: "เวลา", cat: "weather", width: 0.09, x: 0.13, y: 0.18 },
  { file: "st-storm.png", label: "ฝนฟ้าคะนอง", cat: "weather", width: 0.12, x: 0.13, y: 0.18 },
  { file: "st-snow.png", label: "หิมะ", cat: "weather", width: 0.1, x: 0.13, y: 0.18 },
  { file: "st-wind.png", label: "ลมแรง", cat: "weather", width: 0.14, x: 0.13, y: 0.18 },
  { file: "st-fog.png", label: "หมอก", cat: "weather", width: 0.13, x: 0.13, y: 0.18 },
  { file: "st-partly.png", label: "แดดหลังเมฆ", cat: "weather", width: 0.13, x: 0.13, y: 0.18 },
  { file: "st-rainbow.png", label: "สายรุ้ง", cat: "weather", width: 0.2, x: 0.15, y: 0.2 },
  { file: "st-umbrella.png", label: "ร่ม", cat: "weather", width: 0.1, x: 0.13, y: 0.2 },
  { file: "st-hourglass.png", label: "นาฬิกาทราย", cat: "weather", width: 0.07, x: 0.13, y: 0.2 },
  { file: "st-stopwatch.png", label: "จับเวลา", cat: "weather", width: 0.09, x: 0.13, y: 0.2 },
  { file: "st-calendar.png", label: "ปฏิทิน", cat: "weather", width: 0.11, x: 0.13, y: 0.2 },
  { file: "st-sunrise.png", label: "พระอาทิตย์ขึ้น", cat: "weather", width: 0.13, x: 0.13, y: 0.18 },
  { file: "st-night-stars.png", label: "ดาวเต็มฟ้า", cat: "weather", width: 0.12, x: 0.13, y: 0.18 },
  { file: "st-drizzle.png", label: "ฝนปรอย", cat: "weather", width: 0.13, x: 0.13, y: 0.18 },
  { file: "st-heat.png", label: "ร้อนจัด", cat: "weather", width: 0.11, x: 0.13, y: 0.18 },
  { file: "st-cold.png", label: "หนาว (เกล็ดหิมะ)", cat: "weather", width: 0.1, x: 0.13, y: 0.18 },
];

export const stickerUrl = (file: string) => `/stickers/${file}`;
