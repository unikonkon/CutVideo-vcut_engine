"use client";

import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Eye,
  Magnet,
  Scissors,
  Trash2,
  Video,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { thumbUrl, type Shot } from "@/lib/api";
import { dur, rulerStep } from "@/lib/time";

const CHAPTER_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#14b8a6",
];

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
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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

  const timeFromEvent = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft - 8;
    return Math.max(0, Math.min(total, x / pxPerSec));
  };

  return (
    <section className="flex h-60 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {/* แถบเครื่องมือ */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <button
          onClick={onSplit}
          title="ซอยช็อตตรงหัวเล่น (S)"
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
        >
          <Scissors size={14} />
        </button>
        <button
          onClick={() => selected != null && onDuplicate(selected)}
          disabled={selected == null}
          title="ทำสำเนาช็อตที่เลือก"
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

        <div className="mx-auto flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-[11.5px] text-muted">
          {shots.length} ช็อต · {dur(total)}
        </div>

        <button
          className="rounded-md p-2 text-accent"
          title="ดูดติดขอบ (เปิดเสมอ)"
        >
          <Magnet size={14} />
        </button>
        <button
          onClick={() => onZoom(Math.max(2, pxPerSec / 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมออก"
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
        />
        <button
          onClick={() => onZoom(Math.min(120, pxPerSec * 1.4))}
          className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-ink"
          title="ซูมเข้า"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* หัวแทร็ก */}
        <div className="flex w-12 shrink-0 flex-col border-r border-line pt-7">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-faint">
            <Volume2 size={13} />
            <Eye size={13} />
            <Video size={13} />
          </div>
        </div>

        {/* พื้นที่ไทม์ไลน์ */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          <div className="relative h-full" style={{ width }}>
            {/* ไม้บรรทัด */}
            <div
              className="sticky top-0 z-10 h-7 cursor-pointer border-b border-line bg-panel"
              onMouseDown={(e) => {
                onSeek(timeFromEvent(e));
                const move = (ev: MouseEvent) =>
                  onSeek(
                    timeFromEvent(ev as unknown as React.MouseEvent),
                  );
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
            <div className="relative mt-1 h-1.5">
              {shots.map((s, i) =>
                s.chapter ? (
                  <div
                    key={`ch${i}`}
                    title={s.chapter_title}
                    className="absolute h-full rounded-sm opacity-70"
                    style={{
                      left: 8 + offsets[i] * pxPerSec,
                      width: Math.max(s.dur * pxPerSec - 1, 2),
                      background: chapterColor.get(s.chapter),
                    }}
                  />
                ) : null,
              )}
            </div>

            {/* แทร็กวิดีโอ */}
            <div className="relative mt-2 h-20">
              {shots.map((s, i) => {
                const left = 8 + offsets[i] * pxPerSec;
                const w = Math.max(s.dur * pxPerSec - 2, 8);
                const isSel = selected === i;
                return (
                  <div
                    key={`${s.name}-${i}`}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom != null && dragFrom !== i)
                        onReorder(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(i);
                    }}
                    title={`${s.name} · ${s.start.toFixed(1)}–${s.end.toFixed(1)} วิ${s.seg ? "" : " · ยังไม่มีไฟล์ตัด"}`}
                    className={`absolute top-0 h-full cursor-grab overflow-hidden rounded-lg border active:cursor-grabbing ${
                      isSel
                        ? "z-20 border-accent ring-2 ring-accent/60"
                        : "border-line-2"
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
                        {s.name}{" "}
                        <span className="text-white/60">{dur(s.dur)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
