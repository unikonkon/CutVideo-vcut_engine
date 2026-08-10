"""FXTEXT — ขั้น 5 · ตัวเขียน ASS ที่ข้อความเคลื่อนไหวได้ + วาดรูปทรงเวกเตอร์

libass ที่ขั้น 4 ใช้อยู่แล้วทำสามอย่างนี้ได้มาตั้งนานแล้ว แค่ตัวเขียนของขั้น 4
ไม่ได้ปล่อยแท็กพวกนี้ผ่าน (ดู caption._tags — บัญชีขาวมีแต่แท็กหน้าตานิ่ง ๆ)
ไฟล์นี้จึงไม่ได้เพิ่มความสามารถให้ ffmpeg เลย มันแค่เขียนสิ่งที่เครื่องมือเดิม
ทำได้อยู่แล้วลงไป — ไม่มี dependency ใหม่ ไม่มีพาสเข้ารหัสเพิ่ม

**ไม่ได้ก๊อปตัวเขียนของขั้น 4 มาแก้**

ตัวประกอบสตริงทุกตัว (_clock · _colour · _esc · _place · _tags) ยืมของ caption.py
มาใช้ทั้งดุ้น เพราะ "ข้อความชิ้นนี้หน้าตายังไง อยู่ตรงไหน" ต้องตอบเหมือนกันเป๊ะ
ทั้งสองขั้น ถ้าก๊อปมาไว้คนละไฟล์ วันหนึ่งจะมีคนแก้ข้างเดียวแล้วขั้น 4 กับขั้น 5
วางข้อความคนละที่ทั้งที่ตั้งค่าชุดเดียวกัน — และไม่มีใครรู้จนกว่าจะเทียบไฟล์กันเอง

สิ่งที่ไฟล์นี้เป็นเจ้าของจริง ๆ มีสามอย่าง: **ฐานเวลา · แอนิเมชัน · รูปทรง**

**ฐานเวลา — ทำไมต้องแปลงเวลา ไม่ใช่คำนวณใหม่**

caption.cues() ตอบว่า "ข้อความชิ้นไหนขึ้นวินาทีที่เท่าไรของหนัง*ขั้น 4*" ซึ่งตอบ
ถูกอยู่แล้วและผ่านการใช้งานมาแล้ว ขั้น 5 ต้องการคำตอบเดียวกันแต่บนไทม์ไลน์ของ
ตัวเอง ซึ่งความยาวชิ้นต่างออกไปได้เมื่อมีสโลว์โม (เฟส C)

จึงเรียกของเดิมมาแล้ว *แปลงเวลา* ทีเดียว แทนที่จะเขียนตัวคำนวณ overlap/join/
merge-style ชุดที่สองขึ้นมา — สั้นกว่ามาก และไม่มีทางที่ "ข้อความชิ้นไหนโผล่บ้าง"
จะตอบไม่ตรงกันระหว่างสองขั้น เพราะมันมาจากฟังก์ชันเดียวกัน
"""
from . import fx
# ตัวประกอบสตริงของขั้น 4 — ยืมมาใช้ทั้งหมด ดูเหตุผลใน docstring ข้างบน
from .caption import _clock as clock, _colour as colour, _esc as esc
from .caption import _place as place_of, _tags as tags_of
from .util import read_json


# ─────────────────────────── ฐานเวลา ───────────────────────────

def timelines(segs):
    """สองไทม์ไลน์เรียงคู่กัน — ของขั้น 4 (ก่อนเอฟเฟกต์) กับของขั้น 5 (หลัง)"""
    s4, s5, at4 = [], [], 0.0
    for s in segs:
        d4 = float(s["exact_dur"])
        s4.append((at4, d4))
        s5.append((float(s["at"]), float(s["len"])))
        at4 += d4
    return s4, s5


def remap(t, s4, s5):
    """วินาทีในหนังของขั้น 4 → วินาทีในหนังของขั้น 5

    หาว่าเวลานี้ตกอยู่ในชิ้นไหน แล้วยืด/หดระยะห่างจากหัวชิ้นตามอัตราส่วนความยาว
    ของชิ้นนั้น · ตอนที่ยังไม่มีสโลว์โม สองความยาวเท่ากัน ผลจึงเท่าเดิมเป๊ะ
    """
    if t is None:
        return None
    last = len(s4) - 1
    for i, (at, d) in enumerate(s4):
        if t < at + d or i == last:
            off = min(max(0.0, t - at), d)
            a5, d5 = s5[i]
            return round(a5 + (off * (d5 / d) if d > 0 else 0.0), 3)
    return t


