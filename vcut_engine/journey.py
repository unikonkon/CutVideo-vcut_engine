"""JOURNEY — ขั้น 5 · แผนที่เส้นทางที่มีคนเดินวิ่งไปตามคลิป

ชั้นนี้ตอบคำถามเดียว: **"ตอนนี้เราเดินมาถึงไหนแล้ว"** — หนังเดินป่าที่ยาวสิบนาที
ทุกช็อตหน้าตาเหมือนกันหมด (ป่า · ทางชัน · คนเหนื่อย) คนดูจึงหลงว่าอยู่ตรงไหนของ
เส้นทางตั้งแต่นาทีที่สอง แผนที่เล็ก ๆ ที่โผล่ตอนถึงแต่ละเนินแก้เรื่องนี้ได้ด้วย
ภาพเดียว โดยไม่ต้องให้ใครพูดว่า "ตอนนี้เราอยู่เนินที่สาม"

**ทำไมวาดด้วย \\p ของ libass ไม่ใช่ทำเป็นไฟล์วิดีโอโปร่งใสแล้ววางเป็น overlay**

ทางเลือกที่สองต้องเรนเดอร์ PNG หลายร้อยเฟรม → ประกอบเป็น MOV ที่มีอัลฟา → ให้
ffmpeg อ่านเพิ่มอีกหนึ่งสาย  แปลว่ามีไฟล์กลางที่ต้องคอยดูว่าเก่าไปหรือยังทุกครั้ง
ที่ใครขยับไทม์ไลน์ และเวลาของมันจะผูกกับ *วินาทีในหนัง* ซึ่งเลื่อนทันทีที่ขั้น 3
ถูกแก้  ส่วนทางนี้ไปอยู่ใน ASS ไฟล์เดียวกับข้อความ ไม่มีไฟล์กลาง ไม่มีพาสเพิ่ม
และผูกเวลากับ (คลิป, วินาทีในคลิป) เหมือนทุกชั้นของขั้น 5

**พิกัดสองระบบ และทำไมต้องมีสองระบบ**

ตัวเส้นทางมาจาก SVG ที่คนวาดไว้ในกล่องขนาด box (1000×550) — ทุกอย่างในไฟล์นี้
คิดในหน่วยนั้น แล้วแปลงเป็นพิกัดจอทีเดียวตอนพ่นออกเป็น ASS  ถ้าคิดเป็นพิกัดจอ
ตั้งแต่ต้น ค่า x/y ของทุกจุดจะผิดทันทีที่เปลี่ยนขนาดแผงหรือความละเอียดหนัง
"""
import math
import re

from .caption import _clock as clock, _colour as colour, _esc as esc

# ── แผงแผนที่ทั้งแผง ──
#
# x/y = *กึ่งกลาง* ของแผง เทียบกับความกว้าง/สูงของจอ — เหมือน overlays กับ shapes
# ที่วางด้วย \an5 ทุกตัว ถ้าตัวนี้ใช้มุมบนซ้ายคนลากในหน้าเว็บจะงงว่าทำไมของ
# ขยับไม่เหมือนกันทั้งที่ลากท่าเดียวกัน
JOURNEY = {
    "enabled": False,
    "x": 0.32, "y": 0.73,
    "width": 0.46,        # กว้างกี่ส่วนของจอ
    "dur": 3.5,           # แผงอยู่บนจอนานเท่าไร
    "walk": 1.4,          # ใช้เวลาเดินจากจุดก่อนหน้ามาถึงจุดนี้กี่วินาที
    "in": 0.3, "out": 0.35,
    "panel": 0.55,        # ความทึบของพื้นหลังแผง · 0 = ไม่มีพื้นหลัง
    "panel_color": "#0E1A22",
    "pad": 26.0,          # ระยะขอบในแผง (หน่วยของ box)
    "thick": 7.0,         # ความหนาเส้นทาง (หน่วยของ box)
    "figure": 74.0,       # ความสูงของคนเดิน (หน่วยของ box)
    "line": "#FFFFFF",    # เส้นช่วงที่เดินผ่านมาแล้ว
    "trail": "#8695A3",   # เส้นช่วงที่ยังไปไม่ถึง
    "walker": "#FF3B30",  # สีตัวคนเดิน
    "size": 34,           # ขนาดตัวอักษรของป้ายชื่อจุด (หน่วยของ box)
    "font": "Sukhumvit Set",

    # ── หน้าตาของเส้น ──
    #
    # คีย์ชื่อ "look" ไม่ใช่ "style" ทั้งที่ความหมายคือสไตล์ — เพราะ _pick ของ
    # fx.py ดัดค่าตามชื่อคีย์จากตารางกลางตัวเดียว (ENUMS) ถ้าจองชื่อ "style" ไว้
    # ที่นี่ วันที่มีใครใส่คีย์ชื่อเดียวกันในชั้นอื่นค่าจะถูกดัดด้วยรายการของแผนที่
    # โดยไม่มีอะไรฟ้อง
    "look": "map",        # map = แบน · neon = เส้นเรืองแสง
    "glow": 0.9,          # ความแรงของแสงฟุ้ง (มีผลเมื่อ look = neon)
    "core": "#FFFFFF",    # สีแกนกลางของเส้นนีออน — หลอดนีออนจริงแกนขาว ฮาโลมีสี
    "show_dist": True,
    "unit": "ม.",
    "box": [1000.0, 550.0],
    "d": "",
    "stops": [],
}

