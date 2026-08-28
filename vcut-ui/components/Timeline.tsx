"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Copy,
  Eye,
  EyeOff,
  Magnet,
  Mic,
  Music,
  Redo2,
  Scissors,
  Shapes,
  Smile,
  Trash2,
  Type,
  Undo2,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { thumbUrl, type Shot } from "@/lib/api";
import {
  assignRows,
  DND_MIME,
  MAX_AUDIO_STACK,
  type LayerBlock,
  type LayerKind,
} from "@/lib/layers";
import { dur, rulerStep } from "@/lib/time";
import type { BeatData } from "@/lib/api";

const CHAPTER_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#14b8a6",
];

// ลำดับบน→ล่างตามภาพ OpenCut: เอฟเฟกต์อยู่เหนือวิดีโอ เสียงอยู่ใต้
const LANES: {
  kind: LayerKind;
  label: string;
  icon: typeof Type;
  h: number;
  color: string;
  readonly?: boolean;
}[] = [
  { kind: "text", label: "ข้อความ (ขั้น 5)", icon: Type, h: 26, color: "#10b981" },
  { kind: "sticker", label: "สติกเกอร์/ภาพซ้อน", icon: Smile, h: 26, color: "#ec4899" },
  { kind: "shape", label: "รูปทรง (ลูกศร/แถบ/จุด)", icon: Shapes, h: 26, color: "#f97316" },
  { kind: "caption", label: "ซับอัตโนมัติ", icon: Captions, h: 20, color: "#64748b", readonly: true },
];
const LANES_BELOW: typeof LANES = [
  { kind: "speech", label: "เสียงพูดในคลิป", icon: Mic, h: 20, color: "#14b8a6", readonly: true },
  { kind: "music", label: "เพลง", icon: Music, h: 30, color: "#8b5cf6" },
];

/** คลื่นเสียงของแทร็กเพลง วาดเป็นพื้นหลังของบล็อก
 *
 *  ค่าที่ได้มาเป็นของ *ไฟล์* ส่วนบล็อกเป็นช่วงบน *ไทม์ไลน์* — แทร็กที่วนซ้ำจึง
 *  ต้องพับเวลากลับด้วย % ทุกจุด ไม่งั้นเพลงลูป 20 วิที่ยืดยาว 3 นาทีจะได้คลื่น
 *  แค่ช่วงต้นแล้วเหลือพื้นที่ว่างยาว ๆ ทั้งที่เสียงยังเล่นอยู่
 */
function Wave({
  peaks, hz, fileDur, loop, dur, w, h,
}: {
  peaks: number[];
  hz: number;
  fileDur: number;
  loop: boolean;
  dur: number;
  w: number;
  h: number;
}) {
  if (!peaks.length || w < 4 || fileDur <= 0) return null;
  // หนึ่งแท่งต่อพิกเซล — มากกว่านั้นตาไม่เห็น และ DOM บวมฟรี
  const cols = Math.min(Math.floor(w), 1200);
  const pts: string[] = [];
  for (let i = 0; i < cols; i++) {
    const t = (i / cols) * dur;
    const ft = loop ? t % fileDur : t;
    const v = ft <= fileDur ? (peaks[Math.floor(ft * hz)] ?? 0) : 0;
    pts.push(`${(i / cols) * w},${h / 2 - (v / 100) * (h / 2 - 1)}`);
  }
  for (let i = cols - 1; i >= 0; i--) {
    const t = (i / cols) * dur;
    const ft = loop ? t % fileDur : t;
    const v = ft <= fileDur ? (peaks[Math.floor(ft * hz)] ?? 0) : 0;
    pts.push(`${(i / cols) * w},${h / 2 + (v / 100) * (h / 2 - 1)}`);
  }
  return (
    <svg
      width={w}
      height={h}
      className="pointer-events-none absolute inset-0"
      preserveAspectRatio="none"
    >
      <polygon points={pts.join(" ")} fill="rgba(255,255,255,0.42)" />
    </svg>
  );
}

