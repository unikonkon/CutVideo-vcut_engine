"use client";

// คิวอัปโหลดของขั้น ① + สายงานอัตโนมัติ scan → listen → thumbs
//
// อยู่ที่ระดับ Step1 (index.tsx) ไม่ใช่ในหน้า Input — เพราะผู้ใช้สลับไปหน้าคลัง
// ระหว่างที่ไฟล์ 3 GB กำลังส่งอยู่ได้ ถ้า state อยู่ในหน้า Input การสลับหน้าจะ
// ฆ่าการอัปโหลดทิ้งกลางทาง
//
// เอนจินรับงานทีละงาน (409 ถ้ามีงานวิ่ง) จึงสั่งทีละขั้น: สั่ง scan แล้วรอให้
// hooks/engine เห็นงานจบ (reloadKey ขยับ) ค่อยสั่งขั้นถัดไป — ไม่ได้สั่ง "plan"
// รวดเดียว เพราะ plan จะวิ่งไปถึง render ซึ่งขั้น ① ยังไม่ต้องการ

import { useCallback, useEffect, useRef, useState } from "react";
import { api3, checkClip, uploadClip } from "@/lib/api";
import type { Engine } from "@/hooks/engine";
import { CHAIN, stemOf } from "./common";

export interface UpItem {
  id: number;
  name: string;
  size: number;
  /** 0–100 · ถึง 100 แล้ว done จึงเป็น true (ก้อนสุดท้ายรอเอนจินปิดไฟล์) */
  pct: number;
  done: boolean;
  /** ชื่อที่เอนจินตั้งให้จริงเมื่อชนกับของเดิม (IMG_1234 → IMG_1234-2) */
  as?: string;
  error?: string;
}

/** add = เพิ่มเข้าโปรเจกต์ที่เปิดอยู่ · new = สร้าง projects/<stem>.toml ก่อนแล้วค่อยส่ง */
export type UploadMode = "add" | "new";

/** สูตรตั้งต้นของโปรเจกต์ที่หน้านี้สร้าง — หนังสั้นแนวตั้ง */
const NEW_PRESET = "vertical-short";

export interface UploadQueue {
  items: UpItem[];
  /** กำลังส่งไฟล์อยู่ (สร้างโปรเจกต์ · check · upload) */
  busy: boolean;
  /** ขั้นในสายงานที่กำลังวิ่ง ("" = ไม่มี) */
  current: string;
  /** ขั้นที่รอต่อจาก current */
  queue: string[];
  /** ขั้นที่วิ่งจบแล้วในสายรอบนี้ */
  done: string[];
  chainError: string;
  start: (files: File[], mode: UploadMode, existingProjects?: string[]) => Promise<void>;
  /** เริ่มสายงานเอง (ใช้หลัง link โฟลเดอร์ · กู้จากถังขยะ) */
  chain: (steps?: string[]) => Promise<void>;
  clearDone: () => void;
}

let seq = 1;

