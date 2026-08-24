#!/usr/bin/env python3
"""ปั้นเพลงคลอตัวอย่าง (BGM) ลง public/bgm/

    python3 scripts/gen_bgm.py              # ปั้นทุกเพลง
    python3 scripts/gen_bgm.py lofi-cafe    # ปั้นเฉพาะที่ระบุ (ชื่อหลัง bgm-)

สังเคราะห์ล้วนด้วย numpy เหมือน gen_sfx.py — ไม่มีไฟล์เสียงต้นทางจากที่อื่น จึง
ไม่มีเรื่องลิขสิทธิ์และแจกไปกับโปรเจกต์ได้ · ชุดเครื่องมือ DSP ยืมจาก gen_sfx.py
ตรง ๆ (import) ไม่ได้ก๊อปมา — สองไฟล์นี้ต้องให้เสียงจากสูตรเดียวกันเสมอ ไม่งั้น
วันหนึ่งจะมีฟิลเตอร์สองชุดที่ตั้งชื่อเหมือนกันแต่ทำงานไม่เหมือนกัน

**ต่างจากเสียงเอฟเฟกต์สามอย่าง**

  วนซ้ำได้จริง   เสียงเอฟเฟกต์เล่นครั้งเดียวจบ · เพลงคลอต้องวนได้ไม่มีรอยต่อ
                 เพราะหนังยาวกว่าลูปเสมอ (ดู Song.finish — หางถูกพับกลับไปทับหัว
                 แทนการไขว้เฟด ซึ่งจะทำให้จังหวะเพี้ยนตรงรอยต่อ)
  สเตอริโอ       เสียงเอฟเฟกต์เป็นโมโนเพราะมันคือ "จุด" ในหนัง · เพลงเป็นพื้นหลัง
                 ที่ต้องกว้างกว่าเสียงพูดซึ่งอยู่กลางจอ ไม่งั้นสองอย่างชนกันกลาง
  ยาวเป็นสิบวิ   ต้องคิดเป็นห้อง-จังหวะ ไม่ใช่เป็นวินาที (ดู Song.t)

**เสียงคอรัสทำจากฟอร์แมนต์ ไม่ใช่ตัวอย่างเสียงคน**

หมวด choir ปั้นเสียง "อา/อู/ฮัม" ด้วย glottal pulse + ฟิลเตอร์เน้นย่านฟอร์แมนต์
สามย่าน (ตาราง VOWEL) — เป็นเสียงร้องสังเคราะห์ ไม่ใช่คนจริง แต่ให้ความรู้สึก
"มีเสียงคนอยู่ในเพลง" โดยไม่ต้องมีไฟล์เสียงคนจริงและไม่ต้องต่อเน็ต · เอนจินไม่มี
ทางทำ *เนื้อร้อง* เอง — อยากได้เสียงคนร้องจริงต้องดึงไฟล์เพลงเข้าคลังเอง
"""
import subprocess
import sys
import wave
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_sfx as S                                  # noqa: E402  (ต้องต่อ path ก่อน)
from gen_sfx import bp, drive, hp, lp, n_of, noise, osc, peaking, reverb, tt  # noqa: E402

SR = S.SR
OUT = Path(__file__).resolve().parent.parent / "public" / "bgm"
TMP = Path("/tmp/vcut-bgm")


# ─────────────────────────── โน้ตกับคอร์ด ───────────────────────────
#
# ทุกอย่างในไฟล์นี้พูดด้วยเลข MIDI (60 = โดกลาง) ไม่ใช่เฮิรตซ์ — ย้ายคีย์ทั้งเพลง
# ทำได้ด้วยการบวกเลขตัวเดียว ส่วนเฮิรตซ์ต้องคูณด้วยรากที่สิบสองของสอง ซึ่งอ่านแล้ว
# ไม่มีใครรู้ว่ากำลังย้ายกี่เสียง

def hz(m):
    """เลข MIDI → เฮิรตซ์ — คืนตัวเลขเดี่ยวเมื่อรับตัวเลขเดี่ยว

    ต้องคืน float ไม่ใช่อาเรย์ศูนย์มิติ เพราะ osc() แยกทางเดินด้วย np.isscalar
    ซึ่งอ่านอาเรย์ศูนย์มิติว่า "ไม่ใช่ตัวเลข" แล้วไปเข้าทางความถี่ที่เปลี่ยนตามเวลา
    """
    if np.ndim(m) == 0:
        return 440.0 * 2.0 ** ((float(m) - 69.0) / 12.0)
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


CHORD = {
    "maj": (0, 4, 7), "min": (0, 3, 7),
    "maj7": (0, 4, 7, 11), "min7": (0, 3, 7, 10), "dom7": (0, 4, 7, 10),
    "sus2": (0, 2, 7), "sus4": (0, 5, 7),
    "add9": (0, 4, 7, 14), "min9": (0, 3, 7, 10, 14), "maj9": (0, 4, 7, 11, 14),
    "dim": (0, 3, 6), "min6": (0, 3, 7, 9), "5": (0, 7, 12),
}


def chord(root, quality="maj", lo=55, hi=79):
    """โน้ตของคอร์ดหนึ่ง ดึงให้อยู่ในช่วงเสียงที่กำหนด

    ช่วง lo–hi สำคัญกว่าที่คิด: คอร์ดที่เขียนไว้เป็น "รากบวกขั้น" ตรง ๆ จะกระโดด
    ขึ้นลงเป็นอ็อกเทฟทุกครั้งที่รากเปลี่ยน แล้วเพลงจะฟังเหมือนกระเด้งไปมา ไม่ใช่
    ไหลไปข้างหน้า — นักเล่นจริงแก้ด้วยการพลิกคอร์ด ที่นี่ทำแบบเดียวกัน
    """
    out = []
    for iv in CHORD[quality]:
        m = root + iv
        while m > hi:
            m -= 12
        while m < lo:
            m += 12
        out.append(m)
    return sorted(set(out))


# ─────────────────────────── เครื่องดนตรี ───────────────────────────

def adsr(dur, a=0.01, d=0.1, s=0.7, r=0.3):
    """ซองเสียงสี่ท่อน — คุมด้วยสัดส่วนของโน้ต ไม่ใช่วินาทีตายตัว

    โน้ตเขบ็ตที่ปล่อยหาง 0.3 วินาทีจะทับโน้ตถัดไปจนกลายเป็นพรม ส่วนโน้ตยาวที่
    ปล่อยหางสั้นจะขาดเป็นห้วง ๆ — a/d/r จึงถูกหดลงตามความยาวโน้ตเมื่อโน้ตสั้นกว่า
    ผลรวมของสามท่อน
    """
    n = n_of(dur)
    k = min(1.0, dur / max(1e-6, a + d + r))
    na, nd, nr = max(1, n_of(a * k)), max(1, n_of(d * k)), max(1, n_of(r * k))
    ns = max(0, n - na - nd - nr)
    e = np.concatenate([
        np.linspace(0, 1, na) ** 0.7,
        s + (1 - s) * np.exp(-4 * np.linspace(0, 1, nd)),
        np.full(ns, s),
        s * np.exp(-4 * np.linspace(0, 1, nr)) * (1 - np.linspace(0, 1, nr) ** 3),
    ])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def pad(notes, dur, cutoff=2600, detune=7.0, voices=3, sweep=1.0):
    """แพดซินธ์ — ซอว์เพี้ยนหลายตัวซ้อนกันแล้วกรองความสูงออก

    ที่ทำให้แพดฟังไม่เหมือนออร์แกนคือ *ความไม่ตรงกัน*: ซอว์สามตัวจูนห่างกันไม่กี่
    เซนต์จะค่อย ๆ เลื่อนเฟสเข้า-ออกกัน เกิดการแกว่งช้า ๆ ที่หูอ่านว่า "หนา"
    """
    n = n_of(dur)
    x = np.zeros(n)
    for m in notes:
        for v in range(voices):
            cents = (v - (voices - 1) / 2) * detune
            f = hz(m) * 2 ** (cents / 1200)
            x += osc(f, dur, "saw") / (voices * len(notes))
    # จุดตัดฟิลเตอร์ไหลขึ้นตอนต้นโน้ต = เสียง "เปิดออก" แทนที่จะโผล่มาเต็มที่ทันที
    if sweep > 0:
        x = lp(x, cutoff * 0.55) * (1 - sweep) + lp(x, cutoff) * sweep * \
            np.linspace(0.35, 1.0, n) + lp(x, cutoff * 0.4) * sweep * \
            np.linspace(0.65, 0.0, n)
    else:
        x = lp(x, cutoff)
    return x * adsr(dur, a=min(0.5, dur * 0.25), d=0.2, s=0.75, r=min(1.2, dur * 0.5))


