# v3 · ทิศทาง C แผงควบคุม — 7 หน้า flow เดียวกัน (Q1→Q2→Q2Adv→Q2Run→Q3→Q3Sticker→Full)
import json

CSS = """
body{margin:0;background:#1c1e1b;color:#d9dbd2;font-family:"Mitr","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:12.5px}
.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.tag{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#7f847a;white-space:nowrap}
.panel{background:#242723;border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(0,0,0,.5),0 2px 0 #0f100e}
.well{white-space:nowrap;background:#161815;border-radius:4px;box-shadow:inset 0 2px 4px rgba(0,0,0,.7),inset 0 0 0 1px #0f100e}
.well.sel{box-shadow:inset 0 2px 4px rgba(0,0,0,.7),inset 0 0 0 1.5px #ffb020}
.led{width:8px;height:8px;border-radius:999px;background:#3a3d38;box-shadow:inset 0 1px 1px rgba(0,0,0,.6);flex-shrink:0}
.led.on{background:#ffb020;box-shadow:0 0 6px #ffb020,0 0 12px rgba(255,176,32,.5)}
.led.dim{background:#8a6a2a;box-shadow:0 0 4px rgba(255,176,32,.35)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:6px 12px;border-radius:4px;font-size:12px;color:#d9dbd2;background:linear-gradient(#34382f,#2a2d27);box-shadow:0 2px 0 #0f100e,inset 0 1px 0 rgba(255,255,255,.08);white-space:nowrap}
.btn.on{background:linear-gradient(#3f4a2e,#2f3823);color:#ffb020;box-shadow:0 1px 0 #0f100e,inset 0 2px 3px rgba(0,0,0,.5)}
.btn.off{color:#7f847a}
.btn.sm{padding:3px 8px;font-size:10.5px}
.btn.ghost{background:transparent;box-shadow:inset 0 0 0 1px #3a3d38}
.row{display:grid;grid-template-columns:34px 160px 1fr auto auto;align-items:center;gap:14px;padding:9px 12px}
.row+.row{border-top:1px solid #0f100e}
.kv{font-size:12px;color:#7f847a}.kv b{color:#d9dbd2;font-weight:500}
.knob{width:34px;height:34px;border-radius:999px;background:radial-gradient(circle at 40% 35%,#4a4e46,#23261f 70%);box-shadow:0 2px 0 #0f100e,inset 0 1px 0 rgba(255,255,255,.12);position:relative;flex-shrink:0}
.knob::after{content:"";position:absolute;left:50%;top:4px;width:2px;height:10px;background:#ffb020;margin-left:-1px;border-radius:1px}
.knob.sm{width:26px;height:26px}.knob.sm::after{height:8px;top:3px}
.knob.r45::after{transform-origin:1px 13px;transform:rotate(45deg)}.knob.r90::after{transform-origin:1px 13px;transform:rotate(90deg)}.knob.rm60::after{transform-origin:1px 13px;transform:rotate(-60deg)}
.knob.sm.r45::after{transform-origin:1px 10px}.knob.sm.rm60::after{transform-origin:1px 10px}.knob.sm.r90::after{transform-origin:1px 10px}
.seg7{font-family:"JetBrains Mono",monospace;font-weight:700;color:#ffb020;text-shadow:0 0 8px rgba(255,176,32,.6);letter-spacing:.06em}
.seg7.off{color:#3a3d38;text-shadow:none}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;height:54px;border-radius:6px;background:linear-gradient(#ffc652,#e59a10);color:#1c1e1b;font-size:15px;font-weight:600;box-shadow:0 3px 0 #7a5208,inset 0 1px 0 rgba(255,255,255,.4)}
.cta.sm{height:40px;font-size:13px}
.meter{display:flex;gap:2px}.meter i{flex:1;height:8px;background:#2a2d27;border-radius:1px;box-shadow:inset 0 1px 1px rgba(0,0,0,.5)}.meter i.l{background:#ffb020;box-shadow:0 0 4px rgba(255,176,32,.5)}.meter i.h{background:#8a6a2a}
.stat{display:flex;justify-content:space-between;font-family:"JetBrains Mono",monospace;font-size:10.5px;color:#7f847a;letter-spacing:.04em}.stat span:last-child{color:#d9dbd2}
.h{display:flex;align-items:center;gap:12px}.h .t{font-size:16px;font-weight:500}
.lane{display:flex;align-items:center;gap:8px;height:20px}.lane .bar{flex:1;position:relative;height:12px;background:#111311;border-radius:2px}
.blk{position:absolute;top:0;height:12px;border-radius:2px;background:#4a4e46}.blk.a{background:#8a6a2a}.blk.on{background:#ffb020}
.thumb{position:relative;border-radius:3px;overflow:hidden;background:#000}.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb .tc{position:absolute;right:4px;bottom:4px;padding:0 5px;background:rgba(0,0,0,.75);font-family:"JetBrains Mono",monospace;font-size:10px;color:#ffb020}
.tog{width:30px;height:16px;border-radius:3px;background:#161815;box-shadow:inset 0 2px 3px rgba(0,0,0,.7);position:relative;flex-shrink:0}.tog i{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:2px;background:linear-gradient(#4a4e46,#2a2d27);box-shadow:0 1px 0 #0f100e}.tog.on i{left:16px;background:linear-gradient(#ffc652,#e59a10)}
.fld{display:flex;flex-direction:column;gap:3px}.fld label{font-size:10.5px;color:#7f847a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fld div{padding:5px 8px;font-family:"JetBrains Mono",monospace;font-size:11.5px;color:#d9dbd2}
.fld.chg div{box-shadow:inset 0 2px 4px rgba(0,0,0,.7),inset 0 0 0 1px #ffb020}
.strip{display:flex;gap:2px;align-items:center}.strip span{font-size:9.5px;font-family:"JetBrains Mono",monospace;letter-spacing:.1em}
"""

