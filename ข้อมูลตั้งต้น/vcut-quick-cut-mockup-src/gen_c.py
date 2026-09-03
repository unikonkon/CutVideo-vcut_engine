# 5 แบบย่อยจากทิศทาง C (แผงควบคุม / instrument) — เนื้อหาเดียวกับ DirC ต่างที่วัสดุ/ชิ้นส่วน
import json

BASE_CSS = """
body{margin:0;background:@@bg@@;color:@@text@@;font-family:@@body@@,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:@@mono@@,monospace;font-variant-numeric:tabular-nums}
.tag{font-family:@@mono@@,monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:@@muted@@}
.kv{font-size:12px;color:@@muted@@}.kv b{color:@@text@@;font-weight:500}
.row{display:grid;grid-template-columns:34px 160px 1fr auto;align-items:center;gap:14px;padding:9px 12px}
.row+.row{border-top:1px solid @@line@@}
.led{width:8px;height:8px;border-radius:999px;background:@@ledoff@@;flex-shrink:0;box-shadow:inset 0 1px 1px rgba(0,0,0,.4)}
.led.on{background:@@accent@@;box-shadow:0 0 6px @@accent@@}
.btn{display:flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:4px;font-size:12px;white-space:nowrap}
.knob{width:34px;height:34px;border-radius:999px;position:relative;flex-shrink:0}
.knob::after{content:"";position:absolute;left:50%;top:4px;width:2px;height:10px;margin-left:-1px;border-radius:1px;background:@@accent@@}
.seg7{font-family:@@mono@@,monospace;font-weight:700;color:@@accent@@;letter-spacing:.06em}
.card{padding:8px;display:flex;flex-direction:column;gap:6px}
.pv{height:88px;border-radius:3px;background:#0d0e0c;display:flex;align-items:center;justify-content:center}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;height:54px;border-radius:6px;font-size:15px;font-weight:600}
.orow{display:grid;grid-template-columns:24px 1fr auto;gap:10px;padding:8px 12px;align-items:center}
.orow+.orow{border-top:1px solid @@line@@}
.stat{display:flex;justify-content:space-between}.stat span:last-child{color:@@text@@}
"""

TPL = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=@@fonts@@&display=swap">
  <style>@@css@@</style>
