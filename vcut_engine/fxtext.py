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
from . import fx, journey
# ตัวประกอบสตริงของขั้น 4 — ยืมมาใช้ทั้งหมด ดูเหตุผลใน docstring ข้างบน
from .caption import _clock as clock, _colour as colour, _esc as esc
from .caption import _place as place_of, _tags as tags_of
from .util import read_json


# ── ลำดับชั้นของทุกอย่างที่ ASS วาด ──
#
# เลขมากอยู่บน · เลขเท่ากันตัวที่มาทีหลังในไฟล์อยู่บน  รวมไว้ที่เดียวเพราะลำดับ
# ของชั้นคือ "อะไรบังอะไร" ซึ่งเป็นเรื่องที่ต้องมองเห็นทั้งกองพร้อมกันถึงจะตัดสิน
# ได้ ไม่ใช่เลขที่ฝังอยู่ในสตริงคนละที่แล้วมาเดาเอาทีหลังว่าทำไมของหาย
L_BACK = 0      # รูปทรงที่สั่งให้อยู่ข้างหลัง — พื้นของชิป/ป้าย
L_AUTO = 1      # ซับจากบทพูด
L_TEXT = 2      # ข้อความกับการ์ดที่วางเอง
L_SHAPE = 3     # รูปทรงปกติ — ของที่ชี้ไปที่อะไรสักอย่าง ต้องไม่ถูกบัง
L_JOURNEY = journey.LAYER   # แผนที่เส้นทาง ใช้ 4 ขึ้นไป (ดู journey.ass_events)


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
        # ชุดสไตล์ชนะค่าของชิ้นเอง — รวมตรงนี้ ไม่ใช่ตอนบันทึก ค่าเดิมของชิ้นจึง
        # ยังอยู่ครบในไฟล์ให้ปลดกลับได้ (เหตุผลเต็มอยู่ที่ fx.PRESET_KEYS)
        st = {**base, **{key: t[key] for key in fx.TEXT_STYLE_KEYS if key in t},
              **fx.preset_style(fxdata, t.get("preset"))}
        anim = {key: t.get(key, fx.TEXT[key]) for key in fx.TEXT}
        row = {"id": tid, "kind": "box", "text": str(t.get("text", "")),
               "name": t.get("name", ""), "clip_a": float(t.get("at", 0) or 0),
               "style": st, "x": t.get("x"), "y": t.get("y"), "fx": anim,
               # ชื่อชุดที่ผูกอยู่ — หน้าเว็บใช้บอกว่าชิ้นนี้ตามชุดหรือแก้เอง
               # (สไตล์ที่รวมแล้วอยู่ใน style ข้างบนเรียบร้อยทั้งสองทาง)
               "preset": str(t.get("preset") or ""),
               # การ์ดหลายบรรทัด — ส่งดิบ ๆ ให้ตัวเขียน ASS กับหน้าเว็บกางเอง
               # ทั้งคู่ต้องรู้ความสูงรวมเพื่อวาดให้ตรงกัน (ดู stack_lines)
               "lines": list(t.get("lines") or []),
               # การนับเลขไม่ได้อยู่ใน fx.TEXT (ซึ่งเป็นชุดแอนิเมชัน) จึงต้อง
               # หยิบมาใส่แถวเอง — ซับจากบทพูดไม่มีช่องพวกนี้ ตกไปเป็นค่าปิด
               "count": str(t.get("count", "") or ""),
               "count_from": float(t.get("count_from", 0.0) or 0.0),
               "count_to": float(t.get("count_to", 0.0) or 0.0)}
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
    if kind in fx.WORD_ANIM:
        # ขาเข้าเป็นหน้าที่ของแท็กที่แทรกกลางบรรทัด (stagger_words) — ใส่ \fad
        # ขาเข้าซ้ำที่นี่ด้วยจะได้ทั้งบรรทัดจางเข้าพร้อมกันทับจังหวะทีละคำ
        # จนมองไม่ออกว่าไล่ทีละคำ
        return ([rf"\fad(0,{to})"] if to > 0 else []), False
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


# ─────────────────────── โผล่ทีละคำ ───────────────────────

