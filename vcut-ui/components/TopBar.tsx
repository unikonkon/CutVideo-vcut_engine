"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clapperboard,
  Loader2,
  RotateCcw,
  Save,
  Square,
  Upload,
} from "lucide-react";
import { engine, type JobState } from "@/lib/api";

const EXPORTS = [
  {
    step: "build",
    label: "สร้างไฟล์วิดีโอ",
    desc: "ตัดชิ้นที่แก้ แล้วต่อเป็นไฟล์เดียว (render + assemble)",
  },
  {
    step: "build_text",
    label: "สร้างพร้อมข้อความ",
    desc: "render + เขียนข้อความ/ซับลงภาพ",
  },
  {
    step: "build_fx",
    label: "สร้างพร้อมเอฟเฟกต์",
    desc: "render + เพลง · ภาพซ้อน · เอฟเฟกต์ขั้น 5",
  },
];

export default function TopBar({
  project,
  dirty,
  needRender,
  saving,
  onSave,
  onRevert,
  fxDirty,
  fxSaving,
  onSaveFx,
  onRevertFx,
  job,
  onRun,
  onStop,
  outExists,
  outStale,
}: {
  project: string;
  dirty: boolean;
  needRender: number;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
  fxDirty: boolean;
  fxSaving: boolean;
  onSaveFx: () => void;
  onRevertFx: () => void;
  job: JobState | null;
  onRun: (step: string) => void;
  onStop: () => void;
  outExists: boolean;
  outStale: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const running = !!job?.running;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 px-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
          <Clapperboard size={15} className="text-black" />
        </div>
        <span className="text-[13px] font-medium text-ink">{project}</span>
        {dirty && (
          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">
            ยังไม่บันทึก
          </span>
        )}
      </div>

      <div className="flex-1" />

      {dirty && (
        <>
          <button
            onClick={onRevert}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:bg-panel-2 hover:text-ink"
          >
            <RotateCcw size={13} /> ย้อนกลับ
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-panel-3 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-line-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            บันทึก EDL
            {needRender > 0 && (
              <span className="text-warn">· ตัดใหม่ {needRender} ชิ้น</span>
            )}
          </button>
        </>
      )}

      {fxDirty && (
        <>
          <button
            onClick={onRevertFx}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:bg-panel-2 hover:text-ink"
            title="ทิ้งที่แก้เลเยอร์/เอฟเฟกต์ทั้งหมด"
          >
            <RotateCcw size={13} /> ทิ้ง FX
          </button>
          <button
            onClick={onSaveFx}
            disabled={fxSaving}
            className="flex items-center gap-1.5 rounded-lg border border-broll/50 bg-broll/20 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-broll/30 disabled:opacity-50"
            title="บันทึกเลเยอร์ (ข้อความ/สติกเกอร์/เพลง/แผนที่) ลง fx.json"
          >
            {fxSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            บันทึก FX
          </button>
        </>
      )}

      {outExists && !running && (
        <a
          href={`${engine}/out`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:bg-panel-2 hover:text-ink"
          title={outStale ? "ไฟล์เก่ากว่าไทม์ไลน์ล่าสุด — สั่งสร้างใหม่" : "เปิดไฟล์ที่ต่อเสร็จแล้ว"}
        >
          {outStale ? (
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          ) : (
            <Check size={13} className="text-ok" />
          )}
          ไฟล์ล่าสุด
        </a>
      )}

      {running ? (
        <button
          onClick={onStop}
          className="flex items-center gap-2 rounded-lg bg-panel-3 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-line-2"
        >
          <Loader2 size={13} className="animate-spin text-accent" />
          {job?.cmd_label || job?.step}…
          <Square size={11} className="fill-danger text-danger" />
        </button>
      ) : (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/90 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_14px_rgba(59,130,246,0.35)] hover:bg-accent"
          >
            <Upload size={13} /> Export <ChevronDown size={12} />
          </button>
          {open && (
            <div className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-xl border border-line bg-panel-2 shadow-2xl">
              {EXPORTS.map((e) => (
                <button
                  key={e.step}
                  onClick={() => {
                    setOpen(false);
                    onRun(e.step);
                  }}
                  className="block w-full px-3.5 py-2.5 text-left hover:bg-panel-3"
                >
                  <div className="text-[12.5px] font-medium text-ink">
                    {e.label}
                  </div>
                  <div className="text-[11px] text-muted">{e.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
