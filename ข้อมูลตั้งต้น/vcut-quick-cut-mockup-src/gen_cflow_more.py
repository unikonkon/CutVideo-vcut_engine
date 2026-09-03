# ── 14 หน้าเพิ่ม: ปิดช่องว่างฟังก์ชันของเอนจิน (exec จาก gen_cflow.py — ใช้ helper เดิมได้หมด)

def meter4(n):
    return '<span class="meter" style="width:34px;">' + "".join(f'<i class="{"l" if i < n else ""}"></i>' for i in range(4)) + '</span>'

def keys(items, on=None, sm=True):
    return '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + "".join(f'<span class="btn{" sm" if sm else ""}{" on" if k == on else ""}">{k}</span>' for k in items) + '</div>'

def knobf(label, rot="", sm=False):
    return f'<div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><span class="knob{" sm" if sm else ""} {rot}"></span><span class="tag">{label}</span></div>'

def sec(tag, title="", extra=""):
    t = f'<span class="t" style="font-size:14px;">{title}</span>' if title else ""
    return f'<div class="h"><span class="tag">{tag}</span>{t}<div style="flex:1;"></div>{extra}</div>'

# ── โครงลิ้นชักขั้น ② (ทับโต๊ะทำงานที่หรี่ไว้)
def drawer2(head_tag, title, sub, body, footer, tabs=None, badge="", width=780):
    return topbar(2, right_extra=STT_WELL) + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;opacity:.35;">
    {q2_left()}
    <div class="panel"></div>
  </div>
  <div style="position:absolute;inset:0;background:rgba(0,0,0,.45);"></div>
  <div class="panel" style="position:absolute;right:10px;top:72px;bottom:10px;width:{width}px;display:flex;flex-direction:column;overflow:hidden;box-shadow:-24px 0 60px rgba(0,0,0,.6),0 2px 0 #0f100e;">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #0f100e;">
      <span class="tag">{head_tag}</span><span style="font-size:16px;font-weight:500;white-space:nowrap;">{title}</span><span class="kv">{sub}</span>
      <div style="flex:1;"></div>{badge}<span class="btn sm">✕</span>
    </div>
    {f'<div style="display:flex;gap:4px;padding:10px 16px;border-bottom:1px solid #0f100e;">{adv_tabs(tabs)}</div>' if tabs else ''}
    <div style="flex:1;display:flex;flex-direction:column;gap:10px;padding:12px 16px;overflow:hidden;">
      {body}
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:10px 16px;border-top:1px solid #0f100e;">
      {footer}
    </div>
  </div>"""

# ── โครงหน้าแก้รายชั้นขั้น ③ (3 คอลัมน์ เหมือน แก้ ▸ สติกเกอร์)
LAYER_LIST = [("ข้อความ","HOOK · การ์ดปิด"),("เพลง · 2 แทร็ก","อัปบีต · SFX 2"),("สติกเกอร์ / ภาพซ้อน","1"),("ซับจากบทพูด","12 · <span style='color:#ffb020;'>2 ไม่มั่นใจ</span>"),("โทนสี / ซูม / ความเร็ว","punch · zoom 3"),("แผนที่เส้นทาง","4 หมุด")]

def edit3(active, head_tag, title, right, badge, left_note="", pv=None, lanes_html=None, cta='<span class="btn on">↻ ทำขั้น ⑤ ใหม่ · ~45 s</span>', topleft=""):
    lays = "".join(lay(n, m, on=(n == active)) for n, m in LAYER_LIST)
    return topbar(3, left_extra=f'<span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;">{badge}</span>', right_extra=cta) + f"""
  <div style="flex:1;display:grid;grid-template-columns:270px 1fr 400px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px 12px;overflow:hidden;">
      <div style="display:flex;flex-direction:column;gap:2px;"><div class="h"><span class="seg7" style="font-size:18px;">B</span><span class="t" style="font-size:14px;">ย่อ 45 วิ ตามกฎ</span></div><span class="mono kv" style="font-size:10.5px;">44.2 s · 6 SHOTS</span></div>
      <span class="tag">LAYERS · กดเพื่อสลับแผง</span>
      <div style="display:flex;flex-direction:column;gap:2px;">{lays}</div>
      <div style="height:1px;background:#0f100e;"></div>
      <span class="kv" style="font-size:10.5px;line-height:15px;">{left_note}</span>
      <div style="flex:1;"></div>
      <div class="well" style="padding:8px 10px;display:flex;flex-direction:column;gap:4px;">
        <div class="stat"><span>⑤ FX REBUILD</span><span>~45 s</span></div>
        <div class="stat"><span>③ RENDER</span><span style="color:#ffb020;">CACHE</span></div>
      </div>
      <span class="btn">◀ กลับ 03 · เลือกแบบ</span>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;min-height:0;position:relative;">{pv or preview(560)}
        {f'<span class="well mono" style="position:absolute;left:14px;top:14px;padding:3px 8px;font-size:10px;color:#ffb020;">{topleft}</span>' if topleft else ''}</div>
      {TRANSPORT}
      <div style="padding:4px 14px 12px 14px;">{lanes_html or lanes()}</div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden;">
      <div class="h"><span class="tag">{head_tag}</span><span class="t" style="font-size:15px;">{title}</span></div>
      {right}
    </div>
  </div>"""

# ═════════ ① คลังคลิป
def cliprow(name, img, meta, rot, vm, on=True, note=""):
    return f"""<div style="display:grid;grid-template-columns:14px 44px 1fr auto auto auto 8px;gap:12px;align-items:center;padding:8px 12px;border-top:1px solid #0f100e;{'' if on else 'opacity:.5;'}">
        <span class="mono" style="color:#7f847a;">⋮</span><div class="thumb" style="width:44px;height:78px;"><img src="{img}"></div>
        <div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:13px;font-weight:500;">{name} <span class="kv">{note}</span></span><span class="mono kv" style="font-size:10.5px;">{meta}</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;"><span class="tag">ROTATE</span>{keys(["ตามไฟล์","↻ 90","↺ 90","180"], rot)}</div>
        <div style="display:flex;flex-direction:column;gap:3px;"><span class="tag">9:16</span>{keys(["ขอบเบลอ","ขอบดำ","ครอป"], vm)}</div>
        <span class="tog{' on' if on else ''}"><i></i></span><span class="led{' on' if on else ''}"></span></div>"""

CLIB = topbar(1, right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">LIB <span style="color:#ffb020;">3</span> · TRASH 1</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 380px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;overflow:hidden;">
      <div class="h"><span class="tag">SEC 00b · LIBRARY</span><span class="t">คลังคลิป · 3</span><span class="kv">ลากเรียง = [scan] order · สวิตช์ = [scan] exclude · หมุน/9:16 รายคลิป ไม่ต้อง scan ใหม่</span></div>
      <div style="display:flex;gap:6px;align-items:center;"><span class="btn sm on">ทั้งหมด 3</span><span class="btn sm">มีคนพูด 2</span><span class="btn sm">วิว 1</span><span class="btn sm">แนวนอน 1</span><div style="flex:1;"></div><span class="tag">SORT</span>{keys(["ลำดับที่จัด","วันที่","ชื่อ","ยาว"], "ลำดับที่จัด")}</div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {cliprow("IMG_1234.MOV","f14.jpg","02:14 · 1126×1788 แนวตั้ง · HEVC 60 fps · SPEECH 77% · −6.8 LUFS · SCAN ✓ LISTEN 18/26","ตามไฟล์","ขอบเบลอ",note="· คลิปหลัก")}
        {cliprow("IMG_1240.MOV","f57.jpg","00:48 · 1920×1080 แนวนอน · H.264 30 fps · SPEECH 61% · −9.1 LUFS · SCAN ✓ LISTEN รอ","↻ 90","ขอบเบลอ",note="· แนวนอน → ต้องเลือก 9:16")}
        {cliprow("DJI_0007.MP4","f88.jpg","00:31 · 3840×2160 แนวนอน · 30 fps · NO SPEECH → BROLL · −18 LUFS · SCAN ✓","ตามไฟล์","ครอป",note="· วิวจากโดรน")}
      </div>
      <div class="well" style="padding:10px 12px;display:flex;align-items:center;gap:12px;border:1px dashed #3a3d38;"><span class="knob sm"></span><span style="font-size:12.5px;">วางไฟล์เพิ่มที่นี่</span><span class="mono kv" style="font-size:10.5px;">หรือ LINK โฟลเดอร์ฟุตเทจ ▸</span><span class="well mono" style="flex:1;padding:4px 8px;font-size:10.5px;color:#7f847a;">/Volumes/SD/DCIM/100MEDIA</span><span class="btn sm">ลิงก์</span></div>
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:8px;"><span class="btn on">บันทึกลำดับ · [scan] order</span><span class="btn">ทิ้งลำดับที่จัดไว้</span><span class="mono kv" style="font-size:10.5px;">MOD 2 · scan.order · scan.rotation_overrides</span><div style="flex:1;"></div><span class="btn on">ถัดไป · 02 เลือกสไตล์ ▸</span></div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;overflow:hidden;">
      {sec("TRASH · 1","ถังขยะ")}
      <div class="well" style="display:grid;grid-template-columns:34px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;"><div class="thumb" style="width:34px;height:60px;"><img src="f116.jpg"></div><span style="font-size:12px;">IMG_1199.MOV<br><span class="mono kv" style="font-size:10px;">01:02 · เอาออกเมื่อ 09:41</span></span><span class="btn sm">กู้</span><span class="btn sm">ล้าง</span></div>
      {sec("CONTACT SHEET · 5×5","ภาพตัวอย่าง")}
      <div class="well" style="padding:8px;display:grid;grid-template-columns:repeat(5,1fr);gap:3px;">{"".join(f'<div class="thumb" style="height:34px;"><img src="{i}"></div>' for i in ["f14.jpg","f57.jpg","f88.jpg","f116.jpg","f2.jpg"]*3)}</div>
      <div class="stat"><span>THUMBS</span><span>273 → 11 SHEETS</span></div>
      <div class="stat"><span>SCAN</span><span>3/3 · 9 s</span></div>
      <div class="stat"><span>LISTEN</span><span>18/26 · +1 QUEUED</span></div>
      <div style="flex:1;"></div>
      <span class="kv" style="font-size:11px;line-height:16px;">ทั้ง 4 อย่าง (เอาคลิปไหน · เรียงยังไง · หมุน · แนวตั้ง) เก็บใน toml ไม่ใช่ cache — ลบ .vcut/ แล้วรันใหม่ได้ผลเดิม</span>
      <div class="well" style="padding:10px 14px;display:flex;align-items:baseline;justify-content:space-between;"><span class="tag">NEXT</span><span class="seg7 off" style="font-size:32px;">02</span></div>
    </div>
  </div>"""