function Block({
  b,
  pxPerSec,
  color,
  readonly,
  selected,
  top,
  height,
  wave,
  onSelect,
  onChange,
  onRemove,
}: {
  b: LayerBlock;
  pxPerSec: number;
  color: string;
  readonly?: boolean;
  selected: boolean;
  top: number;
  height: number;
  /** คลื่นเสียงของแทร็กนี้ — มีเฉพาะเลนเพลงตอนเปิดโหมดจังหวะ */
  wave?: { peaks: number[]; hz: number; fileDur: number; loop: boolean };
  onSelect: () => void;
  onChange: (tl: number, dur: number, mode: "move" | "resize") => void;
  onRemove: () => void;
}) {
  // ghost ระหว่างลาก — commit ตอนปล่อยเท่านั้น จะได้ไม่ยิง state ถี่ ๆ
  const [ghost, setGhost] = useState<{ tl: number; dur: number } | null>(null);
  const drag = useRef<{
    x0: number;
    tl0: number;
    dur0: number;
    mode: "move" | "resize-r" | "resize-l";
  } | null>(null);

  const start = (e: React.PointerEvent, mode: "move" | "resize-r" | "resize-l") => {
    if (readonly) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer จำลอง (ทดสอบ) ไม่มี capture ได้ — ลากต่อได้อยู่ดี */
    }
    drag.current = { x0: e.clientX, tl0: b.tl, dur0: b.dur, mode };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / pxPerSec;
    if (d.mode === "move") {
      setGhost({ tl: Math.max(0, d.tl0 + dx), dur: d.dur0 });
    } else if (d.mode === "resize-r") {
      setGhost({ tl: d.tl0, dur: Math.max(0.2, d.dur0 + dx) });
    } else {
      // ขอบซ้าย: เลื่อนจุดเริ่มโดยตรึงจุดจบ
      const tl = Math.min(Math.max(0, d.tl0 + dx), d.tl0 + d.dur0 - 0.2);
      setGhost({ tl, dur: d.tl0 + d.dur0 - tl });
    }
  };
  const end = () => {
    if (drag.current && ghost) {
      const moved =
        Math.abs(ghost.tl - drag.current.tl0) > 0.02 ||
        Math.abs(ghost.dur - drag.current.dur0) > 0.02;
      if (moved) {
        onChange(
          ghost.tl,
          ghost.dur,
          drag.current.mode === "move" ? "move" : "resize",
        );
      }
    }
    drag.current = null;
    setGhost(null);
  };

  const tl = ghost?.tl ?? b.tl;
  const w = Math.max((ghost?.dur ?? b.dur) * pxPerSec, 6);
  return (
    <div
      onPointerDown={(e) => start(e, "move")}
      onPointerMove={move}
      onPointerUp={end}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!readonly) onRemove();
      }}
      title={`${b.label}${b.orphan ? " · ช่วงนี้ถูกตัดออกไปแล้ว!" : ""}${readonly ? "" : "\nลาก=ย้าย · ขอบซ้าย/ขวา=ยืดหด · ดับเบิลคลิก=ลบ"}`}
      className={`absolute flex items-center overflow-hidden rounded-md border text-[10px] leading-none text-white ${
        readonly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${selected ? "z-20 ring-2 ring-white/80" : ""} ${ghost ? "z-30 opacity-80" : ""}`}
      style={{
        left: 8 + tl * pxPerSec,
        width: w,
        top,
        height,
        background: b.orphan ? "#7f1d1d" : color + (readonly ? "55" : "cc"),
        borderColor: b.orphan ? "#ef4444" : color,
      }}
    >
      {!readonly && (
        <div
          onPointerDown={(e) => start(e, "resize-l")}
          onPointerMove={move}
          onPointerUp={end}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/25 hover:bg-white/60"
        />
      )}
      {wave && (
        <Wave
          {...wave}
          dur={ghost?.dur ?? b.dur}
          w={w}
          h={height}
        />
      )}
      <span className="relative truncate px-2">{b.label}</span>
      {!readonly && (
        <div
          onPointerDown={(e) => start(e, "resize-r")}
          onPointerMove={move}
          onPointerUp={end}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/25 hover:bg-white/60"
        />
      )}
    </div>
  );
}