def topbar(step, left_extra="", right_extra="", full=False):
    s = [("01 ใส่วิดีโอ", 1), ("02 เลือกสไตล์ · ตัด", 2), ("03 เลือกแบบ · ส่งออก", 3)]
    keys = ""
    for lbl, n in s:
        if n < step:   cls, led = "btn", "led on"
        elif n == step: cls, led = "btn on", "led on"
        else:          cls, led = "btn off", "led"
        keys += f'<span class="{cls}"><span class="{led}"></span>{lbl}</span>'
    mode = ''
    return f"""<div class="panel" style="height:52px;margin:10px 10px 0 10px;display:flex;align-items:center;gap:12px;padding:0 16px;flex-shrink:0;">
    <span class="mono" style="font-size:13px;font-weight:700;letter-spacing:.1em;">VCUT</span>
    <span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;">{"IMG_1234.MOV  02:14" if full else "IMG_1234.MOV  02:14  1126×1788"}</span>
    {left_extra}
    <div style="flex:1;"></div>
    <div style="display:flex;gap:6px;">{keys}</div>
    <div style="flex:1;"></div>
    {right_extra}
    {mode}
  </div>"""

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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <style>{CSS}</style>
</helmet>
<div style="width:1440px;height:900px;background:#1c1e1b;display:flex;flex-direction:column;overflow:hidden;position:relative;">
{body}
</div>
</x-dc>
</body>
</html>
"""

STT_WELL = '<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;"><span style="color:#ffb020;">●</span> STT 18/26</span>'

# ───────────────────────── ① ใส่วิดีโอ
CQ1 = topbar(1, right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">ENGINE 127.0.0.1:8765 <span style="color:#ffb020;">● LINK</span></span>') + """
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;gap:14px;padding:16px 18px;">
      <div class="h"><span class="tag">SEC 00 · INPUT</span><span class="t">ใส่วิดีโอ</span><span class="kv">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอน — เอนจินปรับ 9:16 ให้เอง · มากกว่า 1 ไฟล์จัดที่ "คลังคลิป"</span></div>
      <div class="well" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border:1px dashed #3a3d38;">
        <div class="knob" style="width:64px;height:64px;"></div>
        <span style="font-size:18px;font-weight:500;">ลากวิดีโอมาวางที่ช่องนี้</span>
        <span class="mono kv" style="font-size:11px;">UPLOAD · CHUNK 8 MB · RESUME OK · หรือ LINK โฟลเดอร์ฟุตเทจ</span>
        <span class="btn">เลือกไฟล์…</span>
      </div>
      <div class="well" style="display:grid;grid-template-columns:44px 1fr auto;gap:14px;align-items:center;padding:10px 12px;">
        <div class="thumb" style="width:44px;height:78px;"><img src="f14.jpg"></div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:14px;font-weight:500;">IMG_1234.MOV</span><span class="mono kv">291 MB</span></div>
          <div class="mono" style="font-size:11px;color:#7f847a;">02:14 · 1126×1788 · HEVC 60 fps · AUDIO 44.1 kHz · SPEECH 1.7 / 2.2 min · −6.8 LUFS</div>
          <div style="display:flex;gap:18px;align-items:center;">
            <span style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">SCAN</span><span class="mono" style="font-size:11px;">DONE 6 s</span></span>
            <span style="display:flex;align-items:center;gap:8px;"><span class="led dim"></span><span class="tag">LISTEN</span><span class="mono" style="font-size:11px;">RUNNING 18/26 · whisper large-v3-turbo</span></span>
            <span style="display:flex;align-items:center;gap:8px;"><span class="led"></span><span class="tag">THUMBS</span><span class="mono" style="font-size:11px;color:#7f847a;">QUEUED</span></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;"><span class="btn on">ถัดไป · 02 เลือกสไตล์ ▸</span><span class="btn sm">คลังคลิป · 3 ▸</span></div>
      </div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;">
      <span class="tag">LISTEN · AUTO-START</span>
      <div class="well" style="padding:10px 14px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">SEGMENTS</span><span class="seg7" style="font-size:40px;">18<span style="font-size:18px;color:#7f847a;text-shadow:none;">/26</span></span></div>
      <div class="meter">""" + "".join('<i class="l"></i>' for _ in range(14)) + "".join('<i></i>' for _ in range(6)) + """</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div class="stat"><span>ELAPSED</span><span>00:27</span></div>
        <div class="stat"><span>ETA</span><span>~00:30</span></div>
        <div class="stat"><span>SHARED BY</span><span>ALL VARIANTS</span></div>
      </div>
      <div class="well mono" style="padding:8px 10px;font-size:10px;line-height:15px;color:#7f847a;white-space:pre-wrap;">projects/IMG_1234.toml  created
