# v5 · ท้องฟ้า × แผงควบคุม — พื้นฟ้าค่ำไล่โทนของ v4 + ภาษาเครื่องมือของทิศทาง C (ปุ่มกด · LED · ลูกบิด · 7-segment · แผงนูน/ร่องบุ๋ม)
# flow เดิม 3 ขั้น 6 หน้า · mockup เท่านั้น ยังไม่ใช่โค้ดจริง
#
# ใช้:  python3 gen_v5.py [--canvas path/to/canvas.json]
#   เขียน P1 P2 P2Custom P2Run P3 P3Edit .dc.html ลงโฟลเดอร์ปัจจุบัน
#   ถ้าส่ง --canvas จะลบของเดิมของหน้า page-5 แล้วเพิ่มอาร์ตบอร์ด + โน้ตของหน้านี้เข้าไปใหม่
import json, sys

TEXT, MUTED, AMB, INK = "#eef4ff", "#8fa3c2", "#ffb020", "#081326"
SKY = "linear-gradient(180deg,#060f22 0%,#0c1c38 40%,#143459 78%,#1d4c78 100%)"
PANEL = "rgba(10,22,44,.62)"
WELL = "rgba(4,10,22,.72)"
EDGE = "rgba(2,7,16,.9)"
PAGE = "page-5"
PAGE_NAME = "v5 · ท้องฟ้า × แผงควบคุม · 3 ขั้น · 6 หน้า"

