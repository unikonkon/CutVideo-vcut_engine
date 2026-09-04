"use client";

// ความคืบหน้ารายแบบระหว่างงาน "ตัดให้เลย" — โพล /api/variants ทุก 2 วิ
//
// variants.py เขียน index.json ทีละแบบระหว่างตัด จึงรู้ได้ว่าแบบไหนเสร็จแล้ว (ok + ready)
// แต่ index ของสไตล์เดิมอาจค้างจากรอบก่อน — นับเป็น "เสร็จรอบนี้" เฉพาะแบบที่ `made`
// ใหม่กว่าเวลาเริ่มงาน (now − job.elapsed) เท่านั้น  งานจบแล้วค่อยเชื่อ ok ตรง ๆ

import { useEffect, useMemo, useState } from "react";
import { api4, type JobState, type VariantItem, type VariantsData } from "@/lib/api";
import { variantsPhase } from "./phases";

export type CutState = "done" | "run" | "wait" | "fail";

export interface CutRow {
  id: string;
  label: string;
  note: string;
  state: CutState;
  item: VariantItem | null;
}

export interface CutProgress {
  rows: CutRow[];
  done: number;
  total: number;
  /** สไตล์ที่ index นี้บรรยาย — ใช้ต่อ URL วิดีโอตัวอย่าง */
  style: string;
  made: number;
}

const SLACK = 5; // วินาที — เผื่อนาฬิกาเอนจินกับเบราว์เซอร์ต่างกันเล็กน้อย

export function useCutProgress(job: JobState | null, ids: string[], labels: Record<string, string>, active: boolean): CutProgress {
  // เก็บเวลาที่โพลคู่กับผล — ใช้คำนวณเวลาเริ่มงานโดยไม่เรียก Date.now() ตอน render
  const [got, setGot] = useState<{ vd: VariantsData | null; at: number }>({ vd: null, at: 0 });
  const running = Boolean(job?.running);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = () =>
      api4
        .variants()
        .then((d) => {
          if (alive) setGot({ vd: d, at: Date.now() / 1000 });
        })
        .catch(() => {});
    tick();
    if (!running) {
      return () => {
        alive = false;
      };
    }
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active, running]);

  return useMemo(() => {
    const phase = variantsPhase(job);
    const finished = !!job && !job.running && job.code !== null;
    const { vd, at } = got;
    const startTs = job && job.running ? at - job.elapsed - SLACK : 0;
    const fresh = (it: VariantItem) => finished || it.made >= startTs;
    const byId = new Map((vd?.items ?? []).map((it) => [it.id, it]));
    const settled = (item: VariantItem | null): CutState => {
      if (phase >= 0 && item && fresh(item)) {
        if (item.ok && item.ready) return "done";
        if (!item.ok && item.error) return "fail";
      }
      return "wait";
    };
    const states = ids.map((id) => settled(byId.get(id) ?? null));
    // ตัวที่กำลังตัด = ตัวแรกที่ยังไม่มีผล ขณะงานอยู่ที่ขั้น variants
    const runAt = phase === 0 ? states.indexOf("wait") : -1;
    const rows: CutRow[] = ids.map((id, i) => {
      const item = byId.get(id) ?? null;
      return { id, label: item?.label ?? labels[id] ?? id, note: item?.note ?? "", state: i === runAt ? "run" : states[i], item };
    });
    return {
      rows,
      done: rows.filter((r) => r.state === "done").length,
      total: rows.length,
      style: vd?.style ?? "",
      made: vd?.made ?? 0,
    };
  }, [job, got, ids, labels]);
}
