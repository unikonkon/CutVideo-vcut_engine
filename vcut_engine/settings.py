"""SETTINGS — คำนิยามของค่าที่หน้าเว็บแก้ได้ + เขียนกลับเป็นไฟล์ TOML

หน้าเว็บไม่มีรายชื่อค่าฝังอยู่เอง — มันสร้างฟอร์มจาก FIELDS ในไฟล์นี้
เพิ่มคีย์ที่นี่ที่เดียว หน้าเว็บขึ้นให้เอง จะได้ไม่มีวันหลุดจากกัน

`tier` ของแต่ละคีย์คือ **ราคาของการแก้** ซึ่งสำคัญกว่าการจัดกลุ่มตามตาราง
TOML มาก: [talk] กับ [encode] อยู่ห่างกันแค่ไม่กี่บรรทัดในไฟล์ แต่แก้ตัวหนึ่ง
ใช้เวลา 35 วินาที อีกตัวใช้ 40 นาที
"""
import re
from pathlib import Path

from . import config
from .util import read_json

PKG_ROOT = Path(__file__).resolve().parent.parent
PROJECT_DIR = PKG_ROOT / "projects"

# ── ราคาของการแก้ค่าในแต่ละกลุ่ม ────────────────────────────────
TIERS = {
    "free":   {"label": "ไม่ต้องทำอะไรใหม่", "rank": 0},
    "edl":    {"label": "decide + ต่อไฟล์ใหม่", "rank": 1},
    "thumbs": {"label": "ทำภาพตัวอย่างใหม่", "rank": 2},
    "ai":     {"label": "ถาม AI ใหม่ (เสียเงิน)", "rank": 3},
    "listen": {"label": "ถอดเสียงใหม่", "rank": 4},
    "scan":   {"label": "อ่านคลิปใหม่ทั้งหมด", "rank": 5},
    "render": {"label": "render ใหม่ทุกชิ้น", "rank": 6},
}

# ── ขั้นในไปป์ไลน์ เรียงตามลำดับที่มันทำงานจริง ────────────────────────────────
STEPS = [
    {"id": "scan",     "label": "อ่านคลิป",       "artifact": "manifest.json"},
    {"id": "thumbs",   "label": "ภาพตัวอย่าง",    "artifact": "thumbs/"},
    {"id": "listen",   "label": "ดึงบทพูด",       "artifact": "transcript.json"},
    {"id": "ai",       "label": "ดึงความหมาย",    "artifact": "ai.json"},
    {"id": "prepare",  "label": "ตัดทีละคลิป",    "artifact": "pool.json"},
    {"id": "compose",  "label": "เรียงเป็นหนัง",  "artifact": "edl.json"},
    {"id": "render",   "label": "ตัดเป็นชิ้น",    "artifact": "segments/"},
    {"id": "assemble", "label": "ต่อเป็นไฟล์",    "artifact": "final.mp4"},
]
STEP_ORDER = [s["id"] for s in STEPS]
STEP_LABEL = {s["id"]: s["label"] for s in STEPS}

# ── 3 ขั้น ตามภาษาของคนตัดต่อ ไม่ใช่ภาษาของเครื่อง ────────────────────────────────
#
# เดิมหน้าเว็บเรียงตามชื่อคำสั่ง (scan/listen/ai/decide/render) ซึ่งอ่านแล้วไม่รู้ว่า
# กำลังทำอะไรอยู่ ตอนนี้เรียงตามงานจริงที่คนทำ: หาของ → เตรียมของ → ประกอบ
PHASES = [
    {"id": "source", "no": 1, "label": "เลือกฟุตเทจ",
     "was": "Phase 1 · SCAN",
     "why": "ชี้ไปที่โฟลเดอร์คลิปดิบ แล้วอ่านคุณสมบัติทุกคลิปครั้งเดียวจบ",
     "steps": ["scan", "thumbs"], "key": "run.source"},
    {"id": "prepare", "no": 2, "label": "เตรียมวิดีโอ",
     "was": "Phase 1+4 · LISTEN + AI",
     "why": "ดูทีละคลิป — แยกคลิปพูดกับคลิปวิว ตัดเอาเฉพาะช่วงที่ใช้ได้ "
            "เก็บเข้าคลังไว้รอประกอบ",
     "steps": ["listen", "ai", "prepare"], "key": "run.prepare",
     "toggle": "ai.enabled",
     "toggle_label": "ให้ AI ช่วยคิดด้วย (อ่านความหมาย ให้คะแนน แนะนำช่วงที่ควรเก็บ)"},
    {"id": "compose", "no": 3, "label": "รวมเป็นหนัง",
     "was": "Phase 3+2 · DECIDE + RENDER",
     "why": "หยิบชิ้นจากคลังมาเรียง แล้วผลิตเป็นไฟล์เดียว",
     "steps": ["compose", "render", "assemble"], "key": "run.compose"},
]
PHASE_OF_STEP = {s: p["id"] for p in PHASES for s in p["steps"]}

