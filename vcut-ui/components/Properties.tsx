"use client";

import { Play, SlidersHorizontal, Trash2 } from "lucide-react";
import { thumbUrl, type Shot } from "@/lib/api";
import { dur } from "@/lib/time";

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        type="number"
        step={0.1}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

export default function Properties({
  shot,
  onPatch,
  onRemove,
  onPlayShot,
}: {
  shot: Shot | null;
  onPatch: (patch: Partial<Shot>) => void;
  onRemove: () => void;
  onPlayShot: () => void;
}) {
  if (!shot) {
    return (
      <aside className="flex w-72 shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-line bg-panel p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel-2">
          <SlidersHorizontal size={20} className="text-muted" />
        </div>
        <div className="text-[15px] font-medium text-ink">ยังว่างอยู่</div>
        <div className="text-[12px] leading-5 text-muted">
          คลิกช็อตบนไทม์ไลน์
          <br />
          เพื่อดูและแก้คุณสมบัติ
        </div>
      </aside>
    );
  }

  const maxDur = shot.clip_dur;

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-panel p-3">
      <div className="relative overflow-hidden rounded-lg border border-line bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(shot.name)}
          alt={shot.name}
          className="aspect-video w-full object-cover"
        />
        <button
          onClick={onPlayShot}
          className="absolute inset-0 flex items-center justify-center bg-black/0 text-white/0 hover:bg-black/40 hover:text-white"
          title="เล่นจากช็อตนี้"
        >
          <Play size={26} className="fill-current" />
        </button>
      </div>

      <div>
        <div className="truncate text-[13px] font-medium text-ink">
          {shot.name}
        </div>
        <div className="text-[11px] text-muted">
          คลิปเต็ม {dur(shot.clip_dur)} · แนว{shot.orient === "V" ? "ตั้ง" : "นอน"}
          {shot.ai_score != null && ` · AI ${shot.ai_score}`}
          {!shot.seg && (
            <span className="text-warn"> · ยังไม่มีไฟล์ตัด</span>
          )}
        </div>
      </div>

      <div className="flex overflow-hidden rounded-lg border border-line">
        {(["TALK", "BROLL"] as const).map((k) => (
          <button
            key={k}
            onClick={() => onPatch({ kind: k })}
            className={`flex-1 py-1.5 text-[12px] font-medium ${
              shot.kind === k
                ? k === "TALK"
                  ? "bg-talk/20 text-talk"
                  : "bg-broll/20 text-broll"
                : "bg-panel-2 text-muted hover:text-ink"
            }`}
          >
            {k === "TALK" ? "พูด" : "บรรยากาศ"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="เริ่ม (วิ)"
          value={shot.start}
          min={0}
          max={shot.end - 0.3}
          onChange={(v) =>
            onPatch({
              start: Math.max(0, Math.min(v, shot.end - 0.3)),
            })
          }
        />
        <NumField
          label="จบ (วิ)"
          value={shot.end}
          min={shot.start + 0.3}
          max={maxDur}
          onChange={(v) =>
            onPatch({
              end: Math.min(maxDur, Math.max(v, shot.start + 0.3)),
            })
          }
        />
      </div>
      <div className="rounded-lg bg-panel-2 px-2.5 py-1.5 text-[11.5px] text-muted">
        ความยาวชิ้น{" "}
        <span className="font-mono text-ink">
          {(shot.end - shot.start).toFixed(2)} วิ
        </span>
        {shot.chapter_title && (
          <>
            {" "}
            · บท <span className="text-ink">{shot.chapter_title}</span>
          </>
        )}
      </div>

      {shot.text && (
        <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-[12px] leading-5 text-ink">
          <div className="mb-1 text-[10.5px] uppercase tracking-wide text-faint">
            คำพูดในช่วงนี้
          </div>
          {shot.text}
        </div>
      )}

      <div className="flex-1" />
      <button
        onClick={onRemove}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 py-2 text-[12px] font-medium text-danger hover:bg-danger/20"
      >
        <Trash2 size={13} /> เอาช็อตนี้ออก
      </button>
    </aside>
  );
}
