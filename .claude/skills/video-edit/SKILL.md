---
name: video-edit
description: ตัดต่อวิดีโอจากฟุตเทจดิบทั้งโฟลเดอร์ด้วยเอนจิน vcut — ใช้เมื่อผู้ใช้พูดถึงการตัดต่อคลิป/ฟุตเทจ/วิดีโอเป็นภาษาไทยหรืออังกฤษ เช่น "ตัดเหลือ 10 นาที", "เล่าตามลำดับการเดินทาง", "ทำให้กระชับกว่านี้", "เอาช็อตสั่นออก", "แบ่งบท", "ปรับเสียงให้สม่ำเสมอ", "render ใหม่", "ต่อไฟล์", หรือขอแก้ EDL. Also triggers on "vcut", "edl.json", "contact sheet", "b-roll pacing".
---

# ตัดต่อวิดีโอด้วย vcut

แปลงคำสั่งภาษาคนเป็นคำสั่ง `vcut` — **อย่าเขียนสคริปต์ ffmpeg เอง** เอนจินจัดการ
rotation ผิด · คลิปกลับหัว · HEVC full range · fps ผสม · mono · เสียงเบา ให้หมดแล้ว

## กฎเหล็ก 3 ข้อ

1. **ไม่แก้ไฟล์ใน `vcut_engine/` เพื่อเปลี่ยนผลลัพธ์** — ทุกอย่างปรับได้จาก config
   ถ้าคิดว่าต้องแก้โค้ด แปลว่ายังหาคีย์ config ไม่เจอ ให้รัน `./vcut config -c <preset>` ดูก่อน
2. **`vcut ai` เสียเงินจริง · `vcut decide` ไม่เสีย** — ปรับสูตรกี่รอบก็ได้ด้วย `decide`
   เรียก `ai` ใหม่เฉพาะเมื่อโจทย์การเล่าเรื่องเปลี่ยน
3. **`render` ครั้งแรกใช้เวลา ~40 นาที** — บอกผู้ใช้ก่อนเสมอ ส่วน `assemble` ~1 นาที

## โครงสร้าง 3 ขั้น

```
ขั้น 1  เลือกฟุตเทจ   scan + thumbs          → manifest.json
ขั้น 2  เตรียมวิดีโอ  listen + ai + prepare  → pool.json   (คลังชิ้น)
ขั้น 3  รวมเป็นหนัง   compose + render       → edl.json → final.mp4
```

`prepare` ดูทีละคลิป · `compose` ดูทั้งกอง — สองงานคนละเรื่อง แยกไฟล์กัน
`vcut decide` = ทำสองอันต่อกัน (คำสั่งเดิม ยังใช้ได้)

**7 วิธีเลือกในขั้น 3** — `--mode`:
`all` · `pattern` · `budget` · `numbers` · `timerange` · `manual` · `ai`

```bash
./vcut compose --mode pattern --set compose.pattern=TALK,BROLL,BROLL --set compose.target_minutes=10
./vcut compose --mode budget --set compose.talk_minutes=6 --set compose.broll_minutes=4
./vcut compose --mode numbers --set compose.numbers=7068-7200
./vcut compose --ask --context "เล่าตามลำดับการเดินทาง"
```

`manual` กับ `ai` เลือกชิ้นและลำดับมาเองแล้ว — `broll.run_max` จะไม่ไปทับ

## ทำอะไรก่อน

```bash
./vcut info -c <preset>       # ดูก่อนทุกครั้ง — บอกว่าขั้นไหนทำไปแล้ว
./vcut presets                # ดูสูตรที่มี
./vcut config -c <preset>     # ดูค่า config ที่ merge เสร็จแล้ว
```

## แปลคำสั่ง → คำสั่ง vcut

