"""CAPTION — ชั้นข้อความบนหนัง → .vcut/captions.json → final-text.mp4

ขั้นนี้ **ไม่ตัดอะไรใหม่เลย** ใช้ segment ชุดเดียวกับขั้น 3 ทั้งหมด ต่างกันแค่
ตอนต่อไฟล์: ผ่านฟิลเตอร์ `ass` แล้วเข้ารหัสภาพใหม่หนึ่งรอบ ได้ไฟล์ตัวที่สอง
ที่มีข้อความติดอยู่ในภาพ ส่วน final.mp4 ตัวเดิมไม่ถูกแตะ

**ทำไมเป็น ASS ไม่ใช่ drawtext**

drawtext ต้องต่อฟิลเตอร์หนึ่งตัวต่อข้อความหนึ่งชิ้น หนังที่มีซับ 300 บรรทัดจะ
กลายเป็นสายฟิลเตอร์ยาวเป็นกิโล และมันวางข้อความไทยผิด — สระบนล่างกับวรรณยุกต์
ไม่ซ้อนตำแหน่ง เพราะ freetype เปล่า ๆ ไม่ได้ทำ shaping · libass เรียก harfbuzz
ให้ จึงจัดไทยถูกทุกตัว และรับข้อความกี่พันบรรทัดก็ได้ในฟิลเตอร์เดียว

**ข้อความผูกกับ (คลิป, วินาทีในคลิป) ไม่ใช่วินาทีในหนัง**

ไทม์ไลน์เป็นตัวเดียวกับขั้น 3 ซึ่งลากขอบ/ลบชิ้นได้ตลอด ถ้าจำเป็นวินาทีในหนังไว้
ตรง ๆ ข้อความทุกชิ้นหลังจุดที่แก้จะเลื่อนหลุดพร้อมกันหมดโดยไม่มีใครรู้ตัว
ผูกกับคลิปแล้วคำนวณวินาทีในหนังใหม่ทุกครั้งจากไทม์ไลน์ปัจจุบัน — แก้ตรงไหน
ข้อความก็ตามไปเอง และชิ้นที่ถูกตัดทิ้ง ข้อความของมันก็หายไปด้วยอย่างที่ควรเป็น
"""
import re
import shutil
import subprocess
from pathlib import Path

from .util import c, die, info, part_path, read_json, run as sh, warn, write_json

CAPTIONS = "captions.json"

# ─── ค่าตั้งต้นของสไตล์กลาง ───
# หน่วยเป็นพิกเซลจริงของหนัง (PlayRes ถูกตั้งเท่าขนาดภาพ) เลขที่เห็นในหน้าเว็บ
# จึงเป็นเลขเดียวกับที่ออกมาในไฟล์ ไม่ต้องแปลงในหัว
STYLE = {
    "font": "Sukhumvit Set",
    "size": 54,
    "color": "#FFFFFF",
    "outline": "#000000",
    "border": 3.0,
    "shadow": 0.0,
    "bold": False,
    "italic": False,
    "align": 2,          # เลขแป้นตัวเลข: 1-3 ล่าง · 4-6 กลาง · 7-9 บน
    "margin_v": 60,
    "margin_h": 60,
    # ตรึงตำแหน่งเอง — สัดส่วน 0–1 ของกรอบภาพ ไม่ใช่พิกเซล เพราะตำแหน่งต้องอยู่
    # ที่เดิมเมื่อเปลี่ยนความละเอียดหนัง (ขนาดตัวอักษรเป็นพิกเซลได้ แต่ตำแหน่ง
    # ที่ผูกกับพิกเซลจะหลุดออกนอกจอทันทีที่ย่อจาก 4K เป็น 1080p)
    # None = ไม่ตรึง ใช้ align + margin ตามเดิม
    "pos_x": None,
    "pos_y": None,
    "spacing": 0.0,      # ระยะห่างตัวอักษร (\fsp)
    "angle": 0.0,        # หมุนทวนเข็ม องศา (\frz)
}

# ค่าที่ทับได้เป็นราย ๆ
CUE_KEYS = ("font", "size", "color", "outline", "border", "shadow", "bold",
            "italic", "spacing", "angle")

