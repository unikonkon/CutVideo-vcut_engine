"use client";

// แผงขวาของขั้น ② ตอนว่างงาน (CQ2 ฝั่งขวา) — รายการแบบ · สถิติแผน · ETA · ปุ่ม "ตัดให้เลย"
//
// ปุ่มใหญ่ทำสองอย่างตามลำดับ: บันทึกร่างค่าตั้ง (ถ้ามี MOD) แล้วสั่ง `plan`
// (= `vcut run` ทุกขั้นที่เปิดไว้)  ค่าที่วางไว้แต่ยังไม่บันทึกจะไม่มีวันถูกใช้
// ถ้าไม่บันทึกก่อน — เอนจินอ่านไฟล์โปรเจกต์ตอนเริ่มงาน

import { useState } from "react";
import { Cta, Kv, Led, Panel, Seg7, Stat, Tag, Well, fmtClock } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { currentStep } from "./phases";
import { num, targetLabel, useStep2 } from "./state";

export default function Output() {
  const eng = useEngine();
  const s = useStep2();
  const [busy, setBusy] = useState(false);
  const running = Boolean(eng.job?.running);
  const plan = s.plan;
  const steps = plan?.steps ?? [];
  const willRun = (ids: string[]) => steps.filter((x) => ids.includes(x.id) && x.run);
  const est = plan?.estimate ?? null;

  const mode = String(s.eff("compose.mode") ?? "—");
  const jump = Boolean(s.eff("jumpcut.enabled"));
  const jumpN = s.pool?.summary.jump_pieces ?? 0;
  const target = num(s.eff("compose.target_minutes"), 0);

  // LISTEN — งานที่วิ่งอยู่ / บทพูดที่มีแล้ว / ยังไม่มี
  const cur = currentStep(eng.job, eng.jobLines, steps);
  const pr = eng.job?.progress;
  const listenStat =
    running && cur === "listen"
      ? `RUNNING ${pr && pr.total ? `${pr.n}/${pr.total}` : "…"}`
      : s.transcript?.exists
        ? `${s.transcript.summary.segments} SEG · ${s.transcript.summary.with_speech} CLIPS`
        : willRun(["listen"]).length
          ? "PENDING"
          : "OFF";
  const prep = willRun(["listen", "ai", "silence", "prepare", "compose"]);
  const renderSec = est ? est.render_seconds + 60 : null;
  const capOn = willRun(["caption"]).length > 0;
  const fxOn = willRun(["finish"]).length > 0;

  const go = async () => {
    setBusy(true);
    try {
      if (s.mod > 0) {
        const ok = await s.save();
        if (!ok) return;
      }
      await eng.runJob("plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", minWidth: 0, overflow: "hidden" }}>
      <Tag>OUTPUT · {eng.variants.length} VARIANTS</Tag>
      <Well style={{ display: "flex", flexDirection: "column", padding: "4px 0" }} className="rows">
        {eng.variants.map((v) => (
          <div key={v.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, padding: "8px 12px", alignItems: "center" }}>
            <Seg7 size={12}>{v.id}</Seg7>
            <span style={{ fontSize: 13, minWidth: 0 }}>
              <span className="truncate" style={{ display: "block" }}>
                {v.label}
              </span>
              <Kv className="truncate" style={{ display: "block" }} title={v.note}>
                mode {mode} · {jump ? `ลบเงียบ ${jumpN} ชิ้น` : "ไม่ตัดเงียบ"} · เป้า {targetLabel(target)}
                {v.stale ? " · STALE" : ""}
              </Kv>
            </span>
            <Seg7 size={14} off={!v.dur}>
              {v.dur ? fmtClock(v.dur) : "--:--"}
            </Seg7>
          </div>
        ))}
        {eng.variants.length === 0 && (
          <div style={{ padding: "8px 12px" }}>
            <Kv>ยังไม่มีโปรเจกต์ — ใส่วิดีโอที่ขั้น ① ก่อน</Kv>
          </div>
        )}
      </Well>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <Stat label="LISTEN" value={listenStat} warn={running && cur === "listen"} />
        <Stat label="PREPARE · COMPOSE" value={plan ? (prep.length ? (prep.length > 2 ? `${prep.length} STEPS · ~` : `${prep.map((x) => x.id.toUpperCase()).join(" · ")} · ~`) : "SKIP") : "…"} title={prep.map((x) => x.label).join(" → ") || "ทุกขั้นข้ามจาก cache"} />
        <Stat label="RENDER · ASSEMBLE · CAPTION" value={renderSec !== null ? `${fmtClock(renderSec)} · ${capOn ? "TEXT ON" : "NO TEXT"}` : plan?.error ? "—" : "…"} title={est ? `render ${est.new} ใหม่ · ใช้ซ้ำ ${est.reuse} · ${est.sec_per_segment}s/ชิ้น` : plan?.error ?? ""} />
        <Stat label="FX · AI REVIEW" value={plan ? `${fxOn ? "FX ON" : "FX OFF"} · REVIEW ที่ 03` : "…"} />
      </div>
      <div style={{ flex: 1 }} />
      <Well style={{ padding: "10px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Tag>ETA</Tag>
        <Seg7 size={40} off={!plan}>
          {plan ? `~${fmtClock(plan.seconds)}` : "--:--"}
        </Seg7>
      </Well>
      {plan && plan.unknown.length > 0 && (
        <Kv style={{ fontSize: 10.5 }} title="ขั้นพวกนี้ประเมินเวลาไม่ได้ก่อนรัน">
          ไม่รวม: {plan.unknown.join(" · ")}
        </Kv>
      )}
      {s.mod > 0 && (
        <Kv style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 6 }}>
          <Led dim /> จะบันทึก {s.mod} ค่าที่แก้ไว้ลง {s.setup?.project.path.split("/").pop()} ก่อนเริ่ม
        </Kv>
      )}
      <Cta onClick={go} disabled={running || !eng.proj} busy={busy || s.saving} title={running ? "มีงานกำลังรัน — รอให้เสร็จหรือกด STOP" : "vcut run — ทำทุกขั้นที่เปิดไว้ · ขั้นที่ทำแล้วและค่ายังไม่เปลี่ยนจะข้าม"}>
        ตัดให้เลย · {eng.variants.length} แบบ
      </Cta>
    </Panel>
  );
}
