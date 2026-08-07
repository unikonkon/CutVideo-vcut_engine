"""FX — ขั้น 5 · ชั้นแต่งหนัง → .vcut/fx.json + .vcut/fx-render.json

ขั้นนี้ **ไม่ตัดอะไรใหม่ ไม่แตะไฟล์ของขั้น 3 และขั้น 4** — อ่านไทม์ไลน์ชุดเดียว
กับขั้น 3 (render.json) และชั้นข้อความชุดเดียวกับขั้น 4 (captions.json) แล้วผลิต
ไฟล์ตัวที่สาม ความสัมพันธ์แบบเดียวกับที่ขั้น 4 มีต่อขั้น 3 เป๊ะ

**ทำไมขั้น 5 ต้องมีรายการชิ้นของตัวเอง แทนที่จะอ่าน render.json ตรง ๆ**

เอฟเฟกต์ระดับชิ้นอย่างสโลว์โมชันเปลี่ยน *ความยาว* ของชิ้นนั้น ทุกอย่างที่อยู่
หลังจากนั้นในหนังจึงเลื่อนตามหมด รวมทั้งซับที่ต้องขึ้นให้ตรงปาก ถ้าขั้น 5 อ่าน
ความยาวจาก render.json ตรง ๆ ตัวเลขที่ได้จะเป็นของ *ก่อน* ใส่เอฟเฟกต์เสมอ แล้ว
ซับตั้งแต่ชิ้นนั้นไปจะเลื่อนทั้งเรื่องโดยไม่มีใครรู้จนกว่าจะนั่งดูไฟล์จนจบ

fx-render.json คือคำตอบของ "หลังใส่เอฟเฟกต์แล้วหนังมีชิ้นอะไรบ้าง ยาวเท่าไร"
ไม่มีสโลว์โมสักชิ้น มันก็เท่ากับ render.json ทุกช่อง

**สิ่งที่อยู่ใน fx.json**

  clips     เอฟเฟกต์รายชิ้น — speed · zoom · grade · mute   (ทำที่ fx.py นี้)
  text      แอนิเมชัน + กล่องพื้นหลังของข้อความขั้น 4        (fxtext.py)
  shapes    รูปทรงเวกเตอร์ — ลูกศร · แถบ · จุด               (fxtext.py)
  overlays  ภาพซ้อน (สกรีนช็อต · สติกเกอร์ · เอนด์การ์ด)     (overlay.py)
  music     เพลงประกอบ + หลบเสียงพูดอัตโนมัติ                (music.py)

ทุกชั้นผูกเวลากับ **(คลิป, วินาทีในคลิป)** ไม่ใช่วินาทีในหนัง — ไทม์ไลน์ลากแก้ได้
ตลอด ถ้าจำวินาทีในหนังไว้ตรง ๆ ทุกอย่างหลังจุดที่แก้จะเลื่อนหลุดพร้อมกันหมด

**เอฟเฟกต์รายชิ้นทำจาก segment ของขั้น 3 ไม่ใช่ตัดจากไฟล์ต้นฉบับใหม่**

segment ของขั้น 3 ผ่านการหมุน · ใส่พื้นหลังเบลอ · แปลงช่วงสี · บังคับ CFR ·
ปรับความดัง มาครบแล้ว ขั้น 5 จึงรับมันมาแล้วแต่งต่อ แทนที่จะตัดจากไฟล์ต้นฉบับ
พร้อมฟิลเตอร์ทั้งพวงอีกรอบ ซึ่งจะแปลว่าต้องก๊อปตรรกะการปรับมาตรฐานทั้งหมด
มาไว้อีกชุด แล้ววันหนึ่งสองชุดจะปรับไม่เหมือนกัน

ราคาที่จ่ายคือ **ชิ้นที่ใส่เอฟเฟกต์ถูกเข้ารหัสภาพเพิ่มหนึ่งรอบ** และการซูมเข้า
ทำจากภาพ 1080p ที่ย่อมาแล้ว ไม่ใช่จาก 4K ต้นฉบับ — จ่ายเฉพาะชิ้นที่ตั้งใจแต่ง
ส่วนชิ้นที่ไม่ได้แตะใช้ไฟล์ของขั้น 3 ตรง ๆ ไม่เสียอะไรเลย

**ทำไมแอนิเมชันอยู่ที่นี่ ไม่ใช่ที่ captions.json**

ขั้น 4 เป็นเจ้าของ *เนื้อข้อความกับหน้าตานิ่ง ๆ* (พิมพ์ว่าอะไร ฟอนต์อะไร อยู่ตรงไหน)
ขั้น 5 เป็นเจ้าของ *การเคลื่อนไหว* ผูกกันด้วย id ของกล่องข้อความ แบ่งแบบนี้แล้ว
captions.json ไม่ต้องถูกแตะเลย และไฟล์ของขั้น 4 ยังสร้างได้เหมือนเดิมทุกประการ
"""
import re
from pathlib import Path

