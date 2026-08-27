"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  VolumeX,
  X,
} from "lucide-react";
import { thumbUrl, type FxClip, type Shot } from "@/lib/api";
import { Field, NInput, Sel } from "@/components/ui";
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

/** ปุ่มความเร็วที่ใช้บ่อย — พิมพ์เลขเองก็ได้ แต่สามค่านี้คือที่กดจริงเกือบทุกครั้ง */
const SPEEDS = [0.5, 1, 2] as const;

/** ป้ายบอกว่าชิ้นนี้ถูกแต่งอะไรไว้ — สูตรเดียวกับ fx._how ของเอนจิน */
function fxSummary(f: FxClip, gradeLabel: Record<string, string>): string {
  const bits: string[] = [];
  if (Math.abs(f.speed - 1) > 1e-6) bits.push(`${+f.speed.toFixed(3)}×`);
  if (f.zoom > 1 + 1e-6) bits.push(`ซูม ${+f.zoom.toFixed(2)}`);
  if (f.grade) bits.push(gradeLabel[f.grade]?.split(" —")[0] ?? f.grade);
  if (f.mute) bits.push("ปิดเสียง");
  else if (Math.abs(f.vol_db) > 1e-6) bits.push(`${f.vol_db > 0 ? "+" : ""}${f.vol_db} dB`);
  return bits.join(" · ");
}