def stagger_words(txt, kind, ti, room_ms):
    """แทรกแท็กคั่นกลางบรรทัดให้แต่ละคำโผล่ไม่พร้อมกัน → สตริง ASS ทั้งบรรทัด

    **ทำในบรรทัดเดียว ไม่ใช่แยกเป็นข้อความหลายชิ้น**

    แยกชิ้นก็ได้หน้าตาเหมือนกัน จนกระทั่งต้องแก้ข้อความ — ตอนนั้นต้องลากทุกคำ
    ให้ระยะห่างเท่าเดิมด้วยมือ และฟอนต์ไทยกว้างไม่เท่ากันทุกคำ  ปล่อยให้ libass
    จัดวางเองแล้วสั่งแค่ *เวลา* จึงถูกกว่าทุกทาง

    **ทำไม pop ไม่ย่อจาก 58% เหมือน pop ปกติ**

    คำที่ยังไม่ถึงคิวยังกินที่เท่าเดิม (มองไม่เห็นแต่ยังกว้างเท่าเดิม) ถ้าย่อมัน
    ไว้ที่ 58% ความกว้างรวมของบรรทัดจะสั้นลง แล้วบรรทัดที่จัดกลางจะเลื่อนทั้งแถบ
    ทุกครั้งที่มีคำโผล่  วัดจริงบนจอ 1080: ย่อจาก 58% ขอบซ้ายไหล 90 พิกเซล ส่วน
    เด้ง 100→112→100 ไหลราว 15 พิกเซล ซึ่งอ่านเป็นจังหวะเด้ง ไม่ใช่ภาพสั่น
    """
    words = [w for w in txt.split(" ") if w != ""]
    if len(words) < 2:
        return txt
    d = max(60, int(ti))
    step = max(40, int(d * 0.55))
    # ทั้งชุดต้องจบก่อนชิ้นหาย ไม่งั้นคำท้าย ๆ ไม่ทันโผล่ก็ถูกเก็บแล้ว
    span = (len(words) - 1) * step + d
    if room_ms > 0 and span > room_ms:
        sc = room_ms / span
        d, step = max(40, int(d * sc)), max(20, int(step * sc))
    out = []
    for i, w in enumerate(words):
        t0 = i * step
        if kind == "pop_words":
            t1 = t0 + max(1, int(d * 0.62))
            out.append(
                r"{\alpha&HFF&"
                rf"\t({t0},{t1},\fscx112\fscy112\alpha&H00&)"
                rf"\t({t1},{t0 + d},\fscx100\fscy100)}}{w}")
        else:
            out.append(r"{\alpha&HFF&"
                       rf"\t({t0},{t0 + d},\alpha&H00&)}}{w}")
    return " ".join(out)


# ─────────────────────── ตัวเลขที่นับขึ้น ───────────────────────

def _fmt_count(v, kind):
    if kind == "comma":
        return f"{v:,.0f}"
    if kind == "k":
        a = abs(v)
        if a >= 1e6:
            return f"{v / 1e6:.1f}M"
        if a >= 1e3:
            return f"{v / 1e3:.1f}K"
        return f"{v:.0f}"
    if kind == "pct":
        return f"{v:.0f}%"
    if kind == "1dp":
        return f"{v:.1f}"
    return f"{v:.0f}"


def count_steps(cue):
    """ชิ้นที่นับเลข → [(เริ่ม, จบ, ค่าที่จะเอาไปแทน {n})] · ไม่ได้นับ → ก้อนเดียว

    ผู้เรียกวนตามรายการนี้แล้วปล่อย Dialogue ทีละก้าว — ชิ้นที่ไม่ได้นับจึงได้
    บรรทัดเดียวเหมือนเดิมทุกไบต์ ไม่ต้องมีทางแยกที่ฝั่งผู้เรียก

    ยุบก้าวที่ได้ข้อความเท่ากันเข้าด้วยกัน — ช่วง 0→5 ที่ 12 ก้าว/วิ จะได้เลขซ้ำ
    หลายสิบบรรทัดโดยไม่มีอะไรต่างกันเลย
    """
    kind = str(cue.get("count", "") or "")
    a, b = float(cue["a"]), float(cue["b"])
    if kind not in fx.COUNT or not kind or b <= a or not uses_count(cue):
        return [(a, b, None)]
    v0 = float(cue.get("count_from", 0.0) or 0.0)
    v1 = float(cue.get("count_to", 0.0) or 0.0)
    dur = b - a
    steps = min(40, max(2, int(dur * 12)))
    raw = []
    for i in range(steps):
        p = i / (steps - 1)
        # ช้าลงตอนท้าย — เลขที่วิ่งเร็วเท่ากันจนวินาทีสุดท้ายอ่านว่า "ยังไม่จบ"
        # ทั้งที่จบแล้ว  ค่าปลายทางคือสิ่งที่คนดูต้องจำ ต้องมีเวลาให้อ่าน
        p = 1 - (1 - p) ** 3
        raw.append((a + dur * i / steps, a + dur * (i + 1) / steps,
                    _fmt_count(v0 + (v1 - v0) * p, kind)))
    out = []
    for s, e, txt in raw:
        if out and out[-1][2] == txt:
            out[-1] = (out[-1][0], e, txt)
        else:
            out.append((s, e, txt))
    return out


