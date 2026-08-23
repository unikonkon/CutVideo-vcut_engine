#!/usr/bin/env python3
"""ปั้นเสียงเอฟเฟกต์ตัวอย่างชุดที่ 2 (30 เสียง) ลง public/sfx/

    python3 scripts/gen_sfx.py            # ปั้นทั้ง 30 เสียง
    python3 scripts/gen_sfx.py coin glass # ปั้นเฉพาะที่ระบุ (ชื่อหลัง sfx-)

สังเคราะห์ล้วนด้วย numpy — ไม่มีไฟล์เสียงต้นทางจากที่อื่น จึงไม่มีเรื่องลิขสิทธิ์
เขียนเป็น WAV ก่อนแล้วให้ ffmpeg แปลงเป็น m4a ให้ตรงกับของเดิม: AAC · mono ·
48 kHz · พีค -1 dBFS (เสียงบรรยากาศ -3 dBFS เพราะเป็นพื้นหลัง ไม่ใช่ตัวเอก)

ชุดแรก 30 เสียง (whoosh/boom/click/…) ปั้นไว้ก่อนมีไฟล์นี้ จึงไม่มีสูตรอยู่ที่นี่
— ไฟล์ที่มีอยู่แล้วในโฟลเดอร์ไม่ถูกแตะ สคริปต์นี้เขียนทับเฉพาะ 30 ชื่อข้างล่าง

ตัวช่วยกรองความถี่ทำในโดเมนความถี่ (rfft) ทั้งหมด เพราะเครื่องที่รันไม่มี scipy
— ผลลัพธ์เฟสตรง ไม่มีปัญหาเสถียรภาพแบบ IIR และเขียนสั้นกว่า
"""
import subprocess
import sys
import wave
import zlib
from pathlib import Path

import numpy as np

SR = 48_000
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
TMP = Path("/tmp/vcut-sfx")
rng = np.random.default_rng(20260823)   # ถูกตั้งใหม่ต่อเสียงใน main()


# ─────────────────────────── พื้นฐาน ───────────────────────────

def n_of(dur):
    return int(round(dur * SR))


def tt(dur):
    """แกนเวลาเป็นวินาที"""
    return np.arange(n_of(dur)) / SR


def noise(dur, kind="white"):
    x = rng.standard_normal(n_of(dur))
    if kind == "white":
        return x
    # pink/brown = white ที่เอียงสเปกตรัม -3/-6 dB ต่อ octave
    f = np.fft.rfftfreq(len(x), 1 / SR)
    f[0] = f[1]
    X = np.fft.rfft(x) / (f ** (0.5 if kind == "pink" else 1.0))
    return np.fft.irfft(X, len(x))


def osc(freq, dur, kind="sine", phase0=0.0):
    """freq เป็นตัวเลขหรืออาเรย์ก็ได้ — อาเรย์ = ความถี่เปลี่ยนตามเวลา (กวาด/เบนด์)"""
    n = n_of(dur)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq)[:n]
    ph = phase0 + 2 * np.pi * np.cumsum(f) / SR
    if kind == "sine":
        return np.sin(ph)
    if kind == "saw":                      # saw แบบนุ่ม ไม่ให้ alias แตกหู
        return sum(np.sin(k * ph) / k for k in range(1, 13))
    if kind == "square":
        return sum(np.sin(k * ph) / k for k in range(1, 16, 2))
    if kind == "tri":
        return sum((-1) ** ((k - 1) // 2) * np.sin(k * ph) / k**2
                   for k in range(1, 12, 2))
    raise ValueError(kind)


def _mask(x, fn):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * fn(f), len(x))


def lp(x, fc, order=2):
    return _mask(x, lambda f: 1 / np.sqrt(1 + (np.maximum(f, 1) / fc) ** (2 * order)))


def hp(x, fc, order=2):
    return _mask(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1)) ** (2 * order)))


def bp(x, lo, hi, order=2):
    return lp(hp(x, lo, order), hi, order)


def morph_lp(x, fc, bands=(160, 400, 1000, 2500, 6000, 15000)):
    """lowpass ที่จุดตัดขยับตามเวลา — ไขว้สำเนาที่กรองไว้หลายจุดตัด
    (ฟิลเตอร์ในโดเมนความถี่ทำ time-varying ตรง ๆ ไม่ได้ จึงไขว้เอา)"""
    fc = np.clip(np.asarray(fc, dtype=float)[: len(x)], bands[0], bands[-1])
    pos = np.interp(np.log(fc), np.log(bands), np.arange(len(bands)))
    out = np.zeros(len(x))
    for k, b in enumerate(bands):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        if w.max() > 0:
            out += lp(x, b) * w
    return out


