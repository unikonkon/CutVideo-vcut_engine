"use client";

// ① ใส่วิดีโอ (v6 · F1) — กลางหน้า: หัวเรื่อง → แผงกระจก 820 ที่มีช่องวางไฟล์เส้นประ
// + รายการคลิปใต้ช่อง → แถวล่าง: ข้อความช่วยเหลือ + ปุ่มหลัก "เลือกสไตล์"
//
// ตัวเลขทุกตัวมาจากเอนจิน: eng.clips (manifest) · /api/transcript · eng.job
// (งาน ingest ที่กำลังวิ่ง — ทุกคลิปใช้งานเดียวกัน จึงโชว์ความคืบหน้าที่แถวที่ยัง
// ไม่มีบทพูด)  ไม่มีแผงสถานะ/ล็อกด้านขวาแล้ว — mockup ไม่มี

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, Btn, Cta, Icon, Panel, Thumb, cx, fmtBytes } from "@/components/instrument";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api, api2, thumbUrl, type ClipInfo, type JobState } from "@/lib/api";
import { FEATURES } from "@/lib/roadmap";
import { dur } from "@/lib/time";
import { orientLabel, pickVideos, speechOf, stemOf } from "./common";
import type { UpItem, UploadQueue } from "./upload";

const COLS = "40px minmax(0,1fr) 190px 24px";

/** แถวไฟล์หนึ่งแถว — thumb 40 · ชื่อ+ข้อเท็จจริง · คอลัมน์สถานะ 190 · ปุ่มลบ 24 */
function Row({ first, thumb, name, facts, status, onDelete, deleteTitle, faded }: { first: boolean; thumb?: string; name: string; facts: ReactNode; status: ReactNode; onDelete?: () => void; deleteTitle?: string; faded?: boolean }) {
  return (
    <div className={cx(!first && "hl")} style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "12px 0", opacity: faded ? 0.55 : 1 }}>
      <Thumb src={thumb} w={40} h={40} style={{ borderRadius: 10 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{facts}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>{status}</div>
      <span style={{ display: "inline-flex", justifyContent: "center" }}>
        {onDelete && (
          <button type="button" className="btn sm ic ghost" style={{ width: 24, height: 24, padding: 0 }} onClick={onDelete} title={deleteTitle}>
            <Icon name="x" size={13} color="var(--muted)" />
          </button>
        )}
      </span>
    </div>
  );
}

