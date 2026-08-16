"use client";

import { useCallback, useEffect, useState } from "react";
import { Captions, ChevronDown, ChevronRight, FileDown, Plus } from "lucide-react";
import { api2, textFileUrl, type TranscriptData } from "@/lib/api";
import { DND_MIME } from "@/lib/layers";
import { dur } from "@/lib/time";
import { Empty, Panel, Spin } from "@/components/ui";

export default function TranscriptPanel({
  reloadKey,
  onAddText,
}: {
  reloadKey: number;
  onAddText: (text: string) => void;
}) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api2.transcript());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!data) {
    return (
      <Panel title={<><Captions size={13} /> บทพูด</>}>
        <Spin />
      </Panel>
    );
  }

  const withSpeech = data.order.filter((n) => (data.clips[n] ?? []).length > 0);

  return (
    <Panel title={<><Captions size={13} /> บทพูดที่ถอดไว้</>}>
      {!data.exists ? (
        <Empty>ยังไม่ได้ถอดเสียง — รันขั้น &ldquo;ฟังเสียง&rdquo; ก่อน</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
            <div className="rounded-lg bg-panel-2 px-2.5 py-2">
              <div className="text-lg font-semibold text-ink">
                {data.summary.with_speech}
              </div>
              <div className="text-muted">คลิปที่มีเสียงพูด</div>
            </div>
            <div className="rounded-lg bg-panel-2 px-2.5 py-2">
              <div className="text-lg font-semibold text-ink">
                {dur(data.summary.speech)}
              </div>
              <div className="text-muted">ความยาวเสียงพูดรวม</div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {withSpeech.map((name) => {
              const segs = data.clips[name] ?? [];
              const files = data.files[name] ?? [];
              const isOpen = open === name;
              return (
                <div key={name} className="rounded-lg border border-line bg-panel-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <button
                      onClick={() => setOpen(isOpen ? null : name)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown size={12} className="shrink-0 text-muted" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                        {name}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-faint">
                        {segs.length} ท่อน
                      </span>
                    </button>
                    {files.map((ext) => (
                      <a
                        key={ext}
                        href={textFileUrl(name, ext)}
                        target="_blank"
                        className="flex shrink-0 items-center gap-0.5 rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
                        title={`โหลด .${ext}`}
                      >
                        <FileDown size={10} /> {ext}
                      </a>
                    ))}
                  </div>
                  {isOpen && (
                    <div className="flex flex-col gap-1 border-t border-line p-2">
                      {segs.map(([a, b, text], i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              DND_MIME,
                              JSON.stringify({ type: "transcript", text }),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="group flex cursor-grab gap-2 rounded px-1 py-0.5 text-[12px] hover:bg-panel-3 active:cursor-grabbing"
                          title="ลากไปปล่อยบนไทม์ไลน์ = ทำเป็นข้อความบนหนังตรงจุดนั้น"
                        >
                          <span className="shrink-0 font-mono text-[10px] leading-5 text-faint">
                            {dur(a)}–{dur(b)}
                          </span>
                          <span className="min-w-0 flex-1 text-ink">{text}</span>
                          <button
                            onClick={() => onAddText(text)}
                            title="ทำเป็นข้อความบนหนังที่หัวเล่น"
                            className="hidden shrink-0 rounded bg-panel-3 px-1 text-muted hover:text-ink group-hover:block"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
