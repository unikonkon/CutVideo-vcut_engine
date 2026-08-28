"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Captions,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Move,
  Palette,
  Plus,
  Trash2,
  Type,
  Unlink,
  Users,
} from "lucide-react";
import { type FxPreset, type FxTextItem } from "@/lib/api";
import { DND_MIME, type LayerBlock } from "@/lib/layers";
import { lookOf, uniqueName as freeName } from "@/lib/presets";
import { resolveLook } from "@/lib/textfx";
import { dur, durMs } from "@/lib/time";
import {
  CInput,
  Empty,
  Field,
  NInput,
  Panel,
  PosPad,
  SaveBar,
  Section,
  Sel,
  Spin,
  TInput,
  Toggle,
} from "@/components/ui";
import type { CapStore, FxStore, SpeechLine } from "./types";

const ALIGNS = [
  { v: "2", label: "ล่าง-กลาง" },
  { v: "5", label: "กลางจอ" },
  { v: "8", label: "บน-กลาง" },
];

const KEY_W = "vcut.text.width";
const MIN_W = 320;
const MAX_W = 1200;
const DEF_W = 384;

/** คีย์ที่อยู่ในชุดสไตล์ — เอนจินเป็นเจ้าของรายการนี้ (fx.PRESET_KEYS) ตัวนี้เป็น
 *  แค่ตัวสำรองสำหรับเอนจินรุ่นก่อนหน้าที่ยังไม่ส่ง preset_keys มา */
const LOOK_KEYS: (keyof FxPreset)[] = [
  "font", "size", "color", "outline", "border", "shadow",
  "bold", "italic", "spacing", "angle",
];

// จำนวนคอลัมน์ของฟอร์มตามความกว้าง *จริง* ของแผง ไม่ใช่ของหน้าต่าง — แผงนี้ลาก
// ขยายได้ และ Tailwind ต้องเห็นชื่อคลาสเต็ม ๆ ในซอร์ส จึงเป็นตารางไม่ใช่สตริงต่อ
const GRID: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
};
const colsOf = (w: number) => (w >= 820 ? 6 : w >= 620 ? 4 : w >= 470 ? 3 : 2);

/** ช่องหน้าตาทั้งชุด — ชุดสไตล์กับข้อความรายชิ้นใช้ฟอร์มเดียวกัน
 *
 *  ตัวเดียวกันจริง ๆ ไม่ใช่สองชุดที่หน้าตาเหมือนกัน — ไม่งั้นวันหนึ่งจะมีคนเติม
 *  ช่องใหม่ให้ที่เดียวแล้วอีกที่แก้ค่านั้นไม่ได้เลยโดยไม่มีอะไรฟ้อง
 */
