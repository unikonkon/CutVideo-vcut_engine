"""AI — ชั้นที่ปรึกษา ไม่ใช่ชั้นที่ลงมือ

เอนจินยังคงคาดเดาได้ 100% เหมือนเดิม เพราะ AI เขียนได้แค่ไฟล์เดียวคือ
`.vcut/ai.json` ซึ่งเป็น "ความเห็น" ล้วน ๆ:

    chapters   แบ่งบทเล่าเรื่อง + ลำดับคลิปในแต่ละบท
    clips[].score   คะแนนความน่าเก็บ 0–1
    clips[].keep    ช่วงวินาทีที่ควรเก็บ
    clips[].drop    ควรทิ้งทั้งคลิป

จากนั้น `decide.py` เอาไปใช้ด้วยกฎที่เขียนตายตัวใน [ai.apply] — ตัว AI
ไม่เคยแตะ edl.json เอง ผลที่ได้จึงยัง reproduce ได้ และ:

  · รัน `vcut decide` ซ้ำกี่ครั้งก็ไม่เสียเงินเรียก AI ใหม่ (อ่านจาก ai.json)
  · commit ai.json เข้า git ได้ → คนอื่นได้ผลเดียวกันโดยไม่ต้องมี API key
  · ปิด [ai] enabled = false เมื่อไหร่ ก็กลับไปเป็น Phase 3 เป๊ะ ๆ

AI เห็นแค่ข้อความ + contact sheet — ไม่มีการส่งไฟล์วิดีโอออกไปไหน
"""
import json
import time

from .provider import ask
from .util import c, die, info, read_json, warn, write_json

TASKS = ("story_arc", "describe", "shot_scoring", "trim_suggest")

TASK_LABEL = {
    "story_arc": "แบ่งบทเล่าเรื่อง",
    "describe": "อ่านความหมายรายคลิป",
    "shot_scoring": "ให้คะแนนช็อต",
    "trim_suggest": "แนะนำช่วงที่ควรเก็บ",
}

# ส่งให้ AI เกินเท่านี้โดยไม่จำกัด = เสี่ยงชนเพดานจนไม่ได้คำตอบ
ASK_BIG = 150


# ─────────────────────────── รวบรวมสิ่งที่ AI จะได้เห็น ───────────────────────────

def clip_rows(ctx, man, tr):
    """สรุปคลิปละบรรทัด — คอลัมน์คงที่เพื่อให้ AI อ้างชื่อคลิปได้แม่น"""
    thr = float(ctx.get("classify.min_speech_total", 1.0))
    rows = []
    for cl in man["clips"]:
        segs = tr.get(cl["name"], [])
        speech = round(sum(b - a for a, b, _ in segs), 1)
        rows.append({
            "name": cl["name"],
            "num": cl["num"],
            "dur": round(cl["duration"], 1),
            "kind": "TALK" if (segs and speech >= thr) else "BROLL",
            "speech": speech,
            "motion": cl["motion"],
            "bright": cl["bright"],
            "orient": cl["orient"],
            "segs": segs,
        })
    return rows


def _table(rows):
    out = ["ชื่อ | ลำดับ | วินาที | ประเภท | พูดกี่วิ | motion | สว่าง | แนว"]
    for r in rows:
        out.append(f"{r['name']} | {r['num']} | {r['dur']} | {r['kind']} | "
                   f"{r['speech']} | {r['motion']} | {r['bright']} | {r['orient']}")
    return "\n".join(out)


def _speech_block(rows, limit):
    out = []
    for r in rows:
        if r["kind"] != "TALK":
            continue
        txt = " ".join(t for _a, _b, t in r["segs"]).strip()
        if txt:
            out.append(f"{r['name']}: {txt[:limit]}")
    return "\n".join(out)


def _timed_speech_block(rows, limit):
    out = []
    for r in rows:
        if r["kind"] != "TALK":
            continue
        lines = [f"{r['name']}  (คลิปยาว {r['dur']} วิ)"]
        used = 0
        for a, b, t in r["segs"]:
            t = t.strip()
            if not t:
                continue
            used += len(t)
            if used > limit:
                lines.append("  …")
                break
            lines.append(f"  {a:.1f}-{b:.1f}  {t}")
        if len(lines) > 1:
            out.append("\n".join(lines))
    return "\n\n".join(out)


