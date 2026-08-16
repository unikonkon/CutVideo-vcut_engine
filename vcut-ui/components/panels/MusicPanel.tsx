"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Music, Plus, Trash2, Upload } from "lucide-react";
import {
  api2,
  assetUrl,
  fileToBase64,
  type FxData,
  type MusicTrack,
} from "@/lib/api";
import { dur } from "@/lib/time";
import {
  Empty,
  Field,
  NInput,
  Panel,
  SaveBar,
  Section,
  Sel,
  Spin,
  TInput,
  Toggle,
} from "@/components/ui";

export default function MusicPanel({
  reloadKey,
  onMusicFetch,
  flash,
}: {
  reloadKey: number;
  onMusicFetch: (url: string) => void;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<FxData | null>(null);
  const [items, setItems] = useState<MusicTrack[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [yt, setYt] = useState("");
  const [addFile, setAddFile] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api2.fx();
      setData(d);
      setItems(d.music.items.map((m) => ({ ...m })));
      setDirty(false);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!data) {
    return (
      <Panel title={<><Music size={13} /> เพลงประกอบ</>}>
        <Spin />
      </Panel>
    );
  }

  const patch = (i: number, p: Partial<MusicTrack>) => {
    setItems((prev) => prev.map((m, k) => (k === i ? { ...m, ...p } : m)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api2.saveFx({ music: items });
      setData(r.fx);
      setItems(r.fx.music.items.map((m) => ({ ...m })));
      setDirty(false);
      flash("บันทึกเพลงแล้ว — มีผลตอนสร้างไฟล์แบบมีเอฟเฟกต์ (ขั้น 5)");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const uploadAudio = async (f: File) => {
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "audio");
      setData(r.fx);
      flash(`เพิ่มไฟล์เพลง ${r.file} เข้าคลังแล้ว`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };

  const unused = data.music.tracks.filter(
    (t) => !items.some((m) => m.file === t),
  );

  return (
    <Panel
      title={<><Music size={13} /> เพลงประกอบ ({items.length} แทร็ก)</>}
      footer={
        <SaveBar dirty={dirty} saving={saving} onSave={save} onRevert={load} />
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
          <div className="flex gap-1.5">
            <Sel
              value={addFile}
              onChange={setAddFile}
              options={[
                { v: "", label: "— เลือกไฟล์ในคลังมาใช้ —" },
                ...unused.map((t) => ({ v: t, label: t })),
              ]}
            />
            <button
              onClick={() => {
                if (!addFile) return;
                setItems((p) => [
                  ...p,
                  { ...data.music.defaults, file: addFile, id: "" },
                ]);
                setAddFile("");
                setDirty(true);
              }}
              className="shrink-0 rounded-lg border border-line bg-panel-2 px-2.5 text-ink hover:bg-panel-3"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
      </Section>

      <Section title="แทร็กในหนัง">
        {items.length === 0 ? (
          <Empty>ยังไม่มีเพลง — ดึงจาก YouTube หรืออัปโหลดไฟล์ก่อน</Empty>
        ) : (
          items.map((m, i) => (
            <div
              key={`${m.file}-${i}`}
              className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={m.file}>
                  {m.file}
                </span>
                {data.music.missing.includes(m.file) && (
                  <span className="shrink-0 text-[10.5px] text-danger">ไม่พบไฟล์</span>
                )}
                <audio src={assetUrl(m.file)} controls preload="none" className="h-7 w-28" />
                <button
                  onClick={() => {
                    setItems((p) => p.filter((_, k) => k !== i));
                    setDirty(true);
                  }}
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
          ))
        )}
      </Section>
      <div className="text-[11px] leading-5 text-muted">
        เพลงถูกผสมตอน &ldquo;สร้างพร้อมเอฟเฟกต์&rdquo; (ปุ่ม Export) — ไฟล์เพลงอยู่ใน
        .vcut/assets ของโปรเจกต์
      </div>
    </Panel>
  );
}
