"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Magnet,
  Mic,
  MoveLeft,
  MoveRight,
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
import type { CardAnchor } from "@/components/BlockCard";

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
  /** ป้ายสั้นบนชิปแถบเครื่องมือ — มีเฉพาะเลนอ่านอย่างเดียวที่มีชิปประจำที่ */
  chip?: string;
}[] = [
  { kind: "text", label: "ข้อความ (ขั้น 5)", icon: Type, h: 26, color: "#10b981" },
  { kind: "sticker", label: "สติกเกอร์/ภาพซ้อน", icon: Smile, h: 26, color: "#ec4899" },
  { kind: "shape", label: "รูปทรง (ลูกศร/แถบ/จุด)", icon: Shapes, h: 26, color: "#f97316" },
  { kind: "caption", label: "ซับอัตโนมัติ", icon: Captions, h: 20, color: "#64748b", readonly: true, chip: "ซับ" },
];
const LANES_BELOW: typeof LANES = [
  { kind: "speech", label: "เสียงพูดในคลิป", icon: Mic, h: 20, color: "#14b8a6", readonly: true, chip: "เสียงพูด" },
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
      // ให้การ์ดลอยหาบล็อกที่เลือกเจอโดยไม่ต้องคำนวณแถวซ้ำ — ความสูงแถว การซ้อน
      // และการเลื่อนของกล่องไทม์ไลน์ อยู่ในไฟล์นี้หลายที่ วัดจากตัว DOM จริงจึง
      // ไม่มีทางหลุดจากกัน
      data-sel-block={selected ? "" : undefined}
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
  onTrim,
  layers,
  vis,
  onVis,
  layerSel,
  onLayerSelect,
  onLayerChange,
  onLayerRemove,
  onDropPayload,
  beats,
  canCopyLayer,
  canPasteLayer,
  onCopyLayer,
  onPasteLayer,
  onAnchor,
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
  /** ลากขอบช็อตวิดีโอ — ส่งช่วงใหม่ในคลิปต้นฉบับ (page ทำ patchShot: คิด dur · ติดธงตัดใหม่ · เข้าประวัติ) */
  onTrim: (i: number, patch: { start: number; end: number }) => void;
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
  /** มีบล็อกเลเยอร์ที่เลือกอยู่ไหม — ซับอัตโนมัติกับเสียงพูดก๊อปไม่ได้ (คำนวณมา) */
  canCopyLayer: boolean;
  canPasteLayer: boolean;
  onCopyLayer: () => void;
  onPasteLayer: () => void;
  /** ที่ที่การ์ดลอยต้องไปชี้ — ไทม์ไลน์คิดให้เพราะเรขาคณิตอยู่ที่นี่ทั้งหมด
   *  (ดู BlockCard.CardAnchor) · null = ไม่มีบล็อกที่เลือก */
  onAnchor: (a: CardAnchor | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
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

  // ── ยืดหดขอบช็อตวิดีโอ (trim in/out ในคลิปต้นฉบับ) ──
  //
  // ท่าเดียวกับบล็อกเลเยอร์: ghost ระหว่างลาก · commit ตอนปล่อยเท่านั้น  แต่แทร็ก
  // วิดีโอเรียงต่อกันไม่มีช่องว่าง ขอบซ้ายบนจอจึงถูกตรึงด้วยช็อตก่อนหน้า — ลากขอบ
  // ซ้ายคือเลื่อน *จุดเริ่มในคลิป* แล้วบล็อกยาว/สั้นไปทางขวา และช็อตหลังจากนั้น
  // เลื่อนตามทั้งแถว (ripple) เหมือนที่แผง Properties ทำอยู่แล้ว
  //
  // กฎขอบเขต (0 ≤ start · end ≤ clip_dur · ยาวอย่างน้อย 0.3 วิ) ใช้ชุดเดียวกับ
  // แผง Properties และเอนจิน (MIN_PIECE) — ถ้าหนีบไม่ตรงกัน จะลากได้แต่บันทึกไม่ผ่าน
  const MIN_SHOT = 0.3;
  const [trim, setTrim] = useState<{ i: number; start: number; end: number } | null>(null);
  const trimRef = useRef<{
    i: number;
    x0: number;
    start0: number;
    end0: number;
    side: "l" | "r";
    clipDur: number;
  } | null>(null);

  /** จุดตัดท้ายช็อต (วินาทีบนไทม์ไลน์) → ดูดเข้าเส้นจังหวะเมื่อเปิดโหมดจังหวะ
   *  (ระยะดูด 8 พิกเซล) ไม่งั้นปัดทีละ 0.05 วิ  ดูดที่ *รอยตัด* ไม่ใช่ที่ขอบซ้าย
   *  เพราะรอยตัดคือสิ่งเดียวที่คนดูได้ยินตรงจังหวะ (กฎเดียวกับ beat.py) */
  const snapCut = (cutTl: number) => {
    const g = beats?.grid;
    if (g && g.length) {
      let best = -1;
      let bd = 8 / pxPerSec;
      for (const t of g) {
        const d = Math.abs(t - cutTl);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (best >= 0) return best;
    }
    return Math.round(cutTl * 20) / 20;
  };

  const trimStart = (e: React.PointerEvent, i: number, side: "l" | "r") => {
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer จำลอง (ทดสอบ) ไม่มี capture ได้ — ลากต่อได้อยู่ดี */
    }
    const s = shots[i];
    trimRef.current = {
      i,
      x0: e.clientX,
      start0: s.start,
      end0: s.end,
      side,
      clipDur: s.clip_dur > 0 ? s.clip_dur : s.end,
    };
    setTrim({ i, start: s.start, end: s.end });
  };
  const trimMove = (e: React.PointerEvent) => {
    const d = trimRef.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / pxPerSec;
    const off = offsets[d.i];
    if (d.side === "r") {
      let end = d.end0 + dx;
      end = d.start0 + (snapCut(off + (end - d.start0)) - off);
      end = Math.min(d.clipDur, Math.max(d.start0 + MIN_SHOT, end));
      setTrim({ i: d.i, start: d.start0, end });
    } else {
      let start = d.start0 + dx;
      start = d.end0 - (snapCut(off + (d.end0 - start)) - off);
      start = Math.max(0, Math.min(d.end0 - MIN_SHOT, start));
      setTrim({ i: d.i, start, end: d.end0 });
    }
  };
  const trimEnd = () => {
    const d = trimRef.current;
    if (
      d &&
      trim &&
      (Math.abs(trim.start - d.start0) > 0.005 || Math.abs(trim.end - d.end0) > 0.005)
    ) {
      onTrim(d.i, {
        start: Math.round(trim.start * 1000) / 1000,
        end: Math.round(trim.end * 1000) / 1000,
      });
    }
    trimRef.current = null;
    setTrim(null);
  };
  // ตำแหน่ง/ความยาวที่วาด — ระหว่างลากใช้ ghost แล้วเลื่อนช็อตหลังจากนั้นตามไปด้วย
  const trimDelta = trim ? trim.end - trim.start - shots[trim.i].dur : 0;
  const viewOff = (i: number) => (trim && i > trim.i ? offsets[i] + trimDelta : offsets[i]);
  const viewDur = (i: number) => (trim && i === trim.i ? trim.end - trim.start : shots[i].dur);

  /** บอกข้างนอกว่าการ์ดลอยต้องไปชี้ตรงไหน
   *
   *  คิดจาก getBoundingClientRect ทุกครั้งที่มีอะไรขยับ ไม่ใช่คำนวณจากตัวเลขที่
   *  จำไว้ — ความกว้างของแผงซ้ายลากเปลี่ยนได้ตลอด และเลนที่ถูกซ่อน/กางเพิ่มแถว
   *  ทำให้ระยะเลื่อนไม่ตรงกับที่คิดไว้ทันที
   */
  const selBlock = layerSel
    ? (layers[layerSel.kind] ?? []).find((b) => b.idx === layerSel.idx)
    : undefined;
  const selTl = selBlock?.tl ?? 0;
  const selDur = selBlock?.dur ?? 0;
  const selOrphan = selBlock?.orphan ?? false;

  useEffect(() => {
    // อ่าน vis ทั้งกองในนี้ ไม่ใช่ดึงมาแค่เลนตัวเอง — ซ่อน/กางเลน *ตัวอื่น* ก็ดัน
    // แถวขึ้นลง  ถ้าไม่ผูก vis ทั้งก้อนไว้เป็น dep การ์ดจะค้างชี้แถวเดิม (กล่อง
    // ไทม์ไลน์สูงคงที่ ตัว ResizeObserver จึงไม่ยิงให้)
    if (!selBlock || !layerSel || !vis[layerSel.kind] || selOrphan) {
      onAnchor(null);
      return;
    }
    const el = scrollRef.current;
    const sec = sectionRef.current;
    if (!el || !sec) return;
    const tell = () => {
      const r = el.getBoundingClientRect();
      const s = sec.getBoundingClientRect();
      const x0 = r.left - el.scrollLeft + 8 + selTl * pxPerSec;
      const x1 = x0 + selDur * pxPerSec;
      // แถวของบล็อกในแนวตั้ง — วัดจากตัวมันเอง แล้วหนีบไว้ในกล่องไทม์ไลน์เผื่อ
      // แถวถูกตัดขอบ  ไม่เจอตัว (เพิ่งวาด) ก็ถอยไปใช้ขอบบนกล่องแทน
      const be = el.querySelector<HTMLElement>("[data-sel-block]");
      const b = be?.getBoundingClientRect();
      onAnchor({
        x: Math.min(Math.max((x0 + x1) / 2, r.left + 8), r.right - 8),
        top: s.top,
        blockTop: b ? Math.max(s.top, b.top) : s.top,
        blockBottom: b ? Math.min(s.bottom, b.bottom) : s.top,
        // เลื่อนจนบล็อกพ้นขอบแล้ว — ซ่อนการ์ด ไม่ใช่ปล่อยให้หางชี้ไปที่ว่าง
        off: x1 < r.left + 4 || x0 > r.right - 4,
      });
    };
    tell();
    el.addEventListener("scroll", tell, { passive: true });
    window.addEventListener("resize", tell);
    const ro = new ResizeObserver(tell);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", tell);
      window.removeEventListener("resize", tell);
      ro.disconnect();
    };
  }, [selBlock, layerSel, vis, selOrphan, selTl, selDur, pxPerSec, onAnchor]);

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
    <section
      ref={sectionRef}
      className="flex h-[21rem] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel"
    >
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
        <div className="mx-1 h-5 w-px bg-line" />
        {/* ก๊อป-วางของบน *ชั้นแต่งหนัง* — คนละอย่างกับปุ่มสำเนาช็อตข้างบน
            สำเนาช็อตต่อท้ายตัวเดิม ส่วนอันนี้วางที่หัวเล่นเสมอ จะได้เลือกที่วางเอง */}
        <button
          onClick={onCopyLayer}
          disabled={!canCopyLayer}
          title="ก๊อปบล็อกที่เลือกบนเลเยอร์ (ข้อความ/สติกเกอร์/รูปทรง/เพลง) — Cmd+C"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <ClipboardCopy size={14} />
        </button>
        <button
          onClick={onPasteLayer}
          disabled={!canPasteLayer}
          title="วางสำเนาตรงหัวเล่น — Cmd+V"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <ClipboardPaste size={14} />
        </button>
        {/* สลับกับเพื่อนบ้านทีละช่อง — ลากสลับทำได้อยู่แล้ว แต่บนไทม์ไลน์ 208 ช็อต
            ที่ซูมออกสุด ช็อตกว้างไม่กี่พิกเซล การเล็งปล่อยให้ตรงช่องทำได้ยากมาก */}
        <button
          onClick={() => selected != null && selected > 0 && onReorder(selected, selected - 1)}
          disabled={selected == null || selected === 0}
          title="สลับช็อตที่เลือกกับช็อตก่อนหน้า"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <MoveLeft size={14} />
        </button>
        <button
          onClick={() =>
            selected != null && selected < shots.length - 1 && onReorder(selected, selected + 1)
          }
          disabled={selected == null || selected >= shots.length - 1}
          title="สลับช็อตที่เลือกกับช็อตถัดไป"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <MoveRight size={14} />
        </button>
        <button
          onClick={() => selected != null && onRemove(selected)}
          disabled={selected == null}
          title="ลบช็อตที่เลือก (Delete)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-danger disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>

        {/* ── สองเลนที่อ่านอย่างเดียว — ชิปมีป้ายชื่อ อยู่บนแถบตลอด ──
            เดิมเป็นไอคอนเปล่าที่โผล่เฉพาะ *ตอนซ่อนไปแล้ว* ซึ่งแปลว่าคนที่ยังไม่เคย
            ซ่อนไม่มีทางรู้ว่าซ่อนได้ ทั้งที่ซับกับเสียงพูดคือสองเลนที่เกะกะที่สุด
            ตอนจัดข้อความ (มันคำนวณมา ลากแก้ไม่ได้ แต่กินความสูงเท่าเลนจริง) */}
        <div className="ml-2 flex items-center gap-1">
          {[...LANES, ...LANES_BELOW]
            .filter((l) => l.readonly)
            .map((l) => {
              const Icon = l.icon;
              const on = vis[l.kind];
              return (
                <button
                  key={l.kind}
                  onClick={() => onVis(l.kind)}
                  title={`${on ? "ซ่อน" : "แสดง"}เลเยอร์ ${l.label}`}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
                    on
                      ? "bg-panel-2 text-muted hover:text-ink"
                      : "bg-panel-2/60 text-faint hover:text-muted"
                  }`}
                >
                  {on ? <Eye size={11} /> : <EyeOff size={11} />}
                  <Icon size={11} style={{ color: on ? l.color : undefined }} />
                  {l.chip}
                </button>
              );
            })}
          {hiddenLanes
            .filter((l) => !l.readonly)
            .map((l) => {
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

        <div className="mx-auto flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-[11.5px] text-muted">
          {shots.length} ช็อต · {dur(total)}
        </div>

        <button className="rounded-md p-2 text-accent" title="ดูดติดขอบ (เปิดเสมอ)">
          <Magnet size={14} />
        </button>
        <button
          onClick={() => onZoom(Math.max(2, pxPerSec / 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมออก (- หรือ Cmd+A) · ซูมพอดีทั้งเรื่อง (0)"
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
          title="ระดับซูมไทม์ไลน์ — คีย์ลัด: - / = / 0 · Cmd+S ซูมเข้า · Cmd+A ซูมออก"
        />
        <button
          onClick={() => onZoom(Math.min(120, pxPerSec * 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมเข้า (= หรือ Cmd+S)"
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
                const left = 8 + viewOff(i) * pxPerSec;
                const w = Math.max(viewDur(i) * pxPerSec - 2, 8);
                const isSel = selected === i;
                const trimming = trim?.i === i;
                return (
                  <div
                    key={`${s.name}-${i}`}
                    draggable={trim == null}
                    onDragStart={(e) => {
                      // จับขอบอยู่ = ห้ามเบราว์เซอร์เริ่มลากสลับลำดับซ้อนขึ้นมา
                      if (trimRef.current) {
                        e.preventDefault();
                        return;
                      }
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
                    title={`${s.name} · ${s.start.toFixed(1)}–${s.end.toFixed(1)} วิ (คลิปเต็ม ${s.clip_dur.toFixed(1)} วิ)${s.seg ? "" : " · ยังไม่มีไฟล์ตัด"}\nคลิก = เลือก + ย้ายเส้นหัวเล่นมาตรงนี้ · ลาก = สลับลำดับ · ขอบซ้าย/ขวา = ยืดหด`}
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
                        {trimming && trim ? (
                          <>
                            {trim.start.toFixed(2)}–{trim.end.toFixed(2)}{" "}
                            <span className="text-white/60">{(trim.end - trim.start).toFixed(2)} วิ</span>
                          </>
                        ) : (
                          <>
                            {s.name} <span className="text-white/60">{dur(s.dur)}</span>
                          </>
                        )}
                      </div>
                    )}
                    {/* จุดจับขอบ — โผล่เมื่อบล็อกกว้างพอให้เล็งได้ ไม่งั้นตอนซูมออกสุด
                        ทุกคลิกจะกลายเป็นยืดหดแทนการเลือก */}
                    {w >= 24 && (
                      <>
                        <div
                          onPointerDown={(e) => trimStart(e, i, "l")}
                          onPointerMove={trimMove}
                          onPointerUp={trimEnd}
                          onPointerCancel={trimEnd}
                          onClick={(e) => e.stopPropagation()}
                          title="ลาก = เลื่อนจุดเริ่มในคลิปต้นฉบับ"
                          className={`absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-white/70 ${
                            trimming ? "bg-white/80" : "bg-white/20"
                          }`}
                        />
                        <div
                          onPointerDown={(e) => trimStart(e, i, "r")}
                          onPointerMove={trimMove}
                          onPointerUp={trimEnd}
                          onPointerCancel={trimEnd}
                          onClick={(e) => e.stopPropagation()}
                          title="ลาก = เลื่อนจุดจบในคลิปต้นฉบับ"
                          className={`absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize hover:bg-white/70 ${
                            trimming ? "bg-white/80" : "bg-white/20"
                          }`}
                        />
                      </>
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