export default function Timeline({
  shots,
  offsets,
  total,
  selected,
  playhead,
  pxPerSec,
  onZoom,
  onSelect,
  onSeek,
  onReorder,
  onRemove,
  onSplit,
  onDuplicate,
  layers,
  vis,
  onVis,
  layerSel,
  onLayerSelect,
  onLayerChange,
  onLayerRemove,
  onDropPayload,
  beats,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  shots: Shot[];
  offsets: number[];
  total: number;
  selected: number | null;
  playhead: number;
  pxPerSec: number;
  onZoom: (px: number) => void;
  onSelect: (i: number | null) => void;
  onSeek: (t: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (i: number) => void;
  onSplit: () => void;
  onDuplicate: (i: number) => void;
  layers: Record<LayerKind, LayerBlock[]>;
  vis: Record<LayerKind, boolean>;
  onVis: (k: LayerKind) => void;
  layerSel: { kind: LayerKind; idx: number } | null;
  onLayerSelect: (kind: LayerKind, idx: number) => void;
  onLayerChange: (
    kind: LayerKind,
    idx: number,
    tl: number,
    dur: number,
    mode: "move" | "resize",
  ) => void;
  onLayerRemove: (kind: LayerKind, idx: number) => void;
  onDropPayload: (payload: unknown, tl: number) => void;
  /** จังหวะเพลงที่เอนจินอ่านมา · null = ปิดโหมดจังหวะ หรือยังไม่ได้กดอ่าน */
  beats: BeatData | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<number | null>(null);

  // ── ซูมโดยยึดเส้นหัวเล่น (สีแดง) เป็นจุดหมุน ──
  //
  // เปลี่ยน pxPerSec เฉย ๆ จะทำให้เนื้อหาใต้จอไหล — จุดที่กำลังดูหลุดไปที่อื่น
  // ทางแก้: จำไว้ว่าหัวเล่นอยู่ตรงไหนของ viewport ก่อนซูม แล้วชดเชย scrollLeft
  // ให้มันกลับไปอยู่ตำแหน่งเดิมบนจอ  ถ้าหัวเล่นอยู่นอกจอ ให้ดึงมากลางจอแทน
  // ทำที่นี่ที่เดียวครอบทุกทางซูม (ปุ่ม · แถบเลื่อน · คีย์ - = 0) เพราะทุกทาง
  // จบที่ pxPerSec ตัวเดียวกัน
  const phRef = useRef(playhead);
  phRef.current = playhead;
  const prevPx = useRef(pxPerSec);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const oldPx = prevPx.current;
    if (!el || oldPx === pxPerSec) return;
    prevPx.current = pxPerSec;
    const screenX = 8 + phRef.current * oldPx - el.scrollLeft;
    const anchor =
      screenX >= 0 && screenX <= el.clientWidth ? screenX : el.clientWidth / 2;
    el.scrollLeft = Math.max(0, 8 + phRef.current * pxPerSec - anchor);
  }, [pxPerSec]);

  const width = Math.max(total * pxPerSec + 120, 600);
  const step = rulerStep(pxPerSec);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= total + step; t += step) out.push(t);
    return out;
  }, [total, step]);

  const chapterColor = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    for (const s of shots) {
      if (s.chapter && !m.has(s.chapter)) {
        m.set(s.chapter, CHAPTER_COLORS[i++ % CHAPTER_COLORS.length]);
      }
    }
    return m;
  }, [shots]);

  const timeFromClientX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - 8;
    return Math.max(0, Math.min(total, x / pxPerSec));
  };

  const lanesAbove = LANES.filter((l) => vis[l.kind]);
  const lanesBelow = LANES_BELOW.filter((l) => vis[l.kind]);

  // ข้อความ/สติกเกอร์ซ้อนกันได้ (สูงสุด 5) · เพลง/เสียงเอฟเฟกต์ 6 —
  // ชิ้นที่ทับเวลากันแยกแถวให้อัตโนมัติ
  const ROW_H = 24;
  const stack = useMemo(() => {
    const out = new Map<LayerKind, { rowOf: Map<number, number>; rows: number }>();
    for (const k of ["text", "sticker", "shape"] as LayerKind[]) {
      const { row, rows } = assignRows(layers[k]);
      out.set(k, { rowOf: row, rows });
    }
    const m = assignRows(layers.music, MAX_AUDIO_STACK);
    out.set("music", { rowOf: m.row, rows: m.rows });
    return out;
  }, [layers]);

  const laneHeight = (l: (typeof LANES)[number]) => {
    const st = stack.get(l.kind);
    return st ? st.rows * ROW_H + 4 : l.h;
  };

  /**
   *  ตำแหน่งเส้นจังหวะเป็นพิกเซล — ตอนซูมออกวาดทุกกี่จังหวะแทนที่จะวาดทุกจังหวะ
   *
   *  หนังสิบนาทีที่ 144 BPM มี 1,440 จังหวะ ห่างกัน 1.2 พิกเซลตอนซูมออกสุด
   *  วาดครบทุกเส้นแล้วได้แถบทึบที่อ่านอะไรไม่ได้ และ div พันกว่าอันทำให้เลื่อน
   *  ไทม์ไลน์หนืด
   *
   *  **บางด้วยการข้ามทีละเท่าตัว (ทุก 2 · 4 · 8 จังหวะ) ไม่ใช่ข้ามตัวที่ใกล้กัน**
   *  วิธีหลังทำให้ระยะห่างของเส้นไม่เท่ากัน ซึ่งผิดความหมายของคำว่า "กริดจังหวะ"
   *  ทันที — คนดูจะอ่านว่าเพลงจังหวะไม่สม่ำเสมอ  ข้ามทีละเท่าตัวได้เส้นห่างเท่ากัน
   *  และยังเป็นตำแหน่งที่มีความหมายทางดนตรี (ทุก 4 จังหวะ = ทุกห้องเพลง)
   */
  const beatTicks = useMemo(() => {
    const g = beats?.grid;
    if (!g || g.length < 2) return [];
    const gap = (g[g.length - 1] - g[0]) / (g.length - 1);
    let stride = 1;
    while (gap * stride * pxPerSec < 6 && stride < 64) stride *= 2;
    // ตัดเส้นที่เลยท้ายเรื่องทิ้ง — ความยาวที่เอนจินใช้คำนวณกริดมาจาก render.json
    // ส่วนความยาวบนจอนี้มาจากไทม์ไลน์ที่กำลังแก้อยู่ สองอย่างต่างกันได้เสมอ
    // (เพิ่งลากช็อตออกแล้วยังไม่กดสร้างไฟล์) แล้วจะเหลือเส้นลอยพ้นขอบหนัง
    const out: number[] = [];
    for (let i = 0; i < g.length; i += stride) {
      if (g[i] > total) break;
      out.push(g[i] * pxPerSec);
    }
    return out;
  }, [beats, pxPerSec, total]);

  // แทร็กเพลงที่รู้คลื่นเสียงแล้ว — คีย์ด้วยลำดับบล็อกในเลนเพลง ซึ่งตรงกับลำดับ
  // ใน fx.music ที่เอนจินส่งกลับมา (musicBlocks ใช้ idx ตัวเดียวกัน)
  const waveOf = useMemo(() => {
    const m = new Map<number, { peaks: number[]; hz: number; fileDur: number;
                                loop: boolean }>();
    (beats?.tracks ?? []).forEach((t, i) => {
      if (t.peaks.length) {
        m.set(i, { peaks: t.peaks, hz: t.peak_hz, fileDur: t.file_dur,
                   loop: t.loop });
      }
    });
    return m;
  }, [beats]);

  const laneRow = (l: (typeof LANES)[number]) => {
    const st = stack.get(l.kind);
    const h = laneHeight(l);
    return (
      <div
        key={l.kind}
        className="relative border-b border-line/60"
        style={{ height: h }}
      >
        {layers[l.kind].map((b) => {
          const row = st?.rowOf.get(b.idx) ?? 0;
          return (
            <Block
              key={`${l.kind}${b.idx}-${b.tl.toFixed(2)}`}
              b={b}
              pxPerSec={pxPerSec}
              color={l.color}
              readonly={l.readonly}
              selected={layerSel?.kind === l.kind && layerSel.idx === b.idx}
              top={st ? 2 + row * ROW_H : 2}
              height={st ? ROW_H - 4 : h - 4}
              wave={l.kind === "music" ? waveOf.get(b.idx) : undefined}
              onSelect={() => onLayerSelect(l.kind, b.idx)}
              onChange={(tl, d, mode) => onLayerChange(l.kind, b.idx, tl, d, mode)}
              onRemove={() => onLayerRemove(l.kind, b.idx)}
            />
          );
        })}
      </div>
    );
  };

  const headerRow = (l: (typeof LANES)[number]) => {
    const Icon = l.icon;
    const st = stack.get(l.kind);
    return (
      <div
        key={l.kind}
        className="flex items-center justify-center gap-1 border-b border-line/60"
        style={{ height: laneHeight(l) }}
      >
        <button
          onClick={() => onVis(l.kind)}
          className="text-muted hover:text-ink"
          title={`ซ่อน/แสดง ${l.label}`}
        >
          <Eye size={11} />
        </button>
        <Icon size={11} style={{ color: l.color }} />
        {st && st.rows > 1 && (
          <span className="text-[9px] text-faint">{st.rows}</span>
        )}
      </div>
    );
  };

  // แถวของเลเยอร์ที่ถูกซ่อน — เหลือปุ่มตาไว้เปิดกลับ
  const hiddenLanes = [...LANES, ...LANES_BELOW].filter((l) => !vis[l.kind]);

  return (
    <section className="flex h-[21rem] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {/* แถบเครื่องมือ */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="ย้อนกลับการแก้ล่าสุด — ช็อตและเลเยอร์ (Cmd+Z)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="ทำซ้ำที่เพิ่งย้อนไป (Cmd+Shift+Z)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <Redo2 size={14} />
        </button>
        <div className="mx-1 h-5 w-px bg-line" />
        <button
          onClick={onSplit}
          title="ซอยช็อตตรงหัวเล่นออกเป็นสองชิ้น (S)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
        >
          <Scissors size={14} />
        </button>
        <button
          onClick={() => selected != null && onDuplicate(selected)}
          disabled={selected == null}
          title="ทำสำเนาช็อตที่เลือก ต่อท้ายตำแหน่งเดิม"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={() => selected != null && onRemove(selected)}
          disabled={selected == null}
          title="ลบช็อตที่เลือก (Delete)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-danger disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>

        {hiddenLanes.length > 0 && (
          <div className="ml-2 flex items-center gap-1">
            {hiddenLanes.map((l) => {
              const Icon = l.icon;
              return (
                <button
                  key={l.kind}
                  onClick={() => onVis(l.kind)}
                  title={`แสดงเลเยอร์ ${l.label}`}
                  className="flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-1 text-[10px] text-faint hover:text-ink"
                >
                  <EyeOff size={10} />
                  <Icon size={10} style={{ color: l.color }} />
                </button>
              );
            })}
          </div>
        )}

        <div className="mx-auto flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-[11.5px] text-muted">
          {shots.length} ช็อต · {dur(total)}
        </div>

        <button className="rounded-md p-2 text-accent" title="ดูดติดขอบ (เปิดเสมอ)">
          <Magnet size={14} />
        </button>
        <button
          onClick={() => onZoom(Math.max(2, pxPerSec / 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมออก (-) · ซูมพอดีทั้งเรื่อง (0)"
        >
          <ZoomOut size={14} />
        </button>
        <input
          type="range"
          min={2}
          max={120}
          value={pxPerSec}
          onChange={(e) => onZoom(parseFloat(e.target.value))}
          className="w-28"
          title="ระดับซูมไทม์ไลน์ — คีย์ลัด: - / = / 0"
        />
        <button
          onClick={() => onZoom(Math.min(120, pxPerSec * 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมเข้า (=)"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      {/* เลื่อนแนวตั้งที่ชั้นนอก — หัวแทร็กกับเลนเลื่อนพร้อมกันเสมอ */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {/* หัวแทร็ก */}
        <div className="flex w-12 shrink-0 flex-col border-r border-line">
          <div className="h-7 shrink-0 border-b border-line" />
          <div className="h-2.5 shrink-0" />
          {lanesAbove.map(headerRow)}
          <div className="flex h-20 shrink-0 flex-col items-center justify-center gap-1.5 border-b border-line/60 text-faint">
            <Eye size={11} />
            <Video size={12} />
          </div>
          {lanesBelow.map(headerRow)}
        </div>

        {/* พื้นที่ไทม์ไลน์ */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropHint(timeFromClientX(e.clientX));
            }
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(DND_MIME);
            setDropHint(null);
            if (!raw) return;
            e.preventDefault();
            try {
              onDropPayload(JSON.parse(raw), timeFromClientX(e.clientX));
            } catch {
              /* payload เพี้ยน — ไม่ทำอะไร */
            }
          }}
        >
          <div className="relative" style={{ width }}>
            {/* ไม้บรรทัด */}
            <div
              className="sticky top-0 z-10 h-7 cursor-pointer border-b border-line bg-panel"
              onMouseDown={(e) => {
                onSeek(timeFromClientX(e.clientX));
                const move = (ev: MouseEvent) => onSeek(timeFromClientX(ev.clientX));
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-full border-l border-line-2 pl-1 font-mono text-[9.5px] leading-7 text-faint"
                  style={{ left: 8 + t * pxPerSec }}
                >
                  {dur(t)}
                </div>
              ))}
            </div>

            {/* แถบบท */}
            <div className="relative h-2.5 pt-1">
              {shots.map((s, i) =>
                s.chapter ? (
                  <div
                    key={`ch${i}`}
                    title={s.chapter_title}
                    className="absolute h-1.5 rounded-sm opacity-70"
                    style={{
                      left: 8 + offsets[i] * pxPerSec,
                      width: Math.max(s.dur * pxPerSec - 1, 2),
                      background: chapterColor.get(s.chapter),
                    }}
                  />
                ) : null,
              )}
            </div>

            {/* เลเยอร์เหนือวิดีโอ */}
            {lanesAbove.map(laneRow)}

            {/* แทร็กวิดีโอ — คลิกที่ไหนก็ย้ายเส้นแดงไปตรงนั้น (ทั้งบนช็อตและช่องว่าง) */}
            <div
              className="relative h-20 border-b border-line/60"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onSeek(timeFromClientX(e.clientX));
              }}
            >
              {shots.map((s, i) => {
                const left = 8 + offsets[i] * pxPerSec;
                const w = Math.max(s.dur * pxPerSec - 2, 8);
                const isSel = selected === i;
                return (
                  <div
                    key={`${s.name}-${i}`}
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
                    onDrop={(e) => {
                      if (dragFrom == null) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragFrom !== i) onReorder(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(i);
                      // คลิกช็อตไหน เส้นแดงไปยืนตรงจุดที่คลิก แล้วกดเล่นต่อได้เลย
                      onSeek(timeFromClientX(e.clientX));
                    }}
                    title={`${s.name} · ${s.start.toFixed(1)}–${s.end.toFixed(1)} วิ${s.seg ? "" : " · ยังไม่มีไฟล์ตัด"}\nคลิก = เลือก + ย้ายเส้นหัวเล่นมาตรงนี้ · ลาก = สลับลำดับ`}
                    className={`absolute top-1 h-[4.5rem] cursor-grab overflow-hidden rounded-lg border active:cursor-grabbing ${
                      isSel ? "z-20 border-accent ring-2 ring-accent/60" : "border-line-2"
                    } ${dragOver === i && dragFrom !== i ? "outline outline-2 outline-accent/70" : ""}`}
                    style={{ left, width: w }}
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-60"
                      style={{ backgroundImage: `url(${thumbUrl(s.name)})` }}
                    />
                    <div
                      className={`absolute inset-0 ${
                        s.kind === "TALK" ? "bg-talk/25" : "bg-broll/25"
                      } ${s.seg ? "" : "needs-render"}`}
                    />
                    <div
                      className={`absolute inset-y-0 left-0 w-1 ${
                        s.kind === "TALK" ? "bg-talk" : "bg-broll"
                      }`}
                    />
                    {w > 46 && (
                      <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                        {s.name} <span className="text-white/60">{dur(s.dur)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* เลเยอร์ใต้วิดีโอ */}
            {lanesBelow.map(laneRow)}

            {/* เส้นจังหวะ — พาดทุกเลนตั้งแต่ใต้ไม้บรรทัดลงไป วางไว้ *ใต้* บล็อก
                (z ต่ำ) เพราะมันเป็นเส้นอ้างอิง ไม่ใช่ของที่ต้องอ่านทับของจริง */}
            {beatTicks.length > 0 && (
              <div className="pointer-events-none absolute bottom-0 left-0 top-7 z-0">
                {beatTicks.map((x, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 top-0 w-px bg-accent/25"
                    style={{ left: 8 + x }}
                  />
                ))}
              </div>
            )}

            {/* เส้นบอกจุดที่กำลังจะปล่อยของ */}
            {dropHint != null && (
              <div
                className="pointer-events-none absolute bottom-0 top-7 z-40 w-0.5 bg-accent"
                style={{ left: 8 + dropHint * pxPerSec }}
              />
            )}

            {/* หัวเล่น */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-danger"
              style={{ left: 8 + playhead * pxPerSec }}
            >
              <div className="-ml-[5px] h-3 w-[11px] rounded-b-sm bg-danger" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
