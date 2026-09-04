"use client";

// F2Run · แผงกระจกใหญ่ระหว่าง/หลังงาน "ตัดให้เลย"
//
//   ซ้าย  รายการทุกแบบ 01–06 · เสร็จ = เวลา + ปุ่ม "ดู" (วิดีโอตัวอย่างในแถว)
//         กำลังเรนเดอร์ = แถบ · รอ = จาง        (จาก useCutProgress ที่โพล /api/variants)
//   ขวา   ตัวเลขใหญ่ n / N · เหลือ ~ · แถบรวม · ขั้นของงาน · หยุด · "ดู n แบบที่เสร็จ"
//
// งานจบรหัส 0 → พาไปขั้น ③ เอง (เฉพาะงานที่หน้านี้สั่ง) โดยเปิดแบบที่เลือกไว้ (s.pick)
// ล้มเหลว → เหตุผลจาก log ท้าย ๆ + ปุ่ม "ลองใหม่"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bar, Btn, Cta, Icon, cx, fmtClock } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { variantUrl, type JobState } from "@/lib/api";
import { dur } from "@/lib/time";
import { isQuickJob, quickFraction, quickViews } from "./phases";
import type { CutProgress, CutRow } from "./progress";
import { useStep2 } from "./state";

/** ไปขั้น ③ พร้อมเปิดแบบ id — URL แก้ได้ทีละก้อน จึงตั้ง v ก่อน แล้วค่อย go(3) รอบถัดไป */
export function useGoStep3() {
  const r = useRoute();
  const [target, setTarget] = useState<string | null>(null);
  const fired = useRef(false);
  useEffect(() => {
    if (target === null || fired.current) return;
    if (!target || r.variant === target) {
      fired.current = true;
      r.go(3);
    } else r.setVariant(target);
  }, [target, r]);
  return useCallback((id: string) => setTarget(id), []);
}

function Row({ row, i, style, made, open, onOpen, progress }: { row: CutRow; i: number; style: string; made: number; open: boolean; onOpen: () => void; progress: JobState["progress"] }) {
  const it = row.item;
  let right: ReactNode;
  if (row.state === "done" && it) {
    right = (
      <>
        <span className="small" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--amber)" }}>
          <Icon name="check" size={12} color="var(--amber)" />
          เสร็จ {dur(it.dur)}
        </span>
        <Btn sm on={open} onClick={onOpen}>
          <Icon name={open ? "x" : "play"} size={11} />
          ดู
        </Btn>
      </>
    );
  } else if (row.state === "run") {
    right = (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="muted small">กำลังเรนเดอร์{progress && progress.total > 0 ? ` ${progress.n} / ${progress.total}` : ""}</span>
          <Bar pct={progress && progress.total > 0 ? (progress.n / progress.total) * 100 : 100} dim={!progress || progress.total <= 0} />
        </div>
        <span style={{ width: 58 }} />
      </>
    );
  } else if (row.state === "fail") {
    right = (
      <>
        <span className="small" style={{ color: "var(--warm)", whiteSpace: "normal", lineHeight: "15px" }} title={it?.error}>
          ข้าม · {it?.error}
        </span>
        <span style={{ width: 58 }} />
      </>
    );
  } else {
    right = (
      <>
        <span className="muted small">รอ</span>
        <span style={{ width: 58 }} />
      </>
    );
  }
  return (
    <div style={{ borderTop: i === 0 ? undefined : "1px solid rgba(214,232,210,.09)", opacity: row.state === "wait" ? 0.55 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 170px auto", gap: 14, alignItems: "center", padding: "11px 0" }}>
        <span className="muted small num">{String(i + 1).padStart(2, "0")}</span>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 400 }}>{row.label}</span>
          <span className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {it && it.ok ? `${it.shots} ช็อต${row.note ? ` · ${row.note}` : ""}` : row.note}
          </span>
        </div>
        {right}
      </div>
      {open && it && (
        <div style={{ padding: "0 0 12px 44px" }}>
          <video key={`${row.id}:${it.made}`} src={variantUrl(row.id, it.made || made, style)} controls playsInline style={{ height: 260, aspectRatio: "9/16", borderRadius: 12, background: "#000" }} />
        </div>
      )}
    </div>
  );
}

