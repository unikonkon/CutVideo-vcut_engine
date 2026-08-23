"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { api2, type SetupData, type SetupField } from "@/lib/api";
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
