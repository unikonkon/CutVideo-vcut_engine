"use client";

// หน้า CQ1 · ใส่วิดีโอ — ช่องวางไฟล์ + แถวสถานะรายคลิป (SCAN / LISTEN / THUMBS)
// ขวา: LISTEN · AUTO-START ตัวเลขความคืบหน้าของงานที่วิ่งอยู่
//
// ตัวเลขทุกตัวมาจากเอนจิน: manifest (eng.clips) · /api/setup steps (ทำถึงไหน ·
// เก่าหรือยัง) · /api/transcript (คลิปไหนมีคนพูด) · /api/job (งานที่วิ่งอยู่)

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Btn,
  Keys,
  Knob,
  Kv,
  Led,
  LogWell,
  Meter,
  Mono,
  Panel,
  SecHead,
  Seg7,
  Stat,
  Tag,
  Thumb,
  Well,
  fmtBytes,
  fmtClock,
  fmtWhen,
} from "@/components/instrument";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api2, thumbUrl, type ClipInfo } from "@/lib/api";
import { dur } from "@/lib/time";
import { findStep, orientLabel, pickVideos, speechOf, stemOf, thumbsCover, type LedState } from "./common";
import type { UpItem, UploadMode, UploadQueue } from "./upload";

/** LED + ป้าย + ข้อความสถานะ หนึ่งช่อง (SCAN · LISTEN · THUMBS) */
function StepLed({ tag, st }: { tag: string; st: LedState }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Led on={st.on} dim={st.dim} red={st.red} blink={st.dim} />
      <Tag>{tag}</Tag>
      <Mono style={{ fontSize: 11, color: st.muted ? "var(--muted)" : undefined }}>{st.text}</Mono>
    </span>
  );
}

/** แถวสถานะหนึ่งแถว — ใช้ทั้งไฟล์ที่กำลังส่งและคลิปที่อยู่ในคลังแล้ว */
function StatusRow({
  name,
  thumb,
  size,
  facts,
  leds,
  right,
  faded,
}: {
  name: string;
  thumb?: string;
  size: number;
  facts: ReactNode;
  leds: ReactNode;
  right?: ReactNode;
  faded?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14, alignItems: "center", padding: "10px 12px", opacity: faded ? 0.6 : 1 }}>
      <Thumb src={thumb} w={44} h={78} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <Mono className="kv">{fmtBytes(size)}</Mono>
        </div>
        <Mono style={{ fontSize: 11, color: "var(--muted)" }}>{facts}</Mono>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>{leds}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{right}</div>
    </div>
  );
}

