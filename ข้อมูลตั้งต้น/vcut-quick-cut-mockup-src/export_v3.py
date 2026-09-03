import base64, json, re, os
OUT = "/Users/macbook3lf1/web work/CutVideo-vcut_engine/ข้อมูลตั้งต้น/vcut-v3-แผงควบคุม-C"
os.makedirs(OUT, exist_ok=True)
c = json.load(open("canvas.json", encoding="utf-8"))
boards = sorted([a for a in c["artboards"] if a.get("page") == "page-3"], key=lambda a: int(a["title"].split(" ·")[0]))
notes = {n["id"][3:]: n["text"] for n in c["annotations"] if n.get("page") == "page-3" and n["id"].startswith("c3-") and n["id"] != "c3-head"}
head = [n["text"] for n in c["annotations"] if n.get("id") == "c3-head"][0]
cache = {}
def data_uri(fn):
    mime = "image/png" if fn.endswith(".png") else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(open(fn, "rb").read()).decode()
def inline(html):
    return re.sub(r'src="([A-Za-z0-9_\-]+\.(?:jpg|png))"', lambda m: f'src="{cache.setdefault(m.group(1), data_uri(m.group(1)))}"', html)
def standalone(src, title):
    s = open(src, encoding="utf-8").read()
    helmet = re.search(r"<helmet>(.*?)</helmet>", s, re.S).group(1)
    body = re.search(r"</helmet>(.*?)</x-dc>", s, re.S).group(1)
    return f'<!doctype html>\n<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=1440"><title>{title}</title>{helmet}\n<style>html,body{{background:#1c1e1b;margin:0;}}body{{display:flex;justify-content:center;}}</style></head>\n<body>{inline(body)}</body></html>'
files = []
for a in boards:
    n = int(a["title"].split(" ·")[0]); stem = a["file"].replace(".dc.html", ""); fn = f"{n:02d}-{stem}.html"
    open(os.path.join(OUT, fn), "w", encoding="utf-8").write(standalone(a["file"], a["title"]))
    files.append((fn, a["title"], notes.get(stem, "")))
cards = "".join(f'<a class="card" href="{fn}" target="_blank"><div class="frame"><iframe src="{fn}" loading="lazy" tabindex="-1"></iframe></div><div class="cap"><b>{t}</b><span>{nt}</span></div></a>' for fn, t, nt in files)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(f'''<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>vcut · v3 แผงควบคุม C · 20 หน้า</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap">
<style>body{{margin:0;background:#1c1e1b;color:#d9dbd2;font-family:"Mitr",sans-serif;padding:24px 32px 60px}}h1{{font-size:20px;font-weight:500;margin:0 0 6px}}.tag{{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7f847a}}.head{{background:#242723;border-radius:6px;padding:14px 18px;margin:14px 0 24px;font-size:12.5px;line-height:19px;color:#a9ada4;white-space:pre-wrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 0 #0f100e}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:22px}}.card{{display:block;background:#242723;border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 0 #0f100e;overflow:hidden;color:inherit;text-decoration:none}}.frame{{width:432px;height:270px;overflow:hidden}}.card iframe{{width:1440px;height:900px;border:0;transform:scale(.3);transform-origin:0 0;pointer-events:none;display:block;background:#1c1e1b}}.cap{{padding:10px 12px;display:flex;flex-direction:column;gap:4px}}.cap b{{font-weight:500;font-size:13px;color:#ffb020}}.cap span{{font-size:11px;line-height:15px;color:#7f847a;white-space:pre-wrap}}.card:hover{{box-shadow:inset 0 0 0 1.5px #ffb020,0 2px 0 #0f100e}}</style></head><body>
<span class="tag">VCUT · MOCKUP · DIRECTION C</span><h1>v3 · แผงควบคุม C · 20 หน้า flow เดียว</h1>
<div class="head">{head}

กดการ์ดเพื่อเปิดหน้านั้นเต็มขนาด (1440×900) · ทุกหน้าเปิดเองได้ รูปฝังในไฟล์ (ฟอนต์โหลดจาก Google Fonts ถ้ามีเน็ต)</div>
<div class="grid">{cards}</div></body></html>''')
print(len(files), "pages exported")
