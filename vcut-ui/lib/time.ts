export const FPS = 30;

/** 00:00:00:00 (ชม:นาที:วินาที:เฟรม) แบบเดียวกับหน้าจอ OpenCut */
export function tc(sec: number, fps = FPS): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

/** 1:23 หรือ 1:02:03 — ไว้ติดป้ายความยาว */
export function dur(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** ระยะขีดบนไม้บรรทัดที่อ่านง่ายในซูมระดับนั้น */
export function rulerStep(pxPerSec: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pxPerSec >= 70) return s;
  return 1200;
}
