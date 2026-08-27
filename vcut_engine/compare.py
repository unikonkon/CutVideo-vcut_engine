"""COMPARE — ขั้น 6 · วางหนังที่ตัดแล้วเทียบข้างฟุตเทจดิบ (Before | After)

**ทำไมเป็นขั้นใหม่ ไม่ใช่ส่วนขยายของขั้น 5**

ขั้น 5 มีสัญญาข้อเดียวที่ต้องเป็นจริงเสมอ: *"ไม่ตั้งอะไรเลย → ได้ไฟล์เหมือน
ขั้น 4 เป๊ะ"* และมันทำงานบน **ไทม์ไลน์เดียว** — ทุกชั้นของมัน (ข้อความ · รูปทรง ·
ภาพซ้อน · แผนที่) ผูกเวลากับ (คลิป, วินาทีในคลิป) ของไทม์ไลน์นั้น

ส่วนขั้นนี้กิน **หนังสองเรื่องที่ยาวไม่เท่ากัน**: ผลของขั้นก่อนหน้า กับคลิปดิบ
ที่ไม่ได้อยู่ในไทม์ไลน์เลยด้วยซ้ำ  ยัดเข้าขั้น 5 จะพังสัญญานั้นทันทีเพราะต้องมี
"ไทม์ไลน์ที่สอง" ที่ไม่มีใครในขั้น 5 รู้จัก

แยกออกมาแล้วได้ของแถมที่สำคัญกว่านั้น: **ขั้นนี้พังไม่กระทบขั้น 1–5 เลย** มัน
อ่านอย่างเดียว ไม่เขียนอะไรกลับไปข้างหลัง และไฟล์ที่มันผลิตเป็นไฟล์ตัวที่สี่

**สามอย่างที่พลาดง่ายและถูกกันไว้แล้ว**

1. `ffmpeg` ปกติในเครื่อง Mac ที่ลง homebrew **ไม่มีฟิลเตอร์ `ass`** — ต้องใช้
   ตัวที่ `caption.text_ffmpeg()` หาให้ ไม่ใช่เรียก `ffmpeg` ตรง ๆ (บั๊กแบบนี้
   ไม่โผล่บนเครื่องคนเขียนที่ลง ffmpeg-full ไว้แล้ว)
2. **สองเรื่องยาวไม่เท่ากันเสมอ** — After สั้นกว่า Before คือ *ประเด็นทั้งหมด*
   ของคลิปแนวนี้  `shortest=1` ตัดที่ตัวสั้นสุดซึ่งตัด Before ทิ้งกลางคัน จึงใช้
   ไม่ได้เลย  ที่ถูกคือให้ฝั่งที่จบก่อน **ค้างเฟรมสุดท้าย** แล้วรอ (ดู hold)
3. **เสียงเอาจากฝั่ง After อย่างเดียว** — ผสมสองฝั่งได้เสียงพูดซ้อนกันสองชุด
   ที่ฟังไม่รู้เรื่อง และเป็นสิ่งที่ไม่มีใครตั้งใจสั่งแม้แต่ครั้งเดียว
"""
from pathlib import Path

from . import caption, fx, journey
from .util import c, die, info, part_path, probe_video, run as sh, warn

# ── ค่าตั้งของขั้นนี้ ──
#
# อยู่ในไฟล์ config เหมือนขั้นอื่น ไม่ใช่ใน fx.json — ขั้นนี้ไม่มีของที่ผูกกับ
# *ชิ้นในไทม์ไลน์* สักอย่าง มันเป็นค่าของทั้งไฟล์ล้วน ๆ
CFG = {
    "enabled": False,
    "before": "",          # ชื่อคลิปดิบในโฟลเดอร์ฟุตเทจ — ต้องมี ไม่มีก็ทำไม่ได้
    # "" = ไฟล์ล่าสุดที่ทำไว้ (ขั้น 5 → 4 → 3) · หรือใส่ชื่อไฟล์เองก็ได้
    "after": "",
    "layout": "tilt",
    "bg": "#3B1418",
    # แยกเป็นสองคีย์แทนที่จะเป็นลิสต์เดียว — ฟอร์มในหน้าเว็บวาดช่องกรอกให้ได้
    # เฉพาะชนิดที่มันรู้จัก ลิสต์จะกลายเป็นบล็อก JSON ที่อ่านได้แต่แก้ไม่ได้
    "label_before": "Before",
    "label_after": "After",
    "title": "",
    "subtitle": "",
    "font": "Sukhumvit Set",
    "hold": "freeze",      # freeze = ฝั่งที่จบก่อนค้างเฟรมสุดท้าย · cut = จบที่ตัวสั้นสุด
    "timeline": "",        # สกรีนเรคคอร์ดไทม์ไลน์ (ไม่มีก็ปล่อยว่าง)
    "out_suffix": "-vs",
}

