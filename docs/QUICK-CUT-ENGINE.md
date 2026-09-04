# เอนจินสำหรับหน้าเว็บ 3 ขั้น (v3) — ตัดหลายแบบ · แต่งอัตโนมัติ

สิ่งที่เพิ่มเข้าเอนจินเมื่อ 2026-09-03 เพื่อปิดช่องว่าง G1 · G2 · G3 · G5 ใน
[PLAN-quick-cut.md](PLAN-quick-cut.md) ก่อนสร้าง `vcut-ui-v3` (การตัดสินใจ: memory `ui-v3-decisions`)

ตัวเลขทุกตัววัดจากการรันจริงกับ `excemple-video-cut.mov` (134.5 วิ · คลิปเดียว · −6.8 LUFS ·
มีเพลงคลอ) บนเครื่องนี้ ผ่าน preset `tiktok-sell`

---

## สรุปหนึ่งย่อหน้า

คลิปเดียวที่พูดต่อเนื่อง 2 นาที → `vcut variants` ได้ **5 แบบใน 44 วินาที** (30 · 45 · 60 วิ ·
ตัดชิด 103 วิ · ยิงรัว 45 วิ — แบบ AI ข้ามเพราะปิด AI ไว้) จากนั้น `vcut autofx` วางการ์ด HOOK
จากประโยคแรก · การ์ดปิด · ซับ · เพลงคลอหมวด "สนุก/มีพลัง" ลง fx.json/captions.json ใน 1 วินาที
แล้ว `vcut fx` เผาเป็น final-fx.mp4 ตามปกติ

---

## 1 · ช่องว่างที่ปิดแล้ว

| # | ก่อน | ตอนนี้ | ที่แก้ |
|---|---|---|---|
| G2 | เกณฑ์เงียบคงที่ −32 dB → คลิปที่มีเพลงเจอ 0 ช่วง | `[jumpcut] auto_noise = true` → เกณฑ์ = LUFS ของคลิป (จาก manifest) − `auto_offset` (15 dB) รายคลิป | `silence.noise_for()` |
| G1a | whisper คืน 26 ท่อนติดกันสนิท → `talk_ranges` เชื่อมเป็นก้อนเดียว 101 วิ | `[talk] max_shot` ซอยก้อนที่ยาวเกินตาม *ท้ายท่อน* ของ whisper (ไม่ตัดกลางคำ) → 22 ชิ้น | `prepare.split_long()` |
| G1b | `pattern` เป้า 45 วิ `break` ที่ชิ้นแรกที่ใส่ไม่ลง → 0 ชิ้น | โหมดใหม่ `[compose] mode = "fit"` — ชิ้นคะแนนดีก่อน ใส่ไม่ลง *ข้าม* แล้วเรียงกลับตามเวลา · `talk_share` แบ่งพูด/วิว | `compose.mode_fit()` |
| G3 | edl/render/ไฟล์ออก ชุดเดียวต่อโปรเจกต์ | `.vcut/variants/<id>/` เก็บ pool · edl · render · out.mp4 ต่อแบบ + `index.json` · **activate** สลับชุดไฟล์กลับเข้า `.vcut/` ให้ขั้น 4/5 ทำต่อได้โดยไม่รู้จักคำว่า "แบบ" | `variants.py` |
| G5 | ทุกชั้นของ fx.json ต้องมีคนวางเอง | `vcut autofx` วางตาม `[autofx]` ของ preset (HOOK · การ์ดปิด · ซับ · เพลง · ยิงรัว · ดูดบีต) ทุกชิ้น id `auto-*` รันซ้ำแทนของเดิม ของคนไม่ถูกแตะ | `autofx.py` |

ที่ยังไม่ทำ (ตั้งใจ): G6 คลิปเดียวไม่มี B-roll · xfade จริง · มาสคอต 3D · ตัวตามหน้าตอน crop

---

## 2 · หกแบบ (`variants.CATALOG`)

