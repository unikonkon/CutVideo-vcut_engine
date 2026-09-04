"use client";

// แถบบน v6 — ตราใบไม้ vcut · ชื่อไฟล์/โปรเจกต์ · ขั้น ①②③ เป็น "เส้นทางเดินป่า"
// (วง 22px เชื่อมด้วยเส้นประ · ทำแล้ว = จุดเต็มมอส · กำลังทำ = วงแหวนเรือง) · ของฝั่งขวาตามหน้า
// สูง 68 ไม่มีกล่อง — ลอยบนท้องฟ้าโดยตรงตาม mockup

import type { ReactNode } from "react";
import { Icon } from "@/components/instrument";
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
  const running = Boolean(eng.job?.running);
  const first = eng.clips[0];
  const more = Math.max(0, eng.clips.length - 1);

  return (
    <div style={{ height: 68, display: "flex", alignItems: "center", gap: 22, padding: "0 36px", flexShrink: 0, position: "relative" }}>
      <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: ".02em", display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon name="leaf" size={16} color="var(--amber)" />
        vcut
      </span>
      {r.step > 1 && (
        <span className="kv small" style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }} title={p ? `${p.config.join(" → ")} · ${p.clips_total} คลิป · ${p.footage_minutes.toFixed(1)} นาที` : ""}>
          <Icon name="film" size={13} color="var(--muted)" />
          {p ? (first ? `${first.name} · ${dur(first.dur)}${more ? ` · +${more} ไฟล์` : ""}` : p.project) : eng.offline ? "ไม่พบเอนจิน" : "…"}
        </span>
      )}
      {left}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center" }}>
        {STEPS.map((s, i) => {
          const cur = s.n === r.step;
          const done = s.n < r.step;
          return (
            <span key={s.n} style={{ display: "inline-flex", alignItems: "center" }}>
              <button type="button" className={`node${cur ? " on" : done ? " done" : ""}`} onClick={() => r.go(s.n)} title={`ไปขั้น ${s.n}`}>
                <i>{done ? <Icon name="check" size={12} color="var(--ink-dark)" /> : s.n}</i>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="trail" />}
            </span>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {right ?? (
        running ? (
          <span className="small" style={{ width: 170, display: "inline-flex", justifyContent: "flex-end", alignItems: "center", gap: 8, color: "var(--amber)", whiteSpace: "nowrap" }} title={eng.job?.cmd_label || eng.job?.step}>
            <span className="led on" />
            {eng.job?.cmd_label || eng.job?.step || ""}
            {eng.job && eng.job.of > 1 ? ` ${eng.job.at}/${eng.job.of}` : ""}
          </span>
        ) : eng.offline ? (
          <span className="small" style={{ width: 170, textAlign: "right", color: "var(--danger)" }}>ไม่พบเอนจิน</span>
        ) : (
          <span style={{ width: 170 }} />
        )
      )}
    </div>
  );
}
