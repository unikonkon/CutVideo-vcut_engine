"""ตัวช่วยกลาง: เรียก ffmpeg/ffprobe, วัดเสียง, cache ด้วย content hash"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

# ─────────────────────────── สี/ข้อความ ───────────────────────────

_C = {"g": "\033[32m", "y": "\033[33m", "r": "\033[31m",
      "b": "\033[34m", "d": "\033[2m", "0": "\033[0m"}


def c(s, col):
    return f"{_C.get(col, '')}{s}{_C['0']}" if sys.stdout.isatty() else str(s)


def info(msg):
    print(msg, flush=True)


def warn(msg):
    print(c(f"⚠  {msg}", "y"), flush=True)


def die(msg, code=1):
    print(c(f"✗  {msg}", "r"), file=sys.stderr, flush=True)
    sys.exit(code)


def hhmmss(sec):
    sec = max(0, int(round(sec)))
    return f"{sec // 60}:{sec % 60:02d}" if sec < 3600 else \
        f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


class Progress:
    """แถบความคืบหน้าแบบบรรทัดเดียว ประเมินเวลาที่เหลือจากอัตราจริง"""

    def __init__(self, total, label=""):
        self.total, self.label, self.n = total, label, 0
        self.t0 = time.time()

    def step(self, note="", n=1):
        self.n += n
        el = time.time() - self.t0
        eta = (el / self.n) * (self.total - self.n) if self.n else 0
        bar_w = 24
        fill = int(bar_w * self.n / self.total) if self.total else bar_w
        bar = "█" * fill + "░" * (bar_w - fill)
        line = (f"\r  {self.label} {bar} {self.n}/{self.total}"
                f"  เหลือ ~{hhmmss(eta)}  {note[:34]:<34}")
        sys.stdout.write(line[:160])
        sys.stdout.flush()

    def done(self, note=""):
        el = time.time() - self.t0
        sys.stdout.write("\r" + " " * 160 + "\r")
        info(f"  {c('✓', 'g')} {self.label} {self.total} ชิ้น  ใช้เวลา {hhmmss(el)}  {note}")


# ─────────────────────────── subprocess ───────────────────────────

def run(cmd, check=True, timeout=None):
    r = subprocess.run([str(x) for x in cmd], capture_output=True,
                       text=True, timeout=timeout)
    if check and r.returncode != 0:
        die(f"คำสั่งล้มเหลว: {' '.join(str(x) for x in cmd[:6])} ...\n{r.stderr[-800:]}")
    return r


def require_tools(*tools):
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        die(f"ไม่พบเครื่องมือที่ต้องใช้: {', '.join(missing)}")


# ─────────────────────────── ffprobe ───────────────────────────

def ffprobe(path):
    r = run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
             "-print_format", "json", str(path)], check=False)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def probe_video(path):
    """คืน dict สรุปคุณสมบัติคลิป — dw/dh คือขนาดหลัง autorotate ของ ffmpeg"""
    j = ffprobe(path)
    if not j:
        return None
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), None)
    if not v:
        return None
    a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)

    rot = 0
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    # ffmpeg autorotate อยู่แล้ว: ถ้าหมุน 90/270 ขนาดที่ decoder พ่นออกมาจะสลับ
    w, h = int(v["width"]), int(v["height"])
    dw, dh = (h, w) if abs(rot) % 180 == 90 else (w, h)

    def _fps(s):
        try:
            n, d = s.split("/")
            return round(int(n) / int(d), 3) if int(d) else 0.0
        except (ValueError, ZeroDivisionError):
            return 0.0

    dur = float(j.get("format", {}).get("duration") or v.get("duration") or 0)
    # เวลาถ่ายจริงจาก metadata — mtime ของไฟล์เชื่อไม่ได้ พอ copy ฟุตเทจมาก็เปลี่ยนหมด
    ct = ((j.get("format", {}).get("tags") or {}).get("creation_time")
          or (v.get("tags") or {}).get("creation_time") or "")
    created = 0
    if ct:
        try:
            import calendar
            created = int(calendar.timegm(
                time.strptime(ct.split(".")[0].rstrip("Z"), "%Y-%m-%dT%H:%M:%S")))
        except (ValueError, TypeError):
            created = 0
    def _sdur(s):
        try:
            return round(float((s or {}).get("duration") or 0), 6)
        except (TypeError, ValueError):
            return 0.0

    return {
        "created": created,
        "w": w, "h": h, "dw": dw, "dh": dh, "rot": rot,
        "duration": round(dur, 3),
        # ความยาวของแต่ละ track แยกกัน — ต่างกันเมื่อไรคือเสียงเลื่อนจากภาพ
        "vdur": _sdur(v) or round(dur, 6), "adur": _sdur(a),
        "codec": v.get("codec_name", "?"),
        "pix_fmt": v.get("pix_fmt", "?"),
        "color_range": v.get("color_range", ""),
        "fps": _fps(v.get("r_frame_rate", "0/1")),
        "avg_fps": _fps(v.get("avg_frame_rate", "0/1")),
        "achannels": int(a["channels"]) if a and a.get("channels") else 0,
        "acodec": a.get("codec_name", "") if a else "",
        "arate": int(a["sample_rate"]) if a and a.get("sample_rate") else 0,
        "size": Path(path).stat().st_size,
    }


# ─────────────────────────── วัดเสียง ───────────────────────────

_RE_I = re.compile(r"I:\s+(-?[\d.]+)\s+LUFS")
_RE_TP = re.compile(r"Peak:\s+(-?[\d.]+)\s+dBFS")


def measure_loudness(path, start=None, dur=None):
    """คืน (integrated LUFS, true peak dBFS) ของช่วงที่ระบุ"""
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-nostats"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if dur is not None:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-i", str(path), "-vn",
            "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]
    err = run(cmd, check=False).stderr
    I = _RE_I.findall(err)
    P = _RE_TP.findall(err)
    return (float(I[-1]) if I else -70.0, float(P[-1]) if P else -70.0)


_RE_YAVG = re.compile(r"YAVG=([\d.]+)")


def measure_motion_bright(path, t0, t1, motion_fps=5, bright_fps=2):
    """motion = ค่าเฉลี่ยความต่างระหว่างเฟรม (สูง=สั่น/แพนเร็ว), bright = ความสว่างเฉลี่ย"""
    span = max(0.1, t1 - t0)
    mo = run(["ffmpeg", "-nostdin", "-hide_banner", "-nostats",
              "-ss", f"{t0:.3f}", "-t", f"{span:.2f}", "-i", str(path),
              "-vf", (f"fps={motion_fps},scale=64:36,format=gray,"
                      "tblend=all_mode=difference,signalstats,"
                      "metadata=print:key=lavfi.signalstats.YAVG"),
              "-an", "-f", "null", "-"], check=False).stderr
    br = run(["ffmpeg", "-nostdin", "-hide_banner", "-nostats",
              "-ss", f"{t0:.3f}", "-t", f"{span:.2f}", "-i", str(path),
              "-vf", (f"fps={bright_fps},scale=64:36,signalstats,"
                      "metadata=print:key=lavfi.signalstats.YAVG"),
              "-an", "-f", "null", "-"], check=False).stderr
    m = [float(x) for x in _RE_YAVG.findall(mo)]
    b = [float(x) for x in _RE_YAVG.findall(br)]
    return (round(sum(m) / len(m), 2) if m else 99.0,
            round(sum(b) / len(b), 1) if b else 0.0)


# ─────────────────────────── cache ───────────────────────────

def key_of(obj):
    """content hash — ใช้เป็นชื่อไฟล์ cache ของ segment"""
    blob = json.dumps(obj, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()[:16]


def read_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return default


def write_json(path, data):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    # ชื่อไฟล์ชั่วคราวต้องไม่ซ้ำกันข้ามเธรด/ข้ามโพรเซส — เซิร์ฟเวอร์เป็น
    # ThreadingHTTPServer สองคำขอที่บันทึกไฟล์เดียวกันพร้อมกัน (กดบันทึกรัว ๆ
    # หรือเปิดสองแท็บ) จะเขียนทับ .tmp ตัวเดียวกันสลับกันทีละก้อน แล้ว replace
    # ไฟล์ที่เนื้อในเป็นของสองรอบปนกัน = JSON เสีย = ค่าที่ตั้งไว้หายทั้งไฟล์
    tmp = p.with_name(f"{p.name}.{os.getpid()}-{threading.get_ident():x}.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(p)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return p


# ─────────────────────────── สร้าง cache แบบไม่ชนกัน ───────────────────────────
#
# ทุกที่ในเอนจินที่ทำไฟล์ cache ใช้ท่าเดียวกัน: เขียนลง .part แล้ว replace ทับ
# ปลายทาง ซึ่ง atomic จริงถ้ามี *ผู้เขียนคนเดียว* — แต่ตัวสร้าง cache หลายตัว
# ถูกเรียกจากเธรดพร้อมกันได้ (HTTP handler ของ serve.py และ ThreadPoolExecutor
# ของ render/fx) พอสองคนคิดชื่อ .part ได้เท่ากัน ffmpeg สองตัวจะเขียนไฟล์เดียวกัน
# ทับกันไปมา ไฟล์ที่ replace ออกมาจึงเป็นวิดีโอที่พัง — และมันถูกนับเป็น cache
# ที่ใช้ได้ตลอดไป (ตัวตรวจดูแค่ "มีไฟล์และใหญ่กว่า 1 KB") ต้องลบเองถึงจะหาย
#
# กันสองชั้น: ล็อกต่อปลายทางหนึ่งไฟล์ (ไม่ให้ทำงานซ้ำซ้อนตั้งแต่แรก) และชื่อ
# .part ที่ไม่ซ้ำกัน (เผื่อกรณีข้ามโพรเซส ซึ่งล็อกในหน่วยความจำเอื้อมไม่ถึง)

_BUILD_LOCKS = {}
_BUILD_GUARD = threading.Lock()


def build_lock(key):
    """ล็อกประจำไฟล์ปลายทางหนึ่งไฟล์ — คนที่มาทีหลังรอ แล้วเจอ cache ที่ทำเสร็จแล้ว"""
    k = str(key)
    with _BUILD_GUARD:
        lk = _BUILD_LOCKS.get(k)
        if lk is None:
            lk = _BUILD_LOCKS[k] = threading.Lock()
        return lk


_PART_RE = re.compile(r"\.(\d+)-[0-9a-f]+\.part$")


def part_path(dst, suffix=None):
    """ชื่อไฟล์ระหว่างเขียนของ dst — ไม่ซ้ำกับของเธรด/โพรเซสอื่น

    ยังลงท้ายด้วย .part<นามสกุล> เหมือนเดิม ตัวเก็บกวาด (`vcut gc`) และตัวไล่
    รายชื่อ segment จึงยังมองออกว่าเป็นไฟล์ระหว่างทาง ไม่ใช่ผลงานจริง

    เก็บกวาดของที่ตกค้างให้ด้วยก่อนคืนชื่อใหม่ — เมื่อก่อนชื่อไฟล์ระหว่างเขียน
    เป็นชื่อตายตัว รอบถัดไปจึงทับของเก่าทิ้งเอง พอชื่อไม่ซ้ำแล้วของที่ตายกลางคัน
    (กด "หยุด" ตอนกำลังเข้ารหัส = โพรเซสถูกฆ่าก่อนได้ลบไฟล์ของตัวเอง) จะกองอยู่
    ทีละหลาย GB โดยไม่มีใครไปแตะ
    """
    sfx = suffix or dst.suffix or ".tmp"
    sweep_parts(dst, sfx)
    return dst.with_name(f"{dst.stem}.{os.getpid()}-{threading.get_ident():x}.part{sfx}")


def owner_dead(name):
    """ไฟล์ระหว่างเขียนชื่อนี้ ไม่มีใครเป็นเจ้าของแล้วใช่ไหม — ลบได้หรือยัง

    เจ้าของคือ pid ที่ฝังอยู่ในชื่อไฟล์ ถาม kill(pid, 0) ว่ายังอยู่ไหม ยังอยู่ =
    อาจเป็น ffmpeg ของอีกหน้าต่างที่กำลังทำงานจริง ลบทิ้งแล้วงานนั้นพังทันที
    ชื่อรุ่นเก่าที่ไม่มี pid ฝังไว้ถือว่าไม่มีเจ้าของ (ไม่มีใครให้ถาม)
    """
    m = _PART_RE.search(name)
    if not m:
        return True
    pid = int(m.group(1))
    if pid == os.getpid():
        return False
    try:
        os.kill(pid, 0)
        return False                  # เจ้าของยังมีชีวิต — ปล่อยไว้
    except ProcessLookupError:
        return True
    except OSError:
        return False                  # ถามไม่ได้ (คนละผู้ใช้) — ปลอดภัยไว้ก่อน


def sweep_parts(dst, suffix):
    """ลบไฟล์ระหว่างเขียนของ dst ที่เจ้าของตายไปแล้ว — ของที่ยังเขียนอยู่ไม่แตะ"""
    try:
        sibs = list(dst.parent.glob(f"{dst.stem}.*.part{suffix}"))
    except OSError:
        return
    for f in sibs:
        if _PART_RE.search(f.name[:-len(suffix)]) and owner_dead(f.name[:-len(suffix)]):
            f.unlink(missing_ok=True)


def sweep_dir(directory):
    """ลบไฟล์ระหว่างเขียน *ทั้งโฟลเดอร์* ที่เจ้าของตายไปแล้ว — คืนจำนวนที่ลบ

    `vcut gc` เคยกวาด `*.part.mov` ทิ้งทั้งหมดโดยไม่ถามว่าใครเป็นเจ้าของ ตอนที่
    ชื่อไฟล์ระหว่างเขียนยังเป็นชื่อตายตัวมันไม่มีทางชนกับงานที่กำลังรัน แต่พอ
    ชื่อไม่ซ้ำกันต่อโพรเซสแล้ว การกวาดแบบนั้นคือการลบไฟล์ที่ ffmpeg ของอีก
    หน้าต่างกำลังเขียนอยู่ — งานนั้นจะจบด้วย "ตัดชิ้นไม่สำเร็จ" ทั้งที่ไม่มีอะไรผิด
    """
    n = 0
    try:
        files = list(Path(directory).iterdir())
    except OSError:
        return 0
    for f in files:
        stem, sep, sfx = f.name.rpartition(".part")
        # ".part" ต้องเป็นนามสกุลจริง ๆ ไม่ใช่ต้นคำอื่น — "a.parts.mov" ไม่ใช่ของเรา
        if not sep or (sfx and not sfx.startswith(".")) or not f.is_file():
            continue
        if owner_dead(stem + ".part"):
            f.unlink(missing_ok=True)
            n += 1
    return n


def disk_free_gb(path):
    return shutil.disk_usage(str(path)).free / 1e9


def reveal(path):
    """เปิด Finder แล้วเลือกไฟล์ที่เพิ่งทำเสร็จให้ — คืน True ถ้าสั่งได้จริง

    พิมพ์ path ออกมาอย่างเดียวยังต้องคัดลอกไปวางเองอีกทอด และ path ที่มีเว้นวรรค
    (โฟลเดอร์ของผู้ใช้จริงมีเสมอ) วางแล้วพังบ่อย — เปิดให้เลยจบกว่า
    ล้มเหลวเงียบได้: หนังทำเสร็จแล้ว การที่หน้าต่างไม่เด้งไม่ใช่ความล้มเหลวของงาน
    """
    p = Path(path).expanduser()
    if sys.platform != "darwin" or not p.exists():
        return False
    try:
        subprocess.run(["open", "-R", str(p)], check=False, timeout=10,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (OSError, subprocess.SubprocessError):
        return False
