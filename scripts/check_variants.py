#!/usr/bin/env python3
"""ด่านของ "ตัดหลายแบบ" (variants · autofx · fit · split_long · silence auto)

ทดสอบเฉพาะส่วนที่เป็นตรรกะล้วน ไม่ยิง ffmpeg — ด่านนี้รันได้ในไม่กี่วินาที
(การรันจริงกับคลิปตัวอย่างดู docs/PLAN-quick-cut.md)

  1. split_long ซอยช่วงพูด 101 วิ ตามรอยต่อท่อน whisper → ทุกชิ้น ≤ max_shot
     (ยกเว้นท่อนเดียวที่ยาวเกินเพดานเอง) และไม่ตัดกลางท่อน
  2. mode_fit ได้ความยาวไม่เกินเป้า ไม่ใช่ 0 ชิ้น และเรียงตามเวลา
  3. silence.noise_for คิดเกณฑ์จาก lufs ของคลิป · ตกกลับค่าคงที่เมื่อไม่รู้
  4. autofx.burst_runs เจอชุดยิงรัวถูกช่วง · _lines_of ไม่หั่นกลางวลี
  5. autofx.strip ถอดเฉพาะชิ้น auto-* ไม่แตะของคน
  6. variants.CATALOG ทุกคีย์ใน set มีอยู่ใน settings.FIELD_BY_KEY (บันทึกผ่านฟอร์มได้)

รัน:  python3 scripts/check_variants.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import autofx, compose, fx, prepare, settings, silence, variants  # noqa: E402

fails = 0


def check(cond, msg):
    global fails
    print(f"   {'ok ' if cond else 'FAIL'} {msg}")
    if not cond:
        fails += 1


# ── 1 · split_long ──
print("1 · split_long")
segs = [[0.0, 3.0, "a"], [3.0, 4.0, "b"], [4.0, 6.0, "c"], [6.0, 9.0, "d"], [9.0, 11.0, "e"],
        [11.0, 13.0, "f"], [13.0, 28.0, "g-ยาว 15 วิ"], [28.0, 31.0, "h"], [31.0, 36.0, "i"]]
parts = prepare.split_long([(0.0, 36.0, 0)], segs, 8.0, 1.2)
ends = {e for _, e, _ in segs}
check(len(parts) > 3, f"ซอยได้ {len(parts)} ชิ้น")
check(all(b in ends or b == 36.0 for _, b, _ in parts), "ทุกรอยตัดอยู่ที่ท้ายท่อน whisper")
check(all(b - a <= 15.0 + 1e-6 for a, b, _ in parts), "ไม่มีชิ้นยาวกว่าท่อนที่ยาวสุด")
check(sum(1 for a, b, _ in parts if b - a > 8.0) <= 1, "เกินเพดานได้แค่ท่อนเดียวที่ยาวเองอยู่แล้ว")
check(len({g for _, _, g in parts}) == len(parts), "ชิ้นที่ซอยแล้วไม่ถูกล็อกเป็นประโยคเดียวกัน")
check(prepare.split_long([(0.0, 5.0, 0)], segs, 0.0, 1.2) == [(0.0, 5.0, 0)], "max_shot = 0 ไม่แตะ")


# ── 2 · mode_fit ──
print("2 · mode_fit")


class Ctx:
    def __init__(self, cfg):
        self.cfg = cfg

    def get(self, k, d=None):
        return settings.get_at(self.cfg, k, d)


pool = []
for i, (a, b) in enumerate([(0, 6), (6, 11), (11, 15), (15, 18), (18, 22), (22, 28), (28, 31),
                            (31, 46), (46, 49), (49, 53), (53, 58)]):
    pool.append({"id": f"x#{i}", "name": "x", "num": 0, "kind": "TALK", "start": float(a),
                 "end": float(b), "dur": float(b - a), "ok": True, "_seq": i,
                 "text": " ".join(f"w{i}{j}" for j in range(b - a))})
ctx = Ctx({"compose": {"mode": "fit", "target_minutes": 0.5, "pattern": ["TALK", "BROLL"]},
           "order": {"mode": "stage1"}})
compose.rank_of(pool)
picked, keeps, stats = compose.mode_fit(pool, ctx.cfg["compose"], ctx)
tot = sum(p["dur"] for p in picked)
check(0 < tot <= 30.0, f"เป้า 30 วิ ได้ {tot:.1f} วิ · {len(picked)} ชิ้น")
check([p["_seq"] for p in picked] == sorted(p["_seq"] for p in picked), "เรียงตามเวลาเดิม")
check("fit" in compose.MODES and "fit" in compose.PICKERS, "fit อยู่ใน MODES/PICKERS")


# ── 3 · silence auto ──
print("3 · silence.noise_for")
j = {"noise_db": -32.0, "auto_noise": True, "auto_offset": 15.0}
check(silence.noise_for({"lufs": -6.8}, j) == -21.8, "−6.8 LUFS − 15 = −21.8 dB")
check(silence.noise_for({"lufs": -70.0}, j) == -32.0, "ไม่รู้ความดัง → ค่าคงที่")
check(silence.noise_for({"lufs": -6.8}, {**j, "auto_noise": False}) == -32.0, "ปิด auto → ค่าคงที่")
check(silence.noise_for({"lufs": -60.0}, j) == silence.AUTO_LO, "ไม่ต่ำกว่าเพดานล่าง")


# ── 4 · autofx helpers ──
print("4 · autofx.burst_runs / _lines_of")
tl = [{"dur": 3.0}, {"dur": 1.0}, {"dur": 0.9}, {"dur": 1.1}, {"dur": 4.0}, {"dur": 1.0}, {"dur": 1.0}]
check(autofx.burst_runs(tl, 1.2) == [[1, 2, 3]], "เจอชุด 3 ช็อตสั้นติดกัน ไม่นับคู่ท้ายที่มีแค่ 2")
check(autofx.burst_runs(tl, 1.2, min_run=2) == [[1, 2, 3], [5, 6]], "min_run = 2 เจอทั้งสองชุด")
lines = autofx._lines_of("เดินลุยน้ำชิวชิวทางสะดวกมีเซเว็น ไปออกสะเต็บท่ามกลางสายฝน อยากไปฮิวใจ กับเพื่อน ในวันที่ท้อ")
check(1 <= len(lines) <= 3, f"ได้ {len(lines)} บรรทัด")
joined = " ".join(lines)
check(all(t in joined for t in ("เดินลุยน้ำชิวชิวทางสะดวกมีเซเว็น", "ไปออกสะเต็บท่ามกลางสายฝน")),
      "วลีไม่ถูกหั่นกลาง")
check(autofx._lines_of("") == [], "ข้อความว่าง → ไม่มีบรรทัด")
card = autofx.hook_card({"name": "x", "start": 0.0, "dur": 6.0, "text": "สวัสดี ทุกคน วันนี้"}, "sell")
check(card["id"] == autofx.ID_HOOK and card["anim"] == "pop_words" and card["dur"] <= 3.0,
      "การ์ด HOOK: id auto-hook · pop_words · ≤ 3 วิ")
check(any(v["color"] == autofx.RED for v in card["lines"]), "มีบรรทัดเน้นแดง")
cc = autofx.close_card({"name": "x", "start": 10.0, "end": 12.5, "dur": 2.5}, "", "proj")
check(cc["at"] == 10.0 and cc["dur"] == 2.5 and "@proj" in cc["text"], "การ์ดปิดไม่ยาวกว่าช็อตท้าย · ใช้ชื่อโปรเจกต์")


# ── 5 · strip ──
print("5 · autofx.strip")
data = fx.blank()
data["texts"] = [fx._text({"id": "auto-hook", "name": "x", "text": "h"}),
                 fx._text({"id": "t1", "name": "x", "text": "ของคน"})]
data["music"] = [fx._music({"id": "auto-music", "file": "a.m4a"}),
                 fx._music({"id": "m9", "file": "b.m4a"})]
data["clips"] = {"x@0.000+1.000": {**fx.CLIP, "zoom": 1.05, "zoom_to": 1.22, "grade": "punch"},
                 "x@1.000+1.000": {**fx.CLIP, "zoom": 1.05, "zoom_to": 1.22, "grade": "punch",
                                   "speed": 0.5}}
out = autofx.strip(data, {"texts": ["auto-hook"], "music": ["auto-music"],
                          "clips": ["x@0.000+1.000", "x@1.000+1.000"]})
check([t["id"] for t in out["texts"]] == ["t1"], "ถอดเฉพาะข้อความ auto-")
check([m["id"] for m in out["music"]] == ["m9"], "ถอดเฉพาะเพลง auto-")
check("x@0.000+1.000" not in out["clips"], "ชิ้นที่มีแต่ค่าของ burst หายทั้งชิ้น")
check(out["clips"]["x@1.000+1.000"]["speed"] == 0.5 and out["clips"]["x@1.000+1.000"]["grade"] == "",
      "ชิ้นที่คนตั้ง speed ไว้ยังอยู่ · ถอดเฉพาะ zoom/grade")


# ── 6 · CATALOG ↔ FIELDS ──
print("6 · variants.CATALOG")
for v in variants.CATALOG:
    missing = [k for k in v["set"] if k not in settings.FIELD_BY_KEY]
    check(not missing, f"{v['id']}: คีย์ใน set รู้จักทั้งหมด" + (f" (ขาด {missing})" if missing else ""))
check(variants.DEFAULT_ID in variants.BY_ID, "แบบตั้งต้นอยู่ใน CATALOG")
opt = settings.FIELD_BY_KEY["variants.ids"]["options"]
check(sorted(opt) == sorted(variants.BY_ID), "ตัวเลือก variants.ids ตรงกับ CATALOG")
for k in ("autofx.style", "autofx.hook", "autofx.music", "autofx.burst_max", "talk.max_shot",
          "jumpcut.auto_noise", "compose.talk_share"):
    check(k in settings.FIELD_BY_KEY, f"{k} อยู่ในฟอร์ม")

print()
print("ผ่านหมด" if not fails else f"พลาด {fails} ข้อ")
sys.exit(1 if fails else 0)