# ── คีย์ไหนเป็นของขั้นไหน — ใช้ตอนรีเซ็ตทีละขั้น ────────────────
#
# `stage` ของแต่ละ FIELD บอกอยู่แล้วว่าคีย์นั้นรับใช้งานไหน จับกลุ่มขึ้นมา
# เป็น "ขั้น" อีกทีตรงนี้ที่เดียว ปุ่ม "รีเซ็ตขั้นนี้" กับการ์ดในหน้าเว็บ
# จึงใช้ขอบเขตเดียวกันเป๊ะ ไม่มีทางที่ปุ่มล้างเกินกว่าที่การ์ดแสดงไว้
PHASE_STAGES = {
    "source":  ["project", "scan", "thumbs"],
    "prepare": ["listen", "ai", "prepare"],
    "compose": ["compose", "render", "assemble"],
}
SCOPES = ["all"] + [p["id"] for p in PHASES]
SCOPE_LABEL = {"all": "ทุกขั้น",
               **{p["id"]: f"ขั้น {p['no']} · {p['label']}" for p in PHASES}}


def scope_keys(scope):
    """คีย์ทั้งหมดที่อยู่ในขอบเขตนี้ — 'all' = ทุกคีย์ที่ฟอร์มรู้จัก"""
    if scope in (None, "", "all"):
        return [f["key"] for f in FIELDS]
    stages = PHASE_STAGES.get(scope)
    if stages is None:
        return []
    keys = [f["key"] for f in FIELDS if f["stage"] in stages]
    if f"run.{scope}" in FIELD_BY_KEY:      # สวิตช์เปิด/ปิดขั้น อยู่ stage "run"
        keys.append(f"run.{scope}")
    return keys


def F(key, label, typ, tier, stage, **kw):
    """stage = อยู่ในขั้นไหนของไปป์ไลน์ (ใช้จัดกลุ่มในหน้าเว็บ)
    tier  = แก้แล้วต้องทำอะไรใหม่ (ใช้คิดราคา)
    ส่วน step ที่อยู่ใน **kw คือระยะห่างของ slider ตัวเลข — คนละเรื่องกัน"""
    return {"key": key, "label": label, "type": typ, "tier": tier, "stage": stage, **kw}