CSS = f"""
body{{margin:0;background:#0c1c38;color:{TEXT};font-family:"Mitr","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;line-height:1.4;font-weight:300}}
a{{color:{AMB}}}a:hover{{color:#ffd070}}
b,strong{{font-weight:500}}
.mono{{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}}
.tag{{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:{MUTED};white-space:nowrap}}
.panel{{background:{PANEL};border-radius:10px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -1px 0 rgba(0,0,0,.55),0 2px 0 {EDGE},0 14px 40px rgba(0,0,0,.25)}}
.well{{background:{WELL};border-radius:6px;box-shadow:inset 0 2px 5px rgba(0,0,0,.75),inset 0 0 0 1px rgba(0,0,0,.6)}}
.well.sel{{box-shadow:inset 0 2px 5px rgba(0,0,0,.75),inset 0 0 0 1.5px {AMB},0 0 18px rgba(255,176,32,.25)}}
.muted{{color:{MUTED}}}
.small{{font-size:11.5px}}
.h1{{font-size:26px;font-weight:300;letter-spacing:-.01em;line-height:1.1}}
.h2{{font-size:15px;font-weight:400}}
.kv{{font-size:12px;color:{MUTED}}}.kv b{{color:{TEXT};font-weight:400}}
.led{{width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,.12);box-shadow:inset 0 1px 1px rgba(0,0,0,.7);flex-shrink:0}}
.led.on{{background:{AMB};box-shadow:0 0 6px {AMB},0 0 14px rgba(255,176,32,.55)}}
.led.dim{{background:#8a6a2a;box-shadow:0 0 4px rgba(255,176,32,.35)}}
.key{{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 14px;border-radius:6px;font-size:12.5px;font-weight:400;color:{TEXT};background:linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.05));box-shadow:0 2px 0 {EDGE},inset 0 1px 0 rgba(255,255,255,.14);white-space:nowrap}}
.key.on{{color:{AMB};background:linear-gradient(rgba(255,176,32,.18),rgba(255,176,32,.06));box-shadow:0 1px 0 {EDGE},inset 0 2px 3px rgba(0,0,0,.5)}}
.key.off{{color:{MUTED}}}
.key.sm{{height:28px;padding:0 10px;font-size:11.5px}}
.key.ghost{{background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}}
.seg{{display:grid;gap:6px}}
.seg .key{{height:44px;font-size:13.5px;padding:0 10px;width:auto}}
.seg .key.on{{box-shadow:0 1px 0 {EDGE},inset 0 2px 3px rgba(0,0,0,.5),inset 0 0 0 1.5px {AMB}}}
.sw{{width:56px;height:30px;border-radius:5px;background:{WELL};box-shadow:inset 0 2px 4px rgba(0,0,0,.75),inset 0 0 0 1px rgba(0,0,0,.6);position:relative;flex-shrink:0;display:inline-flex;align-items:center}}
.sw i{{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:4px;background:linear-gradient(#4a5468,#2a3346);box-shadow:0 1px 0 {EDGE},inset 0 1px 0 rgba(255,255,255,.14)}}
.sw.on i{{left:29px;background:linear-gradient(#ffc652,#e59a10)}}
.sw::after{{content:"OFF";position:absolute;right:6px;font-family:"JetBrains Mono",monospace;font-size:8.5px;letter-spacing:.08em;color:{MUTED}}}
.sw.on::after{{content:"ON";right:auto;left:7px;color:{AMB}}}
.stepper{{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:6px}}
.stepper .key{{height:44px;width:44px;padding:0;font-size:20px;font-weight:300}}
.stepper .well{{height:44px;display:flex;align-items:center;justify-content:center}}
.pos{{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;width:96px}}
.pos span{{height:28px;border-radius:4px;background:linear-gradient(rgba(255,255,255,.12),rgba(255,255,255,.04));box-shadow:0 1px 0 {EDGE}}}
.pos span.on{{background:linear-gradient(rgba(255,176,32,.35),rgba(255,176,32,.15));box-shadow:inset 0 0 0 1.5px {AMB}}}
.cta{{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:10px;height:52px;padding:0 26px;border-radius:8px;background:linear-gradient(#ffc652,#e59a10);color:{INK};font-size:15px;font-weight:500;box-shadow:0 3px 0 #7a5208,inset 0 1px 0 rgba(255,255,255,.45);white-space:nowrap}}
.cta.sm{{height:40px;font-size:13px;padding:0 18px}}
.seg7{{font-family:"JetBrains Mono",monospace;font-weight:700;color:{AMB};text-shadow:0 0 8px rgba(255,176,32,.6);letter-spacing:.06em}}
.seg7.off{{color:rgba(255,255,255,.14);text-shadow:none}}
.knob{{width:34px;height:34px;border-radius:999px;background:radial-gradient(circle at 40% 35%,#4a5468,#1a2334 70%);box-shadow:0 2px 0 {EDGE},inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(0,0,0,.5);position:relative;flex-shrink:0}}
.knob::after{{content:"";position:absolute;left:50%;top:4px;width:2px;height:10px;background:{AMB};margin-left:-1px;border-radius:1px;box-shadow:0 0 4px {AMB}}}
.knob.off::after{{background:{MUTED};box-shadow:none}}
.knob.sm{{width:26px;height:26px}}.knob.sm::after{{height:8px;top:3px}}
.knob.r45::after{{transform-origin:1px 13px;transform:rotate(45deg)}}.knob.r90::after{{transform-origin:1px 13px;transform:rotate(90deg)}}.knob.rm60::after{{transform-origin:1px 13px;transform:rotate(-60deg)}}.knob.r20::after{{transform-origin:1px 13px;transform:rotate(20deg)}}
.knob.sm.r45::after{{transform-origin:1px 10px}}.knob.sm.rm60::after{{transform-origin:1px 10px}}.knob.sm.r90::after{{transform-origin:1px 10px}}
.meter{{display:flex;gap:2px}}.meter i{{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:1px;box-shadow:inset 0 1px 1px rgba(0,0,0,.5)}}.meter i.l{{background:{AMB};box-shadow:0 0 4px rgba(255,176,32,.5)}}.meter i.h{{background:#8a6a2a}}
.tog{{width:30px;height:16px;border-radius:3px;background:{WELL};box-shadow:inset 0 2px 3px rgba(0,0,0,.7);position:relative;flex-shrink:0}}.tog i{{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:2px;background:linear-gradient(#4a5468,#2a3346);box-shadow:0 1px 0 {EDGE}}}.tog.on i{{left:16px;background:linear-gradient(#ffc652,#e59a10)}}
.step{{display:inline-flex;align-items:center;gap:8px}}
.row{{display:grid;grid-template-columns:34px 1fr auto auto;align-items:center;gap:14px;padding:9px 12px}}
.row+.row{{border-top:1px solid rgba(0,0,0,.5)}}
.thumb{{position:relative;border-radius:4px;overflow:hidden;background:#000}}.thumb img{{width:100%;height:100%;object-fit:cover;display:block}}
.thumb .tc{{position:absolute;right:5px;bottom:5px;padding:0 5px;background:rgba(0,0,0,.75);font-family:"JetBrains Mono",monospace;font-size:10.5px;color:{AMB}}}
.scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,10,22,.05) 0%,rgba(4,10,22,0) 40%,rgba(4,10,22,.80) 100%)}}
.stat{{display:flex;justify-content:space-between;font-family:"JetBrains Mono",monospace;font-size:10.5px;color:{MUTED};letter-spacing:.04em}}.stat span:last-child{{color:{TEXT}}}
.sub{{position:absolute;left:8%;right:8%;bottom:14%;text-align:center;font-size:12px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 3px #000,0 0 6px #000;line-height:1.3}}
.hook{{position:absolute;left:8%;right:8%;top:12%;text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 4px #000}}
.hook em{{font-style:normal;color:{AMB}}}
.bar{{height:4px;border-radius:2px;background:rgba(255,255,255,.10);overflow:hidden;position:relative;box-shadow:inset 0 1px 1px rgba(0,0,0,.5)}}.bar i{{position:absolute;left:0;top:0;bottom:0;background:{AMB};box-shadow:0 0 6px rgba(255,176,32,.6)}}
.screw{{width:6px;height:6px;border-radius:999px;background:radial-gradient(circle at 40% 35%,#5a6478,#141b2a);box-shadow:inset 0 0 0 1px rgba(0,0,0,.6);position:absolute}}
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
        "warn": '<path d="M8 2.5l6 11H2z M8 6.5v3M8 11.5v.5"/>',
    }[name]
    return f'<svg width="{size}" height="{size}" viewBox="0 0 16 16" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">{p}</svg>'

SCREWS = '<span class="screw" style="left:8px;top:8px;"></span><span class="screw" style="right:8px;top:8px;"></span><span class="screw" style="left:8px;bottom:8px;"></span><span class="screw" style="right:8px;bottom:8px;"></span>'

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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <style>{CSS}</style>
</helmet>
<div style="width:1440px;height:900px;background:{SKY};display:flex;flex-direction:column;overflow:hidden;position:relative;">
<div style="position:absolute;left:0;right:0;bottom:0;height:460px;background:radial-gradient(70% 60% at 50% 105%,rgba(255,176,32,.18),rgba(255,176,32,0) 70%);pointer-events:none;"></div>
<div style="position:absolute;left:0;right:0;top:0;height:300px;background:radial-gradient(60% 50% at 50% -20%,rgba(143,208,255,.10),rgba(143,208,255,0) 70%);pointer-events:none;"></div>
{body}
</div>
</x-dc>
</body>
</html>"""

def topbar(step, right=""):
    labels = [("01 ใส่วิดีโอ", 1), ("02 สไตล์", 2), ("03 ส่งออก", 3)]
    keys = ""
    for lbl, n in labels:
        if n < step:   cls, led = "key", "led on"
        elif n == step: cls, led = "key on", "led on"
        else:          cls, led = "key off", "led"
        keys += f'<span class="{cls}"><span class="{led}"></span>{lbl}</span>'
    proj = '<span class="well mono" style="padding:5px 10px;font-size:11px;color:%s;">READY</span>' % AMB if step == 1 else f'<span class="well mono" style="padding:5px 10px;font-size:11px;color:{AMB};">IMG_1234.MOV  02:14  +1</span>'
    return f"""<div class="panel" style="height:54px;margin:12px 14px 0;display:flex;align-items:center;gap:14px;padding:0 18px;flex-shrink:0;position:relative;">
    <span class="mono" style="font-size:13px;font-weight:700;letter-spacing:.14em;">VCUT</span>
    {proj}
    <div style="flex:1;"></div>
    <div style="display:flex;gap:6px;">{keys}</div>
    <div style="flex:1;"></div>
    {right or f'<span class="well mono" style="padding:5px 10px;font-size:11px;color:{MUTED};">ENGINE 127.0.0.1:8765 <span style="color:{AMB};">●</span></span>'}
  </div>"""