| ผู้ใช้พูดว่า | ทำอะไร |
|---|---|
| "ตัดเหลือ N นาที" | `decide --set select.enabled=true --set select.target_minutes=N` |
| "เล่าตามลำดับการเดินทาง" / "แบ่งบท" | ต้องใช้ AI → ดูหัวข้อถัดไป |
| "กระชับกว่านี้" / "ตัดถี่ขึ้น" | `--set talk.gap_merge=1.0 --set talk.min_shot=2.5` |
| "อย่าตัดถี่" / "ให้พูดจบประโยค" | `--set talk.gap_merge=2.0 --set talk.min_shot=6.0` |
| "เอาช็อตสั่นออก" | `--set broll.drop_above_motion=18` |
| "วิวติดกันเยอะไป" | `--set broll.run_max=2` |
| "วิวสั้นไป" | `--set broll.durations=5.0,4.0,2.0` (ต้องมี = motion_bands + 1 ค่า) |
| "เสียงพูดดังไม่เท่ากัน" | `--set audio.compressor=true` หรือเพิ่ม `audio.allow_limit` |
| "เสียงซ่า/มีลม" | `--set audio.denoise=true` |
| "สลับลำดับ / เอาช็อตนี้ออก" | แก้ `.vcut/edl.json` ตรง ๆ แล้ว `render` + `assemble` — **ไม่ต้อง encode ใหม่** |
| "ขอดูเอง" / "เปิดหน้าเว็บ" / "อยากเลือกช็อตเอง" | `./vcut view -c <preset>` แล้วบอก URL |
| "ดูผลก่อนได้ไหม" | `./vcut decide` แล้วอ่านสรุป — ยังไม่ต้อง render |

หลังปรับค่าทุกครั้ง: `decide` → รายงานผล → ถามผู้ใช้ก่อนค่อย `render`

## เมื่อผู้ใช้ดูหนังที่ตัดแล้วและไม่พอใจ

คำขอที่มาหลังมีไฟล์แล้ว — "ช่วงกลางยืดไป" · "ตรงนี้พูดซ้ำ" · "เปิดเรื่องช้า" —
ใช้ `vcut review` ไม่ใช่ `vcut ai` (คนละบทบาท คนละตำแหน่งในไปป์ไลน์)

```bash
./vcut review -c <preset> --context "<คำของผู้ใช้ คำต่อคำ>"
```

เสนอได้แค่ **เอาออก** กับ **สลับลำดับ** ซึ่งไม่ต้อง render ใหม่ — รับข้อเสนอแล้ว
`render` + `assemble` จบในไม่ถึงนาที ผู้ใช้กดรับทีละข้อได้ที่หน้า `/`

ถ้าผู้ใช้อยากให้ตัดหัวท้ายช็อตหรือดึงช็อตใหม่เข้ามา — `review` ทำไม่ได้
ต้องกลับไปที่ `decide` + config หรือ `vcut ai`

## เมื่อโจทย์ต้องใช้ความเข้าใจเนื้อเรื่อง

กฎในเอนจินไม่รู้ว่าเรื่องเล่าถึงไหน — คำขอพวกนี้ต้องผ่าน `vcut ai`:

- "เล่าตามลำดับการเดินทาง" · "แบ่งเป็นบท" · "เอาช่วงที่พูดวนซ้ำออก"
- "เก็บเฉพาะตอนที่เล่าอะไรใหม่" · "ช็อตไหนสวยที่สุด"

```bash
./vcut thumbs -c story-ai                    # ต้องมีก่อน AI ถึงจะเห็นภาพ
./vcut ai -c story-ai --goal "<โจทย์ของผู้ใช้ คำต่อคำ>"
./vcut decide -c story-ai                    # อ่าน ai.json ไม่เรียก AI ซ้ำ
```

`vcut ai` เขียนได้ไฟล์เดียวคือ `.vcut/ai.json` (บท · คะแนน 0–1 ต่อคลิป · ช่วงที่ควรเก็บ)
การตัดสินใจจริงอยู่ที่ `decide.py` ตามกฎใน `[ai.apply]` — ปรับน้ำหนักได้:

```bash
./vcut decide -c story-ai --set ai.apply.score_weight=0.3   # เชื่อ AI น้อยลง
./vcut decide -c story-ai --set ai.apply.order=false        # ไม่เอาลำดับบทของ AI
./vcut decide -c story-ai --set ai.enabled=false            # ปิด AI กลับไปใช้กฎล้วน
```

