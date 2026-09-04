# v4 · แนวท้องฟ้า (sky) — ฟ้าค่ำไล่โทน · แผงกระจกบาง · ตัวอักษรเบา · ลดกล่อง/ชิป — 3 ขั้น · 6 หน้า
# mockup เท่านั้น ยังไม่ใช่โค้ดจริง
#
# ใช้:  python3 gen_blue.py [--canvas path/to/canvas.json]
#   เขียน B1 B2 B2Custom B2Run B3 B3Edit .dc.html ลงโฟลเดอร์ปัจจุบัน
#   ถ้าส่ง --canvas จะลบของเดิมของหน้า page-4 แล้วเพิ่มอาร์ตบอร์ด + โน้ตของหน้านี้เข้าไปใหม่
import json, sys

TEXT, MUTED, ACC, INK = "#eef4ff", "#8fa3c2", "#8fd0ff", "#081326"
SKY = "linear-gradient(180deg,#081326 0%,#0d1f3d 42%,#153a63 80%,#1f5584 100%)"
PAGE = "page-4"
PAGE_NAME = "v4 · ท้องฟ้า · 3 ขั้น · 6 หน้า"

CSS = f"""
body{{margin:0;background:#0d1f3d;color:{TEXT};font-family:"Mitr","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13.5px;line-height:1.4;font-weight:300}}
a{{color:{ACC}}}a:hover{{color:#bfe4ff}}
b,strong{{font-weight:500}}
.g{{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10);border-radius:18px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
.hl{{border-top:1px solid rgba(255,255,255,.08)}}
.muted{{color:{MUTED}}}
.small{{font-size:12px}}
.h1{{font-size:30px;font-weight:300;letter-spacing:-.01em;line-height:1.1}}
.h2{{font-size:17px;font-weight:400}}
.num{{font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.02em}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:{TEXT};font-size:13.5px;font-weight:400;white-space:nowrap}}
.btn.pri{{background:{TEXT};border-color:{TEXT};color:{INK};font-weight:500}}
.btn.lg{{height:50px;padding:0 26px;font-size:15px}}
.btn.sm{{height:32px;padding:0 13px;font-size:12.5px}}
.btn.ic{{width:40px;padding:0}}
.opt{{display:inline-flex;gap:18px;align-items:center}}
.opt span{{color:{MUTED};padding:4px 0;border-bottom:1.5px solid transparent;white-space:nowrap}}
.opt span.on{{color:{TEXT};border-color:{ACC}}}
.sw{{width:34px;height:18px;border-radius:999px;background:rgba(255,255,255,.14);position:relative;flex-shrink:0}}
.sw i{{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:{MUTED}}}
.sw.on{{background:{ACC}}}.sw.on i{{left:18px;background:{INK}}}
.step{{display:inline-flex;align-items:center;gap:9px;color:{MUTED};font-size:13.5px}}
.step .n{{font-size:11px;letter-spacing:.12em;color:{MUTED}}}
.step.on{{color:{TEXT}}}.step.on .n{{color:{ACC}}}
.step.done{{color:{TEXT}}}
.row{{display:grid;grid-template-columns:18px 1fr auto;align-items:center;gap:14px;padding:12px 0}}
.row+.row{{border-top:1px solid rgba(255,255,255,.08)}}
.thumb{{position:relative;border-radius:14px;overflow:hidden;background:#000}}.thumb img{{width:100%;height:100%;object-fit:cover;display:block}}
.scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,19,38,.10) 0%,rgba(8,19,38,0) 35%,rgba(8,19,38,.78) 100%)}}
.card{{position:relative;border-radius:18px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.10)}}
.card.sel{{box-shadow:0 0 0 1.5px {ACC},0 0 32px rgba(143,208,255,.28)}}
.card.dim{{opacity:.38}}
.bar{{height:3px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;position:relative}}.bar i{{position:absolute;left:0;top:0;bottom:0;background:{ACC};border-radius:999px}}
.dot{{width:7px;height:7px;border-radius:999px;background:rgba(255,255,255,.18);flex-shrink:0}}.dot.on{{background:{ACC};box-shadow:0 0 8px {ACC}}}
.sub{{position:absolute;left:8%;right:8%;bottom:14%;text-align:center;font-size:12px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 3px #000,0 0 6px #000;line-height:1.3}}
.hook{{position:absolute;left:8%;right:8%;top:12%;text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:0 1px 0 #000,0 0 4px #000}}
.hook em{{font-style:normal;color:#ffd48a}}
.tab{{display:inline-flex;align-items:baseline;gap:8px;color:{MUTED};padding:6px 0;border-bottom:1.5px solid transparent;white-space:nowrap}}
.tab.on{{color:{TEXT};border-color:{ACC}}}
.tab b{{font-weight:400;color:inherit}}
.tab .cnt{{font-size:11.5px;color:{MUTED}}}
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
        "sun": '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
    }[name]
    return f'<svg width="{size}" height="{size}" viewBox="0 0 16 16" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">{p}</svg>'

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
<div style="position:absolute;left:0;right:0;bottom:0;height:420px;background:radial-gradient(70% 60% at 50% 105%,rgba(255,196,150,.16),rgba(255,196,150,0) 70%);pointer-events:none;"></div>
<div style="position:absolute;left:0;right:0;top:0;height:300px;background:radial-gradient(60% 50% at 50% -20%,rgba(143,208,255,.10),rgba(143,208,255,0) 70%);pointer-events:none;"></div>
{body}
</div>
</x-dc>
</body>
</html>"""

