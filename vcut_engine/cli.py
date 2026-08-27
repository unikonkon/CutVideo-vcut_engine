"""vcut — เครื่องมือตัดต่ออัตโนมัติที่ขับด้วย config

ทุกคำสั่งอ่านจากไฟล์ที่ขั้นก่อนหน้าสร้างไว้ ไม่มีสถานะซ่อนอยู่ที่ไหน:

  scan     →  .vcut/manifest.json     คุณสมบัติทุกคลิป
  listen   →  .vcut/transcript.json   คำพูดพร้อมเวลา
  thumbs   →  .vcut/thumbs/           ภาพตัวอย่าง + contact sheet
  ai       →  .vcut/ai.json           ความเห็น AI (บท · คะแนน · ช่วงที่ควรเก็บ)
  silence  →  .vcut/silence.json      ช่วงที่ไม่มีคนพูด (ใช้ตัดชน)
  prepare  →  .vcut/pool.json         คลังชิ้นที่ตัดไว้แล้ว
  decide   →  .vcut/edl.json          ★ สัญญากลาง แก้ด้วยมือได้
  render   →  .vcut/segments/         ชิ้นที่ตัดแล้ว (cache ด้วย content hash)
  assemble →  final.mp4
  caption  →  final-text.mp4          ★ ขั้น 4 · เขียนข้อความลงภาพ
  fx       →  final-fx.mp4            ★ ขั้น 5 · แต่งหนัง
  compare  →  final-vs.mp4            ★ ขั้น 6 · วางเทียบข้างฟุตเทจดิบ
"""
import argparse
import re
import shutil
import sys
import time
from pathlib import Path

from . import (ai, assemble, caption, compare, compose, config, decide, finish,
               fx, listen, prepare, render, reset, review, scan, serve, settings,
               silence, thumbs)
from .util import (c, die, disk_free_gb, hhmmss, info, read_json,
                   require_tools, sweep_dir, warn)

USAGE = """vcut — ตัดต่อวิดีโออัตโนมัติด้วย config

  vcut run                        ทำครบทุกขั้นตั้งแต่ scan ถึง final.mp4
  vcut scan                       อ่านคุณสมบัติทุกคลิป
  vcut listen                     ถอดเสียง (whisper.cpp)
  vcut thumbs                     ภาพตัวอย่าง + contact sheet
  vcut ai                         ถาม AI → .vcut/ai.json (บท · คะแนน · ช่วงที่ควรเก็บ)
  vcut silence                    หาช่วงเงียบในคลิปพูด → ตัดชนได้ใน prepare
  vcut prepare                    ขั้น 2 · เตรียมวิดีโอทีละคลิป → pool.json
  vcut compose                    ขั้น 3 · หยิบจากคลังมาเรียงเป็นหนัง → edl.json
  vcut decide                     ทำ prepare + compose รวดเดียว (ของเดิม)
  vcut render                     ตัด+แก้ภาพ/เสียงเป็นชิ้น ๆ (มี cache)
  vcut assemble                   ต่อเป็นไฟล์เดียว
  vcut review                     ให้ AI ดูหนังที่ตัดแล้ว → เสนอการแก้
                                  (--task cut|trim|music|sfx|sticker|text)
  vcut caption                    เขียนข้อความลงหนัง → final-text.mp4
  vcut fx                         ขั้น 5 · แต่งหนัง → final-fx.mp4
  vcut compare                    ขั้น 6 · เทียบก่อน-หลัง → final-vs.mp4
  vcut view                       เปิดหน้าเว็บดู/แก้ EDL ในเครื่อง
  vcut info                       สรุปสถานะโปรเจกต์
  vcut presets                    ดู preset ที่มี
  vcut reset                      ล้างค่ากลับเป็นค่าตั้งต้น (เก็บของเดิมไว้กู้ได้)
  vcut gc                         ล้าง segment ที่ EDL ปัจจุบันไม่ได้ใช้

ตัวอย่าง
  vcut run -c hiking-vlog
  vcut decide -c hiking-vlog --set broll.run_max=4 --set talk.min_shot=6
  vcut assemble -o cut_a.mp4          # ต่อใหม่จาก cache ไม่กี่วินาที

  vcut ai -c story-ai --goal "ตัดเหลือ 10 นาที เล่าตามลำดับการเดินทาง"
  vcut decide -c story-ai --ai         # ใช้ ai.json ที่มีอยู่ ไม่เรียก AI ซ้ำ

  vcut reset -c <project> --scope prepare      # ล้างค่าขั้น 2 กลับเป็นค่าตั้งต้น
  vcut reset -c <project> --list               # ดูค่าเก่าที่เก็บไว้
  vcut reset -c <project> --restore 20260803-091500
"""