def strings(notes, dur, cutoff=3200):
    """เครื่องสาย — แพดที่มีการสั่นเสียงและเข้าช้ากว่า

    วิบราโตเริ่มหลังโน้ตดังไปแล้วครึ่งวินาที เหมือนคนสีจริงที่ต้องตั้งเสียงให้นิ่ง
    ก่อนถึงจะโยกนิ้วได้ — ใส่ตั้งแต่ต้นโน้ตจะฟังเหมือนเครื่องเล่นเทปยืด
    """
    t = tt(dur)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.5) / 0.6, 0, 1)
    x = np.zeros(n_of(dur))
    for m in notes:
        for c in (-6.0, 0.0, 6.0):
            x += osc(hz(m) * 2 ** (c / 1200) * vib, dur, "saw") / (3 * len(notes))
    x = lp(x, cutoff)
    x = peaking(x, 900, q=2.0, gain=1.6)          # ย่านที่ทำให้ฟังเป็น "สาย"
    return x * adsr(dur, a=min(0.8, dur * 0.35), d=0.3, s=0.8, r=min(1.5, dur * 0.5))


def keys(m, dur, bright=2.2, decay=1.4):
    """เปียโนไฟฟ้า — FM สองโอเปอเรเตอร์

    ไม่ใช่เปียโนอะคูสติก (ซึ่งต้องมีสายพ้องหลายเส้นและ inharmonicity) แต่เป็นเสียง
    โรดส์/แอมเบียนต์ที่เพลงคลอใช้บ่อยกว่า — และทำได้ด้วยไซน์สองตัวคูณกัน
    """
    t = tt(dur)
    f = hz(m)
    idx = bright * np.exp(-decay * t)              # ดัชนี FM ลดลง = เสียงหุบลง
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    x += 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-6 * t)   # หัวโน้ตใส
    return x * adsr(dur, a=0.004, d=0.35, s=0.35, r=min(1.0, dur * 0.6))


def pluck(m, dur, damp=0.996, bright=0.5):
    """สายดีด (Karplus–Strong) — ใช้ได้ทั้งกีตาร์ อูคูเลเล่ พิณ กล่องดนตรี

    กรองทีละคาบแทนที่จะไล่ทีละแซมเปิล: ผลต่างที่หูจับได้แทบไม่มี แต่เร็วกว่าลูป
    ของ Python หลักพันเท่า และเพลงหนึ่งเพลงมีโน้ตเป็นร้อยตัว
    """
    n = n_of(dur)
    per = max(4, int(round(SR / hz(m))))
    buf = S.rng.standard_normal(per)
    buf = lp(buf, hz(m) * (4 + 12 * bright)) if per > 8 else buf
    buf /= (np.max(np.abs(buf)) or 1)
    out = np.empty(0)
    while len(out) < n:
        out = np.concatenate([out, buf])
        buf = damp * 0.5 * (buf + np.roll(buf, 1))
    x = out[:n]
    return x * adsr(dur, a=0.002, d=0.05, s=0.9, r=min(0.6, dur * 0.4))


def bass(m, dur, tone=1.0, growl=1.6):
    """เบส — ไซน์เป็นตัวเนื้อ บวกสามเหลี่ยมนิดหน่อยให้ได้ยินในลำโพงเล็ก

    ลำโพงมือถือไม่มีเสียง 55 Hz เลย ถ้าเบสเป็นไซน์ล้วนคนดูครึ่งหนึ่งจะไม่ได้ยิน
    ว่ามีเบส — ฮาร์มอนิกที่ drive สร้างขึ้นมาต่างหากที่ทำให้ "รู้สึกถึงเบส"
    """
    t = tt(dur)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + tone * 0.35 * osc(f, dur, "tri")
    x = drive(x, growl)
    return x * adsr(dur, a=0.006, d=0.12, s=0.8, r=min(0.25, dur * 0.4))


def sub(m, dur):
    """เสียงต่ำล้วน ไว้รองท้องเพลงแนวลุ้นระทึก"""
    return np.sin(2 * np.pi * hz(m) * tt(dur)) * adsr(dur, a=0.05, d=0.3, s=0.85, r=0.4)


# ── เสียงคอรัส (ข้อ B) ──
#
# **ทำไมเป็นฟอร์แมนต์ ไม่ใช่ฟิลเตอร์ธรรมดา**
#
# สิ่งที่ทำให้หูแยก "เสียงคน" ออกจาก "ซินธ์" ไม่ใช่รูปคลื่น แต่เป็นย่านความถี่ที่
# ถูกเน้นไว้ *คงที่* ไม่ว่าจะร้องโน้ตไหน — ท่อเสียงของคนไม่เปลี่ยนรูปตามระดับเสียง
# ที่ร้อง แพดซินธ์ทั่วไปเน้นย่านที่เลื่อนตามโน้ต หูจึงอ่านว่าเป็นเครื่องดนตรี
#
# ตัวเลขคือ (F1, F2, F3) ของสระแต่ละตัวตามตำราสัทศาสตร์ หน่วยเฮิรตซ์
VOWEL = {
    "a": (730, 1090, 2440),      # อา — เปิดกว้าง ใช้กับท่อนใหญ่
    "o": (570, 840, 2410),       # โอ — กลม นุ่ม
    "u": (300, 870, 2240),       # อู — ทึบ เหมาะเป็นพื้นหลัง
    "m": (250, 1100, 2200),      # ฮัม (ปากปิด) — เบาที่สุดในสามตัว
}


def choir(notes, dur, vowel="a", voices=4, spread=14.0, breath=0.06):
    """คอรัสสังเคราะห์ — เสียงร้อง "อา/โอ/อู/ฮัม" ที่ไม่มีเนื้อ

    หลายเสียงในคอรัสจริงไม่ได้ร้องตรงกันเป๊ะ ทั้งระดับเสียง (spread เซนต์) และ
    การสั่น (คนละความเร็ว คนละเฟส) — ความไม่ตรงนี้แหละที่ทำให้หูนับได้ว่า "หลายคน"
    ถ้าจูนตรงกันหมดจะได้เสียงคนเดียวที่ดังขึ้น ไม่ใช่คอรัส
    """
    n = n_of(dur)
    t = tt(dur)
    f1, f2, f3 = VOWEL[vowel]
    x = np.zeros(n)
    for m in notes:
        for v in range(voices):
            cents = (S.rng.random() - 0.5) * 2 * spread
            rate = 4.6 + 1.6 * S.rng.random()
            ph = S.rng.random() * 2 * np.pi
            # การสั่นค่อย ๆ ลึกขึ้น เหมือนคนที่ลากเสียงยาวแล้วเริ่มโยก
            vib = 1 + 0.006 * np.sin(2 * np.pi * rate * t + ph) * np.clip(t / 0.8, 0, 1)
            src = osc(hz(m) * 2 ** (cents / 1200) * vib, dur, "saw")
            x += src / (voices * len(notes))
    # ท่อเสียง: เน้นสามย่านฟอร์แมนต์แล้วตัดความสูงทิ้ง (เสียงคนไม่มีอะไรเหนือ ~8k)
    y = peaking(x, f1, q=7.0, gain=8.0)
    y = peaking(y, f2, q=9.0, gain=6.0)
    y = peaking(y, f3, q=11.0, gain=3.5)
    y = lp(y, 7000 if vowel != "m" else 2200)
    y = hp(y, 110)
    if breath > 0:
        y += bp(noise(dur), 1500, 5000) * breath * np.clip(np.abs(y) * 3, 0, 1)
    y *= adsr(dur, a=min(0.6, dur * 0.3), d=0.25, s=0.85, r=min(1.4, dur * 0.45))
    return reverb(y, 1.1, 0.35)