from .util import die, read_json, warn, write_json

FX = "fx.json"
PLAN = "fx-render.json"

# ── เอฟเฟกต์รายชิ้น — ค่าตั้งต้นทุกตัวแปลว่า "ไม่แตะ" ──
CLIP = {
    "speed": 1.0,     # < 1 ช้าลง (สโลว์โม) · > 1 เร็วขึ้น
    "zoom": 1.0,      # 1.0 = เต็มเฟรมตามเดิม
    "grade": "",      # ชื่อโทนสี · "" = ไม่แตะสี
    "mute": False,    # ตัดเสียงของชิ้นนี้
}

# เอฟเฟกต์รายชิ้นที่ทำงานได้จริงแล้ว (เฟส C)
LIVE = frozenset(CLIP)

# ของที่ยังทำไม่ได้ → บอกว่าใครจะเป็นคนทำ (ขึ้นในข้อความ error)
# ว่างอยู่ตอนนี้เพราะทุกชั้นที่ประกาศไว้ทำงานได้หมดแล้ว — เก็บกลไกไว้เพราะรอบหน้า
# ที่ประกาศช่องใหม่ก่อนทำเสร็จ จะได้ไม่ต้องคิดวิธีบอกคนใช้ใหม่
OWNER = {}

# ── โทนสี ──
#
# เป็นชุดสำเร็จ ไม่ใช่ช่องปรับ R/G/B ทีละตัว เพราะสิ่งที่คนตัดต่ออยากได้คือ
# "ให้ช็อตนี้อุ่นขึ้น" ไม่ใช่ "เพิ่มแดง 0.06 ลดน้ำเงิน 0.04" — และชุดสำเร็จ
# ทำให้ทั้งเรื่องมีโทนเป็นชุดเดียวกัน ซึ่งเป็นเรื่องที่ตาจับได้ทันทีถ้าไม่มี
GRADE = {
    "": "ไม่แตะสี",
    "warm": "อุ่น — แสงเย็น/ตอนเช้า",
    "cool": "เย็น — ป่าดิบ/สายฝน",
    "punch": "จัดจ้าน — คอนทราสต์+สีเข้ม",
    "flat": "จืด — ไว้คั่นหรือทำพื้นหลังข้อความ",
    "bw": "ขาวดำ",
}
GRADE_VF = {
    "warm": "colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.06",
    "cool": "colorbalance=rs=-0.06:bs=0.07:rm=-0.03:bm=0.05,eq=saturation=1.02",
    "punch": "eq=contrast=1.12:saturation=1.20:gamma=0.98",
    "flat": "eq=contrast=0.92:saturation=0.88",
    "bw": "hue=s=0,eq=contrast=1.08",
}

# ── ชั้นข้อความเคลื่อนไหว (เฟส A) ──
#
# แอนิเมชันที่ใช้ได้ · ค่าคือคำอธิบายที่หน้าเว็บเอาไปขึ้นเป็นตัวเลือก
ANIM = {
    "none":  "ขึ้นทันที",
    "fade":  "ค่อย ๆ จาง เข้า–ออก",
    "pop":   "เด้งเข้ามา (ย่อ→ใหญ่เกิน→พอดี)",
    "rise":  "ไถลขึ้นจากข้างล่าง",
    "slide": "ไถลเข้าจากข้าง",
}

# rise/slide ต้องรู้พิกัดที่แน่นอนถึงจะสั่ง \move ได้ — ซับที่วางด้วย align+margin
# ปล่อยให้ libass จัดตำแหน่งเอง เราจึงไม่รู้ว่ามันจะไปอยู่ตรงไหนจริง ๆ (ขึ้นกับ
# จำนวนบรรทัดกับความสูงบรรทัดของฟอนต์) สองตัวนี้จึงตกกลับไปเป็น fade ให้แทน
# มากกว่าจะเดาพิกัดผิดแล้วข้อความไถลไปโผล่คนละที่กับที่พรีวิววาดไว้
NEEDS_POS = ("rise", "slide")

# แอนิเมชันของข้อความชิ้นหนึ่ง
TEXT = {
    "anim": "none",
    "in": 0.18,        # วินาทีที่ใช้เข้า
    "out": 0.14,       # วินาทีที่ใช้ออก
    "plate": False,    # วาดกล่องทึบไว้ข้างหลังตัวหนังสือไหม
}

# หน้าตาของกล่องพื้นหลัง — ค่ากลางตัวเดียวทั้งเรื่อง เพราะมันคือ "ลุค" ของหนัง
# ไม่ใช่ของที่ควรตั้งต่างกันทีละชิ้นจนหน้าตาไม่เป็นชุดเดียวกัน
PLATE = {
    "color": "#000000",
    "alpha": 0.45,     # 0 = ใส · 1 = ทึบ
    "pad": 14,         # พิกเซลรอบตัวหนังสือ
}