# ═════════ ② คลังชิ้น (pool)
def poolrow(keep, pid, kind, rng, dur, text, score, lufs):
    return f"""<div style="display:grid;grid-template-columns:30px 36px 52px 90px 44px 1fr 44px 56px;gap:10px;align-items:center;padding:7px 12px;border-top:1px solid #0f100e;{'' if keep else 'opacity:.45;'}">
        <span class="tog{' on' if keep else ''}"><i></i></span><span class="seg7" style="font-size:11px;">{pid}</span><span class="strip"><span style="color:{'#d9dbd2' if kind=='TALK' else '#7f847a'};">{kind}</span></span>
        <span class="mono" style="font-size:11px;">{rng}</span><span class="mono kv" style="font-size:11px;">{dur}</span><span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{text}</span>
        <span class="seg7" style="font-size:12px;text-align:right;">{score}</span><span class="mono kv" style="font-size:10.5px;">{lufs}</span></div>"""

CPOOL = drawer2("SEC 02b · POOL", "คลังชิ้น · 18", "prepare → pool.json · ชิ้นที่ compose จะหยิบ · สวิตช์ = เก็บ/ทิ้ง (keep)",
    f"""<div style="display:flex;align-items:center;gap:8px;"><span class="btn sm on">ทั้งหมด 18</span><span class="btn sm">TALK 11</span><span class="btn sm">BROLL 7</span><span class="btn sm">ทิ้งแล้ว 2</span><div style="flex:1;"></div><span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#7f847a;">NOISE −15 dB · MIN_SHOT 0.8 · GAP 0.35 · PRE/POST .12/.20</span></div>
      <div style="display:grid;grid-template-columns:30px 36px 52px 90px 44px 1fr 44px 56px;gap:10px;padding:0 12px;"><span class="tag">KEEP</span><span class="tag">ID</span><span class="tag">KIND</span><span class="tag">RANGE</span><span class="tag">DUR</span><span class="tag">TEXT / CLIP</span><span class="tag" style="text-align:right;">SCORE</span><span class="tag">LUFS</span></div>
      <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;overflow:hidden;">
        {poolrow(True,"T01","TALK","0:00–0:08","7.9","น้ำตกที่ไกล ยังไม่ไกลเท่าบันไดที่ต้องเจอ","0.91","−6.2")}
        {poolrow(True,"T02","TALK","0:08–0:11","3.1","วันนี้เราจะพาไป…","0.42","−7.0")}
        {poolrow(True,"T03","TALK","0:12–0:23","10.6","2.2 กิโล 17 คุ้ง ทางขึ้นชันตลอด","0.88","−6.5")}
        {poolrow(False,"T04","TALK","0:23–0:24","0.7","(สั้นกว่า min_shot)","0.10","−9.8")}
        {poolrow(True,"B01","BROLL","IMG_1240 0:04","2.1","สะพานไม้ · MOTION 0.6 · BRIGHT 0.7","0.63","—")}
        {poolrow(True,"T05","TALK","0:31–0:48","17.5","ถึงชั้นแรกแล้ว เสียงน้ำดังมาก","0.85","−6.9")}
        {poolrow(True,"B02","BROLL","DJI_0007 0:10","2.0","มุมสูง น้ำตก · MOTION 0.3","0.71","—")}
        {poolrow(True,"T06","TALK","0:50–1:02","12.0","ใครมาช่วงหน้าฝนต้องระวัง","0.66","−7.4")}
        {poolrow(False,"T07","TALK","1:02–1:03","0.9","(เงียบ − ลมหายใจ)","0.05","−21")}
        {poolrow(True,"B03","BROLL","DJI_0007 0:22","4.1","แพนตามลำธาร","0.58","—")}
        {poolrow(True,"T08","TALK","1:05–1:20","15.2","สรุปคือคุ้ม ถ้าไหวก็ไป","0.80","−6.6")}
        <div style="padding:6px 12px;border-top:1px solid #0f100e;" class="mono kv">… อีก 7 ชิ้น</div>
      </div>
      <div style="display:flex;gap:18px;"><div class="stat" style="flex:1;"><span>KEEP</span><span>16 / 18 · 1:38</span></div><div class="stat" style="flex:1;"><span>TARGET</span><span>0:45 · BUDGET</span></div><div class="stat" style="flex:1;"><span>SILENCE</span><span>7 RANGES CUT</span></div></div>""",
    '<span class="btn sm on">บันทึกคลัง · keep 16</span><span class="btn sm">จัดใหม่ · compose</span><span class="btn sm">เตรียมใหม่ (prepare · rank 1)</span><span class="btn sm ghost">ตั้งค่าเตรียมคลัง ▸ ขั้นสูง</span><div style="flex:1;"></div><span class="btn sm off">ทิ้ง</span>',
    badge='<span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">MOD 2 · UNSAVED</span>')

# ═════════ ② บทพูด
def trow(t, text, conf, pick=False, clip="1234", warn=False):
    return f"""<div style="display:grid;grid-template-columns:70px 1fr 40px 44px 30px;gap:10px;align-items:center;padding:7px 12px;border-top:1px solid #0f100e;">
        <span class="mono" style="font-size:11px;color:#ffb020;">{t}</span><span style="font-size:12.5px;{'color:#ffb020;' if warn else ''}">{text}</span><span class="mono kv" style="font-size:10px;">{clip}</span>{meter4(conf)}<span class="tog{' on' if pick else ''}"><i></i></span></div>"""

