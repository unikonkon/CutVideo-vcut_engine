# สร้างทิศทางสไตล์ 10 แบบจากแม่แบบเดียว — เนื้อหาเท่ากัน ต่างเฉพาะโทเคน + CSS บุคลิก
import json

DIRS = [
 dict(id="D1", name="กระดาษเปล่า", group="มินิมอล", fonts="Anuphan:wght@400;500;600;700",
      body='"Anuphan"', disp='"Anuphan"', mono='ui-monospace, Menlo',
      bg="#fafaf7", panel="#fafaf7", line="#e4e2dc", text="#1a1a1a", muted="#7a786f", accent="#0f766e", on_accent="#ffffff",
      radius="4px", base="13px",
      extra=".card{border:0;background:#f1f0eb}.card.on{background:#e6f3f1;box-shadow:inset 0 0 0 1.5px #0f766e}.seg{border:1px solid #d9d7cf}.seg .on{background:#1a1a1a;color:#fafaf7}.cta{background:#1a1a1a;color:#fafaf7}",
      note="มินิมอลสว่าง — ขาวออกครีม · ไม่มีเส้นขอบ ใช้พื้นอ่อนแยกส่วน · แอกเซนต์เขียวเข้มจุดเดียว · Anuphan\nรู้สึก: Notion/Linear แบบสว่าง สะอาด · แลก: สว่างในห้องมืด · ต้องมีธีมมืดคู่"),
 dict(id="D2", name="หมึกกับควัน", group="มินิมอล", fonts="Anuphan:wght@400;500;600;700",
      body='"Anuphan"', disp='"Anuphan"', mono='ui-monospace, Menlo',
      bg="#0b0b0b", panel="#0b0b0b", line="#262626", text="#f2f2f2", muted="#8a8a8a", accent="#f2f2f2", on_accent="#0b0b0b",
      radius="0px", base="13px",
      extra=".card{border:0;background:#161616}.card.on{box-shadow:inset 0 0 0 1.5px #f2f2f2}.seg{border:1px solid #333}.seg .on{background:#f2f2f2;color:#0b0b0b}.cta{background:#f2f2f2;color:#0b0b0b}.sw{background:#f2f2f2}.big{font-size:52px}",
      note="โมโนโครมมืด — ดำสนิท · ไม่มีสีแอกเซนต์เลย สีเดียวที่มีคือวิดีโอ · เลือก = ขาว · ตัวเลขใหญ่มาก · Anuphan\nรู้สึก: นิ่ง หรู แบบแอปกล้อง · แลก: บอกสถานะด้วยสีไม่ได้ ต้องใช้รูปทรง/ตำแหน่ง"),
 dict(id="D3", name="ครีมอุ่น", group="สบายตา", fonts="Sarabun:wght@400;500;600;700",
      body='"Sarabun"', disp='"Sarabun"', mono='ui-monospace, Menlo',
      bg="#f6efe4", panel="#fbf6ee", line="#e6dccb", text="#3b2f24", muted="#8c7b6a", accent="#c2410c", on_accent="#fff7ef",
      radius="10px", base="13.5px",
      extra=".card{border:0;background:#fbf6ee;box-shadow:0 1px 0 #e6dccb}.card.on{box-shadow:inset 0 0 0 2px #c2410c}.seg{border:1px solid #d9cdb9;border-radius:10px}.seg .on{background:#3b2f24;color:#f6efe4}.cta{background:#c2410c;color:#fff7ef;border-radius:10px}.right{background:#efe6d8}",
      note="สบายตาสว่าง — ครีม/น้ำตาล คอนทราสต์ต่ำลงนิด · แอกเซนต์ดินเผา · มุม 10px แบบนุ่ม · Sarabun\nรู้สึก: อบอุ่น อ่านนาน ๆ ไม่ล้า เหมาะมือใหม่ · แลก: ดูเป็น 'เครื่องมือตัดต่อ' น้อยลง"),
 dict(id="D4", name="กลางคืนสงบ", group="สบายตา", fonts="Sarabun:wght@400;500;600",
      body='"Sarabun"', disp='"Sarabun"', mono='ui-monospace, Menlo',
      bg="#1b2028", panel="#222833", line="#2e3542", text="#d7dde5", muted="#7f8a99", accent="#67c3d1", on_accent="#0f1419",
      radius="6px", base="13.5px",
      extra=".card{border:1px solid #2e3542;background:#222833}.card.on{border-color:#67c3d1;box-shadow:0 0 0 1px #67c3d1}.seg{border:1px solid #2e3542;border-radius:6px}.seg .on{background:#67c3d1;color:#0f1419}.cta{background:#67c3d1;color:#0f1419;border-radius:6px}.right{background:#161a21}",
      note="สบายตามืด — เทาอมน้ำเงินไม่ดำสนิท · ตัวหนังสือไม่ขาวจ้า · แอกเซนต์ฟ้าอ่อนซีด · Sarabun\nรู้สึก: Obsidian/Notion dark ใช้ยาว ๆ กลางคืน · แลก: ต้องระวังไม่ให้กลับไปคล้าย 'AI dark' — ห้ามเพิ่มสีที่สอง"),
 dict(id="D5", name="TikTok-native", group="เหมาะตัดต่อ", fonts="Prompt:wght@400;500;600;700",
      body='"Prompt"', disp='"Prompt"', mono='ui-monospace, Menlo',
      bg="#000000", panel="#121212", line="#262626", text="#ffffff", muted="#8a8a8a", accent="#FE2C55", on_accent="#ffffff",
      radius="8px", base="13px",
      extra=".card{border:0;background:#121212;border-radius:8px}.card.on{box-shadow:inset 0 0 0 2px #25F4EE}.seg{background:#121212;border:0;border-radius:8px}.seg .on{background:#ffffff;color:#000}.cta{background:#FE2C55;color:#fff;border-radius:8px}.sw{background:#25F4EE}.lbl{color:#25F4EE}",
      note="เหมาะตัดต่อ — ดำสนิทแบบแอป TikTok/CapCut · คู่สีของแพลตฟอร์ม ฟ้า #25F4EE (เลือก/สถานะ) + ชมพูแดง #FE2C55 (ปุ่มหลักตัวเดียว) · Prompt หนา\nรู้สึก: คนทำ TikTok คุ้นทันที · แลก: สองสีต้องคุมเข้ม ไม่งั้นกลับเป็นสายรุ้ง"),
 dict(id="D6", name="ตัวใหญ่อ่านชัด", group="อ่านง่าย", fonts="Sarabun:wght@400;600;700",
      body='"Sarabun"', disp='"Sarabun"', mono='ui-monospace, Menlo',
      bg="#111111", panel="#1a1a1a", line="#333333", text="#ffffff", muted="#b3b3b3", accent="#f5b301", on_accent="#111111",
      radius="6px", base="16px",
      extra="body{font-size:16px}.card{border:2px solid #333;background:#1a1a1a}.card.on{border-color:#f5b301}.seg span{padding:10px 18px;font-size:15px}.seg{border:2px solid #444;border-radius:6px}.seg .on{background:#f5b301;color:#111}.cta{background:#f5b301;color:#111;height:60px;font-size:18px;border-radius:6px}.row{padding:14px 0;font-size:16px}.kv{font-size:14px}.sw{width:16px;height:16px}.lbl{font-size:12px}",
      note="อ่านง่าย — ฐาน 16px (เดิม 12–13) · คอนทราสต์สูง ขาวบนดำ · แอกเซนต์เหลืองอำพันเห็นชัดทุกสายตา · ปุ่ม ≥ 44px · Sarabun\nรู้สึก: ใช้บนจอเล็ก/ไกล/ผู้ใหญ่ · แลก: ใส่ของได้น้อยลงต่อหน้า ต้องเลื่อน"),
 dict(id="D7", name="หนังสือพิมพ์", group="อ่านง่าย", fonts="Noto+Serif+Thai:wght@400;500;700",
      body='"Noto Serif Thai"', disp='"Noto Serif Thai"', mono='ui-monospace, Menlo',
      bg="#ffffff", panel="#ffffff", line="#111111", text="#111111", muted="#666666", accent="#111111", on_accent="#ffffff",
      radius="0px", base="14px",
      extra=".card{border:1px solid #111;background:#fff}.card.on{background:#111;color:#fff}.card.on .kv{color:#ccc}.card.on .kv b{color:#fff}.seg{border:1px solid #111}.seg .on{background:#111;color:#fff}.cta{background:#111;color:#fff}.row{border-top:1px dotted #111}.sw{background:#111;border-radius:999px}.big{font-family:'Noto Serif Thai';font-weight:700}",
      note="อ่านง่าย — ขาวล้วน · ตัวเซริฟไทยทั้งหน้า · เส้นประ/เส้นทึบดำ · ไม่มีสี · ตัวหนา = สำคัญ\nรู้สึก: หน้าหนังสือพิมพ์/นิตยสาร ต่างจากทุกเครื่องมือ · แลก: จอตัวอย่างวิดีโอจะดูโดดในหน้าขาว · ต้องมีธีมมืดคู่"),
 dict(id="D8", name="Blueprint", group="มินิมอล", fonts="Bai+Jamjuree:wght@400;500;600",
      body='"Bai Jamjuree"', disp='"Bai Jamjuree"', mono='"Bai Jamjuree"',
      bg="#10233a", panel="#10233a", line="#2a4a6b", text="#dbe7f3", muted="#7f9bb8", accent="#ffd166", on_accent="#10233a",
      radius="0px", base="13px",
      extra="body{background-image:linear-gradient(#183355 1px,transparent 1px),linear-gradient(90deg,#183355 1px,transparent 1px);background-size:40px 40px}.card{border:1px solid #2a4a6b;background:rgba(16,35,58,0.85)}.card.on{border-color:#ffd166;border-width:1.5px}.seg{border:1px solid #2a4a6b}.seg .on{background:#ffd166;color:#10233a}.cta{background:#ffd166;color:#10233a}.lbl{letter-spacing:.16em;text-transform:uppercase}",
      note="มินิมอลเส้น — น้ำเงินพิมพ์เขียว · ตารางเส้นบาง 40px ทั้งพื้น · กรอบเส้นเดียว ไม่มีพื้นทึบ · แอกเซนต์เหลืองอ่อน · Bai Jamjuree\nรู้สึก: แบบแปลน/แผนงาน มีระเบียบ · แลก: ตารางพื้นอาจรบกวนตอนดูจอตัวอย่าง (ปิดใต้จอได้)"),
 dict(id="D9", name="พาสเทลซอฟต์", group="สบายตา", fonts="Mitr:wght@400;500;600",
      body='"Mitr"', disp='"Mitr"', mono='ui-monospace, Menlo',
      bg="#f4f6fb", panel="#ffffff", line="#e3e7f0", text="#2b2d42", muted="#7c8399", accent="#ff8a5c", on_accent="#2b2d42",
      radius="14px", base="13.5px",
      extra=".card{border:0;background:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(43,45,66,0.06)}.card.on{box-shadow:0 0 0 2px #ff8a5c,0 6px 18px rgba(255,138,92,0.25)}.seg{border:0;background:#e9edf6;border-radius:12px}.seg .on{background:#fff;color:#2b2d42;box-shadow:0 1px 4px rgba(0,0,0,.12)}.cta{background:#ff8a5c;color:#2b2d42;border-radius:14px}.right{background:#eef1f8}.row{border-top:1px solid #e3e7f0}",
      note="สบายตา นุ่ม — ขาว/ฟ้าอ่อน · เงาฟุ้งเบา ๆ แทนเส้นขอบ · แอกเซนต์พีชสีเดียว · มุม 14px · Mitr กลม ๆ\nรู้สึก: เป็นมิตร มือใหม่ไม่กลัว · แลก: เสี่ยง 'น่ารักเกินเครื่องมือ' — เงาต้องเบา ห้ามไล่สี ห้ามม่วง"),
 dict(id="D10", name="เทอร์มินัล", group="เหมาะตัดต่อ", fonts="JetBrains+Mono:wght@400;500;700&family=Sarabun:wght@400;500;600",
      body='"Sarabun"', disp='"JetBrains Mono"', mono='"JetBrains Mono"',
      bg="#0c0c0c", panel="#0c0c0c", line="#2a2f2a", text="#c9d1c8", muted="#6f786e", accent="#9ae66e", on_accent="#0c0c0c",
      radius="0px", base="13px",
      extra=".card{border:1px dashed #2a2f2a;background:#0c0c0c}.card.on{border:1px solid #9ae66e}.seg{border:1px solid #2a2f2a}.seg .on{background:#9ae66e;color:#0c0c0c}.cta{background:#9ae66e;color:#0c0c0c}.row{border-top:1px dashed #2a2f2a}.lbl{color:#9ae66e}.lbl::before{content:'$ '}.big::before{content:'> ';color:#6f786e}",
      note="เหมาะตัดต่อ — ดำ · เขียวฟอสเฟอร์จุดเดียว · ป้าย/เลขเป็น JetBrains Mono มี '$' นำ · เส้นประแบบ CLI · Sarabun สำหรับไทย\nรู้สึก: ต่อกับรากของ vcut ที่เป็น CLI · คนเทคนิคชอบ · แลก: มือใหม่อาจรู้สึกว่า 'ยาก' ทั้งที่กดแค่ 3 ขั้น"),
]