FIELDS = [
    # ── จะรัน Phase ไหนบ้าง (หน้าเว็บวาดเป็นสวิตช์บนหัวการ์ด ไม่ใช่ช่องในฟอร์ม) ──
    F("run.source", "รันขั้น 1", "bool", "free", "run"),
    F("run.prepare", "รันขั้น 2", "bool", "free", "run"),
    F("run.compose", "รันขั้น 3", "bool", "free", "run"),

    # ── โปรเจกต์ ──
    F("project.name", "ชื่อโปรเจกต์", "str", "free", "project"),
    F("project.source", "โฟลเดอร์ฟุตเทจ", "path", "scan", "project",
      help="ที่อยู่ของคลิปดิบ เปลี่ยนแล้วต้องอ่านคลิปใหม่ทั้งหมด"),
    F("project.out", "ไฟล์ผลลัพธ์", "path", "free", "project"),

    # ── อ่านคลิป ──
    F("scan.motion_window", "ช่วงที่ใช้วัดความสั่น", "float", "scan", "scan",
      min=5, max=60, step=1, unit="วิ",
      help="วัด motion จาก N วินาทีแรกของคลิป ยาวขึ้น = แม่นขึ้นแต่ scan ช้าลง"),
    F("scan.motion_fps", "เฟรม/วิ ที่สุ่มมาวัดความสั่น", "int", "scan", "scan",
      min=1, max=15, step=1),
    F("scan.workers", "จำนวนงานพร้อมกัน", "int", "free", "scan", min=1, max=12, step=1,
      help="ไม่มีผลต่อผลลัพธ์ มีผลแค่ความเร็ว — M3 8GB: 6 กำลังดี"),

    # ── ถอดเสียง ──
    F("listen.enabled", "ถอดเสียง", "bool", "listen", "listen",
      help="ปิด = ทุกคลิปกลายเป็นช่วงวิวหมด ไม่มีช่วงพูดเลย"),
    F("listen.language", "ภาษา", "str", "listen", "listen"),
    F("listen.import_dir", "ดึง transcript จากที่อื่น", "path", "listen", "listen",
      help="มีผลถอดเสียงจากรอบก่อนอยู่แล้ว ชี้มาที่นี่เพื่อข้ามขั้นนี้ทั้งหมด"),
    F("classify.min_speech_total", "พูดรวมกี่วิถึงนับเป็นคลิปพูด", "float", "edl", "listen",
      min=0, max=10, step=0.5, unit="วิ"),

    # ── ภาพตัวอย่าง ──
    F("thumbs.width", "ความกว้างภาพตัวอย่าง", "int", "thumbs", "thumbs",
      min=160, max=640, step=20, unit="px"),
    F("thumbs.sheet_cols", "ตาราง — จำนวนคอลัมน์", "int", "thumbs", "thumbs",
      min=2, max=8, step=1),
    F("thumbs.sheet_rows", "ตาราง — จำนวนแถว", "int", "thumbs", "thumbs",
      min=2, max=8, step=1,
      help="คอลัมน์ × แถว = ภาพต่อแผ่น ยิ่งเยอะยิ่งประหยัดตอนส่งให้ AI แต่ภาพเล็กลง"),

    # ── AI ──
    F("ai.enabled", "ใช้ความเห็นจาก AI", "bool", "edl", "ai",
      help="ปิดแล้วผลกลับไปเป็นกฎล้วนทันที ไม่ต้องลบ ai.json"),
    F("ai.goal", "โจทย์ที่จะบอก AI", "text", "ai", "ai",
      placeholder="ตัดเหลือ 10 นาที เล่าตามลำดับการเดินทาง"),
    F("ai.model", "โมเดล", "select", "ai", "ai", options=["sonnet", "opus", "haiku"]),
    F("ai.tasks", "งานที่ให้ AI ทำ", "multi", "ai", "ai",
      options=["story_arc", "describe", "shot_scoring", "trim_suggest"],
      labels={"story_arc": "แบ่งบทเล่าเรื่อง", "describe": "อ่านความหมายรายคลิป",
              "shot_scoring": "ให้คะแนนช็อต",
              "trim_suggest": "แนะนำช่วงที่ควรเก็บ"}),
    F("ai.batch_clips", "ซอยเป็นก้อนละกี่คลิป", "int", "ai", "ai", min=0, max=300, step=10,
      help="0 = ไม่ซอย · ก้อนเล็กเร็วกว่าและหลุดยากกว่า (แบ่งบทไม่ถูกซอยไม่ว่าตั้งเท่าไร)"),
    F("ai.apply.order", "เรียงคลิปตามบทที่ AI แบ่ง", "bool", "edl", "ai"),
    F("ai.apply.drop", "ทิ้งคลิปที่ AI บอกว่าใช้ไม่ได้", "bool", "edl", "ai"),
    F("ai.apply.trim", "ใช้ช่วงที่ AI แนะนำ", "bool", "edl", "ai"),
    F("ai.apply.score_weight", "เชื่อคะแนน AI แค่ไหน", "float", "edl", "ai",
      min=0, max=1, step=0.05,
      help="0 = ใช้กฎล้วน · 1 = ใช้คะแนน AI ล้วน · มีผลเฉพาะตอนเปิด [select]"),

    # ── ตัดสินใจ: ช่วงพูด ──
    F("talk.gap_merge", "ช่องเงียบสั้นกว่านี้ไม่ตัด", "float", "edl", "prepare",
      min=0.2, max=5, step=0.1, unit="วิ",
      help="สูงขึ้น = ตัดถี่น้อยลง ปล่อยให้พูดจบความคิด"),
    F("talk.min_shot", "ช็อตพูดสั้นสุด", "float", "edl", "prepare",
      min=1, max=15, step=0.5, unit="วิ"),
    F("talk.margin_pre", "เผื่อหัวประโยค", "float", "edl", "prepare",
      min=0, max=2, step=0.05, unit="วิ"),
    F("talk.margin_post", "เผื่อท้ายประโยค", "float", "edl", "prepare",
      min=0, max=3, step=0.05, unit="วิ"),

    # ── ตัดสินใจ: ช่วงวิว ──
    F("broll.motion_bands", "เส้นแบ่งระดับความสั่น", "list_float", "edl", "prepare",
      help="เรียงจากน้อยไปมาก · ต้องมีจำนวนน้อยกว่า 'ความยาวตามระดับ' อยู่ 1 ค่า"),
    F("broll.durations", "ความยาวตามระดับ", "list_float", "edl", "prepare", unit="วิ",
      help="ภาพยิ่งสั่นยิ่งให้สั้น — ค่าแรกคือคลิปที่นิ่งที่สุด"),
    F("broll.run_max", "วิวติดกันได้ไม่เกิน", "int", "edl", "prepare",
      min=0, max=10, step=1, unit="ชิ้น", help="0 = ไม่จำกัด"),
    F("broll.pick", "เลือกช่วงไหนของคลิป", "select", "edl", "prepare",
      options=["center", "head", "tail"],
      labels={"center": "กลางคลิป", "head": "ต้นคลิป", "tail": "ท้ายคลิป"}),
    F("broll.drop_above_motion", "ทิ้งคลิปที่สั่นเกิน", "float", "edl", "prepare",
      min=0, max=40, step=1, help="0 = เก็บหมด"),
    F("broll.drop_below_bright", "ทิ้งคลิปที่มืดกว่า", "float", "edl", "prepare",
      min=0, max=80, step=1, help="0 = เก็บหมด"),

    # ── ตัดสินใจ: ลำดับ + ความยาว ──
    F("order.mode", "เรียงลำดับตาม", "select", "edl", "prepare",
      options=["filename", "mtime", "duration"],
      labels={"filename": "เลขไฟล์", "mtime": "เวลาแก้ไขไฟล์", "duration": "ความยาว"}),
    F("order.reverse", "กลับลำดับ", "bool", "edl", "prepare"),
    F("select.enabled", "ตัดให้ถึงเป้าความยาว", "bool", "edl", "prepare"),
    F("select.target_minutes", "เป้าความยาว", "float", "edl", "prepare",
      min=0, max=120, step=0.5, unit="นาที",
      help="เป็นเพดาน ไม่ใช่การรับประกัน — ถ้า B-roll ที่ผ่านตัวกรองมีไม่พอ จะได้สั้นกว่าเป้า"),
    F("select.talk_ratio", "สัดส่วนเวลาที่ให้ช่วงพูด", "float", "edl", "prepare",
      min=0, max=1, step=0.02),
    F("select.min_unique_words", "ช็อตพูดต้องมีคำไม่ซ้ำอย่างน้อย", "int", "edl", "prepare",
      min=0, max=20, step=1, unit="คำ"),
    F("select.avoid_adjacent", "ห้ามเลือกวิวสองชิ้นที่ติดกัน", "bool", "edl", "prepare"),

    # ── เตรียมวิดีโอ: ตัดคลิปที่ไม่มีเสียงพูดออก ──
    F("prepare.drop_silent", "ตัดคลิปที่ไม่มีเสียงพูดออก", "bool", "edl", "prepare",
      help="เอาคลิปวิวออกจากคลังทั้งหมด เหลือแต่คลิปที่มีคนพูด"),

    # ── รวมเป็นหนัง: วิธีเลือกชิ้นจากคลัง ──
    F("compose.mode", "วิธีเลือกชิ้นจากคลัง", "select", "edl", "compose",
      options=["all", "pattern", "budget", "numbers", "timerange", "manual", "ai"],
      labels={"all": "เอาทั้งหมด", "pattern": "สลับตามรูปแบบ",
              "budget": "กำหนดเวลารวมแต่ละแบบ", "numbers": "ตามเลขคลิป",
              "timerange": "ตามช่วงเวลาที่ถ่าย", "manual": "เลือกทีละชิ้นเอง",
              "ai": "ให้ AI เลือกจากความหมาย"}),
    F("compose.pattern", "รูปแบบการสลับ", "multi_order", "edl", "compose",
      options=["TALK", "BROLL"], labels={"TALK": "พูด", "BROLL": "วิว"},
      help="ใช้เมื่อเลือก 'สลับตามรูปแบบ' — เช่น พูด → วิว → วิว แล้ววนซ้ำ"),
    F("compose.target_minutes", "ความยาวเป้า", "float", "edl", "compose",
      min=0, max=120, step=0.5, unit="นาที", help="0 = ไม่จำกัด (ใช้กับ 'สลับตามรูปแบบ')"),
    F("compose.talk_minutes", "เวลาช่วงพูด", "float", "edl", "compose",
      min=0, max=90, step=0.5, unit="นาที", help="ใช้กับ 'กำหนดเวลารวมแต่ละแบบ'"),
    F("compose.broll_minutes", "เวลาช่วงวิว", "float", "edl", "compose",
      min=0, max=90, step=0.5, unit="นาที"),
    F("compose.avoid_adjacent", "ห้ามเอาวิวจากคลิปที่อยู่ติดกัน", "bool", "edl", "compose"),
    F("compose.numbers", "เลขคลิปที่เอา", "str", "edl", "compose",
      placeholder="7068-7200, 7305, 7400-7450"),
    F("compose.from", "ถ่ายตั้งแต่", "str", "edl", "compose",
      placeholder="2026-07-30 หรือ 2026-07-30 08:00"),
    F("compose.to", "ถึง", "str", "edl", "compose", placeholder="2026-07-31 23:59"),
    F("compose.context", "โจทย์ที่จะบอก AI", "text", "edl", "compose",
      placeholder="เล่าตามลำดับการเดินทาง เน้นช่วงขึ้นเขา"),

    # ── ภาพ (แพง) ──
    F("video.vertical_mode", "คลิปแนวตั้งทำยังไง", "select", "render", "render",
      options=["blur_pad", "pillarbox", "crop"],
      labels={"blur_pad": "พื้นหลังเบลอ", "pillarbox": "แถบดำข้าง", "crop": "ครอปเต็มจอ"}),
    F("video.width", "ความกว้าง", "int", "render", "render", min=640, max=3840, step=2),
    F("video.height", "ความสูง", "int", "render", "render", min=360, max=2160, step=2),

    # ── เสียง (แพง) ──
    F("audio.target_lufs_talk", "ความดังเป้า — ช่วงพูด", "float", "render", "render",
      min=-40, max=-5, step=0.5, unit="LUFS"),
    F("audio.target_lufs_broll", "ความดังเป้า — ช่วงวิว", "float", "render", "render",
      min=-40, max=-5, step=0.5, unit="LUFS"),
    F("audio.allow_limit", "ยอมให้ limiter กดได้", "float", "render", "render",
      min=0, max=24, step=1, unit="dB",
      help="สูงขึ้น = เสียงสม่ำเสมอขึ้นแต่ไดนามิกแคบลง · 0 = ไม่ให้ limiter ทำงานเลย"),
    F("audio.compressor", "ใส่ compressor", "bool", "render", "render"),
    F("audio.denoise", "ลดเสียงซ่า", "bool", "render", "render"),

    # ── encode (แพงสุด) ──
    F("encode.vcodec", "ตัวเข้ารหัสภาพ", "select", "render", "render",
      options=["h264_videotoolbox", "libx264", "hevc_videotoolbox"],
      help="videotoolbox = ฮาร์ดแวร์ M3 เร็วกว่ามาก · libx264 = คุณภาพดีกว่าที่บิตเรตเท่ากัน"),
    F("encode.bitrate", "บิตเรตภาพ", "str", "render", "render"),
    F("render.workers", "render พร้อมกันกี่ชิ้น", "int", "free", "render",
      min=1, max=8, step=1, help="ไม่มีผลต่อผลลัพธ์ — M3: videotoolbox เป็นคอขวดอยู่แล้ว"),
    F("render.concat_mode", "วิธีต่อไฟล์", "select", "free", "assemble",
      options=["copy", "encode"],
      labels={"copy": "ต่อตรง ๆ ไม่เข้ารหัสซ้ำ", "encode": "เข้ารหัสใหม่ทั้งเรื่อง"}),
]

