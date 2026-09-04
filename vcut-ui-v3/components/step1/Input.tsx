"use client";

// ① ใส่วิดีโอ — ช่องวางไฟล์ใหญ่ตรงกลาง + แถวคลิปที่มี + ปุ่มต่อไป
//
// ตัวเลขทุกตัวมาจากเอนจิน: manifest (eng.clips) · /api/setup steps · /api/transcript
// · /api/job (งานที่วิ่งอยู่)  ปุ่มมีไม่กี่ปุ่ม: เลือกไฟล์ · (เพิ่ม/สร้างใหม่) · ต่อไป

import { useMemo, useRef, useState } from "react";
import { Btn, Cta, Keys, Kv, Led, LogWell, Mono, Panel, Tag, Thumb, Well, fmtBytes } from "@/components/instrument";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api2, thumbUrl, type ClipInfo } from "@/lib/api";
import { dur } from "@/lib/time";
import { findStep, orientLabel, pickVideos, speechOf, stemOf } from "./common";
import type { UpItem, UploadMode, UploadQueue } from "./upload";

/** ชิปสถานะหนึ่งอัน — ทำแล้ว (ฟ้า) · กำลังทำ (กะพริบ) · รอ (เทา) · พัง (แดง) */
function Chip({ state, children }: { state: "on" | "dim" | "off" | "red"; children: React.ReactNode }) {
  const color = state === "on" ? "var(--amber-hi)" : state === "red" ? "var(--danger)" : state === "dim" ? "var(--ink)" : "var(--muted)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color }}>
      <Led on={state === "on"} dim={state === "dim"} blink={state === "dim"} red={state === "red"} />
      {children}
    </span>
  );
}