เลือกเฉพาะบางงานได้: `--task story_arc` · `--task shot_scoring` · `--task trim_suggest`
ทำใหม่ทั้งหมด: `-f`

## หน้าเว็บ

```bash
./vcut view -c <preset>      # http://127.0.0.1:8765 — หน้าเดียว 3 ขั้น
```

รันเป็น background process แล้วบอก URL — **อย่ารอให้คำสั่งจบ** เพราะมันไม่จบเอง

หน้าเดียวจบ: ขั้น 1 เลือกฟุตเทจ · ขั้น 2 เตรียมวิดีโอ (เห็นคลังแยกพูด/วิว) ·
ขั้น 3 รวมเป็นหนัง (7 วิธีเลือก + ไทม์ไลน์ + AI ติชม) แผงขวาบอกทันทีว่าแก้ค่านั้น
แล้วต้อง render ใหม่กี่ชิ้น กี่นาที ก่อนลงมือจริง

ถ้าผู้ใช้ถามว่า "แก้ค่านี้แล้วจะเสียเวลาเท่าไร" ตอบได้เองโดยไม่ต้องเปิดหน้าเว็บ:

```bash
python3 -c "import sys;sys.path.insert(0,'.')
from vcut_engine import config, settings
print(settings.estimate(config.Ctx(config.load('<preset>',['talk.min_shot=6']))))"
```

ไม่เรียก ffmpeg เลย ตอบใน 0.02 วินาที

## ทำครบวงจร

```bash
./vcut run -c <preset>                # ทำตามแผนใน [run] — พิมพ์แผนออกมาก่อนเสมอ
./vcut run -c <preset> --from compose # ข้ามขั้นที่ทำไปแล้ว
```

`vcut run` เลือกได้ทีละ Phase จาก `[run]` ในไฟล์โปรเจกต์ — ปิดไว้ = ข้ามไปใช้ของเดิม

```toml
[run]
source  = true   # ขั้น 1 · scan + thumbs
prepare = true   # ขั้น 2 · listen + ai + prepare
compose = true   # ขั้น 3 · compose + render + assemble
```

`run.prepare = false` ≠ `ai.enabled = false` — อันแรกคือไม่ทำขั้น 2 ใหม่แต่ยังใช้
`pool.json` เดิม อันหลังคือไม่เอาความเห็น AI ไปใช้เลย

## อ่านผลให้ผู้ใช้ฟัง

หลัง `decide` สรุปให้ครบ 4 อย่าง: **ความยาวรวม · จำนวนชิ้น (พูด/วิว) · จำนวนบท ·
แถววิวติดกันยาวสุด** ถ้ามีบรรทัด `SELECT ข้าม` แปลว่า `target_minutes` ไม่ได้ผล
เพราะไทม์ไลน์สั้นกว่าเป้าอยู่แล้ว — บอกผู้ใช้ตรง ๆ อย่าปล่อยผ่าน

`target_minutes` เป็น **เพดาน ไม่ใช่การรับประกัน** ถ้าได้สั้นกว่าเป้ามาก แปลว่า
B-roll ที่ผ่านตัวกรองมีไม่พอ → เพิ่ม `select.talk_ratio` หรือคลาย
`broll.drop_above_motion` / `broll.drop_below_bright`

## ข้อควรระวัง

- อย่าปิด `audio.limiter_level_disabled` — ออปชัน `level` ของ `alimiter` จะ
  auto-normalize ทับค่า gain ที่คำนวณมา แล้ว true peak ทะลุ 0 dBFS
- เปลี่ยนค่าใน `[encode]` แล้ว **ต้อง render ใหม่ทั้งหมด** เพราะ `assemble`
  ต่อไฟล์แบบ stream copy ซึ่งต้องการพารามิเตอร์เดียวกันทุกชิ้น
- `[listen] workers` ห้ามเกิน 1 บนเครื่อง RAM 8 GB
- ดิสก์ต้องเหลือ > 5 GB ก่อน render (`vcut gc` ล้าง segment ที่ไม่ได้ใช้)
- commit `.vcut/edl.json` + `.vcut/ai.json` เข้า git ได้ → reproduce ผลได้ 100%