export default function RunPanel({ job, prog, onDismiss }: { job: JobState; prog: CutProgress; onDismiss: () => void }) {
  const eng = useEngine();
  const s = useStep2();
  const goStep3 = useGoStep3();
  const [open, setOpen] = useState("");
  const running = job.running;
  const finished = !running && job.code !== null;
  const ok = finished && job.code === 0 && !job.stopped;
  const mine = isQuickJob(eng.lastStep);

  // พาไป ③ ครั้งเดียวต่องาน — เฉพาะงานที่หน้านี้สั่ง
  const navigated = useRef(false);
  useEffect(() => {
    if (running) navigated.current = false;
  }, [running]);
  useEffect(() => {
    if (ok && mine && !navigated.current) {
      navigated.current = true;
      goStep3(s.pick);
    }
  }, [ok, mine, goStep3, s.pick]);

  const views = quickViews(job).map((v) => (v.id === "variants" ? { ...v, label: `เรนเดอร์ ${prog.total} แบบ`, status: running && v.cur ? `${prog.done} / ${prog.total}` : v.status } : v));
  const frac = running ? Math.max(quickFraction(job), prog.total ? prog.done / prog.total : 0) : quickFraction(job);
  const eta = job.progress?.eta ?? "";
  const reason = job.lines.filter((l) => l.trim() && !l.startsWith("— ")).slice(-2);
  const title = running ? "กำลังตัด" : ok ? "ตัดเสร็จแล้ว" : job.stopped ? "หยุดแล้ว" : "มีข้อผิดพลาด";
  const styleName = s.setup ? String(s.eff("autofx.style") ?? "") : "";
  const styleField = s.setup?.fields.find((f) => f.key === "autofx.style");
  const styleLabel = styleName ? `สูตร ${(styleField?.labels?.[styleName] ?? styleName).split(" · ")[0]}` : "กำหนดเอง";

  return (
    <div className="panel" style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 40, padding: "22px 28px", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: 6, flexWrap: "wrap" }}>
          <span className="h2">
            {title} · {styleLabel}
          </span>
          <span className="muted small">{running ? "ดูแบบที่เสร็จแล้วได้เลย ไม่ต้องรอครบ" : ok ? "กำลังพาไปขั้นส่งออก" : "แบบที่เสร็จแล้วยังดูได้"}</span>
          <div style={{ flex: 1 }} />
          <span className="muted small num">{fmtClock(job.elapsed)}</span>
        </div>
        {prog.rows.map((row, i) => (
          <Row key={row.id} row={row} i={i} style={prog.style} made={prog.made} open={open === row.id} onOpen={() => setOpen(open === row.id ? "" : row.id)} progress={running ? job.progress : null} />
        ))}
        {!running && !ok && reason.length > 0 && (
          <pre className="well logwell" style={{ padding: "8px 10px", margin: "12px 0 0", color: job.stopped ? "var(--muted)" : "var(--warm)" }}>
            {reason.join("\n")}
          </pre>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, borderLeft: "1px solid rgba(214,232,210,.09)", paddingLeft: 32, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="num" style={{ fontSize: 56, lineHeight: 1 }}>
            {prog.done}
            <span className="muted" style={{ fontSize: 26 }}>
              {" "}
              / {prog.total}
            </span>
          </span>
          <div style={{ flex: 1 }} />
          {running && eta && <span className="muted small">เหลือ ~{eta}</span>}
        </div>
        <Bar pct={frac * 100} warm={finished && !ok} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6 }}>
          {views.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: v.led === "off" ? 0.55 : 1 }} title={v.note}>
              {v.led === "on" ? <Icon name="check" size={13} color="var(--amber)" /> : v.led === "red" ? <Icon name="warn" size={13} color="var(--warm)" /> : <span className={cx("led", v.led === "dim" && "on")} />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
              <div style={{ flex: 1 }} />
              <span className="small" style={{ color: v.led === "red" ? "var(--warm)" : "var(--muted)", whiteSpace: "nowrap" }}>
                {v.status}
              </span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10 }}>
          {running ? (
            <Btn onClick={() => eng.stopJob()}>
              <Icon name="stop" size={13} />
              หยุด
            </Btn>
          ) : (
            <>
              <Btn ghost onClick={onDismiss}>
                ปิด
              </Btn>
              {!ok && (
                <Btn on onClick={() => s.run()} disabled={s.busy || eng.clips.length === 0}>
                  <Icon name="refresh" size={13} />
                  ลองใหม่
                </Btn>
              )}
            </>
          )}
          <Cta sm onClick={() => goStep3(s.pick)} disabled={prog.done === 0} className="flex-1" title={prog.done ? "ไปขั้นส่งออก" : "ยังไม่มีแบบที่เสร็จ"}>
            ดู {prog.done} แบบที่เสร็จ
            <Icon name="chev" size={13} color="var(--ink-dark)" />
          </Cta>
        </div>
        <span className="muted small">{running ? "เสร็จครบแล้วจะพาไปขั้นส่งออกให้เอง" : ok ? "ตัดครบแล้ว" : "แก้ค่าแล้วกดลองใหม่ได้"}</span>
      </div>
    </div>
  );
}
