# v6 · ท้องฟ้า × ป่าไม้ (sky × forest) — ฟ้าค่ำไล่โทนจากบนลงล่าง แสงอุ่นที่ขอบฟ้า · แนวสนเงาซ้อน 3 ชั้น + หมอกบาง ที่ตีนหน้า
# ต่อจากภาษาภาพของ v4 (gen_blue.py) แต่ให้ "มือทำ" กว่า: ขั้นเป็นเส้นทางเดินป่า · เกรนฟิล์ม · ดาวจาง · ใบไม้เป็นตรา
# ควบคุมให้ใช้ง่าย (กติกาจากรอบ v5): ปุ่มเลือกค่าเป็นช่องเท่ากันสูง 44 · สวิตช์ใหญ่มี ON/OFF · ตัวเลขใช้ − / + · ตำแหน่งซับ 3×3
# mockup เท่านั้น ยังไม่ใช่โค้ดจริง
#
# ใช้:  python3 gen_v6.py [--canvas path/to/canvas.json]
#   เขียน F1 F2 F2Custom F2Run F3 F3Edit .dc.html ลงโฟลเดอร์ปัจจุบัน
#   ถ้าส่ง --canvas จะลบของเดิมของหน้า page-6 แล้วเพิ่มอาร์ตบอร์ด + โน้ตของหน้านี้เข้าไปใหม่
import json, sys, random

TEXT, MUTED, ACC, INK, WARM = "#f0f4ea", "#9db3a6", "#b9e37c", "#0b1a14", "#ffcf7a"
CREAM = "#f2f0e4"
SKY = "linear-gradient(180deg,#070f1f 0%,#0f2442 34%,#173f5c 62%,#1e5a68 82%,#2b6b66 100%)"
PAGE = "page-6"
PAGE_NAME = "v6 · ท้องฟ้า × ป่าไม้ · 3 ขั้น · 6 หน้า"

G_BG, G_LINE = "rgba(214,232,210,.06)", "rgba(214,232,210,.12)"