# ── หมุดหนึ่งจุดบนเส้นทาง ──
#
# px/py = จุดบนเส้นทาง · lx/ly = ตำแหน่งป้ายชื่อ (คนวาด SVG จัดมาแล้วว่าป้ายไหน
# ควรอยู่บนเส้นหรือใต้เส้นเพื่อไม่ให้ทับกัน) ทั้งสี่ตัวเป็นหน่วยของ box
STOP = {
    "label": "จุดใหม่",
    "dist": 0.0,
    "color": "#E65100",
    "px": 0.0, "py": 0.0,
    "lx": 0.0, "ly": 0.0,
    "name": "",           # เกาะกับคลิปไหน
    "at": 0.0,            # วินาทีที่เท่าไรของคลิปนั้น
    "id": "",
}

# กี่เฟรมต่อวินาทีสำหรับช่วงที่คนเดิน — ไม่ต้องเท่า fps ของหนัง เพราะสิ่งที่
# ขยับคือหมุดที่เลื่อนช้า ๆ  12.5 คือจุดที่ตายังไม่เห็นการกระตุกแล้ว และทำให้
# จำนวนบรรทัดใน ASS ต่ำกว่าการพ่นทุกเฟรมจริงห้าเท่า
WALK_FPS = 12.5

# จำนวนจุดที่ใช้ตัดเส้นโค้งเบซิเยร์หนึ่งท่อนให้กลายเป็นเส้นตรงหลายท่อน
FLATTEN = 24

# ── หน้าตาที่เลือกได้ — ค่าคือคำอธิบายที่หน้าเว็บเอาไปขึ้นตัวเลือก ──
LOOK = {"map": "แบน — เส้นทึบขอบคม", "neon": "นีออน — เส้นเรืองแสง"}

# ชั้นล่างสุดของแผนที่ — ชั้นที่ต่ำกว่านี้เป็นของข้อความกับรูปทรง (fxtext.L_*)
# แผงกินพื้นที่จอเยอะและมีพื้นหลังทึบ จึงต้องอยู่บนสุดเสมอ ไม่งั้นซับที่บังเอิญ
# ขึ้นพร้อมกันจะถูกแผงกลืนหายไปทั้งบรรทัด
LAYER = 4


# ─────────────────────────── เรขาคณิตของเส้นทาง ───────────────────────────

_NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def _bezier(p0, p1, p2, p3, t):
    u = 1.0 - t
    return (u * u * u * p0[0] + 3 * u * u * t * p1[0]
            + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1]
            + 3 * u * t * t * p2[1] + t * t * t * p3[1])


def polyline(d):
    """เส้นทางแบบ SVG → รายการจุดเรียงตามทาง

    รับเท่าที่ไฟล์เส้นทางใช้จริง (M · L · C · Z ทั้งตัวใหญ่ตัวเล็ก) — รับครบทุก
    คำสั่งของ SVG แปลว่าต้องเขียนตัวแปลง arc/quadratic/smooth ทั้งชุดไว้รอของที่
    ไม่มีใครใช้ ถ้าวันหนึ่งมีเส้นทางที่ใช้คำสั่งอื่น มันจะถูกข้ามอย่างเงียบ ๆ
    ที่นี่ (ไม่ใช่ระเบิด) แล้วเส้นจะขาดให้เห็นทันทีในพรีวิว
    """
    pts, cur, start = [], (0.0, 0.0), (0.0, 0.0)
    for m in re.finditer(r"([MmLlCcZzHhVv])([^MmLlCcZzHhVv]*)", str(d or "")):
        cmd, args = m.group(1), [float(x) for x in _NUM.findall(m.group(2))]
        rel = cmd.islower()
        up = cmd.upper()

        if up == "Z":
            if pts and start != cur:
                pts.append(start)
                cur = start
            continue

        step = {"M": 2, "L": 2, "C": 6, "H": 1, "V": 1}[up]
        for i in range(0, len(args) - step + 1, step):
            a = args[i:i + step]
            if up in ("M", "L"):
                p = (a[0] + (cur[0] if rel else 0.0), a[1] + (cur[1] if rel else 0.0))
                if up == "M" and not pts:
                    start = p
                # เส้นทางเป็นเส้นเดียวต่อเนื่องเสมอ — M ที่โผล่กลางทางจึงถูกต่อ
                # เหมือน L ไม่ได้ยกปากกา (เส้นทางที่ขาดเป็นท่อน ๆ ไม่มีความหมาย
                # สำหรับ "เดินจากจุดนี้ไปจุดนั้น" ซึ่งเป็นสิ่งเดียวที่ชั้นนี้ทำ)
                pts.append(p)
                cur = p
            elif up == "H":
                p = (a[0] + (cur[0] if rel else 0.0), cur[1])
                pts.append(p)
                cur = p
            elif up == "V":
                p = (cur[0], a[0] + (cur[1] if rel else 0.0))
                pts.append(p)
                cur = p
            else:  # C
                ox, oy = (cur if rel else (0.0, 0.0))
                c1 = (a[0] + ox, a[1] + oy)
                c2 = (a[2] + ox, a[3] + oy)
                p3 = (a[4] + ox, a[5] + oy)
                for k in range(1, FLATTEN + 1):
                    pts.append(_bezier(cur, c1, c2, p3, k / FLATTEN))
                cur = p3
    return pts


def arclen(pts):
    """ความยาวสะสมถึงจุดที่ i — ใช้เดินตำแหน่งด้วย *ระยะทาง* ไม่ใช่ดัชนีจุด

    ถ้าเดินด้วยดัชนี คนเดินจะช้าลงตรงช่วงโค้ง (จุดถี่) แล้วพุ่งตรงช่วงเส้นตรง
    (จุดห่าง) ทั้งที่ความเร็วควรคงที่ — ตาจับได้ทันทีว่าอะไรผิด แต่บอกไม่ถูกว่าอะไร
    """
    cum = [0.0]
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
        cum.append(cum[-1] + math.hypot(dx, dy))
    return cum


