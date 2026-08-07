# แผนทดสอบ iApp AI MCP Server

เอกสารเตรียมการทดสอบ — **ยังไม่ได้รันเทสจริง** เป็นการ list รายการ คำสั่ง และข้อมูลที่ใช้ได้เท่านั้น

- เอกสารอ้างอิง: https://iapp.co.th/docs/mcp-server
- วันที่เตรียม: 7 ส.ค. 2569
- เครื่องทดสอบ: macOS (darwin 25.5.0), ffmpeg/ffprobe ติดตั้งแล้วที่ `/opt/homebrew/bin/`

---

## 1. วิธีเชื่อมต่อที่เลือก — Remote OAuth

| หัวข้อ | ค่า |
|---|---|
| Endpoint | `https://mcp.iapp.co.th` |
| Transport | Streamable HTTP |
| Auth | OAuth ผ่านเบราว์เซอร์ — ระบบดึง API key ให้อัตโนมัติ ไม่ต้องคัดลอก key |
| จำนวน tools ที่ได้ | 12 ตัว (จากทั้งหมด 44 ตัว) |
| สถานะบนเครื่องนี้ | ✅ ลงทะเบียนไว้แล้วในชื่อ `claude.ai iApp AI` — ⚠️ **ยังไม่ได้ auth** |

### ขั้นตอนที่ต้องทำก่อนเทส

เซิร์ฟเวอร์ถูกเพิ่มไว้แล้ว **ไม่ต้อง `claude mcp add` ซ้ำ** (จะได้ tool ซ้อนกัน) เหลือแค่ล็อกอิน:

```
1. เปิด Claude Code แบบ interactive (ไม่ใช่ -p / headless)
2. พิมพ์  /mcp
3. เลือก  claude.ai iApp AI  →  Authenticate
4. เบราว์เซอร์เด้ง → ล็อกอินบัญชี iApp → กลับมาที่ terminal
5. ยืนยันด้วย  claude mcp list   ต้องขึ้น ✔ Connected
```

> ทางเลือก: จัดการผ่าน connector settings บน claude.ai ก็ได้ เพราะเป็น claude.ai connector

หลัง auth ผ่าน ให้พิมพ์ `/mcp` อีกครั้งเพื่อดูรายชื่อ tool จริงที่ server ปล่อยมา แล้วเทียบกับตารางข้อ 3 (ชื่อ tool ในเอกสารอาจต่างจากของจริงเล็กน้อย)

---

## 2. ข้อจำกัดสำคัญของโหมด Remote ⚠️

**Remote server รับ input เป็นข้อความและ URL เท่านั้น — ส่ง path ไฟล์ในเครื่องไปให้ไม่ได้**

ผลกระทบ:

| กลุ่ม | Remote ทำได้ไหม |
|---|---|
| Thai NLP (แปล/สรุป/sentiment/QA) | ✅ ทำได้ ใช้ข้อความล้วน |
| LLM chat | ✅ ทำได้ |
| Thai Legal Data + วันหยุด | ✅ ทำได้ |
| Document OCR | ⚠️ ได้เฉพาะรูปที่มี **public URL** ไฟล์ในเครื่องใช้ไม่ได้ |
| eKYC / Speech / Image gen / Smart City | ❌ ไม่มีใน remote ต้องใช้ local server |

ถ้าจะเทสไฟล์ในเครื่อง (เสียง วิดีโอ รูป) → ต้องติดตั้ง local server เพิ่ม (ดูข้อ 6)

---

## 3. Phase 1 — รายการเทสบน Remote (12 tools)

ทุกคำสั่งคือ **ข้อความที่พิมพ์ใน Claude Code ตรง ๆ** แล้วให้ผมเรียก tool ให้

### 3.1 Smoke test — ยืนยันว่าเชื่อมติดจริง

| # | Tool | คำสั่งที่จะพิมพ์ | Input | ผลที่คาดหวัง |
|---|---|---|---|---|
| TC-01 | `iapp_thai_holidays` | `ใช้ iApp MCP ดึงวันหยุดราชการไทยปี 2026` | `year=2026` | รายการวันหยุด พร้อมวันที่+ชื่อ |
| TC-02 | `iapp_thai_law_list` / `iapp_thai_law_search` | `ใช้ iApp MCP ค้นกฎหมายไทยที่เกี่ยวกับ "ลิขสิทธิ์"` | `query="ลิขสิทธิ์"` | รายชื่อกฎหมายที่ตรง |