CSS = f"""
body{{margin:0;background:#0f2442;color:{TEXT};font-family:"Mitr","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13.5px;line-height:1.4;font-weight:300}}
a{{color:{ACC}}}a:hover{{color:#d9f3ad}}
b,strong{{font-weight:500}}
.g{{background:{G_BG};border:1px solid {G_LINE};border-radius:16px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}}
.hl{{border-top:1px solid rgba(214,232,210,.09)}}
.muted{{color:{MUTED}}}
.cap{{color:rgba(240,244,234,.80);text-shadow:0 1px 14px rgba(7,15,31,.95),0 0 4px rgba(7,15,31,.9)}}
.small{{font-size:12px}}
.h1{{font-size:30px;font-weight:300;letter-spacing:-.01em;line-height:1.1}}
.h2{{font-size:17px;font-weight:400}}
.num{{font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.02em}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 20px;border-radius:999px;background:rgba(214,232,210,.08);border:1px solid rgba(214,232,210,.14);color:{TEXT};font-size:13.5px;font-weight:400;white-space:nowrap}}
.btn.pri{{background:{CREAM};border-color:{CREAM};color:{INK};font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.28)}}
.btn.lg{{height:52px;padding:0 28px;font-size:15px}}
.btn.sm{{height:34px;padding:0 14px;font-size:12.5px}}
.btn.ic{{width:44px;padding:0}}
.opt{{display:inline-flex;gap:18px;align-items:center}}
.opt span{{color:{MUTED};padding:4px 0;border-bottom:1.5px solid transparent;white-space:nowrap}}
.opt span.on{{color:{TEXT};border-color:{ACC}}}
.seg{{display:grid;gap:6px}}
.seg span{{height:44px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:12px;background:rgba(214,232,210,.05);border:1px solid rgba(214,232,210,.13);color:{MUTED};white-space:nowrap;font-size:13px;padding:0 8px;min-width:0}}
.seg span.on{{color:{TEXT};border-color:{ACC};background:rgba(185,227,124,.10);box-shadow:inset 0 0 0 1px {ACC}}}
.seg.col{{grid-template-columns:1fr}}.seg.col span{{justify-content:flex-start;padding:0 14px}}
.sw{{width:56px;height:30px;border-radius:999px;background:rgba(214,232,210,.16);position:relative;display:inline-flex;align-items:center;flex-shrink:0;font-size:9.5px;font-weight:500;letter-spacing:.08em}}
.sw i{{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:999px;background:{TEXT}}}
.sw b{{position:absolute;top:0;bottom:0;display:inline-flex;align-items:center;font-weight:500}}
.sw.on{{background:{ACC}}}.sw.on i{{left:29px;background:{INK}}}
.stp{{display:inline-flex;align-items:center;height:44px;border-radius:12px;border:1px solid rgba(214,232,210,.13);background:rgba(214,232,210,.05);overflow:hidden}}
.stp .k{{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;color:{TEXT}}}
.stp .v{{min-width:52px;text-align:center;font-size:17px;border-left:1px solid rgba(214,232,210,.13);border-right:1px solid rgba(214,232,210,.13);height:44px;display:inline-flex;align-items:center;justify-content:center}}
.pos{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:108px}}
.pos span{{height:32px;border-radius:6px;background:rgba(214,232,210,.06);border:1px solid rgba(214,232,210,.12)}}
.pos span.on{{background:rgba(185,227,124,.16);border-color:{ACC};box-shadow:inset 0 0 0 1px {ACC}}}
.row{{display:grid;grid-template-columns:56px 1fr auto;align-items:center;gap:14px;padding:11px 0}}
.row+.row{{border-top:1px solid rgba(214,232,210,.09)}}
.thumb{{position:relative;border-radius:14px;overflow:hidden;background:#000}}.thumb img{{width:100%;height:100%;object-fit:cover;display:block}}
.scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,15,31,.10) 0%,rgba(7,15,31,0) 35%,rgba(7,15,31,.80) 100%)}}
.card{{position:relative;border-radius:16px;overflow:hidden;background:#000;border:1px solid rgba(214,232,210,.12)}}
.card.sel{{box-shadow:0 0 0 1.5px {ACC},0 0 32px rgba(185,227,124,.26)}}
.card.dim{{opacity:.38}}
.bar{{height:3px;border-radius:999px;background:rgba(214,232,210,.16);overflow:hidden;position:relative}}.bar i{{position:absolute;left:0;top:0;bottom:0;background:{ACC};border-radius:999px}}
.dot{{width:7px;height:7px;border-radius:999px;background:rgba(214,232,210,.2);flex-shrink:0}}.dot.on{{background:{ACC};box-shadow:0 0 8px {ACC}}}
.sub{{position:absolute;left:8%;right:8%;bottom:14%;text-align:center;font-size:12px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 3px #000,0 0 6px #000;line-height:1.3}}
.hook{{position:absolute;left:8%;right:8%;top:12%;text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 4px #000}}
.hook em{{font-style:normal;color:{WARM}}}
.tab{{display:inline-flex;align-items:baseline;gap:8px;color:{MUTED};padding:6px 0;border-bottom:1.5px solid transparent;white-space:nowrap}}
.tab.on{{color:{TEXT};border-color:{ACC}}}
.tab b{{font-weight:400;color:inherit}}
.tab .cnt{{font-size:11.5px;color:{MUTED}}}
.node{{display:inline-flex;align-items:center;gap:9px;color:{MUTED};white-space:nowrap}}
.node i{{width:22px;height:22px;border-radius:999px;border:1.5px solid rgba(214,232,210,.28);display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:500}}
.node.on{{color:{TEXT}}}.node.on i{{border-color:{ACC};color:{ACC};box-shadow:0 0 10px rgba(185,227,124,.35)}}
.node.done{{color:{TEXT}}}.node.done i{{background:{ACC};border-color:{ACC}}}
.trail{{width:38px;border-top:1.5px dashed rgba(214,232,210,.28);margin:0 12px}}
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
        "leaf": '<path d="M13 3c-6 0-9.5 3-9.5 8.5 0 .6.1 1.1.2 1.5C9.5 13 13 9.5 13 3z"/><path d="M3.7 13c1.8-3.4 4.2-6 7.3-8"/>',
    }[name]
    return f'<svg width="{size}" height="{size}" viewBox="0 0 16 16" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">{p}</svg>'

# ───────── ป่าไม้: แนวสนเงา 3 ชั้น ─────────
def pine(cx, base, h, w):
    pts = [(cx-w/2,base),(cx-w*.34,base-h*.33),(cx-w*.40,base-h*.33),(cx-w*.22,base-h*.62),(cx-w*.27,base-h*.62),
           (cx,base-h),(cx+w*.27,base-h*.62),(cx+w*.22,base-h*.62),(cx+w*.40,base-h*.33),(cx+w*.34,base-h*.33),(cx+w/2,base)]
    return " ".join(f"{x:.0f},{y:.0f}" for x, y in pts)

def treeline(seed, color, base, hmin, hmax, step, opacity=1.0, dip=0.0):
    rnd = random.Random(seed); polys = []; x = -30
    while x < 1480:
        h = rnd.uniform(hmin, hmax)
        # ลดความสูงตรงกลาง (dip) ให้แถวปุ่มด้านล่างโล่ง
        t = abs(x - 720) / 720
        h *= 1 - dip * max(0.0, 1 - t * t * 1.6)
        w = h * rnd.uniform(.42, .58)
        polys.append(f'<polygon points="{pine(x, base, h, w)}"/>')
        x += step * rnd.uniform(.55, 1.25)
    return f'<g fill="{color}" opacity="{opacity}">{"".join(polys)}<rect x="0" y="{base-1}" width="1440" height="{260-base+1}"/></g>'

def stars(seed, n=26):
    rnd = random.Random(seed); out = ""
    for _ in range(n):
        x, y, r, o = rnd.uniform(0, 1440), rnd.uniform(8, 210), rnd.choice([.7, .9, 1.2]), rnd.uniform(.25, .6)
        out += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#f0f4ea" opacity="{o:.2f}"/>'
    return f'<svg viewBox="0 0 1440 220" width="1440" height="220" style="position:absolute;left:0;top:0;pointer-events:none;">{out}</svg>'

FOREST = f"""<div style="position:absolute;left:0;right:0;bottom:0;height:300px;background:radial-gradient(70% 70% at 50% 100%,rgba(255,186,110,.22),rgba(255,186,110,0) 70%);pointer-events:none;"></div>
<svg viewBox="0 0 1440 260" width="1440" height="260" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;pointer-events:none;">
{treeline(11, "#2a5f5c", 214, 34, 78, 24, .62, .25)}
<rect x="0" y="176" width="1440" height="84" fill="url(#mist)"/>
{treeline(23, "#173f36", 236, 52, 118, 32, 1.0, .40)}
{treeline(37, "#0a2620", 260, 70, 160, 44, 1.0, .62)}
<defs><linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6dc" stop-opacity="0"/><stop offset=".5" stop-color="#cfe6dc" stop-opacity=".10"/><stop offset="1" stop-color="#cfe6dc" stop-opacity="0"/></linearGradient></defs>
</svg>"""

GRAIN = """<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.05;mix-blend-mode:overlay;pointer-events:none;"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#grain)"/></svg>"""

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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@200;300;400;500;600&display=swap">
  <style>{CSS}</style>
</helmet>
<div style="width:1440px;height:900px;background:{SKY};display:flex;flex-direction:column;overflow:hidden;position:relative;">
{stars(5)}
{FOREST}
{GRAIN}
{body}
</div>
</x-dc>
</body>
</html>"""

