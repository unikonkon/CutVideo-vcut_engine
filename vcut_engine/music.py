"""MUSIC — ขั้น 5 · เพลงคลอ + หลบเสียงพูดอัตโนมัติ

**หลบเสียงพูดได้โดยไม่ต้องรู้ว่าใครพูดตรงไหน**

วิธีที่คนมักทำคือไล่ดูซับแล้วเขียน volume แบบมี enable เป็นช่วง ๆ ซึ่งต้องอาศัย
transcript ที่แม่นและพังทันทีที่มีคนแก้ไทม์ไลน์ · ffmpeg มี `sidechaincompress`
ซึ่งฟัง *แทร็กเสียงจริง* แล้วลดอีกแทร็กลงตามความดังที่ได้ยินทุกมิลลิวินาที —
ไม่ต้องรู้จักคำพูด ไม่ต้องพึ่ง whisper และตามไทม์ไลน์ที่แก้แล้วเองเสมอ

เสียงหัวเราะ เสียงน้ำตก เสียงลม ก็ทำให้เพลงหลบเหมือนกัน ซึ่งเป็นสิ่งที่ต้องการ
จริง ๆ อยู่แล้ว: เพลงควรหลบ "ตอนมีอะไรน่าฟัง" ไม่ใช่ "ตอนมีคนพูด"

**สายเสียงทั้งหมดถูกประกอบใหม่ที่นี่**

พอมีเพลง เสียงหนังจะไม่ใช่การก๊อปแทร็กเดียวออกมาอีกต่อไป จึงต้องย้าย loudnorm
(ปรับความดังรวมทั้งเรื่อง) เข้ามาอยู่ในสายเดียวกัน — ทำทีหลังแยกต่างหากไม่ได้
เพราะความดังรวมต้องวัดจากเสียงที่ *ผสมเพลงแล้ว* ไม่ใช่จากเสียงพูดอย่างเดียว
"""
from pathlib import Path

from . import fx
from .util import warn

