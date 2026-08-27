#!/usr/bin/env python3
"""ตรวจเอฟเฟกต์รายชิ้นของขั้น 5 — สายฟิลเตอร์ที่ fx.seg_vfilter() ประกอบออกมา

    python3 scripts/check_clip_fx.py

ออก 0 = ผ่านหมด · 1 = มีข้อที่ตก

ตรวจสามเรื่องที่พังแล้วไม่มีอะไรฟ้อง:

**1 · ค่าชุดเดิมต้องได้สายเดิมทุกตัวอักษร**

seg_key() แฮชสตริงฟิลเตอร์ไปเป็นชื่อไฟล์ cache — สายเปลี่ยนแม้แต่ตัวอักษรเดียว
แปลว่าโปรเจกต์ที่มีอยู่ทุกโปรเจกต์ถูก render ใหม่ทั้งกองตอนอัปเดตเอนจิน โดยได้
ภาพเหมือนเดิมเป๊ะ  ค่าทองด้านล่างจึงถูกแช่ไว้ ห้ามแก้ตามโค้ด — ถ้าตรงนี้ตก
ให้กลับไปแก้โค้ดให้ออกมาเหมือนเดิม ไม่ใช่มาแก้ค่าทองให้ตรงกับโค้ด

**2 · zoompan ต้องอยู่ก่อน setpts**

zoompan สร้างไทม์ไลน์ของตัวเองที่อัตรา fps แล้วทิ้ง PTS ขาเข้า วางไว้หลัง setpts
เมื่อไรมันจะลบผลของความเร็วทิ้งเงียบ ๆ  วัดจริงตอนทำ: ช็อต 90 เฟรม speed=2
ควรได้เฟรม 0–89 ย่อเหลือ 45 เฟรม แต่ได้เฟรม 0–44 ที่ความเร็วปกติแทน
**จำนวนเฟรมยังถูกต้อง 45** เพราะท้ายสาย trim ให้ ด่านความยาวจึงจับไม่ได้เลย
ครึ่งหลังของช็อตหายไปโดยไม่มีใครรู้จนกว่าจะมีคนนั่งดูไฟล์

**3 · ทุกชุดค่าต้องได้จำนวนเฟรมตรงเป๊ะ**

ฟิลเตอร์ใหม่ที่ทำจำนวนเฟรมเพี้ยนจะทำให้ภาพกับเสียงหลุดกันสะสมทีละชิ้น
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import caption, fx  # noqa: E402

W = H = 640
FPS = 30
SRC_FRAMES = 90


class Ctx(dict):
    def get(self, k, d=None):
        return dict.get(self, k, d)


CTX = Ctx({"video.width": W, "video.height": H, "video.fps": str(FPS),
           "video.scale_flags": "lanczos"})

TAIL = (f"tpad=stop_mode=clone:stop_duration=0.5,fps={FPS},"
        "trim=end_frame=90,setpts=PTS-STARTPTS,setsar=1,format=yuv420p")

# ── ค่าทอง — สายที่ต้องได้จากค่าชุดที่มีมาก่อนเฟส E (ห้ามแก้ตามโค้ด) ──
GOLDEN = {
    (): TAIL,
    (("speed", 2.0),): f"setpts=PTS/2.000000,{TAIL}",
    (("zoom", 1.3),): ("scale=w=ceil(iw*1.3000/2)*2:h=ceil(ih*1.3000/2)*2:"
                       f"flags=lanczos,crop={W}:{H},{TAIL}"),
    (("grade", "bw"),): f"hue=s=0,eq=contrast=1.08,{TAIL}",
    (("speed", 0.5), ("zoom", 1.2), ("grade", "warm")):
        ("setpts=PTS/0.500000,"
         "scale=w=ceil(iw*1.2000/2)*2:h=ceil(ih*1.2000/2)*2:flags=lanczos,"
         f"crop={W}:{H},"
         "colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:bm=-0.04,"
         f"eq=saturation=1.06,{TAIL}"),
}

# ── ชุดค่าที่ต้อง render ออกมาได้ครบเฟรม ──
RENDER = {
    "kenburns ซูมเข้า": {"zoom_to": 1.4},
    "kenburns ซูมออก": {"zoom": 1.4, "zoom_to": 1.0},
    "pan ขวา": {"zoom": 1.3, "pan": "r"},
    "pan ขึ้น": {"zoom": 1.3, "pan": "u"},
    "glitch เบา": {"glitch": 0.3},
    "glitch แรง": {"glitch": 0.8, "glitch_hz": 4.0},
    "whip": {"whip": 0.6},
    "ช็อตสั้นมาก + whip": {"whip": 1.0},
    "รวมทุกชั้น": {"speed": 0.5, "zoom": 1.1, "zoom_to": 1.6, "pan": "l",
                   "grade": "punch", "glitch": 0.6, "whip": 0.4},
}


def ffmpeg():
    return caption.text_ffmpeg(CTX, quiet=True) or "ffmpeg"


def make_src(tmp):
    """ต้นทาง 90 เฟรม ที่ความสว่างของเฟรม N เท่ากับ 2N

    ใช้ความสว่างแทนตัวเลขที่วาดด้วย drawtext เพราะ drawtext อยู่ใน ffmpeg-full
    เท่านั้น — ด่านนี้ต้องทำงานได้บนเครื่องที่มีแต่ ffmpeg ธรรมดาด้วย
    """
    src = tmp / "src.mp4"
    subprocess.run(
        [ffmpeg(), "-nostdin", "-v", "error", "-y",
         "-f", "lavfi", "-i", f"nullsrc=s={W}x{H}:d=3:r={FPS}",
         "-vf", "format=gray,geq=lum='2*N',format=yuv420p",
         "-frames:v", str(SRC_FRAMES), "-c:v", "libx264", "-crf", "0",
         str(src)], check=True)
    return src


def luma(path, exe):
    """ความสว่างเฉลี่ยของเฟรมสุดท้าย → บอกว่ามันคือเฟรมที่เท่าไรของต้นทาง"""
    r = subprocess.run(
        [exe, "-v", "error", "-sseof", "-0.04", "-i", str(path),
         "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True)
    b = r.stdout
    return sum(b) / len(b) if b else -1.0


def render(exe, src, f, frames, dst):
    r = subprocess.run(
        [exe, "-nostdin", "-v", "error", "-y", "-i", str(src),
         "-vf", fx.seg_vfilter(f, CTX, frames), "-an",
         "-fps_mode", "cfr", "-r", str(FPS), "-t", f"{frames / FPS:.6f}",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(dst)],
        capture_output=True, text=True)
    if r.returncode != 0:
        return None, r.stderr.strip()[-200:]
    n = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(dst)],
        capture_output=True, text=True).stdout.strip()
    return int(n or 0), ""


def main():
    import tempfile
    fx._fps = lambda c: float(FPS)
    bad = []

    # ── 1 · ค่าชุดเดิมต้องได้สายเดิม ──
    for over, want in GOLDEN.items():
        got = fx.seg_vfilter({**fx.CLIP, **dict(over)}, CTX, 90)
        if got != want:
            bad.append(f"สายฟิลเตอร์เปลี่ยนสำหรับค่าเดิม {dict(over)}\n"
                       f"    ต้องได้ {want}\n    ได้จริง {got}")
    print(f"1 · ค่าชุดเดิมได้สายเดิม        {len(GOLDEN) - len(bad)}/{len(GOLDEN)}")

    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        exe = ffmpeg()
        src = make_src(tmp)

        # ── 2 · zoompan ต้องไม่ลบผลของ speed ──
        #
        # speed=2 บนต้นทาง 90 เฟรม → 45 เฟรม ที่ต้องกินต้นทางจนหมด
        # เฟรมสุดท้ายจึงต้องเป็นเฟรม 89 (สว่าง ~178) ไม่ใช่เฟรม 44 (~88)
        n_ok = 0
        for name, over in (("ไม่มี kenburns", {"speed": 2.0}),
                           ("มี kenburns", {"speed": 2.0, "zoom_to": 1.4}),
                           ("kenburns+pan", {"speed": 2.0, "zoom": 1.1,
                                             "zoom_to": 1.5, "pan": "r"})):
            dst = tmp / f"sp_{n_ok}.mp4"
            n, err = render(exe, src, {**fx.CLIP, **over}, 45, dst)
            if n is None:
                bad.append(f"render ไม่ผ่าน ({name}): {err}"); continue
            lu = luma(dst, exe)
            # เฟรม 89 = สว่าง 178 · เฟรม 44 = สว่าง 88 · เผื่อ ±14 ให้การบีบอัด
            if abs(lu - 178) > 14:
                bad.append(
                    f"{name}: เฟรมสุดท้ายสว่าง {lu:.0f} — ควรเป็น ~178 "
                    f"(เฟรม 89 ของต้นทาง)\n"
                    f"    ~88 แปลว่า zoompan ลบผลของ speed ทิ้ง ช็อตหายไปครึ่งหลัง\n"
                    f"    → zoompan ต้องอยู่ *ก่อน* setpts ใน seg_vfilter()")
            else:
                n_ok += 1
        print(f"2 · zoompan ไม่ลบผลของ speed   {n_ok}/3")

        # ── 3 · ทุกชุดค่าได้เฟรมครบ ──
        r_ok = 0
        for name, over in RENDER.items():
            frames = 6 if "สั้นมาก" in name else 90
            dst = tmp / "r.mp4"
            n, err = render(exe, src, {**fx.CLIP, **over}, frames, dst)
            if n is None:
                bad.append(f"render ไม่ผ่าน ({name}): {err}")
            elif n != frames:
                bad.append(f"{name}: ได้ {n} เฟรม ต้องได้ {frames}")
            else:
                r_ok += 1
        print(f"3 · จำนวนเฟรมตรงทุกชุดค่า      {r_ok}/{len(RENDER)}")

    if bad:
        print(f"\nตก {len(bad)} ข้อ\n")
        for b in bad:
            print("  · " + b)
        return 1
    print("\nผ่านหมด")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
