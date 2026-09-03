"use client";

// ของกลางของลิ้นชัก "ขั้นสูง" — โครง Drawer · draft ที่ทุกแท็บใช้ร่วม · ช่องกรอกตามชนิดค่า
//
// ทำไม draft อยู่ก้อนเดียว (ส่งมาจาก index) ไม่ใช่ของใครของมัน: แท็บ ตั้งค่า /
// วิธีเลือก / AI แก้ *ไฟล์โปรเจกต์ตัวเดียวกัน* ถ้าแยก draft คนละก้อน สลับแท็บแล้ว
// ของที่แก้ค้างหาย หรือบันทึกทับกันโดยไม่มีอะไรฟ้อง

import { useState, type ReactNode } from "react";
import Drawer from "@/components/frames/Drawer";
import { Btn, Kv, Mono, NIn, Sel, TArea, TIn, Tog, Well } from "@/components/instrument";
import { useRoute } from "@/hooks/route";
import type { SetupData, SetupField } from "@/lib/api";

export type Values = Record<string, unknown>;

/** สิ่งที่ index ส่งให้ทุกแท็บ — ข้อมูล setup ล่าสุด + draft ที่ยังไม่บันทึก */
export interface TabProps {
  setup: SetupData;
  /** แทนก้อน setup ด้วยผลที่ POST ตอบกลับ (reset/restore ก็ตอบ setup ใหม่มาเหมือนกัน) */
  setSetup: (s: SetupData) => void;
  draft: Values;
  /** ใส่ค่าลง draft — ถ้าเท่ากับค่าที่บันทึกไว้แล้วจะถอดออกจาก draft ให้เอง */
  put: (k: string, v: unknown) => void;
  drop: (k: string) => void;
  /** ค่าที่หน้าจอควรโชว์ = draft ก่อน ไม่มีค่อยเอาค่าที่บันทึกไว้ */
  val: (k: string) => unknown;
  field: (k: string) => SetupField | undefined;
  save: () => Promise<boolean>;
  saving: boolean;
  discard: () => void;
  onClose: () => void;
}

export function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function tierRank(setup: SetupData, tier: string) {
  return setup.tiers[tier]?.rank ?? 0;
}

/** tier ที่แพงที่สุดในกลุ่มคีย์ — ใช้ติดป้ายราคาที่หัวกลุ่ม */
export function worstTier(setup: SetupData, keys: string[]) {
  let best = "free";
  for (const k of keys) {
    const t = setup.fields.find((f) => f.key === k)?.tier ?? "free";
    if (tierRank(setup, t) > tierRank(setup, best)) best = t;
  }
  return best;
}

/** แปลง rank 0–6 ของเอนจินเป็นขีด 1–4 ของมิเตอร์ (ตำนาน COST OF CHANGE ใน mockup:
 *  no rebuild · assemble · listen/silence · render all) */
export function bars(rank: number) {
  return rank <= 0 ? 1 : rank <= 2 ? 2 : rank <= 4 ? 3 : 4;
}

export const GLYPH = ["⓪", "①", "②", "③", "④", "⑤"];
/** ชื่อสั้นของ phase บนปุ่ม (ตาม mockup) — id มาจาก setup.phases เสมอ */
export const PHASE_SHORT: Record<string, string> = {
  source: "คลิป",
  prepare: "เตรียม",
  compose: "รวม",
  text: "ต่อไฟล์",
  fx: "แต่ง",
};

export function phaseLabel(setup: SetupData, id: string) {
  const ph = setup.phases.find((p) => p.id === id);
  if (!ph) return id;
  return `${GLYPH[ph.no] ?? ph.no} ${PHASE_SHORT[ph.id] ?? ph.label}`;
}

/** ป้ายในหัวลิ้นชัก — โมโนตัวเล็กในร่อง (mockup: "MOD 2 · UNSAVED") */
export function HeadBadge({ children, muted, title }: { children: ReactNode; muted?: boolean; title?: string }) {
  return (
    <Well className="mono" style={{ padding: "3px 8px", fontSize: 10.5, color: muted ? "var(--muted)" : "var(--amber)", whiteSpace: "nowrap" }} title={title}>
      {children}
    </Well>
  );
}

/** โครงลิ้นชักขั้นสูง — ทุกแท็บใช้หัวเดียวกัน ต่างกันแค่คำโปรย · ป้าย · ท้าย */
export function AdvFrame({
  sub,
  badge,
  footer,
  draftN,
  onClose,
  children,
}: {
  sub: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  draftN: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const r = useRoute();
  return (
    <Drawer
      tag="SEC 03 · ADVANCED"
      title="ขั้นสูง"
      sub={sub}
      tabs={r.adv}
      onTab={r.setAdv}
      onClose={onClose}
      badge={
        <>
          {badge}
          {draftN > 0 && <HeadBadge title="ค่าที่แก้แล้วยังไม่บันทึก">MOD {draftN} · UNSAVED</HeadBadge>}
        </>
      }
      footer={footer}
    >
      {children}
    </Drawer>
  );
}

/** ค่าอ่านง่ายสำหรับโชว์ในบรรทัดเดียว (now → back ของแท็บรีเซ็ต) */
export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  if (Array.isArray(v)) return v.length <= 3 ? `[${v.map(String).join(", ")}]` : `[${v.length} รายการ]`;
  if (typeof v === "object") return `{${Object.keys(v as object).length} รายการ}`;
  const s = String(v);
  return s.length > 28 ? `${s.slice(0, 26)}…` : s;
}