# ── รูปทรงเวกเตอร์ (เฟส A) ──
#
# libass วาดเส้นเองได้ด้วยโหมด \p — ลูกศร/แถบ/จุด จึงไม่ต้องพึ่งไฟล์ภาพจากข้างนอก
# (ซึ่งเป็นงานของเฟส B) และไม่ต้องเพิ่มฟิลเตอร์อะไรในสายเลย
SHAPE = {
    "kind": "arrow",   # arrow | bar | dot
    "x": 0.5, "y": 0.5,
    "size": 160,       # พิกเซลของหนังจริง
    "thick": 0.28,     # ความหนาเทียบกับ size
    "angle": 0.0,      # หมุนทวนเข็ม องศา
    "color": "#FF3B30",
    "outline": "#000000",
    "border": 0.0,
    "anim": "pop", "in": 0.18, "out": 0.14,
}
SHAPE_KIND = {"arrow": "ลูกศร", "bar": "แถบ", "dot": "จุด"}

# ── ภาพซ้อน (เฟส B) ──
#
# width เก็บเป็น *สัดส่วนของความกว้างจอ* ไม่ใช่พิกเซลหรืออัตราส่วนของไฟล์ —
# สกรีนช็อตจากมือถือกว้าง 1170 กับสติกเกอร์กว้าง 240 ต้องสั่งด้วยเลขที่หมายถึง
# สิ่งเดียวกัน (0.4 = กว้าง 40% ของจอ) ไม่งั้นต้องมานั่งคิดเลขทุกครั้งที่เปลี่ยนไฟล์
# และค่าที่ตั้งไว้ยังถูกอยู่เมื่อเปลี่ยนความละเอียดหนัง
OVERLAY = {
    "file": "",
    "x": 0.5, "y": 0.5,
    "width": 0.4,
    "opacity": 1.0,
    "angle": 0.0,
    "anim": "fade", "in": 0.2, "out": 0.2,
}

# แอนิเมชันที่ภาพซ้อนทำได้ — น้อยกว่าของข้อความเพราะ overlay ขยับตำแหน่งตามเวลาได้
# (x/y รับสูตรที่มี t) แต่ *ย่อ-ขยายตามเวลาไม่ได้* ถ้าไม่ยอมเสียเวลาประมวลผลทุกเฟรม
# จึงไม่มี pop ให้เลือก ดีกว่ามีตัวเลือกที่กดแล้วช้าลงสามเท่าโดยไม่บอก
OVERLAY_ANIM = {k: v for k, v in ANIM.items() if k != "pop"}

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXT = (".mov", ".webm", ".mp4", ".m4v")


def path(ctx):
    return ctx.work / FX


def plan_path(ctx):
    return ctx.work / PLAN


def out_path(ctx):
    """ไฟล์ผลลัพธ์ของขั้น 5

    อยู่ที่นี่ไม่ใช่ที่ finish.py เพราะ settings/serve/reset ต้องรู้ที่อยู่ของมัน
    โดยไม่ต้องลากตัวประกอบไฟล์ (ซึ่งดึง caption + render ตามมาทั้งพวง) เข้ามาด้วย
    """
    p = Path(ctx.out)
    suffix = str(ctx.get("fx.out_suffix", "-fx") or "-fx")
    return p.with_name(p.stem + suffix + p.suffix)


def _music_defaults():
    """ค่าตั้งต้นของชั้นเพลง — อยู่ที่ music.py ที่เดียว นำเข้าตอนใช้เพื่อกันวงกลม
    (music.py ต้อง import fx เพื่อใช้ตัวโหลด)"""
    from .music import MUSIC
    return dict(MUSIC)


def blank():
    return {"version": 1, "clips": {}, "overlays": [],
            "music": _music_defaults(),
            # sub   = ซับจากบทพูดทั้งกอง (ตัวเดียวคุมหมด — ซับที่เคลื่อนไหวไม่
            #         เหมือนกันทีละบรรทัดอ่านแล้วเหมือนหนังพัง ไม่ใช่เหมือนตั้งใจ)
            # boxes = กล่องข้อความที่ใส่เองในขั้น 4 · ตั้งแยกทีละกล่องได้
            "text": {"sub": dict(TEXT), "boxes": {}, "plate": dict(PLATE)},
            "shapes": []}


