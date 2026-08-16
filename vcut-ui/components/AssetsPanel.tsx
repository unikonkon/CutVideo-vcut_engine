"use client";

import { useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  List,
  Loader2,
  Plus,
  ScanSearch,
  Upload,
} from "lucide-react";
import { thumbUrl, uploadClip, type ClipInfo } from "@/lib/api";
import { dur } from "@/lib/time";

interface UpItem {
  name: string;
  pct: number;
  error?: string;
}

export default function AssetsPanel({
  clips,
  usage,
  onAdd,
  onPreview,
  onScan,
  busy,
  flash,
}: {
  clips: ClipInfo[];
  usage: Map<string, number>;
  onAdd: (clip: ClipInfo) => void;
  onPreview: (clip: ClipInfo) => void;
  onScan: () => void;
  busy: boolean;
  flash: (m: string) => void;
}) {
  const [byDur, setByDur] = useState(false);
  const [ups, setUps] = useState<UpItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = byDur ? [...clips].sort((a, b) => b.dur - a.dur) : clips;

  const startUpload = async (files: FileList) => {
    setUploading(true);
    const list = [...files];
    setUps(list.map((f) => ({ name: f.name, pct: 0 })));
    let okCount = 0;
    // ทีละไฟล์ — เอนจินเขียนดิสก์ก้อนใหญ่อยู่แล้ว ยิงพร้อมกันไม่ได้ช่วยให้เร็วขึ้น
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadClip(list[i], (pct) =>
          setUps((p) => p.map((u, k) => (k === i ? { ...u, pct } : u))),
        );
        okCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "ไม่สำเร็จ";
        setUps((p) => p.map((u, k) => (k === i ? { ...u, error: msg } : u)));
      }
    }
    setUploading(false);
    if (okCount > 0) {
      flash(`อัปโหลด ${okCount}/${list.length} ไฟล์แล้ว — กำลังสแกนเข้าคลัง`);
      setUps([]);
      onScan();
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="text-[12.5px] font-medium text-muted">
          คลังคลิป <span className="text-faint">({clips.length})</span>
        </span>
        <div className="flex-1" />
        <button
          className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เรียงตามลำดับโปรเจกต์"
          onClick={() => setByDur(false)}
        >
          <List size={14} className={byDur ? "" : "text-accent"} />
        </button>
        <button
          className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เรียงตามความยาว"
          onClick={() => setByDur(true)}
        >
          <ArrowDownWideNarrow size={14} className={byDur ? "text-accent" : ""} />
        </button>
        <button
          onClick={onScan}
          disabled={busy}
          className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-50"
          title="อ่านโฟลเดอร์ฟุตเทจใหม่ (vcut scan)"
        >
          <ScanSearch size={14} />
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ml-1 flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3 disabled:opacity-50"
          title="อัปโหลดคลิปวิดีโอเข้าโฟลเดอร์ฟุตเทจ แล้วสแกนเข้าคลังให้เอง"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          อัปโหลด
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".mov,.mp4,.m4v,video/quicktime,video/mp4"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) startUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {ups.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-line px-3 py-2">
          {ups.map((u) => (
            <div key={u.name} className="text-[11px]">
              <div className="flex justify-between text-muted">
                <span className="truncate">{u.name}</span>
                <span className={u.error ? "text-danger" : "font-mono"}>
                  {u.error ?? `${u.pct}%`}
                </span>
              </div>
              {!u.error && (
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-panel-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${u.pct}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {clips.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="rounded-xl border border-dashed border-line-2 p-8 text-[12px] leading-5 text-muted">
            ยังไม่มีคลิปในคลัง
            <br />
            วางไฟล์วิดีโอลงโฟลเดอร์ฟุตเทจ แล้วกด &ldquo;สแกน&rdquo;
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2">
          {shown.map((c) => {
            const used = usage.get(c.name) ?? 0;
            return (
              <div
                key={c.name}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border ${
                  c.picked ? "border-line" : "border-line opacity-40"
                } bg-panel-2 hover:border-line-2`}
                onClick={() => onPreview(c)}
                title={`${c.name} · ${c.w}×${c.h} ${c.codec}`}
              >
                <div className="relative aspect-video bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(c.name)}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0";
                    }}
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
                    {dur(c.dur)}
                  </span>
                  {used > 0 && (
                    <span className="absolute left-1 top-1 rounded bg-accent/90 px-1 text-[10px] font-medium text-white">
                      ใช้ {used}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(c);
                    }}
                    title="เพิ่มลงท้ายไทม์ไลน์"
                    className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-accent group-hover:flex"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="truncate px-1.5 py-1 text-[11px] text-muted">
                  {c.name}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
