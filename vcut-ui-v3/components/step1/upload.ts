"use client";

// คิวอัปโหลดของขั้น ① + สั่งงาน `ingest` (scan → thumbs → listen) หลังส่งไฟล์ครบ
//
// อยู่ที่ระดับ Step1 (index.tsx) ไม่ใช่ในหน้า Input — state ของคิวต้องอยู่รอดข้าม
// การ re-mount ของหน้า ไม่งั้นไฟล์ 3 GB ที่กำลังส่งอยู่จะขาดกลางทาง
//
// เอนจินรับงานทีละงาน (409 ถ้ามีงานวิ่ง) — ถ้าตอนส่งไฟล์เสร็จมีงานอื่นวิ่งอยู่
// (เช่น quick จากขั้น ②) จะ *รอ* ให้งานนั้นจบก่อน (eng.job.running กลับเป็น false)
// แล้วค่อยสั่ง ingest ไม่ยิงทันทีให้โดน 409

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
  /** งานที่คิวนี้สั่งและกำลังรอให้จบ ("" = ไม่มี) */
  current: string;
  /** ส่งไฟล์ครบแล้วแต่เอนจินยังมีงานอื่นวิ่ง — จะสั่ง ingest ให้เองเมื่อว่าง */
  waiting: boolean;
  /** งานล้มเหลว/สั่งไม่ได้ — โชว์บรรทัดเตือน + ปุ่มลองใหม่ */
  chainError: string;
  start: (files: File[], mode: UploadMode, existingProjects?: string[]) => Promise<void>;
  /** สั่งงาน ingest เอง (ปุ่มลองใหม่) — รอถ้ามีงานอื่นวิ่งอยู่ */
  chain: (steps?: string[]) => void;
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
  const [waitFor, setWaitFor] = useState<string[] | null>(null);
  const [chainError, setChainError] = useState("");
  // reloadKey ตอนสั่งงาน — งานถือว่าจบต่อเมื่อคีย์ขยับพ้นค่านี้ ไม่งั้น snapshot
  // ของงาน *ก่อนหน้า* ที่ชื่อขั้นเดียวกัน (ingest เก่าที่จบไปแล้ว) จะถูกอ่านว่าเป็น
  // งานของเราที่จบแล้ว
  const kickKey = useRef(-1);
  const keyRef = useRef(eng.reloadKey);
  const runRef = useRef(eng.runJob);
  const runningRef = useRef(Boolean(eng.job?.running));
  useEffect(() => {
    keyRef.current = eng.reloadKey;
    runRef.current = eng.runJob;
    runningRef.current = Boolean(eng.job?.running);
  }, [eng.reloadKey, eng.runJob, eng.job?.running]);

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
      setChainError(`สั่งงาน ${head} ไม่สำเร็จ`);
    }
  }, []);

  /** สั่งเลยถ้าเอนจินว่าง · ไม่งั้นจดไว้แล้วรอ (effect ข้างล่างสั่งให้เมื่องานอื่นจบ) */
  const chain = useCallback(
    (steps: string[] = CHAIN) => {
      setChainError("");
      if (runningRef.current) {
        setWaitFor(steps);
        return;
      }
      kick(steps);
    },
    [kick],
  );

  // รอเอนจินว่าง — งานอื่นจบแล้ว (running กลับเป็น false) ค่อยสั่งของเรา
  useEffect(() => {
    if (!waitFor || eng.job?.running) return;
    // setState หลังงานเอนจินจบ — ผูกกับ job.running ไม่ใช่ render รอบนี้
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaitFor(null);
    kick(waitFor);
  }, [waitFor, eng.job?.running, kick]);

  // เดินสายงาน: งานที่สั่งไว้จบแล้ว (reloadKey ขยับ · ไม่ running · ชื่อขั้นตรง) → สั่งขั้นถัดไป
  useEffect(() => {
    if (!current) return;
    const job = eng.job;
    if (!job || job.running) return;
    if (eng.reloadKey === kickKey.current) return; // ยังเป็นภาพก่อนงานเริ่ม
    if (job.step !== current) return; // งานอื่นจบ ไม่ใช่ของเรา
    if (job.code !== 0) {
      // setState หลังงานเอนจินจบ — ผูกกับ reloadKey ไม่ใช่ render รอบนี้
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChainError(job.stopped ? `${job.cmd_label || current} ถูกหยุดกลางทาง` : `${job.cmd_label || current} ล้มเหลว (code ${job.code ?? "?"})`);
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
          // ให้คลังเห็นไฟล์ใหม่ก่อน (manifest ยังไม่มีจนกว่า scan จะวิ่ง แต่แถว
          // อัปโหลดจะยังโชว์ต่อจนกว่าชื่อจะโผล่ใน eng.clips)
          await eng.refresh();
          chain(CHAIN);
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

  return { items, busy, current, waiting: waitFor !== null, chainError, start, chain, clearDone };
}