# ช่วงที่ยอมรับได้ของค่าตัวเลขแต่ละตัว — คีย์ชื่อเดียวกันหมายถึงของอย่างเดียวกัน
# ทุกที่ในไฟล์นี้ จึงเก็บเป็นตารางเดียวได้
LIMITS = {
    "speed": (0.1, 8.0), "zoom": (1.0, 4.0),
    "width": (0.02, 2.0), "opacity": (0.0, 1.0),
    "in": (0.0, 1.5), "out": (0.0, 1.5),
    "alpha": (0.0, 1.0), "pad": (0, 120),
    "size": (4, 2000), "thick": (0.03, 0.9),
    "angle": (-360.0, 360.0), "border": (0.0, 40.0),
    "x": (0.0, 1.0), "y": (0.0, 1.0),
    "at": (0.0, 86400.0), "dur": (0.1, 3600.0),
    "gain_db": (-60.0, 12.0), "duck_db": (0.0, 24.0),
    "duck_release": (20, 4000), "fade_in": (0.0, 10.0), "fade_out": (0.0, 10.0),
}
# คีย์ที่ค่าต้องเป็นหนึ่งในรายการที่กำหนดไว้เท่านั้น
ENUMS = {"anim": ANIM, "kind": SHAPE_KIND, "grade": GRADE}
COLOURS = ("color", "outline")
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _pick(src, spec):
    """เอาเฉพาะคีย์ที่รู้จัก แล้วบังคับให้เป็นค่าที่ใช้ได้จริง

    ไฟล์นี้คนแก้ด้วยมือได้และต่อไป AI จะเขียนให้ — ค่าที่ผิดต้องถูกดัดให้ใช้ได้
    *ตรงนี้* ไม่ใช่ปล่อยไปพังตอนประกอบสตริง ASS ซึ่งกว่าจะรู้ว่าพังเพราะอะไร
    ก็ต้องไปไล่อ่าน stderr ของ ffmpeg

    ดัดสามชั้น: **ชนิด** ("0.5" → 0.5) · **ช่วง** (ความทึบ 2.5 → 1.0) ·
    **รายการที่มี** (anim ที่ไม่รู้จัก → ค่าตั้งต้น) — สองชั้นหลังสำคัญพอกับ
    ชั้นแรก เพราะค่าที่ชนิดถูกแต่เกินช่วงจะถูกเก็บลงไฟล์แล้วโผล่กลับมาในฟอร์ม
    เป็นเลขที่แถบเลื่อนแสดงไม่ได้ ส่วน anim ที่สะกดผิดจะเงียบไปเฉย ๆ
    """
    out = dict(spec)
    for k, base in spec.items():
        if k not in (src or {}):
            continue
        v = src[k]
        try:
            if isinstance(base, bool):
                out[k] = bool(v)
            elif isinstance(base, float):
                out[k] = float(v)
            elif isinstance(base, int):
                out[k] = int(float(v))
            elif k in COLOURS:
                s = str(v).strip()
                out[k] = s.upper() if _HEX.match(s) else base
            elif k in ENUMS:
                out[k] = str(v) if str(v) in ENUMS[k] else base
            else:
                out[k] = str(v)
        except (TypeError, ValueError):
            continue
        lo, hi = LIMITS.get(k, (None, None))
        if lo is not None and isinstance(out[k], (int, float)) \
                and not isinstance(out[k], bool):
            out[k] = type(base)(min(hi, max(lo, out[k])))
    return out


def load(ctx):
    d = read_json(path(ctx)) or {}
    out = blank()
    if not d:
        return out
    clips = d.get("clips") or {}
    if isinstance(clips, dict):
        out["clips"] = {str(k): _pick(v, CLIP)
                        for k, v in clips.items() if isinstance(v, dict)}
    if isinstance(d.get("overlays"), list):
        out["overlays"] = [_overlay(o) for o in d["overlays"] if isinstance(o, dict)]
    if isinstance(d.get("music"), dict):
        from .music import MUSIC
        out["music"] = _pick(d["music"], MUSIC)

    t = d.get("text") or {}
    if isinstance(t, dict):
        out["text"]["sub"] = _pick(t.get("sub"), TEXT)
        out["text"]["plate"] = _pick(t.get("plate"), PLATE)
        if isinstance(t.get("boxes"), dict):
            out["text"]["boxes"] = {str(k): _pick(v, TEXT)
                                    for k, v in t["boxes"].items()
                                    if isinstance(v, dict)}

    if isinstance(d.get("shapes"), list):
        out["shapes"] = [_shape(s) for s in d["shapes"] if isinstance(s, dict)]
    return out


def _shape(s):
    """รูปทรงหนึ่งชิ้น — ผูกเวลากับ (คลิป, วินาทีในคลิป) เหมือนกล่องข้อความขั้น 4

    ผูกแบบนี้เพราะไทม์ไลน์ลากแก้ได้ตลอด ถ้าจำวินาทีในหนังไว้ตรง ๆ ลูกศรทุกอันที่
    อยู่หลังจุดที่แก้จะเลื่อนหลุดพร้อมกันหมดโดยไม่มีใครรู้ (เหตุผลเต็มอยู่ที่
    docstring บนสุดของ caption.py)
    """
    # at/dur ไม่ได้อยู่ใน SHAPE เพราะเป็น "ชิ้นนี้เกาะตรงไหน" ไม่ใช่ "หน้าตายังไง"
    # — แต่ต้องผ่านตัวดัดตัวเดียวกัน จึงยัดเข้าไปด้วยตอนเรียก
    out = _pick(s, {**SHAPE, "at": 0.0, "dur": 2.0})
    out["id"] = str(s.get("id") or "")
    out["name"] = str(s.get("name") or "")
    return out