.vcut/scan.json   ok
.vcut/listen/     18 seg  …
thumbs             queued</div>
      <div style="flex:1;"></div>
      <span class="kv" style="font-size:11px;line-height:16px;">ถอดเสียงเริ่มทันทีเพราะทุกแบบใช้ร่วมกัน (≈ ครึ่งหนึ่งของเวลาทั้งหมด) — ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
      <div class="well" style="padding:10px 14px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">NEXT</span><span class="seg7 off" style="font-size:32px;">02</span></div>
    </div>
  </div>"""

# ───────────────────────── ② โต๊ะทำงาน (สไตล์ + ชั้น + สั่งตัด)
def style_cards(locked=False):
    return f"""<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
        <div class="well sel" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <div style="height:88px;border-radius:3px;background:#5a0c18;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;"><span style="font-size:14px;font-weight:600;color:#fff;">คลิป VDO ของคุณ</span><span style="font-size:14px;font-weight:600;color:#ffb020;">ดูเจ๋ง ได้เนี่ย</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span style="font-size:13px;font-weight:500;">A · ปิดการขาย / แนะนำช่อง</span></div>
          <span class="kv">ช็อต <b>1.7–2.0 s</b> · ช้า → รัว → ช้า</span>
        </div>
        <div class="well" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <div style="height:88px;border-radius:3px;background:#0d0e0c;display:flex;align-items:center;justify-content:center;"><span class="seg7" style="font-size:26px;">255.9K</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led"></span><span style="font-size:13px;font-weight:500;">B · โชว์หลักฐาน</span></div>
          <span class="kv">ช็อต <b>2.4 s</b> · เลขนับขึ้น</span>
        </div>
        <div class="well" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <div style="height:88px;border-radius:3px;background:#0d0e0c;display:flex;align-items:center;justify-content:center;"><svg width="110" height="28" viewBox="0 0 120 30" fill="none"><path d="M6 6 C 40 6 40 24 74 24 L 114 24" stroke="#ffb020" stroke-width="2" style="filter:drop-shadow(0 0 4px #ffb020);"/></svg></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led"></span><span style="font-size:13px;font-weight:500;">C · สอนกรอบวิธีคิด</span></div>
          <span class="kv">ช็อต <b>5.0 s</b> · ผังนีออน</span>
        </div>
        <div class="well" style="padding:8px;display:flex;flex-direction:column;gap:6px;opacity:.45;">
          <div style="height:88px;border-radius:3px;background:#0d0e0c;"></div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="led"></span><span style="font-size:13px;font-weight:500;">D · Before | After</span></div>
          <span class="kv">NO COMPARE · ยังไม่พร้อม</span>
        </div>
      </div>"""

CONTROLS = """<div style="display:flex;gap:28px;align-items:flex-end;">
        <div style="display:flex;flex-direction:column;gap:6px;"><span class="tag">Length</span><div style="display:flex;gap:4px;"><span class="btn">30</span><span class="btn on">45 s</span><span class="btn">60</span><span class="btn">ALL</span></div></div>
        <div style="display:flex;flex-direction:column;gap:6px;"><span class="tag">Variants</span><div style="display:flex;gap:4px;"><span class="btn">2</span><span class="btn">3</span><span class="btn on">4</span><span class="btn">5</span></div></div>
        <div style="display:flex;flex-direction:column;gap:6px;"><span class="tag">AI · claude -p</span><div style="display:flex;gap:14px;align-items:center;height:30px;"><span style="display:flex;align-items:center;gap:8px;"><span class="tog"><i></i></span>ไฮไลต์ให้ 1 แบบ <span class="mono kv">trim_suggest · 3m · $0.5</span></span><span style="display:flex;align-items:center;gap:8px;"><span class="tog on"><i></i></span>ดูหนังแล้วเสนอแก้ <span class="mono kv">review · 1m</span></span></div></div>
      </div>"""

LAYERS = """<div class="well" style="display:flex;flex-direction:column;padding:4px 0;">
        <div class="row"><span class="knob"></span><span>ซับจากบทพูด</span><span class="kv">TikTok หนา ขาวขอบดำ · กลางล่าง · <b>54</b> · ทั้งบรรทัด</span><span class="btn sm">แก้</span><span class="led on"></span></div>
        <div class="row"><span class="knob r45"></span><span>HOOK + การ์ดปิด</span><span class="kv">จากประโยคแรก · pop_words · เน้นแดง · การ์ด <b>4 s</b> · @ชื่อช่อง</span><span class="btn sm">แก้</span><span class="led on"></span></div>
        <div class="row"><span class="knob rm60"></span><span>เพลง · 2 แทร็ก</span><span class="kv">TR1 สนุก/มีพลัง <b>−18 dB</b> · DUCK 6 · LOOP — TR2 SFX ให้ AI วาง · ไม่ล็อกบีต</span><span class="btn sm">แก้</span><span class="led on"></span></div>
        <div class="row" style="opacity:.6;"><span class="knob" style="filter:grayscale(1);"></span><span>สติกเกอร์ / ภาพซ้อน</span><span class="kv">คลัง 200 · มาสคอต: NO FILE (ProRes 4444)</span><span class="btn sm">แก้</span><span class="led"></span></div>
        <div class="row" style="opacity:.6;"><span class="knob" style="filter:grayscale(1);"></span><span>แผนที่เส้นทาง</span><span class="kv">journey · 0 หมุด · คนเดิน · เส้นเรือง</span><span class="btn sm">แก้</span><span class="led"></span></div>
        <div class="row"><span class="knob r90"></span><span>เอฟเฟกต์รายช็อต</span><span class="kv">ยิงรัว ZOOM <b>1.05→1.22</b> + PUNCH · GLITCH ท้าย · SPEED 1.0</span><span class="btn sm">แก้</span><span class="led on"></span></div>
      </div>"""

def q2_left(locked=False):
    lock = ('<div style="position:absolute;inset:0;background:rgba(28,30,27,.62);z-index:2;border-radius:6px;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;">'
            '<span class="btn"><span class="led on"></span>LOCKED · กำลังตัด — กด STOP แล้วแก้ได้</span></div>') if locked else ""
    return f"""<div class="panel" style="display:flex;flex-direction:column;gap:14px;padding:16px 18px;overflow:hidden;position:relative;">
      {lock}
      <div class="h"><span class="tag">SEC 01 · STYLE</span><span class="t">สไตล์</span><span class="kv">จากคลิปอ้างอิง 7 ตัว · ตัวเลขวัดจากไฟล์จริง</span></div>
      {style_cards()}
      {CONTROLS}
      <div class="h" style="margin-top:2px;"><span class="tag">SEC 02 · LAYERS</span><span class="t">ชั้นแต่งหนัง</span><span class="kv">ค่าตั้งต้นของทุกแบบ · แก้รายแบบได้อีกทีที่ 03</span></div>
      {LAYERS}
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:8px;"><span class="btn">คลังชิ้น · 18 ▸</span><span class="btn">บทพูด · 26 ▸</span><span class="btn">ขั้นสูง ▸</span><span class="mono kv" style="font-size:10.5px;">CFG 135 · PICK 7 · ORDER 6 · AI · PIPELINE · RESET/HISTORY · CACHE 0.6 GB</span><div style="flex:1;"></div><span class="kv" style="font-size:11px;">ทุกอย่างที่เอนจินทำได้อยู่ในนี้</span></div>
    </div>"""

OUT_LIST = """<div class="well" style="display:flex;flex-direction:column;padding:4px 0;">
        <div style="display:grid;grid-template-columns:24px 1fr auto;gap:10px;padding:8px 12px;align-items:center;"><span class="seg7" style="font-size:12px;">A</span><span style="font-size:13px;">ตัดชิดทั้งคลิป<br><span class="kv">mode all · ลบเงียบ 7 ช่วง</span></span><span class="seg7" style="font-size:14px;">01:43</span></div>
        <div style="display:grid;grid-template-columns:24px 1fr auto;gap:10px;padding:8px 12px;align-items:center;border-top:1px solid #0f100e;"><span class="seg7" style="font-size:12px;">B</span><span style="font-size:13px;">ย่อ 45 วิ ตามกฎ<br><span class="kv">mode fit · ประโยคคะแนนสูงก่อน</span></span><span class="seg7" style="font-size:14px;">00:45</span></div>
        <div style="display:grid;grid-template-columns:24px 1fr auto;gap:10px;padding:8px 12px;align-items:center;border-top:1px solid #0f100e;"><span class="seg7" style="font-size:12px;">C</span><span style="font-size:13px;">ยิงรัว + ซูมไล่<br><span class="kv">ช็อต 0.8 s · fx zoom/punch</span></span><span class="seg7" style="font-size:14px;">00:45</span></div>
        <div style="display:grid;grid-template-columns:24px 1fr auto;gap:10px;padding:8px 12px;align-items:center;border-top:1px solid #0f100e;"><span class="seg7" style="font-size:12px;">D</span><span style="font-size:13px;">ช้า มีซับ<br><span class="kv">ช็อต 2.0 s · caption</span></span><span class="seg7" style="font-size:14px;">00:58</span></div>
      </div>"""

CQ2 = topbar(2, right_extra=STT_WELL) + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;">
    {q2_left()}
    <div class="panel" style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;">
      <span class="tag">OUTPUT · 4 VARIANTS</span>
      {OUT_LIST}
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div class="stat"><span>LISTEN</span><span>RUNNING 18/26</span></div>
        <div class="stat"><span>PREPARE · COMPOSE ×4</span><span>01:10</span></div>
        <div class="stat"><span>RENDER · ASSEMBLE · CAPTION</span><span>03:00</span></div>
        <div class="stat"><span>FX · AI REVIEW</span><span>01:00 · $0.16</span></div>
      </div>
      <div style="flex:1;"></div>
      <div class="well" style="padding:10px 14px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">ETA</span><span class="seg7" style="font-size:40px;">05:00</span></div>
      <div class="cta"><span class="led" style="background:#1c1e1b;box-shadow:none;"></span>ตัดให้เลย · 4 แบบ</div>
    </div>
  </div>"""