def topbar(step, right=""):
    labels = [("ใส่วิดีโอ", 1), ("สไตล์", 2), ("ส่งออก", 3)]
    steps = ""
    for lbl, n in labels:
        if n < step:
            steps += f'<span class="node done"><i>{ico("check",12,INK)}</i>{lbl}</span>'
        elif n == step:
            steps += f'<span class="node on"><i>{n}</i>{lbl}</span>'
        else:
            steps += f'<span class="node"><i>{n}</i>{lbl}</span>'
        if n < 3: steps += '<span class="trail"></span>'
    proj = '' if step == 1 else f'<span class="muted small" style="display:inline-flex;align-items:center;gap:8px;">{ico("film",13,MUTED)}IMG_1234.MOV · 02:14 · +1 ไฟล์</span>'
    return f"""<div style="height:68px;display:flex;align-items:center;gap:22px;padding:0 36px;flex-shrink:0;position:relative;">
    <span style="font-size:17px;font-weight:500;letter-spacing:.02em;display:inline-flex;align-items:center;gap:8px;">{ico("leaf",16,ACC)}vcut</span>
    {proj}
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;">{steps}</div>
    <div style="flex:1;"></div>
    {right or '<span style="width:170px;"></span>'}
  </div>"""

# ───────── ตัวควบคุมที่ใช้ง่าย ─────────
def seg(items, on, cols=None, col=False):
    if isinstance(on, str): on = [on]
    cols = cols or len(items)
    inner = "".join(f'<span class="{"on" if it in on else ""}">{ico("check",12,ACC) if it in on else ""}{it}</span>' for it in items)
    return f'<div class="seg{" col" if col else ""}" style="{"" if col else f"grid-template-columns:repeat({cols},minmax(0,1fr));"}">{inner}</div>'

def sw(on):
    return f'<span class="sw on"><b style="left:10px;color:{INK};">ON</b><i></i></span>' if on else f'<span class="sw"><b style="right:7px;color:{MUTED};">OFF</b><i></i></span>'

def swrow(label, on, note=""):
    return f'<div style="display:flex;align-items:center;gap:12px;">{sw(on)}<span>{label}</span>{f"<span class=\"muted small\">{note}</span>" if note else ""}</div>'

def stepper(v, unit=""):
    return f'<span class="stp"><span class="k">−</span><span class="v num">{v}{f"<span class=\"muted small\" style=\"margin-left:3px;\">{unit}</span>" if unit else ""}</span><span class="k">+</span></span>'

def posgrid(on=8):
    return '<div class="pos">' + "".join(f'<span class="{"on" if i == on else ""}"></span>' for i in range(9)) + '</div>'

def opts(items, on):
    if isinstance(on, str): on = [on]
    return '<div class="opt">' + "".join(f'<span class="{"on" if it in on else ""}">{it}</span>' for it in items) + '</div>'

# ───────── ข้อมูลร่วม ─────────
STYLES = [
    ("A", "ปิดการขาย / แนะนำช่อง", "ช็อต 1.7–2.0 วิ · ช้า → รัว → ช้า", "ซับ · HOOK + การ์ดปิด · เพลงตามบีต · ยิงรัวช่วงกลาง", "f57.jpg"),
    ("B", "โชว์หลักฐาน", "ช็อต 2.4 วิ · เลขนับขึ้น", "ซับ · HOOK + การ์ดปิด · เลขนับขึ้น · เพลงเบา", "f14.jpg"),
    ("C", "สอนกรอบวิธีคิด", "ช็อต 5.0 วิ · เน้นเสียงพูด", "ซับทีละคำ · HOOK · ผังนีออน · เพลงเบา", "f88.jpg"),
    ("D", "Before | After", "ช็อต 1.9–2.8 วิ · ครอป 9:16", "ซับ · การ์ดปิด · เพลงตามบีต · แยกจอก่อน/หลัง", "f116.jpg"),
]

def style_cards(selected, dim=False, h=272):
    cards = ""
    for letter, label, hint, layers, img in STYLES:
        sel = " sel" if selected == letter else ""
        cards += f"""<div class="card{sel}{' dim' if dim else ''}" style="height:{h}px;">
          <img src="{img}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">
          <div class="scrim"></div>
          <span class="num" style="position:absolute;left:16px;top:8px;font-size:44px;color:{ACC if sel else 'rgba(240,244,234,.85)'};">{letter}</span>
          {f'<span style="position:absolute;right:12px;top:12px;width:26px;height:26px;border-radius:999px;background:{ACC};display:inline-flex;align-items:center;justify-content:center;">{ico("check",14,INK)}</span>' if sel else ''}
          <div style="position:absolute;left:16px;right:16px;bottom:14px;display:flex;flex-direction:column;gap:3px;">
            <span style="font-size:15px;font-weight:400;">{label}</span>
            <span class="small" style="color:rgba(240,244,234,.72);">{hint}</span>
          </div>
        </div>"""
    sel = " sel" if selected == "X" else ""
    cards += f"""<div class="card{sel}{' dim' if dim else ''}" style="height:{h}px;background:rgba(214,232,210,.04);border-style:dashed;display:flex;flex-direction:column;justify-content:space-between;padding:12px 16px 14px;">
          <span class="num" style="font-size:44px;color:{ACC if sel else 'rgba(240,244,234,.85)'};display:inline-flex;align-items:center;height:52px;">{ico("edit",26,ACC if sel else "rgba(240,244,234,.85)")}</span>
          <div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:15px;font-weight:400;">กำหนดเอง</span><span class="small muted">เลือกทุกอย่างเอง 6 ตัวเลือก</span></div>
        </div>"""
    return f'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;">{cards}</div>'

def layer_row(icon, name, desc, on=True, action="แก้", muted=False):
    op = "opacity:.55;" if muted else ""
    return f'<div class="row" style="{op}">{sw(on)}<div style="display:flex;flex-direction:column;gap:1px;min-width:0;"><span style="display:inline-flex;align-items:center;gap:8px;font-weight:400;">{ico(icon,14,ACC if on else MUTED)}{name}</span><span class="muted small">{desc}</span></div><span class="btn sm">{action}{ico("chev",11)}</span></div>'

