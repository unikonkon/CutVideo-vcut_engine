"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings, Sparkles, Wand2 } from "lucide-react";
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

const STAGE_LABEL: Record<string, string> = {
  project: "โปรเจกต์",
  scan: "① อ่านคลิป",
  thumbs: "① ภาพตัวอย่าง",
  listen: "② ถอดเสียง",
  ai: "② ความเห็น AI",
  prepare: "② เตรียมคลัง",
  compose: "③ รวมร่าง",
  render: "④ ตัดชิ้น",
  assemble: "④ ต่อไฟล์",
  fx: "⑤ แต่งหนัง",
};

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
        <NInput value={Number(value ?? 0)} step={1} onChange={(v) => onChange(Math.round(v))} />
      );
    case "float":
      return <NInput value={Number(value ?? 0)} onChange={onChange} />;
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
      return <TInput value={String(value ?? "")} onChange={onChange} mono={f.type === "path"} />;
    case "text":
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
        />
      );
    default:
      return (
        <div
          className="truncate rounded-lg bg-panel-2 px-2 py-1.5 font-mono text-[11px] text-faint"
          title="ค่าชนิดนี้แก้ผ่านหน้า viewer เดิม (จัดคลิป/ลำดับ)"
        >
          {JSON.stringify(value)?.slice(0, 60) || "—"} · แก้ใน viewer เดิม
        </div>
      );
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

  const groups = useMemo(() => {
    if (!data) return [];
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
      if (!by.has(f.stage)) by.set(f.stage, []);
      by.get(f.stage)!.push(f);
    }
    return [...by.entries()];
  }, [data]);

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
      {(data.recipes ?? []).length > 0 && (
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

      {groups.map(([stage, fields]) => (
        <Section key={stage} title={STAGE_LABEL[stage] ?? stage}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {fields.map((f) => {
              const cur = f.key in changed ? changed[f.key] : data.values[f.key];
              const edited = f.key in changed;
              const wide = ["text", "path", "str", "select"].includes(f.type);
              return (
                <div key={f.key} className={wide ? "col-span-2" : ""} title={f.help ?? f.key}>
                  <Field
                    label={`${f.label}${edited ? " •" : ""}${
                      f.tier !== "free" ? ` (${data.tiers[f.tier]?.label ?? ""})` : ""
                    }`}
                  >
                    <Editor
                      f={f}
                      value={cur}
                      onChange={(v) => setChanged((p) => ({ ...p, [f.key]: v }))}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </Panel>
  );
}