function FxBlock({
  fx,
  base,
  grade,
  srcLen,
  onFx,
}: {
  fx: FxClip;
  base: FxClip;
  grade: Record<string, string>;
  /** ความยาวชิ้นก่อนใส่เอฟเฟกต์ (วินาที) */
  srcLen: number;
  onFx: (p: Partial<FxClip>) => void;
}) {
  const touched = (Object.keys(base) as (keyof FxClip)[]).some(
    (k) => fx[k] !== base[k],
  );
  const outLen = srcLen / (fx.speed || 1);
  // พับได้เพราะแผงนี้แบ่งพื้นที่กับจอตัวอย่าง — สูงไม่ถึง 400px ในหน้าต่างปกติ
  // สถานะอยู่ที่ตัวแผง ไม่ใช่ที่ช็อต จึงค้างไว้ตามที่เปิด/พับล่าสุดเมื่อสลับช็อต
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10.5px] uppercase tracking-wide text-faint hover:text-muted"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Sparkles size={11} /> เอฟเฟกต์ (ขั้น 5)
          {!open && touched && (
            <span className="truncate normal-case text-accent">
              · {fxSummary(fx, grade)}
            </span>
          )}
        </button>
        {touched && (
          <button
            onClick={() => onFx({ ...base })}
            title="คืนค่าทุกช่องเป็น 'ไม่แตะ' — ชิ้นนี้จะกลับไปใช้ไฟล์ของขั้น 3 ตรง ๆ"
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-panel-3 hover:text-ink"
          >
            <RotateCcw size={11} /> ล้าง
          </button>
        )}
      </div>

      {!open ? null : (
      <>
      <Field label="ความเร็ว">
        <div className="flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {SPEEDS.map((v) => (
              <button
                key={v}
                onClick={() => onFx({ speed: v })}
                className={`px-2 py-1.5 text-[11.5px] font-mono ${
                  Math.abs(fx.speed - v) < 1e-6
                    ? "bg-accent/20 text-accent"
                    : "bg-panel-2 text-muted hover:text-ink"
                }`}
              >
                {v}×
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <NInput
              value={fx.speed}
              step={0.05}
              min={0.1}
              max={8}
              onChange={(v) => onFx({ speed: Math.min(8, Math.max(0.1, v)) })}
            />
          </div>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="ซูม">
          <NInput
            value={fx.zoom}
            step={0.05}
            min={1}
            max={4}
            onChange={(v) => onFx({ zoom: Math.min(4, Math.max(1, v)) })}
          />
        </Field>
        <Field label="โทนสี">
          <Sel
            value={fx.grade}
            onChange={(v) => onFx({ grade: v })}
            options={Object.entries(grade).map(([v, label]) => ({ v, label }))}
          />
        </Field>
      </div>

      <div className="flex items-end gap-2">
        <button
          onClick={() => onFx({ mute: !fx.mute })}
          title="ตัดเสียงของชิ้นนี้ทิ้งทั้งชิ้น"
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] ${
            fx.mute
              ? "bg-danger/15 text-danger"
              : "bg-panel-2 text-muted hover:text-ink"
          }`}
        >
          <VolumeX size={13} /> ปิดเสียง
        </button>
        <div className="min-w-0 flex-1">
          <Field label={fx.mute ? "ระดับเสียง (ปิดอยู่)" : "ระดับเสียง (dB)"}>
            <input
              type="range"
              min={-40}
              max={12}
              step={0.5}
              disabled={fx.mute}
              value={Math.min(12, Math.max(-40, fx.vol_db))}
              onChange={(e) => onFx({ vol_db: Number(e.target.value) })}
              className="h-8 w-full cursor-pointer disabled:opacity-40"
            />
          </Field>
        </div>
        <span className="w-12 shrink-0 pb-1.5 text-right font-mono text-[11.5px] text-muted">
          {fx.mute ? "—" : `${fx.vol_db > 0 ? "+" : ""}${fx.vol_db}`}
        </span>
      </div>

      {touched ? (
        <div className="rounded-md bg-panel-3/60 px-2 py-1.5 text-[11px] leading-4 text-muted">
          {fxSummary(fx, grade)}
          {Math.abs(fx.speed - 1) > 1e-6 && (
            <>
              {" · ชิ้นนี้จะยาว "}
              <span className="font-mono text-ink">{outLen.toFixed(2)} วิ</span>
              {" (เดิม "}
              {srcLen.toFixed(2)}
              {")"}
            </>
          )}
          {/* ชิ้นที่ถูกแต่งถูกเข้ารหัสภาพเพิ่มอีกหนึ่งรอบตอนสร้างไฟล์ขั้น 5 —
              บอกไว้ตรงนี้ดีกว่าให้ไปแปลกใจว่าทำไม Export รอบนี้นานกว่าเดิม */}
          <div className="mt-0.5 text-faint">
            ตัดชิ้นนี้ใหม่ตอนสร้างไฟล์แบบมีเอฟเฟกต์ · ไฟล์ของขั้น 3 ไม่ถูกแตะ
          </div>
        </div>
      ) : (
        <div className="px-0.5 text-[11px] text-faint">
          ยังไม่ได้แต่งอะไร — ชิ้นนี้ใช้ไฟล์ของขั้น 3 ตรง ๆ
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default function Properties({
  shot,
  onPatch,
  onRemove,
  onPlayShot,
  onClose,
  fx,
  fxBase,
  grade,
  onFx,
}: {
  shot: Shot | null;
  onPatch: (patch: Partial<Shot>) => void;
  onRemove: () => void;
  onPlayShot: () => void;
  onClose?: () => void;
  /** เอฟเฟกต์ของชิ้นนี้ · null = เอนจินยังไม่รู้จักชิ้นนี้ (ยังไม่ได้ตัดเป็นชิ้น) */
  fx: FxClip | null;
  fxBase: FxClip | null;
  grade: Record<string, string>;
  onFx: (p: Partial<FxClip>) => void;
}) {
  // ไม่ได้คลิกช็อตบนไทม์ไลน์ → ไม่ต้องมีคอลัมน์นี้เลย ให้ Preview กินพื้นที่แทน
  if (!shot) return null;

  const maxDur = shot.clip_dur;

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] uppercase tracking-wide text-faint">
          คุณสมบัติช็อต
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="ปิด (ยกเลิกเลือกช็อต)"
            className="-mr-1 rounded-md p-1 text-muted hover:bg-panel-2 hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

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
      {fx && fxBase ? (
        <FxBlock
          fx={fx}
          base={fxBase}
          grade={grade}
          srcLen={shot.end - shot.start}
          onFx={onFx}
        />
      ) : (
        // ไม่มีกุญแจ = ชิ้นนี้ยังไม่อยู่ใน render.json — ตั้งเอฟเฟกต์ไว้ก็ไม่มีผล
        // เพราะกุญแจผูกกับ *ช่วงที่ตัดจริง* ปิดฟอร์มไว้ตรงไปตรงมากว่าให้กรอกแล้ว
        // เงียบหาย (ดู fx.orphans ที่เตือนเรื่องเดียวกันจากฝั่งเอนจิน)
        <div className="rounded-lg border border-dashed border-line-2 px-2.5 py-2 text-[11px] leading-4 text-muted">
          ยังตั้งเอฟเฟกต์กับชิ้นนี้ไม่ได้ — กด <b className="text-ink">สร้างไฟล์</b> ที่ขั้น
          3 ก่อน เอฟเฟกต์เกาะกับช่วงที่ตัดจริง ซึ่งยังไม่มี
        </div>
      )}

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