def point_at(pts, cum, s):
    """จุดที่ระยะทาง s จากต้นทาง (แทรกเชิงเส้นระหว่างสองจุดที่ขนาบมัน)"""
    if not pts:
        return (0.0, 0.0)
    total = cum[-1]
    s = min(max(0.0, s), total)
    lo, hi = 0, len(cum) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cum[mid] < s:
            lo = mid + 1
        else:
            hi = mid
    if lo == 0:
        return pts[0]
    seg = cum[lo] - cum[lo - 1]
    f = 0.0 if seg <= 0 else (s - cum[lo - 1]) / seg
    return (pts[lo - 1][0] + (pts[lo][0] - pts[lo - 1][0]) * f,
            pts[lo - 1][1] + (pts[lo][1] - pts[lo - 1][1]) * f)


def nearest_s(pts, cum, px, py):
    """หมุดที่คนวาดวางไว้ อยู่ที่ระยะทางเท่าไรของเส้น

    หมุดใน SVG เป็นวงกลมที่วางทับเส้น *ด้วยสายตา* ไม่ได้ผูกกับเส้นทางจริง ๆ
    ค่าที่ได้จึงคลาดจากเส้นไปเล็กน้อยเสมอ — หาจุดบนเส้นที่ใกล้มันที่สุดแทนที่จะ
    เชื่อพิกัดตรง ๆ ไม่งั้นคนเดินจะกระตุกออกนอกเส้นทุกครั้งที่ถึงหมุด
    """
    best, best_d = 0.0, float("inf")
    for i in range(1, len(pts)):
        ax, ay = pts[i - 1]
        bx, by = pts[i]
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy
        t = 0.0 if L2 <= 0 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
        qx, qy = ax + vx * t, ay + vy * t
        dd = (px - qx) ** 2 + (py - qy) ** 2
        if dd < best_d:
            best_d, best = dd, cum[i - 1] + math.hypot(vx, vy) * t
    return best


# ─────────────────────────── รูปที่วาดลง \p ───────────────────────────
#
# ทุกตัวคืน "สตริงในโหมดวาดของ ASS" ที่คิดพิกัดเป็น *หน่วยจอ* มาแล้ว — ตัวแปลง
# หน่วย box → หน่วยจอ อยู่ที่ _tx เพียงที่เดียว

def _fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _quad(a, b, c, d):
    return (f"m {_fmt(a[0])} {_fmt(a[1])} l {_fmt(b[0])} {_fmt(b[1])} "
            f"{_fmt(c[0])} {_fmt(c[1])} {_fmt(d[0])} {_fmt(d[1])} ")


def stroke(pts, w):
    """เส้นหนา — ทำจากสี่เหลี่ยมต่อกันทีละท่อน ไม่ใช่วงกลมเรียงกัน

    libass วาดได้แต่รูปทึบ ไม่มีคำสั่ง "ลากเส้นหนาเท่านี้" ทางที่ตรงไปตรงมาที่สุด
    คือแปลงแต่ละท่อนเป็นสี่เหลี่ยมที่กว้างเท่าความหนา แล้ว *ยืดหัวท้ายออกครึ่ง
    ความหนา* ให้สี่เหลี่ยมสองอันที่ติดกันเหลื่อมกันพอดี — รอยต่อจึงเต็มโดยไม่ต้อง
    วาดวงกลมที่ข้อต่อทุกจุด (ซึ่งจะทำให้สตริงยาวขึ้นสามเท่าเพื่อสิ่งที่ตามองไม่เห็น)
    """
    h = max(0.35, w / 2.0)
    out = []
    for i in range(1, len(pts)):
        ax, ay = pts[i - 1]
        bx, by = pts[i]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        if L <= 1e-6:
            continue
        ux, uy = dx / L, dy / L          # ทิศทาง
        nx, ny = -uy * h, ux * h         # ตั้งฉาก ยาวครึ่งความหนา
        ex, ey = ux * h, uy * h          # ยืดหัวท้าย
        out.append(_quad((ax - ex + nx, ay - ey + ny), (bx + ex + nx, by + ey + ny),
                         (bx + ex - nx, by + ey - ny), (ax - ex - nx, ay - ey - ny)))
    return "".join(out)


def circle(cx, cy, r):
    k = r * 0.5523          # ค่าที่ทำให้เบซิเยร์สี่ท่อนกลายเป็นวงกลม
    return (f"m {_fmt(cx)} {_fmt(cy - r)} "
            f"b {_fmt(cx + k)} {_fmt(cy - r)} {_fmt(cx + r)} {_fmt(cy - k)} "
            f"{_fmt(cx + r)} {_fmt(cy)} "
            f"b {_fmt(cx + r)} {_fmt(cy + k)} {_fmt(cx + k)} {_fmt(cy + r)} "
            f"{_fmt(cx)} {_fmt(cy + r)} "
            f"b {_fmt(cx - k)} {_fmt(cy + r)} {_fmt(cx - r)} {_fmt(cy + k)} "
            f"{_fmt(cx - r)} {_fmt(cy)} "
            f"b {_fmt(cx - r)} {_fmt(cy - k)} {_fmt(cx - k)} {_fmt(cy - r)} "
            f"{_fmt(cx)} {_fmt(cy - r)} ")