# ตำแหน่งก็ทับรายบรรทัดได้ แต่เป็นของที่ต้องตั้งใจสั่ง ไม่ใช่ผลพลอยได้
#
# เดิมกันไว้ไม่ให้ทับเลย เพราะซับที่วางไม่ตรงกันเป็นบรรทัด ๆ อ่านแล้วเหมือนหนัง
# พังมากกว่าเหมือนตั้งใจ ข้อกังวลนั้นยังจริงอยู่ — แต่แก้ด้วยการทำให้มันเป็น
# opt-in รายบรรทัด (หน้าเว็บต้องติ๊ก "ย้ายเฉพาะบรรทัดนี้" ก่อน) ดีกว่าห้ามขาด
# แล้วคนที่ต้องหลบป้ายในภาพจริง ๆ ทำไม่ได้เลย
POS_KEYS = ("align", "margin_v", "margin_h", "pos_x", "pos_y")

BOX_KEYS = CUE_KEYS + ("align",)


def path(ctx):
    return ctx.work / CAPTIONS


def blank():
    return {"version": 1, "style": dict(STYLE),
            "auto": {"enabled": True, "edits": {}, "drop": [], "styles": {}},
            "boxes": []}


def load(ctx):
    d = read_json(path(ctx)) or {}
    if not d:
        return blank()
    out = blank()
    out["style"].update({k: v for k, v in (d.get("style") or {}).items() if k in STYLE})
    a = d.get("auto") or {}
    out["auto"] = {"enabled": bool(a.get("enabled", True)),
                   "edits": dict(a.get("edits") or {}),
                   "drop": list(a.get("drop") or []),
                   "styles": dict(a.get("styles") or {})}
    out["boxes"] = [b for b in (d.get("boxes") or []) if isinstance(b, dict)]
    return out


def save(ctx, data):
    return write_json(path(ctx), data)


# ─────────────────────────── ffmpeg ที่เขียนตัวหนังสือได้ ───────────────────────────

_FF = None
CANDIDATES = ["/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
              "/usr/local/opt/ffmpeg-full/bin/ffmpeg", "ffmpeg"]


