"""โหลด config จาก TOML (stdlib tomllib — ไม่ต้องลง dependency)

ลำดับการ merge:  config/default.toml  ←  preset/ไฟล์ที่ผู้ใช้ระบุ  ←  --set บน CLI
ค่าที่ระบุทีหลังทับค่าก่อนหน้า (deep merge ระดับ table)
"""
import tomllib
from copy import deepcopy
from pathlib import Path

from .util import die

PKG_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = PKG_ROOT / "config" / "default.toml"
PRESET_DIR = PKG_ROOT / "config" / "presets"


def _deep_merge(base, over):
    out = deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = deepcopy(v)
    return out


def _load_toml(path):
    p = Path(path)
    if not p.exists():
        die(f"ไม่พบไฟล์ config: {p}")
    try:
        with p.open("rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        die(f"config ผิดรูปแบบ: {p}\n   {e}")


def resolve_config_path(name):
    """รับได้ทั้ง path ตรง ๆ, ชื่อ preset, หรือ preset.toml"""
    if not name:
        return None
    p = Path(name).expanduser()
    if p.exists():
        return p
    for cand in (PRESET_DIR / name, PRESET_DIR / f"{name}.toml"):
        if cand.exists():
            return cand
    die(f"ไม่พบ config หรือ preset ชื่อ '{name}'\n"
        f"   preset ที่มี: {', '.join(sorted(x.stem for x in PRESET_DIR.glob('*.toml')))}")


def _coerce(s):
    low = s.strip().lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("none", "null", ""):
        return None
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    if "," in s:
        return [_coerce(x) for x in s.split(",")]
    return s


def apply_overrides(cfg, pairs):
    """--set broll.run_max=4 --set audio.compressor=true"""
    for pair in pairs or []:
        if "=" not in pair:
            die(f"--set ต้องอยู่ในรูป key.path=value (ได้รับ '{pair}')")
        path, raw = pair.split("=", 1)
        keys = path.strip().split(".")
        node = cfg
        for k in keys[:-1]:
            if not isinstance(node.get(k), dict):
                node[k] = {}
            node = node[k]
        node[keys[-1]] = _coerce(raw)
    return cfg


def _chain(path, seen=None):
    """ไล่ extends ขึ้นไปให้สุด แล้วคืนลำดับจากฐานสุด → เฉพาะเจาะจงสุด"""
    seen = seen or []
    if path.resolve() in [p.resolve() for p in seen]:
        die(f"config อ้าง extends วนกลับมาที่ตัวเอง: {path.name}")
    raw = _load_toml(path)
    parent = raw.get("extends")
    if not parent:
        return [path]
    ppath = resolve_config_path(parent)
    return _chain(ppath, seen + [path]) + [path]


def load(config_name=None, overrides=None):
    cfg = _load_toml(DEFAULT_CONFIG)
    used = [DEFAULT_CONFIG]
    path = resolve_config_path(config_name)
    if path and path.resolve() != DEFAULT_CONFIG.resolve():
        for p in _chain(path):
            if p.resolve() == DEFAULT_CONFIG.resolve():
                continue
            cfg = _deep_merge(cfg, _load_toml(p))
            used.append(p)
    cfg.pop("extends", None)
    cfg = apply_overrides(cfg, overrides)

    # ─── ทำ path ให้เป็น absolute ───
    proj = cfg.setdefault("project", {})
    src = Path(proj.get("source", "")).expanduser()
    if not src.is_absolute():
        src = (Path.cwd() / src).resolve()
    proj["source"] = str(src)

    work = Path(proj.get("work", ".vcut")).expanduser()
    if not work.is_absolute():
        work = (Path.cwd() / work).resolve()
    proj["work"] = str(work)

    out = Path(proj.get("out", "final.mp4")).expanduser()
    if not out.is_absolute():
        out = (Path.cwd() / out).resolve()
    proj["out"] = str(out)

    cfg["_meta"] = {"config_files": [str(p) for p in used]}
    validate(cfg)
    return cfg


def validate(cfg):
    b = cfg.get("broll", {})
    bands = b.get("motion_bands", [])
    durs = b.get("durations", [])
    if len(durs) != len(bands) + 1:
        die(f"[broll] durations ต้องมี {len(bands) + 1} ค่า "
            f"(motion_bands มี {len(bands)} ค่า) แต่พบ {len(durs)}")
    if list(bands) != sorted(bands):
        die("[broll] motion_bands ต้องเรียงจากน้อยไปมาก")

    a = cfg.get("audio", {})
    if a.get("tp_ceiling", -4.0) > 0:
        die("[audio] tp_ceiling ต้องเป็นค่าติดลบ (dBFS)")

    o = cfg.get("order", {}).get("mode", "filename")
    if o not in ("filename", "mtime", "duration"):
        die(f"[order] mode รองรับ filename | mtime | duration (ได้รับ '{o}')")

    v = cfg.get("video", {}).get("vertical_mode", "blur_pad")
    if v not in ("blur_pad", "pillarbox", "crop"):
        die(f"[video] vertical_mode รองรับ blur_pad | pillarbox | crop (ได้รับ '{v}')")
    return cfg


class Ctx:
    """ที่อยู่ของไฟล์ทั้งหมดในโปรเจกต์ — โมดูลอื่นรับตัวนี้ตัวเดียว"""

    def __init__(self, cfg):
        self.cfg = cfg
        self.source = Path(cfg["project"]["source"])
        self.work = Path(cfg["project"]["work"])
        self.out = Path(cfg["project"]["out"])
        self.work.mkdir(parents=True, exist_ok=True)

    @property
    def manifest(self):
        return self.work / "manifest.json"

    @property
    def transcript(self):
        return self.work / "transcript.json"

    @property
    def edl(self):
        return self.work / "edl.json"

    @property
    def audio_dir(self):
        return self.work / "audio"

    @property
    def seg_dir(self):
        return self.work / "segments"

    @property
    def thumb_dir(self):
        return self.work / "thumbs"

    def get(self, path, default=None):
        node = self.cfg
        for k in path.split("."):
            if not isinstance(node, dict) or k not in node:
                return default
            node = node[k]
        return node