</helmet>
<div style="width: 1440px; height: 900px; background: @@bg@@; display: flex; flex-direction: column; overflow: hidden;">

  <div class="panel" style="height: 52px; margin: 10px 10px 0 10px; display: flex; align-items: center; gap: 16px; padding: 0 16px; flex-shrink: 0;">
    @@brand@@
    <span class="@@lcd@@ mono" style="padding: 4px 10px; font-size: 11px;">IMG_1234.MOV  02:14  1126×1788</span>
    <div style="flex: 1;"></div>
    <div style="display: flex; gap: 6px;">
      <span class="btn"><span class="led on" style="margin-right: 8px;"></span>01 ใส่วิดีโอ</span>
      <span class="btn on"><span class="led on" style="margin-right: 8px;"></span>02 เลือกสไตล์ · ตัด</span>
      <span class="btn" style="opacity: .55;"><span class="led" style="margin-right: 8px;"></span>03 เลือกแบบ · ส่งออก</span>
    </div>
    <div style="flex: 1;"></div>
    @@topright@@
    <span class="btn">โหมดเต็ม</span>
  </div>

  <div style="flex: 1; display: grid; grid-template-columns: 1fr 380px; gap: 10px; padding: 10px; min-height: 0;">
    <div class="panel" style="display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 12px;"><span class="tag">SEC 01 · STYLE</span><span style="font-size: 16px; font-weight: 500;">สไตล์</span><span class="kv">คลิปอ้างอิง 7 ตัว</span></div>
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
        <div class="well card on">
          <div class="pv" style="background: #5a0c18;"><span style="font-size: 14px; font-weight: 600; color: #fff;">คลิป VDO ของคุณ</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span class="led on"></span><span style="font-size: 13px; font-weight: 500;">A · ปิดการขาย</span></div>
          <span class="kv">ช็อต <b>1.7–2.0 s</b></span>
        </div>
        <div class="well card">
          <div class="pv"><span class="seg7" style="font-size: 26px;">255.9K</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span class="led"></span><span style="font-size: 13px; font-weight: 500;">B · โชว์หลักฐาน</span></div>
          <span class="kv">ช็อต <b>2.4 s</b></span>
        </div>
        <div class="well card">
          <div class="pv"><svg width="110" height="28" viewBox="0 0 120 30" fill="none"><path d="M6 6 C 40 6 40 24 74 24 L 114 24" stroke="@@accent@@" stroke-width="2"/></svg></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span class="led"></span><span style="font-size: 13px; font-weight: 500;">C · สอนกรอบวิธีคิด</span></div>
          <span class="kv">ช็อต <b>5.0 s</b></span>
        </div>
        <div class="well card" style="opacity: 0.45;">
          <div class="pv"></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span class="led"></span><span style="font-size: 13px; font-weight: 500;">D · Before | After</span></div>
          <span class="kv">NO COMPARE</span>
        </div>
      </div>

      <div style="display: flex; gap: 28px; align-items: flex-end;">
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="tag">Length</span>@@length@@</div>
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="tag">Variants</span><div style="display: flex; gap: 4px;"><span class="btn">2</span><span class="btn">3</span><span class="btn on">4</span><span class="btn">5</span></div></div>
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="tag">AI</span><div style="display: flex; gap: 14px; align-items: center; font-size: 12.5px; height: 30px;"><span style="display: flex; align-items: center; gap: 8px;"><span class="led"></span>ไฮไลต์ 1 แบบ <span class="mono kv">3m $0.5</span></span><span style="display: flex; align-items: center; gap: 8px;"><span class="led on"></span>ดูหนังแล้วเสนอแก้</span></div></div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px; margin-top: 2px;"><span class="tag">SEC 02 · LAYERS</span><span style="font-size: 16px; font-weight: 500;">ชั้นแต่งหนัง</span><span class="kv">ค่าตั้งต้นทุกแบบ</span></div>
      @@layers@@
      <div style="flex: 1;"></div>
      <div style="display: flex; align-items: center; gap: 10px;"><span class="btn">ขั้นสูง ▸</span><span class="mono kv" style="font-size: 10.5px;">CFG 135 · PICK 7 · ORDER 6 · AI 4 · RESET · CACHE · MORE</span></div>
    </div>

    <div class="panel" style="display: flex; flex-direction: column; gap: 12px; padding: 16px 18px;">
      <span class="tag">OUTPUT · 4 VARIANTS</span>
      <div class="well" style="display: flex; flex-direction: column; padding: 4px 0;">
        <div class="orow"><span class="seg7" style="font-size: 12px;">A</span><span style="font-size: 13px;">ตัดชิดทั้งคลิป<br><span class="kv">ลบเงียบ 7 ช่วง</span></span><span class="seg7" style="font-size: 14px;">01:43</span></div>
        <div class="orow"><span class="seg7" style="font-size: 12px;">B</span><span style="font-size: 13px;">ย่อ 45 วิ ตามกฎ<br><span class="kv">ประโยคคะแนนสูงก่อน</span></span><span class="seg7" style="font-size: 14px;">00:45</span></div>
        <div class="orow"><span class="seg7" style="font-size: 12px;">C</span><span style="font-size: 13px;">ยิงรัว + ซูมไล่<br><span class="kv">ช็อต 0.8 s</span></span><span class="seg7" style="font-size: 14px;">00:45</span></div>
        <div class="orow"><span class="seg7" style="font-size: 12px;">D</span><span style="font-size: 13px;">ช้า มีซับ<br><span class="kv">ช็อต 2.0 s</span></span><span class="seg7" style="font-size: 14px;">00:58</span></div>
      </div>
      @@meter@@
      <div class="mono" style="display: flex; flex-direction: column; gap: 5px; font-size: 10.5px; color: @@muted@@; letter-spacing: 0.04em;">
        <div class="stat"><span>STT</span><span>RUNNING</span></div>
        <div class="stat"><span>CUT ×4</span><span>01:10</span></div>
        <div class="stat"><span>SUB · TEXT · MUSIC</span><span>03:00</span></div>
        <div class="stat"><span>AI REVIEW</span><span>01:00 · $0.16</span></div>
      </div>
      <div style="flex: 1;"></div>
      <div class="@@lcd@@" style="padding: 10px 14px; display: flex; align-items: baseline; justify-content: space-between;"><span class="tag">ETA</span><span class="seg7" style="font-size: 40px;">05:00</span></div>
      <div class="cta"><span class="led" style="background: currentColor; box-shadow: none; opacity: .7;"></span>ตัดให้เลย · 4 แบบ</div>
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
"""

LENGTH_BTN = '<div style="display: flex; gap: 4px;"><span class="btn">30</span><span class="btn on">45 s</span><span class="btn">60</span><span class="btn">ALL</span></div>'

LAYERS_KNOB = """<div class="well" style="display: flex; flex-direction: column; padding: 4px 0;">
        <div class="row"><span class="knob"></span><span>ซับจากบทพูด</span><span class="kv">หนา ขาวขอบดำ · กลางล่าง · <b>54</b></span><span class="led on"></span></div>
        <div class="row"><span class="knob"></span><span>HOOK + การ์ดปิด</span><span class="kv">ทีละคำ · เน้นแดง · การ์ด <b>4 s</b></span><span class="led on"></span></div>
        <div class="row"><span class="knob"></span><span>เพลง · 2 แทร็ก</span><span class="kv"><b>−18 dB</b> · DUCK 6 · SFX AI</span><span class="led on"></span></div>
        <div class="row" style="opacity: 0.6;"><span class="knob" style="filter: grayscale(1);"></span><span>สติกเกอร์ / ภาพซ้อน</span><span class="kv">คลัง 200 · NO MASCOT</span><span class="led"></span></div>
        <div class="row"><span class="knob"></span><span>เอฟเฟกต์รายช็อต</span><span class="kv">ZOOM <b>1.05→1.22</b> · PUNCH · GLITCH</span><span class="led on"></span></div>
      </div>"""

def strip(ch, name, kv, pos, on=True):
    return f"""<div class="strip" style="{'' if on else 'opacity:.55;'}">
          <span class="tag">CH {ch}</span><span class="knob"></span>
          <div class="fader"><i style="top: {pos}%;"></i></div>
          <span style="font-size: 12.5px; font-weight: 500; text-align: center;">{name}</span><span class="kv" style="font-size: 10.5px; text-align: center;">{kv}</span>
          <span class="led{' on' if on else ''}"></span></div>"""

LAYERS_STRIPS = '<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">' + "".join([
    strip(1, "ซับจากบทพูด", "ขาวขอบดำ · <b>54</b>", 22),
    strip(2, "HOOK + การ์ดปิด", "ทีละคำ · <b>4 s</b>", 30),
    strip(3, "เพลง · 2 แทร็ก", "<b>−18 dB</b> · DUCK 6", 48),
    strip(4, "สติกเกอร์ / ภาพซ้อน", "NO MASCOT", 86, on=False),
    strip(5, "เอฟเฟกต์รายช็อต", "ZOOM <b>1.05→1.22</b>", 36),
]) + "</div>"

VU = """<div class="well" style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center;"><span class="tag">TALK</span><div class="vu">""" + "".join('<i class="l"></i>' for _ in range(13)) + '<i class="p"></i>' + "".join('<i></i>' for _ in range(6)) + """</div></div>
        <div style="display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center;"><span class="tag">BGM</span><div class="vu">""" + "".join('<i class="l"></i>' for _ in range(7)) + "".join('<i></i>' for _ in range(13)) + """</div></div>
      </div>"""

