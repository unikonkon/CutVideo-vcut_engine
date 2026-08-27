"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Captions,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Move,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { type FxTextItem } from "@/lib/api";
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
import type { CapStore, FxStore, SpeechLine } from "./types";

// จุดจัดตำแหน่ง 3×3 ของข้อความ — ตั้ง align (จุดยึดแบบ ass) คู่กับ x/y เสมอ
// ข้อความจึงกอดมุมได้พอดีโดยไม่ต้องรู้ว่ากล่องกว้างเท่าไร (ต่างจากภาพซ้อนที่รู้ขนาด)
const SPOTS: { align: number; x: number; y: number; label: string }[][] = [
  [
    { align: 7, x: 0.05, y: 0.05, label: "บนซ้าย" },
    { align: 8, x: 0.5, y: 0.05, label: "บนกลาง" },
    { align: 9, x: 0.95, y: 0.05, label: "บนขวา" },
  ],
  [
    { align: 4, x: 0.05, y: 0.5, label: "กลางซ้าย" },
    { align: 5, x: 0.5, y: 0.5, label: "กลางจอ" },
    { align: 6, x: 0.95, y: 0.5, label: "กลางขวา" },
  ],
  [
    { align: 1, x: 0.05, y: 0.95, label: "ล่างซ้าย" },
    { align: 2, x: 0.5, y: 0.95, label: "ล่างกลาง" },
    { align: 3, x: 0.95, y: 0.95, label: "ล่างขวา" },
  ],
];

const ALIGNS = [
  { v: "2", label: "ล่าง-กลาง" },
  { v: "5", label: "กลางจอ" },
  { v: "8", label: "บน-กลาง" },
];

/** ตัวหนังสือบนจอทั้งหมดอยู่แผงเดียว — แต่ยังเป็นคนละไฟล์ตามที่เอนจินแยกไว้
 *
 *  ข้อความบนหนัง = fx.json (ขั้น 5) วางเอง ทีละชิ้น ตำแหน่งอิสระ
 *  ซับจากบทพูด   = captions.json (ขั้น 4) มาจากเสียงพูด แก้เป็นราย cue
 *
 *  เดิมสองอย่างนี้อยู่คนละแท็บ ("ข้อความ" กับ "เอฟเฟกต์") ทั้งที่ผู้ใช้มองว่าเป็น
 *  ตัวหนังสือบนจอเหมือนกัน — และปุ่มสร้างข้อความขั้น 5 มีอยู่ทั้งสองแท็บโดยที่
 *  แท็บแรกแก้ของที่สร้างไม่ได้เลย รวมแล้วจบในที่เดียว ปุ่มบันทึกเดียวคุมสองไฟล์
 *
 *  ส่วน "เลือกบรรทัดจากบทพูดใส่ลงหนัง" ย้ายไปอยู่แท็บ "บทพูดที่ถอดไว้" แล้ว —
 *  ที่นั่นคือที่ที่คนไปหาคำพูด ที่นี่คือที่ที่คนมาแต่งตัวหนังสือ  บรรทัดที่ติ๊กไป
 *  จะโผล่ในรายการข้างล่างนี้เหมือนข้อความที่พิมพ์เอง (ต่างกันแค่ id ขึ้นต้น `tr:`)
 */
