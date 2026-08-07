"""OVERLAY — ขั้น 5 · ชั้นภาพซ้อน (สกรีนช็อต · สติกเกอร์ · เอนด์การ์ด)

เฟส A วาดรูปทรงเองด้วย libass ได้ก็จริง แต่วาดสกรีนช็อตแผนที่หรือการ์ดคอมเมนต์
ไม่ได้ — ของพวกนั้นเป็น *ไฟล์ภาพจากข้างนอก* ชั้นนี้จึงเป็นทางเดียวที่ของแบบนั้น
จะเข้ามาอยู่ในหนังได้ และเป็นทางที่คัตเอาต์คน (ตัดพื้นหลังด้วยเครื่องมืออื่น
แล้ว export เป็นวิดีโอโปร่งใส) เข้ามาได้ด้วย โดยที่เอนจินไม่ต้องรู้จัก AI เลย

**ทุกไฟล์ต้องอยู่ในโฟลเดอร์เดียว (.vcut/assets)**

fx.json เก็บแค่ *ชื่อไฟล์* ไม่ใช่เส้นทางเต็ม โปรเจกต์จึงยกไปเครื่องอื่นได้ทั้งก้อน
และหน้าเว็บอ่านไฟล์นอกโปรเจกต์ไม่ได้แม้จะพยายาม

**ภาพนิ่งกับวิดีโอเข้าคนละทาง**

ภาพนิ่ง  `-loop 1 -t <ยาวทั้งเรื่อง>` — สตรีมเดินคู่ไปกับหนังตั้งแต่วินาทีที่ 0
         เวลาในสตรีมจึงเท่ากับเวลาในหนังพอดี สูตรเฟด/ขยับเขียนด้วยเวลาหนังตรง ๆ

วิดีโอ   `-itsoffset <วินาทีที่จะโผล่>` — เลื่อนเวลาที่ระดับ container ให้เฟรมแรก
         ของไฟล์ไปตกตรงวินาทีที่ต้องการ คลิปจึงเล่นตั้งแต่ต้นเรื่องของมันเองพอดี
         ตอนโผล่ ไม่ใช่เล่นค้างมาแล้วครึ่งเรื่อง

ทั้งสองทางจบที่ `enable='between(t,a,b)'` เหมือนกัน — นอกช่วงนั้น overlay ไม่ทำงาน
เลย ไม่ใช่วาดภาพใสทับ (ต่างกันที่ความเร็ว: อย่างหลังเสียเวลาผสมทุกเฟรมทั้งเรื่อง)
"""
import base64
import binascii
from pathlib import Path

from . import fx
from .util import probe_video, read_json, warn

MAX_BYTES = 40 * 1024 * 1024      # กันไฟล์หลุดขนาดผ่านหน้าเว็บ
SAFE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- "


def dir_of(ctx):
    return ctx.work / "assets"


def kind_of(name):
    ext = Path(name).suffix.lower()
    if ext in fx.IMAGE_EXT:
        return "image"
    if ext in fx.VIDEO_EXT:
        return "video"
    return ""


def safe_name(name):
    """ชื่อไฟล์ที่ยอมให้เขียนลงโฟลเดอร์ assets — ตัดเส้นทางทิ้งแล้วกรองตัวอักษร"""
    base = Path(str(name or "")).name
    out = "".join(c for c in base if c in SAFE).strip().strip(".")
    return out[:80]


def assets(ctx):
    """ไฟล์ทั้งหมดที่ใช้ซ้อนได้ + ขนาดจริงของภาพ

    ส่งขนาดไปด้วยเพราะหน้าเว็บต้องรู้อัตราส่วนถึงจะวาดกรอบพรีวิวให้ถูกทรง —
    ถ้าให้เบราว์เซอร์โหลดภาพมาวัดเอง กรอบจะกระโดดตอนภาพโหลดเสร็จ
    """
    d = dir_of(ctx)
    if not d.exists():
        return []
    out = []
    for f in sorted(d.iterdir()):
        k = kind_of(f.name)
        if not f.is_file() or not k:
            continue
        info = probe_video(f) or {}
        out.append({"file": f.name, "kind": k,
                    "w": int(info.get("dw") or info.get("w") or 0),
                    "h": int(info.get("dh") or info.get("h") or 0),
                    "bytes": f.stat().st_size})
    return out


