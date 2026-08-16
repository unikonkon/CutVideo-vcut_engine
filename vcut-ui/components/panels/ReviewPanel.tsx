"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Check, Loader2, Trash2 } from "lucide-react";
import { api2, type ReviewData, type ReviewOp } from "@/lib/api";
import { Empty, Panel, Section, Spin } from "@/components/ui";

export default function ReviewPanel({
  reloadKey,
  busy,
  onRun,
  applyOp,
  flash,
}: {
  reloadKey: number;
  busy: boolean;
  onRun: (context: string, force: boolean) => void;
  applyOp: (op: ReviewOp) => boolean;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [context, setContext] = useState("");
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await api2.review();
      setData(d);
      setContext((c) => c || d.context_default);
      setApplied(new Set());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!data) {
    return (
      <Panel title={<><Bot size={13} /> AI Review</>}>
        <Spin />
      </Panel>
    );
  }

  const ops = data.ops ?? [];

  return (
    <Panel title={<><Bot size={13} /> AI ดูหนังที่ตัดแล้ว</>}>
      <Section title="สั่งดู">
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="บริบทเพิ่มเติม เช่น 'เน้นกระชับ เอาช็อตซ้ำออก'…"
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={() => onRun(context, data.has === true)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-accent/90 py-2 text-[12.5px] font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
          {data.has ? "ให้ AI ดูใหม่อีกรอบ" : "ให้ AI ดูหนัง แล้วเสนอการแก้"}
        </button>
        <div className="text-[11px] leading-4 text-muted">
          ใช้ Claude CLI ในเครื่อง — ใช้เวลาหลายนาทีและเสียโควตา
        </div>
      </Section>

      {data.has && (
        <Section title={`ข้อเสนอ (${ops.length})`}>
          {data.stale && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
              ไทม์ไลน์ถูกแก้หลังจาก AI ดู — ตำแหน่งอาจเลื่อน ควรรันใหม่ก่อนใช้
            </div>
          )}
          {ops.length === 0 ? (
            <Empty>AI ไม่มีข้อเสนอ — หนังผ่านตามที่เป็นอยู่</Empty>
          ) : (
            ops.map((op, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 rounded-lg border border-line bg-panel-2 p-2.5 ${
                  applied.has(i) ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-1.5 text-[12px] text-ink">
                  {op.op === "drop" ? (
                    <Trash2 size={12} className="text-danger" />
                  ) : (
                    <ArrowRight size={12} className="text-accent" />
                  )}
                  ช็อต {op.at + 1} · {op.name}
                  {op.op === "move" && op.to != null && (
                    <span className="text-muted">→ ตำแหน่ง {op.to + 1}</span>
                  )}
                </div>
                <div className="text-[11.5px] leading-4 text-muted">{op.why}</div>
                {!applied.has(i) && (
                  <button
                    onClick={() => {
                      if (applyOp(op)) {
                        setApplied((p) => new Set(p).add(i));
                        flash("ใช้ข้อเสนอแล้ว — อย่าลืมกด 'บันทึก EDL' ด้านบน");
                      }
                    }}
                    className="mt-1 flex items-center justify-center gap-1 rounded-md border border-line bg-panel-3 py-1 text-[11.5px] text-ink hover:bg-line-2"
                  >
                    <Check size={11} /> ใช้ข้อเสนอนี้
                  </button>
                )}
              </div>
            ))
          )}
        </Section>
      )}
    </Panel>
  );
}
