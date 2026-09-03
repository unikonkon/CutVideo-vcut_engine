"use client";

// แท็บ ไปป์ไลน์ · สถานะ (CPIPE) — ทำถึงไหน · ของเก่าหรือยัง · สั่งรายขั้น/ราย phase
//
// ไม่คิดสถานะเองสักข้อ: exists/changed/run/skip มาจาก setup.steps ของเอนจิน
//   LED on  = มีไฟล์ผลลัพธ์ (exists)
//   LED dim = ขั้นนี้กำลังวิ่ง (job.cmd หรือ job.step ตรงกับ id)
//   STALE   = changed ไม่ว่าง (ค่าตั้งที่ขั้นนั้นสนใจเปลี่ยนไปหลังทำครั้งล่าสุด)

import { useCallback, useEffect, useRef, useState } from "react";
import { api3 } from "@/lib/api";
import { useEngine, useLoader } from "@/hooks/engine";
import { Btn, Kv, Led, LogWell, Mono, SecHead, Stat, Tag, Well, fmtBytes, fmtWhen } from "@/components/instrument";
import { AdvFrame, GLYPH, HeadBadge, PHASE_SHORT, type TabProps } from "./shared";

export default function Pipe(p: TabProps) {
  const { setup, draft } = p;
  const eng = useEngine();
  const running = !!eng.job?.running;
  const info = useLoader(() => api3.info(), eng.reloadKey);
  const [showInfo, setShowInfo] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const n = Object.keys(draft).length;

  const steps = setup.steps;
  const stale = steps.filter((s) => s.run && s.changed.length > 0);
  const done = steps.filter((s) => s.exists).length;
  const cur = eng.job?.cmd || "";
  const live = (id: string) => running && (cur === id || eng.job?.step === id);

  // ── คิวฝั่งหน้าเว็บสำหรับ "รันขั้นที่เก่า": เอนจินรับทีละงาน (409 ถ้าซ้อน) จึงเริ่มตัว
  // ถัดไปเมื่อ reloadKey ขยับ (= งานก่อนจบแล้ว)  starting กันยิงซ้ำระหว่างที่ POST
  // ยังไม่กลับ — ช่วงนั้น job.running ยัง false อยู่
  const queueRef = useRef<string[]>([]);
  const startingRef = useRef(false);
  const [queued, setQueued] = useState(0);
  const runJob = eng.runJob;
  const kick = useCallback(() => {
    if (startingRef.current || !queueRef.current.length) return;
    const next = queueRef.current[0];
    queueRef.current = queueRef.current.slice(1);
    startingRef.current = true;
    runJob(next).then((ok) => {
      startingRef.current = false;
      if (!ok) queueRef.current = [];
      setQueued(queueRef.current.length);
    });
  }, [runJob]);
  useEffect(() => {
    if (!running) kick();
  }, [eng.reloadKey, running, kick]);

  const runStale = () => {
    queueRef.current = stale.map((s) => s.id);
    setQueued(queueRef.current.length);
    kick();
  };

  const copyOut = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      eng.flash("คัดลอกที่อยู่โฟลเดอร์แล้ว");
    } catch {
      eng.flash("คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง");
    }
  };

  const pr = info.data?.project;
  const tools = info.data?.tools;

  const footer = (
    <>
      <Btn sm on={stale.length > 0} disabled={running || !stale.length} onClick={runStale} title="รันทีละขั้นตามลำดับ — ขั้นถัดไปเริ่มเมื่อขั้นก่อนจบ">
        รันขั้นที่เก่า · {stale.length ? stale.map((s) => s.id).join(" + ") : "—"}
        {queued > 0 ? ` (คิว ${queued})` : ""}
      </Btn>
      <Btn sm on={showInfo} onClick={() => setShowInfo((v) => !v)}>
        สรุปสถานะ · vcut info
      </Btn>
      <Btn sm on={showOut} onClick={() => setShowOut((v) => !v)}>
        เปิดโฟลเดอร์ผลลัพธ์
      </Btn>
      <div style={{ flex: 1 }} />
      <Mono className="kv" style={{ fontSize: 10 }}>
        STALE = ค่าตั้งของขั้นนั้นเปลี่ยนหลังทำครั้งล่าสุด
      </Mono>
    </>
  );

  return (
    <AdvFrame
      sub="/api/setup steps · ทำถึงไหน · ของเก่าหรือยัง (ค่าตั้งเปลี่ยนหลังทำ) · สั่งรายขั้น/ราย phase"
      badge={
        <HeadBadge>
          {done}/{steps.length} DONE · {stale.length} STALE
        </HeadBadge>
      }
      draftN={n}
      onClose={p.onClose}
      footer={footer}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Tag>RUN PHASE</Tag>
        {setup.phases.map((ph) => {
          const runnable = ph.steps.filter((s) => s.run).length;
          return (
            <Btn key={ph.id} sm on={running && eng.job?.step === ph.id} disabled={running || runnable === 0} onClick={() => void eng.runJob(ph.id)} title={`${ph.label} — ${ph.why}${runnable === 0 ? "\nทุกขั้นในนี้ถูกปิดหรือข้ามไว้" : ""}`}>
              {GLYPH[ph.no] ?? ph.no} {PHASE_SHORT[ph.id] ?? ph.label}
            </Btn>
          );
        })}
        <div style={{ flex: 1 }} />
        <Btn sm ghost disabled={running} onClick={() => void eng.runJob("plan")} title="vcut run — ครบทุกขั้น ① → ⑤ (ข้ามขั้นที่มีของแล้ว)">
          ทำทุกขั้น · run
        </Btn>
        <Btn sm danger disabled={!running} onClick={() => void eng.stopJob()}>
          ■ หยุด
        </Btn>
      </div>

      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
        {steps.map((s) => {
          const isLive = live(s.id);
          const isStale = s.changed.length > 0;
          return (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "8px 24px 170px 110px 1fr auto auto", gap: 10, alignItems: "center", padding: "6px 12px", opacity: s.run ? 1 : 0.55 }}>
              <Led on={s.exists && !isLive} dim={isLive} blink={isLive} title={!s.run ? s.skip : s.exists ? "มีไฟล์ผลลัพธ์" : "ยังไม่ได้ทำ"} />
              <Mono className="kv" style={{ fontSize: 10 }}>
                {GLYPH[s.phase_no] ?? s.phase_no}
              </Mono>
              <span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${s.id} · ${s.label}${s.id === "finish" ? " (vcut fx)" : ""}`}>
                {s.id} · {s.label}
              </span>
              <Mono className="kv" style={{ fontSize: 10.5, color: isLive ? "var(--amber)" : undefined }}>
                {isLive ? "RUNNING" : s.exists ? fmtWhen(s.mtime) : "—"}
              </Mono>
              <Kv style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={!s.run ? s.skip : s.summary}>
                {!s.run ? s.skip : s.summary || (s.exists ? "" : "ยังไม่ได้ทำ")}
              </Kv>
              <Mono style={{ fontSize: 10, color: isStale ? "var(--amber)" : "var(--faint)" }} title={isStale ? `ค่าที่เปลี่ยนไป: ${s.changed.join(" · ")}` : "ค่าที่ขั้นนี้สนใจยังเหมือนตอนทำ"}>
                {isStale ? "STALE" : "OK"}
              </Mono>
              <Btn sm disabled={running || !s.run} onClick={() => void eng.runJob(s.id)} title={s.run ? `สั่ง "${s.label}" ขั้นเดียว` : s.skip}>
                รัน
              </Btn>
            </div>
          );
        })}
      </Well>

      {showInfo && pr && (
        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <SecHead tag="VCUT INFO" title={pr.name || "—"} size={14} kv={pr.config.join(" → ")} />
          <Stat label="SOURCE" value={pr.source} warn={!pr.source_ok} title={pr.source_ok ? "โฟลเดอร์ฟุตเทจอยู่ครบ" : "ไม่พบโฟลเดอร์ฟุตเทจ"} />
          <Stat label="WORK" value={`${pr.work} · ${fmtBytes(pr.work_bytes)}`} />
          <Stat label="SEGMENTS" value={`${pr.segments} ชิ้น · ${fmtBytes(pr.segments_bytes)}`} />
          <Stat label="DISK FREE" value={`${(pr.disk_free_gb ?? 0).toFixed(1)} GB`} warn={(pr.disk_free_gb ?? 0) < Number(p.val("render.min_free_gb") ?? 0)} />
          {pr.outs.map((o) => (
            <Stat key={o.step} label={`OUT · ${o.step}`} value={o.exists ? `${o.name} · ${fmtBytes(o.size)} · ${fmtWhen(o.mtime)}` : `${o.name} · ยังไม่มี`} />
          ))}
          <Stat label="ENGINE UP" value={`${Math.floor((info.data?.uptime ?? 0) / 60)} นาที · python ${info.data?.python}`} />
        </Well>
      )}

      {showOut && pr && (
        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tag>OUT DIR</Tag>
            <Mono style={{ fontSize: 11.5, flex: 1, userSelect: "all", wordBreak: "break-all" }}>{pr.out_dir}</Mono>
            <Btn sm onClick={() => void copyOut(pr.out_dir)}>
              คัดลอก
            </Btn>
          </div>
          <Kv style={{ fontSize: 10.5 }}>เอนจินไม่มีเส้นทางเปิด Finder จากหน้าเว็บ — คัดลอกที่อยู่แล้วเปิดเอง (project.reveal เปิด Finder ให้ตอนงานเสร็จ)</Kv>
        </Well>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 160 }}>
        <LogWell lines={eng.jobLines} style={{ minHeight: 160, maxHeight: 320 }} />
        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, alignSelf: "start" }}>
          {info.data && tools && pr ? (
            <>
              <Stat label="ENGINE" value={`${info.data.host}:${info.data.port} · pid ${info.data.pid}`} />
              <Stat label="ffmpeg" value={tools.ffmpeg.ok ? `${tools.ffmpeg.version}${tools.ffmpeg.ass ? " · ass" : " · ไม่มี ass"}` : "ไม่พบ"} warn={!tools.ffmpeg.ok || !tools.ffmpeg.ass} title={tools.ffmpeg.text_path ? `ffmpeg สำหรับซับ: ${tools.ffmpeg.text_path}` : "ไม่มี ffmpeg ที่มีฟิลเตอร์ ass — ขั้น ④ ใส่ข้อความไม่ได้"} />
              <Stat label="whisper.cpp" value={tools.whisper.ok ? `${tools.whisper.model_name || "—"}${tools.whisper.model_ok ? "" : " · ไม่พบโมเดล"}` : "ไม่พบ whisper"} warn={!tools.whisper.ok || !tools.whisper.model_ok} title={tools.whisper.model} />
              <Stat label="claude -p" value={tools.claude.ok ? `OK · ${tools.claude.version}` : "ไม่พบ"} warn={!tools.claude.ok} />
              <Stat label="WORK" value={`.vcut/ ${fmtBytes(pr.work_bytes)}`} title={pr.work} />
              <Stat label="OUT" value={pr.out_dir.replace(/^\/Users\/[^/]+/, "~")} title={pr.out_dir} />
              <Stat label="PROJECT" value={`${pr.path || "—"} · MOD ${n}`} />
            </>
          ) : info.error ? (
            <Kv style={{ color: "var(--danger)" }}>{info.error}</Kv>
          ) : (
            <Kv>กำลังอ่าน /api/info…</Kv>
          )}
        </Well>
      </div>
    </AdvFrame>
  );
}