def peaking(x, fc, q=6.0, gain=6.0):
    """เน้นย่านแคบ ๆ — ใช้ทำเสียง 'มีตัวตน' อย่างท่อ/โลหะ/ห้อง"""
    def fn(f):
        f = np.maximum(f, 1)
        return 1 + (gain - 1) / (1 + q**2 * ((f / fc) - (fc / f)) ** 2)
    return _mask(x, fn)


def env(dur, attack=0.005, decay=None, curve=2.5):
    """ซองเสียงแบบตี-แล้วปล่อย: ขึ้นเร็ว ลงยาว (decay=None = ลงจนหมดพอดี)"""
    n = n_of(dur)
    a = max(1, n_of(attack))
    d = n - a if decay is None else max(1, n_of(decay))
    up = np.linspace(0, 1, a) ** 0.6
    down = np.exp(-curve * np.linspace(0, 1, d) * 3) * (1 - np.linspace(0, 1, d) ** 4)
    e = np.concatenate([up, down])[:n]
    return np.pad(e, (0, max(0, n - len(e))))


def swell(dur, power=2.5):
    """ค่อย ๆ ดังขึ้นแล้วตัดจบ — ใช้กับ reverse whoosh / riser"""
    return np.linspace(0, 1, n_of(dur)) ** power


