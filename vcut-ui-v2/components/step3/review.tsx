"use client";

// ข้อเสนอของ AI review — แถว ai_op (mockup) + ตรรกะรับ/ข้าม ที่หน้าเลือกแบบและ
// หน้า review ใช้ร่วมกัน  การรับจริงอยู่ที่ studio.applyOps (แก้ draft ยังไม่บันทึก)

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ReviewOp } from "@/lib/api";
import { Btn, Kv, Led, Well } from "@/components/instrument";
import { dur } from "@/lib/time";
import { useStudio } from "./store";

const TL_OPS = new Set(["drop", "move", "trim"]);

/** พาดหัวของข้อเสนอหนึ่งข้อ — บอกให้ครบว่าจะเกิดอะไรตรงไหน */
export function opTitle(op: ReviewOp): string {
  if (op.op === "drop") return `เอาช็อต ${(op.at ?? 0) + 1} ออก · ${op.name}`;
  if (op.op === "move") return `ย้ายช็อต ${(op.at ?? 0) + 1} → ตำแหน่ง ${(op.to ?? 0) + 1}`;
  if (op.op === "trim")
    return (
      `ช็อต ${(op.at ?? 0) + 1} · ตัด${op.side === "head" ? "หัว" : "ท้าย"} ${op.cut?.toFixed(1)} s` +
      ` (${op.was?.toFixed(1)} → ${op.dur?.toFixed(1)} s)`
    );
  if (op.op === "text") return `“${op.text}” ขึ้นจอที่ ${dur(op.tl ?? 0)}`;
  const what = op.op === "music" ? "เพลง" : op.op === "sfx" ? "SFX" : "สติกเกอร์";
  return `${what} ${op.label || op.file} ที่ ${dur(op.tl ?? 0)}`;
}

export function opTouchesEdl(op: ReviewOp) {
  return TL_OPS.has(op.op);
}

/** สถานะรับ/ข้ามของข้อเสนอในรอบนี้ — ข้ามเป็นของหน้าจอ (ไม่เขียนไฟล์) */
export function useReviewOps() {
  const s = useStudio();
  const review = s.review;
  const [seen, setSeen] = useState(review);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [applied, setApplied] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  // ผลรอบใหม่มาถึง — สถานะรับ/ข้ามของรอบเก่าใช้ต่อไม่ได้
  if (review !== seen) {
    setSeen(review);
    setHidden(new Set());
    setApplied(new Set());
  }

  const ops = useMemo(() => (review?.ops ?? []).map((o, i) => ({ ...o, id: o.id ?? i })), [review]);
  const left = useMemo(() => ops.filter((o) => !hidden.has(o.id) && !applied.has(o.id)), [ops, hidden, applied]);

  const take = useCallback(
    async (list: ReviewOp[]) => {
      if (!list.length) return;
      setBusy(true);
      try {
        const rr = await s.applyOps(list);
        if (rr.done.length) {
          setApplied((p) => {
            const n = new Set(p);
            rr.done.forEach((i) => n.add(i));
            return n;
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [s],
  );
  const skip = useCallback((op: ReviewOp) => {
    setHidden((p) => new Set(p).add(op.id ?? -1));
  }, []);

  return { review, ops, left, applied, take, skip, busy, stale: Boolean(review?.stale) };
}

/** แถว ai_op ของ mockup — LED · ข้อความ · รับ · ข้าม */
export function AiOpRow({
  op,
  onTake,
  onSkip,
  busy,
  done,
}: {
  op: ReviewOp;
  onTake: () => void;
  onSkip: () => void;
  busy?: boolean;
  done?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", opacity: done ? 0.5 : 1 }}>
      <Led dim={!done} on={done} />
      <span style={{ flex: 1, fontSize: 11.5, minWidth: 0 }} title={op.why}>
        {opTitle(op)}
        {op.why && (
          <Kv style={{ fontSize: 10.5 }} className="truncate">
            {" "}— {op.why}
          </Kv>
        )}
      </span>
      {!done && (
        <>
          <Btn sm on onClick={onTake} disabled={busy} title={opTouchesEdl(op) ? "แก้ไทม์ไลน์ (edl.json) — ต้องกด SAVE EDL" : "ลงชั้นแต่งหนัง (fx.json) — ต้องกด SAVE FX"}>
            รับ
          </Btn>
          <Btn sm onClick={onSkip} disabled={busy} title="ซ่อนข้อนี้ไว้ก่อน (ไม่เขียนไฟล์)">
            ข้าม
          </Btn>
        </>
      )}
    </div>
  );
}

/** กล่องข้อเสนอ — แถวเรียงกันในร่องเดียว (ใช้ทั้ง CQ3 และ CREVIEW) */
export function AiOpList({
  ops,
  onTake,
  onSkip,
  busy,
  applied,
  header,
}: {
  ops: ReviewOp[];
  onTake: (op: ReviewOp) => void;
  onSkip: (op: ReviewOp) => void;
  busy: boolean;
  applied: Set<number>;
  header?: ReactNode;
}) {
  return (
    <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
      {header}
      {ops.map((op) => (
        <AiOpRow key={op.id} op={op} onTake={() => onTake(op)} onSkip={() => onSkip(op)} busy={busy} done={applied.has(op.id ?? -1)} />
      ))}
    </Well>
  );
}