TPL = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family={fonts}&display=swap">
  <style>
    body {{ margin: 0; background: {bg}; color: {text}; font-family: {body}, "Helvetica Neue", Arial, sans-serif; font-size: {base}; -webkit-font-smoothing: antialiased; }}
    a {{ color: {accent}; }} a:hover {{ opacity: .8; }}
    .mono {{ font-family: {mono}, monospace; font-variant-numeric: tabular-nums; }}
    .disp {{ font-family: {disp}, sans-serif; }}
    .lbl {{ font-size: 10.5px; letter-spacing: .08em; color: {muted}; }}
    .seg {{ display: flex; overflow: hidden; border-radius: {radius}; }}
    .seg span {{ padding: 6px 12px; font-size: 12.5px; color: {muted}; }}
    .seg .on {{ font-weight: 600; }}
    .row {{ display: grid; grid-template-columns: 22px 160px 1fr auto; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid {line}; }}
    .sw {{ width: 12px; height: 12px; border-radius: 2px; background: {accent}; }}
    .sw-off {{ background: transparent !important; box-shadow: inset 0 0 0 1.5px {muted}; }}
    .kv {{ font-size: 12px; color: {muted}; }} .kv b {{ color: {text}; font-weight: 600; }}
    .card {{ display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: {radius}; }}
    .pv {{ height: 92px; border-radius: calc({radius} - 2px); background: #101010; display: flex; align-items: center; justify-content: center; overflow: hidden; }}
    .cta {{ display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 18px; font-size: 14.5px; font-weight: 600; border-radius: {radius}; }}
    .big {{ font-size: 46px; font-weight: 600; line-height: 1; letter-spacing: -.02em; }}
    .right {{ background: {panel}; }}
    .edit {{ font-size: 12px; color: {accent}; }}
    {extra}
  </style>
</helmet>
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; overflow: hidden;">
  <div style="height: 48px; display: flex; align-items: center; gap: 18px; padding: 0 22px; border-bottom: 1px solid {line}; flex-shrink: 0;">
    <span class="disp" style="font-size: 15px; font-weight: 700;">vcut</span>
    <span class="mono" style="font-size: 11.5px; color: {muted};">IMG_1234.MOV · 02:14 · แนวตั้ง</span>
    <div style="flex: 1;"></div>
    <div style="display: flex; gap: 22px; font-size: 12.5px;">
      <span style="color: {muted};">01 ใส่วิดีโอ</span>
      <span style="font-weight: 600; border-bottom: 2px solid {accent}; padding-bottom: 2px;">02 เลือกสไตล์ · ตัด</span>
      <span style="color: {muted}; opacity: .6;">03 เลือกแบบ · ส่งออก</span>
    </div>
    <div style="flex: 1;"></div>
    <span class="mono" style="font-size: 11px; color: {accent};">● ถอดเสียง 18/26</span>
    <span style="font-size: 12.5px; color: {muted}; text-decoration: underline; text-underline-offset: 3px;">โหมดเต็ม</span>
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: 1fr 380px; min-height: 0;">
    <div style="display: flex; flex-direction: column; gap: 16px; padding: 22px 28px; border-right: 1px solid {line}; overflow: hidden;">
      <div style="display: flex; align-items: baseline; gap: 12px;"><span class="disp" style="font-size: 22px; font-weight: 700;">สไตล์</span><span class="lbl">จากคลิปอ้างอิง 7 ตัว · วัดจากไฟล์จริง</span></div>
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
        <div class="card on"><div class="pv" style="background: #7a1020;"><span style="font-size: 15px; font-weight: 700; color: #fff;">คลิป VDO ของคุณ</span></div><span style="font-size: 13.5px; font-weight: 600;">A · ปิดการขาย</span><span class="kv">ช็อต <b>1.7–2.0 วิ</b> · ช้า → รัว → ช้า</span></div>
        <div class="card"><div class="pv"><span class="mono" style="font-size: 26px; font-weight: 700; color: #fff;">255.9K</span></div><span style="font-size: 13.5px; font-weight: 600;">B · โชว์หลักฐาน</span><span class="kv">ช็อต <b>2.4 วิ</b> · เลขนับขึ้น</span></div>
        <div class="card"><div class="pv"><svg width="120" height="30" viewBox="0 0 120 30" fill="none"><path d="M6 6 C 40 6 40 24 74 24 L 114 24" stroke="#fff" stroke-width="2"/></svg></div><span style="font-size: 13.5px; font-weight: 600;">C · สอนกรอบวิธีคิด</span><span class="kv">ช็อต <b>5.0 วิ</b> · ผังนีออน</span></div>
        <div class="card" style="opacity: .45;"><div class="pv" style="background: transparent; border: 1px dashed {line};"></div><span style="font-size: 13.5px; font-weight: 600;">D · Before | After</span><span class="kv">ต้องมี compare</span></div>
      </div>
      <div style="display: flex; gap: 36px; align-items: flex-end;">
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="lbl">ความยาว</span><div class="seg"><span>30</span><span class="on">45 วิ</span><span>60</span><span>ทั้งคลิป</span></div></div>
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="lbl">จำนวนแบบ</span><div class="seg"><span>2</span><span>3</span><span class="on">4</span><span>5</span></div></div>
        <div style="display: flex; flex-direction: column; gap: 8px;"><span class="lbl">AI</span><div style="display: flex; gap: 18px;"><span style="display: flex; align-items: center; gap: 8px;"><span class="sw sw-off"></span>ไฮไลต์ให้ 1 แบบ <span class="kv">3 นาที · $0.5</span></span><span style="display: flex; align-items: center; gap: 8px;"><span class="sw"></span>ดูหนังแล้วเสนอแก้</span></div></div>
      </div>
      <div style="display: flex; align-items: baseline; gap: 12px; margin-top: 4px;"><span class="disp" style="font-size: 17px; font-weight: 700;">ชั้นแต่งหนัง</span><span class="lbl">ค่าตั้งต้นของทุกแบบ · แก้รายแบบตอนส่งออก</span></div>
      <div style="display: flex; flex-direction: column;">
        <div class="row"><span class="sw"></span><span>ซับจากบทพูด</span><span class="kv">หนา ขาวขอบดำ · กลางล่าง · <b>54</b></span><span class="edit">แก้ →</span></div>
        <div class="row"><span class="sw"></span><span>HOOK + การ์ดปิด</span><span class="kv">จากประโยคแรก · ทีละคำ · เน้นแดง · การ์ด <b>4 วิ</b></span><span class="edit">แก้ →</span></div>
        <div class="row"><span class="sw"></span><span>เพลง · 2 แทร็ก</span><span class="kv">สนุก/มีพลัง <b>−18 dB</b> · หลบ 6 · SFX ให้ AI วาง</span><span class="edit">แก้ →</span></div>
        <div class="row"><span class="sw sw-off"></span><span style="color: {muted};">สติกเกอร์ / ภาพซ้อน</span><span class="kv">คลัง 200 · มาสคอตยังไม่มีไฟล์</span><span class="edit">แก้ →</span></div>
        <div class="row" style="border-bottom: 1px solid {line};"><span class="sw"></span><span>เอฟเฟกต์รายช็อต</span><span class="kv">ยิงรัว zoom <b>1.05→1.22</b> · punch · glitch ท้าย</span><span class="edit">แก้ →</span></div>
      </div>
      <div style="flex: 1;"></div>
      <div style="display: flex; align-items: center; gap: 16px;"><span style="font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px;">ขั้นสูง</span><span class="lbl">ตั้งค่า 135 · เลือกชิ้น 7 · ลำดับ 6 · AI 4 · รีเซ็ต · cache · เพิ่มเติม</span></div>
    </div>
    <div class="right" style="display: flex; flex-direction: column; padding: 22px 24px; gap: 12px;">
      <span class="lbl">จะได้ 4 แบบ</span>
      <div style="display: flex; flex-direction: column;">
        <div style="display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; padding: 10px 0; border-top: 1px solid {line}; align-items: baseline;"><span class="mono" style="font-size: 12px; color: {accent}; font-weight: 700;">A</span><span>ตัดชิดทั้งคลิป<br><span class="kv">ลบเงียบ 7 ช่วง</span></span><span class="mono" style="font-size: 14px;">1:43</span></div>
        <div style="display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; padding: 10px 0; border-top: 1px solid {line}; align-items: baseline;"><span class="mono" style="font-size: 12px; color: {accent}; font-weight: 700;">B</span><span>ย่อ 45 วิ ตามกฎ<br><span class="kv">ประโยคคะแนนสูงก่อน</span></span><span class="mono" style="font-size: 14px;">0:45</span></div>
        <div style="display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; padding: 10px 0; border-top: 1px solid {line}; align-items: baseline;"><span class="mono" style="font-size: 12px; color: {accent}; font-weight: 700;">C</span><span>ยิงรัว + ซูมไล่<br><span class="kv">ช็อต 0.8 วิ</span></span><span class="mono" style="font-size: 14px;">0:45</span></div>
        <div style="display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; padding: 10px 0; border-top: 1px solid {line}; border-bottom: 1px solid {line}; align-items: baseline;"><span class="mono" style="font-size: 12px; color: {accent}; font-weight: 700;">D</span><span>ช้า มีซับ<br><span class="kv">ช็อต 2.0 วิ</span></span><span class="mono" style="font-size: 14px;">0:58</span></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: {muted};">
        <div style="display: flex; justify-content: space-between;"><span>ถอดเสียง</span><span style="color: {text};">ทำอยู่แล้ว</span></div>
        <div style="display: flex; justify-content: space-between;"><span>ตัด 4 แบบ</span><span class="mono" style="color: {text};">1:10</span></div>
        <div style="display: flex; justify-content: space-between;"><span>ซับ · ข้อความ · เพลง</span><span class="mono" style="color: {text};">3:00</span></div>
        <div style="display: flex; justify-content: space-between;"><span>AI ดูหนัง</span><span class="mono" style="color: {text};">1:00 · $0.16</span></div>
      </div>
      <div style="flex: 1;"></div>
      <div style="display: flex; flex-direction: column; gap: 2px;"><span class="lbl">รวมประมาณ</span><span class="mono big">05:00</span></div>
      <div class="cta">ตัดให้เลย<span class="mono" style="font-size: 12.5px; font-weight: 500;">4 แบบ →</span></div>
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
"""

for d in DIRS:
    html = TPL.format(**d)
    open(f"{d['id']}.dc.html", "w", encoding="utf-8").write(html)
json.dump([{k: d[k] for k in ("id", "name", "group", "note")} for d in DIRS],
          open("dirs.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", len(DIRS))
