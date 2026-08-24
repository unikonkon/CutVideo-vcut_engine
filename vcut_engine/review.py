"""REVIEW — ให้ AI ดู "หนังที่ตัดเสร็จแล้ว" แล้วเสนอการแก้

นี่คือ AI บทบาทที่สอง คนละตัวกับ `vcut ai`:

    vcut ai      อยู่ก่อน decide   เห็นกองคลิปดิบ 273 อัน   → .vcut/ai.json
    vcut review  อยู่หลัง render   เห็นหนังจริงที่ตัดแล้ว   → .vcut/review.json

ตำแหน่งหลังได้เปรียบตรงที่เห็น *ลำดับจริงที่คนดูจะเจอ* — บทพูดเรียงตามที่จะได้ยิน
จริง ความยาวแต่ละช็อตจริง เสียงที่ปรับแล้วจริง จึงตอบเรื่อง "ตรงไหนยืดเยื้อ"
หรือ "ช็อตนี้พูดซ้ำกับช็อตที่ 12" ได้ ซึ่งตอนอยู่ก่อน decide ตอบไม่ได้เลย

── งานที่สั่งได้ (review.tasks) ────────────────────────────────────────────

    cut      เอาช็อตออก / สลับที่           → edl.json   ไม่ต้อง render ใหม่
    trim     ตัดช่วงเงียบหัว-ท้ายช็อต        → edl.json   render เฉพาะชิ้นนั้น
    music    เลือกเพลงจากคลังมาวาง          → fx.json    ไม่แตะขั้น 3 เลย
    sfx      วางเสียงเอฟเฟกต์               → fx.json
    sticker  วางสติกเกอร์ / ภาพซ้อน         → fx.json
    text     เขียนข้อความบนหนัง             → fx.json

หลักเดิมยังอยู่: **AI เสนอ คนกดรับ** — ที่นี่เขียนแค่ .vcut/review.json ซึ่งเป็น
ข้อเสนอล้วน ไม่มีบรรทัดไหนแตะ edl.json หรือ fx.json เอง ฝั่งหน้าเว็บเป็นคนลงมือ
ตอนคนกดรับ (ทีละข้อหรือรับทั้งหมด) แล้วยังต้องกดบันทึกอีกที

ตัวเลขของ `trim` ไม่ได้มาจากการเดาของ AI — เอนจินคำนวณช่วงที่ตัดได้จาก
.vcut/silence.json ที่วัดด้วย ffmpeg มาก่อนแล้วส่งเป็น "ตัวเลือก" ให้ AI คัดว่า
ข้อไหนควรตัด AI ตอบได้แค่ id ของตัวเลือก จึงไม่มีทางเสนอเวลาที่ไม่มีอยู่จริง

รายการเสียงเอฟเฟกต์กับสติกเกอร์ตัวอย่างอยู่ฝั่งหน้าเว็บ (public/sfx, public/stickers)
เอนจินไม่รู้จักเอง — หน้าเว็บจึงส่งแคตตาล็อกมาพร้อมคำสั่ง สองงานนั้นจึงสั่งจาก
หน้าเว็บเท่านั้น ส่วน cut/trim/music/text สั่งจากเทอร์มินัลก็ได้

AI ยังไม่เห็นภาพวิดีโอ — เห็นข้อความกับตัวเลขเหมือนเดิม
"""
import hashlib
import json
import time

from .provider import ask, provider_of
from .util import c, die, info, read_json, warn, write_json

TASKS = ("cut", "trim", "music", "sfx", "sticker", "text")
TASK_LABEL = {
    "cut": "เอาออก / สลับที่",
    "trim": "ตัดช่วงเงียบหัว-ท้าย",
    "music": "เพลงประกอบ",
    "sfx": "เสียงเอฟเฟกต์",
    "sticker": "สติกเกอร์ / ภาพซ้อน",
    "text": "ข้อความบนหนัง",
}
# งานที่ผลลงชั้นแต่งหนัง (ขั้น 5) — กดรับแล้วไม่ต้องตัดวิดีโอใหม่
FX_TASKS = ("music", "sfx", "sticker", "text")
# งานที่ต้องมีแคตตาล็อกจากหน้าเว็บถึงจะสั่งได้
WEB_TASKS = ("sfx", "sticker")
OPS = ("drop", "move", "trim", "music", "sfx", "sticker", "text")