def cues(ctx, fxdata=None, man=None):
    """ข้อความทุกชิ้นของ *ขั้น 5 เอง* พร้อมเวลาบนไทม์ไลน์ของขั้น 5

    **ไม่อ่าน captions.json อีกแล้ว** — ขั้น 5 ต่อจากขั้น 3 อย่างเดียว ของที่โผล่
    ในไฟล์จึงมาจาก fx.json["texts"] ที่คนกดสั่งเองในขั้นนี้เท่านั้น (เหตุผลเต็ม
    อยู่ที่ fx.TEXT_ITEM) · ซับจากบทพูดยังทำได้ผ่านสวิตช์ auto_sub ของขั้น 5 เอง
    ซึ่งอ่าน transcript ของขั้น 2 ตรง ๆ และปิดไว้เป็นค่าตั้งต้น

    รูปร่างของแถวยังเหมือนที่ caption.cues() เคยส่งมาเป๊ะ (id · kind · a · b ·
    text · name · clip_a · style · x · y) เพราะตัวประกอบสตริงที่ยืมมาจาก
    caption.py อ่านจากคีย์พวกนี้ — เปลี่ยนแค่ *ที่มาของข้อมูล* ไม่ใช่รูปแบบ
    """
    fxdata = fxdata if fxdata is not None else fx.load(ctx)
    man = man if man is not None else fx.plan(ctx, fxdata)
    base = fxdata["style"]
    out = []

    for k, t in enumerate(fxdata["texts"]):
        tid = t.get("id") or f"t{k}"
        st = {**base, **{key: t[key] for key in fx.TEXT_STYLE_KEYS if key in t}}
        anim = {key: t.get(key, fx.TEXT[key]) for key in fx.TEXT}
        row = {"id": tid, "kind": "box", "text": str(t.get("text", "")),
               "name": t.get("name", ""), "clip_a": float(t.get("at", 0) or 0),
               "style": st, "x": t.get("x"), "y": t.get("y"), "fx": anim}
        spans = shape_spans(man, t.get("name", ""), t.get("at", 0), t.get("dur", 3))
        if not spans:
            # ชิ้นกำพร้า — ช่วงที่มันเกาะอยู่ถูกตัดออกจากหนังไปแล้ว ส่งต่อให้
            # หน้าเว็บบอกคนเขียนได้ ตัวเขียนไฟล์ข้ามมันอยู่แล้ว
            out.append({**row, "a": None, "b": None, "orphan": True})
            continue
        for a, b in spans:
            out.append({**row, "a": a, "b": b})

    if fxdata["auto_sub"]["enabled"]:
        tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})
        sub = fxdata["text"]["sub"]
        # ไล่ทีละคลิปที่ถูกใช้จริง ไม่ใช่ทั้ง transcript — คลิปที่ไม่ได้อยู่ในหนัง
        # ไม่มีช่วงให้เกาะอยู่แล้ว shape_spans จะคืนว่างทุกบรรทัด
        for name in sorted({s["name"] for s in man["segments"]}):
            for i, line in enumerate(tr.get(name, [])):
                a0, b0, text = line[0], line[1], line[2]
                if not str(text).strip():
                    continue
                for a, b in shape_spans(man, name, a0, b0 - a0):
                    out.append({"id": f"{name}#{i}", "kind": "auto",
                                "a": a, "b": b, "text": str(text), "name": name,
                                "clip_a": float(a0), "style": dict(base),
                                "x": None, "y": None, "fx": dict(sub)})

    out.sort(key=lambda r: (r["a"] is None, r["a"] or 0))
    return out, float(man["total"])


# ─────────────────────────── แอนิเมชัน ───────────────────────────

def anchor_pos(cue, W, H):
    """พิกัดที่แน่นอนของชิ้นนี้ — None = ปล่อยให้ libass จัดตำแหน่งเอง

    \\move สั่งได้ต่อเมื่อรู้ทั้งจุดเริ่มและจุดจบ ชิ้นที่ไม่ได้ตรึงพิกัดจึงสั่งไม่ได้
    (ดู fx.NEEDS_POS)
    """
    if cue["kind"] == "box":
        x = cue.get("x")
        y = cue.get("y")
        return (float(x if x is not None else 0.5) * W,
                float(y if y is not None else 0.5) * H)
    st = cue["style"]
    if st.get("pos_x") is not None and st.get("pos_y") is not None:
        return (float(st["pos_x"]) * W, float(st["pos_y"]) * H)
    return None


