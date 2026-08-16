"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Plus, Trash2, WandSparkles } from "lucide-react";
import {
  api2,
  type FxData,
  type FxTextItem,
  type JourneyStop,
} from "@/lib/api";
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
  TInput,
  Toggle,
} from "@/components/ui";

export default function FxPanel({
  reloadKey,
  atPlayhead,
  flash,
}: {
  reloadKey: number;
  atPlayhead: () => { name: string; at: number } | null;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<FxData | null>(null);
  const [texts, setTexts] = useState<FxTextItem[]>([]);
  const [journey, setJourney] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [showJourney, setShowJourney] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api2.fx();
      setData(d);
      setTexts(d.fx.texts.map((t) => ({ ...t })));
      setJourney(JSON.parse(JSON.stringify(d.fx.journey)));
      setDirty(false);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const shown = useMemo(
    () =>
      texts
        .map((t, i) => ({ t, i }))
        .filter(
          ({ t }) =>
            !filter ||
            t.text.includes(filter) ||
            t.name.includes(filter),
        ),
    [texts, filter],
  );

  if (!data || !journey) {
    return (
      <Panel title={<><WandSparkles size={13} /> เอฟเฟกต์ (ขั้น 5)</>}>
        <Spin />
      </Panel>
    );
  }

  const animOpts = Object.keys(
    (data.defaults.anim as Record<string, unknown>) ?? { none: 1 },
  ).map((k) => ({ v: k, label: k }));

  const patch = (i: number, p: Partial<FxTextItem>) => {
    setTexts((prev) => prev.map((t, k) => (k === i ? { ...t, ...p } : t)));
    setDirty(true);
  };

  const stops = (journey.stops as JourneyStop[]) ?? [];
  const patchStop = (i: number, p: Partial<JourneyStop>) => {
    setJourney((prev) => ({
      ...prev!,
      stops: stops.map((s, k) => (k === i ? { ...s, ...p } : s)),
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api2.saveFx({ texts, journey });
      setData(r.fx);
      setTexts(r.fx.fx.texts.map((t) => ({ ...t })));
      setJourney(JSON.parse(JSON.stringify(r.fx.fx.journey)));
      setDirty(false);
      flash("บันทึก fx.json แล้ว — มีผลตอนสร้างไฟล์แบบมีเอฟเฟกต์");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const addText = () => {
    const pos = atPlayhead();
    if (!pos) return flash("เลื่อนหัวเล่นไปตรงจังหวะที่จะให้ข้อความโผล่ก่อน");
    setTexts((p) => [
      ...p,
      {
        ...(data.defaults.text_item as Omit<FxTextItem, "at" | "dur" | "id" | "name" | "lines">),
        at: Math.round(pos.at * 100) / 100,
        dur: 2.0,
        name: pos.name,
        id: "",
        lines: [],
      },
    ]);
    setOpen(texts.length);
    setDirty(true);
  };

  return (
    <Panel
      title={<><WandSparkles size={13} /> เอฟเฟกต์ (ขั้น 5)</>}
      width="w-[24rem]"
      footer={
        <SaveBar dirty={dirty} saving={saving} onSave={save} onRevert={load} />
      }
    >
      {data.orphans.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
          มีเอฟเฟกต์ {data.orphans.length} ชิ้นที่เกาะช่วงซึ่งไม่อยู่ในไทม์ไลน์แล้ว
        </div>
      )}

      <Section
        title={`ข้อความบนหนัง (${texts.length})`}
        right={
          <button
            onClick={addText}
            className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-[11.5px] text-ink hover:bg-panel-3"
          >
            <Plus size={12} /> ที่หัวเล่น
          </button>
        }
      >
        {texts.length > 6 && (
          <TInput value={filter} onChange={setFilter} placeholder="ค้นหาข้อความ/คลิป…" />
        )}
        {texts.length === 0 ? (
          <Empty>ยังไม่มีข้อความ — เลื่อนหัวเล่นแล้วกด &ldquo;+ ที่หัวเล่น&rdquo;</Empty>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
            {shown.map(({ t, i }) => (
              <div key={i} className="rounded-lg border border-line bg-panel-2">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                >
                  {open === i ? (
                    <ChevronDown size={12} className="shrink-0 text-muted" />
                  ) : (
                    <ChevronRight size={12} className="shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {t.text || "(ว่าง)"}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">
                    {t.name} @{t.at.toFixed(1)}
                  </span>
                </button>
                {open === i && (
                  <div className="flex flex-col gap-2 border-t border-line p-2">
                    <TInput value={t.text} onChange={(v) => patch(i, { text: v })} />
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="โผล่วินาที (ในคลิป)">
                        <NInput value={t.at} min={0} onChange={(v) => patch(i, { at: v })} />
                      </Field>
                      <Field label="นาน (วิ)">
                        <NInput value={t.dur} min={0.2} onChange={(v) => patch(i, { dur: v })} />
                      </Field>
                      <Field label="ขนาด">
                        <NInput value={t.size} step={2} min={10} onChange={(v) => patch(i, { size: v })} />
                      </Field>
                      <Field label="X (0-1)">
                        <NInput value={t.x} step={0.05} min={0} max={1} onChange={(v) => patch(i, { x: v })} />
                      </Field>
                      <Field label="Y (0-1)">
                        <NInput value={t.y} step={0.05} min={0} max={1} onChange={(v) => patch(i, { y: v })} />
                      </Field>
                      <Field label="แอนิเมชัน">
                        <Sel value={t.anim} onChange={(v) => patch(i, { anim: v })} options={animOpts} />
                      </Field>
                      <Field label="สี" span2>
                        <CInput value={t.color} onChange={(v) => patch(i, { color: v })} />
                      </Field>
                      <Field label="ขอบ">
                        <NInput value={t.border} step={0.5} min={0} onChange={(v) => patch(i, { border: v })} />
                      </Field>
                    </div>
                    <div className="flex items-center gap-4">
                      <Toggle value={t.bold} onChange={(v) => patch(i, { bold: v })} label="หนา" />
                      <Toggle value={t.plate} onChange={(v) => patch(i, { plate: v })} label="พื้นหลังทึบ" />
                      <div className="flex-1" />
                      <button
                        onClick={() => {
                          setTexts((p) => p.filter((_, k) => k !== i));
                          setOpen(null);
                          setDirty(true);
                        }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={12} /> ลบ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`แผนที่เส้นทาง (${stops.length} หมุด)`}
        right={
          <Toggle
            value={Boolean(journey.enabled)}
            onChange={(v) => {
              setJourney((p) => ({ ...p!, enabled: v }));
              setDirty(true);
            }}
            label=""
          />
        }
      >
        <button
          onClick={() => setShowJourney((v) => !v)}
          className="flex items-center gap-1.5 text-left text-[11.5px] text-muted hover:text-ink"
        >
          <MapPin size={12} />
          {showJourney ? "ซ่อนรายการหมุด" : "แสดงรายการหมุด"}
        </button>
        {showJourney &&
          stops.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-1.5 rounded-lg border border-line bg-panel-2 p-2"
            >
              <Field label={`หมุด ${i + 1} · ${s.name || "?"} @${dur(s.at)}`}>
                <TInput value={s.label} onChange={(v) => patchStop(i, { label: v })} />
              </Field>
              <Field label="ระยะ (ม.)">
                <NInput value={s.dist} step={100} min={0} onChange={(v) => patchStop(i, { dist: v })} />
              </Field>
              <Field label="สี">
                <CInput value={s.color} onChange={(v) => patchStop(i, { color: v })} />
              </Field>
              <button
                onClick={() => {
                  setJourney((p) => ({
                    ...p!,
                    stops: stops.filter((_, k) => k !== i),
                  }));
                  setDirty(true);
                }}
                className="mb-1 rounded-md p-1.5 text-muted hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        {showJourney && (
          <button
            onClick={() => {
              const pos = atPlayhead();
              if (!pos) return flash("เลื่อนหัวเล่นไปตรงช็อตของหมุดก่อน");
              setJourney((p) => ({
                ...p!,
                stops: [
                  ...stops,
                  {
                    ...(data.defaults.stop as JourneyStop),
                    name: pos.name,
                    at: Math.round(pos.at * 100) / 100,
                  },
                ],
              }));
              setDirty(true);
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line-2 py-1.5 text-[11.5px] text-muted hover:text-ink"
          >
            <Plus size={12} /> เพิ่มหมุดที่หัวเล่น (ตำแหน่งบนแผนที่แก้ใน viewer เดิม)
          </button>
        )}
      </Section>
    </Panel>
  );
}