def add_common(p):
    p.add_argument("-c", "--config", metavar="PRESET|FILE",
                   help="preset หรือไฟล์ .toml (ทับค่าจาก default.toml)")
    p.add_argument("--set", dest="sets", action="append", metavar="k.path=value",
                   help="ทับค่า config ทีละตัว ใช้ซ้ำได้")
    p.add_argument("--source", help="โฟลเดอร์ฟุตเทจ (ทับ [project] source)")
    p.add_argument("--work", help="โฟลเดอร์ cache (ทับ [project] work)")


def build_parser():
    ap = argparse.ArgumentParser(prog="vcut", usage=USAGE, add_help=False)
    ap.add_argument("-h", "--help", action="store_true")
    sub = ap.add_subparsers(dest="cmd")

    for name in ("scan", "listen", "thumbs", "ai", "silence", "prepare",
                 "compose", "decide", "render", "assemble", "caption", "fx",
                 "compare", "review", "view",
                 "run", "info", "gc", "presets", "config", "reset"):
        p = sub.add_parser(name, add_help=False)
        p.add_argument("-h", "--help", action="store_true")
        add_common(p)
        if name in ("scan", "listen", "ai", "silence", "render", "run"):
            p.add_argument("-f", "--force", action="store_true",
                           help="ไม่ใช้ cache ทำใหม่ทั้งหมด")
        if name in ("assemble", "caption", "fx", "compare", "run"):
            p.add_argument("-o", "--out", help="ไฟล์ผลลัพธ์")
        if name == "compose":
            p.add_argument("--mode", choices=list(compose.MODES),
                           help="ทับ [compose] mode ชั่วคราว")
            p.add_argument("--ask", action="store_true",
                           help="ให้ AI เลือกให้ก่อน แล้วค่อยรวม (mode = ai)")
            p.add_argument("--context", default="",
                           help="โจทย์ที่จะบอก AI ตอน --ask")
        if name in ("prepare", "compose", "decide"):
            p.add_argument("--ai", dest="use_ai", action="store_true",
                           help="ใช้ความเห็นจาก .vcut/ai.json")
        if name == "review":
            p.add_argument("--context", default="",
                           help="บอก AI ว่าอยากให้ดูอะไรเป็นพิเศษ")
            p.add_argument("-f", "--force", action="store_true",
                           help="ถามใหม่แม้ EDL กับโจทย์ไม่เปลี่ยน")
            p.add_argument("--task", dest="tasks", action="append",
                           choices=list(review.TASKS),
                           help="เลือกงานที่จะให้ AI ทำ ใช้ซ้ำได้ "
                                "(ไม่ระบุ = ตาม [review] tasks)")
        if name in ("ai", "run"):
            p.add_argument("--goal", default="",
                           help="โจทย์ภาษาไทยที่จะบอก AI เช่น 'ตัดเหลือ 10 นาที'")
            p.add_argument("--task", dest="tasks", action="append",
                           choices=list(ai.TASKS),
                           help="เลือกเฉพาะบางงานของ AI ใช้ซ้ำได้")
        if name == "run":
            p.add_argument("--ai", dest="use_ai", action="store_true",
                           help="ใช้ความเห็นจาก .vcut/ai.json (= --set ai.enabled=true)")
        if name == "run":
            p.add_argument("--from", dest="start_at", default="scan",
                           choices=settings.STEP_ORDER,
                           help="เริ่มจากขั้นไหน (ข้ามขั้นก่อนหน้า)")
            p.add_argument("--no-thumbs", action="store_true")
        if name == "view":
            p.add_argument("--port", type=int, default=8765)
            p.add_argument("--no-open", action="store_true",
                           help="ไม่ต้องเปิดเบราว์เซอร์ให้")
        if name == "gc":
            p.add_argument("--all", action="store_true",
                           help="ลบ cache ทั้งหมดรวมทั้ง manifest/transcript")
        if name == "reset":
            p.add_argument("--scope", choices=settings.SCOPES, default="all",
                           help="ล้างเฉพาะขั้นไหน (ค่าตั้งต้น = ทุกขั้น)")
            p.add_argument("--files", default="",
                           help="ลบผลงานด้วย: ชื่อรายการคั่นจุลภาค หรือ 'all'")
            p.add_argument("--list", dest="show_history", action="store_true",
                           help="ดูค่าเก่าที่เก็บไว้ ไม่ล้างอะไร")
            p.add_argument("--restore", metavar="ID",
                           help="เอาค่าเก่ารายการนี้กลับมาใช้")
            p.add_argument("-y", "--yes", action="store_true",
                           help="ไม่ต้องถามยืนยัน")
    return ap