def _has_ass(exe):
    try:
        r = subprocess.run([exe, "-hide_banner", "-filters"],
                           capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return bool(re.search(r"^\s*\S*\s+ass\s+", r.stdout, re.M))


def text_ffmpeg(ctx, quiet=False):
    """ffmpeg ตัวที่มีฟิลเตอร์ ass — คืน None ถ้าหาไม่เจอ

    homebrew ย้ายฟิลเตอร์ตัวหนังสือออกจากสูตร ffmpeg ปกติไปไว้ที่ ffmpeg-full
    ซึ่งเป็น keg-only (ติดตั้งแล้วไม่ทับตัวเดิม) เครื่องส่วนใหญ่จึงมี ffmpeg ที่
    ตัดต่อได้ครบแต่เขียนตัวหนังสือไม่ได้เลย และไม่มีอะไรบอก จนกว่าจะสั่งแล้วพัง
    """
    global _FF
    if _FF is not None:
        return _FF or None
    want = str(ctx.get("caption.ffmpeg", "") or "")
    for exe in ([want] if want else []) + CANDIDATES:
        if exe != "ffmpeg" and not Path(exe).exists():
            continue
        if exe == "ffmpeg" and not shutil.which("ffmpeg"):
            continue
        if _has_ass(exe):
            _FF = exe
            return exe
    _FF = ""
    if not quiet:
        warn("ffmpeg ที่มีอยู่เขียนตัวหนังสือลงภาพไม่ได้ (ไม่มีฟิลเตอร์ ass)\n"
             "   ติดตั้งด้วย  brew install ffmpeg-full  แล้วสั่งใหม่\n"
             "   (เป็น keg-only ไม่ทับ ffmpeg เดิม)")
    return None


def fonts():
    """ฟอนต์ที่ใช้ได้จริงในเครื่อง — เอาเฉพาะที่รองรับไทย ขึ้นก่อน แล้วต่อด้วยที่เหลือ"""
    def fam(pattern):
        # ต้องมี pattern เสมอ — `fc-list family` เฉย ๆ คืนค่าว่าง ส่วน `fc-list : family`
        # คืนครบ (":" คือ pattern ที่ไม่กรองอะไรเลย) ต่างกันแค่ตัวเดียวแต่ผลคนละเรื่อง
        try:
            r = subprocess.run(["fc-list", pattern, "family"],
                               capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.SubprocessError):
            return []
        out = set()
        for line in r.stdout.splitlines():
            for name in line.split(","):
                name = name.strip()
                # ชื่อขึ้นต้นด้วยจุดคือฟอนต์ระบบที่ซ่อนไว้ เลือกไปก็ไม่ได้ใช้จริง
                if name and not name.startswith("."):
                    out.add(name)
        return sorted(out)

    th = fam(":lang=th")
    rest = [f for f in fam(":") if f not in set(th)]
    return {"thai": th, "other": rest}


# ─────────────────────────── เวลาในหนัง ───────────────────────────

def _rows(tl, ctx):
    """ไทม์ไลน์ → ชิ้นพร้อมเวลาเริ่มในหนัง

    ความยาวที่ใช้เดินเวลา (len) ต้องเป็น exact_dur — ความยาวที่ปัดลงกริดเฟรม
    แล้ว ซึ่งคือความยาวที่จะโผล่ในไฟล์จริง ใช้ dur ดิบจะคลาดสะสมทีละเศษเฟรม
    จนซับท้ายเรื่องเลื่อนไปหลายสิบมิลลิวินาที
    """
    from .render import exact_dur
    out, t = [], 0.0
    for s in tl:
        d = exact_dur(float(s["dur"]), ctx)
        out.append({"name": s["name"], "start": float(s["start"]),
                    "dur": float(s["dur"]), "at": t, "len": d})
        t += d
    return out, t


def segments(ctx):
    """ชิ้นตามลำดับในหนัง + เวลาเริ่มของแต่ละชิ้นเมื่อต่อกันแล้ว

    **อ่านจาก edl.json ไม่ใช่ render.json** — render.json คือ *ผลของการกดสร้าง
    ไฟล์ครั้งล่าสุด* ไม่ใช่ไทม์ไลน์ที่อยู่ตรงหน้า ✂ ตัด · ✕ ลบ · ลากขอบ แล้วกด
    บันทึก edl.json ขยับทันทีแต่ render.json ยังเป็นของรอบก่อน ขั้น 4 จึงวางซับ
    บนไทม์ไลน์เก่า: ซับของชิ้นที่เพิ่งลบยังอยู่ครบ และซับที่เหลือทั้งหมดเลื่อนไป
    เท่ากับความยาวของชิ้นที่หายไป (วัดจริง: ลบชิ้นแรก 2 วิ แล้วซับทั้งเรื่องเลื่อน
    2 วิ พร้อมมีซับผีของชิ้นที่ไม่มีอยู่แล้วโผล่นำหน้า)

    ค่าที่ต้องใช้มีแค่ (ชื่อคลิป · ช่วงในคลิป · ความยาว) ซึ่งอยู่ใน EDL ครบอยู่แล้ว
    ส่วน exact_dur คำนวณด้วยฟังก์ชันตัวเดียวกับที่ render ใช้ ผลจึงเท่ากันเป๊ะ
    ตอนที่สองไฟล์ตรงกัน — และตอนที่ยังไม่ตรง ขั้น 4 จะตามไทม์ไลน์ ไม่ตามของเก่า
    """
    edl = read_json(ctx.edl, {}) or {}
    tl = edl.get("timeline") or []
    if tl:
        return _rows(tl, ctx)
    # ไม่มี EDL ให้อ่าน (ถูกลบทิ้ง) — ยังตอบจากรายการที่ต่อไว้รอบก่อนได้ดีกว่าตอบว่าง
    rman = read_json(ctx.work / "render.json") or {}
    segs = sorted(rman.get("segments", []), key=lambda s: s["i"])
    return _rows(segs, ctx) if segs else ([], 0.0)


def stale(ctx):
    """ชิ้นที่ต่อไว้รอบก่อนยังตรงกับไทม์ไลน์ตอนนี้ไหม — คืนเหตุผล หรือ None ถ้าตรง

    ขั้น 4 เขียนซับ *ทับไฟล์ที่ต่อจาก render.json* แต่คิดเวลาซับจาก edl.json
    สองอย่างนี้ตรงกันเสมอเมื่อกดปุ่มในหน้าเว็บ (ปุ่มขั้น 4 สั่ง render ก่อน caption
    ทุกครั้ง) แต่สั่ง `vcut caption` เองหลังแก้ไทม์ไลน์จะไม่ตรง แล้วซับจะถูกเผา
    ลงบนภาพผิดช่วงแบบกู้ไม่ได้นอกจากทำใหม่ทั้งไฟล์ — หยุดไว้ก่อนดีกว่า
    """
    edl = read_json(ctx.edl, {}) or {}
    tl = edl.get("timeline") or []
    rman = read_json(ctx.work / "render.json", {}) or {}
    segs = sorted(rman.get("segments", []), key=lambda s: s["i"])
    key = lambda s: (s["name"], round(float(s["start"]), 3), round(float(s["dur"]), 3))
    if not tl or not segs:
        return None
    if [key(s) for s in tl] != [key(s) for s in segs]:
        return (f"ไทม์ไลน์เปลี่ยนไปหลังต่อไฟล์ครั้งล่าสุด "
                f"(ตอนนี้ {len(tl)} ชิ้น · ที่ต่อไว้ {len(segs)} ชิ้น) — "
                f"ต้องตัดชิ้นใหม่ก่อน ไม่งั้นซับจะไปอยู่ผิดช่วง\n"
                f"   สั่ง `vcut render` ก่อน หรือกดปุ่ม 'สร้างไฟล์' ในหน้าเว็บ "
                f"ซึ่งทำให้เองอยู่แล้ว")
    return None


def _overlap(seg, a, b):
    """ช่วง [a,b] ของคลิป ตกอยู่ในชิ้นนี้ตรงไหนของหนัง — คืน None ถ้าไม่ทับเลย"""
    s = max(a, seg["start"])
    e = min(b, seg["start"] + seg["dur"])
    if e - s <= 0.0:
        return None
    return seg["at"] + (s - seg["start"]), seg["at"] + (e - seg["start"])


def cues(ctx, data=None):
    """ข้อความทุกชิ้นพร้อมเวลาในหนัง — หน้าเว็บกับตัวเขียน ASS ใช้ตัวนี้ตัวเดียว

    ผูกกันไว้ที่เดียวเพราะพรีวิวในเบราว์เซอร์กับไฟล์ที่ได้ต้องตรงกันเป๊ะ ถ้าคำนวณ
    คนละที่ เมื่อไรที่สองที่คิดไม่ตรงกันจะไม่มีใครรู้จนกว่าจะ render เสร็จ
    """
    data = data or load(ctx)
    segs, total = segments(ctx)
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})
    base = data["style"]
    auto = data["auto"]
    drop = set(auto["drop"])
    out = []

    if auto["enabled"]:
        for seg in segs:
            for i, line in enumerate(tr.get(seg["name"], [])):
                a, b, text = line[0], line[1], line[2]
                cid = f"{seg['name']}#{i}"
                if cid in drop:
                    continue
                got = _overlap(seg, a, b)
                if not got:
                    continue
                # เศษที่โผล่แค่แวบเดียวตรงรอยตัด อ่านไม่ทันแต่กะพริบกวนตา
                if got[1] - got[0] < 0.20:
                    continue
                txt = auto["edits"].get(cid, text)
                if not str(txt).strip():
                    continue
                st = dict(base)
                st.update({k: v for k, v in (auto["styles"].get(cid) or {}).items()
                           if k in CUE_KEYS + POS_KEYS})
                out.append({"id": cid, "kind": "auto", "a": round(got[0], 3),
                            "b": round(got[1], 3), "text": str(txt),
                            "name": seg["name"], "clip_a": a, "style": st})

    for k, box in enumerate(data["boxes"]):
        name = str(box.get("name", ""))
        at = float(box.get("at", 0) or 0)
        dur = max(0.1, float(box.get("dur", 3) or 3))
        st = dict(base)
        st.update({k2: v for k2, v in (box.get("style") or {}).items() if k2 in BOX_KEYS})
        placed = False
        for seg in segs:
            if seg["name"] != name:
                continue
            got = _overlap(seg, at, at + dur)
            if not got:
                continue
            out.append({"id": box.get("id") or f"box{k}", "kind": "box",
                        "a": round(got[0], 3), "b": round(got[1], 3),
                        "text": str(box.get("text", "")), "name": name,
                        "clip_a": at, "style": st,
                        "x": box.get("x"), "y": box.get("y")})
            placed = True
        if not placed:
            # ไม่ error — บอกหน้าเว็บว่าชิ้นนี้จะไม่โผล่ เพราะช่วงที่มันเกาะอยู่
            # ถูกตัดออกจากหนังไปแล้ว คนเขียนข้อความควรรู้ ไม่ใช่ให้หายเงียบ ๆ
            out.append({"id": box.get("id") or f"box{k}", "kind": "box",
                        "a": None, "b": None, "text": str(box.get("text", "")),
                        "name": name, "clip_a": at, "style": st,
                        "x": box.get("x"), "y": box.get("y"), "orphan": True})

    out.sort(key=lambda x: (x["a"] is None, x["a"] or 0))
    return _join(out), total


