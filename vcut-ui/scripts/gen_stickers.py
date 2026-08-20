"""วาดสติกเกอร์ตัวอย่าง 134 แบบลง public/stickers/ — รันซ้ำได้ ผลลัพธ์เหมือนเดิมทุกครั้ง

    python3 scripts/gen_stickers.py

ทำไมถึงวาดเอง ไม่ใช่โหลดชุดสำเร็จรูปมาแปะ: ไฟล์ที่ติดมากับ UI ต้องแจกจ่ายไปกับ
โปรเจกต์ได้โดยไม่ต้องตามเรื่องลิขสิทธิ์ของใคร และต้องแก้สี/ทรงทีเดียวทั้งชุดได้
เมื่อธีมเปลี่ยน — ของที่วาดจากสคริปต์ทำได้ทั้งสองอย่าง

เอนจินรับเฉพาะ .png/.jpg/.jpeg/.webp (fx.IMAGE_EXT) — SVG เข้าไม่ได้ ทุกไฟล์จึง
เป็น PNG โปร่งใส วาดที่ SS เท่าของขนาดจริงแล้วย่อลงด้วย LANCZOS (supersampling)
ขอบโค้งจึงเนียนโดยไม่ต้องพึ่งไลบรารีวาดเวกเตอร์

เงาอ่อน ๆ ใต้ทุกชิ้นไม่ใช่การตกแต่ง — สติกเกอร์ขาว/เหลืองบนฟุตเทจสว่าง (ท้องฟ้า
หิมะ ทราย) จะจมหายถ้าไม่มีอะไรคั่น เงาทำให้ชิ้นเดียวกันอ่านออกทั้งบนฉากมืดและสว่าง
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "stickers"
SS = 4                      # ตัวคูณ supersampling

WHITE = (255, 255, 255, 255)
YEL = (255, 212, 0, 255)
RED = (255, 59, 48, 255)
INK = (18, 20, 24, 255)
PLATE = (0, 0, 0, 150)
CLEAR = (0, 0, 0, 0)

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
FONT = next((f for f in FONTS if Path(f).exists()), None)


def ring_pts(cx, cy, r, n=180):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)]


def rot_pts(pts, cx, cy, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c)
            for x, y in pts]


def bez(p0, p1, p2, p3, n=48):
    """จุดบนเส้นโค้งเบซิเยร์ลูกบาศก์ — Pillow วาดโค้งเองไม่ได้ ต้องแปลงเป็นเส้นตรงสั้น ๆ"""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return out


class Art:
    """ผืนวาดที่รับพิกัดเป็น "ขนาดจริง" แล้วคูณ SS ให้เอง — สูตรในแต่ละชิ้นจึงอ่านง่าย"""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w * SS, h * SS), CLEAR)
        self.d = ImageDraw.Draw(self.im)

    def _box(self, b):
        return [v * SS for v in b]

    def _pts(self, p):
        return [(x * SS, y * SS) for x, y in p]

    def rrect(self, box, r, fill=None, outline=None, width=0):
        self.d.rounded_rectangle(self._box(box), radius=r * SS, fill=fill,
                                 outline=outline, width=int(width * SS))

    def rect(self, box, fill=None):
        self.d.rectangle(self._box(box), fill=fill)

    def ellipse(self, box, fill=None, outline=None, width=0):
        self.d.ellipse(self._box(box), fill=fill, outline=outline,
                       width=int(width * SS))

    def circle(self, cx, cy, r, fill=None, outline=None, width=0):
        self.ellipse((cx - r, cy - r, cx + r, cy + r), fill, outline, width)

    def pie(self, box, a, b, fill=None):
        self.d.pieslice(self._box(box), a, b, fill=fill)

    def poly(self, pts, fill=None, outline=None, width=0):
        self.d.polygon(self._pts(pts), fill=fill, outline=outline,
                       width=int(width * SS))

    def line(self, pts, fill, width, cap=True):
        self.d.line(self._pts(pts), fill=fill, width=int(width * SS), joint="curve")
        if cap:                       # Pillow ไม่มีปลายเส้นมน — แต้มวงกลมปิดหัวท้ายเอง
            for x, y in (pts[0], pts[-1]):
                self.circle(x, y, width / 2, fill=fill)

    def text(self, xy, s, size, fill, anchor="mm", track=0):
        f = ImageFont.truetype(FONT, int(size * SS))
        if not track:
            self.d.text((xy[0] * SS, xy[1] * SS), s, font=f, fill=fill, anchor=anchor)
            return
        # ระยะห่างตัวอักษร: วาดทีละตัวเอง เพราะ Pillow ไม่มี letter-spacing
        widths = [self.d.textlength(c, font=f) for c in s]
        total = sum(widths) + track * SS * (len(s) - 1)
        # anchor แนวนอนต้องคิดเอง — ตัวจัดตำแหน่งของ Pillow ใช้ไม่ได้เมื่อวาดทีละตัว
        x = {"l": xy[0] * SS, "r": xy[0] * SS - total}.get(
            anchor[0], xy[0] * SS - total / 2)
        for c, w in zip(s, widths):
            self.d.text((x, xy[1] * SS), c, font=f, fill=fill, anchor="lm")
            x += w + track * SS

    def arc(self, box, a, b, fill, width):
        self.d.arc(self._box(box), a, b, fill=fill, width=int(width * SS))

    def drop(self, cx, cy, h, fill=WHITE):
        """หยดน้ำ — หัวแหลมท้ายมน ใช้ทั้งน้ำตา เหงื่อ และเม็ดฝน"""
        w = h * 0.66
        left = bez((cx, cy - h / 2), (cx - w * 0.52, cy + h * 0.04),
                   (cx - w * 0.56, cy + h * 0.5), (cx, cy + h / 2))
        right = bez((cx, cy + h / 2), (cx + w * 0.56, cy + h * 0.5),
                    (cx + w * 0.52, cy + h * 0.04), (cx, cy - h / 2))
        self.poly(left + right, fill=fill)

    def oval(self, cx, cy, rx, ry, deg=0, fill=None):
        """วงรีที่เอียงได้ — Pillow วาดวงรีเอียงไม่ได้ ต้องปั้นเป็นรูปหลายเหลี่ยมเอง"""
        pts = [(cx + rx * math.cos(2 * math.pi * i / 72),
                cy + ry * math.sin(2 * math.pi * i / 72)) for i in range(72)]
        self.poly(rot_pts(pts, cx, cy, deg), fill=fill)

    def dash(self, pts, fill, width, on=5, off=4):
        """เส้นประบนเส้นโค้ง — รับจุดที่สุ่มถี่ ๆ มาแล้ววาดเว้นเป็นช่วง ๆ"""
        i = 0
        while i < len(pts) - 1:
            seg = pts[i:i + on + 1]
            if len(seg) > 1:
                self.line(seg, fill, width, cap=False)
            i += on + off

    def head(self, pts, size, fill):
        """สามเหลี่ยมหัวลูกศรที่ปลายเส้น — หันตามทิศของท่อนสุดท้ายเสมอ"""
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
        a = math.atan2(y1 - y0, x1 - x0)
        c, sn = math.cos(a), math.sin(a)
        bx, by = x1 - size * 0.45 * c, y1 - size * 0.45 * sn
        tip = (x1 + size * 0.55 * c, y1 + size * 0.55 * sn)
        self.poly([tip, (bx - size * 0.5 * sn, by + size * 0.5 * c),
                   (bx + size * 0.5 * sn, by - size * 0.5 * c)], fill=fill)

    def star(self, cx, cy, r, n=5, inner=0.42, fill=None, rot=-90):
        pts = []
        for i in range(n * 2):
            rad = r if i % 2 == 0 else r * inner
            a = math.radians(rot + i * 180 / n)
            pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
        self.poly(pts, fill=fill)

    def sparkle(self, cx, cy, r, fill=WHITE):
        k = r * 0.16
        self.poly([(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
                   (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)],
                  fill=fill)

    def heart(self, cx, cy, w, fill=RED):
        h = w * 0.92
        top = cy - h * 0.28
        left = bez((cx, cy + h * 0.5), (cx - w * 0.62, cy - h * 0.05),
                   (cx - w * 0.5, top - h * 0.42), (cx, top))
        right = bez((cx, top), (cx + w * 0.5, top - h * 0.42),
                    (cx + w * 0.62, cy - h * 0.05), (cx, cy + h * 0.5))
        self.poly(left + right, fill=fill)

    def flame(self, cx, cy, h, fill=RED):
        w = h * 0.62
        left = bez((cx, cy - h / 2), (cx - w * 0.62, cy - h * 0.1),
                   (cx - w * 0.52, cy + h * 0.36), (cx, cy + h / 2))
        right = bez((cx, cy + h / 2), (cx + w * 0.52, cy + h * 0.36),
                    (cx + w * 0.55, cy - h * 0.02), (cx, cy - h / 2))
        self.poly(left + right, fill=fill)

    def cloud(self, cx, cy, w, fill=WHITE):
        h = w * 0.62
        self.circle(cx - w * 0.26, cy + h * 0.06, h * 0.34, fill=fill)
        self.circle(cx + w * 0.02, cy - h * 0.10, h * 0.44, fill=fill)
        self.circle(cx + w * 0.29, cy + h * 0.08, h * 0.32, fill=fill)
        self.rrect((cx - w * 0.40, cy + h * 0.02, cx + w * 0.40, cy + h * 0.40),
                   h * 0.20, fill=fill)

    def save(self, name, shadow=True):
        im = self.im
        if shadow:
            a = im.split()[3].filter(ImageFilter.GaussianBlur(4 * SS))
            sh = Image.new("RGBA", im.size, CLEAR)
            sh.putalpha(a.point(lambda v: int(v * 0.5)))
            base = Image.new("RGBA", im.size, CLEAR)
            base.paste(sh, (0, int(3 * SS)))
            im = Image.alpha_composite(base, im)
        im = im.resize((self.w, self.h), Image.LANCZOS)
        OUT.mkdir(parents=True, exist_ok=True)
        im.save(OUT / name, optimize=True)
        return name


# ── ป้าย / แบดจ์ ───────────────────────────────────────────────────────────
def st_new():
    a = Art(640, 256)
    a.rrect((14, 14, 626, 242), 114, fill=YEL)
    a.text((320, 130), "NEW", 132, INK, track=6)
    return a.save("st-new.png")


def st_live():
    a = Art(700, 256)
    a.rrect((14, 14, 686, 242), 114, fill=RED)
    a.circle(152, 128, 32, fill=WHITE)
    a.text((214, 130), "LIVE", 116, WHITE, anchor="lm", track=6)
    return a.save("st-live.png")


def st_4k():
    a = Art(512, 256)
    a.rrect((14, 14, 498, 242), 44, fill=WHITE)
    a.text((256, 112), "4K", 138, INK, track=4)
    a.rrect((150, 186, 362, 208), 11, fill=RED)
    return a.save("st-4k.png")


def st_hot():
    a = Art(620, 256)
    a.rrect((14, 14, 606, 242), 114, fill=RED)
    a.flame(132, 128, 148, fill=YEL)
    a.text((216, 130), "HOT", 112, WHITE, anchor="lm", track=6)
    return a.save("st-hot.png")


def st_ep():
    a = Art(620, 256)
    a.rrect((14, 14, 606, 242), 114, fill=WHITE)
    a.rrect((14, 14, 300, 242), 114, fill=RED)
    a.rect((186, 14, 300, 242), fill=RED)
    a.text((160, 130), "EP", 100, WHITE, track=4)
    a.text((450, 130), "01", 124, INK, track=4)
    return a.save("st-ep.png")


# ── ลูกศร / ชี้จุด ─────────────────────────────────────────────────────────
def st_arrow_r():
    a = Art(512, 256)
    a.poly([(24, 90), (300, 90), (300, 26), (490, 128), (300, 230), (300, 166),
            (24, 166)], fill=YEL)
    return a.save("st-arrow-r.png")


def st_arrow_curve():
    a = Art(512, 512)
    curve = bez((78, 60), (96, 320), (232, 428), (386, 428))
    a.line(curve, WHITE, 34)
    a.head(curve, 132, WHITE)
    return a.save("st-arrow-curve.png")


def st_pointer():
    a = Art(384, 384)
    a.poly([(28, 54), (356, 54), (192, 344)], fill=RED)
    return a.save("st-pointer.png")


def st_ring():
    a = Art(512, 512)
    a.ellipse((26, 40, 486, 472), outline=YEL, width=24)
    return a.save("st-ring.png")


def st_zigzag():
    a = Art(512, 512)
    zig = [(72, 54), (306, 176), (146, 296), (348, 400)]
    a.line(zig, WHITE, 26)
    a.head(zig, 108, WHITE)
    return a.save("st-zigzag.png")


# ── กรอบ / แถบ ─────────────────────────────────────────────────────────────
def st_lower3():
    a = Art(1280, 256)
    a.rrect((40, 18, 1240, 150), 14, fill=WHITE)
    a.rrect((40, 18, 108, 150), 14, fill=RED)
    a.rect((80, 18, 108, 150), fill=RED)
    a.rrect((40, 162, 780, 222), 12, fill=YEL)
    return a.save("st-lower3.png")


def st_strip():
    a = Art(1280, 192)
    a.rrect((0, 18, 1280, 174), 10, fill=PLATE)
    a.rect((0, 18, 24, 174), fill=YEL)
    return a.save("st-strip.png", shadow=False)


def st_corner():
    a = Art(1024, 576)
    L, w, m = 150, 14, 26
    for cx, cy, sx, sy in ((m, m, 1, 1), (1024 - m, m, -1, 1),
                           (m, 576 - m, 1, -1), (1024 - m, 576 - m, -1, -1)):
        a.line([(cx, cy + sy * L), (cx, cy), (cx + sx * L, cy)], WHITE, w, cap=False)
    return a.save("st-corner.png")


def st_film():
    a = Art(1024, 576)
    for y0 in (0, 506):
        a.rect((0, y0, 1024, y0 + 70), fill=(12, 12, 14, 235))
        for i in range(10):
            x = 26 + i * 100
            a.rrect((x, y0 + 16, x + 58, y0 + 54), 10, fill=(240, 240, 240, 235))
    return a.save("st-film.png", shadow=False)


def st_banner():
    a = Art(900, 320)
    a.poly([(18, 66), (150, 66), (150, 254), (18, 254), (78, 160)], fill=RED)
    a.poly([(882, 66), (750, 66), (750, 254), (882, 254), (822, 160)], fill=RED)
    a.rrect((120, 40, 780, 280), 16, fill=YEL)
    a.rrect((150, 70, 750, 250), 10, outline=INK, width=6)
    return a.save("st-banner.png")


# ── รีแอ็กชัน ──────────────────────────────────────────────────────────────
def st_heart():
    a = Art(512, 512)
    a.heart(256, 252, 440)
    return a.save("st-heart.png")


def st_star():
    a = Art(512, 512)
    a.star(256, 262, 232, fill=YEL)
    return a.save("st-star.png")


def st_fire():
    a = Art(448, 512)
    a.flame(224, 262, 452, fill=RED)
    a.flame(224, 316, 264, fill=YEL)
    return a.save("st-fire.png")


def st_sparkle():
    a = Art(512, 512)
    a.sparkle(206, 232, 178)
    a.sparkle(396, 128, 96, fill=YEL)
    a.sparkle(370, 386, 74)
    return a.save("st-sparkle.png")


def st_wow():
    a = Art(640, 512)
    a.star(320, 254, 254, n=12, inner=0.76, fill=YEL, rot=-105)
    a.text((320, 258), "WOW", 118, INK, track=4)
    return a.save("st-wow.png")


def st_check():
    a = Art(512, 512)
    a.circle(256, 256, 232, fill=WHITE)
    a.line([(146, 264), (226, 344), (368, 172)], RED, 44)
    return a.save("st-check.png")


# ── โซเชียล ────────────────────────────────────────────────────────────────
def st_subscribe():
    a = Art(768, 224)
    a.rrect((14, 14, 754, 210), 26, fill=RED)
    a.text((384, 114), "SUBSCRIBE", 82, WHITE, track=5)
    return a.save("st-subscribe.png")


def st_like():
    a = Art(512, 224)
    a.rrect((14, 14, 498, 210), 98, fill=WHITE)
    a.heart(136, 108, 130)
    a.text((320, 112), "LIKE", 82, INK, track=4)
    return a.save("st-like.png")


def st_comment():
    a = Art(512, 448)
    a.rrect((24, 24, 488, 336), 52, fill=WHITE)
    a.poly([(122, 320), (250, 320), (146, 434)], fill=WHITE)
    for x in (160, 256, 352):
        a.circle(x, 180, 24, fill=INK)
    return a.save("st-comment.png")


def st_share():
    a = Art(512, 512)
    a.line([(150, 262), (368, 148)], WHITE, 22)
    a.line([(150, 262), (368, 376)], WHITE, 22)
    a.circle(140, 262, 62, fill=WHITE)
    a.circle(372, 142, 58, fill=YEL)
    a.circle(372, 382, 58, fill=YEL)
    return a.save("st-share.png")


def st_bell():
    a = Art(448, 512)
    a.pie((72, 96, 376, 400), 180, 360, fill=YEL)
    a.rect((72, 248, 376, 386), fill=YEL)
    a.rrect((40, 372, 408, 428), 26, fill=YEL)
    a.circle(224, 462, 38, fill=YEL)
    a.circle(224, 88, 30, fill=YEL)
    a.circle(370, 116, 52, fill=RED)
    return a.save("st-bell.png")


def st_hashtag():
    a = Art(512, 512)
    a.text((256, 268), "#", 430, WHITE)
    return a.save("st-hashtag.png")


# ── เดินทาง ────────────────────────────────────────────────────────────────
def st_pin():
    a = Art(384, 512)
    a.circle(192, 194, 162, fill=RED)
    a.poly([(84, 292), (300, 292), (192, 486)], fill=RED)
    a.circle(192, 190, 62, fill=WHITE)
    return a.save("st-pin.png")


def st_compass():
    a = Art(512, 512)
    a.circle(256, 256, 230, outline=WHITE, width=26)
    a.poly([(256, 92), (302, 256), (256, 302), (210, 256)], fill=RED)
    a.poly([(256, 420), (210, 256), (256, 210), (302, 256)], fill=WHITE)
    a.circle(256, 256, 18, fill=INK)
    return a.save("st-compass.png")


def st_mountain():
    a = Art(640, 448)
    a.circle(486, 128, 74, fill=YEL)
    a.poly([(32, 402), (238, 96), (372, 286), (438, 196), (612, 402)], fill=WHITE)
    a.poly([(190, 162), (238, 96), (288, 164), (250, 148), (222, 172)], fill=(200, 214, 232, 255))
    return a.save("st-mountain.png")


def st_route():
    a = Art(640, 384)
    pts = bez((96, 306), (196, 150), (400, 336), (546, 116))
    step = 5                       # ประ: วาดเว้นช่วงจากจุดที่สุ่มบนเส้นโค้ง
    for i in range(0, len(pts) - step, step * 2):
        a.line(pts[i:i + step + 1], YEL, 18, cap=False)
    a.circle(96, 306, 30, fill=WHITE)
    a.circle(96, 306, 13, fill=RED)
    a.circle(546, 116, 44, fill=RED)
    a.poly([(514, 148), (578, 148), (546, 208)], fill=RED)
    a.circle(546, 114, 17, fill=WHITE)
    return a.save("st-route.png")


def st_plane():
    a = Art(512, 512)
    a.poly([(56, 278), (470, 56), (302, 470), (238, 320)], fill=WHITE)
    a.poly([(238, 320), (470, 56), (302, 470)], fill=(206, 216, 230, 255))
    return a.save("st-plane.png")


def st_camera():
    a = Art(576, 448)
    a.rrect((170, 62, 352, 132), 22, fill=WHITE)
    a.rrect((36, 112, 540, 408), 48, fill=WHITE)
    a.circle(288, 262, 96, fill=INK)
    a.circle(288, 262, 66, fill=RED)
    a.circle(288, 262, 28, fill=WHITE)
    a.circle(476, 172, 22, fill=YEL)
    return a.save("st-camera.png")


# ── ตัวเลข ─────────────────────────────────────────────────────────────────
def st_num(n):
    a = Art(384, 384)
    a.circle(192, 192, 176, fill=YEL)
    a.circle(192, 192, 176, outline=WHITE, width=16)
    a.text((192, 196), str(n), 216, INK)
    return a.save(f"st-no{n}.png")


# ── อากาศ / เวลา ───────────────────────────────────────────────────────────
def st_sun():
    a = Art(512, 512)
    a.circle(256, 256, 116, fill=YEL)
    for i in range(8):
        ang = math.radians(i * 45)
        c, s = math.cos(ang), math.sin(ang)
        a.line([(256 + 148 * c, 256 + 148 * s), (256 + 218 * c, 256 + 218 * s)],
               YEL, 26)
    return a.save("st-sun.png")


def st_cloud():
    a = Art(576, 384)
    a.cloud(288, 186, 480)
    return a.save("st-cloud.png")


def st_rain():
    a = Art(576, 448)
    a.cloud(288, 156, 460)
    for x in (168, 288, 408):
        a.poly(bez((x, 300), (x - 34, 356), (x - 30, 414), (x, 414))
               + bez((x, 414), (x + 30, 414), (x + 34, 356), (x, 300)), fill=YEL)
    return a.save("st-rain.png")


def st_thermo():
    a = Art(320, 512)
    a.rrect((118, 34, 202, 372), 42, fill=WHITE)
    a.circle(160, 396, 78, fill=WHITE)
    a.circle(160, 396, 52, fill=RED)
    a.rrect((142, 180, 178, 386), 18, fill=RED)
    return a.save("st-thermo.png")


def st_moon():
    a = Art(448, 512)
    a.circle(214, 246, 176, fill=WHITE)
    a.circle(300, 186, 156, fill=CLEAR)   # เจาะรูให้เป็นเสี้ยว — วาดทับด้วยสีใสตรง ๆ
    a.sparkle(366, 372, 44, fill=YEL)
    a.sparkle(392, 148, 30, fill=YEL)
    return a.save("st-moon.png")


def st_clock():
    a = Art(512, 512)
    a.circle(256, 256, 230, fill=WHITE)
    a.circle(256, 256, 230, outline=RED, width=20)
    a.line([(256, 256), (256, 118)], INK, 24)
    a.line([(256, 256), (362, 302)], INK, 24)
    a.circle(256, 256, 20, fill=INK)
    return a.save("st-clock.png")



# ── ลูกศร / ชี้จุด (เพิ่ม) ──────────────────────────────────────────────────
def st_arrow_l():
    a = Art(512, 256)
    a.poly(rot_pts([(24, 90), (300, 90), (300, 26), (490, 128), (300, 230),
                    (300, 166), (24, 166)], 256, 128, 180), fill=YEL)
    return a.save("st-arrow-l.png")


def st_arrow_up():
    a = Art(256, 512)
    a.poly([(90, 488), (90, 212), (26, 212), (128, 22), (230, 212), (166, 212),
            (166, 488)], fill=YEL)
    return a.save("st-arrow-up.png")


def st_arrow_down():
    a = Art(256, 512)
    a.poly([(90, 24), (90, 300), (26, 300), (128, 490), (230, 300), (166, 300),
            (166, 24)], fill=YEL)
    return a.save("st-arrow-down.png")


def st_cursor():
    a = Art(320, 448)
    p = [(38, 26), (38, 336), (114, 264), (162, 380), (222, 354), (172, 240),
         (272, 236)]
    a.poly(p, fill=WHITE)
    a.poly(p, outline=INK, width=9)
    return a.save("st-cursor.png")


def st_arrow_dashed():
    a = Art(560, 256)
    a.dash([(x, 128) for x in range(36, 432, 4)], WHITE, 20, on=10, off=7)
    a.head([(400, 128), (452, 128)], 128, WHITE)
    return a.save("st-arrow-dashed.png")


def st_arrow_u():
    a = Art(512, 448)
    curve = bez((100, 414), (100, 122), (420, 106), (420, 300))
    a.line(curve, WHITE, 30)
    a.head(curve, 124, WHITE)
    return a.save("st-arrow-u.png")


def st_ring_dash():
    a = Art(512, 512)
    a.dash(ring_pts(256, 256, 224), YEL, 22, on=7, off=6)
    return a.save("st-ring-dash.png")


def st_underline():
    a = Art(640, 180)
    a.line(bez((40, 118), (220, 66), (420, 78), (600, 100)), YEL, 36)
    return a.save("st-underline.png")


# ── กรอบ / แถบ (เพิ่ม) ─────────────────────────────────────────────────────
def st_lower3_dark():
    a = Art(1280, 256)
    a.rrect((40, 18, 1240, 150), 14, fill=(16, 18, 22, 232))
    a.rect((40, 18, 76, 150), fill=YEL)
    a.rrect((40, 162, 620, 214), 12, fill=(16, 18, 22, 200))
    return a.save("st-lower3-dark.png")


def st_tag():
    a = Art(720, 240)
    a.poly([(20, 20), (566, 20), (700, 120), (566, 220), (20, 220)], fill=WHITE)
    a.circle(96, 120, 26, fill=RED)
    return a.save("st-tag.png")


def st_frame_round():
    a = Art(1024, 576)
    a.rrect((18, 18, 1006, 558), 38, outline=WHITE, width=14)
    return a.save("st-frame-round.png")


def st_frame_dash():
    a = Art(1024, 576)
    top = [(x, 26) for x in range(26, 999, 4)]
    bot = [(x, 550) for x in range(26, 999, 4)]
    left = [(26, y) for y in range(26, 551, 4)]
    right = [(998, y) for y in range(26, 551, 4)]
    for side in (top, bot, left, right):
        a.dash(side, WHITE, 12, on=10, off=7)
    return a.save("st-frame-dash.png")


def st_scrim():
    """แถบไล่เฉดดำที่ขอบล่าง — รองซับ/ข้อความให้อ่านออกบนฉากสว่างโดยไม่บังภาพ"""
    a = Art(1280, 360)
    h = a.h * SS
    g = Image.new("L", (1, h))
    g.putdata([int(215 * (i / (h - 1)) ** 1.7) for i in range(h)])
    lay = Image.new("RGBA", a.im.size, (0, 0, 0, 255))
    lay.putalpha(g.resize(a.im.size))
    a.im = Image.alpha_composite(a.im, lay)
    return a.save("st-scrim.png", shadow=False)


def st_polaroid():
    a = Art(720, 800)
    a.rrect((0, 0, 720, 800), 18, fill=WHITE)
    a.rect((44, 44, 676, 596), fill=CLEAR)     # เจาะช่องภาพให้ทะลุถึงฟุตเทจ
    return a.save("st-polaroid.png")


def st_title_plate():
    a = Art(1000, 340)
    a.rrect((0, 56, 1000, 284), 12, fill=(10, 12, 16, 205))
    a.rrect((92, 96, 908, 106), 5, fill=WHITE)
    a.rrect((92, 236, 500, 246), 5, fill=YEL)
    return a.save("st-title-plate.png", shadow=False)


# ── รีแอ็กชัน (เพิ่ม) ───────────────────────────────────────────────────────
def st_thumbup():
    a = Art(448, 512)
    a.rrect((150, 66, 254, 274), 52, fill=WHITE)      # นิ้วโป้ง
    a.rrect((120, 232, 372, 472), 40, fill=WHITE)     # กำมือ
    a.rrect((36, 268, 108, 470), 24, fill=WHITE)      # ข้อมือ
    for y in (322, 392):                               # ร่องนิ้ว = เจาะให้โปร่ง
        a.line([(238, y), (348, y)], CLEAR, 10, cap=False)
    return a.save("st-thumbup.png")


def st_hundred():
    a = Art(560, 320)
    a.text((280, 120), "100", 200, RED, track=4)
    a.rrect((96, 240, 464, 258), 9, fill=RED)
    a.rrect((96, 276, 464, 294), 9, fill=RED)
    return a.save("st-hundred.png")


def st_laugh():
    a = Art(512, 512)
    a.circle(256, 256, 232, fill=YEL)
    a.pie((150, 180, 362, 392), 20, 160, fill=INK)
    a.circle(188, 206, 28, fill=INK)
    a.circle(324, 206, 28, fill=INK)
    return a.save("st-laugh.png")


def st_shock():
    a = Art(512, 512)
    a.circle(256, 256, 232, fill=YEL)
    for x in (186, 326):
        a.circle(x, 202, 44, fill=WHITE)
        a.circle(x, 206, 22, fill=INK)
    a.ellipse((214, 300, 298, 408), fill=INK)
    return a.save("st-shock.png")


def st_question():
    a = Art(448, 448)
    a.circle(224, 224, 210, fill=WHITE)
    a.text((224, 228), "?", 268, RED)
    return a.save("st-question.png")


def st_warning():
    a = Art(512, 448)
    a.poly([(256, 26), (500, 420), (12, 420)], fill=YEL)
    a.text((256, 300), "!", 210, INK)
    return a.save("st-warning.png")


def st_cross():
    a = Art(512, 512)
    a.circle(256, 256, 232, fill=WHITE)
    a.line([(168, 168), (344, 344)], RED, 44)
    a.line([(344, 168), (168, 344)], RED, 44)
    return a.save("st-cross.png")


def st_crown():
    a = Art(576, 448)
    a.poly([(56, 384), (56, 132), (168, 250), (288, 74), (408, 250), (520, 132),
            (520, 384)], fill=YEL)
    a.rrect((46, 356, 530, 428), 22, fill=YEL)
    for x, y in ((56, 132), (288, 74), (520, 132)):
        a.circle(x, y, 26, fill=RED)
    return a.save("st-crown.png")


# ── เดินทาง (เพิ่ม) ─────────────────────────────────────────────────────────
def st_suitcase():
    a = Art(576, 512)
    a.rrect((222, 52, 354, 168), 26, outline=WHITE, width=24)
    a.rrect((52, 140, 524, 470), 44, fill=WHITE)
    a.rect((52, 250, 524, 306), fill=RED)
    a.circle(470, 200, 22, fill=YEL)
    return a.save("st-suitcase.png")


def st_tent():
    a = Art(640, 448)
    a.poly([(36, 402), (320, 54), (604, 402)], fill=WHITE)
    a.poly([(320, 138), (406, 402), (234, 402)], fill=(20, 22, 28, 255))
    a.rrect((20, 388, 620, 424), 16, fill=YEL)
    return a.save("st-tent.png")


def st_coffee():
    a = Art(576, 512)
    a.ellipse((372, 200, 524, 352), outline=WHITE, width=26)
    a.poly([(112, 176), (428, 176), (388, 434), (152, 434)], fill=WHITE)
    a.rrect((78, 434, 462, 480), 22, fill=WHITE)
    for x in (200, 270, 340):
        a.line(bez((x, 140), (x - 34, 106), (x + 34, 76), (x, 40)), YEL, 14)
    return a.save("st-coffee.png")


def st_food():
    a = Art(512, 512)
    for x in (108, 158, 208):                      # ส้อม
        a.rrect((x - 14, 48, x + 14, 176), 12, fill=WHITE)
    a.rrect((104, 150, 212, 214), 24, fill=WHITE)
    a.rrect((140, 196, 176, 470), 16, fill=WHITE)
    a.ellipse((298, 48, 428, 236), fill=WHITE)     # ช้อน
    a.rrect((346, 196, 382, 470), 16, fill=WHITE)
    return a.save("st-food.png")


def st_car():
    a = Art(704, 448)
    a.poly([(168, 248), (244, 130), (470, 130), (556, 248)], fill=WHITE)
    a.rrect((40, 232, 664, 366), 46, fill=WHITE)
    a.poly([(206, 232), (258, 162), (338, 162), (338, 232)], fill=(24, 28, 36, 255))
    a.poly([(372, 162), (452, 162), (512, 232), (372, 232)], fill=(24, 28, 36, 255))
    for x in (204, 500):
        a.circle(x, 372, 66, fill=(24, 28, 36, 255))
        a.circle(x, 372, 28, fill=WHITE)
    return a.save("st-car.png")


def st_flag():
    a = Art(448, 512)
    a.rrect((92, 34, 130, 486), 18, fill=WHITE)
    a.poly([(130, 62), (398, 146), (130, 230)], fill=RED)
    a.ellipse((44, 452, 180, 496), fill=WHITE)
    return a.save("st-flag.png")


def st_sunset():
    a = Art(640, 448)
    a.circle(320, 252, 156, fill=YEL)
    for i, (w, y) in enumerate(((250, 330), (200, 372), (140, 414))):
        a.line(bez((320 - w, y), (320 - w / 2, y - 16), (320 + w / 2, y + 16),
                   (320 + w, y)), WHITE, 20)
    return a.save("st-sunset.png")



# ── เดินทาง (เพิ่มรอบสอง) ───────────────────────────────────────────────────
def st_backpack():
    a = Art(512, 576)
    a.rrect((196, 78, 316, 186), 40, outline=WHITE, width=22)
    a.rrect((56, 148, 456, 542), 62, fill=WHITE)
    a.rrect((56, 148, 456, 316), 62, fill=RED)
    a.rrect((146, 366, 366, 502), 32, fill=YEL)
    return a.save("st-backpack.png")


def st_map():
    a = Art(640, 448)
    a.poly([(28, 116), (220, 56), (420, 126), (612, 66), (612, 376),
            (420, 436), (220, 366), (28, 426)], fill=WHITE)
    a.line([(220, 56), (220, 366)], (196, 202, 214, 255), 6, cap=False)
    a.line([(420, 126), (420, 436)], (196, 202, 214, 255), 6, cap=False)
    a.dash(bez((110, 330), (240, 250), (380, 330), (500, 176)), RED, 12, on=6, off=5)
    a.circle(500, 150, 34, fill=RED)
    a.poly([(474, 176), (526, 176), (500, 226)], fill=RED)
    a.circle(500, 148, 13, fill=WHITE)
    return a.save("st-map.png")


def st_binoculars():
    a = Art(576, 512)
    a.rrect((236, 176, 340, 250), 18, fill=WHITE)
    a.rrect((88, 44, 212, 150), 26, fill=WHITE)
    a.rrect((364, 44, 488, 150), 26, fill=WHITE)
    a.rrect((56, 128, 244, 462), 52, fill=WHITE)
    a.rrect((332, 128, 520, 462), 52, fill=WHITE)
    a.circle(150, 372, 58, fill=RED)
    a.circle(426, 372, 58, fill=RED)
    a.circle(150, 372, 22, fill=WHITE)
    a.circle(426, 372, 22, fill=WHITE)
    return a.save("st-binoculars.png")


def st_campfire():
    a = Art(576, 448)
    a.line([(96, 396), (480, 316)], WHITE, 34)
    a.line([(96, 316), (480, 396)], WHITE, 34)
    a.flame(288, 190, 300, fill=RED)
    a.flame(288, 226, 176, fill=YEL)
    return a.save("st-campfire.png")


def st_wave():
    a = Art(640, 384)
    crest = (bez((40, 250), (140, 120), (300, 100), (392, 186))
             + bez((392, 186), (330, 150), (240, 190), (214, 268))[1:])
    a.poly(crest + [(40, 268)], fill=WHITE)
    a.line(bez((60, 316), (200, 274), (330, 358), (470, 306)), WHITE, 20)
    a.line(bez((180, 358), (320, 316), (450, 396), (590, 344)), YEL, 18)
    return a.save("st-wave.png")


def st_palm():
    a = Art(512, 576)
    a.line(bez((300, 544), (272, 412), (232, 320), (214, 226)), WHITE, 30)
    # ทางมะพร้าว = ใบอวบ ๆ กางออกจากยอดแล้วสะบัดลง — วาดเป็นวงรีเอียงทีละใบ
    for deg in (-168, -126, -84, -42, -8):
        r = math.radians(deg)
        a.oval(214 + 116 * math.cos(r), 214 + 96 * math.sin(r), 122, 40, deg, fill=WHITE)
    for x, y in ((238, 236), (198, 258), (262, 262)):
        a.circle(x, y, 21, fill=YEL)
    return a.save("st-palm.png")


def st_boat():
    a = Art(640, 448)
    a.line([(316, 76), (316, 306)], WHITE, 16)
    a.poly([(336, 92), (486, 292), (336, 292)], fill=RED)
    a.poly([(56, 300), (584, 300), (496, 404), (144, 404)], fill=WHITE)
    a.line(bez((30, 424), (170, 396), (300, 448), (440, 420)), YEL, 14)
    return a.save("st-boat.png")


def st_train():
    a = Art(704, 448)
    a.rrect((72, 104, 606, 348), 46, fill=WHITE)
    a.rrect((132, 156, 296, 262), 20, fill=(24, 28, 36, 255))
    a.rrect((330, 156, 494, 262), 20, fill=(24, 28, 36, 255))
    a.rrect((520, 104, 606, 348), 46, fill=RED)
    a.rect((520, 104, 566, 348), fill=RED)
    for x in (186, 340, 494):
        a.circle(x, 372, 46, fill=(24, 28, 36, 255))
        a.circle(x, 372, 18, fill=WHITE)
    a.rrect((72, 372, 606, 404), 14, fill=YEL)
    return a.save("st-train.png")


def st_bicycle():
    a = Art(704, 448)
    a.circle(168, 296, 112, outline=WHITE, width=20)
    a.circle(536, 296, 112, outline=WHITE, width=20)
    a.line([(168, 296), (300, 174), (430, 296), (300, 296), (300, 174)], WHITE, 16)
    a.line([(430, 296), (486, 160)], WHITE, 16)
    a.line([(444, 152), (536, 152)], WHITE, 16)
    a.rrect((256, 150, 348, 176), 12, fill=YEL)
    a.circle(536, 296, 20, fill=WHITE)
    return a.save("st-bicycle.png")


def st_ticket():
    a = Art(704, 320)
    a.rrect((28, 36, 676, 284), 30, fill=WHITE)
    a.circle(420, 36, 34, fill=CLEAR)        # รอยฉีกบน-ล่าง เจาะให้ทะลุจริง
    a.circle(420, 284, 34, fill=CLEAR)
    a.dash([(420, y) for y in range(84, 240, 4)], (150, 156, 168, 255), 6, on=5, off=5)
    a.rrect((78, 96, 236, 124), 10, fill=RED)
    a.rrect((78, 156, 342, 178), 9, fill=(190, 196, 208, 255))
    a.rrect((78, 200, 268, 222), 9, fill=(190, 196, 208, 255))
    a.circle(548, 160, 62, fill=YEL)
    return a.save("st-ticket.png")


def st_passport():
    a = Art(448, 576)
    a.rrect((36, 36, 412, 540), 30, fill=RED)
    a.circle(224, 232, 84, outline=YEL, width=14)
    a.star(224, 232, 46, fill=YEL)
    a.rrect((116, 396, 332, 420), 10, fill=YEL)
    a.rrect((156, 448, 292, 468), 9, fill=YEL)
    return a.save("st-passport.png")


def st_bed():
    a = Art(704, 448)
    a.rrect((48, 236, 656, 372), 26, fill=WHITE)
    a.rrect((48, 128, 124, 372), 26, fill=WHITE)
    a.rrect((146, 182, 316, 250), 26, fill=YEL)
    a.rrect((330, 236, 656, 320), 20, fill=RED)
    a.rrect((72, 372, 108, 424), 10, fill=WHITE)
    a.rrect((596, 372, 632, 424), 10, fill=WHITE)
    return a.save("st-bed.png")


def st_signpost():
    a = Art(640, 512)
    a.rrect((294, 108, 346, 486), 16, fill=WHITE)
    a.poly([(318, 142), (556, 142), (604, 190), (556, 238), (318, 238)], fill=YEL)
    a.poly([(322, 286), (84, 286), (36, 334), (84, 382), (322, 382)], fill=WHITE)
    return a.save("st-signpost.png")


def st_footprints():
    a = Art(448, 576)
    for cx, cy, deg in ((150, 470, -14), (296, 372, -14), (150, 268, -14),
                        (296, 168, -14)):
        a.oval(cx, cy, 46, 74, deg, fill=WHITE)
        a.oval(cx + 6, cy - 92, 30, 26, deg, fill=WHITE)
    return a.save("st-footprints.png")


def st_temple():
    a = Art(640, 512)
    a.rrect((84, 456, 556, 502), 14, fill=YEL)
    a.rrect((120, 396, 520, 462), 12, fill=WHITE)
    # เจดีย์ = ชั้นลดหลั่น ไม่ใช่สามเหลี่ยมเดียว (ไม่งั้นอ่านเป็นเต็นท์)
    for y0, y1, half in ((300, 402, 176), (216, 306, 130), (140, 222, 88)):
        a.poly([(320, y0 - 34), (320 + half, y1), (320 - half, y1)], fill=WHITE)
    a.rrect((296, 84, 344, 152), 16, fill=YEL)
    a.poly([(320, 16), (348, 96), (292, 96)], fill=YEL)
    a.rrect((248, 402, 392, 462), 10, fill=YEL)
    return a.save("st-temple.png")


# ── อารมณ์ (หมวดใหม่) ───────────────────────────────────────────────────────
def face(w=512, h=512, cx=256, cy=256, r=232):
    a = Art(w, h)
    a.circle(cx, cy, r, fill=YEL)
    return a


def eyes_dot(a, y=206, r=27, xs=(188, 324)):
    for x in xs:
        a.circle(x, y, r, fill=INK)


def smile_arc(a, box=(150, 176, 362, 380), s=20, e=160, w=22):
    a.arc(box, s, e, INK, w)


def st_em_smile():
    a = face()
    eyes_dot(a)
    smile_arc(a)
    return a.save("st-em-smile.png")


def st_em_joy():
    a = face()
    a.arc((148, 168, 244, 250), 200, 340, INK, 20)
    a.arc((268, 168, 364, 250), 200, 340, INK, 20)
    a.pie((146, 236, 366, 424), 15, 165, fill=INK)
    a.pie((214, 330, 300, 400), 0, 180, fill=RED)
    a.drop(112, 268, 78)
    a.drop(400, 268, 78)
    return a.save("st-em-joy.png")


def st_em_love():
    a = face()
    a.heart(186, 206, 92)
    a.heart(326, 206, 92)
    smile_arc(a, (160, 200, 352, 388))
    return a.save("st-em-love.png")


def st_em_cool():
    a = face()
    a.rrect((132, 172, 246, 254), 18, fill=INK)
    a.rrect((266, 172, 380, 254), 18, fill=INK)
    a.rect((246, 196, 266, 214), fill=INK)
    a.arc((176, 226, 356, 372), 25, 130, INK, 20)
    return a.save("st-em-cool.png")


def st_em_sad():
    a = face()
    eyes_dot(a, y=196)
    a.arc((156, 288, 356, 448), 200, 340, INK, 22)
    return a.save("st-em-sad.png")


def st_em_cry():
    a = face()
    eyes_dot(a, y=196)
    a.arc((156, 288, 356, 448), 200, 340, INK, 22)
    a.drop(186, 300, 96)
    a.drop(186, 380, 62)
    return a.save("st-em-cry.png")


def st_em_angry():
    a = face()
    a.line([(136, 150), (238, 196)], INK, 22)
    a.line([(376, 150), (274, 196)], INK, 22)
    eyes_dot(a, y=232, r=24)
    a.arc((160, 300, 352, 444), 200, 340, INK, 22)
    a.line([(374, 96), (420, 60)], RED, 14)
    a.line([(410, 110), (452, 96)], RED, 14)
    return a.save("st-em-angry.png")


def st_em_sleep():
    a = Art(576, 512)
    a.circle(238, 268, 214, fill=YEL)
    a.arc((136, 168, 232, 258), 20, 160, INK, 18)
    a.arc((248, 168, 344, 258), 20, 160, INK, 18)
    a.ellipse((206, 316, 274, 386), fill=INK)
    a.text((452, 130), "Z", 96, INK)
    a.text((522, 62), "Z", 62, INK)
    return a.save("st-em-sleep.png")


def st_em_think():
    a = face()
    a.line([(140, 168), (244, 186)], INK, 16)      # คิ้วซ้ายตก
    a.line([(272, 158), (376, 132)], INK, 16)      # คิ้วขวายก
    a.circle(190, 244, 26, fill=INK)
    a.circle(322, 236, 26, fill=INK)
    a.line([(196, 366), (322, 344)], INK, 20)      # ปากเฉียง
    a.line([(340, 388), (376, 404)], INK, 14)
    return a.save("st-em-think.png")


def st_em_wink():
    a = face()
    a.circle(188, 206, 27, fill=INK)
    a.arc((272, 168, 372, 254), 200, 340, INK, 20)
    smile_arc(a)
    return a.save("st-em-wink.png")


def st_em_sweat():
    a = face()
    eyes_dot(a)
    a.arc((176, 216, 356, 372), 25, 140, INK, 20)
    a.drop(404, 132, 92)
    return a.save("st-em-sweat.png")


def st_em_hungry():
    a = face()
    eyes_dot(a, y=196)
    a.pie((160, 236, 356, 412), 10, 170, fill=INK)
    a.pie((206, 322, 310, 396), 0, 180, fill=RED)
    a.drop(316, 400, 66)
    return a.save("st-em-hungry.png")


def st_em_sick():
    a = face()
    eyes_dot(a, y=182)
    a.rrect((136, 252, 376, 412), 44, fill=WHITE)
    a.line([(136, 274), (72, 240)], WHITE, 14)
    a.line([(376, 274), (440, 240)], WHITE, 14)
    a.line([(160, 322), (352, 322)], (198, 204, 216, 255), 8, cap=False)
    return a.save("st-em-sick.png")


def st_em_dizzy():
    a = face()
    for cx in (188, 324):
        a.line([(cx - 30, 176), (cx + 30, 236)], INK, 18)
        a.line([(cx + 30, 176), (cx - 30, 236)], INK, 18)
    a.line(bez((156, 348), (216, 300), (296, 400), (356, 348)), INK, 18)
    return a.save("st-em-dizzy.png")


def st_em_party():
    a = Art(576, 560)
    a.circle(268, 312, 214, fill=YEL)
    a.poly([(180, 128), (352, 128), (266, 6)], fill=RED)
    a.rect((180, 112, 352, 140), fill=WHITE)
    a.circle(266, 6, 22, fill=YEL)
    a.arc((172, 244, 364, 424), 20, 160, INK, 20)
    a.circle(206, 268, 25, fill=INK)
    a.circle(330, 268, 25, fill=INK)
    for x, y, c in ((498, 124, RED), (534, 236, YEL), (462, 344, WHITE),
                    (68, 168, YEL), (44, 292, RED), (110, 60, WHITE)):
        a.circle(x, y, 16, fill=c)
    return a.save("st-em-party.png")



# ── ลูกศร / ชี้จุด (เพิ่มรอบสาม) ────────────────────────────────────────────
def st_arrow_thin():
    a = Art(560, 256)
    a.line([(44, 128), (452, 128)], WHITE, 18)
    a.head([(400, 128), (462, 128)], 116, WHITE)
    return a.save("st-arrow-thin.png")


def st_chevrons():
    a = Art(512, 256)
    for i, x in enumerate((96, 216, 336)):
        a.line([(x, 62), (x + 84, 128), (x, 194)], YEL if i == 2 else WHITE, 26)
    return a.save("st-chevrons.png")


def st_arrow_diag():
    a = Art(512, 512)
    base = [(60, 226), (300, 226), (300, 162), (470, 256), (300, 350),
            (300, 286), (60, 286)]
    a.poly(rot_pts(base, 256, 256, -45), fill=YEL)
    return a.save("st-arrow-diag.png")


def st_arrow_double():
    a = Art(640, 256)
    a.rrect((150, 102, 490, 154), 10, fill=WHITE)
    a.poly([(24, 128), (170, 40), (170, 216)], fill=WHITE)
    a.poly([(616, 128), (470, 40), (470, 216)], fill=WHITE)
    return a.save("st-arrow-double.png")


def st_arrow_loop():
    a = Art(512, 512)
    ring = ring_pts(256, 268, 176)[16:150]
    a.line(ring, WHITE, 28)
    a.head(ring, 118, WHITE)
    return a.save("st-arrow-loop.png")


def st_hand_point():
    """นิ้วชี้ไปทางขวา — ชี้ข้าง ไม่ใช่ชี้ขึ้น ไม่งั้นทรงไปซ้ำกับ 'ยกนิ้วโป้ง'"""
    a = Art(512, 448)
    a.rrect((104, 122, 216, 232), 50, fill=WHITE)    # นิ้วโป้งพับอยู่ด้านบน
    a.rrect((56, 158, 306, 412), 62, fill=WHITE)     # กำมือ
    a.rrect((246, 186, 462, 272), 43, fill=WHITE)    # นิ้วชี้
    for y in (296, 356):                              # ร่องนิ้วที่พับ
        a.line([(120, y), (268, y)], CLEAR, 11, cap=False)
    return a.save("st-hand-point.png")


def st_arrow_scribble():
    a = Art(640, 448)
    stroke = bez((56, 116), (250, 60), (300, 300), (472, 300))
    a.line(stroke, YEL, 24)
    a.head(stroke, 116, YEL)
    return a.save("st-arrow-scribble.png")


def st_crosshair():
    a = Art(512, 512)
    a.circle(256, 256, 178, outline=WHITE, width=18)
    for x0, y0, x1, y1 in ((256, 26, 256, 120), (256, 392, 256, 486),
                           (26, 256, 120, 256), (392, 256, 486, 256)):
        a.line([(x0, y0), (x1, y1)], WHITE, 18)
    a.circle(256, 256, 34, fill=RED)
    return a.save("st-crosshair.png")


def st_scribble_circle():
    a = Art(640, 512)
    # วงกลมวนมือเขียน — รัศมีสั่นเล็กน้อยและวนสองรอบเหลื่อมกัน ให้ดูเหมือนวาดสด
    for lap, (dx, dy) in enumerate(((0, 0), (10, -8))):
        pts = []
        for i in range(200):
            t = 2 * math.pi * i / 180
            rx = 268 + 12 * math.sin(t * 3 + lap)
            ry = 196 + 10 * math.cos(t * 2 + lap)
            pts.append((320 + dx + rx * math.cos(t), 250 + dy + ry * math.sin(t)))
        a.line(pts, YEL, 18, cap=False)
    a.line([(556, 342), (612, 424)], YEL, 18)
    return a.save("st-scribble-circle.png")


def st_arrow_bend():
    a = Art(512, 448)
    path = [(84, 396), (84, 168), (352, 168)]
    a.line(path, WHITE, 30)
    a.head(path, 126, WHITE)
    return a.save("st-arrow-bend.png")


# ── อากาศ / เวลา (เพิ่มรอบสาม) ─────────────────────────────────────────────
def st_storm():
    a = Art(576, 512)
    a.cloud(288, 176, 460)
    a.poly([(322, 268), (196, 448), (272, 448), (232, 500), (376, 328),
            (296, 328), (348, 268)], fill=YEL)
    return a.save("st-storm.png")


def st_snow():
    a = Art(512, 512)
    for i in range(6):
        ang = math.radians(i * 60)
        c, s2 = math.cos(ang), math.sin(ang)
        a.line([(256 - 210 * c, 256 - 210 * s2), (256 + 210 * c, 256 + 210 * s2)],
               WHITE, 18)
        for d in (108, 164):
            bx, by = 256 + d * c, 256 + d * s2
            for side in (-40, 40):
                b = math.radians(i * 60 + side)
                a.line([(bx, by), (bx + 56 * math.cos(b), by + 56 * math.sin(b))],
                       WHITE, 14)
    a.circle(256, 256, 26, fill=WHITE)
    return a.save("st-snow.png")


def st_wind():
    a = Art(576, 384)
    for y, w, col in ((110, 300, WHITE), (192, 380, WHITE), (274, 250, YEL)):
        a.line(bez((60, y), (200, y - 34), (330, y + 34), (60 + w, y)), col, 18)
        a.circle(60 + w + 6, y - 22, 26, outline=col, width=18)
    return a.save("st-wind.png")


def st_fog():
    a = Art(576, 400)
    a.cloud(288, 148, 440)
    for i, (x0, x1) in enumerate(((84, 470), (130, 512), (64, 420))):
        a.rrect((x0, 268 + i * 44, x1, 296 + i * 44), 14,
                fill=WHITE if i % 2 == 0 else YEL)
    return a.save("st-fog.png")


def st_partly():
    a = Art(576, 448)
    a.circle(196, 158, 96, fill=YEL)
    for i in range(8):
        ang = math.radians(i * 45)
        c, s2 = math.cos(ang), math.sin(ang)
        a.line([(196 + 124 * c, 158 + 124 * s2), (196 + 178 * c, 158 + 178 * s2)],
               YEL, 20)
    a.cloud(322, 296, 420)
    return a.save("st-partly.png")


def st_rainbow():
    a = Art(640, 384)
    for i, col in enumerate((RED, YEL, WHITE)):
        r = 246 - i * 54
        a.arc((320 - r, 330 - r, 320 + r, 330 + r), 180, 360, col, 44)
    a.cloud(112, 322, 220)
    a.cloud(528, 322, 220)
    return a.save("st-rainbow.png")


def st_umbrella():
    a = Art(512, 576)
    a.line([(256, 246), (256, 470)], WHITE, 20)
    a.arc((176, 400, 340, 530), 0, 180, WHITE, 20)
    a.pie((44, 76, 468, 500), 180, 360, fill=RED)
    for x0, x1 in ((124, 190), (256, 322), (388, 454)):
        a.pie((44, 76, 468, 500), 180 + (x0 - 44) * 180 / 424,
              180 + (x1 - 44) * 180 / 424, fill=WHITE)
    a.rrect((44, 268, 468, 292), 12, fill=CLEAR)   # ตัดชายร่มให้เป็นเส้นตรงพอดี
    return a.save("st-umbrella.png")


def st_hourglass():
    a = Art(448, 576)
    a.rrect((56, 34, 392, 78), 18, fill=WHITE)
    a.rrect((56, 498, 392, 542), 18, fill=WHITE)
    a.poly([(96, 88), (352, 88), (224, 288)], fill=WHITE)
    a.poly([(96, 488), (352, 488), (224, 288)], fill=WHITE)
    a.poly([(140, 130), (308, 130), (224, 262)], fill=YEL)
    a.poly([(150, 446), (298, 446), (224, 352)], fill=YEL)
    a.line([(224, 268), (224, 356)], YEL, 12, cap=False)
    return a.save("st-hourglass.png")


def st_stopwatch():
    a = Art(512, 576)
    a.rrect((196, 24, 316, 84), 22, fill=WHITE)
    a.rrect((398, 96, 462, 152), 18, fill=WHITE)
    a.circle(256, 336, 210, fill=WHITE)
    a.circle(256, 336, 210, outline=RED, width=22)
    a.line([(256, 336), (256, 196)], INK, 22)
    a.line([(256, 336), (352, 386)], INK, 22)
    a.circle(256, 336, 20, fill=INK)
    return a.save("st-stopwatch.png")


def st_calendar():
    a = Art(576, 512)
    a.rrect((208, 24, 244, 118), 14, fill=WHITE)
    a.rrect((332, 24, 368, 118), 14, fill=WHITE)
    a.rrect((44, 68, 532, 482), 38, fill=WHITE)
    a.rrect((44, 68, 532, 190), 38, fill=RED)
    a.rect((44, 150, 532, 190), fill=RED)
    for r in range(3):
        for c in range(5):
            col = YEL if (r, c) == (1, 2) else (198, 204, 216, 255)
            a.circle(116 + c * 88, 250 + r * 82, 22, fill=col)
    return a.save("st-calendar.png")


# ── เดินทาง (เพิ่มรอบสาม) ───────────────────────────────────────────────────
def st_motorbike():
    a = Art(704, 448)
    a.circle(152, 300, 92, outline=WHITE, width=32)
    a.circle(552, 300, 92, outline=WHITE, width=32)
    a.rrect((252, 236, 452, 330), 24, fill=WHITE)     # เครื่องยนต์
    a.poly([(286, 176), (410, 176), (438, 236), (258, 236)], fill=WHITE)  # ถังน้ำมัน
    a.rrect((396, 168, 528, 208), 18, fill=RED)       # เบาะ
    a.line([(528, 196), (566, 262)], WHITE, 22)
    a.line([(286, 186), (214, 108)], WHITE, 22)       # โช้กหน้า
    a.line([(214, 122), (152, 268)], WHITE, 22)
    a.line([(166, 96), (272, 96)], WHITE, 18)         # แฮนด์
    a.circle(186, 150, 30, fill=YEL)                  # ไฟหน้า
    a.rrect((436, 330, 560, 362), 16, fill=WHITE)     # ท่อไอเสีย
    return a.save("st-motorbike.png")


def st_boot():
    a = Art(576, 448)
    a.poly([(120, 60), (300, 60), (326, 250), (508, 300), (520, 366),
            (120, 366)], fill=WHITE)
    a.rrect((96, 350, 536, 412), 22, fill=RED)
    for y in (120, 176, 232):
        a.line([(150, y), (272, y - 18)], YEL, 12)
    return a.save("st-boot.png")


def st_bottle():
    a = Art(384, 576)
    a.rrect((146, 32, 238, 92), 14, fill=RED)
    a.rrect((162, 84, 222, 160), 10, fill=WHITE)
    a.rrect((104, 146, 280, 542), 46, fill=WHITE)
    a.rect((104, 296, 280, 396), fill=YEL)
    return a.save("st-bottle.png")


def st_balloon():
    a = Art(512, 576)
    a.ellipse((76, 30, 436, 402), fill=WHITE)
    a.poly([(196, 46), (256, 30), (256, 402), (216, 386)], fill=RED)
    a.poly([(316, 46), (376, 92), (330, 366), (296, 392)], fill=YEL)
    a.line([(180, 386), (206, 470)], WHITE, 12)
    a.line([(332, 386), (306, 470)], WHITE, 12)
    a.rrect((196, 458, 316, 546), 20, fill=YEL)
    return a.save("st-balloon.png")


def st_globe():
    a = Art(512, 512)
    a.circle(256, 256, 226, fill=WHITE)
    a.ellipse((156, 30, 356, 482), outline=RED, width=16)
    a.ellipse((36, 30, 476, 482), outline=RED, width=16)
    a.line([(38, 256), (474, 256)], RED, 16, cap=False)
    a.arc((36, 96, 476, 296), 0, 180, RED, 14)
    return a.save("st-globe.png")


def st_lighthouse():
    a = Art(512, 576)
    a.poly([(186, 168), (326, 168), (368, 470), (144, 470)], fill=WHITE)
    a.poly([(196, 232), (316, 232), (326, 300), (186, 300)], fill=RED)
    a.poly([(210, 366), (302, 366), (314, 434), (198, 434)], fill=RED)
    a.rrect((166, 128, 346, 176), 16, fill=WHITE)
    a.rrect((206, 56, 306, 136), 18, fill=YEL)
    a.rrect((120, 462, 392, 520), 20, fill=WHITE)
    for y0, y1 in ((44, 78), (110, 144)):
        a.line([(40, y0), (150, y0 + 18)], YEL, 12)
        a.line([(472, y1 - 66), (362, y1 - 48)], YEL, 12)
    return a.save("st-lighthouse.png")


def st_beach_umbrella():
    a = Art(576, 512)
    a.line([(300, 150), (330, 470)], WHITE, 18)
    a.pie((56, 44, 544, 400), 180, 360, fill=RED)
    for k in range(3):
        a.pie((56, 44, 544, 400), 195 + k * 60, 225 + k * 60, fill=WHITE)
    a.rrect((56, 206, 544, 230), 12, fill=CLEAR)
    a.rrect((176, 452, 486, 486), 16, fill=YEL)
    return a.save("st-beach-umbrella.png")


def st_noodle():
    a = Art(576, 448)
    a.line([(330, 92), (500, 46)], WHITE, 16)
    a.line([(346, 128), (516, 82)], WHITE, 16)
    a.pie((64, 108, 512, 428), 0, 180, fill=WHITE)
    a.rrect((44, 96, 532, 140), 20, fill=WHITE)
    a.rrect((186, 300, 390, 330), 14, fill=YEL)
    for x in (206, 288, 370):
        a.line(bez((x, 76), (x - 30, 44), (x + 30, 16), (x, -14)), YEL, 12)
    return a.save("st-noodle.png")


def st_drink():
    a = Art(448, 576)
    a.poly([(56, 96), (392, 96), (224, 340)], fill=WHITE)
    a.poly([(104, 150), (344, 150), (224, 322)], fill=RED)
    a.rrect((206, 320, 242, 490), 12, fill=WHITE)
    a.rrect((110, 486, 338, 526), 16, fill=WHITE)
    a.line([(286, 40), (222, 200)], YEL, 16)
    a.circle(324, 84, 46, fill=YEL)
    return a.save("st-drink.png")


def st_snorkel():
    a = Art(576, 448)
    a.rrect((72, 130, 424, 330), 62, fill=WHITE)
    a.rrect((110, 168, 386, 274), 40, fill=(24, 28, 36, 255))
    a.rrect((36, 178, 84, 226), 14, fill=WHITE)
    a.line([(424, 190), (492, 190)], WHITE, 20)
    a.rrect((470, 60, 522, 330), 24, fill=RED)
    a.arc((404, 268, 522, 386), 0, 90, RED, 24)
    return a.save("st-snorkel.png")


ALL = [
    st_new, st_live, st_4k, st_hot, st_ep,
    st_arrow_r, st_arrow_curve, st_pointer, st_ring, st_zigzag,
    st_arrow_l, st_arrow_up, st_arrow_down, st_cursor, st_arrow_dashed,
    st_arrow_u, st_ring_dash, st_underline,
    st_arrow_thin, st_chevrons, st_arrow_diag, st_arrow_double, st_arrow_loop,
    st_hand_point, st_arrow_scribble, st_crosshair, st_scribble_circle,
    st_arrow_bend,
    st_lower3, st_strip, st_corner, st_film, st_banner,
    st_lower3_dark, st_tag, st_frame_round, st_frame_dash, st_scrim,
    st_polaroid, st_title_plate,
    st_heart, st_star, st_fire, st_sparkle, st_wow, st_check,
    st_thumbup, st_hundred, st_laugh, st_shock, st_question, st_warning,
    st_cross, st_crown,
    st_subscribe, st_like, st_comment, st_share, st_bell, st_hashtag,
    st_pin, st_compass, st_mountain, st_route, st_plane, st_camera,
    st_suitcase, st_tent, st_coffee, st_food, st_car, st_flag, st_sunset,
    st_backpack, st_map, st_binoculars, st_campfire, st_wave, st_palm, st_boat,
    st_train, st_bicycle, st_ticket, st_passport, st_bed, st_signpost,
    st_footprints, st_temple,
    st_motorbike, st_boot, st_bottle, st_balloon, st_globe, st_lighthouse,
    st_beach_umbrella, st_noodle, st_drink, st_snorkel,
    st_em_smile, st_em_joy, st_em_love, st_em_cool, st_em_sad, st_em_cry,
    st_em_angry, st_em_sleep, st_em_think, st_em_wink, st_em_sweat,
    st_em_hungry, st_em_sick, st_em_dizzy, st_em_party,
    *[(lambda n: lambda: st_num(n))(i) for i in range(1, 6)],
    st_sun, st_cloud, st_rain, st_thermo, st_moon, st_clock,
    st_storm, st_snow, st_wind, st_fog, st_partly, st_rainbow, st_umbrella,
    st_hourglass, st_stopwatch, st_calendar,
]

if __name__ == "__main__":
    if not FONT:
        raise SystemExit("ไม่พบฟอนต์ที่ใช้วาดตัวอักษร — แก้รายการ FONTS ก่อน")
    names = [f() for f in ALL]
    print(f"เขียน {len(names)} ไฟล์ลง {OUT}")
