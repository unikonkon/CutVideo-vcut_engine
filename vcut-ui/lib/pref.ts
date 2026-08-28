"use client";

// ค่าที่จำไว้ใน localStorage — ความกว้างแผง โหมดการแสดงผล ฯลฯ
//
// อยู่ที่นี่เพราะมีสองแผงที่ลากขยายได้แล้ว (คลิป · ข้อความ) และตัวอ่านที่ปลอดภัย
// กับ SSR เขียนถูกยากพอที่จะไม่ควรมีสองชุด

import { useCallback, useSyncExternalStore } from "react";

// localStorage เป็นข้อมูลที่อยู่ *นอก* React และอ่านตอน prerender ไม่ได้ —
// useSyncExternalStore มีช่องให้บอก "ค่าฝั่งเซิร์ฟเวอร์" แยกไว้ตรง ๆ HTML ที่
// prerender ไว้จึงตรงกับที่เบราว์เซอร์วาดรอบแรกเสมอ แล้วค่อยสลับเป็นค่าที่จำไว้
const watchers = new Set<() => void>();

export function readPref<T extends string>(
  key: string,
  fallback: T,
  ok: (v: string) => boolean,
) {
  try {
    const v = localStorage.getItem(key);
    return v && ok(v) ? (v as T) : fallback;
  } catch {
    return fallback; // โหมดส่วนตัว/ปิด storage ไว้
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* เขียนไม่ได้ก็ใช้ต่อได้ แค่ไม่จำข้ามรอบ */
  }
  watchers.forEach((f) => f());
}

export function usePref<T extends string>(
  key: string,
  fallback: T,
  ok: (v: string) => boolean,
) {
  const value = useSyncExternalStore(
    (cb) => {
      watchers.add(cb);
      return () => watchers.delete(cb);
    },
    () => readPref(key, fallback, ok),
    () => fallback,
  );
  const set = useCallback((v: T) => writePref(key, v), [key]);
  return [value, set] as const;
}

/** กว้างสุดที่แผงกางได้จริงในหน้าต่างนี้ — ไม่ใช่ค่าคงที่
 *
 *  "เต็มเท่าที่กว้างได้" ขึ้นกับจอที่ใช้อยู่ตรงหน้า  ที่กันไว้ 420 px คือพื้นที่
 *  ขั้นต่ำที่จอตัวอย่างยังดูรู้เรื่อง — แผงกว้างกว่านั้นได้ (flex บีบจอตัวอย่าง
 *  ให้เองอยู่แล้ว) แต่จะกลายเป็นแผงที่แก้ของซึ่งมองไม่เห็นผล
 */
export function panelMax(hard: number) {
  const w = typeof window === "undefined" ? 1600 : window.innerWidth;
  return Math.max(320, Math.min(hard, w - 420));
}