def config_args(args):
    """ประกอบ -c/--set/--source/--work กลับเป็น argv เพื่อให้ปุ่มในหน้าเว็บ
    สั่ง render/assemble ด้วย config ชุดเดียวกับที่เปิด view มา"""
    out = []
    if getattr(args, "config", None):
        out += ["-c", args.config]
    for s in (args.sets or []):
        out += ["--set", s]
    if getattr(args, "source", None):
        out += ["--source", args.source]
    if getattr(args, "work", None):
        out += ["--work", args.work]
    return out


def make_ctx(args):
    sets = list(args.sets or [])
    if getattr(args, "source", None):
        sets.append(f"project.source={args.source}")
    if getattr(args, "work", None):
        sets.append(f"project.work={args.work}")
    if getattr(args, "use_ai", False):
        sets.append("ai.enabled=true")
    cfg = config.load(getattr(args, "config", None), sets)
    return config.Ctx(cfg)


# ─────────────────────────── คำสั่ง ───────────────────────────

def cmd_info(ctx):
    files = [
        ("manifest.json", ctx.manifest, "คุณสมบัติคลิป"),
        ("transcript.json", ctx.transcript, "คำพูด"),
        ("ai.json", ctx.work / "ai.json", "ความเห็น AI"),
        ("edl.json", ctx.edl, "★ EDL"),
        ("render.json", ctx.work / "render.json", "รายการ segment"),
    ]
    info(f"{c('โปรเจกต์', 'b')}  {ctx.get('project.name')}")
    info(f"  ฟุตเทจ    {ctx.source}"
         + ("" if ctx.source.is_dir() else c("   ← ไม่พบโฟลเดอร์", "r")))
    info(f"  cache     {ctx.work}")
    info(f"  ผลลัพธ์    {ctx.out}" + ("" if not ctx.out.exists() else
         c(f"   ({ctx.out.stat().st_size / 1e9:.2f} GB)", "d")))
    info(f"  config    {', '.join(Path(p).name for p in ctx.get('_meta.config_files', []))}")
    info("─" * 62)
    for label, p, desc in files:
        if p.exists():
            age = hhmmss(time.time() - p.stat().st_mtime)
            info(f"  {c('✓', 'g')} {label:<18} {desc:<16} {c('อัปเดตเมื่อ ' + age + ' ที่แล้ว', 'd')}")
        else:
            info(f"  {c('·', 'd')} {label:<18} {desc:<16} {c('ยังไม่มี', 'd')}")

    man = read_json(ctx.manifest)
    if man:
        cl = man["clips"]
        info(f"      {len(cl)} คลิป · {sum(x['duration'] for x in cl) / 60:.1f} นาที")
    adv = read_json(ctx.work / "ai.json")
    if adv:
        scored = sum(1 for v in adv.get("clips", {}).values() if "score" in v)
        info(f"      AI {len(adv.get('chapters', []))} บท · ให้คะแนน {scored} คลิป"
             + (f" · โจทย์: {adv['goal']}" if adv.get("goal") else ""))
    edl = read_json(ctx.edl)
    if edl:
        s = edl["summary"]
        info(f"      EDL {s['segments']} ชิ้น · {s['duration_total'] / 60:.1f} นาที "
             f"({s['segments_talk']} พูด + {s['segments_broll']} วิว)")
        if edl.get("chapters"):
            info(f"      แบ่งเป็น {len(edl['chapters'])} บท")
    if ctx.seg_dir.exists():
        segs = render.seg_files(ctx)
        sz = sum(f.stat().st_size for f in segs) / 1e9
        info(f"      segment cache {len(segs)} ไฟล์ · {sz:.2f} GB")
    info("─" * 62)
    info(f"  ดิสก์ว่าง  {disk_free_gb(ctx.work):.1f} GB")