# ───────── F1 · ① ใส่วิดีโอ ─────────
F1 = topbar(1) + f"""
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:0 0 70px;position:relative;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><span class="h1" style="font-size:40px;">ใส่วิดีโอ</span><span class="muted">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอนก็ได้ เอนจินปรับเป็น 9:16 ให้เอง</span></div>
    <div class="g" style="width:820px;padding:8px;display:flex;flex-direction:column;">
      <div style="height:210px;border-radius:12px;border:1px dashed rgba(185,227,124,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
        {ico("upload",28,ACC)}
        <span style="font-size:16px;">ลากวิดีโอมาวางที่นี่</span>
        <div style="display:flex;gap:10px;"><span class="btn">{ico("film",14)}เลือกไฟล์…</span><span class="btn" style="background:transparent;">{ico("folder",14)}ลิงก์โฟลเดอร์</span></div>
      </div>
      <div style="padding:6px 16px 4px;display:flex;flex-direction:column;">
        <div style="display:grid;grid-template-columns:40px 1fr 190px 24px;gap:16px;align-items:center;padding:12px 0;">
          <div class="thumb" style="width:40px;height:40px;border-radius:10px;"><img src="f57.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;gap:1px;"><span style="font-weight:400;">IMG_1234.MOV</span><span class="muted small">02:14 · 1126×1788 · 291 MB</span></div>
          <div style="display:flex;flex-direction:column;gap:6px;"><span class="small" style="display:inline-flex;align-items:center;gap:7px;color:{ACC};">{ico("mic",12,ACC)}ถอดเสียง 18 / 26</span><span class="bar"><i style="width:69%;"></i></span></div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
        <div class="hl" style="display:grid;grid-template-columns:40px 1fr 190px 24px;gap:16px;align-items:center;padding:12px 0;">
          <div class="thumb" style="width:40px;height:40px;border-radius:10px;"><img src="f116.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;gap:1px;"><span style="font-weight:400;">IMG_1240.MOV</span><span class="muted small">01:03 · 1920×1080 · 140 MB · จะครอปเป็น 9:16</span></div>
          <div style="display:flex;flex-direction:column;gap:6px;"><span class="small muted">อัปโหลด 62%</span><span class="bar"><i style="width:62%;background:{MUTED};"></i></span></div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
      </div>
    </div>
    <div style="width:820px;display:flex;align-items:center;gap:16px;">
      <span class="cap small">เอนจินเริ่มถอดเสียงทันทีที่วางไฟล์ ทุกสไตล์ทุกแบบใช้ร่วมกัน · ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">เลือกสไตล์{ico("chev",14,INK)}</span>
    </div>
  </div>"""

# ───────── F2 · ② สไตล์ ─────────
def f2_shell(selected, lower, dim=False, right_top="", h=272):
    return topbar(2, right_top) + f"""
  <div style="flex:1;display:flex;flex-direction:column;gap:18px;padding:16px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกสไตล์</span><span class="muted">4 สูตรจากเอนจิน เลือกชั้นแต่งให้เอง · หรือกำหนดเองทั้งหมด</span></div>
    {style_cards(selected, dim, h)}
    {lower}
  </div>"""

def layer_cell(icon, name, desc, off=False):
    return f'<div style="display:flex;gap:12px;align-items:flex-start;{"opacity:.45;" if off else ""}">{ico(icon,16,MUTED if off else ACC)}<div style="display:flex;flex-direction:column;gap:2px;"><span style="font-weight:400;">{name}</span><span class="muted small">{desc}</span></div></div>'

F2_LOWER = f"""<div class="g" style="padding:22px 26px;display:flex;flex-direction:column;gap:18px;">
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
      <span class="cap small">ตัดให้ 6 แบบ ต่างกันที่ความยาวและจังหวะ · 1080×1920 · −14 LUFS · ราว 1 นาที</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">ตัดให้เลย · 6 แบบ{ico("chev",14,INK)}</span>
    </div>"""
F2 = f2_shell("A", F2_LOWER, h=400)

# ───────── F2Custom · ② กำหนดเอง ─────────
def opt_card(icon, title, on, body, note=""):
    return f"""<div class="g" style="padding:14px 16px 14px;display:flex;flex-direction:column;gap:10px;border-color:transparent;background:rgba(214,232,210,.05);{'opacity:.55;' if not on else ''}">
        <div style="display:flex;align-items:center;gap:10px;">{ico(icon,15,ACC if on else MUTED)}<span style="font-weight:400;">{title}</span><div style="flex:1;"></div>{sw(on)}</div>
        {body}
        {f'<span class="muted small">{note}</span>' if note else ''}
      </div>"""