def _budget(a, b, cfg):
    """เวลาเข้า/ออกเป็นมิลลิวินาที ที่หดให้พอดีกับความยาวของชิ้นแล้ว

    ชิ้นที่สั้นกว่าเวลาแอนิเมชันที่ตั้งไว้จะยังไม่ทันขึ้นเต็มตัวก็เริ่มจางออกแล้ว
    — เห็นเป็นแค่ตัวหนังสือแวบ ๆ ทั้งที่ตั้งค่าไว้ดูดี ซับจากบทพูดมีชิ้นสั้น
    ระดับ 0.3 วินาทีเป็นเรื่องปกติ จึงต้องหดให้ ไม่ใช่ปล่อยไปตามที่สั่ง
    """
    dur = max(0.0, float(b) - float(a))
    room = dur * 1000.0 * 0.9
    ti = max(0, int(float(cfg.get("in", 0)) * 1000))
    to = max(0, int(float(cfg.get("out", 0)) * 1000))
    if ti + to > room and ti + to > 0:
        sc = room / (ti + to)
        ti, to = int(ti * sc), int(to * sc)
    return ti, to


def anim_tags(cue, cfg, W, H):
    """แท็กแอนิเมชันของชิ้นนี้ → (แท็ก, สั่ง \\move ไปแล้วหรือยัง)

    ตัวที่สองสำคัญ: \\move กับ \\pos ใช้ด้วยกันไม่ได้ ตัวไหนมาทีหลังชนะ ถ้าปล่อย
    ให้ _place ใส่ \\pos ตามมาหลัง \\move ข้อความจะไม่ขยับเลยและไม่มีอะไรฟ้อง
    """
    kind = str(cfg.get("anim", "none") or "none")
    if kind not in fx.ANIM or kind == "none" or cue["a"] is None:
        return [], False
    ti, to = _budget(cue["a"], cue["b"], cfg)
    if ti <= 0 and to <= 0:
        return [], False

    pos = anchor_pos(cue, W, H)
    if kind in fx.NEEDS_POS and not pos:
        kind = "fade"

    if kind == "fade":
        return [rf"\fad({ti},{to})"], False

    size = float(cue["style"].get("size", 54) or 54)

    if kind == "pop":
        # เด้งเกินแล้วค่อยกลับมาพอดี — ขยายอย่างเดียวดูเหมือนภาพค้างมากกว่าเด้ง
        # ต้องมีเวลาให้ทำอย่างน้อย ~90ms ไม่งั้นเห็นเป็นแค่กะพริบ
        if ti < 90:
            return [rf"\fad({ti},{to})"], False
        t1 = max(1, int(ti * 0.62))
        return ([rf"\fad({min(ti, 90)},{to})", r"\fscx58\fscy58",
                 rf"\t(0,{t1},\fscx112\fscy112)",
                 rf"\t({t1},{ti},\fscx100\fscy100)"], False)

    x, y = pos
    if kind == "rise":
        dy = max(12.0, size * 0.9)
        return ([rf"\move({x:.0f},{y + dy:.0f},{x:.0f},{y:.0f},0,{ti})",
                 rf"\fad({ti},{to})"], True)

    # slide — เข้าจากขอบที่ใกล้ตัวมันที่สุด กันไม่ให้ไถลผ่านกลางจอทั้งเฟรม
    al = int(cue["style"].get("align", 5) or 5)
    dx = max(20.0, size * 1.6)
    sx = x + dx if (al - 1) % 3 == 2 else x - dx
    return ([rf"\move({sx:.0f},{y:.0f},{x:.0f},{y:.0f},0,{ti})",
             rf"\fad({ti},{to})"], True)


# ─────────────────────────── กล่องพื้นหลัง ───────────────────────────

