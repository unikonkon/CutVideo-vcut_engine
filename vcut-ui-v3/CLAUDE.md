@AGENTS.md

# vcut-ui-v3 — หน้าเว็บตัดง่าย 3 ขั้น ธีม v6 "ท้องฟ้า × ป่าไม้"

Next 16 · React 19 · Tailwind v4 · พอร์ต dev **3002** · คุยกับเอนจิน `vcut_engine/serve.py` ผ่าน `/engine/*`
(rewrite ใน `next.config.ts` → `VCUT_ENGINE_URL` ตั้งต้น 8765) — สเปกภาพคือ mockup v6 ใน
`ข้อมูลตั้งต้น/vcut-quick-cut-mockup-src/{F1,F2,F2Custom,F2Run,F3,F3Edit}.dc.html` (ตัวสร้าง `gen_v6.py`)

## แผนที่ไฟล์
- `app/page.tsx` หน้าเดียว state-driven · ตำแหน่งอยู่ใน URL query (`hooks/route.ts`: `?s=1|2|3 &e=tl|sub|text|music|sticker|fx &v=<variant> &st=<style>`)
- `app/globals.css` โทเคนธีม (ชื่อ `--amber` = แอกเซนต์เขียวมอส `#b9e37c` — คงชื่อไว้เพื่อของที่ port จาก v2) + คลาสพื้นฐาน `.panel .btn .cta .seg .tog .stp .pos .node .bar .card .tab`
- `components/sky/Backdrop.tsx` พื้นหลังฟ้าค่ำ + แนวสน 3 ชั้น (วาดจากโค้ด seed คงที่) ใส่ใน layout — ทุกหน้าโปร่งใส
- `components/instrument/index.tsx` primitives ทั้งหมด: `Panel Well Btn Cta Seg Tog SwRow Stepper Pos9 Bar Icon Thumb …` — ไอคอนเป็น SVG เส้นชุดเดียว ห้ามอีโมจิ/สัญลักษณ์ตัวอักษร
- `components/frames/TopBar.tsx` แถบบน: ตราใบไม้ · ชื่อไฟล์ · ขั้น ①②③ แบบเส้นทางเดินป่า
- `components/step1/` ① ใส่วิดีโอ (อัปโหลด → job `ingest`) · `step2/` ② สไตล์ A–D/กำหนดเอง → job `quick`/`recut` + หน้ากำลังตัด · `step3/` ③ 6 แบบต่อสไตล์ (แท็บสไตล์) · ลิ้นชักแก้ชั้นแต่ง 5 แท็บ · ส่งออก ③④⑤ · `TimelinePage` ไทม์ไลน์เต็ม
- `hooks/engine.tsx` สถานะกลาง (state · clips · job โพล · variants ตามสไตล์ที่ดู) · `lib/api.ts` ทุก endpoint (`api api2 api3 api4`)
- `lib/roadmap.ts` ธง `FEATURES` ของสิ่งที่ mockup มีแต่เอนจินยังไม่มี — ห้ามใส่ปุ่มหลอก ให้ผ่านธงนี้เสมอ

## กติกา
- สี/ระยะ/ฟอนต์จาก `globals.css` เท่านั้น · แอกเซนต์เดียว ใช้เฉพาะ "เลือกอยู่/เปิดอยู่" · เหลืองอุ่น `--warm` เฉพาะเตือน · ปุ่มหลัก (`Cta` ครีม) หน้าละปุ่มเดียว
- ค่าที่เลือก = `Seg` · เปิด/ปิด = `Tog` · ตัวเลข = `Stepper` · ตำแหน่ง = `Pos9` · แท็บ = `.tab` — ไม่มีชิป ไม่มีลูกบิด
- เอนจินรับงานทีละงาน (409) — ปุ่มสั่งงาน `disabled` เมื่อ `eng.job?.running`
- แบบ (variant) อ้างด้วย `id` + สไตล์ เสมอ (`.vcut/variants/<style>/<id>/`) · สัญญาเอนจินดู `docs/QUICK-CUT-ENGINE.md`
- ตัวเลขบนจอมาจากเอนจิน ไม่ใช่เลขสมมติของ mockup

## รัน / ตรวจ
```
VCUT_ENGINE_URL=http://127.0.0.1:8792 npm run dev      # เอนจินทดสอบพอร์ตอื่น (อย่าแตะ 8765/3000/3001)
npx tsc --noEmit && npx eslint components hooks lib app --max-warnings=0
```
`public/bgm sfx stickers` เป็น symlink ไป `../vcut-ui-v2/public/` (ไม่คัดลอกซ้ำ 24 MB)