# ───────────────────────── ② ลิ้นชัก ขั้นสูง
def cost(n, label):
    return (f'<span style="display:inline-flex;align-items:center;gap:6px;"><span class="meter" style="width:34px;">'
            + "".join(f'<i class="{"l" if i < n else ""}"></i>' for i in range(4)) + f'</span><span class="tag">{label}</span></span>')

def grp(title, tier, count, fields, dim=False):
    f = "".join(f'<div class="fld{" chg" if chg else ""}"><label>{l}</label><div class="well">{v}</div></div>' for l, v, chg in fields)
    return f"""<div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;{'opacity:.6;' if dim else ''}">
          <div style="display:flex;align-items:center;gap:12px;"><span style="font-size:12.5px;font-weight:500;">{title}</span>{tier}<div style="flex:1;"></div><span class="mono kv" style="font-size:10.5px;">{count}</span></div>
          {'<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">' + f + '</div>' if fields else ''}
        </div>"""

ADV_TABS = [("cfg","ตั้งค่า","135"),("pick","วิธีเลือกชิ้น","7"),("order","ลำดับ","6"),("ai","AI","4"),("pipe","ไปป์ไลน์ · สถานะ","11"),("reset","รีเซ็ต · ประวัติ · cache","3"),("more","เพิ่มเติม","")]
def adv_tabs(active):
    return "".join(f'<span class="btn{" on" if k == active else ""}">{l}{(" <span class=\"mono\" style=\"font-size:10px;\">" + n + "</span>") if n else ""}</span>' for k, l, n in ADV_TABS)

CQ2ADV = topbar(2, right_extra=STT_WELL) + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;opacity:.35;">
    {q2_left()}
    <div class="panel"></div>
  </div>
  <div style="position:absolute;inset:0;background:rgba(0,0,0,.45);"></div>
  <div class="panel" style="position:absolute;right:10px;top:72px;bottom:10px;width:780px;display:flex;flex-direction:column;overflow:hidden;box-shadow:-24px 0 60px rgba(0,0,0,.6),0 2px 0 #0f100e;">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #0f100e;">
      <span class="tag">SEC 03 · ADVANCED</span><span style="font-size:16px;font-weight:500;">ขั้นสูง</span><span class="kv">ค่าที่แก้บันทึกลง projects/IMG_1234.toml เหมือนแท็บตั้งค่าเดิม</span>
      <div style="flex:1;"></div><span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">MOD 2 · UNSAVED</span><span class="btn sm">✕</span>
    </div>
    <div style="display:flex;gap:4px;padding:10px 16px;border-bottom:1px solid #0f100e;">
      {adv_tabs("cfg")}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:10px;padding:12px 16px;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="well mono" style="flex:1;padding:6px 10px;font-size:11px;color:#7f847a;">SEARCH ▸ min_shot · lufs · noise …</span>
        <span class="btn on sm">เฉพาะที่ตั้งเอง 6</span><span class="btn sm">ทั้งหมด</span>
      </div>
      <div style="display:flex;align-items:center;gap:18px;"><span class="tag">COST OF CHANGE</span>{cost(1,"no rebuild")}{cost(2,"assemble")}{cost(3,"listen / silence")}{cost(4,"render all")}</div>
      {grp("② เตรียมคลัง — ช่วงพูด · ตัดชน · วิว", cost(2,"decide + assemble"), "18 VALUES", [
          ("talk.min_shot · ช็อตพูดสั้นสุด","0.80",False),("talk.gap_merge · เชื่อมช่องเงียบ","0.35",False),("talk.margin_pre / post","0.12 / 0.20",False),
          ("jumpcut.noise_db · เกณฑ์เงียบ","auto → −15",True),("jumpcut.min_silence / pad","0.25 / 0.05",False),("broll.run_max · วิวติดกันได้","7",False)])}
      {grp("③ รวมร่าง — เป้าความยาว · รูปแบบ", cost(2,"assemble"), "12 VALUES", [
          ("compose.mode","fit ▾  (ใหม่ · G1)",False),("compose.target_minutes","0.75",True),("compose.pattern","TALK, BROLL",False)])}
      {grp("④ ตัดชิ้น · ต่อไฟล์ — ผืน · เสียง · เข้ารหัส", cost(4,"render all"), "31 VALUES", [
          ("video.width × height","1080 × 1920",False),("video.vertical_mode","blur_pad ▾",False),("audio.master_lufs","−14.0",False),
          ("audio.same_level / match_clips","ON / OFF",False),("encode.vcodec · bitrate","h264_videotoolbox · 12M",False),("render.workers","2",False)])}
      {grp("① อ่านคลิป · ② ถอดเสียง · ⑤ แต่งหนัง …", cost(3,"listen"), "74 MORE ▾", [], dim=True)}
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:10px 16px;border-top:1px solid #0f100e;">
      <span class="btn sm">รีเซ็ตขั้นนี้</span><span class="btn sm">ประวัติ 3</span><span class="btn sm">ล้าง cache 0.6 GB</span>
      <div style="flex:1;"></div><span class="btn sm off">ทิ้ง</span><span class="btn sm on">บันทึก 2 ค่า</span>
    </div>
  </div>"""

# ───────────────────────── ② กำลังตัด
def phase(led, name, note, t, cur=False):
    return (f'<div style="display:grid;grid-template-columns:8px 160px 1fr auto;gap:10px;align-items:center;padding:6px 10px;{"background:#161815;border-radius:4px;box-shadow:inset 0 0 0 1px #ffb020;" if cur else ""}">'
            f'<span class="led {led}"></span><span style="font-size:12px;{"color:#ffb020;" if cur else ""}">{name}</span><span class="kv" style="font-size:10.5px;">{note}</span><span class="mono" style="font-size:10.5px;color:#7f847a;">{t}</span></div>')

CQ2RUN = topbar(2, right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;"><span class="led dim" style="display:inline-block;margin-right:6px;"></span>CUTTING · C 3/4 · 01:52</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;">
    {q2_left(locked=True)}
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:16px 18px;overflow:hidden;">
      <div class="h"><span class="tag">JOB · 4 VARIANTS</span><span class="t">กำลังตัด</span><div style="flex:1;"></div><span class="mono kv" style="font-size:11px;">01:52 · ETA 01:40</span></div>
      <div class="meter">""" + "".join('<i class="l"></i>' for _ in range(11)) + '<i class="h"></i>' + "".join('<i></i>' for _ in range(8)) + f"""</div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        {phase("on","① SCAN","DONE AT DROP","6 s")}
        {phase("on","② LISTEN · PREPARE","26 SEG · 7 GAP · 18 PCS","41 s")}
        {phase("dim","③ COMPOSE · RENDER","C · RENDER 7/14","× 4", cur=True)}
        <div style="display:flex;gap:10px;padding:0 10px 4px 28px;" class="mono"><span style="font-size:10.5px;color:#ffb020;">A ✓ 34 s</span><span style="font-size:10.5px;color:#ffb020;">B ✓ 12 s</span><span style="font-size:10.5px;">C …</span><span style="font-size:10.5px;color:#7f847a;">D WAIT</span></div>
        {phase("","④ CAPTION","ALL · RE-ENCODE","~2:00")}
        {phase("","⑤ FX · AI REVIEW","TEXT · MUSIC · FX · REVIEW","~1:30")}
      </div>
      <span class="tag">READY — กดดูได้เลย</span>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">
        <div style="display:flex;flex-direction:column;gap:4px;"><div class="thumb" style="height:112px;"><img src="f14.jpg"><span class="tc">1:43</span></div><span style="display:flex;align-items:center;gap:6px;font-size:11px;"><span class="led on"></span>A</span></div>
        <div style="display:flex;flex-direction:column;gap:4px;"><div class="thumb" style="height:112px;"><img src="f57.jpg"><span class="tc">0:44</span></div><span style="display:flex;align-items:center;gap:6px;font-size:11px;"><span class="led on"></span>B</span></div>
        <div style="display:flex;flex-direction:column;gap:4px;"><div class="well" style="height:112px;display:flex;align-items:center;justify-content:center;"><span class="seg7" style="font-size:16px;">7/14</span></div><span style="display:flex;align-items:center;gap:6px;font-size:11px;"><span class="led dim"></span>C</span></div>
        <div style="display:flex;flex-direction:column;gap:4px;"><div class="well" style="height:112px;border:1px dashed #3a3d38;"></div><span style="display:flex;align-items:center;gap:6px;font-size:11px;color:#7f847a;"><span class="led"></span>D</span></div>
      </div>
      <div class="well mono" style="flex:1;padding:8px 10px;font-size:10px;line-height:15px;color:#7f847a;white-space:pre-wrap;overflow:hidden;">ASSEMBLE  6 pcs → B-45s.mp4
  dur 0:44 (44.2 s) · −14.0 LUFS
RENDER  14 pcs (cache 3, new 11)
  render 7/14  sample −11.8 dB  eta ~0:35</div>
      <div style="display:flex;gap:6px;">
        <span class="btn" style="flex:1;height:38px;box-sizing:border-box;"><span style="display:inline-block;width:9px;height:9px;background:#d9dbd2;"></span>STOP</span>
        <span class="btn on" style="flex:1.4;height:38px;box-sizing:border-box;">ดู A · B ที่เสร็จแล้ว ▸</span>
      </div>
      <span class="kv" style="text-align:center;font-size:10.5px;">เสร็จครบแล้วพาไป 03 เอง</span>
    </div>
  </div>"""