def _overlay(o):
    """ภาพซ้อนหนึ่งชิ้น — ผูกเวลาแบบเดียวกับรูปทรงและกล่องข้อความ

    ชื่อไฟล์ถูกกรองให้เป็นชื่อล้วน ๆ ไม่มีเส้นทาง เพราะทุกไฟล์ต้องอยู่ในโฟลเดอร์
    assets ของโปรเจกต์ — ปล่อยให้ใส่เส้นทางเต็มได้แปลว่าไฟล์ fx.json ที่ส่งต่อ
    ให้คนอื่นจะชี้ไปที่ไฟล์ในเครื่องเราซึ่งเครื่องเขาไม่มี และเปิดช่องให้อ่านไฟล์
    นอกโปรเจกต์ผ่านหน้าเว็บด้วย
    """
    out = _pick(o, {**OVERLAY, "at": 0.0, "dur": 2.0})
    out["id"] = str(o.get("id") or "")
    out["name"] = str(o.get("name") or "")
    out["file"] = Path(str(o.get("file") or "")).name
    if out["anim"] not in OVERLAY_ANIM:
        out["anim"] = "fade"
    return out


def save(ctx, data):
    return write_json(path(ctx), data)


def merge(data, payload):
    """เอาของที่หน้าเว็บส่งมาทับของเดิม โดยผ่านตัวตรวจชุดเดียวกับตอนอ่านไฟล์

    ตรวจที่นี่ที่เดียว ไม่ใช่ที่ serve.py — ไม่งั้นค่าที่ผ่านทางหน้าเว็บกับค่าที่
    คนพิมพ์ลง fx.json เองจะถูกตรวจคนละมาตรฐาน แล้ววันหนึ่งจะมีค่าที่บันทึกผ่าน
    หน้าเว็บได้แต่โหลดกลับมาไม่เหมือนเดิม
    """
    out = dict(data)
    if isinstance(payload.get("clips"), dict):
        out["clips"] = {str(k): _pick(v, CLIP)
                        for k, v in payload["clips"].items() if isinstance(v, dict)}
    if isinstance(payload.get("overlays"), list):
        out["overlays"] = [_overlay(o) for o in payload["overlays"]
                           if isinstance(o, dict)]
    if isinstance(payload.get("music"), dict):
        from .music import MUSIC
        out["music"] = _pick({**out["music"], **payload["music"]}, MUSIC)
    t = payload.get("text")
    if isinstance(t, dict):
        txt = {k: dict(v) if isinstance(v, dict) else v for k, v in out["text"].items()}
        if isinstance(t.get("sub"), dict):
            txt["sub"] = _pick({**txt["sub"], **t["sub"]}, TEXT)
        if isinstance(t.get("plate"), dict):
            txt["plate"] = _pick({**txt["plate"], **t["plate"]}, PLATE)
        if isinstance(t.get("boxes"), dict):
            txt["boxes"] = {str(k): _pick(v, TEXT) for k, v in t["boxes"].items()
                            if isinstance(v, dict)}
        out["text"] = txt
    if isinstance(payload.get("shapes"), list):
        out["shapes"] = [_shape(s) for s in payload["shapes"] if isinstance(s, dict)]
    return out


# ─────────────────────────── ชิ้นในไทม์ไลน์ ───────────────────────────

def clip_key(seg):
    """กุญแจของชิ้นหนึ่งในไทม์ไลน์ — เหมือนกุญแจที่ render.py ใช้เก็บผลวัดความดัง

    ผูกกับ (คลิป, ช่วงที่ตัด) ไม่ใช่ลำดับ `i` เพราะลำดับเปลี่ยนทุกครั้งที่ลาก
    สลับชิ้นในไทม์ไลน์ ถ้าผูกกับลำดับ เอฟเฟกต์ที่ตั้งไว้กับช็อตหนึ่งจะกระโดดไป
    อยู่กับอีกช็อตทันทีที่มีคนสลับที่ โดยไม่มีอะไรบอก
    """
    return f"{seg['name']}@{float(seg['start']):.3f}+{float(seg['dur']):.3f}"


def for_seg(data, seg):
    """เอฟเฟกต์ของชิ้นนี้ — ค่าตั้งต้นทับด้วยที่ตั้งไว้เอง"""
    out = dict(CLIP)
    out.update({k: v for k, v in (data["clips"].get(clip_key(seg)) or {}).items()
                if k in CLIP})
    return out


def touched(f):
    """ชิ้นนี้ถูกแต่งอะไรไหม — ไม่ถูกแตะ = ใช้ไฟล์ของขั้น 3 ตรง ๆ ไม่ต้อง render"""
    return any(f.get(k, CLIP[k]) != CLIP[k] for k in CLIP)