CTRANS = drawer2("SEC 02c · TRANSCRIPT", "บทพูด · 26 ท่อน", "listen → transcript.json · สวิตช์ = ใส่บรรทัดนี้ลงหนัง (captions) · แถบ = ความมั่นใจ",
    f"""<div style="display:flex;align-items:center;gap:8px;"><span class="well mono" style="flex:1;padding:6px 10px;font-size:11px;color:#7f847a;">SEARCH ▸ คำในบทพูด …</span><span class="btn sm on">ทั้งหมด 26</span><span class="btn sm">ไม่มั่นใจ 2</span><span class="btn sm">เลือกแล้ว 3</span><span class="btn sm">คลิป 1234 ▾</span></div>
      <div style="display:grid;grid-template-columns:70px 1fr 40px 44px 30px;gap:10px;padding:0 12px;"><span class="tag">TIME</span><span class="tag">TEXT</span><span class="tag">CLIP</span><span class="tag">CONF</span><span class="tag">USE</span></div>
      <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;overflow:hidden;">
        {trow("0:00.4","น้ำตกที่ไกล ยังไม่ไกลเท่าบันไดที่ต้องเจอ",4,True)}
        {trow("0:04.1","วันนี้เราจะพาไปน้ำตกที่ต้องเดินขึ้นบันไดพันกว่าขั้น",3)}
        {trow("0:08.7","ระยะทาง 2.2 กิโล 17 คุ้ง ทางขึ้นชันตลอด",4,True)}
        {trow("0:12.0","ก่อนไปเช็กสภาพเข่าตัวเองก่อนนะ",3)}
        {trow("0:16.5","(เสียงน้ำ) … ตรงนี้ลื่นมาก",1,warn=True)}
        {trow("0:23.4","ถึงชั้นแรกแล้ว เสียงน้ำดังมาก",4)}
        {trow("0:31.2","ชั้นสองต้องปีนหินอีกนิด",3)}
        {trow("0:38.9","ใครมาช่วงหน้าฝนต้องระวังทางลื่น",4,True)}
        {trow("0:44.0","ตรงนี้ถ่ายรูปสวยสุด",2,warn=True)}
        {trow("0:50.3","สรุปคือคุ้ม ถ้าไหวก็ไป",4)}
        <div style="padding:6px 12px;border-top:1px solid #0f100e;" class="mono kv">… อีก 8 ท่อน · ท่อน 19–26 ยังถอดอยู่ (LISTEN 18/26)</div>
      </div>
      <div style="display:flex;gap:18px;"><div class="stat" style="flex:1;"><span>MODEL</span><span>whisper large-v3-turbo · th</span></div><div class="stat" style="flex:1;"><span>SPEECH</span><span>1.7 / 2.2 min</span></div><div class="stat" style="flex:1;"><span>SELECTED → CAPTIONS</span><span>3 LINES</span></div></div>""",
    '<span class="btn sm on">ใส่ที่เลือกลงหนัง · 3</span><span class="btn sm">ใส่ทุกบรรทัดที่เห็น</span><span class="btn sm">ส่งออก .txt / .srt</span><span class="btn sm ghost">ถอดใหม่ · LISTEN rank 4</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10px;">→ captions.json (④)</span>')

# ═════════ ② ขั้นสูง · AI
def taskrow(on, name, desc, cost):
    return f'<div style="display:grid;grid-template-columns:30px 150px 1fr auto;gap:10px;align-items:center;padding:7px 12px;border-top:1px solid #0f100e;"><span class="tog{" on" if on else ""}"><i></i></span><span style="font-size:12.5px;">{name}</span><span class="kv">{desc}</span><span class="mono kv" style="font-size:10.5px;">{cost}</span></div>'

CAI = drawer2("SEC 03 · ADVANCED", "ขั้นสูง", "AI = ชั้นที่ปรึกษา เขียนได้แค่ .vcut/ai.json — เอนจินยังคาดเดาได้ 100%", 
    f"""<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">{sec("PROVIDER")}{keys(["claude -p","gemini"], "claude -p", sm=False)}<div class="stat"><span>claude CLI</span><span>OK · sonnet</span></div><div style="display:flex;gap:6px;align-items:center;"><span class="well mono" style="flex:1;padding:4px 8px;font-size:10.5px;color:#7f847a;">GEMINI KEY  AIza••••••••3f  SAVED</span><span class="btn sm">เปลี่ยน</span></div></div>
        <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">{sec("CONTEXT · CONTACT SHEET")}<div class="stat"><span>SHEETS</span><span>11 × 5×5 (273 THUMBS)</span></div><div class="stat"><span>SPEECH BLOCK</span><span>26 SEG · TIMED</span></div><div class="stat"><span>ai.json ที่มี</span><span>2026-09-02 09:12 · 4 TASKS</span></div><div style="display:flex;gap:4px;"><span class="btn sm on">ใช้ของเดิม (--ai)</span><span class="btn sm">ถามใหม่ (-f)</span></div></div>
      </div>
      {sec("GOAL · โจทย์ภาษาไทยที่จะบอก AI")}
      <div class="well" style="padding:10px 12px;font-size:13px;line-height:20px;min-height:52px;">ตัดเหลือ 45 วิ เล่าตามลำดับการเดินทาง เน้นตอนถึงน้ำตก ตัดช่วงเดินเงียบ ๆ ออก<span style="color:#ffb020;">▍</span></div>
      {sec("TASKS · vcut ai --task")}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {taskrow(True,"story_arc","แบ่งบทเล่าเรื่อง → chapters (ใช้กับ order = chapter)","~40 s")}
        {taskrow(True,"describe","อ่านความหมายรายคลิป → tags · ใช้เลือก BROLL","~60 s")}
        {taskrow(True,"shot_scoring","ให้คะแนนช็อต → ai_score (ใช้กับ mode ai / budget)","~50 s")}
        {taskrow(False,"trim_suggest","แนะนำช่วงที่ควรเก็บ → ไฮไลต์ 1 แบบ","~60 s · $0.5")}
      </div>
      {sec("APPLY · [ai.apply] กฎที่เอนจินใช้ความเห็น")}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
        <div class="fld"><label>ai.apply.score_weight</label><div class="well">0.6</div></div><div class="fld"><label>ai.apply.min_score · ทิ้งช็อตต่ำกว่า</label><div class="well">0.30</div></div><div class="fld"><label>ai.apply.use_trim</label><div class="well">OFF</div></div>
      </div>
      <div style="display:flex;gap:18px;"><div class="stat" style="flex:1;"><span>EST</span><span>3 TASKS · ~2.5 min · $0.34</span></div><div class="stat" style="flex:1;"><span>TIER</span><span>AI · rank 3 (เสียเงิน)</span></div></div>""",
    '<span class="btn sm on">ดึงความหมาย · prepare_all</span><span class="btn sm">ไม่ใช้ AI · prepare_free</span><span class="btn sm">ดูรายงาน ai.json</span><div style="flex:1;"></div><span class="btn sm off">ทิ้ง</span><span class="btn sm on">บันทึก · ai.*</span>',
    tabs="ai", badge='<span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">AI · 15 VALUES</span>')

# ═════════ ② ขั้นสูง · วิธีเลือกชิ้น + ลำดับ
def modecard(name, desc, body, on=False, dim=False):
    return f"""<div class="well{' sel' if on else ''}" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;{'opacity:.5;' if dim else ''}">
        <div style="display:flex;align-items:center;gap:8px;"><span class="led{' on' if on else ''}"></span><span class="mono" style="font-size:12px;font-weight:700;{'color:#ffb020;' if on else ''}">{name}</span></div><span class="kv" style="font-size:10.5px;line-height:14px;">{desc}</span>{body}</div>"""