def _wanted_segments(ctx):
    """ชื่อไฟล์ segment ที่ EDL + config ปัจจุบันต้องใช้

    คำนวณ hash ใหม่แทนที่จะเชื่อรายชื่อใน render.json เพราะไฟล์นั้นถูกเขียนไว้
    ตอน render รอบก่อน ซึ่งอาจใช้สูตรคนละแบบกับตอนนี้ — ถ้าเชื่อมัน ไฟล์สูตร
    เก่าจะถูกนับว่า "ยังใช้อยู่" ตลอดไป และ gc จะไม่ลบอะไรเลย

    ชิ้นที่ยังไม่เคยวัดความดังคำนวณ hash ไม่ได้ ถ้ามีแบบนั้นปนอยู่ก็เก็บรายชื่อ
    จาก render.json ไว้ด้วย ดีกว่าลบเกินจนต้อง render ใหม่ทั้งกองโดยไม่ตั้งใจ

    **ต้องถามความดังผ่าน render.seg_loud() ไม่ใช่เปิด loudness.json อ่านเอง**
    เปิด [audio] match_clips ไว้เมื่อไร ชิ้นจะพก loud_ref (ค่าของทั้งคลิป) มาเอง
    และ render ใช้ค่านั้นคิด gain — ส่วน loudness.json เก็บค่าที่วัดทีละท่อนซึ่ง
    อาจค้างจากรอบก่อนหน้าที่ยังไม่ได้เปิดสวิตช์ อ่านผิดตัวแล้ว gain ผิด → กุญแจ
    ผิด → ไฟล์จริงไม่อยู่ในรายการ "ยังใช้อยู่" แล้ว gc ลบชิ้นที่ยังต้องใช้ทิ้ง
    (วัดกับโปรเจกต์จริง: 174 จาก 208 ชิ้นคิด gain ออกมาไม่ตรงกับที่ render ใช้)
    """
    rman = read_json(ctx.work / "render.json", {}) or {}
    listed = {s["file"] for s in rman.get("segments", [])}
    edl = read_json(ctx.edl)
    if not edl:
        return listed
    loud = read_json(ctx.work / "loudness.json", {}) or {}
    a = ctx.get("audio", {})
    keep, unknown = set(), 0
    for raw in edl.get("timeline", []):
        seg = {**raw, "_lkey": f"{raw['name']}@{raw['start']:.3f}+{raw['dur']:.3f}"}
        if not seg.get("loud_ref") and seg["_lkey"] not in loud:
            unknown += 1
            continue
        I, TP = render.seg_loud(seg, loud)
        gain, _ = render.compute_gain(I, TP, float(seg["target_lufs"]), a)
        keep.add(f"{render.seg_key(seg, ctx, gain)}.mov")
    return keep | listed if unknown else keep


