# ทำ vcut เป็นแอป — Mac · Windows · iOS

เอกสารนี้วิเคราะห์ว่า vcut_engine ที่มีอยู่ตอนนี้ **ห่อเป็นแอปได้แค่ไหน** บนแต่ละ
แพลตฟอร์ม ต้องแก้อะไรบ้าง และทางไหนคุ้มที่จะเดิน

> อ่านคู่กับ [README.md](README.md) (เอนจินทำงานอย่างไร) และ
> [vcut README.md](vcut%20README.md) (คู่มือใช้งาน)

> อัปเดต 25 ส.ค. 2026 — เพิ่ม [ข้อ 3](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา) เรื่องหน้าเว็บ
> Next.js ที่เข้ามาแทน `viewer/index.html` และตรวจเลขบรรทัดที่อ้างถึงใหม่ทั้งไฟล์

**สรุปหนึ่งบรรทัด:** Mac กับ Windows ห่อได้ใน 2–3 สัปดาห์จาก codebase เดียว ·
หน้าเว็บ Next.js ที่เพิ่มเข้ามาไม่ได้ทำให้ยากขึ้น เพราะมันเป็น build step ไม่ใช่ runtime ·
iOS เป็นแอปเดี่ยวไม่ได้เพราะระบบห้ามสิ่งที่เป็นแกนของการออกแบบนี้ ต้องเป็น client

---

## สารบัญ