def topbar(step, right=""):
    labels = [("ใส่วิดีโอ", 1), ("สไตล์", 2), ("ส่งออก", 3)]
    steps = ""
    for lbl, n in labels:
        cls = "step done" if n < step else ("step on" if n == step else "step")
        mark = ico("check", 11, ACC) if n < step else f'<span class="n">0{n}</span>'
        steps += f'<span class="{cls}">{mark}{lbl}</span>'
    proj = '' if step == 1 else f'<span class="muted small" style="display:inline-flex;align-items:center;gap:8px;">{ico("film",13,MUTED)}IMG_1234.MOV · 02:14 · +1 ไฟล์</span>'
    return f"""<div style="height:68px;display:flex;align-items:center;gap:22px;padding:0 36px;flex-shrink:0;position:relative;">
    <span style="font-size:17px;font-weight:500;letter-spacing:.02em;display:inline-flex;align-items:center;gap:8px;">{ico("sun",15,ACC)}vcut</span>
    {proj}
    <div style="flex:1;"></div>
    <div style="display:flex;gap:28px;">{steps}</div>
    <div style="flex:1;"></div>
    {right or '<span style="width:170px;"></span>'}
  </div>"""

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
          <span class="num" style="position:absolute;left:16px;top:8px;font-size:44px;color:{ACC if sel else 'rgba(238,244,255,.85)'};">{letter}</span>
          <div style="position:absolute;left:16px;right:16px;bottom:14px;display:flex;flex-direction:column;gap:3px;">
            <span style="font-size:15px;font-weight:400;">{label}</span>
            <span class="small" style="color:rgba(238,244,255,.72);">{hint}</span>
          </div>
        </div>"""
    sel = " sel" if selected == "X" else ""
    cards += f"""<div class="card{sel}{' dim' if dim else ''}" style="height:{h}px;background:rgba(255,255,255,.04);border-style:dashed;display:flex;flex-direction:column;justify-content:space-between;padding:12px 16px 14px;">
          <span class="num" style="font-size:44px;color:{ACC if sel else 'rgba(238,244,255,.85)'};display:inline-flex;align-items:center;height:52px;">{ico("edit",26,ACC if sel else "rgba(238,244,255,.85)")}</span>
          <div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:15px;font-weight:400;">กำหนดเอง</span><span class="small muted">เลือกทุกอย่างเอง 6 ตัวเลือก</span></div>
        </div>"""
    return f'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;">{cards}</div>'

def layer_row(icon, name, desc, on=True, action="แก้", muted=False):
    op = "opacity:.5;" if muted else ""
    dot = '<span class="dot on"></span>' if on else '<span class="dot"></span>'
    return f'<div class="row" style="{op}">{dot}<div style="display:flex;flex-direction:column;gap:1px;min-width:0;"><span style="display:inline-flex;align-items:center;gap:8px;font-weight:400;">{ico(icon,14,ACC if on else MUTED)}{name}</span><span class="muted small">{desc}</span></div><span class="btn sm">{action}</span></div>'

def opts(items, on):
    if isinstance(on, str): on = [on]
    return '<div class="opt">' + "".join(f'<span class="{"on" if it in on else ""}">{it}</span>' for it in items) + '</div>'

# ───────── B1 · ① ใส่วิดีโอ ─────────
B1 = topbar(1) + f"""
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:0 0 60px;position:relative;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><span class="h1" style="font-size:40px;">ใส่วิดีโอ</span><span class="muted">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอนก็ได้ เอนจินปรับเป็น 9:16 ให้เอง</span></div>
    <div class="g" style="width:820px;padding:8px;display:flex;flex-direction:column;">
      <div style="height:210px;border-radius:12px;border:1px dashed rgba(143,208,255,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
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
      <span class="muted small">ถอดเสียงเริ่มเองทันทีที่วางไฟล์ ทุกสไตล์ทุกแบบใช้ร่วมกัน · ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">เลือกสไตล์{ico("chev",14,INK)}</span>
    </div>
  </div>"""

# ───────── B2 · ② สไตล์ ─────────
def b2_shell(selected, lower, dim=False, right_top="", h=272):
    return topbar(2, right_top) + f"""
  <div style="flex:1;display:flex;flex-direction:column;gap:20px;padding:18px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกสไตล์</span><span class="muted">4 สูตรจากเอนจิน เลือกชั้นแต่งให้เอง · หรือกำหนดเองทั้งหมด</span></div>
    {style_cards(selected, dim, h)}
    {lower}
  </div>"""

def layer_cell(icon, name, desc, off=False):
    return f'<div style="display:flex;gap:12px;align-items:flex-start;{"opacity:.45;" if off else ""}">{ico(icon,16,MUTED if off else ACC)}<div style="display:flex;flex-direction:column;gap:2px;"><span style="font-weight:400;">{name}</span><span class="muted small">{desc}</span></div></div>'

B2_LOWER = f"""<div class="g" style="padding:22px 26px;display:flex;flex-direction:column;gap:18px;">
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
B2 = b2_shell("A", B2_LOWER, h=400)

