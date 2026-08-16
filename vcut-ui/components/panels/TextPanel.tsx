"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Type } from "lucide-react";
import { api2, type CaptionsData } from "@/lib/api";
import { dur } from "@/lib/time";
import {
  CInput,
  Empty,
  Field,
  NInput,
  Panel,
  SaveBar,
  Section,
  Sel,
  Spin,
  Toggle,
} from "@/components/ui";

const ALIGNS = [
  { v: "2", label: "ล่าง-กลาง" },
  { v: "5", label: "กลางจอ" },
  { v: "8", label: "บน-กลาง" },
];

export default function TextPanel({
  reloadKey,
  runJob,
  onAddTextAtPlayhead,
  flash,
}: {
  reloadKey: number;
  runJob: (step: string) => void;
  onAddTextAtPlayhead: () => void;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<CaptionsData | null>(null);
  const [style, setStyle] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(true);
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api2.captions();
      setData(d);
      setStyle({ ...d.style });
      setEnabled(d.auto.enabled);
      setDrop(new Set(d.auto.drop));
      setEdits({ ...d.auto.edits });
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
      <Panel title={<><Type size={13} /> ข้อความ / ซับ (ขั้น 4)</>}>
        <Spin />
      </Panel>
    );
  }

  const st = <K extends string>(k: K) => style[k] as never;
  const setSt = (k: string, v: unknown) => {
    setStyle((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api2.saveCaptions({
        style,
        auto: {
          enabled,
          drop: [...drop],
          edits,
          styles: data.auto.styles,
        },
      });
      setData(r.captions);
      setDirty(false);
      flash("บันทึก captions.json แล้ว — กด 'เขียนข้อความลงไฟล์' เพื่อให้มีผลกับวิดีโอ");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={<><Type size={13} /> ข้อความ / ซับ (ขั้น 4)</>}
      footer={
        <SaveBar dirty={dirty} saving={saving} onSave={save} onRevert={load} />
      }
    >
      {!data.ffmpeg.ok && (
        <Empty>
          ffmpeg รุ่นที่เขียนข้อความได้ยังไม่มี — {data.ffmpeg.how}
        </Empty>
      )}

      <button
        onClick={onAddTextAtPlayhead}
        className="rounded-lg border border-dashed border-line-2 bg-panel-2 py-2 text-[12px] text-ink hover:bg-panel-3"
        title="สร้างข้อความบนหนัง (เลเยอร์ข้อความขั้น 5) ณ ตำแหน่งหัวเล่น"
      >
        ＋ วางข้อความบนหนังที่หัวเล่น
      </button>

      <Section title="สไตล์หลัก">
        <div className="grid grid-cols-2 gap-2">
          <Field label="ฟอนต์" span2>
            <Sel
              value={String(st("font"))}
              onChange={(v) => setSt("font", v)}
              options={[
                ...data.fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })),
                ...data.fonts.other.map((f) => ({ v: f, label: f })),
              ]}
            />
          </Field>
          <Field label="ขนาด">
            <NInput value={Number(st("size"))} step={1} min={10} onChange={(v) => setSt("size", v)} />
          </Field>
          <Field label="ตำแหน่ง">
            <Sel
              value={String(st("align"))}
              onChange={(v) => setSt("align", parseInt(v))}
              options={ALIGNS}
            />
          </Field>
          <Field label="สีตัวอักษร">
            <CInput value={String(st("color"))} onChange={(v) => setSt("color", v)} />
          </Field>
          <Field label="สีขอบ">
            <CInput value={String(st("outline"))} onChange={(v) => setSt("outline", v)} />
          </Field>
          <Field label="ความหนาขอบ">
            <NInput value={Number(st("border"))} step={0.5} min={0} onChange={(v) => setSt("border", v)} />
          </Field>
          <Field label="ระยะจากขอบจอ">
            <NInput value={Number(st("margin_v"))} step={4} min={0} onChange={(v) => setSt("margin_v", v)} />
          </Field>
        </div>
        <div className="flex gap-4">
          <Toggle value={Boolean(st("bold"))} onChange={(v) => setSt("bold", v)} label="ตัวหนา" />
          <Toggle value={Boolean(st("italic"))} onChange={(v) => setSt("italic", v)} label="ตัวเอียง" />
        </div>
      </Section>

      <Section
        title={`ซับอัตโนมัติจากบทพูด (${data.cues.length})`}
        right={
          <Toggle
            value={enabled}
            onChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
            label=""
          />
        }
      >
        {data.cues.length === 0 ? (
          <Empty>
            ยังไม่มี cue — ต้องถอดเสียง (ขั้น 2) และตัดชิ้น (render) ก่อน
          </Empty>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
            {data.cues.map((c) => {
              const hidden = drop.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`flex items-start gap-1.5 rounded-lg border border-line bg-panel-2 px-2 py-1.5 ${
                    hidden ? "opacity-40" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      setDrop((p) => {
                        const n = new Set(p);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      });
                      setDirty(true);
                    }}
                    className="mt-0.5 shrink-0 text-muted hover:text-ink"
                    title={hidden ? "แสดง cue นี้" : "ซ่อน cue นี้"}
                  >
                    {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-faint">
                      {dur(c.a)}–{dur(c.b)} · {c.name}
                      {c.kind !== "auto" && ` · ${c.kind}`}
                    </div>
                    <input
                      type="text"
                      value={edits[c.id] ?? c.text}
                      onChange={(e) => {
                        setEdits((p) => ({ ...p, [c.id]: e.target.value }));
                        setDirty(true);
                      }}
                      className="w-full bg-transparent text-[12px] text-ink outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <button
        onClick={() => runJob("build_text")}
        className="rounded-lg bg-accent/90 py-2 text-[12.5px] font-medium text-white hover:bg-accent"
      >
        เขียนข้อความลงไฟล์วิดีโอ (render + caption)
      </button>
      {data.out.exists && (
        <div className="text-[11px] text-muted">
          ไฟล์ล่าสุด: {data.out.name} ·{" "}
          {(data.out.size / 1e9).toFixed(2)} GB
        </div>
      )}
    </Panel>
  );
}
