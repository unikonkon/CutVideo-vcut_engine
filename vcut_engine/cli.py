"""vcut — เครื่องมือตัดต่ออัตโนมัติที่ขับด้วย config

ทุกคำสั่งอ่านจากไฟล์ที่ขั้นก่อนหน้าสร้างไว้ ไม่มีสถานะซ่อนอยู่ที่ไหน:

  scan     →  .vcut/manifest.json     คุณสมบัติทุกคลิป
  listen   →  .vcut/transcript.json   คำพูดพร้อมเวลา
  thumbs   →  .vcut/thumbs/           ภาพตัวอย่าง + contact sheet
  ai       →  .vcut/ai.json           ความเห็น AI (บท · คะแนน · ช่วงที่ควรเก็บ)
  decide   →  .vcut/edl.json          ★ สัญญากลาง แก้ด้วยมือได้
  render   →  .vcut/segments/         ชิ้นที่ตัดแล้ว (cache ด้วย content hash)
  assemble →  final.mp4
"""
import argparse
import shutil
import sys
import time
from pathlib import Path

from . import ai, assemble, config, decide, listen, render, scan, serve, thumbs
from .util import (c, die, disk_free_gb, hhmmss, info, read_json,
                   require_tools, warn)

USAGE = """vcut — ตัดต่อวิดีโออัตโนมัติด้วย config

  vcut run                        ทำครบทุกขั้นตั้งแต่ scan ถึง final.mp4
  vcut scan                       อ่านคุณสมบัติทุกคลิป
  vcut listen                     ถอดเสียง (whisper.cpp)
  vcut thumbs                     ภาพตัวอย่าง + contact sheet
  vcut ai                         ถาม AI → .vcut/ai.json (บท · คะแนน · ช่วงที่ควรเก็บ)
  vcut decide                     สร้าง EDL ตามกติกาใน config
  vcut render                     ตัด+แก้ภาพ/เสียงเป็นชิ้น ๆ (มี cache)
  vcut assemble                   ต่อเป็นไฟล์เดียว
  vcut view                       เปิดหน้าเว็บดู/แก้ EDL ในเครื่อง
  vcut info                       สรุปสถานะโปรเจกต์
  vcut presets                    ดู preset ที่มี
  vcut gc                         ล้าง segment ที่ EDL ปัจจุบันไม่ได้ใช้

ตัวอย่าง
  vcut run -c hiking-vlog
  vcut decide -c hiking-vlog --set broll.run_max=4 --set talk.min_shot=6
  vcut assemble -o cut_a.mp4          # ต่อใหม่จาก cache ไม่กี่วินาที

  vcut ai -c story-ai --goal "ตัดเหลือ 10 นาที เล่าตามลำดับการเดินทาง"
  vcut decide -c story-ai --ai         # ใช้ ai.json ที่มีอยู่ ไม่เรียก AI ซ้ำ
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

    for name in ("scan", "listen", "thumbs", "ai", "decide", "render", "assemble",
                 "view", "run", "info", "gc", "presets", "config"):
        p = sub.add_parser(name, add_help=False)
        p.add_argument("-h", "--help", action="store_true")
        add_common(p)
        if name in ("scan", "listen", "ai", "render", "run"):
            p.add_argument("-f", "--force", action="store_true",
                           help="ไม่ใช้ cache ทำใหม่ทั้งหมด")
        if name in ("assemble", "run"):
            p.add_argument("-o", "--out", help="ไฟล์ผลลัพธ์")
        if name in ("ai", "run"):
            p.add_argument("--goal", default="",
                           help="โจทย์ภาษาไทยที่จะบอก AI เช่น 'ตัดเหลือ 10 นาที'")
            p.add_argument("--task", dest="tasks", action="append",
                           choices=list(ai.TASKS),
                           help="เลือกเฉพาะบางงานของ AI ใช้ซ้ำได้")
        if name in ("decide", "run"):
            p.add_argument("--ai", dest="use_ai", action="store_true",
                           help="ใช้ความเห็นจาก .vcut/ai.json (= --set ai.enabled=true)")
        if name == "run":
            p.add_argument("--from", dest="start_at", default="scan",
                           choices=["scan", "listen", "ai", "decide", "render", "assemble"],
                           help="เริ่มจากขั้นไหน (ข้ามขั้นก่อนหน้า)")
            p.add_argument("--no-thumbs", action="store_true")
        if name == "view":
            p.add_argument("--port", type=int, default=8765)
            p.add_argument("--no-open", action="store_true",
                           help="ไม่ต้องเปิดเบราว์เซอร์ให้")
        if name == "gc":
            p.add_argument("--all", action="store_true",
                           help="ลบ cache ทั้งหมดรวมทั้ง manifest/transcript")
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
        segs = list(ctx.seg_dir.glob("*.mp4"))
        sz = sum(f.stat().st_size for f in segs) / 1e9
        info(f"      segment cache {len(segs)} ไฟล์ · {sz:.2f} GB")
    info("─" * 62)
    info(f"  ดิสก์ว่าง  {disk_free_gb(ctx.work):.1f} GB")


def cmd_gc(ctx, args):
    if args.all:
        if ctx.work.exists():
            shutil.rmtree(ctx.work)
            info(f"  ลบ {ctx.work} ทั้งหมดแล้ว")
        return
    rman = read_json(ctx.work / "render.json")
    keep = {s["file"] for s in rman["segments"]} if rman else set()
    if not ctx.seg_dir.exists():
        info("  ไม่มี segment cache")
        return
    freed, n = 0, 0
    for f in ctx.seg_dir.glob("*.mp4"):
        if f.name not in keep:
            freed += f.stat().st_size
            f.unlink()
            n += 1
    for f in ctx.seg_dir.glob("*.part.mp4"):
        f.unlink(missing_ok=True)
    info(f"  ลบ segment ที่ไม่ได้ใช้ {n} ไฟล์  คืนพื้นที่ {freed / 1e9:.2f} GB")
    info(f"  เหลือที่ EDL ปัจจุบันใช้อยู่ {len(keep)} ไฟล์")


def cmd_presets():
    info(f"{c('preset ที่มี', 'b')}  ({config.PRESET_DIR})")
    for p in sorted(config.PRESET_DIR.glob("*.toml")):
        head = ""
        for line in p.read_text(encoding="utf-8").splitlines()[:6]:
            if line.strip().startswith("#") and len(line.strip()) > 3:
                head = line.strip("# ").strip()
                break
        info(f"  {c(p.stem, 'g'):<28} {head}")


def cmd_run(ctx, args):
    t0 = time.time()
    order = ["scan", "listen", "ai", "decide", "render", "assemble"]
    start = order.index(args.start_at)
    steps = order[start:]

    if "scan" in steps:
        scan.run(ctx, force=args.force)
        if not args.no_thumbs:
            thumbs.run(ctx)
    if "listen" in steps:
        listen.run(ctx, force=args.force)
    if "ai" in steps and ctx.get("ai.enabled", False):
        ai.run(ctx, tasks=args.tasks, goal=args.goal, force=args.force)
    if "decide" in steps:
        decide.run(ctx)
    if "render" in steps:
        render.run(ctx, force=args.force)
    if "assemble" in steps:
        assemble.run(ctx, out=args.out)
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

    require_tools("ffmpeg", "ffprobe")
    if args.cmd == "scan":
        scan.run(ctx, force=args.force)
    elif args.cmd == "listen":
        listen.run(ctx, force=args.force)
    elif args.cmd == "thumbs":
        thumbs.run(ctx)
    elif args.cmd == "ai":
        ai.run(ctx, tasks=args.tasks, goal=args.goal, force=args.force)
    elif args.cmd == "decide":
        decide.run(ctx)
    elif args.cmd == "render":
        render.run(ctx, force=args.force)
    elif args.cmd == "assemble":
        assemble.run(ctx, out=args.out)
    elif args.cmd == "view":
        serve.run(ctx, port=args.port, open_browser=not args.no_open,
                  config_args=config_args(args))
    elif args.cmd == "run":
        cmd_run(ctx, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
