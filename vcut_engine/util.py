"""ตัวช่วยกลาง: เรียก ffmpeg/ffprobe, วัดเสียง, cache ด้วย content hash"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
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
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)
    return p


def disk_free_gb(path):
    return shutil.disk_usage(str(path)).free / 1e9