STK = "".join(f'<span style="width:56px;height:44px;border-radius:10px;background:rgba(214,232,210,.06);border:1px solid rgba(214,232,210,.12);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;"><img src="{s}" alt="" style="max-width:46px;max-height:34px;"></span>' for s in ["st-4k.png","st-bell.png","st-balloon.png","st-banner.png"])
F2C_LOWER = f"""<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;">
      {opt_card("clock","ระยะเวลา",True, seg(["30 วิ","45 วิ","60 วิ","ทั้งคลิป"],"45 วิ"), "เอนจินยังตัดครบ 6 แบบ · ค่านี้คือแบบที่เลือกไว้ก่อน")}
      {opt_card("text","ซับ",True, seg(["ทั้งบรรทัด","ทีละคำ"],"ทั้งบรรทัด"), "ขาวขอบดำ กลางล่าง · แก้คำผิดได้หลังตัด")}
      {opt_card("spark","HOOK + การ์ดปิด",True, f'<div style="display:flex;flex-direction:column;gap:8px;">{swrow("HOOK จากประโยคแรก",True)}{swrow("การ์ดปิด 4 วิ",True,"@ช่อง")}</div>', "พิมพ์ข้อความเองได้ในขั้นส่งออก")}
      {opt_card("music","เพลงตามจังหวะ",True, seg(["สนุก","ชิล","ดราม่า","โลไฟ"],"สนุก") + f'<div style="display:flex;gap:22px;">{swrow("รอยตัดเข้าบีต",True)}{swrow("ลดเสียงตอนพูด",True)}</div>')}
      {opt_card("sticker","สติกเกอร์ / ภาพซ้อน",False, f'<div style="display:flex;gap:8px;">{STK}<span style="width:56px;height:44px;border-radius:10px;border:1px dashed rgba(214,232,210,.22);display:inline-flex;align-items:center;justify-content:center;">{ico("plus",14,MUTED)}</span></div>', "คลัง 200 ชิ้น · อัปโหลดเองได้")}
      {opt_card("fx","เอฟเฟกต์รายช็อต",True, seg(["ซูมไล่","punch","ยิงรัว","glitch","ขาวดำ"],["ซูมไล่","punch"]), "เลือกได้หลายอย่าง · ปรับทีละช็อตได้หลังตัด")}
    </div>
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;gap:18px;">
      <span class="cap small">45 วิ · ซับทั้งบรรทัด · HOOK + การ์ดปิด · เพลงสนุกตามบีต · ซูมไล่ punch · ราว 1 นาที</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">ตัดให้เลย · 6 แบบ{ico("chev",14,INK)}</span>
    </div>"""
F2C = f2_shell("X", F2C_LOWER, h=176)

# ───────── F2Run · ② กำลังตัด ─────────
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
            right = f'<span class="small" style="display:inline-flex;align-items:center;gap:7px;color:{ACC};">{ico("check",12,ACC)}เสร็จ {d}</span><span class="btn sm">{ico("play",11)}ดู</span>'
        elif st == "run":
            right = f'<div style="width:150px;display:flex;flex-direction:column;gap:6px;"><span class="muted small">เรนเดอร์ 7 / 11 ช็อต</span><span class="bar"><i style="width:63%;"></i></span></div><span style="width:58px;"></span>'
        else:
            right = f'<span class="muted small">รอ</span><span style="width:58px;"></span>'
        out += f'<div style="display:grid;grid-template-columns:30px 1fr 170px auto;gap:14px;align-items:center;padding:11px 0;{"" if i == 0 else "border-top:1px solid rgba(214,232,210,.09);"}{"opacity:.55;" if st == "wait" else ""}"><span class="muted small num">0{i+1}</span><div style="display:flex;flex-direction:column;gap:0;"><span style="font-weight:400;">{n}</span><span class="muted small">{meta}</span></div>{right}</div>'
    return out

F2R_LOWER = f"""<div class="g" style="flex:1;display:grid;grid-template-columns:1fr 300px;gap:40px;padding:22px 28px;min-height:0;">
      <div style="display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:baseline;gap:14px;padding-bottom:6px;"><span class="h2">กำลังตัด · สูตร A</span><span class="muted small">ดูแบบที่เสร็จแล้วได้เลย ไม่ต้องรอครบ</span></div>
        {run_rows()}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;border-left:1px solid rgba(214,232,210,.09);padding-left:32px;">
        <div style="display:flex;align-items:baseline;gap:10px;"><span class="num" style="font-size:56px;line-height:1;">2<span class="muted" style="font-size:26px;"> / 6</span></span><div style="flex:1;"></div><span class="muted small">เหลือ ~0:40</span></div>
        <span class="bar"><i style="width:58%;"></i></span>
        <div style="display:flex;flex-direction:column;gap:10px;padding-top:6px;">
          <div style="display:flex;align-items:center;gap:10px;">{ico("check",13,ACC)}<span>ถอดเสียง</span><div style="flex:1;"></div><span class="muted small">26 / 26</span></div>
          <div style="display:flex;align-items:center;gap:10px;">{ico("check",13,ACC)}<span>ตัดชิ้น · เลือกช็อต</span><div style="flex:1;"></div><span class="muted small">18 ชิ้น</span></div>
          <div style="display:flex;align-items:center;gap:10px;"><span class="dot on"></span><span>เรนเดอร์ 6 แบบ</span><div style="flex:1;"></div><span class="muted small">2 / 6</span></div>
          <div style="display:flex;align-items:center;gap:10px;opacity:.55;"><span class="dot"></span><span>แต่ง ซับ · HOOK · เพลง · เอฟเฟกต์</span><div style="flex:1;"></div><span class="muted small">รอ</span></div>
        </div>
        <div style="flex:1;"></div>
        <div style="display:flex;gap:10px;"><span class="btn">{ico("stop",13)}หยุด</span><span class="btn pri" style="flex:1;">ดู 2 แบบที่เสร็จ{ico("chev",13,INK)}</span></div>
        <span class="muted small">เสร็จครบแล้วจะพาไปขั้นส่งออกให้เอง</span>
      </div>
    </div>"""
F2R = f2_shell("A", F2R_LOWER, dim=True, right_top=f'<span class="small" style="width:170px;display:inline-flex;justify-content:flex-end;align-items:center;gap:8px;color:{ACC};"><span class="dot on"></span>กำลังตัด 2 / 6</span>', h=200)

# ───────── F3 · ③ เลือกแบบ · ส่งออก ─────────
def style_tabs(active="A"):
    tabs = ""
    for letter, label, _, _, _ in STYLES:
        if letter == active:
            tabs += f'<span class="tab on"><b>{letter}</b>{label}<span class="cnt">6 แบบ</span></span>'
        else:
            tabs += f'<span class="tab"><b>{letter}</b>{label}<span class="cnt" style="display:inline-flex;align-items:center;gap:3px;">ตัดเพิ่ม{ico("chev",10,MUTED)}</span></span>'
    tabs += f'<span class="tab">กำหนดเอง<span class="cnt" style="display:inline-flex;align-items:center;gap:3px;">ตัดเพิ่ม{ico("chev",10,MUTED)}</span></span>'
    return f'<div style="display:flex;gap:26px;">{tabs}</div>'