def sheet_map(ctx, rows):
    """แผ่น contact sheet ไหนมีคลิปอะไร — thumbs.py เรียงตามลำดับใน manifest"""
    sheets = sorted((ctx.thumb_dir / "sheets").glob("sheet_*.jpg"))
    per = int(ctx.get("thumbs.sheet_cols", 5)) * int(ctx.get("thumbs.sheet_rows", 5))
    out = []
    for i, sh in enumerate(sheets):
        names = [r["name"] for r in rows[i * per:(i + 1) * per]]
        if names:
            out.append((sh.name, names))
    return out


def _sheet_block(smap, want):
    """ส่งเฉพาะแผ่นที่มีคลิปในก้อนนี้ — ก้อนละ 3–4 แผ่นแทนที่จะเป็น 11 แผ่นทุกครั้ง"""
    want = set(want)
    rel = [(n, names) for n, names in smap if want.intersection(names)]
    if not rel:
        return ""
    lines = [f"contact sheet ที่เกี่ยวกับก้อนนี้ {len(rel)} แผ่น "
             "(เรียงซ้ายไปขวา บนลงล่าง)",
             "อ่านภาพด้วย Read tool ทีละแผ่น แล้วเทียบกับรายชื่อนี้:"]
    for n, names in rel:
        lines.append(f"  {n}  →  {', '.join(names)}")
    return "\n".join(lines)


# ─────────────────────────── prompt ต่อ task ───────────────────────────

_RULES = """
กติกาที่ห้ามฝ่าฝืน
- ใช้ได้เฉพาะชื่อคลิปที่อยู่ในตารางเท่านั้น ห้ามแต่งชื่อใหม่ ห้ามเดา
- ตอบเป็น JSON ล้วน ตาม schema ที่ให้ ไม่ต้องมีคำอธิบายนอก JSON
- เขียนคำตอบลงไฟล์ %s ด้วย Write tool (นี่คือช่องทางส่งคำตอบจริง)
- ห้ามแก้ไฟล์อื่นใดทั้งสิ้น
"""

_SCHEMA = {
    "story_arc": """{
  "chapters": [
    {"id": "ch1", "title": "ชื่อบทภาษาไทยสั้น ๆ", "why": "เหตุผลหนึ่งบรรทัด",
     "clips": ["IMG_0001", "IMG_0002"]}
  ]
}""",
    "describe": """{
  "clips": {
    "IMG_0001": {"meaning": "ปีนดินแดงชัน มีคนช่วยดึงขึ้นไป",
                 "tags": ["ปีนเขา", "ช่วยเหลือกัน"]},
    "IMG_0002": {"meaning": "...", "tags": ["..."]}
  }
}""",
    "shot_scoring": """{
  "clips": {
    "IMG_0001": {"score": 0.85, "why": "เหตุผลสั้น ๆ"},
    "IMG_0002": {"score": 0.20, "why": "..."}
  }
}""",
    "trim_suggest": """{
  "clips": {
    "IMG_0001": {"keep": [[2.4, 11.8]], "why": "..."},
    "IMG_0002": {"drop": true, "why": "..."}
  }
}""",
}