# ───────── B2Custom · ② กำหนดเอง ─────────
def opt_card(icon, title, on, body, note=""):
    return f"""<div class="g" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px;{'opacity:.55;' if not on else ''}">
        <div style="display:flex;align-items:center;gap:10px;">{ico(icon,15,ACC if on else MUTED)}<span style="font-weight:400;">{title}</span><div style="flex:1;"></div><span class="sw{' on' if on else ''}"><i></i></span></div>
        {body}
        {f'<span class="muted small">{note}</span>' if note else ''}
      </div>"""

STK = "".join(f'<span style="width:52px;height:40px;border-radius:9px;background:rgba(255,255,255,.06);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;"><img src="{s}" alt="" style="max-width:44px;max-height:32px;"></span>' for s in ["st-4k.png","st-bell.png","st-balloon.png","st-banner.png"])
B2C_LOWER = f"""<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;">
      {opt_card("clock","ระยะเวลา",True, opts(["30 วิ","45 วิ","60 วิ","ทั้งคลิป (ตัดชิด)"],"45 วิ"), "เอนจินยังตัดครบ 6 แบบ · ค่านี้คือแบบที่เลือกไว้ก่อน")}
      {opt_card("text","ซับ",True, opts(["ทั้งบรรทัด","ทีละคำ"],"ทั้งบรรทัด"), "ขาวขอบดำ กลางล่าง · แก้คำผิดได้หลังตัด")}
      {opt_card("spark","HOOK + การ์ดปิด",True, opts(["HOOK จากประโยคแรก","การ์ดปิด 4 วิ","พิมพ์เอง"],["HOOK จากประโยคแรก","การ์ดปิด 4 วิ"]), "เลือกได้ทั้งสอง")}
      {opt_card("music","เพลงตามจังหวะ",True, opts(["สนุก/มีพลัง","ชิล","ดราม่า","โลไฟ"],"สนุก/มีพลัง") + f'<div style="display:flex;gap:22px;"><span style="display:inline-flex;align-items:center;gap:8px;"><span class="sw on" style="transform:scale(.85);"><i></i></span><span class="small">รอยตัดเข้าบีต</span></span><span style="display:inline-flex;align-items:center;gap:8px;"><span class="sw on" style="transform:scale(.85);"><i></i></span><span class="small">ลดเสียงตอนพูด</span></span></div>')}
      {opt_card("sticker","สติกเกอร์ / ภาพซ้อน",False, f'<div style="display:flex;gap:8px;">{STK}<span style="width:52px;height:40px;border-radius:9px;border:1px dashed rgba(255,255,255,.2);display:inline-flex;align-items:center;justify-content:center;">{ico("plus",14,MUTED)}</span></div>', "คลัง 200 ชิ้น · อัปโหลดเองได้")}
      {opt_card("fx","เอฟเฟกต์รายช็อต",True, opts(["ซูมไล่","punch","ยิงรัว","glitch ท้าย","ขาวดำ"],["ซูมไล่","punch"]), "ใส่ให้ทุกช็อตพูด · ปรับทีละช็อตได้หลังตัด")}
    </div>
    <div style="flex:1;"></div>
    <div style="display:flex;align-items:center;gap:18px;">
      <span class="muted small">45 วิ · ซับทั้งบรรทัด · HOOK + การ์ดปิด · เพลงสนุกตามบีต · ซูมไล่ punch · ราว 1 นาที</span>
      <div style="flex:1;"></div>
      <span class="btn pri lg">ตัดให้เลย · 6 แบบ{ico("chev",14,INK)}</span>
    </div>"""