HOLD = {"freeze": "ค้างเฟรมสุดท้ายรออีกฝั่ง", "cut": "จบพร้อมกันที่ตัวสั้นสุด"}

# ── เลย์เอาต์ — (x, y, กว้าง, สูง) เป็น *สัดส่วนของเฟรม* ไม่ใช่พิกเซล ──
#
# เก็บเป็นสัดส่วนเพราะเลย์เอาต์ที่วัดมาจากคลิปต้นแบบเป็นของจอ 1080×1920 ถ้าเก็บ
# เป็นพิกเซล คนที่ตั้ง [video] เป็น 720×1280 จะได้ช่องที่ล้นออกนอกจอโดยไม่มีอะไร
# บอก — และเลขที่ตั้งไว้ยังถูกอยู่เมื่อเปลี่ยนความละเอียดหนัง (หลักเดียวกับที่
# fx.OVERLAY เก็บ width เป็นสัดส่วน)
#
# tilt = เรขาคณิตที่ *วัดจากคลิป 06 จริง* ที่ 1080×1920:
#        Before 386×698 ที่ (73, 609) · After 518×912 ที่ (484, 396)
#        สองช่องเหลื่อมกันและไม่เท่ากัน — After ใหญ่กว่าและอยู่สูงกว่า ซึ่งคือ
#        สิ่งที่บอกคนดูว่าฝั่งไหนคือของจริงโดยไม่ต้องอ่านป้าย
LAYOUTS = {
    "tilt":  {"label": "เหลื่อมกัน (ตามคลิปต้นแบบ)",
              "before": (0.0676, 0.3172, 0.3574, 0.3635),
              "after":  (0.4481, 0.2062, 0.4796, 0.4750),
              "band":   (0.0, 0.6900, 1.0, 0.3100)},
    "side":  {"label": "เทียบข้างเท่ากัน",
              "before": (0.0350, 0.3000, 0.4500, 0.4000),
              "after":  (0.5150, 0.3000, 0.4500, 0.4000),
              "band":   (0.0, 0.7400, 1.0, 0.2600)},
    "stack": {"label": "บน-ล่าง",
              "before": (0.1400, 0.1000, 0.7200, 0.3400),
              "after":  (0.1400, 0.4800, 0.7200, 0.3400),
              "band":   (0.0, 0.8600, 1.0, 0.1400)},
}


def cfg(ctx):
    return {**CFG, **(ctx.get("compare", {}) or {})}


def out_path(ctx, quiet=False):
    """ไฟล์ผลลัพธ์ของขั้น 6

    กันคำต่อท้ายที่จะไปเขียนทับไฟล์ของขั้นก่อนหน้าแบบเดียวกับ fx.out_path เป๊ะ —
    ผลของการปล่อยผ่านคือหนังที่ทำเสร็จแล้วหายไปเงียบ ๆ ตอนกดปุ่มขั้นนี้
    """
    p = Path(ctx.out)
    suffix = str((ctx.get("compare", {}) or {}).get("out_suffix", "-vs") or "").strip()
    if not suffix or suffix in ("-text", "-fx") or "/" in suffix or "\\" in suffix:
        if suffix and not quiet:
            warn(f"[compare] out_suffix = '{suffix}' ใช้ไม่ได้ (ทับไฟล์ของขั้นก่อน "
                 f"หรือพาออกนอกโฟลเดอร์) — ใช้ '-vs' แทน")
        suffix = "-vs"
    return p.with_name(p.stem + suffix + p.suffix)