def save_asset(ctx, name, b64):
    """รับไฟล์จากหน้าเว็บ (base64) — คืน (ชื่อที่บันทึกจริง, ข้อความผิดพลาด)

    ใช้ base64 บน JSON แทน multipart เพราะ http.server ของ stdlib ไม่มีตัวแกะ
    multipart ให้ และเขียนเองเป็นโค้ดที่พลาดแล้วเป็นช่องโหว่ได้ง่าย ราคาที่จ่าย
    คือไฟล์โตขึ้น 33% ตอนส่ง ซึ่งไม่มีผลอะไรเลยกับการอัปโหลดในเครื่องตัวเอง
    """
    nm = safe_name(name)
    if not nm:
        return None, "ชื่อไฟล์ใช้ไม่ได้"
    if not kind_of(nm):
        return None, ("รองรับเฉพาะ " + " ".join(fx.IMAGE_EXT + fx.VIDEO_EXT)
                      + f" — ไฟล์ที่ส่งมาเป็น {Path(nm).suffix or 'ไม่มีนามสกุล'}")
    raw = str(b64 or "")
    if "," in raw[:64]:                       # data:image/png;base64,....
        raw = raw.split(",", 1)[1]
    try:
        blob = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None, "อ่านไฟล์ที่ส่งมาไม่ได้"
    if not blob:
        return None, "ไฟล์ว่าง"
    if len(blob) > MAX_BYTES:
        return None, f"ไฟล์ใหญ่เกิน {MAX_BYTES // 1024 // 1024} MB"
    d = dir_of(ctx)
    d.mkdir(parents=True, exist_ok=True)
    dst = d / nm
    # ชื่อซ้ำ = เติมเลขต่อท้าย ไม่ทับของเดิม — ของเดิมอาจถูกใช้อยู่ในไทม์ไลน์แล้ว
    if dst.exists():
        stem, ext = dst.stem, dst.suffix
        n = 2
        while (d / f"{stem}-{n}{ext}").exists():
            n += 1
        dst = d / f"{stem}-{n}{ext}"
    dst.write_bytes(blob)
    return dst.name, None


def delete_asset(ctx, name):
    nm = safe_name(name)
    f = dir_of(ctx) / nm
    try:
        f.resolve().relative_to(dir_of(ctx).resolve())
    except (ValueError, OSError):
        return False
    if not nm or not f.is_file():
        return False
    f.unlink()
    return True


# ─────────────────────────── เวลาในหนัง ───────────────────────────

def cues(ctx, data=None, man=None):
    """ภาพซ้อนทุกชิ้นพร้อมเวลาในหนัง — หน้าเว็บกับตัวสร้างฟิลเตอร์ใช้ตัวนี้ตัวเดียว"""
    from . import fxtext
    data = data if data is not None else fx.load(ctx)
    man = man if man is not None else fx.plan(ctx, data)
    have = {a["file"]: a for a in assets(ctx)}
    out = []
    for k, ov in enumerate(data["overlays"]):
        oid = ov.get("id") or f"ov{k}"
        a = have.get(ov["file"])
        spans = fxtext.shape_spans(man, ov["name"], ov["at"], ov["dur"])
        row = {**ov, "id": oid, "kind": kind_of(ov["file"]),
               "src_w": (a or {}).get("w", 0), "src_h": (a or {}).get("h", 0),
               "missing": not a}
        if not spans:
            out.append({**row, "a": None, "b": None, "orphan": True})
            continue
        for s, e in spans:
            out.append({**row, "a": s, "b": e})
    out.sort(key=lambda x: (x["a"] is None, x["a"] or 0))
    return out


# ─────────────────────────── ฟิลเตอร์ ───────────────────────────

def _num(v):
    return f"{float(v):.4f}"


def _clamp01(expr):
    """หนีบสูตรให้อยู่ 0–1 — คอมมาในสูตรต้อง escape ไม่งั้นถูกอ่านเป็นตัวคั่นฟิลเตอร์"""
    return rf"min(1\,max(0\,{expr}))"


def _shift(ov, a, b, W, H):
    """ระยะที่ภาพต้องเลื่อนตามเวลา → (สูตร x เพิ่ม, สูตร y เพิ่ม)

    overlay รับสูตรที่มี t ได้ จึงขยับตำแหน่งตามเวลาได้ฟรี ๆ ต่างจากการย่อ-ขยาย
    ซึ่งต้องปรับขนาดภาพใหม่ทุกเฟรม (จึงไม่มี pop ให้เลือกในชั้นนี้)
    """
    kind = ov["anim"]
    ti = max(0.01, float(ov["in"]))
    to = max(0.01, float(ov["out"]))
    if kind not in ("rise", "slide"):
        return "0", "0"
    d = H * 0.06 if kind == "rise" else W * 0.08
    # เข้า: ไถลจากระยะ d มาที่ 0 · ออก: ไถลกลับไป d
    p_in = _clamp01(f"(t-{_num(a)})/{_num(ti)}")
    p_out = _clamp01(f"(t-{_num(b - to)})/{_num(to)}")
    move = f"({_num(d)}*(1-{p_in})+{_num(d)}*{p_out})"
    if kind == "rise":
        return "0", move
    # slide เข้าจากขอบที่ใกล้กว่า — ไถลผ่านกลางจอทั้งเฟรมอ่านว่าหลุด ไม่ใช่ตั้งใจ
    return (f"-{move}" if float(ov["x"]) > 0.5 else move), "0"