B2C = b2_shell("X", B2C_LOWER, h=200)

# ───────── B2Run · ② กำลังตัด ─────────
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
        out += f'<div style="display:grid;grid-template-columns:30px 1fr 170px auto;gap:14px;align-items:center;padding:11px 0;{"" if i == 0 else "border-top:1px solid rgba(255,255,255,.08);"}{"opacity:.55;" if st == "wait" else ""}"><span class="muted small num">0{i+1}</span><div style="display:flex;flex-direction:column;gap:0;"><span style="font-weight:400;">{n}</span><span class="muted small">{meta}</span></div>{right}</div>'
    return out

B2R_LOWER = f"""<div class="g" style="flex:1;display:grid;grid-template-columns:1fr 300px;gap:40px;padding:22px 28px;min-height:0;">
      <div style="display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:baseline;gap:14px;padding-bottom:6px;"><span class="h2">กำลังตัด · สูตร A</span><span class="muted small">ดูแบบที่เสร็จแล้วได้เลย ไม่ต้องรอครบ</span></div>
        {run_rows()}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;border-left:1px solid rgba(255,255,255,.08);padding-left:32px;">
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
        <span class="muted small">เสร็จครบแล้วพาไปขั้นส่งออกเอง</span>
      </div>
    </div>"""
B2R = b2_shell("A", B2R_LOWER, dim=True, right_top=f'<span class="small" style="width:170px;display:inline-flex;justify-content:flex-end;align-items:center;gap:8px;color:{ACC};"><span class="dot on"></span>กำลังตัด 2 / 6</span>', h=200)