def fingerprint(timeline):
    """ลายนิ้วมือของ EDL ตอนที่วิเคราะห์ — ไว้เตือนว่าข้อเสนอเก่าไปแล้ว"""
    blob = json.dumps([[s["name"], s["start"], s["dur"]] for s in timeline],
                      separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()[:16]


def clean_tasks(v, default=("cut",)):
    """รับได้ทั้ง list และสตริงคั่นด้วยจุลภาค — ทิ้งชื่อที่ไม่รู้จักเงียบ ๆ"""
    if isinstance(v, str):
        v = [x.strip() for x in v.split(",")]
    out = [t for t in (v or []) if t in TASKS]
    return out or list(default)


# ─────────────────────────── สิ่งที่ AI จะได้เห็น ───────────────────────────

def cut_table(edl, rman, limit=220):
    """หนังทั้งเรื่องเป็นตารางบรรทัดละช็อต เรียงตามที่คนดูจะเจอจริง"""
    gain = {}
    for s in rman.get("segments", []):
        gain[(s["name"], round(s.get("start", -1), 3), round(s["dur"], 3))] = s

    rows = ["ลำดับ | คลิป | ประเภท | วินาที | เวลาในหนัง | บท | เนื้อหา"]
    t = 0.0
    for i, s in enumerate(edl["timeline"], 1):
        g = gain.get((s["name"], round(s["start"], 3), round(s["dur"], 3)), {})
        if s["kind"] == "TALK":
            body = (s.get("text") or "")[:limit].replace("\n", " ")
        else:
            body = f"ภาพวิว motion {s.get('motion', '?')} สว่าง {s.get('bright', '?')}"
            if s.get("orient") == "V":
                body += " แนวตั้ง"
        if g.get("limiter"):
            body += "  [limiter แตะ]"
        rows.append(f"{i} | {s['name']} | {'พูด' if s['kind'] == 'TALK' else 'วิว'} | "
                    f"{s['dur']:.1f} | {int(t // 60)}:{int(t % 60):02d} | "
                    f"{s.get('chapter_title', '-')} | {body}")
        t += s["dur"]
    return "\n".join(rows)


def tl_table(edl, limit=110):
    """ตารางสำหรับงานชั้นแต่งหนัง — คีย์คือ *วินาทีบนไทม์ไลน์* ไม่ใช่เลขลำดับ

    งานพวกนี้วางของลงบนเส้นเวลาของหนัง ไม่ได้อ้างช็อต ถ้าให้ตารางเดียวกับ cut
    ไปมันจะตอบเป็นเลขลำดับแล้วต้องมาแปลงทีหลัง ซึ่งพลาดง่ายตอนช็อตซ้ำชื่อกัน
    """
    rows = ["เริ่มวินาทีที่ | ถึงวินาทีที่ | ประเภท | บท | เนื้อหา"]
    t = 0.0
    for s in edl["timeline"]:
        body = (s.get("text") or "")[:limit].replace("\n", " ") \
            if s["kind"] == "TALK" else "ภาพวิว"
        rows.append(f"{t:.1f} | {t + s['dur']:.1f} | "
                    f"{'พูด' if s['kind'] == 'TALK' else 'วิว'} | "
                    f"{s.get('chapter_title', '-')} | {body}")
        t += s["dur"]
    return "\n".join(rows)


def chapter_table(edl):
    ch = edl.get("chapters") or []
    if not ch:
        return ""
    return "\n".join(f"  {i}. {x['title']} — {x['segments']} ชิ้น "
                     f"{x['duration'] / 60:.1f} นาที" for i, x in enumerate(ch, 1))


# ─────────────────── ตัวเลือกตัดช่วงเงียบ (คำนวณ ไม่ได้ถาม AI) ───────────────────

def trim_candidates(ctx, edl, quiet):
    """ช่วงเงียบหัว-ท้ายของแต่ละช็อตที่ตัดออกได้จริง — คิดจากตัวเลขที่วัดไว้

    ตัดได้แค่หัวกับท้ายโดยตั้งใจ: ช่องเงียบกลางช็อตต้องผ่าช็อตเป็นสองชิ้น ซึ่งทำให้
    เลขลำดับของทุกช็อตหลังจากนั้นเลื่อน แล้วข้อเสนออื่นในรอบเดียวกันจะชี้ผิดหมด
    ช่องกลางเป็นงานของ [jumpcut] ที่ขั้น 2 ซึ่งตัดตั้งแต่ตอนสร้างคลัง
    """
    j = ctx.get("jumpcut", {}) or {}
    pad = float(j.get("pad", 0.10))
    least = float(ctx.get("review.trim_min", 0.35))     # ตัดได้น้อยกว่านี้ ไม่คุ้มเสนอ
    keep = float(ctx.get("review.trim_keep", 1.20))     # เหลือสั้นกว่านี้ ไม่ตัด

    out = []
    for i, s in enumerate(edl["timeline"]):
        if s["kind"] != "TALK":
            continue
        gaps = quiet.get(s["name"])
        if not gaps:
            continue
        a, b = float(s["start"]), float(s["start"]) + float(s["dur"])
        head = tail = 0.0
        for g0, g1 in gaps:
            if g0 <= a + 0.02 and g1 > a:               # เงียบคร่อมหัวช็อต
                head = max(head, min(g1, b) - a - pad)
            if g1 >= b - 0.02 and g0 < b:               # เงียบคร่อมท้ายช็อต
                tail = max(tail, b - max(g0, a) - pad)
        for side, cut in (("head", head), ("tail", tail)):
            cut = round(cut, 2)
            if cut < least or (b - a) - cut < keep:
                continue
            start = round(a + cut, 3) if side == "head" else round(a, 3)
            out.append({
                "id": len(out), "at": i, "name": s["name"], "side": side,
                "cut": cut, "start": start, "dur": round((b - a) - cut, 3),
                "was": round(b - a, 2),
                "text": (s.get("text") or "")[:90].replace("\n", " "),
            })
    return out


def trim_table(cands):
    rows = ["id | ช็อต | คลิป | ตัดตรงไหน | ตัดออกกี่วิ | เดิมยาว | เหลือ | คำพูด"]
    for x in cands:
        rows.append(f"{x['id']} | {x['at'] + 1} | {x['name']} | "
                    f"{'หัวช็อต' if x['side'] == 'head' else 'ท้ายช็อต'} | "
                    f"{x['cut']:.2f} | {x['was']:.1f} | {x['dur']:.1f} | {x['text']}")
    return "\n".join(rows)


# ─────────────────────────── โปรมป์รายงาน ───────────────────────────

RULE_TAIL = """
กติกาที่ห้ามฝ่าฝืน
- ตอบเป็น JSON ล้วนตาม schema ไม่ต้องมีคำอธิบายนอก JSON
- เขียนคำตอบลงไฟล์ {out_name} ด้วย Write tool (นี่คือช่องทางส่งคำตอบจริง)
- ห้ามแก้ไฟล์อื่นใดทั้งสิ้น
"""


def _head(edl, context, what):
    s = edl["summary"]
    n = len(edl["timeline"])
    head = [
        f"นี่คือหนังที่ตัดเสร็จแล้ว {n} ช็อต ยาว {s['duration_total'] / 60:.1f} นาที "
        f"({s['segments_talk']} ช็อตพูด + {s['segments_broll']} ช็อตวิว)",
        "",
        what,
    ]
    if context:
        head += ["", "สิ่งที่เจ้าของงานอยากให้ดูเป็นพิเศษ:", context]
    return "\n".join(head)


CUT_SCHEMA = """{
  "summary": "ภาพรวมของหนังเรื่องนี้ 2-4 ประโยค",
  "ops": [
    {"op": "drop", "at": 47, "name": "IMG_7412", "why": "พูดเรื่องเดียวกับช็อต 44"},
    {"op": "move", "at": 12, "name": "IMG_7099", "to": 31, "why": "ควรอยู่หลังตอนถึงยอด"}
  ]
}"""


def prompt_cut(ctx, edl, rman, context, out_name):
    chs = chapter_table(edl)
    body = f"""
งานของคุณ: เสนอการแก้ไขเป็นรายการ โดยทำได้แค่สองอย่างเท่านั้น

  drop  เอาช็อตนี้ออก
  move  ย้ายช็อตนี้ไปอยู่ตำแหน่งอื่น

ทำไมได้แค่สองอย่าง: สองอย่างนี้ไม่ต้องเข้ารหัสวิดีโอใหม่ เจ้าของงานจึงกดรับ
แล้วได้ไฟล์ใหม่ในไม่ถึงนาที ถ้าคุณเสนอให้ตัดหัวท้ายช็อตหรือดึงช็อตใหม่เข้ามา
จะทำตามไม่ได้ อย่าเสนอ

สิ่งที่ควรมองหา
- ช็อตพูดที่เล่าเรื่องเดียวกับช็อตก่อนหน้า พูดวนซ้ำ หรือพูดค้างไม่จบ
- ช่วงที่ยืดเยื้อ — ช็อตวิวติดกันหลายอันโดยไม่มีอะไรคืบหน้า
- ช็อตที่ขัดลำดับการเล่าเรื่องอย่างเห็นได้ชัด
- เปิดเรื่องกับปิดเรื่องแข็งแรงพอไหม

กติกา
- "at" คือเลขลำดับในตาราง (เริ่มที่ 1) · "name" ต้องตรงกับชื่อคลิปที่ลำดับนั้น
- "to" คือเลขลำดับปลายทาง อ้างจากตารางเดิมก่อนแก้
- เสนอไม่เกิน {int(ctx.get('review.max_ops', 40))} รายการ เรียงจากที่มั่นใจที่สุดก่อน
- ถ้าหนังดีอยู่แล้ว ตอบ ops เป็น [] ได้ ไม่ต้องหาเรื่องแก้
- "why" ภาษาไทย ไม่เกิน 20 คำ อ้างเหตุผลจากเนื้อหาจริง อย่าเดา

{'บทที่แบ่งไว้' + chr(10) + chs if chs else ''}

ไทม์ไลน์ทั้งเรื่อง
{cut_table(edl, rman, int(ctx.get('review.text_chars', 220)))}
"""
    return (_head(edl, context, "คุณกำลังดูในฐานะคนดูคนแรก — บอกว่าตรงไหนควรตัดออก "
                                "ตรงไหนควรสลับที่")
            + body + "\nschema ที่ต้องตอบ\n" + CUT_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


TRIM_SCHEMA = """{
  "ops": [{"id": 3, "why": "เงียบก่อนเริ่มพูด 1.2 วิ"}]
}"""


def prompt_trim(ctx, edl, cands, context, out_name):
    body = f"""
งานของคุณ: เลือกว่าช่วงเงียบไหนควรตัดออกจริง

ตารางข้างล่างคือช่วงเงียบที่เครื่องวัดจากคลื่นเสียงมาแล้ว (ffmpeg silencedetect)
ทุกบรรทัดตัดได้จริงและปลอดภัยแล้วทางเทคนิค — หน้าที่คุณคือคัดว่าข้อไหน *ควร* ตัด
ในเชิงจังหวะการเล่าเรื่อง ไม่ใช่ตัดทุกข้อโดยอัตโนมัติ

ตอบเป็น id จากตารางเท่านั้น ห้ามคิดตัวเลขวินาทีขึ้นมาเอง — ถ้าตอบ id ที่ไม่มีในตาราง
ข้อนั้นจะถูกทิ้ง

เกณฑ์ที่ควรใช้
- เงียบยาวก่อน/หลังประโยค = ตัด ทำให้หนังกระชับขึ้นทันที
- เงียบสั้น ๆ ที่เป็นการเว้นจังหวะให้คนดูตามทัน = เก็บไว้
- ท้ายช็อตสุดท้ายของบท เก็บความเงียบไว้บ้างก็ได้ ถ้าเป็นจังหวะจบ
- ตัดหัวช็อตพูดที่มีเสียงลม/เสียงเดินก่อนเริ่มพูด = ตัด

เสนอไม่เกิน {int(ctx.get('review.max_ops', 40))} รายการ · "why" ภาษาไทยไม่เกิน 15 คำ

ตัวเลือกที่ตัดได้ (รวม {len(cands)} จุด · ตัดได้รวม {sum(x['cut'] for x in cands):.0f} วินาที)
{trim_table(cands)}
"""
    return (_head(edl, context, "คุณกำลังช่วยเก็บงานตัดต่อ — เลือกช่วงเงียบที่ควรตัดทิ้ง")
            + body + "\nschema ที่ต้องตอบ\n" + TRIM_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


MEDIA_SCHEMA = """{
  "ops": [{"file": "ชื่อไฟล์จากรายการ", "tl": 12.5, "dur": 2.0, "why": "เหตุผลสั้น ๆ"}]
}"""


def prompt_music(ctx, edl, tracks, samples, context, out_name):
    """`tracks` = ไฟล์ที่อยู่ในคลังของโปรเจกต์แล้ว · `samples` = ลูปเพลงคลอตัวอย่าง
    ที่อยู่ฝั่งหน้าเว็บ (ยังไม่ได้เข้าคลัง — หน้าเว็บอัปโหลดให้ตอนกดรับข้อเสนอ)

    สองกลุ่มนี้แยกตารางกันเพราะ AI ต้องรู้ว่าอะไรเป็นอะไร: ไฟล์ในคลังมีแต่ชื่อ
    (ซึ่งมักเป็นชื่อคลิป YouTube ที่อ่านอารมณ์เพลงไม่ออก) ส่วนลูปตัวอย่างมีป้าย
    กับหมวดบอกอารมณ์ครบ — ยัดรวมกันเป็นรายการเดียวแล้ว AI จะเลือกจากชื่อไฟล์ล้วน
    ซึ่งเดาไม่ได้ว่าเพลงไหนเข้ากับช่วงไหนของหนัง
    """
    lib = ("\n".join("  " + t for t in tracks)
           if tracks else "  (ยังไม่มีไฟล์เพลงในคลัง)")
    loops = (_catalog_table(samples, ["file", "label", "cat"])
             if samples else "(ไม่มี)")
    body = f"""
งานของคุณ: เลือกเพลงมาวางคลอบนหนัง

เพลงในคลังของโปรเจกต์ (ตอบด้วยชื่อไฟล์ตรง ๆ)
{lib}

ลูปเพลงคลอสังเคราะห์ที่เลือกได้ด้วย (ตอบด้วยคอลัมน์ file · ทุกตัววนซ้ำได้ไม่มีรอยต่อ
จึงใส่ dur ยาวเท่าไรก็ได้)
หมวดที่บอกอารมณ์เพลง ใช้ได้กับหนังทุกแบบ — travel=เดินทาง chill=ชิล warm=อบอุ่น
upbeat=สนุก tense=ลุ้นระทึก choir=เสียงร้องคอรัสไม่มีเนื้อ
หมวดที่บอกช่วงของเรื่องในทริปเดินป่า/ขึ้นเขา ใช้เมื่อหนังเป็นแนวนั้น — depart=ออกเดินทาง
trek=เดินป่า/ลุยทาง summit=ขึ้นถึงยอด camp=แคมป์/กลางคืน back=ขากลับ/ปิดเรื่อง
{loops}

เลือกได้เฉพาะชื่อจากสองตารางข้างบน ห้ามคิดชื่อไฟล์ขึ้นเอง

กติกา
- "tl" = วินาทีบนไทม์ไลน์ของหนัง (0 = ต้นเรื่อง) ดูจากตารางข้างล่าง
- "dur" = ให้เล่นยาวกี่วินาที · ใส่ 0 = เล่นยาวไปจนจบหนัง
- เพลงจะถูกตั้งให้หลบเสียงพูดอัตโนมัติอยู่แล้ว ไม่ต้องห่วงว่าจะกลบคำพูด
- วางไม่เกิน 4 ช่วง — เปลี่ยนเพลงบ่อยกว่านั้นหนังจะกระจัดกระจาย
- ถ้าคลังไม่มีเพลงที่เข้ากับเรื่องนี้เลย ตอบ ops เป็น [] ได้

ไทม์ไลน์
{tl_table(edl)}
"""
    return (_head(edl, context, "คุณกำลังเลือกเพลงประกอบให้หนังเรื่องนี้")
            + body + "\nschema ที่ต้องตอบ\n" + MEDIA_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


def _catalog_table(items, cols):
    rows = [" | ".join(cols)]
    for it in items:
        rows.append(" | ".join(str(it.get(k, "")) for k in cols))
    return "\n".join(rows)


def prompt_sfx(ctx, edl, items, context, out_name):
    body = f"""
งานของคุณ: วางเสียงเอฟเฟกต์ลงบนหนังตรงจุดที่ควรมี

เสียงที่มีให้เลือก (ตอบด้วยคอลัมน์ file เท่านั้น · loop=1 คือเสียงบรรยากาศที่วนซ้ำได้)
{_catalog_table(items, ["file", "label", "cat", "dur", "loop"])}

กติกา
- "tl" = วินาทีบนไทม์ไลน์ที่จะให้เสียงดัง (ดูจากตารางข้างล่าง)
- เสียงเปลี่ยนฉาก/อิมแพกต์ วางตรง "รอยต่อ" ระหว่างช็อต ไม่ใช่กลางประโยค
- เสียงบรรยากาศ (loop=1) วางคลุมช่วงยาว ๆ ที่เป็นภาพวิวของที่นั้น ใส่ dur ยาวได้
- อย่าวางทับคำพูดสำคัญ และอย่าวางถี่กว่า 1 เสียงต่อ 5 วินาที
- เสนอไม่เกิน {int(ctx.get('review.max_ops', 40))} จุด · ไม่มีจุดไหนเหมาะเลยตอบ [] ได้

ไทม์ไลน์
{tl_table(edl)}
"""
    return (_head(edl, context, "คุณกำลังลงเสียงเอฟเฟกต์ให้หนังเรื่องนี้")
            + body + "\nschema ที่ต้องตอบ\n" + MEDIA_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


def prompt_sticker(ctx, edl, items, context, out_name):
    body = f"""
งานของคุณ: วางสติกเกอร์ / ภาพซ้อน ลงบนหนัง

สติกเกอร์ที่มีให้เลือก (ตอบด้วยคอลัมน์ file เท่านั้น)
{_catalog_table(items, ["file", "label", "cat"])}

กติกา
- "tl" = วินาทีบนไทม์ไลน์ที่จะให้ภาพโผล่ · "dur" = ค้างกี่วินาที (1–6 กำลังดี)
- ตำแหน่งบนจอไม่ต้องบอก — สติกเกอร์แต่ละแบบมีตำแหน่งที่เหมาะของตัวเองอยู่แล้ว
- วางให้ *ตรงกับสิ่งที่เกิดในภาพหรือคำพูด* เท่านั้น เช่นป้ายชื่อสถานที่ตอนถึงที่นั้น
  ลูกศรตอนกำลังชี้ของ รีแอ็กชันตอนมีมุก — ไม่ใช่โปรยไว้ให้ครบทั้งเรื่อง
- ห้ามวางทับช่วงที่มีข้อความอื่นอยู่แล้ว และอย่าวางถี่กว่า 1 ชิ้นต่อ 8 วินาที
- เสนอไม่เกิน {int(ctx.get('review.max_ops', 40))} ชิ้น · ไม่มีจุดไหนเหมาะเลยตอบ [] ได้

ไทม์ไลน์
{tl_table(edl)}
"""
    return (_head(edl, context, "คุณกำลังแต่งหนังด้วยสติกเกอร์และภาพซ้อน")
            + body + "\nschema ที่ต้องตอบ\n" + MEDIA_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


TEXT_SCHEMA = """{
  "ops": [{"text": "วันแรกที่ภูสอยดาว", "tl": 0.5, "dur": 2.5, "why": "เปิดเรื่อง"}]
}"""


def prompt_text(ctx, edl, context, out_name):
    body = f"""
งานของคุณ: เขียนข้อความสั้น ๆ ขึ้นจอ

กติกา
- "text" ภาษาไทย ไม่เกิน 40 ตัวอักษร บรรทัดเดียว — เป็นป้ายบนจอ ไม่ใช่ซับ
- "tl" = วินาทีบนไทม์ไลน์ที่ข้อความจะโผล่ · "dur" = ค้างกี่วินาที (2–4 กำลังดี)
- **ห้ามเขียนซ้ำสิ่งที่คนในคลิปพูดอยู่แล้ว** — ซับจากบทพูดมีระบบแยกทำอยู่ต่างหาก
- สิ่งที่ควรเขียนคือของที่เสียงไม่ได้บอก: ชื่อสถานที่ · วัน/เวลา · ระยะทาง ·
  หัวข้อของช่วงนั้น · ตัวเลขที่คนพูดถึงแบบผ่าน ๆ
- ข้อความเปิดเรื่อง 1 อัน และปิดเรื่อง 1 อัน มักคุ้มเสมอ
- เสนอไม่เกิน {int(ctx.get('review.max_ops', 40))} ชิ้น · ห่างกันอย่างน้อย 8 วินาที

ไทม์ไลน์ (คอลัมน์เนื้อหาคือสิ่งที่คนในคลิปพูด — อย่าเขียนซ้ำ)
{tl_table(edl, 140)}
"""
    return (_head(edl, context, "คุณกำลังเขียนข้อความบนจอให้หนังเรื่องนี้")
            + body + "\nschema ที่ต้องตอบ\n" + TEXT_SCHEMA
            + RULE_TAIL.format(out_name=out_name))


# ─────────────────────────── ตรวจคำตอบ ───────────────────────────

def _num(v, lo, hi, default=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, x))


def v_cut(data, timeline):
    """ทิ้งทุกข้อเสนอที่อ้างตำแหน่งผิดหรือชื่อคลิปไม่ตรง — เงียบ ๆ ไม่ให้ล้ม"""
    n = len(timeline)
    ops, warns = [], []
    for raw in (data.get("ops") or []):
        op = str((raw or {}).get("op", "")).lower()
        if op not in ("drop", "move"):
            warns.append(f"ไม่รู้จักคำสั่ง '{op}'")
            continue
        try:
            at = int(raw["at"]) - 1
        except (KeyError, TypeError, ValueError):
            warns.append(f"ไม่มีเลขลำดับ: {raw}")
            continue
        if not 0 <= at < n:
            warns.append(f"ลำดับ {at + 1} อยู่นอกช่วง 1–{n}")
            continue
        name = str(raw.get("name") or "")
        if name and name != timeline[at]["name"]:
            warns.append(f"ลำดับ {at + 1} ควรเป็น {timeline[at]['name']} "
                         f"แต่ AI อ้างว่า {name} — ทิ้งข้อนี้")
            continue
        ent = {"op": op, "at": at, "name": timeline[at]["name"],
               "kind": timeline[at]["kind"], "dur": timeline[at]["dur"],
               "why": str(raw.get("why") or "")[:160]}
        if op == "move":
            try:
                to = int(raw["to"]) - 1
            except (KeyError, TypeError, ValueError):
                warns.append(f"move ลำดับ {at + 1} ไม่มีปลายทาง")
                continue
            if not 0 <= to < n or to == at:
                warns.append(f"move ลำดับ {at + 1} → {to + 1} ใช้ไม่ได้")
                continue
            ent["to"] = to
        ops.append(ent)

    # ห้ามสั่งซ้ำช็อตเดิม — เอาข้อแรกที่เจอ
    seen, out = set(), []
    for o in ops:
        if o["at"] in seen:
            warns.append(f"สั่งซ้ำที่ลำดับ {o['at'] + 1} — เก็บข้อแรกไว้")
            continue
        seen.add(o["at"])
        out.append(o)
    return out, warns


def v_trim(data, cands):
    """AI ตอบได้แค่ id ของตัวเลือก — ตัวเลขวินาทีมาจากที่เราคำนวณไว้เท่านั้น"""
    by_id = {x["id"]: x for x in cands}
    ops, warns, seen = [], [], set()
    for raw in (data.get("ops") or []):
        try:
            i = int((raw or {}).get("id"))
        except (TypeError, ValueError):
            warns.append(f"ไม่มี id: {raw}")
            continue
        cand = by_id.get(i)
        if cand is None:
            warns.append(f"id {i} ไม่มีในตารางตัวเลือก — ทิ้ง")
            continue
        if cand["at"] in seen:
            warns.append(f"ช็อต {cand['at'] + 1} ถูกสั่งตัดสองรอบ — เก็บข้อแรก")
            continue
        seen.add(cand["at"])
        ops.append({"op": "trim", "at": cand["at"], "name": cand["name"],
                    "side": cand["side"], "cut": cand["cut"],
                    "start": cand["start"], "dur": cand["dur"],
                    "was": cand["was"],
                    "why": str((raw or {}).get("why") or "")[:160]})
    return ops, warns


def v_media(data, op_name, allowed, total, dur_of=None,
            dur_range=(0.3, 90.0), gap=0.0):
    """ตรวจงานที่ "วางของลงบนเส้นเวลา" — ไฟล์ต้องมีจริง เวลาต้องอยู่ในหนัง"""
    ops, warns = [], []
    for raw in (data.get("ops") or []):
        raw = raw or {}
        f = str(raw.get("file") or "").strip()
        if f not in allowed:
            warns.append(f"ไม่มีไฟล์ '{f[:40]}' ในรายการที่ให้เลือก — ทิ้ง")
            continue
        tl = _num(raw.get("tl"), 0.0, max(total - 0.2, 0.0))
        if tl is None:
            warns.append(f"{f} ไม่มีเวลาที่ชัดเจน — ทิ้ง")
            continue
        dur = _num(raw.get("dur"), *dur_range, default=None)
        if dur_of is not None:
            dur = dur_of(f, dur)
        ent = {"op": op_name, "file": f, "tl": round(tl, 2),
               "dur": round(dur, 2) if dur else 0.0,
               "why": str(raw.get("why") or "")[:160]}
        if isinstance(allowed, dict):
            ent["label"] = str(allowed[f].get("label") or f)
            if allowed[f].get("loop"):
                ent["loop"] = True
        ops.append(ent)

    ops.sort(key=lambda o: o["tl"])
    if gap:                                   # กันวางถี่จนรก
        out, last = [], -1e9
        for o in ops:
            if o["tl"] - last < gap:
                warns.append(f"{o['file']} ที่ {o['tl']:.1f} วิ ชิดของก่อนหน้าเกินไป — ทิ้ง")
                continue
            last = o["tl"]
            out.append(o)
        ops = out
    return ops, warns


def v_text(data, total, gap=6.0):
    ops, warns = [], []
    for raw in (data.get("ops") or []):
        raw = raw or {}
        txt = " ".join(str(raw.get("text") or "").split())[:60]
        if not txt:
            warns.append("ข้อความว่าง — ทิ้ง")
            continue
        tl = _num(raw.get("tl"), 0.0, max(total - 0.2, 0.0))
        if tl is None:
            warns.append(f"'{txt[:20]}' ไม่มีเวลาที่ชัดเจน — ทิ้ง")
            continue
        ops.append({"op": "text", "text": txt, "tl": round(tl, 2),
                    "dur": round(_num(raw.get("dur"), 0.6, 10.0, 2.5), 2),
                    "why": str(raw.get("why") or "")[:160]})
    ops.sort(key=lambda o: o["tl"])
    out, last = [], -1e9
    for o in ops:
        if o["tl"] - last < gap:
            warns.append(f"'{o['text'][:20]}' ชิดข้อความก่อนหน้าเกินไป — ทิ้ง")
            continue
        last = o["tl"]
        out.append(o)
    return out, warns


# ─────────────────────────── รันทีละงาน ───────────────────────────

def _catalog(catalog, key):
    """แคตตาล็อกจากหน้าเว็บ — คีย์เป็นชื่อไฟล์ เพื่อให้ validate เช็คได้ตรง ๆ"""
    items = [x for x in ((catalog or {}).get(key) or []) if isinstance(x, dict)]
    out = {}
    for x in items:
        f = str(x.get("file") or "").strip()
        if f:
            out[f] = x
    return out


def run_task(ctx, task, edl, rman, context, catalog, ai_dir, max_ops):
    """คืน (ops, meta, note) — note ไม่ว่างแปลว่างานนี้ทำไม่ได้ในรอบนี้"""
    tl = edl["timeline"]
    total = float(edl["summary"]["duration_total"])
    out_path = ai_dir / f"review-{task}.json"
    out_name = f"ai/review-{task}.json"

    if task == "cut":
        prompt = prompt_cut(ctx, edl, rman, context, out_name)
    elif task == "trim":
        quiet = (read_json(ctx.work / "silence.json", {}) or {}).get("clips", {})
        if not quiet:
            return [], {}, "ยังไม่มี silence.json — สั่ง 'หาช่วงเงียบ' (ขั้น 2) ก่อน"
        cands = trim_candidates(ctx, edl, quiet)
        if not cands:
            known = sum(1 for s in tl if s["name"] in quiet)
            if not known:
                return [], {}, ("ยังไม่ได้วัดช่วงเงียบของคลิปที่อยู่ในหนังชุดนี้ — "
                                "สั่ง 'หาช่วงเงียบ' ใหม่ก่อน")
            return [], {}, "ไม่มีช่วงเงียบหัว-ท้ายที่ยาวพอจะตัด — หนังกระชับอยู่แล้ว"
        prompt = prompt_trim(ctx, edl, cands, context, out_name)
    elif task == "music":
        from . import music as musicmod
        tracks = musicmod.summary(ctx).get("tracks") or []
        # ลูปตัวอย่างอยู่ใน public/ ของหน้าเว็บ เอนจินมองไม่เห็น — มาทางแคตตาล็อก
        # เหมือน sfx/sticker (ดู _catalog) สั่งจากเทอร์มินัลก็ยังเลือกจากคลังได้
        samples = _catalog(catalog, "bgm")
        if not tracks and not samples:
            return [], {}, "คลังยังไม่มีไฟล์เพลง — ดึงจาก YouTube หรืออัปโหลดก่อน"
        prompt = prompt_music(ctx, edl, tracks, list(samples.values()),
                              context, out_name)
    elif task in WEB_TASKS:
        items = _catalog(catalog, task)
        if not items:
            return [], {}, ("รายการตัวอย่างอยู่ฝั่งหน้าเว็บ — สั่งงานนี้จากแท็บ AI "
                            "ในหน้าเว็บ (เทอร์มินัลสั่งไม่ได้)")
        builder = prompt_sfx if task == "sfx" else prompt_sticker
        prompt = builder(ctx, edl, list(items.values()), context, out_name)
    elif task == "text":
        prompt = prompt_text(ctx, edl, context, out_name)
    else:
        return [], {}, f"ไม่รู้จักงาน '{task}'"

    (ai_dir / f"review-{task}.prompt.md").write_text(prompt, encoding="utf-8")
    info(f"  {c('→', 'b')} {TASK_LABEL[task]} ({len(prompt) // 1000} KB) …")
    data, meta = ask(ctx, prompt, out_path, section="review")

    if task == "cut":
        ops, warns = v_cut(data, tl)
        meta["summary"] = str(data.get("summary") or "")[:1200]
    elif task == "trim":
        ops, warns = v_trim(data, cands)
    elif task == "music":
        ops, warns = v_media(data, "music", set(tracks) | set(samples), total,
                             dur_range=(0.0, max(total, 1.0)))
    elif task == "sfx":
        # ความยาวของเสียงมาจากไฟล์จริง ไม่ใช่จากที่ AI เดา — ยกเว้นเสียงบรรยากาศ
        # ที่วนซ้ำได้ ตัวนั้นให้ยืดตามที่ขอได้ (แต่ไม่เกินความยาวหนัง)
        def dur_of(f, want):
            it = items[f]
            base = float(it.get("dur") or 1.0)
            return max(base, min(want or base, total)) if it.get("loop") else base
        ops, warns = v_media(data, "sfx", items, total, dur_of=dur_of, gap=4.0)
    elif task == "sticker":
        ops, warns = v_media(data, "sticker", items, total,
                             dur_range=(0.8, 8.0),
                             dur_of=lambda f, want: want or 2.5, gap=6.0)
    else:
        ops, warns = v_text(data, total)

    for w in warns[:5]:
        warn(f"    {w}")
    if len(warns) > 5:
        warn(f"    … อีก {len(warns) - 5} รายการ")
    meta["warnings"] = len(warns)
    return ops[:max_ops], meta, ""


# ─────────────────────────── main ───────────────────────────

def run(ctx, context="", force=False, tasks=None, catalog=None):
    edl = read_json(ctx.edl)
    if not edl or not edl.get("timeline"):
        die("ยังไม่มี edl.json — รัน `vcut decide` ก่อน")
    tl = edl["timeline"]
    context = context or str(ctx.get("review.context", "") or "")
    tasks = clean_tasks(tasks or ctx.get("review.tasks") or ["cut"])
    # รายการเสียง/สติกเกอร์ตัวอย่างอยู่ฝั่งหน้าเว็บ — หน้าเว็บวางไฟล์นี้ไว้ให้ก่อน
    # สั่งงาน เพราะงานถูกรันเป็นโปรเซสลูก ส่งผ่าน argv ไม่ไหว (ยาวเป็นหมื่นตัวอักษร)
    if catalog is None:
        catalog = read_json(ctx.work / "ai" / "catalog.json", {}) or {}
    fp = fingerprint(tl)
    max_ops = int(ctx.get("review.max_ops", 40))

    old = read_json(ctx.work / "review.json", {}) or {}
    same = old.get("fingerprint") == fp and old.get("context", "") == context
    done = dict(old.get("tasks") or {}) if (same and not force) else {}
    todo = [t for t in tasks if t not in done]
    if not todo:
        info(f"REVIEW  {c('ใช้ผลเดิม', 'd')} — EDL กับโจทย์ไม่เปลี่ยนจากรอบก่อน")
        store = _store(edl, fp, context, tasks, done, old)
        report(store)
        return store

    rman = read_json(ctx.work / "render.json", {}) or {}
    ai_dir = ctx.work / "ai"
    ai_dir.mkdir(parents=True, exist_ok=True)

    info(f"REVIEW  {len(tl)} ช็อต · {edl['summary']['duration_total'] / 60:.1f} นาที"
         f"  ·  {provider_of(ctx, 'review')}"
         + (f"  ·  โจทย์: {context[:50]}" if context else ""))
    for task in todo:
        ops, meta, note = run_task(ctx, task, edl, rman, context, catalog,
                                   ai_dir, max_ops)
        if note:
            warn(f"  ข้าม {TASK_LABEL[task]} — {note}")
        done[task] = {"ops": ops, "note": note,
                      **{k: meta.get(k) for k in
                         ("seconds", "cost_usd", "provider", "model",
                          "warnings", "summary") if meta.get(k) is not None}}

    store = _store(edl, fp, context, tasks, done, old)
    write_json(ctx.work / "review.json", store)
    report(store)
    return store


def _store(edl, fp, context, tasks, done, old):
    """แผ่ ops ของทุกงานเป็นรายการเดียวเรียงตาม TASKS แล้วแจก id ใหม่

    หน้าเว็บอ่าน ops รายการเดียวนี้ ไม่ต้องรู้ว่ามาจากงานไหน แต่ยังบอกได้ว่า
    ข้อไหนมาจากงานอะไรผ่านช่อง task (ใช้จัดกลุ่มและเลือกไอคอน)
    """
    ops = []
    for t in TASKS:
        for o in (done.get(t) or {}).get("ops") or []:
            ops.append({**o, "task": t, "id": len(ops)})
    summary = next((v.get("summary") for v in done.values() if v.get("summary")),
                   old.get("summary", ""))
    return {
        "version": 2, "fingerprint": fp, "context": context,
        "tasks_run": list(tasks),
        "tasks": done,
        "summary": summary,
        "ops": ops,
        "warnings": sum(int(v.get("warnings") or 0) for v in done.values()),
        "segments": len(edl["timeline"]),
        "duration": edl["summary"]["duration_total"],
        "seconds": round(sum(float(v.get("seconds") or 0)
                             for v in done.values()), 1),
        "cost_usd": sum(float(v.get("cost_usd") or 0) for v in done.values()) or None,
        "at": int(time.time()),
    }


def report(st):
    ops = st.get("ops", [])
    info("─" * 62)
    if st.get("summary"):
        for line in str(st["summary"]).splitlines():
            info(f"  {line}")
        info("─" * 62)
    for t in TASKS:
        info_t = (st.get("tasks") or {}).get(t)
        if not info_t:
            continue
        n = len(info_t.get("ops") or [])
        note = info_t.get("note") or ""
        line = f"  {TASK_LABEL[t]:<22} {n:>3} ข้อ"
        info(line + (f"   {c(note, 'd')}" if note else ""))
    cost, secs = st.get("cost_usd"), st.get("seconds")
    if cost:
        info(f"  {c(f'มูลค่าเทียบเท่า ${cost:.3f} · {secs} วินาที', 'd')}")
    info("─" * 62)
    for o in ops[:14]:
        if o["op"] in ("drop", "move"):
            where = f"→ {o['to'] + 1}" if o["op"] == "move" else "ออก"
            what = f"{o['at'] + 1:>4} {o['name']:<10} {where:<6}"
        elif o["op"] == "trim":
            what = (f"{o['at'] + 1:>4} {o['name']:<10} "
                    f"{'หัว' if o['side'] == 'head' else 'ท้าย'} -{o['cut']:.1f}s")
        elif o["op"] == "text":
            what = f"{o['tl']:>7.1f}s  {o['text'][:24]:<24}"
        else:
            what = f"{o['tl']:>7.1f}s  {o.get('label') or o.get('file', ''):<24}"
        info(f"  {what} {c(o['why'][:40], 'd')}")
    if len(ops) > 14:
        info(f"  {c(f'… อีก {len(ops) - 14} รายการ', 'd')}")
    info(f"  {c('→ .vcut/review.json  · กดรับทีละข้อได้ที่หน้าเว็บ', 'd')}")
