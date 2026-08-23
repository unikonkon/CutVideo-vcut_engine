"use client";

import { useRef, useState } from "react";
import {
  Download,
  GripVertical,
  Music,
  Play,
  SlidersVertical,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { api2, assetUrl, fileToBase64, type MusicTrack } from "@/lib/api";
import { DND_MIME } from "@/lib/layers";
import { SFX_CATS, SFX_LIST, sfxUrl } from "@/lib/sfx";
import {
  Empty,
  Fader,
  Field,
  NInput,
  Panel,
  SaveBar,
  Section,
  Spin,
  TInput,
  Toggle,
} from "@/components/ui";
import type { FxStore } from "./types";

export default function MusicPanel({
  fxs,
  onMusicFetch,
  onAddAtPlayhead,
  onAddSfxAtPlayhead,
  onToggleMixer,
  focusIdx,
  flash,
}: {
  fxs: FxStore;
  onMusicFetch: (url: string) => void;
  onAddAtPlayhead: (file: string) => void;
  onAddSfxAtPlayhead: (file: string, dur: number, loop: boolean) => void;
  onToggleMixer: () => void;
  focusIdx: number | null;
  flash: (m: string) => void;
}) {
  const [yt, setYt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // ตัวเล่นลองฟังเสียงเอฟเฟกต์ — ใช้ตัวเดียว กดเสียงใหม่แล้วตัวเก่าหยุดเอง
  const sfxPlayer = useRef<HTMLAudioElement | null>(null);
  const previewSfx = (file: string) => {
    if (!sfxPlayer.current) sfxPlayer.current = new Audio();
    const a = sfxPlayer.current;
    a.pause();
    a.src = sfxUrl(file);
    a.currentTime = 0;
    a.play().catch(() => flash("เล่นตัวอย่างเสียงไม่ได้"));
  };

  if (!fxs.data || !fxs.draft) {
    return (
      <Panel title={<><Music size={13} /> เพลงประกอบ</>}>
        <Spin />
      </Panel>
    );
  }

  const { data, draft } = fxs;
  const items = draft.music;

  const patch = (i: number, p: Partial<MusicTrack>) =>
    fxs.patch({ music: items.map((m, k) => (k === i ? { ...m, ...p } : m)) });

  const uploadAudio = async (f: File) => {
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "audio");
      fxs.setData(r.fx);
      flash(`เพิ่มไฟล์เพลง ${r.file} เข้าคลังแล้ว — ลากลงไทม์ไลน์ได้เลย`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };

  // ไฟล์เสียงเอฟเฟกต์ตัวอย่างมีหมวดของตัวเองอยู่แล้ว — ไม่ต้องโชว์ซ้ำตรงนี้
  const unused = data.music.tracks.filter(
    (t) =>
      !items.some((m) => m.file === t) &&
      !SFX_LIST.some((s) => s.file === t),
  );

  return (
    <Panel
      title={<><Music size={13} /> เพลงประกอบ ({items.length} แทร็ก)</>}
      footer={
        <SaveBar
          dirty={fxs.dirty}
          saving={fxs.saving}
          onSave={fxs.save}
          onRevert={fxs.revert}
          hint="FX ยังไม่บันทึก (รวมทุกเลเยอร์)"
        />
      }
    >
      <Section title="เพิ่มเพลงเข้าคลัง">
        <div className="flex gap-1.5">
          <TInput value={yt} onChange={setYt} placeholder="วางลิงก์ YouTube…" mono />
          <button
            onClick={() => {
              if (!yt.trim()) return flash("ใส่ลิงก์ก่อน");
              onMusicFetch(yt.trim());
              setYt("");
            }}
            disabled={!data.music.fetch.ok}
            title={data.music.fetch.ok ? "ดึงเสียงด้วย yt-dlp" : data.music.fetch.how}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel-2 px-2.5 text-[12px] text-ink hover:bg-panel-3 disabled:opacity-40"
          >
            <Download size={12} /> ดึง
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="อัปโหลดไฟล์เสียง (mp3/m4a/wav ≤40MB)"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel-2 px-2.5 text-[12px] text-ink hover:bg-panel-3"
          >
            <Upload size={12} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAudio(f);
              e.target.value = "";
            }}
          />
        </div>
        {unused.length > 0 && (
          <div className="flex flex-col gap-1">
            {unused.map((t) => (
              <div
                key={t}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    DND_MIME,
                    JSON.stringify({ type: "music-file", file: t }),
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex cursor-grab items-center gap-1.5 rounded-lg border border-dashed border-line-2 bg-panel-2 px-2 py-1.5 active:cursor-grabbing"
                title="ลากลงเลเยอร์เพลงบนไทม์ไลน์ หรือกดปุ่มเพื่อวางที่หัวเล่น"
              >
                <GripVertical size={12} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">{t}</span>
                <button
                  onClick={() => onAddAtPlayhead(t)}
                  className="shrink-0 rounded bg-panel-3 px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink"
                >
                  ＋ ที่หัวเล่น
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`เสียงเอฟเฟกต์ (${SFX_LIST.length} เสียงตัวอย่าง · ${SFX_CATS.length} หมวด)`}
      >
        {SFX_CATS.map((c) => (
          <div key={c.key} className="flex flex-col gap-1">
            <div className="text-[10.5px] font-medium text-muted">{c.label}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SFX_LIST.filter((s) => s.cat === c.key).map((s) => (
                <div
                  key={s.file}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      DND_MIME,
                      JSON.stringify({
                        type: "sfx",
                        file: s.file,
                        dur: s.dur,
                        loop: !!s.loop,
                      }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex cursor-grab items-center gap-1 rounded-lg border border-dashed border-line-2 bg-panel-2 px-1.5 py-1 active:cursor-grabbing"
                  title="ลากลงเลเยอร์เพลงบนไทม์ไลน์ หรือกด ＋ เพื่อวางที่หัวเล่น"
                >
                  <button
                    onClick={() => previewSfx(s.file)}
                    className="shrink-0 rounded p-1 text-muted hover:text-ink"
                    title="ลองฟัง"
                  >
                    <Play size={11} />
                  </button>
                  <Zap size={10} className="shrink-0 text-warn" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                    {s.label}
                    <span className="ml-1 text-[9.5px] text-faint">
                      {s.dur.toFixed(1)}s
                    </span>
                  </span>
                  <button
                    onClick={() => onAddSfxAtPlayhead(s.file, s.dur, !!s.loop)}
                    className="shrink-0 rounded bg-panel-3 px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink"
                    title="วางเสียงนี้ตรงหัวเล่น"
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10.5px] leading-4 text-muted">
          เสียงสังเคราะห์ให้เริ่มต้น — ใช้ครั้งแรกระบบจะเพิ่มไฟล์เข้าคลังของโปรเจกต์ให้เอง
          หมวดบรรยากาศวนซ้ำอัตโนมัติ ยืดบล็อกบนไทม์ไลน์ได้ตามใจ (เสียงซ้อนสูงสุด 6 ชั้น)
        </div>
      </Section>

      <Section title="แทร็กในหนัง">
        <button
          onClick={onToggleMixer}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3"
          title="เปิด/ปิดมิกเซอร์รวม — ปรับความดังทุกแทร็กในจอเดียว"
        >
          <SlidersVertical size={12} /> มิกเซอร์รวม
        </button>
        {items.length === 0 ? (
          <Empty>ยังไม่มีเพลง — ดึงจาก YouTube แล้วลากลงไทม์ไลน์</Empty>
        ) : (
          items.map((m, i) => (
            <div
              key={`${m.file}-${i}`}
              className={`flex gap-2 rounded-lg border bg-panel-2 p-2.5 ${
                focusIdx === i ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={m.file}>
                    {m.file}
                  </span>
                  {data.music.missing.includes(m.file) && (
                    <span className="shrink-0 text-[10.5px] text-danger">ไม่พบไฟล์</span>
                  )}
                  <audio src={assetUrl(m.file)} controls preload="none" className="h-7 w-28" />
                  <button
                    onClick={() => fxs.patch({ music: items.filter((_, k) => k !== i) })}
                    className="shrink-0 rounded-md p-1 text-muted hover:text-danger"
                    title="เอาแทร็กออก (ไฟล์ยังอยู่ในคลัง)"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="เริ่มที่ (วิ)">
                    <NInput value={m.at} min={0} onChange={(v) => patch(i, { at: v })} />
                  </Field>
                  <Field label="ยาว (0=จนจบ)">
                    <NInput value={m.dur} min={0} onChange={(v) => patch(i, { dur: v })} />
                  </Field>
                  <Field label="ดัง (dB)">
                    <NInput value={m.gain_db} step={0.5} onChange={(v) => patch(i, { gain_db: v })} />
                  </Field>
                  <Field label="เฟดเข้า (วิ)">
                    <NInput value={m.fade_in} min={0} onChange={(v) => patch(i, { fade_in: v })} />
                  </Field>
                  <Field label="เฟดออก (วิ)">
                    <NInput value={m.fade_out} min={0} onChange={(v) => patch(i, { fade_out: v })} />
                  </Field>
                  <Field label="หลบเสียงพูด (dB)">
                    <NInput value={m.duck_db} min={0} onChange={(v) => patch(i, { duck_db: v })} />
                  </Field>
                </div>
                <div className="flex gap-4">
                  <Toggle value={m.loop} onChange={(v) => patch(i, { loop: v })} label="วนซ้ำ" />
                  <Toggle value={m.duck} onChange={(v) => patch(i, { duck: v })} label="เบาลงตอนมีเสียงพูด" />
                </div>
              </div>
              {/* fader ความดังข้างการ์ด — ตัวเดียวกับช่อง ดัง (dB) แค่ลากได้ */}
              <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-l border-line pl-2">
                <Fader value={m.gain_db} onChange={(v) => patch(i, { gain_db: v })} />
                <span className="font-mono text-[9.5px] text-muted">
                  {m.gain_db > 0 ? "+" : ""}
                  {m.gain_db.toFixed(1)}dB
                </span>
              </div>
            </div>
          ))
        )}
      </Section>
      <div className="text-[11px] leading-5 text-muted">
        ลากแทร็กบนเลเยอร์ &ldquo;เพลง&rdquo; ของไทม์ไลน์เพื่อเลื่อนเวลาได้เลย —
        เพลงถูกผสมจริงตอน Export แบบมีเอฟเฟกต์
      </div>
    </Panel>
  );
}