# ───────── ข้อมูลร่วม ─────────
STYLES = [
    ("A", "ปิดการขาย / แนะนำช่อง", "1.7–2.0 s", "ช้า → รัว → ช้า", "f57.jpg"),
    ("B", "โชว์หลักฐาน", "2.4 s", "เลขนับขึ้น", "f14.jpg"),
    ("C", "สอนกรอบวิธีคิด", "5.0 s", "เน้นเสียงพูด", "f88.jpg"),
    ("D", "Before | After", "1.9–2.8 s", "ครอป 9:16", "f116.jpg"),
]

def style_cards(selected, dim=False, h=230):
    cards = ""
    for letter, label, shot, hint, img in STYLES:
        sel = selected == letter
        cards += f"""<div class="well{' sel' if sel else ''}" style="padding:8px;display:flex;flex-direction:column;gap:8px;{'opacity:.4;' if dim else ''}">
          <div class="thumb" style="height:{h-78}px;"><img src="{img}" alt=""><div class="scrim"></div><span class="seg7" style="position:absolute;left:10px;top:6px;font-size:28px;{'' if sel else 'color:rgba(238,244,255,.85);text-shadow:none;'}">{letter}</span><span class="tc">SHOT {shot}</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led{' on' if sel else ''}"></span><span style="font-size:13px;font-weight:400;">{label}</span></div>
          <span class="kv">{hint}</span>
        </div>"""
    sel = selected == "X"
    cards += f"""<div class="well{' sel' if sel else ''}" style="padding:8px;display:flex;flex-direction:column;gap:8px;{'opacity:.4;' if dim else ''}">
          <div style="height:{h-78}px;border-radius:4px;border:1px dashed rgba(255,255,255,.18);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;"><span class="knob{'' if sel else ' off'}"></span><span class="tag">MANUAL</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led{' on' if sel else ''}"></span><span style="font-size:13px;font-weight:400;">กำหนดเอง</span></div>
          <span class="kv">6 ตัวเลือก · หมุนเอง</span>
        </div>"""
    return f'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;">{cards}</div>'

def layer_row(knob, name, desc, on=True, action="แก้"):
    """แถวชั้นแต่ง 1 ชั้น: สวิตช์เปิด/ปิดใหญ่ซ้าย · ชื่อ+ค่า · ปุ่ม แก้ ▸ สูง 40 กดง่าย"""
    sw = f'<span class="sw{" on" if on else ""}"><i></i></span>'
    return f'<div class="row" style="grid-template-columns:56px 1fr auto;padding:8px 12px;{"" if on else "opacity:.6;"}">{sw}<div style="display:flex;flex-direction:column;gap:0;min-width:0;"><span style="font-weight:400;">{name}</span><span class="kv">{desc}</span></div><span class="key" style="height:40px;">{action} ▸</span></div>'

def keys(items, on):
    if isinstance(on, str): on = [on]
    return '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + "".join(f'<span class="key sm{" on" if it in on else ""}">{it}</span>' for it in items) + '</div>'

def meter(l, h=1, n=20):
    return '<span class="meter" style="flex:1;">' + "".join('<i class="l"></i>' for _ in range(l)) + "".join('<i class="h"></i>' for _ in range(h)) + "".join('<i></i>' for _ in range(n - l - h)) + '</span>'

# ───────── P1 · ① ใส่วิดีโอ ─────────
P1 = topbar(1) + f"""
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:0 0 30px;position:relative;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><span class="tag">SEC 00 · INPUT</span><span class="h1" style="font-size:36px;">ใส่วิดีโอ</span><span class="muted">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอนก็ได้ เอนจินปรับเป็น 9:16 ให้เอง</span></div>
    <div class="panel" style="width:860px;padding:22px 22px 18px;display:flex;flex-direction:column;gap:14px;position:relative;">{SCREWS}
      <div class="well" style="height:196px;border:1px dashed rgba(255,176,32,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
        {ico("upload",26,AMB)}
        <span style="font-size:15px;">ลากวิดีโอมาวางที่ช่องนี้</span>
        <div style="display:flex;gap:8px;"><span class="key">{ico("film",13)}เลือกไฟล์…</span><span class="key ghost">{ico("folder",13)}ลิงก์โฟลเดอร์</span></div>
        <span class="tag">UPLOAD · CHUNK 8 MB · RESUME OK</span>
      </div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        <div style="display:grid;grid-template-columns:8px 40px 1fr auto 160px 24px;gap:14px;align-items:center;padding:9px 12px;">
          <span class="led on"></span><div class="thumb" style="width:40px;height:40px;"><img src="f57.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;"><span style="font-weight:400;">IMG_1234.MOV</span><span class="kv">1126×1788 · HEVC 60 fps · 291 MB</span></div>
          <span class="seg7" style="font-size:16px;">02:14</span>
          <div style="display:flex;flex-direction:column;gap:5px;"><span class="stat"><span>LISTEN</span><span style="color:{AMB};">18/26</span></span>{meter(14,1)}</div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
        <div style="display:grid;grid-template-columns:8px 40px 1fr auto 160px 24px;gap:14px;align-items:center;padding:9px 12px;border-top:1px solid rgba(0,0,0,.5);">
          <span class="led dim"></span><div class="thumb" style="width:40px;height:40px;"><img src="f116.jpg" alt=""></div>
          <div style="display:flex;flex-direction:column;"><span style="font-weight:400;">IMG_1240.MOV</span><span class="kv">1920×1080 · 140 MB · จะครอปเป็น 9:16</span></div>
          <span class="seg7" style="font-size:16px;">01:03</span>
          <div style="display:flex;flex-direction:column;gap:5px;"><span class="stat"><span>UPLOAD</span><span>62%</span></span>{meter(12,0)}</div>
          <span style="display:inline-flex;justify-content:center;">{ico("x",13,MUTED)}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <span class="kv">ถอดเสียงเริ่มเองทันทีที่วางไฟล์ · ทุกสไตล์ทุกแบบใช้ร่วมกัน ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
        <div style="flex:1;"></div>
        <span class="cta">02 เลือกสไตล์{ico("chev",14,INK)}</span>
      </div>
    </div>
  </div>"""