CPICK = drawer2("SEC 03 · ADVANCED", "ขั้นสูง", "[compose] mode 7 แบบ · [order] mode 6 แบบ — บันทึกแล้วกด 'จัดใหม่' ต่อไฟล์ใหม่จาก cache",
    f"""{sec("COMPOSE MODE · จะเอาชิ้นไหน")}
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
        {modecard("all","ทุกชิ้นที่ keep","<span class='mono kv' style='font-size:10px;'>= แบบ A · 1:43</span>")}
        {modecard("budget","ให้ครบเป้าความยาว ชิ้นคะแนนสูงก่อน","<div class='fld'><label>target_minutes</label><div class='well'>0.75</div></div>", on=True)}
        {modecard("pattern","สลับตามแพตเทิร์น","<div class='fld'><label>pattern · run_max</label><div class='well'>TALK, BROLL · 7</div></div>")}
        {modecard("ai","ให้ AI เลือก (--ask + โจทย์)","<span class='mono kv' style='font-size:10px;'>ใช้ shot_scoring</span>")}
        {modecard("numbers","ระบุเลขคลิป/ชิ้น","<div class='fld'><label>numbers</label><div class='well'>3, 5-8, 12</div></div>")}
        {modecard("timerange","ช่วงเวลาของต้นฉบับ","<div class='fld'><label>from → to</label><div class='well'>0:00 → 1:10</div></div>")}
        {modecard("manual","รายการ id ตามลำดับ","<div class='fld'><label>manual</label><div class='well'>T01,T03,B01,T05</div></div>")}
        {modecard("—","","<span class='kv' style='font-size:10px;'>เลือกได้แบบเดียวต่อครั้ง · แบบ A–D ของตัดง่าย = all / budget / pattern / caption</span>", dim=True)}
      </div>
      {sec("ORDER MODE · เรียงยังไง")}
      <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;">
        {modecard("pick","ตามไทม์ไลน์ที่จัดไว้","", on=True)}{modecard("manual","ตามรายการ manual","")}{modecard("date","เวลาถ่าย (mtime)","")}{modecard("number","เลขไฟล์","")}{modecard("duration","สั้น → ยาว","")}{modecard("chapter","ตามบท (story_arc)","<span class='mono kv' style='font-size:10px;'>ต้องมี ai.json</span>")}
      </div>
      <div style="display:flex;gap:24px;align-items:center;"><span style="display:flex;align-items:center;gap:8px;"><span class="tog on"><i></i></span>keep_jump_together · ชิ้นที่ตัดชนจากคลิปเดียวกันอยู่ติดกัน</span><span style="display:flex;align-items:center;gap:8px;"><span class="tog"><i></i></span>select.prefer_bright · ชอบชิ้นสว่าง</span><div style="flex:1;"></div>{meter4(2)}<span class="tag">assemble · rank 1</span></div>""",
    '<span class="btn sm on">บันทึก · compose.* order.*</span><span class="btn sm">จัดใหม่ · compose → assemble</span><span class="btn sm">↶ ย้อน edl ก่อนหน้า</span><div style="flex:1;"></div><span class="btn sm off">ทิ้ง</span>',
    tabs="pick", badge='<span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">MODE budget · ORDER pick</span>')

# ═════════ ② ขั้นสูง · ไปป์ไลน์ · สถานะ
def steprow(led, ph, name, when, summ, stale=False, run="รัน"):
    return f'<div style="display:grid;grid-template-columns:8px 24px 170px 110px 1fr auto auto;gap:10px;align-items:center;padding:6px 12px;border-top:1px solid #0f100e;"><span class="led {led}"></span><span class="mono kv" style="font-size:10px;">{ph}</span><span style="font-size:12.5px;">{name}</span><span class="mono kv" style="font-size:10.5px;">{when}</span><span class="kv" style="font-size:11px;">{summ}</span><span class="mono" style="font-size:10px;color:{"#ffb020" if stale else "#3a3d38"};">{"STALE" if stale else "OK"}</span><span class="btn sm">{run}</span></div>'

CPIPE = drawer2("SEC 03 · ADVANCED", "ขั้นสูง", "/api/setup steps · ทำถึงไหน · ของเก่าหรือยัง (ค่าตั้งเปลี่ยนหลังทำ) · สั่งรายขั้น/ราย phase",
    f"""<div style="display:flex;gap:6px;align-items:center;"><span class="tag">RUN PHASE</span><span class="btn sm">① คลิป</span><span class="btn sm on">② เตรียม</span><span class="btn sm">③ รวม</span><span class="btn sm">④ ต่อไฟล์</span><span class="btn sm">⑤ แต่ง</span><div style="flex:1;"></div><span class="btn sm ghost">ทำทุกขั้น · run</span><span class="btn sm">■ หยุด</span></div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {steprow("on","①","scan · อ่านคลิป","09:40:12","3 คลิป · 3:33 · manifest.json")}
        {steprow("on","①","thumbs · ภาพตัวอย่าง","09:40:31","273 → 11 sheets")}
        {steprow("dim","②","listen · ดึงบทพูด","RUNNING","18/26 · large-v3-turbo")}
        {steprow("on","②","ai · ดึงความหมาย","09:12 (เมื่อวาน)","4 tasks · $0.41", stale=True)}
        {steprow("on","②","silence · หาช่วงเงียบ","09:41:02","7 ranges · −15 dB", stale=True)}
        {steprow("on","②","prepare · ตัดทีละคลิป","09:41:40","18 pcs · pool.json")}
        {steprow("on","③","compose · เรียงเป็นหนัง","09:42:01","budget 0.75 · 6 pcs · edl.json")}
        {steprow("on","④","render · ตัดเป็นชิ้น","09:43:50","14 pcs · cache 3 · 0.6 GB")}
        {steprow("on","④","assemble · ต่อเป็นไฟล์","09:44:02","B-45s.mp4 · 44.2 s · −14.0 LUFS")}
        {steprow("","④","caption · ใส่ข้อความ","—","12 lines · final-text.mp4")}
        {steprow("","⑤","finish · แต่งหนัง (vcut fx)","—","texts 2 · music 1 · overlay 1 · final-fx.mp4")}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0;">
        <div class="well mono" style="padding:8px 10px;font-size:10px;line-height:15px;color:#7f847a;white-space:pre-wrap;overflow:hidden;">[09:44:02] ASSEMBLE  6 pcs → B-45s.mp4  ok
[09:44:02]   verify: 6/6 keyframe-aligned
[09:44:05] LISTEN  IMG_1240.MOV  extract wav 16k
[09:44:09] whisper  seg 18/26  "ใครมาช่วงหน้าฝน…"
[09:44:11] thumbs  queued (after listen)</div>
        <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;"><div class="stat"><span>ENGINE</span><span>127.0.0.1:8765 · pid 41822</span></div><div class="stat"><span>ffmpeg</span><span>7.1 · videotoolbox</span></div><div class="stat"><span>whisper.cpp</span><span>large-v3-turbo · metal</span></div><div class="stat"><span>claude -p</span><span>OK</span></div><div class="stat"><span>WORK</span><span>.vcut/ 0.71 GB</span></div><div class="stat"><span>OUT</span><span>~/Movies/vcut/IMG_1234/</span></div><div class="stat"><span>PROJECT</span><span>projects/IMG_1234.toml · MOD 2</span></div></div>
      </div>""",
    '<span class="btn sm on">รันขั้นที่เก่า · ai + silence</span><span class="btn sm">สรุปสถานะ · vcut info</span><span class="btn sm">เปิดโฟลเดอร์ผลลัพธ์</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10px;">STALE = ค่าตั้งของขั้นนั้นเปลี่ยนหลังทำครั้งล่าสุด</span>',
    tabs="pipe", badge='<span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">9/11 DONE · 2 STALE</span>')

# ═════════ ② ขั้นสูง · รีเซ็ต · ประวัติ · cache
def artrow(on, name, size, tier, label):
    return f'<div style="display:grid;grid-template-columns:30px 1fr 70px 40px 120px;gap:10px;align-items:center;padding:6px 12px;border-top:1px solid #0f100e;"><span class="tog{" on" if on else ""}"><i></i></span><span style="font-size:12px;">{name}</span><span class="mono kv" style="font-size:10.5px;">{size}</span>{meter4(tier)}<span class="tag">{label}</span></div>'

def snaprow(sid, scope, label, when):
    return f'<div style="display:grid;grid-template-columns:130px 70px 1fr auto auto;gap:10px;align-items:center;padding:6px 12px;border-top:1px solid #0f100e;"><span class="mono" style="font-size:11px;color:#ffb020;">{sid}</span><span class="tag">{scope}</span><span style="font-size:12px;">{label}</span><span class="mono kv" style="font-size:10.5px;">{when}</span><span class="btn sm">กู้คืน</span></div>'

