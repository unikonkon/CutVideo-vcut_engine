"use client";

import { type RefObject, useState } from "react";
import { ChevronDown, Maximize, Pause, Play } from "lucide-react";
import { tc } from "@/lib/time";

const FITS = [
  { v: "contain", label: "Fit" },
  { v: "cover", label: "Fill" },
  { v: "fill", label: "Stretch" },
] as const;

export default function Preview({
  videoRef,
  stageRef,
  playing,
  playhead,
  total,
  onToggle,
  notice,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  playing: boolean;
  playhead: number;
  total: number;
  onToggle: () => void;
  notice: string;
}) {
  const [fit, setFit] = useState<(typeof FITS)[number]>(FITS[0]);
  const [fitOpen, setFitOpen] = useState(false);

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div
        ref={stageRef}
        className="relative m-4 mb-2 flex min-h-0 flex-1 items-center justify-center"
      >
        <video
          ref={videoRef}
          playsInline
          className="max-h-full max-w-full bg-black"
          style={{
            objectFit: fit.v,
            width: "100%",
            height: "100%",
          }}
          onClick={onToggle}
        />
        {notice && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-[11.5px] text-white">
            {notice}
          </div>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 px-4 pb-2">
        <div className="font-mono text-[12px]">
          <span className="text-accent">{tc(playhead)}</span>
          <span className="mx-1.5 text-faint">/</span>
          <span className="text-muted">{tc(total)}</span>
        </div>

        <div className="flex flex-1 justify-center">
          <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-panel-2"
            title={playing ? "หยุดชั่วคราว (Space)" : "เล่น (Space)"}
          >
            {playing ? (
              <Pause size={16} className="fill-current" />
            ) : (
              <Play size={16} className="fill-current" />
            )}
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setFitOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3"
          >
            {fit.label} <ChevronDown size={12} />
          </button>
          {fitOpen && (
            <div className="absolute bottom-9 right-0 z-40 w-28 overflow-hidden rounded-lg border border-line bg-panel-2 shadow-xl">
              {FITS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => {
                    setFit(f);
                    setFitOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-panel-3 ${
                    f.v === fit.v ? "text-accent" : "text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => stageRef.current?.requestFullscreen()}
          className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เต็มจอ"
        >
          <Maximize size={14} />
        </button>
      </div>
    </section>
  );
}