# ───────── P2 · ② สไตล์ ─────────
def p2_shell(selected, lower, dim=False, right_top="", h=230):
    return topbar(2, right_top) + f"""
  <div style="flex:1;display:flex;flex-direction:column;gap:14px;padding:14px 14px 14px;min-height:0;position:relative;">
    <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;position:relative;">{SCREWS}
      <div style="display:flex;align-items:baseline;gap:12px;"><span class="tag">SEC 01 · STYLE</span><span class="h1" style="font-size:20px;">เลือกสไตล์</span><span class="kv">4 สูตรจากเอนจิน เลือกชั้นแต่งให้เอง · หรือกำหนดเองทั้งหมด</span></div>
      {style_cards(selected, dim, h)}
    </div>
    {lower}
  </div>"""

def layer_knob(knob, name, desc, on=True):
    return f'<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;{"" if on else "opacity:.45;"}"><span class="knob {knob}{"" if on else " off"}"></span><div style="display:flex;align-items:center;gap:7px;"><span class="led{" on" if on else ""}"></span><span style="font-weight:400;">{name}</span></div><span class="kv">{desc}</span></div>'

P2_LOWER = f"""<div style="flex:1;display:grid;grid-template-columns:1fr 340px;gap:14px;min-height:0;">
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:16px;position:relative;">{SCREWS}
        <div style="display:flex;align-items:baseline;gap:12px;"><span class="tag">SEC 02 · LAYERS · PRESET A</span><span class="h2">สูตร A แต่งให้แบบนี้</span><span class="kv">แก้เพิ่มได้หลังตัดเสร็จ ทีละแบบ ที่ 03</span></div>
        <div class="well" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:22px 14px;align-items:start;">
          {layer_knob("r20","ซับจากบทพูด","ตัวหนา ขาวขอบดำ · กลางล่าง")}
          {layer_knob("r45","HOOK + การ์ดปิด","ประโยคแรก · การ์ด 4 s")}
          {layer_knob("rm60","เพลงตามจังหวะ","มีพลัง · SNAP BEAT · DUCK")}
          {layer_knob("r90","เอฟเฟกต์รายช็อต","ยิงรัว · ZOOM · PUNCH")}
          {layer_knob("","สติกเกอร์ / ภาพซ้อน","สูตรนี้ไม่ใส่", on=False)}
        </div>
        <div class="well" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:4px 0;">
          {"".join(f'<div style="display:flex;flex-direction:column;gap:4px;padding:8px 14px;{"" if i==0 else "border-left:1px solid rgba(0,0,0,.5);"}"><span class="tag">{k}</span><span class="seg7" style="font-size:14px;">{v}</span></div>' for i,(k,v) in enumerate([("SUB SIZE · POS","54 · 2"),("HOOK ANIM · CARD","POP_WORDS · 4.0 s"),("MUSIC GAIN · DUCK","−18 dB · 6"),("FX ZOOM · RUN","1.05→1.22 · 7")]))}
        </div>
        <div style="flex:1;"></div>
        <span class="kv">ค่าเหล่านี้มาจาก [autofx] ของ preset tiktok-sell · ลูกบิดที่นี่อ่านอย่างเดียว หมุนจริงได้ที่ 03 หลังตัดเสร็จ</span>
      </div>
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px;position:relative;">{SCREWS}
        <span class="tag">OUTPUT · 6 VARIANTS</span>
        <div class="well" style="display:flex;flex-direction:column;padding:4px 0;">
          {"".join(f'<div style="display:grid;grid-template-columns:22px 1fr auto;gap:10px;padding:6px 12px;align-items:center;{"" if i==0 else "border-top:1px solid rgba(0,0,0,.5);"}"><span class="seg7 off" style="font-size:11px;">0{i+1}</span><span class="small">{n}</span><span class="seg7 off" style="font-size:12px;">{d}</span></div>' for i,(n,d) in enumerate([("30 วิ","00:30"),("45 วิ","00:45"),("60 วิ","01:00"),("ตัดชิดทั้งคลิป","01:43"),("AI ไฮไลต์ 45 วิ","00:45"),("ยิงรัว","00:38")]))}
        </div>
        <div style="flex:1;"></div>
        <div class="well" style="padding:8px 12px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">ETA</span><span class="seg7" style="font-size:30px;">01:00</span></div>
        <span class="cta" style="width:100%;">ตัดให้เลย · สูตร A · 6 แบบ</span>
      </div>
    </div>"""
P2 = p2_shell("A", P2_LOWER, h=300)

# ───────── P2Custom ─────────
def seg(items, on, cols=None):
    """ปุ่มเลือกค่าแบบแบ่งช่องเท่ากัน สูง 44 · ที่เลือกมีขอบอำพัน + เครื่องหมายถูก"""
    if isinstance(on, str): on = [on]
    cols = cols or len(items)
    return f'<div class="seg" style="grid-template-columns:repeat({cols},minmax(0,1fr));">' + "".join(
        f'<span class="key{" on" if it in on else ""}">{ico("check",13,AMB) if it in on else ""}{it}</span>' for it in items) + '</div>'

def opt_panel(n, title, on, readout, body, note=""):
    """แผงตัวเลือก 1 อย่าง: หัว = เลขลำดับ + ชื่อ + จอค่าที่เลือก + สวิตช์ ON/OFF ใหญ่ · ตัว = ปุ่มเลือกค่าใหญ่"""
    return f"""<div class="well" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;{'opacity:.6;' if not on else ''}">
        <div style="display:flex;align-items:center;gap:12px;"><span class="seg7{'' if on else ' off'}" style="font-size:13px;">0{n}</span><span style="font-weight:400;font-size:14.5px;">{title}</span><div style="flex:1;"></div><span class="seg7{'' if on else ' off'}" style="font-size:13px;">{readout}</span><span class="sw{' on' if on else ''}"><i></i></span></div>
        {body}
        {f'<span class="kv">{note}</span>' if note else ''}
      </div>"""