CRESET = drawer2("SEC 03 · ADVANCED", "ขั้นสูง", "ทุกครั้งที่ล้าง เอนจินถ่ายสำเนาทั้งไฟล์โปรเจกต์ไว้ก่อน — กู้คืนได้เป๊ะทุกตัวอักษร",
    f"""<div style="display:flex;gap:6px;align-items:center;"><span class="tag">SCOPE</span>{keys(["ทั้งหมด","① คลิป","② เตรียม","③ รวม","④ ต่อไฟล์","⑤ แต่ง"], "② เตรียม")}<div style="flex:1;"></div><span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#7f847a;">PREVIEW · จะรีเซ็ต <span style="color:#ffb020;">6</span> ค่า · ลบของ <span style="color:#ffb020;">3</span> ชิ้น</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="well" style="padding:8px 12px;display:flex;flex-direction:column;gap:4px;"><span class="tag">KEYS → DEFAULT</span><div class="stat"><span>jumpcut.noise_db</span><span>−15 → auto</span></div><div class="stat"><span>talk.min_shot</span><span>0.80 → 1.20</span></div><div class="stat"><span>compose.target_minutes</span><span>0.75 → 0</span></div><div class="stat"><span>ai.goal</span><span>"ตัดเหลือ…" → ""</span></div><div class="stat"><span>+2</span><span>…</span></div></div>
        <div class="well" style="padding:8px 12px;display:flex;flex-direction:column;gap:4px;"><span class="tag">GC · SEGMENTS ที่ EDL ไม่ใช้</span><div class="stat"><span>UNUSED</span><span>11 pcs · 0.42 GB</span></div><div class="stat"><span>IN USE</span><span>14 pcs · 0.18 GB</span></div><div style="display:flex;gap:4px;margin-top:4px;"><span class="btn sm">ล้าง 0.42 GB · vcut gc</span><span class="btn sm">ล้าง cache ทั้งหมด 0.6 GB</span></div></div>
      </div>
      {sec("ARTIFACTS · ของที่จะลบ (ติ๊กเอง)")}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {artrow(True,".vcut/transcript.json · listen","12 MB",4,"listen · rank 4")}
        {artrow(True,".vcut/silence.json","0.1 MB",3,"silence · rank 3")}
        {artrow(True,".vcut/pool.json · prepare","0.2 MB",1,"edl · rank 1")}
        {artrow(False,".vcut/ai.json · 4 tasks","0.3 MB",3,"ai · เสียเงิน")}
        {artrow(False,".vcut/seg/ · render cache","0.6 GB",4,"render · rank 6")}
      </div>
      {sec("HISTORY · SNAPSHOTS · 3")}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {snaprow("20260903-091200","②","ก่อนแก้ noise_db → −15","วันนี้ 09:12")}
        {snaprow("20260902-174005","all","ก่อนใช้สูตร 'TikTok 45 วิ' (22 ค่า)","เมื่อวาน 17:40")}
        {snaprow("20260902-093311","③","ก่อนเปลี่ยน mode → budget","เมื่อวาน 09:33")}
      </div>""",
    '<span class="btn sm on">รีเซ็ต ② + ลบที่ติ๊ก 3</span><span class="btn sm">รีเซ็ตค่าอย่างเดียว</span><span class="btn sm">ลืม snapshot เก่า</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10px;">ห้ามลบระหว่าง render วิ่ง (409)</span><span class="btn sm off">ยกเลิก</span>',
    tabs="reset", badge='<span class="well mono" style="padding:3px 8px;font-size:10.5px;color:#ffb020;">SNAPSHOT BEFORE APPLY</span>')

# ═════════ ③ ไทม์ไลน์ (ลิ้นชักเต็มจอ)
TL_PANEL = f"""<div class="panel" style="grid-column:1 / span 2;display:flex;flex-direction:column;gap:6px;padding:10px 14px;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:12px;"><span class="tag">TIMELINE · B</span><span class="mono kv" style="font-size:10.5px;">6 SHOTS · 0:44 · TRASH 2 · LIVE PREVIEW</span><div style="flex:1;"></div><span class="btn sm">ถังทิ้ง 2</span><span class="btn sm">ลำดับ ◀ ▶</span><span class="btn sm">ตัดตรงนี้</span><span class="btn sm">ดูดเข้าบีต</span><span class="btn sm">↶</span><span class="tag">ZOOM</span><span class="knob sm r45"></span></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;height:18px;"><span></span><div style="position:relative;height:18px;">{RULER}</div></div>
      {tlane("TEXT ⑤", bk(0,6)+bk(91,9))}{tlane("STICKER", bk(0,100))}{tlane("SHAPE", bk(13,4))}{tlane("CAPTION", bk(0,41,"")+bk(42,29,"")+bk(72,28,""), 16)}
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;"><span style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">SHOTS</span></span><div style="display:flex;gap:3px;position:relative;">
        {shot("TALK","0:00–0:08 · 7.9s",160)}{shot("BROLL","1240 · 2.1s",56)}{shot("TALK","0:12–0:23 · 10.6s",200,sel=True)}{shot("BROLL","DJI · 2.0s",52)}{shot("TALK","0:31–0:48 · 17.5s",300)}{shot("BROLL","DJI · 4.1s",80)}
        <span style="position:absolute;left:3.4%;top:-118px;width:2px;height:190px;background:#ffb020;box-shadow:0 0 6px #ffb020;"></span></div></div>
      {tlane("SPEECH", "".join(bk(l,w,"") for l,w in [(0,17),(22,24),(52,39)]), 16)}{tlane("MUSIC TR1 · TR2", bk(0,100)+bk(25,2,"on")+bk(58,2,"on"))}
    </div>"""