def uses_count(cue):
    """ชิ้นนี้มีที่ให้เลขไปลงจริงไหม — ทางลัดออกก่อนซอยก้าว

    การ์ดหลายบรรทัด **ต้องมี `{n}` ชัด ๆ** ส่วนข้อความธรรมดาไม่ต้อง เพราะกรณีที่
    ใช้บ่อยที่สุดคือชิ้นที่มีแต่ตัวเลขใหญ่ ๆ ตัวเดียว

    เป็นด่านนอกสุดของสามด่าน ไม่ใช่ด่านที่รับน้ำหนักจริง — ตัวที่กันไม่ให้หัวเรื่อง
    ในการ์ดกลายเป็นตัวเลขคือการเลือกก้าวรายบรรทัดใน build_ass (บรรทัดที่ไม่มี
    `{n}` ได้ก้าวเดียวยาวทั้งชิ้น) กับ `whole=False` ที่ count_apply  ด่านนี้แค่
    ตัดจบก่อนตั้งแต่ต้นเมื่อทั้งการ์ดไม่มี `{n}` เลย จะได้ไม่ต้องคำนวณก้าวทิ้ง
    """
    if cue.get("lines"):
        return any("{n}" in str(v.get("text", "")) for v in cue["lines"])
    return True


def count_apply(text, value, whole=True):
    """เอาเลขไปแทนที่ `{n}` · `whole` = ไม่มี `{n}` ให้เลขแทนข้อความทั้งก้อน

    ต้องทำ *ก่อน* esc() เพราะ esc แปลงปีกกาเป็นวงเล็บกันคนพิมพ์ทำ ASS พัง —
    ทำหลังจากนั้นจะหาตัวแทนที่ไม่เจอแล้ว
    """
    if value is None:
        return text
    if "{n}" in text:
        return text.replace("{n}", value)
    return value if whole else text


def _step_cfg(cfg, i, total):
    """ค่าแอนิเมชันของก้าวที่ i จากทั้งหมด total ก้าว

    เลขที่วิ่งถูกซอยเป็นหลาย Dialogue ถ้าปล่อยให้ทุกก้าวจางเข้า-ออกตามที่ตั้งไว้
    จะได้ตัวเลขกะพริบทั้งช่วง แทนที่จะเป็นเลขที่วิ่ง — เข้าเฉพาะก้าวแรก
    ออกเฉพาะก้าวสุดท้าย ก้าวกลางไม่ต้องมีอะไรเลย
    """
    if total <= 1:
        return cfg
    if i == 0:
        return {**cfg, "out": 0.0}
    if i == total - 1:
        return {**cfg, "in": 0.0}
    return {**cfg, "anim": "none"}


def _body_text(raw, cue, sa, sb, cv):
    """ข้อความที่จะเขียนลงบรรทัด — แทนเลข แล้วค่อย escape แล้วค่อยแทรกแท็กทีละคำ

    ลำดับสามอย่างนี้สลับกันไม่ได้: แทนเลขต้องมาก่อน escape (esc แปลงปีกกาเป็น
    วงเล็บ ตัวแทนที่จะหายไป) และแท็กทีละคำต้องมาหลัง escape (ไม่งั้นปีกกาของ
    แท็กเองจะโดนแปลงไปด้วย)
    """
    txt = esc(count_apply(raw, cv, whole=not cue.get("lines")))
    kind = str(cue["fx"].get("anim", "") or "")
    if txt and kind in fx.WORD_ANIM:
        ti, to = _budget(sa, sb, cue["fx"])
        txt = stagger_words(txt, kind, ti or 180,
                            max(0.0, (sb - sa) * 1000.0 - to))
    return txt


# ─────────────────────────── การ์ดหลายบรรทัด ───────────────────────────

# ความสูงของหนึ่งบรรทัดเทียบกับขนาดตัวอักษร — ฟอนต์ไทยมีสระบนสองชั้นกับวรรณยุกต์
# จึงกินที่สูงกว่าฟอนต์ละตินที่ 1.2 เท่าตามธรรมเนียม  1.42 คือค่าที่วัดจาก
# Sukhumvit Set แล้วสระอึกับไม้โทไม่ชนบรรทัดบน
LINE_H = 1.42