# ── กลอง ──

def kick(dur=0.5, f0=115, f1=45, click=0.35):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-28 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * t)
    x += click * bp(noise(dur), 900, 5000) * np.exp(-160 * t)
    return drive(x, 1.4)


def snare(dur=0.35, tone=190, snap=1.0):
    t = tt(dur)
    x = 0.5 * np.sin(2 * np.pi * tone * t) * np.exp(-24 * t)
    x += snap * bp(noise(dur), 900, 8000) * np.exp(-16 * t)
    return drive(x, 1.2)


def clap(dur=0.35):
    """ตบมือ — สามครั้งถี่ ๆ แล้วหางยาว (มือหลายคนไม่ตบพร้อมกันเป๊ะ)"""
    x = np.zeros(n_of(dur))
    for k, at in enumerate((0.0, 0.011, 0.023)):
        i = n_of(at)
        seg = bp(noise(dur - at), 1200, 6000) * np.exp(-70 * tt(dur - at))
        x[i:i + len(seg)] += seg * (1 - 0.2 * k)
    tail = bp(noise(dur), 1000, 5000) * np.exp(-14 * tt(dur)) * 0.5
    return x + tail


def hat(dur=0.09, open_=False, tone=9000):
    d = 0.32 if open_ else dur
    return hp(noise(d), tone * 0.55) * np.exp(-(9 if open_ else 55) * tt(d))


def shaker(dur=0.12):
    t = tt(dur)
    return bp(noise(dur), 4000, 11000) * (np.exp(-30 * t) * (1 - np.exp(-260 * t)))


def rim(dur=0.12):
    t = tt(dur)
    return (np.sin(2 * np.pi * 1700 * t) + 0.6 * np.sin(2 * np.pi * 2600 * t)) \
        * np.exp(-90 * t)


def tick(dur=0.06, f=2400):
    return np.sin(2 * np.pi * f * tt(dur)) * np.exp(-120 * tt(dur))


def heartbeat(dur=0.6):
    x = np.zeros(n_of(dur))
    for at, g in ((0.0, 1.0), (0.22, 0.7)):
        seg = np.sin(2 * np.pi * 58 * tt(0.28)) * np.exp(-16 * tt(0.28)) * g
        i = n_of(at)
        x[i:i + len(seg)] += seg[:len(x) - i]
    return drive(x, 1.6)


def vinyl(dur):
    """เสียงแผ่นเสียง — พื้นเสียงของโลไฟ ที่ทำให้ลูปฟังไม่เหมือนไฟล์ MIDI"""
    x = bp(noise(dur, "pink"), 400, 9000) * 0.5
    # เม็ดฝุ่นบนแผ่น: จุดดังสั้น ๆ กระจายแบบสุ่ม ไม่ใช่ตามจังหวะ · เบามาก เพราะ
    # มันเป็นยอดแหลมที่กินเฮดรูมทั้งเพลง — ตั้งไว้ 2.2 แล้ววัดได้ว่าเพลงทั้งเพลง
    # ต้องเบาลงกว่าเป้าไป 2 dB เพื่อให้เม็ดฝุ่นไม่ทะลุ (ดู save)
    for _ in range(int(dur * 7)):
        i = int(S.rng.random() * (len(x) - 400))
        x[i:i + 300] += bp(noise(300 / SR), 1500, 7000) * 0.9
    return x


# ─────────────────────────── ตัวเรียบเรียง ───────────────────────────

class Song:
    """ผืนผ้าใบของเพลงหนึ่งเพลง — คิดเป็นห้องกับจังหวะ ไม่ใช่วินาที

    **หางเพลงถูกพับกลับไปทับหัว ไม่ใช่ไขว้เฟด**

    ลูปที่ไขว้เฟดหัว-ท้าย (แบบ gen_sfx.seamless) ใช้กับเสียงบรรยากาศได้เพราะมัน
    ไม่มีจังหวะ แต่เพลงมี — ไขว้เฟดแปลว่าความยาวลูปสั้นลงเท่าช่วงที่ไขว้ จังหวะ
    ตรงรอยต่อจึงขาดไปเศษหนึ่ง แล้วทุกครั้งที่วนคนฟังจะได้ยินว่า "สะดุด"

    ที่นี่จึงเล่นเกินไปอีกหนึ่งห้อง (tail) แล้วเอาส่วนเกิน — ซึ่งคือหางเสียงสะท้อน
    กับโน้ตที่ยังไม่ดับของห้องสุดท้าย — บวกกลับเข้าไปที่หัวลูป ผลคือเมื่อวนซ้ำ
    หางของรอบก่อนไปโผล่ที่หัวของรอบใหม่พอดี เหมือนวงเล่นต่อเนื่องไม่มีหยุด
    """

    def __init__(self, bpm, bars, beats=4, tail=1.0, swing=0.0):
        self.bpm = float(bpm)
        self.bars = int(bars)
        self.beats = int(beats)
        self.spb = 60.0 / self.bpm                    # วินาทีต่อจังหวะ
        self.swing = float(swing)
        self.loop_dur = self.bars * self.beats * self.spb
        self.n_loop = n_of(self.loop_dur)
        self.n = self.n_loop + n_of(tail * self.beats * self.spb)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def t(self, bar, beat=0.0):
        """วินาทีของ (ห้องที่, จังหวะที่) — นับจาก 0 ทั้งคู่

        swing เลื่อนเฉพาะเขบ็ตตัวหลัง (จังหวะที่ลงท้ายด้วย .5) ให้ช้าลง ซึ่งเป็น
        นิยามของกรูฟแบบสวิง — เลื่อนทุกตัวเท่ากันคือแค่เล่นช้าลง ไม่ใช่สวิง
        """
        b = bar * self.beats + beat
        off = self.swing * 0.5 * self.spb if abs(beat % 1.0 - 0.5) < 1e-6 else 0.0
        return b * self.spb + off

    def beat_dur(self, beats):
        return beats * self.spb

    def add(self, x, at, gain=1.0, pan=0.0):
        """วางเสียงโมโนลงผืนผ้าใบที่วินาที at

        พานแบบกำลังคงที่ (cos/sin) ไม่ใช่เชิงเส้น — เชิงเส้นทำให้เสียงที่แพนกลาง
        เบากว่าที่แพนสุดข้าง 3 dB ซึ่งพอมีหลายชั้นแล้วมิกซ์จะกลวงตรงกลาง
        """
        i = n_of(at)
        if i >= self.n:
            return
        seg = np.asarray(x)[: self.n - i]
        ang = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        self.L[i:i + len(seg)] += seg * gain * np.cos(ang) * np.sqrt(2)
        self.R[i:i + len(seg)] += seg * gain * np.sin(ang) * np.sqrt(2)

    def add_wide(self, x, at, gain=1.0, width=0.012):
        """วางเสียงให้กว้างเต็มจอ — หน่วงข้างขวาไม่กี่มิลลิวินาที (ฮาส)

        ใช้กับแพด/คอรัส/เครื่องสายเท่านั้น ไม่ใช้กับกลองหรือเบส: หูตัดสินทิศทาง
        จากเสียงที่มาถึงก่อน ของที่ต้องอยู่กลางจอเป๊ะจึงต้องมาถึงสองหูพร้อมกัน
        """
        self.add(x, at, gain, -0.55)
        self.add(x, at + width, gain * 0.92, 0.55)

    def each_bar(self):
        return range(self.bars)

    def finish(self, peak_db=-1.5, hp_at=32.0, knee=0.62):
        """ปิดลูป → (ซ้าย, ขวา)

        **โค้งกดยอดก่อนนอร์ม ไม่ใช่หลัง**

        เพลงที่มีกลองแต่เครื่องคลอน้อย (โลไฟ) มียอดแหลมสูงกว่าตัวเนื้อเพลงมาก
        พอนอร์มด้วยพีค เพลงทั้งเพลงจึงจบลงที่ความดังที่รู้สึกต่ำกว่าเพลงแน่น ๆ
        ราวสองเดซิเบล (วัดได้ -18.2 เทียบกับ -16.0 ของเพลงอื่นในชุด) — ทั้งชุดต้อง
        ดังเท่ากัน ไม่งั้นคนสลับแทร็กในหน้าเว็บจะเจอเสียงกระโดดทุกครั้ง

        โค้ง tanh แตะเฉพาะส่วนที่เกิน knee: ตัวเนื้อเพลงไม่ถูกแตะเลย ส่วนหัวกลอง
        ที่โดนกดคือของที่กินเวลาไม่กี่มิลลิวินาที หูอ่านว่า "แน่นขึ้น" ไม่ใช่ "เพี้ยน"
        """
        out = []
        for ch in (self.L, self.R):
            x = np.nan_to_num(ch)
            x = hp(x, hp_at)                          # ตัดลมใต้เสียงที่ไม่มีใครได้ยิน
            head, tail = x[: self.n_loop].copy(), x[self.n_loop:]
            head[: len(tail)] += tail                 # พับหางกลับหัว = วนแล้วไม่มีรอยต่อ
            out.append(head)
        L, R = out
        g = max(np.max(np.abs(L)), np.max(np.abs(R))) or 1.0
        L, R = L / g, R / g
        # กดยอดด้วยโค้งเดียวกันทั้งสองข้าง ไม่ใช่ทีละข้าง — คนละโค้งแปลว่าภาพ
        # สเตอริโอขยับทุกครั้งที่มีกลอง ซึ่งฟังเป็นเสียง "แกว่ง" กลางเพลง
        def squash(x):
            a = np.abs(x)
            over = a > knee
            y = x.copy()
            y[over] = np.sign(x[over]) * (
                knee + (1 - knee) * np.tanh((a[over] - knee) / (1 - knee)))
            return y
        L, R = squash(L), squash(R)
        k = 10 ** (peak_db / 20) / (max(np.max(np.abs(L)), np.max(np.abs(R))) or 1.0)
        return L * k, R * k


