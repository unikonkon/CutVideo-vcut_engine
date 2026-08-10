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
import shutil
from pathlib import Path
from urllib.parse import urlparse

from . import fx
from .util import warn

# ── เพลงประกอบ · หนึ่งแทร็ก ──
#
# **ผูกเวลากับวินาทีในหนังตรง ๆ ไม่ใช่ (คลิป, วินาทีในคลิป) เหมือนชั้นอื่น**
#
# ชั้นที่เหลือของขั้น 5 (ข้อความ · รูปทรง · ภาพซ้อน) เกาะกับคลิป เพราะมันเป็นของ
# ที่ "ชี้ไปที่สิ่งที่เห็นในช็อตนั้น" — ช็อตย้ายไปไหนก็ต้องตามไป  เพลงไม่ใช่แบบ
# นั้น มันเป็นพื้นหลังที่คลุมหลายช็อตพร้อมกัน ถ้าผูกกับคลิปมันจะถูกตัดตามความยาว
# ของคลิปที่มันบังเอิญเกาะอยู่ (คลิปยาว 2 วินาที = เพลงดัง 2 วินาที) ซึ่งไม่ใช่
# สิ่งที่ใครต้องการเลย
#
# ราคาที่จ่าย: ไปแก้ไทม์ไลน์ที่ขั้น 3 แล้วเพลงไม่เลื่อนตาม ต้องมาเลื่อนเอง —
# ยอมรับได้ เพราะเพลงมีไม่กี่ท่อน ไม่ใช่ร้อยชิ้นแบบข้อความ
MUSIC = {
    "file": "",
    "gain_db": -18.0,      # ดังแค่ไหนเทียบกับต้นฉบับ
    "duck": True,          # หลบเสียงพูดอัตโนมัติ
    "duck_db": 12.0,       # หลบลงประมาณกี่ dB ตอนมีเสียง
    "duck_release": 400,   # ms กว่าจะกลับมาดังเท่าเดิมหลังเงียบ
    "fade_in": 1.0,
    "fade_out": 2.0,
    "at": 0.0,             # เริ่มที่วินาทีที่เท่าไรของหนัง
    "dur": 0.0,            # ยาวกี่วินาที · 0 = ไปจนจบเรื่อง
    "loop": True,          # เพลงสั้นกว่าช่วง = วนซ้ำ (ปิด = ปล่อยให้เงียบ)
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


def items_of(data):
    """แทร็กเพลงทั้งหมดในรูปแบบ list เสมอ

    fx.json รุ่นเก่าเก็บ music เป็น dict ก้อนเดียว (เพลงเดียวคลอทั้งเรื่อง) —
    อ่านเป็นแทร็กเดียวที่ at=0 dur=0 ซึ่งแปลว่า "ทั้งเรื่อง" พอดี ไฟล์เก่าจึงให้
    ผลลัพธ์เท่าเดิมเป๊ะโดยไม่ต้องมีตัวแปลงรุ่นไฟล์
    """
    m = data.get("music")
    if isinstance(m, dict):
        return [m] if m.get("file") else []
    return [x for x in (m or []) if isinstance(x, dict) and x.get("file")]


def track(ctx, m):
    """ไฟล์จริงของแทร็กนี้ — None ถ้าหาไม่เจอหรือไม่ใช่ไฟล์เสียง"""
    from . import overlay
    name = Path(str((m or {}).get("file") or "")).name
    if not name:
        return None
    f = overlay.dir_of(ctx) / name
    if not f.is_file():
        warn(f"ไม่พบไฟล์เพลง {name} ในโฟลเดอร์ assets — ข้ามแทร็กนี้ไป")
        return None
    if not is_audio(name):
        warn(f"{name} ไม่ใช่ไฟล์เสียง — ข้ามแทร็กนี้ไป")
        return None
    return f


def spans(data, total):
    """[(แทร็ก, เริ่ม, จบ)] ที่ตัดให้อยู่ในความยาวหนังแล้ว — เรียงตามเวลา"""
    out = []
    for m in items_of(data):
        cfg = {**MUSIC, **m}
        a = max(0.0, float(cfg.get("at", 0) or 0))
        d = float(cfg.get("dur", 0) or 0)
        b = min(float(total), a + d if d > 0 else float(total))
        if b - a > 0.05:
            out.append((cfg, round(a, 3), round(b, 3)))
    out.sort(key=lambda x: x[1])
    return out


def build(ctx, data, total, master=0.0, idx=1):
    """สายเสียงของขั้น 5 → (อาร์กิวเมนต์ input, ท่อนฟิลเตอร์, ป้ายผลลัพธ์)

    คืนป้าย None เมื่อไม่มีเพลงและไม่ต้องปรับความดังรวม — ผู้เรียกจะได้ใช้ทาง
    `-map 0:a` เดิมซึ่งไม่แตะเสียงเลย (เร็วกว่าและพิสูจน์ได้ว่าเหมือนของขั้น 4)

    `idx` = หมายเลข input ที่เพลงแทร็กแรกจะไปเป็น ต้องนับต่อจากภาพซ้อนที่ต่อไปก่อน

    **หลายแทร็กผสมกันในพาสเดียว** — แต่ละแทร็กถูกตัดตามช่วงของตัวเอง เฟดเข้า/ออก
    ของตัวเอง แล้วเลื่อนไปวางที่วินาทีของตัวเองด้วย adelay จากนั้นค่อยผสมรวมกับ
    เสียงหนังทีเดียว ไม่ได้ทำทีละชั้นทับกันไปเรื่อย ๆ (เหตุผลเดียวกับที่ finish.py
    ต่อฟิลเตอร์ทั้งหมดในคำสั่งเดียว)

    การหลบเสียงพูดเป็นของ *รายแทร็ก* ไม่ใช่ค่ากลาง — เพลงคลอกับเสียงเอฟเฟกต์
    สั้น ๆ ไม่ควรถูกบังคับให้หลบเท่ากัน แทร็กที่เปิดหลบแต่ละตัวจึงต้องมีสำเนา
    เสียงหนังเป็นตัวสั่งของตัวเอง (asplit ตามจำนวนที่เปิดไว้ + 1 สำหรับตัวเสียงเอง)
    """
    rate = int(ctx.get("encode", {}).get("arate", 48000))
    rows = []
    for m, a, b in spans(data, total):
        f = track(ctx, m)
        if f:
            rows.append((m, a, b, f))
    if not rows:
        return [], "", None

    ins, parts, labels = [], [], []
    n_duck = sum(1 for m, _, _, _ in rows if m.get("duck"))
    for n, (m, a, b, f) in enumerate(rows):
        # วนซ้ำเฉพาะที่สั่งไว้ — `-stream_loop -1` ทำให้ input ไม่มีวันจบเอง
        # ซึ่งไม่เป็นไรเพราะ atrim ข้างล่างตัดให้เท่าช่วงพอดีอยู่แล้ว
        ins += (["-stream_loop", "-1"] if m.get("loop", True) else []) + ["-i", str(f)]
        span = b - a
        fin = max(0.0, float(m.get("fade_in", 1.0)))
        fout = max(0.0, float(m.get("fade_out", 2.0)))
        seg = [f"volume={float(m.get('gain_db', -18.0)):.2f}dB",
               f"atrim=0:{span:.3f}", "asetpts=N/SR/TB",
               f"aresample={rate}"]
        if fin > 0:
            seg.append(f"afade=t=in:st=0:d={min(fin, span):.2f}")
        if fout > 0 and span > fout:
            seg.append(f"afade=t=out:st={span - fout:.3f}:d={fout:.2f}")
        # เลื่อนไปวางที่วินาทีของมันในหนัง — all=1 เพื่อให้เลื่อนทุกช่องเสียง
        # ไม่ต้องรู้ล่วงหน้าว่าไฟล์เป็นโมโนหรือสเตอริโอ
        if a > 0.0005:
            seg.append(f"adelay=delays={int(round(a * 1000))}:all=1")
        parts.append(f"[{idx + n}:a]" + ",".join(seg) + f"[m{n}]")
        labels.append(f"m{n}")

    if n_duck:
        # เสียงหนังถูกใช้หลายที่: เป็นตัวเสียงเอง + เป็นตัวสั่งให้แต่ละแทร็กหลบ
        # ต่อ [0:a] เข้าหลายฟิลเตอร์ตรง ๆ ไม่ได้ ffmpeg จะฟ้องทันที
        parts.append("[0:a]asplit=" + str(n_duck + 1) + "[voice]"
                     + "".join(f"[k{j}]" for j in range(n_duck)))
        voice = "voice"
        j = 0
        for n, (m, _, _, _) in enumerate(rows):
            if not m.get("duck"):
                continue
            th = duck_threshold(m.get("duck_db", 12.0))
            rel = min(4000, max(20, int(m.get("duck_release", 400))))
            parts.append(f"[m{n}][k{j}]sidechaincompress=threshold={th:.5f}"
                         f":ratio={DUCK_RATIO:g}:attack=20:release={rel}[d{n}]")
            labels[n] = f"d{n}"
            j += 1
    else:
        voice = "0:a"

    # normalize=0 สำคัญ — ค่าตั้งต้นของ amix คือหารความดังด้วยจำนวน input
    # ใส่เพลงเข้าไปแล้วเสียงพูดจะเบาลงตามจำนวนแทร็กทันทีโดยไม่มีอะไรบอก
    # duration=first = จบพร้อมเสียงหนัง ไม่ใช่รอเพลงที่วนไม่รู้จบ
    parts.append(f"[{voice}]" + "".join(f"[{l}]" for l in labels)
                 + f"amix=inputs={len(labels) + 1}:duration=first"
                 f":dropout_transition=0:normalize=0[amix]")
    last = "amix"
    if master >= -70.0 and master != 0.0:
        parts.append(f"[amix]loudnorm=I={master}:TP=-1.5:LRA=11[aout]")
        last = "aout"
    return ins, ";".join(parts), last


# ─────────────────────── ดึงเสียงจากลิงก์ YouTube ───────────────────────
#
# เพลงประกอบต้องมาเป็น *ไฟล์ในโฟลเดอร์ assets* เท่านั้น (ดู track() ข้างบน) ซึ่ง
# เดิมมีทางเดียวคือลากไฟล์มาวางในหน้าเว็บ — คนที่เจอเพลงบน YouTube จึงต้องออกไป
# หาเครื่องมือข้างนอกโหลดเองแล้วค่อยลากกลับเข้ามา
#
# ทางนี้ยืมมือ yt-dlp ที่ติดตั้งไว้ในเครื่อง ไม่ได้เขียนตัวโหลดเอง: เว็บฝั่งโน้น
# เปลี่ยนวิธีส่งไฟล์อยู่ตลอด โค้ดที่ไล่ตามเองจะพังเงียบ ๆ ทุกไม่กี่เดือน
#
# **ใช้กับเสียงที่มีสิทธิ์ใช้เท่านั้น** — การโหลดคลิปของคนอื่นลงเครื่องขัดกับ
# เงื่อนไขการใช้งานของ YouTube เว้นแต่เป็นคลิปของตัวเองหรือเพลงที่อนุญาตไว้
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com",
            "music.youtube.com", "youtu.be", "www.youtu.be"}