> เริ่มจาก 2 ตัวนี้ก่อนเสมอ — input สั้น ต้นทุนต่ำ ถ้าผ่านแปลว่า OAuth + tool call ทำงานครบ

### 3.2 LLM

| # | Tool | คำสั่งที่จะพิมพ์ | Input | ผลที่คาดหวัง |
|---|---|---|---|---|
| TC-03 | `iapp_llm_chat` | `ใช้ iApp MCP llm_chat model deepseek-chat ถามว่า "อธิบาย keyframe interval ในการเข้ารหัสวิดีโอ สั้น ๆ ภาษาไทย"` | `prompt`, `model=deepseek-chat` | คำตอบภาษาไทย |
| TC-04 | `iapp_llm_chat` | ซ้ำ TC-03 แต่ `model=deepseek-reasoner` | `model=deepseek-reasoner` | เทียบคุณภาพ/ความเร็วกับ TC-03 |

พารามิเตอร์ที่ควรลอง: `system_prompt`, `max_tokens`, `temperature`, และ model แต่ละตัว (`deepseek-chat`, `deepseek-reasoner`, `deepseek-v4-flash`, `deepseek-v4-pro`)

### 3.3 Thai NLP — ใช้ข้อมูลจริงจากโปรเจกต์ vcut

| # | Tool | คำสั่งที่จะพิมพ์ | Input file | ผลที่คาดหวัง |
|---|---|---|---|---|
| TC-05 | `iapp_translate` | `แปล transcript-short.txt เป็นอังกฤษด้วย iApp MCP` | `fixtures/transcript-short.txt` (1,259 ตัวอักษร) | คำแปล TH→EN |
| TC-06 | `iapp_translate` | ทดสอบภาษาอื่น เช่น TH→JA, TH→ZH | เดียวกัน | ครอบคลุม 28 ภาษา |
| TC-07 | `iapp_summarize` | `สรุปเนื้อหา transcript-flat.txt ด้วย iApp MCP` | `fixtures/transcript-flat.txt` (8,831 ตัวอักษร) | บทสรุปภาษาไทย → ใช้ตั้งชื่อบท/แบ่ง chapter ใน vcut ได้ |
| TC-08 | `iapp_sentiment_analysis` | `วิเคราะห์อารมณ์ประโยคจาก transcript ทีละบรรทัด` | ประโยคจาก transcript | positive/negative/neutral |
| TC-09 | `iapp_thai_qa` | `ถามว่า "ผู้พูดคุยเรื่องอะไรบ้าง" จากเอกสาร transcript-flat.txt` | `question` + `document` | คำตอบอ้างอิงจากเอกสาร |

**ข้อมูลตัวอย่างจริงใน transcript (จาก whisper large-v3-turbo, ภาษาไทย):**
```
ตอนนี้เรียนหมดครับ
มีปลายนะครับ มีปลาย อันตัวเขาจะคลิ้นก็คลิ้น
ประมาณกี่เมตรประจาก 50 ได้ไหม 25 30 50 เมตรอ่ะไม่เห็นแล้ว
```
> หมายเหตุ: transcript มีคำผิดจาก ASR ค่อนข้างเยอะ — เป็น stress test ที่ดีสำหรับ NLP ว่าทนข้อความเพี้ยนได้แค่ไหน

### 3.4 Thai Legal Data (6 tools)

| # | Tool | คำสั่งที่จะพิมพ์ | Input | ผลที่คาดหวัง |
|---|---|---|---|---|
| TC-10 | `iapp_thai_law_search` | `ค้นหาเชิงความหมาย "การใช้งานลิขสิทธิ์ที่เป็นธรรม" ใน iApp MCP` | `query`, `top_k` | มาตราที่เกี่ยวข้อง เรียงตามคะแนน |
| TC-11 | `iapp_thai_law_section` | `ดึง พ.ร.บ.ลิขสิทธิ์ มาตรา 32 พร้อมฎีกาที่อ้างถึง` | `law`, `section`, `with_deka=true` | ตัวบทเต็ม + citation |
| TC-12 | `iapp_thai_deka_search` | `ค้นฎีกาที่อ้าง พ.ร.บ.ลิขสิทธิ์ ตั้งแต่ปี 2560` | `query`, `cites_law`, `year_from` | รายการฎีกา |
| TC-13 | `iapp_thai_deka_get` | `เปิดฎีกาเลขที่ <case_id> จาก TC-12 แบบเต็ม` | `case_id`, `include_body=true` | เนื้อคำพิพากษา |
| TC-14 | `iapp_thai_legal_ask` | `ถาม iApp ว่า "ใช้คลิปวิดีโอของคนอื่นในงานตัดต่อ ผิดลิขสิทธิ์ไหม" พร้อมอ้างอิงฎีกา` | `question`, `include_deka=true` | คำตอบ + citation ตรวจสอบได้ |