def build_prompt(task, ctx, rows, goal, out_name, smap=(), total=None, part=None):
    limit = int(ctx.get("ai.transcript_chars", 600))
    sheet_txt = _sheet_block(smap, [r["name"] for r in rows]) \
        if ctx.get("ai.sheets", True) else ""
    n_talk = sum(1 for r in rows if r["kind"] == "TALK")
    head = [f"คุณกำลังช่วยตัดต่อวิดีโอจากฟุตเทจดิบ {total or len(rows)} คลิป "
            f"({n_talk} คลิปในก้อนนี้มีคนพูด)"]
    if part:
        head.append(f"\nนี่คือก้อนที่ {part} — ตอบเฉพาะ {len(rows)} คลิปที่อยู่ในก้อนนี้เท่านั้น")
    if goal:
        head.append(f"\nสิ่งที่เจ้าของงานสั่ง: {goal}")

    if task == "story_arc":
        body = f"""
งานของคุณ: แบ่งฟุตเทจทั้งหมดเป็น "บท" ตามลำดับการเล่าเรื่อง

- อ่านคำพูดเพื่อจับว่าเรื่องดำเนินไปถึงไหน (ออกเดินทาง / ระหว่างทาง / ถึงจุดหมาย / ขากลับ ฯลฯ)
- ดู contact sheet เพื่อดูว่าภาพเปลี่ยนฉากตรงไหน
- ปกติชื่อไฟล์เรียงตามเวลาถ่ายจริงอยู่แล้ว ให้ยึดลำดับนั้นเป็นหลัก
  สลับได้เฉพาะเมื่อมีเหตุผลชัดจากเนื้อหา
- ทุกคลิปในตารางต้องอยู่ในบทใดบทหนึ่ง ห้ามตกหล่น ห้ามซ้ำสองบท
- ตั้งเป้า 6–12 บท

ตาราง
{_table(rows)}

คำพูดในแต่ละคลิป
{_speech_block(rows, limit)}
"""
    elif task == "describe":
        body = f"""
งานของคุณ: เขียน "ความหมาย" ของทุกคลิปในตาราง คลิปละหนึ่งบรรทัด

ความหมายคือ *เกิดอะไรขึ้นในคลิปนี้* ไม่ใช่คำบรรยายภาพ
  ดี   "ปีนดินแดงชัน มีคนช่วยดึงขึ้นไป"
  ไม่ดี "ภาพคนในป่า"

คลิปพูด — สรุปจากสิ่งที่พูด ว่ากำลังเล่าอะไรหรือทำอะไรอยู่
คลิปวิว — ดูจาก contact sheet ว่าเห็นอะไร อยู่ช่วงไหนของการเดินทาง

- ต้องเขียนครบทุกคลิปในตาราง
- meaning ไม่เกิน 15 คำ ภาษาไทย
- tags 1–3 คำ สำหรับจัดกลุ่มคลิปที่เล่าเรื่องเดียวกัน ใช้คำซ้ำข้ามคลิปได้เลย
- ถ้าดูไม่ออกจริง ๆ ให้เขียนว่า "ไม่ชัด" อย่าเดา

ตาราง
{_table(rows)}

คำพูดในแต่ละคลิป
{_speech_block(rows, limit)}
"""
    elif task == "shot_scoring":
        body = f"""
งานของคุณ: ให้คะแนน 0.00–1.00 ทุกคลิปในตาราง ว่าควรได้อยู่ในหนังตัดจบแค่ไหน

คลิปพูด — ดูจากเนื้อหา: เล่าอะไรใหม่ไหม ฟังรู้เรื่องไหม พูดวนซ้ำหรือเปล่า
คลิปวิว — ดูจาก contact sheet: ภาพสวยไหม เล่าสถานที่ได้ไหม ซ้ำกับใบอื่นไหม
          ค่า motion สูงแปลว่าภาพสั่น/แพนเร็ว · bright ต่ำแปลว่ามืด

- ต้องให้คะแนนครบทุกคลิป
- กระจายคะแนนให้จริง อย่าให้ 0.7 ทั้งหมด — ควรมีทั้งช่วง 0.1 และ 0.9
- "why" ไม่เกิน 12 คำ

ตาราง
{_table(rows)}

คำพูดในแต่ละคลิป
{_speech_block(rows, limit)}
"""
    else:  # trim_suggest
        body = f"""
งานของคุณ: ดูคำพูดพร้อมเวลา แล้วบอกว่าคลิปพูดแต่ละอันควรเก็บช่วงวินาทีไหน

- keep คือช่วง [เริ่ม, จบ] เป็นวินาทีนับจากต้นคลิป ใส่ได้หลายช่วง
- ตัดหัวท้ายที่เป็นการเกริ่น เสียงลม พูดคำเดิมซ้ำ หรือพูดค้างไม่จบ ออก
- ห้ามเกินความยาวคลิป และเริ่มต้องน้อยกว่าจบเสมอ
- คลิปที่ฟังไม่รู้เรื่องทั้งอัน ให้ใส่ "drop": true แทน keep
- คลิปที่ดีอยู่แล้วทั้งอัน ไม่ต้องใส่ในคำตอบ (ไม่ใส่ = เก็บทั้งคลิปตามกฎเดิม)
- ตอบเฉพาะคลิป TALK เท่านั้น

คำพูดพร้อมเวลา
{_timed_speech_block(rows, limit * 3)}
"""

    parts = ["\n".join(head), body]
    if sheet_txt:
        parts.append("\nภาพประกอบ\n" + sheet_txt)
    parts.append("\nschema ที่ต้องตอบ\n" + _SCHEMA[task])
    parts.append(_RULES % out_name)
    return "\n".join(parts)


