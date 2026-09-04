"use client";

// CTL — ไทม์ไลน์เต็ม: เล่นสดตามลำดับที่จัดอยู่ · ตัวตรวจช็อต · แผง TIMELINE ด้านล่าง
//   grid 1fr 400px / 1fr 250px
//   ซ้ายบน  Player mode="timeline" (ไม่มีปุ่ม ไทม์ไลน์ ▸)
//   ขวาบน   SHOT i · TRIM · ปุ่มย้าย/ตัดเสียง/ทิ้ง · TEXT ในช็อต · ถังทิ้ง · CTA ต่อไฟล์ใหม่
//   ล่างเต็ม TL_PANEL: RULER · TEXT/STICKER/SHAPE/CAPTION · SHOTS · SPEECH · MUSIC (+บีต)
// (port จาก vcut-ui/components/Timeline.tsx + Properties.tsx — เหลือเฉพาะเรื่อง edl.json)

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import TopBar from "@/components/frames/TopBar";
import { Btn, Cta, Empty, Fld, Keys, Knob, Kv, Led, Mono, NIn, Panel, Stat, Tag, Well, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import type { LayerKind } from "@/lib/layers";
import { dur, rulerStep } from "@/lib/time";
import Player from "./Player";
import { useStudio } from "./store";

const LABEL_W = 120;
const PAD = 8; // ระยะขอบซ้ายในกล่องเลื่อน — ให้หัวเล่นที่ 0 ไม่ชิดขอบ

type Row = { k: string; label: string; h: number; kind?: LayerKind; a?: boolean };
// ความสูงรวมต้องพอดีแถว 250px ของ grid (หัว 26 + 8 แถว + ช่องว่าง) — เกินแล้วเลน MUSIC หาย
const ROW_GAP = 3;
const ROWS: Row[] = [
  { k: "ruler", label: "", h: 18 },
  { k: "text", label: "TEXT ⑤", h: 18, kind: "text", a: true },
  { k: "sticker", label: "STICKER", h: 18, kind: "sticker", a: true },
  { k: "shape", label: "SHAPE", h: 18, kind: "shape", a: true },
  { k: "caption", label: "CAPTION", h: 14, kind: "caption" },
  { k: "shots", label: "SHOTS", h: 44 },
  { k: "speech", label: "SPEECH", h: 14, kind: "speech" },
  { k: "music", label: "MUSIC", h: 18, kind: "music" },
];

export default function TimelinePage() {
  const eng = useEngine();
  const rt = useRoute();
  const s = useStudio();
  const running = Boolean(eng.job?.running);
  const shot = s.sel != null ? (s.shots[s.sel] ?? null) : null;
  const fxCount = s.fx.draft ? s.fx.draft.texts.length + s.fx.draft.overlays.length + s.fx.draft.shapes.length + s.fx.draft.music.length : 0;
  const [edge, setEdge] = useState<"in" | "out">("out");

  // จำนวนที่แก้ไปจาก edl.json — เทียบด้วย "ตัวตน" ของช็อต (คลิป+ช่วง+ชนิด) ไม่ใช่ตำแหน่ง
  // ไม่งั้นเอาช็อตที่ 3 ออกหนึ่งตัว ทุกตัวหลังจากนั้นเลื่อนหมดแล้วนับเป็นแก้ 200 ที่
  //   เล็ม = หายหนึ่ง+เพิ่มหนึ่ง → นับ 1 · ทิ้ง/เพิ่ม → 1 · สลับที่อย่างเดียว → 1
  const edlMod = useMemo(() => {
    const base = eng.proj?.timeline ?? [];
    const key = (x: { name: string; start: number; end: number; kind: string }) => `${x.name}|${x.start}|${x.end}|${x.kind}`;
    const left = new Map<string, number>();
    for (const x of base) left.set(key(x), (left.get(key(x)) ?? 0) + 1);
    let added = 0;
    for (const x of s.shots) {
      const k = key(x);
      const c = left.get(k) ?? 0;
      if (c > 0) left.set(k, c - 1);
      else added++;
    }
    let removed = 0;
    for (const c of left.values()) removed += c;
    const n = Math.max(added, removed);
    if (n > 0) return n;
    return base.some((x, i) => key(x) !== key(s.shots[i] ?? x)) ? 1 : 0;
  }, [eng.proj, s.shots]);

  const eta = s.rebuild.eta.edl;
  const shotFx = s.sel != null ? s.fxOfShot(s.sel) : null;

  const nudgeEdge = (d: number) => {
    if (s.sel == null || !shot) return;
    if (edge === "in") s.patchShot(s.sel, { start: Math.max(0, Math.min(shot.start + d, shot.end - 0.3)) });
    else s.patchShot(s.sel, { end: Math.min(shot.clip_dur, Math.max(shot.end + d, shot.start + 0.3)) });
  };

  const assemble = async () => {
    if (running) return;
    if (s.dirty) await s.saveEdl();
    await eng.runJob("build");
  };

  const shotIdx = s.playheadAt?.i ?? -1;
  const live = `LIVE · ${s.dirty ? "ตามลำดับที่จัดอยู่ (ยังไม่บันทึก)" : "ตามที่บันทึกไว้"}${shotIdx >= 0 ? ` · SHOT ${shotIdx + 1}/${s.shots.length} · ${s.shots[shotIdx].kind}` : ""}`;

  return (
    <>
      <TopBar
        left={
          <>
            <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              VAR <span style={{ color: "var(--amber)" }}>{s.variant.id}</span> · EDL {s.shots.length} · FX {fxCount}
            </Well>
            <Btn sm onClick={s.undo} disabled={!s.canUndo} title="ย้อนกลับ (Cmd+Z)">↶</Btn>
            <Btn sm onClick={s.redo} disabled={!s.canRedo} title="ทำซ้ำ (Cmd+Shift+Z)">↷</Btn>
            <Btn sm on={s.dirty} onClick={s.saveEdl} disabled={!s.dirty || s.saving} title="เขียน edl.json (ของเดิมสำรองไว้ที่ edl.prev.json)">
              SAVE EDL
            </Btn>
            <Btn sm on={s.fx.dirty} onClick={s.fx.save} disabled={!s.fx.dirty || s.fx.saving} title="เขียน fx.json">
              SAVE FX
            </Btn>
          </>
        }
        right={
          <>
            <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: s.dirty ? "var(--amber)" : "var(--muted)", whiteSpace: "nowrap" }}>
              EDL MOD {edlMod} · ต่อไฟล์ใหม่ ~{eta} s
            </Well>
            <Btn on onClick={() => rt.openEdit(null)}>◀ กลับ 03</Btn>
          </>
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gridTemplateRows: "minmax(0,1fr) 250px", gap: 10, padding: 10, minHeight: 0 }}>
        <Panel style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", minHeight: 0 }}>
          <Player mode="timeline" topleft={live} showTimelineBtn={false} showLanes={false} />
        </Panel>

        {/* ── ตัวตรวจช็อต ── */}
        <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
          {!shot || s.sel == null ? (
            <>
              <div className="h">
                <Tag>SHOT · —</Tag>
                <span className="t" style={{ fontSize: 14 }}>ยังไม่ได้เลือกช็อต</span>
              </div>
              <Empty>คลิกช็อตในแถบ SHOTS ด้านล่าง เพื่อเล็ม · ย้าย · ตัดเสียง · ทิ้ง</Empty>
              <div style={{ flex: 1 }} />
              <TrashWell />
              <Kv style={{ fontSize: 10.5, lineHeight: "15px" }}>เอฟเฟกต์รายช็อต (ซูม/โทน/ความเร็ว) แก้ที่ชั้น “เอฟเฟกต์รายช็อต” · ที่นี่คือ edl.json อย่างเดียว</Kv>
              <Cta sm onClick={assemble} disabled={running || !s.shots.length} busy={running} title="บันทึก EDL แล้วสั่ง build (render ชิ้นใหม่ + assemble)">
                ต่อไฟล์ใหม่ · assemble · ~{eta} s
              </Cta>
            </>
          ) : (
            <>
              <div className="h">
                <Tag>SHOT {s.sel + 1} · {shot.kind}</Tag>
                <span className="t" style={{ fontSize: 14 }}>
                  {dur(s.offsets[s.sel])}–{dur(s.offsets[s.sel] + shot.dur)} · {shot.dur.toFixed(1)} s
                </span>
                <div style={{ flex: 1 }} />
                <Kv className="mono" style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }} title={shot.name}>
                  {shot.kind[0]}{String(s.sel + 1).padStart(2, "0")} · {shot.name}
                </Kv>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <Tag>TRIM · เล็มหัว-ท้าย (วินาทีของคลิปต้นฉบับ · คลิปยาว {shot.clip_dur.toFixed(1)} s)</Tag>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Fld label="เริ่ม (วิ)" chg={shot.start !== (eng.proj?.timeline[s.sel]?.start ?? shot.start)}>
                      <NIn value={Math.round(shot.start * 100) / 100} step={0.1} min={0} max={shot.end - 0.3} onChange={(v) => s.patchShot(s.sel!, { start: Math.max(0, Math.min(v, shot.end - 0.3)) })} />
                    </Fld>
                    <Fld label="จบ (วิ)" chg={shot.end !== (eng.proj?.timeline[s.sel]?.end ?? shot.end)}>
                      <NIn value={Math.round(shot.end * 100) / 100} step={0.1} min={shot.start + 0.3} max={shot.clip_dur} onChange={(v) => s.patchShot(s.sel!, { end: Math.min(shot.clip_dur, Math.max(v, shot.start + 0.3)) })} />
                    </Fld>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <Keys items={[{ v: "in" as const, label: "หัว" }, { v: "out" as const, label: "ท้าย" }]} value={edge} onChange={setEdge} wrap={false} />
                    <Btn sm onClick={() => nudgeEdge(-0.5)}>−0.5</Btn>
                    <Btn sm onClick={() => nudgeEdge(-0.1)}>−0.1</Btn>
                    <Btn sm onClick={() => nudgeEdge(0.1)}>+0.1</Btn>
                    <Btn sm onClick={() => nudgeEdge(0.5)}>+0.5</Btn>
                    <div style={{ flex: 1 }} />
                    <Btn sm onClick={() => s.split()} title="ซอยช็อตตรงหัวเล่นเป็นสองชิ้น (S)">ตัดตรงหัวเล่น</Btn>
                  </div>
                </Well>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Btn sm on onClick={() => s.play(s.offsets[s.sel!])}>▶ เล่นจากช็อตนี้</Btn>
                  <Btn sm disabled={s.sel === 0} onClick={() => s.reorder(s.sel!, s.sel! - 1)}>◀ ย้ายซ้าย</Btn>
                  <Btn sm disabled={s.sel >= s.shots.length - 1} onClick={() => s.reorder(s.sel!, s.sel! + 1)}>ย้ายขวา ▶</Btn>
                  <Btn
                    sm
                    on={Boolean(shotFx?.mute)}
                    disabled={!shotFx}
                    onClick={() => shotFx && s.setShotFx(s.sel!, { mute: !shotFx.mute })}
                    title={shotFx ? "ตัดเสียงของชิ้นนี้ (fx.json → ต้อง SAVE FX)" : "ยังตั้งไม่ได้ — ชิ้นนี้ยังไม่ถูกตัด (ไม่มีกุญแจเอฟเฟกต์)"}
                  >
                    ตัดเสียง
                  </Btn>
                  <Btn sm danger onClick={() => s.removeShot(s.sel!)} title="เอาออกจากไทม์ไลน์ (กู้ได้จากถังทิ้ง · Delete)">→ ถังทิ้ง</Btn>
                </div>
                <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <Tag>TEXT ในช็อตนี้</Tag>
                  <Stat label="บทพูด" value={shot.text ? `“${shot.text}”` : "—"} />
                  <Stat
                    label="SCORE"
                    value={`${shot.ai_score != null ? shot.ai_score.toFixed(2) : "—"} · BRIGHT ${shot.bright != null ? (shot.bright / 255).toFixed(2) : "—"} · MOTION ${shot.motion != null ? shot.motion.toFixed(1) : "—"}`}
                  />
                  {!shot.seg && <Stat label="SEG" value="ยังไม่มีไฟล์ตัด — จะตัดตอนต่อไฟล์ใหม่" warn />}
                </Well>
                <TrashWell />
              </div>
              <Kv style={{ fontSize: 10.5, lineHeight: "15px" }}>เอฟเฟกต์รายช็อต (ซูม/โทน/ความเร็ว) แก้ที่ชั้น “เอฟเฟกต์รายช็อต” · ที่นี่คือ edl.json อย่างเดียว</Kv>
              <Cta sm onClick={assemble} disabled={running || !s.shots.length} busy={running} title="บันทึก EDL แล้วสั่ง build (render ชิ้นใหม่ + assemble)">
                ต่อไฟล์ใหม่ · assemble · ~{eta} s
              </Cta>
            </>
          )}
        </Panel>

        <TlPanel />
      </div>
    </>
  );
}