def variant_cards(sel_idx=1):
    imgs = ["f57.jpg", "f14.jpg", "f88.jpg", "f116.jpg", "f2.jpg", "f57.jpg"]
    out = ""
    for i, (n, d, meta, _) in enumerate(VARIANTS):
        sel = " sel" if i == sel_idx else ""
        overlay = '<span class="hook">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="bottom:34%;">น้ำตกที่ไกล ยังไม่ไกลเท่า</span>' if i == sel_idx else ''
        out += f"""<div class="card{sel}">
          <img src="{imgs[i]}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">
          <div class="scrim"></div>{overlay}
          <span class="num" style="position:absolute;right:14px;top:8px;font-size:30px;color:rgba(240,244,234,.9);">{d}</span>
          {f'<span style="position:absolute;left:12px;top:12px;width:26px;height:26px;border-radius:999px;background:{ACC};display:inline-flex;align-items:center;justify-content:center;">{ico("check",14,INK)}</span>' if sel else ''}
          <div style="position:absolute;left:14px;right:14px;bottom:12px;display:flex;flex-direction:column;gap:1px;"><span style="font-size:15px;font-weight:400;">{n}</span><span class="small" style="color:rgba(240,244,234,.72);">{meta}</span></div>
        </div>"""
    return f'<div style="flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:16px;min-height:0;">{out}</div>'