# ─────────────────────────── ตรวจ + รวมคำตอบ ───────────────────────────

def _clamp(x, lo, hi, default=None):
    try:
        return max(lo, min(hi, float(x)))
    except (TypeError, ValueError):
        return default


def _chunk(rows, n):
    return [rows[i:i + n] for i in range(0, len(rows), max(1, n))] or [rows]


def _merge_ranges(rs):
    rs = sorted(rs)
    out = []
    for a, b in rs:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def validate(task, data, rows):
    """ตัดทุกอย่างที่อ้างคลิปไม่มีจริง / ค่าเกินขอบเขต ทิ้งเงียบ ๆ ไม่ให้ล้ม decide"""
    known = {r["name"]: r for r in rows}
    warns = []
    clips, chapters = {}, []

    if task == "story_arc":
        seen = set()
        for i, ch in enumerate(data.get("chapters") or []):
            names = []
            for n in ch.get("clips") or []:
                if n not in known:
                    warns.append(f"บทอ้างคลิปที่ไม่มีจริง: {n}")
                elif n in seen:
                    warns.append(f"คลิปซ้ำสองบท เก็บบทแรกไว้: {n}")
                else:
                    seen.add(n)
                    names.append(n)
            if not names:
                continue
            cid = str(ch.get("id") or f"ch{i + 1}")
            chapters.append({"id": cid, "title": str(ch.get("title") or cid),
                             "why": str(ch.get("why") or "")[:200], "clips": names})
            for n in names:
                clips.setdefault(n, {})["chapter"] = cid
        missing = [r["name"] for r in rows if r["name"] not in seen]
        if missing:
            warns.append(f"AI ไม่ได้จัดบทให้ {len(missing)} คลิป — ต่อท้ายตามลำดับไฟล์")

    elif task == "describe":
        for n, v in (data.get("clips") or {}).items():
            if n not in known:
                warns.append(f"อธิบายคลิปที่ไม่มีจริง: {n}")
                continue
            if isinstance(v, str):
                v = {"meaning": v}
            m = str((v or {}).get("meaning") or "").strip()[:160]
            if not m:
                continue
            tags = [str(t).strip()[:24] for t in ((v or {}).get("tags") or [])
                    if str(t).strip()][:4]
            clips.setdefault(n, {}).update({"meaning": m, "tags": tags})
        if len(clips) < len(rows):
            warns.append(f"อธิบายมา {len(clips)}/{len(rows)} คลิป")

    elif task == "shot_scoring":
        for n, v in (data.get("clips") or {}).items():
            if n not in known:
                warns.append(f"ให้คะแนนคลิปที่ไม่มีจริง: {n}")
                continue
            if isinstance(v, (int, float)):
                v = {"score": v}
            s = _clamp((v or {}).get("score"), 0.0, 1.0)
            if s is None:
                continue
            clips.setdefault(n, {}).update(
                {"score": round(s, 3), "score_why": str((v or {}).get("why") or "")[:120]})
        got = sum(1 for v in clips.values() if "score" in v)
        if got < len(rows):
            warns.append(f"ให้คะแนนมา {got}/{len(rows)} คลิป — ที่เหลือใช้คะแนนจากกฎเดิม")

    else:  # trim_suggest
        for n, v in (data.get("clips") or {}).items():
            if n not in known:
                warns.append(f"แนะนำช่วงของคลิปที่ไม่มีจริง: {n}")
                continue
            dur = known[n]["dur"]
            ent = clips.setdefault(n, {})
            if (v or {}).get("drop"):
                ent["drop"] = True
                ent["trim_why"] = str((v or {}).get("why") or "")[:120]
                continue
            keep = []
            for pair in (v or {}).get("keep") or []:
                if not (isinstance(pair, (list, tuple)) and len(pair) == 2):
                    continue
                a = _clamp(pair[0], 0.0, dur)
                b = _clamp(pair[1], 0.0, dur)
                if a is None or b is None or b - a < 0.3:
                    warns.append(f"ช่วงที่ใช้ไม่ได้ของ {n}: {pair}")
                    continue
                keep.append([round(a, 2), round(b, 2)])
            if keep:
                ent["keep"] = _merge_ranges(keep)
                ent["trim_why"] = str((v or {}).get("why") or "")[:120]
            elif not ent:
                clips.pop(n, None)

    return {"clips": clips, "chapters": chapters}, warns