> ⭐ TC-14 ตรงกับโปรเจกต์ vcut โดยตรง (คำถามลิขสิทธิ์ฟุตเทจ) และ OpenThai Legal **ฟรีถึง ส.ค. 2026**

### 3.5 Document OCR (remote = URL เท่านั้น)

| # | Tool | คำสั่งที่จะพิมพ์ | Input | หมายเหตุ |
|---|---|---|---|---|
| TC-15 | `iapp_document_ocr` | `OCR รูปจาก URL <public-url> ด้วย iApp MCP โหมด layout` | public image/PDF URL | ⚠️ **ยังไม่มีข้อมูล** ต้องหา URL รูปเอกสารไทยสาธารณะ หรืออัปโหลดไฟล์ขึ้น host ก่อน |

---

## 4. คลังข้อมูลทดสอบที่มีอยู่ในเครื่อง

สำรวจจาก working directories ทั้ง 4 แล้ว พบดังนี้

### 4.1 ไฟล์เสียง / วิดีโอ

| ไฟล์ | ขนาด | รายละเอียด | ใช้เทสอะไรได้ |
|---|---|---|---|
| `.vcut/segments/*.mov` (8 ไฟล์) | 3.8 MB – 36 MB | คลิปที่ตัดแล้วจาก vcut | ASR, ai_audio_detection |
| `.vcut/preview/*.mp4` (4 ไฟล์) | 5–7 MB | preview render | ASR |
| `final.mp4` | **2.4 GB** | หนังที่เรนเดอร์เสร็จ | ⚠️ ใหญ่เกินไป อย่าส่งตรง — ตัดชิ้นก่อน |
| `ScreenRecording_08-06-2569 14-03-11_1.mov` | 291 MB | screen recording | ⚠️ ใหญ่ ตัดก่อน |
| `/private/tmp/_a.wav` | 207 KB | 1.10 วิ, 48kHz stereo | ทดสอบ input สั้นมาก / edge case |
| `/private/tmp/_d.wav` | 504 KB | 5.85 วิ, 44.1kHz mono | ASR สั้น |
| `/private/tmp/_m.wav` `/private/tmp/_v.wav` | 517 KB | 6.00 วิ, 44.1kHz mono | ASR สั้น, voice clone reference |

### 4.2 รูปภาพ

| ไฟล์ | จำนวน | ขนาดภาพ | ใช้เทสอะไรได้ |
|---|---|---|---|
| `.vcut/thumbs/*.jpg` | **286 รูป** | 320×180 | remove_background (ความละเอียดต่ำ), batch test |
| frame ที่ดึงจาก segment | สร้างเองได้ | 1920×1080 | remove_background, face_detection, image analysis |

### 4.3 ข้อความ / เอกสาร

| ไฟล์ | ขนาด | เนื้อหา | ใช้เทสอะไรได้ |
|---|---|---|---|
| `.vcut/transcript.json` | 44 KB | 284 clips / 347 บรรทัด / 8,831 ตัวอักษรไทย | ⭐ translate, summarize, sentiment, QA, question_generation, toxicity |
| `ข้อมูลตั้งต้น/message (6–9).txt` | 3.3–5.4 K ตัวอักษร | บทสนทนาเทคนิคภาษาไทย (HyperFrames, rendering) | summarize, QA, translate — ภาษาไทยเชิงเทคนิคที่สะกดถูก |
| `PLATFORM.md` `README.md` `vcut README.md` | — | เอกสารโปรเจกต์ | thai_qa, summarize |
| `NextJS_UseBot_Crypto/docs/trading-bot-design.docx` | — | เอกสาร docx | document_ocr (ถ้ารองรับ docx) |

### 4.4 ❌ ข้อมูลที่ **ไม่มี** ในเครื่อง — ต้องเตรียมเองถ้าจะเทส

| กลุ่มที่เทสไม่ได้ | ต้องหาอะไรมา |
|---|---|
| eKYC ทั้ง 9 tools | รูปบัตรประชาชน / พาสปอร์ต / ใบขับขี่ / สมุดบัญชี / เซลฟี่ (ควรใช้ตัวอย่าง sample ไม่ใช่ของจริง) |
| receipt / credit card statement / tax cert / civil registration OCR | รูปหรือ PDF ใบเสร็จ, statement, 50 ทวิ, ทะเบียนราษฎร |
| resume / job description OCR | ไฟล์ CV และ JD |
| license plate OCR | รูปรถที่เห็นป้ายทะเบียน |
| meter OCR | รูปมิเตอร์น้ำ/ไฟ |
| document_ocr บน remote | **public URL** ของรูปเอกสาร |