def gate(x, at, dur, fade=0.004):
    """ตัดชิ้นเสียงมาวางที่ตำแหน่ง at (วินาที) พร้อมเฟดกันแตก"""
    y = np.zeros(len(x))
    i = n_of(at)
    j = min(len(x), i + n_of(dur))
    if j <= i:
        return y
    seg = np.ones(j - i)
    f = min(n_of(fade), (j - i) // 2)
    if f:
        seg[:f] = np.linspace(0, 1, f)
        seg[-f:] = np.linspace(1, 0, f)
    y[i:j] = seg
    return y


def place(dst, src, at):
    """ผสม src ลงบน dst ที่วินาที at (ยาวเกินก็ตัด)"""
    i = n_of(at)
    j = min(len(dst), i + len(src))
    if j > i:
        dst[i:j] += src[: j - i]
    return dst


def reverb(x, decay=0.45, mix=0.3, pre=0.01):
    """ห้องสั้น ๆ — คอนโวลูชันกับหางนอยส์ที่ค่อย ๆ เบาลง (ทำผ่าน FFT)"""
    ir_n = n_of(decay)
    ir = rng.standard_normal(ir_n) * np.exp(-np.linspace(0, 6, ir_n))
    ir = lp(ir, 6000)
    ir[: n_of(pre)] = 0
    n = len(x) + ir_n
    N = 1 << (n - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[: len(x)]
    wet /= (np.max(np.abs(wet)) or 1)
    return (1 - mix) * x + mix * wet * (np.max(np.abs(x)) or 1)


def drive(x, amount=2.5):
    """อัดให้อวบขึ้นโดยไม่ให้พีคทะลุ"""
    return np.tanh(x * amount) / np.tanh(amount)


def seamless(x, xf=0.5):
    """ทำให้วนซ้ำแล้วไม่มีรอยต่อ — เอาหางมาไขว้กับหัว แล้วตัดหางทิ้ง"""
    f = n_of(xf)
    if f * 2 >= len(x):
        return x
    head, tail = x[:f].copy(), x[-f:]
    ramp = np.linspace(0, 1, f)
    x = x[:-f].copy()
    x[:f] = head * ramp + tail * (1 - ramp)
    return x


def save(name, x, peak_db=-1.0):
    x = np.asarray(x, dtype=np.float64)
    x = np.nan_to_num(x)
    # กันคลิกที่หัว-ท้ายไฟล์เสมอ ไม่ว่าตัวเสียงจะออกแบบมายังไง
    f = min(n_of(0.003), len(x) // 2)
    if f:
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
    x = x / (np.max(np.abs(x)) or 1) * (10 ** (peak_db / 20))
    TMP.mkdir(parents=True, exist_ok=True)
    wav = TMP / f"sfx-{name}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    dst = OUT / f"sfx-{name}.m4a"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(wav),
         "-c:a", "aac", "-b:a", "96k", "-ar", str(SR), "-ac", "1", str(dst)],
        check=True,
    )
    print(f"  {dst.name:<22} {len(x)/SR:>5.2f}s  {dst.stat().st_size/1024:>6.1f} KB")


# ─────────────────────────── เปลี่ยนฉาก ───────────────────────────

def whoosh_rev(dur=0.9):
    """วูชย้อน — ดูดเข้าหาจุดตัด ใช้วางให้จบพอดีตรงรอยต่อ"""
    t = tt(dur)
    # กวาดฟิลเตอร์ด้วยการไขว้ชั้นนอยส์หลายย่าน แทน IIR ที่ค่าสัมประสิทธิ์ขยับ
    x = np.zeros(len(t))
    bands = [(200, 700), (500, 1600), (1200, 3500), (2600, 8000)]
    for k, (lo, hi) in enumerate(bands):
        w = np.clip(1 - np.abs(np.linspace(0, len(bands) - 1, len(t)) - k), 0, 1)
        x += bp(noise(dur), lo, hi) * w
    x *= swell(dur, 2.2)
    return x + osc(np.linspace(80, 900, len(t)), dur) * swell(dur, 4) * 0.25


def glitch(dur=0.5):
    """กลิตช์ดิจิทัล — ชิ้นเสียงสับเป็นท่อน ๆ พร้อมบิตครัช"""
    x = np.zeros(n_of(dur))
    at = 0.0
    while at < dur - 0.02:
        seg = rng.uniform(0.012, 0.05)
        f = rng.uniform(300, 4000)
        body = osc(f, seg, "square") * 0.6 + bp(noise(seg), 800, 9000) * 0.7
        body = np.round(body * 5) / 5                      # บิตครัช
        x = place(x, body * gate(np.ones(n_of(seg)), 0, seg), at)
        at += seg + rng.uniform(0.0, 0.045)
    return drive(x, 1.6)


def tape_stop(dur=1.0):
    """เทปหยุด — เสียงยืดช้าลงจนดับ ใช้ปิดท้ายท่อน"""
    t = tt(dur)
    k = np.clip(1 - t / (dur * 0.92), 0, 1) ** 1.4
    x = (osc(220 * k + 8, dur, "saw") * 0.5
         + osc(330 * k + 8, dur, "sine") * 0.35
         + osc(110 * k + 6, dur, "sine") * 0.4)
    x *= 0.35 + 0.65 * k
    x += noise(dur) * 0.05 * k                             # เสียงเทปเสียดหัวอ่าน
    return morph_lp(x, 300 + 5200 * k)


def downlifter(dur=1.6):
    """ดิ่งลง — คู่ตรงข้ามของไรเซอร์ ใช้ตอนเข้าฉากเงียบ"""
    t = tt(dur)
    f = 4200 * (1 - t / dur) ** 2 + 120
    x = bp(noise(dur), 200, 9000) * 0.5 + osc(f, dur, "tri") * 0.6
    x *= np.exp(-1.6 * t / dur) * (1 - t / dur) ** 0.5
    return reverb(x, 0.5, 0.22)


def warp(dur=0.7):
    """วาร์ป — โน้ตเบนดิ่งลงเร็ว ๆ ใช้กับคัตกระโดดหรือซูมเข้า"""
    t = tt(dur)
    f = 1800 * np.exp(-4.5 * t / dur) + 140
    x = osc(f, dur, "sine") + 0.5 * osc(f * 2.01, dur, "sine")
    x *= np.exp(-3.2 * t / dur)
    return reverb(drive(x, 1.8), 0.35, 0.25)


# ─────────────────────────── อิมแพกต์ ───────────────────────────

def punch(dur=0.45):
    """หมัด — ตุ้บแน่นสั้น ใช้เน้นจังหวะตัด"""
    t = tt(dur)
    body = osc(np.linspace(150, 55, len(t)), dur) * np.exp(-14 * t)
    slap = bp(noise(dur), 900, 4500) * np.exp(-45 * t) * 0.5
    return drive(body + slap, 2.2)


def subdrop(dur=2.0):
    """ซับดรอป — คลื่นต่ำดิ่ง ใช้เปิดเรื่องหรือเน้นภาพใหญ่"""
    t = tt(dur)
    f = 110 * np.exp(-2.6 * t) + 27
    x = osc(f, dur, "sine") * np.exp(-1.5 * t)
    x += bp(noise(dur), 60, 400) * np.exp(-9 * t) * 0.25
    return drive(x, 1.6)


def metal_hit(dur=1.3):
    """โลหะ — ตีของแข็ง เสียงกังวานไม่เข้าคู่ฮาร์โมนิก"""
    t = tt(dur)
    x = np.zeros(len(t))
    for r, g in zip([1, 2.31, 3.79, 5.18, 6.72, 8.41], [1, .7, .5, .38, .26, .18]):
        x += osc(430 * r, dur) * np.exp(-(2.2 + r * 0.7) * t) * g
    x += bp(noise(dur), 2000, 9000) * np.exp(-40 * t) * 0.4
    return reverb(x, 0.5, 0.25)


def crash(dur=1.8):
    """ฉาบ — เปิด/ปิดท่อนแบบวงดนตรี"""
    t = tt(dur)
    x = bp(noise(dur), 1800, 14000) * np.exp(-3.0 * t)
    x += bp(noise(dur), 400, 1800) * np.exp(-6.0 * t) * 0.4
    return reverb(x, 0.7, 0.3)


def glass(dur=1.0):
    """แก้วแตก — ระเบิดแล้วมีเศษกระเด็นเป็นเม็ด ๆ"""
    x = bp(noise(dur), 2500, 12000) * env(dur, 0.001, 0.12, 4) * 0.55
    for i in range(34):                                    # เศษแก้วกระทบพื้น
        at = 0.03 + spread(i, 34, dur * 0.72, 0.8)
        seg = rng.uniform(0.02, 0.07)
        f = rng.uniform(2200, 9000)
        g = rng.uniform(.35, .9) * (1 - at / dur) ** 0.7   # ยิ่งท้ายยิ่งเบา
        x = place(x, osc(f, seg) * env(seg, 0.001, None, 5) * g, at)
    return x


# ─────────────────────────── UI / แจ้งเตือน ───────────────────────────

def error(dur=0.6):
    """ผิดพลาด — บั๊ซสองครั้ง โทนต่ำ"""
    x = np.zeros(n_of(dur))
    for at, f in ((0.0, 233), (0.22, 175)):
        seg = 0.16
        b = (osc(f, seg, "square") * 0.7 + osc(f * 1.005, seg, "square") * 0.5)
        x = place(x, lp(b, 2200) * env(seg, 0.004, None, 1.2), at)
    return drive(x, 1.5)


def message(dur=0.55):
    """ข้อความเข้า — สองพยางค์สั้น สดใส"""
    x = np.zeros(n_of(dur))
    for at, f in ((0.0, 880), (0.11, 1318)):
        seg = 0.3
        b = osc(f, seg) * 0.8 + osc(f * 2, seg) * 0.2
        x = place(x, b * env(seg, 0.003, None, 3.5), at)
    return reverb(x, 0.3, 0.22)


def camera(dur=0.35):
    """ชัตเตอร์กล้อง — คลิก-แคล็ก สองจังหวะ"""
    x = np.zeros(n_of(dur))
    for at, lo, hi, g in ((0.0, 2500, 9000, 1.0), (0.075, 900, 4200, 0.8)):
        seg = 0.05
        x = place(x, bp(noise(seg), lo, hi) * env(seg, 0.0005, None, 8) * g, at)
    return peaking(x, 3200, 4, 3)


def coin(dur=0.5):
    """เหรียญ — ได้แต้ม/สำเร็จย่อย แบบเกม"""
    x = np.zeros(n_of(dur))
    for at, f, seg in ((0.0, 988, 0.07), (0.06, 1319, 0.42)):
        b = osc(f, seg, "square") * 0.5 + osc(f * 2, seg) * 0.5
        x = place(x, lp(b, 9000) * env(seg, 0.002, None, 2.2), at)
    return x


def countdown(dur=1.8):
    """นับถอยหลัง — ตี๊ดสามครั้งแล้วตี๊ดยาวสูงขึ้น"""
    x = np.zeros(n_of(dur))
    for i in range(3):
        seg = 0.09
        x = place(x, osc(800, seg) * env(seg, 0.004, None, 2), i * 0.45)
    seg = 0.35
    x = place(x, osc(1200, seg) * env(seg, 0.004, None, 1.2), 1.35)
    return x


# ─────────────────────────── การ์ตูน ───────────────────────────

def splat(dur=0.5):
    """แปะ — ของเหลวกระทบ ใช้กับสติกเกอร์เด้งเข้า"""
    t = tt(dur)
    body = lp(noise(dur), 1400) * env(dur, 0.002, 0.1, 5)
    squish = osc(np.linspace(420, 90, len(t)), dur, "tri") * np.exp(-16 * t) * 0.6
    tail = bp(noise(dur), 200, 900) * np.exp(-7 * t) * 0.3
    return drive(body + squish + tail, 1.8)


def slip(dur=0.8):
    """ลื่นล้ม — สไลด์วิสเซิลไหลลง"""
    t = tt(dur)
    f = 2300 * np.exp(-2.6 * t / dur * 3) + 420
    f = f * (1 + 0.02 * np.sin(2 * np.pi * 6 * t))          # สั่นแบบเป่าปาก
    x = osc(f, dur, "sine") * 0.9 + lp(noise(dur), 4000) * 0.08
    return x * (1 - np.linspace(0, 1, len(t)) ** 3)


def magic(dur=1.4):
    """เวทมนตร์ — เม็ดระยิบไล่ขึ้น ใช้กับข้อความโผล่"""
    x = np.zeros(n_of(dur))
    for i in range(22):
        at = (i / 22) ** 0.8 * dur * 0.7 + rng.uniform(0, 0.04)
        seg = min(0.5, dur - at)
        f = 900 * (1.9 ** (i / 9)) * rng.uniform(0.96, 1.04)
        x = place(x, osc(f, seg) * env(seg, 0.002, None, 4) * rng.uniform(.3, .8), at)
    x += hp(noise(dur), 6000) * np.exp(-2.4 * tt(dur)) * 0.12
    return reverb(x, 0.6, 0.3)


def squeak(dur=0.4):
    """เอี๊ยด — ยางถู ใช้กับมุกตลกหรือหยุดกึก"""
    t = tt(dur)
    f = 1100 + 500 * np.sin(2 * np.pi * 2.2 * t / dur * 3)
    x = drive(osc(f, dur, "sine"), 4.0)
    x *= (0.6 + 0.4 * np.sin(2 * np.pi * 34 * t)) * env(dur, 0.02, None, 1.6)
    return bp(x, 600, 6000)


def honk(dur=0.5):
    """ปู๊น — แตรกวน ๆ สองจังหวะ"""
    x = np.zeros(n_of(dur))
    for at, f, seg in ((0.0, 330, 0.17), (0.22, 262, 0.24)):
        b = drive(osc(f, seg, "saw"), 3.0)
        x = place(x, bp(b, 250, 3500) * env(seg, 0.012, None, 1.1), at)
    return x


# ─────────────────────────── บรรยากาศ (วนซ้ำ) ───────────────────────────

def _slowmod(n, cycles, depth=0.3, loop=5.0):
    """ซองช้า ๆ ที่ครบรอบพอดีเมื่อวนกลับ — ไม่งั้นระดับเสียงกระโดดตรงรอยต่อลูป
    (cycles = จำนวนรอบต่อความยาวลูป ต้องเป็นจำนวนเต็มถึงจะบรรจบตัวเอง)"""
    t = np.arange(n) / SR
    m = np.zeros(n)
    for k, (a, ph) in enumerate(zip([1, 0.6, 0.35], rng.uniform(0, 6.28, 3))):
        m += a * np.sin(2 * np.pi * cycles * (k + 1) / loop * t + ph)
    return 1 + depth * m / 2


def spread(i, count, dur, jitter=0.4):
    """กระจายเหตุการณ์ให้ทั่วความยาว แทนการสุ่มล้วนที่ชอบกองอยู่ครึ่งเดียว"""
    step = dur / count
    return float(np.clip(i * step + rng.uniform(0, step * jitter), 0, dur))


def stream(dur=5.0):
    """ลำธาร — น้ำไหลพร้อมเสียงกลั้วเป็นระยะ"""
    x = bp(noise(dur + 0.6, "pink"), 500, 9000)
    x *= _slowmod(len(x), 4, 0.35, dur)
    for i in range(70):                                    # ฟองน้ำผุด
        at = spread(i, 70, dur)
        seg = rng.uniform(0.02, 0.08)
        f = rng.uniform(700, 2600)
        x = place(x, osc(np.linspace(f, f * 1.6, n_of(seg)), seg)
                  * env(seg, 0.004, None, 5) * rng.uniform(.05, .16), at)
    return seamless(x, 0.6)


def campfire(dur=5.0):
    """กองไฟ — ฐานลมไฟกับเสียงแตกเป็นเม็ด"""
    x = lp(noise(dur + 0.6, "brown"), 700) * 2.2
    x *= _slowmod(len(x), 3, 0.4, dur)
    # เม็ดฟืนแตกต้องไม่แรงกว่าฐานมาก ไม่งั้นพอปรับพีคให้เท่ากันทั้งชุด
    # ฐานจะจมจนแทบไม่ได้ยินว่ามีกองไฟอยู่
    for i in range(58):                                    # ฟืนแตก
        at = spread(i, 58, dur)
        seg = rng.uniform(0.006, 0.03)
        x = place(x, bp(noise(seg), 1200, 8000)
                  * env(seg, 0.001, None, 8) * rng.uniform(.10, .30), at)
    return seamless(x, 0.6)


def waterfall(dur=5.0):
    """น้ำตก — มวลน้ำหนา ๆ เต็มย่าน"""
    x = bp(noise(dur + 0.6, "pink"), 200, 12000) * 1.1
    x += lp(noise(dur + 0.6, "brown"), 300) * 0.5
    x *= _slowmod(len(x), 2, 0.18, dur)
    return seamless(x, 0.6)


def city(dur=5.0):
    """เมือง — รถวิ่งไกล ๆ กับเสียงพื้นถนน"""
    x = lp(noise(dur + 0.6, "brown"), 260) * 1.3
    x += bp(noise(dur + 0.6, "pink"), 300, 3000) * 0.35
    x *= _slowmod(len(x), 2, 0.25, dur)
    for i in range(5):                                     # รถผ่านเป็นคัน ๆ
        at = spread(i, 5, dur, 0.5)
        seg = rng.uniform(0.7, 1.3)
        sw = np.sin(np.linspace(0, np.pi, n_of(seg))) ** 2
        x = place(x, bp(noise(seg), 400, 5000) * sw * rng.uniform(.18, .26), at)
    return seamless(x, 0.6)


def cafe(dur=5.0):
    """ร้านกาแฟ — เสียงคนคุยอู้อี้กับแก้วกระทบ"""
    x = np.zeros(n_of(dur + 0.6))
    for i in range(30):                                    # คนคุย (ไม่เป็นคำ)
        at = spread(i, 30, dur)
        seg = rng.uniform(0.25, 0.9)
        f = rng.uniform(120, 260)
        v = osc(f * (1 + 0.06 * np.sin(np.linspace(0, 14, n_of(seg)))), seg, "saw")
        v = bp(v, 250, 2400) * np.sin(np.linspace(0, np.pi, n_of(seg))) ** 1.5
        x = place(x, v * rng.uniform(.06, .16), at)
    x += bp(noise(dur + 0.6, "pink"), 200, 4000) * 0.18
    for i in range(6):                                     # แก้ว/ช้อนกระทบ
        at = spread(i, 6, dur)
        seg = 0.06
        x = place(x, osc(rng.uniform(2400, 5200), seg)
                  * env(seg, 0.001, None, 7) * rng.uniform(.05, .12), at)
    return seamless(x, 0.6)


# ─────────────────────────── ดนตรีสั้น ───────────────────────────

def _chord(freqs, dur, kind="saw", detune=0.004):
    x = np.zeros(n_of(dur))
    for f in freqs:
        x += osc(f, dur, kind) + osc(f * (1 + detune), dur, kind) * 0.7
    return x / len(freqs)


def fanfare(dur=2.0):
    """แตรวง — ประกาศ/เปิดตัว"""
    x = np.zeros(n_of(dur))
    for at, seg, ff in ((0.0, 0.22, [392]), (0.2, 0.22, [523]),
                        (0.4, 1.5, [523, 659, 784, 1046])):
        b = _chord(ff, seg) * env(seg, 0.02, None, 1.0 if seg > 0.5 else 2.2)
        x = place(x, bp(b, 180, 6500), at)
    return reverb(drive(x, 1.4), 0.7, 0.3)


def drumroll(dur=2.0):
    """รัวกลอง — ลุ้นก่อนเฉลย จบด้วยฉาบ"""
    x = np.zeros(n_of(dur))
    at, rate = 0.0, 14.0
    while at < dur - 0.45:
        seg = 0.05
        g = 0.25 + 0.75 * (at / dur)
        x = place(x, bp(noise(seg), 300, 6000) * env(seg, 0.001, None, 7) * g, at)
        at += 1 / rate
        rate = min(38, rate * 1.06)                        # รัวถี่ขึ้นเรื่อย ๆ
    x = place(x, crash(min(0.9, dur - (dur - 0.45))) * 1.0, dur - 0.45)
    return x


def suspense(dur=2.5):
    """ลุ้นระทึก — โดรนต่ำกับเสียงสูงไต่ขึ้น"""
    t = tt(dur)
    x = _chord([55, 82.5], dur, "saw") * 0.5
    x += osc(np.linspace(300, 900, len(t)), dur, "sine") * (t / dur) ** 2 * 0.5
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 6.5 * t)           # สั่นระทึก
    x *= np.minimum(1, t / 0.3) * (1 - np.clip((t - dur + 0.4) / 0.4, 0, 1))
    return reverb(bp(x, 40, 5000), 0.8, 0.3)