# ───────── B3 · ③ เลือกแบบ · ส่งออก ─────────
def style_tabs(active="A"):
    tabs = ""
    for letter, label, _, _, _ in STYLES:
        if letter == active:
            tabs += f'<span class="tab on"><b>{letter}</b>{label}<span class="cnt">6 แบบ</span></span>'
        else:
            tabs += f'<span class="tab"><b>{letter}</b>{label}<span class="cnt">ตัดเพิ่ม ▸</span></span>'
    tabs += f'<span class="tab">กำหนดเอง<span class="cnt">ตัดเพิ่ม ▸</span></span>'
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
          <span class="num" style="position:absolute;right:14px;top:8px;font-size:30px;color:rgba(238,244,255,.9);">{d}</span>
          {f'<span style="position:absolute;left:14px;top:14px;display:inline-flex;">{ico("check",16,ACC)}</span>' if sel else ''}
          <div style="position:absolute;left:14px;right:14px;bottom:12px;display:flex;flex-direction:column;gap:1px;"><span style="font-size:15px;font-weight:400;">{n}</span><span class="small" style="color:rgba(238,244,255,.72);">{meta}</span></div>
        </div>"""
    return f'<div style="flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:16px;min-height:0;">{out}</div>'

B3 = topbar(3, f'<span class="muted small" style="width:170px;text-align:right;">ตัดเสร็จ 6 / 6 · 0:58</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 400px;gap:28px;padding:14px 36px 28px;min-height:0;position:relative;">
    <div style="display:flex;flex-direction:column;gap:16px;min-height:0;">
      <div style="display:flex;align-items:baseline;gap:16px;"><span class="h1">เลือกแบบ</span><span class="muted">สไตล์ที่ตัดแล้วอยู่ในแท็บ · กดสไตล์อื่นเพื่อตัดเพิ่ม</span></div>
      {style_tabs("A")}
      {variant_cards(1)}
      <div style="display:flex;align-items:center;gap:14px;"><span class="btn sm" style="background:transparent;">{ico("back",12)}เปลี่ยนสไตล์</span><span class="muted small">6 แบบใช้ชั้นแต่งของสูตร A เหมือนกัน ต่างกันที่การตัด</span></div>
    </div>
    <div class="g" style="display:flex;flex-direction:column;padding:18px 22px;min-height:0;">
      <div style="display:flex;gap:16px;">
        <div class="thumb" style="width:132px;height:234px;flex-shrink:0;"><img src="f57.jpg" alt=""><span class="hook" style="font-size:11px;">คลิปของคุณ <em>ดูเจ๋ง</em> ได้เนี่ย</span><span class="sub" style="font-size:10.5px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;">
          <span class="num" style="font-size:34px;line-height:1;">A · 45 <span class="muted" style="font-size:16px;">วิ</span></span>
          <span class="muted small">8 ช็อต · 1080×1920 · −14 LUFS</span>
          <div style="flex:1;"></div>
          <div style="display:flex;gap:6px;align-items:center;"><span class="btn sm ic" style="width:32px;">{ico("prev",12)}</span><span class="btn sm pri" style="flex:1;">{ico("play",12,INK)}เล่น</span><span class="btn sm ic" style="width:32px;">{ico("next",12)}</span></div>
          <span class="bar"><i style="width:22%;"></i></span>
          <div style="display:flex;justify-content:space-between;"><span class="muted small">0:10 / 0:45</span><span class="small" style="color:{ACC};">ไทม์ไลน์ ▸</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;padding:18px 0 2px;"><span style="font-weight:400;">ชั้นแต่งของแบบนี้</span><span class="muted small">เรนเดอร์ใหม่เฉพาะแบบนี้ ~45 วิ</span></div>
      {layer_row("text","ซับ","12 บรรทัด · 2 ไม่มั่นใจ")}
      {layer_row("spark","HOOK + การ์ดปิด","HOOK 1 · การ์ดปิด 1")}
      {layer_row("music","เพลง","สนุก/มีพลัง 98 BPM · ตามบีต")}
      {layer_row("sticker","สติกเกอร์ / ภาพซ้อน","ยังไม่มี", on=False, action="เพิ่ม")}
      {layer_row("fx","เอฟเฟกต์รายช็อต","ซูมไล่ · punch · 3 ช็อต")}
      <div style="flex:1;"></div>
      <div style="display:flex;flex-direction:column;gap:12px;padding-top:14px;">
        {opts(["ภาพ+เสียง","+ ซับ","+ ทุกชั้น"],"+ ทุกชั้น")}
        <div style="display:flex;align-items:center;gap:10px;"><span class="btn pri lg" style="flex:1;">ส่งออก · A · 45 วิ</span><span class="btn lg ic" style="width:50px;">{ico("folder",15)}</span></div>
        <span class="muted small">~/Movies/vcut/IMG_1234/A-45s.mp4 · ~1:30</span>
      </div>
    </div>
  </div>"""

