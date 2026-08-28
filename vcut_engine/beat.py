"""BEAT — หาจังหวะของเพลงประกอบ แล้วดูดรอยตัดเข้าหาจังหวะ

**ก่อนใช้: คลิปอ้างอิงในโปรเจกต์นี้ไม่ได้ตัดตามบีต**

วัดคลิป TikTok ทั้ง 7 ตัวใน `Tiktok/` แล้วเทียบรอยตัดทุกจุดกับบีตของเพลง —
สัดส่วนที่ตรงอยู่ที่ 4/21 ถึง 8/17 ซึ่ง *เท่ากับหรือต่ำกว่าความน่าจะเป็นโดยบังเอิญ*
คัตของคลิปแนวนั้นเดินตามเสียงพากย์ ไม่ใช่ตามเพลง (ดู docs/tiktok-reference/README.md
ข้อค้นพบที่ 1)

ชั้นนี้จึงไม่ใช่ "วิธีที่ถูกต้อง" ที่ควรเปิดทิ้งไว้ มันคือเครื่องมือของหนังอีกแบบ
— มอนทาจ · ไล่ภาพเร็ว · ท่อนที่ไม่มีคนพูด  เปิดใช้ตอนที่ตั้งใจจะให้ภาพเต้นตามเพลง

**ทำไมอยู่ในเอนจิน ไม่ใช่ใน Web Audio ของเบราว์เซอร์**

หน้าเว็บต้องวาดเส้นจังหวะ *และ* ปุ่มดูดรอยตัดต้องใช้ตำแหน่งจังหวะชุดเดียวกันเป๊ะ
ถ้าเบราว์เซอร์คิดเอง จะมีสูตรหาจังหวะสองชุดคนละภาษาทันที ซึ่งโปรเจกต์นี้เคยเจอมา
แล้วกับสูตรรูปทรงและรูปแบบตัวเลข (จึงมี `scripts/check_*_parity.py` อยู่)  ที่นี่
เอนจินคิดที่เดียว หน้าเว็บวาดตามอย่างเดียว

**ไม่เพิ่ม dependency แม้แต่ตัวเดียว** — ffmpeg ถอดคลื่นเสียงให้เป็นซองความดัง
100 ค่า/วินาที (จาก 48,000) แล้ว Python ทำงานกับตัวเลขหลักหมื่นด้วย stdlib ล้วน
เพลงสามนาทีใช้เวลาไม่ถึงหนึ่งวินาที

**ความแม่นที่วัดได้จริง**

วัดกับเพลงคลอสังเคราะห์ 53 ลูปใน `vcut-ui/public/bgm/` ซึ่ง *รู้ BPM ที่ถูกต้อง*
เพราะ `gen_bgm.py` เป็นคนกำหนดเอง:

    46/53  ได้ BPM ตรงเป๊ะ (คลาดเฉลี่ย 0.022 BPM → กริดเลื่อน 0.03 วิ ในหนัง 3 นาที)
     2/53  ได้เป็นทวีคูณ (เช่น 143 แทน 72) — **กริดยังใช้ได้** เพราะจังหวะจริงเป็น
           สมาชิกของกริดที่ละเอียดกว่าอยู่ดี
     5/53  เพี้ยนจริง — เกือบทั้งหมดเป็นเพลงแพดที่ไม่มีเครื่องเคาะเลย

**และไม่มีตัวเลข "ความมั่นใจ" ที่แยกห้าตัวนั้นออกมาได้** — ลองหลายสูตรแล้ว ตัวที่
ถูกกับตัวที่ผิดคะแนนคาบเกี่ยวกันหมด (ตัวถูกได้ 1.01 ตัวผิดได้ 1.53)  จึงคืน
`strength` ที่บอกแค่ว่า *เพลงนี้มีเครื่องเคาะชัดแค่ไหน* ตามตรง ไม่แปลงเป็น
เปอร์เซ็นต์ความถูกต้องที่เชื่อไม่ได้ — คนตั้งค่าดูเส้นกริดทับคลื่นเสียงแล้วรู้เอง
ในแวบเดียว และพิมพ์ BPM ทับได้ตลอด (ดู music.MUSIC["bpm"])
"""
import array
import math
import subprocess

