"""VIEW — เซิร์ฟเวอร์เล็ก ๆ ในเครื่อง สำหรับดูและแก้ EDL ด้วยตา

ไม่ใช่โปรแกรมตัดต่อในเบราว์เซอร์ — เบราว์เซอร์ทำได้แค่ 2 อย่าง:
เอาช็อตออก กับ สลับลำดับ ซึ่งเป็นสองอย่างที่ *ไม่ต้อง render ใหม่*
ทุกอย่างที่เหลือยังเป็นงานของ config + engine เหมือนเดิม

  GET  /                 หน้าเว็บ (ไฟล์เดียว ไม่มี build step ไม่มี dependency)
  GET  /api/state        manifest + edl + ai + map ชิ้น→ไฟล์ segment
  GET  /thumb/<ชื่อ>      ภาพตัวอย่างคลิป
  GET  /sheet/<n>        contact sheet
  GET  /seg/<i>          ดูชิ้นที่ render แล้วจริง ๆ (รองรับ Range = เลื่อนดูได้)
  POST /api/edl          เขียน edl.json ทับ (สำรองของเดิมไว้ก่อน)
  POST /api/job          สั่ง render / assemble
  GET  /api/job          อ่าน log ที่ไหลออกมาสด ๆ

ผูกกับ 127.0.0.1 อย่างเดียว และเช็ก Host ทุกครั้ง — เครื่องอื่นในวงแลนต่อไม่ได้
"""
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import clips, config, reset, settings
from .util import c, info, read_json, warn, write_json

VIEWER = Path(__file__).resolve().parent.parent / "viewer" / "index.html"
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.\-]+$")

# ทุกขั้นที่ปุ่มในหน้าเว็บสั่งได้ — ชื่อ → argv ของ vcut
JOB_STEPS = {
    "scan": ["scan"], "listen": ["listen"], "thumbs": ["thumbs"], "ai": ["ai"],
    "silence": ["silence"], "prepare": ["prepare"],
    "compose": ["compose"], "decide": ["decide"],
    "render": ["render"], "assemble": ["assemble"],
    "plan": ["run"],          # ทำตามแผนใน [run] — ปุ่ม "ทำทุกขั้น" ใช้ตัวนี้
}
# ปุ่ม "รัน Phase นี้" — รันทุกขั้นใน Phase เดียว โดยไม่แตะ Phase อื่น
PHASE_JOBS = {p["id"]: p["steps"] for p in settings.PHASES}


def reload_ctx(ctx):
    """อ่าน config จากดิสก์ใหม่ — เรียกหลังหน้า setup เขียนไฟล์โปรเจกต์ทับ"""
    fresh = config.Ctx(config.load(ctx.config_name, ctx.sets))
    ctx.cfg, ctx.source, ctx.work, ctx.out = \
        fresh.cfg, fresh.source, fresh.work, fresh.out
    return ctx


def proposed_ctx(ctx, values):
    """Ctx จำลองจากค่าที่ยังไม่ได้บันทึก — ใช้ตอบคำถาม 'ถ้าแก้แบบนี้จะเป็นยังไง'"""
    cfg = config.load(ctx.config_name, ctx.sets)
    for k, v in (values or {}).items():
        if k in settings.FIELD_BY_KEY:
            settings.set_at(cfg, k, v)
    cfg = config.validate(cfg)
    return config.Ctx(cfg)


# ─────────────────────────── งานที่สั่งจากหน้าเว็บ ───────────────────────────

