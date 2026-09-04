# v7 · ภูเขา × ป่าไม้ — ต่อยอดจากท้องฟ้าค่ำของ v4: ฉากหลังแนวเขาซ้อนชั้น + แนวยอดสน (SVG) · แผงโทนเขียวป่า
# แอกเซนต์ = แสงอาทิตย์ตกบนยอดเขา · ฟอนต์ Pridi (หัว) + Bai Jamjuree (เนื้อ) · ขั้นตอน = เส้นทางเดินป่ามีหมุด
# flow เดิม 3 ขั้น 6 หน้า · mockup เท่านั้น ยังไม่ใช่โค้ดจริง
#
# ใช้:  python3 gen_v7.py [--canvas path/to/canvas.json]
#   เขียน M1 M2 M2Custom M2Run M3 M3Edit .dc.html ลงโฟลเดอร์ปัจจุบัน
#   ถ้าส่ง --canvas จะลบของเดิมของหน้า page-7 แล้วเพิ่มอาร์ตบอร์ด + โน้ตของหน้านี้เข้าไปใหม่
import json, sys, math

TEXT, MUTED, ACC, INK = "#eef1e6", "#9db0a0", "#f0b25c", "#0b1712"
MOSS = "#3d6b55"
PANEL = "rgba(12,27,22,.74)"
WELL = "rgba(7,17,14,.62)"
LINE = "rgba(168,196,172,.16)"
SKY = "linear-gradient(180deg,#0b1626 0%,#15304a 34%,#2d5570 52%,#4a6f78 60%,#0f211b 62%,#0b1712 100%)"
PAGE = "page-7"
PAGE_NAME = "v7 · ภูเขา × ป่าไม้ · 3 ขั้น · 6 หน้า"

CSS = f"""
body{{margin:0;background:#0f211b;color:{TEXT};font-family:"Bai Jamjuree","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13.5px;line-height:1.45;font-weight:400}}
a{{color:{ACC}}}a:hover{{color:#ffd08a}}
b,strong{{font-weight:600}}
.serif{{font-family:"Pridi","Bai Jamjuree",serif;font-weight:300}}
.g{{background:{PANEL};border:1px solid {LINE};border-radius:14px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 30px rgba(0,0,0,.28)}}
.well{{background:{WELL};border-radius:10px;border:1px solid rgba(0,0,0,.35)}}
.hl{{border-top:1px solid {LINE}}}
.muted{{color:{MUTED}}}
.small{{font-size:12px}}
.h1{{font-family:"Pridi","Bai Jamjuree",serif;font-weight:300;font-size:32px;line-height:1.1;letter-spacing:.005em}}
.h2{{font-family:"Pridi","Bai Jamjuree",serif;font-weight:400;font-size:17px}}
.num{{font-family:"Pridi",serif;font-weight:300;font-variant-numeric:tabular-nums}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 18px;border-radius:9px;background:rgba(168,196,172,.10);border:1px solid rgba(168,196,172,.22);color:{TEXT};font-size:13.5px;font-weight:500;white-space:nowrap;box-sizing:border-box}}
.btn.pri{{background:{ACC};border-color:{ACC};color:{INK};font-weight:600;box-shadow:0 6px 18px rgba(240,178,92,.25)}}
.btn.lg{{height:50px;padding:0 24px;font-size:15px}}
.btn.sm{{height:34px;padding:0 13px;font-size:12.5px;border-radius:8px}}
.btn.ic{{width:42px;padding:0}}
.seg{{display:grid;gap:6px}}
.seg .btn{{height:44px;padding:0 10px;font-weight:500}}
.seg .btn.on{{border-color:{ACC};color:{ACC};background:rgba(240,178,92,.10)}}
.sw{{width:52px;height:28px;border-radius:999px;background:rgba(168,196,172,.16);border:1px solid rgba(168,196,172,.2);position:relative;flex-shrink:0;box-sizing:border-box}}
.sw i{{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:999px;background:{MUTED}}}
.sw.on{{background:{MOSS};border-color:{MOSS}}}.sw.on i{{left:27px;background:{TEXT}}}
.row{{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:14px;padding:10px 0}}
.row+.row{{border-top:1px solid {LINE}}}
.thumb{{position:relative;border-radius:10px;overflow:hidden;background:#000}}.thumb img{{width:100%;height:100%;object-fit:cover;display:block}}
.scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,23,18,.05) 0%,rgba(11,23,18,0) 40%,rgba(11,23,18,.82) 100%)}}
.card{{position:relative;border-radius:14px;overflow:hidden;background:#000;border:1px solid {LINE}}}
.card.sel{{border-color:{ACC};box-shadow:0 0 0 1px {ACC},0 10px 30px rgba(240,178,92,.18)}}
.card.dim{{opacity:.38}}
.sign{{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:6px;background:rgba(11,23,18,.85);border:1px solid rgba(240,178,92,.35);color:{ACC};font-weight:600;font-size:12px;white-space:nowrap}}
.badge{{width:30px;height:30px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-family:"Pridi",serif;font-size:16px;background:rgba(11,23,18,.8);border:1.5px solid {TEXT};color:{TEXT}}}
.badge.on{{border-color:{ACC};color:{ACC}}}
.trail{{position:relative;height:6px;border-radius:999px;background:repeating-linear-gradient(90deg,rgba(168,196,172,.35) 0 6px,transparent 6px 11px)}}
.trail i{{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:{ACC}}}
.trail i::after{{content:"";position:absolute;right:-6px;top:-4px;width:14px;height:14px;border-radius:999px;background:{ACC};box-shadow:0 0 0 3px rgba(240,178,92,.25)}}
.dot{{width:8px;height:8px;border-radius:999px;background:rgba(168,196,172,.25);flex-shrink:0}}.dot.on{{background:{ACC}}}.dot.done{{background:{MOSS}}}
.sub{{position:absolute;left:8%;right:8%;bottom:14%;text-align:center;font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 0 #000,0 0 3px #000,0 0 6px #000;line-height:1.3}}
.hook{{position:absolute;left:8%;right:8%;top:12%;text-align:center;font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 0 #000,0 0 4px #000}}
.hook em{{font-style:normal;color:{ACC}}}
.tab{{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:9px;color:{MUTED};border:1px solid transparent;white-space:nowrap}}
.tab.on{{color:{TEXT};background:rgba(168,196,172,.10);border-color:rgba(168,196,172,.22)}}
.tab .cnt{{font-size:11.5px;color:{MUTED}}}
.tag{{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:{MUTED};font-weight:600}}
.stepper{{display:grid;grid-template-columns:44px 1fr 44px;gap:6px;align-items:center}}
.stepper .btn{{height:44px;width:44px;padding:0;font-size:20px}}
.stepper .well{{height:44px;display:flex;align-items:center;justify-content:center;font-family:"Pridi",serif;font-size:20px}}
.pos{{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}}
.pos span{{height:26px;border-radius:5px;background:rgba(168,196,172,.10);border:1px solid rgba(168,196,172,.18);box-sizing:border-box}}
.pos span.on{{background:rgba(240,178,92,.18);border-color:{ACC}}}
"""