from .util import read_json, write_json

CACHE = "beats.json"

# ── ซองความดัง 100 ค่า/วินาที ──
#
# 100 Hz คือจุดที่ยังเห็นการกระแทกของกลองแยกจากกันได้ (เขบ็ตที่ 190 BPM ห่างกัน
# 0.079 วินาที = 8 ตัวอย่าง) แต่ข้อมูลเหลือน้อยพอให้ Python วนลูปไหว
RATE = 100

# ช่วงจังหวะที่ยอมรับ — กว้างกว่านี้ได้แต่จะไปเจอ "จังหวะ" ที่จริง ๆ คือความยาว
# ท่อนเพลง (30 BPM) หรือเสียงสั่นของเครื่องดนตรี (400 BPM)
BPM_LO, BPM_HI = 60.0, 190.0

# ── หวีที่ใช้ให้คะแนนคาบเวลา ──
#
# **เป็นกำลังของสองล้วน ไม่มีสาม** — ตอนแรกใช้ (1,2,3,4) แล้วพลาด 17 จาก 53 เพลง
# โดยพลาดแบบเดียวกันหมด: ได้ 0.75 เท่าของค่าจริง  เพราะคาบที่ยาวเป็น 4/3 ของจริง
# ทำให้ *สาม* เท่าของมันไปตรงกับสี่จังหวะ (= หนึ่งห้องเพลง) ซึ่งเป็นยอดที่สูงมาก
# ในเพลงทุกเพลง  ตัดเลขสามออกแล้วเหลือพลาด 7 ตัว
COMB = ((1, 1.0), (2, 0.5), (4, 0.25), (8, 0.12))

# คนฟังเพลงรับรู้จังหวะรอบ ๆ 120 BPM — ถ่วงน้ำหนักตามนี้ช่วยตัดสินตอนที่ครึ่งหนึ่ง
# กับสองเท่าได้คะแนนพอ ๆ กัน (ซึ่งเกิดบ่อยมาก เพราะทั้งคู่เป็นคาบจริงทั้งคู่)
PRIOR_BPM, PRIOR_OCT = 120.0, 0.9

# ── ขีดจำกัดการขยับรอยตัด (วินาที) ──
#
# ช็อตพูดขยับได้น้อยกว่า เพราะการหดปลายช็อตพูดคือการตัดคำท้ายประโยคทิ้ง
# 0.25 ไม่ใช่เลขสวย — ที่ 120 BPM ระยะห่างจากรอยตัดถึงจังหวะที่ใกล้ที่สุดมากสุด
# คือครึ่งจังหวะ = 0.25 วินาทีพอดี  ตั้งเท่านี้จึงแปลว่า "เพลงเร็วกว่า 120 ดูดได้
# เกือบทุกรอย ช้ากว่านั้นดูดได้เฉพาะรอยที่ใกล้อยู่แล้ว" ซึ่งเป็นพฤติกรรมที่ถูก
TALK_LIMIT = 0.25
BROLL_LIMIT = 0.60
MIN_DUR = 0.30       # ช็อตสั้นกว่านี้อ่านว่ากะพริบ ไม่ใช่ช็อต


def cache_path(ctx):
    return ctx.work / CACHE


# ─────────────────────────── อ่านคลื่นเสียง ───────────────────────────

def envelope(path):
    """ซองความดัง 100 ค่า/วินาที — ffmpeg ทำงานหนักทั้งหมด

    `aeval=abs(val(0))` พับคลื่นให้เป็นบวกทั้งหมด แล้ว `aresample` ลดอัตราลงเหลือ
    100 Hz ซึ่ง *มีตัวกรองความถี่สูงในตัว* จึงได้ค่าเฉลี่ยแบบเรียบมาเลย ไม่ต้อง
    ให้ Python มาไล่หาค่ายอดทีละหน้าต่างจากตัวอย่าง 48,000 ค่า/วินาที
    """
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-ac", "1",
         "-af", f"aeval=abs(val(0)),aresample={RATE}", "-f", "s16le", "-"],
        capture_output=True, check=False)
    if r.returncode != 0 or not r.stdout:
        return []
    a = array.array("h")
    a.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    return [abs(v) / 32768.0 for v in a]