YT_HOW = "brew install yt-dlp"


def ytdlp():
    """ที่อยู่ของ yt-dlp ในเครื่อง — None ถ้ายังไม่ได้ติดตั้ง"""
    return shutil.which("yt-dlp")


def check_url(url):
    """(ลิงก์ที่ใช้ได้, ข้อความผิดพลาด) — ผ่านเฉพาะ YouTube

    ตรวจที่ *โฮสต์ที่แกะจาก URL แล้ว* ไม่ใช่ด้วยการหาคำว่า "youtube" ในสตริง —
    อย่างหลังปล่อยผ่านทั้ง youtube.evil.example และ path ที่มีคำนั้นอยู่ข้างใน
    """
    u = str(url or "").strip()
    if not u:
        return None, "ยังไม่ได้ใส่ลิงก์"
    try:
        p = urlparse(u)
    except ValueError:
        return None, "อ่านลิงก์นี้ไม่ออก"
    if p.scheme not in ("http", "https"):
        return None, "ลิงก์ต้องขึ้นต้นด้วย https:// (คัดลอกมาจากช่องที่อยู่ของเบราว์เซอร์)"
    host = (p.hostname or "").lower()
    if host not in YT_HOSTS:
        return None, (f"รับเฉพาะลิงก์ YouTube — ลิงก์นี้มาจาก {host or 'ที่ไหนไม่รู้'}")
    return u, None