CTL = topbar(3, left_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#7f847a;">VAR <span style="color:#ffb020;">B</span> · EDL 6 · FX 7</span><span class="btn sm">↶</span><span class="btn sm">↷</span><span class="btn sm on">SAVE EDL</span><span class="btn sm">SAVE FX</span>', right_extra='<span class="well mono" style="padding:4px 10px;font-size:11px;color:#ffb020;">EDL MOD 1 · ต่อไฟล์ใหม่ ~10 s</span><span class="btn on">◀ กลับ 03</span>') + f"""
  <div style="flex:1;display:grid;grid-template-columns:1fr 400px;grid-template-rows:1fr 250px;gap:10px;padding:10px;min-height:0;">
    <div class="panel" style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0;position:relative;">{preview(520)}
        <span class="well mono" style="position:absolute;left:14px;top:14px;padding:3px 8px;font-size:10px;color:#7f847a;">LIVE · ตามลำดับที่จัดอยู่ (ยังไม่บันทึก) · SHOT 3/6 · TALK</span></div>
      {TRANSPORT.replace('<span class="btn sm">ไทม์ไลน์ ▸</span>','')}
    </div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden;">
      <div class="h"><span class="tag">SHOT 3 · TALK</span><span class="t" style="font-size:14px;">0:12–0:23 · 10.6 s</span><div style="flex:1;"></div><span class="mono kv" style="font-size:10px;">T03 · IMG_1234</span></div>
      <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
        <span class="tag">TRIM · เล็มหัว-ท้าย (วินาทีของคลิปต้นฉบับ)</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div class="fld"><label>เริ่ม (วิ)</label><div class="well">12.40</div></div><div class="fld"><label>จบ (วิ)</label><div class="well">23.00</div></div></div>
        <div style="display:flex;gap:4px;"><span class="btn sm">−0.5</span><span class="btn sm">−0.1</span><span class="btn sm">+0.1</span><span class="btn sm">+0.5</span><div style="flex:1;"></div><span class="btn sm">ตัดตรงหัวเล่น</span></div>
      </div>
      <div style="display:flex;gap:4px;"><span class="btn sm on">▶ เล่นจากช็อตนี้</span><span class="btn sm">◀ ย้ายซ้าย</span><span class="btn sm">ย้ายขวา ▶</span><span class="btn sm">ตัดเสียง</span><span class="btn sm">→ ถังทิ้ง</span></div>
      <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;"><span class="tag">TEXT ในช็อตนี้</span><div class="stat"><span>บทพูด</span><span>"2.2 กิโล 17 คุ้ง ทางขึ้นชันตลอด"</span></div><div class="stat"><span>SCORE</span><span>0.88 · BRIGHT 0.6 · MOTION 0.4</span></div></div>
      <div class="well" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;"><span class="tag">ถังทิ้ง · 2</span><div class="stat"><span>T04 · 0.7 s</span><span>กู้</span></div><div class="stat"><span>T07 · 0.9 s</span><span>กู้</span></div></div>
      <div style="flex:1;"></div>
      <span class="kv" style="font-size:10.5px;line-height:15px;">เอฟเฟกต์รายช็อต (ซูม/โทน/ความเร็ว) แก้ที่ชั้น "เอฟเฟกต์รายช็อต" · ที่นี่คือ edl.json อย่างเดียว</span>
      <div class="cta sm">ต่อไฟล์ใหม่ · assemble · ~10 s</div>
    </div>
    {TL_PANEL}
  </div>"""

# ═════════ ③ แก้ ▸ ซับ
def subline(t, text, conf, warn=False, sel=False):
    return f'<div style="display:grid;grid-template-columns:52px 1fr 44px auto;gap:8px;align-items:center;padding:6px 10px;border-top:1px solid #0f100e;{"background:#1c1e1b;box-shadow:inset 0 0 0 1px #ffb020;border-radius:3px;" if sel else ""}"><span class="mono" style="font-size:10.5px;color:#ffb020;">{t}</span><span style="font-size:12px;{"color:#ffb020;" if warn else ""}">{text}</span>{meter4(conf)}<span class="btn sm">แก้</span></div>'

CSUB = edit3("ซับจากบทพูด", "SEC 05c · AUTO SUB", "ซับจากบทพูด",
    f"""<div style="display:flex;gap:4px;"><span class="btn on" style="flex:1;">ทั้งบรรทัด</span><span class="btn" style="flex:1;">ทีละคำ</span><span class="btn" style="flex:1;">ปิดซับ</span></div>
      {sec("STYLE · text.sub")}
      <div style="display:flex;gap:4px;flex-wrap:wrap;">{keys(["TikTok หนา","Sarabun","Prompt","Kanit"], "TikTok หนา")}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("SIZE 54","r45")}{knobf("OUTLINE 3")}{knobf("MARGIN 120","rm60")}{knobf("SHADOW 0")}</div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">COLOUR</span>{keys(["ขาว","เหลือง","ดำบนแผ่น"], "ขาว")}<div style="flex:1;"></div><span style="display:flex;align-items:center;gap:8px;"><span class="tog"><i></i></span>plate</span></div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">ALIGN</span><div style="display:grid;grid-template-columns:repeat(5,30px);gap:4px;">{pos(3,3)}{pos(6,10)}{pos(3,17)}{pos(6,17,True)}{pos(9,17)}</div><span class="kv" style="font-size:10.5px;">กลางล่าง (align 2)</span></div>
      {sec("LINES · 12", extra='<span class="btn sm">จากบทพูด ▸ เพิ่ม</span>')}
      <div class="well" style="flex:1;display:flex;flex-direction:column;padding:2px 0;overflow:hidden;">
        {subline("0:00.4","น้ำตกที่ไกล ยังไม่ไกลเท่า",4)}
        {subline("0:02.9","บันไดที่ต้องเจอ",4, sel=True)}
        {subline("0:08.7","2.2 กิโล 17 คุ้ง",4)}
        {subline("0:12.0","ทางขึ้นชันตลอด",3)}
        {subline("0:16.5","ตรงนี้ลื่นมาก",1, warn=True)}
        {subline("0:23.4","ถึงชั้นแรกแล้ว",4)}
        {subline("0:31.2","เสียงน้ำดังมาก",3)}
        {subline("0:44.0","ตรงนี้ถ่ายรูปสวยสุด",2, warn=True)}
        <div style="padding:5px 10px;border-top:1px solid #0f100e;" class="mono kv">… อีก 4 บรรทัด · <span style="color:#ffb020;">2 ไม่มั่นใจ</span> แก้ก่อนเผา</div>
      </div>
      <div class="stat"><span>OUTPUT</span><span>final-text.mp4 · build_text ④ · re-encode</span></div>""",
    badge="B · EDIT SUB · 12 LINES", left_note="ซับใช้ segment เดิมของขั้น ③ ทั้งหมด — เปลี่ยนสไตล์แล้วเข้ารหัสภาพใหม่หนึ่งรอบ (④) ไม่แตะ render cache",
    topleft="SUB · LINE 2 · 0:02.9–0:05.1 · align 2 · size 54", cta='<span class="btn on">↻ เผาซับ · build_text ④ · ~40 s</span>')

# ═════════ ③ แก้ ▸ ข้อความ + รูปทรง
CTEXT = edit3("ข้อความ", "SEC 05a · TEXT + SHAPE", "ข้อความ · รูปทรง",
    f"""<div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        <div style="display:grid;grid-template-columns:8px 1fr auto auto;gap:10px;align-items:center;padding:7px 10px;background:#1c1e1b;box-shadow:inset 0 0 0 1px #ffb020;border-radius:3px;"><span class="led on"></span><span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">HOOK · "น้ำตกที่ไกล ยังไม่ไกลเท่า…"</span><span class="mono kv" style="font-size:10px;">0.0–2.4 s · pop_words</span><span class="btn sm">✕</span></div>
        <div style="display:grid;grid-template-columns:8px 1fr auto auto;gap:10px;align-items:center;padding:7px 10px;border-top:1px solid #0f100e;"><span class="led on"></span><span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">การ์ดปิด · "@ชื่อช่อง · ตามไปดู…"</span><span class="mono kv" style="font-size:10px;">40.2–44.2 s · fade</span><span class="btn sm">✕</span></div>
        <div style="display:flex;gap:4px;padding:6px 10px;border-top:1px solid #0f100e;"><span class="btn sm">+ ข้อความใหม่ที่หัวเล่น</span><span class="btn sm">+ จากบทพูด ▸</span><span class="btn sm">+ นับเลข</span></div>
      </div>
      {sec("ANIM · HOOK")}
      {keys(["none","fade","pop","rise","slide","fade_words","pop_words"], "pop_words")}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("IN 0.25","rm60")}{knobf("OUT 0.20","rm60")}{knobf("STAGGER 0.08")}{knobf("SIZE 72","r45")}</div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">STYLE SET</span>{keys(["TikTok หนา","เน้นแดง","ขาวขอบดำ","+ ชุดใหม่"], "เน้นแดง")}<div style="flex:1;"></div><span style="display:flex;align-items:center;gap:8px;"><span class="tog"><i></i></span>plate</span></div>
      <div class="well" style="padding:8px 10px;display:flex;align-items:center;gap:10px;"><span class="tag">COUNT</span><span class="tog"><i></i></span><div class="fld" style="flex:1;"><label>from → to · steps</label><div class="well">0 → 255.9K · 24</div></div><span class="kv" style="font-size:10.5px;">เลขนับขึ้น (สไตล์ B)</span></div>
      {sec("SHAPES · 1", extra=keys(["ลูกศร","แถบ","จุด"], "ลูกศร"))}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        <div style="display:grid;grid-template-columns:8px 1fr auto auto;gap:10px;align-items:center;padding:7px 10px;"><span class="led on"></span><span style="font-size:12px;">ลูกศร → ชี้ "บันได"</span><span class="mono kv" style="font-size:10px;">6.0–8.0 s · x .62 y .48</span><span class="btn sm">✕</span></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("SIZE 120","r45")}{knobf("THICK .12")}{knobf("ANGLE −35","rm60")}{knobf("GLOW .6","r90")}</div>
      <span class="kv" style="font-size:10.5px;">ลากชิ้นไปวางบนจอ · รูปทรงวาดด้วย libass (fxtext) ไม่ต้องมีไฟล์ภาพ</span>""",
    badge="B · EDIT TEXT · 2 TEXTS · 1 SHAPE", left_note="ข้อความ/รูปทรงเขียนเป็น ASS ในขั้น ⑤ (fxtext) — เปลี่ยนแล้วทำขั้น ⑤ ใหม่ · ซับ (④) ไม่ถูกแตะ",
    topleft="TEXT · HOOK · pop_words · 0.0–2.4 s · ลากเพื่อย้าย")

# ═════════ ③ แก้ ▸ เพลง 2 แทร็ก
def looprow(on, n, b, d):
    return f'<div style="display:grid;grid-template-columns:8px 1fr auto auto auto;gap:10px;align-items:center;padding:5px 10px;border-top:1px solid #0f100e;"><span class="led{" on" if on else ""}"></span><span style="font-size:12px;">{n}</span><span class="mono kv" style="font-size:10px;">{b} BPM · {d}</span><span class="btn sm">▶</span><span class="btn sm">＋</span></div>'

CMUSIC = edit3("เพลง · 2 แทร็ก", "SEC 05d · MUSIC · SFX · BEAT", "เพลง · 2 แทร็ก",
    f"""<div class="well" style="padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:8px;"><div style="display:flex;align-items:center;gap:8px;"><span class="led on"></span><span class="tag">TR 1 · BGM</span><span style="font-size:12px;">Neon Run</span></div><div style="display:flex;gap:10px;justify-content:space-around;">{knobf("GAIN −18","rm60",True)}{knobf("DUCK 6","r45",True)}{knobf("FADE 1.0","",True)}</div><div style="display:flex;gap:4px;"><span class="btn sm on">LOOP</span><span class="btn sm">BEAT LOCK</span></div></div>
        <div style="display:flex;flex-direction:column;gap:8px;"><div style="display:flex;align-items:center;gap:8px;"><span class="led dim"></span><span class="tag">TR 2 · SFX</span><span style="font-size:12px;">AI · 2 จุด</span></div><div style="display:flex;gap:10px;justify-content:space-around;">{knobf("GAIN −6","",True)}{knobf("SNAP CUT","r90",True)}</div><div style="display:flex;gap:4px;"><span class="btn sm">whoosh</span><span class="btn sm">pop</span><span class="btn sm">ding</span><span class="btn sm">+3</span></div></div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">{keys(["สนุก/มีพลัง","ชิล","ดราม่า","โลไฟ","ซินธ์","อะคูสติก","+5"], "สนุก/มีพลัง")}</div>
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {looprow(False,"Uplift Drive","98","0:32")}{looprow(True,"มีพลัง · Neon Run","98","0:30")}{looprow(False,"Big Step","110","0:28")}{looprow(False,"Sunrise Pop","104","0:31")}
        <div style="display:flex;gap:6px;padding:6px 10px;border-top:1px solid #0f100e;align-items:center;"><span class="well mono" style="flex:1;padding:3px 8px;font-size:10px;color:#7f847a;">yt-dlp ▸ https://youtu.be/…</span><span class="btn sm">ดึง</span><span class="btn sm">⬆ mp3/m4a/wav</span></div>
      </div>
      {sec("BEATS · beat.py", extra='<span class="btn sm">วิเคราะห์ใหม่</span>')}
      <div class="well" style="padding:8px 12px;display:flex;align-items:center;gap:14px;"><span class="seg7" style="font-size:22px;">98.0</span><span class="tag">BPM</span><div class="stat" style="flex:1;"><span>OFFSET</span><span>0.42 s</span></div><div class="stat" style="flex:1;"><span>CUTS ON BEAT</span><span>2 / 5</span></div></div>
      <div style="display:flex;gap:6px;align-items:center;"><span class="btn sm on">ดูดรอยตัดเข้าบีต · ±0.25 s</span><span class="btn sm">ย้อนกลับ</span><span class="mono kv" style="font-size:10px;">รับเฉพาะช็อตที่อยู่บนจอตอนนี้ · คืน start/end ใหม่</span></div>
      <span class="kv" style="font-size:10.5px;line-height:14px;">คลิปอ้างอิง 7 ตัวไม่ได้ตัดตามบีต (4/21–8/17 = สุ่ม) — ปุ่มนี้เป็นทางเลือก ไม่ใช่ค่าตั้งต้น</span>
      {sec("MIXER · MASTER −14 LUFS")}
      <div class="well" style="padding:8px 12px;display:flex;flex-direction:column;gap:5px;">{"".join(f'<div style="display:grid;grid-template-columns:40px 1fr 40px;gap:10px;align-items:center;"><span class="tag">{n}</span><span class="meter">{"".join("<i class=l></i>" for _ in range(l))}{"".join("<i></i>" for _ in range(20-l))}</span><span class="mono kv" style="font-size:10px;text-align:right;">{g}</span></div>' for n,l,g in [("TALK",15,"0"),("TR1",9,"−18"),("TR2",6,"−6")])}</div>""",
    badge="B · EDIT MUSIC · TR1 + TR2", left_note="เพลงหลบเสียงพูดด้วย sidechaincompress — ไม่ต้องรู้ว่าใครพูดตรงไหน แก้ไทม์ไลน์แล้วไม่พัง", 
    lanes_html=lanes().replace('<span class="blk" style="left:0;width:100%;"></span>', '<span class="blk on" style="left:0;width:100%;opacity:.5;"></span>' + "".join(f'<span style="position:absolute;left:{i*4.9:.1f}%;top:0;width:1px;height:12px;background:#ffb020;"></span>' for i in range(21))),
    topleft="MUSIC · TR1 Neon Run · DUCK ON TALK · BEAT GRID 98")

# ═════════ ③ แก้ ▸ เอฟเฟกต์รายช็อต
CFXSHOT = edit3("โทนสี / ซูม / ความเร็ว", "SEC 05e · PER-SHOT FX", "เอฟเฟกต์รายช็อต",
    f"""<div style="display:flex;gap:3px;">{"".join(f'<span class="btn sm{" on" if i==2 else ""}" style="flex:1;flex-direction:column;gap:0;line-height:1.2;">{k}<span class="mono" style="font-size:9px;color:{"#ffb020" if i==2 else "#7f847a"};">{d}</span></span>' for i,(k,d) in enumerate([("T1","7.9"),("B1","2.1"),("T2","10.6"),("B2","2.0"),("T3","17.5"),("B3","4.1")]))}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("SPEED 1.0")}{knobf("ZOOM 1.05","r45")}{knobf("ZOOM TO 1.22","r90")}{knobf("VOL 0 dB")}</div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">PAN</span>{keys(["ไม่ไถล","←","→","↑","↓"], "→")}<div style="flex:1;"></div><span style="display:flex;align-items:center;gap:8px;"><span class="tog"><i></i></span>MUTE</span></div>
      {sec("GRADE · โทนสี")}
      {keys(["ไม่แตะ","warm อุ่น","cool เย็น","punch จัดจ้าน","flat จืด","bw ขาวดำ"], "punch จัดจ้าน")}
      {sec("GLITCH · WHIP")}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("GLITCH .30","rm60")}{knobf("HZ 1.4")}{knobf("WHIP 0")}{knobf("KEN 0")}</div>
      {sec("SPLIT · แบ่งจอสองคน")}
      {keys(["ปิด","บน-ล่าง (v)","ซ้าย-ขวา (h)"], "ปิด")}
      <div style="display:grid;grid-template-columns:1fr 90px;gap:8px;"><div class="fld"><label>อีกครึ่งใช้คลิป (ฟุตเทจดิบ)</label><div class="well">— เลือกคลิป ▾</div></div><div class="fld"><label>เริ่มที่ (วิ)</label><div class="well">0.0</div></div></div>
      <div style="flex:1;"></div>
      <div style="display:flex;gap:4px;"><span class="btn sm on">ใช้กับทุกช็อต TALK</span><span class="btn sm">ใช้กับทุกช็อต</span><span class="btn sm">ล้างช็อตนี้</span></div>
      <div class="stat"><span>RENDER</span><span>ช็อตนี้ render ใหม่ (sha1 เปลี่ยน) · ช็อตอื่น cache</span></div>""",
    badge="B · EDIT FX · SHOT T2", left_note="ค่ารายช็อตอยู่ใน fx.json (speed zoom zoom_to pan grade glitch whip split mute vol_db) — ช็อตที่แก้ถูก render ใหม่เฉพาะชิ้น",
    pv=preview(560).replace('<img src="f57.jpg"', '<div style="position:absolute;inset:8% 6%;border:1.5px dashed #ffb020;z-index:2;"></div><div style="position:absolute;inset:14% 12%;border:1px solid rgba(255,176,32,.5);z-index:2;"></div><img src="f57.jpg" style="filter:contrast(1.12) saturate(1.2);"'),
    topleft="SHOT T2 · ZOOM 1.05 → 1.22 · PAN → · GRADE punch")

# ═════════ ③ แผนที่เส้นทาง
MAP_SVG = """<div style="position:absolute;left:5%;bottom:22%;width:42%;aspect-ratio:1/1;background:rgba(10,12,9,.72);border-radius:4px;box-shadow:0 0 0 1px #ffb020;z-index:2;"><svg viewBox="0 0 100 100" style="width:100%;height:100%;"><path d="M12 84 C 30 70 28 52 46 46 S 70 30 86 16" stroke="#ffb020" stroke-width="2.2" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 3px #ffb020);"/><path d="M12 84 C 30 70 28 52 46 46" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="84" r="3" fill="#fff"/><circle cx="46" cy="46" r="3" fill="#fff"/><circle cx="86" cy="16" r="3" fill="#ffb020"/><circle cx="46" cy="46" r="6" fill="none" stroke="#fff" stroke-width="1.2"/><text x="52" y="44" font-size="7" fill="#fff" font-family="JetBrains Mono">1.6 km</text></svg></div>"""