def _even(v):
    """ปัดขึ้นเป็นเลขคู่ — libx264 กับ yuv420p ปฏิเสธด้านที่เป็นเลขคี่

    ปัด *ขึ้น* ไม่ใช่ลง เพราะช่องที่เล็กลงหนึ่งพิกเซลจะเผยพื้นหลังเป็นเส้นบาง ๆ
    ตรงขอบ ซึ่งเห็นชัดกว่าช่องที่ล้นเข้าไปหนึ่งพิกเซล
    """
    return int((int(v) + 1) // 2 * 2)


def boxes(ctx, lay=None):
    """ช่องทุกช่องเป็นพิกเซลจริง — หน้าเว็บกับตัวประกอบไฟล์อ่านตัวนี้ตัวเดียว"""
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    name = str(lay or cfg(ctx)["layout"])
    L = LAYOUTS.get(name) or LAYOUTS["tilt"]
    out = {"w": W, "h": H, "layout": name if name in LAYOUTS else "tilt"}
    for k in ("before", "after", "band"):
        x, y, w, h = L[k]
        out[k] = {"x": _even(x * W), "y": _even(y * H),
                  "w": _even(w * W), "h": _even(h * H)}
    return out


def after_path(ctx):
    """ไฟล์ที่จะเอามาเป็นฝั่ง After — คืน (path, คำอธิบายว่ามาจากไหน)

    ค่าว่างแปลว่า "ตัวล่าสุดที่ทำไว้" ไล่จากขั้น 5 → 4 → 3  เลือกแบบนี้เพราะคน
    ที่ยังไม่เคยเปิดขั้น 5 เลยก็ควรกดขั้นนี้ได้ ไม่ใช่เจอ error ที่บอกให้ไปรัน
    ขั้นที่เขาไม่ได้ตั้งใจจะใช้  แต่ *บอกทุกครั้งว่าหยิบตัวไหนมา* ไม่ใช่เลือกเงียบ ๆ
    แล้วปล่อยให้สงสัยว่าทำไมข้อความที่เพิ่งใส่ไม่โผล่
    """
    want = str(cfg(ctx)["after"] or "").strip()
    if want:
        p = Path(want).expanduser()
        if not p.is_absolute():
            p = Path(ctx.out).parent / want
        return p, "ตั้งเอง"
    for path, why in ((fx.out_path(ctx, quiet=True), "ขั้น 5 · แต่งหนัง"),
                      (caption.out_path(ctx), "ขั้น 4 · ใส่ข้อความ"),
                      (Path(ctx.out), "ขั้น 3 · ต่อเป็นไฟล์")):
        if path.exists():
            return path, why
    return fx.out_path(ctx, quiet=True), "ขั้น 5 · แต่งหนัง"


def before_path(ctx):
    name = str(cfg(ctx)["before"] or "").strip()
    if not name:
        return None
    p = Path(name).expanduser()
    return p if p.is_absolute() else ctx.source / name


# ─────────────────────────── ป้ายชื่อ ───────────────────────────

def _chip(box, text, colr, W, H, size, font_pad):
    """ป้ายชิปหนึ่งใบเหนือช่อง — คืน (บรรทัดพื้น, บรรทัดตัวหนังสือ)

    พื้นวาดด้วย \\p ไม่ใช่ BorderStyle=3 ของสไตล์ เพราะกล่องแบบสไตล์รัดตามความ
    ยาวข้อความโดยคุมความสูง/ความมนไม่ได้ ส่วนชิปในคลิปแนวนี้เป็นแถบมุมมนขนาด
    คงที่ที่ตัวหนังสืออยู่กลาง
    """
    w = max(int(size * 3.2), int(len(text) * size * 0.62) + font_pad * 2)
    h = int(size * 1.65)
    cx = box["x"] + box["w"] // 2
    cy = max(h // 2 + 6, box["y"] - h // 2 - int(size * 0.35))
    plate = ("{" + r"\an7\pos(0,0)\bord0\shad0"
             + rf"\c{caption._colour(colr)}&\p1" + "}"
             + journey.rrect(cx - w / 2.0, cy - h / 2.0, w, h, h / 2.0)
             + r"{\p0}")
    label = ("{" + rf"\an5\pos({cx},{cy})\fs{size}\b1"
             + r"\c&H101010&\3c&H101010&\bord0\shad0" + "}"
             + caption._esc(text))
    return plate, label


def build_ass(ctx, total):
    """ป้ายทุกใบของขั้นนี้ → ไฟล์ ASS หนึ่งไฟล์ · คืน (ข้อความ, จำนวนบรรทัด)"""
    C = cfg(ctx)
    B = boxes(ctx)
    W, H = B["w"], B["h"]
    font = str(C["font"] or "Sukhumvit Set")
    size = max(14, int(min(W, H) * 0.030))

    head = [
        "[Script Info]", "ScriptType: v4.00+",
        f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 2", "ScaledBorderAndShadow: yes", "YCbCr Matrix: TV.709", "",
        "[V4+ Styles]",
        ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
         "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
         "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
         "MarginL, MarginR, MarginV, Encoding"),
        (f"Style: cmp,{font},{size},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,"
         "0,0,0,0,100,100,0,0,1,2,0,5,40,40,40,1"), "",
        "[Events]",
        ("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
         "Effect, Text"),
    ]
    span = f"0:00:00.00,{caption._clock(total)}"
    body = []

    def add(layer, txt):
        body.append(f"Dialogue: {layer},{span},cmp,,0,0,0,,{txt}")

    # ป้ายฝั่ง Before เทา ฝั่ง After เขียว — สีเป็นตัวบอกว่าฝั่งไหนคือผลลัพธ์
    # ก่อนที่คนดูจะทันอ่านตัวหนังสือ (ป้ายอยู่บนจอแค่ไม่กี่วินาทีแรกที่คนยังมองหา
    # ว่าต้องดูตรงไหน)
    for key, text, colr in (("before", str(C["label_before"] or ""), "#9AA5AD"),
                            ("after", str(C["label_after"] or ""), "#2ED573")):
        if not text:
            continue
        plate, label = _chip(B[key], text, colr, W, H, size, int(size * 0.7))
        add(0, plate)
        add(1, label)

    title = str(C["title"] or "").strip()
    sub = str(C["subtitle"] or "").strip()
    if title:
        add(2, "{" + rf"\an8\pos({W // 2},{int(H * 0.035)})"
            rf"\fs{int(size * 1.7)}\b1\c&HFFFFFF&\3c&H101010&\bord{size * 0.09:.1f}"
            + "}" + caption._esc(title))
    if sub:
        add(2, "{" + rf"\an8\pos({W // 2},{int(H * 0.035) + int(size * 2.1)})"
            rf"\fs{int(size * 1.05)}\c&HC8D2D8&\3c&H101010&\bord{size * 0.06:.1f}"
            + "}" + caption._esc(sub))
    return "\n".join(head + body) + "\n", len(body)


# ─────────────────────────── ประกอบไฟล์ ───────────────────────────

def _pane(idx, box, total, hold):
    """หนึ่งช่อง: ย่อให้เต็มช่องแล้วครอบส่วนเกินทิ้ง + ค้างเฟรมสุดท้ายถ้าจบก่อน

    **ย่อแบบ `increase` แล้ว crop ไม่ใช่ย่อให้พอดีทั้งสองด้าน** — ช่องที่วัดมาจาก
    คลิปต้นแบบมีสัดส่วน 0.553 ส่วนฟุตเทจ 9:16 เป็น 0.5625 ต่างกันนิดเดียวแต่พอ
    ยืดให้พอดีทั้งสองด้าน หน้าคนในภาพจะแบนลงอย่างเห็นได้ ซึ่งเป็นสิ่งที่ไม่มีใคร
    ตั้งใจสั่งและหาสาเหตุยากเพราะ "มันก็เต็มช่องดีนะ"
    """
    parts = [f"scale={box['w']}:{box['h']}:force_original_aspect_ratio=increase",
             f"crop={box['w']}:{box['h']}", "setsar=1"]
    if hold == "freeze":
        # ค้างเฟรมสุดท้ายจนกว่าจะถึงความยาวรวม — ตัวที่ยาวกว่าจะไม่ถูกแตะเพราะ
        # tpad ไม่ตัดอะไรทิ้ง มันเติมอย่างเดียว
        parts.append(f"tpad=stop_mode=clone:stop_duration={total:.3f}")
    parts.append(f"trim=end={total:.6f}")
    parts.append("setpts=PTS-STARTPTS")
    return f"[{idx}:v]" + ",".join(parts) + f"[p{idx}]"


def run(ctx, out=None):
    from . import render as rmod

    C = cfg(ctx)
    exe = caption.text_ffmpeg(ctx)
    if not exe:
        die("ยังเขียนตัวหนังสือลงภาพไม่ได้ — ติดตั้ง ffmpeg-full ก่อน\n"
            "   brew install ffmpeg-full")

    before = before_path(ctx)
    if before is None:
        die("ยังไม่ได้เลือกคลิปดิบฝั่ง Before\n"
            "   ตั้งด้วย  --set compare.before=ชื่อไฟล์.mp4  (ไฟล์ในโฟลเดอร์ฟุตเทจ)")
    if not before.exists():
        die(f"ไม่พบคลิปฝั่ง Before: {before}")

    after, why = after_path(ctx)
    if not after.exists():
        die(f"ไม่พบหนังฝั่ง After ({why}): {after.name}\n"
            "   สั่งขั้นก่อนหน้าให้เสร็จก่อน เช่น  vcut fx")

    pb, pa = probe_video(before), probe_video(after)
    if not pb or not pa:
        die("อ่านคุณสมบัติไฟล์ไม่ได้ — ไฟล์เสียหรือ ffprobe อ่านไม่ออก")
    hold = str(C["hold"] or "freeze")
    if hold not in HOLD:
        warn(f"[compare] hold = '{hold}' ไม่รู้จัก — ใช้ 'freeze' แทน")
        hold = "freeze"
    da, db = float(pa["duration"]), float(pb["duration"])
    total = min(da, db) if hold == "cut" else max(da, db)
    if total <= 0:
        die("ความยาวของไฟล์เป็นศูนย์ — ประกอบไม่ได้")

    B = boxes(ctx)
    W, H = B["w"], B["h"]
    fps = str(ctx.get("video.fps", "60000/1001"))
    tl = str(C["timeline"] or "").strip()
    tlp = None
    if tl:
        tlp = Path(tl).expanduser()
        if not tlp.is_absolute():
            tlp = ctx.source / tl
        if not tlp.exists():
            warn(f"[compare] ไม่พบไฟล์ไทม์ไลน์ {tlp.name} — ข้ามแถบล่าง")
            tlp = None

    text, nlab = build_ass(ctx, total)
    ass = ctx.work / "compare.ass"
    ass.write_text(text, encoding="utf-8")
    fpath = str(ass).replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")

    # input 0 = Before · 1 = After · 2 = ไทม์ไลน์ (ถ้ามี) — พื้นหลังเป็นฟิลเตอร์
    # ต้นทาง ไม่ใช่ input เพราะมันไม่มีอะไรให้อ่านจากดิสก์
    ins = ["-i", str(before), "-i", str(after)]
    fc = [f"color=c={C['bg']}:s={W}x{H}:d={total:.3f}:r={fps}[bg]",
          _pane(0, B["before"], total, hold),
          _pane(1, B["after"], total, hold)]
    over = [("bg", "p0", B["before"]), ("t0", "p1", B["after"])]
    if tlp is not None:
        ins += ["-i", str(tlp)]
        fc.append(_pane(2, B["band"], total, hold))
        over.append(("t1", "p2", B["band"]))
    for i, (base, pane, box) in enumerate(over):
        nxt = f"t{i}" if i < len(over) - 1 else "vo"
        fc.append(f"[{base}][{pane}]overlay=x={box['x']}:y={box['y']}[{nxt}]")
    fc.append(f"[vo]ass='{fpath}'[v]")

    # เสียงจากฝั่ง After อย่างเดียว — apad ให้ยาวเท่าภาพเมื่อ Before ยาวกว่า
    # ไม่งั้นไฟล์จบตรงที่เสียงหมดทั้งที่ภาพยังเหลือ
    has_a = int(pa.get("achannels") or 0) > 0
    if has_a:
        fc.append(f"[1:a]apad,atrim=end={total:.6f},asetpts=PTS-STARTPTS[a]")

    band = f" · แถบล่าง {tlp.name}" if tlp is not None else ""
    info(f"COMPARE  {before.name} | {after.name} ({why}) · "
         f"{LAYOUTS[B['layout']]['label']} · {total:.1f} วิ · ป้าย {nlab} บรรทัด{band}  "
         f"{c('(เข้ารหัสภาพใหม่หนึ่งรอบ)', 'd')}")
    if hold == "freeze" and abs(da - db) > 0.05:
        short, long_ = ("After", "Before") if da < db else ("Before", "After")
        info(f"  {c(f'{short} สั้นกว่า {abs(da - db):.1f} วิ — ค้างเฟรมสุดท้ายรอ {long_}', 'd')}")

    dst = Path(out).expanduser() if out else out_path(ctx)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = part_path(dst, ".mp4")
    e = ctx.get("encode", {})
    cmd = [exe, "-nostdin", "-hide_banner", "-v", "error", "-y"] + ins
    cmd += ["-filter_complex", ";".join(fc), "-map", "[v]"]
    cmd += ["-map", "[a]"] if has_a else ["-an"]
    cmd += ["-t", f"{total:.6f}", "-fps_mode", "cfr", "-r", fps,
            "-color_range", "tv", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709"]
    cmd += rmod.encode_args(ctx, audio=False)
    if has_a:
        cmd += ["-c:a", str(e.get("acodec", "aac")),
                "-b:a", str(e.get("abitrate", "192k")),
                "-ar", str(int(e.get("arate", 48000))),
                "-ac", str(int(e.get("achannels", 2)))]
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        die(f"ประกอบ Before|After ไม่สำเร็จ\n{r.stderr[-700:]}")
    tmp.replace(dst)
    info(f"{c('เสร็จ', 'g')}  {dst.name}  "
         f"{c(f'{dst.stat().st_size / 1e9:.2f} GB', 'd')}")
    return dst


def status(ctx):
    """สรุปสถานะขั้น 6 ให้หน้าเว็บ — ไม่เรียก ffmpeg และไม่เขียนไฟล์อะไรเลย"""
    C = cfg(ctx)
    b = before_path(ctx)
    a, why = after_path(ctx)
    o = out_path(ctx, quiet=True)
    return {
        "cfg": C,
        "defaults": {"compare": dict(CFG), "hold": dict(HOLD),
                     "layout": {k: v["label"] for k, v in LAYOUTS.items()}},
        "boxes": boxes(ctx),
        "before": {"name": b.name if b else "", "exists": bool(b and b.exists())},
        "after": {"name": a.name, "why": why, "exists": a.exists()},
        # พร้อมกดหรือยัง — ตอบด้วยเงื่อนไขชุดเดียวกับที่ run() ใช้หยุด ไม่ใช่
        # คนละชุด ไม่งั้นวันหนึ่งหน้าเว็บจะบอกว่าพร้อมแล้วปุ่มกดไม่ได้
        "ready": bool(b and b.exists() and a.exists()),
        "out": {"path": str(o), "name": o.name, "exists": o.exists(),
                "size": o.stat().st_size if o.exists() else 0,
                "mtime": int(o.stat().st_mtime) if o.exists() else 0},
    }