def plate_tags(plate):
    """ทับสีกล่อง/ความทึบ/ระยะขอบของบรรทัดที่เปิดกล่องไว้

    BorderStyle=3 ทำให้ช่อง OutlineColour กลายเป็น *สีกล่อง* และ Outline กลายเป็น
    *ระยะขอบรอบตัวหนังสือ* — แท็กสองตัวนี้จึงเปลี่ยนความหมายไปเลยเมื่ออยู่บน
    สไตล์กล่อง ไม่ใช่ขอบตัวอักษรอีกต่อไป
    """
    op = min(1.0, max(0.0, float(plate.get("alpha", 0.45))))
    return [rf"\3c{colour(plate.get('color'))}&",
            rf"\3a&H{int(round((1.0 - op) * 255)):02X}&",
            rf"\bord{float(plate.get('pad', 14)):g}", r"\shad0"]


# ─────────────────────────── รูปทรงเวกเตอร์ ───────────────────────────

def _pts(pts):
    return "m {:.0f} {:.0f} l ".format(*pts[0]) + " ".join(
        f"{x:.0f} {y:.0f}" for x, y in pts[1:])


def path_of(kind, size, thick):
    """เส้นทางในโหมด \\p ของ libass — วาดโดยยึดจุด (0,0) เป็นกึ่งกลางของรูป

    ยึดกึ่งกลางเพราะเราวางรูปด้วย \\an5 (จุดยึด = กลางรูป) พิกัด x/y ที่คนลากใน
    หน้าเว็บจึงหมายถึงกลางรูปพอดี ตรงกับที่ตาเห็น ไม่ใช่มุมบนซ้ายที่มองไม่เห็น
    """
    s = max(4.0, float(size))
    th = min(0.9, max(0.03, float(thick)))
    half = s / 2.0

    if kind == "bar":
        h = max(1.0, s * th) / 2.0
        return _pts([(-half, -h), (half, -h), (half, h), (-half, h)])

    if kind == "dot":
        r = half
        k = r * 0.5523          # ค่าคงที่ที่ทำให้เบซิเยร์ 4 ท่อนกลายเป็นวงกลม
        return (f"m 0 {-r:.0f} "
                f"b {k:.0f} {-r:.0f} {r:.0f} {-k:.0f} {r:.0f} 0 "
                f"b {r:.0f} {k:.0f} {k:.0f} {r:.0f} 0 {r:.0f} "
                f"b {-k:.0f} {r:.0f} {-r:.0f} {k:.0f} {-r:.0f} 0 "
                f"b {-r:.0f} {-k:.0f} {-k:.0f} {-r:.0f} 0 {-r:.0f}")

    # arrow — ชี้ลงเป็นค่าตั้งต้น แล้วให้คนหมุนเอาด้วย angle
    sw = s * th / 2.0
    hw = min(half, sw * 2.4)
    hy = half - s * 0.42
    return _pts([(-sw, -half), (sw, -half), (sw, hy), (hw, hy),
                 (0, half), (-hw, hy), (-sw, hy)])


def shape_spans(man, name, at, dur):
    """ช่วง [at, at+dur] ของคลิปนี้ ไปโผล่ตรงไหนของหนังบ้าง (ขั้น 5)

    คลิปเดียวอาจถูกหยิบมาใช้หลายท่อน ชิ้นเดียวจึงโผล่ได้หลายที่ — คืนเป็นรายการ
    """
    out = []
    for s in man["segments"]:
        if s["name"] != name:
            continue
        lo = max(float(at), float(s["start"]))
        hi = min(float(at) + float(dur), float(s["start"]) + float(s["dur"]))
        if hi - lo <= 0:
            continue
        sp = float(s.get("speed") or 1.0) or 1.0
        a = float(s["at"]) + (lo - float(s["start"])) / sp
        b = float(s["at"]) + (hi - float(s["start"])) / sp
        # เศษที่โผล่แค่แวบเดียวตรงรอยตัด เห็นเป็นแค่กะพริบ (เกณฑ์เดียวกับซับ)
        if b - a >= 0.20:
            out.append((round(a, 3), round(b, 3)))
    return out