def rrect(x, y, w, h, r):
    """สี่เหลี่ยมมุมมน — มุมทำด้วยเบซิเยร์สองจุดคุม ไม่ใช่ส่วนโค้งจริง

    ต่างกันไม่ถึงหนึ่งพิกเซลที่รัศมีขนาดนี้ และ ASS ไม่มีคำสั่งส่วนโค้งให้ใช้อยู่แล้ว
    """
    r = max(0.0, min(r, w / 2.0, h / 2.0))
    k = r * 0.4477
    x2, y2 = x + w, y + h
    return (f"m {_fmt(x + r)} {_fmt(y)} l {_fmt(x2 - r)} {_fmt(y)} "
            f"b {_fmt(x2 - k)} {_fmt(y)} {_fmt(x2)} {_fmt(y + k)} {_fmt(x2)} {_fmt(y + r)} "
            f"l {_fmt(x2)} {_fmt(y2 - r)} "
            f"b {_fmt(x2)} {_fmt(y2 - k)} {_fmt(x2 - k)} {_fmt(y2)} {_fmt(x2 - r)} {_fmt(y2)} "
            f"l {_fmt(x + r)} {_fmt(y2)} "
            f"b {_fmt(x + k)} {_fmt(y2)} {_fmt(x)} {_fmt(y2 - k)} {_fmt(x)} {_fmt(y2 - r)} "
            f"l {_fmt(x)} {_fmt(y + r)} "
            f"b {_fmt(x)} {_fmt(y + k)} {_fmt(x + k)} {_fmt(y)} {_fmt(x + r)} {_fmt(y)} ")


def walker(cx, by, h, phase, lean=0.0):
    """คนเดิน — หัว · ลำตัว · แขนสองข้าง · ขาสองข้าง ที่แกว่งตามเฟส

    (cx, by) = กลางเท้า ไม่ใช่กลางตัว เพราะสิ่งที่ต้องอยู่ *บนเส้นทาง* พอดีคือ
    จุดที่เท้าเหยียบ ถ้ายึดกลางตัวคนจะลอยเหนือเส้นครึ่งตัวตลอดเวลา

    phase เดินรอบละ 2π — ขาหน้า/ขาหลังใช้ sin คนละเครื่องหมาย แขนสลับข้างกับขา
    เหมือนคนเดินจริง (แขนขวาไปกับขาซ้าย) ซึ่งเป็นรายละเอียดที่ถ้าทำกลับด้านแล้ว
    คนดูรู้สึกว่าผิดแต่บอกไม่ถูกว่าผิดตรงไหน
    """
    sw = math.sin(phase)
    head_r = h * 0.15
    hip = by - h * 0.42            # สะโพก
    sho = by - h * 0.72            # ไหล่
    head_y = by - h * 0.86
    leg = h * 0.42
    arm = h * 0.26
    th = max(1.0, h * 0.085)       # ความหนาของเส้นตัว
    tilt = lean * h * 0.10

    body = circle(cx + tilt * 0.6, head_y, head_r)
    body += stroke([(cx + tilt * 0.6, head_y + head_r * 0.6), (cx, hip)], th)
    # ขา — ปลายเท้าทั้งสองข้างจบที่ระดับ by เสมอ ไม่งั้นคนจะจมลงไปในเส้นทาง
    body += stroke([(cx, hip), (cx + sw * leg * 0.55, by)], th)
    body += stroke([(cx, hip), (cx - sw * leg * 0.55, by)], th)
    # แขน — สลับข้างกับขา
    body += stroke([(cx + tilt * 0.3, sho), (cx - sw * arm, sho + arm * 0.75)], th * 0.85)
    body += stroke([(cx + tilt * 0.3, sho), (cx + sw * arm, sho + arm * 0.75)], th * 0.85)
    return body


# ─────────────────────────── เวลาบนไทม์ไลน์ ───────────────────────────

def start_of(man, name, at):
    """(คลิป, วินาทีในคลิป) → วินาทีที่เท่าไรของหนัง · None = คลิปไม่ได้ถูกใช้

    **ไม่ใช้ fxtext.shape_spans เพราะมันตอบคนละคำถาม** — ตัวนั้นตอบว่า "ช่วง
    [at, at+dur] ไปโผล่ตรงไหนบ้าง" แล้วทิ้งช่วงที่สั้นกว่า 0.20 วินาที ซึ่งถูกแล้ว
    สำหรับลูกศรที่กะพริบแวบเดียวตรงรอยตัด  แต่หมุดของแผนที่ต้องการแค่ *จุดเริ่ม*
    จุดเดียว ความยาวนับเป็นวินาทีในหนังต่างหาก (ดู cues)

    ถ้ายืมของเดิมมาใช้ หมุดที่คนวางไว้ห่างจากท้ายคลิปไม่ถึง 0.2 วินาทีจะกลายเป็น
    หมุดกำพร้าทั้งที่คลิปนั้นอยู่ในหนังเต็ม ๆ — วัดจริงกับหนังเรื่องนี้ หมุด
    "เนินเสือโคร่ง" (IMG_7208 วินาทีที่ 5.627 · คลิปใช้ถึง 5.7) หายไปด้วยเหตุนี้
    """
    at = float(at or 0)
    best = None
    for s in man["segments"]:
        if s["name"] != name:
            continue
        lo, hi = float(s["start"]), float(s["start"]) + float(s["dur"])
        if not (lo <= at <= hi):
            continue
        sp = float(s.get("speed") or 1.0) or 1.0
        t = float(s["at"]) + (at - lo) / sp
        if best is None or t < best:
            best = t
    return best