# ── เพลงประกอบ ──
MUSIC = {
    "file": "",
    "gain_db": -18.0,      # ดังแค่ไหนเทียบกับต้นฉบับ
    "duck": True,          # หลบเสียงพูดอัตโนมัติ
    "duck_db": 12.0,       # หลบลงประมาณกี่ dB ตอนมีเสียง
    "duck_release": 400,   # ms กว่าจะกลับมาดังเท่าเดิมหลังเงียบ
    "fade_in": 1.0,
    "fade_out": 2.0,
}
AUDIO_EXT = (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus")

# **ratio ไม่ใช่ปุ่มที่คุมความลึกของการหลบ — threshold ต่างหาก**
#
# วัดจริงกับสัญญาณทดสอบ (เสียงพูด 2 วิ คั่นด้วยความเงียบ · เพลงดังคงที่):
#
#   ratio      4 → หลบ  7.0 dB  ·  12 → 8.5  ·  20 → 8.8      (แทบไม่ขยับ)
#   threshold -46 → หลบ 19.6 dB · -38 → 12.6 · -30 → 5.3 · -23 → 0.4
#
# ปุ่มที่หมุนแล้วไม่มีอะไรเกิดขึ้นแย่กว่าไม่มีปุ่ม จึงตรึง ratio ไว้ แล้วเปิดให้
# สั่งเป็น "หลบลงกี่ dB" โดยแปลงเป็น threshold ให้
#
# สอบเทียบกับเสียงพูดจริงในหนังอีกรอบ (offset 23.5) ได้ค่าคลาดเคลื่อน:
#
#   ตั้ง 4 → หลบจริง 5.9  ·  8 → 8.7  ·  12 → 12.2  ·  16 → 15.9  ·  20 → 19.6
#
# ช่วง 8–20 คลาดไม่ถึง 1 dB · ต่ำกว่า 4 ไม่เปิดให้ตั้ง เพราะจะเริ่มโกหก (ค่าที่
# ตั้ง 0 ได้หลบจริง ~5 dB) และ "ไม่อยากให้หลบ" มีสวิตช์ปิดอยู่แล้ว
DUCK_RATIO = 12.0
DUCK_OFFSET = 23.5


def duck_threshold(duck_db):
    """แปลง "อยากให้หลบลงกี่ dB" เป็น threshold ที่ sidechaincompress รับ

    เป็นค่าประมาณ เพราะความลึกจริงขึ้นกับว่าเสียงในหนังดังแค่ไหนด้วย — คนพูดเบา
    เพลงก็หลบน้อยลงตามจริง ซึ่งเป็นพฤติกรรมที่ถูกอยู่แล้ว
    """
    lin = 10 ** (-(max(0.0, float(duck_db)) + DUCK_OFFSET) / 20.0)
    return min(0.2, max(0.002, lin))


def is_audio(name):
    return Path(str(name or "")).suffix.lower() in AUDIO_EXT


def track(ctx, data):
    """ไฟล์เพลงที่จะใช้จริง — None ถ้าไม่ได้ตั้งหรือหาไฟล์ไม่เจอ"""
    from . import overlay
    name = Path(str((data.get("music") or {}).get("file") or "")).name
    if not name:
        return None
    f = overlay.dir_of(ctx) / name
    if not f.is_file():
        warn(f"ไม่พบไฟล์เพลง {name} ในโฟลเดอร์ assets — ข้ามชั้นเพลงไป")
        return None
    if not is_audio(name):
        warn(f"{name} ไม่ใช่ไฟล์เสียง — ข้ามชั้นเพลงไป")
        return None
    return f


def build(ctx, data, total, master=0.0, idx=1):
    """สายเสียงของขั้น 5 → (อาร์กิวเมนต์ input, ท่อนฟิลเตอร์, ป้ายผลลัพธ์)

    คืนป้าย None เมื่อไม่มีเพลงและไม่ต้องปรับความดังรวม — ผู้เรียกจะได้ใช้ทาง
    `-map 0:a` เดิมซึ่งไม่แตะเสียงเลย (เร็วกว่าและพิสูจน์ได้ว่าเหมือนของขั้น 4)

    `idx` = หมายเลข input ที่เพลงจะไปเป็น ต้องนับต่อจากภาพซ้อนที่ต่อไปก่อนแล้ว
    """
    m = {**MUSIC, **(data.get("music") or {})}
    f = track(ctx, data)
    if not f:
        return [], "", None

    ins = ["-stream_loop", "-1", "-i", str(f)]
    g = float(m.get("gain_db", -18.0))
    fin = max(0.0, float(m.get("fade_in", 1.0)))
    fout = max(0.0, float(m.get("fade_out", 2.0)))

    bg = [f"volume={g:.2f}dB",
          # ตัดให้ยาวเท่าหนังพอดี — `-stream_loop -1` ทำให้ input ไม่มีวันจบเอง
          f"atrim=0:{total:.3f}", "asetpts=N/SR/TB",
          f"aresample={int(ctx.get('encode', {}).get('arate', 48000))}"]
    if fin > 0:
        bg.append(f"afade=t=in:st=0:d={fin:.2f}")
    if fout > 0 and total > fout:
        bg.append(f"afade=t=out:st={total - fout:.3f}:d={fout:.2f}")
    parts = [f"[{idx}:a]" + ",".join(bg) + "[bg]"]

    if m.get("duck"):
        th = duck_threshold(m.get("duck_db", 12.0))
        rel = min(4000, max(20, int(m.get("duck_release", 400))))
        # asplit เพราะเสียงหนังถูกใช้สองที่: เป็นตัวเสียงเอง และเป็นตัวสั่งให้
        # เพลงหลบ · ต่อ [0:a] เข้าสองฟิลเตอร์ตรง ๆ ไม่ได้ ffmpeg จะฟ้องทันที
        parts.append("[0:a]asplit=2[voice][key]")
        parts.append(f"[bg][key]sidechaincompress=threshold={th:.5f}"
                     f":ratio={DUCK_RATIO:g}:attack=20:release={rel}[duck]")
        voice, music_lbl = "voice", "duck"
    else:
        voice, music_lbl = "0:a", "bg"

    # normalize=0 สำคัญ — ค่าตั้งต้นของ amix คือหารความดังด้วยจำนวน input
    # ใส่เพลงเข้าไปแล้วเสียงพูดจะเบาลงครึ่งหนึ่งทันทีโดยไม่มีอะไรบอก
    # duration=first = จบพร้อมเสียงหนัง ไม่ใช่รอเพลงที่วนไม่รู้จบ
    parts.append(f"[{voice}][{music_lbl}]amix=inputs=2:duration=first"
                 f":dropout_transition=0:normalize=0[amix]")
    last = "amix"
    if master >= -70.0 and master != 0.0:
        parts.append(f"[amix]loudnorm=I={master}:TP=-1.5:LRA=11[aout]")
        last = "aout"
    return ins, ";".join(parts), last


def summary(ctx, data=None):
    """สรุปชั้นเพลงให้หน้าเว็บ"""
    from . import overlay
    data = data if data is not None else fx.load(ctx)
    m = {**MUSIC, **(data.get("music") or {})}
    name = Path(str(m.get("file") or "")).name
    d = overlay.dir_of(ctx)
    tracks = sorted(p.name for p in d.iterdir()
                    if p.is_file() and is_audio(p.name)) if d.exists() else []
    return {"music": m, "tracks": tracks,
            "found": bool(name) and name in tracks,
            "defaults": MUSIC}
