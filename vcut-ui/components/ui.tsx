"use client";

// ชิ้นส่วนฟอร์มเล็ก ๆ ที่ทุก panel ใช้ร่วมกัน — โทนเดียวกับ OpenCut

import { type ReactNode } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

export function Panel({
  title,
  children,
  width = "w-[22rem]",
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}) {
  return (
    <aside
      className={`flex ${width} shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel`}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] font-medium text-muted">
        {title}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {children}
      </div>
      {footer}
    </aside>
  );
}

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
          {title}
        </span>
        <div className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${span2 ? "col-span-2" : ""}`}>
      <span className="truncate text-[11px] text-muted" title={label}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent";

export function TInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${mono ? "font-mono" : ""}`}
    />
  );
}

export function NInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className={`${inputCls} font-mono`}
    />
  );
}

export function CInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-panel-2 p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} font-mono`}
      />
    </div>
  );
}

export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 py-1 text-left text-[12px] text-ink"
    >
      <span
        className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-panel-3"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onRevert,
  hint,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
  hint?: string;
}) {
  if (!dirty) return null;
  return (
    <div className="flex items-center gap-2 border-t border-line bg-panel-2 px-3 py-2">
      <span className="flex-1 truncate text-[11px] text-warn">
        {hint || "ยังไม่บันทึก"}
      </span>
      <button
        onClick={onRevert}
        className="rounded-md p-1.5 text-muted hover:bg-panel-3 hover:text-ink"
        title="ทิ้งที่แก้ กลับเป็นตามไฟล์"
      >
        <RotateCcw size={13} />
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        title="บันทึกลงไฟล์โปรเจกต์ (Cmd+S)"
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-2 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Save size={12} />
        )}
        บันทึก
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 p-5 text-center text-[12px] leading-5 text-muted">
      {children}
    </div>
  );
}

export function Spin() {
  return (
    <div className="flex justify-center py-8 text-muted">
      <Loader2 size={16} className="animate-spin" />
    </div>
  );
}