# แต่ละ task เป็นเจ้าของฟิลด์ของตัวเอง — รัน task เดิมซ้ำต้องล้างของเก่าทิ้งก่อน
# ไม่งั้นคำตอบรอบก่อน (เช่น drop = true) จะค้างอยู่ทั้งที่รอบใหม่ไม่ได้บอกแบบนั้น
OWNS = {
    "story_arc": ("chapter",),
    "describe": ("meaning", "tags"),
    "shot_scoring": ("score", "score_why"),
    "trim_suggest": ("keep", "drop", "trim_why"),
}


def _merge_into(store, task, part):
    for v in store["clips"].values():
        for f in OWNS[task]:
            v.pop(f, None)
    for n, v in part["clips"].items():
        store["clips"].setdefault(n, {}).update(v)
    store["clips"] = {n: v for n, v in store["clips"].items() if v}
    if task == "story_arc":
        store["chapters"] = part["chapters"]


# ─────────────────────────── main ───────────────────────────

def run(ctx, tasks=None, goal="", force=False):
    goal = goal or str(ctx.get("ai.goal", "") or "")
    # ถามได้ แต่ต้องบอกให้รู้ว่าคำตอบจะไม่ถูกใช้ — ไม่งั้นจ่ายโควตาแล้วไม่ได้อะไร
    if not (ctx.get("ai.enabled", False) or ctx.get("ai.apply.enabled", False)):
        warn("สวิตช์ AI ปิดอยู่ทั้งขั้น 2 และขั้น 3 — คำตอบจะถูกเก็บใน ai.json "
             "แต่ยังไม่มีขั้นไหนเอาไปใช้จนกว่าจะเปิดสวิตช์สักตัว")
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — รัน `vcut scan` ก่อน")
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})
    if not tr:
        warn("ยังไม่มี transcript — AI จะเห็นแต่ภาพกับตัวเลข ไม่เห็นคำพูด "
             "(รัน `vcut listen` ก่อนจะได้ผลดีกว่ามาก)")
    rows = clip_rows(ctx, man, tr)

    tasks = [t for t in (tasks or ctx.get("ai.tasks", list(TASKS))) if t]
    bad = [t for t in tasks if t not in TASKS]
    if bad:
        die(f"ไม่รู้จัก task: {', '.join(bad)}  (มีให้เลือก: {', '.join(TASKS)})")

    smap = sheet_map(ctx, rows)
    batch = int(ctx.get("ai.batch_clips", 80)) or len(rows)
    ai_dir = ctx.work / "ai"
    ai_dir.mkdir(parents=True, exist_ok=True)
    if ctx.get("ai.sheets", True) and not list((ctx.thumb_dir / "sheets").glob("*.jpg")):
        warn("ยังไม่มี contact sheet — รัน `vcut thumbs` ก่อน ไม่งั้น AI จะไม่เห็นภาพเลย")

    store = {"version": 1, "goal": goal, "clips": {}, "chapters": [], "tasks": {}}
    old = read_json(ctx.work / "ai.json", {}) or {}
    if not force and old.get("version") == 1:
        store["tasks"] = old.get("tasks", {})
        store["clips"] = old.get("clips", {})
        store["chapters"] = old.get("chapters", [])
        store["goal"] = goal or old.get("goal", "")

    info(f"AI  {len(tasks)} งาน  ·  โมเดล {ctx.get('ai.model', 'default')}"
         + (f"  ·  โจทย์: {goal}" if goal else ""))

    for task in tasks:
        cached = store["tasks"].get(task)
        if cached and not force and cached.get("goal", "") == goal:
            info(f"  {c('·', 'd')} {TASK_LABEL[task]:<20} {c('ใช้ผลเดิมจาก ai.json', 'd')}")
            continue

        # story_arc ต้องเห็นทั้งเรื่องพร้อมกันถึงจะแบ่งบทได้ ห้ามซอย
        # อีกสองงานตอบทีละคลิปอยู่แล้ว ซอยได้ และควรซอย — คำตอบยาว 273 บรรทัด
        # ในครั้งเดียวทั้งช้าและหลุดง่าย
        chunks = [rows] if task == "story_arc" else _chunk(rows, batch)
        agg = {"clips": {}, "chapters": []}
        secs, cost, nwarn = 0.0, 0.0, 0
        info(f"  {c('→', 'b')} {TASK_LABEL[task]:<20} "
             + (f"{len(chunks)} ก้อน × ~{batch} คลิป" if len(chunks) > 1 else "ทีเดียวทั้งชุด"))

        for n, chunk in enumerate(chunks, 1):
            tag = task if len(chunks) == 1 else f"{task}_{n:02d}"
            out_path = ai_dir / f"{tag}.json"
            prompt = build_prompt(task, ctx, chunk, goal, f"ai/{tag}.json", smap,
                                  total=len(rows),
                                  part=f"{n}/{len(chunks)}" if len(chunks) > 1 else None)
            (ai_dir / f"{tag}.prompt.md").write_text(prompt, encoding="utf-8")
            info(f"    {c('·', 'd')} ก้อน {n}/{len(chunks)} ({len(prompt) // 1000} KB) …")

            data, meta = ask(ctx, prompt, out_path)
            part, warns = validate(task, data, chunk)
            for w in warns[:4]:
                warn(f"  {tag}: {w}")
            if len(warns) > 4:
                warn(f"  {tag}: … อีก {len(warns) - 4} รายการ")
            agg["clips"].update(part["clips"])
            agg["chapters"] += part["chapters"]
            secs += meta.get("seconds") or 0
            cost += meta.get("cost_usd") or 0
            nwarn += len(warns)

        _merge_into(store, task, agg)
        store["tasks"][task] = {
            "goal": goal, "seconds": round(secs, 1), "cost_usd": round(cost, 4),
            "warnings": nwarn, "batches": len(chunks),
            "chapters": len(agg["chapters"]), "clips": len(agg["clips"]),
        }
        # เขียนทุกครั้งที่จบ task — ถ้า task ถัดไปพัง จะได้ไม่เสียเงินที่จ่ายไปแล้วฟรี ๆ
        from .settings import params_of
        store["params"] = params_of(ctx.cfg, "ai")
        write_json(ctx.work / "ai.json", store)
        info(f"    {c('✓', 'g')} {len(agg['clips'])} คลิป"
             + (f" · {len(agg['chapters'])} บท" if agg["chapters"] else "")
             + f"  ({secs:.0f} วิ" + (f" · ${cost:.3f}" if cost else "") + ")")

    write_json(ctx.work / "ai.json", store)
    report(store)
    return store


