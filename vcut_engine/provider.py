"""PROVIDER — ช่องทางคุยกับ AI  ตอนนี้มีสองทาง เลือกได้ที่ [ai] provider

    claude_cli   เรียก `claude -p` ในเครื่อง  ใช้โควตาที่สมัครไว้ ไม่ต้องมี API key
                 AI อ่านไฟล์ในเครื่องเองได้ (contact sheet ส่งเป็น path) และ
                 "ส่งคำตอบ" ด้วยการเขียนไฟล์ JSON ลง .vcut/ai/

    gemini       ยิง HTTP ไป Generative Language API ด้วย API key  ตอบกลับเป็น
                 ข้อความในคำขอเดียว ไม่มีเครื่องมืออ่าน/เขียนไฟล์ จึงไม่เห็นภาพ
                 และต้องบอกให้ตอบ JSON กลับมาทางข้อความแทน

โมดูลอื่นเรียกแค่ `ask()` ตัวเดียว — ทั้ง `vcut ai` และ `vcut review` จึงสลับ
ผู้ให้บริการได้พร้อมกันโดยไม่ต้องรู้ว่าข้างในต่างกันยังไง

ที่นี่ไม่ import โมดูลอื่นในแพ็กเกจนอกจาก util — ai.py กับ review.py เป็นฝ่าย
import ตัวนี้ ไม่ใช่ทางกลับกัน จะได้ไม่วนกัน
"""
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from .util import die, info, read_json, warn

PROVIDERS = ("claude_cli", "gemini")

# ตอบยาวเกินเท่านี้แล้วยังแกะ JSON ไม่ได้ = โควตา output หมดไปกับการคิด
MAX_OUT_WARN = 16000

GEMINI_URL = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "{model}:generateContent")

# ต่อท้ายโปรมป์เมื่อใช้ Gemini — โปรมป์ทุกตัวเขียนไว้สำหรับ Claude CLI ซึ่งส่ง
# คำตอบด้วยการเขียนไฟล์ ทางนี้ไม่มีเครื่องมือนั้น ต้องสั่งกลับให้ชัดที่ท้ายสุด
# (ท้ายสุดเพราะโมเดลให้น้ำหนักคำสั่งที่อยู่ใกล้จุดตอบมากกว่า)
GEMINI_TAIL = """

── ช่องทางส่งคำตอบ (สำคัญกว่าที่เขียนไว้ข้างบน) ──
คุณไม่มีเครื่องมืออ่านหรือเขียนไฟล์ในรอบนี้ ข้ามคำสั่งที่ให้เขียนคำตอบลงไฟล์
และข้ามคำสั่งที่ให้เปิดดูภาพไปได้เลย — ตอบกลับมาเป็น JSON ล้วนตาม schema
ในข้อความนี้ตรง ๆ ไม่ต้องมีคำอธิบายหรือ ``` ครอบ
"""


def cfg_of(ctx, section):
    """ค่าของ AI ตัวนี้ — [review] ทับ [ai] ได้ทีละคีย์ ไม่ได้ตั้งก็ตกมาใช้ของ [ai]"""
    def cfg(key, default=None):
        v = ctx.get(f"{section}.{key}")
        return ctx.get(f"ai.{key}", default) if v is None or v == "" else v
    return cfg


def provider_of(ctx, section="ai"):
    p = str(cfg_of(ctx, section)("provider", "claude_cli") or "claude_cli").strip()
    return p if p in PROVIDERS else "claude_cli"


def ask(ctx, prompt, out_path, section="ai", hint=""):
    """ถาม AI แล้วคืน (dict คำตอบ, meta) — ตายพร้อมคำอธิบายถ้าแกะคำตอบไม่ได้"""
    if provider_of(ctx, section) == "gemini":
        return call_gemini(ctx, prompt, out_path, section=section, hint=hint)
    return call_claude(ctx, prompt, out_path, section=section, hint=hint)


# ─────────────────────────── แกะคำตอบ ───────────────────────────