FIELD_BY_KEY = {f["key"]: f for f in FIELDS}

# ค่าที่มีผลต่อผลลัพธ์ของแต่ละขั้น — ใช้เทียบว่าของที่ทำไว้แล้ว "เก่าแล้ว" หรือยัง
# (จงใจไม่ใส่ workers/threads เพราะมีผลแค่ความเร็ว ไม่ได้เปลี่ยนผลลัพธ์)
STEP_PARAMS = {
    "scan": ["project.source", "scan.extensions", "scan.motion_window",
             "scan.motion_fps", "scan.bright_fps", "scan.rotation_overrides",
             "scan.color"],
    "listen": ["listen.enabled", "listen.model", "listen.language",
               "listen.import_dir", "listen.filter"],
    "thumbs": ["thumbs.width", "thumbs.sheet_cols", "thumbs.sheet_rows",
               "thumbs.per_clip"],
    "ai": ["ai.model", "ai.tasks", "ai.sheets", "ai.transcript_chars",
           "ai.batch_clips", "ai.goal"],
    "prepare": ["talk", "broll", "classify.min_speech_total", "prepare.drop_silent",
                "ai.enabled", "ai.apply", "audio.target_lufs_talk",
                "audio.target_lufs_broll"],
}


def get_at(cfg, dotted, default=None):
    node = cfg
    for k in dotted.split("."):
        if not isinstance(node, dict) or k not in node:
            return default
        node = node[k]
    return node