# ───────── B3Edit · ③ แก้ชั้นแต่ง (ลิ้นชัก) ─────────
SUBLINES = [("0:00","คลิปของคุณดูเจ๋งได้เนี่ย",.96),("0:03","ถ้าตัดให้ถูกจังหวะ",.91),("0:06","วันนี้จะพาไปดู",.88),("0:08","น้ำตกที่ไกล ยังไม่ไกลเท่า",.94),("0:11","บันไดที่ต้องเจอ",.57),("0:13","สองกิโล สิบเจ็ดคุ้ง",.61),("0:16","แต่พอถึงแล้ว",.9),("0:18","คุ้มทุกก้าว",.95)]
def sublist():
    out = ""
    for i, (t, s, c) in enumerate(SUBLINES):
        warn = c < .7
        out += f'<div style="display:grid;grid-template-columns:40px 1fr 56px 22px;gap:12px;align-items:center;padding:10px 0;{"" if i == 0 else "border-top:1px solid rgba(255,255,255,.08);"}"><span class="muted small num">{t}</span><span style="{"color:#ffd48a;" if warn else ""}">{s}</span><span class="bar"><i style="width:{int(c*100)}%;{"background:#ffd48a;" if warn else ""}"></i></span>{ico("warn",13,"#ffd48a") if warn else ico("edit",13,MUTED)}</div>'
    return out

B3E = B3.replace('gap:28px;padding:14px 36px 28px;min-height:0;position:relative;', 'gap:28px;padding:14px 36px 28px;min-height:0;position:relative;opacity:.30;filter:saturate(.5) blur(1px);') + f"""
  <div style="position:absolute;inset:0;background:rgba(8,19,38,.30);"></div>
  <div class="g" style="position:absolute;top:14px;right:14px;bottom:14px;width:660px;display:flex;flex-direction:column;background:rgba(13,31,61,.82);">
    <div style="display:flex;align-items:center;gap:14px;padding:22px 26px 10px;"><span class="h2" style="font-size:20px;font-weight:300;">แก้ชั้นแต่ง · A · 45 วิ</span><div style="flex:1;"></div>{ico("x",16,MUTED)}</div>
    <div style="padding:0 26px 14px;">{opts(["ซับ","HOOK / การ์ดปิด","เพลง","สติกเกอร์","เอฟเฟกต์"],"ซับ")}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 180px;gap:26px;padding:10px 26px 0;min-height:0;border-top:1px solid rgba(255,255,255,.08);">
      <div style="display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0 4px;">{opts(["ทั้งบรรทัด","ทีละคำ","ปิดซับ"],"ทั้งบรรทัด")}<div style="flex:1;"></div><span class="small" style="color:#ffd48a;">2 บรรทัดไม่มั่นใจ</span></div>
        {sublist()}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;padding-top:12px;">
        <div class="thumb" style="height:300px;"><img src="f57.jpg" alt=""><span class="sub" style="font-size:12.5px;">น้ำตกที่ไกล ยังไม่ไกลเท่า บันไดที่ต้องเจอ</span></div>
        <span class="muted small">สไตล์ตัวอักษร</span>
        <div class="opt" style="flex-direction:column;align-items:flex-start;gap:4px;"><span class="on">หนา ขอบดำ</span><span>แผ่นทึบ</span><span>เหลืองเน้น</span></div>
        <div style="display:flex;justify-content:space-between;padding-top:6px;"><span class="muted small">ขนาด</span><span class="num">54</span></div>
        <span class="bar"><i style="width:55%;"></i></span>
        <div style="display:flex;justify-content:space-between;"><span class="muted small">ตำแหน่ง</span><span>กลางล่าง</span></div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:16px 26px 20px;"><span class="muted small">เรนเดอร์ใหม่เฉพาะแบบ 45 วิ · ~45 วิ</span><div style="flex:1;"></div><span class="btn">ยกเลิก</span><span class="btn pri">บันทึก · เรนเดอร์ใหม่</span></div>
  </div>"""

PAGES = {"B1": B1, "B2": B2, "B2Custom": B2C, "B2Run": B2R, "B3": B3, "B3Edit": B3E}