def sw_row(label, on=True):
    return f'<div style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-radius:6px;background:rgba(255,255,255,.04);"><span style="font-size:13.5px;">{label}</span><div style="flex:1;"></div><span class="sw{" on" if on else ""}"><i></i></span></div>'

_LED_SEL = '<span class="led on" style="position:absolute;right:5px;top:5px;"></span>'
STK = "".join(f'<span class="key{" on" if i==0 else ""}" style="height:56px;width:auto;padding:0;position:relative;"><img src="{s}" alt="" style="max-width:46px;max-height:34px;">{_LED_SEL if i==0 else ""}</span>' for i, s in enumerate(["st-4k.png","st-bell.png","st-balloon.png","st-banner.png"]))
P2C_LOWER = f"""<div style="flex:1;display:grid;grid-template-columns:1fr 340px;gap:14px;min-height:0;">
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;position:relative;">{SCREWS}
        <div style="display:flex;align-items:baseline;gap:12px;"><span class="tag">SEC 02 · LAYERS · MANUAL</span><span class="h2">กำหนดเอง</span><span class="kv">เปิด/ปิดด้วยสวิตช์ · กดปุ่มเลือกค่า · จอด้านขวาของแต่ละแผงบอกค่าที่เลือกอยู่</span></div>
        <div style="flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
          {opt_panel(1,"ระยะเวลา",True,"00:45", seg(["30 วิ","45 วิ","60 วิ","ทั้งคลิป"],"45 วิ"), "ยังตัดครบ 6 แบบ · ค่านี้คือแบบที่เลือกไว้ก่อน")}
          {opt_panel(2,"ซับ",True,"LINE", seg(["ทั้งบรรทัด","ทีละคำ"],"ทั้งบรรทัด"), "ขาวขอบดำ กลางล่าง · แก้คำผิดได้หลังตัด")}
          {opt_panel(3,"HOOK + การ์ดปิด",True,"2 ON", sw_row("HOOK จากประโยคแรก") + sw_row("การ์ดปิด 4 วิ @ชื่อช่อง"), "พิมพ์ข้อความเองได้ในขั้น 03")}
          {opt_panel(4,"เพลงตามจังหวะ",True,"ENERGY", seg(["มีพลัง","ชิล","ดราม่า","โลไฟ"],"มีพลัง",4) + f'<div style="display:flex;flex-direction:column;gap:6px;">{sw_row("ดูดรอยตัดเข้าบีต")}{sw_row("ลดเสียงเพลงตอนพูด")}</div>')}
          {opt_panel(5,"สติกเกอร์ / ภาพซ้อน",False,"OFF", f'<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">{STK}</div><span class="key" style="height:44px;">{ico("plus",13)}เลือกจากคลัง 200 · อัปโหลด</span>')}
          {opt_panel(6,"เอฟเฟกต์รายช็อต",True,"2 FX", seg(["ซูมไล่","PUNCH","ยิงรัว","GLITCH","ขาวดำ","ไม่ใส่"],["ซูมไล่","PUNCH"],3), "ใส่ทุกช็อตพูด · ปรับทีละช็อตได้หลังตัด")}
        </div>
      </div>
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px;position:relative;">{SCREWS}
        <span class="tag">SUMMARY</span>
        <div class="well" style="display:flex;flex-direction:column;padding:4px 0;">
          {"".join(f'<div class="stat" style="padding:6px 12px;{"" if i==0 else "border-top:1px solid rgba(0,0,0,.5);"}"><span>{k}</span><span>{v}</span></div>' for i,(k,v) in enumerate([("LENGTH","45 s"),("SUB","LINE"),("HOOK / CARD","ON / ON"),("MUSIC","ENERGY · BEAT"),("STICKER","OFF"),("FX","ZOOM · PUNCH")]))}
        </div>
        <div style="flex:1;"></div>
        <div class="well" style="padding:8px 12px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">ETA</span><span class="seg7" style="font-size:30px;">01:00</span></div>
        <span class="cta" style="width:100%;">ตัดให้เลย · 6 แบบ</span>
      </div>
    </div>"""
P2C = p2_shell("X", P2C_LOWER, h=240)

# ───────── P2Run ─────────
VARIANTS = [
    ("30 วิ", "00:30", "6 SHOT", "done"),
    ("45 วิ", "00:45", "8 SHOT", "done"),
    ("60 วิ", "01:00", "11 SHOT", "run"),
    ("ตัดชิดทั้งคลิป", "01:43", "ลบเงียบ 7 ช่วง", "wait"),
    ("AI ไฮไลต์ 45 วิ", "00:45", "ประโยคคะแนนสูงก่อน", "wait"),
    ("ยิงรัว", "00:38", "0.8 s · 14 SHOT", "wait"),
]
def run_rows():
    out = ""
    for i, (n, d, meta, st) in enumerate(VARIANTS):
        led = "led on" if st == "done" else ("led dim" if st == "run" else "led")
        if st == "done":
            right = f'<span class="seg7" style="font-size:15px;">{d}</span><span class="key sm">{ico("play",11)}ดู</span>'
        elif st == "run":
            right = f'<div style="width:150px;display:flex;flex-direction:column;gap:5px;"><span class="stat"><span>RENDER</span><span>7/11</span></span>{meter(12,1)}</div><span style="width:52px;"></span>'
        else:
            right = f'<span class="seg7 off" style="font-size:15px;">--:--</span><span style="width:52px;"></span>'
        out += f'<div style="display:grid;grid-template-columns:8px 24px 1fr 150px auto;gap:12px;align-items:center;padding:9px 12px;{"" if i == 0 else "border-top:1px solid rgba(0,0,0,.5);"}{"opacity:.6;" if st == "wait" else ""}"><span class="{led}"></span><span class="seg7{" off" if st=="wait" else ""}" style="font-size:11px;">0{i+1}</span><div style="display:flex;flex-direction:column;"><span style="font-weight:400;">{n}</span><span class="kv">{meta}</span></div>{right}</div>'
    return out