---

## 5. Fixtures ที่เตรียมไว้แล้ว ✅

สร้างไว้ที่ `/private/tmp/iapp-mcp-test/fixtures/` พร้อมใช้ทันที

| ไฟล์ | ขนาด | สเปก | ใช้กับ |
|---|---|---|---|
| `transcript-flat.txt` | 24 KB | 8,831 ตัวอักษร, 347 บรรทัด | summarize, thai_qa, translate (ยาว) |
| `transcript-short.txt` | 3.4 KB | 1,259 ตัวอักษร, 25 บรรทัด | translate, sentiment (payload สั้น ประหยัดเครดิต) |
| `asr-30s.wav` | 472 KB | 30 วิ, 16 kHz mono PCM | speech_to_text (local only) |
| `voiceclone-ref-8s.wav` | 375 KB | 8 วิ, 24 kHz mono PCM | voice_clone_tts reference (local only) |
| `frame-fullres.jpg` | 520 KB | 1920×1080 | remove_background, face_detection (local only) |
| `thumb-320x180.jpg` | 22 KB | 320×180 | remove_background ความละเอียดต่ำ (local only) |

คำสั่งที่ใช้สร้าง (ไว้สร้างซ้ำ/สร้างเพิ่ม):
```bash
# เสียงสำหรับ ASR — 16kHz mono คือ format ที่ ASR ชอบที่สุด
ffmpeg -y -i .vcut/segments/4a5ab8658d00bb57.mov -t 30 -vn -ac 1 -ar 16000 \
       -c:a pcm_s16le /private/tmp/iapp-mcp-test/fixtures/asr-30s.wav

# เฟรมความละเอียดเต็ม
ffmpeg -y -ss 3 -i .vcut/segments/4a5ab8658d00bb57.mov -frames:v 1 -q:v 2 \
       /private/tmp/iapp-mcp-test/fixtures/frame-fullres.jpg
```

---

## 6. Phase 2 — เทสที่ต้องใช้ Local Server (32 tools ที่เหลือ)

> ทำหลังจาก Phase 1 ผ่านแล้ว และเฉพาะเมื่อต้องการเทสกลุ่มไฟล์

### เตรียมเครื่อง

```bash
brew install uv                                  # ยังไม่มี uv/uvx บนเครื่องนี้
claude mcp add iapp-mcp-local -s user \
  -e IAPP_API_KEY=YOUR_KEY -- uvx iapp-mcp
```
ต้องมี API key จากหน้า dashboard ของ iApp (โหมด local ไม่มี OAuth)

### 6.1 Speech — ⭐ กลุ่มที่ตรงกับ vcut มากที่สุด (พร้อมเทส 100%)

| # | Tool | Input ที่เตรียมไว้ | เป้าหมายที่จะเช็ค |
|---|---|---|---|
| TC-20 | `iapp_speech_to_text` | `fixtures/asr-30s.wav`, `language=th` | เทียบความแม่นกับ whisper large-v3-turbo ที่ vcut ใช้อยู่ + มี speaker diarization ที่ whisper ไม่มี |
| TC-21 | `iapp_speech_to_text` | `/private/tmp/_d.wav` (5.85 วิ) | ไฟล์สั้น |
| TC-22 | `iapp_speech_to_text` | `/private/tmp/_a.wav` (1.10 วิ) | edge case ไฟล์สั้นมาก |
| TC-23 | `iapp_speech_to_text` | `.vcut/segments/4a5ab8658d00bb57.mov` (36 MB) | รับ input เป็นวิดีโอตรง ๆ ได้ไหม / limit ขนาดไฟล์ |
| TC-24 | `iapp_text_to_speech` | ข้อความไทยจาก transcript | เสียงพากย์ voice-over |
| TC-25 | `iapp_voice_clone_tts` | `voiceclone-ref-8s.wav` + ref_text จาก transcript | โคลนเสียงผู้พูดในคลิป |
| TC-26 | `iapp_ai_audio_detection` | `asr-30s.wav` (เสียงจริง) vs output จาก TC-24 (เสียง AI) | ตรวจแยกได้จริงไหม — เทสคู่ควบคุม |

