"use client";

// แถบบน — VCUT · ป้ายโปรเจกต์ · คีย์ 3 ขั้น (LED) · ของฝั่งขวาตามหน้า · สถานะเอนจิน

import type { ReactNode } from "react";
import { Btn, Led, Mono, Panel, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Step } from "@/hooks/route";
import { dur } from "@/lib/time";

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "01 ใส่วิดีโอ" },
  { n: 2, label: "02 โต๊ะทำงาน · ตัด" },
  { n: 3, label: "03 เลือกแบบ · ส่งออก" },
];

export default function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const eng = useEngine();
  const r = useRoute();
  const p = eng.proj;
  const total = p ? Number(p.summary.duration_total ?? 0) : 0;
  const running = Boolean(eng.job?.running);

  return (
    <Panel style={{ height: 52, margin: "10px 10px 0 10px", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0 }}>
      <Mono style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em" }}>VCUT</Mono>
      <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={p ? `${p.config.join(" → ")} · ${p.clips_total} คลิป · ${p.footage_minutes.toFixed(1)} นาที` : ""}>
        {p ? `${p.project}  ${dur(total)}  ${p.clips_total} CLIPS` : eng.offline ? "NO ENGINE" : "…"}
      </Well>
      {left}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {STEPS.map((s) => {
          const cur = s.n === r.step;
          const past = s.n < r.step;
          return (
            <Btn key={s.n} on={cur} off={!cur && !past} onClick={() => r.go(s.n)} title={`ไปขั้น ${s.n}`}>
              <Led on={cur || past} />
              {s.label}
            </Btn>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {right}
      {running && (
        <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", display: "flex", alignItems: "center", gap: 6 }} title={eng.job?.cmd_label || eng.job?.step}>
          <Led dim blink />
          {(eng.job?.cmd_label || eng.job?.step || "").toUpperCase()}
          {eng.job && eng.job.of > 1 ? ` ${eng.job.at}/${eng.job.of}` : ""}
        </Well>
      )}
      <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }} title="เอนจิน vcut (serve.py) ผ่าน /engine">
        ENGINE
        <Led on={!eng.offline && !eng.loading} red={eng.offline} />
        <span style={{ color: eng.offline ? "var(--danger)" : "var(--amber)" }}>{eng.offline ? "OFF" : "LINK"}</span>
      </Well>
    </Panel>
  );
}