def cues(data, man):
    """หมุดทุกจุด → ช่วงเวลาบนไทม์ไลน์ของขั้น 5

    คืน list เรียงตามเวลาในหนัง โดยแต่ละแถวรู้ว่าตัวเองเป็นหมุดที่เท่าไรของ
    เส้นทาง (idx) — ตัวเลขนี้คือสิ่งที่บอกว่าคนเดินต้องเดินจากตรงไหนไปตรงไหน

    **คลิปเป็นตัวบอกว่า "เริ่มเมื่อไร" เท่านั้น ความยาวเป็นวินาทีในหนัง**

    ชั้นอื่นของขั้น 5 ตัดช่วงของตัวเองให้พอดีกับคลิปที่มันเกาะอยู่ เพราะลูกศรที่
    ชี้ไปที่อะไรสักอย่างในช็อตต้องหายไปพร้อมช็อตนั้น  แผนที่ไม่ใช่แบบนั้น มันเป็น
    การเล่าเรื่องที่คร่อมหลายช็อต ถ้าตัดตามคลิป หมุดที่ตกใส่ช็อต B-roll ยาว 1.5
    วินาทีจะได้แผงที่โผล่ 1.5 วินาทีแล้วหาย — สั้นกว่าเวลาที่ใช้เฟดเข้าเสียอีก
    (วัดจริงกับหนังเรื่องนี้: หมุด "จุดเริ่มต้น" ได้ 0.32 วินาที จากที่ตั้งไว้ 3.5)

    จึงใช้คลิปหาแค่ *จุดเริ่ม* แล้วนับความยาวเป็นวินาทีในหนังตรง ๆ ราคาที่จ่ายคือ
    ถ้าย้ายไทม์ไลน์จนคลิปถัดไปเปลี่ยน แผงจะยังยาวเท่าเดิมแต่ไปทับช็อตอื่น ซึ่ง
    รับได้ เพราะหมุดมีไม่กี่จุดและมันคือพฤติกรรมที่คนตั้งค่าคาดหวังอยู่แล้ว

    หมุดที่คลิปของมันถูกตัดออกจากหนังไปแล้วคืนมาพร้อม orphan=True ไม่ใช่หายเงียบ
    (ท่าเดียวกับข้อความ/รูปทรง) — หน้าเว็บจะได้บอกได้ว่าจุดไหนหลุด
    """
    j = data.get("journey") or {}
    stops = j.get("stops") or []
    dur = max(0.3, float(j.get("dur") or 3.5))
    total = float(man.get("total") or 0)
    out = []
    for i, st in enumerate(stops):
        row = {"idx": i, "label": st.get("label", ""), "color": st.get("color", "#E65100"),
               "dist": float(st.get("dist") or 0), "name": st.get("name", ""),
               "at": float(st.get("at") or 0),
               "id": st.get("id") or f"j{i}"}
        a = start_of(man, st.get("name", ""), st.get("at", 0))
        if a is None:
            out.append({**row, "a": None, "b": None, "orphan": True})
            continue
        b = min(a + dur, total) if total > 0 else a + dur
        out.append({**row, "a": round(a, 3), "b": round(b, 3)})
    out.sort(key=lambda r: (r["a"] is None, r["a"] or 0))
    return out


# ─────────────────────────── พ่นเป็น ASS ───────────────────────────

def _envelope(t, dur, tin, tout):
    """0→1 ตอนเข้า · 1 ตอนกลาง · 1→0 ตอนออก — คืนค่าอัลฟาแบบ 0..1"""
    if t < tin:
        return max(0.0, t / tin) if tin > 0 else 1.0
    if t > dur - tout:
        return max(0.0, (dur - t) / tout) if tout > 0 else 1.0
    return 1.0


def _a(v):
    """0..1 (1 = ทึบ) → ไบต์อัลฟาของ ASS (00 = ทึบ)"""
    return f"&H{max(0, min(255, int(round((1.0 - v) * 255)))):02X}&"


# ── ชั้นที่ทำให้ของเรืองแสง ──
#
# (ขยายออกกี่เท่าของ unit, ละลายขอบกี่เท่าของ unit, ทึบแค่ไหน)
#
# **ขยายด้วย \bord แล้วละลายด้วย \blur ไม่ใช่วาดเรขาคณิตใหม่ที่ความหนาสามค่า**
# ทางแรกใช้สตริงรูปเดิมซ้ำได้ทั้งสามชั้น (ซึ่งของเส้นทางยาวเป็นพันตัวอักษร)
# ส่วนทางที่สองต้องเรียก stroke() ใหม่ทุกชั้นแล้วไฟล์บวมสามเท่าจริง ๆ
#
# สองชั้น ไม่ใช่ชั้นเดียว เพราะแสงจริงมีทั้งฮาโลกว้างจาง ๆ กับวงในสว่างชิดตัว
# ชั้นเดียวได้ขอบฟุ้งเท่ากันทั้งวง ตาอ่านว่า "เบลอ" ไม่ใช่ "เรืองแสง"
GLOW = ((2.6, 2.0, 0.60), (1.1, 0.8, 0.35))

# แกนกลาง — ละลายขอบนิดเดียวพอให้ไม่เป็นขอบบันได แต่ยังคมกว่าฮาโลชัดเจน
CORE_BLUR = 0.22


def glow_unit(thickness, W, H):
    """ขนาดอ้างอิงของแสงฟุ้ง — โตตามความหนาของของ แต่ตันที่ค่าหนึ่ง

    **ฮาโลไม่ได้โตตามความหนาไปเรื่อย ๆ** หลอดนีออนที่อ้วนขึ้นสองเท่าไม่ได้มีแสง
    ฟุ้งกว้างขึ้นสองเท่า ความกว้างของฮาโลขึ้นกับความสว่างกับอากาศรอบ ๆ มากกว่า

    วัดจริงตอนทำรอบ 4: ปล่อยให้โตตามความหนาแบบไม่มีเพดาน ชิปที่หนา 57 พิกเซล
    ได้ฮาโลกว้าง 148 พิกเซล ซึ่งท่วมทั้งเฟรมจนอ่านไม่ออกว่ามีรูปอะไรอยู่ข้างใน

    เพดานคิดจาก *ด้านสั้นของจอ* ไม่ใช่ค่าคงที่เป็นพิกเซล — ไม่งั้นแสงที่พอดีบน
    หนัง 1080 จะกลายเป็นขอบเรืองบาง ๆ ที่แทบมองไม่เห็นบน 4K
    """
    return min(min(int(W), int(H)) * 0.012, max(3.0, float(thickness)))