class Job:
    """รันได้ทีละงาน — log ไหลเข้ามาทางบรรทัด ให้หน้าเว็บ poll เอา"""

    def __init__(self):
        self.lock = threading.Lock()
        self.lines = []
        self.step = ""
        self.proc = None
        self.code = None
        self.started = 0.0
        self.active = False        # True ตั้งแต่รับงานจนคิวคำสั่งหมด
        self.stopped = False       # True เมื่อคนกดหยุดเอง (ไม่ใช่งานพัง)
        self._queue, self._cwd = [], "."

    @property
    def running(self):
        return self.active

    def start(self, argvs, step, cwd):
        """argvs = คำสั่งเดียว หรือหลายคำสั่งที่ต้องรันต่อกัน (หยุดทันทีถ้าอันไหนพัง)"""
        if argvs and isinstance(argvs[0], str):
            argvs = [argvs]
        with self.lock:
            if self.running:
                return False
            self.lines = []
            self.step, self.code, self.started = step, None, time.time()
            self._queue = list(argvs)
            self._cwd = cwd
            self.active = True
            self.stopped = False
        threading.Thread(target=self._pump, daemon=True).start()
        return True

    def stop(self):
        """สั่งหยุดงานที่กำลังรัน — ล้างคิวก่อนแล้วค่อยฆ่าคำสั่งปัจจุบัน

        ทุกขั้นเขียนผลลัพธ์แบบ atomic (เขียนไฟล์ .tmp แล้วค่อย replace) การถูก
        ฆ่ากลางคันจึงไม่ทำให้ไฟล์เก่าเสีย — อย่างแย่คือรอบนั้นไม่มีผลอะไรเลย
        """
        with self.lock:
            if not self.active:
                return False
            self._queue = []          # ไม่ต้องรันคำสั่งที่เหลือในคิวต่อ
            self.stopped = True
            self.lines.append("— สั่งหยุด กำลังปิดคำสั่งที่รันอยู่ —")
            proc = self.proc
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()           # ไม่ยอมตายด้วยดีก็ต้องบังคับ
        return True

    def _pump(self):
        code = 0
        while self._queue:
            argv = self._queue.pop(0)
            with self.lock:
                self.lines.append(f"$ {' '.join(argv[1:])}")
                self.proc = subprocess.Popen(
                    argv, cwd=str(self._cwd), stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, text=True, bufsize=1)
            proc = self.proc
            for raw in proc.stdout:
                # แถบความคืบหน้าของ engine เขียนทับบรรทัดเดิมด้วย \r — เอาแค่ท่อนหลังสุด
                line = raw.rstrip("\n").split("\r")[-1].rstrip()
                if not line:
                    continue
                with self.lock:
                    self.lines.append(line)
                    if len(self.lines) > 4000:
                        del self.lines[:1000]
            proc.wait()
            code = proc.returncode
            if code != 0 or self.stopped:
                break
        with self.lock:
            self.code = code
            self.active = False
            secs = f"({time.time() - self.started:.0f} วินาที)"
            self.lines.append(f"— หยุดแล้ว {secs} —" if self.stopped
                              else f"— จบด้วยรหัส {code} {secs} —")

    def state(self, since=0):
        with self.lock:
            return {"running": self.running, "step": self.step, "code": self.code,
                    "stopped": self.stopped,
                    "total": len(self.lines), "lines": self.lines[since:]}


# ─────────────────────────── ตรวจ EDL ที่ส่งกลับมา ───────────────────────────

