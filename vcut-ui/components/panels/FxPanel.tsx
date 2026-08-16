"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MapPin,
  Plus,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { type FxTextItem, type JourneyStop } from "@/lib/api";
import { DND_MIME } from "@/lib/layers";
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
import type { FxStore } from "./types";

export default function FxPanel({
  fxs,
  onAddAtPlayhead,
  focusIdx,
  flash,
}: {
  fxs: FxStore;
  onAddAtPlayhead: () => void;
  focusIdx: number | null;
  flash: (m: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [showJourney, setShowJourney] = useState(false);

  // คลิกบล็อกบนไทม์ไลน์ → เปิดชิ้นนั้นในแผงทันที
  useEffect(() => {
    if (focusIdx != null) setOpen(focusIdx);
  }, [focusIdx]);

  const texts = fxs.draft?.texts ?? [];
  const shown = useMemo(
    () =>
      texts
        .map((t, i) => ({ t, i }))
        .filter(
          ({ t }) => !filter || t.text.includes(filter) || t.name.includes(filter),
        ),
    [texts, filter],
  );

  if (!fxs.data || !fxs.draft) {
    return (
      <Panel title={<><WandSparkles size={13} /> เอฟเฟกต์ (ขั้น 5)</>}>
        <Spin />
      </Panel>
    );
  }

  const { data, draft } = fxs;
  const journey = draft.journey;
  const stops = (journey.stops as JourneyStop[]) ?? [];

  const animOpts = Object.keys(
    (data.defaults.anim as Record<string, unknown>) ?? { none: 1 },
  ).map((k) => ({ v: k, label: k }));

  const patch = (i: number, p: Partial<FxTextItem>) =>
    fxs.patch({ texts: texts.map((t, k) => (k === i ? { ...t, ...p } : t)) });

  const patchStop = (i: number, p: Partial<JourneyStop>) =>
    fxs.patch({
      journey: {
        ...journey,
        stops: stops.map((s, k) => (k === i ? { ...s, ...p } : s)),
      },
    });

  return (
    <Panel
      title={<><WandSparkles size={13} /> เอฟเฟกต์ (ขั้น 5)</>}
      width="w-[24rem]"
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
      {data.orphans.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
          มีเอฟเฟกต์ {data.orphans.length} ชิ้นที่เกาะช่วงซึ่งไม่อยู่ในไทม์ไลน์แล้ว
          (บล็อกสีแดงบนเลเยอร์)
        </div>
      )}

      <Section
        title={`ข้อความบนหนัง (${texts.length})`}
        right={
          <button
            onClick={onAddAtPlayhead}
            className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-[11.5px] text-ink hover:bg-panel-3"
          >
            <Plus size={12} /> ที่หัวเล่น
          </button>
        }
      >
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_MIME, JSON.stringify({ type: "text-new" }));
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="flex cursor-grab items-center gap-1.5 rounded-lg border border-dashed border-line-2 bg-panel-2 px-2 py-1.5 text-[11.5px] text-muted active:cursor-grabbing"
          title="ลากไปปล่อยบนไทม์ไลน์ตรงจุดที่จะให้ข้อความโผล่"
        >
          <GripVertical size={12} className="text-faint" />
          ลาก &ldquo;ข้อความใหม่&rdquo; ลงไทม์ไลน์
        </div>
        {texts.length > 6 && (
          <TInput value={filter} onChange={setFilter} placeholder="ค้นหาข้อความ/คลิป…" />
        )}
        {texts.length === 0 ? (
          <Empty>ยังไม่มีข้อความ — กด &ldquo;+ ที่หัวเล่น&rdquo; หรือลากลงไทม์ไลน์</Empty>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
            {shown.map(({ t, i }) => (
              <div
                key={i}
                className={`rounded-lg border bg-panel-2 ${
                  focusIdx === i ? "border-accent" : "border-line"
                }`}
              >
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
                          fxs.patch({ texts: texts.filter((_, k) => k !== i) });
                          setOpen(null);
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
            onChange={(v) => fxs.patch({ journey: { ...journey, enabled: v } })}
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
                onClick={() =>
                  fxs.patch({
                    journey: { ...journey, stops: stops.filter((_, k) => k !== i) },
                  })
                }
                className="mb-1 rounded-md p-1.5 text-muted hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        {showJourney && (
          <div className="text-[10.5px] leading-4 text-faint">
            ตำแหน่งหมุดบนภาพแผนที่ (ลากบน SVG) ยังแก้ผ่าน viewer เดิม
          </div>
        )}
      </Section>
    </Panel>
  );
}