def tada(dur=1.5):
    """ต๊า-ด๊า — เฉลย/สำเร็จ"""
    x = np.zeros(n_of(dur))
    x = place(x, _chord([392, 494], 0.18) * env(0.18, 0.01, None, 2.2), 0.0)
    x = place(x, _chord([523, 659, 784], 1.3) * env(1.3, 0.012, None, 0.9), 0.2)
    return reverb(bp(drive(x, 1.3), 150, 7000), 0.6, 0.32)


def sad(dur=1.8):
    """เศร้า — ทรอมโบนไหลลง ใช้กับมุกพลาด"""
    t = tt(dur)
    steps = np.array([294, 277, 262, 233])                 # ไล่ลงทีละครึ่งเสียง
    idx = np.clip((t / dur * len(steps)).astype(int), 0, len(steps) - 1)
    f = steps[idx] * (1 + 0.02 * np.sin(2 * np.pi * 5.5 * t))
    x = drive(osc(f, dur, "saw"), 2.2) * 0.8
    x *= np.minimum(1, t / 0.05) * (1 - (t / dur) ** 3)
    return reverb(bp(x, 120, 3800), 0.5, 0.25)


# ─────────────────────────── ทะเบียน ───────────────────────────

# ชื่อ → (ฟังก์ชัน, พีคเป้าหมาย dBFS) — บรรยากาศเบากว่าเพราะเป็นพื้นหลัง
SFX = {
    "whoosh-rev": (whoosh_rev, -1.0), "glitch": (glitch, -1.0),
    "tape-stop": (tape_stop, -1.0), "downlifter": (downlifter, -1.0),
    "warp": (warp, -1.0),
    "punch": (punch, -1.0), "subdrop": (subdrop, -1.0),
    "metal-hit": (metal_hit, -1.0), "crash": (crash, -1.0), "glass": (glass, -1.0),
    "error": (error, -1.0), "message": (message, -1.0), "camera": (camera, -1.0),
    "coin": (coin, -1.0), "countdown": (countdown, -1.0),
    "splat": (splat, -1.0), "slip": (slip, -1.0), "magic": (magic, -1.0),
    "squeak": (squeak, -1.0), "honk": (honk, -1.0),
    "stream": (stream, -3.0), "campfire": (campfire, -3.0),
    "waterfall": (waterfall, -3.0), "city": (city, -3.0), "cafe": (cafe, -3.0),
    "fanfare": (fanfare, -1.0), "drumroll": (drumroll, -1.0),
    "suspense": (suspense, -1.0), "tada": (tada, -1.0), "sad": (sad, -1.0),
}


def main(argv):
    want = argv or list(SFX)
    bad = [w for w in want if w not in SFX]
    if bad:
        sys.exit(f"ไม่รู้จักเสียง: {', '.join(bad)}")
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"ปั้นเสียง {len(want)} ตัว → {OUT}")
    global rng
    for name in want:
        # เมล็ดสุ่มผูกกับชื่อ ไม่ใช่ลำดับการเรียก — สั่งปั้นตัวเดียวก็ได้ไฟล์เดิมเป๊ะ
        rng = np.random.default_rng(zlib.crc32(name.encode()))
        fn, peak = SFX[name]
        save(name, fn(), peak)


if __name__ == "__main__":
    main(sys.argv[1:])