# ─────────────────────── AI เลือกชิ้นจากคลัง (ขั้นที่ 3) ───────────────────────

_PICK_SCHEMA = """{
  "why": "อธิบายสั้น ๆ ว่าเรียงแบบนี้เพราะอะไร",
  "order": ["IMG_0001#0", "IMG_0007#0", "IMG_0012#1"]
}"""


def shortlist(ok, cap, ctx):
    """ตัดคลังให้เหลือ cap ชิ้นก่อนส่งให้ AI — เก็บตัวคะแนนดีของแต่ละประเภทไว้

    ไม่ใช่แค่ประหยัดโควตา แต่เป็นเงื่อนไขที่ทำให้มันตอบได้เลย: คลัง 398 ชิ้น =
    prompt 55 KB แล้วต้องตอบ id เป็นร้อยตัว โมเดลใช้ output หมดไปกับการคิดจน
    ชนเพดาน 32k แล้วไม่ได้ตอบอะไรกลับมา (วัดมาแล้ว เสียไป 11 นาที)

    คงสัดส่วนพูด:วิว ของคลังเดิมไว้ ไม่งั้นตัดแล้วเหลือแต่ช่วงพูดยาว ๆ ติดกัน
    แล้วเรียงกลับตามลำดับเล่าเรื่อง เพื่อให้ AI เห็นเส้นเวลาจริงเหมือนเดิม
    """
    from . import compose as cm       # นำเข้าตรงนี้เพราะ compose นำเข้า ai อยู่แล้ว
    keep, cut = ok, 0
    if cap > 0 and len(ok) > cap:
        cm.rank_of(ok, float(ctx.get("ai.apply.score_weight", 0.0) or 0.0))
        talk = sorted((p for p in ok if p["kind"] == "TALK"), key=lambda p: -p["_rank"])
        broll = sorted((p for p in ok if p["kind"] == "BROLL"), key=lambda p: -p["_rank"])
        n_talk = max(1, min(len(talk), round(cap * len(talk) / len(ok))))
        keep = talk[:n_talk] + broll[:max(0, cap - n_talk)]
        cut = len(ok) - len(keep)
    # เรียงตามลำดับเล่าเรื่องเสมอ ไม่ใช่แค่ตอนตัด — ถ้าขั้น 1 ลากสลับที่ไว้
    # ลำดับใน pool.json จะไม่ใช่ลำดับจริง แล้ว AI จะยึดผิดตัว
    cm.apply_order(keep, ctx)
    keep.sort(key=cm._by_seq)
    return keep, cut