def _extract_json(text):
    """ดึง JSON ก้อนแรกออกจากข้อความ — เผื่อโมเดลห่อด้วย ``` หรือพูดนำ"""
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    i = text.find("{")
    if i < 0:
        return None
    depth, in_str, esc = 0, False, False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[i:j + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _blame(envelope, stdout):
    """แกะ JSON ไม่ได้เพราะอะไร — เดาจากซองที่ CLI ส่งกลับมา

    เคสที่เจอจริงและเจ็บที่สุด: โจทย์ใหญ่เกินจนโมเดลใช้โควตา output หมดไปกับ
    การคิด (stop_reason = max_tokens) แล้วยังไม่ทันตอบ JSON — เสียทั้งเวลาและ
    โควตาโดยได้ศูนย์ ต้องบอกให้ชัดว่าเกิดอะไร ไม่ใช่แค่ "แกะไม่ได้"
    """
    env = envelope if isinstance(envelope, dict) else {}
    out = int((env.get("usage") or {}).get("output_tokens") or 0)
    if env.get("subtype") and env.get("subtype") != "success":
        return f"claude จบด้วย {env['subtype']}"
    if "max_tokens" in (stdout or "") or out >= MAX_OUT_WARN:
        return (f"โมเดลใช้โควตา output หมดไปกับการคิด (ออกไป {out:,} token) "
                "จนยังไม่ทันตอบ JSON — stop_reason = max_tokens")
    if not str(env.get("result") or "").strip():
        return "claude ตอบกลับมาเป็นข้อความว่าง"
    return ""


# ─────────────────────────── ทาง 1 · Claude CLI ───────────────────────────

def call_claude(ctx, prompt, out_path, section="ai", hint=""):
    """เรียก claude -p แบบไม่โต้ตอบ · คำตอบมาทางไฟล์ ถ้าไม่มีค่อยแกะจาก stdout

    section เลือกว่าอ่านค่าจาก [ai] หรือ [review] — สอง AI คนละบทบาท
    ตั้งโมเดล/เวลารอคนละค่าได้ ค่าไหนไม่ได้ตั้งใน [review] จะตกมาใช้ของ [ai]
    hint = ทางแก้ที่จะบอกผู้ใช้ถ้าแกะคำตอบไม่ได้ (ผู้เรียกรู้บริบทดีกว่า)
    """
    cfg = cfg_of(ctx, section)
    binary = cfg("binary", "claude")
    cmd = [binary, "-p", "--output-format", "json"]
    if cfg("model"):
        cmd += ["--model", str(cfg("model"))]
    cmd += ["--permission-mode", str(cfg("permission_mode", "acceptEdits"))]
    tools = str(cfg("allowed_tools", "Read,Write")).strip()
    if tools:
        cmd += ["--allowedTools", tools]

    out_path.unlink(missing_ok=True)
    t0 = time.time()
    try:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                           cwd=str(ctx.work),
                           timeout=float(cfg("timeout", 1800)))
    except FileNotFoundError:
        die(f"ไม่พบคำสั่ง '{binary}' — ติดตั้ง Claude Code ก่อน หรือตั้ง [{section}] binary")
    except subprocess.TimeoutExpired:
        die(f"AI ไม่ตอบภายใน {cfg('timeout', 1800)} วินาที — เพิ่ม [{section}] timeout")

    meta = {"seconds": round(time.time() - t0, 1), "provider": "claude_cli"}
    raw_path = out_path.with_name(out_path.stem + ".raw.txt")
    raw_path.write_text((r.stdout or "") + "\n--- stderr ---\n" + (r.stderr or ""),
                        encoding="utf-8")

    envelope = None
    try:
        envelope = json.loads(r.stdout)
    except json.JSONDecodeError:
        pass
    if isinstance(envelope, dict):
        meta["cost_usd"] = envelope.get("total_cost_usd")
        meta["turns"] = envelope.get("num_turns")
        meta["model"] = next(iter(envelope.get("modelUsage") or {}), None)
        meta["out_tokens"] = (envelope.get("usage") or {}).get("output_tokens")

    if r.returncode != 0 and not out_path.exists():
        die(f"claude ตอบกลับด้วย exit {r.returncode}\n{(r.stderr or r.stdout)[-600:]}")

    data = read_json(out_path)
    if data is None and isinstance(envelope, dict):
        data = _extract_json(envelope.get("result", ""))
    elif data is None:
        # แกะจาก stdout ได้เฉพาะตอนที่ซองพังจนอ่านไม่ออก — ถ้าซองอ่านได้แล้วมา
        # แกะซ้ำตรงนี้ จะได้ "ซอง" กลับไปเป็นคำตอบ แล้วสาเหตุจริงจะถูกกลบ
        data = _extract_json(r.stdout)
    if data is None:
        why = _blame(envelope, r.stdout)
        if why:
            warn(f"AI ตอบกลับมาแต่ใช้ไม่ได้ — {why}")
        if hint:
            warn(hint)
        die("แกะ JSON จากคำตอบไม่ได้ — หยุดไว้ก่อน ไม่เขียนทับของเดิม\n"
            f"   คำตอบดิบอยู่ที่ {raw_path}")
    return data, meta


# ─────────────────────────── ทาง 2 · Gemini API ───────────────────────────

def gemini_key(ctx):
    """หา API key จาก env ก่อน แล้วค่อยไฟล์ลับในโปรเจกต์

    ไม่อ่านจากไฟล์ .toml โดยตั้งใจ — ไฟล์โปรเจกต์ถูก commit ลง git ส่วน
    .vcut/ อยู่ใน .gitignore อยู่แล้ว key จึงไม่หลุดไปกับ repo
    """
    for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        v = os.environ.get(var, "").strip()
        if v:
            return v, var
    secret = Path(ctx.work) / "secrets.json"
    v = str((read_json(secret, {}) or {}).get("gemini_api_key") or "").strip()
    if v:
        return v, str(secret)
    return "", ""


