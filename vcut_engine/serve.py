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
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import clips, config, render, reset, settings
from .util import c, info, read_json, warn, write_json

VIEWER = Path(__file__).resolve().parent.parent / "viewer" / "index.html"
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.\-]+$")

# ทุกขั้นที่ปุ่มในหน้าเว็บสั่งได้ — ชื่อ → argv ของ vcut
JOB_STEPS = {
    "scan": ["scan"], "listen": ["listen"], "thumbs": ["thumbs"], "ai": ["ai"],
    "silence": ["silence"], "prepare": ["prepare"],
    "compose": ["compose"], "decide": ["decide"],
    "render": ["render"], "assemble": ["assemble"], "caption": ["caption"],
    "plan": ["run"],          # ทำตามแผนใน [run] — ปุ่ม "ทำทุกขั้น" ใช้ตัวนี้
}
# ปุ่ม "รัน Phase นี้" — รันทุกขั้นใน Phase เดียว โดยไม่แตะ Phase อื่น
PHASE_JOBS = {p["id"]: p["steps"] for p in settings.PHASES}

# ปุ่มหลักของขั้น 2 — เติมของที่ขาดให้ก่อนแล้วค่อยตัดทีละคลิป
#
# สองแบบเพราะราคาไม่เท่ากัน: "ดึงความหมาย" เรียกโมเดลจริงและเสียโควตา ส่วน
# "ดึงบทพูด" กับ "หาช่วงเงียบ" ทำในเครื่องล้วน ปุ่มที่เลี่ยงโควตาได้จึงต้องมี
# ให้เลือก ไม่ใช่บังคับให้จ่ายทุกครั้งที่อยากได้คลังใหม่
PREPARE_JOBS = {
    "prepare_all":  ["listen", "ai", "silence", "prepare"],
    "prepare_free": ["listen", "silence", "prepare"],
}

# ปุ่ม "สร้างไฟล์" ในขั้น 3 — ผลิตไฟล์จากไทม์ไลน์ที่ตัดสินใจไว้แล้วเท่านั้น
#
# เดิมปุ่มนี้สั่ง "plan" ซึ่งคือ `vcut run` ทั้งไปป์ไลน์ — กดคำเดียวแล้วมันไป
# ถอดเสียงใหม่ ถาม AI ใหม่ เตรียมคลังใหม่ รวมใหม่ ก่อนจะถึงการต่อไฟล์ คนกดเห็น
# claude รันอยู่ครึ่งชั่วโมงทั้งที่เลือกโหมด "ไม่ใช้ AI" ไว้ ตอนนี้ทำแค่สองขั้นท้าย
PHASE_JOBS["build"] = ["render", "assemble"]

# ปุ่ม "สร้างไฟล์มีข้อความ" ในขั้น 4 — ต้องมี segment ครบก่อนถึงเขียนข้อความได้
# เติม render ให้เองเหมือนปุ่มขั้น 3 จะได้ไม่ต้องเด้งกลับไปกดอีกขั้นก่อน
PHASE_JOBS["build_text"] = ["render", "caption"]


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

# แถบความคืบหน้าที่ util.Progress พิมพ์ออกมา — "ถอดเสียง ███░░ 12/284  เหลือ ~1:20  IMG_x"
# text=True แปลง \r เป็น \n ให้แล้ว แต่ละครั้งที่ขยับจึงมาถึงเป็นบรรทัดของตัวเอง
_BAR = re.compile(r"^\s*(?P<label>[^█░]*?)\s*[█░]{4,}\s+(?P<n>\d+)/(?P<total>\d+)"
                  r"\s+เหลือ\s*~(?P<eta>\S+)\s*(?P<note>.*?)\s*$")
# ai.py ไม่มีแถบ มีแต่ "· ก้อน 2/8 (30 KB) …" — ขั้นที่รอนานที่สุดจะได้บอกได้ว่าถึงไหน
_CHUNK = re.compile(r"^\s*·\s*ก้อน\s+(\d+)/(\d+)")
_TASK = re.compile(r"^\s*→\s*(\S.*?)\s{2,}")