def fetch_cmd(ctx, url):
    """คำสั่ง yt-dlp ที่จะเอาไปเข้าคิวงาน — (argv, ข้อความผิดพลาด)

    ไม่ผ่านเชลล์ (Job ใช้ Popen กับ list ตรง ๆ) ลิงก์จึงเป็นอาร์กิวเมนต์ตัวเดียว
    เสมอ ไม่มีทางแตกเป็นคำสั่งอื่นได้ และด่านตรวจข้างบนบังคับให้ขึ้นต้นด้วย
    http(s) อยู่แล้ว จึงไม่มีทางถูกอ่านเป็นตัวเลือกบรรทัดคำสั่ง
    """
    from . import overlay
    exe = ytdlp()
    if not exe:
        return None, f"ยังไม่มี yt-dlp ในเครื่อง — ติดตั้งด้วย `{YT_HOW}` แล้วกดใหม่"
    u, err = check_url(url)
    if err:
        return None, err
    d = overlay.dir_of(ctx)
    d.mkdir(parents=True, exist_ok=True)
    return [
        exe,
        # YouTube มีแทร็กเสียง m4a (AAC) แยกให้อยู่แล้ว หยิบตัวนั้นมาตรง ๆ จึง
        # ไม่ต้องเข้ารหัสใหม่สักรอบ — เร็วกว่าและไม่เสียคุณภาพจากการแปลงซ้ำ
        # ("-x --audio-format m4a" เป็นตาข่ายรับกรณีที่มีแต่ opus ให้เลือก)
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-x", "--audio-format", "m4a",
        # ลิงก์เพลงมักพ่วง &list=... มาด้วย ถ้าไม่ห้ามไว้จะโหลดทั้งเพลย์ลิสต์
        "--no-playlist",
        # ชื่อไฟล์ต้องอยู่ในชุดตัวอักษรที่ overlay.safe_name ยอม ไม่งั้นเส้น
        # /asset/<ชื่อ> จะหาไฟล์ไม่เจอ แล้วฟังตัวอย่างในหน้าเว็บไม่ได้
        "--restrict-filenames",
        # Job อ่าน log ทีละบรรทัด — ค่าปกติของ yt-dlp คือทับบรรทัดเดิมด้วย \r
        # ซึ่งจะไม่มีอะไรโผล่ในแผงบันทึกเลยจนกว่าจะโหลดเสร็จ
        "--newline",
        "-o", str(d / "%(title).50s-%(id)s.%(ext)s"),
        u,
    ], None


def summary(ctx, data=None):
    """สรุปชั้นเพลงให้หน้าเว็บ

    `tracks` = ไฟล์เสียงที่มีอยู่ในคลัง (ของให้เลือก) · `items` = แทร็กที่วางลง
    หนังไปแล้ว — สองอย่างนี้คนละเรื่องกัน ชื่อจึงต้องไม่ปนกัน
    """
    from . import overlay
    data = data if data is not None else fx.load(ctx)
    d = overlay.dir_of(ctx)
    tracks = sorted(p.name for p in d.iterdir()
                    if p.is_file() and is_audio(p.name)) if d.exists() else []
    items = [{**MUSIC, **m} for m in items_of(data)]
    exe = ytdlp()
    return {"items": items, "tracks": tracks,
            "missing": sorted({Path(str(m.get("file") or "")).name
                               for m in items
                               if Path(str(m.get("file") or "")).name not in tracks}),
            "fetch": {"ok": bool(exe), "path": exe or "", "how": YT_HOW},
            "defaults": MUSIC}