function Row({ name, thumb, size, facts, chips, faded }: { name: string; thumb?: string; size: number; facts: React.ReactNode; chips: React.ReactNode; faded?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 12, alignItems: "center", padding: "9px 12px", opacity: faded ? 0.55 : 1 }}>
      <Thumb src={thumb} w={40} h={70} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <Mono className="kv">{fmtBytes(size)}</Mono>
        </div>
        <Mono style={{ fontSize: 11, color: "var(--muted)" }}>{facts}</Mono>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>{chips}</div>
      </div>
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
  const [modePick, setModePick] = useState<UploadMode | null>(null);
  const mode: UploadMode = modePick ?? (eng.clips.length === 0 ? "new" : "add");

  const steps = setup.data?.steps;
  const scanStep = findStep(steps, "scan");
  const listenStep = findStep(steps, "listen");
  const job = eng.job;
  const running = Boolean(job?.running);
  const runStep = running ? job?.step ?? "" : "";
  const prog = running ? job?.progress ?? null : null;

  const chipsFor = (clip: ClipInfo | null, item: UpItem | null) => {
    const name = clip?.name ?? stemOf(item?.as ?? item?.name ?? "");
    const n = speechOf(tr.data, name);
    return (
      <>
        {item?.error ? (
          <Chip state="red">{item.error}</Chip>
        ) : item && !item.done ? (
          <Chip state="dim">กำลังส่ง {item.pct}%</Chip>
        ) : clip ? (
          <Chip state="on">อ่านคลิปแล้ว</Chip>
        ) : (
          <Chip state={runStep === "scan" ? "dim" : "off"}>{runStep === "scan" ? "กำลังอ่านคลิป" : "รออ่านคลิป"}</Chip>
        )}
        {runStep === "listen" ? (
          <Chip state="dim">ถอดเสียง {prog && prog.total ? `${prog.n}/${prog.total}` : "…"}{prog?.eta ? ` · เหลือ ~${prog.eta}` : ""}</Chip>
        ) : n === null ? (
          <Chip state="off">รอถอดเสียง</Chip>
        ) : n > 0 ? (
          <Chip state="on">บทพูด {n} ท่อน</Chip>
        ) : (
          <Chip state="on">ไม่มีเสียงพูด · ใช้เป็นวิว</Chip>
        )}
      </>
    );
  };

  const known = useMemo(() => new Set(eng.clips.map((c) => c.name)), [eng.clips]);
  const pending = up.items.filter((u) => !(u.done && known.has(stemOf(u.as ?? u.name))));
  const clips = useMemo(() => [...eng.clips].sort((a, b) => b.added - a.added), [eng.clips]);

  const onFiles = (files: FileList | File[]) => {
    const vids = pickVideos(files);
    if (!vids.length) return eng.flash("รับเฉพาะไฟล์วิดีโอ .mov .mp4 .m4v");
    up.start(vids, mode, setup.data?.projects ?? []);
  };

  const listened = Boolean(listenStep?.exists) && !up.current && !running;
  const canNext = eng.clips.length > 0;
  const busyLabel = up.busy ? "กำลังส่งไฟล์…" : up.current ? `กำลัง${job?.cmd_label || up.current}…` : "";
  const projName = eng.proj?.project || "—";

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 10, padding: 10, minHeight: 0 }}>
      <Panel style={{ display: "flex", flexDirection: "column", gap: 14, padding: "18px 20px", minHeight: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>ใส่วิดีโอ</span>
          <Kv>วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอน — เอนจินปรับเป็น 9:16 ให้เอง</Kv>
        </div>

        {eng.clips.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Tag>ไฟล์ที่วางจะไปที่</Tag>
            <Keys<UploadMode>
              value={mode}
              onChange={setModePick}
              items={[
                { v: "add", label: `โปรเจกต์นี้ (${projName})`, disabled: up.busy },
                { v: "new", label: "โปรเจกต์ใหม่", disabled: up.busy, title: "projects/<ชื่อไฟล์>.toml · footage/<ชื่อไฟล์>/" },
              ]}
            />
          </div>
        )}

        <div
          style={{ flex: pending.length + clips.length > 0 ? "0 0 auto" : 1, minHeight: 180, display: "flex" }}
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
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, opacity: up.busy ? 0.6 : 1 }}
            title="คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง"
          >
            <span style={{ width: 56, height: 56, borderRadius: 999, background: "rgba(90,176,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "var(--amber-hi)" }}>+</span>
            <span style={{ fontSize: 18, fontWeight: 500 }}>{busyLabel || "ลากวิดีโอมาวางที่นี่"}</span>
            <Kv>หรือ</Kv>
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

        {(pending.length > 0 || clips.length > 0) && (
          <Well className="rows" style={{ display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, flex: 1 }}>
            {pending.map((u) => (
              <Row
                key={`up-${u.id}`}
                name={u.as ? `${u.name} → ${u.as}` : u.name}
                size={u.size}
                facts={u.error ? u.error : u.done ? "ส่งครบแล้ว · รอเอนจินอ่านคลิป" : `${fmtBytes(Math.round((u.size * u.pct) / 100))} / ${fmtBytes(u.size)}`}
                chips={chipsFor(null, u)}
                faded={Boolean(u.error)}
              />
            ))}
            {clips.map((c) => (
              <Row
                key={c.name}
                name={c.name}
                thumb={thumbUrl(c.name)}
                size={c.size}
                facts={`${dur(c.dur)} · ${c.w}×${c.h} ${orientLabel(c.orient)} · ${(c.codec || "?").toUpperCase()}${c.picked ? "" : " · พักไว้"}`}
                chips={chipsFor(c, null)}
                faded={!c.picked}
              />
            ))}
          </Well>
        )}
        {up.chainError && <Kv style={{ color: "var(--danger)" }}>{up.chainError}</Kv>}
      </Panel>

      <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 18px", minHeight: 0, overflow: "hidden" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>สถานะ</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { id: "scan", label: "อ่านคลิป", done: Boolean(scanStep?.exists) },
            { id: "listen", label: "ถอดเสียงเป็นบทพูด", done: Boolean(listenStep?.exists) },
            { id: "thumbs", label: "ภาพตัวอย่าง", done: Boolean(findStep(steps, "thumbs")?.exists) },
          ].map((s) => {
            const cur = up.current === s.id || runStep === s.id;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <Led on={!cur && (s.done || up.done.includes(s.id))} dim={cur} blink={cur} />
                <span style={{ flex: 1 }}>{s.label}</span>
                <Mono style={{ fontSize: 11, color: cur ? "var(--amber-hi)" : "var(--muted)" }}>
                  {cur ? (prog && prog.total ? `${prog.n}/${prog.total}` : "กำลังทำ") : s.done || up.done.includes(s.id) ? "เสร็จ" : up.queue.includes(s.id) ? "รอคิว" : "—"}
                </Mono>
              </div>
            );
          })}
        </div>
        <Kv style={{ fontSize: 11.5, lineHeight: "17px" }}>
          {listened ? "บทพูดพร้อมแล้ว — ทุกแบบใช้ร่วมกัน ไม่ต้องถอดซ้ำ" : "ถอดเสียงใช้เวลาราวครึ่งหนึ่งของทั้งหมด (คลิป 2 นาที ≈ 40 วิ) — ไปเลือกสไตล์ต่อได้เลย ไม่ต้องรอ"}
        </Kv>
        <LogWell lines={running || up.current ? eng.jobLines : [setup.data?.project.path ? `${setup.data.project.path}` : "ยังไม่มีโปรเจกต์ — วางไฟล์เพื่อสร้าง"]} style={{ minHeight: 80, flex: 1 }} />
        {running && (
          <Btn sm ghost danger onClick={() => eng.stopJob()} style={{ alignSelf: "flex-start" }}>
            หยุดงาน
          </Btn>
        )}
        <Cta onClick={() => r.go(2)} disabled={!canNext} title={canNext ? "ไปเลือกสไตล์" : "วางไฟล์ก่อน"}>
          ต่อไป · เลือกสไตล์ ▸
        </Cta>
      </Panel>
    </div>
  );
}
