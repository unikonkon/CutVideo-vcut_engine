# วิธีรัน / หยุดการทำงาน (vcut engine + vcut-ui)

เอกสารนี้สรุปคำสั่งสำหรับ **เริ่ม** และ **หยุด** ระบบทั้งหมด พร้อมวิธีตรวจสอบสถานะ

ระบบมี 2 ส่วนที่ต้องรันคู่กัน:

| ส่วน | คำสั่ง | พอร์ต | URL |
|---|---|---|---|
| เอนจิน (vcut view server) | `./vcut view -c projects/<ชื่อโปรเจกต์>.toml --no-open` | `8765` | http://127.0.0.1:8765 |
| หน้าเว็บ (Next.js dev) | `npm run dev` ใน `vcut-ui/` | `3000` | http://localhost:3000 |
| หน้าเว็บ 3 ขั้น v2 (Next.js dev) | `npm run dev` ใน `vcut-ui-v2/` | `3001` | http://localhost:3001 |

---

## 1. เริ่มการทำงาน

### 1.1 เอนจิน (รันจากรากโปรเจกต์)

```bash
cd "/Users/macbook3lf1/web work/CutVideo-vcut_engine"
./vcut view -c projects/phu-soi-dao.toml --no-open
```

- `-c` = ระบุไฟล์โปรเจกต์ `.toml` ที่ต้องการเปิด
- `--no-open` = ไม่ต้องเปิดเบราว์เซอร์อัตโนมัติ (เพราะเราจะใช้หน้าเว็บที่พอร์ต 3000 แทน)
- เอนจินจะ bind ที่ `127.0.0.1:8765`

หากต้องการรันค้างไว้เบื้องหลัง:

```bash
cd "/Users/macbook3lf1/web work/CutVideo-vcut_engine"
nohup ./vcut view -c projects/phu-soi-dao.toml --no-open > /tmp/vcut-engine.log 2>&1 &
```

### 1.2 หน้าเว็บ

```bash
cd "/Users/macbook3lf1/web work/CutVideo-vcut_engine/vcut-ui"
npm run dev
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

> ครั้งแรกหลัง clone หรือหลังอัปเดต dependency ให้รัน `npm install` ก่อน

---

## 2. ตรวจสอบสถานะ

### เช็กว่าพอร์ตถูกใช้งานอยู่หรือไม่

```bash
lsof -iTCP:8765 -sTCP:LISTEN -n -P    # เอนจิน
lsof -iTCP:3000 -sTCP:LISTEN -n -P    # หน้าเว็บ
```

ถ้าไม่มีผลลัพธ์ = ไม่มีอะไรรันอยู่

### เช็กว่า service ตอบสนองจริงหรือไม่

```bash
curl -s -o /dev/null -w "engine: %{http_code}\n" http://127.0.0.1:8765/ --max-time 5
curl -s -o /dev/null -w "ui:     %{http_code}\n" http://localhost:3000/ --max-time 20
```

ผลลัพธ์ที่ถูกต้องคือ `200` ทั้งคู่

### หา process ตามชื่อคำสั่ง

```bash
pgrep -fl "vcut view"
pgrep -fl "next dev"
```

---

## 3. หยุดการทำงาน

### 3.1 กรณีรันอยู่ใน terminal (foreground)

กด `Ctrl + C` ในหน้าต่าง terminal ของแต่ละคำสั่ง

### 3.2 กรณีรันเบื้องหลัง — หยุดแบบเจาะจง PID

หา PID ก่อน แล้วสั่งหยุด:

```bash
# หา PID ที่ยึดพอร์ตอยู่
lsof -tiTCP:8765 -sTCP:LISTEN     # เอนจิน
lsof -tiTCP:3000 -sTCP:LISTEN     # หน้าเว็บ

# สั่งหยุด (แทน <PID> ด้วยเลขที่ได้)
kill <PID>
```

`kill` เป็นการส่งสัญญาณ `SIGTERM` ให้ process ปิดตัวเองอย่างเรียบร้อย — ควรใช้วิธีนี้ก่อนเสมอ

### 3.3 หยุดทั้งหมดในคำสั่งเดียว

```bash
kill $(lsof -tiTCP:8765 -sTCP:LISTEN) $(lsof -tiTCP:3000 -sTCP:LISTEN) 2>/dev/null
```

หรือหยุดตามชื่อคำสั่ง:

```bash
pkill -f "vcut view"
pkill -f "next dev"
```

### 3.4 กรณี process ไม่ยอมตาย (ทางเลือกสุดท้าย)

```bash
kill -9 <PID>
```

> ใช้ `-9` (`SIGKILL`) เฉพาะเมื่อ `kill` ธรรมดาไม่ได้ผล เพราะ process จะถูกฆ่าทันทีโดยไม่มีโอกาสบันทึกงานหรือเคลียร์ไฟล์ชั่วคราว

---

## 4. ยืนยันว่าหยุดครบแล้ว

```bash
lsof -iTCP:8765 -sTCP:LISTEN -n -P
lsof -iTCP:3000 -sTCP:LISTEN -n -P
pgrep -fl "vcut view"
pgrep -fl "next dev"
```

ถ้าทั้ง 4 คำสั่งไม่คืนผลลัพธ์ใด ๆ = หยุดครบทุกตัวเรียบร้อย

---

## 5. รีสตาร์ท

หากแก้ไขไฟล์ `.toml` ของโปรเจกต์ ต้องรีสตาร์ทเอนจินเพื่อให้โหลดค่าใหม่:

```bash
# หยุดเอนจินเดิม
pkill -f "vcut view"

# เริ่มใหม่
cd "/Users/macbook3lf1/web work/CutVideo-vcut_engine"
./vcut view -c projects/phu-soi-dao.toml --no-open
```

ส่วนหน้าเว็บ (Next.js dev) มี hot reload อยู่แล้ว — แก้โค้ดใน `vcut-ui/` ไม่ต้องรีสตาร์ท
ยกเว้นกรณีที่แก้ `next.config.ts`, ไฟล์ `.env`, หรือติดตั้ง package ใหม่ จึงต้องรีสตาร์ท

---

## 6. ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `Address already in use` ตอนสตาร์ทเอนจิน | มี process เดิมค้างอยู่ที่พอร์ต 8765 — ใช้ `lsof -tiTCP:8765 -sTCP:LISTEN` หา PID แล้ว `kill` |
| Next.js เปลี่ยนไปใช้พอร์ต 3001 เอง | พอร์ต 3000 ถูกใช้อยู่ — หยุดตัวเดิมก่อน หรือใช้ URL ที่ log แจ้งไว้ |
| หน้าเว็บเปิดได้แต่ไม่มีข้อมูล | เอนจินไม่ได้รัน — เช็กด้วย `curl http://127.0.0.1:8765/` ต้องได้ `200` |
| แก้ `.toml` แล้วหน้าเว็บไม่อัปเดต | เอนจินอ่านค่าตอนสตาร์ท ต้องรีสตาร์ทเอนจิน (ดูหัวข้อ 5) |