def prog(song, progression):
    """(ห้องที่, ราก, ชนิดคอร์ด) ของทุกห้อง — โปรเกรสชันสั้นกว่าเพลงก็วนเอง"""
    for b in song.each_bar():
        root, qual = progression[b % len(progression)]
        yield b, root, qual


# ─────────────────────────── ชั้นสำเร็จรูป ───────────────────────────
#
# ท่อนที่ใช้ซ้ำในหลายเพลง แยกเป็นฟังก์ชันเพื่อให้ "เปลี่ยนกรูฟทีเดียวได้ทั้งชุด"
# ไม่ใช่ต้องไล่แก้ทีละเพลงแล้วลืมไปหนึ่งเพลง

def lay_pad(song, progression, gain=0.5, cutoff=2400, kind=pad, **kw):
    for b, root, qual in prog(song, progression):
        d = song.beat_dur(song.beats) * 1.05
        song.add_wide(kind(chord(root, qual), d, cutoff, **kw), song.t(b), gain)


def lay_bass(song, progression, pattern=((0, 1.0),), gain=0.55, oct_=-24, **kw):
    """เบสตามคอร์ด — pattern เป็น (จังหวะที่, ยาวกี่จังหวะ)"""
    for b, root, _ in prog(song, progression):
        for beat, length in pattern:
            song.add(bass(root + oct_, song.beat_dur(length) * 0.95, **kw),
                     song.t(b, beat), gain)


def lay_beat(song, kicks=(0,), snares=(2,), hats=(), gain=1.0, hat_gain=0.22,
             kick_gain=0.9, snare_gain=0.5, snare_fn=snare, open_hats=()):
    for b in song.each_bar():
        for beat in kicks:
            song.add(kick(), song.t(b, beat), kick_gain * gain)
        for beat in snares:
            song.add(snare_fn(), song.t(b, beat), snare_gain * gain, 0.05)
        for beat in hats:
            song.add(hat(open_=beat in open_hats), song.t(b, beat),
                     hat_gain * gain, -0.18)