def _wanted_fx(ctx):
    """ชื่อไฟล์ในโฟลเดอร์ fxseg ที่ fx.json ปัจจุบันต้องใช้

    คำนวณใหม่ด้วยเหตุผลเดียวกับ _wanted_segments — เชื่อรายชื่อใน fx-render.json
    ที่เขียนไว้รอบก่อนไม่ได้ ถ้าสูตรคิดกุญแจเปลี่ยนไป ไฟล์รุ่นเก่าจะถูกนับว่า
    "ยังใช้อยู่" ตลอดกาลแล้ว gc จะไม่ลบอะไรเลย
    """
    try:
        man = fx.plan(ctx)
    except SystemExit:
        # ยังไม่มี render.json หรือ fx.json ตั้งของที่ทำไม่ได้ไว้ — ตอบไม่ได้ว่า
        # ต้องเก็บอะไร คืน None แล้วให้ผู้เรียก *ข้ามการเก็บกวาดไปเลย*
        # (คืนเซ็ตว่างไม่ได้ — มันแปลว่า "ไม่ต้องเก็บอะไรเลย" = ลบทิ้งทั้งโฟลเดอร์)
        return None
    return {s["out"] for s in man["segments"] if s["fx"]}


def cmd_gc(ctx, args):
    if args.all:
        if ctx.work.exists():
            shutil.rmtree(ctx.work)
            info(f"  ลบ {ctx.work} ทั้งหมดแล้ว")
        return
    # ไฟล์ระหว่างเขียนของขั้น 1 กับขั้น 2 — ต้องกวาดก่อนเช็ค segment cache
    # เพราะตอนที่ขั้น 1/2 ถูกกดหยุดค้างไว้ ยังไม่มีโฟลเดอร์ segment ด้วยซ้ำ
    # ถ้าไปกวาดทีหลังจะเจอ `return` ข้างล่างตัดหน้าไปก่อนตลอด แล้วของขาด ๆ
    # (wav ของทั้งคลิปมีเป็น GB) ก็ไม่มีใครเก็บให้เลย
    n_part = sum(sweep_dir(d) for d in
                 (ctx.thumb_dir, ctx.thumb_dir / "sheets", ctx.audio_dir,
                  ctx.work / "whisper", ctx.work / "preview")
                 if d.exists())
    if n_part:
        info(f"  ลบไฟล์ระหว่างเขียนที่ตกค้างจากขั้น 1/2 {n_part} ไฟล์")
    if not ctx.seg_dir.exists():
        info("  ไม่มี segment cache")
        return
    keep = _wanted_segments(ctx)
    freed, n = 0, 0
    for f in render.seg_files(ctx):
        if f.name not in keep:
            freed += f.stat().st_size
            f.unlink()
            n += 1
    # ไฟล์ระหว่างเขียนที่ตกค้าง — เฉพาะของโพรเซสที่ตายไปแล้ว ไม่แตะของที่กำลัง
    # ตัดอยู่จริงในอีกหน้าต่าง (ดู util.sweep_dir)
    sweep_dir(ctx.seg_dir)
    # สำเนาสำหรับหน้าเว็บของชิ้นที่ไม่ได้ใช้แล้ว
    web = ctx.work / "segweb"
    if web.exists():
        stems = {Path(k).stem for k in keep}
        for f in web.glob("*.mp4"):
            if f.stem not in stems:
                freed += f.stat().st_size
                f.unlink()
    # ชิ้นที่ขั้น 5 แต่งไว้ — ทุกครั้งที่มีคนขยับความเร็ว/ซูม/โทนสี กุญแจเปลี่ยน
    # แล้วไฟล์เก่ากลายเป็นขยะทันที ถ้าไม่เก็บกวาดที่นี่ด้วยดิสก์จะโตขึ้นเงียบ ๆ
    n_fx, keep_fx = 0, _wanted_fx(ctx)
    fxdir = fx.seg_dir(ctx)
    if keep_fx is not None and fxdir.exists():
        for f in fxdir.iterdir():
            if f.suffix.lower() == ".mov" and ".part." not in f.name \
                    and f.name not in keep_fx:
                freed += f.stat().st_size
                f.unlink()
                n_fx += 1
        sweep_dir(fxdir)

    have = len(render.seg_files(ctx))
    if n_fx:
        info(f"  ลบชิ้นที่แต่งไว้แต่ไม่ได้ใช้แล้ว {n_fx} ไฟล์ (ขั้น 5)")
    info(f"  ลบ segment ที่ไม่ได้ใช้ {n} ไฟล์  คืนพื้นที่ {freed / 1e9:.2f} GB")
    info(f"  EDL ปัจจุบันต้องใช้ {len(keep)} ไฟล์ · มีอยู่แล้ว {have} ไฟล์"
         + (c(f" · ต้อง render อีก {len(keep) - have} ชิ้น", "y")
            if len(keep) > have else ""))