P2R_LOWER = f"""<div style="flex:1;display:grid;grid-template-columns:1fr 340px;gap:14px;min-height:0;">
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px;position:relative;">{SCREWS}
        <div style="display:flex;align-items:baseline;gap:12px;"><span class="tag">JOB · PRESET A · 6 VARIANTS</span><span class="h2">กำลังตัด</span><span class="kv">ดูแบบที่เสร็จแล้วได้เลย ไม่ต้องรอครบ</span></div>
        <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;">{run_rows()}</div>
      </div>
      <div class="panel" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px;position:relative;">{SCREWS}
        <span class="tag">PROGRESS</span>
        <div class="well" style="padding:10px 14px;display:flex;align-items:baseline;justify-content:space-between;"><span class="seg7" style="font-size:40px;">2<span style="font-size:20px;color:rgba(255,176,32,.6);">/6</span></span><span class="seg7" style="font-size:22px;">-00:40</span></div>
        {meter(11,1,20)}
        <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px;">
          <div class="stat"><span>① LISTEN</span><span style="color:{AMB};">DONE 26/26</span></div>
          <div class="stat"><span>② PREPARE · PICK</span><span style="color:{AMB};">DONE 18 PCS</span></div>
          <div class="stat"><span>③ RENDER ×6</span><span>2/6</span></div>
          <div class="stat"><span>④ AUTOFX SUB · HOOK · MUSIC · FX</span><span>WAIT</span></div>
        </div>
        <div style="flex:1;"></div>
        <div style="display:flex;gap:8px;"><span class="key">{ico("stop",13)}STOP</span><span class="cta sm" style="flex:1;">ดู 2 แบบที่เสร็จ ▸</span></div>
        <span class="kv" style="text-align:center;">เสร็จครบแล้วพาไป 03 เอง</span>
      </div>
    </div>"""
P2R = p2_shell("A", P2R_LOWER, dim=True, right_top=f'<span class="well mono" style="padding:5px 10px;font-size:11px;color:{AMB};"><span class="led dim" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>CUTTING 2/6</span>', h=240)

# ───────── P3 ─────────
def style_tabs(active="A"):
    tabs = ""
    for letter, label, _, _, _ in STYLES:
        on = letter == active
        tabs += f'<span class="key{"" if on else " off"}{" on" if on else ""}"><span class="led{" on" if on else ""}"></span>{letter} · {label}{"" if on else " ▸"}</span>'
    tabs += '<span class="key off"><span class="led"></span>กำหนดเอง ▸</span>'
    return f'<div style="display:flex;gap:6px;">{tabs}</div>'

def variant_cards(sel_idx=1):
    imgs = ["f57.jpg", "f14.jpg", "f88.jpg", "f116.jpg", "f2.jpg", "f57.jpg"]
    out = ""
    for i, (n, d, meta, _) in enumerate(VARIANTS):
        sel = i == sel_idx
        overlay = '<span class="hook">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="bottom:40%;">น้ำตกที่ไกล ยังไม่ไกลเท่า</span>' if sel else ''
        out += f"""<div class="well{' sel' if sel else ''}" style="padding:6px;display:flex;flex-direction:column;gap:6px;min-height:0;">
          <div class="thumb" style="flex:1;min-height:0;"><img src="{imgs[i]}" alt=""><div class="scrim"></div>{overlay}<span class="seg7" style="position:absolute;right:8px;top:6px;font-size:20px;">{d}</span><div style="position:absolute;left:8px;right:8px;bottom:6px;display:flex;align-items:center;gap:8px;"><span class="led{' on' if sel else ''}"></span><span style="font-weight:400;">{n}</span><span class="tag" style="margin-left:auto;">{meta}</span></div></div>
        </div>"""
    return f'<div class="well" style="flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px;padding:8px;min-height:0;background:rgba(4,10,22,.35);">{out}</div>'