def ico(name, size=16, color="currentColor"):
    p = {
        "check": '<path d="M4 8.5l3 3 5-6"/>',
        "play": '<path d="M5 3.5v9l7-4.5z"/>',
        "x": '<path d="M4 4l8 8M12 4l-8 8"/>',
        "plus": '<path d="M8 3v10M3 8h10"/>',
        "upload": '<path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10"/>',
        "folder": '<path d="M2 4.5h4l1.5 1.5H14v7H2z"/>',
        "film": '<path d="M2.5 3h11v10h-11zM2.5 6h11M2.5 10h11M5.5 3v10M10.5 3v10"/>',
        "edit": '<path d="M3 13h3l7-7-3-3-7 7zM9 4l3 3"/>',
        "chev": '<path d="M6 3.5l4.5 4.5L6 12.5"/>',
        "back": '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
        "stop": '<rect x="4" y="4" width="8" height="8" rx="1"/>',
        "prev": '<path d="M11 3.5v9L5 8zM4 3.5v9"/>',
        "next": '<path d="M5 3.5v9L11 8zM12 3.5v9"/>',
        "mic": '<rect x="6" y="2" width="4" height="8" rx="2"/><path d="M4 8a4 4 0 0 0 8 0M8 12v2"/>',
        "clock": '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2.5 1.5"/>',
        "spark": '<path d="M8 2l1.3 3.7L13 7l-3.7 1.3L8 12l-1.3-3.7L3 7l3.7-1.3z"/>',
        "sticker": '<path d="M3 3h10v6l-4 4H3z M9 13V9h4"/>',
        "music": '<path d="M6 12.5V4l7-1.5v8.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>',
        "text": '<path d="M3 4h10M8 4v9M5.5 13h5"/>',
        "fx": '<path d="M3 13L13 3M9 3h4v4M3 9v4h4"/>',
        "warn": '<path d="M8 2.5l6 11H2z M8 6.5v3M8 11.5v.5"/>',
        "peak": '<path d="M1.5 13L6 5l2.5 4L10.5 6l4 7z M6 5l1 1.5"/>',
        "tree": '<path d="M8 2l3.5 5H9.5l3 4H9v3H7v-3H3.5l3-4H4.5z"/>',
        "flag": '<path d="M4 14V2.5h7.5L10 5.5l1.5 3H4"/>',
    }[name]
    return f'<svg width="{size}" height="{size}" viewBox="0 0 16 16" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">{p}</svg>'

def ridge(y0, amp, seed, n=14, w=1440):
    """เส้นสันเขา: จุดสุ่มแบบกำหนดเมล็ด ให้เหมือนกันทุกครั้งที่สร้าง"""
    pts = []
    for i in range(n + 1):
        x = w * i / n
        y = y0 - amp * (0.5 + 0.5 * math.sin(seed + i * 1.7) * math.cos(seed * 0.7 + i * 0.9))
        pts.append(f"{x:.0f},{y:.0f}")
    return " ".join(pts)

def trees(y_base, h_lo, h_hi, step, seed, w=1440):
    """แนวยอดสน: สามเหลี่ยมต่อกันตามฐาน y_base"""
    out = []
    x = -10
    i = 0
    while x < w + 20:
        h = h_lo + (h_hi - h_lo) * (0.5 + 0.5 * math.sin(seed + i * 2.3))
        hw = step * 0.55
        out.append(f"M{x:.0f},{y_base} L{x+hw:.0f},{y_base-h:.0f} L{x+2*hw:.0f},{y_base}")
        x += step
        i += 1
    return " ".join(out)

def scene():
    return f"""<svg width="1440" height="900" viewBox="0 0 1440 900" style="position:absolute;inset:0;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b25c" stop-opacity="0"/><stop offset="1" stop-color="#f0b25c" stop-opacity=".28"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .06 0"/></filter>
  </defs>
  <rect x="0" y="330" width="1440" height="220" fill="url(#glow)"/>
  <polygon points="0,900 {ridge(470, 90, 1.3)} 1440,900" fill="#2a4d63" opacity=".85"/>
  <polygon points="0,900 {ridge(520, 80, 4.1, 11)} 1440,900" fill="#1e3a49"/>
  <polygon points="0,900 {ridge(560, 60, 7.7, 17)} 1440,900" fill="#173029"/>
  <path d="M-10,900 L-10,600 {trees(600, 26, 58, 26, 2.2)} L1450,600 L1450,900 Z" fill="#0f231c"/>
  <path d="M-10,900 L-10,640 {trees(640, 34, 78, 38, 5.6)} L1450,640 L1450,900 Z" fill="#0b1913"/>
  <rect width="1440" height="900" filter="url(#grain)"/>
</svg>"""

def page(body):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pridi:wght@200;300;400;500&family=Bai+Jamjuree:wght@400;500;600;700&display=swap">
  <style>{CSS}</style>
