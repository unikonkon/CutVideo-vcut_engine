"use client";

// แท็บ "ซับ" ของลิ้นชัก (captions.json · ขั้น ④) — mockup F3Edit
//   ซ้าย : โหมด 3 ช่อง (ทั้งบรรทัด / ทีละคำ / ปิดซับ) · "N บรรทัด" · รายการบรรทัด (เวลา · ข้อความแก้ inline · ซ่อน)
//   ขวา  : จอตัวอย่าง (EditShell) · สไตล์ตัวอักษร 3 ช่องแนวตั้ง · ขนาด − / + · ตำแหน่ง 3×3
//   "N บรรทัดไม่มั่นใจ" + แถบความมั่นใจต่อบรรทัด อยู่หลังธง FEATURES.subConfidence — เอนจินยังไม่ส่ง conf

import { useMemo } from "react";
import { Bar, Empty, Icon, Pos9, Seg, Stepper, Well, cx } from "@/components/instrument";
import { FEATURES } from "@/lib/roadmap";
import { dur } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, IcBtn, Lbl, Row, pos9OfAlign, pos9Pose } from "./common";

type Mode = "line" | "word" | "off";

/** สไตล์ตัวอักษร 3 แบบของ mockup — captions.json ไม่มีคีย์ "แผ่นทึบ" จึงใช้ตัวดำขอบขาวหนาแทน */
const LOOKS: { v: string; label: string; color: string; outline: string; title?: string }[] = [
  { v: "bold", label: "หนา ขอบดำ", color: "#FFFFFF", outline: "#000000" },
  { v: "plate", label: "แผ่นทึบ", color: "#000000", outline: "#FFFFFF", title: "เอนจินไม่มีแผ่นทึบใต้ซับ — ใช้ตัวดำขอบขาวหนาแทน" },
  { v: "yellow", label: "เหลืองเน้น", color: "#FFD400", outline: "#000000" },
];
const LOW_CONF = 0.7;

interface Line {
  id: string;
  tl: number;
  end: number;
  text: string;
  /** เอนจินคิด cue ให้แล้ว (มีในหนังจริง) · false = มีแค่ในบทพูด */
  cue: boolean;
  dropped: boolean;
  /** ความมั่นใจของ whisper (0–1) — เอนจินยังไม่ส่ง จึงมักเป็น undefined */
  conf?: number;
}