P3 = topbar(3, f'<span class="well mono" style="padding:5px 10px;font-size:11px;color:{AMB};">DONE 6/6 · 00:58</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 400px;gap:14px;padding:14px;min-height:0;position:relative;">
    <div class="panel" style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;min-height:0;position:relative;">{SCREWS}
      <div style="display:flex;align-items:center;gap:12px;"><span class="tag">SEC 04 · VARIANTS</span><span class="h1" style="font-size:20px;">เลือกแบบ</span><span class="kv">สไตล์ที่ตัดแล้วอยู่ที่ปุ่ม · กดสไตล์อื่นเพื่อตัดเพิ่ม</span></div>
      {style_tabs("A")}
      {variant_cards(1)}
      <div style="display:flex;align-items:center;gap:12px;"><span class="key sm ghost">{ico("back",12)}02 เปลี่ยนสไตล์</span><span class="kv">6 แบบใช้ชั้นแต่งของสูตร A เหมือนกัน ต่างกันที่การตัด</span></div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:16px 18px;min-height:0;position:relative;">{SCREWS}
      <div style="display:flex;gap:14px;">
        <div class="thumb" style="width:126px;height:224px;flex-shrink:0;"><img src="f57.jpg" alt=""><span class="hook" style="font-size:11px;">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="font-size:10px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;">
          <span class="tag">SEL · A</span>
          <span class="seg7" style="font-size:34px;line-height:1;">00:45</span>
          <span class="kv">8 SHOT · 1080×1920 · −14.0 LUFS</span>
          <div style="flex:1;"></div>
          <div style="display:flex;gap:4px;"><span class="key sm">{ico("prev",11)}</span><span class="key sm on" style="flex:1;">{ico("play",11,AMB)}PLAY</span><span class="key sm">{ico("next",11)}</span></div>
          <span class="bar"><i style="width:22%;"></i></span>
          <div style="display:flex;justify-content:space-between;"><span class="mono kv" style="font-size:10.5px;">00:10 / 00:45</span><span class="key sm ghost">ไทม์ไลน์ ▸</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;padding-top:4px;"><span class="tag">SEC 05 · LAYERS OF THIS VARIANT</span><span class="kv">เรนเดอร์ใหม่เฉพาะแบบนี้ ~45 s</span></div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {layer_row("r20","ซับ","12 บรรทัด · 2 ไม่มั่นใจ")}
        {layer_row("r45","HOOK + การ์ดปิด","HOOK 1 · การ์ดปิด 1")}
        {layer_row("rm60","เพลง","มีพลัง 98 BPM · SNAP BEAT")}
        {layer_row("","สติกเกอร์ / ภาพซ้อน","ยังไม่มี", on=False, action="เพิ่ม")}
        {layer_row("r90","เอฟเฟกต์รายช็อต","ZOOM · PUNCH · 3 ช็อต")}
      </div>
      <div style="flex:1;"></div>
      <span class="tag">SEC 06 · EXPORT</span>
      {keys(["③ ภาพ+เสียง","④ + ซับ","⑤ + ทุกชั้น"],"⑤ + ทุกชั้น")}
      <div style="display:flex;align-items:center;gap:8px;"><span class="cta" style="flex:1;">ส่งออก · A · 45 s</span><span class="key" style="height:52px;width:52px;padding:0;">{ico("folder",15)}</span></div>
      <span class="mono kv" style="font-size:10.5px;">~/Movies/vcut/IMG_1234/A-45s.mp4 · ~01:30</span>
    </div>
  </div>"""

# ───────── P3Edit ─────────
SUBLINES = [("00:00","คลิปของคุณดูเจ๋งได้เนี่ย",.96),("00:03","ถ้าตัดให้ถูกจังหวะ",.91),("00:06","วันนี้จะพาไปดู",.88),("00:08","น้ำตกที่ไกล ยังไม่ไกลเท่า",.94),("00:11","บันไดที่ต้องเจอ",.57),("00:13","สองกิโล สิบเจ็ดคุ้ง",.61),("00:16","แต่พอถึงแล้ว",.9),("00:18","คุ้มทุกก้าว",.95)]
def sublist():
    out = ""
    for i, (t, s, c) in enumerate(SUBLINES):
        warn = c < .7
        n = int(c * 10)
        m = '<span class="meter" style="width:60px;">' + "".join('<i class="l"></i>' for _ in range(n)) + "".join('<i></i>' for _ in range(10 - n)) + '</span>'
        out += f'<div style="display:grid;grid-template-columns:8px 44px 1fr 60px 22px;gap:10px;align-items:center;padding:8px 12px;{"" if i == 0 else "border-top:1px solid rgba(0,0,0,.5);"}"><span class="led{" dim" if warn else " on"}"></span><span class="mono kv" style="font-size:10.5px;">{t}</span><span style="{f"color:{AMB};" if warn else ""}">{s}</span>{m}{ico("warn",13,AMB) if warn else ico("edit",13,MUTED)}</div>'
    return out

P3E = P3.replace('gap:14px;padding:14px;min-height:0;position:relative;', 'gap:14px;padding:14px;min-height:0;position:relative;opacity:.30;filter:saturate(.5) blur(1px);') + f"""
  <div style="position:absolute;inset:0;background:rgba(4,10,22,.35);"></div>
  <div class="panel" style="position:absolute;top:12px;right:14px;bottom:12px;width:660px;display:flex;flex-direction:column;background:rgba(10,22,44,.88);">{SCREWS}
    <div style="display:flex;align-items:center;gap:12px;padding:18px 24px 10px;"><span class="tag">EDIT · A · 00:45</span><span class="h2" style="font-size:18px;font-weight:300;">แก้ชั้นแต่ง</span><div style="flex:1;"></div>{ico("x",15,MUTED)}</div>
    <div style="padding:0 24px 12px;">{keys(["ซับ","HOOK / การ์ดปิด","เพลง","สติกเกอร์","เอฟเฟกต์"],"ซับ")}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 196px;gap:16px;padding:0 24px;min-height:0;">
      <div style="display:flex;flex-direction:column;gap:8px;min-height:0;">
        <div style="display:flex;align-items:center;gap:10px;">{keys(["ทั้งบรรทัด","ทีละคำ","ปิดซับ"],"ทั้งบรรทัด")}<div style="flex:1;"></div><span class="mono kv" style="font-size:10.5px;color:{AMB};">2 LOW CONF</span></div>
        <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;overflow:hidden;">{sublist()}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="thumb" style="height:176px;"><img src="f57.jpg" alt=""><span class="sub" style="font-size:11px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <span class="tag">STYLE</span>
        {seg(["หนา ขอบดำ","แผ่นทึบ","เหลืองเน้น"],"หนา ขอบดำ",1)}
        <span class="tag" style="padding-top:4px;">SIZE</span>
        <div class="stepper"><span class="key">−</span><span class="well seg7" style="font-size:18px;">54</span><span class="key">+</span></div>
        <span class="tag" style="padding-top:4px;">POSITION · กดช่องที่ต้องการ</span>
        <div class="pos" style="width:100%;"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span class="on"></span><span></span></div>
        <span class="tag" style="padding-top:4px;">MARGIN</span>
        <div class="stepper"><span class="key">−</span><span class="well seg7" style="font-size:18px;">60</span><span class="key">+</span></div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:14px 24px 18px;"><span class="kv">เผาใหม่เฉพาะแบบ 45 s · <span class="seg7" style="font-size:12px;">~00:45</span></span><div style="flex:1;"></div><span class="key">ยกเลิก</span><span class="cta sm">บันทึก · เรนเดอร์ใหม่</span></div>
  </div>"""

PAGES = {"P1": P1, "P2": P2, "P2Custom": P2C, "P2Run": P2R, "P3": P3, "P3Edit": P3E}

BOARDS = [
    ("P1", "1 · ① ใส่วิดีโอ — วางไฟล์ · LISTEN เริ่มเอง", 0, 0,
     "① แผงเดียวกลางฟ้า: ช่องวางไฟล์เป็นร่องบุ๋มขอบอำพัน · แถวไฟล์มี LED สถานะ + เวลา 7-segment + มิเตอร์ LISTEN/UPLOAD · ปุ่ม 3 ตัว (เลือกไฟล์ · ลิงก์โฟลเดอร์ · CTA อำพัน '02 เลือกสไตล์') · upload → POST /api/setup → scan → listen อัตโนมัติ"),
    ("P2", "2 · ② สไตล์ — 4 สูตร + กำหนดเอง · ลูกบิดชั้นแต่ง (เลือก A)", 1560, 0,
     "② การ์ดสไตล์ = ร่องบุ๋มใส่ภาพ + ตัวอักษร 7-seg + LED · เลือกแล้วแผง LAYERS โชว์ 5 ลูกบิด (ซับ · HOOK · เพลง · FX · สติกเกอร์) องศา = ค่าที่สูตรตั้งให้ อ่านอย่างเดียว (autofx ของ preset — ยังไม่มีในเอนจิน) · แผงขวา OUTPUT 6 แบบดับอยู่ + ETA 7-seg + CTA"),
    ("P2Custom", "3 · ② สไตล์ — กำหนดเอง 6 แผง", 3120, 0,
     "② กำหนดเอง = 6 ร่องบุ๋ม แต่ละร่องมีลูกบิดเล็ก + สวิตช์เปิด/ปิด + ปุ่มกดเลือกค่า (key.on อำพัน) · ระยะเวลา/ซับ/HOOK+การ์ด/เพลง (SNAP BEAT · DUCK)/สติกเกอร์/FX · แผง SUMMARY ขวาเป็นบรรทัด mono\nสมมติฐานเดิม: ระยะเวลา = แบบที่เลือกไว้ก่อนใน 03 เอนจินยังตัดครบ 6 แบบ"),
    ("P2Run", "4 · ② กำลังตัด — LED รายแบบ · 7-seg 2/6", 4680, 0,
     "② poll /api/job · การ์ดสไตล์จาง · แถว 6 แบบ: LED ติด=เสร็จ กระพริบ=กำลังเรนเดอร์ ดับ=รอ · เวลาเสร็จเป็น 7-seg · ขวา: จอ 2/6 + เวลาที่เหลือ + มิเตอร์ + 4 ขั้น mono · STOP = /api/job/stop"),
    ("P3", "5 · ③ เลือกแบบ · ส่งออก — ปุ่มสไตล์ · 6 แบบ · ลูกบิดชั้น", 0, 1250,
     "③ ปุ่มสไตล์มี LED (A ติด · อื่น ▸ ตัดเพิ่ม = recut) · 6 แบบเป็นภาพในร่องบุ๋ม เวลา 7-seg มุมบน LED มุมล่าง · แผงขวา: SEL 7-seg 00:45 + PLAY + แถวชั้นแต่ง 5 ลูกบิดเล็ก + LED + ปุ่ม แก้/เพิ่ม → ลิ้นชัก (หน้า 6) · EXPORT ปุ่มกด ③④⑤ + CTA อำพัน"),
    ("P3Edit", "6 · ③ ลิ้นชักแก้ชั้นแต่ง — ซับ · มิเตอร์ความมั่นใจ · ลูกบิด SIZE/POS", 1560, 1250,
     "③ ลิ้นชักแผงเดียว 5 ปุ่มแท็บ · แถวซับ: LED (dim = ไม่มั่นใจ) + เวลา mono + มิเตอร์ 10 ขีด · ตัวอย่างขวา + ปุ่มสไตล์ 3 + ลูกบิด SIZE / POS / MARGIN · บันทึก = build_text ④ เฉพาะแบบที่เลือก"),
]

HEAD = """v5 · ท้องฟ้า × แผงควบคุม — รวมสองทิศทาง: พื้นหลังฟ้าค่ำไล่โทนของ v4 (แสงอำพันที่ขอบฟ้าล่างเข้ากับ LED) + ภาษาเครื่องมือของ v3-C: แผงนูนกระจกมีหมุด 4 มุม · ร่องบุ๋มใส่ภาพ/รายการ · ปุ่มกดยกนูน (กดแล้วบุ๋ม เรืองอำพัน) · LED บอกสถานะ · ลูกบิด = ชั้นแต่งหนัง · ตัวเลข/เวลาเป็น 7-segment อำพัน · ป้าย SEC 0x เป็น mono ตัวพิมพ์ใหญ่ — mockup เท่านั้น (ยังไม่ code) · flow เดิม 3 ขั้น 6 หน้า
① ใส่วิดีโอ → ② สไตล์ (A–D + กำหนดเอง → ตัดให้เลย → กำลังตัด) → ③ ส่งออก (ปุ่มสไตล์ · 6 แบบ · ลูกบิดชั้นแต่ง · ลิ้นชักแก้ · ส่งออก ③④⑤)
โทเคน: ท้องฟ้า #060f22 → #0c1c38 → #143459 → #1d4c78 · แสงขอบฟ้า rgba(255,176,32,.18) · แผง rgba(10,22,44,.62) blur 18 นูน (inset highlight/shadow + ขอบล่าง 2px) · ร่อง rgba(4,10,22,.72) บุ๋ม · ตัวหนังสือ #eef4ff จาง #8fa3c2 · แอกเซนต์เดียว อำพัน #ffb020 (LED · 7-seg · ปุ่มติด · CTA ไล่ #ffc652→#e59a10) · Mitr 300/400 + JetBrains Mono
ต่างจาก v4: กล่องกลับมา แต่เป็นแผงเครื่องมือมีเหตุผล (ทุกอย่างอยู่บนแผง) ไม่ใช่การ์ดซ้อนการ์ด · ตัวเลือกเป็นปุ่มกด ไม่ใช่ข้อความขีดเส้นใต้ · สถานะทุกจุดเป็น LED/7-seg แทนข้อความ"""

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
        c["annotations"].append({"id": f"b5-{stem}", "x": x, "y": y - 300, "w": 1440, "text": note, "page": PAGE})
    c["annotations"].append({"id": "b5-head", "x": 0, "y": -620, "w": 3000, "text": HEAD, "page": PAGE})
    c["launch"] = {"view": "canvas", "page": PAGE}
    json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("canvas merged:", path)

if __name__ == "__main__":
    write_pages()
    if "--canvas" in sys.argv:
        merge_canvas(sys.argv[sys.argv.index("--canvas") + 1])