</helmet>
<div style="width:1440px;height:900px;background:{SKY};display:flex;flex-direction:column;overflow:hidden;position:relative;">
{scene()}
{body}
</div>
</x-dc>
</body>
</html>"""

def topbar(step, right=""):
    """แถบบน: ชื่อ vcut + เส้นทาง 3 หมุด (ทำแล้ว = มอส ✓ · ปัจจุบัน = แสงเขา · ถัดไป = ว่าง) เชื่อมด้วยเส้นประ"""
    labels = [("ใส่วิดีโอ", 1), ("สไตล์", 2), ("ส่งออก", 3)]
    parts = []
    for i, (lbl, n) in enumerate(labels):
        if n < step:
            mark = f'<span style="width:26px;height:26px;border-radius:999px;background:{MOSS};display:inline-flex;align-items:center;justify-content:center;">{ico("check",13,TEXT)}</span>'
            col = TEXT
        elif n == step:
            mark = f'<span style="width:26px;height:26px;border-radius:999px;background:{ACC};color:{INK};display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">{n}</span>'
            col = TEXT
        else:
            mark = f'<span style="width:26px;height:26px;border-radius:999px;border:1.5px dashed rgba(168,196,172,.45);color:{MUTED};display:inline-flex;align-items:center;justify-content:center;font-size:12px;box-sizing:border-box;">{n}</span>'
            col = MUTED
        parts.append(f'<span style="display:inline-flex;align-items:center;gap:9px;color:{col};font-weight:{500 if n==step else 400};">{mark}{lbl}</span>')
        if i < 2:
            done = n < step
            parts.append(f'<span style="width:56px;height:0;border-top:2px {"solid" if done else "dashed"} {MOSS if done else "rgba(168,196,172,.35)"};"></span>')
    proj = '' if step == 1 else f'<span class="muted small" style="display:inline-flex;align-items:center;gap:8px;">{ico("film",13,MUTED)}IMG_1234.MOV · 02:14 · +1 ไฟล์</span>'
    return f"""<div style="height:68px;display:flex;align-items:center;gap:22px;padding:0 36px;flex-shrink:0;position:relative;">
    <span style="display:inline-flex;align-items:center;gap:9px;font-family:'Pridi',serif;font-size:20px;font-weight:400;letter-spacing:.01em;">{ico("peak",20,ACC)}vcut</span>
    {proj}
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;gap:12px;">{"".join(parts)}</div>
    <div style="flex:1;"></div>
    {right or '<span style="width:170px;"></span>'}
  </div>"""

# ───────── ข้อมูลร่วม ─────────
STYLES = [
    ("A", "ปิดการขาย / แนะนำช่อง", "ช็อต 1.7–2.0 วิ · ช้า → รัว → ช้า", "f57.jpg"),
    ("B", "โชว์หลักฐาน", "ช็อต 2.4 วิ · เลขนับขึ้น", "f14.jpg"),
    ("C", "สอนกรอบวิธีคิด", "ช็อต 5.0 วิ · เน้นเสียงพูด", "f88.jpg"),
    ("D", "Before | After", "ช็อต 1.9–2.8 วิ · ครอป 9:16", "f116.jpg"),
]

def style_cards(selected, dim=False, h=280):
    cards = ""
    for letter, label, hint, img in STYLES:
        sel = selected == letter
        cards += f"""<div class="card{' sel' if sel else ''}{' dim' if dim else ''}" style="height:{h}px;">
          <img src="{img}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">
          <div class="scrim"></div>
          <span class="badge{' on' if sel else ''}" style="position:absolute;left:14px;top:14px;">{letter}</span>
          {f'<span style="position:absolute;right:12px;top:12px;display:inline-flex;width:26px;height:26px;border-radius:999px;background:{ACC};align-items:center;justify-content:center;">{ico("check",14,INK)}</span>' if sel else ''}
          <div style="position:absolute;left:14px;right:14px;bottom:14px;display:flex;flex-direction:column;gap:4px;">
            <span style="font-size:15px;font-weight:600;">{label}</span>
            <span class="small" style="color:rgba(238,241,230,.72);">{hint}</span>
          </div>
        </div>"""
    sel = selected == "X"
    cards += f"""<div class="card{' sel' if sel else ''}{' dim' if dim else ''}" style="height:{h}px;background:rgba(12,27,22,.6);border-style:dashed;display:flex;flex-direction:column;justify-content:space-between;padding:14px;">
          <span class="badge{' on' if sel else ''}">{ico("edit",14,ACC if sel else TEXT)}</span>
          <div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:15px;font-weight:600;">กำหนดเอง</span><span class="small muted">เลือกทุกอย่างเอง · 6 ตัวเลือก</span></div>
        </div>"""
    return f'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;">{cards}</div>'

def seg(items, on, cols=None):
    if isinstance(on, str): on = [on]
    cols = cols or len(items)
    return f'<div class="seg" style="grid-template-columns:repeat({cols},minmax(0,1fr));">' + "".join(
        f'<span class="btn{" on" if it in on else ""}">{ico("check",13,ACC) if it in on else ""}{it}</span>' for it in items) + '</div>'

def sw_row(label, on=True):
    return f'<div style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-radius:9px;background:rgba(168,196,172,.06);"><span>{label}</span><div style="flex:1;"></div><span class="sw{" on" if on else ""}"><i></i></span></div>'

def layer_row(icon, name, desc, on=True, action="แก้"):
    return f'<div class="row" style="{"" if on else "opacity:.55;"}"><span class="sw{" on" if on else ""}"><i></i></span><div style="display:flex;flex-direction:column;gap:1px;min-width:0;"><span style="display:inline-flex;align-items:center;gap:8px;font-weight:600;">{ico(icon,14,ACC if on else MUTED)}{name}</span><span class="muted small">{desc}</span></div><span class="btn sm">{action}{ico("chev",11)}</span></div>'

# ───────── M1 · ① ใส่วิดีโอ ─────────
M1 = topbar(1) + f"""
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;padding:0 0 40px;position:relative;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><span class="h1" style="font-size:42px;">ใส่วิดีโอ</span><span class="muted">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอนก็ได้ เอนจินปรับเป็น 9:16 ให้เอง</span></div>
    <div class="g" style="width:820px;padding:10px;display:flex;flex-direction:column;">
      <div style="height:200px;border-radius:10px;border:1.5px dashed rgba(240,178,92,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(7,17,14,.35);">
        {ico("upload",28,ACC)}
        <span style="font-size:16px;font-weight:500;">ลากวิดีโอมาวางที่นี่</span>
        <div style="display:flex;gap:10px;"><span class="btn">{ico("film",14)}เลือกไฟล์…</span><span class="btn" style="background:transparent;">{ico("folder",14)}ลิงก์โฟลเดอร์</span></div>
      </div>
      <div style="padding:6px 14px 4px;display:flex;flex-direction:column;">
        <div style="display:grid;grid-template-columns:44px 1fr 200px 24px;gap:16px;align-items:center;padding:12px 0;">
          <div class="thumb" style="width:44px;height:44px;"><img src="f57.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;gap:1px;"><span style="font-weight:600;">IMG_1234.MOV</span><span class="muted small">02:14 · 1126×1788 · 291 MB</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;"><span class="small" style="display:inline-flex;align-items:center;gap:7px;color:{ACC};font-weight:600;">{ico("mic",12,ACC)}ถอดเสียง 18 / 26</span><span class="trail"><i style="width:69%;"></i></span></div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
        <div class="hl" style="display:grid;grid-template-columns:44px 1fr 200px 24px;gap:16px;align-items:center;padding:12px 0;">
          <div class="thumb" style="width:44px;height:44px;"><img src="f116.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;gap:1px;"><span style="font-weight:600;">IMG_1240.MOV</span><span class="muted small">01:03 · 1920×1080 · 140 MB · จะครอปเป็น 9:16</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;"><span class="small muted">อัปโหลด 62%</span><span class="trail"><i style="width:62%;background:{MOSS};"></i></span></div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
      </div>
    </div>
    <div style="width:820px;display:flex;align-items:center;gap:16px;">
      <span class="muted small">ถอดเสียงเริ่มเองทันทีที่วางไฟล์ ทุกสไตล์ทุกแบบใช้ร่วมกัน · ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">เลือกสไตล์{ico("chev",14,INK)}</span>
    </div>
  </div>"""

# ───────── M2 ─────────
def m2_shell(selected, lower, dim=False, right_top="", h=280):
    return topbar(2, right_top) + f"""
  <div style="flex:1;display:flex;flex-direction:column;gap:18px;padding:16px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกสไตล์</span><span class="muted">4 สูตรจากเอนจิน เลือกชั้นแต่งให้เอง · หรือกำหนดเองทั้งหมด</span></div>
    {style_cards(selected, dim, h)}
    {lower}
  </div>"""

def layer_cell(icon, name, desc, off=False):
    return f'<div style="display:flex;gap:12px;align-items:flex-start;{"opacity:.45;" if off else ""}"><span style="width:34px;height:34px;border-radius:999px;background:rgba(168,196,172,.10);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">{ico(icon,16,MUTED if off else ACC)}</span><div style="display:flex;flex-direction:column;gap:2px;"><span style="font-weight:600;">{name}</span><span class="muted small">{desc}</span></div></div>'

M2_LOWER = f"""<div class="g" style="padding:22px 26px;display:flex;flex-direction:column;gap:18px;">
      <div style="display:flex;align-items:baseline;gap:14px;"><span class="h2">สูตร A แต่งให้แบบนี้</span><span class="muted small">แก้เพิ่มได้หลังตัดเสร็จ ทีละแบบ ในขั้นส่งออก</span></div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px;">
        {layer_cell("text","ซับจากบทพูด","ตัวหนา ขาวขอบดำ · กลางล่าง")}
        {layer_cell("spark","HOOK + การ์ดปิด","จากประโยคแรก · การ์ด 4 วิ @ช่อง")}
        {layer_cell("music","เพลงตามจังหวะ","สนุก/มีพลัง · รอยตัดเข้าบีต · ลดตอนพูด")}
        {layer_cell("fx","เอฟเฟกต์รายช็อต","ยิงรัวช่วงกลาง · ซูมไล่ · punch")}
        {layer_cell("sticker","สติกเกอร์ / ภาพซ้อน","สูตรนี้ไม่ใส่ · เพิ่มเองทีหลังได้", off=True)}
      </div>
    </div>
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;gap:18px;">
      <span class="muted small">ตัดให้ 6 แบบ ต่างกันที่ความยาวและจังหวะ · 1080×1920 · −14 LUFS · ราว 1 นาที</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">ตัดให้เลย · 6 แบบ{ico("chev",14,INK)}</span>
    </div>"""
M2 = m2_shell("A", M2_LOWER, h=380)

# ───────── M2Custom ─────────
def opt_card(n, icon, title, on, readout, body, note=""):
    return f"""<div class="g" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;{'opacity:.6;' if not on else ''}">
        <div style="display:flex;align-items:center;gap:10px;">{ico(icon,16,ACC if on else MUTED)}<span style="font-weight:600;font-size:14.5px;">{title}</span><div style="flex:1;"></div><span class="sign" style="{'' if on else 'opacity:.6;'}">{readout}</span><span class="sw{' on' if on else ''}"><i></i></span></div>
        {body}
        {f'<span class="muted small">{note}</span>' if note else ''}
      </div>"""

_SEL_DOT = f'<span style="position:absolute;right:5px;top:5px;width:8px;height:8px;border-radius:999px;background:{ACC};"></span>'
STK = "".join(f'<span class="btn{" on" if i==0 else ""}" style="height:56px;padding:0;position:relative;"><img src="{s}" alt="" style="max-width:46px;max-height:34px;">{_SEL_DOT if i==0 else ""}</span>' for i, s in enumerate(["st-4k.png","st-bell.png","st-balloon.png","st-banner.png"]))
M2C_LOWER = f"""<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;">
      {opt_card(1,"clock","ระยะเวลา",True,"45 วิ", seg(["30 วิ","45 วิ","60 วิ","ทั้งคลิป"],"45 วิ"), "ยังตัดครบ 6 แบบ · ค่านี้คือแบบที่เลือกไว้ก่อน")}
      {opt_card(2,"text","ซับ",True,"ทั้งบรรทัด", seg(["ทั้งบรรทัด","ทีละคำ"],"ทั้งบรรทัด"), "ขาวขอบดำ กลางล่าง · แก้คำผิดได้หลังตัด")}
      {opt_card(3,"spark","HOOK + การ์ดปิด",True,"เปิด 2", sw_row("HOOK จากประโยคแรก") + sw_row("การ์ดปิด 4 วิ @ชื่อช่อง"), "พิมพ์ข้อความเองได้ในขั้นส่งออก")}
      {opt_card(4,"music","เพลงตามจังหวะ",True,"สนุก", seg(["สนุก/มีพลัง","ชิล","ดราม่า","โลไฟ"],"สนุก/มีพลัง",4) + f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">{sw_row("รอยตัดเข้าบีต")}{sw_row("ลดเสียงตอนพูด")}</div>')}
      {opt_card(5,"sticker","สติกเกอร์ / ภาพซ้อน",False,"ปิด", f'<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">{STK}</div><span class="btn" style="height:44px;">{ico("plus",13)}เลือกจากคลัง 200 · อัปโหลด</span>')}
      {opt_card(6,"fx","เอฟเฟกต์รายช็อต",True,"2 อย่าง", seg(["ซูมไล่","punch","ยิงรัว","glitch","ขาวดำ","ไม่ใส่"],["ซูมไล่","punch"],3), "ใส่ทุกช็อตพูด · ปรับทีละช็อตได้หลังตัด")}
    </div>
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;gap:18px;">
      <span class="muted small">45 วิ · ซับทั้งบรรทัด · HOOK + การ์ดปิด · เพลงสนุกตามบีต · ซูมไล่ punch · ราว 1 นาที</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">ตัดให้เลย · 6 แบบ{ico("chev",14,INK)}</span>
    </div>"""
M2C = m2_shell("X", M2C_LOWER, h=190)

# ───────── M2Run ─────────
VARIANTS = [
    ("30 วิ", "0:30", "6 ช็อต", "done"),
    ("45 วิ", "0:45", "8 ช็อต", "done"),
    ("60 วิ", "1:00", "11 ช็อต", "run"),
    ("ตัดชิดทั้งคลิป", "1:43", "ลบเงียบ 7 ช่วง", "wait"),
    ("AI ไฮไลต์ 45 วิ", "0:45", "ประโยคคะแนนสูงก่อน", "wait"),
    ("ยิงรัว", "0:38", "ช็อต 0.8 วิ · 14 ช็อต", "wait"),
]
def run_rows():
    out = ""
    for i, (n, d, meta, st) in enumerate(VARIANTS):
        if st == "done":
            right = f'<span class="sign">{ico("flag",12,ACC)}ถึงแล้ว {d}</span><span class="btn sm">{ico("play",11)}ดู</span>'
        elif st == "run":
            right = f'<div style="width:160px;display:flex;flex-direction:column;gap:8px;"><span class="muted small">เรนเดอร์ 7 / 11 ช็อต</span><span class="trail"><i style="width:63%;"></i></span></div><span style="width:58px;"></span>'
        else:
            right = f'<span class="muted small">รอ</span><span style="width:58px;"></span>'
        dot = "dot done" if st == "done" else ("dot on" if st == "run" else "dot")
        out += f'<div style="display:grid;grid-template-columns:20px 1fr 180px auto;gap:14px;align-items:center;padding:11px 0;{"" if i == 0 else f"border-top:1px solid {LINE};"}{"opacity:.55;" if st == "wait" else ""}"><span class="{dot}"></span><div style="display:flex;flex-direction:column;"><span style="font-weight:600;">{n}</span><span class="muted small">{meta}</span></div>{right}</div>'
    return out

M2R_LOWER = f"""<div class="g" style="flex:1;display:grid;grid-template-columns:1fr 320px;gap:36px;padding:22px 28px;min-height:0;">
      <div style="display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:baseline;gap:14px;padding-bottom:6px;"><span class="h2">กำลังตัด · สูตร A</span><span class="muted small">ดูแบบที่เสร็จแล้วได้เลย ไม่ต้องรอครบ</span></div>
        {run_rows()}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;border-left:1px solid {LINE};padding-left:30px;">
        <div style="display:flex;align-items:baseline;gap:10px;"><span class="num" style="font-size:60px;line-height:1;">2<span class="muted" style="font-size:26px;"> / 6</span></span><div style="flex:1;"></div><span class="muted small">เหลือ ~0:40</span></div>
        <span class="trail"><i style="width:58%;"></i></span>
        <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px;">
          <div style="display:flex;align-items:center;gap:10px;"><span class="dot done"></span><span>ถอดเสียง</span><div style="flex:1;"></div><span class="muted small">26 / 26</span></div>
          <div style="display:flex;align-items:center;gap:10px;"><span class="dot done"></span><span>ตัดชิ้น · เลือกช็อต</span><div style="flex:1;"></div><span class="muted small">18 ชิ้น</span></div>
          <div style="display:flex;align-items:center;gap:10px;"><span class="dot on"></span><span>เรนเดอร์ 6 แบบ</span><div style="flex:1;"></div><span class="muted small">2 / 6</span></div>
          <div style="display:flex;align-items:center;gap:10px;opacity:.55;"><span class="dot"></span><span>แต่ง ซับ · HOOK · เพลง · เอฟเฟกต์</span><div style="flex:1;"></div><span class="muted small">รอ</span></div>
        </div>
        <div style="flex:1;"></div>
        <div style="display:flex;gap:10px;"><span class="btn">{ico("stop",13)}หยุด</span><span class="btn pri" style="flex:1;">ดู 2 แบบที่เสร็จ{ico("chev",13,INK)}</span></div>
        <span class="muted small">เสร็จครบแล้วพาไปขั้นส่งออกเอง</span>
      </div>
    </div>"""
M2R = m2_shell("A", M2R_LOWER, dim=True, right_top=f'<span class="sign" style="width:170px;justify-content:center;box-sizing:border-box;"><span class="dot on"></span>กำลังตัด 2 / 6</span>', h=190)

# ───────── M3 ─────────
def style_tabs(active="A"):
    tabs = ""
    for letter, label, _, _ in STYLES:
        on = letter == active
        tabs += f'<span class="tab{" on" if on else ""}"><span class="badge{" on" if on else ""}" style="width:22px;height:22px;font-size:12px;">{letter}</span>{label}<span class="cnt">{"6 แบบ" if on else "ตัดเพิ่ม ▸"}</span></span>'
    tabs += f'<span class="tab">{ico("edit",13,MUTED)}กำหนดเอง<span class="cnt">ตัดเพิ่ม ▸</span></span>'
    return f'<div style="display:flex;gap:6px;">{tabs}</div>'

def variant_cards(sel_idx=1):
    imgs = ["f57.jpg", "f14.jpg", "f88.jpg", "f116.jpg", "f2.jpg", "f57.jpg"]
    out = ""
    for i, (n, d, meta, _) in enumerate(VARIANTS):
        sel = i == sel_idx
        overlay = '<span class="hook">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="bottom:34%;">น้ำตกที่ไกล ยังไม่ไกลเท่า</span>' if sel else ''
        out += f"""<div class="card{' sel' if sel else ''}">
          <img src="{imgs[i]}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">
          <div class="scrim"></div>{overlay}
          <span class="sign" style="position:absolute;right:12px;top:12px;font-family:'Pridi',serif;font-size:15px;font-weight:400;">{d}</span>
          {f'<span style="position:absolute;left:12px;top:12px;display:inline-flex;width:26px;height:26px;border-radius:999px;background:{ACC};align-items:center;justify-content:center;">{ico("check",14,INK)}</span>' if sel else ''}
          <div style="position:absolute;left:14px;right:14px;bottom:12px;display:flex;flex-direction:column;gap:1px;"><span style="font-size:15px;font-weight:600;">{n}</span><span class="small" style="color:rgba(238,241,230,.72);">{meta}</span></div>
        </div>"""
    return f'<div style="flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:14px;min-height:0;">{out}</div>'

M3 = topbar(3, f'<span class="muted small" style="width:170px;text-align:right;">ตัดเสร็จ 6 / 6 · 0:58</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 400px;gap:26px;padding:12px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">
      <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกแบบ</span><span class="muted">สไตล์ที่ตัดแล้วอยู่ในแท็บ · กดสไตล์อื่นเพื่อตัดเพิ่ม</span></div>
      {style_tabs("A")}
      {variant_cards(1)}
      <div style="display:flex;align-items:center;gap:14px;"><span class="btn sm" style="background:transparent;">{ico("back",12)}เปลี่ยนสไตล์</span><span class="muted small">6 แบบใช้ชั้นแต่งของสูตร A เหมือนกัน ต่างกันที่การตัด</span></div>
    </div>
    <div class="g" style="display:flex;flex-direction:column;padding:18px 22px;min-height:0;">
      <div style="display:flex;gap:16px;">
        <div class="thumb" style="width:126px;height:224px;flex-shrink:0;"><img src="f57.jpg" alt=""><span class="hook" style="font-size:11px;">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="font-size:10.5px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;">
          <span class="num" style="font-size:36px;line-height:1;">A · 45 <span class="muted" style="font-size:16px;font-family:'Bai Jamjuree',sans-serif;">วิ</span></span>
          <span class="muted small">8 ช็อต · 1080×1920 · −14 LUFS</span>
          <div style="flex:1;"></div>
          <div style="display:flex;gap:6px;align-items:center;"><span class="btn sm ic" style="width:34px;">{ico("prev",12)}</span><span class="btn sm pri" style="flex:1;">{ico("play",12,INK)}เล่น</span><span class="btn sm ic" style="width:34px;">{ico("next",12)}</span></div>
          <span class="trail"><i style="width:22%;"></i></span>
          <div style="display:flex;justify-content:space-between;"><span class="muted small">0:10 / 0:45</span><span class="small" style="color:{ACC};font-weight:600;">ไทม์ไลน์ ▸</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;padding:16px 0 2px;"><span class="h2">ชั้นแต่งของแบบนี้</span><span class="muted small">เรนเดอร์ใหม่เฉพาะแบบนี้ ~45 วิ</span></div>
      {layer_row("text","ซับ","12 บรรทัด · 2 ไม่มั่นใจ")}
      {layer_row("spark","HOOK + การ์ดปิด","HOOK 1 · การ์ดปิด 1")}
      {layer_row("music","เพลง","สนุก/มีพลัง 98 BPM · ตามบีต")}
      {layer_row("sticker","สติกเกอร์ / ภาพซ้อน","ยังไม่มี", on=False, action="เพิ่ม")}
      {layer_row("fx","เอฟเฟกต์รายช็อต","ซูมไล่ · punch · 3 ช็อต")}
      <div style="flex:1;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;padding-top:12px;">
        {seg(["ภาพ+เสียง","+ ซับ","+ ทุกชั้น"],"+ ทุกชั้น")}
        <div style="display:flex;align-items:center;gap:10px;"><span class="btn pri lg" style="flex:1;">ส่งออก · A · 45 วิ</span><span class="btn lg ic" style="width:50px;">{ico("folder",15)}</span></div>
        <span class="muted small">~/Movies/vcut/IMG_1234/A-45s.mp4 · ~1:30</span>
      </div>
    </div>
  </div>"""

# ───────── M3Edit ─────────
SUBLINES = [("0:00","คลิปของคุณดูเจ๋งได้เนี่ย",.96),("0:03","ถ้าตัดให้ถูกจังหวะ",.91),("0:06","วันนี้จะพาไปดู",.88),("0:08","น้ำตกที่ไกล ยังไม่ไกลเท่า",.94),("0:11","บันไดที่ต้องเจอ",.57),("0:13","สองกิโล สิบเจ็ดคุ้ง",.61),("0:16","แต่พอถึงแล้ว",.9),("0:18","คุ้มทุกก้าว",.95)]
def sublist():
    out = ""
    for i, (t, s, c) in enumerate(SUBLINES):
        warn = c < .7
        out += f'<div style="display:grid;grid-template-columns:40px 1fr 60px 22px;gap:12px;align-items:center;padding:10px 0;{"" if i == 0 else f"border-top:1px solid {LINE};"}"><span class="muted small num" style="font-size:13px;">{t}</span><span style="{f"color:{ACC};font-weight:600;" if warn else ""}">{s}</span><span class="trail" style="height:4px;"><i style="width:{int(c*100)}%;{"" if not warn else ""}"></i></span>{ico("warn",13,ACC) if warn else ico("edit",13,MUTED)}</div>'
    return out.replace('<i style="width:57%;"></i>', f'<i style="width:57%;background:{MUTED};"></i>').replace('<i style="width:61%;"></i>', f'<i style="width:61%;background:{MUTED};"></i>')

M3E = M3.replace('gap:26px;padding:12px 36px 28px;min-height:0;position:relative;', 'gap:26px;padding:12px 36px 28px;min-height:0;position:relative;opacity:.30;filter:saturate(.5) blur(1px);') + f"""
  <div style="position:absolute;inset:0;background:rgba(7,17,14,.35);"></div>
  <div class="g" style="position:absolute;top:14px;right:14px;bottom:14px;width:660px;display:flex;flex-direction:column;background:rgba(12,27,22,.9);">
    <div style="display:flex;align-items:center;gap:14px;padding:22px 26px 10px;"><span class="h1" style="font-size:22px;">แก้ชั้นแต่ง · A · 45 วิ</span><div style="flex:1;"></div>{ico("x",16,MUTED)}</div>
    <div style="padding:0 26px 14px;display:flex;gap:6px;">{"".join(f'<span class="tab{" on" if i==0 else ""}" style="height:36px;padding:0 12px;">{t}</span>' for i,t in enumerate(["ซับ","HOOK / การ์ดปิด","เพลง","สติกเกอร์","เอฟเฟกต์"]))}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 200px;gap:22px;padding:12px 26px 0;min-height:0;border-top:1px solid {LINE};">
      <div style="display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:center;gap:10px;padding:0 0 6px;">{seg(["ทั้งบรรทัด","ทีละคำ","ปิดซับ"],"ทั้งบรรทัด")}</div>
        <span class="small" style="color:{ACC};font-weight:600;padding:6px 0 2px;">2 บรรทัดไม่มั่นใจ แก้ก่อนเผา</span>
        {sublist()}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="thumb" style="height:176px;"><img src="f57.jpg" alt=""><span class="sub" style="font-size:11px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <span class="tag">สไตล์ตัวอักษร</span>
        {seg(["หนา ขอบดำ","แผ่นทึบ","เหลืองเน้น"],"หนา ขอบดำ",1)}
        <span class="tag" style="padding-top:2px;">ขนาด</span>
        <div class="stepper"><span class="btn">−</span><span class="well">54</span><span class="btn">+</span></div>
        <span class="tag" style="padding-top:2px;">ตำแหน่ง · กดช่องที่ต้องการ</span>
        <div class="pos"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span class="on"></span><span></span></div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:16px 26px 20px;"><span class="muted small">เรนเดอร์ใหม่เฉพาะแบบ 45 วิ · ~45 วิ</span><div style="flex:1;"></div><span class="btn">ยกเลิก</span><span class="btn pri">บันทึก · เรนเดอร์ใหม่</span></div>
  </div>"""

PAGES = {"M1": M1, "M2": M2, "M2Custom": M2C, "M2Run": M2R, "M3": M3, "M3Edit": M3E}

BOARDS = [
    ("M1", "1 · ① ใส่วิดีโอ — วางไฟล์ · ถอดเสียงเริ่มเอง", 0, 0,
     "① แผงเดียวลอยหน้าแนวเขา · ปุ่ม 3 ตัว (เลือกไฟล์ · ลิงก์โฟลเดอร์ · เลือกสไตล์) · ความคืบหน้าเป็น 'เส้นทาง' ประ ๆ มีหมุดวิ่ง · หลายไฟล์เป็นรายการ (ไม่มีหน้าคลังคลิป) · upload → POST /api/setup → scan → listen อัตโนมัติ"),
    ("M2", "2 · ② สไตล์ — การ์ดภาพ + หมุด A–D · แสงเขาที่ใบที่เลือก", 1560, 0,
     "② การ์ด A–D = RECIPES (preset tiktok-*) เป็นภาพเต็มใบ หมุดตัวอักษรกลม ๆ แบบป้ายทางเดิน · ใบที่เลือกขอบสีแสงเขา + ✓ · แถบล่าง 'สูตร A แต่งให้แบบนี้' 5 ช่อง ไอคอนในวงกลม ([autofx] ของ preset — ยังไม่มีในเอนจิน) · CTA เดียว"),
    ("M2Custom", "3 · ② สไตล์ — กำหนดเอง 6 แผง (ปุ่มใหญ่ สวิตช์ ป้ายค่า)", 3120, 0,
     "② กำหนดเอง = 6 แผง แต่ละแผงมี ป้ายค่าที่เลือก (.sign) + สวิตช์ใหญ่ · ปุ่มเลือกค่าแบ่งช่องเท่ากันสูง 44 · HOOK/การ์ดเป็นสองแถวสวิตช์ · สติกเกอร์เป็นปุ่มภาพ 56 + ปุ่มคลังเต็มแถว — ใช้กติกาปุ่มจากรอบแก้ v5\nสมมติฐานเดิม: ระยะเวลา = แบบที่เลือกไว้ก่อนใน ③ เอนจินยังตัดครบ 6 แบบ"),
    ("M2Run", "4 · ② กำลังตัด — ป้าย 'ถึงแล้ว' รายแบบ · 2/6", 4680, 0,
     "② poll /api/job · การ์ดจาง · แต่ละแบบที่เสร็จมีป้าย 'ถึงแล้ว 0:30' เหมือนป้ายถึงจุดหมาย + ปุ่มดู · จุดสถานะ: มอส=เสร็จ แสงเขา=กำลังทำ · ขวา ตัวเลขใหญ่ Pridi 2/6 + เส้นทางความคืบหน้า · หยุด = /api/job/stop"),
    ("M3", "5 · ③ เลือกแบบ · ส่งออก — แท็บสไตล์ · 6 การ์ดภาพ · ชั้นแต่ง", 0, 1250,
     "③ แท็บสไตล์มีหมุดตัวอักษร (A เปิด · อื่น ตัดเพิ่ม = recut) · 6 แบบเป็นการ์ดภาพ เวลาบนป้ายมุมขวา · แผงขวา: ตัวอย่าง + A · 45 ตัวใหญ่ + ชั้นแต่ง 5 แถว สวิตช์ใหญ่ + ปุ่ม แก้ ▸ · ส่งออก 3 ปุ่มแบ่งช่อง ③④⑤ + CTA"),
    ("M3Edit", "6 · ③ ลิ้นชักแก้ชั้นแต่ง — ซับ · ปุ่ม − / + · ตาราง 3×3", 1560, 1250,
     "③ ลิ้นชักเดียว 5 แท็บ · แถวซับ: เวลา Pridi + เส้นทางความมั่นใจ (เทา = ไม่มั่นใจ ตัวหนังสือสีแสงเขา) · ขวา: ตัวอย่าง · สไตล์ 3 ปุ่มเต็มแถว · ขนาด − / + · ตำแหน่ง 3×3 · บันทึก = build_text ④ เฉพาะแบบที่เลือก"),
]

HEAD = """v7 · ภูเขา × ป่าไม้ — ต่อยอดจากท้องฟ้าค่ำของ v4: ฉากหลังเป็นท้องฟ้าค่ำไล่โทน แสงอุ่นจาง ๆ ที่ขอบฟ้า แล้วมีแนวเขา 3 ชั้น (ไกล = ฟ้าหม่น ใกล้ = เขียวเข้ม) กับแนวยอดสน 2 ชั้นด้านล่าง วาดเป็น SVG ตายตัว (ไม่ใช่รูปถ่าย) + เกรนบาง ๆ ทั้งจอ · แผงโทนเขียวป่าเข้มโปร่งเล็กน้อย เส้นขอบสีมอสจาง · แอกเซนต์เดียว = แสงอาทิตย์บนยอดเขา #f0b25c · สีมอส #3d6b55 ใช้เฉพาะสถานะ 'เสร็จ/เปิด' · ตัวหนังสือขาวอมครีม — mockup เท่านั้น (ยังไม่ code) · flow เดิม 3 ขั้น 6 หน้า
ทำให้ไม่เหมือน AI: ฟอนต์ Pridi (เซริฟไทย น้ำหนักเบา) สำหรับหัวเรื่อง/ตัวเลข + Bai Jamjuree สำหรับเนื้อ แทน Mitr/Inter · ขั้นตอน 3 ขั้นเป็น 'เส้นทางเดินป่า' หมุดกลมเชื่อมด้วยเส้นประ (ทำแล้ว = มอส ✓ · ปัจจุบัน = แสงเขา · ถัดไป = หมุดประ) · ความคืบหน้าทุกจุดเป็นเส้นทางประ ๆ มีหมุดวิ่ง ไม่ใช่แถบทึบ · เวลาของแบบอยู่บนป้ายเล็กแบบป้ายบอกทาง · แบบที่ตัดเสร็จขึ้นป้าย 'ถึงแล้ว' · ไอคอนเส้นเดียว ไม่มีอีโมจิ · มุมโค้ง 14 ไม่ใช่เม็ดยา
ปุ่มปรับแต่งใช้กติกาจาก v5 รอบแก้: ปุ่มเลือกค่าแบ่งช่องเท่ากันสูง 44 · สวิตช์ใหญ่ 52×28 · ป้ายค่าที่เลือกทุกแผง · ตัวเลขใช้ − / + · ตำแหน่ง 3×3
โทเคน: ท้องฟ้า #0b1626 → #15304a → #2d5570 · เขา #2a4d63 / #1e3a49 / #173029 · ป่า #0f231c / #0b1913 · แผง rgba(12,27,22,.74) blur 10 · ร่อง rgba(7,17,14,.62) · เส้น rgba(168,196,172,.16) · ตัวหนังสือ #eef1e6 จาง #9db0a0 · แอกเซนต์ #f0b25c · มอส #3d6b55 · Pridi 300/400 + Bai Jamjuree 400–700
สิ่งที่เอนจินยังไม่มี: variants · autofx · recut (ดูโน้ตหัว v4/v5)"""

def write_pages():
    for k, v in PAGES.items():
        open(f"{k}.dc.html", "w", encoding="utf-8").write(page(v))
    print("ok", list(PAGES))

def merge_canvas(path):
    c = json.load(open(path, encoding="utf-8"))
    c["artboards"] = [a for a in c.get("artboards", []) if a.get("page") != PAGE]
    c["annotations"] = [n for n in c.get("annotations", []) if n.get("page") != PAGE]
    c["pages"] = [p for p in c.get("pages", []) if p["id"] != PAGE]
    c["pages"].insert(0, {"id": PAGE, "name": PAGE_NAME})
    for stem, title, x, y, note in BOARDS:
        c["artboards"].append({"file": f"{stem}.dc.html", "x": x, "y": y, "w": 1440, "h": 900, "title": title, "page": PAGE})
        c["annotations"].append({"id": f"b7-{stem}", "x": x, "y": y - 300, "w": 1440, "text": note, "page": PAGE})
    c["annotations"].append({"id": "b7-head", "x": 0, "y": -620, "w": 3000, "text": HEAD, "page": PAGE})
    c["launch"] = {"view": "canvas", "page": PAGE}
    json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("canvas merged:", path)

if __name__ == "__main__":
    write_pages()
    if "--canvas" in sys.argv:
        merge_canvas(sys.argv[sys.argv.index("--canvas") + 1])