def cmd_presets():
    info(f"{c('preset ที่มี', 'b')}  ({config.PRESET_DIR})")
    for p in sorted(config.PRESET_DIR.glob("*.toml")):
        head = ""
        for line in p.read_text(encoding="utf-8").splitlines()[:6]:
            if line.strip().startswith("#") and len(line.strip()) > 3:
                head = line.strip("# ").strip()
                break
        info(f"  {c(p.stem, 'g'):<28} {head}")


def _project_rel(name):
    """ที่อยู่ไฟล์ config เทียบกับรากโปรเจกต์ — คืน "" ถ้าอยู่นอกราก"""
    if not name:
        return ""
    try:
        return str(config.resolve_config_path(name).resolve()
                   .relative_to(settings.PKG_ROOT.resolve()))
    except (ValueError, OSError):
        return ""


def _short(v, width=26):
    s = "—" if v is None else ("" if v == "" else str(v))
    s = s.replace("\n", " ")
    return s if len(s) <= width else s[:width - 1] + "…"


# สระบน/ล่างกับวรรณยุกต์ไทยไม่กินความกว้างบนจอ — len() จึงนับเกินจริง
# ทำให้ตารางที่จัดด้วย f"{s:<40}" เหลื่อมกันหมดเวลามีข้อความไทย
_THAI_ZW = re.compile(r"[ัิ-ฺ็-๎]")


def _pad(s, w):
    return s + " " * max(0, w - len(_THAI_ZW.sub("", s)))


