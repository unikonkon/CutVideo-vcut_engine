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
import re
import subprocess
import time
from pathlib import Path

from .util import c, die, info, read_json, warn, write_json

TASKS = ("story_arc", "shot_scoring", "trim_suggest")

TASK_LABEL = {
    "story_arc": "แบ่งบทเล่าเรื่อง",
    "shot_scoring": "ให้คะแนนช็อต",
    "trim_suggest": "แนะนำช่วงที่ควรเก็บ",
}


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


# ─────────────────────────── เรียก claude ───────────────────────────

def _extract_json(text):
    """ดึง JSON ก้อนแรกออกจากข้อความ — เผื่อโมเดลห่อด้วย ``` หรือพูดนำ"""
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    i = text.find("{")
    if i < 0:
        return None
    depth, in_str, esc = 0, False, False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[i:j + 1])
                except json.JSONDecodeError:
                    return None
    return None


def call_claude(ctx, prompt, out_path):
    """เรียก claude -p แบบไม่โต้ตอบ · คำตอบมาทางไฟล์ ถ้าไม่มีค่อยแกะจาก stdout"""
    binary = ctx.get("ai.binary", "claude")
    cmd = [binary, "-p", "--output-format", "json"]
    if ctx.get("ai.model"):
        cmd += ["--model", str(ctx.get("ai.model"))]
    cmd += ["--permission-mode", str(ctx.get("ai.permission_mode", "acceptEdits"))]
    tools = str(ctx.get("ai.allowed_tools", "Read,Write")).strip()
    if tools:
        cmd += ["--allowedTools", tools]

    out_path.unlink(missing_ok=True)
    t0 = time.time()
    try:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                           cwd=str(ctx.work),
                           timeout=float(ctx.get("ai.timeout", 900)))
    except FileNotFoundError:
        die(f"ไม่พบคำสั่ง '{binary}' — ติดตั้ง Claude Code ก่อน หรือตั้ง [ai] binary")
    except subprocess.TimeoutExpired:
        die(f"AI ไม่ตอบภายใน {ctx.get('ai.timeout', 900)} วินาที — เพิ่ม [ai] timeout")

    meta = {"seconds": round(time.time() - t0, 1)}
    raw_path = out_path.with_name(out_path.stem + ".raw.txt")
    raw_path.write_text((r.stdout or "") + "\n--- stderr ---\n" + (r.stderr or ""),
                        encoding="utf-8")

    envelope = None
    try:
        envelope = json.loads(r.stdout)
    except json.JSONDecodeError:
        pass
    if isinstance(envelope, dict):
        meta["cost_usd"] = envelope.get("total_cost_usd")
        meta["turns"] = envelope.get("num_turns")
        meta["model"] = next(iter(envelope.get("modelUsage") or {}), None)

    if r.returncode != 0 and not out_path.exists():
        die(f"claude ตอบกลับด้วย exit {r.returncode}\n{(r.stderr or r.stdout)[-600:]}")

    data = read_json(out_path)
    if data is None and isinstance(envelope, dict):
        data = _extract_json(envelope.get("result", ""))
    if data is None:
        data = _extract_json(r.stdout)
    if data is None:
        die(f"AI ตอบกลับมาแต่แกะ JSON ไม่ได้ — ดูคำตอบดิบที่ {raw_path}")
    return data, meta


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

            data, meta = call_claude(ctx, prompt, out_path)
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