def orphans(data, segs):
    """กุญแจใน fx.json ที่ไม่ตรงกับชิ้นไหนในไทม์ไลน์เลย

    เกิดได้สองทาง: ชิ้นที่ตั้งเอฟเฟกต์ไว้ถูกลบ/ลากขอบจนเปลี่ยนช่วง หรือคนพิมพ์
    กุญแจผิด ทั้งสองแบบให้ผลเหมือนกันคือ "ตั้งค่าไว้แล้วไม่มีอะไรเกิดขึ้น" ซึ่ง
    หาสาเหตุยากมากถ้าไม่มีใครบอก — เตือน ไม่หยุด แบบเดียวกับกล่องข้อความกำพร้า
    ในขั้น 4 (ดู caption.cues)
    """
    live = {clip_key(s) for s in segs}
    return sorted(k for k in data["clips"] if k not in live)


def pending(data, segs):
    """ของที่ถูกตั้งค่าไว้แต่ยังไม่มีใครทำ — คืนชื่อค่า → จำนวนที่เจอ

    ตอนนี้คืนค่าว่างเสมอ เพราะทุกชั้นที่ประกาศไว้ทำงานได้หมดแล้ว · เก็บกลไกไว้
    เพราะรอบหน้าที่ประกาศช่องใหม่ใน fx.json ก่อนทำเสร็จ (ซึ่งเป็นวิธีที่ทำมาทุก
    เฟส เพื่อไม่ต้องมีตัวแปลงรุ่นไฟล์) จะได้ปฏิเสธพร้อมบอกเหตุผลทันที ไม่ใช่
    อ่านข้ามไปเงียบ ๆ จนคนตั้งค่าไว้แล้วรอผลที่ไม่มีวันมา
    """
    found = {}
    for seg in segs:
        for k, v in for_seg(data, seg).items():
            if k not in LIVE and v != CLIP[k]:
                found[k] = found.get(k, 0) + 1
    return found


# ─────────────────────────── ตัดต่อชิ้นที่ถูกแต่ง ───────────────────────────

def seg_dir(ctx):
    return ctx.work / "fxseg"


def _atempo(speed):
    """atempo รับได้ทีละ 0.5–2.0 เท่านั้น — นอกช่วงต้องซอยเป็นหลายทอด

    ทำไมไม่ใช้ asetrate (เปลี่ยนอัตราสุ่มตัวอย่าง) ซึ่งสั้นกว่า: asetrate เปลี่ยน
    *ระดับเสียง* ไปด้วย สโลว์โม 0.4 เท่าจะทำให้เสียงคนกลายเป็นเสียงผี ส่วน atempo
    ยืดเวลาโดยคงระดับเสียงไว้ ซึ่งคือสิ่งที่คนคาดหวังจากปุ่มชื่อ "ความเร็ว"
    """
    out, r = [], float(speed)
    while r < 0.5:
        out.append("atempo=0.5")
        r /= 0.5
    while r > 2.0:
        out.append("atempo=2.0")
        r /= 2.0
    if abs(r - 1.0) > 1e-4:
        out.append(f"atempo={r:.6f}")
    return out


def seg_vfilter(f, ctx, frames):
    """ฟิลเตอร์ภาพของชิ้นที่ถูกแต่ง — ออกมาเป็น `frames` เฟรมพอดีเสมอ

    ท้ายสายเหมือนขั้น 3 ทุกตัว (tpad → fps → trim ตามจำนวนเฟรม) เพราะเหตุผล
    เดียวกันเป๊ะ: ตัดด้วยจำนวนเฟรมไม่ใช่ตามเวลา ไม่งั้นได้ภาพยาวเกินเสียงหนึ่งเฟรม
    (ดู render.segment_vfilter สำหรับเหตุผลเต็ม)
    """
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    parts = []
    sp = float(f.get("speed", 1.0))
    if abs(sp - 1.0) > 1e-6:
        parts.append(f"setpts=PTS/{sp:.6f}")
    z = float(f.get("zoom", 1.0))
    if z > 1.0 + 1e-6:
        # ขยายแล้วครอบกลับให้เท่าเดิม = ดันเข้าโดยกรอบภาพไม่เปลี่ยน · ขนาดต้องเป็น
        # เลขคู่ ไม่งั้น yuv420p ซึ่งเก็บสีครึ่งความละเอียดจะปัดเศษแล้วภาพเพี้ยน
        flags = ctx.get("video.scale_flags", "lanczos")
        parts.append(f"scale=w=ceil(iw*{z:.4f}/2)*2:h=ceil(ih*{z:.4f}/2)*2:flags={flags}")
        parts.append(f"crop={W}:{H}")
    g = str(f.get("grade", "") or "")
    if g in GRADE_VF:
        parts.append(GRADE_VF[g])
    parts.append("tpad=stop_mode=clone:stop_duration=0.5")
    parts.append(f"fps={ctx.get('video.fps', '60000/1001')}")
    parts.append(f"trim=end_frame={int(frames)}")
    parts.append("setpts=PTS-STARTPTS")
    parts.append("setsar=1,format=yuv420p")
    return ",".join(parts)


