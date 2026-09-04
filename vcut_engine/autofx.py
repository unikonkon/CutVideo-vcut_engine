"""AUTOFX — แปลง "สไตล์" เป็นชั้นแต่งหนังให้เอง → fx.json + captions.json

ขั้น 4/5 ทำทุกอย่างที่คลิป TikTok อ้างอิงทำได้แล้ว (glitch · ซูมเคลื่อน · ตัวหนังสือ
ทีละคำ · การ์ดหลายบรรทัด · เพลงหลบเสียงพูด) **แต่ทุกชิ้นต้องมีคนวางเป็นราย
(คลิป, วินาที)** ใน fx.json — "ตัดให้เลย" ที่ได้แค่การตัดโดยไม่มีหน้าตา จึงยังไม่ใช่
สิ่งที่หน้าเว็บ 3 ขั้นสัญญาไว้ (docs/PLAN-quick-cut.md · G5)

ตัวนี้อ่าน edl.json ที่เพิ่งได้ + transcript แล้ววางชั้นตามกฎง่าย ๆ ของแต่ละสไตล์:

  hook    ช็อตแรก → การ์ด 3 บรรทัด pop_words จากประโยคแรกของบทพูด เน้นบรรทัดกลางแดง
  card    ช็อตท้าย → การ์ดปิด 4 วิ ชื่อช่อง
  sub     ซับจากบทพูด (captions.json ของขั้น 4 · auto_sub ของขั้น 5)
  music   เพลงคลอจากคลังลูป ตามหมวดที่สไตล์เลือก · หลบเสียงพูด · วนจนจบ
  burst   ชุดยิงรัว (ช็อตสั้นติดกัน ≥ 3) → ซูมไล่ 1.05→1.22 สลับทิศ + โทน punch
  beat    ดูดรอยตัดเข้าจังหวะเพลง (แก้ edl.json — ต้อง render ใหม่บางชิ้น)

**ทุกชิ้นที่ตัวนี้วางมี id ขึ้นต้น "auto-"** และรายการที่แตะถูกจดไว้ที่ .vcut/autofx.json
รันซ้ำ = ถอดของเดิมออกก่อนแล้ววางใหม่ ส่วนชิ้นที่คนเพิ่มเอง (id อื่น) ไม่ถูกแตะเลย
คนจึงแก้ต่อในหน้าเว็บได้ทุกชิ้น และเปลี่ยนแบบ (variants) แล้วสั่งใหม่ได้โดยไม่ซ้อน

**ข้อความจาก whisper ภาษาไทยผิดบ่อย** — การ์ด HOOK เป็น *ร่าง* ให้คนดูก่อนเผา
(PLAN-quick-cut ข้อ 9.4) หน้าเว็บโชว์ให้แก้ตั้งแต่ก่อนกดส่งออก
"""
import shutil
import time
import zlib
from pathlib import Path

from . import caption, fx
from .config import PKG_ROOT
from .util import c, die, info, read_json, warn, write_json

RECORD = "autofx.json"
RED = "#E0102A"          # สีเน้นคำจากคลิปอ้างอิง 01–05
AMBER = "#FFB020"
ID_HOOK, ID_CARD, ID_MUSIC = "auto-hook", "auto-card", "auto-music"
BGM_CATS = ("up", "chill", "lofi", "warm", "travel", "tense", "choir",
            "depart", "trek", "summit", "camp", "back")
# ค่าที่ burst แตะ — รันซ้ำต้องคืนเฉพาะช่องพวกนี้ ไม่ล้างค่าที่คนตั้งไว้เองในชิ้นเดียวกัน
BURST_KEYS = ("zoom", "zoom_to", "grade", "glitch", "whip")


def record_path(ctx):
    return ctx.work / RECORD


def settings_of(ctx):
    """[autofx] ทับด้วยของแบบที่ active อยู่ (variants.CATALOG[i]["autofx"])

    อ่านจาก CATALOG ในโค้ด ไม่ใช่จาก meta ที่ index.json จำไว้ตอนตัด — แก้ค่าใน
    CATALOG แล้วต้องมีผลกับแบบที่ตัดไว้แล้วด้วย ไม่ใช่รอตัดใหม่
    """
    from . import variants
    a = dict(ctx.get("autofx", {}) or {})
    active = variants.load_index(ctx)["active"]
    a.update((variants.BY_ID.get(active) or {}).get("autofx") or {})
    return a