def stoprow(name, t, km, sel=False):
    return f'<div style="display:grid;grid-template-columns:8px 1fr 60px 60px auto;gap:8px;align-items:center;padding:6px 10px;border-top:1px solid #0f100e;{"background:#1c1e1b;box-shadow:inset 0 0 0 1px #ffb020;border-radius:3px;" if sel else ""}"><span class="led on"></span><span style="font-size:12px;">{name}</span><span class="mono kv" style="font-size:10.5px;">{t}</span><span class="mono" style="font-size:10.5px;color:#ffb020;">{km}</span><span class="btn sm">✕</span></div>'

CMAP = edit3("แผนที่เส้นทาง", "SEC 05f · JOURNEY MAP", "แผนที่เส้นทาง",
    f"""<div style="display:flex;align-items:center;gap:10px;"><span class="tog on"><i></i></span><span style="font-size:12.5px;">เปิดแผนที่ในแบบ B</span><div style="flex:1;"></div><span class="kv" style="font-size:10.5px;">ตอบคำถามเดียว: "เดินมาถึงไหนแล้ว"</span></div>
      {sec("STOPS · หมุด 4", extra='<span class="btn sm">+ หมุดที่หัวเล่น</span>')}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {stoprow("จุดเริ่ม · ลานจอด","0.0 s","0.0 km")}{stoprow("สะพานไม้","12.5 s","0.8 km")}{stoprow("น้ำตกชั้น 1","28.0 s","1.6 km", sel=True)}{stoprow("จุดสูงสุด · ชั้น 3","41.0 s","2.2 km")}
      </div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">WALKER</span>{keys(["คนเดิน","จุด","ลูกศร"], "จุด")}<span class="tag" style="margin-left:8px;">UNIT</span>{keys(["km","m"], "km")}<div style="flex:1;"></div><span style="display:flex;align-items:center;gap:8px;"><span class="tog on"><i></i></span>show_dist</span></div>
      {sec("LINE · GLOW")}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">{knobf("THICK 2.2")}{knobf("GLOW .8","r90")}{knobf("TRAIL 1.0","r45")}{knobf("WALK 0.6")}</div>
      <div style="display:flex;gap:10px;align-items:center;"><span class="tag">LOOK</span>{keys(["เรืองแสง","เส้นเรียบ","กระดาษ"], "เรืองแสง")}</div>
      {sec("PANEL")}
      <div style="display:flex;gap:10px;align-items:center;"><div style="display:grid;grid-template-columns:repeat(5,30px);gap:4px;">{pos(3,3)}{pos(9,3)}{pos(6,10)}{pos(3,17,True)}{pos(9,17)}</div>{knobf("SIZE 42%","r45",True)}{knobf("PAD 12","",True)}<div class="fld" style="flex:1;"><label>IN / OUT (วิ)</label><div class="well">0.4 / 0.4</div></div></div>
      <div style="flex:1;"></div>
      <span class="kv" style="font-size:10.5px;line-height:14px;">แผนที่วาดด้วย ASS (journey.py) · เส้นทางเป็น bezier จากหมุด · โผล่ตอนถึงแต่ละหมุด (cues) · เก็บใน fx.json ก้อนเดียวกับสติกเกอร์</span>""",
    badge="B · EDIT JOURNEY · 4 STOPS", left_note="หนังเดินป่าที่ทุกช็อตหน้าตาเหมือนกัน คนดูหลงตั้งแต่นาทีที่สอง — แผนที่เล็กที่โผล่ตอนถึงเนินแก้เรื่องนี้",
    pv=preview(560).replace('</div>\n        </div>', '</div>' + MAP_SVG + '\n        </div>', 1) if False else preview(560)[:-6] + MAP_SVG + preview(560)[-6:],
    topleft="JOURNEY · STOP 3/4 · 28.0 s · 1.6 km · ลากหมุดบนแผนที่ได้")