/** สถานะเป็นข้อความบรรทัดเดียว (มีไอคอนได้) — สีบอกความหมาย: มอส = เสร็จ/กำลังทำของหลัก · จาง = รอ */
function Line({ icon, color, children }: { icon?: "mic" | "check" | "clock" | "warn"; color?: string; children: ReactNode }) {
  return (
    <span className="small" style={{ display: "inline-flex", alignItems: "center", gap: 7, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {icon && <Icon name={icon} size={12} color={color} />}
      {children}
    </span>
  );
}

/** ความคืบหน้าของงาน ingest ที่กำลังวิ่ง — คลิปทุกตัวใช้งานเดียวกัน */
function IngestLine({ job }: { job: JobState }) {
  const prog = job.progress;
  const label = job.cmd_label || job.cmd || job.step;
  if (job.cmd === "listen" && prog && prog.total > 0) {
    return (
      <>
        <Line icon="mic" color="var(--amber)">
          ถอดเสียง {prog.n} / {prog.total}
          {prog.eta ? <span className="muted"> · เหลือ ~{prog.eta}</span> : null}
        </Line>
        <Bar pct={(prog.n / prog.total) * 100} />
      </>
    );
  }
  // scan/thumbs (หรือ listen ก่อนแถบขึ้น) — บอกคำสั่งที่เท่าไรจากทั้งหมดในงาน
  const pct = job.of > 0 ? ((Math.max(1, job.at) - 1) / job.of) * 100 : 0;
  return (
    <>
      <Line icon="clock" color="var(--amber)">
        กำลัง{label}
        {job.of > 1 ? <span className="muted"> · {job.at}/{job.of}</span> : null}
      </Line>
      <Bar pct={pct} />
    </>
  );
}

export default function Input({ up }: { up: UploadQueue }) {
  const eng = useEngine();
  const r = useRoute();
  const setup = useLoader(() => api2.setup(), eng.reloadKey);
  const tr = useLoader(() => api2.transcript(), eng.reloadKey);
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  /** กด "เริ่มโปรเจกต์ใหม่" ค้างไว้ — ไฟล์ชุดถัดไปจะสร้างโปรเจกต์ใหม่แทนเพิ่มเข้าของเดิม */
  const [fresh, setFresh] = useState(false);
  const [deleting, setDeleting] = useState("");

  const job = eng.job;
  const running = Boolean(job?.running);
  const hasProject = Boolean(eng.proj?.project);
  const mode = fresh || !hasProject || eng.clips.length === 0 ? "new" : "add";

  const known = useMemo(() => new Set(eng.clips.map((c) => c.name)), [eng.clips]);
  const pending = up.items.filter((u) => !(u.done && known.has(stemOf(u.as ?? u.name))));
  const clips = useMemo(() => [...eng.clips].sort((a, b) => b.added - a.added), [eng.clips]);
  const vmodeLabel = (v: string) => eng.vmodes.find((m) => m.value === v)?.label ?? v;

  const onFiles = (files: FileList | File[]) => {
    const vids = pickVideos(files);
    if (!vids.length) return eng.flash("รับเฉพาะไฟล์วิดีโอ .mov .mp4 .m4v");
    setFresh(false);
    up.start(vids, mode, setup.data?.projects ?? []);
  };

  const onDelete = async (name: string) => {
    setDeleting(name);
    try {
      const res = await api.deleteClip(name);
      await eng.refresh();
      eng.flash(res.kind === "link" ? `ถอด ${name} ออกจากคลังแล้ว` : `ย้าย ${name} ไปถังขยะแล้ว`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "ลบคลิปไม่สำเร็จ");
    } finally {
      setDeleting("");
    }
  };

  /** คอลัมน์สถานะของคลิปในคลัง */
  const statusOf = (c: ClipInfo): ReactNode => {
    const n = speechOf(tr.data, c.name);
    if (n !== null) {
      return <Line icon="check" color="var(--amber)">{n > 0 ? `ถอดเสียงแล้ว · ${n} ท่อน` : "ไม่มีเสียงพูด · ใช้เป็นวิว"}</Line>;
    }
    if (running && job) return <IngestLine job={job} />;
    if (up.waiting) return <Line icon="clock" color="var(--muted)">รอเอนจินว่างแล้วจะถอดเสียง</Line>;
    if (up.chainError) return <Line icon="warn" color="var(--danger)">ยังไม่ได้ถอดเสียง</Line>;
    return <Line color="var(--muted)">รอถอดเสียง</Line>;
  };

  /** คอลัมน์สถานะของไฟล์ที่กำลังส่ง (ยังไม่โผล่ในคลัง) */
  const statusOfUpload = (u: UpItem): ReactNode => {
    if (u.error) return <Line icon="warn" color="var(--danger)">{u.error}</Line>;
    if (!u.done) {
      return (
        <>
          <Line color="var(--muted)">อัปโหลด {u.pct}%</Line>
          <Bar pct={u.pct} dim />
        </>
      );
    }
    if (running && job) return <IngestLine job={job} />;
    if (up.waiting) return <Line icon="clock" color="var(--muted)">ส่งครบแล้ว · รอเอนจินว่าง</Line>;
    return <Line color="var(--muted)">ส่งครบแล้ว · รอเอนจินอ่านคลิป</Line>;
  };

  const canDelete = !running && !up.busy && !deleting;
  const canNext = eng.clips.length > 0 && !eng.offline;
  const projName = eng.proj?.project || "";
  const dropHint = up.busy ? "กำลังส่งไฟล์…" : "ลากวิดีโอมาวางที่นี่";
  const dropSub = !up.busy && eng.clips.length > 0 ? (mode === "new" ? "ไฟล์ชุดถัดไปจะสร้างโปรเจกต์ใหม่จากชื่อไฟล์แรก" : projName ? `จะเพิ่มเข้าโปรเจกต์ ${projName}` : "") : "";
  const wide = { width: 820, maxWidth: "100%" } as const;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, padding: "16px 24px 70px", position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
        <span className="h1" style={{ fontSize: 40 }}>ใส่วิดีโอ</span>
        <span className="muted">วางกี่ไฟล์ก็ได้ · MOV / MP4 · แนวตั้งหรือแนวนอนก็ได้ เอนจินปรับเป็น 9:16 ให้เอง</span>
      </div>

      <Panel style={{ ...wide, padding: 8, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {eng.offline ? (
          <div style={{ height: 210, borderRadius: 12, border: "1px dashed rgba(255,122,122,.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <Icon name="warn" size={28} color="var(--danger)" />
            <span style={{ fontSize: 16 }}>ไม่พบเอนจิน</span>
            <span className="muted small">เปิด vcut serve แล้วลองเชื่อมใหม่ — วางไฟล์ได้เมื่อเอนจินกลับมา</span>
            <Btn onClick={() => eng.refresh()}>
              <Icon name="refresh" size={14} />
              ลองเชื่อมใหม่
            </Btn>
          </div>
        ) : (
          <div
            className={cx("well dashed", over && "sel")}
            style={{ height: 210, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: up.busy ? "default" : "pointer", opacity: up.busy ? 0.7 : 1 }}
            onClick={() => !up.busy && fileRef.current?.click()}
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
            role="button"
            title="คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง"
          >
            <Icon name="upload" size={28} color="var(--amber)" />
            <span style={{ fontSize: 16 }}>{dropHint}</span>
            {dropSub && <span className="muted small" style={{ marginTop: -8 }}>{dropSub}</span>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                disabled={up.busy}
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Icon name="film" size={14} />
                เลือกไฟล์…
              </Btn>
              {FEATURES.linkFolder && (
                <Btn ghost disabled={up.busy} onClick={(e) => e.stopPropagation()} title="ยังไม่มีในเอนจิน">
                  <Icon name="folder" size={14} />
                  ลิงก์โฟลเดอร์
                </Btn>
              )}
            </div>
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
          </div>
        )}

        {(pending.length > 0 || clips.length > 0) && (
          <div style={{ padding: "6px 16px 4px", display: "flex", flexDirection: "column" }}>
            {pending.map((u, i) => (
              <Row
                key={`up-${u.id}`}
                first={i === 0}
                name={u.as ? `${u.name} → ${u.as}` : u.name}
                facts={u.done ? fmtBytes(u.size) : `${fmtBytes(Math.round((u.size * u.pct) / 100))} / ${fmtBytes(u.size)}`}
                status={statusOfUpload(u)}
                faded={Boolean(u.error)}
              />
            ))}
            {clips.map((c, i) => (
              <Row
                key={c.name}
                first={pending.length === 0 && i === 0}
                thumb={thumbUrl(c.name)}
                name={c.name}
                facts={[
                  dur(c.dur),
                  `${c.w}×${c.h}`,
                  fmtBytes(c.size),
                  orientLabel(c.orient),
                  c.orient === "H" ? (c.vmode_eff === "crop" ? "จะครอปเป็น 9:16" : `เป็น 9:16 แบบ${vmodeLabel(c.vmode_eff)}`) : "",
                  c.picked ? "" : "พักไว้",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                status={statusOf(c)}
                onDelete={canDelete ? () => onDelete(c.name) : undefined}
                deleteTitle="เอาคลิปออก (ไปถังขยะ กู้คืนได้)"
                faded={!c.picked || deleting === c.name}
              />
            ))}
          </div>
        )}

        {up.chainError && (
          <div className="hl" style={{ margin: "0 16px", padding: "10px 0 6px", display: "flex", alignItems: "center", gap: 12 }}>
            <Icon name="warn" size={14} color="var(--danger)" />
            <span className="small" style={{ color: "var(--danger)", flex: 1, minWidth: 0 }}>{up.chainError}</span>
            <Btn sm onClick={() => up.chain()} disabled={running || up.busy} title={running ? "มีงานกำลังรันอยู่ — รอให้เสร็จก่อน" : "สั่งอ่านคลิป · ถอดเสียงอีกครั้ง"}>
              <Icon name="refresh" size={13} />
              ลองใหม่
            </Btn>
          </div>
        )}
      </Panel>

      <div style={{ ...wide, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span className="cap small" style={{ flex: 1, minWidth: 200 }}>เอนจินเริ่มถอดเสียงทันทีที่วางไฟล์ ทุกสไตล์ทุกแบบใช้ร่วมกัน · ไปเลือกสไตล์ต่อได้ไม่ต้องรอ</span>
        {eng.clips.length > 0 && !eng.offline && (
          <Btn
            sm
            ghost
            on={fresh}
            disabled={up.busy}
            onClick={() => {
              const next = !fresh;
              setFresh(next);
              if (next) fileRef.current?.click();
            }}
            title={fresh ? "กดอีกครั้งเพื่อกลับไปเพิ่มเข้าโปรเจกต์เดิม" : "ไฟล์ชุดถัดไปจะสร้าง projects/<ชื่อไฟล์>.toml ใหม่ (สูตร vertical-short)"}
          >
            <Icon name="plus" size={13} />
            เริ่มโปรเจกต์ใหม่
          </Btn>
        )}
        <Cta onClick={() => r.go(2)} disabled={!canNext} title={canNext ? "ไปเลือกสไตล์" : "วางไฟล์ก่อน"}>
          เลือกสไตล์
          <Icon name="chev" size={14} color="var(--ink-dark)" />
        </Cta>
      </div>
    </div>
  );
}
