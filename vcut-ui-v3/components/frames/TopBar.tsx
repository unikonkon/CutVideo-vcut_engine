"use client";

// แถบบน — VCUT · ชื่อโปรเจกต์ · 3 ขั้น (กดข้ามได้) · ของฝั่งขวาตามหน้า · สถานะเอนจิน

import type { ReactNode } from "react";
import { Btn, Led, Mono, Panel, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Step } from "@/hooks/route";
import { dur } from "@/lib/time";

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "ใส่วิดีโอ" },
  { n: 2, label: "สไตล์" },
  { n: 3, label: "ส่งออก" },
];

export default function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const eng = useEngine();
  const r = useRoute();
  const p = eng.proj;
  const total = p ? Number(p.summary.duration_total ?? 0) : 0;
  const running = Boolean(eng.job?.running);

  return (
    <Panel style={{ height: 56, margin: "10px 10px 0 10px", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0 }}>
      <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", color: "var(--amber-hi)" }}>vcut</span>
      <Well style={{ padding: "4px 10px", fontSize: 12, whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={p ? `${p.config.join(" → ")} · ${p.clips_total} คลิป · ${p.footage_minutes.toFixed(1)} นาที` : ""}>
        {p ? (
          <>
            {p.project}
            <Mono style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
              {p.clips_total} คลิป{total ? ` · ${dur(total)}` : ""}
            </Mono>
          </>
        ) : eng.offline ? (
          "ไม่พบเอนจิน"
        ) : (
          "…"
        )}
      </Well>
      {left}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {STEPS.map((s) => {
          const cur = s.n === r.step;
          const past = s.n < r.step;
          return (
            <Btn key={s.n} on={cur} off={!cur && !past} onClick={() => r.go(s.n)} title={`ไปขั้น ${s.n}`}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  background: cur ? "var(--amber)" : past ? "var(--amber-dim)" : "var(--faint)",
                  color: cur || past ? "#08182e" : "var(--muted)",
                }}
              >
                {s.n}
              </span>
              {s.label}
            </Btn>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {right}
      {running && (
        <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber-hi)", display: "flex", alignItems: "center", gap: 6 }} title={eng.job?.cmd_label || eng.job?.step}>
          <Led dim blink />
          {eng.job?.cmd_label || eng.job?.step || ""}
          {eng.job && eng.job.of > 1 ? ` ${eng.job.at}/${eng.job.of}` : ""}
        </Well>
      )}
      <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }} title="เอนจิน vcut (serve.py) ผ่าน /engine">
        <Led on={!eng.offline && !eng.loading} red={eng.offline} />
        {eng.offline ? "ออฟไลน์" : "เอนจิน"}
      </Well>
    </Panel>
  );
}