def stack_lines(lines, cy, H):
    """การ์ดหนึ่งใบ → (บรรทัด, พิกัด y กลางบรรทัด) เรียงจากบนลงล่าง

    จัดโดยยึด **กึ่งกลางของทั้งกอง** ไว้ที่ y ที่คนลาก ไม่ใช่ยึดบรรทัดแรก —
    ไม่งั้นการ์ดจะเลื่อนลงทุกครั้งที่เพิ่มบรรทัด ทั้งที่คนเพิ่มบรรทัดคาดหวังว่า
    ของจะโตขึ้นรอบจุดเดิม

    หน้าเว็บต้องใช้สูตรเดียวกันนี้วาดพรีวิว — ถ้าคำนวณคนละแบบ การ์ดในพรีวิวจะ
    อยู่คนละที่กับในไฟล์ แล้วคนจะเชื่อพรีวิวจนกว่าจะเรนเดอร์เสร็จ
    """
    if not lines:
        return []
    hs = [float(v.get("size") or 54) * LINE_H for v in lines]
    gaps = [0.0] + [float(v.get("gap", 0.30) or 0) * float(v.get("size") or 54)
                    for v in lines[1:]]
    total = sum(hs) + sum(gaps)
    y = cy * H - total / 2.0
    out = []
    for v, h, g in zip(lines, hs, gaps):
        y += g
        out.append((v, y + h / 2.0))
        y += h
    return out


def _line_tags(v, card, base):
    """แท็กของบรรทัดหนึ่งในการ์ด — ทับทุกช่องเสมอ ไม่ใช่เฉพาะที่ต่างจากสไตล์กลาง

    _tags() ของขั้น 4 ใส่เฉพาะช่องที่ต่างจากสไตล์กลาง ซึ่งประหยัดและถูกต้องเมื่อ
    ทุกบรรทัดของชิ้นนั้นหน้าตาเดียวกัน  ในการ์ด บรรทัดถัดไปต้องล้างของบรรทัดก่อน
    หน้าให้หมด (สามบรรทัดอยู่คนละ Dialogue ก็จริง แต่ค่าที่ไม่ได้สั่งจะตกกลับไป
    เป็นของสไตล์ *กลาง* ไม่ใช่ของการ์ด) จึงต้องสั่งครบทุกช่อง
    """
    font = str(v.get("font") or "") or str(card.get("font") or base.get("font"))
    return [
        rf"\fn{font}",
        rf"\fs{int(float(v.get('size') or 54))}",
        rf"\c{colour(v.get('color') or '#FFFFFF')}&",
        rf"\3c{colour(v.get('outline') or '#000000')}&",
        rf"\bord{float(v.get('border', 3) or 0):g}",
        rf"\b{1 if v.get('bold') else 0}",
        rf"\i{1 if v.get('italic') else 0}",
        rf"\fsp{float(v.get('spacing', 0) or 0):g}",
        r"\shad0",
    ]


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

    if kind == "rrect":
        # ยืมตัววาดของแผนที่มาใช้ ไม่ก๊อป — สี่เหลี่ยมมุมมนต้องหน้าตาเดียวกัน
        # ทั้งสองที่ ไม่งั้นชิปที่วางเองกับแผงแผนที่จะมนไม่เท่ากันในเฟรมเดียวกัน
        h = max(2.0, s * th)
        return journey.rrect(-half, -h / 2.0, s, h, min(h / 2.0, s * 0.18))

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
    """รูปทรงหนึ่งชิ้น → บรรทัด Dialogue

    **ยึดด้วย \\an7 ไม่ใช่ \\an5 ทั้งที่รูปถูกวาดโดยยึดกึ่งกลางเป็น (0,0)**

    ฟังดูกลับหัวกลับหาง แต่เป็นสิ่งที่ libass ทำจริง: มันเลื่อนรูปตามการจัดวางด้วย
    *ขนาด* ของกรอบรูป โดยไม่สนว่าพิกัดต่ำสุดของรูปอยู่ที่เท่าไร  \\an5 จึงเลื่อน
    รูปไปอีก −(กว้าง/2, สูง/2) ทั้งที่รูปคร่อมศูนย์อยู่แล้ว ผลคือรูปไปโผล่เยื้อง
    ขึ้นซ้ายเท่ากับครึ่งขนาดของมันเอง — วัดจริง: จุดขนาด 160 px ที่สั่งไว้ที่
    (400,200) ไปอยู่ที่ (320,120) ส่วนหน้าเว็บวาดพรีวิวไว้ตรงกลางตามที่สั่ง
    สองอย่างจึงไม่ตรงกันมาตลอดโดยไม่มีอะไรฟ้อง

    \\an7 เลื่อนเป็นศูนย์ พิกัดในรูปจึงถูกใช้ตรง ๆ และรูปที่คร่อม (0,0) ก็ไปอยู่
    กลาง \\pos พอดี — และ \\frz ยังหมุนรอบจุดเดียวกันนั้น (ตรวจแล้วด้วยภาพ)
    """
    return _shape_lines(sh, W, H)[-1]