def onsets(env, w=8):
    """จุดที่เสียง *ดังขึ้นกว่าที่ผ่านมา* — ไม่ใช่จุดที่เสียงดัง

    เพลงที่มีแพดคลอดังตลอดเวลาไม่มีจังหวะให้จับถ้าดูแค่ความดัง สิ่งที่บอกจังหวะ
    คือการเปลี่ยนแปลง  ลบด้วยค่าเฉลี่ยของ 80 มิลลิวินาทีก่อนหน้าแล้วตัดค่าลบทิ้ง
    (เสียงที่ค่อย ๆ เบาลงไม่ใช่จังหวะ)
    """
    out, run = [], 0.0
    for i, v in enumerate(env):
        lo = max(0, i - w)
        run = sum(env[lo:i]) / max(1, i - lo) if i else v
        out.append(max(0.0, v - run))
    m = max(out) or 1.0
    return [v / m for v in out]


def _autocorr(x, maxlag):
    n = len(x)
    if n < 4:
        return [0.0] * (maxlag + 1)
    mu = sum(x) / n
    y = [v - mu for v in x]
    e0 = sum(v * v for v in y) or 1.0
    return [sum(y[i] * y[i + L] for i in range(n - L)) / e0
            for L in range(min(maxlag, n - 1) + 1)]


def _peak(ac, i):
    """ยอดคลื่นจริงระหว่างสามจุด — คืนตำแหน่งเป็นทศนิยม

    ต้องมีเพราะ lag เป็นจำนวนเต็มที่ 100 Hz: ที่ 120 BPM (lag 50) ขยับหนึ่งหน่วย
    = เปลี่ยนไป 2.4 BPM ซึ่งทำให้กริดเลื่อนหลายวินาทีในหนังสามนาที
    """
    if i <= 0 or i + 1 >= len(ac):
        return float(i)
    a, b, c = ac[i - 1], ac[i], ac[i + 1]
    d = a - 2 * b + c
    return float(i) + (0.5 * (a - c) / d if abs(d) > 1e-12 else 0.0)


def _prior(bpm):
    return math.exp(-0.5 * (math.log2(bpm / PRIOR_BPM) / PRIOR_OCT) ** 2)