ทุกแบบ = ค่าของโปรเจกต์ (สไตล์ A–D คือ preset ที่ `extends`) ทับด้วยไม่กี่คีย์ —
**ต่างกันที่การตัดเท่านั้น** ชั้นแต่งใส่ทีหลังเฉพาะแบบที่เลือก เพราะขั้น 4/5 เข้ารหัสทั้งเรื่องใหม่

| id | ป้าย | ค่าที่ทับ | ผลกับคลิปตัวอย่าง |
|---|---|---|---|
| `s30` | 30 วิ | fit · 0.5 นาที | 6 ชิ้น · 29.0 วิ · 11 วิ (render 6 ชิ้นแรก) |
| `s45` | 45 วิ **(ตั้งต้น)** | fit · 0.75 | 9 ชิ้น · 43.0 วิ · 6 วิ (cache 6 ใหม่ 3) |
| `s60` | 60 วิ | fit · 1.0 | 10 ชิ้น · 58.0 วิ · 7 วิ |
| `tight` | ตัดชิดทั้งคลิป | all | 22 ชิ้น · 103.3 วิ · 18 วิ |
| `ai45` | AI ไฮไลต์ 45 วิ | fit 0.75 + `ai.apply.trim` + `prepare.min_piece 1.0` | ข้าม: ต้องมี `trim_suggest` ใน ai.json หรือเปิด `[variants] ai` |
| `rapid` | ยิงรัว | fit 0.75 · `min_shot 0.8` · `gap_merge 0.3` · `max_shot 3` + autofx `burst_max 6` | 8 ชิ้น · 45.0 วิ · 2 วิ (cache ทั้งหมด) |

- `[variants] ids` เลือกชุดย่อยได้ · `[variants] ai = true` ให้ `variants` สั่ง `ai --task trim_suggest` เองเมื่อยังไม่มีคำตอบ
- แบบที่ล้มเหลว (หนังเปล่า · AI ไม่ตอบ) ถูกจดเหตุผลใน `index.json` ไม่หยุดแบบอื่น
- `vcut gc` ไม่ลบ segment ที่แบบไหนก็ตามยังอ้างอยู่ (`variants.listed_segments`)

### activate — สลับชุดไฟล์

```
vcut variants --activate rapid      # ไม่ตัดใหม่ แค่สลับ
```

ก่อนสลับ ไฟล์ที่แก้ได้ของแบบปัจจุบัน (`edl.json render.json pool.json fx.json captions.json`)
ถูกเก็บกลับเข้าโฟลเดอร์ของมัน แล้วชุดของแบบใหม่ถูกคัดลอกเข้า `.vcut/` — ชั้นแต่งที่แก้ไว้
ในแต่ละแบบจึงไม่หาย และ `fx-render.json` ถูกลบให้คำนวณใหม่ ครั้งแรกที่มีแบบ ชั้นแต่งที่โปรเจกต์
มีอยู่ก่อนถือเป็นของแบบแรกที่เลือก

---

## 3 · autofx (`[autofx]` ใน preset · `vcut autofx`)

| คีย์ | ทำอะไร | sell | proof | teach | compare |
|---|---|---|---|---|---|
| `hook` | การ์ด 3 บรรทัดจากประโยคแรกของช็อตพูดแรก · `pop_words` · บรรทัดกลางแดง `#E0102A` (teach ใช้ `rise`) | ✓ | ✓ | ✓ | – |
| `card` | การ์ดปิด ≤ 4 วิ ท้ายช็อตสุดท้าย · "ติดตามไว้…" + `channel` (ว่าง = @ชื่อโปรเจกต์) · plate | ✓ | ✓ | ✓ | ✓ |
| `sub` | `captions.json auto.enabled` (ขั้น 4) + `fx.json auto_sub` (ขั้น 5) · หนา · ขอบ 3.5 · ล่างกลาง margin 300 | ✓ | ✓ | ✓ | ✓ |
| `music` | ลูปจาก `bgm_dir` (`bgm-<หมวด>-*.m4a` · เลือกคงที่ตาม crc ของชื่อโปรเจกต์) คัดลอกเข้า `.vcut/assets/` · −18 dB · duck 6 · loop | up | travel | lofi | – |
| `burst` | ช็อต ≤ `burst_max` ติดกัน ≥ 3 → zoom 1.05↔1.22 สลับทิศ + grade punch | ✓ | ✓ | – | – |
| `beat_snap` | `beat.snap` ปลายช็อตเข้าบีต → แก้ edl.json (เก็บ edl.prev.json) → ต้อง render ชิ้นที่ขยับ | – | – | – | – |