# ─────────────────────────── ถอดของเดิม ───────────────────────────

def strip(data, rec):
    """เอาชิ้นที่ autofx เคยวางออกจาก fx.json — คืน data ที่สะอาด"""
    auto_t = set(rec.get("texts") or []) | {ID_HOOK, ID_CARD}
    auto_m = set(rec.get("music") or []) | {ID_MUSIC}
    data["texts"] = [t for t in data["texts"] if t.get("id") not in auto_t]
    data["music"] = [m for m in data["music"] if m.get("id") not in auto_m]
    for key in rec.get("clips") or []:
        f = data["clips"].get(key)
        if not f:
            continue
        for k in BURST_KEYS:
            f[k] = fx.CLIP[k]
        if not fx.touched(f):
            data["clips"].pop(key, None)
    return data


# ─────────────────────────── ข้อความ ───────────────────────────

def _lines_of(text, max_lines=3, width=16):
    """ประโยคแรก → บรรทัดสั้น ๆ ของการ์ด — ตัดที่ช่องว่างที่ whisper คั่นวลีไว้

    ไม่หั่นกลางคำ: วลีไทยที่ยาวเกิน width ปล่อยไว้ทั้งวลีแล้วลดขนาดตัวอักษรแทน
    (ดู _size_for) เพราะตัดตรงไหนก็โดนกลางคำแน่นอน
    """
    toks = [t for t in str(text or "").replace("\n", " ").split(" ") if t]
    lines, cur = [], ""
    for t in toks:
        if not cur:
            cur = t
        elif len(cur) + 1 + len(t) <= width:
            cur += " " + t
        else:
            lines.append(cur)
            cur = t
        if len(lines) >= max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines[:max_lines]


def _size_for(s, big=80):
    """ขนาดตัวอักษรที่วลีนี้ยังอยู่ในผืนกว้าง 1080 ได้ — Sukhumvit Set หนา ตัวละ ~0.55 em
    วัดจากเฟรมจริง: วลี 31 ตัวที่ 32 px อ่านไม่ออกบนมือถือ · 46 px คือขั้นต่ำที่ยังอ่านได้"""
    n = len(s)
    if n <= 10:
        return big
    if n <= 16:
        return round(big * 0.82)
    if n <= 22:
        return round(big * 0.7)
    if n <= 28:
        return round(big * 0.6)
    return 46


def hook_card(shot, style_name):
    lines = _lines_of(shot.get("text", ""))
    if not lines:
        return None
    # เน้นบรรทัดกลาง (มี 2 บรรทัดเน้นบรรทัดหลัง · บรรทัดเดียวเน้นทั้งบรรทัด)
    hot = 1 if len(lines) == 3 else len(lines) - 1
    rows = []
    for i, s in enumerate(lines):
        rows.append({"text": s, "size": _size_for(s), "bold": True,
                     "color": RED if i == hot else "#FFFFFF",
                     "outline": "#000000", "border": 4.0, "gap": 0.28})
    dur = min(3.0, max(1.2, float(shot["dur"]) - 0.2))
    return {"id": ID_HOOK, "name": shot["name"], "at": round(float(shot["start"]), 3),
            "dur": round(dur, 3), "text": " ".join(lines), "lines": rows,
            "x": 0.5, "y": 0.24, "font": "Sukhumvit Set", "bold": True,
            "anim": "pop_words", "in": 0.22, "out": 0.16, "plate": False,
            # สไตล์สอน: ไม่เด้งทีละคำ — คลิปสอนควรนิ่งกว่า
            **({"anim": "rise"} if style_name == "teach" else {})}


def close_card(shot, channel, project):
    big = str(channel or "").strip() or f"@{project}"
    dur = min(4.0, float(shot["dur"]))
    at = float(shot["end"]) - dur
    return {"id": ID_CARD, "name": shot["name"], "at": round(max(float(shot["start"]), at), 3),
            "dur": round(dur, 3), "text": big,
            "lines": [{"text": "ติดตามไว้ ไม่พลาดคลิปหน้า", "size": 40, "bold": False,
                       "color": "#FFFFFF", "outline": "#000000", "border": 3.0, "gap": 0.3},
                      {"text": big, "size": _size_for(big, 72), "bold": True,
                       "color": AMBER, "outline": "#000000", "border": 4.0, "gap": 0.35}],
            "x": 0.5, "y": 0.5, "font": "Sukhumvit Set", "bold": True,
            "anim": "rise", "in": 0.3, "out": 0.2, "plate": True}


