"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import {
  api2,
  type SetupData,
  type SetupField,
  type SetupRecipe,
} from "@/lib/api";
import {
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
import { usePref, writePref } from "@/lib/pref";

/** ชื่อกลุ่มสำรอง — ใช้เฉพาะตอนต่อกับเอนจินรุ่นเก่าที่ยังไม่ส่ง `stages` มา
 *
 *  ตารางนี้เคยเป็นตัวจริงและเป็นแหล่งข้อมูลที่สอง: stage ที่ไม่มีชื่อในนี้จะขึ้น
 *  เป็นชื่อดิบ ("review") โดยไม่มีอะไรฟ้อง — ตอนนี้ชื่อมาจาก settings.STAGES
 *  ที่เดียวกับที่ FIELDS อยู่
 */
const STAGE_FALLBACK: Record<string, string> = {
  project: "โปรเจกต์",
  scan: "① อ่านคลิป",
  thumbs: "① ภาพตัวอย่าง",
  listen: "② ถอดเสียง",
  ai: "② ความเห็น AI",
  prepare: "② เตรียมคลัง",
  compose: "③ รวมร่าง",
  render: "④ ตัดชิ้น",
  assemble: "④ ต่อไฟล์",
  caption: "④ ใส่ข้อความ",
  fx: "⑤ แต่งหนัง",
  review: "AI ดูหนังที่ตัดแล้ว",
};

const listCls =
  "w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent";

/** ลิสต์ของตัวเลข/ข้อความ — เดิมทั้งสองชนิดตกไปเป็นบล็อก JSON ที่อ่านได้แต่แก้ไม่ได้
 *
 *  ค่าพวกนี้ไม่ใช่ของหายาก: broll.motion_bands กับ broll.durations เป็นหัวใจของ
 *  การตัดช่วงวิว (ยิ่งภาพสั่นยิ่งให้สั้น) แต่แก้ในหน้าเว็บไม่ได้เลยมาตลอด
 */
function ListEditor({
  value,
  onChange,
  num,
  placeholder,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  num: boolean;
  placeholder?: string;
}) {
  const arr = Array.isArray(value) ? value : [];
  const put = (i: number, v: string) => {
    const next = [...arr];
    next[i] = num ? Number(v) : v;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      {arr.map((x, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type={num ? "number" : "text"}
            value={String(x ?? "")}
            placeholder={placeholder}
            onChange={(e) => put(i, e.target.value)}
            className={`${listCls} ${num ? "" : "font-mono text-[11px]"}`}
          />
          <button
            onClick={() => onChange(arr.filter((_, j) => j !== i))}
            title="เอาออก"
            className="shrink-0 rounded-md p-1 text-faint hover:bg-panel-3 hover:text-danger"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...arr, num ? 0 : ""])}
        className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1 text-[11px] text-faint hover:border-accent/60 hover:text-ink"
      >
        <Plus size={11} /> เพิ่ม
      </button>
    </div>
  );
}

/** ติ๊กได้หลายอัน (ai.tasks · review.tasks) และแบบที่ *ลำดับมีความหมาย*
 *
 *  compose.pattern คือลำดับการสลับพูด/วิว — กดซ้ำได้ เพราะ พูด→วิว→วิว ต่างจาก
 *  พูด→วิว จริง ๆ  ชนิดนี้จึงเป็น "ต่อท้าย" ไม่ใช่ "ติ๊กเปิด/ปิด"
 */
function PickEditor({
  f,
  value,
  onChange,
}: {
  f: SetupField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const arr = (Array.isArray(value) ? value : []).map(String);
  const ordered = f.type === "multi_order";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {(f.options ?? []).map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              onClick={() =>
                onChange(
                  ordered
                    ? [...arr, o]
                    : on
                      ? arr.filter((x) => x !== o)
                      : [...arr, o],
                )
              }
              title={ordered ? "กดเพื่อต่อท้ายลำดับ" : undefined}
              className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
                on && !ordered
                  ? "bg-accent/20 text-accent shadow-[inset_0_0_0_1px_var(--accent)]"
                  : "bg-panel-2 text-muted hover:text-ink"
              }`}
            >
              {f.labels?.[o] ?? o}
            </button>
          );
        })}
      </div>
      {ordered && (
        <div className="flex flex-wrap items-center gap-1">
          {arr.length === 0 && (
            <span className="text-[10.5px] text-faint">ยังไม่ได้ตั้งลำดับ</span>
          )}
          {arr.map((o, i) => (
            <button
              key={i}
              onClick={() => onChange(arr.filter((_, j) => j !== i))}
              title="กดเพื่อเอาออกจากลำดับ"
              className="flex items-center gap-1 rounded-md bg-panel-3 px-1.5 py-0.5 text-[10.5px] text-ink hover:text-danger"
            >
              {i + 1}. {f.labels?.[o] ?? o}
              <X size={9} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  f,
  value,
  onChange,
}: {
  f: SetupField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (f.type) {
    case "bool":
      return <Toggle value={Boolean(value)} onChange={onChange} label="" />;
    case "int":
      return (
        <NInput
          value={Number(value ?? 0)}
          step={f.step ?? 1}
          min={f.min}
          max={f.max}
          onChange={(v) => onChange(Math.round(v))}
        />
      );
    case "float":
      return (
        <NInput
          value={Number(value ?? 0)}
          step={f.step}
          min={f.min}
          max={f.max}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <Sel
          value={String(value ?? "")}
          onChange={onChange}
          options={(f.options ?? []).map((o) => ({
            v: o,
            label: f.labels?.[o] ?? o,
          }))}
        />
      );
    case "str":
    case "path":
      return (
        <TInput
          value={String(value ?? "")}
          onChange={onChange}
          placeholder={f.placeholder}
          mono={f.type === "path"}
        />
      );
    case "multi":
    case "multi_order":
      return <PickEditor f={f} value={value} onChange={onChange} />;
    case "list_float":
      return <ListEditor value={value} onChange={onChange} num />;
    case "list_str":
      return (
        <ListEditor
          value={value}
          onChange={onChange}
          num={false}
          placeholder={f.placeholder}
        />
      );
    case "text":
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
        />
      );
    // ชนิด "clips" ตั้งใจให้แก้ที่ตัวของจริง ไม่ใช่ในฟอร์ม — ติ๊กที่ตัวคลิปในคลัง
    // หรือลากในไทม์ไลน์ แล้วค่ามาโผล่ที่นี่  โชว์ *จำนวน* ไม่ใช่ JSON ดิบ เพราะ
    // สิ่งเดียวที่อ่านออกจากบล็อก JSON ยาว ๆ คือ "มีของอยู่เท่าไร"
    default: {
      const nItems = Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value).length
          : 0;
      return (
        <div
          className="flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-1.5 text-[11px] text-faint"
          title={`แก้ที่ตัวของจริง (คลังคลิป / ไทม์ไลน์) ไม่ใช่ในฟอร์มนี้\n${JSON.stringify(value)?.slice(0, 300) ?? ""}`}
        >
          <span className="text-ink">{nItems}</span> รายการ · เลือกที่ตัวคลิป
        </div>
      );
    }
  }
}

export default function SetupPanel({
  reloadKey,
  flash,
}: {
  reloadKey: number;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<SetupData | null>(null);
  const [changed, setChanged] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState("");
  const [q, setQ] = useState("");
  // "เฉพาะที่ตั้งเอง" = ค่าที่ไฟล์โปรเจกต์ทับไว้ ต่างจากค่าที่ตกมาจาก preset
  // ตอบคำถามที่ถามบ่อยที่สุดของหน้านี้: โปรเจกต์นี้ต่างจากค่าตั้งต้นตรงไหนบ้าง
  const [mine, setMine] = useState(false);
  // จำว่าพับกลุ่มไหนไว้ / กางขั้นสูงของกลุ่มไหนไว้ — เก็บเป็นรายชื่อ stage คั่น
  // ด้วยจุลภาค  ค่าเริ่มต้นว่าง = กางทุกกลุ่ม พับขั้นสูงทุกกลุ่ม
  const [shut] = usePref("vcut.setup.shut", "", () => true);
  const [advOn] = usePref("vcut.setup.adv", "", () => true);

  const load = useCallback(async () => {
    try {
      setData(await api2.setup());
      setChanged({});
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  /** ค่านี้ถูกทับไว้ในไฟล์โปรเจกต์ไหม — เทียบกับค่าที่ *จะเป็น* ถ้าไม่มีไฟล์นี้
   *
   *  `inherited` เอนจินส่งมาให้ตั้งแต่แรกแต่ไม่เคยถูกใช้ ทั้งที่มันคือเส้นแบ่ง
   *  ระหว่าง "ค่านี้ฉันตั้งเอง" กับ "ค่านี้มากับ preset" ซึ่งหน้าที่มี 148 ช่อง
   *  อ่านไม่ออกเลยถ้าไม่มีตัวบอก
   */
  const own = useCallback(
    (k: string) =>
      !!data &&
      JSON.stringify(data.values[k]) !== JSON.stringify(data.inherited[k]),
    [data],
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const want = q.trim().toLowerCase();
    const by = new Map<string, SetupField[]>();
    for (const f of data.fields) {
      // สวิตช์ "รันขั้น 1-5" ถูกถอดออกจากเอนจินแล้ว — กันไว้เผื่อต่อกับเอนจินรุ่นเก่า
      // ที่ยังส่งมา จะได้ไม่มีการ์ดสวิตช์ที่กดแล้วไม่มีอะไรในหน้านี้เปลี่ยนโผล่กลับมา
      if (f.stage === "run") continue;
      // โฟลเดอร์ฟุตเทจไม่ให้ชี้ไปที่อื่นจากหน้านี้อีกแล้ว — คลิปเข้าคลังทางเดียว
      // คือ "เพิ่มคลิป" ในแผงคลังคลิป ซึ่งอัปโหลดลงโฟลเดอร์ของโปรเจกต์นี้เสมอ
      // (เอนจินยังใช้ค่านี้อยู่ แค่ไม่เปิดให้แก้ — ย้ายทีเดียวทั้งคลังไม่ใช่งานของ
      // ฟอร์มตั้งค่า มันแปลว่าอ่านคลิปใหม่ทั้งกองแล้วไทม์ไลน์เดิมชี้ไฟล์ไม่เจอ)
      if (f.key === "project.source") continue;
      // ค้นทั้งชื่อไทยและคีย์จริง — คนที่มาจากไฟล์ TOML รู้จัก "encode.crf"
      // ส่วนคนที่มาจากหน้าเว็บรู้จัก "คุณภาพคงที่"
      if (
        want &&
        !f.label.toLowerCase().includes(want) &&
        !f.key.toLowerCase().includes(want) &&
        !(f.help ?? "").toLowerCase().includes(want)
      ) {
        continue;
      }
      if (mine && !own(f.key)) continue;
      if (!by.has(f.stage)) by.set(f.stage, []);
      by.get(f.stage)!.push(f);
    }
    // เรียงกลุ่มตามลำดับที่เอนจินบอก ไม่ใช่ตามลำดับที่ field ตัวแรกโผล่
    const order = (data.stages ?? []).map((x) => x.id);
    return [...by.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [data, q, mine, own]);

  const stageLabel = useCallback(
    (id: string) =>
      (data?.stages ?? []).find((x) => x.id === id)?.label ??
      STAGE_FALLBACK[id] ??
      id,
    [data],
  );

  if (!data) {
    return (
      <Panel title={<><Settings size={13} /> ตั้งค่าเอนจิน</>}>
        <Spin />
      </Panel>
    );
  }

  const dirty = Object.keys(changed).length > 0;
  // งานที่แพงที่สุดที่จะโดนเมื่อบันทึกค่าที่แก้ไว้ทั้งชุด
  const worst = Object.keys(changed)
    .map((k) => data.fields.find((f) => f.key === k)?.tier ?? "free")
    .sort((a, b) => (data.tiers[b]?.rank ?? 0) - (data.tiers[a]?.rank ?? 0))[0];

  /** กดสูตรสำเร็จ — เขียนค่าทั้งชุดลงไฟล์โปรเจกต์ผ่านทางเดียวกับที่กรอกฟอร์มเอง
   *
   *  ไม่ใช่แค่ใส่ค่าค้างไว้ในฟอร์มให้กดบันทึกอีกที เพราะสูตรหนึ่งแตะ 22 ค่า —
   *  เห็นทุกช่องขึ้นจุด "แก้แล้ว" พร้อมกันแล้วอ่านไม่ออกว่าอะไรเปลี่ยนบ้างอยู่ดี
   *  ลงไฟล์ไปเลยแล้วโหลดค่ากลับมาโชว์ ตรงไปตรงมากว่า และย้อนได้ด้วยประวัติของ
   *  เอนจิน (แท็บรีเซ็ต) เหมือนการบันทึกครั้งอื่น
   */
  const applyRecipe = async (r: SetupRecipe) => {
    if (!data?.project.path) {
      return flash("ยังไม่มีไฟล์โปรเจกต์ให้บันทึก — สร้างผ่าน viewer เดิมก่อน");
    }
    setApplying(r.preset);
    try {
      const res = await api2.saveSetup(data.project.path, r.values);
      setData(res.setup);
      setChanged({});
      flash(
        `ใช้สูตร "${r.label}" แล้ว — ตั้ง ${Object.keys(r.values).length} ค่า` +
          " · กด ③ รวมเป็นหนัง แล้ว Export ใหม่",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "ใช้สูตรไม่สำเร็จ");
    } finally {
      setApplying("");
    }
  };

  const save = async () => {
    if (!data.project.path) {
      return flash("ยังไม่มีไฟล์โปรเจกต์ให้บันทึก — สร้างผ่าน viewer เดิมก่อน");
    }
    setSaving(true);
    try {
      const r = await api2.saveSetup(data.project.path, changed);
      setData(r.setup);
      setChanged({});
      flash("บันทึกไฟล์โปรเจกต์แล้ว");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={
        <>
          <Settings size={13} /> ตั้งค่าเอนจิน
          <span className="ml-1 truncate font-mono text-[10px] text-faint">
            {data.project.path || "ยังไม่มีไฟล์โปรเจกต์"}
          </span>
        </>
      }
      width="w-[26rem]"
      resize={{ key: "vcut.w.setup", min: 340, max: 900, def: 416 }}
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={save}
          onRevert={load}
          hint={
            worst && worst !== "free"
              ? `แก้ ${Object.keys(changed).length} ค่า · จะต้อง: ${data.tiers[worst]?.label ?? worst}`
              : `แก้ ${Object.keys(changed).length} ค่า`
          }
        />
      }
    >
      {/* ── แถบค้นหา ──
          148 ช่องใน 13 กลุ่ม การไล่หาด้วยตาคือส่วนที่ช้าที่สุดของหน้านี้
          และเป็นเหตุผลที่คนไปแก้ไฟล์ TOML เองแทน */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาค่า — ชื่อไทยหรือคีย์ เช่น crf"
            className="w-full rounded-lg border border-line bg-panel-2 py-1.5 pl-7 pr-6 text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={() => setMine((v) => !v)}
          title="โชว์เฉพาะค่าที่ไฟล์โปรเจกต์นี้ทับไว้ — ที่เหลือตกมาจาก preset"
          className={`shrink-0 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
            mine
              ? "bg-accent/20 text-accent shadow-[inset_0_0_0_1px_var(--accent)]"
              : "bg-panel-2 text-muted hover:text-ink"
          }`}
        >
          เฉพาะที่ตั้งเอง
        </button>
      </div>
      {(q || mine) && (
        <div className="-mt-1 text-[10.5px] text-faint">
          เจอ {groups.reduce((a, [, fs]) => a + fs.length, 0)} ช่อง จาก{" "}
          {data.fields.length}
        </div>
      )}

      {(data.recipes ?? []).length > 0 && !q && !mine && (
        <Section title="สูตรสำเร็จ">
          {(data.recipes ?? []).map((r) => (
            <div
              key={r.preset}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel-2 p-2.5"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 text-[12px] text-ink">{r.label}</span>
                <button
                  disabled={!!applying || dirty}
                  onClick={() => applyRecipe(r)}
                  title={
                    dirty
                      ? "มีค่าที่แก้ค้างอยู่ — บันทึกหรือย้อนกลับก่อน แล้วค่อยกดสูตร"
                      : `เขียน ${Object.keys(r.values).length} ค่าลงไฟล์โปรเจกต์ทันที`
                  }
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[11.5px] font-medium text-white disabled:opacity-40"
                >
                  <Wand2 size={12} />
                  {applying === r.preset ? "กำลังตั้ง…" : "ใช้สูตรนี้"}
                </button>
              </div>
              <div className="text-[10.5px] leading-4 text-muted">{r.hint}</div>
              {/* คีย์ที่ฟอร์มตั้งไม่ได้ — บอกไว้ดีกว่าให้เข้าใจว่าปุ่มตั้งครบแล้ว
                  ทั้งที่ยังขาด (ปกติว่าง · โผล่เมื่อ preset มีคีย์นอกฟอร์ม) */}
              {r.skipped.length > 0 && (
                <div className="text-[10.5px] leading-4 text-warn">
                  อีก {r.skipped.length} ค่าฟอร์มนี้ตั้งไม่ได้ ({r.skipped.join(", ")})
                  — ใช้ <code className="font-mono">./vcut run -c {r.preset}</code> จากเทอร์มินัลถ้าต้องการครบ
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {groups.map(([stage, fields]) => {
        // ค้นหาอยู่ = กางให้หมด ไม่งั้นพิมพ์แล้วเจอกลุ่มที่พับอยู่ = เหมือนไม่เจอ
        const open = !!q || mine || !shut.split(",").includes(stage);
        const main = fields.filter((f) => !f.adv);
        const adv = fields.filter((f) => f.adv);
        const advOpen = !!q || advOn.split(",").includes(stage);
        const nOwn = fields.filter((f) => own(f.key)).length;
        return (
          <Section
            key={stage}
            title={stageLabel(stage)}
            right={
              <button
                onClick={() => {
                  const set = new Set(shut.split(",").filter(Boolean));
                  if (open) set.add(stage);
                  else set.delete(stage);
                  writePref("vcut.setup.shut", [...set].join(","));
                }}
                title={open ? "พับกลุ่มนี้" : "กางกลุ่มนี้"}
                className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[10.5px] text-faint hover:text-ink"
              >
                {nOwn > 0 && <span className="text-accent">{nOwn} ตั้งเอง</span>}
                <span>{fields.length}</span>
                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            }
          >
            {open && (
              <>
                <FieldGrid
                  fields={main}
                  data={data}
                  changed={changed}
                  own={own}
                  onChange={(k, v) => setChanged((p) => ({ ...p, [k]: v }))}
                  onReset={(k) =>
                    setChanged((p) => {
                      const rest = { ...p };
                      delete rest[k];
                      return rest;
                    })
                  }
                />
                {adv.length > 0 && (
                  <>
                    <button
                      onClick={() => {
                        const set = new Set(advOn.split(",").filter(Boolean));
                        if (advOpen) set.delete(stage);
                        else set.add(stage);
                        writePref("vcut.setup.adv", [...set].join(","));
                      }}
                      title="ค่าที่ตั้งไว้ถูกแล้วสำหรับเกือบทุกคน — เปิดดูได้ถ้ารู้ว่าจะแก้อะไร"
                      className="flex items-center gap-1 self-start rounded-md text-[10.5px] text-faint hover:text-ink"
                    >
                      {advOpen ? (
                        <ChevronDown size={11} />
                      ) : (
                        <ChevronRight size={11} />
                      )}
                      ขั้นสูง · {adv.length} ค่า
                    </button>
                    {advOpen && (
                      <FieldGrid
                        fields={adv}
                        data={data}
                        changed={changed}
                        own={own}
                        onChange={(k, v) =>
                          setChanged((p) => ({ ...p, [k]: v }))
                        }
                        onReset={(k) =>
                          setChanged((p) => {
                            const rest = { ...p };
                            delete rest[k];
                            return rest;
                          })
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
          </Section>
        );
      })}
      {groups.length === 0 && (
        <div className="py-6 text-center text-[12px] text-faint">
          ไม่มีค่าไหนตรงกับที่ค้น
        </div>
      )}
    </Panel>
  );
}

/** ตารางช่องกรอกหนึ่งชุด — ใช้ทั้งกับค่าปกติและค่าขั้นสูงของกลุ่มเดียวกัน */
function FieldGrid({
  fields,
  data,
  changed,
  own,
  onChange,
  onReset,
}: {
  fields: SetupField[];
  data: SetupData;
  changed: Record<string, unknown>;
  own: (k: string) => boolean;
  onChange: (k: string, v: unknown) => void;
  onReset: (k: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {fields.map((f) => {
        const edited = f.key in changed;
        const cur = edited ? changed[f.key] : data.values[f.key];
        const wide = [
          "text",
          "path",
          "str",
          "select",
          "multi",
          "multi_order",
          "list_float",
          "list_str",
        ].includes(f.type);
        const tier = f.tier !== "free" ? data.tiers[f.tier]?.label : "";
        return (
          <div key={f.key} className={wide ? "col-span-2" : ""}>
            <Field
              label={`${f.label}${f.unit ? ` (${f.unit})` : ""}${tier ? ` · ${tier}` : ""}`}
            >
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1">
                  <Editor
                    f={f}
                    value={cur}
                    onChange={(v) => onChange(f.key, v)}
                  />
                </span>
                {/* จุดสองสี: ส้ม = เพิ่งแก้ยังไม่บันทึก · น้ำเงิน = ไฟล์โปรเจกต์
                    ทับค่าตั้งต้นไว้อยู่แล้ว  กดที่จุดส้มเพื่อทิ้งที่เพิ่งแก้ */}
                {edited ? (
                  <button
                    onClick={() => onReset(f.key)}
                    title={`ยังไม่บันทึก — กดเพื่อกลับไปที่ ${JSON.stringify(data.values[f.key])}`}
                    className="shrink-0 rounded p-0.5 text-warn hover:bg-panel-3"
                  >
                    <RotateCcw size={11} />
                  </button>
                ) : (
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      own(f.key) ? "bg-accent" : "bg-transparent"
                    }`}
                    title={
                      own(f.key)
                        ? `ไฟล์โปรเจกต์ทับไว้ · ค่าตั้งต้นคือ ${JSON.stringify(data.inherited[f.key])}`
                        : ""
                    }
                  />
                )}
              </div>
            </Field>
            <div
              className="mt-0.5 line-clamp-2 text-[10px] leading-3.5 text-faint"
              title={`${f.key}\n${f.help ?? ""}`}
            >
              {f.helps?.[String(cur)] ?? f.help ?? f.key}
            </div>
          </div>
        );
      })}
    </div>
  );
}