_MISSING = object()


def has_at(cfg, dotted):
    """คีย์นี้ *มีอยู่จริง* ในต้นไม้นี้ไหม — ต่างจาก get_at ตรงที่ค่า None ก็นับว่ามี

    ตอนกู้คืนต้องแยกให้ออกว่า "ไฟล์เก่าตั้งค่าไว้เป็น null" กับ "ไฟล์เก่าไม่ได้
    ตั้งคีย์นี้เลย" เพราะอย่างแรกต้องเขียนกลับ อย่างหลังต้องลบทิ้ง
    """
    return get_at(cfg, dotted, _MISSING) is not _MISSING


def set_at(cfg, dotted, value):
    keys = dotted.split(".")
    node = cfg
    for k in keys[:-1]:
        if not isinstance(node.get(k), dict):
            node[k] = {}
        node = node[k]
    node[keys[-1]] = value
    return cfg


def params_of(cfg, step):
    return {k: get_at(cfg, k) for k in STEP_PARAMS.get(step, [])}


# ─────────────────────────── แผนการรัน ───────────────────────────

def plan(cfg, start=None, no_thumbs=False):
    """ขั้นไหนจะได้รันบ้าง + ขั้นไหนถูกข้ามเพราะอะไร

    ทั้ง `vcut run` และปุ่มในหน้าเว็บอ่านจากฟังก์ชันนี้ตัวเดียว — สองทางจึงทำ
    เหมือนกันเสมอ ไม่มีทางที่หน้าเว็บบอกอย่างแล้ว CLI ทำอีกอย่าง
    """
    from_i = STEP_ORDER.index(start) if start in STEP_ORDER else 0
    out = []
    for i, sid in enumerate(STEP_ORDER):
        ph = next(p for p in PHASES if sid in p["steps"])
        skip = None
        if i < from_i:
            skip = f"ข้ามด้วย --from {start}"
        elif not get_at(cfg, ph["key"], True):
            skip = f"ปิด Phase {ph['no']} ไว้"
        elif sid == "thumbs" and no_thumbs:
            skip = "สั่ง --no-thumbs"
        elif sid == "ai" and not get_at(cfg, "ai.enabled", False):
            skip = "ปิด [ai] enabled ไว้"
        elif sid == "listen" and not get_at(cfg, "listen.enabled", True):
            skip = "ปิด [listen] enabled ไว้"
        out.append({"id": sid, "label": STEP_LABEL[sid], "phase": ph["id"],
                    "phase_no": ph["no"], "run": skip is None, "skip": skip})
    return out


def phase_view(ctx, cfg):
    """สถานะราย Phase — รวมสถานะของขั้นที่อยู่ข้างในเข้าด้วยกัน"""
    steps = {s["id"]: s for s in step_status(ctx, cfg)}
    pl = {s["id"]: s for s in plan(cfg)}
    out = []
    for ph in PHASES:
        inner = [{**steps[s], **{"run": pl[s]["run"], "skip": pl[s]["skip"]}}
                 for s in ph["steps"]]
        done = [x for x in inner if x["exists"]]
        stale = [x for x in inner if x["exists"] and x["changed"]]
        out.append({
            **{k: ph[k] for k in ("id", "no", "label", "was", "why", "key")},
            "toggle": ph.get("toggle"), "toggle_label": ph.get("toggle_label"),
            "toggle_on": bool(get_at(cfg, ph["toggle"], False)) if ph.get("toggle") else None,
            "enabled": bool(get_at(cfg, ph["key"], True)),
            "steps": inner,
            "state": ("stale" if stale else "ok") if len(done) == len(inner)
                     else ("part" if done else "none"),
        })
    return out