function LookFields({
  v,
  onChange,
  fonts,
  cols,
  disabled,
}: {
  v: Pick<FxPreset, (typeof LOOK_KEYS)[number]>;
  onChange: (p: Partial<FxPreset>) => void;
  fonts: { thai: string[]; other: string[] };
  cols: number;
  disabled?: boolean;
}) {
  const fontOpts = [
    ...fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })),
    ...fonts.other.map((f) => ({ v: f, label: f })),
  ];
  // ฟอนต์ที่ตั้งไว้แต่ไม่มีในเครื่องนี้ต้องยังเห็นในช่อง ไม่ใช่เงียบ ๆ กลายเป็น
  // ตัวแรกของรายการ แล้วคนกดบันทึกทับของที่ตั้งไว้โดยไม่รู้ตัว
  if (v.font && !fontOpts.some((o) => o.v === v.font)) {
    fontOpts.unshift({ v: v.font, label: `${v.font} (ไม่มีในเครื่องนี้)` });
  }
  return (
    <div className={`grid gap-2 ${GRID[cols]}`}>
      <Field label="ฟอนต์" span2>
        <Sel
          value={v.font}
          onChange={(x) => onChange({ font: x })}
          options={fontOpts}
          disabled={disabled}
        />
      </Field>
      <Field label="ขนาด">
        <NInput
          value={v.size}
          step={2}
          min={4}
          max={2000}
          onChange={(x) => onChange({ size: x })}
          disabled={disabled}
        />
      </Field>
      <Field label="สีตัวอักษร" span2>
        <CInput value={v.color} onChange={(x) => onChange({ color: x })} disabled={disabled} />
      </Field>
      <Field label="สีขอบ" span2>
        <CInput value={v.outline} onChange={(x) => onChange({ outline: x })} disabled={disabled} />
      </Field>
      <Field label="ความหนาขอบ">
        <NInput
          value={v.border}
          step={0.5}
          min={0}
          max={40}
          onChange={(x) => onChange({ border: x })}
          disabled={disabled}
        />
      </Field>
      <Field label="เงา">
        <NInput
          value={v.shadow}
          step={0.5}
          min={0}
          max={20}
          onChange={(x) => onChange({ shadow: x })}
          disabled={disabled}
        />
      </Field>
      <Field label="ระยะตัวอักษร">
        <NInput
          value={v.spacing}
          step={0.5}
          min={-20}
          max={40}
          onChange={(x) => onChange({ spacing: x })}
          disabled={disabled}
        />
      </Field>
      <Field label="เอียง (องศา)">
        <NInput
          value={v.angle}
          step={1}
          min={-360}
          max={360}
          onChange={(x) => onChange({ angle: x })}
          disabled={disabled}
        />
      </Field>
      <div className="col-span-2 flex items-center gap-4">
        <Toggle
          value={v.bold}
          onChange={(x) => onChange({ bold: x })}
          label="หนา"
          disabled={disabled}
        />
        <Toggle
          value={v.italic}
          onChange={(x) => onChange({ italic: x })}
          label="เอียง"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

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
 *
 *  **แผงนี้ลากขยายได้** (ต่างจากแผงอื่นที่กว้างตายตัว) เพราะข้อความชิ้นหนึ่งมีช่อง
 *  ให้ตั้ง 20 ช่อง ซึ่งใส่ลงคอลัมน์เดียวกว้าง 24rem แล้วต้องเลื่อนหาทุกครั้ง
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
  onMakePreset,
  blocks,
  flash,
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
  /** สร้างชุดสไตล์จากข้อความชิ้นนั้น — อยู่ที่ page เพราะการ์ดลอยก็กดปุ่มนี้ได้
   *  (ประกอบชุดคนละที่ = วันหนึ่งจะมีปุ่มหนึ่งลอกค่ามาไม่ครบ) */
  onMakePreset: (idx: number) => void;
  /** ข้อความแต่ละชิ้นไปโผล่วินาทีที่เท่าไรของหนัง — page คิดมาให้แล้ว
   *  ผูกด้วย idx ตัวเดียวกับ draft.texts (ดู layers.textBlocks) */
  blocks: LayerBlock[];
  flash: (m: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [openPreset, setOpenPreset] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [draftText, setDraftText] = useState("");
  const [w, setW] = useState(DEF_W);

  // คลิกบล็อกบนไทม์ไลน์ (หรือบนจอตัวอย่าง) → เปิดชิ้นนั้นในแผงทันที
  useEffect(() => {
    if (focusIdx != null) setOpen(focusIdx);
  }, [focusIdx]);

  const texts = useMemo(() => fxs.draft?.texts ?? [], [fxs.draft]);
  const shown = useMemo(
    () =>
      texts
        .map((t, i) => ({ t, i }))
        .filter(
          ({ t }) => !filter || t.text.includes(filter) || t.name.includes(filter),
        ),
    [texts, filter],
  );

  const cols = colsOf(w);
  const resize = useMemo(
    () => ({ key: KEY_W, min: MIN_W, max: MAX_W, def: DEF_W, onWidth: setW }),
    [],
  );

  if (!fxs.data || !fxs.draft || !caps.data || !caps.draft) {
    return (
      <Panel title={<><Type size={13} /> ข้อความ</>} resize={resize}>
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

  // ── ชุดสไตล์ ──
  //
  // เอนจินรุ่นก่อนหน้าไม่ส่ง defaults.preset มา — ซ่อนทั้งส่วนแล้วบอกให้รีสตาร์ต
  // ดีกว่าขึ้นฟอร์มที่กดสร้างแล้วค่าหายเงียบ ๆ ตอนบันทึก (เอนจินจะทิ้งคีย์ที่ไม่รู้จัก)
  const blankPreset = data.defaults.preset as FxPreset | undefined;
  const pkeys = (data.defaults.preset_keys as (keyof FxPreset)[] | undefined)
    ?? LOOK_KEYS;
  const presets = draft.presets ?? [];
  const byName = new Map(presets.map((p) => [p.name, p]));
  const usedBy = (name: string) => draft.texts.filter((t) => t.preset === name).length;

  /** หน้าตาที่ชิ้นนี้จะออกมาจริง — ชุดชนะค่าของชิ้น เหมือนที่ fxtext.cues ทำ
   *  ฟอร์มต้องโชว์ค่าที่ *จะถูกใช้* ไม่ใช่ค่าที่ค้างอยู่ในชิ้นแล้วถูกทับทีหลัง
   *  (ตัวรวมเป็นตัวเดียวกับที่จอตัวอย่างใช้ — ดู lib/textfx.resolveLook) */
  const resolved = (t: FxTextItem) => resolveLook(t, presets, pkeys as string[]);

  const uniqueName = (want: string) => freeName(want, new Set(byName.keys()));

  const setPresets = (ps: FxPreset[]) => fxs.patch({ presets: ps });

  const patchPreset = (name: string, p: Partial<FxPreset>) =>
    setPresets(presets.map((x) => (x.name === name ? { ...x, ...p } : x)));

  /** เปลี่ยนชื่อชุด — ต้องย้ายข้อความที่ผูกอยู่ตามไปด้วยใน patch เดียว
   *  ไม่งั้นทุกชิ้นจะกลายเป็น "ผูกกับชุดที่ไม่มีอยู่" ระหว่างสอง patch และ
   *  Cmd+Z หนึ่งครั้งจะย้อนได้แค่ครึ่งเดียว */
  const renamePreset = (from: string, to: string) => {
    const name = to.trim();
    if (!name || name === from) return;
    if (byName.has(name)) return flash(`มีชุดชื่อ "${name}" อยู่แล้ว`);
    fxs.patch({
      presets: presets.map((x) => (x.name === from ? { ...x, name } : x)),
      texts: draft.texts.map((t) => (t.preset === from ? { ...t, preset: name } : t)),
    });
    setOpenPreset(name);
  };

  /** ลบชุด — ข้อความที่ผูกอยู่ต้องหน้าตาเหมือนเดิมทุกชิ้น
   *  ลบชุดคือการจัดระเบียบ ไม่ใช่คำสั่งเปลี่ยนหน้าตาหนัง จึงลอกค่าของชุดลงชิ้น
   *  ก่อนตัดสาย ไม่ใช่ปล่อยให้ตกกลับไปเป็นค่าเก่าที่ไม่มีใครเห็นมานานแล้ว */
  const removePreset = (name: string) => {
    const p = byName.get(name);
    fxs.patch({
      presets: presets.filter((x) => x.name !== name),
      texts: draft.texts.map((t) =>
        t.preset === name ? { ...t, ...(p ? lookOf(p, pkeys as string[]) : {}), preset: "" } : t,
      ),
    });
    setOpenPreset(null);
    flash(`ลบชุด "${name}" แล้ว — ข้อความที่เคยผูกไว้หน้าตาเหมือนเดิม`);
  };

  const addPreset = () => {
    if (!blankPreset) return;
    const name = uniqueName("ชุดใหม่");
    fxs.patch({ presets: [...presets, { ...blankPreset, name }] });
    setOpenPreset(name);
    flash(`สร้างชุด "${name}" แล้ว`);
  };

  const applyToAll = (name: string) => {
    fxs.patch({ texts: draft.texts.map((t) => ({ ...t, preset: name })) });
    flash(`ให้ข้อความทั้ง ${draft.texts.length} ชิ้นใช้ชุด "${name}"`);
  };

  /** ปลดชิ้นเดียวออกจากชุด โดยเก็บหน้าตาที่เห็นอยู่ไว้ — เหตุผลเดียวกับ removePreset */
  const unlink = (i: number) => {
    const t = draft.texts[i];
    patch(i, { ...lookOf(resolved(t), pkeys as string[]), preset: "" });
  };

  const presetOpts = [
    { v: "", label: "— ไม่ผูกชุด (ตั้งเอง) —" },
    ...presets.map((p) => ({ v: p.name, label: p.name })),
  ];

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
      resize={resize}
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

      {/* ── ชุดสไตล์ ── */}
      <Section
        title={`ชุดสไตล์ (${presets.length})`}
        right={
          blankPreset ? (
            <button
              onClick={() => addPreset()}
              title="สร้างชุดสไตล์เปล่าไว้ผูกกับข้อความหลายชิ้น"
              className="flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
            >
              <Plus size={11} /> ชุดใหม่
            </button>
          ) : undefined
        }
      >
        {!blankPreset ? (
          <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] leading-5 text-warn">
            เอนจินที่รันอยู่ยังไม่มีชุดสไตล์ — รีสตาร์ต ./vcut view แล้วลองใหม่
          </div>
        ) : presets.length === 0 ? (
          <Empty>
            ยังไม่มีชุด — ตั้งหน้าตาข้อความสักชิ้นให้พอใจ แล้วกด
            &ldquo;สร้างชุดจากชิ้นนี้&rdquo; ในชิ้นนั้น จากนั้นชิ้นอื่นเลือกชุดเดียวกันได้
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {presets.map((p) => {
              const on = openPreset === p.name;
              const n = usedBy(p.name);
              return (
                <div key={p.name} className="rounded-lg border border-line bg-panel-2">
                  <button
                    onClick={() => setOpenPreset(on ? null : p.name)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    {on ? (
                      <ChevronDown size={12} className="shrink-0 text-muted" />
                    ) : (
                      <ChevronRight size={12} className="shrink-0 text-muted" />
                    )}
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-line-2"
                      style={{ background: p.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                      {p.name}
                    </span>
                    <span className="shrink-0 truncate font-mono text-[10px] text-faint">
                      {p.font} {p.size}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1 text-[10px] ${
                        n > 0 ? "bg-accent/15 text-accent" : "text-faint"
                      }`}
                      title="จำนวนข้อความที่ผูกชุดนี้อยู่"
                    >
                      {n}
                    </span>
                  </button>
                  {on && (
                    <div className="flex flex-col gap-2 border-t border-line p-2">
                      <Field label="ชื่อชุด">
                        <TInput
                          value={p.name}
                          onChange={(v) => renamePreset(p.name, v)}
                        />
                      </Field>
                      <LookFields
                        v={p}
                        onChange={(x) => patchPreset(p.name, x)}
                        fonts={data.fonts}
                        cols={cols}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => applyToAll(p.name)}
                          disabled={draft.texts.length === 0}
                          title="ให้ข้อความทุกชิ้นในหนังใช้ชุดนี้"
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-ink disabled:opacity-40"
                        >
                          <Users size={12} /> ใช้กับข้อความทุกชิ้น
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => removePreset(p.name)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={12} /> ลบชุด
                        </button>
                      </div>
                      <p className="text-[10px] leading-4 text-faint">
                        แก้ที่นี่ที่เดียว ข้อความที่ผูกอยู่ {n} ชิ้นเปลี่ยนตามทั้งหมด ·
                        ลบชุดแล้วหน้าตาของชิ้นที่เคยผูกไม่เปลี่ยน (ลอกค่าลงชิ้นให้)
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── ข้อความบนหนัง ── */}
      <Section title={`ข้อความบนหนัง (${texts.length})`}>
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
          <div className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto pr-1">
            {shown.map(({ t, i }) => {
              const p = byName.get(t.preset || "");
              const lost = Boolean(t.preset) && !p;
              const view = resolved(t);
              const blk = blocks.find((b) => b.idx === i);
              return (
                <div
                  key={i}
                  className={`rounded-lg border bg-panel-2 ${
                    focusIdx === i ? "border-accent" : "border-line"
                  }`}
                >
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    title={
                      `${t.text || "(ว่าง)"}\nเกาะคลิป ${t.name} วินาทีที่ ${t.at.toFixed(1)}` +
                      (blk?.orphan !== false
                        ? "\nช่วงที่เกาะอยู่ไม่มีในไทม์ไลน์แล้ว — ชิ้นนี้จะไม่ขึ้นในหนัง"
                        : `\nโผล่นาทีที่ ${durMs(blk.tl)} ของหนัง ยาว ${t.dur.toFixed(2)} วิ`)
                    }
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    {open === i ? (
                      <ChevronDown size={12} className="shrink-0 text-muted" />
                    ) : (
                      <ChevronRight size={12} className="shrink-0 text-muted" />
                    )}
                    {/* เวลาใน *หนัง* ไม่ใช่วินาทีในคลิป — คนหาชิ้นนี้จากที่มันโผล่
                        บนไทม์ไลน์ ส่วนชื่อคลิปกับวินาทีในคลิปเป็นวิธี *ผูก* ของ
                        เอนจิน ซึ่งไปอยู่ใน tooltip · ชิ้นกำพร้าไม่มีเวลาในหนังให้บอก */}
                    <span className="w-11 shrink-0 font-mono text-[10.5px] text-faint">
                      {blk && !blk.orphan ? durMs(blk.tl) : "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                      {t.text || "(ว่าง)"}
                    </span>
                    {p && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded bg-accent/15 px-1 text-[10px] text-accent"
                        title={`ใช้ชุดสไตล์ "${p.name}"`}
                      >
                        <Palette size={9} />
                        {p.name}
                      </span>
                    )}
                    {lost && (
                      <span className="shrink-0 rounded bg-warn/20 px-1 text-[10px] text-warn">
                        ไม่มีชุดนี้
                      </span>
                    )}
                    <span
                      className={`h-2 w-2 shrink-0 rounded-[2px] ${
                        blk && !blk.orphan ? "bg-ok" : "bg-danger"
                      }`}
                    />
                  </button>
                  {open === i && (
                    <div className="flex flex-col gap-2 border-t border-line p-2">
                      <TInput value={t.text} onChange={(v) => patch(i, { text: v })} />

                      <div className={`grid gap-2 ${GRID[cols]}`}>
                        <Field label="โผล่วินาที (ในคลิป)">
                          <NInput value={t.at} min={0} onChange={(v) => patch(i, { at: v })} />
                        </Field>
                        <Field label="นาน (วิ)">
                          <NInput value={t.dur} min={0.2} onChange={(v) => patch(i, { dur: v })} />
                        </Field>
                        <Field label="แอนิเมชัน">
                          <Sel value={t.anim} onChange={(v) => patch(i, { anim: v })} options={animOpts} />
                        </Field>
                        <Field label="เข้า (วิ)">
                          <NInput value={t.in} step={0.02} min={0} max={1.5} onChange={(v) => patch(i, { in: v })} />
                        </Field>
                        <Field label="ออก (วิ)">
                          <NInput value={t.out} step={0.02} min={0} max={1.5} onChange={(v) => patch(i, { out: v })} />
                        </Field>
                      </div>

                      {/* หน้าตา — ผูกชุดอยู่ก็ยังเห็นค่าที่จะถูกใช้จริง แค่แก้ที่นี่ไม่ได้ */}
                      {blankPreset && (
                        <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-2">
                          <div className="flex items-end gap-2">
                            <div className="min-w-0 flex-1">
                              <Field label="ชุดสไตล์">
                                <Sel
                                  // โชว์ชื่อที่ผูกอยู่จริงเสมอ แม้ชุดนั้นจะหายไปแล้ว —
                                  // ตกเป็น "ไม่ผูกชุด" ตรงนี้จะขัดกับคำเตือนข้างล่าง
                                  // ที่บอกว่ายังผูกอยู่ แล้วคนอ่านไม่รู้ว่าอันไหนจริง
                                  value={t.preset}
                                  onChange={(v) => patch(i, { preset: v })}
                                  options={
                                    lost
                                      ? [{ v: t.preset, label: `${t.preset} (ไม่มีชุดนี้แล้ว)` }, ...presetOpts]
                                      : presetOpts
                                  }
                                />
                              </Field>
                            </div>
                            {p ? (
                              <button
                                onClick={() => unlink(i)}
                                title="เลิกตามชุด แล้วแก้หน้าตาของชิ้นนี้เอง (หน้าตาที่เห็นอยู่ไม่เปลี่ยน)"
                                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-muted hover:text-ink"
                              >
                                <Unlink size={12} /> แก้เฉพาะชิ้นนี้
                              </button>
                            ) : (
                              <button
                                onClick={() => onMakePreset(i)}
                                title="เก็บหน้าตาของชิ้นนี้เป็นชุด แล้วชิ้นอื่นเลือกใช้ได้"
                                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-muted hover:text-ink"
                              >
                                <Copy size={12} /> สร้างชุดจากชิ้นนี้
                              </button>
                            )}
                          </div>
                          {lost && (
                            <p className="text-[10.5px] leading-4 text-warn">
                              ชิ้นนี้ผูกกับชุด &ldquo;{t.preset}&rdquo; ที่ไม่มีอยู่แล้ว —
                              ตอนนี้ใช้ค่าของชิ้นเอง เลือกชุดใหม่หรือตั้งเป็น
                              &ldquo;ไม่ผูกชุด&rdquo; ก็ได้
                            </p>
                          )}
                          <LookFields
                            v={view}
                            onChange={(x) => patch(i, x)}
                            fonts={data.fonts}
                            cols={cols}
                            disabled={Boolean(p)}
                          />
                          {p && (
                            <p className="text-[10.5px] leading-4 text-faint">
                              ค่าพวกนี้มาจากชุด &ldquo;{p.name}&rdquo; — แก้ที่ชุดข้างบนเพื่อ
                              เปลี่ยนทุกชิ้นที่ผูกอยู่ ({usedBy(p.name)} ชิ้น)
                            </p>
                          )}
                        </div>
                      )}

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
                      {/* ── ตำแหน่งบนจอ ──
                          เดิมเป็นสองคอนโทรลที่ขัดกันเองได้: ช่องตัวเลข X/Y กับ
                          ตารางจุดยึด 3×3  ตั้ง X/Y เองแล้ว align ค้างที่เดิม
                          ข้อความจึงยึดคนละมุมกับที่เห็นในช่องตัวเลข  ตอนนี้เหลือ
                          แผ่นเดียวที่ลากอิสระได้และดูดเข้าจุดยึดพร้อมตั้ง align ให้ */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-[124px] shrink-0">
                          <PosPad
                            x={t.x}
                            y={t.y}
                            align={t.align}
                            onChange={(v) => patch(i, v)}
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <button
                            onClick={() => onStageEdit(i)}
                            title="เลือกชิ้นนี้แล้วเปิดโหมดแก้ตำแหน่งบนจอตัวอย่าง"
                            className={`flex w-full items-center justify-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] ${
                              stageEdit && focusIdx === i
                                ? "text-accent"
                                : "text-muted hover:text-ink"
                            }`}
                          >
                            <Move size={12} /> แก้บนจอตัวอย่าง
                          </button>
                          <p className="text-[10px] leading-4 text-faint">
                            ลากจุดจัดตำแหน่ง · เข้าใกล้มุมแล้วดูดติดพร้อมตั้งจุดยึดให้ ·
                            Alt = ไม่ดูด  จุดยึดเป็นของชิ้นนี้เสมอ ไม่ตามชุดสไตล์
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] leading-4 text-faint">
          คลิกบล็อกบนไทม์ไลน์แล้ว Cmd+C / Cmd+V เพื่อทำสำเนาข้อความไปวางที่หัวเล่น ·
          ลากขอบขวาของแผงนี้เพื่อขยายให้ฟอร์มกางเป็นหลายคอลัมน์
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

      <Section title="สไตล์ซับ (ใช้กับซับจากบทพูดทุกบรรทัด · คนละไฟล์กับข้างบน)">
        <div className={`grid gap-2 ${GRID[cols]}`}>
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
          <Field label="สีตัวอักษร" span2>
            <CInput value={String(st("color"))} onChange={(v) => setSt("color", v)} />
          </Field>
          <Field label="สีขอบ" span2>
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