def shape_cues(ctx, fxdata=None, man=None):
    """รูปทรงทุกชิ้นพร้อมเวลาในหนัง — หน้าเว็บกับตัวเขียน ASS ใช้ตัวนี้ตัวเดียว"""
    fxdata = fxdata if fxdata is not None else fx.load(ctx)
    man = man if man is not None else fx.plan(ctx, fxdata)
    out = []
    for k, sh in enumerate(fxdata["shapes"]):
        sid = sh.get("id") or f"shape{k}"
        # เส้นทางถูกคำนวณที่นี่ที่เดียวแล้วส่งให้หน้าเว็บไปวาดต่อ (แปลงเป็น SVG
        # ได้ตรง ๆ เพราะทั้งสองใช้พิกัดสัมบูรณ์เหมือนกัน) — ถ้าให้เบราว์เซอร์
        # คำนวณรูปเอง วันหนึ่งลูกศรในพรีวิวจะคนละทรงกับในไฟล์ แล้วคนจะเชื่อ
        # พรีวิวจนกว่าจะ render เสร็จ
        path = path_of(sh["kind"], sh["size"], sh["thick"])
        spans = shape_spans(man, sh["name"], sh["at"], sh["dur"])
        if not spans:
            # เหมือนกล่องข้อความกำพร้าของขั้น 4 — ไม่ error แต่ต้องบอกให้รู้
            out.append({**sh, "id": sid, "path": path,
                        "a": None, "b": None, "orphan": True})
            continue
        for a, b in spans:
            out.append({**sh, "id": sid, "path": path, "a": a, "b": b})
    out.sort(key=lambda x: (x["a"] is None, x["a"] or 0))
    return out


def _shape_line(sh, W, H):
    cue = {"kind": "box", "a": sh["a"], "b": sh["b"], "x": sh["x"], "y": sh["y"],
           "style": {"size": sh["size"], "align": 5}}
    tags, moved = anim_tags(cue, sh, W, H)
    pre = [r"\an5"]
    if not moved:
        pre.append(rf"\pos({float(sh['x']) * W:.0f},{float(sh['y']) * H:.0f})")
    pre += [rf"\c{colour(sh['color'])}&",
            rf"\3c{colour(sh['outline'])}&",
            rf"\bord{float(sh['border']):g}", r"\shad0"]
    if float(sh.get("angle") or 0):
        pre.append(rf"\frz{float(sh['angle']):g}")
    pre += tags
    body = ("{" + "".join(pre) + r"\p1}"
            + (sh.get("path") or path_of(sh["kind"], sh["size"], sh["thick"])))
    # ต้องปิดโหมดวาดทุกครั้ง — ปล่อยค้างไว้บรรทัดถัดไปจะถูกอ่านเป็นพิกัดต่อ
    return body + r"{\p0}"


# ─────────────────────────── เขียนไฟล์ ───────────────────────────

def _style_line(name, base, border_style):
    return ",".join([
        f"Style: {name}", str(base.get("font", "Sukhumvit Set")),
        str(int(base.get("size", 54))),
        colour(base.get("color")), colour(base.get("color")),
        colour(base.get("outline")), colour("#000000", alpha=0x80),
        "-1" if base.get("bold") else "0",
        "-1" if base.get("italic") else "0", "0", "0",
        "100", "100",
        f"{float(base.get('spacing', 0) or 0):g}",
        f"{float(base.get('angle', 0) or 0):g}", str(int(border_style)),
        f"{float(base.get('border', 3)):g}", f"{float(base.get('shadow', 0)):g}",
        str(int(base.get("align", 2))),
        str(int(base.get("margin_h", 60))), str(int(base.get("margin_h", 60))),
        str(int(base.get("margin_v", 60))), "1",
    ])