# ─────────────────────────── เขียน TOML ───────────────────────────

def _atom(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int,)) and not isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        return repr(round(v, 6))
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_atom(x) for x in v) + "]"
    s = str(v).replace("\\", "\\\\").replace('"', '\\"') \
              .replace("\n", "\\n").replace("\t", "\\t")
    return f'"{s}"'


def dump_toml(data, extends=None, header=None):
    """เขียน TOML แบบตรงไปตรงมา — พอสำหรับไฟล์โปรเจกต์ซึ่งเป็นแค่ชั้นทับบาง ๆ"""
    out = []
    for line in (header or []):
        out.append(f"# {line}")
    if header:
        out.append("")
    if extends:
        out.append(f"extends = {_atom(extends)}")
        out.append("")

    def walk(node, prefix):
        flat = {k: v for k, v in node.items() if not isinstance(v, dict)}
        tables = {k: v for k, v in node.items() if isinstance(v, dict)}
        if flat or (prefix and not tables):
            if prefix:
                out.append(f"[{prefix}]")
            width = max((len(k) for k in flat), default=0)
            for k, v in flat.items():
                out.append(f"{k:<{width}} = {_atom(v)}")
            out.append("")
        for k, v in tables.items():
            walk(v, f"{prefix}.{k}" if prefix else k)

    walk(data, "")
    return "\n".join(out).rstrip() + "\n"


_KEYLINE = re.compile(r"^(\s*)([A-Za-z0-9_\-]+)(\s*)=(.*)$")
_HEADER = re.compile(r"^\s*\[([^\]]+)\]\s*$")


def _trailing_comment(rest):
    """แยกคอมเมนต์ท้ายบรรทัดออกจากค่า โดยไม่หลงเครื่องหมาย # ที่อยู่ในสตริง

    เอาช่องว่างที่คั่นอยู่ข้างหน้ามาด้วย — คอมเมนต์ในไฟล์นี้จัดคอลัมน์ไว้สวย ๆ
    ถ้าเขียนกลับด้วยระยะห่างมาตรฐาน ค่าที่ความกว้างเท่าเดิมก็ยังโผล่ใน git diff
    """
    in_str = esc = False
    for i, ch in enumerate(rest):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "#":
            j = i
            while j > 0 and rest[j - 1] in " \t":
                j -= 1
            return (rest[j:i] or "   ") + rest[i:]
    return ""


def patch_toml(text, changes, drop=()):
    """แก้ค่าทีละบรรทัดในไฟล์เดิม — ไม่เขียนใหม่ทั้งไฟล์

    ไฟล์ config ของโปรเจกต์นี้มีคอมเมนต์อธิบายเหตุผลอยู่เต็มไปหมด ซึ่งเป็น
    เอกสารตัวจริง ถ้าหน้าเว็บ dump ทับทั้งไฟล์ทุกครั้งที่กดบันทึก คอมเมนต์
    หายหมด และคีย์ที่ฟอร์มไม่รู้จักก็หายไปด้วยโดยไม่มีใครรู้

    `drop` = คีย์ที่ให้ *ลบบรรทัดทิ้ง* ไม่ใช่ตั้งค่าใหม่ — นี่คือความหมายจริงของ
    "รีเซ็ต": เอาค่าที่ทับไว้ออก แล้วปล่อยให้ค่าตกมาจาก preset ตามเดิม
    ถ้าไปเขียนค่า inherited ทับลงไปแทน ไฟล์จะบวมขึ้นทุกครั้งที่กดรีเซ็ต และ
    วันที่ preset เปลี่ยน โปรเจกต์นี้จะไม่ได้ตามไปด้วย
    """
    todo = dict(changes)
    kill = {k for k in drop if k not in todo}
    lines = text.splitlines()
    out, table = [], ""

    # ตาราง → บรรทัดสุดท้ายของตารางนั้นที่ไม่ใช่บรรทัดว่าง (นับคอมเมนต์ด้วย)
    #
    # ที่ต้องนับคอมเมนต์เพราะคีย์ที่ถูกลบไปแล้วอาจมีคอมเมนต์อธิบายอยู่ข้างบน
    # ถ้าไม่นับ พอกู้คืนกลับมาคีย์จะไปแทรกใต้หัวตารางทันที = ไปโผล่ *เหนือ*
    # คอมเมนต์ของตัวเอง ทำแบบนั้นซ้ำ ๆ คอมเมนต์กับคีย์ก็หลุดจากกันไปเรื่อย ๆ
    last_of = {}
    width = {}                         # ตาราง → ความกว้างชื่อคีย์ที่ยาวสุด

    for line in lines:
        h = _HEADER.match(line)
        if h:
            table = h.group(1).strip()
            out.append(line)
            last_of[table] = len(out) - 1
            continue
        m = _KEYLINE.match(line)
        if m:
            dotted = f"{table}.{m.group(2)}" if table else m.group(2)
            width[table] = max(width.get(table, 0), len(m.group(2)))
            if dotted in kill:
                continue                   # ลบทิ้ง — อย่าขยับ last_of ตามไปด้วย
            if dotted in todo:
                tail = _trailing_comment(m.group(4))
                line = (f"{m.group(1)}{m.group(2)}{m.group(3)}= "
                        f"{_atom(todo.pop(dotted))}" + tail)
            out.append(line)
            last_of[table] = len(out) - 1
            continue
        out.append(line)
        if line.strip():
            last_of[table] = len(out) - 1

    # คีย์ที่ยังไม่มีในไฟล์ — แทรกต่อท้ายตารางเดิม หรือเปิดตารางใหม่
    rest = {}
    for dotted, v in todo.items():
        tbl, _, key = dotted.rpartition(".")
        rest.setdefault(tbl, {})[key] = v
    for tbl, kv in rest.items():
        if tbl in last_of:
            at = last_of[tbl] + 1
            # จัด = ให้ตรงกับคีย์ที่มีอยู่แล้วในตารางนั้น ไม่งั้นทุกครั้งที่รีเซ็ต
            # แล้วกู้คืน ไฟล์จะเสียการจัดคอลัมน์ไปทีละนิดจนอ่านยาก
            w = max([width.get(tbl, 0)] + [len(k) for k in kv])
            block = [f"{k:<{w}} = {_atom(v)}" for k, v in kv.items()]
            out[at:at] = block
            for t, i in list(last_of.items()):
                if i >= at:
                    last_of[t] = i + len(block)
            last_of[tbl] = at + len(block) - 1
        else:
            if out and out[-1].strip():
                out.append("")
            out.append(f"[{tbl}]" if tbl else "")
            out += [f"{k} = {_atom(v)}" for k, v in kv.items()]
            last_of[tbl] = len(out) - 1
    return "\n".join(out).rstrip() + "\n"