export default function SubEditor() {
  const s = useStudio();
  const cap = s.cap;
  const data = cap.data;
  const cd = cap.draft;

  // บรรทัด = บทพูดที่อยู่ในหนัง (id สูตรเดียวกับ cue) ทับด้วยข้อความของ cue/ที่แก้ค้าง
  // cue ที่ซ่อนไว้หายจากรายการที่เอนจินส่งมา จึงต้องปั้นแถวคืนจากบทพูด ไม่งั้นกู้ไม่ได้อีก
  const lines = useMemo<Line[]>(() => {
    if (!data || !cd) return [];
    const drop = new Set(cd.drop);
    const byId = new Map(data.cues.map((c) => [c.id, c]));
    const confOf = (c: unknown) => (c && typeof (c as { conf?: unknown }).conf === "number" ? ((c as { conf: number }).conf as number) : undefined);
    const seen = new Set<string>();
    const out: Line[] = s.speechLines.map((ln) => {
      seen.add(ln.id);
      const c = byId.get(ln.id);
      return { id: ln.id, tl: c?.a ?? ln.tl, end: c?.b ?? ln.tl + ln.dur, text: cd.edits[ln.id] ?? c?.text ?? ln.text, cue: Boolean(c), dropped: drop.has(ln.id), conf: confOf(c) };
    });
    for (const c of data.cues) {
      if (seen.has(c.id)) continue;
      out.push({ id: c.id, tl: c.a, end: c.b, text: cd.edits[c.id] ?? c.text, cue: true, dropped: drop.has(c.id), conf: confOf(c) });
    }
    return out.sort((a, b) => a.tl - b.tl);
  }, [data, cd, s.speechLines]);

  if (!data || !cd) {
    return (
      <EditShell id="sub" buildStep="build_text">
        <Empty>{cap.data === null ? "โหลด captions.json ไม่ได้ — เอนจินตอบไม่ได้หรือยังไม่ได้ถอดเสียง" : "กำลังโหลด…"}</Empty>
      </EditShell>
    );
  }

  const st = cd.style;
  const num = (k: string, d: number) => (Number.isFinite(Number(st[k])) ? Number(st[k]) : d);
  const setSt = (p: Record<string, unknown>) => cap.patch({ style: { ...st, ...p } });
  const mode: Mode = cd.enabled ? "line" : "off";
  const align = num("align", 2);
  const shown = lines.filter((l) => !l.dropped).length;
  const curIdx = lines.findIndex((l) => s.playhead >= l.tl && s.playhead < l.end);
  const lowConf = FEATURES.subConfidence ? lines.filter((l) => !l.dropped && l.conf !== undefined && l.conf < LOW_CONF).length : 0;
  const showConf = FEATURES.subConfidence && lines.some((l) => l.conf !== undefined);
  const lookSel = LOOKS.find((c) => c.color === String(st.color).toUpperCase() && c.outline === String(st.outline).toUpperCase())?.v ?? null;

  const toggleDrop = (id: string) => cap.patch({ drop: cd.drop.includes(id) ? cd.drop.filter((x) => x !== id) : [...cd.drop, id] });
  const setText = (id: string, text: string) => cap.patch({ edits: { ...cd.edits, [id]: text } });

  return (
    <EditShell
      id="sub"
      buildStep="build_text"
      revert={cap.revert}
      right={
        <>
          <Lbl>สไตล์ตัวอักษร</Lbl>
          <Seg
            col
            items={LOOKS.map((c) => ({ v: c.v, label: c.label, title: c.title }))}
            value={lookSel}
            onChange={(v) => {
              const c = LOOKS.find((x) => x.v === v);
              if (c) setSt({ color: c.color, outline: c.outline, bold: true, ...(v === "plate" ? { border: Math.max(num("border", 3), 4) } : {}) });
            }}
          />
          <Row label="ขนาด" style={{ paddingTop: 4 }}>
            <Stepper value={num("size", data.defaults.size)} min={10} max={200} step={2} onChange={(v) => setSt({ size: v })} title="ขนาดตัวอักษร (พิกเซลของหนัง)" />
          </Row>
          <Row label="ตำแหน่ง">
            <Pos9 value={pos9OfAlign(align)} onChange={(i) => setSt({ align: pos9Pose(i).align, pos_x: null, pos_y: null })} title="ตำแหน่งซับบนจอ 9:16" />
          </Row>
        </>
      }
    >
      <Seg<Mode>
        items={[
          { v: "line", label: "ทั้งบรรทัด", title: "เผาซับทีละบรรทัดตามบทพูด" },
          { v: "word", label: "ทีละคำ", disabled: !FEATURES.wordSub, title: FEATURES.wordSub ? "ซับทีละคำตามเวลาที่พูด" : "ยังไม่มีในเอนจิน" },
          { v: "off", label: "ปิดซับ", title: "ไม่เผาซับลงไฟล์" },
        ]}
        value={mode}
        onChange={(v) => {
          if (v === "word") return;
          cap.patch({ enabled: v !== "off" });
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
        <Lbl>
          {shown} บรรทัด{lines.length - shown ? ` · ซ่อน ${lines.length - shown}` : ""}
        </Lbl>
        <div style={{ flex: 1 }} />
        {lowConf > 0 && (
          <span className="small" style={{ color: "var(--warm)" }}>
            {lowConf} บรรทัดไม่มั่นใจ · แก้ก่อนเรนเดอร์
          </span>
        )}
      </div>
      {lines.length === 0 ? (
        <Empty>ยังไม่มีบทพูดในหนัง — ต้องถอดเสียง (listen) และตัดชิ้นก่อน บรรทัดจะมาโผล่ที่นี่</Empty>
      ) : (
        <div className="rows" style={{ display: "flex", flexDirection: "column", opacity: mode === "off" ? 0.5 : 1 }}>
          {lines.map((l, i) => {
            const warn = FEATURES.subConfidence && l.conf !== undefined && l.conf < LOW_CONF;
            return (
              <div
                key={l.id}
                className={cx(i === curIdx && "sel-ring")}
                style={{ display: "grid", gridTemplateColumns: showConf ? "40px 1fr 56px 34px" : "40px 1fr 34px", gap: 12, alignItems: "center", padding: "6px 0", opacity: l.dropped ? 0.45 : 1 }}
                title={`${l.id}${l.cue ? "" : " · เอนจินยังไม่คิด cue ให้ — บันทึกแล้วเรนเดอร์จะได้บรรทัดนี้"}`}
              >
                <span className="muted small num" style={{ cursor: "pointer" }} onClick={() => s.seek(l.tl)} title="ไปที่วินาทีนี้">
                  {dur(l.tl)}
                </span>
                <input
                  type="text"
                  className="well in"
                  style={{ fontFamily: "inherit", fontSize: 13, padding: "4px 10px", minHeight: 34, color: warn ? "var(--warm)" : undefined, textDecoration: l.dropped ? "line-through" : undefined }}
                  value={l.text}
                  disabled={l.dropped || mode === "off"}
                  onFocus={() => s.seek(l.tl)}
                  onChange={(e) => setText(l.id, e.target.value)}
                />
                {showConf && (
                  <span title={l.conf !== undefined ? `มั่นใจ ${Math.round(l.conf * 100)}%` : "ไม่มีค่าความมั่นใจ"}>
                    <Bar pct={(l.conf ?? 0) * 100} warm={warn} dim={l.conf === undefined} />
                  </span>
                )}
                {warn ? (
                  <span style={{ display: "inline-flex", justifyContent: "center" }} title="บรรทัดนี้ถอดเสียงไม่มั่นใจ — ตรวจคำก่อนเรนเดอร์">
                    <Icon name="warn" size={13} color="var(--warm)" />
                  </span>
                ) : (
                  <IcBtn name="eye" on={!l.dropped && l.cue} onClick={() => toggleDrop(l.id)} title={l.dropped ? "แสดงบรรทัดนี้อีกครั้ง" : "ซ่อนบรรทัดนี้จากซับ"} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <Well style={{ padding: "8px 12px" }}>
        <Lbl>แก้คำในช่องแล้วมีผลเฉพาะซับ ไม่แตะบทพูดต้นฉบับ · เปลี่ยนสไตล์แล้วเข้ารหัสภาพใหม่หนึ่งรอบ</Lbl>
      </Well>
    </EditShell>
  );
}