def seg_afilter(f, dur):
    parts = []
    if f.get("mute"):
        parts.append("volume=0")
    sp = float(f.get("speed", 1.0))
    if abs(sp - 1.0) > 1e-6:
        parts += _atempo(sp)
    # บังคับความยาวให้เท่าภาพเป๊ะ เหมือนขั้น 3 — atempo ปัดเศษของมันเอง
    parts.append("apad")
    parts.append(f"atrim=end={dur:.6f}")
    parts.append("asetpts=PTS-STARTPTS")
    return ",".join(parts)


def seg_key(ctx, src, f, frames):
    """ชื่อไฟล์ = sha1 ของทุกอย่างที่มีผลต่อภาพ/เสียงของชิ้นนี้

    หลักการเดียวกับขั้น 3 เป๊ะ: แก้ค่าไหนก็ตามที่เปลี่ยนผลลัพธ์ → กุญแจเปลี่ยน →
    ไฟล์ใหม่ · แก้ค่าที่ไม่เปลี่ยนผล (เช่นสลับลำดับในไทม์ไลน์) → กุญแจเท่าเดิม →
    ไม่ต้องทำใหม่ · เก็บลายเซ็นของไฟล์ต้นทางไว้ด้วย เพราะ segment ของขั้น 3
    ถูกสร้างใหม่ได้ตลอดถ้ามีคนแก้ค่าฝั่งนั้น
    """
    from .render import encode_args, seg_audio_args
    from .util import key_of
    try:
        st = src.stat()
        sig = [st.st_size, int(st.st_mtime)]
    except OSError:
        sig = [0, 0]
    return key_of({
        "src": src.name, "sig": sig, "frames": int(frames),
        "vf": seg_vfilter(f, ctx, frames),
        "af": seg_afilter(f, frames / _fps(ctx)),
        "enc": encode_args(ctx, audio=False) + seg_audio_args(ctx),
        "fps": ctx.get("video.fps"),
    })


def _fps(ctx):
    from .render import fps_value
    return fps_value(ctx)


def render_one(ctx, src, f, frames, dst):
    from .render import encode_args, seg_audio_args
    from .util import run as sh
    if dst.exists() and dst.stat().st_size > 1024:
        return True, "cache"
    tmp = dst.with_suffix(".part.mov")
    dur = frames / _fps(ctx)
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-i", str(src),
           "-vf", seg_vfilter(f, ctx, frames),
           "-af", seg_afilter(f, dur),
           "-fps_mode", "cfr", "-r", str(ctx.get("video.fps", "60000/1001")),
           "-t", f"{dur:.6f}",
           "-color_range", "tv", "-colorspace", "bt709",
           "-color_primaries", "bt709", "-color_trc", "bt709"]
    cmd += encode_args(ctx, audio=False) + seg_audio_args(ctx)
    cmd += ["-movflags", "+faststart", str(tmp)]
    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False, r.stderr[-400:]
    tmp.replace(dst)
    return True, "new"


def render(ctx, man):
    """ตัดชิ้นที่ถูกแต่งให้ครบตาม fx-render.json — ชิ้นที่ไม่ได้แตะไม่ต้องทำอะไร"""
    from concurrent.futures import ThreadPoolExecutor
    from .util import Progress, c, info
    todo = [s for s in man["segments"]
            if s["fx"] and not (seg_dir(ctx) / s["out"]).exists()]
    n_fx = sum(1 for s in man["segments"] if s["fx"])
    if not n_fx:
        return
    if not todo:
        info(f"  แต่งชิ้น {n_fx} ชิ้น  ({c('มีครบใน cache แล้ว', 'd')})")
        return
    seg_dir(ctx).mkdir(parents=True, exist_ok=True)
    pr = Progress(len(todo), "แต่งชิ้น")
    failed = []

    def work(s):
        ok, msg = render_one(ctx, ctx.seg_dir / s["file"], s["effects"],
                             s["frames"], seg_dir(ctx) / s["out"])
        return s, ok, msg

    with ThreadPoolExecutor(max_workers=int(ctx.get("render.workers", 2))) as ex:
        for s, ok, msg in ex.map(work, todo):
            if not ok:
                failed.append((s["name"], msg))
            pr.step(f"{s['name']} {_how(s['effects'])}")
    pr.done()
    for name, msg in failed:
        warn(f"แต่งชิ้นไม่สำเร็จ {name}: {msg[:200]}")
    if failed:
        die(f"มี {len(failed)} ชิ้นที่แต่งไม่สำเร็จ")