# ─────────────────────────── เพลง ───────────────────────────

def bgm_dir(ctx):
    p = Path(str(ctx.get("autofx.bgm_dir", "") or "vcut-ui-v2/public/bgm")).expanduser()
    return p if p.is_absolute() else PKG_ROOT / p


def pick_bgm(ctx, cat, seed=""):
    """ลูปหนึ่งไฟล์จากหมวด — เลือกคงที่ตามชื่อโปรเจกต์ (รันซ้ำได้เพลงเดิม)"""
    cat = str(cat or "").strip().lower()
    if not cat:
        return None
    d = bgm_dir(ctx)
    files = sorted(p for p in d.glob(f"bgm-{cat}-*.m4a")) if d.exists() else []
    if not files:
        # ชื่อไฟล์ตรง ๆ ในคลัง หรือใน assets ของโปรเจกต์
        for cand in (d / cat, ctx.work / "assets" / cat):
            if cand.is_file():
                return cand
        return None
    return files[zlib.crc32(seed.encode("utf-8")) % len(files)]


def music_track(ctx, src):
    from .music import MUSIC
    assets = ctx.work / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    dst = assets / src.name
    if not dst.exists() or dst.stat().st_size != src.stat().st_size:
        shutil.copy2(src, dst)
    return {**MUSIC, "id": ID_MUSIC, "file": src.name, "gain_db": -18.0,
            "duck": True, "duck_db": 6.0, "loop": True, "at": 0.0, "dur": 0.0,
            "fade_in": 0.8, "fade_out": 2.0}


# ─────────────────────────── ยิงรัว ───────────────────────────

def burst_runs(tl, max_dur, min_run=3):
    """ดัชนีช็อตที่อยู่ในชุดยิงรัว — ช็อตสั้นกว่า max_dur ติดกันอย่างน้อย min_run"""
    out, i = [], 0
    while i < len(tl):
        if float(tl[i]["dur"]) > max_dur:
            i += 1
            continue
        j = i
        while j < len(tl) and float(tl[j]["dur"]) <= max_dur:
            j += 1
        if j - i >= min_run:
            out.append(list(range(i, j)))
        i = j
    return out


def apply_burst(data, tl, max_dur):
    keys = []
    for run in burst_runs(tl, max_dur):
        for k, i in enumerate(run):
            key = fx.clip_key(tl[i])
            f = dict(data["clips"].get(key) or {})
            # สลับทิศ: เข้า → ออก → เข้า … ตาอ่านเป็นจังหวะ ไม่ใช่ซูมเข้าไปเรื่อย ๆ
            if k % 2 == 0:
                f.update({"zoom": 1.05, "zoom_to": 1.22})
            else:
                f.update({"zoom": 1.22, "zoom_to": 1.05})
            f["grade"] = "punch"
            data["clips"][key] = f
            keys.append(key)
    return keys


# ─────────────────────────── ดูดเข้าจังหวะ ───────────────────────────

def snap_edl(ctx, edl, data):
    """ขยับปลายช็อตให้รอยตัดตรงบีตเพลง — แก้ edl.json (เก็บ edl.prev.json ไว้)"""
    from . import beat
    tl = edl["timeline"]
    man = read_json(ctx.manifest, {}) or {}
    clip_dur = {cl["name"]: cl["duration"] for cl in man.get("clips", [])}
    files = [m["file"] for m in data["music"] if m.get("file")]
    cache, _ = beat.analyse(ctx, files)
    total = sum(float(s["dur"]) for s in tl)
    grid = beat.grid(data, cache, total)
    if not grid:
        return 0
    shots = [{"start": s["start"], "end": s["end"], "kind": s["kind"],
              "clip_dur": clip_dur.get(s["name"], s["end"])} for s in tl]
    rows, _ = beat.snap(shots, grid)
    moved = 0
    for s, r in zip(tl, rows):
        if "moved" in r:
            s["end"] = round(float(r["end"]), 3)
            s["dur"] = round(s["end"] - s["start"], 3)
            moved += 1
    if moved:
        prev = ctx.work / "edl.prev.json"
        if ctx.edl.exists():
            shutil.copy2(ctx.edl, prev)
        d_t = sum(s["dur"] for s in tl if s["kind"] == "TALK")
        d_b = sum(s["dur"] for s in tl if s["kind"] == "BROLL")
        edl["summary"].update({"duration_talk": round(d_t, 1),
                               "duration_broll": round(d_b, 1),
                               "duration_total": round(d_t + d_b, 1)})
        write_json(ctx.edl, edl)
    return moved