export default function Input({ up }: { up: UploadQueue }) {
  const eng = useEngine();
  const r = useRoute();
  const setup = useLoader(() => api2.setup(), eng.reloadKey);
  const tr = useLoader(() => api2.transcript(), eng.reloadKey);
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // โหมดที่ผู้ใช้เลือกเอง — null = ตามกติกา: คลังว่างสร้างใหม่ · มีคลิปแล้วเพิ่มเข้า
  const [modePick, setModePick] = useState<UploadMode | null>(null);
  const mode: UploadMode = modePick ?? (eng.clips.length === 0 ? "new" : "add");

  const steps = setup.data?.steps;
  const scanStep = findStep(steps, "scan");
  const listenStep = findStep(steps, "listen");
  const thumbsStep = findStep(steps, "thumbs");
  const job = eng.job;
  const running = Boolean(job?.running);
  const runStep = running ? job?.step ?? "" : "";
  const prog = running ? job?.progress ?? null : null;
  const busy = running || up.busy;

  // ── สถานะสามช่องของคลิปหนึ่งตัว ──
  const ledsFor = (clip: ClipInfo | null, item: UpItem | null) => {
    const name = clip?.name ?? stemOf(item?.as ?? item?.name ?? "");
    const scan: LedState = clip
      ? { on: true, text: scanStep?.changed.length ? "DONE · STALE" : "DONE" }
      : item?.error
        ? { red: true, text: item.error }
        : item && !item.done
          ? { dim: true, text: `UPLOAD ${item.pct}%` }
          : runStep === "scan"
            ? { dim: true, text: prog ? `RUNNING ${prog.n}/${prog.total}` : "RUNNING" }
            : { text: up.current ? "QUEUED" : "รอ scan", muted: true };
    const n = speechOf(tr.data, name);
    const listen: LedState =
      runStep === "listen"
        ? { dim: true, text: prog ? `RUNNING ${prog.n}/${prog.total}${prog.eta ? ` · ETA ${prog.eta}` : ""}` : "RUNNING" }
        : n === null
          ? { text: item || up.current ? "QUEUED" : "รอ listen", muted: true }
          : n > 0
            ? { on: true, text: `${n} SEG` }
            : { on: true, text: "NO SPEECH → BROLL" };
    const thumbs: LedState =
      runStep === "thumbs"
        ? { dim: true, text: prog ? `RUNNING ${prog.n}/${prog.total}` : "RUNNING" }
        : thumbsCover(thumbsStep, clip)
          ? { on: true, text: thumbsStep?.changed.length ? "DONE · STALE" : thumbsStep?.summary || "DONE" }
          : { text: "QUEUED", muted: true };
    return (
      <>
        <StepLed tag="SCAN" st={scan} />
        <StepLed tag="LISTEN" st={listen} />
        <StepLed tag="THUMBS" st={thumbs} />
      </>
    );
  };

  // ไฟล์ที่ส่งเสร็จและโผล่ในคลังแล้วไม่ต้องโชว์ซ้ำ — แถวของคลิปเล่าเรื่องต่อเอง
  const known = useMemo(() => new Set(eng.clips.map((c) => c.name)), [eng.clips]);
  const pending = up.items.filter((u) => !(u.done && known.has(stemOf(u.as ?? u.name))));
  // คลิปล่าสุดขึ้นก่อน — ของที่เพิ่งใส่คือสิ่งที่คนกำลังรอดู
  const clips = useMemo(() => [...eng.clips].sort((a, b) => b.added - a.added), [eng.clips]);

  const onFiles = (files: FileList | File[]) => {
    const vids = pickVideos(files);
    if (!vids.length) return eng.flash("ลากได้เฉพาะไฟล์วิดีโอ .mov .mp4 .m4v");
    up.start(vids, mode, setup.data?.projects ?? []);
  };

  const nextBtn = (
    <Btn on onClick={() => r.go(2)} title="ไปขั้น ② เลือกสไตล์ — ถอดเสียงวิ่งต่อเองไม่ต้องรอ">
      ถัดไป · 02 เลือกสไตล์ ▸
    </Btn>
  );
  const libBtn = (
    <Btn sm onClick={() => r.setLib(true)}>
      คลังคลิป · {eng.clips.length} ▸
    </Btn>
  );

  // ── ฝั่งขวา: LISTEN ──
  const sum = tr.data?.summary;
  const listenRunning = runStep === "listen";
  const meterN = listenRunning && prog && prog.total > 0 ? (prog.n / prog.total) * 20 : sum && sum.clips > 0 ? (sum.with_speech / sum.clips) * 20 : 0;
  // ตอนงานวิ่ง = log จริงของเอนจิน · ตอนว่าง = สรุปว่าไฟล์แต่ละขั้นมีแล้วหรือยัง (จาก setup steps)
  const projPath = setup.data?.project.path ?? "";
  const logLines =
    running || up.current || up.chainError
      ? eng.jobLines
      : [
          projPath ? `${projPath}  active` : "…",
          `manifest.json   ${scanStep?.exists ? scanStep.summary || "ok" : "รอ scan"}${scanStep?.changed.length ? " · STALE" : ""}`,
          `transcript.json ${listenStep?.exists ? listenStep.summary || "ok" : "รอ listen"}${listenStep?.changed.length ? " · STALE" : ""}`,
          `thumbs          ${thumbsStep?.exists ? thumbsStep.summary || "ok" : "queued"}${thumbsStep?.changed.length ? " · STALE" : ""}`,
        ];

  const projName = eng.proj?.project || "—";

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", gap: 10, padding: 10, minHeight: 0 }}>
      {/* ── ซ้าย: ช่องวาง + แถวสถานะ ── */}
      <Panel style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px", minHeight: 0, overflow: "hidden" }}>
        <SecHead tag="SEC 00 · INPUT" title="ใส่วิดีโอ" kv={'วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอน — เอนจินปรับ 9:16 ให้เอง · มากกว่า 1 ไฟล์จัดที่ "คลังคลิป"'} />

        {/* โปรเจกต์ปลายทางของไฟล์ที่จะวาง */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Tag>PROJECT</Tag>
          <Keys<UploadMode>
            value={mode}
            onChange={setModePick}
            items={[
              { v: "add", label: `เพิ่มเข้าโปรเจกต์ที่เปิดอยู่ (${projName})`, disabled: up.busy, title: setup.data?.project.path },
              { v: "new", label: "สร้างโปรเจกต์ใหม่จากไฟล์นี้", disabled: up.busy, title: "projects/<ชื่อไฟล์>.toml · footage/<ชื่อไฟล์>/ · .vcut-<ชื่อไฟล์>/" },
            ]}
          />
          {mode === "new" && <Kv>ตั้งชื่อตามไฟล์แรก · สูตร vertical-short · โฟลเดอร์ฟุตเทจและ cache แยกของตัวเอง</Kv>}
        </div>

        {/* ตัวห่อรับลาก-วาง — Well ไม่รับ drag handler จึงห่อด้วย div ธรรมดา */}
        <div
          style={{ flex: 1, minHeight: 150, display: "flex" }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!up.busy) setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(false);
            if (!up.busy) onFiles(e.dataTransfer.files);
          }}
        >
          <Well
            dashed
            sel={over}
            onClick={() => !up.busy && fileRef.current?.click()}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: up.busy ? 0.6 : 1 }}
            title="คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง"
          >
            <Knob value={up.busy ? 0.5 : 0} min={0} max={1} size="lg" off={up.busy} />
            <span style={{ fontSize: 18, fontWeight: 500 }}>{up.busy ? "กำลังส่งไฟล์…" : "ลากวิดีโอมาวางที่ช่องนี้"}</span>
            <Mono className="kv" style={{ fontSize: 11 }}>
              UPLOAD · CHUNK 8 MB · RESUME OK · หรือ LINK โฟลเดอร์ฟุตเทจ
            </Mono>
            <Btn
              disabled={up.busy}
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
            >
              เลือกไฟล์…
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,.mov,.mp4,.m4v"
              multiple
              hidden
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (e.target.files?.length) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </Well>
        </div>

        {/* แถวสถานะ — ไฟล์ที่กำลังส่งขึ้นก่อน แล้วตามด้วยคลิปในคลัง (ใหม่สุดก่อน) */}
        {(pending.length > 0 || clips.length > 0) && (
          <Well className="rows" style={{ display: "flex", flexDirection: "column", maxHeight: "42%", overflowY: "auto", flexShrink: 0 }}>
            {pending.map((u) => (
              <StatusRow
                key={`up-${u.id}`}
                name={u.as ? `${u.name} → ${u.as}` : u.name}
                size={u.size}
                facts={u.error ? u.error : u.done ? "ส่งครบแล้ว · รอเอนจินอ่านคลิป (ffprobe)" : `UPLOAD ${u.pct}% · ${fmtBytes(Math.round((u.size * u.pct) / 100))} / ${fmtBytes(u.size)}`}
                leds={ledsFor(null, u)}
                right={!u.done && !u.error ? <Meter n={u.pct / 5} total={20} hot style={{ width: 120 }} /> : undefined}
                faded={Boolean(u.error)}
              />
            ))}
            {clips.map((c, i) => (
              <StatusRow
                key={c.name}
                name={c.name}
                thumb={thumbUrl(c.name)}
                size={c.size}
                facts={`${dur(c.dur)} · ${c.w}×${c.h} ${orientLabel(c.orient)} · ${(c.codec || "?").toUpperCase()} · ถ่าย ${fmtWhen(c.created)}${c.picked ? "" : " · พักไว้"}`}
                leds={ledsFor(c, null)}
                right={i === 0 && pending.length === 0 ? <>{nextBtn}{libBtn}</> : undefined}
                faded={!c.picked}
              />
            ))}
          </Well>
        )}
        {(pending.length > 0 || clips.length === 0) && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {up.chainError && <Kv style={{ color: "var(--danger)" }}>{up.chainError}</Kv>}
            <div style={{ flex: 1 }} />
            {libBtn}
            {nextBtn}
          </div>
        )}
      </Panel>

      {/* ── ขวา: LISTEN · AUTO-START ── */}
      <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", minHeight: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag>LISTEN · AUTO-START</Tag>
          <div style={{ flex: 1 }} />
          {["scan", "listen", "thumbs"].map((s) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 4 }} title={`สายงานอัตโนมัติ · ${s}`}>
              <Led on={up.done.includes(s) || (!up.current && findStep(steps, s)?.exists)} dim={up.current === s} blink={up.current === s} />
              <Tag>{s}</Tag>
            </span>
          ))}
        </div>

        <Well style={{ padding: "10px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Tag>{listenRunning && prog ? (prog.label || "SEGMENTS").toUpperCase() : "SEGMENTS"}</Tag>
          <Seg7 size={40} off={!listenRunning && !sum?.segments} style={{ whiteSpace: "nowrap" }} title={sum ? `${sum.segments} ท่อนพูด · ${sum.with_speech} จาก ${sum.clips} คลิปมีคนพูด` : undefined}>
            {listenRunning && prog ? (
              <>
                {prog.n}
                <span style={{ fontSize: 18, color: "var(--muted)", textShadow: "none" }}>/{prog.total}</span>
              </>
            ) : (
              <>
                {sum?.segments ?? 0}
                <span style={{ fontSize: 16, color: "var(--muted)", textShadow: "none" }}>
                  {" "}/ {sum?.with_speech ?? 0} CLIPS
                </span>
              </>
            )}
          </Seg7>
        </Well>
        <Meter n={meterN} total={20} hot={listenRunning} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Stat label={running ? "ELAPSED" : "LAST LISTEN"} value={running ? fmtClock(job?.elapsed ?? 0) : listenStep?.exists ? fmtWhen(listenStep.mtime) : "—"} />
          <Stat label="ETA" value={prog?.eta ? `~${prog.eta}` : running ? "…" : "—"} warn={Boolean(prog?.eta)} />
          <Stat label="SHARED BY" value="ALL VARIANTS" />
          {running && <Stat label="JOB" value={`${(job?.cmd_label || job?.step || "").toUpperCase()}${job && job.of > 1 ? ` ${job.at}/${job.of}` : ""}`} warn />}
        </div>
        <LogWell lines={logLines} style={{ minHeight: 90, maxHeight: 220 }} />
        {up.chainError && <Kv style={{ color: "var(--danger)", fontSize: 11 }}>{up.chainError}</Kv>}
        {running && (
          <Btn sm ghost danger onClick={() => eng.stopJob()} style={{ alignSelf: "flex-start" }}>
            หยุดงาน
          </Btn>
        )}
        <div style={{ flex: 1 }} />
        <Kv style={{ fontSize: 11, lineHeight: "16px" }}>ถอดเสียงเริ่มทันทีเพราะทุกแบบใช้ร่วมกัน (≈ ครึ่งหนึ่งของเวลาทั้งหมด) — ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</Kv>
        <Well onClick={() => r.go(2)} style={{ padding: "10px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }} title="ไปขั้น ②">
          <Tag>NEXT</Tag>
          <Seg7 size={32} off={busy}>
            02
          </Seg7>
        </Well>
      </Panel>
    </div>
  );
}