def _how(f):
    bits = []
    if abs(float(f.get("speed", 1.0)) - 1.0) > 1e-6:
        bits.append(f"{float(f['speed']):g}x")
    if float(f.get("zoom", 1.0)) > 1.0 + 1e-6:
        bits.append(f"ซูม{float(f['zoom']):g}")
    if f.get("grade"):
        bits.append(str(f["grade"]))
    if f.get("mute"):
        bits.append("ปิดเสียง")
    return " ".join(bits)


# ─────────────────────────── รายการชิ้นของขั้น 5 ───────────────────────────

def plan(ctx, data=None):
    """คำนวณ fx-render.json ใหม่จาก render.json + fx.json แล้วเขียนลงดิสก์

    คำนวณใหม่ทุกครั้งแทนที่จะอ่านของเก่า เพราะมันเป็น *ผลลัพธ์* ของสองไฟล์ที่
    แก้ได้ตลอด ไม่ใช่สถานะที่ต้องจำ — อ่านของเก่าเมื่อไรก็มีวันที่มันตกยุคแล้ว
    ไม่มีใครรู้
    """
    rman = read_json(ctx.work / "render.json")
    if not rman:
        die("ยังไม่มี render.json — สั่ง 'สร้างไฟล์' ที่ขั้น 3 ก่อน")
    data = data if data is not None else load(ctx)
    segs = sorted(rman["segments"], key=lambda s: s["i"])

    lost = orphans(data, segs)
    if lost:
        warn(f"เอฟเฟกต์ {len(lost)} ชิ้นเกาะอยู่กับช่วงที่ไม่มีในไทม์ไลน์แล้ว "
             f"— จะไม่มีผลอะไร (เช่น {lost[0]})")

    todo = pending(data, segs)
    if todo:
        lines = "\n".join(
            f"   · {k} ({n} ที่)  ← {OWNER.get(k, 'ยังไม่รองรับ')}"
            for k, n in sorted(todo.items()))
        die(f"ใน {FX} ตั้งของที่ขั้น 5 ยังทำไม่ได้ไว้:\n{lines}\n"
            "   เอาออกจากไฟล์ก่อน แล้วขั้น 5 จะสร้างไฟล์ได้ตามปกติ")

    from .render import exact_frames
    rows, at, n_fx = [], 0.0, 0
    for s in segs:
        f = for_seg(data, s)
        src_len = float(s.get("exact_dur") or s["dur"])
        sp = float(f["speed"] or 1.0)
        on = touched(f)
        # ความยาวต้องลงกริดเฟรมเหมือนขั้น 3 — หารด้วยความเร็วเฉย ๆ จะได้เศษเฟรม
        # ที่สะสมทีละชิ้นจนซับท้ายเรื่องเลื่อน (เหตุผลเต็มอยู่ที่ render.exact_dur)
        frames = exact_frames(src_len / sp, ctx) if on else 0
        out_len = frames / _fps(ctx) if on else src_len
        key = seg_key(ctx, ctx.seg_dir / s["file"], f, frames) if on else ""
        n_fx += on
        rows.append({
            "i": s["i"], "name": s["name"], "kind": s["kind"],
            "start": float(s["start"]), "dur": float(s["dur"]),
            # file = ชิ้นของขั้น 3 (ที่มาเสมอ) · out = ไฟล์ที่จะเอาไปต่อจริง
            # fx = out อยู่ในโฟลเดอร์ของขั้น 5 ไม่ใช่ของขั้น 3
            "file": s["file"], "out": f"{key}.mov" if on else s["file"],
            "fx": on, "effects": f, "frames": frames,
            "exact_dur": round(src_len, 6),
            "speed": sp,
            "len": round(out_len, 6), "at": round(at, 6),
            # พารามิเตอร์เสียงของขั้น 3 ส่งต่อมาเฉย ๆ — ขั้น 5 ไม่ได้แก้ระดับเสียง
            # รายชิ้น แต่ตัวตรวจไฟล์ท้ายขั้นรายงานค่าพวกนี้ ถ้าไม่ส่งต่อมันจะพิมพ์
            # "limiter ทำงาน 0 ชิ้น" ทั้งที่ความจริงไม่ใช่
            "limiter": s.get("limiter"),
            "target_lufs": s.get("target_lufs"),
        })
        at += out_len

    man = {"version": 1, "segments": rows, "total": round(at, 6),
           "touched": n_fx, "effects": sorted(LIVE)}
    write_json(plan_path(ctx), man)
    return man


def seg_file(ctx, row):
    """ไฟล์จริงที่จะเอาไปต่อของชิ้นนี้ — ของขั้น 5 ถ้าถูกแต่ง ไม่งั้นของขั้น 3"""
    return (seg_dir(ctx) if row["fx"] else ctx.seg_dir) / row["out"]


def segments(ctx, data=None):
    """ชิ้นตามลำดับในหนังของขั้น 5 + ความยาวรวม — คู่กับ caption.segments()"""
    man = plan(ctx, data)
    return man["segments"], man["total"]