# ─────────────────────────── main ───────────────────────────

def run(ctx):
    edl = read_json(ctx.edl)
    if not edl or not edl.get("timeline"):
        die("ยังไม่มี edl.json — สั่ง `vcut compose` หรือ `vcut variants` ก่อน")
    tl = edl["timeline"]
    a = settings_of(ctx)
    style = str(a.get("style", "") or "")
    project = str(ctx.get("project.name", "") or "vcut")

    rec_old = read_json(record_path(ctx), {}) or {}
    data = strip(fx.load(ctx), rec_old)
    rec = {"version": 1, "style": style, "made": int(time.time()),
           "texts": [], "music": [], "clips": [], "sub": False, "moved": 0}
    how = []

    talk = [s for s in tl if s["kind"] == "TALK" and (s.get("text") or "").strip()]
    if a.get("hook", True):
        first = talk[0] if talk else None
        card = hook_card(first, style) if first else None
        if card:
            data["texts"].append(fx._text(card))
            rec["texts"].append(ID_HOOK)
            how.append("HOOK")
        else:
            warn("ไม่มีบทพูดให้ทำการ์ด HOOK — ข้าม")

    if a.get("card", True):
        last = tl[-1]
        data["texts"].append(fx._text(close_card(last, a.get("channel", ""), project)))
        rec["texts"].append(ID_CARD)
        how.append("การ์ดปิด")

    sub = bool(a.get("sub", True))
    data["auto_sub"]["enabled"] = sub
    # ซับของขั้น 5 วาดด้วยสไตล์กลาง ซึ่งค่าตั้งต้นยึดกลางจอ (align 5 — ทำมาเพื่อ
    # ข้อความที่ตรึงพิกัด) — ซับต้องอยู่ล่าง ไม่งั้นทับหน้าคนและทับการ์ดปิด
    data["style"].update({"bold": True, "size": 54, "border": 3.5, "align": 2,
                          "margin_v": 300, "margin_h": 70})
    data["text"]["sub"]["anim"] = "fade"
    data["text"]["sub"]["in"], data["text"]["sub"]["out"] = 0.1, 0.08
    cap = caption.load(ctx)
    cap["auto"]["enabled"] = sub
    cap["style"].update({"bold": True, "size": 54, "border": 3.5, "align": 2,
                         "margin_v": 300, "margin_h": 70})
    caption.save(ctx, cap)
    rec["sub"] = sub
    if sub:
        how.append("ซับ")

    cat = a.get("music", "")
    if cat:
        src = pick_bgm(ctx, cat, seed=project)
        if src:
            data["music"].append(fx._music(music_track(ctx, src)))
            rec["music"].append(ID_MUSIC)
            how.append(f"เพลง {src.stem}")
        else:
            warn(f"ไม่พบลูปเพลงหมวด '{cat}' ใน {bgm_dir(ctx)} — ข้ามเพลง")

    if a.get("burst", False):
        keys = apply_burst(data, tl, float(a.get("burst_max", 1.2) or 1.2))
        rec["clips"] = keys
        if keys:
            how.append(f"ยิงรัว {len(keys)} ช็อต")

    fx.save(ctx, data)

    if a.get("beat_snap", False) and data["music"]:
        rec["moved"] = snap_edl(ctx, edl, data)
        if rec["moved"]:
            how.append(f"ดูดเข้าบีต {rec['moved']} รอย")

    write_json(record_path(ctx), rec)
    info(f"AUTOFX  {c(style or 'generic', 'b')} · {len(tl)} ช็อต → "
         + (" · ".join(how) if how else c("ไม่มีชั้นไหนเปิดไว้", "d")))
    if rec["moved"]:
        info(f"  {c('edl.json ถูกแก้ตามจังหวะเพลง — ต้อง render ชิ้นที่ขยับใหม่', 'y')}")
    return rec


def status(ctx):
    """ให้หน้าเว็บ — ค่าที่จะใช้ + ของที่เคยวางไว้"""
    return {"settings": settings_of(ctx), "record": read_json(record_path(ctx), {}) or {},
            "bgm_cats": list(BGM_CATS), "bgm_dir": str(bgm_dir(ctx)),
            "bgm_ok": bgm_dir(ctx).exists()}
