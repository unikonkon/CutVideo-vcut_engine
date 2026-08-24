"use client";

// มิกเซอร์เสียงรวม — แผงลอยด้านขวา เห็นทุกแทร็ก (เพลง + เสียงเอฟเฟกต์) เป็น
// fader แนวตั้งเหมือนโต๊ะมิกซ์ ลากปรับ gain_db ได้ทีละตัว  แก้ลง fx draft
// ตัวเดียวกับแผงเพลง/ไทม์ไลน์ — ได้ยินผลทันทีตอนเล่น และบันทึกด้วยปุ่มบันทึก FX

import { SlidersVertical, X } from "lucide-react";
import type { MusicTrack } from "@/lib/api";
import { bgmLabel } from "@/lib/bgm";
import { SFX_LIST } from "@/lib/sfx";
import { Fader } from "@/components/ui";

export default function MixerPanel({
  tracks,
  focusIdx,
  onGain,
  onSelect,
  onClose,
}: {
  tracks: MusicTrack[];
  focusIdx: number | null;
  onGain: (idx: number, db: number) => void;
  onSelect: (idx: number) => void;
  onClose: () => void;
}) {
  // ชื่อไฟล์ของเสียงตัวอย่างอ่านไม่ออกในแถบแคบ ๆ (bgm-travel-open) — ป้ายไทย
  // ของแคตตาล็อกอ่านออกกว่า ส่วนไฟล์ที่คนเอาเข้าเองใช้ชื่อไฟล์ตามเดิม
  const labelOf = (m: MusicTrack) =>
    SFX_LIST.find((s) => s.file === m.file)?.label ??
    bgmLabel(m.file) ??
    m.file.replace(/\.[^.]+$/, "");

  return (
    <div className="fixed right-3 top-1/2 z-[60] -translate-y-1/2 rounded-xl border border-line-2 bg-panel shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <SlidersVertical size={13} className="text-accent" />
        <span className="flex-1 text-[12px] font-medium text-ink">
          มิกเซอร์เสียง ({tracks.length})
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted hover:text-ink"
          title="ปิดมิกเซอร์"
        >
          <X size={13} />
        </button>
      </div>
      {tracks.length === 0 ? (
        <div className="px-4 py-6 text-center text-[11.5px] text-muted">
          ยังไม่มีแทร็กเสียงในหนัง
        </div>
      ) : (
        <div className="flex max-w-[70vw] gap-1 overflow-x-auto p-2">
          {tracks.map((m, i) => (
            <div
              key={`${m.file}-${i}`}
              className={`flex w-14 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 ${
                focusIdx === i
                  ? "border-accent bg-panel-2"
                  : "border-transparent hover:bg-panel-2"
              }`}
              onClick={() => onSelect(i)}
              title={`${m.file} — คลิกเพื่อเปิดในแผงเพลง`}
            >
              <span className="w-full truncate text-center text-[9.5px] leading-3 text-muted">
                {labelOf(m)}
              </span>
              <Fader value={m.gain_db} onChange={(v) => onGain(i, v)} h={88} />
              <span className="font-mono text-[9.5px] text-ink">
                {m.gain_db > 0 ? "+" : ""}
                {m.gain_db.toFixed(1)}
              </span>
              <span className="text-[8.5px] text-faint">dB</span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-line px-3 py-1.5 text-[9.5px] leading-3.5 text-muted">
        ลากขึ้นดัง · ลากลงเบา — มีผลทันทีตอนเล่น
      </div>
    </div>
  );
}