export default function TextPanel({
  fxs,
  caps,
  speech,
  onAddAtPlayhead,
  focusIdx,
  stageEdit,
  onStageEdit,
  onGotoSpeech,
}: {
  fxs: FxStore;
  caps: CapStore;
  /** ใช้จุดเดียว: กู้ข้อความของ cue ที่ถูกซ่อน ซึ่งเอนจินไม่ส่งกลับมาแล้ว
   *  (การเลือกบรรทัดใส่ลงหนังย้ายไปอยู่แท็บ "บทพูดที่ถอดไว้") */
  speech: SpeechLine[];
  onAddAtPlayhead: (text?: string) => void;
  focusIdx: number | null;
  stageEdit: boolean;
  onStageEdit: (idx: number) => void;
  onGotoSpeech: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [draftText, setDraftText] = useState("");

  // คลิกบล็อกบนไทม์ไลน์ (หรือบนจอตัวอย่าง) → เปิดชิ้นนั้นในแผงทันที
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

  if (!fxs.data || !fxs.draft || !caps.data || !caps.draft) {
    return (
      <Panel title={<><Type size={13} /> ข้อความ</>}>
        <Spin />
      </Panel>
    );
  }

  const { data, draft } = fxs;
  const cap = caps.data;
  const cd = caps.draft;
  const dropped = new Set(cd.drop);

  const animOpts = Object.keys(
    (data.defaults.anim as Record<string, unknown>) ?? { none: 1 },
  ).map((k) => ({ v: k, label: k }));

  // เอนจินรุ่นก่อนหน้ายังไม่ส่งรายการนี้มา — ไม่มี = ไม่ขึ้นช่องนับเลขเลย
  // ดีกว่าขึ้นช่องว่างเปล่าที่กดแล้วค่าถูกทิ้งเงียบ ๆ ตอนบันทึก
  const countOpts = Object.entries(
    (data.defaults.count as Record<string, string>) ?? {},
  ).map(([v, label]) => ({ v, label }));

  const patch = (i: number, p: Partial<FxTextItem>) =>
    fxs.patch({ texts: draft.texts.map((t, k) => (k === i ? { ...t, ...p } : t)) });

  // ข้อความที่มาจากบทพูดติดรหัส `tr:<คลิป>#<บรรทัด>` ไว้ที่ช่อง id — ติ๊กใส่/เอาออก
  // ทำที่แท็บ "บทพูดที่ถอดไว้" ที่นี่แค่นับให้เห็นว่ามีกี่ชิ้นและชี้ทางไป
  const fromSpeech = draft.texts.filter((t) => t.id.startsWith("tr:")).length;

  // cue ที่สั่งซ่อนไว้ "หายจากรายการที่เอนจินส่งมา" (caption.cues กรองทิ้งตั้งแต่ต้นทาง)
  // ถ้าไม่ปั้นแถวคืนเอง จะกดซ่อนได้ครั้งเดียวแล้วเรียกกลับไม่ได้อีกเลย — ข้อความ
  // ของบรรทัดนั้นหาได้จากบทพูด เพราะ id ใช้สูตรเดียวกัน (`<คลิป>#<ลำดับ>`)
  const cueIds = new Set(cap.cues.map((c) => c.id));
  const hiddenRows = cd.drop
    .filter((id) => !cueIds.has(id))
    .map((id) => ({ id, text: speech.find((l) => l.id === id)?.text ?? "" }));
  const st = (k: string) => cd.style[k];
  const setSt = (k: string, v: unknown) =>
    caps.patch({ style: { ...cd.style, [k]: v } });

  const toggleCue = (id: string) =>
    caps.patch({
      drop: dropped.has(id) ? cd.drop.filter((x) => x !== id) : [...cd.drop, id],
    });

  const bothDirty = fxs.dirty || caps.dirty;
  const hint = fxs.dirty && caps.dirty
    ? "ยังไม่บันทึก: ข้อความบนหนัง + ซับ"
    : fxs.dirty
      ? "ยังไม่บันทึก: ข้อความบนหนัง (fx)"
      : "ยังไม่บันทึก: ซับ (captions)";

  return (
    <Panel
      title={<><Type size={13} /> ข้อความ</>}
      width="w-[24rem]"
      footer={
        <SaveBar
          dirty={bothDirty}
          saving={fxs.saving || caps.saving}
          onSave={() => {
            if (fxs.dirty) fxs.save();
            if (caps.dirty) caps.save();
          }}
          onRevert={() => {
            if (fxs.dirty) fxs.revert();
            if (caps.dirty) caps.revert();
          }}
          hint={hint}
        />
      }
    >
      {data.orphans.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
          มีเอฟเฟกต์ {data.orphans.length} ชิ้นที่เกาะช่วงซึ่งไม่อยู่ในไทม์ไลน์แล้ว
          (บล็อกสีแดงบนเลเยอร์)
        </div>
      )}
      {!cap.ffmpeg.ok && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
          ffmpeg รุ่นที่เขียนข้อความได้ยังไม่มี — {cap.ffmpeg.how}
        </div>
      )}

      <Section
        title={`ข้อความบนหนัง (${texts.length})`}
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              onAddAtPlayhead(draftText.trim() || undefined);
              setDraftText("");
            }}
            placeholder="พิมพ์ข้อความแล้วกด Enter…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-faint focus:border-line-2"
          />
          <button
            onClick={() => {
              onAddAtPlayhead(draftText.trim() || undefined);
              setDraftText("");
            }}
            title="วางข้อความนี้ตรงหัวเล่น (เว้นว่าง = ได้ข้อความตั้งต้นไปแก้ทีหลัง)"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 text-[11.5px] text-ink hover:bg-panel-3"
          >
            <Plus size={12} /> ที่หัวเล่น
          </button>
        </div>
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
                    {countOpts.length > 0 && (
                      <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2/60 p-2">
                        <Field label="ตัวเลขที่นับขึ้น">
                          <Sel
                            value={t.count ?? ""}
                            onChange={(v) => {
                              // เปิดนับครั้งแรกแล้วยังไม่มีที่ให้เลขลง — ใส่ {n}
                              // ให้เลย ไม่งั้นกดเปิดแล้วจอตัวอย่างไม่เปลี่ยนอะไร
                              // และไม่มีอะไรบอกว่าต้องพิมพ์ {n} เอง
                              const need =
                                v &&
                                !t.text.includes("{n}") &&
                                (t.lines?.length ?? 0) === 0 &&
                                t.text.trim() !== "";
                              patch(i, need ? { count: v, text: "{n}" } : { count: v });
                            }}
                            options={countOpts}
                          />
                        </Field>
                        {t.count ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <Field label="เริ่มที่">
                                <NInput
                                  value={t.count_from ?? 0}
                                  step={1}
                                  onChange={(v) => patch(i, { count_from: v })}
                                />
                              </Field>
                              <Field label="จบที่">
                                <NInput
                                  value={t.count_to ?? 0}
                                  step={1}
                                  onChange={(v) => patch(i, { count_to: v })}
                                />
                              </Field>
                            </div>
                            <div className="text-[10.5px] leading-4 text-faint">
                              {(t.lines?.length ?? 0) > 0
                                ? "การ์ดหลายบรรทัด — พิมพ์ {n} ตรงบรรทัดที่อยากให้เลขไปลง (ไม่มี = ไม่นับให้)"
                                : "เลขไปแทนที่ {n} ในข้อความ · ไม่มี {n} = เลขแทนข้อความทั้งก้อน"}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <Toggle value={t.bold} onChange={(v) => patch(i, { bold: v })} label="หนา" />
                      <Toggle value={t.plate} onChange={(v) => patch(i, { plate: v })} label="พื้นหลังทึบ" />
                      <div className="flex-1" />
                      <button
                        onClick={() => {
                          fxs.patch({ texts: draft.texts.filter((_, k) => k !== i) });
                          setOpen(null);
                        }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={12} /> ลบ
                      </button>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border border-line bg-panel p-0.5">
                        {SPOTS.map((row) =>
                          row.map((sp) => (
                            <button
                              key={sp.align}
                              onClick={() =>
                                patch(i, { align: sp.align, x: sp.x, y: sp.y })
                              }
                              title={`จัดไป${sp.label}`}
                              className={`flex h-4 w-4 items-center justify-center rounded-[3px] hover:bg-panel-3 hover:text-accent ${
                                t.align === sp.align ? "text-accent" : "text-faint"
                              }`}
                            >
                              <span className="h-1 w-1 rounded-full bg-current" />
                            </button>
                          )),
                        )}
                      </div>
                      <button
                        onClick={() => onStageEdit(i)}
                        title="เลือกชิ้นนี้แล้วเปิดโหมดแก้ตำแหน่งบนจอตัวอย่าง"
                        className={`flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] ${
                          stageEdit && focusIdx === i
                            ? "text-accent"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        <Move size={12} /> แก้บนจอ
                      </button>
                      <p className="min-w-0 flex-1 text-[10px] leading-4 text-faint">
                        จุดซ้ายคือจุดยึด — ลากบนจอตัวอย่างจัดละเอียดต่อได้
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] leading-4 text-faint">
          ลากจัดตำแหน่งบนจอตัวอย่างได้ — กด &ldquo;แก้ตำแหน่ง&rdquo; ในแถบใต้จอ
        </p>
      </Section>

      <button
        onClick={onGotoSpeech}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-left hover:bg-panel-3"
        title="ไปเลือกบรรทัดจากบทพูดใส่ลงหนัง"
      >
        <Captions size={13} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 text-[11.5px] leading-4 text-muted">
          {fromSpeech > 0
            ? `บรรทัดจากบทพูดที่ใส่ไว้ ${fromSpeech} บรรทัด — เลือกเพิ่ม/เอาออกที่แท็บบทพูด`
            : "อยากได้ตัวหนังสือจากคำพูด — เลือกทีละบรรทัดได้ที่แท็บบทพูด"}
        </span>
        <ChevronRight size={13} className="shrink-0 text-faint" />
      </button>

      <Section title="สไตล์ซับ (ใช้กับซับจากบทพูดทุกบรรทัด)">
        <div className="grid grid-cols-2 gap-2">
          <Field label="ฟอนต์" span2>
            <Sel
              value={String(st("font"))}
              onChange={(v) => setSt("font", v)}
              options={[
                ...cap.fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })),
                ...cap.fonts.other.map((f) => ({ v: f, label: f })),
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
        title={`ซับอัตโนมัติจากบทพูด (${cap.cues.length})`}
        right={
          <Toggle
            value={cd.enabled}
            onChange={(v) => caps.patch({ enabled: v })}
            label=""
          />
        }
      >
        {cap.cues.length === 0 && hiddenRows.length === 0 ? (
          <Empty>
            {cd.enabled
              ? "ยังไม่มี cue — ต้องถอดเสียง (ขั้น 2) และตัดชิ้น (render) ก่อน"
              : "ซับอัตโนมัติปิดอยู่ — เปิดสวิตช์แล้วบันทึก เพื่อให้เอนจินส่งรายการ cue กลับมา"}
          </Empty>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
            {cap.cues.map((c) => {
              const hidden = dropped.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`flex items-start gap-1.5 rounded-lg border border-line bg-panel-2 px-2 py-1.5 ${
                    hidden ? "opacity-40" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleCue(c.id)}
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
                      value={cd.edits[c.id] ?? c.text}
                      onChange={(e) =>
                        caps.patch({ edits: { ...cd.edits, [c.id]: e.target.value } })
                      }
                      className="w-full bg-transparent text-[12px] text-ink outline-none"
                    />
                  </div>
                </div>
              );
            })}
            {hiddenRows.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-1.5 rounded-lg border border-line bg-panel-2 px-2 py-1.5 opacity-40"
              >
                <button
                  onClick={() => caps.patch({ drop: cd.drop.filter((x) => x !== h.id) })}
                  className="mt-0.5 shrink-0 text-muted hover:text-ink"
                  title="แสดง cue นี้อีกครั้ง"
                >
                  <EyeOff size={13} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-faint">
                    {h.id} · ซ่อนไว้
                  </div>
                  <div className="truncate text-[12px] text-ink">
                    {cd.edits[h.id] ?? h.text ?? ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Panel>
  );
}