- ข้อความ HOOK มาจาก whisper ไทย **ผิดได้** — เป็นร่างให้คนดูก่อนเผา (หน้าเว็บโชว์ให้แก้)
- วลีไทยยาวไม่ถูกหั่นกลาง ลดขนาดตัวอักษรแทน (`_size_for`)
- รายการที่วางไว้อยู่ที่ `.vcut/autofx.json` · `GET /api/autofx` ส่ง settings + record ให้หน้าเว็บ
- แบบที่ active ทับ `[autofx]` ได้ (`CATALOG[i]["autofx"]` — ตอนนี้มีแค่ `rapid`)

---

## 4 · คำสั่ง · งาน · API ที่เพิ่ม

| ทาง | ชื่อ | ทำอะไร |
|---|---|---|
| CLI | `vcut variants [--ids s30,s45] [--activate ID] [--list] [-f]` | ตัด/สลับ/ดูแบบ |
| CLI | `vcut autofx` | วางชั้นแต่งลง fx.json/captions.json ตาม `[autofx]` |
| job | `variants` · `autofx` · `ai_trim` (= `ai --task trim_suggest`) | ขั้นเดี่ยว |
| job | **`quick`** = scan → thumbs → listen → silence → variants → autofx | ปุ่ม "ตัดให้เลย" ของ v3 (ขั้นที่ทำแล้วข้ามจาก cache) |
| job | `quick_ai` = quick + `ai_trim` ก่อน variants · `recut` = silence → variants → autofx | เปิด AI · เปลี่ยนสไตล์แล้วตัดใหม่ไม่ถอดเสียงซ้ำ |
| GET | `/api/variants` | `{active, default, items:[{id label note ok ready dur shots first text active stale error …}]}` |
| GET | `/variant/<id>/out` | ไฟล์ตัวอย่างของแบบ (รองรับ Range) |
| POST | `/api/variants/activate {id}` | สลับแบบ (409 ถ้ามีงานวิ่ง) |
| GET | `/api/autofx` | settings ที่จะใช้ + ของที่เคยวาง + หมวดเพลง |
| GET | `/api/state` | เพิ่ม `variant` (id ที่ active) · `autofx_style` |

ฟอร์ม (`settings.FIELDS`) รู้จักคีย์ใหม่ทั้งหมด: `talk.max_shot` · `jumpcut.auto_noise/auto_offset` ·
`compose.mode = fit` · `compose.talk_share` · `variants.ids/ai` · `autofx.*` — บันทึกผ่าน `/api/setup` ได้

---

## 5 · ลำดับที่หน้าเว็บ v3 จะเรียก

```
① วางไฟล์   POST /upload/clip ×N → POST /api/setup (สร้าง projects/<stem>.toml extends tiktok-<style>)
② สไตล์     POST /api/setup {values: autofx.* / compose.target …} → POST /api/job {step: "quick"}
            (โพล /api/job — cmd บอกว่าถึง variants/autofx หรือยัง)
③ ส่งออก    GET /api/variants → การ์ด 6 ใบ (เล่น /variant/<id>/out)
            POST /api/variants/activate {id} → POST /api/job {step: "autofx"} (ถ้าเปลี่ยนแบบ)
            แก้ชั้น: /api/fx · /api/captions ตามเดิม
            ส่งออก: /api/job build | build_text | build_fx → /out · /out-text · /out-fx
```

ด่าน: `python3 scripts/check_variants.py` (ตรรกะล้วน ไม่ยิง ffmpeg)