def lay_arp(song, progression, pattern, note_len=0.5, gain=0.35, fn=pluck,
            oct_=0, pan=0.0, **kw):
    """อาร์เพจจิโอ — pattern คือลำดับ *ตัวที่เท่าไรของคอร์ด* ไม่ใช่โน้ตตายตัว

    เขียนแบบนี้แล้วลายเดียวใช้ได้กับทุกคอร์ดในเพลง และเปลี่ยนคอร์ดทีเดียวลายก็
    ตามไปเอง — เขียนเป็นโน้ตตายตัวจะต้องเขียนใหม่ทุกห้อง
    """
    for b, root, qual in prog(song, progression):
        cs = chord(root, qual)
        for k, step in enumerate(pattern):
            if step is None:
                continue
            m = cs[step % len(cs)] + 12 * (step // len(cs)) + oct_
            song.add(fn(m, song.beat_dur(note_len) * 1.6, **kw),
                     song.t(b, k * note_len), gain, pan)


# ─────────────────────────── เพลง ───────────────────────────
#
# แต่ละฟังก์ชันคืน (ซ้าย, ขวา) ของลูปหนึ่งลูป · ชื่อ/ป้าย/หมวดอยู่ในตาราง BGM
# ท้ายไฟล์ ซึ่งเป็นตัวเดียวกับที่ lib/bgm.ts ฝั่งหน้าเว็บใช้

# ── หมวดเดินทาง ──

def travel_open():
    """ออกเดินทาง — I–V–vi–IV ในคีย์ C กีตาร์ดีด + แพดกว้าง"""
    s = Song(100, 8)
    p = [(60, "add9"), (67, "maj"), (69, "min7"), (65, "maj9")]
    lay_pad(s, p, gain=0.30, cutoff=2200)
    lay_bass(s, p, pattern=((0, 1.5), (2, 1.0), (3, 1.0)), gain=0.50)
    lay_arp(s, p, [0, 2, 1, 3, 2, 1, 0, 2], note_len=0.5, gain=0.30,
            oct_=12, pan=-0.25, damp=0.9975)
    lay_arp(s, p, [None, 1, None, 2, None, 3, None, 1], note_len=0.5, gain=0.18,
            oct_=24, pan=0.30, damp=0.995, bright=0.8)
    lay_beat(s, kicks=(0, 2.5), snares=(2,), hats=(0.5, 1.5, 2.5, 3.5),
             snare_gain=0.30, hat_gain=0.16)
    for b in s.each_bar():
        for beat in (1, 3):
            s.add(shaker(), s.t(b, beat), 0.20, 0.35)
    return s.finish()


def travel_ridge():
    """สันเขา — ช้า กว้าง มีคอรัสคลอ ใช้กับช็อตวิวใหญ่"""
    s = Song(88, 8)
    p = [(62, "maj"), (69, "min7"), (67, "maj9"), (64, "min7")]
    lay_pad(s, p, gain=0.26, cutoff=2000, kind=strings)
    for b, root, qual in prog(s, p):
        s.add_wide(choir(chord(root, qual, lo=62, hi=81), s.beat_dur(4) * 1.1, "o",
                         voices=3), s.t(b), 0.22)
    lay_bass(s, p, pattern=((0, 2.0), (2, 2.0)), gain=0.45, growl=1.2)
    lay_arp(s, p, [0, 1, 2, 3, 2, 1], note_len=4 / 6, gain=0.22, fn=keys,
            oct_=12, pan=-0.2, bright=1.6)
    for b in s.each_bar():
        s.add(kick(), s.t(b, 0), 0.55)
        if b % 2 == 1:
            s.add(snare(0.5, 210, 0.8), s.t(b, 2), 0.28, 0.1)
    return s.finish()


def travel_drive():
    """ออกถนน — จังหวะเดินหน้า ใช้กับไทม์แลปส์/ขับรถ"""
    s = Song(114, 8)
    p = [(69, "min7"), (65, "maj9"), (60, "maj"), (67, "sus4")]
    lay_pad(s, p, gain=0.22, cutoff=2800)
    lay_bass(s, p, pattern=((0, 0.75), (0.75, 0.75), (1.5, 0.5), (2, 0.75),
                            (3, 1.0)), gain=0.52, growl=2.0)
    lay_arp(s, p, [0, None, 2, 1, None, 3, 2, None], note_len=0.5, gain=0.26,
            oct_=12, pan=0.28, damp=0.9965)
    lay_beat(s, kicks=(0, 1.5, 2.75), snares=(1, 3),
             hats=tuple(np.arange(0, 4, 0.5)), snare_gain=0.42, hat_gain=0.18,
             open_hats=(3.5,))
    return s.finish()


def travel_sunrise():
    """อรุณ — อบอุ่น ค่อย ๆ สว่าง ใช้เปิดเรื่อง"""
    s = Song(84, 8)
    p = [(65, "maj9"), (60, "add9"), (62, "min7"), (67, "sus2")]
    lay_pad(s, p, gain=0.30, cutoff=1900, detune=9.0)
    lay_arp(s, p, [0, 2, 4 % 4, 1, 3, 2], note_len=4 / 6, gain=0.26, fn=keys,
            oct_=12, pan=-0.22, bright=1.8, decay=1.1)
    lay_bass(s, p, pattern=((0, 3.0),), gain=0.42, growl=1.2)
    for b, root, qual in prog(s, p):
        if b % 2 == 0:
            s.add_wide(choir(chord(root, qual, lo=64, hi=79),
                             s.beat_dur(8) * 0.9, "u", voices=3), s.t(b), 0.16)
        s.add(shaker(0.2), s.t(b, 2), 0.16, 0.4)
    return s.finish()


# ── หมวดชิล / lo-fi ──

def lofi_cafe():
    """โลไฟคาเฟ่ — สวิง เปียโนไฟฟ้า พื้นเสียงแผ่นเสียง"""
    s = Song(78, 8, swing=0.32)
    p = [(65, "maj7"), (69, "min7"), (62, "min9"), (67, "dom7")]
    lay_pad(s, p, gain=0.16, cutoff=1500)
    for b, root, qual in prog(s, p):
        cs = chord(root, qual, lo=60, hi=76)
        for beat in (0, 1.5, 2.5):
            for m in cs:
                s.add(keys(m, s.beat_dur(1.4), bright=1.9, decay=1.6),
                      s.t(b, beat), 0.16, -0.15)
    lay_bass(s, p, pattern=((0, 1.5), (1.5, 0.5), (2.5, 1.0)), gain=0.5)
    lay_beat(s, kicks=(0, 2.5), snares=(2,), hats=(0.5, 1.5, 2.5, 3.5),
             snare_gain=0.34, hat_gain=0.14)
    s.add(vinyl(s.loop_dur + 1.0), 0.0, 0.055, -0.3)
    s.add(vinyl(s.loop_dur + 1.0), 0.0, 0.055, 0.3)
    return s.finish()


def lofi_rain():
    """โลไฟสายฝน — คีย์ห่าง ๆ กับเสียงฝนคลอ ใช้กับช็อตฝน/ในเต็นท์"""
    s = Song(72, 8, swing=0.25)
    p = [(69, "min9"), (65, "maj7"), (60, "maj7"), (67, "dom7")]
    rain = bp(noise(s.loop_dur + 1.2, "pink"), 700, 9000)
    s.add(rain, 0.0, 0.06, -0.5)
    s.add(rain[::-1], 0.0, 0.06, 0.5)               # กลับด้านให้สองข้างไม่ซ้ำกัน
    lay_pad(s, p, gain=0.20, cutoff=1300)
    lay_arp(s, p, [0, None, 2, None, 1, None, 3, None], note_len=0.5, gain=0.20,
            fn=keys, oct_=12, pan=-0.2, bright=1.4)
    lay_bass(s, p, pattern=((0, 2.0), (2.5, 1.0)), gain=0.45, growl=1.2)
    lay_beat(s, kicks=(0, 2.5), snares=(2,), hats=(1.5, 3.5),
             snare_gain=0.26, hat_gain=0.10)
    return s.finish()


def chill_float():
    """ล่องลอย — ไม่มีกลอง ใช้รองบทพูดยาว ๆ ได้โดยไม่ชิงจังหวะ"""
    s = Song(86, 8)
    p = [(60, "maj9"), (62, "min7"), (65, "maj7"), (67, "sus2")]
    lay_pad(s, p, gain=0.34, cutoff=1700, detune=11.0, voices=4)
    lay_arp(s, p, [0, 2, 1, 3], note_len=1.0, gain=0.22, fn=pluck, oct_=12,
            pan=0.25, damp=0.998, bright=0.35)
    lay_bass(s, p, pattern=((0, 4.0),), gain=0.34, growl=1.1)
    for b, root, qual in prog(s, p):
        if b % 4 == 3:
            s.add_wide(choir(chord(root, qual, lo=67, hi=83), s.beat_dur(4), "u",
                             voices=3), s.t(b), 0.14)
    return s.finish()


def chill_night():
    """ดึกสงัด — เบาที่สุดในชุด ใช้กับช็อตกลางคืน/ท้ายเรื่อง"""
    s = Song(70, 8)
    p = [(57, "min9"), (64, "min7"), (60, "maj7"), (55, "maj9")]
    lay_pad(s, p, gain=0.24, cutoff=1200, detune=6.0)
    for b, root, qual in prog(s, p):
        cs = chord(root, qual, lo=64, hi=80)
        for k, m in enumerate(cs[:3]):
            s.add(keys(m, s.beat_dur(2.5), bright=1.2, decay=1.9),
                  s.t(b, k * 0.75), 0.18, -0.3 + 0.3 * k)
        s.add(sub(root - 24, s.beat_dur(4)), s.t(b), 0.30)
    for b in s.each_bar():
        s.add(tick(0.05, 3200), s.t(b, 2), 0.06, 0.45)
    return s.finish()


# ── หมวดอบอุ่น / ซึ้ง ──

def warm_home():
    """กลับบ้าน — เปียโนกับเครื่องสาย ใช้กับท่อนสรุป/ขอบคุณ"""
    s = Song(76, 8)
    p = [(65, "maj"), (60, "maj"), (69, "min7"), (65, "maj9")]
    lay_pad(s, p, gain=0.26, cutoff=2100, kind=strings)
    lay_arp(s, p, [0, 1, 2, 3, 2, 1, 2, 3], note_len=0.5, gain=0.24, fn=keys,
            oct_=12, pan=-0.18, bright=2.0, decay=1.3)
    lay_bass(s, p, pattern=((0, 2.0), (2, 2.0)), gain=0.40, growl=1.1)
    for b in s.each_bar():
        s.add(kick(), s.t(b, 0), 0.35)
        if b % 2 == 1:
            s.add(rim(), s.t(b, 2), 0.20, 0.3)
    return s.finish()


def warm_memory():
    """ความทรงจำ — กล่องดนตรี ใช้กับภาพย้อนอดีต/รูปนิ่ง"""
    s = Song(68, 8)
    p = [(60, "maj"), (57, "min7"), (65, "maj7"), (67, "sus4")]
    lay_pad(s, p, gain=0.20, cutoff=1500)
    lay_arp(s, p, [0, 2, 1, 3, 2, 0], note_len=4 / 6, gain=0.30, fn=pluck,
            oct_=24, pan=0.15, damp=0.9955, bright=1.0)
    lay_bass(s, p, pattern=((0, 4.0),), gain=0.32, growl=1.0)
    for b, root, qual in prog(s, p):
        if b >= 4:
            s.add_wide(strings(chord(root, qual, lo=60, hi=76),
                               s.beat_dur(4) * 1.05), s.t(b), 0.16)
    return s.finish()


def warm_family():
    """อบอุ่น — กีตาร์โปร่งดีดเป็นชุด ใช้กับช็อตคนกับคน"""
    s = Song(88, 8)
    p = [(67, "maj"), (62, "min7"), (60, "maj9"), (64, "min7")]
    lay_pad(s, p, gain=0.18, cutoff=2000, kind=strings)
    lay_arp(s, p, [0, 1, 2, 3, 1, 2, 3, 1], note_len=0.5, gain=0.30,
            oct_=12, pan=-0.3, damp=0.997, bright=0.7)
    lay_arp(s, p, [None, None, 2, None, 3, None, None, 2], note_len=0.5,
            gain=0.20, oct_=24, pan=0.35, damp=0.996, bright=0.9)
    lay_bass(s, p, pattern=((0, 1.5), (1.5, 1.0), (3, 1.0)), gain=0.44)
    lay_beat(s, kicks=(0, 2), snares=(1, 3), snare_fn=clap, snare_gain=0.22,
             hats=(0.5, 1.5, 2.5, 3.5), hat_gain=0.12)
    return s.finish()


def warm_hope():
    """ความหวัง — ยกขึ้นเรื่อย ๆ มีคอรัส ใช้ปิดเรื่อง"""
    s = Song(90, 8)
    p = [(65, "maj"), (67, "sus4"), (69, "min7"), (60, "add9")]
    lay_pad(s, p, gain=0.24, cutoff=2400, kind=strings)
    lay_arp(s, p, [0, 2, 1, 3, 2, 1, 3, 2], note_len=0.5, gain=0.26, fn=keys,
            oct_=12, pan=-0.2, bright=2.2)
    lay_bass(s, p, pattern=((0, 1.0), (1, 1.0), (2, 1.0), (3, 1.0)), gain=0.44)
    for b, root, qual in prog(s, p):
        # คอรัสเข้าครึ่งหลัง = ลูปมีที่ไป ไม่ใช่แน่นเท่ากันหมดตั้งแต่ห้องแรก
        if b >= 4:
            s.add_wide(choir(chord(root, qual, lo=64, hi=81), s.beat_dur(4) * 1.05,
                             "a", voices=4), s.t(b), 0.20)
    lay_beat(s, kicks=(0, 2.5), snares=(2,), hats=(0.5, 1.5, 2.5, 3.5),
             snare_gain=0.34, hat_gain=0.15)
    return s.finish()


# ── หมวดสนุก / มีพลัง ──

def up_happy():
    """สนุกสดใส — อูคูเลเล่กับตบมือ ใช้กับช็อตกิน/เล่น/ตลาด"""
    s = Song(120, 8)
    p = [(60, "maj"), (67, "maj"), (69, "min"), (65, "maj")]
    lay_arp(s, p, [0, 1, 2, 1, 3, 1, 2, 1], note_len=0.5, gain=0.30,
            oct_=12, pan=-0.25, damp=0.9945, bright=1.1)
    lay_bass(s, p, pattern=((0, 0.75), (1, 0.75), (2, 0.75), (3, 0.75)), gain=0.48)
    lay_beat(s, kicks=(0, 1.5, 2), snares=(1, 3), snare_fn=clap, snare_gain=0.34,
             hats=tuple(np.arange(0, 4, 0.5)), hat_gain=0.14)
    for b in s.each_bar():
        for beat in (0.75, 1.75, 2.75, 3.75):
            s.add(shaker(0.1), s.t(b, beat), 0.16, 0.4)
    return s.finish()


def up_pop():
    """ป๊อปสดใส — ซินธ์ดีดกับกลองสี่ตัว ใช้กับมอนทาจ"""
    s = Song(112, 8)
    p = [(69, "min"), (65, "maj"), (60, "maj"), (67, "maj")]
    lay_pad(s, p, gain=0.18, cutoff=3000)
    lay_arp(s, p, [0, 2, 1, 2, 3, 2, 1, 2], note_len=0.5, gain=0.26,
            oct_=12, pan=0.25, damp=0.993, bright=1.4)
    lay_bass(s, p, pattern=((0, 0.5), (0.5, 0.5), (1, 0.5), (1.5, 0.5),
                            (2, 0.5), (2.5, 0.5), (3, 0.5), (3.5, 0.5)),
             gain=0.46, growl=2.2)
    lay_beat(s, kicks=(0, 1, 2, 3), snares=(1, 3), snare_gain=0.40,
             hats=tuple(np.arange(0.5, 4, 1.0)), hat_gain=0.20, open_hats=(3.5,))
    return s.finish()


def up_funk():
    """ฟังก์ — เบสเดินเยอะ ใช้กับช็อตทำอาหาร/งานคราฟต์"""
    s = Song(104, 8, swing=0.18)
    p = [(64, "min7"), (64, "min7"), (69, "min7"), (62, "dom7")]
    lay_bass(s, p, pattern=((0, 0.5), (0.75, 0.25), (1.5, 0.5), (2, 0.5),
                            (2.75, 0.25), (3.5, 0.5)), gain=0.55, growl=2.6)
    for b, root, qual in prog(s, p):
        cs = chord(root, qual, lo=64, hi=79)
        for beat in (1, 2.5, 3.75):
            for m in cs:
                s.add(keys(m, s.beat_dur(0.4), bright=2.6, decay=3.0),
                      s.t(b, beat), 0.14, 0.2)
    lay_beat(s, kicks=(0, 1.75, 2.5), snares=(1, 3), snare_gain=0.40,
             hats=tuple(np.arange(0, 4, 0.5)), hat_gain=0.16)
    return s.finish()


def up_energy():
    """มีพลัง — ขับเคลื่อน ใช้กับปีนเขา/ออกกำลัง/ตัดเร็ว"""
    s = Song(128, 8)
    p = [(57, "min"), (64, "min"), (60, "maj"), (55, "maj")]
    lay_pad(s, p, gain=0.20, cutoff=3400, detune=12.0)
    lay_arp(s, p, [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3],
            note_len=0.25, gain=0.20, fn=keys, oct_=24, pan=-0.3, bright=2.4,
            decay=5.0)
    lay_bass(s, p, pattern=tuple((k * 0.5, 0.45) for k in range(8)), gain=0.50,
             growl=2.6)
    lay_beat(s, kicks=(0, 1, 2, 3), snares=(1, 3), snare_gain=0.44,
             hats=tuple(np.arange(0.5, 4, 0.5)), hat_gain=0.20, open_hats=(3.5,))
    for b in s.each_bar():
        if b % 4 == 3:
            # ไรเซอร์ท้ายทุกสี่ห้อง = ลูปมี "ที่ต่อ" ให้หูรอ ไม่ใช่แปดห้องเรียบ
            d = s.beat_dur(4)
            t = tt(d)
            s.add_wide(hp(noise(d), 800) * (t / d) ** 2.2, s.t(b), 0.12)
    return s.finish()


# ── หมวดลุ้นระทึก ──

def tense_pulse():
    """ชีพจร — ย้ำจังหวะเดิม ใช้ตอนเล่าเหตุการณ์ที่กำลังจะเกิด"""
    s = Song(100, 8)
    p = [(57, "min"), (57, "min"), (56, "min"), (58, "5")]
    for b, root, qual in prog(s, p):
        s.add(sub(root - 24, s.beat_dur(4)), s.t(b), 0.34)
        for beat in np.arange(0, 4, 0.5):
            s.add(bass(root - 12, s.beat_dur(0.4), tone=0.4, growl=3.0),
                  s.t(b, beat), 0.26)
    lay_pad(s, p, gain=0.16, cutoff=1200)
    for b in s.each_bar():
        s.add(kick(), s.t(b, 0), 0.7)
        s.add(kick(), s.t(b, 2), 0.55)
        for beat in (1, 3):
            s.add(tick(0.05, 2600), s.t(b, beat), 0.10, -0.4)
        if b % 2 == 1:
            s.add(snare(0.3, 200, 0.6), s.t(b, 3.5), 0.24, 0.2)
    return s.finish()


def tense_build():
    """ก่อตัว — แน่นขึ้นเรื่อย ๆ จนจบลูป ใช้ก่อนถึงจุดเฉลย"""
    s = Song(92, 8)
    p = [(55, "min"), (55, "min"), (60, "min"), (58, "maj")]
    lay_pad(s, p, gain=0.20, cutoff=1600)
    for b, root, qual in prog(s, p):
        s.add(sub(root - 24, s.beat_dur(4)), s.t(b), 0.30)
        grow = 0.5 + 0.9 * (b / max(1, s.bars - 1))       # ยิ่งท้ายยิ่งแน่น
        s.add(kick(), s.t(b, 0), 0.6 * grow)
        s.add(kick(), s.t(b, 2), 0.5 * grow)
        step = 0.5 if b < 4 else 0.25
        for beat in np.arange(0, 4, step):
            s.add(tick(0.04, 2800), s.t(b, beat), 0.09 * grow, 0.35)
        if b >= 4:
            s.add(snare(0.28, 210, 0.9), s.t(b, 1), 0.30 * grow, -0.15)
            s.add(snare(0.28, 210, 0.9), s.t(b, 3), 0.30 * grow, 0.15)
    d = s.beat_dur(16)
    s.add_wide(hp(noise(d), 600) * (tt(d) / d) ** 2.6, s.t(4), 0.14)
    return s.finish()


def tense_dark():
    """มืดหม่น — โดรนกับเสียงหัวใจ ใช้กับช็อตพายุ/หลงทาง"""
    s = Song(80, 8)
    p = [(53, "min"), (53, "min"), (51, "min"), (55, "dim")]
    for b, root, qual in prog(s, p):
        s.add(sub(root - 24, s.beat_dur(4) * 1.1), s.t(b), 0.36)
        s.add_wide(pad(chord(root, qual, lo=53, hi=70), s.beat_dur(4) * 1.1,
                       cutoff=900, detune=16.0, voices=4), s.t(b), 0.26)
        if b % 2 == 0:
            s.add_wide(choir(chord(root, "min", lo=60, hi=76), s.beat_dur(4),
                             "m", voices=3, spread=22.0), s.t(b), 0.13)
        s.add(heartbeat(), s.t(b, 0), 0.40)
        s.add(heartbeat(), s.t(b, 2), 0.30)
    return s.finish()


# ── หมวดคอรัส (ข้อ B — เสียงคนล้วน) ──

def choir_aah():
    """คอรัส อา — คลอเปล่า ๆ ซ้อนทับเพลงอื่นได้ หรือใช้เดี่ยวก็ได้"""
    s = Song(72, 8)
    p = [(60, "maj"), (67, "maj"), (69, "min"), (65, "maj")]
    for b, root, qual in prog(s, p):
        s.add_wide(choir(chord(root, qual, lo=60, hi=79), s.beat_dur(4) * 1.15,
                         "a", voices=5), s.t(b), 0.42)
        s.add_wide(choir([root - 12], s.beat_dur(4) * 1.15, "o", voices=3),
                   s.t(b), 0.20)
    return s.finish()


def choir_ooh():
    """คอรัส อู — ทึบกว่า อา จึงไม่ชนกับเสียงพูดเท่า"""
    s = Song(66, 8)
    p = [(65, "maj7"), (62, "min7"), (60, "maj9"), (67, "sus4")]
    for b, root, qual in prog(s, p):
        s.add_wide(choir(chord(root, qual, lo=58, hi=76), s.beat_dur(4) * 1.15,
                         "u", voices=5, spread=18.0), s.t(b), 0.44)
    return s.finish()


def choir_hum():
    """ฮัมเบา ๆ — ปากปิด เบาที่สุดในหมวด ใช้รองบทพูดได้ตรง ๆ"""
    s = Song(64, 8)
    p = [(57, "min7"), (60, "maj7"), (55, "maj9"), (62, "min7")]
    for b, root, qual in prog(s, p):
        s.add_wide(choir(chord(root, qual, lo=57, hi=72), s.beat_dur(4) * 1.15,
                         "m", voices=4, spread=16.0, breath=0.02), s.t(b), 0.46)
    return s.finish()


def choir_epic():
    """คอรัสยิ่งใหญ่ — คอรัส + เครื่องสายต่ำ + กลองใหญ่ ใช้กับช็อตเปิดเรื่อง"""
    s = Song(76, 8)
    p = [(57, "min"), (65, "maj"), (60, "maj"), (55, "maj")]
    for b, root, qual in prog(s, p):
        s.add_wide(choir(chord(root, qual, lo=60, hi=81), s.beat_dur(4) * 1.1,
                         "a", voices=5), s.t(b), 0.34)
        s.add_wide(strings(chord(root, qual, lo=45, hi=62), s.beat_dur(4) * 1.05,
                           cutoff=1800), s.t(b), 0.22)
        s.add(sub(root - 24, s.beat_dur(4)), s.t(b), 0.30)
        s.add(kick(0.8, 130, 42), s.t(b, 0), 0.75)
        if b % 2 == 1:
            s.add(kick(0.8, 130, 42), s.t(b, 2.5), 0.55)
        if b % 4 == 3:
            s.add(snare(0.9, 160, 1.2), s.t(b, 3), 0.34, 0.1)
    return s.finish()


# ─────────────────────────── ทะเบียน ───────────────────────────
#
# ชื่อ → (ฟังก์ชัน, หมวด, ป้ายไทย) — ตารางนี้เป็นต้นทางของ lib/bgm.ts ด้วย
# (สคริปต์พิมพ์บล็อก TypeScript ให้ตอนปั้นเสร็จ จะได้ไม่ต้องพิมพ์สองที่แล้วหลุด)
BGM = {
    "travel-open":  (travel_open,  "travel", "ออกเดินทาง"),
    "travel-ridge": (travel_ridge, "travel", "สันเขา"),
    "travel-drive": (travel_drive, "travel", "ออกถนน"),
    "travel-sunrise": (travel_sunrise, "travel", "อรุณ"),
    "lofi-cafe":    (lofi_cafe,    "chill",  "โลไฟคาเฟ่"),
    "lofi-rain":    (lofi_rain,    "chill",  "โลไฟสายฝน"),
    "chill-float":  (chill_float,  "chill",  "ล่องลอย"),
    "chill-night":  (chill_night,  "chill",  "ดึกสงัด"),
    "warm-home":    (warm_home,    "warm",   "กลับบ้าน"),
    "warm-memory":  (warm_memory,  "warm",   "ความทรงจำ"),
    "warm-family":  (warm_family,  "warm",   "อบอุ่น"),
    "warm-hope":    (warm_hope,    "warm",   "ความหวัง"),
    "up-happy":     (up_happy,     "upbeat", "สนุกสดใส"),
    "up-pop":       (up_pop,       "upbeat", "ป๊อปสดใส"),
    "up-funk":      (up_funk,      "upbeat", "ฟังก์"),
    "up-energy":    (up_energy,    "upbeat", "มีพลัง"),
    "tense-pulse":  (tense_pulse,  "tense",  "ชีพจร"),
    "tense-build":  (tense_build,  "tense",  "ก่อตัว"),
    "tense-dark":   (tense_dark,   "tense",  "มืดหม่น"),
    "choir-aah":    (choir_aah,    "choir",  "คอรัส อา"),
    "choir-ooh":    (choir_ooh,    "choir",  "คอรัส อู"),
    "choir-hum":    (choir_hum,    "choir",  "ฮัมเบา ๆ"),
    "choir-epic":   (choir_epic,   "choir",  "คอรัสยิ่งใหญ่"),
}


# ── ความดังของทั้งชุด ──
#
# **ปรับด้วย LUFS ไม่ใช่พีค**
#
# gen_sfx.py นอร์มด้วยพีค (-1 dBFS) ซึ่งถูกสำหรับเสียงเอฟเฟกต์ เพราะของพวกนั้นคือ
# "จุดเดียวที่ดัง" — พีคกับความดังที่รู้สึกจึงเป็นเรื่องเดียวกัน  เพลงไม่ใช่แบบนั้น:
# เพลงที่แน่นทั้งลูปกับเพลงที่มีแต่แพดเบา ๆ พีคเท่ากันได้ แต่ดังต่างกันเป็นสิบ dB
# วัดจริงกับชุดนี้ตอนนอร์มด้วยพีค ต่างกัน 11 LUFS ระหว่าง choir-hum กับ up-energy
# — คนเลือกเพลงในหน้าเว็บจะเจอเสียงกระโดดทุกครั้งที่สลับแทร็ก ทั้งที่ตั้ง gain ไว้
# ค่าเดียว
#
# TP -2 dBTP ไม่ใช่ -0.1: ตัวเข้ารหัส AAC สร้างพีคเกินของเดิมได้ (วัดได้ +0.9 dBFS
# ในรอบที่นอร์มพีคไว้ -1.5) เผื่อไว้สองเดซิเบลแล้วไม่มีแทร็กไหนทะลุอีก
TARGET_LUFS = -16.0
TARGET_TP = -2.0


def _wav(path, L, R):
    inter = np.empty(len(L) * 2)
    inter[0::2], inter[1::2] = L, R
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(inter, -1, 1) * 32767).astype("<i2").tobytes())