# ───────────────────────── ③ เลือกแบบ · แต่ง · AI · ส่งออก
def vcard(letter, img, name, tags, tc, sel=False, view=False, zoom=""):
    return f"""<div class="well{' sel' if sel else ''}" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <div class="thumb" style="height:214px;"><img src="{img}" style="{zoom}"><span class="tc">{tc}</span>{'<span class="btn sm on" style="position:absolute;left:6px;top:6px;">VIEW</span>' if view else ''}</div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="tog{' on' if sel else ''}"><i></i></span><span class="seg7" style="font-size:12px;">{letter}</span><span style="font-size:12.5px;font-weight:500;">{name}</span></div>
          <span class="mono kv" style="font-size:10px;letter-spacing:.06em;">{tags}</span>
        </div>"""

def lanes(sel_sticker=False):
    return f"""<div style="display:flex;flex-direction:column;gap:4px;">
        <div class="lane"><span class="tag" style="width:34px;">TEXT</span><div class="bar"><span class="blk a" style="left:0;width:6%;"></span><span class="blk a" style="left:91%;width:9%;"></span></div></div>
        <div class="lane"><span class="tag" style="width:34px;">STKR</span><div class="bar"><span class="blk {'on' if sel_sticker else 'a'}" style="left:0;width:100%;"></span></div></div>
        <div class="lane"><span class="tag" style="width:34px;">MUSIC</span><div class="bar"><span class="blk" style="left:0;width:100%;"></span></div></div>
        <div class="lane"><span class="tag" style="width:34px;">SUB</span><div class="bar"><span class="blk" style="left:0;width:41%;"></span><span class="blk" style="left:42%;width:29%;"></span><span class="blk" style="left:72%;width:28%;"></span></div></div>
      </div>"""

def preview(h, overlay_sel=False):
    handles = ""
    if overlay_sel:
        handles = "".join(f'<span style="position:absolute;{p};width:7px;height:7px;background:#ffb020;"></span>' for p in ("left:-4px;top:-4px","right:-4px;top:-4px","left:-4px;bottom:-4px","right:-4px;bottom:-4px"))
    return f"""<div style="position:relative;height:{h}px;aspect-ratio:9/16;border-radius:4px;overflow:hidden;background:#000;box-shadow:0 0 0 1px #0f100e;">
          <img src="f57.jpg" style="width:100%;height:100%;object-fit:cover;display:block;">
          <div style="position:absolute;left:0;right:0;top:14%;display:flex;flex-direction:column;align-items:center;gap:3px;">
            <span style="font-size:22px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;">น้ำตกที่ไกล</span>
            <span style="font-size:16px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;">ยังไม่ไกลเท่า</span>
            <span style="font-size:22px;font-weight:600;color:#E0102A;text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;">บันไดที่ต้องเจอ</span>
          </div>
          <div style="position:absolute;left:70%;top:6.5%;width:20%;aspect-ratio:1/1;{'outline:1.5px solid #ffb020;outline-offset:3px;' if overlay_sel else ''}"><img src="st-4k.png" style="width:100%;height:100%;object-fit:contain;display:block;">{handles}</div>
          <div style="position:absolute;left:12px;right:12px;bottom:14%;text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;">น้ำตกที่ไกลยังไม่ไกลเท่า</div>
        </div>"""

TRANSPORT = """<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid #0f100e;">
        <span class="btn sm">◀◀</span><span class="btn sm on">▶</span><span class="btn sm">▶▶</span><span class="btn sm">ไทม์ไลน์ ▸</span>
        <span class="well seg7" style="padding:3px 10px;font-size:14px;">00:00:01:12</span><span class="mono kv" style="white-space:nowrap;">/ 00:00:44:06</span>
        <div style="flex:1;"></div><span class="mono kv" style="font-size:10.5px;white-space:nowrap;">1080×1920 · −14.0 LUFS · 30 fps</span>
      </div>"""