def project_files():
    return sorted(str(p.relative_to(PKG_ROOT)) for p in PROJECT_DIR.glob("*.toml")) \
        if PROJECT_DIR.is_dir() else []


def preset_names():
    return sorted(p.stem for p in config.PRESET_DIR.glob("*.toml"))


def read_raw(path):
    p = Path(path)
    if not p.is_absolute():
        p = PKG_ROOT / p
    return p.read_text(encoding="utf-8") if p.exists() else ""


def save_project(rel_path, changes, extends=None, raw=None, drop=()):
    """เขียนไฟล์โปรเจกต์ — changes คือเฉพาะคีย์ที่ผู้ใช้แก้ ไม่ใช่ทั้งชุด

    ถ้าไฟล์มีอยู่แล้วจะแก้ทีละบรรทัด (คอมเมนต์และคีย์อื่นอยู่ครบ)
    ถ้ายังไม่มีจะสร้างใหม่ · ส่ง raw มาก็เขียนตามนั้นตรง ๆ (แท็บ TOML ดิบ)
    `drop` = คีย์ที่ให้ลบออกจากไฟล์ (ใช้ตอนรีเซ็ต — ดู patch_toml)
    ตรวจด้วย config.load() ก่อนเสมอ ไฟล์ที่ผ่านออกมาจึงรันได้แน่นอน
    """
    p = Path(rel_path)
    if not p.is_absolute():
        p = PKG_ROOT / p
    if p.suffix != ".toml":
        return None, "ไฟล์โปรเจกต์ต้องลงท้ายด้วย .toml"
    try:
        p.resolve().relative_to(PKG_ROOT.resolve())
    except ValueError:
        return None, "เขียนได้เฉพาะไฟล์ที่อยู่ในโฟลเดอร์โปรเจกต์เท่านั้น"

    changes = {k: v for k, v in (changes or {}).items() if k in FIELD_BY_KEY}
    drop = [k for k in (drop or ()) if k in FIELD_BY_KEY]
    if raw is not None:
        body = raw if raw.endswith("\n") else raw + "\n"
    elif p.exists():
        body = patch_toml(p.read_text(encoding="utf-8"), changes, drop=drop)
    else:
        tree = {}
        for k, v in changes.items():
            set_at(tree, k, v)
        body = dump_toml(tree, extends=extends,
                         header=["ไฟล์นี้หน้า setup สร้างให้ — แก้ด้วยมือได้เหมือนกัน",
                                 "ค่าที่ไม่ได้อยู่ในนี้จะตกมาจาก preset ที่ extends ไว้"])

    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".toml.tmp")
    tmp.write_text(body, encoding="utf-8")
    try:
        config.load(str(tmp), [])
    except SystemExit:
        tmp.unlink(missing_ok=True)
        return None, "config ที่ได้ใช้ไม่ได้ — ดูข้อความผิดพลาดในเทอร์มินัล"
    tmp.replace(p)
    return str(p.relative_to(PKG_ROOT)), None


# ─────────────────────────── สถานะของแต่ละขั้น ───────────────────────────

