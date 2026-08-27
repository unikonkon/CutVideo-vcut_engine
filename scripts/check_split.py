#!/usr/bin/env python3
"""ด่านของชั้นแบ่งจอสองคน (รอบ 6)

หกคำถามที่ด่านนี้ตอบ:

  1. **ชิ้นที่ไม่ได้แบ่งจอได้กุญแจเดิมเป๊ะ** — key_of แฮช json ทั้งก้อน คีย์ใหม่
     ที่ค่าเป็นค่าว่างก็เปลี่ยนกุญแจ ผลคือ cache ของทุกโปรเจกต์ถูกทิ้งพร้อมกัน
     ตอนอัปเดตเอนจิน โดยที่ไม่มีใครตั้งอะไรใหม่เลยสักค่า
  2. ตั้งไม่ครบ (มีทิศแต่ไม่มีไฟล์ หรือกลับกัน) = ไม่นับว่าถูกแตะ
  3. แก้คลิปที่สองแล้วกุญแจต้องเปลี่ยน — ไม่งั้น cache คืนของเก่าให้เงียบ ๆ
  4. เรนเดอร์จริงแล้ว **สองครึ่งเป็นคนละคลิปจริง** และเฟรมครบ
  5. split_at เลื่อนจุดเริ่มของคลิปที่สองจริง
  6. **คลิปที่สองสั้นกว่าแล้วต้องค้างเฟรม ไม่ใช่ตัดชิ้นให้สั้นตาม** — ขึ้นกับ
     shortest ของ vstack ตัวเดียว ซึ่งเป็นค่าที่เผลอเปลี่ยนได้ง่ายมากเวลาไปแก้
     สายฟิลเตอร์ด้วยเหตุผลอื่น

รัน:  python3 scripts/check_split.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import config, fx  # noqa: E402
from vcut_engine.util import key_of  # noqa: E402

FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FAILED = []


def check(name, got, want):
    if got != want:
        FAILED.append(f"{name}\n     ได้  {got!r}\n     ควร {want!r}")
    return got == want


def sh(cmd):
    return subprocess.run([str(x) for x in cmd], capture_output=True,
                          text=True, check=True)


def ctx_for(root):
    return config.Ctx(config.load(None, [
        f"project.source={root}/src", f"project.work={root}/wk",
        f"project.out={root}/final.mp4",
        "video.width=1080", "video.height=1920", "video.fps=30"]))


# ─── 1 · กุญแจของชิ้นที่ไม่ได้แบ่งจอ ────────────────────────────────────────
print("1 · ชิ้นที่ไม่แบ่งจอได้กุญแจเดิม")
n1 = 0
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    (td / "src").mkdir()
    ctx = ctx_for(td)
    src = td / "src" / "seg.mov"
    src.write_bytes(b"x" * 4096)

    def want_key(f, frames=90):
        """กุญแจที่ *ควร* ได้ ประกอบจากหกคีย์เดิมล้วน — ไม่มีอะไรของรอบ 6 ปน"""
        from vcut_engine.render import encode_args, seg_audio_args
        st = src.stat()
        return key_of({
            "src": src.name, "sig": [st.st_size, int(st.st_mtime)],
            "frames": int(frames),
            "vf": fx.seg_vfilter(f, ctx, frames),
            "af": fx.seg_afilter(f, frames / fx._fps(ctx)),
            "enc": encode_args(ctx, audio=False) + seg_audio_args(ctx),
            "fps": ctx.get("video.fps"),
        })

    plain = [
        dict(fx.CLIP),
        {**fx.CLIP, "speed": 2.0, "zoom": 1.4, "grade": "warm"},
        {**fx.CLIP, "glitch": 0.8, "whip": 0.5, "zoom_to": 2.0, "pan": "r"},
        # ตั้งค้างไว้ไม่ครบ — ยังต้องได้กุญแจเดียวกับที่ไม่ได้ตั้งอะไรเลย
        {**fx.CLIP, "split": "v"},
        {**fx.CLIP, "split_with": "ไม่มีไฟล์นี้.mp4"},
        {**fx.CLIP, "split_at": 12.0},
        # ตั้งครบแต่ไฟล์ไม่มีอยู่จริง — แบ่งจอไม่ได้ ต้องได้กุญแจเดิมเหมือนกัน
        {**fx.CLIP, "split": "h", "split_with": "หาย.mp4", "split_at": 3.0},
    ]
    for i, f in enumerate(plain):
        n1 += check(f"ชุดที่ {i + 1} ได้กุญแจเดิม",
                    fx.seg_key(ctx, src, f, 90), want_key(f))
print(f"   {n1}/7")

# ─── 2 · ตั้งไม่ครบ = ไม่ถูกแตะ ─────────────────────────────────────────────
print("2 · ตั้งไม่ครบไม่นับว่าถูกแตะ")
n2 = 0
n2 += check("มีทิศแต่ไม่มีไฟล์", fx.touched({**fx.CLIP, "split": "v"}), False)
n2 += check("มีไฟล์แต่ไม่มีทิศ", fx.touched({**fx.CLIP, "split_with": "A.mp4"}), False)
n2 += check("ตั้งเวลาอย่างเดียว", fx.touched({**fx.CLIP, "split_at": 9.0}), False)
n2 += check("ครบทั้งคู่", fx.touched({**fx.CLIP, "split": "v",
                                     "split_with": "A.mp4"}), True)
n2 += check("ทิศที่ไม่รู้จักถูกดัดเป็นปิด",
            fx._pick({"split": "diagonal"}, fx.CLIP)["split"], "")
print(f"   {n2}/5")

# ─── 3–6 · เรนเดอร์จริง ────────────────────────────────────────────────────
if not Path(FF).exists():
    print("3–6 · ข้าม — ไม่มี ffmpeg-full ในเครื่องนี้")
else:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src, seg = td / "src", td / "seg"
        src.mkdir(); seg.mkdir()
        ctx = ctx_for(td)

        # คลิปหลัก = ชิ้นของขั้น 3 · เทาเข้มคงที่ 40 ทั้งเฟรม
        sh([FF, "-nostdin", "-v", "error", "-f", "lavfi",
            "-i", "color=c=0x282828:s=1080x1920:d=4:r=30",
            "-f", "lavfi", "-i", "sine=f=440:d=4",
            "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac", "-shortest", "-y", str(seg / "main.mov")])
        # คลิปคู่ = ความสว่างไล่ตามเวลา 25 ระดับ/วินาที — อ่านค่าพิกเซลแล้วรู้
        # ทันทีว่าเฟรมนั้นมาจากวินาทีที่เท่าไรของต้นฉบับ ไม่ต้องอ่านตัวเลขจากภาพ
        # คลิปคู่ที่มีจัตุรัสขาว 400×400 กลางจอ — ใช้วัดว่าถูกยืดหรือถูกครอบ
        sh([FF, "-nostdin", "-v", "error", "-f", "lavfi",
            "-i", "color=c=black:s=1080x1920:d=4:r=30",
            "-vf", "drawbox=x=340:y=760:w=400:h=400:color=white:t=fill",
            "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
            "-y", str(src / "SQ.mp4")])
        for name, dur in (("PAIR.mp4", 12.0), ("SHORT.mp4", 2.0)):
            sh([FF, "-nostdin", "-v", "error", "-f", "lavfi",
                "-i", f"color=c=black:s=1080x1920:d={dur}:r=30",
                "-vf", "geq=lum='clip(T*25\\,0\\,255)':cb=128:cr=128",
                "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
                "-y", str(src / name)])

        def build(f, frames, out):
            ok, msg = fx.render_one(ctx, seg / "main.mov", f, frames, td / out)
            if not ok:
                FAILED.append(f"render {out} ไม่สำเร็จ\n     {msg}")
            return td / out

        def probe(path):
            r = sh(["ffprobe", "-v", "error", "-count_packets", "-select_streams",
                    "v:0", "-show_entries", "stream=nb_read_packets,width,height",
                    "-of", "csv=p=0", str(path)])
            w, h, nb = r.stdout.strip().split(",")
            return int(w), int(h), int(nb)

        def luma(path, t, x, y):
            """ค่าความสว่างของพิกเซลเดียวที่เวลา t — ใช้อ่านว่าครึ่งล่างเป็นเฟรมไหน"""
            out = subprocess.run(
                [FF, "-nostdin", "-v", "error", "-ss", f"{t:.3f}", "-i", str(path),
                 # format=gray *ก่อน* crop — บนภาพ yuv420p ที่เก็บสีครึ่ง
                 # ความละเอียด ffmpeg ปัดขนาดที่ขอเป็น 0 แล้วปฏิเสธทั้งสาย
                 "-frames:v", "1", "-vf", f"format=gray,crop=w=1:h=1:x={x}:y={y}",
                 "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                capture_output=True, check=True).stdout
            return out[0] if out else -1

        print("3 · แก้คลิปที่สองแล้วกุญแจเปลี่ยน")
        n3 = 0
        base = {**fx.CLIP, "split": "v", "split_with": "PAIR.mp4", "split_at": 0.0}
        k0 = fx.seg_key(ctx, seg / "main.mov", base, 90)
        n3 += check("เปลี่ยนไฟล์คู่",
                    fx.seg_key(ctx, seg / "main.mov",
                               {**base, "split_with": "SHORT.mp4"}, 90) != k0, True)
        n3 += check("เปลี่ยนเวลาเริ่ม",
                    fx.seg_key(ctx, seg / "main.mov",
                               {**base, "split_at": 5.0}, 90) != k0, True)
        n3 += check("เปลี่ยนทิศ",
                    fx.seg_key(ctx, seg / "main.mov",
                               {**base, "split": "h"}, 90) != k0, True)
        n3 += check("ค่าเดิมได้กุญแจเดิม",
                    fx.seg_key(ctx, seg / "main.mov", base, 90), k0)
        print(f"   {n3}/4")

        print("4 · สองครึ่งเป็นคนละคลิปจริง")
        n4 = 0
        v = build(base, 90, "v.mov")
        n4 += check("ขนาดกับจำนวนเฟรมถูก", probe(v), (1080, 1920, 90))
        # ครึ่งบน = คลิปหลัก (เทาคงที่) · ครึ่งล่าง = คลิปคู่ (สว่างขึ้นตามเวลา)
        #
        # เทียบ *พฤติกรรมตามเวลา* ไม่ใช่ค่าสัมบูรณ์ — ชิ้นถูกเข้ารหัสด้วย
        # color_range tv แล้วอ่านกลับผ่าน format=gray ค่าจึงถูกยืดด้วย 255/219
        # การผูกด่านไว้กับตัวเลขดิบแปลว่ามันจะพังตอนใครเปลี่ยนค่า color_range
        # ทั้งที่ฟีเจอร์ยังทำงานถูกต้อง
        top1, top2 = luma(v, 0.5, 540, 400), luma(v, 2.5, 540, 400)
        bot1, bot2 = luma(v, 0.5, 540, 1400), luma(v, 2.5, 540, 1400)
        n4 += check("ครึ่งบนเป็นคลิปหลัก (สว่างคงที่)", abs(top1 - top2) <= 3, True)
        n4 += check("ครึ่งล่างเป็นคลิปคู่ (สว่างขึ้นตามเวลา)", bot2 - bot1 > 30, True)
        h = build({**base, "split": "h"}, 90, "h.mov")
        n4 += check("แบ่งซ้าย-ขวาก็เฟรมครบ", probe(h), (1080, 1920, 90))
        n4 += check("ซ้ายเป็นคลิปหลัก ขวาเป็นคลิปคู่",
                    abs(luma(h, 1.0, 270, 960) - luma(h, 1.0, 810, 960)) > 20, True)
        print(f"   {n4}/5")

        print("5 · split_at เลื่อนจุดเริ่มของคลิปคู่")
        n5 = 0
        v6 = build({**base, "split_at": 6.0}, 90, "v6.mov")
        a0, a6 = luma(v, 0.5, 540, 1400), luma(v6, 0.5, 540, 1400)
        # ไล่ 25 ระดับ/วินาที → เลื่อนไป 6 วินาทีต้องสว่างขึ้นอย่างน้อย 100
        # (ไม่ผูกกับตัวเลขเป๊ะด้วยเหตุผลเดียวกับข้อ 4 — range ถูกยืดตอนเข้ารหัส)
        n5 += check("เลื่อนไป 6 วิ แล้วสว่างขึ้นมาก", a6 - a0 > 100, True)
        print(f"   {n5}/1  (ได้ {a0} → {a6})")

        print("5b · ครึ่งของคลิปคู่ไม่ถูกยืด")
        n5b = 0
        # แบ่งซ้าย-ขวา: ช่องกว้าง 540 สูง 1920 สัดส่วน 0.28 ส่วนต้นฉบับ 0.5625
        # ต่างกันมากพอที่การยืดจะทำให้จัตุรัส 400×400 กลายเป็น 200×400
        sq = build({**fx.CLIP, "split": "h", "split_with": "SQ.mp4"}, 60, "sq.mov")
        buf = subprocess.run(
            [FF, "-nostdin", "-v", "error", "-i", str(sq), "-frames:v", "1",
             "-vf", "format=gray,crop=w=540:h=1920:x=540:y=0",
             "-f", "rawvideo", "-pix_fmt", "gray", "-"],
            capture_output=True, check=True).stdout
        rows = [y for y in range(1920) if max(buf[y * 540:(y + 1) * 540]) > 128]
        cols = [x for x in range(540) if max(buf[y * 540 + x]
                                             for y in range(0, 1920, 8)) > 128]
        sw = (cols[-1] - cols[0] + 1) if cols else 0
        sh_ = (rows[-1] - rows[0] + 1) if rows else 0
        n5b += check("จัตุรัสยังเป็นจัตุรัส", abs(sw - sh_) <= 4, True)
        n5b += check("ขนาดยังเท่าต้นฉบับ (ครอบ ไม่ใช่ย่อ)", abs(sw - 400) <= 4, True)
        print(f"   {n5b}/2  (ได้ {sw}×{sh_})")

        print("6 · คลิปคู่สั้นกว่าแล้วค้างเฟรม ไม่ตัดชิ้นให้สั้นตาม")
        n6 = 0
        # คลิปคู่ยาว 2 วิ · ชิ้นขาออก 30 เฟรม (1 วิ) ที่ speed 8 → กินอินพุต 8 วิ
        # คลิปคู่จึงหมดตั้งแต่หนึ่งในสี่แรก  ถ้า vstack ถูกตั้ง shortest=1 ชิ้น
        # ทั้งชิ้นจะถูกตัดเหลือแค่ช่วงที่คลิปคู่ยังมีเฟรมให้
        fast = build({**fx.CLIP, "split": "v", "split_with": "SHORT.mp4",
                      "speed": 8.0}, 30, "fast.mov")
        n6 += check("เฟรมครบแม้คลิปคู่สั้นกว่าที่ต้องใช้ 4 เท่า",
                    probe(fast)[2], 30)
        # และครึ่งล่างต้อง *ค้าง* ที่เฟรมสุดท้ายของคลิปคู่จริง — เดินหน้าไปได้
        # ถึงวินาทีที่ 2 ของคลิปคู่ (= 0.25 วิของขาออก) แล้วนิ่งไปจนจบ
        early, mid, late = (luma(fast, 0.03, 540, 1400),
                            luma(fast, 0.5, 540, 1400),
                            luma(fast, 0.9, 540, 1400))
        n6 += check("ครึ่งล่างเดินหน้าก่อนแล้วค้าง ไม่ใช่ดำและไม่ใช่วนกลับ",
                    (mid > early + 20, abs(mid - late) <= 3), (True, True))
        print(f"   {n6}/2")

print()
if FAILED:
    print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
    for f in FAILED:
        print(f"   · {f}")
    sys.exit(1)
print("ผ่านหมด")