def _join(rows):
    """ประโยคเดียวที่ถูกไทม์ไลน์ผ่าครึ่ง แล้วสองครึ่งมาต่อกันพอดีในหนัง = ชิ้นเดียว

    เกิดตลอดเวลาเวลาซอยประโยคด้วย cut ชน — ชิ้น A จบวินาทีที่ 17.13 ชิ้น B เริ่ม
    ที่ 17.13 พอดี ถ้าปล่อยเป็นสองชิ้น libass จะดับแล้วจุดใหม่ตรงรอยต่อ เห็นเป็น
    ตัวหนังสือกะพริบหนึ่งเฟรมทั้งที่คนพูดต่อเนื่อง
    """
    out = []
    for r in rows:
        p = out[-1] if out else None
        if (p and r["a"] is not None and p["b"] is not None
                and r["id"] == p["id"] and r["text"] == p["text"]
                and abs(r["a"] - p["b"]) < 0.05):
            p["b"] = r["b"]
            continue
        out.append(r)
    return out


# ─────────────────────────── เขียน ASS ───────────────────────────

def _clock(t):
    """วินาที → H:MM:SS.cc (ASS ใช้เศษหนึ่งร้อยวินาที ไม่ใช่มิลลิวินาที)"""
    cs = int(round(max(0.0, t) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def _colour(hexstr, alpha=0):
    """#RRGGBB → &HAABBGGRR — ASS สลับลำดับสีและนับ alpha กลับด้าน (00 = ทึบ)"""
    s = str(hexstr or "#FFFFFF").lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", s):
        s = "FFFFFF"
    r, g, b = s[0:2], s[2:4], s[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def _esc(text):
    """ข้อความมาจาก whisper และจากคนพิมพ์ — ต้องไม่กลายเป็นคำสั่งของ ASS

    { } เปิด/ปิดแท็กคำสั่ง · \\ นำหน้าคำสั่ง · ขึ้นบรรทัดใหม่ใน ASS คือ \\N
    ถ้าไม่กันไว้ คนพิมพ์วงเล็บปีกกาทีเดียวข้อความหายทั้งบรรทัด
    """
    s = str(text).replace("\\", "∖")          # ทับด้วยเครื่องหมายหน้าตาเหมือนกัน
    s = s.replace("{", "(").replace("}", ")")
    s = re.sub(r"\r\n?|\n", r"\\N", s)
    return s.strip()


def _tags(cue, base):
    """แท็กทับสไตล์เฉพาะชิ้นนี้ — ใส่เฉพาะที่ต่างจากสไตล์กลางจริง ๆ"""
    st, t = cue["style"], []
    if st.get("font") != base.get("font"):
        t.append(r"\fn" + str(st.get("font")))
    if float(st.get("size", 0)) != float(base.get("size", 0)):
        t.append(r"\fs" + str(int(st.get("size"))))
    if st.get("color") != base.get("color"):
        t.append(r"\c" + _colour(st.get("color")) + "&")
    if st.get("outline") != base.get("outline"):
        t.append(r"\3c" + _colour(st.get("outline")) + "&")
    if float(st.get("border", 0)) != float(base.get("border", 0)):
        t.append(r"\bord" + f"{float(st.get('border')):g}")
    if float(st.get("shadow", 0)) != float(base.get("shadow", 0)):
        t.append(r"\shad" + f"{float(st.get('shadow')):g}")
    if bool(st.get("bold")) != bool(base.get("bold")):
        t.append(r"\b" + ("1" if st.get("bold") else "0"))
    if bool(st.get("italic")) != bool(base.get("italic")):
        t.append(r"\i" + ("1" if st.get("italic") else "0"))
    if float(st.get("spacing", 0) or 0) != float(base.get("spacing", 0) or 0):
        t.append(r"\fsp" + f"{float(st.get('spacing') or 0):g}")
    if float(st.get("angle", 0) or 0) != float(base.get("angle", 0) or 0):
        t.append(r"\frz" + f"{float(st.get('angle') or 0):g}")
    return t


def _place(cue, base, W, H):
    """ตำแหน่งของชิ้นนี้ — คืน (แท็กที่ต้องนำหน้า, margin ของบรรทัด)

    ASS วางข้อความได้สองทางที่ใช้ร่วมกันไม่ได้: \\pos ตรึงพิกัด กับ align+margin
    ที่ให้ตัวเรนเดอร์จัดให้เอง เมื่อมี \\pos แล้ว margin ทั้งสามช่องไม่มีผลเลย
    จึงต้องส่งศูนย์กลับไป (ศูนย์ = ใช้ค่าของ [V4+ Styles] ซึ่งก็ไม่ถูกใช้อยู่ดี)

    margin เป็น *ช่องของบรรทัด Dialogue* ไม่ใช่แท็ก — ASS ไม่มี \\marginv ให้สั่ง
    ทับเป็นราย ๆ ตำแหน่งรายบรรทัดจึงต้องเขียนลงช่องพวกนี้ ไม่ใช่ในวงเล็บปีกกา
    """
    st = cue["style"]
    if cue["kind"] == "box":
        al = int(st.get("align", 5) or 5)
        x = float(cue.get("x") if cue.get("x") is not None else 0.5)
        y = float(cue.get("y") if cue.get("y") is not None else 0.5)
        return [rf"\an{al}", rf"\pos({x * W:.0f},{y * H:.0f})"], (0, 0, 0)

    b_al = int(base.get("align", 2) or 2)
    al = int(st.get("align", b_al) or b_al)
    tags = [rf"\an{al}"] if al != b_al else []

    px, py = st.get("pos_x"), st.get("pos_y")
    if px is not None and py is not None:
        # \pos ต้องมี \an กำกับเสมอ ไม่งั้นจุดที่พิกัดหมายถึงคือมุมของสไตล์กลาง
        # ซึ่งอาจคนละมุมกับที่หน้าเว็บวาดพรีวิวไว้ แล้วสองที่จะไม่ตรงกัน
        if not tags:
            tags = [rf"\an{al}"]
        tags.append(rf"\pos({float(px) * W:.0f},{float(py) * H:.0f})")
        return tags, (0, 0, 0)

    mh = int(st.get("margin_h", base.get("margin_h", 60)) or 0)
    mv = int(st.get("margin_v", base.get("margin_v", 60)) or 0)
    if mh == int(base.get("margin_h", 60) or 0) and mv == int(base.get("margin_v", 60) or 0):
        return tags, (0, 0, 0)          # เท่าสไตล์กลาง ปล่อยให้ใช้ของสไตล์
    return tags, (mh, mh, mv)


def build_ass(ctx, data, W, H):
    data = data or load(ctx)
    base = data["style"]
    rows, _ = cues(ctx, data)

    head = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {int(W)}",
        f"PlayResY: {int(H)}",
        "WrapStyle: 2",              # ขึ้นบรรทัดเองเฉพาะที่สั่ง \N เท่านั้น
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
         "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
         "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
         "MarginL, MarginR, MarginV, Encoding"),
        ",".join([
            "Style: sub", str(base.get("font", STYLE["font"])),
            str(int(base.get("size", STYLE["size"]))),
            _colour(base.get("color")), _colour(base.get("color")),
            _colour(base.get("outline")), _colour("#000000", alpha=0x80),
            "-1" if base.get("bold") else "0",
            "-1" if base.get("italic") else "0", "0", "0",
            "100", "100",
            f"{float(base.get('spacing', 0) or 0):g}",
            f"{float(base.get('angle', 0) or 0):g}", "1",
            f"{float(base.get('border', 3)):g}", f"{float(base.get('shadow', 0)):g}",
            str(int(base.get("align", 2))),
            str(int(base.get("margin_h", 60))), str(int(base.get("margin_h", 60))),
            str(int(base.get("margin_v", 60))), "1",
        ]),
        "",
        "[Events]",
        ("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
         "Effect, Text"),
    ]

    body, n = [], 0
    for cue in rows:
        if cue.get("orphan") or cue["a"] is None:
            continue
        text = _esc(cue["text"])
        if not text:
            continue
        place, (ml, mr, mv) = _place(cue, base, W, H)
        tags = place + _tags(cue, base)
        pre = "{" + "".join(tags) + "}" if tags else ""
        # ต้องมี 9 ช่องก่อนข้อความเสมอ — ขาดคอมมาตัวเดียว แท็กจะถูกอ่านเป็นช่อง
        # Effect แล้วโผล่ออกมาเป็นตัวหนังสือให้คนดูเห็นทั้งบรรทัด
        body.append(f"Dialogue: {0 if cue['kind'] == 'auto' else 1},"
                    f"{_clock(cue['a'])},{_clock(cue['b'])},sub,,"
                    f"{ml},{mr},{mv},,{pre}{text}")
        n += 1
    return "\n".join(head + body) + "\n", n


# ─────────────────────────── ต่อไฟล์พร้อมข้อความ ───────────────────────────

def out_path(ctx):
    p = Path(ctx.out)
    return p.with_name(p.stem + "-text" + p.suffix)


def run(ctx, out=None):
    from . import render as rmod
    exe = text_ffmpeg(ctx)
    if not exe:
        die("ยังเขียนตัวหนังสือลงภาพไม่ได้ — ติดตั้ง ffmpeg-full ก่อน\n"
            "   brew install ffmpeg-full")

    rman = read_json(ctx.work / "render.json")
    if not rman:
        die("ยังไม่มี render.json — สั่ง 'สร้างไฟล์' ที่ขั้น 3 ก่อน")
    why = stale(ctx)
    if why:
        die(why)
    segs = sorted(rman["segments"], key=lambda s: s["i"])
    files = [ctx.seg_dir / s["file"] for s in segs]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        die(f"ไม่พบ segment {len(missing)} ชิ้น (เช่น {missing[0]}) — สั่ง 'สร้างไฟล์' ใหม่")

    data = load(ctx)
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    text, n = build_ass(ctx, data, W, H)
    if not n:
        warn("ไม่มีข้อความสักชิ้นที่จะเขียนลงไป — ได้ไฟล์ที่หน้าตาเหมือนของขั้น 3")
    ass = ctx.work / "captions.ass"
    ass.write_text(text, encoding="utf-8")

    dst = Path(out).expanduser() if out else out_path(ctx)
    dst.parent.mkdir(parents=True, exist_ok=True)
    lst = ctx.work / "concat_text.txt"
    lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in files), encoding="utf-8")

    info(f"CAPTION  {len(files)} ชิ้น · ข้อความ {n} ชิ้น → {dst.name}  "
         f"{c('(เข้ารหัสภาพใหม่หนึ่งรอบ — ข้อความติดอยู่ในภาพ)', 'd')}")

    e = ctx.get("encode", {})
    master = float(ctx.get("audio.master_lufs", 0.0) or 0.0)
    tmp = part_path(dst, ".mp4")     # ชื่อไม่ซ้ำกัน — ดูเหตุผลที่ assemble.run
    # ฟิลเตอร์อ่านไฟล์ .ass ตามที่อยู่ — escape ให้เป็นทางของ ffmpeg
    fpath = str(ass).replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")
    cmd = [exe, "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-f", "concat", "-safe", "0", "-i", str(lst),
           "-vf", f"ass='{fpath}'"]
    cmd += rmod.encode_args(ctx, audio=False)
    if master >= -70.0 and master != 0.0:
        cmd += ["-af", f"loudnorm=I={master}:TP=-1.5:LRA=11"]
    cmd += ["-c:a", str(e.get("acodec", "aac")),
            "-b:a", str(e.get("abitrate", "192k")),
            "-ar", str(int(e.get("arate", 48000))),
            "-ac", str(int(e.get("achannels", 2)))]
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        die(f"เขียนข้อความลงหนังไม่สำเร็จ\n{r.stderr[-700:]}")
    tmp.replace(dst)

    from .assemble import verify
    verify(ctx, dst, segs)
    return dst