def cmd_reset(ctx, args):
    """ล้างค่ากลับเป็นค่าตั้งต้น — พิมพ์ให้ดูก่อนเสมอว่าจะหายอะไรบ้าง"""
    rel = _project_rel(getattr(args, "config", None))

    if args.show_history:
        snaps = reset.history(rel)
        info(f"{c('ค่าเก่าที่เก็บไว้', 'b')}  {rel or '(ยังไม่มีไฟล์โปรเจกต์)'}")
        info(f"  {c(str(reset.HISTORY_DIR), 'd')}  {c('(ไม่เข้า git)', 'd')}")
        if not snaps:
            info(c("  ยังไม่มี — จะมีขึ้นเองครั้งแรกที่กดรีเซ็ต", "d"))
            return
        for s in snaps:
            when = time.strftime("%d/%m %H:%M", time.localtime(s["at"]))
            info(f"  {c(s['id'], 'g')}  {when}  {s['label']}")
            if s.get("deleted"):
                info(c("      ลบไฟล์ไปด้วย: " + " · ".join(s["deleted"])
                       + " (กู้กลับไม่ได้)", "d"))
        return

    if args.restore:
        out, err = reset.restore(rel, args.restore, args.scope)
        if err:
            die(err)
        info(f"{c('กู้คืนแล้ว', 'g')}  {out['restored']} → {out['path']} "
             f"({settings.SCOPE_LABEL.get(out['scope'], out['scope'])})")
        info(f"  {c('ก่อนกู้คืนเก็บไว้เป็น ' + out['undo'], 'd')}")
        return

    pv = reset.preview(ctx, rel, args.scope)
    if pv["blocked"]:
        die(pv["blocked"])
    hit = [k for k in pv["keys"] if k["in_file"]]
    known = {a["id"] for a in pv["artifacts"]}
    want = args.files.strip()
    ids = ([a["id"] for a in pv["artifacts"] if a["exists"]] if want == "all"
           else [x.strip() for x in want.split(",") if x.strip()])
    bad = [i for i in ids if i not in known]
    if bad:
        die(f"ไม่รู้จักผลงานชื่อ {', '.join(bad)}\n"
            f"   ในขอบเขตนี้มี: {', '.join(sorted(known))}")
    picked = [a for a in pv["artifacts"] if a["id"] in set(ids) and a["exists"]]

    info(f"{c('รีเซ็ต', 'b')}  {pv['scope_label']}  ·  "
         f"{rel or c('ยังไม่มีไฟล์โปรเจกต์', 'r')}")
    if hit:
        info(f"  ลบคีย์ออกจากไฟล์ {len(hit)} ตัว "
             f"แล้วปล่อยให้ค่าตกมาจาก {pv['extends'] or 'default.toml'}")
        for k in hit:
            info(f"    {k['key']:<30} {_short(k['now']):<27} → {_short(k['back'])}")
    else:
        info(c("  ไม่มีคีย์ในขอบเขตนี้ที่ไฟล์โปรเจกต์ทับไว้ "
               "— ค่าเป็นค่าตั้งต้นอยู่แล้ว", "d"))
    if picked:
        info(f"  ลบผลงาน {len(picked)} รายการ")
        for a in picked:
            info(f"    {a['id']:<11}{_pad(a['label'], 40)}{a['bytes'] / 1e6:8.1f} MB   "
                 + c(a["cost"], "r" if a["danger"] else "d"))
    elif want:
        info(c("  ผลงานที่เลือกไว้ไม่มีอยู่จริง — ไม่มีอะไรให้ลบ", "d"))
    else:
        avail = [a for a in pv["artifacts"] if a["exists"]]
        if avail:
            info(c("  ไม่แตะผลงานที่ทำไว้ — ถ้าจะลบด้วยให้ใส่ --files "
                   + ",".join(a["id"] for a in avail), "d"))

    if not hit and not picked:
        return
    if not args.yes and input("  ยืนยัน? [y/N] ").strip().lower() != "y":
        info("  ยกเลิก")
        return

    out, err = reset.apply(ctx, rel, args.scope, keys=True, artifact_ids=ids)
    if err:
        die(err)
    info(f"{c('เสร็จ', 'g')}  ลบคีย์ {len(out['dropped'])} ตัว · "
         f"ลบผลงาน {len(out['removed'])} รายการ "
         f"({sum(r['bytes'] for r in out['removed']) / 1e9:.2f} GB)")
    info(f"  ค่าเก่าเก็บไว้แล้ว — เอากลับด้วย  "
         f"{c('vcut reset --restore ' + out['snapshot'], 'g')}")