def pick_compose(ctx, context="", pool=None):
    """ให้ AI เลือกและเรียงชิ้นจากคลัง → .vcut/compose.json

    AI เขียนได้แค่รายการ id — compose.py เอาไปหยิบชิ้นจริงเอง ชิ้นที่อ้างผิด
    หรือไม่มีในคลังจะถูกทิ้ง เอนจินจึงยังคุมได้เหมือนเดิม
    """
    pool = pool or read_json(ctx.work / "pool.json")
    if not pool:
        die("ยังไม่มี pool.json — ทำขั้นที่ 2 (เตรียมวิดีโอ) ก่อน")
    ok = [p for p in pool["pieces"] if p["ok"]]
    if not ok:
        die("คลังว่างเปล่า — ผ่อนตัวกรองในขั้นที่ 2 ก่อน")
    context = context or str(ctx.get("compose.context", "") or "")

    cap = int(ctx.get("compose.ask_max", 0) or 0)
    full = len(ok)
    ok, cut = shortlist(ok, cap, ctx)
    if cut:
        info(f"  ลดขนาดงานก่อนถาม  {full} → {len(ok)} ชิ้น "
             f"(ตัดตัวคะแนนต่ำออก {cut} ชิ้น · [compose] ask_max = {cap})")
    elif cap <= 0 and full > ASK_BIG:
        warn(f"ส่งทั้งคลัง {full} ชิ้นให้ AI — ใหญ่พอที่โมเดลจะใช้ output หมดไปกับ"
             f"การคิดจนตอบไม่ทัน ตั้ง [compose] ask_max = {ASK_BIG} กันไว้ดีกว่า")

    rows = ["id | ประเภท | วินาที | คลิป | ความหมาย / เนื้อหา"]
    for p in ok:
        body = p.get("meaning") or (
            (p.get("text") or "")[:110] if p["kind"] == "TALK"
            else f"ภาพวิว motion {p.get('motion', '?')}")
        tags = " #" + " #".join(p["tags"]) if p.get("tags") else ""
        rows.append(f"{p['id']} | {'พูด' if p['kind'] == 'TALK' else 'วิว'} | "
                    f"{p['dur']:.1f} | {p['name']} | {body}{tags}")

    s = pool["summary"]
    has_meaning = sum(1 for p in ok if p.get("meaning"))
    n_talk = sum(1 for p in ok if p["kind"] == "TALK")
    mins = sum(p["dur"] for p in ok) / 60
    head = [f"นี่คือคลังชิ้นวิดีโอที่ตัดเตรียมไว้แล้ว {len(ok)} ชิ้น "
            f"({n_talk} พูด + {len(ok) - n_talk} วิว) รวม {mins:.1f} นาที"]
    if cut:
        head.append(f"(คัดมาจากคลังเต็ม {full} ชิ้น เอาเฉพาะที่คะแนนดีที่สุด "
                    "— ที่ไม่อยู่ในตารางนี้คือชิ้นที่ถูกคัดออกแล้ว ไม่ต้องถามหา)")
    if not has_meaning:
        head.append("\n⚠ ยังไม่ได้ให้ AI อ่านความหมายรายคลิป (`vcut ai --task describe`) "
                    "— จะเลือกได้จากบทพูดกับตัวเลขเท่านั้น")
    if context:
        head.append(f"\nสิ่งที่เจ้าของงานสั่ง: {context}")

    prompt = "\n".join(head) + f"""

งานของคุณ: เลือกชิ้นที่จะใช้ แล้วเรียงเป็นลำดับของหนัง

- ตอบเป็นรายการ id ตามลำดับที่จะเล่นจริง
- ใช้ได้เฉพาะ id ที่อยู่ในตาราง ห้ามแต่ง ห้ามซ้ำ
- ไม่ต้องใช้ทุกชิ้น เลือกเฉพาะที่ทำให้เรื่องเดินหน้า
- คิดถึงจังหวะด้วย: ช่วงพูดยาว ๆ ติดกันจะน่าเบื่อ คั่นด้วยวิวบ้าง
- ปกติเลข id เรียงตามเวลาถ่ายจริง ยึดลำดับนั้นเป็นหลัก สลับเมื่อมีเหตุผลชัด

ตาราง
{chr(10).join(rows)}

schema ที่ต้องตอบ
{_PICK_SCHEMA}
{_RULES % 'ai/compose.json'}"""

    ai_dir = ctx.work / "ai"
    ai_dir.mkdir(parents=True, exist_ok=True)
    (ai_dir / "compose.prompt.md").write_text(prompt, encoding="utf-8")
    info(f"AI เลือกชิ้นจากคลัง {len(ok)} ชิ้น ({len(prompt) // 1000} KB)"
         + (f"  ·  โจทย์: {context[:40]}" if context else "") + " …")

    tip = (f"ทางแก้: ลด [compose] ask_max ลง (ตอนนี้ {cap or 'ไม่จำกัด'} · "
           f"ส่งไปจริง {len(ok)} ชิ้น) แล้วสั่งใหม่ — คลังเล็กลง คำตอบก็สั้นลง")
    data, meta = ask(ctx, prompt, ai_dir / "compose.json",
                             section="compose", hint=tip)
    valid = {p["id"] for p in ok}
    order, seen, bad = [], set(), 0
    for i in (data.get("order") or []):
        i = str(i)
        if i in valid and i not in seen:
            seen.add(i)
            order.append(i)
        else:
            bad += 1
    if bad:
        warn(f"AI อ้าง id ที่ใช้ไม่ได้ {bad} ชิ้น — ข้ามไป")
    if not order:
        die("AI ไม่ได้เลือกชิ้นไหนเลย — ดูคำตอบดิบที่ .vcut/ai/compose.raw.txt")

    by_id = {p["id"]: p for p in ok}
    dur = sum(by_id[i]["dur"] for i in order)
    store = {"version": 1, "context": context, "why": str(data.get("why") or "")[:600],
             "order": order, "segments": len(order), "duration": round(dur, 1),
             "cost_usd": meta.get("cost_usd"), "seconds": meta.get("seconds"),
             "at": int(time.time())}
    write_json(ctx.work / "compose.json", store)
    info(f"  {c('✓', 'g')} เลือก {len(order)} ชิ้น · {dur / 60:.1f} นาที"
         + (f"  ({meta.get('seconds')} วิ)" if meta.get("seconds") else ""))
    if store["why"]:
        info(f"  {c(store['why'][:200], 'd')}")
    return store