def lrow(name, note, first=False):
    return f'<div style="display:grid;grid-template-columns:26px 1fr auto auto;gap:10px;align-items:center;padding:7px 10px;{"" if first else "border-top:1px solid #0f100e;"}"><span class="knob sm"></span><span style="font-size:12px;">{name}</span><span class="kv" style="font-size:10.5px;">{note}</span><span class="btn sm">แก้ ▸</span></div>'

def ai_op(text, first=False):
    return f'<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;{"" if first else "border-top:1px solid #0f100e;"}"><span class="led dim"></span><span style="flex:1;font-size:11.5px;">{text}</span><span class="btn sm on">รับ</span><span class="btn sm">ข้าม</span></div>'

CQ3 = topbar(3, left_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;">DONE 4/4 · 04:38</span>', right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">SEL <span style="color:#ffb020;">B</span> · 44.2 s · 6 SHOTS</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:400px 1fr 400px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden;">
      <div class="h"><span class="tag">SEC 04 · VARIANTS</span><span class="t" style="font-size:15px;">4 แบบ</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10.5px;">EXPORT <span style="color:#ffb020;">2</span></span></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
        {vcard("A","f14.jpg","ตัดชิดทั้งคลิป","6 SHOT · HOOK · MUSIC","1:43")}
        {vcard("B","f57.jpg","ย่อ 45 วิ ตามกฎ","6 SHOT · HOOK · CARD · MUSIC","0:44",sel=True,view=True)}
        {vcard("C","f88.jpg","ยิงรัว + ซูมไล่","14 SHOT · ZOOM · PUNCH","0:45",sel=True,zoom="transform:scale(1.12);")}
        {vcard("D","f116.jpg","ช้า มีซับ","9 SHOT · SUB 26","0:58")}
      </div>
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:8px;"><span class="btn sm">◀ กลับ 02</span><span class="kv" style="font-size:10.5px;">เปลี่ยนสไตล์/ความยาว · ถอดเสียงไม่ทำใหม่ (cache)</span></div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0;">{preview(560)}</div>
      {TRANSPORT}
      <div style="padding:4px 14px 12px 14px;">{lanes()}</div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden;">
      <div class="h"><span class="seg7" style="font-size:18px;">B</span><span class="t" style="font-size:15px;">ย่อ 45 วิ ตามกฎ</span><div style="flex:1;"></div><span class="well mono" style="padding:2px 8px;font-size:10px;color:#ffb020;">MOD 1 · REBUILD ⑤ ~45 s</span></div>
      <span class="tag">SEC 05 · LAYERS OF THIS VARIANT</span>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {lrow("ซับ","12 บรรทัด · <span style='color:#ffb020;'>2 ไม่มั่นใจ</span>",True)}{lrow("ข้อความ","HOOK 1 · การ์ดปิด 1")}{lrow("เพลง · 2 แทร็ก","มีพลัง 98 BPM · SFX 2")}{lrow("สติกเกอร์ / ภาพซ้อน","<span style='color:#ffb020;'>1 · เพิ่มไว้ในแบบนี้</span>")}{lrow("เอฟเฟกต์รายช็อต","punch · zoom 3 ช็อต")}{lrow("แผนที่เส้นทาง","ปิด · 0 หมุด")}
      </div>
      <div class="h"><span class="tag">AI REVIEW · 3 PROPOSALS</span><div style="flex:1;"></div><span class="btn sm">รับทั้งหมด</span><span class="btn sm">ตั้งค่า ▸</span></div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {ai_op("ช็อต 2 · ตัดหัว 0.8 s — เศษจากขอบ 53.0",True)}{ai_op("เอาช็อต 4 ออก · 0.72 s — ซ้ำกับช็อต 5")}{ai_op("“2.2 กิโล · 17 คุ้ง” ขึ้นจอที่ 6.0 s")}
      </div>
      <div style="flex:1;"></div>
      <span class="tag">SEC 06 · EXPORT · 2 SELECTED</span>
      <div style="display:flex;gap:4px;"><span class="btn" style="flex:1;">ภาพ+เสียง <span class="mono" style="font-size:10px;color:#7f847a;">③</span></span><span class="btn" style="flex:1;">+ ซับ <span class="mono" style="font-size:10px;color:#7f847a;">④</span></span><span class="btn on" style="flex:1;">+ ทุกชั้น <span class="mono" style="font-size:10px;">⑤</span></span></div>
      <div style="display:flex;align-items:center;gap:8px;"><span class="well mono" style="flex:1;padding:5px 8px;font-size:11px;">~/Movies/vcut/IMG_1234/</span><span style="display:flex;align-items:center;gap:6px;font-size:11px;"><span class="led on"></span>FINDER</span></div>
      <div class="cta"><span class="led" style="background:#1c1e1b;box-shadow:none;"></span>ส่งออก B + C · 119 MB · ~1:30</div>
      <span class="mono kv" style="font-size:10px;text-align:center;">B REBUILD ⑤ (sticker) · C READY · + edl.json · fx.json</span>
    </div>
  </div>"""

# ───────────────────────── ③ ลิ้นชัก แก้ ▸ สติกเกอร์
def tile(img, name, sel=False):
    return f'<div class="well{" sel" if sel else ""}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 6px 4px;"><img src="{img}" style="width:44px;height:44px;object-fit:contain;"><span class="kv" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">{name}</span></div>'

def pos(x, y, sel=False):
    return f'<div class="well{" sel" if sel else ""}" style="height:30px;display:flex;align-items:center;justify-content:center;"><svg width="18" height="26" viewBox="0 0 18 26" fill="none"><rect x="1" y="1" width="16" height="24" rx="1" stroke="#3a3d38"/><rect x="{x}" y="{y}" width="6" height="6" fill="{"#ffb020" if sel else "#7f847a"}"/></svg></div>'

def lay(name, note, on=False):
    return f'<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;{"background:#161815;border-radius:4px;box-shadow:inset 0 0 0 1px #ffb020;" if on else ""}"><span class="led{" on" if on else ""}"></span><span style="flex:1;font-size:12px;">{name}</span><span class="kv" style="font-size:10.5px;">{note}</span></div>'

CQ3STK = topbar(3, left_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;">B · EDIT STICKER · MOD 3</span>', right_extra='<span class="btn on">↻ ทำขั้น ⑤ ใหม่ · ~45 s</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:270px 1fr 380px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px 12px;overflow:hidden;">
      <div style="display:flex;flex-direction:column;gap:2px;"><div class="h"><span class="seg7" style="font-size:18px;">B</span><span class="t" style="font-size:14px;">ย่อ 45 วิ ตามกฎ</span></div><span class="mono kv" style="font-size:10.5px;">44.2 s · 6 SHOTS</span></div>
      <span class="tag">LAYERS · กดเพื่อแก้</span>
      <div style="display:flex;flex-direction:column;gap:2px;">
        {lay("ข้อความ","HOOK · การ์ดปิด")}{lay("เพลง · 2 แทร็ก","อัปบีต · SFX 0")}{lay("สติกเกอร์ / ภาพซ้อน","<span style='color:#ffb020;'>1 · ใหม่</span>",on=True)}{lay("ซับจากบทพูด","12 · <span style='color:#ffb020;'>2 ไม่มั่นใจ</span>")}{lay("โทนสี / ซูม / ความเร็ว","punch · zoom 3")}{lay("แผนที่เส้นทาง","ปิด · 0 หมุด")}
      </div>
      <div style="height:1px;background:#0f100e;"></div>
      <span class="tag">AI ASSIST</span>
      <span class="btn" style="justify-content:space-between;">วางสติกเกอร์ให้ 3–5 จุด <span class="mono kv" style="font-size:10px;">~1m</span></span>
      <span class="btn" style="justify-content:space-between;">วาง SFX ตรงรอยตัด <span class="mono kv" style="font-size:10px;">~1m</span></span>
      <span class="kv" style="font-size:10.5px;line-height:15px;">AI เสนอเป็นรายการ กดรับทีละข้อเหมือนหน้า 03</span>
      <div style="flex:1;"></div>
      <div class="well" style="padding:8px 10px;display:flex;flex-direction:column;gap:4px;">
        <div class="stat"><span>⑤ FX REBUILD</span><span>~45 s</span></div>
        <div class="stat"><span>③ RENDER</span><span style="color:#ffb020;">CACHE</span></div>
      </div>
      <span class="btn">◀ กลับ 03 · เลือกแบบ</span>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;min-height:0;position:relative;">{preview(560, overlay_sel=True)}
        <span class="well mono" style="position:absolute;left:14px;top:14px;padding:3px 8px;font-size:10px;color:#ffb020;">STICKER · DRAG TO MOVE · 0.0–44.2 s · x .80 y .13 w .20</span></div>
      {TRANSPORT}
      <div style="padding:4px 14px 12px 14px;">{lanes(sel_sticker=True)}</div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden;">
      <div class="h"><span class="tag">SEC 05b · STICKER / OVERLAY</span><span class="t" style="font-size:15px;">สติกเกอร์ / ภาพซ้อน</span></div>
      <div style="display:flex;gap:4px;"><span class="btn on" style="flex:1;">คลัง 200</span><span class="btn" style="flex:1;">อัปโหลดของฉัน</span><span class="btn" style="flex:1;">มาสคอต</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;"><span class="btn sm on">ป้าย / แบดจ์</span><span class="btn sm">บับเบิล</span><span class="btn sm">ลูกศร</span><span class="btn sm">กรอบ</span><span class="btn sm">รีแอ็กชัน</span><span class="btn sm">อารมณ์</span><span class="btn sm">โซเชียล</span><span class="btn sm">เดินทาง</span><span class="btn sm">ตัวเลข</span><span class="btn sm">+3</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">
        {tile("st-4k.png","4K",True)}{tile("st-banner.png","แบนเนอร์")}{tile("st-bell.png","กระดิ่ง")}{tile("st-balloon.png","ลูกโป่ง")}{tile("st-bub-best.png","BEST")}{tile("st-arrow-curve.png","ลูกศรโค้ง")}{tile("st-boot.png","รองเท้าบูต")}{tile("st-backpack.png","เป้")}
      </div>
      <span class="kv" style="font-size:10.5px;">ทุกแบบมี "ท่า" มาให้ — แบดจ์เกาะมุมขวาบน · แถบนอนล่างซ้าย</span>
      <span class="tag">POSITION</span>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;">{pos(3,3)}{pos(9,3,True)}{pos(6,10)}{pos(3,17)}{pos(9,17)}</div>
      <span class="tag">SHOW AT</span>
      <div style="display:flex;gap:4px;"><span class="btn sm on" style="flex:1;">ทั้งเรื่อง</span><span class="btn sm" style="flex:1;">ช็อตแรก</span><span class="btn sm" style="flex:1;">ช็อตสุดท้าย</span><span class="btn sm" style="flex:1;">ช็อตที่ดูอยู่</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center;"><span class="knob"></span><span class="tag">WIDTH 20%</span></div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center;"><span class="knob r90"></span><span class="tag">OPACITY 100</span></div>
        <div class="fld"><label>ANIM</label><div class="well">slide ▾</div></div>
      </div>
      <div class="well" style="padding:8px 10px;display:flex;flex-direction:column;gap:3px;border:1px dashed #3a3d38;"><span style="font-size:11.5px;">⬆ อัปโหลดของตัวเอง</span><span class="kv" style="font-size:10px;line-height:14px;">PNG · WEBP · JPG · MOV ProRes 4444 ≤ 40 MB — .webm อัลฟาใช้ไม่ได้ · เข้า .vcut/assets</span></div>
    </div>
  </div>"""

# ───────────────────────── โหมดเต็ม
def shot(kind, name, w, img=None, sel=False):
    bg = "#3f4a2e" if kind == "TALK" else "#2f3a4a"
    return f'<div class="well{" sel" if sel else ""}" style="width:{w}px;height:56px;display:flex;flex-direction:column;justify-content:space-between;padding:4px 6px;box-sizing:border-box;background:{bg};flex-shrink:0;"><span class="strip"><span style="color:{"#ffb020" if sel else "#d9dbd2"};">{kind}</span></span><span class="mono" style="font-size:10px;color:#d9dbd2;">{name}</span></div>'

def tlane(label, blocks, h=20):
    return f'<div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;height:{h}px;"><span style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">{label}</span></span><div style="position:relative;height:12px;background:#111311;border-radius:2px;">{blocks}</div></div>'

def bk(l, w, cls="a"):
    return f'<span class="blk {cls}" style="left:{l}%;width:{w}%;"></span>'

RULER = "".join(f'<span style="position:absolute;left:{i*10}%;top:0;height:6px;width:1px;background:#3a3d38;"></span><span class="mono" style="position:absolute;left:{i*10}%;top:7px;font-size:9px;color:#7f847a;">{i*5:02d}s</span>' for i in range(10))

CFULL = topbar(3, left_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">VAR <span style="color:#ffb020;">B</span> · EDL 6 · FX 7</span><span class="btn sm">↶</span><span class="btn sm">↷</span><span class="btn sm">SAVE EDL</span><span class="btn sm">SAVE FX</span>', right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">JOB <span style="color:#ffb020;">IDLE</span></span><span class="btn on">EXPORT ▾ <span class="mono" style="font-size:10px;">③ ④ ⑤</span></span>', full=True) + """
  <div style="flex:1;display:grid;grid-template-columns:1fr 400px;grid-template-rows:1fr 250px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0;position:relative;">
        <div style="position:relative;height:100%;aspect-ratio:9/16;border-radius:4px;overflow:hidden;background:#000;box-shadow:0 0 0 1px #0f100e;">
          <img src="f57.jpg" style="width:100%;height:100%;object-fit:cover;display:block;">
          <div style="position:absolute;inset:5%;border:1px dashed rgba(255,176,32,.35);"></div>
          <div style="position:absolute;left:0;right:0;top:14%;display:flex;flex-direction:column;align-items:center;gap:3px;"><span style="font-size:22px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #000,-2px -2px 0 #000;">น้ำตกที่ไกล</span><span style="font-size:22px;font-weight:600;color:#E0102A;text-shadow:2px 2px 0 #000,-2px -2px 0 #000;">บันไดที่ต้องเจอ</span></div>
          <div style="position:absolute;left:70%;top:6.5%;width:20%;aspect-ratio:1/1;"><img src="st-4k.png" style="width:100%;height:100%;object-fit:contain;display:block;"></div>
          <div style="position:absolute;left:12px;right:12px;bottom:14%;text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #000,-2px -2px 0 #000;">น้ำตกที่ไกลยังไม่ไกลเท่า</div>
        </div>
        <span class="well mono" style="position:absolute;left:14px;top:14px;padding:3px 8px;font-size:10px;color:#7f847a;">SAFE 90% · SHOT 2/6 · TALK</span>
      </div>
      """ + TRANSPORT.replace('<div style="flex:1;"></div>', '<div style="flex:1;"></div><span class="tag">SPEED</span><span class="knob sm"></span><span class="tag">ZOOM</span><span class="knob sm r45"></span>') + """
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:12px 14px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:3px;">
        <span class="btn sm">คลิป</span><span class="btn sm">ข้อความ</span><span class="btn sm on">เพลง</span><span class="btn sm">สติกเกอร์</span><span class="btn sm">บทพูด</span><span class="btn sm">AI</span><span class="btn sm">ไปป์ไลน์</span><span class="btn sm">ตั้งค่า</span>
      </div>
      <div class="h"><span class="tag">TAB · MUSIC</span><span class="t" style="font-size:14px;">เพลง · 2 แทร็ก</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10px;">53 LOOPS · SFX 6 CAT</span></div>
      <div class="well" style="padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">TR 1 · BGM</span><span style="font-size:12px;">98 BPM</span></div>
          <div style="display:flex;gap:14px;justify-content:space-around;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob rm60"></span><span class="tag">GAIN −18</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob r45"></span><span class="tag">DUCK 6</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob"></span><span class="tag">FADE 1.0</span></div>
          </div>
          <div style="display:flex;gap:4px;"><span class="btn sm on">LOOP</span><span class="btn sm">BEAT LOCK</span><span class="btn sm">yt-dlp ▸</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;"><span class="led dim"></span><span class="tag">TR 2 · SFX</span><span style="font-size:12px;">AI · 2 จุด</span></div>
          <div style="display:flex;gap:14px;justify-content:space-around;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob"></span><span class="tag">GAIN −6</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob r90"></span><span class="tag">SNAP CUT</span></div>
          </div>
          <div style="display:flex;gap:4px;"><span class="btn sm">whoosh</span><span class="btn sm">pop</span><span class="btn sm">ding</span><span class="btn sm">+3</span></div>
        </div>
      </div>
      <div style="display:flex;gap:4px;"><span class="btn sm on">สนุก/มีพลัง</span><span class="btn sm">ชิล</span><span class="btn sm">ดราม่า</span><span class="btn sm">โลไฟ</span><span class="btn sm">ซินธ์</span><span class="btn sm">+6</span></div>
      <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;overflow:hidden;">
        """ + "".join(f'<div style="display:grid;grid-template-columns:8px 1fr auto auto;gap:10px;align-items:center;padding:6px 10px;{"" if i==0 else "border-top:1px solid #0f100e;"}"><span class="led{" on" if i==1 else ""}"></span><span style="font-size:12px;">{n}</span><span class="mono kv" style="font-size:10px;">{b} BPM · {d}</span><span class="btn sm">▶</span></div>' for i,(n,b,d) in enumerate([("Uplift Drive","98","0:32"),("มีพลัง · Neon Run","98","0:30"),("Big Step","110","0:28"),("Sunrise Pop","104","0:31"),("Bounce Kit","96","0:30")])) + """
      </div>
      <div class="well" style="padding:8px 12px;display:flex;align-items:center;gap:12px;"><span class="tag">MASTER</span><span class="meter" style="flex:1;">""" + "".join('<i class="l"></i>' for _ in range(12)) + '<i class="h"></i>' + "".join('<i></i>' for _ in range(7)) + """</span><span class="seg7" style="font-size:13px;">−14.0</span></div>
    </div>
    <div class="panel" style="grid-column:1 / span 2;display:flex;flex-direction:column;gap:6px;padding:10px 14px;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:12px;"><span class="tag">TIMELINE · B</span><span class="mono kv" style="font-size:10.5px;">6 SHOTS · 0:44 · TRASH 2</span><div style="flex:1;"></div><span class="btn sm">ถังทิ้ง 2</span><span class="btn sm">ลำดับ ◀ ▶</span><span class="btn sm">ตัดตรงนี้</span><span class="tag">ZOOM</span><span class="knob sm r45"></span></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;height:18px;"><span></span><div style="position:relative;height:18px;">""" + RULER + """</div></div>
      """ + tlane("TEXT ⑤", bk(0,6)+bk(91,9)) + tlane("STICKER", bk(0,100)) + tlane("SHAPE", bk(20,8)) + tlane("CAPTION", bk(0,41,"")+bk(42,29,"")+bk(72,28,""), 16) + """
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;"><span style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">SHOTS</span></span><div style="display:flex;gap:3px;position:relative;">
        """ + shot("TALK","0:00–0:08 · 7.9s",160) + shot("BROLL","f14 · 2.1s",56) + shot("TALK","0:12–0:23 · 10.6s",200,sel=True) + shot("BROLL","f57 · 2.0s",52) + shot("TALK","0:31–0:48 · 17.5s",300) + shot("BROLL","f88 · 4.1s",80) + """
        <span style="position:absolute;left:3.4%;top:-118px;width:2px;height:190px;background:#ffb020;box-shadow:0 0 6px #ffb020;"></span></div></div>
      """ + tlane("SPEECH", "".join(bk(l,w,"") for l,w in [(0,17),(22,24),(52,39)]), 16) + tlane("MUSIC TR1 · TR2", bk(0,100)+bk(25,2,"on")+bk(58,2,"on")) + """
    </div>
  </div>"""

PAGES = {"CQ1": CQ1, "CQ2": CQ2, "CQ2Adv": CQ2ADV, "CQ2Run": CQ2RUN, "CQ3": CQ3, "CQ3Stk": CQ3STK}
exec(open("gen_cflow_more.py", encoding="utf-8").read())
for k, v in PAGES.items():
    open(f"{k}.dc.html", "w", encoding="utf-8").write(page(v))
print("ok", list(PAGES))