def apply_edit(ctx, payload):
    """รับไทม์ไลน์ชุดใหม่จากหน้าเว็บ แล้วเขียน edl.json

    ยอมให้ทำได้แค่ "เอาออก" กับ "สลับลำดับ" เท่านั้น — ทุกชิ้นที่ส่งกลับมา
    ต้องตรงกับชิ้นที่มีอยู่แล้วใน EDL ทั้ง name/start/dur ถ้าไม่ตรงคือปฏิเสธ
    (กันทั้งบั๊กฝั่งหน้าเว็บ และกันไม่ให้เกิดชิ้นที่ยังไม่ได้ render)
    """
    edl = read_json(ctx.edl)
    if not edl:
        return None, "ยังไม่มี edl.json"
    old = {}
    for s in edl["timeline"]:
        old.setdefault((s["name"], round(s["start"], 3), round(s["dur"], 3)), s)

    order = payload.get("keep")
    if not isinstance(order, list):
        return None, "payload ต้องมีคีย์ keep เป็น list"

    timeline, seen = [], set()
    for it in order:
        try:
            k = (it["name"], round(float(it["start"]), 3), round(float(it["dur"]), 3))
        except (KeyError, TypeError, ValueError):
            return None, f"ชิ้นที่ส่งมาไม่ครบคีย์: {it}"
        if k not in old:
            return None, f"ไม่พบชิ้นนี้ใน EDL ปัจจุบัน: {k[0]} @{k[1]}"
        if k in seen:
            return None, f"ส่งชิ้นซ้ำ: {k[0]} @{k[1]}"
        seen.add(k)
        timeline.append(old[k])

    if not timeline:
        return None, "เหลือ 0 ชิ้น — ต้องเก็บไว้อย่างน้อย 1 ชิ้น"

    # สำรองของเดิมไว้เสมอ กดพลาดแล้วยังกู้คืนได้
    if ctx.edl.exists():
        shutil.copy2(ctx.edl, ctx.work / "edl.prev.json")

    d_t = sum(s["dur"] for s in timeline if s["kind"] == "TALK")
    d_b = sum(s["dur"] for s in timeline if s["kind"] == "BROLL")
    edl["summary"].update({
        "segments": len(timeline),
        "segments_talk": sum(1 for s in timeline if s["kind"] == "TALK"),
        "segments_broll": sum(1 for s in timeline if s["kind"] == "BROLL"),
        "segments_vertical": sum(1 for s in timeline if s["orient"] == "V"),
        "duration_talk": round(d_t, 1),
        "duration_broll": round(d_b, 1),
        "duration_total": round(d_t + d_b, 1),
        "edited_in_viewer": True,
    })
    for ch in edl.get("chapters", []):
        segs = [s for s in timeline if s.get("chapter") == ch["id"]]
        ch["segments"] = len(segs)
        ch["duration"] = round(sum(s["dur"] for s in segs), 1)
    edl["chapters"] = [ch for ch in edl.get("chapters", []) if ch["segments"]]
    edl["timeline"] = timeline
    write_json(ctx.edl, edl)
    return edl, None


# ─────────────────────────── สถานะที่ส่งให้หน้าเว็บ ───────────────────────────

def build_state(ctx):
    man = read_json(ctx.manifest, {}) or {}
    edl = read_json(ctx.edl, {}) or {}
    adv = read_json(ctx.work / "ai.json", {}) or {}
    rman = read_json(ctx.work / "render.json", {}) or {}

    # ชิ้นไหน render แล้วอยู่ที่ไฟล์ไหน — ผูกด้วยเนื้อของชิ้น ไม่ใช่ลำดับ
    # สลับลำดับในหน้าเว็บแล้วภาพตัวอย่างจึงไม่หาย
    by_key = {}
    for s in rman.get("segments", []):
        by_key[(s["name"], round(s.get("start", -1), 3), round(s["dur"], 3))] = s
    tl = []
    for i, s in enumerate(edl.get("timeline", [])):
        r = by_key.get((s["name"], round(s["start"], 3), round(s["dur"], 3))) or {}
        rendered = bool(r.get("file")) and (ctx.seg_dir / r["file"]).exists()
        tl.append({
            "i": i, "name": s["name"], "kind": s["kind"],
            "start": s["start"], "end": s["end"], "dur": s["dur"],
            "orient": s.get("orient", "H"),
            "text": s.get("text", ""),
            "motion": s.get("motion"), "bright": s.get("bright"),
            "chapter": s.get("chapter", ""), "chapter_title": s.get("chapter_title", ""),
            "ai_score": s.get("ai_score"),
            "gain": r.get("gain"), "limiter": r.get("limiter"),
            "seg": r.get("file") if rendered else None,
        })

    sheets = sorted((ctx.thumb_dir / "sheets").glob("sheet_*.jpg"))
    return {
        "project": ctx.get("project.name", "untitled"),
        "out": str(ctx.out),
        "out_exists": ctx.out.exists(),
        "out_size": round(ctx.out.stat().st_size / 1e9, 2) if ctx.out.exists() else 0,
        "config": [Path(p).name for p in ctx.get("_meta.config_files", [])],
        "clips_total": len(man.get("clips", [])),
        "footage_minutes": round(sum(x["duration"] for x in man.get("clips", [])) / 60, 1),
        "summary": edl.get("summary", {}),
        "chapters": edl.get("chapters", []),
        "ai": {"goal": adv.get("goal", ""), "chapters": len(adv.get("chapters", [])),
               "enabled": bool(adv)},
        "sheets": [p.name for p in sheets],
        "timeline": tl,
        "rendered": sum(1 for x in tl if x["seg"]),
    }