1. [ตอนนี้มันเป็นอะไรอยู่](#1-ตอนนี้มันเป็นอะไรอยู่)
2. [ตารางความยากรายแพลตฟอร์ม](#2-ตารางความยากรายแพลตฟอร์ม)
3. [ชั้นหน้าเว็บ Next.js ที่เพิ่มเข้ามา](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา)
4. [ห้าทางที่เป็นไปได้](#4-ห้าทางที่เป็นไปได้)
5. [สิ่งที่ต้องแก้จริงเพื่อไป Windows](#5-สิ่งที่ต้องแก้จริงเพื่อไป-windows)
6. [ทำไม iOS ถึงเป็นคนละเรื่อง](#6-ทำไม-ios-ถึงเป็นคนละเรื่อง)
7. [แผนที่เสนอ](#7-แผนที่เสนอ)
8. [ข้อสรุปที่ต้องพูดให้ตรง](#8-ข้อสรุปที่ต้องพูดให้ตรง)

---

## 1. ตอนนี้มันเป็นอะไรอยู่

vcut **เป็น local web app อยู่แล้ว** ซึ่งบังเอิญเป็นรูปแบบที่ห่อเป็นแอปเดสก์ท็อป
ได้ง่ายที่สุด:

```
[vcut-ui/          Next.js 16 + React 19 · 7,925 บรรทัด · client ล้วน]  ← หน้าหลักวันนี้
[viewer/index.html  479 KB · 7,523 บรรทัด · ไฟล์เดียว]                  ← ของเดิม ยังเสิร์ฟอยู่
                    ↑ HTTP   /engine/* → /api/*
        [serve.py  ThreadingHTTPServer · stdlib ล้วน · 1,475 บรรทัด]
                    ↑ subprocess   [sys.executable, ./vcut, <คำสั่ง>]
        [vcut_engine/  27 โมดูล · 11,701 บรรทัด · stdlib ล้วน]
                    ↑ subprocess
      ffmpeg · ffprobe · whisper-cli · claude (CLI) · yt-dlp
                    ↑
              .vcut/*.json   ← สถานะทั้งหมดของระบบ
```

### สามอย่างที่ทำให้ห่อง่าย

| | ทำไมถึงสำคัญ |
|---|---|
| **หน้าเว็บไม่มีฝั่งเซิร์ฟเวอร์เลย** | ทั้งสองชุดกลายเป็นไฟล์ static ได้ — `viewer/index.html` เป็นอยู่แล้ว ส่วน vcut-ui เป็น client ล้วน ไม่มี API route ไม่มี server action (ดู [ข้อ 3](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา)) |
| **สถานะทั้งหมดเป็นไฟล์ JSON** | ไม่มี DB ไม่มี migration ไม่มี state ในหน่วยความจำที่ต้องย้าย |
| **เอนจินเป็น stdlib ล้วน** | ไม่มี dependency tree ที่จะพังตอน bundle — แค่ Python 3.11 กับ ffmpeg |

### หนึ่งอย่างที่ตัดสินทุกอย่าง

ทั้งระบบตั้งอยู่บนสมมติฐานเดียว: **spawn โปรเซสลูกได้**

บน macOS/Windows สมมติฐานนี้จริง — บน iOS มัน **ผิด** และผิดในระดับที่แก้ไม่ได้
ด้วยการเขียนโค้ดเพิ่ม เพราะเป็นข้อจำกัดของ OS ไม่ใช่ของโค้ด

---

## 2. ตารางความยากรายแพลตฟอร์ม

| ความสามารถที่เอนจินต้องใช้ | macOS | Windows | iOS / iPadOS |
|---|---|---|---|
| Python 3.11 runtime | ✅ ฝังได้ (python-build-standalone) | ✅ ฝังได้ | ⚠️ ฝังได้ แต่ห้ามโหลดโค้ดใหม่จากเน็ต |
| Node.js + `next build` | ✅ **ตอน build เท่านั้น** | ✅ **ตอน build เท่านั้น** | ✅ static ที่ได้ไม่ต้องมี Node ตอนรัน |
| `subprocess` เรียกไบนารีภายนอก | ✅ | ✅ | ❌ **ระบบบล็อก fork/exec** |
| ffmpeg / ffprobe เป็น CLI | ✅ | ✅ | ❌ ต้องลิงก์เป็น library |
| ฟิลเตอร์ `ass` (libass + harfbuzz) | ✅ `ffmpeg-full` | ✅ build ของ gyan.dev | ⚠️ ต้องคอมไพล์เอง |
| whisper.cpp | ✅ | ✅ | ✅ (เป็น lib + Metal ได้) |
| `h264_videotoolbox` | ✅ | ❌ ต้องเปลี่ยน encoder | ✅ ผ่าน API |
| ฟอนต์ไทย `Sukhumvit Set` | ✅ มากับเครื่อง | ❌ ไม่มี | ⚠️ มี แต่ลิขสิทธิ์คนละเรื่อง |
| ลิขสิทธิ์ x264 (GPL) | ✅ นอกสโตร์ | ✅ นอกสโตร์ | ❌ **GPL ขัดกับเงื่อนไข App Store** |
| **สรุป** | **ห่อได้เลย** | **แก้ ~8 จุด** | **คนละโปรเจกต์** |

---

## 3. ชั้นหน้าเว็บ Next.js ที่เพิ่มเข้ามา

เอกสารรุ่นแรกเขียนตอนที่หน้าเว็บยังเป็น `viewer/index.html` ไฟล์เดียว — ตอนนี้ไม่ใช่แล้ว
หน้าหลักคือ [vcut-ui/](vcut-ui/) · Next.js 16 + React 19 · 26 ไฟล์ · 7,925 บรรทัด
(ไฟล์เดิมยังอยู่และยังถูกเสิร์ฟที่ `/` แต่ไม่ได้พัฒนาต่อ)

**ข้อสรุปทุกข้อของเอกสารนี้ยังใช้ได้** เพราะสิ่งที่เพิ่มเข้ามาเป็น *build step*
ไม่ใช่ *runtime dependency* — แอปที่ส่งถึงผู้ใช้ไม่ต้องมี Node.js อยู่ในเครื่อง

| ข้อเท็จจริงจากโค้ด | ผลต่อการห่อเป็นแอป |
|---|---|
| ไม่มี API route · ไม่มี server action สักตัว | Next ทำหน้าที่แค่ bundler — `next build` แล้วได้ไฟล์ static ล้วน |
| ทุกไฟล์ที่ถือ state ประกาศ `"use client"` | ไม่มีอะไรต้องรันฝั่งเซิร์ฟเวอร์ตอนใช้งานจริง |
| browser API ที่ใช้จริงมีแค่ `window.addEventListener` กับ `window.innerWidth` — ไม่มี `localStorage` ไม่มี `AudioContext` ไม่มี File System Access | ไม่ต้องกลัวว่า WKWebView (Mac) กับ WebView2 (Windows) รองรับไม่เท่ากัน |
| `public/` 24 MB (bgm 17 · stickers 5.7 · sfx 1.3) | สังเคราะห์เองด้วย numpy ตอน build ([gen_bgm.py](vcut-ui/scripts/gen_bgm.py) · [gen_sfx.py](vcut-ui/scripts/gen_sfx.py)) — ไม่มีลิขสิทธิ์ และ **numpy ไม่ใช่ dependency ตอนรัน** |
| จุดต่อกับเอนจินอยู่บรรทัดเดียว | [lib/api.ts:3](vcut-ui/lib/api.ts#L3) — `export const engine = "/engine"` |

### สี่จุดที่ต้องแก้เพราะ Next.js

| # | จุด | ปัญหา | ทางแก้ |
|---|---|---|---|
| **N1** | [vcut-ui/next.config.ts](vcut-ui/next.config.ts) | proxy `/engine/*` ทำด้วย `rewrites()` ซึ่งเป็นความสามารถของ **Next server เท่านั้น** — พอสั่ง `output: "export"` ทุกคำขอ `/engine/*` จะกลายเป็น 404 ทันที | ให้ [serve.py](vcut_engine/serve.py) เสิร์ฟไฟล์ static ที่ export ออกมาเอง (แก้ route `/` ให้ชี้โฟลเดอร์ `out/` แทน `VIEWER`) แล้วรับ `/engine/*` เป็นชื่ออื่นของ `/api/*` — **ทำแบบนี้แล้วไม่ต้องแตะ CORS และไม่ต้องแตะ Host guard เลย** |
| **N2** | [serve.py:797](vcut_engine/serve.py#L797) | ทางตรงข้ามของ N1 คือให้ webview ยิงไป `http://127.0.0.1:<port>` ตรง ๆ — ต้องเพิ่ม CORS ทั้งชุด และ `_guard()` จะตอบ 403 ให้ Tauri ทันทีเพราะมันส่ง `Host: tauri://localhost` | เลี่ยงด้วย N1 · ถ้าจำเป็นจริงค่อยเติม origin ที่อนุญาตแบบระบุชัด อย่าเปิดกว้าง |
| **N3** | [serve.py:1461](vcut_engine/serve.py#L1461) | พอร์ต 8765 ตายตัว — เปิดสองหน้าต่างหรือมีของอื่นจองพอร์ตอยู่ก็สตาร์ตไม่ขึ้น | bind พอร์ต `0` แล้วพิมพ์พอร์ตจริงออก stdout ให้ตัวห่ออ่านไปเปิด webview |
| **N4** | [serve.py:1438](vcut_engine/serve.py#L1438) | โปรเจกต์ถูกล็อกตั้งแต่ตอนสตาร์ต (`-c projects/x.toml`) ไม่มี API เปลี่ยน → เมนู "เปิดโปรเจกต์…" ของแอปเดสก์ท็อปทำไม่ได้ | ให้ตัวห่อ restart sidecar ด้วย config ใหม่ (ง่ายสุด) หรือเพิ่ม `POST /api/project` ที่สร้าง `Ctx` ใหม่ |

### ⚠️ ห้าม freeze เอนจินด้วย PyInstaller

[serve.py:1329](vcut_engine/serve.py#L1329) และอีก 3 จุด spawn ตัวเองด้วย
`[sys.executable, str(ctx.launcher), ...]` — ถ้า freeze แล้ว `sys.executable` จะกลายเป็น
ตัวแอปเอง ไม่ใช่ python ทำให้ **ทุกปุ่มที่สั่งงานในหน้าเว็บพังพร้อมกันหมด**
ต้องฝัง Python จริง (python-build-standalone) เท่านั้น

---

## 4. ห้าทางที่เป็นไปได้

### ทาง A — ห่อของเดิมด้วย Tauri / Electron → Mac + Windows ★

**แรง: 2–3 สัปดาห์ · ความเสี่ยง: ต่ำ · ได้ 2 ใน 3 แพลตฟอร์ม**

ตัวห่อทำแค่ 3 อย่าง:

1. สตาร์ต `serve.py` เป็น sidecar (พอร์ตสุ่ม ไม่ใช่ 8765 ตายตัว — [N3](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา))
2. เปิด webview ชี้ `127.0.0.1:<port>` ซึ่งเสิร์ฟทั้งไฟล์ static ของ vcut-ui และ `/api/*`
   จาก origin เดียวกัน ([N1](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา))
3. ปิดโปรเซสลูกให้สะอาดตอนออก — รวมถึง ffmpeg ที่ `serve.Job` spawn ไว้

โครงร่างที่ต้อง bundle:

```
vcut.app/  (หรือ vcut/ บน Windows)
  python/          python-build-standalone        ~40 MB
  bin/ffmpeg       build ที่คอมไพล์ libass มาด้วย  ~80 MB
  bin/ffprobe
  bin/whisper-cli  + ggml model (small)          ~150 MB
  fonts/           Noto Sans Thai + fonts.conf     ~1 MB
  ui/              ผลของ `next build` (static)     ~25 MB
  vcut_engine/  viewer/  config/
```

รวมที่ผู้ใช้ต้องโหลด ~300 MB — ตัวใหญ่คือ whisper model กับ ffmpeg ไม่ใช่โค้ดของเรา

เลือกตัวห่อ:

| | ขนาดตัวห่อ | ข้อดี | ข้อควรระวัง |
|---|---|---|---|
| **Tauri** | ~10 MB | เบา · signing/updater มาให้ | ใช้ WebView ของ OS → WKWebView กับ WebView2 ไม่เหมือนกันเป๊ะ · ต้องระวัง Host guard ([N2](#3-ชั้นหน้าเว็บ-nextjs-ที่เพิ่มเข้ามา)) |
| **Electron** | ~150 MB | Chromium ตัวเดียวกันทั้งสอง OS → หน้าเว็บทั้งสองชุดไม่มีเซอร์ไพรส์ | อ้วน |
| **pywebview** | ~5 MB | เขียน Python ล้วน ต่อจากของเดิมได้ทันที | UX ระดับ "โปรแกรมที่มี" ไม่ใช่ "แอปที่ขาย" |

ทั้งสามตัวไม่ต้องแบก Node.js ไปด้วย เพราะ `next build` เกิดขึ้นบนเครื่องที่ปั้นแอป
ไม่ใช่บนเครื่องผู้ใช้

**ผลลัพธ์: Mac + Windows จาก codebase เดียว และหน้าเว็บที่ทำมาทั้งหมดใช้ต่อได้ 100%**

---

### ทาง B — เปลือกเนทีฟ + เอนจิน Python เป็น sidecar

**แรง: 2–3 เดือน/แพลตฟอร์ม · ความเสี่ยง: ปานกลาง**

SwiftUI สำหรับ Mac · WinUI 3 สำหรับ Windows คุยกับ `serve.py` ผ่าน HTTP เดิม
ได้ drag-drop จริง · Finder/Explorer integration · เมนูบาร์ · ไทม์ไลน์ที่ลื่นกว่า HTML

**คุ้มก็ต่อเมื่อ** ไทม์ไลน์กับพรีวิวของขั้น 4/5 เริ่มอืดจน HTML รับไม่ไหว —
ตอนนี้ยังไม่มีสัญญาณนั้น ตรงกันข้าม vcut-ui ทำไทม์ไลน์ 6 เลเยอร์
([Timeline.tsx](vcut-ui/components/Timeline.tsx) 653 บรรทัด) กับพรีวิวที่ลากจัดตำแหน่งได้
([Preview.tsx](vcut-ui/components/Preview.tsx) 791 บรรทัด) ไปแล้วบน HTML ล้วน —
เดินทางนี้แปลว่าต้องเขียนสองอย่างนั้นใหม่ทั้งหมด แล้วดูแล UI สองชุดตลอดไป

---

### ทาง C — เขียนเอนจินใหม่เป็น Go / Rust

**แรง: 3–4 เดือน · ประโยชน์: น้อย — ไม่แนะนำ**

จะได้ไฟล์เดียวไม่ต้องแบก Python runtime แต่ 11,701 บรรทัดที่มีอยู่ทำอยู่แค่
*ประกอบสตริง + regex แกะตัวเลข + เขียน JSON* ซึ่งเป็นสิ่งที่ Python ทำได้ดีอยู่แล้ว
งานหนักทั้งหมดอยู่ใน ffmpeg ที่เป็น C อยู่แล้ว — เขียนใหม่ไม่ได้เร็วขึ้นเลยสักนิด

เหตุผลเดียวที่จะทำคือถ้าจะไป iOS จริง ๆ (ดูทาง E)

---

### ทาง D — เอนจินเป็นเซิร์ฟเวอร์ + iOS เป็น thin client ★

**แรง: 1–2 เดือนสำหรับ client · นี่คือทางเดียวที่ iOS เกิดได้ในเวลาที่รับได้**

```
[Mac / mini PC / VPS]  เอนจินเต็ม ทำงานหนักทั้งหมด
        │  HTTP + WebSocket
        ├── iPhone / iPad   ดูคลัง · ติ๊กเอา-ไม่เอา · ลากไทม์ไลน์ · กด render · ดูผล
        └── Mac / Windows   vcut-ui ตัวเดิม ไม่ต้องแก้อะไร
```

เหมาะกับความจริงของงานนี้มาก — ฟุตเทจ 3.1 GB · `render` ครั้งแรก ~40 นาที ไม่ใช่
งานที่ควรอยู่บนมือถืออยู่แล้ว มือถือทำหน้าที่ที่มันเก่ง: **ตัดสินใจกับดูผล**
ส่วนเครื่องใหญ่ลงมือ

โดยเฉพาะ iPad จะเป็นอุปกรณ์ที่ดีมากสำหรับสองขั้นที่นิ้วทำได้ดีกว่าเมาส์:

```
ขั้น 1  ติ๊กเลือกคลิปทีละตัว · หมุนคลิป · ลากสลับลำดับ
ขั้น 3  ลากไทม์ไลน์จัดลำดับ · ติ๊กรับข้อเสนอของ AI
```

⚠️ **มีงานความปลอดภัยจริงที่ต้องเพิ่มก่อน** — ตอนนี้ `serve.py` ผูก `127.0.0.1`
อย่างเดียวและตรวจ `Host` ทุก request **โดยเจตนา** ไม่มี login เพราะไม่ต้องมี
การเปิดออกนอก loopback แปลว่าต้องสร้างใหม่ทั้งชั้น:

| ต้องเพิ่ม | เพราะ |
|---|---|
| token / auth จริง | ทุกปุ่มในหน้าเว็บ spawn โปรเซสได้ = RCE ถ้าไม่มีชั้นกั้น |
| TLS | สตรีมวิดีโอกับ transcript วิ่งผ่านเน็ตแล้ว |
| rate limit + งานพร้อมกันได้ทีละหนึ่ง | เอกสารเตือนไว้แล้วว่าอย่าสั่งงานพร้อมกันสองหน้าต่าง มันเขียน `.vcut/` ชุดเดียวกัน |
| จำกัด path ที่เสิร์ฟได้ | ตอนนี้ `SAFE_NAME` กันได้ระดับหนึ่ง แต่ออกแบบมาสำหรับ loopback |

---

### ทาง E — iOS เนทีฟเต็มรูป

**แรง: 6–12 เดือน · ความเสี่ยง: สูงมาก — ไม่แนะนำ**

ต้องทิ้งแทบทุกอย่างที่ [README.md](README.md) อธิบายว่าเป็นหัวใจของการออกแบบ:

| ตอนนี้ | บน iOS ต้องเป็น |
|---|---|
| `subprocess` เรียก ffmpeg | ลิงก์ libavcodec/libavfilter เป็น xcframework เอง (FFmpegKit เลิก maintain แล้ว) |
| `build_vfilter()` ประกอบสตริงส่ง ffmpeg | AVMutableVideoComposition + Core Image หรือเรียก libavfilter ผ่าน C API |
| ฟิลเตอร์ `ass` ของ libass | คอมไพล์ libass + harfbuzz + fribidi เข้า app — ทำได้ แต่หนัก |
| `-f concat -c copy` | AVAssetExportSession — ไม่มี stream-copy concat ที่เทียบเท่าตรง ๆ |
| ดัก stderr ด้วย regex (motion · LUFS · silence) | ต้องหาทางวัดใหม่ทั้งหมด — `ebur128` กับ `silencedetect` เป็น filter ของ ffmpeg |
| `claude` CLI | เรียก Anthropic API ตรง |
| `ThreadPoolExecutor` นั่งรอ subprocess | GCD + ต้องรับมือ thermal throttling ของมือถือ |
| ไฟล์ 3.1 GB ใน `.vcut/segments/` | sandbox + พื้นที่เครื่อง + iOS ฆ่าแอปที่กินแรมเยอะตอนอยู่เบื้องหลัง |

**และตัวที่ฆ่าโปรเจกต์คือลิขสิทธิ์:** x264 เป็น GPL ซึ่งเข้ากันไม่ได้กับเงื่อนไข
App Store ต้อง build ffmpeg แบบ LGPL ที่ไม่มี x264 แล้วเข้ารหัสด้วย VideoToolbox แทน
— ทำได้ แต่เป็นงานที่ต้องรู้จริงเรื่อง build system ของ ffmpeg

---

## 5. สิ่งที่ต้องแก้จริงเพื่อไป Windows

ไล่จากโค้ดจริง ไม่ใช่การเดา — **ทั้งหมดนี้แก้ได้ในไม่กี่วัน**

| # | จุด | ปัญหา | ทางแก้ |
|---|---|---|---|
| 1 | [render.py:189](vcut_engine/render.py#L189) · [settings.py:353](vcut_engine/settings.py#L353) · [config/default.toml:212](config/default.toml#L212) | `h264_videotoolbox` เป็น macOS อย่างเดียว | เลือก default ตาม OS: `h264_nvenc` / `h264_qsv` / `h264_amf` / fallback `libx264` |
| 2 | [caption.py:102-103](vcut_engine/caption.py#L102) | ฮาร์ดโค้ด `/opt/homebrew/...` ตอนหา ffmpeg ที่มีฟิลเตอร์ `ass` | ทำ resolver แยกตาม OS — Windows ใช้ build ของ gyan.dev ที่มี libass มาแล้ว |
| 3 | [caption.py:34](vcut_engine/caption.py#L34) · [fx.py:144](vcut_engine/fx.py#L144) · [fxtext.py:411](vcut_engine/fxtext.py#L411) · [journey.py:48](vcut_engine/journey.py#L48) | ฟอนต์ตั้งต้น `Sukhumvit Set` ไม่มีบน Windows → libass fallback แล้วสระ/วรรณยุกต์เพี้ยน (มี 4 จุดที่ฮาร์ดโค้ดชื่อนี้ ต้องแก้ให้ครบ) | bundle **Noto Sans Thai** ไปกับแอป + ตั้ง `FONTCONFIG_FILE` ให้ libass เห็น |
| 4 | [caption.py:535](vcut_engine/caption.py#L535) | `-vf ass='{fpath}'` — path Windows มี `\` และ `C:` ซึ่งตัวแยกฟิลเตอร์ของ ffmpeg กินเอง | escape เป็น `C\:/path/x.ass` หรือ `cwd` เข้าโฟลเดอร์แล้วใช้ path สัมพัทธ์ |
| 5 | [util.py:70](vcut_engine/util.py#L70) · [serve.py:189](vcut_engine/serve.py#L189) | `text=True` **ไม่ระบุ encoding ทั้งสองจุด** → Windows ใช้ locale (cp874) → ชื่อไฟล์/log ภาษาไทยเพี้ยนทั้งระบบ รวมถึง log ที่ไหลขึ้นหน้าเว็บ | ใส่ `encoding="utf-8", errors="replace"` ทุกจุดที่เรียก subprocess |
| 6 | [listen.py:86](vcut_engine/listen.py#L86) · [provider.py:134](vcut_engine/provider.py#L134) · [music.py:270](vcut_engine/music.py#L270) | สมมติว่า `whisper-cli` / `claude` / `yt-dlp` อยู่ใน PATH — สองตัวแรกมีช่อง config ให้ชี้ path เต็มอยู่แล้ว (`listen.binary` · `ai.binary`) แต่ `yt-dlp` เรียกผ่าน `shutil.which` ตรง ๆ ไม่มีช่องให้ตั้ง | ตั้ง default ของ `*.binary` ให้ชี้ `bin/` ในแอป + เพิ่มช่อง config ให้ yt-dlp |
| 7 | [serve.py:174](vcut_engine/serve.py#L174) | `proc.terminate()` บน Windows ไม่ลามถึงลูกของลูก → ffmpeg กลายเป็นลูกกำพร้ากินซีพียูต่อ | ใช้ Job Object บน Windows หรือ `taskkill /T /F /PID` |
| 8 | [vcut README.md](vcut%20README.md) | เอกสารสอน `pkill` · `lsof` · `pgrep` | ตัวห่อจัดการวงจรชีวิตโปรเซสให้เอง — ปัญหาหายไปเอง เหลือแค่แก้เอกสาร |

### สิ่งที่ไม่ต้องแก้เลย

```
pathlib ทุกจุด              ·  content-hash cache (seg_key)
โครงสร้าง JSON ทั้งหมด       ·  ระบบ preset / config merge
viewer/index.html           ·  ตรรกะ prepare / compose / render / fx
vcut-ui ทั้ง 7,925 บรรทัด    ·  ThreadPoolExecutor
schema ของ settings.py      ·  Progress bar parsing
```

**คิดเป็นเกินกว่า 90% ของโค้ด** — เพราะหลักการ "Python เป็นสมอง ffmpeg เป็นกล้ามเนื้อ"
ทำให้ส่วนที่ผูกกับ OS มีน้อยมากตั้งแต่ต้น

---

## 6. ทำไม iOS ถึงเป็นคนละเรื่อง

ไม่ใช่เพราะโค้ดเขียนไม่ดี แต่เพราะ **iOS ห้ามสิ่งที่เป็นแกนของการออกแบบนี้พอดี**

```
หลักการของ vcut                          ข้อห้ามของ iOS
───────────────────────────────────      ─────────────────────────────
"ไม่มี library ภายนอกเลย                ห้าม fork/exec ไบนารีอื่น
 เรียก CLI ผ่าน subprocess แทน"          → CLI ทั้ง 4 ตัวใช้ไม่ได้ทันที

"ให้ ffmpeg ลงมือทำแทน"                  ffmpeg ต้องเป็น .xcframework
                                          → เลิกเป็นสตริง กลายเป็น C API

"ffmpeg ตัวไหนก็ได้ที่มี libass"          ต้องคอมไพล์เองทั้ง toolchain
                                          → และเลี่ยง GPL ให้ได้ด้วย
```

จุดที่ต้องเข้าใจ: **สิ่งที่ทำให้เอนจินนี้แข็งแรงบนเดสก์ท็อป คือสิ่งเดียวกันที่
ทำให้มันลง iOS ไม่ได้** ไม่มีทางได้ทั้งสองอย่าง

ทางที่รักษาสิ่งที่สร้างมาไว้ได้ครบคือ **ให้ iOS เป็นหน้าจอ ไม่ใช่เครื่องจักร** (ทาง D)

---

## 7. แผนที่เสนอ

### เฟส 1 — Mac + Windows (2–3 สัปดาห์)

```
1. แก้ N1–N4 ของข้อ 3 — เสิร์ฟ static จาก serve.py · พอร์ตสุ่ม · เปิดโปรเจกต์ได้
2. แก้ 8 จุดในตารางข้อ 5 ให้เอนจินรันบน Windows ได้  (ทดสอบด้วย CLI ล้วน)
3. ห่อด้วย Tauri — sidecar + webview + จัดการโปรเซสลูก
4. bundle ffmpeg(libass) · whisper-cli + model · Noto Sans Thai · python · ui/
5. code signing + notarization (Mac) · code signing (Windows)
```

| งาน | แรง |
|---|---|
| N1–N4 (Next static · พอร์ต · เปิดโปรเจกต์) | 2–3 วัน |
| 8 จุดฝั่ง Windows + ทดสอบด้วย CLI ล้วน | 3–5 วัน |
| ห่อ Tauri + bundle ของทั้งหมด | 3–5 วัน |
| signing + notarization | 2–3 วัน |

**เกณฑ์ว่าเสร็จ:** ฟุตเทจชุดเดียวกันรันบน Mac กับ Windows แล้วได้ `edl.json`
ตรงกันทุกชิ้น (ส่วน `final.mp4` จะไม่ไบต์ต่อไบต์เท่ากันเพราะคนละ encoder)

**ลำดับสำคัญ:** ทำข้อ 1 ก่อนเสมอ — ตราบใดที่หน้าเว็บยังต้องพึ่ง `next dev`
เป็น proxy อยู่ จะทดสอบตัวห่อจริงไม่ได้เลย

### เฟส 2 — iOS / iPadOS เป็น client (1–2 เดือน)

```
1. เพิ่มชั้น auth + TLS + rate limit ให้ serve.py  ← ทำก่อนทุกอย่าง
2. แยก API ออกจากหน้าเว็บให้ชัด (ตอนนี้ /api/* กับ lib/api.ts แยกกันดีอยู่แล้ว)
3. SwiftUI client — เน้นขั้น 1 กับขั้น 3 ที่นิ้วทำได้ดีกว่าเมาส์
4. ดูผลผ่าน /seg/<i> ที่รองรับ Range อยู่แล้ว
```

### เฟส 3 — iOS เนทีฟเต็ม: **แนะนำว่าอย่าทำ**

เว้นแต่โจทย์เปลี่ยนเป็น *"ถ่ายเสร็จตัดบนมือถือได้เลยโดยไม่ต้องมีเครื่องอื่น"*
ซึ่งจะเป็นผลิตภัณฑ์คนละตัว ไม่ใช่ port ของตัวนี้

---

## 8. ข้อสรุปที่ต้องพูดให้ตรง

| คำถาม | คำตอบ |
|---|---|
| ทำเป็นแอป Mac ได้ไหม | **ได้ · ง่ายที่สุด** แก้แค่ N1–N4 ของข้อ 3 ที่เหลือคือห่อ |
| ทำเป็นแอป Windows ได้ไหม | **ได้** แก้ N1–N4 + อีก 8 จุด ส่วนใหญ่เป็นเรื่อง encoder · ฟอนต์ · encoding · path escaping |
| หน้าเว็บ Next.js ทำให้ยากขึ้นไหม | **ไม่** — เป็น build step ไม่ใช่ runtime แอปที่ส่งถึงผู้ใช้ไม่ต้องมี Node.js · แก้ 4 จุด (N1–N4) |
| ทำเป็นแอป iOS ได้ไหม | **แบบเดี่ยว: ไม่ได้** · แบบ client ต่อเครื่องใหญ่: **ได้และเหมาะกว่าด้วย** |
| ต้องเขียนใหม่ไหม | **ไม่ต้อง** เกิน 90% ของเอนจิน และ 100% ของหน้าเว็บใช้ต่อได้ตามเดิม |
| ควรเริ่มตรงไหน | **N1** — ให้ `serve.py` เสิร์ฟ static ของ vcut-ui เองที่ origin เดียวกัน ทำเสร็จแล้วเลิกต้องรัน `next dev` คู่กันตอน dev ด้วย · จากนั้นค่อยไล่ 8 จุดฝั่ง Windows ด้วย CLI ล้วน ยังไม่ต้องมีตัวห่อ |
