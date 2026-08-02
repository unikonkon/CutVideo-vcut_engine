"""REVIEW — ให้ AI ดู "หนังที่ตัดเสร็จแล้ว" แล้วติชม

นี่คือ AI บทบาทที่สอง คนละตัวกับ `vcut ai`:

    vcut ai      อยู่ก่อน decide   เห็นกองคลิปดิบ 273 อัน   → .vcut/ai.json
    vcut review  อยู่หลัง render   เห็นหนังจริงที่ตัดแล้ว   → .vcut/review.json

ตำแหน่งหลังได้เปรียบตรงที่เห็น *ลำดับจริงที่คนดูจะเจอ* — บทพูดเรียงตามที่จะได้ยิน
จริง ความยาวแต่ละช็อตจริง เสียงที่ปรับแล้วจริง จึงตอบเรื่อง "ตรงไหนยืดเยื้อ"
หรือ "ช็อตนี้พูดซ้ำกับช็อตที่ 12" ได้ ซึ่งตอนอยู่ก่อน decide ตอบไม่ได้เลย

แต่มันเสนอได้แค่ **เอาออก** กับ **สลับลำดับ** เท่านั้น — จงใจจำกัดไว้แค่นี้เพราะ
สองอย่างนี้คือสองอย่างที่ไม่ต้อง encode ใหม่ วงจร ถาม→รับ→ได้ไฟล์ใหม่ จึงจบใน
ราวหนึ่งนาที ทำซ้ำกี่รอบก็ได้ (ถ้าให้มันตัดหัวท้ายช็อตได้ด้วย ทุกรอบจะกลายเป็น
งาน render ยาว ๆ ซึ่งทำลายจังหวะการทำงานทั้งหมด)

AI ยังไม่เห็นภาพวิดีโอ — เห็นข้อความกับภาพนิ่งเหมือนเดิม
"""
import hashlib
import json
import time

from .ai import call_claude
from .util import c, die, info, read_json, warn, write_json

OPS = ("drop", "move")