def key_state(ctx):
    """หน้าเว็บถามว่า 'มี key แล้วหรือยัง' — ไม่คืนตัว key ออกไปไหนทั้งสิ้น"""
    key, src = gemini_key(ctx)
    return {"ok": bool(key), "from": src,
            "hint": "ตั้ง env GEMINI_API_KEY หรือใส่ผ่านหน้าเว็บ "
                    "(เก็บที่ .vcut/secrets.json ซึ่งไม่ถูก commit)"}


def save_gemini_key(ctx, key):
    """เก็บ key ลงไฟล์ลับของโปรเจกต์ — ส่งค่าว่างมา = ลบทิ้ง"""
    secret = Path(ctx.work) / "secrets.json"
    data = read_json(secret, {}) or {}
    key = str(key or "").strip()
    if key:
        data["gemini_api_key"] = key
    else:
        data.pop("gemini_api_key", None)
    secret.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    try:
        secret.chmod(0o600)
    except OSError:
        pass
    return key_state(ctx)


def _gemini_post(url, body, timeout):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def call_gemini(ctx, prompt, out_path, section="ai", hint=""):
    """ยิง generateContent ครั้งเดียวจบ — บังคับให้ตอบเป็น JSON ด้วย mime type"""
    cfg = cfg_of(ctx, section)
    key, src = gemini_key(ctx)
    if not key:
        die("ยังไม่มี Gemini API key — ตั้ง env GEMINI_API_KEY "
            "หรือใส่ผ่านหน้าเว็บ (เก็บที่ .vcut/secrets.json)")
    model = str(cfg("gemini_model", "gemini-2.5-flash") or "gemini-2.5-flash")
    timeout = float(cfg("timeout", 1800))
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt + GEMINI_TAIL}]}],
        "generationConfig": {
            "temperature": float(cfg("gemini_temperature", 0.4) or 0.4),
            "maxOutputTokens": int(cfg("gemini_max_tokens", 32768) or 32768),
            "responseMimeType": "application/json",
        },
    }
    url = GEMINI_URL.format(model=model) + "?key=" + key

    t0 = time.time()
    raw_path = out_path.with_name(out_path.stem + ".raw.txt")
    env = None
    for attempt in range(3):
        try:
            env = _gemini_post(url, body, timeout)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:600]
            # 429/503 = คิวเต็มชั่วคราว ลองใหม่ได้ · ที่เหลือคือผิดจริง หยุดเลย
            if e.code in (429, 500, 503) and attempt < 2:
                warn(f"gemini ตอบ {e.code} — รอ {4 * (attempt + 1)} วิแล้วลองใหม่")
                time.sleep(4 * (attempt + 1))
                continue
            raw_path.write_text(f"HTTP {e.code}\n{msg}", encoding="utf-8")
            die(f"gemini ตอบกลับด้วย HTTP {e.code} (key จาก {src})\n{msg}")
        except urllib.error.URLError as e:
            die(f"ต่อ gemini ไม่ได้: {e.reason}")

    meta = {"seconds": round(time.time() - t0, 1), "provider": "gemini",
            "model": model}
    usage = (env or {}).get("usageMetadata") or {}
    meta["out_tokens"] = usage.get("candidatesTokenCount")
    meta["in_tokens"] = usage.get("promptTokenCount")

    cands = (env or {}).get("candidates") or []
    text = "".join(p.get("text", "")
                   for p in ((cands[0].get("content") or {}).get("parts") or [])) \
        if cands else ""
    raw_path.write_text(text or json.dumps(env, ensure_ascii=False, indent=2),
                        encoding="utf-8")

    data = None
    if text:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = _extract_json(text)
    if not isinstance(data, dict):
        reason = (cands[0].get("finishReason") if cands else None) \
            or ((env or {}).get("promptFeedback") or {}).get("blockReason")
        if reason == "MAX_TOKENS":
            warn("โมเดลตอบยาวจนชนเพดาน — ลด batch หรือเพิ่ม [ai] gemini_max_tokens")
        elif reason:
            warn(f"gemini จบด้วย {reason}")
        if hint:
            warn(hint)
        die("แกะ JSON จากคำตอบไม่ได้ — หยุดไว้ก่อน ไม่เขียนทับของเดิม\n"
            f"   คำตอบดิบอยู่ที่ {raw_path}")
    # เก็บคำตอบไว้ที่เดียวกับทาง claude เพื่อให้ดีบักได้เหมือนกัน
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    info(f"  gemini {model} · {meta['seconds']}s"
         + (f" · out {meta['out_tokens']:,} token" if meta.get("out_tokens") else ""))
    return data, meta
