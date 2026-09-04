# vcut-ui-v3 — หน้าเว็บ 3 ขั้น (ธีมฟ้า การ์ดเรียบ)

หน้าเดียว state-driven ที่ห่อ `vcut_engine` ไว้ใน 3 ขั้น — **ใส่วิดีโอ → สไตล์ → ส่งออก**
(การตัดสินใจ: memory `ui-v3-decisions` · เอนจินฝั่งนี้: `docs/QUICK-CUT-ENGINE.md`)

```
app/page.tsx              Flow: step 1/2/3 จาก URL (?s=&e=&v=)
hooks/route.ts            useRoute() — step · edit (tl sub text music sticker fx) · variant
hooks/engine.tsx          EngineProvider/useEngine — state/clips/job โพล · variants จาก /api/variants · activateVariant
lib/api.ts                สัญญากับ serve.py (api · api2 · api3 = ของ v2 · api4 = variants/autofx ของ v3)
lib/*.ts                  layers · bgm · sfx · stickers · textfx · shapes · grade · time · pref (จาก v2)
components/instrument/    primitives (Panel Well Led Btn Keys Tog Knob Seg7 Cta Meter Stat Fld …) — คลาสใน globals.css
components/frames/        TopBar · EditFrame (3 คอลัมน์ของแผงแก้)
components/step1/         ① ใส่วิดีโอ — Input (วางไฟล์ · สถานะ scan/listen/thumbs) + upload.ts (คิว + สายงาน)
components/step2/         ② สไตล์ — StylePanel (การ์ด A–D + กำหนดเอง · ชั้นแต่ง · แบบที่จะตัด) · RunPanel (ตัดให้เลย = job quick)
components/step3/         ③ ส่งออก — Variants (6 แบบ · ใช้แบบนี้ · ชั้นแต่ง · ส่งออก ③④⑤) · Player · TimelinePage · store
components/step3/edit/    แผงแก้รายชั้น: Sub · Text · Music · Sticker · FxShot (จาก v2 · ไม่มี Map/Review แล้ว)
app/globals.css           โทเคนฟ้า + คลาสชื่อเดิมของ v2 (panel well led btn cta knob seg7 …) แบบเรียบ
```

## กติกา
- โทเคน: พื้น #14203a · แผง #1b2a47 · ร่อง #0f192e · ตัวหนังสือ #dfe6f2 · จาง #8797b3 · แอกเซนต์ฟ้า #5ab0ff — ชื่อตัวแปร `--amber` ยังคงไว้ (= แอกเซนต์) เพื่อให้แผงแก้ที่ port มาไม่ต้องแก้ทีละไฟล์
- ไม่มีลูกบิด/LED เรืองแสง/7-segment ในหน้าใหม่ — `.knob/.seg7/.led` ยังมีคลาสอยู่ (เรียบแล้ว) เพราะแผงแก้รายชั้นใช้
- คุยกับเอนจินผ่าน `lib/api.ts` เท่านั้น · ทุกเส้นทางวิ่งผ่าน `/engine/*` (rewrite ใน next.config.ts)
- เอนจินรับงานทีละงาน (409) — ปุ่มสั่งงานต้อง disabled เมื่อ `eng.job?.running`
- ขั้น ③: ไทม์ไลน์/ชั้นแต่งใน `.vcut` เป็นของแบบที่ **active** เท่านั้น — กดการ์ดแบบอื่นแค่ดูตัวอย่าง (`/variant/<id>/out`) ต้องกด "ใช้แบบนี้" (activate) ก่อนแก้/ส่งออก
- งานหลัก: `quick` (scan → thumbs → listen → silence → variants → autofx) · `quick_ai` · `autofx` · `build/build_text/build_fx`

## รัน
```bash
npm run dev                                        # http://localhost:3002 → เอนจิน 8765 (ของผู้ใช้)
VCUT_ENGINE_URL=http://127.0.0.1:8791 npm run dev  # ชี้เอนจินทดสอบพอร์ตอื่น
npx tsc --noEmit && npx eslint components hooks lib app --max-warnings=0 && npm run build
```
พอร์ต 3000 = vcut-ui (v1) · 3001 = vcut-ui-v2 · 8765 = เอนจินที่ผู้ใช้เปิดค้างไว้ — อย่าฆ่า

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
