@AGENTS.md

# vcut-ui-v2 — หน้าเว็บ 3 ขั้น (ทิศทาง C · แผงควบคุม)

หน้าเดียว state-driven ที่ห่อทุกฟังก์ชันของ `vcut_engine` ไว้ใน 3 ขั้น
(mockup ต้นทาง: `ข้อมูลตั้งต้น/vcut-quick-cut-mockup-src/gen_cflow*.py` · การตัดสินใจ: memory `ui-v2-build-decisions`)

```
app/page.tsx              Flow: step 1/2/3 จาก URL (?s=&d=&t=&e=&v=&lib=)
hooks/route.ts            useRoute() — ตำแหน่งใน flow อยู่ใน query ทั้งหมด
hooks/engine.tsx          EngineProvider/useEngine — state/clips/trash/job โพล · variants · useLoader(fn, key)
lib/api.ts                สัญญากับ serve.py (api · api2 = ของ v1 ตรง ๆ · api3 = ที่เพิ่มใน v2)
lib/*.ts                  คัดลอกจาก vcut-ui (layers · bgm · sfx · stickers · textfx · shapes · grade · time · pref)
components/instrument/    primitives ตามโทเคน C (Panel Well Led Btn Keys Tog Knob Seg7 Cta Meter Stat Fld …)
components/frames/        TopBar · Drawer (ลิ้นชักขั้น ②) · EditFrame (3 คอลัมน์ขั้น ③)
components/step1/         ① ใส่วิดีโอ · คลังคลิป
components/step2/         ② โต๊ะทำงาน · กำลังตัด · ลิ้นชัก pool/trans · adv/ (ตั้งค่า · เลือกชิ้น+ลำดับ · AI · ไปป์ไลน์ · รีเซ็ต)
components/step3/         ③ เลือกแบบ · Player · ไทม์ไลน์ · AI ดูหนัง · edit/ (ซับ · ข้อความ · เพลง · สติกเกอร์ · fx รายช็อต · แผนที่)
app/globals.css           โทเคน + คลาสชื่อเดียวกับ mockup (panel well led btn knob seg7 …)
```

## กติกา
- สี/ฟอนต์มาจากโทเคนใน globals.css เท่านั้น (bg #1c1e1b · panel #242723 · well #161815 · แอกเซนต์เดียว อำพัน #ffb020 · Mitr + JetBrains Mono)
- คุยกับเอนจินผ่าน `lib/api.ts` เท่านั้น · เส้นทางทั้งหมดวิ่งผ่าน `/engine/*` (rewrite ใน next.config.ts)
- เอนจินรับงานทีละงาน (409) — ปุ่มสั่งงานต้อง disabled เมื่อ `eng.job?.running`
- เอนจินมี **แบบเดียวต่อโปรเจกต์** วันนี้ — โค้ดต้องอ้าง `variant.id` เสมอ เพื่อรองรับหลายแบบในเฟสถัดไป

## รัน
```bash
npm run dev                                   # http://localhost:3001 → เอนจิน 8765 (ของผู้ใช้)
VCUT_ENGINE_URL=http://127.0.0.1:8791 npm run dev   # ชี้เอนจินทดสอบพอร์ตอื่น
npx tsc --noEmit && npx eslint components hooks lib app --max-warnings=0
```
พอร์ต 3000 เป็นของ `vcut-ui` (v1) และ 8765 เป็นเอนจินที่ผู้ใช้เปิดค้างไว้ — อย่าฆ่า