def fingerprint(timeline):
    """ลายนิ้วมือของ EDL ตอนที่วิเคราะห์ — ไว้เตือนว่าข้อเสนอเก่าไปแล้ว"""
    blob = json.dumps([[s["name"], s["start"], s["dur"]] for s in timeline],
                      separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()[:16]


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


def chapter_table(edl):
    ch = edl.get("chapters") or []
    if not ch:
        return ""
    return "\n".join(f"  {i}. {x['title']} — {x['segments']} ชิ้น "
                     f"{x['duration'] / 60:.1f} นาที" for i, x in enumerate(ch, 1))


SCHEMA = """{
  "summary": "ภาพรวมของหนังเรื่องนี้ 2-4 ประโยค",
  "ops": [
    {"op": "drop", "at": 47, "name": "IMG_7412", "why": "พูดเรื่องเดียวกับช็อต 44"},
    {"op": "move", "at": 12, "name": "IMG_7099", "to": 31, "why": "ควรอยู่หลังตอนถึงยอด"}
  ]
}"""


def build_prompt(ctx, edl, rman, context, out_name):
    s = edl["summary"]
    n = len(edl["timeline"])
    head = [
        f"นี่คือหนังที่ตัดเสร็จแล้ว {n} ช็อต ยาว {s['duration_total'] / 60:.1f} นาที "
        f"({s['segments_talk']} ช็อตพูด + {s['segments_broll']} ช็อตวิว)",
        "",
        "คุณกำลังดูในฐานะคนดูคนแรก — บอกว่าตรงไหนควรตัดออก ตรงไหนควรสลับที่",
    ]
    if context:
        head += ["", "สิ่งที่เจ้าของงานอยากให้ดูเป็นพิเศษ:", context]

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
    rules = f"""
กติกาที่ห้ามฝ่าฝืน
- ตอบเป็น JSON ล้วนตาม schema ไม่ต้องมีคำอธิบายนอก JSON
- เขียนคำตอบลงไฟล์ {out_name} ด้วย Write tool (นี่คือช่องทางส่งคำตอบจริง)
- ห้ามแก้ไฟล์อื่นใดทั้งสิ้น
"""
    return "\n".join(head) + body + "\nschema ที่ต้องตอบ\n" + SCHEMA + rules


# ─────────────────────────── ตรวจคำตอบ ───────────────────────────

def validate(data, timeline):
    """ทิ้งทุกข้อเสนอที่อ้างตำแหน่งผิดหรือชื่อคลิปไม่ตรง — เงียบ ๆ ไม่ให้ล้ม"""
    n = len(timeline)
    ops, warns = [], []
    for raw in (data.get("ops") or []):
        op = str((raw or {}).get("op", "")).lower()
        if op not in OPS:
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
    for i, o in enumerate(out):
        o["id"] = i
    return out, warns


# ─────────────────────────── main ───────────────────────────

def run(ctx, context="", force=False):
    edl = read_json(ctx.edl)
    if not edl or not edl.get("timeline"):
        die("ยังไม่มี edl.json — รัน `vcut decide` ก่อน")
    tl = edl["timeline"]
    context = context or str(ctx.get("review.context", "") or "")
    fp = fingerprint(tl)

    old = read_json(ctx.work / "review.json", {}) or {}
    if (not force and old.get("fingerprint") == fp
            and old.get("context", "") == context):
        info(f"REVIEW  {c('ใช้ผลเดิม', 'd')} — EDL กับโจทย์ไม่เปลี่ยนจากรอบก่อน")
        report(old)
        return old

    rman = read_json(ctx.work / "render.json", {}) or {}
    ai_dir = ctx.work / "ai"
    ai_dir.mkdir(parents=True, exist_ok=True)
    out_path = ai_dir / "review.json"
    prompt = build_prompt(ctx, edl, rman, context, "ai/review.json")
    (ai_dir / "review.prompt.md").write_text(prompt, encoding="utf-8")

    info(f"REVIEW  {len(tl)} ช็อต · {edl['summary']['duration_total'] / 60:.1f} นาที"
         + (f"  ·  โจทย์: {context[:50]}" if context else ""))
    info(f"  {c('→', 'b')} ส่งให้ AI ดู ({len(prompt) // 1000} KB) …")

    data, meta = call_claude(ctx, prompt, out_path, section="review")
    ops, warns = validate(data, tl)
    for w in warns[:6]:
        warn(f"  {w}")
    if len(warns) > 6:
        warn(f"  … อีก {len(warns) - 6} รายการ")

    store = {
        "version": 1, "fingerprint": fp, "context": context,
        "summary": str(data.get("summary") or "")[:1200],
        "ops": ops, "warnings": len(warns),
        "segments": len(tl), "duration": edl["summary"]["duration_total"],
        "seconds": meta.get("seconds"), "cost_usd": meta.get("cost_usd"),
        "at": int(time.time()),
    }
    write_json(ctx.work / "review.json", store)
    report(store)
    return store


def report(st):
    ops = st.get("ops", [])
    info("─" * 62)
    if st.get("summary"):
        for line in str(st["summary"]).splitlines():
            info(f"  {line}")
        info("─" * 62)
    drops = [o for o in ops if o["op"] == "drop"]
    moves = [o for o in ops if o["op"] == "move"]
    info(f"  เสนอให้เอาออก      {len(drops):>3} ช็อต "
         f"({sum(o['dur'] for o in drops) / 60:.1f} นาที)")
    info(f"  เสนอให้สลับที่      {len(moves):>3} ช็อต")
    cost, secs = st.get("cost_usd"), st.get("seconds")
    if cost:
        line = f"มูลค่าเทียบเท่า ${cost:.3f} · {secs} วินาที"
        info(f"  {c(line, 'd')}")
    info("─" * 62)
    for o in ops[:12]:
        where = f"→ {o['to'] + 1}" if o["op"] == "move" else "ออก"
        info(f"  {o['at'] + 1:>4} {o['name']:<10} {where:<6} {c(o['why'][:44], 'd')}")
    if len(ops) > 12:
        info(f"  {c(f'… อีก {len(ops) - 12} รายการ', 'd')}")
    info(f"  {c('→ .vcut/review.json  · กดรับทีละข้อได้ที่หน้าเว็บ', 'd')}")