def cmd_run(ctx, args):
    """ทำครบขั้น 1→5 — ขั้นที่ทำไว้แล้วและค่ายังไม่เปลี่ยนจะข้ามจาก cache

    แผนมาจาก settings.plan() ตัวเดียวกับที่หน้าเว็บใช้ ปุ่มในเบราว์เซอร์กับ
    คำสั่งในเทอร์มินัลจึงทำเหมือนกันเสมอ  ไม่มีสวิตช์ `[run]` ให้ปิดเป็นราย
    Phase อีกแล้ว — อยากรันไม่ครบใช้ --from หรือสั่งชื่อขั้นตรง ๆ
    """
    t0 = time.time()
    steps = settings.plan(ctx.cfg, start=args.start_at, no_thumbs=args.no_thumbs)
    todo = [s["id"] for s in steps if s["run"]]

    info(f"{c('แผนการรัน', 'b')}  " + " → ".join(s["label"] for s in steps if s["run"]))
    for s in steps:
        if not s["run"]:
            info(f"  {c('ข้าม ' + s['label'] + ' — ' + s['skip'], 'd')}")
    if not todo:
        die("ไม่มีขั้นไหนให้รันเลย — --from ชี้เลยขั้นสุดท้ายไปแล้ว")

    runner = {
        "scan": lambda: scan.run(ctx, force=args.force),
        "thumbs": lambda: thumbs.run(ctx),
        "listen": lambda: listen.run(ctx, force=args.force),
        "ai": lambda: ai.run(ctx, tasks=args.tasks, goal=args.goal, force=args.force),
        "silence": lambda: silence.run(ctx, force=args.force),
        "prepare": lambda: prepare.run(ctx),
        "compose": lambda: compose.run(ctx),
        "render": lambda: render.run(ctx, force=args.force),
        "assemble": lambda: assemble.run(ctx, out=args.out),
        "caption": lambda: caption.run(ctx),
        # ไม่ส่ง --out ต่อเหมือน caption — ธงตัวนั้นเป็นของ assemble ในแผนนี้
        # ส่งต่อให้สองขั้นพร้อมกันคือสั่งให้เขียนทับกันเองที่ไฟล์เดียว
        "finish": lambda: finish.run(ctx),
        "compare": lambda: compare.run(ctx),
    }
    for sid in todo:
        runner[sid]()
    info(f"{c('เสร็จทั้งหมด', 'g')} ใช้เวลา {hhmmss(time.time() - t0)}")


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    ap = build_parser()
    args = ap.parse_args(argv)

    if not args.cmd or getattr(args, "help", False):
        print(USAGE)
        return 0

    if args.cmd == "presets":
        cmd_presets()
        return 0

    ctx = make_ctx(args)

    if args.cmd == "config":
        import json
        cfg = {k: v for k, v in ctx.cfg.items() if k != "_meta"}
        print(json.dumps(cfg, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "info":
        cmd_info(ctx)
        return 0
    if args.cmd == "gc":
        cmd_gc(ctx, args)
        return 0
    if args.cmd == "reset":
        cmd_reset(ctx, args)
        return 0

    require_tools("ffmpeg", "ffprobe")
    if args.cmd == "scan":
        scan.run(ctx, force=args.force)
    elif args.cmd == "listen":
        listen.run(ctx, force=args.force)
    elif args.cmd == "thumbs":
        thumbs.run(ctx)
    elif args.cmd == "ai":
        ai.run(ctx, tasks=args.tasks, goal=args.goal, force=args.force)
    elif args.cmd == "silence":
        silence.run(ctx, force=args.force)
    elif args.cmd == "prepare":
        prepare.run(ctx)
    elif args.cmd == "compose":
        if args.mode:
            ctx.cfg.setdefault("compose", {})["mode"] = args.mode
        if args.ask:
            ai.pick_compose(ctx, context=args.context)
            ctx.cfg.setdefault("compose", {})["mode"] = "ai"
        compose.run(ctx)
    elif args.cmd == "decide":
        decide.run(ctx)
    elif args.cmd == "render":
        render.run(ctx, force=args.force)
    elif args.cmd == "assemble":
        assemble.run(ctx, out=args.out)
    elif args.cmd == "caption":
        caption.run(ctx, out=args.out)
    elif args.cmd == "fx":
        finish.run(ctx, out=args.out)
    elif args.cmd == "compare":
        compare.run(ctx, out=args.out)
    elif args.cmd == "review":
        review.run(ctx, context=args.context, force=args.force, tasks=args.tasks)
    elif args.cmd == "view":
        serve.run(ctx, port=args.port, open_browser=not args.no_open,
                  config_args=config_args(args), config_name=args.config,
                  sets=args.sets)
    elif args.cmd == "run":
        cmd_run(ctx, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