def build_setup(ctx):
    """ทุกอย่างที่หน้า setup ต้องใช้ — รายการค่า ค่าปัจจุบัน และสถานะแต่ละขั้น"""
    cur = Path(ctx.config_name).resolve() if ctx.config_name else None
    rel = project_rel(ctx) or (str(cur) if cur else "")

    # ค่าที่จะกลับไปเป็นถ้าลบคีย์นี้ออกจากไฟล์โปรเจกต์ = ค่าจาก default + preset chain
    base = config.load(None, [])
    extends = ""
    if cur and cur.exists():
        try:
            with cur.open("rb") as f:
                import tomllib
                extends = tomllib.load(f).get("extends", "") or ""
        except (OSError, ValueError):
            extends = ""
    if extends:
        try:
            base = config.load(extends, [])
        except SystemExit:
            pass

    return {
        "fields": settings.FIELDS,
        "tiers": settings.TIERS,
        "phases": settings.phase_view(ctx, ctx.cfg),
        "steps": settings.step_status(ctx, ctx.cfg),
        "values": {f["key"]: settings.get_at(ctx.cfg, f["key"])
                   for f in settings.FIELDS},
        "inherited": {f["key"]: settings.get_at(base, f["key"])
                      for f in settings.FIELDS},
        "project": {"path": rel, "extends": extends,
                    "raw": settings.read_raw(rel) if rel else "",
                    "chain": [Path(x).name for x in ctx.get("_meta.config_files", [])]},
        "projects": settings.project_files(),
        "presets": settings.preset_names(),
        "work": str(ctx.work),
        "source_ok": ctx.source.is_dir(),
    }


def build_plan(ctx):
    """หน้าหลักถามมาก่อนกด "สร้างไฟล์" ว่าจะได้รันอะไรบ้าง ใช้เวลาเท่าไร"""
    steps = settings.plan(ctx.cfg)
    est, err = None, None
    try:
        est = settings.estimate(ctx) if ctx.manifest.exists() else None
    except SystemExit:
        err = "ประเมินเวลาไม่ได้ด้วย config ชุดนี้"

    secs, notes = 0, []
    for s in steps:
        if not s["run"]:
            continue
        if s["id"] == "render" and est:
            secs += est["render_seconds"] + est["measure_seconds"]
        elif s["id"] == "assemble":
            secs += 60
        elif s["id"] in ("scan", "listen", "ai", "thumbs"):
            notes.append(s["label"])
    return {"steps": steps, "estimate": est, "error": err,
            "seconds": secs, "unknown": notes}


def project_rel(ctx):
    """ที่อยู่ไฟล์โปรเจกต์แบบเทียบกับรากโปรเจกต์ — คืน "" ถ้าอยู่นอกราก"""
    if not ctx.config_name:
        return ""
    try:
        return str(Path(ctx.config_name).resolve()
                   .relative_to(settings.PKG_ROOT.resolve()))
    except (ValueError, OSError):
        return ""


def save_pool(ctx, rel, names):
    """เขียน [prepare] keep แล้วเตรียมคลังใหม่ทันที

    prepare อ่านจากไฟล์ที่ทำไว้แล้วล้วน ๆ (manifest + transcript + ai.json)
    ใช้เวลาไม่ถึงวินาที จึงทำสด ๆ ในคำขอนี้เลย ไม่ต้องผ่านคิวงานให้ผู้ใช้รอดู log
    """
    from . import prepare
    if not rel:
        return None, "ยังไม่มีไฟล์โปรเจกต์ให้บันทึก"
    pool = read_json(ctx.work / "pool.json", {}) or {}
    known = {p["name"] for p in pool.get("pieces", [])}
    if not known:
        return None, "ยังไม่มีคลัง — สั่ง 'ตัดทีละคลิป' ก่อน"

    keep = sorted(n for n in (names or []) if n in known)
    _, err = clips.write_keys(rel, {"prepare.keep": keep})
    if err:
        return None, err
    reload_ctx(ctx)
    try:
        prepare.run(ctx)
    except SystemExit:
        return None, "เตรียมคลังใหม่ไม่สำเร็จ — ดูข้อความในเทอร์มินัล"
    return {"kept": len(keep)}, None