def load(ctx):
    """decide.py เรียกตัวนี้ — คืน None ถ้ายังไม่มีความเห็นจาก AI"""
    d = read_json(ctx.work / "ai.json")
    if not d or d.get("version") != 1:
        return None
    return d


def report(store):
    ch = store.get("chapters", [])
    cl = store.get("clips", {})
    scored = sum(1 for v in cl.values() if "score" in v)
    trimmed = sum(1 for v in cl.values() if "keep" in v)
    dropped = sum(1 for v in cl.values() if v.get("drop"))
    total = sum(v.get("cost_usd") or 0 for v in store.get("tasks", {}).values())
    info("─" * 62)
    info(f"  บท                {len(ch):>4}")
    info(f"  ให้คะแนนแล้ว        {scored:>4} คลิป")
    info(f"  แนะนำช่วงให้เก็บ     {trimmed:>4} คลิป")
    info(f"  แนะนำให้ทิ้ง        {dropped:>4} คลิป")
    if total:
        info(f"  ค่าเรียก AI รวม     ${total:.3f}")
    info("─" * 62)
    for i, x in enumerate(ch, 1):
        info(f"  {i:>2}. {x['title']:<28} {c(str(len(x['clips'])) + ' คลิป', 'd')}")
    info(f"  {c('→ .vcut/ai.json  (commit เข้า git ได้ — decide จะอ่านจากไฟล์นี้)', 'd')}")