def glow_layers(col, unit, strength, alpha=1.0, dim=1.0):
    """แท็กของชั้นฟุ้งที่ต้องวาด *ก่อน* รูปจริง — คืนรายการของรายการแท็ก

    unit = ขนาดอ้างอิงของรูปนั้นเป็นพิกเซลจอ (ความหนาเส้น · รัศมีจุด · ขนาดรูปทรง)
    แสงฟุ้งจึงโตตามของที่มันห่ออยู่เสมอ ไม่ใช่ค่าคงที่ที่พอย่อแผงแล้วกลืนทั้งเส้น

    คืน [] เมื่อไม่ได้เปิด — ตัวเรียกจึงเขียนเป็นลูปเดียวได้โดยไม่ต้องมี if
    """
    g = max(0.0, min(1.0, float(strength or 0.0)))
    if g <= 0.01 or unit <= 0:
        return []
    return [[rf"\c{colour(col)}&", rf"\3c{colour(col)}&", r"\shad0",
             rf"\bord{unit * bo * g:.2f}", rf"\blur{unit * bl * g:.2f}",
             rf"\alpha{_a(alpha * op * dim)}"]
            for bo, bl, op in GLOW]


def ass_events(data, W, H, man):
    """ทุกบรรทัด Dialogue ของชั้นแผนที่ — ตัวเรียกเอาไปต่อท้าย [Events] ได้เลย

    **ของนิ่งพ่นครั้งเดียว ของที่ขยับพ่นทีละเฟรม** — แผง เส้นทาง หมุด ป้ายชื่อ
    ไม่เปลี่ยนตลอดที่แผงอยู่บนจอ จึงเป็นบรรทัดเดียวที่ยาวเท่าแผง ส่วนคนเดินกับ
    เส้นที่ไล่ตามหลังเปลี่ยนทุกเฟรม  ถ้าพ่นทุกอย่างทีละเฟรมเหมือนกันหมด ไฟล์ ASS
    จะใหญ่ขึ้นสิบเท่าเพื่อวาดสิ่งเดิมซ้ำ ๆ และ libass ต้องแรสเตอร์เส้นทางทั้งเส้น
    ใหม่ทุกเฟรมโดยไม่ได้อะไรกลับมา
    """
    j = data.get("journey") or {}
    if not j.get("enabled"):
        return []

    pts = polyline(j.get("d"))
    rows = [r for r in cues(data, man) if not r.get("orphan")]
    if len(pts) < 2 or not rows:
        return []
    cum = arclen(pts)

    bw, bh = (j.get("box") or [1000.0, 550.0])[:2]
    bw, bh = float(bw) or 1000.0, float(bh) or 550.0
    pw = float(j.get("width") or 0.46) * W          # ความกว้างแผงบนจอ
    k = pw / bw                                     # หน่วย box → หน่วยจอ
    ph = bh * k
    ox = float(j.get("x") or 0.5) * W - pw / 2.0    # มุมบนซ้ายของแผงบนจอ
    oy = float(j.get("y") or 0.5) * H - ph / 2.0

    def tx(p):
        return (ox + p[0] * k, oy + p[1] * k)

    def txs(seq):
        return [tx(p) for p in seq]

    dur = float(j.get("dur") or 3.5)
    tin = max(0.0, float(j.get("in") or 0))
    tout = max(0.0, float(j.get("out") or 0))
    walk = max(0.0, float(j.get("walk") or 0))
    thick = float(j.get("thick") or 7.0) * k
    fig = float(j.get("figure") or 74.0) * k
    pad = float(j.get("pad") or 26.0) * k
    size = max(6, int(round(float(j.get("size") or 34) * k)))
    unit = str(j.get("unit") or "")
    show_dist = bool(j.get("show_dist"))

    c_line = j.get("line") or "#FFFFFF"
    c_trail = j.get("trail") or "#8695A3"
    c_walk = j.get("walker") or "#FF3B30"
    c_core = j.get("core") or "#FFFFFF"
    # glow = 0 เมื่อลุคเป็นแบน — ตัวเดียวคุมทั้งไฟล์ ที่อื่นจึงไม่ต้องถามซ้ำว่า
    # "ลุคไหน *และ* แรงเท่าไร" ซึ่งเป็นคำถามที่ตอบไม่ครบทีเดียวได้ง่ายมาก
    glow = (max(0.0, min(1.0, float(j.get("glow", 0.9) or 0.0)))
            if str(j.get("look") or "map") == "neon" else 0.0)

    def gu(thickness):
        return glow_unit(thickness, W, H)

    # ระยะทางบนเส้นของแต่ละหมุด — คิดครั้งเดียว ใช้ทุกแผง
    s_of = [nearest_s(pts, cum, float(st.get("px") or 0), float(st.get("py") or 0))
            for st in (j.get("stops") or [])]

    ev = []

    def emit(layer, a, b, tags, body):
        """หนึ่งบรรทัดวาดรูป — ปิดโหมด \\p ทุกครั้ง ไม่งั้นบรรทัดถัดไปถูกอ่านเป็นพิกัด"""
        if b - a < 0.02:
            return
        ev.append(f"Dialogue: {layer},{clock(a)},{clock(b)},jrn,,0,0,0,,"
                  "{" + "".join(tags) + r"\p1}" + body + r"{\p0}")

    def draw(layer, a, b, flat, geom, body, col, unit, alpha=1.0,
             core=None, dim=1.0):
        """ของหนึ่งชิ้น — ลุคแบนวาดครั้งเดียว · ลุคนีออนวางฮาโลก่อนแล้วทับด้วยแกน

        รับแท็กสองชุดเพราะสองลุคทาสีคนละท่า: flat คือชุดครบของลุคแบน (ส่งต่อ
        ตรง ๆ จะได้ไฟล์เดิมทุกไบต์เมื่อไม่ได้เปิดนีออน) ส่วน geom คือเฉพาะที่วาง
        ตำแหน่ง/จังหวะ ซึ่งชั้นฟุ้งเอาไปประกอบกับสีของมันเอง

        ทุกชั้นอยู่ layer เดียวกัน ลำดับในไฟล์เป็นตัวตัดสินว่าอะไรทับอะไร —
        ยกขึ้นคนละ layer ไม่ได้เพราะชั้นถัดไปของแผนที่จองเลขต่อกันไว้หมดแล้ว
        """
        if not glow:
            emit(layer, a, b, flat, body)
            return
        for g in glow_layers(col, unit, glow, alpha, dim):
            emit(layer, a, b, geom + g, body)
        emit(layer, a, b, geom + [rf"\c{colour(core or c_core)}&", r"\bord0",
                                  rf"\blur{unit * CORE_BLUR:.2f}",
                                  rf"\alpha{_a(alpha)}"], body)

    base = [r"\an7", r"\pos(0,0)", r"\bord0", r"\shad0"]
    BASE = LAYER

    for r in rows:
        a, b = r["a"], r["b"]
        span = b - a
        if span <= 0.05:
            continue
        i = r["idx"]
        s_to = s_of[i] if i < len(s_of) else cum[-1]
        s_from = s_of[i - 1] if i > 0 else 0.0
        d_to = float(r["dist"])
        # หมุดแรกไม่มีที่มา ตัวเลขจึงนิ่งอยู่ที่ค่าของมันเอง ไม่ใช่วิ่งจากศูนย์
        d_from = d_to if i == 0 else \
            float((j.get("stops") or [])[i - 1].get("dist") or 0)

        # ── ชั้นนิ่ง — แผง · เส้นทางเต็มเส้น · หมุด · ป้ายชื่อ ──
        fade = rf"\fad({int(tin * 1000)},{int(tout * 1000)})"

        if float(j.get("panel") or 0) > 0.01:
            emit(BASE + 0, a, b, base + [fade, rf"\c{colour(j.get('panel_color'))}&",
                                  rf"\alpha{_a(float(j['panel']))}"],
                 rrect(ox - pad, oy - pad, pw + pad * 2, ph + pad * 2, pad * 0.9))

        # เส้นทางทั้งเส้นสีจาง — ส่วนที่เดินผ่านแล้วจะถูกทับด้วยสีสว่างข้างบน
        # ช่วงที่ยังไปไม่ถึงในลุคนีออน = หลอดที่ยังไม่ติดไฟ — แกนเป็นสีเส้นเอง
        # ไม่ใช่ขาว และฮาโลหรี่ลงครึ่งหนึ่ง ไม่งั้นทั้งเส้นสว่างเท่ากันหมดแล้ว
        # "เดินมาถึงไหนแล้ว" ซึ่งเป็นคำถามเดียวของชั้นนี้ก็อ่านไม่ออก
        draw(BASE + 1, a, b, base + [fade, rf"\c{colour(c_trail)}&"],
             base + [fade], stroke(txs(pts), thick),
             c_trail, gu(thick), core=c_trail, dim=0.5)

        # หมุด + ป้ายชื่อ เปิดเผยทีละจุดตามที่ไปถึง — โผล่ครบตั้งแต่แผงแรกแปลว่า
        # แผนที่เล่าตอนจบให้ฟังตั้งแต่นาทีแรก
        dots, labels = [], []
        for q in range(0, i + 1):
            st = (j.get("stops") or [])[q]
            cx, cy = tx((float(st.get("px") or 0), float(st.get("py") or 0)))
            dots.append((st.get("color") or "#E65100", cx, cy))
            lx, ly = tx((float(st.get("lx") or 0), float(st.get("ly") or 0)))
            txt = esc(st.get("label", ""))
            if show_dist and float(st.get("dist") or 0) > 0:
                txt += r"\N" + esc(f"{float(st['dist']):,.0f} {unit}".strip())
            labels.append((st.get("color") or "#FFFFFF", lx, ly, txt, q == i))

        for col, cx, cy in dots:
            draw(BASE + 3, a, b,
                 base + [fade, rf"\c{colour(col)}&",
                         rf"\3c{colour('#FFFFFF')}&", rf"\bord{thick * 0.35:g}"],
                 base + [fade], circle(cx, cy, thick * 0.85),
                 col, gu(thick * 0.85))

        for col, lx, ly, txt, cur in labels:
            tags = [r"\an5", rf"\pos({lx:.0f},{ly:.0f})", fade,
                    rf"\fs{int(size * (1.18 if cur else 1.0))}",
                    rf"\c{colour('#FFFFFF' if cur else '#D8DEE3')}&",
                    rf"\3c{colour('#0B1216')}&", r"\bord2.4", r"\shad0",
                    rf"\b{1 if cur else 0}"]
            if cur:
                tags.append(rf"\3c{colour(col)}&")
            if glow:
                # ป้ายในลุคนีออนต้องเรืองแสงด้วย ไม่งั้นตัวหนังสือขอบดำคมลอยอยู่
                # เหนือเส้นที่ฟุ้ง แล้วอ่านว่าเอาป้ายจากแผนที่คนละใบมาแปะ
                tags += [rf"\3c{colour(col)}&",
                         rf"\bord{2.4 + 2.6 * glow:.2f}", rf"\blur{2.2 * glow:.2f}"]
            ev.append(f"Dialogue: {BASE + 4},{clock(a)},{clock(b)},jrn,,0,0,0,,"
                      "{" + "".join(tags) + "}" + txt)

        # ── ชั้นที่ขยับ — เส้นที่เดินผ่านแล้ว · ตัวคน · ตัวเลขระยะทาง ──
        t_walk_a = min(tin, span)
        t_walk_b = min(tin + walk, span)
        steps = max(1, int(round((t_walk_b - t_walk_a) * WALK_FPS)))

        # ช่วงเดิน — ทีละเฟรม · ช่วงหลังจากนั้น — บรรทัดเดียวยาวถึงจบแผง
        frames = [(t_walk_a + (t_walk_b - t_walk_a) * n / steps,
                   t_walk_a + (t_walk_b - t_walk_a) * (n + 1) / steps,
                   (n + 0.5) / steps) for n in range(steps)]
        if span > t_walk_b + 0.02:
            frames.append((t_walk_b, span, 1.0))

        for t0, t1, prog in frames:
            # ผ่อนหัวท้ายให้ออกตัวและหยุดนุ่ม — เดินความเร็วคงที่แล้วหยุดกึกดู
            # เหมือนภาพค้าง ไม่ใช่เหมือนคนเดินมาถึง
            e = prog * prog * (3.0 - 2.0 * prog)
            s = s_from + (s_to - s_from) * e
            alpha = _envelope((t0 + t1) / 2.0, span, tin, tout)
            here = point_at(pts, cum, s)

            # เส้นที่เดินผ่านมาแล้ว = จุดทั้งหมดที่ระยะทาง ≤ s แล้วปิดท้ายด้วย
            # ตำแหน่งปัจจุบัน ไม่งั้นปลายเส้นจะกระตุกทีละจุดแทนที่จะไหลตามคน
            done = [p for p, cs in zip(pts, cum) if cs <= s] + [here]
            if len(done) >= 2:
                # หนากว่าเส้นพื้นเล็กน้อย — สีอย่างเดียวแยกไม่ค่อยออกบนฟุตเทจ
                # ป่าที่มีทั้งจุดสว่างและจุดมืดอยู่ใต้แผงพร้อมกัน
                draw(BASE + 2, a + t0, a + t1,
                     base + [rf"\c{colour(c_line)}&", rf"\alpha{_a(alpha)}"],
                     base, stroke(txs(done), thick * 1.15),
                     c_line, gu(thick * 1.15), alpha=alpha)

            fx_, fy_ = tx(here)
            draw(BASE + 5, a + t0, a + t1,
                 base + [rf"\c{colour(c_walk)}&", rf"\3c{colour('#FFFFFF')}&",
                         rf"\bord{max(1.0, thick * 0.22):g}", rf"\alpha{_a(alpha)}"],
                 base,
                 walker(fx_, fy_ + fig * 0.06, fig, prog * math.pi * 6.0, lean=0.35),
                 c_walk, gu(max(1.0, thick * 0.22) * 2.2), alpha=alpha)

            if show_dist:
                # ตัวเลขระยะทางอยู่ *มุมบนขวาของแผง* ไม่ใช่ลอยตามคนเดิน
                #
                # ตอนแรกให้มันเกาะหัวคนเดินเพราะดูเป็นธรรมชาติกว่า แต่ป้ายชื่อหมุด
                # ถูกวางไว้เหนือ/ใต้เส้นตรงจุดนั้นพอดี (คนวาด SVG จัดมาแบบนั้น
                # เพื่อไม่ให้ป้ายทับกันเอง) ตัวเลขจึงไปทับป้ายทุกครั้งที่เดินถึง
                # จุดหมาย ซึ่งเป็นวินาทีเดียวที่คนดูอยากอ่านทั้งสองอย่าง
                dist = d_from + (d_to - d_from) * e
                ntags = [rf"\3c{colour(c_line)}&",
                         rf"\bord{2.6 + 2.6 * glow:.2f}",
                         rf"\blur{2.2 * glow:.2f}"] if glow else []
                ev.append(
                    f"Dialogue: {BASE + 5},{clock(a + t0)},{clock(a + t1)},jrn,,0,0,0,,"
                    + "{" + "".join([
                        r"\an9", rf"\pos({ox + pw:.0f},{oy - pad * 0.1:.0f})",
                        rf"\fs{int(size * 1.15)}", rf"\c{colour('#FFFFFF')}&",
                        rf"\3c{colour('#0B1216')}&", r"\bord2.6", r"\shad0", r"\b1",
                        rf"\alpha{_a(alpha)}"] + ntags) + "}"
                    + esc(f"{dist:,.0f} {unit}".strip()))

    return ev


def style_line(j):
    """สไตล์ ASS ของชั้นนี้ — แยกจากสไตล์ข้อความเพราะฟอนต์/ขนาดคนละเรื่องกัน"""
    font = str((j or {}).get("font") or "Sukhumvit Set")
    return ",".join([
        "Style: jrn", font, "40",
        colour("#FFFFFF"), colour("#FFFFFF"), colour("#000000"), colour("#000000"),
        "0", "0", "0", "0", "100", "100", "0", "0", "1", "2", "0", "5",
        "0", "0", "0", "1",
    ])


def summary(data, man):
    """สรุปให้หน้าเว็บ — จุดไหนโผล่วินาทีที่เท่าไร จุดไหนกำพร้า"""
    j = data.get("journey") or {}
    pts = polyline(j.get("d"))
    rows = cues(data, man) if j.get("stops") else []
    return {
        "enabled": bool(j.get("enabled")),
        "stops": rows,
        "orphans": sum(1 for r in rows if r.get("orphan")),
        "points": len(pts),
        "length": round(arclen(pts)[-1], 1) if len(pts) > 1 else 0.0,
    }