def build_ass(ctx, W, H, fxdata=None, man=None):
    fxdata = fxdata if fxdata is not None else fx.load(ctx)
    man = man if man is not None else fx.plan(ctx, fxdata)

    # สไตล์กลางเป็นของขั้น 5 เอง ไม่ได้ยืมของขั้น 4 มาแล้ว (ดู fx.STYLE)
    base = fxdata["style"]
    plate = fxdata["text"]["plate"]
    rows, _ = cues(ctx, fxdata, man)
    shapes = [s for s in shape_cues(ctx, fxdata, man) if not s.get("orphan")]

    # สไตล์กล่องมีเฉพาะตอนที่มีคนใช้จริง — ไฟล์ที่ไม่มีกล่องจะได้เหมือนของขั้น 4
    # ทุกไบต์ ซึ่งทำให้เทียบสองขั้นตอนหาสาเหตุง่ายกว่ามาก
    want_plate = any(r["fx"].get("plate") for r in rows if r["a"] is not None)

    head = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {int(W)}",
        f"PlayResY: {int(H)}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
         "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
         "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
         "MarginL, MarginR, MarginV, Encoding"),
        _style_line("sub", base, 1),
    ]
    if want_plate:
        head.append(_style_line("subplate", base, 3))
    head += [
        "",
        "[Events]",
        ("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
         "Effect, Text"),
    ]

    body, n = [], 0
    for cue in rows:
        if cue.get("orphan") or cue["a"] is None:
            continue
        txt = esc(cue["text"])
        if not txt:
            continue
        on_plate = bool(cue["fx"].get("plate"))
        pl, (ml, mr, mv) = place_of(cue, base, W, H)
        anim, moved = anim_tags(cue, cue["fx"], W, H)
        if moved:
            # \move เป็นคนกำหนดตำแหน่งแล้ว — \pos ที่ตามมาจะลบล้างมันทิ้ง
            pl = [t for t in pl if not t.startswith(r"\pos")]
        over = tags_of(cue, base)
        if on_plate:
            # บนสไตล์กล่อง \3c คือสีกล่อง \bord คือระยะขอบ — ของที่ _tags ส่งมา
            # ยังหมายถึงขอบตัวอักษรอยู่ ปล่อยผ่านไปจะได้กล่องสีมั่วขนาดมั่ว
            over = [t for t in over
                    if not t.startswith(r"\3c") and not t.startswith(r"\bord")]
        tags = pl + over + (plate_tags(plate) if on_plate else []) + anim
        pre = "{" + "".join(tags) + "}" if tags else ""
        body.append(f"Dialogue: {0 if cue['kind'] == 'auto' else 1},"
                    f"{clock(cue['a'])},{clock(cue['b'])},"
                    f"{'subplate' if on_plate else 'sub'},,"
                    f"{ml},{mr},{mv},,{pre}{txt}")
        n += 1

    for sh in shapes:
        # ชั้น 2 — รูปทรงเป็นของที่ตั้งใจชี้ไปที่อะไรสักอย่าง ต้องอยู่บนสุดเสมอ
        body.append(f"Dialogue: 2,{clock(sh['a'])},{clock(sh['b'])},sub,,"
                    f"0,0,0,,{_shape_line(sh, W, H)}")
        n += 1

    return "\n".join(head + body) + "\n", n


def summary(ctx, fxdata=None):
    """สรุปชั้นข้อความของขั้น 5 ให้หน้าเว็บ — ไม่เขียนไฟล์อะไรทั้งนั้น"""
    if not read_json(ctx.work / "render.json"):
        return {"ready": False, "cues": [], "shapes": [], "segments": []}
    fxdata = fxdata if fxdata is not None else fx.load(ctx)
    man = fx.plan(ctx, fxdata)
    rows, total = cues(ctx, fxdata, man)
    return {
        "ready": True,
        "total": round(total, 3),
        "cues": rows,
        "shapes": shape_cues(ctx, fxdata, man),
        # ชิ้นในไทม์ไลน์ + เอฟเฟกต์ที่ตั้งไว้ — แท็บ "คลิป" ของขั้น 5 ใช้ตัวนี้
        # กุญแจมาจากเอนจิน ไม่ให้หน้าเว็บประกอบเอง ไม่งั้นวันหนึ่งจะประกอบคนละ
        # แบบแล้วตั้งค่าไว้กับชิ้นที่ไม่มีอยู่จริง
        # speed/exact_dur ต้องส่งไปด้วย ไม่ใช่ให้หน้าเว็บเดาจาก len/dur — เลนของ
        # ขั้น 5 คำนวณช่วงเองตอนที่ของยังไม่ผ่านเอนจิน (เพิ่งวาง/กำลังลาก) ถ้าใช้
        # สูตรคนละตัวจะคลาดกันหลักมิลลิวินาที แล้วบล็อกจะขยับตอนกดบันทึกทุกครั้ง
        "segments": [{"name": s["name"], "kind": s["kind"],
                      "start": s["start"], "dur": s["dur"],
                      "speed": s.get("speed", 1.0),
                      "exact_dur": s.get("exact_dur", s["dur"]),
                      "at": s["at"], "len": s["len"],
                      "key": fx.clip_key(s), "fx": s["fx"],
                      "effects": s["effects"]} for s in man["segments"]],
        "touched": man.get("touched", 0),
    }