def _shape_lines(sh, W, H):
    """รูปทรงหนึ่งชิ้น → บรรทัด Dialogue ทุกบรรทัดที่มันต้องใช้ · ตัวจริงอยู่ท้ายสุด

    ชิ้นที่ไม่ได้เปิดเรืองแสงได้บรรทัดเดียวเหมือนเดิมทุกไบต์ — ชั้นฟุ้งเป็นบรรทัด
    ที่ *เพิ่มเข้ามาข้างหน้า* ไม่ใช่การแก้บรรทัดเดิม  ทั้งกองอยู่ layer เดียวกัน
    ลำดับในไฟล์จึงเป็นตัวตัดสินว่าฮาโลอยู่ใต้รูปจริง (ดู journey.glow_layers)
    """
    cue = {"kind": "box", "a": sh["a"], "b": sh["b"], "x": sh["x"], "y": sh["y"],
           "style": {"size": sh["size"], "align": 5}}
    tags, moved = anim_tags(cue, sh, W, H)
    pre = [r"\an7"]
    if not moved:
        pre.append(rf"\pos({float(sh['x']) * W:.0f},{float(sh['y']) * H:.0f})")
    paint = [rf"\c{colour(sh['color'])}&",
             rf"\3c{colour(sh['outline'])}&",
             rf"\bord{float(sh['border']):g}", r"\shad0"]
    spin = [rf"\frz{float(sh['angle']):g}"] if float(sh.get("angle") or 0) else []
    path = sh.get("path") or path_of(sh["kind"], sh["size"], sh["thick"])

    def line(mid):
        # ต้องปิดโหมดวาดทุกครั้ง — ปล่อยค้างไว้บรรทัดถัดไปจะถูกอ่านเป็นพิกัดต่อ
        return "{" + "".join(pre + mid + spin + tags) + r"\p1}" + path + r"{\p0}"

    # หน่วยอ้างอิงของแสงฟุ้งคือ *ความหนาของรูป* ไม่ใช่ size — แถบมุมมนที่ยาว 600
    # แต่หนา 40 ต้องได้ฮาโลเท่ากับจุดที่โต 40 ไม่ใช่ฮาโลหนา 60 ที่กลืนทั้งชิป
    # (glow_unit ใส่เพดานให้อีกชั้น — ดูเหตุผลที่นั่น)
    thick = float(sh["size"]) * (0.5 if sh["kind"] == "dot" else float(sh["thick"]))
    return [line(g) for g in journey.glow_layers(
        sh["color"], journey.glow_unit(thick, W, H), sh.get("glow", 0.0))] \
        + [line(paint)]


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
    # แผนที่เส้นทางมีสไตล์ของตัวเอง — ฟอนต์กับขนาดของป้ายชื่อจุดเป็นคนละเรื่อง
    # กับซับ ถ้าใช้สไตล์เดียวกัน คนที่ขยายซับให้อ่านง่ายจะทำป้ายในแผนที่ล้นกล่อง
    jour = fxdata.get("journey") or {}
    if jour.get("enabled"):
        head.append(journey.style_line(jour))
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

        # การ์ดหลายบรรทัด — หนึ่งชิ้นในไฟล์ กลายเป็นหลาย Dialogue ตรงนี้ที่เดียว
        # ทุกบรรทัดใช้เวลาและแอนิเมชันชุดเดียวกัน จึงเข้า-ออกพร้อมกันเสมอ
        steps = count_steps(cue)

        if cue.get("lines"):
            al = int(cue["style"].get("align", 5) or 5)
            cx = float(cue.get("x") if cue.get("x") is not None else 0.5) * W
            for v, ly in stack_lines(cue["lines"], float(
                    cue.get("y") if cue.get("y") is not None else 0.5), H):
                # บรรทัดที่ไม่มี {n} ไม่เปลี่ยนตามเวลา — ปล่อยบรรทัดเดียวยาวทั้งชิ้น
                # ไม่ใช่ซ้ำเท่าจำนวนก้าวของเลขที่บรรทัดอื่นนับอยู่
                mine = steps if "{n}" in str(v.get("text", "")) \
                    else [(cue["a"], cue["b"], None)]
                for si, (sa, sb, cv) in enumerate(mine):
                    ltxt = _body_text(v.get("text", ""), cue, sa, sb, cv)
                    if not ltxt:
                        continue
                    # จุดยึดของแอนิเมชันคือที่ของ *บรรทัดนี้* ไม่ใช่กลางการ์ด —
                    # ไม่งั้น rise/slide จะไถลไปจบที่กลางการ์ดทุกบรรทัด แล้วสาม
                    # บรรทัดจะกองทับกันตอนจบ  ขนาดตัวอักษรก็ต้องเป็นของบรรทัดนี้
                    # เพราะระยะไถลคิดจากขนาดตัวอักษร
                    anim, moved = anim_tags(
                        {**cue, "a": sa, "b": sb, "y": ly / H,
                         "style": {**cue["style"], "size": v.get("size")}},
                        _step_cfg(cue["fx"], si, len(mine)), W, H)
                    pre = [rf"\an{al}"]
                    if not moved:
                        pre.append(rf"\pos({cx:.0f},{ly:.0f})")
                    tags = pre + _line_tags(v, cue["style"], base) + anim
                    body.append(f"Dialogue: {L_TEXT},{clock(sa)},{clock(sb)},"
                                f"sub,,0,0,0,,{'{' + ''.join(tags) + '}'}{ltxt}")
                    n += 1
            continue

        on_plate = bool(cue["fx"].get("plate"))
        pl, (ml, mr, mv) = place_of(cue, base, W, H)
        over = tags_of(cue, base)
        if on_plate:
            # บนสไตล์กล่อง \3c คือสีกล่อง \bord คือระยะขอบ — ของที่ _tags ส่งมา
            # ยังหมายถึงขอบตัวอักษรอยู่ ปล่อยผ่านไปจะได้กล่องสีมั่วขนาดมั่ว
            over = [t for t in over
                    if not t.startswith(r"\3c") and not t.startswith(r"\bord")]
        for si, (sa, sb, cv) in enumerate(steps):
            txt = _body_text(cue["text"], cue, sa, sb, cv)
            if not txt:
                continue
            anim, moved = anim_tags({**cue, "a": sa, "b": sb},
                                    _step_cfg(cue["fx"], si, len(steps)), W, H)
            place = pl
            if moved:
                # \move เป็นคนกำหนดตำแหน่งแล้ว — \pos ที่ตามมาจะลบล้างมันทิ้ง
                place = [x for x in pl if not x.startswith(r"\pos")]
            tags = place + over + (plate_tags(plate) if on_plate else []) + anim
            pre = "{" + "".join(tags) + "}" if tags else ""
            body.append(f"Dialogue: {L_AUTO if cue['kind'] == 'auto' else L_TEXT},"
                        f"{clock(sa)},{clock(sb)},"
                        f"{'subplate' if on_plate else 'sub'},,"
                        f"{ml},{mr},{mv},,{pre}{txt}")
            n += 1

    for sh in shapes:
        lay = L_BACK if sh.get("behind") else L_SHAPE
        for ln in _shape_lines(sh, W, H):
            body.append(f"Dialogue: {lay},{clock(sh['a'])},{clock(sh['b'])},sub,,"
                        f"0,0,0,,{ln}")
        # นับ *ชิ้น* ไม่ใช่บรรทัด — ตัวเลขนี้ถูกลบด้วยจำนวนรูปทรงเพื่อหาจำนวน
        # ข้อความที่ finish.run พิมพ์ (n - nsh) ถ้านับบรรทัด ชิ้นที่เปิดเรืองแสง
        # จะไปโผล่เป็น "ข้อความ" เพิ่มขึ้นมาสองชิ้นต่อรูปหนึ่งรูป
        n += 1

    # แผนที่เส้นทางอยู่บนสุดของทุกอย่างที่ ASS วาด แต่ยังอยู่ *ใต้* ภาพซ้อน
    # เพราะภาพซ้อนถูกต่อทีหลังในสายฟิลเตอร์ (ดู finish.py)
    jev = journey.ass_events(fxdata, W, H, man)
    body += jev
    n += len(jev)

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