# ═════════ ③ AI ดูหนัง (review)
def rtask(on, k, th, desc):
    return f'<div style="display:grid;grid-template-columns:30px 60px 1fr;gap:8px;align-items:center;padding:6px 10px;border-top:1px solid #0f100e;"><span class="tog{" on" if on else ""}"><i></i></span><span class="mono" style="font-size:11px;{"color:#ffb020;" if on else ""}">{k}</span><span style="font-size:11.5px;">{th} <span class="kv" style="font-size:10px;">{desc}</span></span></div>'

CREVIEW = edit3("", "SEC 06 · AI REVIEW", "AI ดูหนังที่ตัดแล้ว",
    f"""{sec("TASKS · vcut review --task")}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        {rtask(True,"cut","รอยตัด","ตรงไหนยืดเยื้อ · ควรตัดออก")}{rtask(True,"trim","เล็ม","หัว-ท้ายช็อตที่ควรเล็ม")}{rtask(False,"music","เพลง","อารมณ์ · จุดเปลี่ยนเพลง")}{rtask(True,"sfx","เสียงเอฟเฟกต์","วาง SFX ตรงรอยตัด")}{rtask(False,"sticker","สติกเกอร์","3–5 จุดที่ควรมีภาพซ้อน")}{rtask(True,"text","ข้อความ","ประโยคที่ควรขึ้นจอ")}
      </div>
      {sec("CONTEXT · บอกว่าอยากให้ดูอะไรเป็นพิเศษ")}
      <div class="well" style="padding:8px 12px;font-size:12.5px;line-height:18px;min-height:40px;">เน้นความกระชับช่วง 10–30 วิ · อย่าเสนอตัดช่วงถึงน้ำตก<span style="color:#ffb020;">▍</span></div>
      <div style="display:flex;gap:18px;"><div class="stat" style="flex:1;"><span>SEES</span><span>6 SHOTS · 44.2 s</span></div><div class="stat" style="flex:1;"><span>EST</span><span>4 TASKS · ~1m · $0.16</span></div></div>
      <div class="cta sm"><span class="led" style="background:#1c1e1b;box-shadow:none;"></span>สั่งดู · review B</div>
      {sec("PROPOSALS · 3 (fingerprint 7a3c)", extra='<span class="btn sm">รับทั้งหมด</span>')}
      <div class="well" style="display:flex;flex-direction:column;padding:2px 0;">
        <div style="padding:4px 10px;" class="tag">trim</div>{ai_op("ช็อต 2 · ตัดหัว 0.8 s — เศษจากขอบ 53.0")}
        <div style="padding:4px 10px;border-top:1px solid #0f100e;" class="tag">cut</div>{ai_op("เอาช็อต 4 ออก · 0.72 s — ซ้ำกับช็อต 5")}
        <div style="padding:4px 10px;border-top:1px solid #0f100e;" class="tag">text</div>{ai_op("“2.2 กิโล · 17 คุ้ง” ขึ้นจอที่ 6.0 s")}
      </div>
      <div style="flex:1;"></div>
      {sec("REPORT · HISTORY 2")}
      <div class="well" style="padding:8px 12px;display:flex;flex-direction:column;gap:4px;"><div class="stat"><span>วันนี้ 09:45 · 4 tasks</span><span>3 ops · 58 s · $0.16 · 0 warn</span></div><div class="stat"><span>เมื่อวาน 17:50 · cut trim</span><span>5 ops · รับ 4</span></div></div>
      <span class="kv" style="font-size:10.5px;">รับข้อเสนอ = แก้ edl.json/fx.json ให้เลย · ถ้า EDL กับโจทย์ไม่เปลี่ยน ไม่ถามซ้ำ (cache ตาม fingerprint)</span>""",
    badge="B · AI REVIEW · 3 PROPOSALS", left_note="AI บทบาทที่สอง — เห็นลำดับจริงที่คนดูจะเจอ จึงตอบเรื่อง 'ตรงไหนยืดเยื้อ' ได้ต่างจาก vcut ai ที่ดูฟุตเทจดิบ",
    cta='<span class="btn on">◀ กลับ 03</span>', topleft="REVIEW · claude -p · sees final order · not raw footage")

for k, v in [("CLib", CLIB), ("CPool", CPOOL), ("CTrans", CTRANS), ("CAI", CAI), ("CPick", CPICK), ("CPipe", CPIPE), ("CReset", CRESET),
             ("CTL", CTL), ("CSub", CSUB), ("CText", CTEXT), ("CMusic", CMUSIC), ("CFxShot", CFXSHOT), ("CMap", CMAP), ("CReview", CREVIEW)]:
    PAGES[k] = v