BOARDS = [  # (stem, title, x, y, note)
    ("B1", "1 · ① ใส่วิดีโอ — วางไฟล์ · ถอดเสียงเริ่มเอง", 0, 0,
     "① ปุ่มมีแค่ เลือกไฟล์ · ลิงก์โฟลเดอร์ · เลือกสไตล์ — วางหลายไฟล์ได้เป็นรายการในแผงเดียว (ไม่มีหน้าคลังคลิป) · วางแล้ว upload → POST /api/setup สร้าง projects/<ชื่อ>.toml → scan → listen อัตโนมัติ (ทุกสไตล์/ทุกแบบใช้ร่วมกัน) · ไฟล์แนวนอนบอกล่วงหน้าว่าจะครอป 9:16"),
    ("B2", "2 · ② สไตล์ — 4 สูตรจากเอนจิน + กำหนดเอง (เลือก A)", 1560, 0,
     "② การ์ด A–D = RECIPES ใน settings.py (preset tiktok-sell / proof / teach / compare) — การ์ดเป็นภาพเต็ม ตัวอักษรใหญ่ ไม่มีชิป · เลือกแล้วแถบล่างบอกว่าสูตรจะแต่งอะไร 5 ช่อง ([autofx] ของ preset — ยังไม่มีในเอนจินวันนี้) อ่านอย่างเดียว · แก้จริงทีละแบบในขั้น ③ · CTA เดียว 'ตัดให้เลย · 6 แบบ' = job quick"),
    ("B2Custom", "3 · ② สไตล์ — กำหนดเอง 6 ตัวเลือก", 3120, 0,
     "② กำหนดเอง = 6 แผงกระจก: ระยะเวลา (compose.target) · ซับ (caption mode) · HOOK+การ์ดปิด (fxtext) · เพลงตามจังหวะ (music mood + beat snap + duck) · สติกเกอร์/ภาพซ้อน (overlay คลัง 200) · เอฟเฟกต์รายช็อต (fx.py) — ตัวเลือกเป็นข้อความขีดเส้นใต้ ไม่ใช่ชิป · ตัวเลขละเอียดไปอยู่ในลิ้นชักแก้ของขั้น ③\nสมมติฐาน: 'ระยะเวลา' ของกำหนดเอง = แบบที่ถูกเลือกไว้ก่อนในขั้น ③ ส่วนเอนจินยังตัดครบ 6 แบบเหมือนสูตร A–D (ถ้าอยากให้กำหนดเองตัดแบบเดียว บอกได้)"),
    ("B2Run", "4 · ② กำลังตัด — ดูแบบที่เสร็จก่อนได้", 4680, 0,
     "② poll /api/job · การ์ดสไตล์ล็อก (จาง) · แถว 6 แบบขึ้นสถานะทีละแบบ เสร็จแล้วกด 'ดู' ได้เลย · ตัวเลขใหญ่ 2/6 · หยุด = /api/job/stop · เสร็จครบพาไป ③ เอง · ไม่มีหน้า log/ไปป์ไลน์แยก"),
    ("B3", "5 · ③ เลือกแบบ · ส่งออก — แท็บสไตล์ · 6 แบบ · ชั้นแต่ง", 0, 1250,
     "③ แท็บบน = สไตล์ที่ตัดแล้ว (A) · สไตล์อื่น/กำหนดเอง = 'ตัดเพิ่ม ▸' (recut ใช้ listen เดิม) · 6 แบบเป็นการ์ดภาพเต็ม ตัวเลขเวลาใหญ่: 30 / 45 / 60 / ตัดชิดทั้งคลิป / AI ไฮไลต์ 45 / ยิงรัว (ต่างกันที่ EDL ใช้ชั้นแต่งเดียวกัน) · เลือก 1 → แผงขวา: ตัวอย่าง + 'ชั้นแต่งของแบบนี้' 5 แถว ปุ่ม แก้/เพิ่ม เปิดลิ้นชัก (หน้า 6) · ส่งออก 3 ชนิด: ภาพ+เสียง / +ซับ / +ทุกชั้น (build ③ ④ ⑤) · 'ไทม์ไลน์' เป็นลิงก์เล็ก"),
    ("B3Edit", "6 · ③ ลิ้นชักแก้ชั้นแต่ง — ซับ (แท็บอื่น: HOOK · เพลง · สติกเกอร์ · เอฟเฟกต์)", 1560, 1250,
     "③ ลิ้นชักกระจกเดียว 5 แท็บ แทนหน้าแก้ 5 หน้าของ v3-C · ตัวอย่างซับ: โหมด ทั้งบรรทัด/ทีละคำ/ปิด · 8 บรรทัด + แถบความมั่นใจ (เหลืองอุ่น = ไม่มั่นใจ แก้ก่อนเผา) · สไตล์ 3 ชุด + ขนาด/ตำแหน่ง · บันทึก = เรนเดอร์ใหม่เฉพาะแบบที่เลือก · แท็บอื่นใช้โครงเดียวกัน (รายการซ้าย · ตัวอย่างขวา)"),
]

