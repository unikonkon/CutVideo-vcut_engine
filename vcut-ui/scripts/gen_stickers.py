"""วาดสติกเกอร์ตัวอย่าง 74 แบบลง public/stickers/ — รันซ้ำได้ ผลลัพธ์เหมือนเดิมทุกครั้ง

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


ALL = [
    st_new, st_live, st_4k, st_hot, st_ep,
    st_arrow_r, st_arrow_curve, st_pointer, st_ring, st_zigzag,
    st_arrow_l, st_arrow_up, st_arrow_down, st_cursor, st_arrow_dashed,
    st_arrow_u, st_ring_dash, st_underline,
    st_lower3, st_strip, st_corner, st_film, st_banner,
    st_lower3_dark, st_tag, st_frame_round, st_frame_dash, st_scrim,
    st_polaroid, st_title_plate,
    st_heart, st_star, st_fire, st_sparkle, st_wow, st_check,
    st_thumbup, st_hundred, st_laugh, st_shock, st_question, st_warning,
    st_cross, st_crown,
    st_subscribe, st_like, st_comment, st_share, st_bell, st_hashtag,
    st_pin, st_compass, st_mountain, st_route, st_plane, st_camera,
    st_suitcase, st_tent, st_coffee, st_food, st_car, st_flag, st_sunset,
    *[(lambda n: lambda: st_num(n))(i) for i in range(1, 6)],
    st_sun, st_cloud, st_rain, st_thermo, st_moon, st_clock,
]

if __name__ == "__main__":
    if not FONT:
        raise SystemExit("ไม่พบฟอนต์ที่ใช้วาดตัวอักษร — แก้รายการ FONTS ก่อน")
    names = [f() for f in ALL]
    print(f"เขียน {len(names)} ไฟล์ลง {OUT}")