/** ติ๊กหลายตัว (multi) และแบบที่ *ลำดับมีความหมาย* (multi_order เช่น compose.pattern
 *  พูด→วิว→วิว ต่างจาก พูด→วิว) — แบบหลังจึงเป็น "ต่อท้าย" ไม่ใช่เปิด/ปิด */
function PickIn({ f, value, onChange, disabled }: { f: SetupField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const arr = (Array.isArray(value) ? value : []).map(String);
  const ordered = f.type === "multi_order";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {(f.options ?? []).map((o) => {
          const on = arr.includes(o);
          return (
            <Btn
              key={o}
              sm
              on={on && !ordered}
              disabled={disabled}
              title={ordered ? "กดเพื่อต่อท้ายลำดับ" : undefined}
              onClick={() => onChange(ordered ? [...arr, o] : on ? arr.filter((x) => x !== o) : [...arr, o])}
            >
              {f.labels?.[o] ?? o}
            </Btn>
          );
        })}
      </div>
      {ordered && (
        <div className="flex flex-wrap items-center gap-1">
          {arr.length === 0 && <Kv style={{ fontSize: 10.5 }}>ยังไม่ได้ตั้งลำดับ</Kv>}
          {arr.map((o, i) => (
            <Btn key={`${o}-${i}`} sm ghost disabled={disabled} title="กดเพื่อเอาออกจากลำดับ" onClick={() => onChange(arr.filter((_, j) => j !== i))}>
              {i + 1}. {f.labels?.[o] ?? o} ✕
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

/** ลิสต์เป็นข้อความคั่นจุลภาค — แปลงตอนออกจากช่อง ไม่ใช่ทุกตัวอักษร ไม่งั้นพิมพ์
 *  "1," แล้วจุลภาคหายทันทีเพราะถูก parse เป็น [1] */
function ListIn({ value, num, onChange, placeholder, disabled }: { value: unknown; num: boolean; onChange: (v: unknown) => void; placeholder?: string; disabled?: boolean }) {
  const shown = (Array.isArray(value) ? value : []).map(String).join(", ");
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    onChange(num ? parts.map(Number).filter(Number.isFinite) : parts);
    setText(null);
  };
  return (
    <input
      type="text"
      className="well in"
      value={text ?? shown}
      placeholder={placeholder ?? "คั่นด้วยจุลภาค"}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/** ช่องกรอกที่ถูกต้องตามชนิดค่าของเอนจิน — ทางเดียวที่ทุกแท็บใช้ (port จาก SetupPanel v1) */
export function FieldInput({
  f,
  value,
  onChange,
  disabled,
  help = true,
}: {
  f: SetupField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  /** โชว์ helps[ตัวที่เลือก] ใต้ช่อง select */
  help?: boolean;
}) {
  switch (f.type) {
    case "bool":
      return <Tog on={Boolean(value)} onChange={onChange} disabled={disabled} />;
    case "int":
      return <NIn value={Number(value ?? 0)} step={f.step ?? 1} min={f.min} max={f.max} unit={f.unit} disabled={disabled} onChange={(v) => onChange(Math.round(v))} />;
    case "float":
      return <NIn value={Number(value ?? 0)} step={f.step ?? 0.1} min={f.min} max={f.max} unit={f.unit} disabled={disabled} onChange={onChange} />;
    case "select": {
      const cur = String(value ?? "");
      const opts = [...(f.options ?? [])];
      // ค่าที่ไฟล์ตั้งไว้แต่ไม่อยู่ในตัวเลือก — ต้องโชว์ ไม่งั้น <select> เด้งไปตัวแรกเงียบ ๆ
      if (cur && !opts.includes(cur)) opts.push(cur);
      return (
        <>
          <Sel value={cur} onChange={onChange} disabled={disabled} options={opts.map((o) => ({ v: o, label: f.labels?.[o] ?? o }))} />
          {help && f.helps?.[cur] && <Kv style={{ fontSize: 10.5, lineHeight: "14px" }}>{f.helps[cur]}</Kv>}
        </>
      );
    }
    case "str":
    case "path":
      return <TIn value={String(value ?? "")} onChange={onChange} placeholder={f.placeholder} mono={f.type === "path"} disabled={disabled} />;
    case "text":
      return <TArea value={String(value ?? "")} onChange={onChange} placeholder={f.placeholder} rows={2} disabled={disabled} />;
    case "multi":
    case "multi_order":
      return <PickIn f={f} value={value} onChange={onChange} disabled={disabled} />;
    case "list_float":
    case "list_str":
      return <ListIn value={value} num={f.type === "list_float"} onChange={onChange} placeholder={f.placeholder} disabled={disabled} />;
    // "clips" / dict ตั้งใจให้แก้ที่ตัวของจริง (คลังคลิป · คลังชิ้น · ไทม์ไลน์) — โชว์แค่จำนวน
    default: {
      const n = Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value as object).length : 0;
      return (
        <Mono className="well" style={{ display: "block", padding: "5px 8px", fontSize: 11, color: "var(--muted)" }} title={`แก้ที่ตัวของจริง ไม่ใช่ในฟอร์มนี้\n${JSON.stringify(value)?.slice(0, 300) ?? ""}`}>
          {n} รายการ · แก้ที่ตัวคลิป/ชิ้น
        </Mono>
      );
    }
  }
}