def build(ctx, data, man, total, base="v0"):
    """สายฟิลเตอร์ของชั้นภาพซ้อน → (อาร์กิวเมนต์ input, ท่อนฟิลเตอร์, ป้ายผลลัพธ์)

    คืนป้ายเดิมกลับไปเมื่อไม่มีภาพซ้อนสักชิ้น เพื่อให้ผู้เรียกต่อสายได้โดยไม่ต้อง
    มีทางแยก — และสายที่ไม่มีอะไรเพิ่มจะเหมือนเดิมทุกตัวอักษร
    """
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    rows = [c for c in cues(ctx, data, man)
            if not c.get("orphan") and not c["missing"]]
    gone = {c["file"] for c in cues(ctx, data, man) if c["missing"]}
    if gone:
        warn(f"ไม่พบไฟล์ภาพซ้อน {len(gone)} ไฟล์ในโฟลเดอร์ assets — ข้ามไป "
             f"({', '.join(sorted(gone)[:3])})")
    if not rows:
        return [], "", base

    ins, parts, cur = [], [], base
    for i, ov in enumerate(rows):
        src = dir_of(ctx) / ov["file"]
        idx = i + 1                     # input 0 คือรายการ concat เสมอ
        a, b = float(ov["a"]), float(ov["b"])
        if ov["kind"] == "image":
            ins += ["-loop", "1", "-t", f"{total:.3f}", "-i", str(src)]
        else:
            # -itsoffset ต้องมาก่อน -i เพราะมันเป็นตัวเลือกของ *input ตัวถัดไป*
            ins += ["-itsoffset", f"{a:.3f}", "-i", str(src)]

        px = int(round(W * float(ov["width"])))
        px = max(2, px - (px % 2))
        chain = [f"scale={px}:-2:flags={ctx.get('video.scale_flags', 'lanczos')}"]
        if float(ov["angle"]):
            # c=none = พื้นที่ที่เกิดจากการหมุนเป็นสีใส ไม่ใช่ดำ ไม่งั้นได้กรอบดำ
            rad = f"{float(ov['angle']) * 3.14159265 / 180.0:.6f}"
            chain.append(f"rotate={rad}:c=none:ow=rotw({rad}):oh=roth({rad})")
        chain.append("format=rgba")
        if float(ov["opacity"]) < 1.0:
            chain.append(f"colorchannelmixer=aa={_num(ov['opacity'])}")
        if ov["anim"] != "none":
            ti = min(max(0.01, float(ov["in"])), max(0.02, (b - a) / 2))
            to = min(max(0.01, float(ov["out"])), max(0.02, (b - a) / 2))
            chain.append(f"fade=t=in:st={a:.3f}:d={ti:.3f}:alpha=1")
            chain.append(f"fade=t=out:st={b - to:.3f}:d={to:.3f}:alpha=1")
        parts.append(f"[{idx}:v]" + ",".join(chain) + f"[ov{i}]")

        dx, dy = _shift(ov, a, b, W, H)
        x = f"({W}*{_num(ov['x'])}-w/2)" + (f"+{dx}" if dx != "0" else "")
        y = f"({H}*{_num(ov['y'])}-h/2)" + (f"+{dy}" if dy != "0" else "")
        nxt = f"v{i + 1}"
        parts.append(f"[{cur}][ov{i}]overlay=x='{x}':y='{y}'"
                     f":enable='between(t,{a:.3f},{b:.3f})'"
                     f":eof_action=pass:format=auto[{nxt}]")
        cur = nxt

    return ins, ";".join(parts), cur


def summary(ctx, data=None, man=None):
    """สรุปชั้นภาพซ้อนให้หน้าเว็บ"""
    try:
        rows = cues(ctx, data, man)
    except SystemExit:
        raise
    except Exception:
        rows = []
    return {"assets": assets(ctx), "cues": rows,
            "dir": str(dir_of(ctx)),
            "missing": sorted({c["file"] for c in rows if c["missing"]})}
