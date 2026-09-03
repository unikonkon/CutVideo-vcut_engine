"use client";

// แผงขวาของขั้น ② ระหว่าง/หลังงานวิ่ง (CQ2RUN) — มิเตอร์ · 5 เฟส · READY · log · STOP
//
// เฟสไหนติดไฟ/หรี่/แดง คิดจาก JobState ใน phases.ts (ดูเหตุผลที่นั่น)  แผงนี้
// พาไปขั้น ③ เองเมื่อ *งานที่หน้านี้สั่ง* (eng.lastStep === "plan") จบด้วยรหัส 0
// — งานที่ค้างมาจากหน้าต่างอื่นไม่พาไป เพราะไม่รู้ว่าคนอยากไปไหน

import { useEffect, useRef } from "react";
import { Btn, Kv, Led, LogWell, Meter, Mono, Panel, SecHead, Seg7, Tag, Thumb, Well, fmtClock } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { thumbUrl } from "@/lib/api";
import { jobFraction, phaseViews } from "./phases";
import { useStep2 } from "./state";

export default function Run({ onDismiss }: { onDismiss: () => void }) {
  const eng = useEngine();
  const r = useRoute();
  const s = useStep2();
  const job = eng.job;
  const running = Boolean(job?.running);
  const finished = !!job && !job.running && job.code !== null;
  const ok = finished && job.code === 0 && !job.stopped;
  const failed = finished && !ok;

  const planSteps = s.plan?.steps ?? s.setup?.steps;
  const phases = phaseViews(job, eng.jobLines, planSteps, s.setup?.steps);
  const frac = jobFraction(job, eng.jobLines, planSteps);
  const curPhase = phases.find((p) => p.cur);

  // พาไป 03 ครั้งเดียวต่องาน — งานที่ *หน้านี้* สั่งเท่านั้น
  const navigated = useRef(false);
  useEffect(() => {
    if (running) navigated.current = false;
  }, [running]);
  useEffect(() => {
    if (ok && eng.lastStep === "plan" && !navigated.current) {
      navigated.current = true;
      r.go(3);
    }
  }, [ok, eng.lastStep, r]);

  const firstShot = eng.proj?.timeline[0]?.name;
  const pr = job?.progress;
  const rendering = running && curPhase?.id === "compose";
  const title = running ? "กำลังตัด" : ok ? "เสร็จแล้ว" : job?.stopped ? "หยุดแล้ว" : failed ? "ไม่สำเร็จ" : "งาน";
  const jobName = job ? (job.step === "plan" ? "ทุกขั้น" : job.cmd_label || job.step) : "";

  return (
    <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", overflow: "hidden", minWidth: 0 }}>
      <SecHead
        tag={`JOB · ${eng.variants.length} VARIANTS`}
        title={title}
        kv={jobName}
        right={
          <Mono className="kv" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
            {fmtClock(job?.elapsed ?? 0)}
            {running && pr?.eta ? ` · ETA ${pr.eta}` : ""}
            {job && job.of > 1 ? ` · ${job.at}/${job.of}` : ""}
          </Mono>
        }
      />
      <Meter n={frac * 20} total={20} hot={running} />

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {phases.map((p) => (
          <div
            key={p.id}
            className={p.cur ? "well" : undefined}
            style={{ display: "grid", gridTemplateColumns: "8px 150px 1fr auto", gap: 10, alignItems: "center", padding: "6px 10px", borderRadius: 4, boxShadow: p.cur ? "inset 0 0 0 1px var(--amber)" : undefined, opacity: p.inJob.length === 0 && !p.cur ? 0.7 : 1 }}
            title={`${p.note}${p.inJob.length ? ` · ในงานนี้: ${p.inJob.join(" · ")}` : " · ไม่อยู่ในงานนี้"}`}
          >
            <Led on={p.led === "on"} dim={p.led === "dim"} red={p.led === "red"} blink={p.cur} />
            <span style={{ fontSize: 12, color: p.cur ? "var(--amber)" : undefined, whiteSpace: "nowrap" }}>{p.label}</span>
            <Kv className="truncate" style={{ fontSize: 10.5 }}>
              {p.note}
            </Kv>
            <Mono className="truncate" style={{ fontSize: 10.5, color: p.led === "red" ? "var(--danger)" : "var(--muted)", maxWidth: 150 }}>
              {p.status}
            </Mono>
          </div>
        ))}
      </div>

      <Tag>{ok ? "READY — กดดูได้เลย" : running ? "READY — แบบที่เสร็จแล้วกดดูได้" : "READY"}</Tag>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, eng.variants.length)}, minmax(0, 1fr))`, gap: 6 }}>
        {eng.variants.map((v) => (
          <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {v.ready && firstShot ? (
              <Thumb src={thumbUrl(firstShot)} tc={fmtClock(v.dur)} h={112} onClick={() => r.go(3)} title="ดูที่ขั้น ③" />
            ) : rendering ? (
              <Well style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Seg7 size={16}>{pr && pr.total ? `${pr.n}/${pr.total}` : "…"}</Seg7>
              </Well>
            ) : (
              <Well dashed style={{ height: 112 }} />
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: v.ready ? undefined : "var(--muted)" }}>
              <Led on={v.ready} dim={!v.ready && rendering} />
              {v.id}
              {v.stale ? <Kv style={{ fontSize: 10 }}>· เก่ากว่า EDL</Kv> : null}
            </span>
          </div>
        ))}
      </div>

      <LogWell lines={eng.jobLines} style={{ flex: 1, minHeight: 80 }} max={failed ? 400 : 200} />

      <div style={{ display: "flex", gap: 6 }}>
        <Btn onClick={eng.stopJob} disabled={!running} style={{ flex: 1, height: 38 }} title="หยุดงานที่กำลังรัน">
          <span style={{ display: "inline-block", width: 9, height: 9, background: "var(--ink)" }} />
          STOP
        </Btn>
        <Btn on={eng.variants.some((v) => v.ready)} disabled={!eng.variants.some((v) => v.ready)} onClick={() => r.go(3)} style={{ flex: 1.4, height: 38 }}>
          ดู {eng.variants.filter((v) => v.ready).map((v) => v.id).join(" · ") || eng.variants.map((v) => v.id).join(" · ")} ที่เสร็จแล้ว ▸
        </Btn>
        {finished && (
          <Btn sm ghost onClick={onDismiss} title="กลับไปแผง OUTPUT">
            ✕
          </Btn>
        )}
      </div>
      <Kv style={{ textAlign: "center", fontSize: 10.5, color: failed ? "var(--danger)" : undefined }}>
        {failed ? (job?.stopped ? "หยุดไว้ — แก้แล้วกด ตัดให้เลย ใหม่ได้" : `จบด้วยรหัส ${job?.code} — ดูบรรทัดท้าย log`) : "เสร็จครบแล้วพาไป 03 เอง"}
      </Kv>
    </Panel>
  );
}