class Job:
    """รันได้ทีละงาน — log ไหลเข้ามาทางบรรทัด ให้หน้าเว็บ poll เอา"""

    def __init__(self):
        self.lock = threading.Lock()
        self.lines = []
        self.step = ""
        self.proc = None
        self.code = None
        self.started = 0.0
        self.took = 0.0            # เวลาที่ใช้ของงานล่าสุดที่จบไปแล้ว
        self.active = False        # True ตั้งแต่รับงานจนคิวคำสั่งหมด
        self.stopped = False       # True เมื่อคนกดหยุดเอง (ไม่ใช่งานพัง)
        self.cmds = []             # ชื่อขั้นของทุกคำสั่งในคิว เช่น ["listen","ai"]
        self.at = 0                # กำลังทำคำสั่งที่เท่าไร (1 = ตัวแรก)
        self.prog = None           # แถบความคืบหน้าล่าสุด (dict) หรือ None
        self.task = ""             # งานย่อยที่กำลังทำ (บรรทัด "→ ..." ของ ai.py)
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
            # argv = [python, vcut, <ชื่อขั้น>, ...] — เก็บชื่อไว้บอกว่าทำถึงคำสั่งไหน
            self.cmds = [a[2] if len(a) > 2 else "" for a in argvs]
            self.at, self.prog, self.took, self.task = 0, None, 0.0, ""
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
                self.at += 1
                self.prog = None
                self.lines.append(f"$ {' '.join(argv[1:])}")
                self.proc = subprocess.Popen(
                    argv, cwd=str(self._cwd), stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, text=True, bufsize=1)
            proc = self.proc
            for raw in proc.stdout:
                line = raw.rstrip("\n").split("\r")[-1].rstrip()
                if not line:
                    continue
                m, mc = _BAR.match(line), _CHUNK.match(line)
                with self.lock:
                    if m:
                        # แถบขยับวินาทีละหลายครั้ง — เก็บเป็นตัวเลขให้หน้าเว็บวาดเอง
                        # ไม่ยัดลง log ไม่งั้นข้อความจริงจะจมหายไปในแถบเป็นพันบรรทัด
                        self.prog = {"label": m["label"], "n": int(m["n"]),
                                     "total": int(m["total"]), "eta": m["eta"],
                                     "note": m["note"]}
                        continue
                    if mc:
                        self.prog = {"label": self.task or "ก้อน", "n": int(mc[1]),
                                     "total": int(mc[2]), "eta": "", "note": ""}
                    else:
                        self.prog = None      # มีข้อความอื่นแล้ว = แถบนั้นจบไปแล้ว
                        mt = _TASK.match(line)
                        if mt:
                            self.task = mt[1][:40]
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
            self.prog = None
            self.took = time.time() - self.started
            secs = f"({time.time() - self.started:.0f} วินาที)"
            self.lines.append(f"— หยุดแล้ว {secs} —" if self.stopped
                              else f"— จบด้วยรหัส {code} {secs} —")

    def state(self, since=0):
        with self.lock:
            cmd = self.cmds[self.at - 1] if 0 < self.at <= len(self.cmds) else ""
            return {"running": self.running, "step": self.step, "code": self.code,
                    "stopped": self.stopped,
                    "total": len(self.lines), "lines": self.lines[since:],
                    # กำลังทำอะไรอยู่ · คำสั่งที่เท่าไรจากทั้งหมด · ไปถึงไหนแล้ว
                    "cmd": cmd, "cmd_label": settings.STEP_LABEL.get(cmd, cmd),
                    "at": self.at, "of": len(self.cmds),
                    "elapsed": round((time.time() - self.started) if self.running
                                     else self.took, 1),
                    "progress": self.prog}