def tempo(on):
    """(bpm, ความชัดของจังหวะ) — ยังไม่รู้ว่าจังหวะแรกอยู่ตรงไหน"""
    lo_l = max(2, int(RATE * 60 / BPM_HI))
    hi_l = int(RATE * 60 / BPM_LO)
    if len(on) < hi_l * 2:
        hi_l = max(lo_l + 1, len(on) // 2)
    ac = _autocorr(on, hi_l * 8 + 2)

    def score(L):
        return sum((ac[L * k] if L * k < len(ac) else 0.0) * w
                   for k, w in COMB) * _prior(RATE * 60.0 / L)

    L = max(range(lo_l, hi_l + 1), key=score)

    # ── ปรับให้ละเอียดด้วยยอดที่ทวีคูณสูงสุดเท่าที่ข้อมูลยาวพอ ──
    #
    # ยอดที่ 8 เท่าของคาบอยู่ห่างจากศูนย์กลางแปดเท่า การอ่านตำแหน่งมันจึงละเอียด
    # กว่าแปดเท่าไปด้วย — วัดจริง: คลาดเฉลี่ยลดจาก ~1 BPM เหลือ 0.022 BPM
    mult = 1
    for m in (8, 4, 2):
        if L * m + 1 < len(ac) and L * m < len(on) // 2:
            mult = m
            break
    span = max(1, mult // 2)
    lo_i = max(1, L * mult - span - 1)
    hi_i = min(len(ac) - 2, L * mult + span + 1)
    pk = max(range(lo_i, hi_i + 1), key=lambda i: ac[i]) if hi_i > lo_i else L * mult
    period = _peak(ac, pk) / mult
    if not (lo_l * 0.5 < period < hi_l * 1.5):
        period = float(L)
    return RATE * 60.0 / period, round(score(L), 4)


def phase(on, period):
    """วินาทีของจังหวะแรก — ลองทุกจุดเริ่มแล้วเอาที่ทับ onset ได้มากที่สุด

    ค้นทีละ 1/4 ตัวอย่าง (2.5 มิลลิวินาที) เพราะจังหวะที่เลื่อนไป 10 มิลลิวินาที
    ตายังไม่เห็น แต่ 30 มิลลิวินาทีเริ่มเห็นว่า "เส้นไม่ตรงกับกลอง"

    **บางเพลงได้เฟสที่เป็นจังหวะยก ไม่ใช่จังหวะที่หนึ่ง — และนั่นถูกแล้ว**

    ตอนวัดกับ 53 ลูปที่รู้เฉลย มี 8 เพลงที่เฟสห่างจาก "ห้องที่ 0 จังหวะที่ 0"
    ไปครึ่งจังหวะพอดี ซึ่งดูเหมือนบั๊กคลาสสิกของการหาเฟส  ไล่ดูจริงแล้วไม่ใช่:
    ตำแหน่งที่ตรวจได้มี onset รวมมากกว่าเฟส 0 อยู่ 2–5 เท่า เพราะลูปพวกนั้น
    กระแทกที่สแนร์/ไฮแฮทแรงกว่าคิกจริง ๆ

    ที่ชั้นนี้ต้องการคือ *จุดที่หูได้ยินว่ากระแทก* ไม่ใช่จุดที่โน้ตในกระดาษเริ่ม —
    ตัดหนังลงจังหวะยกเป็นการตัดที่ใช้ได้และใช้กันทั่วไป  ลองไปบังคับให้ไปเกาะ
    เฟส 0 ด้วยการถ่วงน้ำหนักเสียงเบสแล้ว ผลเท่าเดิมทุกเพลง (เบสก็อยู่ตรงนั้น)
    """
    if period < 2:
        return 0.0
    best, sc = 0.0, -1.0
    steps = int(period * 4)
    for k in range(steps):
        off = k / 4.0
        s = 0.0
        i = off
        while i < len(on) - 1:
            j = int(i)
            f = i - j
            s += on[j] * (1 - f) + on[j + 1] * f      # แทรกเชิงเส้นระหว่างสองค่า
            i += period
        if s > sc:
            best, sc = off, s
    return best / RATE


def peaks(env, hz=20):
    """คลื่นเสียงย่อสำหรับวาดบนไทม์ไลน์ — 20 ค่า/วินาที เป็นจำนวนเต็ม 0–100

    ย่อจาก 100 Hz เพราะเลนเพลงบนไทม์ไลน์สูง 30 พิกเซล และหนังสิบนาทีที่ 100 Hz
    คือตัวเลข 60,000 ตัวที่ต้องส่งผ่าน HTTP ทุกครั้งที่เปิดหน้า
    """
    step = max(1, RATE // hz)
    m = max(env) or 1.0
    return [min(100, int(round(max(env[i:i + step]) / m * 100)))
            for i in range(0, len(env), step)]


def detect(path):
    """วิเคราะห์ไฟล์เสียงหนึ่งไฟล์ — คืน dict ที่เก็บลงไฟล์ได้เลย"""
    env = envelope(path)
    if len(env) < RATE:
        return {"bpm": 0.0, "offset": 0.0, "strength": 0.0,
                "dur": round(len(env) / RATE, 3), "peaks": [], "error": "อ่านเสียงไม่ได้"}
    on = onsets(env)
    bpm, strength = tempo(on)
    return {
        "bpm": round(bpm, 3),
        "offset": round(phase(on, RATE * 60.0 / bpm), 4),
        "strength": strength,
        "dur": round(len(env) / RATE, 3),
        "peaks": peaks(env),
    }


# ─────────────────────────── แคช ───────────────────────────

def _sig(path):
    try:
        st = path.stat()
        return [st.st_size, int(st.st_mtime)]
    except OSError:
        return [0, 0]


def analyse(ctx, files, force=False):
    """วิเคราะห์ไฟล์ที่ยังไม่เคยวิเคราะห์ แล้วเขียนลง .vcut/beats.json

    เก็บลายเซ็นไฟล์ไว้ด้วย (ขนาด+เวลาแก้) แบบเดียวกับ cache ของ segment —
    ไฟล์ที่ถูกเขียนทับด้วยเพลงอื่นชื่อเดิมจะถูกวิเคราะห์ใหม่เอง
    """
    from . import overlay as ovl
    cache = read_json(cache_path(ctx), {}) or {}
    out = dict(cache) if not force else {}
    n_new = 0
    for name in files:
        p = ovl.dir_of(ctx) / name
        if not p.is_file():
            continue
        sig = _sig(p)
        old = out.get(name)
        if old and old.get("sig") == sig and not force:
            continue
        out[name] = {**detect(p), "sig": sig}
        n_new += 1
    # ไฟล์ที่ไม่มีแทร็กไหนใช้แล้วถูกทิ้งไป — ไม่งั้นไฟล์นี้โตขึ้นเรื่อย ๆ ตามจำนวน
    # เพลงที่เคยลองวางแล้วเอาออก
    out = {k: v for k, v in out.items() if k in set(files)}
    if out != cache:
        write_json(cache_path(ctx), out)
    return out, n_new


# ─────────────────────────── กริดจังหวะบนไทม์ไลน์ ───────────────────────────

def track_beats(m, info, total):
    """จังหวะของแทร็กเดียว → วินาทีในหนัง

    **ค่าที่คนพิมพ์เองชนะค่าที่ตรวจได้เสมอ** (`bpm` > 0 = ตั้งเอง) เพราะตัวตรวจ
    พลาดจริงประมาณ 1 ใน 10 เพลง และคนที่เห็นเส้นทับคลื่นเสียงรู้ทันทีว่าพลาด

    **กริดเดินด้วย BPM คงที่ตลอดช่วง ไม่ใช่ทำซ้ำจังหวะของไฟล์ทุกรอบที่วน** —
    เพลงคลอในโปรเจกต์นี้ยาวเป็นจำนวนเต็มของห้องเพลงพอดี (8 ห้อง × 4 จังหวะ) สอง
    ทางจึงให้ผลเท่ากัน  แต่เพลงที่ดึงมาจากข้างนอกไม่รับประกันแบบนั้น และการเดิน
    ต่อด้วยจังหวะคงที่คือสิ่งที่คนคาดหวังจากคำว่า "จังหวะเพลง" (ดู loop_drift)
    """
    bpm = float(m.get("bpm") or 0.0) or float((info or {}).get("bpm") or 0.0)
    if bpm <= 0:
        return []
    off = float(m.get("beat_offset") or 0.0)
    if not m.get("beat_offset"):
        off = float((info or {}).get("offset") or 0.0)
    at = float(m.get("at") or 0.0)
    span = float(m.get("dur") or 0.0)
    end = min(total, at + span) if span > 0 else total
    if not m.get("loop") and info and info.get("dur"):
        end = min(end, at + float(info["dur"]))
    period = 60.0 / bpm
    out, t = [], at + off
    # เพลงที่ at ติดลบไม่มี — แต่ offset ทำให้จังหวะแรกเลยจุดเริ่มไปได้ ต้องถอย
    # กลับมาให้ครอบคลุมช่วงต้นด้วย ไม่งั้นวินาทีแรก ๆ ไม่มีเส้นทั้งที่มีเพลง
    while t - period >= at - 1e-9:
        t -= period
    while t < end - 1e-9:
        if t >= -1e-9:
            out.append(round(t, 4))
        t += period
    return out


def loop_drift(m, info):
    """เพลงที่วนซ้ำแล้วจังหวะขาดตอนไหม — คืนเศษวินาทีที่ไม่ลงตัว

    ความยาวไฟล์ที่ไม่ใช่จำนวนเต็มของจังหวะ แปลว่าทุกครั้งที่วน เสียงจะกระโดด
    ไปเฟสอื่นแต่เส้นกริดยังเดินเท่าเดิม — เส้นที่ตรงในนาทีแรกจะเพี้ยนในนาทีที่สอง
    ตัวเลขนี้มีไว้เตือน ไม่ใช่แก้ให้ (แก้ให้แปลว่าต้องเลือกว่าจะเชื่อเสียงหรือเชื่อ
    กริด ซึ่งเป็นการตัดสินใจของคนตั้งค่า)
    """
    if not m.get("loop") or not info or not info.get("dur"):
        return 0.0
    bpm = float(m.get("bpm") or 0.0) or float(info.get("bpm") or 0.0)
    if bpm <= 0:
        return 0.0
    period = 60.0 / bpm
    rem = float(info["dur"]) % period
    return round(min(rem, period - rem), 4)


def grid(data, cache, total):
    """จังหวะของทั้งเรื่อง → รายการวินาทีในหนัง เรียงแล้ว ไม่ซ้ำ

    แทร็กที่ช่วงเวลาทับกัน: ทุกแทร็กใส่เส้นของตัวเองลงไป แล้วเส้นที่ห่างกันไม่ถึง
    30 มิลลิวินาทีถูกยุบเป็นเส้นเดียว — ตาแยกไม่ออกอยู่แล้ว และการให้แทร็กใดแทร็ก
    หนึ่ง "ชนะ" ต้องมีกฎว่าใครชนะ ซึ่งอธิบายให้คนใช้เข้าใจยากกว่าที่มันคุ้ม
    """
    got = []
    for m in (data.get("music") or []):
        got += track_beats(m, (cache or {}).get(m.get("file", "")), total)
    got.sort()
    out = []
    for t in got:
        if not out or t - out[-1] > 0.03:
            out.append(t)
    return out


# ─────────────────────────── ดูดรอยตัดเข้าจังหวะ ───────────────────────────

def _nearest(grid_, t):
    """จังหวะที่ใกล้เวลานี้ที่สุด — ค้นแบบครึ่งช่วง เพราะกริดเรียงมาแล้ว"""
    if not grid_:
        return None
    lo, hi = 0, len(grid_) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if grid_[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    cands = [grid_[lo]]
    if lo > 0:
        cands.append(grid_[lo - 1])
    return min(cands, key=lambda b: abs(b - t))


def snap(shots, grid_, talk=TALK_LIMIT, broll=BROLL_LIMIT, min_dur=MIN_DUR):
    """ดูดรอยตัดทุกจุดเข้าหาจังหวะที่ใกล้ที่สุด — คืน (ช็อตใหม่, รายงาน)

    **ขยับได้ทางเดียวคือเปลี่ยนความยาวช็อตก่อนรอยตัด** เพราะตำแหน่งของรอยตัดบน
    ไทม์ไลน์คือผลรวมสะสมของความยาวช็อตทั้งหมดก่อนหน้า — เลื่อนทั้งช็อต (ขยับทั้ง
    start และ end) ไม่ได้ทำให้รอยตัดขยับเลยสักมิลลิวินาที

    ขยับที่ `end` ไม่ใช่ `start` เพราะ start คือจุดที่คนเลือกไว้ว่าประโยคเริ่มตรงไหน
    ส่วน end คือหางที่ตัดได้

    **ไล่จากซ้ายไปขวาและคิดจากเวลาจริงที่สะสมมา** — หดช็อตที่สามแล้วช็อตที่สี่ถึง
    ท้ายเรื่องเลื่อนตามหมด ถ้าคิดรอยตัดทุกจุดจากไทม์ไลน์เดิมทีเดียว จุดหลัง ๆ จะ
    ไปเกาะจังหวะที่ตัวเองไม่ได้อยู่ตรงนั้นแล้ว

    **รอยที่เอื้อมไม่ถึงถูกปล่อยไว้เฉย ๆ ไม่ใช่ขยับไปให้สุดขีดจำกัด** — ขยับไป
    ครึ่งทางแล้วไม่ถึงจังหวะ คือได้ช็อตที่เปลี่ยนความยาวโดยไม่ได้อะไรกลับมาเลย
    """
    out, report = [], []
    t = 0.0
    for i, s in enumerate(shots):
        start = float(s.get("start", 0.0))
        end = float(s.get("end", 0.0))
        dur = round(end - start, 6)
        row = {"i": i, "start": start, "end": end}
        # ขอบท้ายของช็อตสุดท้ายไม่ใช่ "รอยตัด" — ไม่มีอะไรตามหลังให้ต้องตรงกับอะไร
        if i == len(shots) - 1 or dur <= 0:
            out.append(row)
            t += dur
            continue

        want = t + dur
        b = _nearest(grid_, want)
        limit = talk if str(s.get("kind", "")) == "TALK" else broll
        if b is None:
            report.append({"i": i, "why": "ไม่มีจังหวะในช่วงนี้"})
            out.append(row)
            t += dur
            continue

        delta = b - want
        if abs(delta) > limit + 1e-9:
            report.append({"i": i, "why": "จังหวะที่ใกล้สุดไกลเกินขีดจำกัด",
                           "need": round(abs(delta), 3), "limit": limit})
            out.append(row)
            t += dur
            continue

        # ยืดได้เท่าที่คลิปต้นทางมีเหลือ · หดได้ไม่ต่ำกว่าความยาวขั้นต่ำ
        room_hi = float(s.get("clip_dur", end)) - end
        room_lo = min_dur - dur
        if delta > room_hi + 1e-9 or delta < room_lo - 1e-9:
            report.append({"i": i, "why": "คลิปไม่มีที่ให้ยืด/หดพอ",
                           "need": round(delta, 3),
                           "room": [round(room_lo, 3), round(room_hi, 3)]})
            out.append(row)
            t += dur
            continue

        new_end = round(end + delta, 6)
        row["end"] = new_end
        # รอยที่ตรงจังหวะอยู่แล้วไม่นับว่า "ขยับ" — ไม่งั้นตัวเลขที่หน้าเว็บขึ้นว่า
        # "ขยับ 40 รอย" จะรวมรอยที่ไม่ได้แตะเลยเข้าไปด้วย แล้วคนกดจะไปรอ render
        # ใหม่ 40 ชิ้นทั้งที่จริง ๆ มีแค่ไม่กี่ชิ้นที่เปลี่ยน
        if abs(delta) > 1e-3:
            row["moved"] = round(delta, 4)
        out.append(row)
        t += new_end - start
    return out, report


# ─────────────────────────── ให้หน้าเว็บ ───────────────────────────

def view(ctx, data=None, total=None, force=False):
    """ทุกอย่างที่แผงเพลงกับไทม์ไลน์ต้องใช้ — วิเคราะห์ให้ด้วยถ้ายังไม่เคย

    `total` มาจากผู้เรียกเพราะความยาวหนังเป็นของขั้น 3/5 ไม่ใช่ของชั้นนี้ — ชั้นนี้
    รู้จักแค่ไฟล์เสียงกับแทร็ก
    """
    from . import fx as fxmod
    data = data if data is not None else fxmod.load(ctx)
    tracks = [m for m in (data.get("music") or []) if m.get("file")]
    cache, n_new = analyse(ctx, [m["file"] for m in tracks], force=force)
    total = float(total or 0.0)
    rows = []
    for m in tracks:
        info = cache.get(m["file"]) or {}
        auto_bpm = float(info.get("bpm") or 0.0)
        set_bpm = float(m.get("bpm") or 0.0)
        rows.append({
            "id": m.get("id", ""), "file": m["file"],
            "at": float(m.get("at") or 0.0),
            "dur": float(m.get("dur") or 0.0),
            "loop": bool(m.get("loop")),
            "auto_bpm": round(auto_bpm, 2),
            "auto_offset": round(float(info.get("offset") or 0.0), 4),
            "bpm": round(set_bpm or auto_bpm, 2),
            "offset": round(float(m.get("beat_offset") or 0.0)
                            or float(info.get("offset") or 0.0), 4),
            "manual": set_bpm > 0,
            "strength": float(info.get("strength") or 0.0),
            "file_dur": float(info.get("dur") or 0.0),
            "peaks": info.get("peaks") or [],
            "peak_hz": 20,
            "loop_drift": loop_drift(m, info),
            "error": info.get("error", ""),
        })
    return {
        "tracks": rows,
        "grid": grid(data, cache, total),
        "total": round(total, 3),
        "analysed": n_new,
        # ขีดจำกัดตั้งต้นของปุ่มดูดรอยตัด — หน้าเว็บไม่ต้องมีเลขชุดที่สอง
        "limits": {"talk": TALK_LIMIT, "broll": BROLL_LIMIT, "min_dur": MIN_DUR},
        "range": [BPM_LO, BPM_HI],
    }
