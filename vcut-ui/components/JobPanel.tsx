"use client";

import { CheckCircle2, Loader2, Square, X, XCircle } from "lucide-react";
import { engine, type JobState } from "@/lib/api";

export default function JobPanel({
  job,
  lines,
  onStop,
  onClose,
}: {
  job: JobState;
  lines: string[];
  onStop: () => void;
  onClose: () => void;
}) {
  const pct =
    job.progress && job.progress.total > 0
      ? Math.round((job.progress.n / job.progress.total) * 100)
      : null;
  const done = !job.running && job.code != null;
  const ok = done && job.code === 0 && !job.stopped;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 overflow-hidden rounded-xl border border-line bg-panel-2 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        {job.running ? (
          <Loader2 size={14} className="animate-spin text-accent" />
        ) : ok ? (
          <CheckCircle2 size={14} className="text-ok" />
        ) : (
          <XCircle size={14} className="text-danger" />
        )}
        <span className="text-[12.5px] font-medium text-ink">
          {job.running
            ? `กำลัง${job.cmd_label || job.step}`
            : ok
              ? `เสร็จแล้ว (${Math.round(job.elapsed)} วิ)`
              : job.stopped
                ? "หยุดแล้ว"
                : `ไม่สำเร็จ (รหัส ${job.code})`}
        </span>
        {job.of > 1 && (
          <span className="text-[11px] text-muted">
            ขั้น {job.at}/{job.of}
          </span>
        )}
        <div className="flex-1" />
        {job.running ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger/10"
          >
            <Square size={10} className="fill-current" /> หยุด
          </button>
        ) : (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-panel-3 hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {job.progress && (
        <div className="border-b border-line px-3 py-2">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>
              {job.progress.label || "กำลังทำ"} {job.progress.note}
            </span>
            <span className="font-mono">
              {job.progress.n}/{job.progress.total}
              {job.progress.eta && ` · เหลือ ~${job.progress.eta}`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[10.5px] leading-4 text-muted">
        {lines.slice(-60).join("\n") || "…"}
      </pre>

      {ok && (
        <div className="border-t border-line px-3 py-2">
          <a
            href={`${engine}/out`}
            target="_blank"
            className="text-[12px] font-medium text-accent hover:underline"
          >
            เปิดไฟล์ที่ต่อเสร็จแล้ว →
          </a>
        </div>
      )}
    </div>
  );
}