def _measure(path):
    """(LUFS, พีคจริง dBTP) ที่ loudnorm วัดได้ — (None, None) ถ้าอ่านไม่ออก"""
    import json
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path),
         "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=11:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True)
    try:
        m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
        return float(m["input_i"]), float(m["input_tp"])
    except (ValueError, KeyError, json.JSONDecodeError):
        return None, None


def save(name, L, R):
    """เขียน m4a สเตอริโอ — 112 kbps พอสำหรับเสียงที่ถูกลดลง 18 dB ไปคลออยู่แล้ว

    **วัดด้วย loudnorm แต่คูณเกนเอง ไม่ได้ให้ loudnorm เป็นคนปรับ**

    ตัวฟิลเตอร์ทำงานที่ 192 kHz ข้างในแล้วรีแซมเปิลกลับ ซึ่งเติม/ตัดแซมเปิลหัวท้าย
    ได้ไม่กี่ตัว — ไฟล์ทั่วไปไม่มีใครรู้สึก แต่นี่เป็น *ลูป* ที่หางถูกคำนวณมาให้ต่อ
    กับหัวพอดี เลื่อนไปสองสามมิลลิวินาทีก็ได้ยินเป็นสะดุดทุกรอบที่วน  เกนเป็นตัวคูณ
    ตัวเดียวอยู่แล้ว จึงคูณในอาเรย์ก่อนเขียนไฟล์ได้ตรง ๆ โดยจำนวนแซมเปิลไม่ขยับ

    แทร็กที่พีคชนเพดานก่อนถึงความดังเป้าจะถูกปล่อยให้เบากว่าเป้าแทนการอัดให้แบน —
    ยอมให้คนหมุน gain เอาเองดีกว่าส่งเพลงที่ไดนามิกถูกรีดทิ้งไปแล้ว
    """
    TMP.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    wav = TMP / f"bgm-{name}.wav"
    _wav(wav, L, R)
    lufs, tp = _measure(wav)
    note = ""
    if lufs is not None:
        g = TARGET_LUFS - lufs
        room = TARGET_TP - tp
        if g > room:                       # ดันต่อไม่ได้แล้ว พีคจะทะลุก่อน
            note = f" (พีคชนเพดาน · ได้ {lufs + room:.1f} LUFS)"
            g = room
        L, R = L * 10 ** (g / 20), R * 10 ** (g / 20)
        _wav(wav, L, R)
    dst = OUT / f"bgm-{name}.m4a"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav),
                    "-c:a", "aac", "-b:a", "112k", "-ar", str(SR), "-ac", "2",
                    str(dst)], check=True)
    dur = len(L) / SR
    print(f"  {dst.name:<24} {dur:>6.2f}s  {dst.stat().st_size / 1024:>6.1f} KB"
          f"{note}")
    return dur