def step_status(ctx, cfg):
    """ขั้นไหนทำไปแล้ว · ทำเมื่อไร · ค่าที่ใช้ตอนนั้นต่างจากตอนนี้ตรงไหน"""
    work = ctx.work
    out = []
    for st in STEPS:
        sid = st["id"]
        path = {
            "scan": work / "manifest.json",
            "thumbs": ctx.thumb_dir / "sheets",
            "listen": work / "transcript.json",
            "ai": work / "ai.json",
            "prepare": work / "pool.json",
            "compose": work / "edl.json",
            "render": work / "render.json",
            "assemble": ctx.out,
        }[sid]
        exists = path.exists() and (not path.is_dir() or any(path.iterdir()))
        rec = {**st, "exists": exists,
               "mtime": int(path.stat().st_mtime) if exists else 0,
               "changed": [], "summary": ""}

        if exists and sid in STEP_PARAMS:
            src = {"scan": work / "manifest.json",
                   "listen": work / "transcript.json",
                   "thumbs": ctx.thumb_dir / "params.json",
                   "ai": work / "ai.json",
                   "prepare": work / "pool.json"}[sid]
            saved = (read_json(src, {}) or {}).get("params")
            if saved is not None:
                now = params_of(cfg, sid)
                rec["changed"] = sorted(k for k in now if saved.get(k) != now.get(k))
            else:
                rec["summary"] = "ทำไว้ก่อนมีการบันทึกค่า — บอกไม่ได้ว่าเก่าหรือยัง"

        if sid == "scan" and exists:
            man = read_json(path, {}) or {}
            cl = man.get("clips", [])
            rec["summary"] = (f"{len(cl)} คลิป · "
                              f"{sum(x['duration'] for x in cl) / 60:.1f} นาที")
        elif sid == "listen" and exists:
            tr = (read_json(path, {}) or {}).get("clips", {})
            rec["summary"] = f"{sum(1 for v in tr.values() if v)} คลิปมีคำพูด"
        elif sid == "thumbs" and exists:
            rec["summary"] = f"{len(list(path.glob('*.jpg')))} แผ่น"
        elif sid == "ai" and exists:
            adv = read_json(path, {}) or {}
            rec["summary"] = (f"{len(adv.get('chapters', []))} บท · "
                              f"ให้คะแนน {sum(1 for v in adv.get('clips', {}).values() if 'score' in v)} คลิป")
        elif sid == "prepare" and exists:
            s = (read_json(path, {}) or {}).get("summary", {})
            rec["summary"] = (f"คลัง {s.get('usable', 0)} ชิ้น "
                              f"({s.get('talk', 0)} พูด + {s.get('broll', 0)} วิว) · "
                              f"{s.get('duration_total', 0) / 60:.1f} นาที")
        elif sid == "compose" and exists:
            s = (read_json(path, {}) or {}).get("summary", {})
            rec["summary"] = (f"{s.get('segments', 0)} ชิ้น · "
                              f"{s.get('duration_total', 0) / 60:.1f} นาที")
        elif sid == "render" and exists:
            r = read_json(path, {}) or {}
            rec["summary"] = f"{len(r.get('segments', []))} ชิ้น"
        elif sid == "assemble" and exists:
            rec["summary"] = f"{path.stat().st_size / 1e9:.2f} GB"
        out.append(rec)
    return out


# ─────────────────────────── ประเมินราคาก่อนกด ───────────────────────────

DEFAULT_SEC_PER_SEGMENT = 11.0     # ใช้ตอนยังไม่เคย render จนวัดอัตราจริงได้


def estimate(ctx):
    """ตอบว่า "ถ้ากด render ตอนนี้ ต้องทำใหม่กี่ชิ้น ใช้เวลาเท่าไร" โดยไม่เรียก ffmpeg เลย

    ทำได้เพราะชื่อไฟล์ segment คือ sha1 ของทุกพารามิเตอร์ที่มีผลต่อชิ้นนั้น
    คำนวณ hash แล้วดูว่ามีไฟล์อยู่ไหม ก็รู้คำตอบทันที

    ชิ้นที่ยังไม่เคยวัดความดังจะคำนวณ gain ไม่ได้ — แต่ไม่ต้องคำนวณ เพราะ
    "ไม่เคยวัด" แปลว่า (start, dur) ชุดนี้ไม่เคยมีมาก่อน = ต้อง render แน่นอน
    """
    from . import decide, render
    edl = decide.run(ctx, write=False)
    tl = edl["timeline"]
    loud = read_json(ctx.work / "loudness.json", {}) or {}
    a = ctx.get("audio", {})

    reuse, new, unmeasured = 0, 0, 0
    for seg in tl:
        k = f"{seg['name']}@{seg['start']:.3f}+{seg['dur']:.3f}"
        if k not in loud:
            unmeasured += 1
            new += 1
            continue
        I, TP = loud[k]
        gain, _ = render.compute_gain(I, TP, float(seg["target_lufs"]), a)
        p = ctx.seg_dir / f"{render.seg_key(seg, ctx, gain)}.mp4"
        if p.exists() and p.stat().st_size > 1024:
            reuse += 1
        else:
            new += 1

    rman = read_json(ctx.work / "render.json", {}) or {}
    rate = rman.get("sec_per_segment") or DEFAULT_SEC_PER_SEGMENT
    have = {f.name for f in ctx.seg_dir.glob("*.mp4")} if ctx.seg_dir.exists() else set()
    s = edl["summary"]
    return {
        "segments": s["segments"],
        "talk": s["segments_talk"],
        "broll": s["segments_broll"],
        "duration": s["duration_total"],
        "chapters": len(edl.get("chapters", [])),
        "reuse": reuse,
        "new": new,
        "unmeasured": unmeasured,
        "sec_per_segment": round(rate, 2),
        "render_seconds": int(new * rate),
        "measure_seconds": int(unmeasured * 1.2),
        "orphans": max(0, len(have) - reuse),
        "select": s.get("select", {}),
    }