# ─────────────────────────── เล่นต่อเนื่องแบบไม่มีรอยต่อ ───────────────────────────
#
# ตัวเล่นในเบราว์เซอร์ต่อชิ้นเองด้วย <video> สองตัวสลับกัน ซึ่งมีช่องว่างตอนสลับ
# เสมอ — วัดจริงได้ 45–86 ms (เฉลี่ย 69) หรือ 3–5 เฟรมที่ 60fps ฟังแล้วสะดุด
# จนตัดสินจังหวะไม่ได้  ทางเดียวที่รอยต่อเป็นศูนย์จริงคือให้มันเป็น *สายเดียว*
# ตั้งแต่ต้นทาง จึงให้ ffmpeg ต่อชิ้นแล้วส่งออกมาเป็น fragmented MP4 สายเดียว
#
# ไม่เขียนไฟล์ลงดิสก์เลย — ส่งออก pipe แล้วส่งต่อให้เบราว์เซอร์ทันที เริ่มเล่นได้
# ในราววินาทีเดียว (วัดจริง: ต่อแบบ -c copy เร็วกว่าเวลาจริง 54 เท่า) แลกกับการ
# เลื่อนดูที่ทำได้เฉพาะในช่วงที่โหลดมาแล้ว — ข้ามไปจุดไกล ๆ = สั่งสตรีมใหม่จาก
# ชิ้นนั้นเลย ซึ่งเร็วพอจนแทบไม่รู้สึก
#
# เสียงเข้ารหัสใหม่รวดเดียวทั้งสาย จึงไม่มีปัญหา AAC priming สะสมแบบตอนต่อไฟล์
# ทีละชิ้น (บั๊กที่เคยทำให้ภาพกับเสียงเพี้ยนสะสมถึง 6.9 วินาที)
LIVE_LISTS = {}          # token → [Path ของ segment ตามลำดับ]
LIVE_MAX = 4             # เก็บของเก่าไว้ไม่กี่ชุด กันโตไม่รู้จบเวลาเปิดหลายแท็บ


def live_paths(ctx, names):
    """ชื่อไฟล์ชิ้นที่หน้าเว็บส่งมา → path จริง — ตรวจทีละชื่อก่อนเชื่อ"""
    out = []
    for n in names or []:
        n = str(n)
        if not SAFE_NAME.match(n):
            return None, f"ชื่อไฟล์ไม่ถูกต้อง: {n}"
        p = ctx.seg_dir / n
        if not p.exists():
            return None, f"ไม่พบไฟล์ของชิ้น {n} — ต้องตัดชิ้นนั้นก่อน"
        out.append(p)
    if not out:
        return None, "ไม่มีชิ้นให้ต่อ"
    return out, None


def live_cmd(ctx, lst):
    e = ctx.get("encode", {})
    return ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
            "-f", "concat", "-safe", "0", "-i", str(lst),
            "-c:v", "copy",
            "-c:a", str(e.get("acodec", "aac")),
            "-b:a", str(e.get("abitrate", "192k")),
            "-ar", str(int(e.get("arate", 48000))),
            "-ac", str(int(e.get("achannels", 2))),
            # empty_moov = ส่งหัวไฟล์ได้ทันทีโดยไม่ต้องรู้ความยาวรวมก่อน
            # frag_keyframe = ปิดก้อนที่คีย์เฟรม เบราว์เซอร์เล่นได้ตั้งแต่ก้อนแรก
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-f", "mp4", "pipe:1"]


# ─────────────────────────── ตรวจ EDL ที่ส่งกลับมา ───────────────────────────

MIN_PIECE = 0.30       # ชิ้นสั้นกว่านี้ดูเป็นความผิดพลาด ไม่ใช่การตัดสินใจ