function TrashWell() {
  const s = useStudio();
  return (
    <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <Tag>ถังทิ้ง · {s.trash.length}</Tag>
      {s.trash.length === 0 ? (
        <Kv style={{ fontSize: 10.5 }}>ยังไม่มีช็อตที่เอาออกในรอบนี้</Kv>
      ) : (
        s.trash.slice(0, 8).map((t, k) => (
          <div key={`${t.shot.name}-${t.at}-${k}`} className="stat">
            <span>
              {t.shot.kind[0]}{String(t.at + 1).padStart(2, "0")} · {t.shot.name} · {t.shot.dur.toFixed(1)} s
            </span>
            <Btn sm onClick={() => s.restoreTrash(k)} title="กู้กลับไปตำแหน่งเดิม">กู้</Btn>
          </div>
        ))
      )}
    </Well>
  );
}

// ─────────────────────────── TL_PANEL ───────────────────────────

function TlPanel() {
  const s = useStudio();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxPerSec, setPxPerSec] = useState(0); // 0 = ยังไม่ได้วัดกล่อง → พอดีทั้งเรื่อง
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const upd = () => setBoxW(el.clientWidth);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitPx = s.total > 0 && boxW > 0 ? Math.min(120, Math.max(0.5, (boxW - PAD * 2) / s.total)) : 10;
  const px = pxPerSec || fitPx;
  const width = Math.max(s.total * px + PAD * 2, boxW);

  // ซูมโดยยึดหัวเล่นเป็นจุดหมุน — เนื้อหาใต้หัวเล่นไม่ไหลหนี
  const prevPx = useRef(px);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const old = prevPx.current;
    if (!el || old === px) return;
    prevPx.current = px;
    const screenX = PAD + s.playhead * old - el.scrollLeft;
    const anchorX = screenX >= 0 && screenX <= el.clientWidth ? screenX : el.clientWidth / 2;
    el.scrollLeft = Math.max(0, PAD + s.playhead * px - anchorX);
  }, [px, s.playhead]);

  const step = rulerStep(px);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= s.total + 1e-6; t += step) out.push(t);
    return out;
  }, [s.total, step]);

  /** เส้นจังหวะ — ซูมออกวาดทุกกี่จังหวะ (ข้ามทีละเท่าตัว ระยะห่างยังเท่ากัน) */
  const beatTicks = useMemo(() => {
    const g = s.showBeats ? s.beats?.grid : undefined;
    if (!g || g.length < 2) return [];
    const gap = (g[g.length - 1] - g[0]) / (g.length - 1);
    let stride = 1;
    while (gap * stride * px < 6 && stride < 64) stride *= 2;
    const out: number[] = [];
    for (let i = 0; i < g.length; i += stride) {
      if (g[i] > s.total) break;
      out.push(g[i] * px);
    }
    return out;
  }, [s.beats, s.showBeats, px, s.total]);

  const timeFromX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rr = el.getBoundingClientRect();
    return Math.max(0, Math.min(s.total, (clientX - rr.left + el.scrollLeft - PAD) / px));
  };
  const scrubStart = (e: React.MouseEvent) => {
    s.seek(timeFromX(e.clientX));
    const move = (ev: MouseEvent) => s.seek(timeFromX(ev.clientX));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onDropShot = (e: DragEvent, i: number) => {
    if (dragFrom == null) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragFrom !== i) s.reorder(dragFrom, i);
    setDragFrom(null);
    setDragOver(null);
  };

  const snap = async () => {
    await s.snapToBeats();
  };

  return (
    <Panel style={{ gridColumn: "1 / span 2", display: "flex", flexDirection: "column", gap: 6, padding: "8px 14px", overflow: "hidden", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Tag>TIMELINE · {s.variant.id}</Tag>
        <Kv className="mono" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
          {s.shots.length} SHOTS · {dur(s.total)} · TRASH {s.trash.length} · {s.rendered.length === s.shots.length ? "LIVE PREVIEW" : `${s.shots.length - s.rendered.length} ต้องตัดใหม่`}
        </Kv>
        <div style={{ flex: 1 }} />
        <Btn sm disabled={!s.trash.length} onClick={() => s.restoreTrash(0)} title="กู้ช็อตที่เพิ่งทิ้งล่าสุด">
          ถังทิ้ง {s.trash.length}
        </Btn>
        <Btn sm disabled={s.sel == null || s.sel === 0} onClick={() => s.sel != null && s.reorder(s.sel, s.sel - 1)} title="สลับช็อตที่เลือกกับตัวก่อนหน้า">◀ ลำดับ</Btn>
        <Btn sm disabled={s.sel == null || s.sel >= s.shots.length - 1} onClick={() => s.sel != null && s.reorder(s.sel, s.sel + 1)} title="สลับช็อตที่เลือกกับตัวถัดไป">ลำดับ ▶</Btn>
        <Btn sm onClick={() => s.split()} title="ซอยช็อตตรงหัวเล่น (S)">ตัดตรงนี้</Btn>
        <Btn sm on={s.showBeats} onClick={snap} disabled={s.beatBusy} title="ดูดรอยตัดทุกจุดเข้าหาจังหวะเพลง (เอนจินคำนวณ · ย้อนกลับได้)">ดูดเข้าบีต</Btn>
        <Btn sm onClick={s.undo} disabled={!s.canUndo} title="ย้อนกลับ (Cmd+Z)">↶</Btn>
        <Tag>ZOOM</Tag>
        <Knob value={px} min={0.5} max={120} step={0.5} def={fitPx} size="sm" onChange={setPxPerSec} title="ลากขึ้นซูมเข้า · ดับเบิลคลิก = พอดีทั้งเรื่อง" />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
        {/* ป้ายเลน */}
        <div style={{ width: LABEL_W, flexShrink: 0, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
          {ROWS.map((row) => (
            <div key={row.k} style={{ height: row.h, display: "flex", alignItems: "center", gap: 8 }}>
              {row.k !== "ruler" && (
                <>
                  <Led on={row.k === "shots" ? true : row.kind ? s.layers[row.kind].length > 0 : false} />
                  <Tag>{row.k === "music" && s.showBeats && s.beats ? `MUSIC · ${s.beats.grid.length} BEATS` : row.label}</Tag>
                </>
              )}
            </div>
          ))}
        </div>
        {/* พื้นที่เลื่อน */}
        <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden", position: "relative" }}>
          <div style={{ width, position: "relative", display: "flex", flexDirection: "column", gap: ROW_GAP }}>
            {ROWS.map((row) => {
              if (row.k === "ruler") {
                return (
                  <div key={row.k} style={{ height: row.h, position: "relative", cursor: "pointer" }} onMouseDown={scrubStart} title="คลิก/ลากเพื่อเลื่อนหัวเล่น">
                    {ticks.map((t) => (
                      <span key={t} style={{ position: "absolute", left: PAD + t * px, top: 0 }}>
                        <span style={{ position: "absolute", left: 0, top: 0, height: 6, width: 1, background: "var(--faint)" }} />
                        <Mono style={{ position: "absolute", left: 3, top: 5, fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>{dur(t)}</Mono>
                      </span>
                    ))}
                  </div>
                );
              }
              if (row.k === "shots") {
                return (
                  <div
                    key={row.k}
                    style={{ height: row.h, position: "relative" }}
                    onMouseDown={(e) => {
                      if (e.target === e.currentTarget) scrubStart(e);
                    }}
                  >
                    {s.shots.map((sh, i) => {
                      const left = PAD + s.offsets[i] * px;
                      const w = Math.max(sh.dur * px - 2, 6);
                      const isSel = s.sel === i;
                      return (
                        <div
                          key={`${sh.name}-${i}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/x-shot", String(i));
                            setDragFrom(i);
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          onDragOver={(e) => {
                            if (dragFrom == null) return;
                            e.preventDefault();
                            setDragOver(i);
                          }}
                          onDrop={(e) => onDropShot(e, i)}
                          onClick={(e) => {
                            e.stopPropagation();
                            s.setSel(i);
                            s.setFocus(null);
                            s.seek(timeFromX(e.clientX));
                          }}
                          title={`${sh.name} · ${sh.start.toFixed(1)}–${sh.end.toFixed(1)} s${sh.seg ? "" : " · ยังไม่มีไฟล์ตัด"}\nคลิก = เลือก + เลื่อนหัวเล่น · ลาก = สลับลำดับ`}
                          className={cx("well", isSel && "sel", !sh.seg && "needs-render")}
                          style={{
                            position: "absolute",
                            left,
                            top: 0,
                            width: w,
                            height: row.h,
                            background: sh.kind === "TALK" ? "var(--talk)" : "var(--broll)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            overflow: "hidden",
                            cursor: "grab",
                            outline: dragOver === i && dragFrom !== i ? "2px solid var(--amber)" : undefined,
                            zIndex: isSel ? 2 : 1,
                          }}
                        >
                          {w > 30 && (
                            <span className="strip">
                              <span style={{ color: isSel ? "var(--amber)" : "var(--ink)" }}>{sh.kind}</span>
                            </span>
                          )}
                          {w > 46 && (
                            <Mono style={{ fontSize: 10, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {sh.name} · {sh.dur.toFixed(1)}s
                            </Mono>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              const kind = row.kind as LayerKind;
              const blocks = s.layers[kind];
              const focused = s.focus?.kind === kind;
              return (
                <div key={row.k} style={{ height: row.h, display: "flex", alignItems: "center" }}>
                  <div style={{ position: "relative", height: 12, width: "100%", background: "var(--well)", borderRadius: 2 }}>
                    {row.k === "music" &&
                      beatTicks.map((x, i) => <span key={i} style={{ position: "absolute", left: PAD + x, top: -2, width: 1, height: 16, background: "var(--amber)", opacity: 0.45 }} />)}
                    {blocks.map((b) => (
                      <span
                        key={`${kind}${b.idx}-${b.tl.toFixed(2)}`}
                        className={cx("blk", row.a && "a", focused && s.focus?.idx === b.idx && "on")}
                        style={{ left: PAD + b.tl * px, width: Math.max(b.dur * px, 3), opacity: b.orphan ? 0.35 : undefined, cursor: b.idx >= 0 ? "pointer" : "default" }}
                        title={`${b.label}${b.orphan ? " · ช่วงนี้ถูกตัดออกไปแล้ว" : ""}`}
                        onClick={() => {
                          if (b.idx >= 0) {
                            s.setFocus({ kind, idx: b.idx });
                            s.setSel(null);
                          }
                          s.seek(b.tl);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* หัวเล่น — พาดทุกเลน */}
            <div style={{ position: "absolute", left: PAD + s.playhead * px - 1, top: 0, bottom: 0, width: 2, background: "var(--amber)", boxShadow: "0 0 6px var(--amber)", pointerEvents: "none", zIndex: 5 }} />
          </div>
        </div>
      </div>
    </Panel>
  );
}
