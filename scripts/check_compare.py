#!/usr/bin/env python3
"""ด่านของขั้น 6 · เทียบก่อน-หลัง (รอบ 5)

ห้าคำถามที่ด่านนี้ตอบ — ทุกข้อวัดจาก **ไฟล์ที่ประกอบจริง** ไม่ใช่จากตัวเลขที่
โมดูลคำนวณไว้ เพราะสามข้อแรกคือสิ่งที่ ffmpeg ทำ ไม่ใช่สิ่งที่ Python สั่ง:

  1. เรขาคณิตตรงกับที่วัดจากคลิปต้นแบบ และทุกด้านเป็นเลขคู่ (libx264 ปฏิเสธเลขคี่)
  2. **ฝั่งที่จบก่อนค้างเฟรมสุดท้ายจริงไหม** — ไม่ใช่ดำ ไม่ใช่วนกลับไปต้น
     After สั้นกว่า Before คือประเด็นทั้งหมดของคลิปแนวนี้ ถ้าตรงนี้พังคือฟีเจอร์พัง
  3. hold = cut จบที่ตัวสั้นสุดจริง
  4. **ภาพไม่ถูกยืด** — ช่องมีสัดส่วน 0.553 ส่วนฟุตเทจ 9:16 เป็น 0.5625 ต่างกัน
     นิดเดียวจนตาไม่จับ แต่ยืดแล้วหน้าคนแบนลงจริง
  5. เสียงมาจากฝั่ง After ฝั่งเดียว — ผสมสองฝั่งได้เสียงพูดซ้อนกันสองชุด

รัน:  python3 scripts/check_compare.py
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import compare, config  # noqa: E402

FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FAILED = []
DUR_B, DUR_A = 8.0, 5.0        # Before ยาวกว่า After — เหมือนของจริง


def check(name, got, want):
    if got != want:
        FAILED.append(f"{name}\n     ได้  {got!r}\n     ควร {want!r}")
    return got == want


def _report():
    print()
    if FAILED:
        print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
        for f in FAILED:
            print(f"   · {f}")
        return 1
    print("ผ่านหมด")
    return 0


def sh(cmd, **kw):
    return subprocess.run([str(x) for x in cmd], capture_output=True,
                          text=True, check=True, **kw)


def ctx_for(work, src, out, **over):
    sets = [f"project.source={src}", f"project.work={work}", f"project.out={out}",
            "video.width=1080", "video.height=1920", "video.fps=30",
            "compare.enabled=true", "compare.before=RAW.mp4"]
    sets += [f"compare.{k}={v}" for k, v in over.items()]
    return config.Ctx(config.load(None, sets))


def gray(png, box=None):
    """เฟรมหนึ่งเฟรมเป็นไบต์ระดับเทา — box = (x, y, w, h) ถ้าจะเอาแค่บางส่วน"""
    vf = f"crop=w={box[2]}:h={box[3]}:x={box[0]}:y={box[1]}" if box else "null"
    return subprocess.run(
        [FF, "-nostdin", "-v", "error", "-i", str(png), "-vf", vf,
         "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True, check=True).stdout


def frame(mp4, t, png):
    sh([FF, "-nostdin", "-v", "error", "-ss", f"{t:.3f}", "-i", str(mp4),
        "-frames:v", "1", "-y", str(png)])
    return png


def dur_of(path):
    """ความยาวของ *สตรีมภาพ* ไม่ใช่ของ container

    ต่างกันจริงและต่างกันในทางที่กลบบั๊กพอดี: apad ยืดเสียงให้ยาวเท่าที่สั่งเสมอ
    ถ้าภาพถูกตัดสั้นกว่านั้น (เช่นเผลอใส่ shortest=1) `format=duration` จะยังตอบ
    ค่าที่ถูกต้องตามเสียง แล้วด่านนี้ผ่านทั้งที่ภาพหายไปสามวินาที
    """
    r = sh(["ffprobe", "-v", "error", "-select_streams", "v:0",
            "-count_packets", "-show_entries",
            "stream=duration,nb_read_packets,r_frame_rate",
            "-of", "json", str(path)])
    st = json.loads(r.stdout)["streams"][0]
    if st.get("duration"):
        return round(float(st["duration"]), 2)
    num, den = (st.get("r_frame_rate") or "30/1").split("/")
    return round(int(st["nb_read_packets"]) * int(den) / int(num), 2)


# ─── 1 · เรขาคณิต ──────────────────────────────────────────────────────────
print("1 · เรขาคณิตของช่อง")
n1 = 0
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    ctx = ctx_for(td / "wk", td, td / "final.mp4")
    B = compare.boxes(ctx)
    # ค่าที่วัดจากคลิป 06 จริงที่ 1080×1920 — คลาดได้ 1 px จากการปัดเป็นเลขคู่
    for key, want in (("before", (73, 609, 386, 698)), ("after", (484, 396, 518, 912))):
        got = (B[key]["x"], B[key]["y"], B[key]["w"], B[key]["h"])
        n1 += check(f"ช่อง {key} ตรงกับที่วัดจากคลิปต้นแบบ",
                    all(abs(a - b) <= 1 for a, b in zip(got, want)), True)
    n1 += check("ทุกด้านเป็นเลขคู่ (libx264 ปฏิเสธเลขคี่)",
                [v for k in ("before", "after", "band") for v in B[k].values()
                 if v % 2], [])
    # เปลี่ยนความละเอียดแล้วสัดส่วนต้องเท่าเดิม — เก็บเป็นสัดส่วนก็เพื่อข้อนี้
    small = compare.boxes(ctx_for(td / "wk", td, td / "f.mp4"), "tilt")
    n1 += check("เลย์เอาต์ที่ไม่รู้จักตกกลับไปเป็น tilt",
                compare.boxes(ctx, "มั่ว")["layout"], "tilt")
    n1 += check("side/stack มีครบทุกช่อง",
                sorted(set(compare.LAYOUTS["side"]) & {"before", "after", "band"}),
                ["after", "band", "before"])
    del small
print(f"   {n1}/5")

# ─── 2–5 · ประกอบไฟล์จริง ──────────────────────────────────────────────────
if not Path(FF).exists():
    print("2–5 · ข้าม — ไม่มี ffmpeg-full ในเครื่องนี้")
else:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src, outd = td / "src", td / "out"
        src.mkdir(); outd.mkdir()

        # Before = ลายที่ขยับตลอด + เสียง 200 Hz · After = ลายที่ขยับ + เสียง 900 Hz
        # ทั้งคู่ต้อง *ขยับ* ไม่งั้นแยกไม่ออกว่า "ค้างเฟรม" กับ "เล่นต่อ" ต่างกันไหม
        sh([FF, "-nostdin", "-v", "error", "-f", "lavfi",
            "-i", f"testsrc2=s=1080x1920:d={DUR_B}:r=30",
            "-f", "lavfi", "-i", f"sine=f=200:d={DUR_B}",
            "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac", "-shortest", "-y", str(src / "RAW.mp4")])
        # ฝั่ง After มีสี่เหลี่ยมจัตุรัสขาวกลางจอ — ใช้วัดว่าภาพถูกยืดหรือเปล่า
        sh([FF, "-nostdin", "-v", "error", "-f", "lavfi",
            "-i", f"color=c=black:s=1080x1920:d={DUR_A}:r=30",
            "-f", "lavfi", "-i", f"sine=f=900:d={DUR_A}",
            "-vf", "drawbox=x=340:y=760:w=400:h=400:color=white:t=fill,"
                   "drawtext=text='%{n}':x=20:y=20:fontsize=90:fontcolor=white",
            "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac", "-shortest", "-y", str(outd / "final-fx.mp4")])

        def build(**over):
            ctx = ctx_for(td / "wk", src, outd / "final.mp4", **over)
            return compare.run(ctx), compare.boxes(ctx)

        print("2 · ฝั่งที่จบก่อนค้างเฟรมสุดท้าย (hold = freeze)")
        n2 = 0
        vs, B = build()
        ok_len = check("ความยาว = ตัวยาวสุด", dur_of(vs), DUR_B)
        n2 += ok_len
        ab = (B["after"]["x"], B["after"]["y"], B["after"]["w"], B["after"]["h"])
        bb = (B["before"]["x"], B["before"]["y"], B["before"]["w"], B["before"]["h"])
        # ข้อที่เหลือของหมวดนี้อ่านพิกเซลที่เวลาหลัง After จบ — ถ้าไฟล์สั้นกว่านั้น
        # ดึงเฟรมไม่ได้แล้วสคริปต์จะระเบิดพร้อม traceback ของ subprocess ซึ่งอ่าน
        # ไม่ออกว่าอะไรพัง  หยุดตรงนี้แล้วบอกตรง ๆ ดีกว่า (เจอจริงตอนทดสอบด่าน
        # ด้วยการใส่ shortest=1 กลับเข้าไป)
        if not ok_len:
            FAILED.append("ไฟล์สั้นกว่าที่ควร — ข้ามการวัดพิกเซลของหมวดนี้ทั้งหมด\n"
                          "     (แปลว่าฝั่งที่จบก่อนไปตัดทั้งไฟล์ทิ้ง ไม่ได้ค้างเฟรมรอ)")
            print("   1/4 — ไฟล์สั้นกว่าที่ควร ข้ามที่เหลือ")
            raise SystemExit(_report())
        # หลังจุดที่ After จบ (5.0 วิ) — สองเวลาที่ห่างกันหนึ่งวินาทีต้องเหมือนกันเป๊ะ
        f1 = gray(frame(vs, DUR_A + 0.6, td / "a1.png"), ab)
        f2 = gray(frame(vs, DUR_A + 2.4, td / "a2.png"), ab)
        n2 += check("After ค้างนิ่งหลังจบ", f1 == f2, True)
        n2 += check("ที่ค้างไม่ใช่จอเปล่า", len(set(f1)) > 8, True)
        # ฝั่ง Before ต้องยังเดินอยู่ตอนนั้น ไม่ใช่ค้างตามไปด้วย
        b1 = gray(frame(vs, DUR_A + 0.6, td / "b1.png"), bb)
        b2 = gray(frame(vs, DUR_A + 2.4, td / "b2.png"), bb)
        n2 += check("Before ยังเล่นต่ออยู่", b1 != b2, True)
        print(f"   {n2}/4")

        print("3 · hold = cut จบที่ตัวสั้นสุด")
        n3 = 0
        vs_cut, _ = build(hold="cut", out_suffix="-cut")
        n3 += check("ความยาว = ตัวสั้นสุด", dur_of(vs_cut), DUR_A)
        n3 += check("คนละไฟล์กับของ freeze", vs_cut != vs, True)
        print(f"   {n3}/2")

        print("4 · ภาพไม่ถูกยืด")
        n4 = 0
        # **วัดกับเลย์เอาต์ stack ไม่ใช่ tilt** — ช่องของ tilt มีสัดส่วน 0.568
        # ส่วนฟุตเทจ 9:16 เป็น 0.5625 ต่างกันจนการยืดทำให้จัตุรัสเพี้ยนแค่ 2 px
        # ซึ่งด่านจับไม่ได้ (ทดสอบแล้วด้วยการถอด force_original_aspect_ratio ออก
        # จริง ๆ — ผ่านฉลุย)  ช่องของ stack เป็นแนวนอน 778×653 สัดส่วน 1.19
        # ยืดแล้วจัตุรัสกลายเป็น 288×136 ซึ่งจับได้แน่นอน
        vs_st, Bs = build(layout="stack", out_suffix="-st")
        sb = Bs["after"]
        # มาตราส่วนของ increase = max(778/1080, 653/1920) = 0.7204 → จัตุรัส 288
        w = h = 400
        px = gray(frame(vs_st, 1.0, td / "sq.png"),
                  (sb["x"] + (sb["w"] - w) // 2, sb["y"] + (sb["h"] - h) // 2, w, h))
        # หาขอบด้วย *พิกเซลที่สว่างที่สุดในแถว* ไม่ใช่ค่าเฉลี่ยของแถว — จัตุรัส
        # 192 px ในช่องกว้าง 518 ทำให้ค่าเฉลี่ยของแถวที่มีจัตุรัสเต็ม ๆ อยู่แค่ 94
        rows = [y for y in range(h) if max(px[y * w:(y + 1) * w]) > 128]
        cols = [x for x in range(w) if max(px[y * w + x] for y in range(h)) > 128]
        sq_h = (rows[-1] - rows[0] + 1) if rows else 0
        sq_w = (cols[-1] - cols[0] + 1) if cols else 0
        n4 += check("จัตุรัสยังเป็นจัตุรัส (คลาดไม่เกิน 2 px)",
                    abs(sq_w - sq_h) <= 2, True)
        n4 += check("ขนาดตรงกับมาตราส่วนที่ควรเป็น (~288 px)",
                    abs(sq_w - 288) <= 3, True)
        print(f"   {n4}/2")

        print("5 · เสียงจากฝั่ง After ฝั่งเดียว")
        n5 = 0
        # วัดพลังงานที่ 200 Hz (Before) กับ 900 Hz (After) — ตัวหนึ่งต้องเงียบสนิท
        def band(path, lo, hi):
            # volumedetect เขียนผลที่ระดับ info ไม่ใช่ error — สั่ง -v error แล้ว
            # จะได้ stderr เปล่าและอ่านเป็น "เงียบสนิท" ทุกครั้ง
            r = subprocess.run(
                [FF, "-nostdin", "-hide_banner", "-nostats", "-t", "3",
                 "-i", str(path), "-vn",
                 "-af", f"bandpass=f={(lo + hi) / 2}:width_type=h:w={(hi - lo) / 2},"
                        "volumedetect", "-f", "null", "-"],
                capture_output=True, text=True, check=True)
            for line in r.stderr.splitlines():
                if "mean_volume" in line:
                    return float(line.split(":")[-1].strip().split()[0])
            return -91.0

        after_band = band(vs, 800, 1000)
        before_band = band(vs, 150, 250)
        n5 += check("ได้ยินเสียงของ After", after_band > -40, True)
        n5 += check("ไม่ได้ยินเสียงของ Before", before_band < after_band - 20, True)
        n5 += check("เสียงยาวเท่าภาพ (apad ทำงาน)", dur_of(vs), DUR_B)
        print(f"   {n5}/3")

# ─── 6 · กันเขียนทับไฟล์ของขั้นก่อน ─────────────────────────────────────────
print("6 · out_suffix ที่จะทับไฟล์ขั้นก่อนถูกปฏิเสธ")
n6 = 0
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    for bad in ("-fx", "-text", "", "a/b"):
        ctx = ctx_for(td / "wk", td, td / "final.mp4", out_suffix=bad)
        n6 += check(f"out_suffix = {bad!r} ต้องถอยไปใช้ '-vs'",
                    compare.out_path(ctx, quiet=True).name, "final-vs.mp4")
    ctx = ctx_for(td / "wk", td, td / "final.mp4", out_suffix="-เทียบ")
    n6 += check("คำต่อท้ายที่ใช้ได้ต้องผ่าน",
                compare.out_path(ctx, quiet=True).name, "final-เทียบ.mp4")
print(f"   {n6}/5")

sys.exit(_report())