DIAL = """<div class="dial"><b style="left: 14px;">30</b><b style="left: 96px;">45</b><b style="left: 180px;">60</b><b style="left: 258px;">ALL</b><i style="left: 100px;"></i></div>"""

DIRS = [
 dict(id="C1", name="อะลูมิเนียม", sub="OP-1 · เครื่องสีอ่อน", fonts="Mitr:wght@400;500;600&family=Space+Mono:wght@400;700",
      body='"Mitr"', mono='"Space Mono"', bg="#c9c9c4", text="#1e1e1c", muted="#6b6b66", line="#d6d6d0", accent="#ff4f00", ledoff="#b3b3ad", lcd="well",
      brand='<span class="mono" style="font-size: 13px; font-weight: 700; letter-spacing: .1em;">VCUT</span>',
      topright='<span class="well mono" style="padding: 4px 10px; font-size: 11px; color: #6b6b66;"><span style="color: #ff4f00;">●</span> STT 18/26</span>',
      length=LENGTH_BTN, layers=LAYERS_KNOB, meter="",
      css=""".panel{background:#e9e9e4;border-radius:8px;box-shadow:inset 0 1px 0 #fff,0 1px 0 #8f8f89,0 3px 6px rgba(0,0,0,.18)}
.well{background:#f7f7f3;border-radius:5px;box-shadow:inset 0 1px 3px rgba(0,0,0,.16),inset 0 0 0 1px #cfcfc8}
.btn{background:#fbfbf8;color:#1e1e1c;box-shadow:0 2px 0 #a3a39d,inset 0 1px 0 #fff}
.btn.on{background:#1e1e1c;color:#ff4f00;box-shadow:0 1px 0 #000}
.knob{background:radial-gradient(circle at 40% 35%,#3c3c3a,#151514 70%);box-shadow:0 2px 0 #8f8f89,inset 0 1px 0 rgba(255,255,255,.2)}
.seg7{text-shadow:none}.led.on{box-shadow:none}
.card.on{box-shadow:inset 0 1px 3px rgba(0,0,0,.16),inset 0 0 0 2px #ff4f00}
.cta{background:#ff4f00;color:#fff;box-shadow:0 3px 0 #a33200,inset 0 1px 0 rgba(255,255,255,.35)}
.pv{background:#1e1e1c}""",
      note="C1 · อะลูมิเนียม — แผงควบคุมแบบสว่าง (OP-1 / Teenage Engineering)\nตัวเครื่องอะลูมิเนียม #c9c9c4 · แผงขาวนวล · ร่องขาว · ปุ่มกดสีขาวมีเงาใต้ · ลูกบิดดำ · แอกเซนต์เดียว = ส้ม #ff4f00 · Mitr + Space Mono\nรู้สึก: ของเล่นดีไซน์ดี สนุกแต่สะอาด ใช้กลางวันได้ · แลก: ธีมสว่าง — โหมดเต็ม (ไทม์ไลน์) ต้องมีคู่มืด"),
 dict(id="C2", name="ห้องส่ง ON AIR", sub="broadcast / tally", fonts="Bai+Jamjuree:wght@400;500;600&family=JetBrains+Mono:wght@400;700",
      body='"Bai Jamjuree"', mono='"JetBrains Mono"', bg="#0e1114", text="#e2e6ea", muted="#6c7681", line="#06080a", accent="#ff2f2f", ledoff="#2a3038", lcd="well",
      brand='<span class="mono" style="font-size: 13px; font-weight: 700; letter-spacing: .1em;">VCUT</span>',
      topright='<span class="btn on mono" style="font-size: 11px; letter-spacing: .1em;">● ON AIR · STT 18/26</span>',
      length=LENGTH_BTN, layers=LAYERS_KNOB, meter=VU,
      css=""".panel{background:#171b20;border-radius:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px #06080a}
.well{background:#0a0c0f;border-radius:3px;box-shadow:inset 0 2px 5px rgba(0,0,0,.8),inset 0 0 0 1px #06080a}
.btn{background:#22272e;color:#e2e6ea;border-radius:3px;min-height:30px;box-sizing:border-box;box-shadow:0 2px 0 #06080a,inset 0 1px 0 rgba(255,255,255,.06)}
.btn.on{background:#b31212;color:#fff;box-shadow:0 0 14px rgba(255,47,47,.55),inset 0 1px 0 rgba(255,255,255,.25)}
.knob{background:radial-gradient(circle at 40% 35%,#3a414a,#171b20 70%);box-shadow:0 2px 0 #06080a,inset 0 1px 0 rgba(255,255,255,.1)}
.seg7{text-shadow:0 0 8px rgba(255,47,47,.6)}
.card.on{box-shadow:inset 0 2px 5px rgba(0,0,0,.8),inset 0 0 0 1.5px #ff2f2f}
.cta{background:#e01c1c;color:#fff;box-shadow:0 0 18px rgba(255,47,47,.5),0 3px 0 #5c0a0a}
.vu{display:flex;gap:2px}.vu i{flex:1;height:10px;background:#1f252c;border-radius:1px}.vu i.l{background:#c8ced4}.vu i.p{background:#ff2f2f;box-shadow:0 0 4px #ff2f2f}""",
      note="C2 · ห้องส่ง ON AIR — แผงสวิตช์ห้องส่ง / tally\nน้ำเงินดำ #0e1114 · ปุ่มสี่เหลี่ยมมีไฟ (เลือก = แดงเรืองแสงแบบ tally) · มิเตอร์ VU ของ TALK/BGM ใต้รายการแบบ · แอกเซนต์เดียว = แดง #ff2f2f · Bai Jamjuree + JetBrains Mono\nรู้สึก: กำลังออกอากาศ กดแล้วมีผลทันที · แลก: แดงมากไปจะเหนื่อยตา — จำกัดให้เฉพาะ 'สิ่งที่กำลังทำงาน'"),
 dict(id="C3", name="โต๊ะมิกซ์", sub="mixing console / fader", fonts="Kanit:wght@400;500&family=IBM+Plex+Mono:wght@400;700",
      body='"Kanit"', mono='"IBM Plex Mono"', bg="#212224", text="#e6e4de", muted="#85847e", line="#141416", accent="#3fd6c0", ledoff="#3a3b3e", lcd="well",
      brand='<span class="mono" style="font-size: 13px; font-weight: 700; letter-spacing: .1em;">VCUT</span>',
      topright='<span class="well mono" style="padding: 4px 10px; font-size: 11px; color: #85847e;"><span style="color: #3fd6c0;">●</span> STT 18/26</span>',
      length=LENGTH_BTN, layers=LAYERS_STRIPS, meter="",
      css=""".panel{background:#2a2b2e;border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 0 #0d0d0e}
.well{background:#1a1b1d;border-radius:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,.7)}
.btn{background:#38393d;color:#e6e4de;border-radius:2px;box-shadow:0 2px 0 #0d0d0e,inset 0 1px 0 rgba(255,255,255,.06)}
.btn.on{background:#3fd6c0;color:#0d0d0e;box-shadow:0 1px 0 #0d0d0e}
.knob{width:28px;height:28px;background:radial-gradient(circle at 40% 35%,#55565a,#2a2b2e 70%);box-shadow:0 2px 0 #0d0d0e}
.knob::after{height:8px;top:3px}
.seg7{text-shadow:0 0 6px rgba(63,214,192,.5)}
.card.on{box-shadow:inset 0 2px 4px rgba(0,0,0,.7),inset 0 0 0 1.5px #3fd6c0}
.cta{background:#3fd6c0;color:#0d0d0e;box-shadow:0 3px 0 #1b7a6d}
.strip{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 6px;background:#1a1b1d;border-radius:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,.7)}
.fader{width:6px;height:90px;background:#0d0d0e;border-radius:3px;position:relative;background-image:repeating-linear-gradient(#2f3033 0 1px,transparent 1px 9px);background-position:0 4px}
.fader i{position:absolute;left:-9px;width:24px;height:12px;margin-top:-6px;background:linear-gradient(#f4f2ec,#c9c6bd);border-radius:2px;box-shadow:0 2px 0 #0d0d0e}
.fader i::after{content:"";position:absolute;left:0;right:0;top:5px;height:1px;background:#3fd6c0}""",
      note="C3 · โต๊ะมิกซ์ — mixing console\nชั้นแต่งหนัง 5 ชั้น = 5 แชนแนลสตริป มีเฟดเดอร์ (ระดับ = ความแรง/ระดับเสียง) หัวเฟดเดอร์ขาว · ปุ่มสี่เหลี่ยมมุมเหลี่ยม · แอกเซนต์เดียว = เขียวมิ้นต์ #3fd6c0 · Kanit + IBM Plex Mono\nรู้สึก: คุมทุกชั้นได้ด้วยมือ เห็นระดับทันที · แลก: เฟดเดอร์สื่อ 'ระดับ' ได้ดี แต่ชั้นที่เป็น เปิด/ปิด ล้วน ๆ จะดูแปลก"),
 dict(id="C4", name="Braun ปี 60", sub="vintage hi-fi / Dieter Rams", fonts="Anuphan:wght@400;500;600&family=Courier+Prime:wght@400;700",
      body='"Anuphan"', mono='"Courier Prime"', bg="#c8c1b1", text="#2b2723", muted="#7b7264", line="#d9d1c0", accent="#1f8f4e", ledoff="#b8b0a0", lcd="well",
      brand='<span class="mono" style="font-size: 13px; font-weight: 700; letter-spacing: .1em;">vcut</span>',
      topright='<span class="well mono" style="padding: 4px 10px; font-size: 11px; color: #7b7264;"><span style="color: #1f8f4e;">●</span> STT 18/26</span>',
      length=DIAL, layers=LAYERS_KNOB, meter="",
      css=""".panel{background:#e8e3d7;border-radius:6px;border:1px solid #b3aa98;box-shadow:inset 0 1px 0 #fff}
.well{background:#f4f0e7;border-radius:3px;box-shadow:inset 0 1px 2px rgba(0,0,0,.15),inset 0 0 0 1px #cfc6b3}
.btn{background:#f4f0e7;color:#2b2723;border:1px solid #b3aa98;border-radius:3px;box-shadow:inset 0 1px 0 #fff}
.btn.on{background:#2b2723;color:#f4f0e7;border-color:#2b2723}
.knob{width:38px;height:38px;background:radial-gradient(circle at 45% 40%,#fbf8f1,#d9d2c3 75%);box-shadow:inset 0 1px 0 #fff,0 2px 3px rgba(0,0,0,.25)}
.knob::after{background:#2b2723}
.seg7{color:#2b2723;letter-spacing:.02em;text-shadow:none}.pv .seg7{color:#f4f0e7}
.led.on{box-shadow:none}
.card.on{box-shadow:inset 0 1px 2px rgba(0,0,0,.15),inset 0 0 0 2px #1f8f4e}
.cta{background:#1f8f4e;color:#f4f0e7;border-radius:3px;box-shadow:0 2px 0 #12613a}
.pv{background:#2b2723}
.dial{position:relative;height:30px;width:300px;background:#f4f0e7;border-radius:3px;box-shadow:inset 0 1px 2px rgba(0,0,0,.15),inset 0 0 0 1px #cfc6b3;background-image:repeating-linear-gradient(90deg,#9a9182 0 1px,transparent 1px 14px);background-size:100% 7px;background-repeat:no-repeat;background-position:8px 4px}
.dial b{position:absolute;top:13px;font-family:"Courier Prime",monospace;font-size:11px;font-weight:700;color:#7b7264}
.dial i{position:absolute;top:0;height:13px;width:3px;background:#1f8f4e;border-radius:0 0 2px 2px}""",
      note="C4 · Braun ปี 60 — เครื่องเสียงวินเทจ / Dieter Rams\nตัวเครื่องเบจอุ่น #c8c1b1 · แผงครีม เส้นขอบบางสีน้ำตาล · ลูกบิดครีมใหญ่ 38px ขีดดำ · ความยาว = สเกลหน้าปัดวิทยุมีเข็ม · ไม่มีไฟเรืองแสง · แอกเซนต์เดียว = เขียว Braun #1f8f4e · Anuphan + Courier Prime\nรู้สึก: ของจริง ทนทาน ไม่รีบ นิ่งกว่าทุกแบบ · แลก: ธีมสว่างและ 'เรียบ' — ความสนุกน้อยกว่า C ต้นฉบับ"),
 dict(id="C5", name="ตัวกล้อง", sub="camera body / LCD top-plate", fonts="Chakra+Petch:wght@400;500;600&family=JetBrains+Mono:wght@400;700",
      body='"Chakra Petch"', mono='"JetBrains Mono"', bg="#0a0a0a", text="#d9d9d3", muted="#767670", line="#000000", accent="#ff2020", ledoff="#2a2a2a", lcd="lcd",
      brand='<span style="display:flex;align-items:center;gap:8px;"><span class="rec"></span><span class="mono" style="font-size: 13px; font-weight: 700; letter-spacing: .1em;">VCUT</span></span>',
      topright='<span class="lcd mono" style="padding: 4px 10px; font-size: 11px;">STT 18/26 ▮▮▮▮▮▮▮▯▯▯</span>',
      length=LENGTH_BTN, layers=LAYERS_KNOB, meter="",
      css=""".panel{background:#191919;border-radius:10px;background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:3px 3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 0 0 1px #000,0 4px 10px rgba(0,0,0,.6)}
.well{background:#0d0d0d;border-radius:4px;box-shadow:inset 0 2px 4px rgba(0,0,0,.9),inset 0 0 0 1px #000}
.lcd{background:#aab88e;color:#1c2413;border-radius:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,.35),inset 0 0 0 1px #6f7d59}
.lcd .seg7,.lcd .tag{color:#1c2413;text-shadow:none}
.btn{background:#111;color:#d9d9d3;border-radius:999px;padding:6px 14px;box-shadow:0 0 0 1px #000,inset 0 1px 0 rgba(255,255,255,.08),0 2px 0 #000}
.btn.on{background:#d9d9d3;color:#0a0a0a}
.knob{width:36px;height:36px;background:repeating-conic-gradient(#333 0 6deg,#121212 6deg 12deg);box-shadow:0 0 0 1px #000,0 2px 0 #000}
.knob::before{content:"";position:absolute;inset:6px;border-radius:999px;background:radial-gradient(circle at 40% 35%,#333,#0f0f0f 70%)}
.knob::after{z-index:1;top:7px;height:8px}
.seg7{text-shadow:0 0 6px rgba(255,32,32,.45)}
.card.on{box-shadow:inset 0 2px 4px rgba(0,0,0,.9),inset 0 0 0 1.5px #ff2020}
.cta{background:#ff2020;color:#fff;border-radius:999px;box-shadow:0 3px 0 #7a0c0c}
.rec{width:12px;height:12px;border-radius:999px;background:#ff2020;box-shadow:0 0 8px #ff2020}""",
      note="C5 · ตัวกล้อง — camera body / จอ LCD บนตัวกล้อง\nแมกนีเซียมดำด้าน #191919 มีเกรน · แผงมุมมน 10px · ปุ่มยางกลม · ลูกบิดมีร่องหยัก (knurled) · ETA และชื่อไฟล์บน LCD เขียวเทาแบบกล้อง (ตัวเลขดำ) · แอกเซนต์เดียว = จุด REC แดง · Chakra Petch + JetBrains Mono\nรู้สึก: อุปกรณ์ถ่ายวิดีโอที่คนทำคลิปถืออยู่แล้ว · แลก: LCD เขียวเป็น 'สีที่สอง' โดยวัสดุ — ใช้ได้เฉพาะจอตัวเลข ห้ามลามไปที่อื่น"),
]

for d in DIRS:
    css = BASE_CSS + d["css"]
    html = TPL
    for k in ("fonts", "bg", "accent", "muted", "lcd", "brand", "topright", "length", "layers", "meter"):
        html = html.replace(f"@@{k}@@", d[k])
    for k in ("bg", "text", "muted", "line", "accent", "ledoff", "body", "mono"):
        css = css.replace(f"@@{k}@@", d[k])
    html = html.replace("@@css@@", css)
    assert "@@" not in html, d["id"]
    open(f"{d['id']}.dc.html", "w", encoding="utf-8").write(html)
json.dump([{k: d[k] for k in ("id", "name", "sub", "note")} for d in DIRS],
          open("dirs_c.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", len(DIRS))