def ts_block(durs):
    """บล็อก TypeScript ของแคตตาล็อก — ก๊อปไปวางใน lib/bgm.ts ได้ตรง ๆ"""
    rows = []
    for name, (_, cat, label) in BGM.items():
        d = durs.get(name)
        if d is None:
            continue
        rows.append(f'  {{ file: "bgm-{name}.m4a", label: "{label}", '
                    f'dur: {d:.1f}, cat: "{cat}" }},')
    return "\n".join(rows)


def main(argv):
    want = [a for a in argv if not a.startswith("-")] or list(BGM)
    bad = [w for w in want if w not in BGM]
    if bad:
        sys.exit(f"ไม่รู้จักเพลง: {', '.join(bad)}")
    print(f"ปั้นเพลง {len(want)} เพลง → {OUT}")
    durs = {}
    for name in want:
        # เมล็ดสุ่มผูกกับชื่อเพลง ไม่ใช่ลำดับการเรียก — สั่งปั้นเพลงเดียวก็ได้ไฟล์
        # เดิมเป๊ะ (เหตุผลเดียวกับ gen_sfx.main)
        S.rng = np.random.default_rng(zlib.crc32(name.encode()))
        fn = BGM[name][0]
        durs[name] = save(name, *fn())
    print("\n── แคตตาล็อกสำหรับ lib/bgm.ts ──")
    print(ts_block(durs))


if __name__ == "__main__":
    main(sys.argv[1:])