HEAD = """v4 · แนวท้องฟ้า — ฟ้าค่ำไล่โทนจากบนลงล่าง แสงอุ่นจาง ๆ ที่ขอบฟ้าล่าง · แผงกระจกบางแทนกล่องทึบ · ตัวอักษร Mitr น้ำหนักเบา ตัวเลขใหญ่ · ตัวเลือกเป็นข้อความขีดเส้นใต้ ไม่ใช่ชิป · ปุ่มทรงแคปซูล ปุ่มหลักสีขาวนวลปุ่มเดียวต่อหน้า — mockup เท่านั้น (ยังไม่ code) · 3 ขั้น 6 หน้า
① ใส่วิดีโอ (ปุ่ม 3 ตัว · หลายไฟล์ · ถอดเสียงเริ่มเอง) → ② สไตล์ (การ์ดภาพเต็ม A–D + กำหนดเอง 6 ตัวเลือก → ตัดให้เลย → กำลังตัด) → ③ ส่งออก (แท็บสไตล์ · 6 แบบเป็นการ์ดภาพ · เลือก 1 → แก้ชั้นแต่งในลิ้นชัก → ส่งออก 3 ชนิด)
ตัดออกจาก v3-C: คลังคลิป · คลังชิ้น · บทพูด · ขั้นสูง 7 แท็บ · ไปป์ไลน์/log · รีเซ็ต · แผนที่เส้นทาง · AI ดูหนัง · ไทม์ไลน์เต็มหน้า (เหลือลิงก์เล็กในขั้น ③) · หน้าแก้ 5 หน้า → ลิ้นชักเดียว 5 แท็บ
โทเคน: ท้องฟ้า #081326 → #0d1f3d → #153a63 → #1f5584 · แสงขอบฟ้า rgba(255,196,150,.16) · กระจก rgba(255,255,255,.055) เส้น .10 มุม 18 blur 16 · ตัวหนังสือ #eef4ff · จาง #8fa3c2 · แอกเซนต์ฟ้าอ่อน #8fd0ff (เหลืองอุ่น #ffd48a เฉพาะ 'ไม่มั่นใจ'/คำเน้น HOOK) · ปุ่มหลัก #eef4ff ตัวหนังสือ #081326 · Mitr 300/400/500
สิ่งที่เอนจินยังไม่มี (ต้องทำก่อน code จริง): ตัดหลายแบบต่อสไตล์ (variants) · สูตรเลือกชั้นแต่งให้เอง (autofx) · ตัดเพิ่มสไตล์อื่นโดยใช้ listen เดิม (recut) — วันนี้ vcut_engine ตัดได้ 1 แบบต่อโปรเจกต์"""

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
        c["annotations"].append({"id": f"b4-{stem}", "x": x, "y": y - 300, "w": 1440, "text": note, "page": PAGE})
    c["annotations"].append({"id": "b4-head", "x": 0, "y": -620, "w": 3000, "text": HEAD, "page": PAGE})
    c["launch"] = {"view": "canvas", "page": PAGE}
    json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("canvas merged:", path)

if __name__ == "__main__":
    write_pages()
    if "--canvas" in sys.argv:
        merge_canvas(sys.argv[sys.argv.index("--canvas") + 1])