/** ชื่อไฟล์โปรเจกต์ที่ยังว่าง — ชนกับที่มีแล้วต่อท้าย -2 -3 (แบบเดียวกับ free_name ของเอนจิน) */
function freeProjectStem(stem: string, existing: string[]) {
  const taken = new Set(existing.map((p) => p.replace(/^projects\//, "").replace(/\.toml$/, "")));
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
  return `${stem}-${Date.now()}`;
}

export function useUploadQueue(eng: Engine): UploadQueue {
  const [items, setItems] = useState<UpItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [chainError, setChainError] = useState("");
  // reloadKey ตอนสั่งงาน — งานถือว่าจบต่อเมื่อคีย์ขยับพ้นค่านี้ ไม่งั้น snapshot
  // ของงาน *ก่อนหน้า* ที่ชื่อขั้นเดียวกัน (scan เก่าที่จบไปแล้ว) จะถูกอ่านว่าเป็น
  // งานของเราที่จบแล้ว แล้วสั่ง listen ทับทันทีจนโดน 409
  const kickKey = useRef(-1);
  const keyRef = useRef(eng.reloadKey);
  const runRef = useRef(eng.runJob);
  useEffect(() => {
    keyRef.current = eng.reloadKey;
    runRef.current = eng.runJob;
  }, [eng.reloadKey, eng.runJob]);

  const kick = useCallback(async (steps: string[]) => {
    const [head, ...rest] = steps;
    if (!head) {
      setCurrent("");
      setQueue([]);
      return;
    }
    kickKey.current = keyRef.current;
    setCurrent(head);
    setQueue(rest);
    setChainError("");
    const ok = await runRef.current(head);
    if (!ok) {
      setCurrent("");
      setQueue([]);
      setChainError(`สั่ง ${head} ไม่สำเร็จ — ลองใหม่เมื่อเอนจินว่าง`);
    }
  }, []);

  const chain = useCallback(
    async (steps: string[] = CHAIN) => {
      setDone([]);
      await kick(steps);
    },
    [kick],
  );

  // เดินสายงาน: งานที่สั่งไว้จบแล้ว (reloadKey ขยับ · ไม่ running · ชื่อขั้นตรง) → สั่งขั้นถัดไป
  useEffect(() => {
    if (!current) return;
    const job = eng.job;
    if (!job || job.running) return;
    if (eng.reloadKey === kickKey.current) return; // ยังเป็นภาพก่อนงานเริ่ม
    if (job.step !== current) return; // งานอื่นจบ ไม่ใช่ของเรา
    // setState หลังงานเอนจินจบ — ผูกกับ reloadKey ไม่ใช่ render รอบนี้
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone((d) => (d.includes(current) ? d : [...d, current]));
    if (job.code !== 0) {
      setChainError(job.stopped ? `${current} ถูกหยุด — ขั้นที่เหลือไม่ได้สั่ง` : `${current} ล้มเหลว (code ${job.code ?? "?"})`);
      setCurrent("");
      setQueue([]);
      return;
    }
    kick(queue);
  }, [eng.reloadKey, eng.job, current, queue, kick]);

  const patch = useCallback((id: number, p: Partial<UpItem>) => {
    setItems((xs) => xs.map((u) => (u.id === id ? { ...u, ...p } : u)));
  }, []);

  const start = useCallback<UploadQueue["start"]>(
    async (files, mode, existingProjects = []) => {
      if (!files.length || busy) return;
      setBusy(true);
      try {
        if (mode === "new") {
          // โปรเจกต์ใหม่ต้องมีโฟลเดอร์ฟุตเทจกับ work ของตัวเอง — ทั้งคู่เทียบกับราก
          // repo (เอนจิน resolve จาก cwd ซึ่งคือรากเสมอ) ถ้าปล่อยให้ตกไปที่ค่าตั้งต้น
          // ".vcut" จะไปใช้ cache ปนกับโปรเจกต์อื่น manifest/EDL ทับกันเงียบ ๆ
          const stem = freeProjectStem(stemOf(files[0].name) || "project", existingProjects);
          await api3.createProject(
            `projects/${stem}.toml`,
            {
              "project.name": stem,
              "project.source": `footage/${stem}`,
              "project.work": `.vcut-${stem}`,
            },
            NEW_PRESET,
          );
          await eng.refresh();
          eng.flash(`สร้างโปรเจกต์ ${stem} แล้ว (สูตร ${NEW_PRESET})`);
        }
        const list: UpItem[] = files.map((f) => ({ id: seq++, name: f.name, size: f.size, pct: 0, done: false }));
        setItems((xs) => [...list, ...xs]);
        let okCount = 0;
        // ทีละไฟล์ — เอนจินเขียนดิสก์ก้อนใหญ่อยู่แล้ว ยิงพร้อมกันไม่ได้เร็วขึ้น
        for (let i = 0; i < files.length; i++) {
          const it = list[i];
          try {
            // ถามให้จบก่อนส่งไบต์แรก — error กลางทางไปไม่ถึงผู้ใช้ (ดู checkClip)
            const pre = await checkClip(files[i]);
            if (!pre.ok) {
              patch(it.id, { error: pre.error || "ไฟล์นี้ลงคลังไม่ได้" });
              continue;
            }
            if (pre.name && pre.name !== files[i].name) patch(it.id, { as: pre.name });
            const r = await uploadClip(files[i], (pct) => patch(it.id, { pct }));
            patch(it.id, { pct: 100, done: true, as: r.renamed ? r.name : undefined });
            okCount++;
          } catch (e) {
            patch(it.id, { error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" });
          }
        }
        if (okCount > 0) {
          eng.flash(`รับ ${okCount}/${files.length} ไฟล์แล้ว — เริ่มอ่านคลิป · ถอดเสียง · ทำภาพตัวอย่าง`);
          await chain(CHAIN);
        }
      } catch (e) {
        eng.flash(e instanceof Error ? e.message : "สร้างโปรเจกต์ไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    },
    [busy, eng, patch, chain],
  );

  const clearDone = useCallback(() => setItems((xs) => xs.filter((u) => !u.done)), []);

  return { items, busy, current, queue, done, chainError, start, chain, clearDone };
}