### 6.2 Image (พร้อมเทส)

| # | Tool | Input | หมายเหตุ |
|---|---|---|---|
| TC-27 | `iapp_remove_background` | `frame-fullres.jpg` | ลบพื้นหลังจากเฟรมวิดีโอ |
| TC-28 | `iapp_remove_background` | `thumb-320x180.jpg` | เทียบผลที่ความละเอียดต่ำ |
| TC-29 | `iapp_image_generation` | prompt ภาษาไทย | สร้าง b-roll/พื้นหลัง |
| TC-30 | `iapp_face_detection` | `frame-fullres.jpg` | bounding box — ใช้กรองช็อตที่มีคนใน vcut ได้ |

### 6.3 Video Generation

| # | Tool | หมายเหตุ |
|---|---|---|
| TC-31 | `iapp_video_generation_submit` | ⚠️ ต้องมีบัญชีแบบเติมเงินแล้ว (async — คืน `task_id`) |
| TC-32 | `iapp_video_generation_status` | poll `task_id` จาก TC-31 |

### 6.4 NLP เพิ่มเติมที่ไม่มีใน remote

| # | Tool | Input |
|---|---|---|
| TC-33 | `iapp_toxicity_classification` | บรรทัดจาก `transcript-flat.txt` |
| TC-34 | `iapp_question_generation` | `ข้อมูลตั้งต้น/message (6).txt` |

### 6.5 Smart City

| # | Tool | สถานะ |
|---|---|---|
| TC-35 | `iapp_route_optimization` | ✅ เทสได้ ไม่ต้องมีไฟล์ — ใส่ที่อยู่/พิกัดเอง (≤100 จุด, หลายคนขับ) |
| TC-36 | `iapp_license_plate_ocr` | ❌ ไม่มีรูปรถ |
| TC-37 | `iapp_meter_ocr` | ❌ ไม่มีรูปมิเตอร์ |

### 6.6 eKYC + Document OCR

❌ **ไม่มีข้อมูลทดสอบเลยบนเครื่องนี้** (9 + 7 = 16 tools) — ต้องเตรียมรูปบัตร/เอกสารเอง แนะนำใช้ตัวอย่าง sample ที่ไม่ใช่ข้อมูลบุคคลจริง

---

## 7. สรุปความพร้อม

| Phase | กลุ่ม | Tools | สถานะ |
|---|---|---|---|
| 1 | Legal + Holidays | 6 | ✅ พร้อม รอ auth |
| 1 | Thai NLP + LLM | 5 | ✅ พร้อม fixtures ครบ |
| 1 | Document OCR (URL) | 1 | ⚠️ ต้องหา public URL |
| 2 | Speech | 4 | ✅ fixtures ครบ รอติดตั้ง local |
| 2 | Image | 3 | ✅ fixtures ครบ รอติดตั้ง local |
| 2 | NLP เพิ่ม + Route | 3 | ✅ พร้อม |
| 2 | Video Gen | 2 | ⚠️ ต้องเติมเงิน |
| 2 | eKYC + Doc OCR | 16 | ❌ ไม่มีข้อมูลทดสอบ |

**รวมที่เทสได้ทันทีด้วยข้อมูลที่มี: 21 / 44 tools**

---

## 8. ข้อควรระวัง

- **เครดิต** — tools ส่วนใหญ่หักเครดิต iApp ยกเว้น Chinda Thai LLM 4B (ฟรี) และ OpenThai Legal (ฟรีถึง ส.ค. 2026) → เริ่มจาก payload สั้นก่อนเสมอ
- **ไฟล์ใหญ่** — `final.mp4` 2.4 GB และ screen recording 291 MB **อย่าส่งตรง** ให้ตัดชิ้นด้วย ffmpeg ก่อน
- **Remote ไม่รับ local path** — ทุกเทสที่ใช้ไฟล์ในเครื่องต้องรอ Phase 2
- **Output path** — tools ที่สร้างไฟล์ (TTS, image gen, remove_bg) ต้องระบุ `output_path` ให้ชี้ไปที่ `/private/tmp/iapp-mcp-test/output/` ไม่ใช่ลงใน repo
- **ข้อมูลส่วนบุคคล** — ถ้าจะเทส eKYC ให้ใช้รูปตัวอย่าง ไม่ใช่บัตรประชาชนจริงของใคร
- **transcript มีคำผิดจาก ASR** — ถ้าผล NLP ออกมาแปลก ให้เช็คว่าเป็นเพราะ input เพี้ยน ไม่ใช่ tool พัง