def build_pool(ctx):
    """คลังชิ้นที่ขั้น "เตรียม" ทำไว้ + บอกว่าชิ้นไหนถูกใช้ในหนังปัจจุบันแล้ว"""
    pool = read_json(ctx.work / "pool.json", {}) or {}
    edl = read_json(ctx.edl, {}) or {}
    used = {s.get("id") for s in edl.get("timeline", []) if s.get("id")}
    # EDL รุ่นเก่ายังไม่มี id — เทียบด้วยเนื้อชิ้นแทน
    if not used:
        used = {f"{s['name']}@{round(s['start'], 3)}" for s in edl.get("timeline", [])}
        for pc in pool.get("pieces", []):
            pc["used"] = f"{pc['name']}@{round(pc['start'], 3)}" in used
    else:
        for pc in pool.get("pieces", []):
            pc["used"] = pc["id"] in used
    # เรียงตามลำดับที่คนจัดไว้ในขั้น 1 ให้ตรงกับที่หนังจะออกมา
    if pool.get("pieces"):
        seq = clips.seq_index(
            ctx, [n for _, n in sorted({(p["num"], p["name"]) for p in pool["pieces"]})])
        pool["pieces"].sort(key=lambda p: (seq.get(p["name"], p["num"]), p["start"]))
    pool["has"] = bool(pool.get("pieces"))
    return pool


def build_review(ctx):
    """ข้อเสนอล่าสุดของ AI ที่ดูหนังตัดแล้ว + บอกว่ามันเก่าไปหรือยัง

    ถ้า EDL ถูกแก้หลังจากที่ AI ดู ตำแหน่งที่มันอ้างจะเลื่อนหมด — ต้องบอกให้รู้
    ไม่ใช่ปล่อยให้กดรับแล้วไปตัดผิดช็อต
    """
    from . import review as rv
    st = read_json(ctx.work / "review.json", {}) or {}
    edl = read_json(ctx.edl, {}) or {}
    tl = edl.get("timeline", [])
    now = rv.fingerprint(tl) if tl else ""
    st["stale"] = bool(st.get("ops") is not None and st.get("fingerprint") != now)
    st["context_default"] = str(ctx.get("review.context", "") or "")
    st["has"] = bool(st.get("version"))
    return st


def probe_dir(ctx, path):
    """ตรวจโฟลเดอร์ฟุตเทจให้ก่อนกดรัน scan จริง — เบราว์เซอร์เลือกโฟลเดอร์เองไม่ได้"""
    p = Path(path).expanduser()
    if not path:
        return {"ok": False, "msg": "ยังไม่ได้ใส่ที่อยู่"}
    if not p.is_dir():
        return {"ok": False, "msg": "ไม่พบโฟลเดอร์นี้"}
    exts = {e.lower() for e in ctx.get("scan.extensions", [".MOV"])}
    files = [f for f in p.iterdir()
             if f.is_file() and f.suffix.lower() in exts and not f.name.startswith(".")]
    size = sum(f.stat().st_size for f in files) / 1e9
    return {"ok": bool(files), "count": len(files), "gb": round(size, 1),
            "msg": (f"พบ {len(files)} คลิป · {size:.1f} GB" if files
                    else "ไม่พบไฟล์วิดีโอที่นามสกุลตรงกับ [scan] extensions")}


# ─────────────────────────── HTTP ───────────────────────────