F3 = topbar(3, f'<span class="muted small" style="width:170px;text-align:right;">ตัดเสร็จ 6 / 6 · 0:58</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 410px;gap:28px;padding:12px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">
      <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกแบบ</span><span class="muted">สไตล์ที่ตัดแล้วอยู่ในแท็บ · กดสไตล์อื่นเพื่อตัดเพิ่ม</span></div>
      {style_tabs("A")}
      {variant_cards(1)}
      <div style="display:flex;align-items:center;gap:14px;"><span class="btn sm" style="background:transparent;">{ico("back",12)}เปลี่ยนสไตล์</span><span class="cap small">6 แบบใช้ชั้นแต่งของสูตร A เหมือนกัน ต่างกันที่การตัด</span></div>
    </div>
    <div class="g" style="display:flex;flex-direction:column;padding:18px 22px;min-height:0;background:rgba(7,15,31,.42);">
      <div style="display:flex;gap:16px;">
        <div class="thumb" style="width:124px;height:220px;flex-shrink:0;"><img src="f14.jpg" alt=""><span class="hook" style="font-size:11px;">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="font-size:10.5px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;">
          <span class="num" style="font-size:34px;line-height:1;">A · 45 <span class="muted" style="font-size:16px;">วิ</span></span>
          <span class="muted small">8 ช็อต · 1080×1920 · −14 LUFS</span>
          <div style="flex:1;"></div>
          <div style="display:flex;gap:6px;align-items:center;"><span class="btn sm ic" style="width:34px;">{ico("prev",12)}</span><span class="btn sm pri" style="flex:1;box-shadow:none;">{ico("play",12,INK)}เล่น</span><span class="btn sm ic" style="width:34px;">{ico("next",12)}</span></div>
          <span class="bar"><i style="width:22%;"></i></span>
          <div style="display:flex;justify-content:space-between;"><span class="muted small">0:10 / 0:45</span><span class="small" style="color:{ACC};display:inline-flex;align-items:center;gap:3px;">ไทม์ไลน์{ico("chev",10,ACC)}</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;padding:14px 0 0;"><span style="font-weight:400;">ชั้นแต่งของแบบนี้</span><span class="muted small">เปิด/ปิดได้ · เรนเดอร์ใหม่เฉพาะแบบนี้ ~45 วิ</span></div>
      {layer_row("text","ซับ","12 บรรทัด · 2 ไม่มั่นใจ")}
      {layer_row("spark","HOOK + การ์ดปิด","HOOK 1 · การ์ดปิด 1")}
      {layer_row("music","เพลงตามจังหวะ","สนุก 98 BPM · ตามบีต")}
      {layer_row("sticker","สติกเกอร์ / ภาพซ้อน","ยังไม่มี", on=False, action="เพิ่ม")}
      {layer_row("fx","เอฟเฟกต์รายช็อต","ซูมไล่ · punch · 3 ช็อต")}
      <div style="flex:1;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;padding-top:12px;">
        {seg(["ภาพ+เสียง","+ ซับ","+ ทุกชั้น"],"+ ทุกชั้น")}
        <div style="display:flex;align-items:center;gap:10px;"><span class="btn pri lg" style="flex:1;">ส่งออก · A · 45 วิ</span><span class="btn lg ic" style="width:52px;">{ico("folder",15)}</span></div>
        <span class="muted small">~/Movies/vcut/IMG_1234/A-45s.mp4 · ~1:30</span>
      </div>
    </div>
  </div>"""

# ───────── F3Edit · ③ แก้ชั้นแต่ง (ลิ้นชัก) ─────────
SUBLINES = [("0:00","คลิปของคุณดูเจ๋งได้เนี่ย",.96),("0:03","ถ้าตัดให้ถูกจังหวะ",.91),("0:06","วันนี้จะพาไปดู",.88),("0:08","น้ำตกที่ไกล ยังไม่ไกลเท่า",.94),("0:11","บันไดที่ต้องเจอ",.57),("0:13","สองกิโล สิบเจ็ดคุ้ง",.61),("0:16","แต่พอถึงแล้ว",.9),("0:18","คุ้มทุกก้าว",.95)]
def sublist():
    out = ""
    for i, (t, s, c) in enumerate(SUBLINES):
        warn = c < .7
        out += f'<div style="display:grid;grid-template-columns:40px 1fr 56px 22px;gap:12px;align-items:center;padding:9px 0;{"" if i == 0 else "border-top:1px solid rgba(214,232,210,.09);"}"><span class="muted small num">{t}</span><span style="{f"color:{WARM};" if warn else ""}">{s}</span><span class="bar"><i style="width:{int(c*100)}%;{f"background:{WARM};" if warn else ""}"></i></span>{ico("warn",13,WARM) if warn else ico("edit",13,MUTED)}</div>'
    return out

F3E = F3.replace('gap:28px;padding:12px 36px 28px;min-height:0;position:relative;', 'gap:28px;padding:12px 36px 28px;min-height:0;position:relative;opacity:.30;filter:saturate(.5) blur(1px);') + f"""
  <div style="position:absolute;inset:0;background:rgba(7,15,31,.30);"></div>
  <div class="g" style="position:absolute;top:14px;right:14px;bottom:14px;width:680px;display:flex;flex-direction:column;background:rgba(10,24,40,.86);">
    <div style="display:flex;align-items:center;gap:14px;padding:22px 26px 10px;"><span class="h2" style="font-size:20px;font-weight:300;">แก้ชั้นแต่ง · A · 45 วิ</span><div style="flex:1;"></div><span class="btn ic" style="background:transparent;border-color:transparent;">{ico("x",16,MUTED)}</span></div>
    <div style="padding:0 26px 14px;">{opts(["ซับ","HOOK / การ์ดปิด","เพลง","สติกเกอร์","เอฟเฟกต์"],"ซับ")}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 200px;gap:26px;padding:12px 26px 0;min-height:0;border-top:1px solid rgba(214,232,210,.09);">
      <div style="display:flex;flex-direction:column;min-height:0;gap:8px;">
        {seg(["ทั้งบรรทัด","ทีละคำ","ปิดซับ"],"ทั้งบรรทัด")}
        <div style="display:flex;align-items:center;gap:10px;padding:4px 0 0;"><span class="muted small">12 บรรทัด</span><div style="flex:1;"></div><span class="small" style="color:{WARM};">2 บรรทัดไม่มั่นใจ · แก้ก่อนเรนเดอร์</span></div>
        {sublist()}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="thumb" style="height:250px;"><img src="f14.jpg" alt=""><span class="sub" style="font-size:12.5px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <span class="muted small">สไตล์ตัวอักษร</span>
        {seg(["หนา ขอบดำ","แผ่นทึบ","เหลืองเน้น"],"หนา ขอบดำ",col=True)}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;"><span class="muted small">ขนาด</span>{stepper(54)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;"><span class="muted small">ตำแหน่ง</span>{posgrid(7)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:16px 26px 20px;"><span class="muted small">เรนเดอร์ใหม่เฉพาะแบบ 45 วิ · ~45 วิ</span><div style="flex:1;"></div><span class="btn">ยกเลิก</span><span class="btn pri">บันทึก · เรนเดอร์ใหม่</span></div>
  </div>"""

PAGES = {"F1": F1, "F2": F2, "F2Custom": F2C, "F2Run": F2R, "F3": F3, "F3Edit": F3E}

BOARDS = [  # (stem, title, x, y, note)
    ("F1", "1 · ① ใส่วิดีโอ — วางไฟล์ · ถอดเสียงเริ่มเอง", 0, 0,
     "① ปุ่มมีแค่ เลือกไฟล์ · ลิงก์โฟลเดอร์ · เลือกสไตล์ — วางหลายไฟล์ได้เป็นรายการในแผงเดียว (ไม่มีหน้าคลังคลิป) · วางแล้ว upload → POST /api/setup สร้าง projects/<ชื่อ>.toml → scan → listen อัตโนมัติ · ไฟล์แนวนอนบอกล่วงหน้าว่าจะครอป 9:16\nแถบบน: ขั้น ①②③ เป็น 'เส้นทางเดินป่า' จุดเชื่อมด้วยเส้นประ ทำแล้ว = จุดเต็มเขียวมอส กำลังทำ = วงแหวนเรือง · ตรา = ใบไม้"),
    ("F2", "2 · ② สไตล์ — 4 สูตรจากเอนจิน + กำหนดเอง (เลือก A)", 1560, 0,
     "② การ์ด A–D = RECIPES ใน settings.py (preset tiktok-sell / proof / teach / compare) — การ์ดเป็นภาพเต็ม ตัวอักษรใหญ่ เลือกแล้วมีวงถูกเขียวมอสมุมขวาบน · แถบล่างบอกว่าสูตรจะแต่งอะไร 5 ช่อง ([autofx] ของ preset) อ่านอย่างเดียว · แก้จริงทีละแบบในขั้น ③ · CTA เดียว 'ตัดให้เลย · 6 แบบ' = job quick"),
    ("F2Custom", "3 · ② สไตล์ — กำหนดเอง 6 ตัวเลือก (ควบคุมแบบใช้ง่าย)", 3120, 0,
     "② กำหนดเอง = 6 แผงกระจก แต่ละแผงมีสวิตช์ใหญ่ ON/OFF มุมขวา · เลือกค่าเป็นช่องเท่ากันสูง 44 มีเครื่องหมายถูก (ไม่ใช่ข้อความขีดเส้นใต้แบบ v4 — กติกา 'ใช้ง่าย' จากรอบ v5) · HOOK/การ์ดปิด และ บีต/ลดเสียง เป็นสวิตช์แถว · ตัวเลขละเอียดไปอยู่ในลิ้นชักแก้ของขั้น ③\nสมมติฐาน: 'ระยะเวลา' ของกำหนดเอง = แบบที่ถูกเลือกไว้ก่อนในขั้น ③ ส่วนเอนจินยังตัดครบ 6 แบบเหมือนสูตร A–D"),
    ("F2Run", "4 · ② กำลังตัด — ดูแบบที่เสร็จก่อนได้", 4680, 0,
     "② poll /api/job · การ์ดสไตล์ล็อก (จาง) · แถว 6 แบบขึ้นสถานะทีละแบบ เสร็จแล้วกด 'ดู' ได้เลย · ตัวเลขใหญ่ 2/6 · หยุด = /api/job/stop · เสร็จครบพาไป ③ เอง · ไม่มีหน้า log/ไปป์ไลน์แยก"),
    ("F3", "5 · ③ เลือกแบบ · ส่งออก — แท็บสไตล์ · 6 แบบ · ชั้นแต่งเป็นสวิตช์", 0, 1250,
     "③ แท็บบน = สไตล์ที่ตัดแล้ว (A) · สไตล์อื่น/กำหนดเอง = 'ตัดเพิ่ม ▸' (recut ใช้ listen เดิม) · 6 แบบเป็นการ์ดภาพเต็ม ตัวเลขเวลาใหญ่ (ต่างกันที่ EDL ใช้ชั้นแต่งเดียวกัน) · เลือก 1 → แผงขวา (กระจกเข้มกว่าให้อ่านง่าย): ตัวอย่าง + 'ชั้นแต่งของแบบนี้' 5 แถว แต่ละแถวมีสวิตช์ใหญ่เปิด/ปิด + ปุ่ม 'แก้ ▸' เปิดลิ้นชัก (หน้า 6) · ชนิดส่งออกเป็น 3 ช่องเท่ากัน: ภาพ+เสียง / +ซับ / +ทุกชั้น (build ③ ④ ⑤) · 'ไทม์ไลน์' เป็นลิงก์เล็ก"),
    ("F3Edit", "6 · ③ ลิ้นชักแก้ชั้นแต่ง — ซับ (แท็บอื่น: HOOK · เพลง · สติกเกอร์ · เอฟเฟกต์)", 1560, 1250,
     "③ ลิ้นชักกระจกเดียว 5 แท็บ แทนหน้าแก้ 5 หน้าของ v3-C · โหมดซับเป็น 3 ช่องเท่ากัน · 8 บรรทัด + แถบความมั่นใจ (เหลืองอุ่น = ไม่มั่นใจ แก้ก่อนเรนเดอร์) · สไตล์ตัวอักษร 3 ช่องแนวตั้ง · ขนาดใช้ปุ่ม − / + · ตำแหน่งเป็นตาราง 3×3 กดช่อง · บันทึก = เรนเดอร์ใหม่เฉพาะแบบที่เลือก · แท็บอื่นใช้โครงเดียวกัน (รายการซ้าย · ตัวอย่างขวา)"),
]

HEAD = """v6 · ท้องฟ้า × ป่าไม้ — เอาพื้นฟ้าค่ำไล่โทน + แสงอุ่นขอบฟ้าของ v4 มา แล้วให้ 'ตีนหน้า' เป็นแนวสนเงาซ้อน 3 ชั้น (ไกล–กลาง–ใกล้) มีหมอกบางคั่น ต้นไม้เตี้ยลงตรงกลางให้แถวปุ่มโล่ง · ดาวจางบนฟ้า · เกรนฟิล์มบาง ๆ ทั้งหน้า · ขั้น ①②③ เป็นเส้นทางเดินป่า (จุด + เส้นประ) · ตรา = ใบไม้ — mockup เท่านั้น (ยังไม่ code) · 3 ขั้น 6 หน้า flow เดียวกับ v4/v5
ทำไมไม่ดูเป็น AI: ภาพประกอบเป็นเงาสนที่วาดจากโค้ดไม่ซ้ำกัน (ไม่ใช่การ์ดซ้อนการ์ด) · แอกเซนต์เดียวคือเขียวมอส/หิ่งห้อย ใช้เฉพาะ 'เลือกอยู่/เปิดอยู่' · เหลืองอุ่นเฉพาะคำเตือน/คำเน้น HOOK · ปุ่มหลักครีมกระดาษปุ่มเดียวต่อหน้า · หัวเรื่อง Mitr น้ำหนักเบาตัวใหญ่ ไม่มีชิป ไม่มีขอบซ้ายสี
ใช้ง่าย (กติกาจากรอบ v5): เลือกค่าเป็นช่องเท่ากันสูง 44 มีเครื่องหมายถูก · สวิตช์ใหญ่ 56×30 มีคำ ON/OFF · ตัวเลขใช้ − / + · ตำแหน่งซับ 3×3 · แถวชั้นแต่งในขั้น ③ มีสวิตช์ + ปุ่มแก้ · ปุ่มทุกตัวสูง ≥ 44
โทเคน: ท้องฟ้า #070f1f → #0f2442 → #173f5c → #1e5a68 → #2b6b66 · แสงขอบฟ้า rgba(255,186,110,.22) · สนไกล #2a5f5c .62 · สนกลาง #173f36 · สนใกล้ #0a2620 · หมอก #cfe6dc .10 · กระจก rgba(214,232,210,.06) เส้น .12 มุม 16 blur 14 · ตัวหนังสือ #f0f4ea · จาง #9db3a6 · แอกเซนต์มอส #b9e37c · เหลืองอุ่น #ffcf7a · ปุ่มหลักครีม #f2f0e4 ตัวหนังสือ #0b1a14 · Mitr 300/400/500
สิ่งที่เอนจินยังไม่มี (ต้องทำก่อน code จริง): ตัดหลายแบบต่อสไตล์ (variants) · สูตรเลือกชั้นแต่งให้เอง (autofx) · ตัดเพิ่มสไตล์อื่นโดยใช้ listen เดิม (recut)"""

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
        c["annotations"].append({"id": f"b6-{stem}", "x": x, "y": y - 300, "w": 1440, "text": note, "page": PAGE})
    c["annotations"].append({"id": "b6-head", "x": 0, "y": -620, "w": 3000, "text": HEAD, "page": PAGE})
    c["launch"] = {"view": "canvas", "page": PAGE}
    json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("canvas merged:", path)

if __name__ == "__main__":
    write_pages()
    if "--canvas" in sys.argv:
        merge_canvas(sys.argv[sys.argv.index("--canvas") + 1])