def apply_edit(ctx, payload):
    """รับไทม์ไลน์ชุดใหม่จากหน้าเว็บ แล้วเขียน edl.json

    เดิมยอมให้ทำได้แค่ "เอาออก" กับ "สลับลำดับ" — ทุกชิ้นต้องตรงกับที่มีอยู่แล้ว
    เป๊ะ ๆ ตอนนี้เปิดให้ขยับขอบ (trim) และซอยชิ้น (cut ชนเพิ่ม) ได้ด้วย เหตุผล
    เดิมของด่านตรวจยังอยู่ครบ แค่เปลี่ยนวิธีตรวจ: แทนที่จะถามว่า "ชิ้นนี้มีอยู่
    แล้วไหม" เปลี่ยนเป็นถามว่า "ชิ้นนี้ตัดจากคลิปจริงได้ไหม"

        ชื่อคลิปต้องอยู่ใน manifest จริง · 0 ≤ start < end ≤ ความยาวคลิป
        ยาวอย่างน้อย MIN_PIECE · เหลืออย่างน้อย 1 ชิ้น

    คุณสมบัติที่เหลือ (orient · rot_override · full_range · achannels · src ·
    target_lufs) ลอกจากชิ้นเดิมของคลิปนั้นใน EDL — ค่าพวกนี้เป็นของ *คลิป* ไม่ใช่
    ของ *ช่วง* ขยับขอบแล้วจึงไม่เปลี่ยน ถ้าคลิปนั้นไม่เคยอยู่ใน EDL มาก่อนก็
    ประกอบขึ้นใหม่จาก manifest ได้

    ชิ้นที่ขอบเปลี่ยนจะไม่มีไฟล์ segment รองรับ — ตั้งใจให้เป็นแบบนั้น หน้าเว็บ
    รู้อยู่แล้วว่าต้องบอกผู้ใช้ว่า "กดสร้างไฟล์แล้วต้องตัดใหม่กี่ชิ้น"
    """
    edl = read_json(ctx.edl)
    if not edl:
        return None, "ยังไม่มี edl.json"
    man = read_json(ctx.manifest, {}) or {}
    clips = {c["name"]: c for c in man.get("clips", [])}
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})

    # ชิ้นตัวอย่างของแต่ละคลิป — ใช้ลอกคุณสมบัติที่ไม่ขึ้นกับช่วงเวลา
    tmpl = {}
    for s in edl["timeline"]:
        tmpl.setdefault(s["name"], s)

    order = payload.get("keep")
    if not isinstance(order, list):
        return None, "payload ต้องมีคีย์ keep เป็น list"

    timeline, used = [], {}
    for it in order:
        try:
            name = str(it["name"])
            a = round(float(it["start"]), 3)
            b = round(float(it.get("end", float(it["start"]) + float(it.get("dur", 0)))), 3)
        except (KeyError, TypeError, ValueError):
            return None, f"ชิ้นที่ส่งมาไม่ครบคีย์: {it}"
        cl = clips.get(name)
        if not cl:
            return None, f"ไม่รู้จักคลิป '{name}' — ไม่มีใน manifest"
        if a < 0 or b > round(cl["duration"], 3) + 0.001:
            return None, (f"{name}: ช่วง {a:.2f}–{b:.2f} วิ อยู่นอกคลิป "
                          f"(คลิปยาว {cl['duration']:.2f} วิ)")
        if b - a < MIN_PIECE:
            return None, (f"{name}: ชิ้นสั้นเกินไป {b - a:.2f} วิ "
                          f"(อย่างน้อย {MIN_PIECE:g} วิ)")

        base = tmpl.get(name)
        if base:
            piece = {k: v for k, v in base.items() if k not in ("start", "end", "dur", "id", "text")}
        else:
            piece = {"name": name, "src": cl["src"], "orient": cl["orient"],
                     "rot_override": cl.get("rot_override", ""),
                     "full_range": cl.get("full_range", False),
                     "achannels": cl.get("achannels", 2),
                     "kind": it.get("kind", "BROLL"),
                     "target_lufs": float(ctx.get("audio.target_lufs_broll", -26.0))}
        n = used.get(name, 0)
        used[name] = n + 1
        piece.update({"start": a, "end": b, "dur": round(b - a, 3),
                      "id": f"{name}#{n}"})
        # คำพูดในช่วงใหม่ — ขยับขอบแล้วข้อความเดิมไม่ตรงอีกต่อไป
        if piece.get("kind") == "TALK":
            txt = " ".join(t for s0, e0, t in tr.get(name, []) if e0 > a and s0 < b).strip()
            if txt:
                piece["text"] = txt[:400]
            else:
                piece.pop("text", None)
        timeline.append(piece)

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
    # ความยาวคลิปต้นฉบับ — เพดานของการลากขอบในไทม์ไลน์แบบแถบ
    clip_dur = {c["name"]: c["duration"] for c in man.get("clips", [])}
    tl = []
    for i, s in enumerate(edl.get("timeline", [])):
        r = by_key.get((s["name"], round(s["start"], 3), round(s["dur"], 3))) or {}
        rendered = bool(r.get("file")) and (ctx.seg_dir / r["file"]).exists()
        tl.append({
            "i": i, "name": s["name"], "kind": s["kind"],
            "start": s["start"], "end": s["end"], "dur": s["dur"],
            "clip_dur": clip_dur.get(s["name"], s["end"]),
            "orient": s.get("orient", "H"),
            # ชิ้นที่ยังไม่มีไฟล์ตัด ตัวเล่นจะไปเปิดไฟล์ต้นฉบับแทน ซึ่งยังไม่ผ่าน
            # ฟิลเตอร์หมุน — ต้องรู้ค่าหมุนถึงจะพลิกภาพให้ตรงกับของจริงได้
            "rot": s.get("rot_override", ""),
            "text": s.get("text", ""),
            "motion": s.get("motion"), "bright": s.get("bright"),
            "chapter": s.get("chapter", ""), "chapter_title": s.get("chapter_title", ""),
            "ai_score": s.get("ai_score"),
            "gain": r.get("gain"), "limiter": r.get("limiter"),
            "seg": r.get("file") if rendered else None,
        })

    sheets = sorted((ctx.thumb_dir / "sheets").glob("sheet_*.jpg"))
    # ไฟล์ที่ต่อไว้เก่ากว่าไทม์ไลน์ไหม — ตัวเล่นโหมด "ไฟล์ที่ต่อแล้ว" ต้องบอกได้ว่า
    # สิ่งที่กำลังดูอยู่ไม่ใช่ลำดับล่าสุด ไม่งั้นคนดูของเก่าแล้วนึกว่าแก้ไม่ติด
    out_m = int(ctx.out.stat().st_mtime) if ctx.out.exists() else 0
    edl_m = int(ctx.edl.stat().st_mtime) if ctx.edl.exists() else 0
    return {
        "project": ctx.get("project.name", "untitled"),
        "out": str(ctx.out),
        "out_exists": ctx.out.exists(),
        "out_size": round(ctx.out.stat().st_size / 1e9, 2) if ctx.out.exists() else 0,
        "out_mtime": out_m,
        "out_stale": bool(out_m and edl_m and out_m < edl_m),
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


def build_transcript(ctx):
    """บทพูดที่ถอดไว้ ทั้งกอง — เรียงตามลำดับที่คนจัดไว้ในขั้น 1

    แยกออกมาเป็นเส้นทางของตัวเอง ไม่ยัดใส่ /api/state ที่หน้าเว็บถามซ้ำทุกวินาที
    ตอนมีงานรันอยู่ — ข้อความทั้งกองไม่ได้เปลี่ยนบ่อยขนาดนั้น โหลดตอนเปิดหน้า
    ครั้งเดียวพอ

    ส่ง `files` มาด้วยว่าคลิปไหนมีไฟล์ .txt/.srt เขียนไว้แล้ว หน้าเว็บจะได้ทำลิงก์
    ให้กดโหลดได้เฉพาะอันที่มีจริง ไม่ใช่โชว์ลิงก์ตายไว้ทุกคลิป
    """
    from . import listen as listen_mod
    data = read_json(ctx.transcript, {}) or {}
    tr = data.get("clips", {}) or {}
    man = read_json(ctx.manifest, {}) or {}
    names = [c["name"] for c in man.get("clips", [])]
    seq = clips.seq_index(ctx, names) if names else {}
    order = sorted(tr, key=lambda n: (seq.get(n, 10 ** 6), n))

    tdir = listen_mod.text_dir(ctx)
    files = {}
    if tdir.is_dir():
        for f in tdir.iterdir():
            if f.suffix in (".txt", ".srt") and f.stem in tr:
                files.setdefault(f.stem, []).append(f.suffix[1:])

    segs = sum(len(v) for v in tr.values())
    return {
        "exists": ctx.transcript.exists(),
        "enabled": bool(ctx.get("listen.enabled", True)),
        "export": str(ctx.get("listen.export", "off") or "off"),
        "order": order,
        "clips": tr,
        "files": {k: sorted(v) for k, v in files.items()},
        "summary": {
            "clips": len(tr),
            "with_speech": sum(1 for v in tr.values() if v),
            "segments": segs,
            "chars": sum(len(t) for v in tr.values() for _, _, t in v),
            "speech": round(sum(b - a for v in tr.values() for a, b, _ in v), 1),
        },
    }


def build_captions(ctx):
    """ชั้นข้อความ + เวลาที่คำนวณแล้ว + ของที่หน้าเว็บต้องใช้วาดพรีวิว

    ส่ง cues ที่ผ่านการคำนวณจากเอนจินมาให้เลย ไม่ให้หน้าเว็บคิดเอง — พรีวิวใน
    เบราว์เซอร์กับไฟล์ที่ ffmpeg เขียนต้องมาจากตัวเลขชุดเดียวกัน ไม่งั้นวันหนึ่ง
    สองที่จะคิดไม่ตรงกันแล้วไม่มีใครรู้จนกว่าจะ render เสร็จ
    """
    from . import caption
    data = caption.load(ctx)
    rows, total = caption.cues(ctx, data)
    exe = caption.text_ffmpeg(ctx, quiet=True)
    out = caption.out_path(ctx)
    return {
        "style": data["style"], "auto": data["auto"], "boxes": data["boxes"],
        "cues": rows,
        "total": round(total, 3),
        "defaults": caption.STYLE,
        "fonts": caption.fonts(),
        "ffmpeg": {"ok": bool(exe), "path": exe or "",
                   "how": "brew install ffmpeg-full"},
        "out": {"path": str(out), "name": out.name, "exists": out.exists(),
                "size": out.stat().st_size if out.exists() else 0,
                "mtime": int(out.stat().st_mtime) if out.exists() else 0},
        "segments": [{"name": s["name"], "start": s["start"], "dur": s["dur"],
                      "at": round(s["at"], 3), "len": round(s["len"], 3)}
                     for s in caption.segments(ctx)[0]],
    }


def save_captions(ctx, payload):
    from . import caption
    data = caption.load(ctx)
    if isinstance(payload.get("style"), dict):
        data["style"].update({k: v for k, v in payload["style"].items()
                              if k in caption.STYLE})
    if isinstance(payload.get("auto"), dict):
        a = payload["auto"]
        if "enabled" in a:
            data["auto"]["enabled"] = bool(a["enabled"])
        for k in ("edits", "styles"):
            if isinstance(a.get(k), dict):
                data["auto"][k] = a[k]
        if isinstance(a.get("drop"), list):
            data["auto"]["drop"] = [str(x) for x in a["drop"]]
    if isinstance(payload.get("boxes"), list):
        data["boxes"] = [b for b in payload["boxes"] if isinstance(b, dict)]
    caption.save(ctx, data)
    return build_captions(ctx)


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
            """วิดีโอต้องรองรับ Range ไม่งั้นเบราว์เซอร์เลื่อนดูไม่ได้

            ตอบให้ครบตามช่วงที่ขอเสมอ **ห้ามตอบสั้นกว่าที่ขอ** — เคยลองจำกัดไว้
            ก้อนละ 8 MB เพื่อกันหน่วยความจำบวม ผลคือหนัง 3 GB เล่นได้ 3.9 วินาที
            (= ปริมาณวิดีโอใน 8 MB พอดี) แล้วหยุดนิ่ง เพราะเบราว์เซอร์ถือว่า
            ตอบเท่าที่ให้มาคือจบทรัพยากร ไม่ขอก้อนถัดไปให้

            หน่วยความจำไม่บวมอยู่แล้วเพราะ _stream ส่งทีละ 64 KB ไม่ได้อ่านทั้ง
            ก้อนขึ้นมาก่อน ส่วนตอนคนกดเลื่อนดู เบราว์เซอร์จะตัดสายทิ้งเองแล้วขอ
            ช่วงใหม่ — ฝั่งนี้เจอ BrokenPipe ซึ่งจับไว้แล้วใน _stream
            """
            if not path.exists():
                return self._send(404, b"not found", "text/plain")
            size = path.stat().st_size
            rng = self.headers.get("Range", "")
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if not m:
                return self._stream(path, 0, size - 1, size, 200)
            a = max(0, int(m.group(1)) if m.group(1) else 0)
            b = min(size - 1, int(m.group(2)) if m.group(2) else size - 1)
            if a > b:
                return self._send(416, b"", "video/mp4")
            return self._stream(path, a, b, size, 206)

        def _stream(self, path, a, b, size, code):
            """ส่งไฟล์เป็นก้อน ๆ ไม่อ่านเข้าหน่วยความจำทั้งไฟล์"""
            self.send_response(code)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(b - a + 1))
            if code == 206:
                self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
            self.end_headers()
            if self.command == "HEAD":
                return
            left = b - a + 1
            try:
                with path.open("rb") as f:
                    f.seek(a)
                    while left > 0:
                        buf = f.read(min(1 << 16, left))
                        if not buf:
                            break
                        self.wfile.write(buf)
                        left -= len(buf)
            except (BrokenPipeError, ConnectionResetError):
                pass          # คนดูกดข้ามหรือปิดหน้าไป — ไม่ใช่ความผิดพลาด

        def _live(self, token, start):
            """ต่อชิ้นด้วย ffmpeg แล้วส่งออกเป็นสายเดียว — ไม่แตะดิสก์

            ตอบแบบ chunked เพราะไม่รู้ความยาวรวมล่วงหน้า (ยังต่อไม่เสร็จตอนเริ่ม
            ส่ง) เบราว์เซอร์จึงเล่นไปโหลดไปได้ แต่จะเลื่อนข้ามไปข้างหน้าไกล ๆ
            ไม่ได้ — ฝั่งหน้าเว็บแก้ด้วยการสั่งสตรีมใหม่จากชิ้นที่ต้องการแทน
            """
            files = LIVE_LISTS.get(token)
            if not files:
                return self._send(404, "ไม่รู้จักรายการนี้ — สั่งเล่นใหม่อีกครั้ง",
                                  "text/plain; charset=utf-8")
            files = files[max(0, min(start, len(files) - 1)):]
            # ชื่อไฟล์รายการต้องไม่ซ้ำกันข้ามคำขอ แม้จะเป็นโทเคนเดียวกัน — concat
            # demuxer เปิดไฟล์นี้ค้างไว้แล้วไล่อ่านทีละบรรทัดตามที่เล่นไปเรื่อย ๆ
            # ไม่ได้อ่านจบตั้งแต่แรก  พอกดเลื่อนดู สายใหม่จะเขียนทับ/ลบไฟล์ที่สาย
            # เก่ายังอ่านอยู่ แล้วพังทั้งคู่ (เจอจริงตอนทดสอบ: สายใหม่ขึ้น
            # DEMUXER_ERROR_COULD_NOT_OPEN เพราะไฟล์ถูกลบใต้เท้าพอดี)
            lst = ctx.work / f"live_{token}_{secrets.token_hex(4)}.txt"
            lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in files),
                           encoding="utf-8")
            proc = subprocess.Popen(live_cmd(ctx, lst), stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL)
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Transfer-Encoding", "chunked")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    buf = proc.stdout.read(1 << 16)
                    if not buf:
                        break
                    self.wfile.write(b"%X\r\n" % len(buf) + buf + b"\r\n")
                self.wfile.write(b"0\r\n\r\n")
            except (BrokenPipeError, ConnectionResetError):
                pass          # คนกดข้ามหรือปิดหน้าไป — ปกติมาก ไม่ใช่ความผิดพลาด
            finally:
                # ต้องฆ่าให้แน่ใจ ไม่งั้น ffmpeg ค้างรอเขียน pipe ที่ไม่มีใครอ่านแล้ว
                if proc.poll() is None:
                    proc.kill()
                proc.stdout.close()
                proc.wait()
                lst.unlink(missing_ok=True)

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

            if p == "/api/transcript":
                return self._json(build_transcript(ctx))

            if p == "/api/captions":
                return self._json(build_captions(ctx))

            # ไฟล์บทพูดที่ขั้น ① เขียนไว้ — ให้กดโหลดจากหน้าเว็บได้เลย
            if p.startswith("/text/"):
                name = p[len("/text/"):]
                if not SAFE_NAME.match(name) or not name.endswith((".txt", ".srt")):
                    return self._send(400, b"bad name", "text/plain")
                from . import listen as listen_mod
                f = listen_mod.text_dir(ctx) / name
                # ห้ามให้ชื่อไฟล์พาออกนอกโฟลเดอร์ที่ตั้งใจเปิด
                try:
                    f.resolve().relative_to(listen_mod.text_dir(ctx).resolve())
                except (ValueError, OSError):
                    return self._send(400, b"bad name", "text/plain")
                if not f.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._send(200, f.read_bytes(), "text/plain; charset=utf-8")

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

            if p == "/out":
                # ไฟล์หนังที่ต่อเสร็จแล้ว — ตัวเล่นโหมด "ไฟล์ที่ต่อแล้ว" ใช้เส้นนี้
                return self._range_file(ctx.out)

            if p.startswith("/live/"):
                token = p[len("/live/"):]
                if not SAFE_NAME.match(token):
                    return self._send(400, b"bad token", "text/plain")
                q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
                try:
                    start = int(q.get("from", 0))
                except ValueError:
                    start = 0
                return self._live(token, start)

            if p.startswith("/seg/"):
                name = p[len("/seg/"):]
                if not SAFE_NAME.match(name):
                    return self._send(400, b"bad name", "text/plain")
                # segment เก็บเสียงเป็น PCM ซึ่งเบราว์เซอร์เล่นไม่ได้ — ส่งสำเนา
                # เสียง AAC ที่ทำไว้ให้แทน (ทำครั้งแรกที่กดดูชิ้นนั้น)
                web = render.web_copy(ctx, name)
                if not web:
                    return self._send(404, b"not found", "text/plain")
                return self._range_file(web)

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

            if p == "/api/live":
                # หน้าเว็บส่งลำดับชิ้นที่เห็นอยู่ตอนนี้มา (รวมที่ลากสลับไว้แต่ยัง
                # ไม่บันทึก) แลกเป็นโทเคนไว้ขอสตรีม — ไม่ได้อ่านจาก edl.json
                # เพราะทั้งจุดขายของโหมดนี้คือ "เห็นตามที่จัดอยู่ตอนนี้"
                files, err = live_paths(ctx, payload.get("segs"))
                if err:
                    return self._json({"error": err}, 400)
                token = secrets.token_hex(8)
                LIVE_LISTS[token] = files
                for old in list(LIVE_LISTS)[:-LIVE_MAX]:
                    LIVE_LISTS.pop(old, None)
                return self._json({"token": token, "count": len(files)})

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

            if p == "/api/captions":
                return self._json({"ok": True, "captions": save_captions(ctx, payload)})

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
                # หน้าเว็บส่งค่าที่ยังไม่บันทึกมาด้วย → บันทึกลงไฟล์โปรเจกต์ → รวมใหม่
                #
                # เดิมกรองเอาแต่ compose.* ซึ่งทิ้ง [order] mode กับ broll.run_max
                # ที่คนเพิ่งแก้ไปเงียบ ๆ — กด "จัดใหม่" แล้วไทม์ไลน์ไม่ขยับตามที่เลือก
                # แถมหน้าเว็บล้าง edits ทิ้งต่อ ค่าที่แก้จึงหายไปทั้งที่ไม่เคยถูกใช้
                # save_project กรองให้อยู่แล้วว่าคีย์ไหนมีจริง จึงส่งไปทั้งก้อนได้
                vals = dict(payload.get("values") or {})
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
                if step not in JOB_STEPS and step not in PHASE_JOBS \
                        and step not in PREPARE_JOBS:
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
                elif step in PREPARE_JOBS:
                    # เติมเฉพาะขั้นที่ "แผนบอกให้รัน" และ "ยังไม่มีของ/ของเก่าแล้ว"
                    # — ขั้นที่ทำไว้แล้วและค่ายังไม่เปลี่ยนจะถูกข้าม ไม่ทำซ้ำฟรี ๆ
                    st = {s["id"]: s for s in settings.step_status(ctx, ctx.cfg)}
                    todo = [i for i in PREPARE_JOBS[step]
                            if i == "prepare"
                            or (st[i]["run"] and (not st[i]["exists"] or st[i]["changed"]))]
                    argvs = [head + [s] + ctx.argv_tail for s in todo]
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

    class Server(ThreadingHTTPServer):
        daemon_threads = True

        def handle_error(self, request, client_address):
            """เบราว์เซอร์ตัดสายกลางคันทุกครั้งที่คนกดเลื่อนวิดีโอ — เป็นเรื่องปกติ
            ไม่ใช่ความผิดพลาด ของเดิมพ่น traceback ยาวเหยียดใส่เทอร์มินัลทุกครั้ง
            จนบันทึกการทำงานจริงจมหาย (วัดจริง 20 ครั้งในการทดสอบไม่กี่นาที)"""
            if issubclass(sys.exc_info()[0] or Exception,
                          (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
                return
            super().handle_error(request, client_address)

    job = Job()
    httpd = Server(("127.0.0.1", port), make_handler(ctx, job))
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