def make_handler(ctx, job):
    class H(BaseHTTPRequestHandler):
        server_version = "vcut"
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass                                   # เงียบไว้ ไม่งั้น log ท่วมจอ

        # ── ตัวช่วยตอบกลับ ──
        def _guard(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            if host not in ("127.0.0.1", "localhost", "[::1]"):
                self._send(403, b"forbidden", "text/plain")
                return False
            return True

        def _send(self, code, body, ctype, extra=None):
            if isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False), "application/json")

        def _file(self, path, ctype=None):
            if not path.exists():
                return self._send(404, b"not found", "text/plain")
            ctype = ctype or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            self._send(200, path.read_bytes(), ctype)

        def _range_file(self, path):
            """วิดีโอต้องรองรับ Range ไม่งั้นเบราว์เซอร์เลื่อนดูไม่ได้"""
            if not path.exists():
                return self._send(404, b"not found", "text/plain")
            size = path.stat().st_size
            rng = self.headers.get("Range", "")
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if not m:
                return self._file(path, "video/mp4")
            a = int(m.group(1)) if m.group(1) else 0
            b = int(m.group(2)) if m.group(2) else size - 1
            a, b = max(0, a), min(size - 1, b)
            if a > b:
                return self._send(416, b"", "video/mp4")
            with path.open("rb") as f:
                f.seek(a)
                chunk = f.read(b - a + 1)
            self.send_response(206)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)

        # ── เส้นทาง ──
        def do_GET(self):
            if not self._guard():
                return
            u = urlparse(self.path)
            p = unquote(u.path)

            if p in ("/", "/index.html", "/viewer"):
                if not VIEWER.exists():
                    return self._send(500, f"ไม่พบ {VIEWER}", "text/plain; charset=utf-8")
                return self._send(200, VIEWER.read_bytes(), "text/html; charset=utf-8")

            if p in ("/setup", "/setup.html"):
                # หน้า 3 ขั้นรวมงานของหน้า setup เดิมไว้แล้ว — ส่งกลับไปหน้าเดียว
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            if p == "/api/state":
                return self._json(build_state(ctx))

            if p == "/api/setup":
                return self._json(build_setup(ctx))

            if p == "/api/plan":
                return self._json(build_plan(ctx))

            if p == "/api/review":
                return self._json(build_review(ctx))

            if p == "/api/pool":
                return self._json(build_pool(ctx))

            if p == "/api/clips":
                return self._json(clips.view(ctx))

            if p.startswith("/clip/"):
                name = p[len("/clip/"):]
                if not SAFE_NAME.match(name):
                    return self._send(400, b"bad name", "text/plain")
                src = clips.source_path(ctx, name)
                if not src:
                    return self._send(404, b"not found", "text/plain")
                return self._range_file(src)

            if p.startswith("/preview/"):
                name, _, mode = p[len("/preview/"):].partition("/")
                if not SAFE_NAME.match(name) or not SAFE_NAME.match(mode or "x"):
                    return self._send(400, b"bad name", "text/plain")
                dst, err = clips.preview(ctx, name, mode)
                if err:
                    return self._send(404, err.encode(), "text/plain; charset=utf-8")
                return self._range_file(dst)

            if p == "/api/reset":
                q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
                scope = unquote(q.get("scope", "all"))
                if scope != "all" and scope not in settings.PHASE_STAGES:
                    return self._json({"error": f"ไม่รู้จักขอบเขต '{scope}'"}, 400)
                return self._json(reset.preview(ctx, project_rel(ctx), scope))

            if p == "/api/history":
                return self._json({"snaps": reset.history(project_rel(ctx))})

            if p == "/api/probe_dir":
                q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
                return self._json(probe_dir(ctx, unquote(q.get("path", ""))))

            if p == "/api/job":
                since = 0
                q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
                try:
                    since = int(q.get("since", 0))
                except ValueError:
                    pass
                return self._json(job.state(since))

            if p.startswith("/thumb/"):
                name = p[len("/thumb/"):]
                if not SAFE_NAME.match(name):
                    return self._send(400, b"bad name", "text/plain")
                return self._file(ctx.thumb_dir / name)

            if p.startswith("/sheet/"):
                name = p[len("/sheet/"):]
                if not SAFE_NAME.match(name):
                    return self._send(400, b"bad name", "text/plain")
                return self._file(ctx.thumb_dir / "sheets" / name)

            if p.startswith("/seg/"):
                name = p[len("/seg/"):]
                if not SAFE_NAME.match(name):
                    return self._send(400, b"bad name", "text/plain")
                return self._range_file(ctx.seg_dir / name)

            return self._send(404, b"not found", "text/plain")

        def do_HEAD(self):
            self.do_GET()

        def do_POST(self):
            if not self._guard():
                return
            p = urlparse(self.path).path
            try:
                n = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(n) or b"{}")
            except (ValueError, json.JSONDecodeError):
                return self._json({"error": "อ่าน JSON ที่ส่งมาไม่ได้"}, 400)

            if p == "/api/edl":
                edl, err = apply_edit(ctx, payload)
                if err:
                    return self._json({"error": err}, 400)
                return self._json({"ok": True, "summary": edl["summary"]})

            if p == "/api/undo":
                prev = ctx.work / "edl.prev.json"
                if not prev.exists():
                    return self._json({"error": "ไม่มีฉบับก่อนหน้าให้ย้อนกลับ"}, 404)
                shutil.copy2(prev, ctx.edl)
                prev.unlink()
                return self._json({"ok": True})

            if p == "/api/setup":
                path, err = settings.save_project(
                    payload.get("path") or "", payload.get("values") or {},
                    extends=payload.get("extends") or None,
                    raw=payload.get("raw"))
                if err:
                    return self._json({"error": err}, 400)
                if payload.get("activate", True):
                    ctx.config_name = str(settings.PKG_ROOT / path)
                    ctx.argv_tail = ["-c", ctx.config_name]
                try:
                    reload_ctx(ctx)
                except SystemExit:
                    return self._json({"error": "บันทึกแล้วแต่โหลดกลับไม่ได้"}, 500)
                return self._json({"ok": True, "path": path,
                                   "setup": build_setup(ctx)})

            if p == "/api/reset":
                # ลบไฟล์ระหว่างที่ render วิ่งอยู่ = ทำให้งานที่กำลังทำพังกลางคัน
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่ — หยุดก่อน"}, 409)
                out, err = reset.apply(
                    ctx, project_rel(ctx), payload.get("scope") or "all",
                    keys=payload.get("keys", True),
                    artifact_ids=payload.get("artifacts") or [])
                if err:
                    return self._json({"error": err}, 400)
                try:
                    reload_ctx(ctx)
                except SystemExit:
                    return self._json({"error": "รีเซ็ตแล้วแต่โหลด config กลับไม่ได้"}, 500)
                return self._json({"ok": True, **out, "setup": build_setup(ctx)})

            if p == "/api/history":
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่ — หยุดก่อน"}, 409)
                out, err = reset.restore(project_rel(ctx), payload.get("id") or "",
                                         payload.get("scope"))
                if err:
                    return self._json({"error": err}, 400)
                try:
                    reload_ctx(ctx)
                except SystemExit:
                    return self._json({"error": "กู้คืนแล้วแต่โหลด config กลับไม่ได้"}, 500)
                return self._json({"ok": True, **out, "setup": build_setup(ctx)})

            if p == "/api/clips":
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่ — หยุดก่อน"}, 409)
                out, err = clips.save(ctx, project_rel(ctx), payload)
                if err:
                    return self._json({"error": err}, 400)
                try:
                    reload_ctx(ctx)
                except SystemExit:
                    return self._json({"error": "บันทึกแล้วแต่โหลด config กลับไม่ได้"}, 500)
                # manifest ต้องตามหลัง config เสมอ ไม่ใช่ล่วงหน้า
                out["retagged"] = clips.sync_manifest(ctx)
                return self._json({"ok": True, **out, "clips": clips.view(ctx)})

            if p == "/api/pool":
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่ — หยุดก่อน"}, 409)
                out, err = save_pool(ctx, project_rel(ctx), payload.get("keep"))
                if err:
                    return self._json({"error": err}, 400)
                return self._json({"ok": True, **out, "pool": build_pool(ctx)})

            if p == "/api/estimate":
                try:
                    ctx2 = proposed_ctx(ctx, payload.get("values") or {})
                except SystemExit:
                    return self._json({"error": "ค่าที่ตั้งไว้ใช้ด้วยกันไม่ได้ "
                                                "— ดูข้อความในเทอร์มินัล"}, 400)
                if not ctx2.manifest.exists():
                    return self._json({"error": "ยังไม่มี manifest — รันขั้นอ่านคลิปก่อน"}, 400)
                try:
                    return self._json(settings.estimate(ctx2))
                except SystemExit:
                    return self._json({"error": "ประเมินไม่ได้ด้วยค่าชุดนี้"}, 400)

            if p == "/api/review":
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่"}, 409)
                if not ctx.edl.exists():
                    return self._json({"error": "ยังไม่มี edl.json"}, 400)
                argv = [sys.executable, str(ctx.launcher), "review"] + ctx.argv_tail
                ctxt = str(payload.get("context") or "").strip()
                if ctxt:
                    argv += ["--context", ctxt]
                if payload.get("force"):
                    argv.append("--force")
                job.start(argv, "review", ctx.launcher.parent)
                return self._json({"ok": True})

            if p == "/api/compose":
                # หน้าเว็บส่งค่าของโหมดมาให้ → บันทึกลงไฟล์โปรเจกต์ → รวมใหม่
                vals = {k: v for k, v in (payload.get("values") or {}).items()
                        if k.startswith("compose.")}
                if vals:
                    rel = project_rel(ctx)
                    if not rel:
                        return self._json({"error": "ยังไม่มีไฟล์โปรเจกต์ให้บันทึก"}, 400)
                    _, err = settings.save_project(rel, vals)
                    if err:
                        return self._json({"error": err}, 400)
                    reload_ctx(ctx)
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่"}, 409)
                argv = [sys.executable, str(ctx.launcher), "compose"] + ctx.argv_tail
                if payload.get("ask"):
                    argv.append("--ask")
                    ctxt = str(payload.get("context") or "").strip()
                    if ctxt:
                        argv += ["--context", ctxt]
                job.start(argv, "compose", ctx.launcher.parent)
                return self._json({"ok": True})

            if p == "/api/job/stop":
                return self._json({"ok": job.stop(), "step": job.step})

            if p == "/api/job":
                step = payload.get("step")
                if step not in JOB_STEPS and step not in PHASE_JOBS:
                    return self._json({"error": f"ไม่รู้จักงาน '{step}'"}, 400)
                if job.running:
                    return self._json({"error": "มีงานกำลังรันอยู่"}, 409)
                head = [sys.executable, str(ctx.launcher)]
                force = ["--force"] if payload.get("force") else []

                # ขั้นเดี่ยวมาก่อน Phase เสมอ — ชื่อ "prepare" กับ "compose" เป็นทั้ง
                # ชื่อขั้นและชื่อ Phase ถ้าให้ Phase ชนะ ปุ่ม "ตัดทีละคลิป" จะลาก
                # listen + ai ไปรันด้วย ซึ่ง ai เสียโควตาจริงโดยที่ปุ่มไม่ได้บอก
                if step in JOB_STEPS:
                    argvs = [head + JOB_STEPS[step] + ctx.argv_tail
                             + (force if step in ("scan", "listen", "ai", "silence",
                                                  "render", "plan") else [])]
                else:
                    # รันเฉพาะขั้นใน Phase นี้ที่แผนบอกว่าให้รัน
                    ok = {s["id"] for s in settings.plan(ctx.cfg) if s["run"]}
                    todo = [s for s in PHASE_JOBS[step] if s in ok]
                    if not todo:
                        return self._json(
                            {"error": "ทุกขั้นใน Phase นี้ถูกปิดหรือข้ามไว้"}, 400)
                    argvs = [head + [s] + ctx.argv_tail
                             + (force if s in ("scan", "listen", "ai", "silence",
                                               "render") else [])
                             for s in todo]
                job.start(argvs, step, ctx.launcher.parent)
                return self._json({"ok": True, "step": step})

            return self._json({"error": "ไม่รู้จักเส้นทางนี้"}, 404)

    return H


def run(ctx, port=8765, open_browser=True, config_args=None,
        config_name=None, sets=None):
    ctx.launcher = Path(__file__).resolve().parent.parent / "vcut"
    ctx.argv_tail = list(config_args or [])
    ctx.config_name = config_name
    ctx.sets = list(sets or [])

    if not list(ctx.thumb_dir.glob("*.jpg")):
        warn("ยังไม่มีภาพตัวอย่าง — สั่ง 'ภาพตัวอย่าง' ในขั้น 1 ก่อนจะได้มีรูปให้ดู")

    job = Job()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(ctx, job))
    url = f"http://127.0.0.1:{port}/"
    st = build_state(ctx)
    info(f"VIEW  {st['summary'].get('segments', 0)} ชิ้น · "
         f"{st['summary'].get('duration_total', 0) / 60:.1f} นาที · "
         f"render แล้ว {st['rendered']} ชิ้น")
    info(f"  {c('→ ' + url, 'g')}   {c('(Ctrl-C เพื่อปิด)', 'd')}")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        info("\n  ปิดเซิร์ฟเวอร์แล้ว")
    finally:
        httpd.server_close()
