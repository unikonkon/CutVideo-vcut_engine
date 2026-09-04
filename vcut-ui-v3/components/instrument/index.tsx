"use client";

// ชิ้นส่วนพื้นฐานของทิศทาง C · แผงควบคุม — ทุกหน้าใน v2 ประกอบจากตัวนี้เท่านั้น
//
// คลาส CSS อยู่ใน app/globals.css (ชื่อเดียวกับ mockup) ที่นี่แค่ห่อเป็น React
// พร้อมพฤติกรรม: ลูกบิดลากได้ · สวิตช์กดได้ · ปุ่มคีย์เลือกได้ — หน้าตาไม่ต้อง
// คิดใหม่ในแต่ละหน้า และเปลี่ยนโทเคนที่เดียวแล้วเปลี่ยนทั้งแอป

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

type Div = { className?: string; style?: CSSProperties; children?: ReactNode; title?: string };

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/** แผงนูน — กล่องหลักของทุกคอลัมน์ */
export function Panel({ className, style, children, title }: Div) {
  return (
    <div className={cx("panel", className)} style={style} title={title}>
      {children}
    </div>
  );
}

/** ร่องบุ๋ม — ที่วางของ/ค่า · sel = ถูกเลือก (ขอบอำพัน) · dashed = ที่วางไฟล์ */
export function Well({
  sel,
  dashed,
  onClick,
  className,
  style,
  children,
  title,
}: Div & { sel?: boolean; dashed?: boolean; onClick?: () => void }) {
  return (
    <div
      className={cx("well", sel && "sel", dashed && "dashed", onClick && "cursor-pointer", className)}
      style={style}
      onClick={onClick}
      title={title}
      role={onClick ? "button" : undefined}
    >
      {children}
    </div>
  );
}

/** LED สถานะ — on = ทำแล้ว/เปิด · dim = กำลังทำ · red = ผิดพลาด */
export function Led({
  on,
  dim,
  red,
  blink,
  className,
  title,
}: {
  on?: boolean;
  dim?: boolean;
  red?: boolean;
  blink?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cx("led", on && "on", dim && "dim", red && "red", blink && "blink", className)}
      title={title}
    />
  );
}

export function Tag({ children, className, style }: Div) {
  return (
    <span className={cx("tag", className)} style={style}>
      {children}
    </span>
  );
}

export function Kv({ children, className, style, title }: Div) {
  return (
    <span className={cx("kv", className)} style={style} title={title}>
      {children}
    </span>
  );
}

export function Mono({ children, className, style, title }: Div) {
  return (
    <span className={cx("mono", className)} style={style} title={title}>
      {children}
    </span>
  );
}

/** ปุ่มคีย์ — on = กดค้าง (อำพัน) · off = หรี่ · ghost = แค่ขอบ */
export function Btn({
  on,
  off,
  sm,
  lg,
  ic,
  pri,
  ghost,
  danger,
  disabled,
  onClick,
  className,
  style,
  children,
  title,
  type = "button",
}: Div & {
  on?: boolean;
  off?: boolean;
  sm?: boolean;
  /** สูง 52 — ปุ่มถัดไปท้ายหน้า */
  lg?: boolean;
  /** ไอคอนล้วน กว้างเท่าสูง */
  ic?: boolean;
  /** ครีมกระดาษ = ปุ่มหลัก (ใช้ Cta ถ้าเป็นปุ่มเดียวของหน้า) */
  pri?: boolean;
  ghost?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={cx("btn", on && "on", off && "off", sm && "sm", lg && "lg", ic && "ic", pri && "pri", ghost && "ghost", danger && "danger", className)}
      style={style}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/** แถวคีย์เลือกหนึ่งตัว (เรดิโอ) — ตัวที่เลือกอยู่ติดไฟ */
export function Keys<T extends string>({
  items,
  value,
  onChange,
  sm = true,
  wrap = true,
  grow,
  className,
}: {
  items: { v: T; label: ReactNode; n?: ReactNode; title?: string; disabled?: boolean }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  sm?: boolean;
  wrap?: boolean;
  /** ทุกปุ่มกว้างเท่ากันเต็มแถว */
  grow?: boolean;
  className?: string;
}) {
  if (grow) {
    return (
      <Seg
        items={items.map((it) => ({ v: it.v, label: it.label, note: it.n, title: it.title, disabled: it.disabled }))}
        value={value ?? null}
        onChange={onChange}
        className={className}
      />
    );
  }
  return (
    <div className={cx("flex gap-1", wrap && "flex-wrap", className)}>
      {items.map((it) => (
        <Btn
          key={it.v}
          sm={sm}
          on={value === it.v}
          disabled={it.disabled}
          title={it.title}
          onClick={() => onChange(it.v)}
          style={grow ? { flex: 1 } : undefined}
        >
          {it.label}
          {it.n !== undefined && (
            <span className="mono" style={{ fontSize: 10, color: value === it.v ? undefined : "var(--muted)" }}>
              {it.n}
            </span>
          )}
        </Btn>
      ))}
    </div>
  );
}

/** สวิตช์เลื่อน */
export function Tog({
  on,
  onChange,
  disabled,
  label,
  title,
  className,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  title?: string;
  className?: string;
}) {
  const sw = (
    <span
      className={cx("tog", on && "on", disabled && "disabled")}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!on);
      }}
      role="switch"
      aria-checked={on}
      title={title}
    >
      <i />
    </span>
  );
  if (label === undefined) return sw;
  return (
    <span
      className={cx("inline-flex items-center gap-2", disabled && "opacity-60", className)}
      onClick={() => !disabled && onChange?.(!on)}
      title={title}
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {sw}
      <span style={{ fontSize: 12 }}>{label}</span>
    </span>
  );
}

/** ลูกบิด — ลากขึ้น/ลง (150 px = เต็มช่วง) · หมุนล้อได้ · ดับเบิลคลิก = ค่าตั้งต้น
 *
 *  ค่าที่โชว์ใต้ลูกบิดคือค่าจริงที่จะลงไฟล์ ไม่ใช่เปอร์เซ็นต์ — ลูกบิดเป็นแค่
 *  วิธีหมุน ตัวเลขยังต้องอ่านออก
 */
export function Knob({
  value,
  min,
  max,
  step = 1,
  def,
  onChange,
  label,
  size = "md",
  fmt,
  off,
  title,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  def?: number;
  onChange?: (v: number) => void;
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
  fmt?: (v: number) => string;
  /** ปิดอยู่ — โชว์เทา หมุนไม่ได้ */
  off?: boolean;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const span = Math.max(1e-9, max - min);
  const clamp = useCallback(
    (v: number) => {
      const q = Math.round(v / step) * step;
      const r = Math.min(max, Math.max(min, q));
      return Math.round(r * 1e6) / 1e6;
    },
    [min, max, step],
  );
  const rot = -135 + 270 * Math.min(1, Math.max(0, (value - min) / span));

  const start = (e: React.PointerEvent) => {
    if (off || !onChange) return;
    e.preventDefault();
    const y0 = e.clientY;
    const v0 = value;
    const move = (ev: PointerEvent) => {
      const dv = ((y0 - ev.clientY) / 150) * span * (ev.shiftKey ? 0.1 : 1);
      onChange(clamp(v0 + dv));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // wheel ต้องผูกแบบ passive:false ถึงจะกันหน้าเลื่อนได้ — React ผูกเป็น passive
  useEffect(() => {
    const el = ref.current;
    if (!el || off || !onChange) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const dir = ev.deltaY > 0 ? -1 : 1;
      onChange(clamp(value + dir * step * (ev.shiftKey ? 10 : 1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [value, step, clamp, onChange, off]);

  const knob = (
    <span
      ref={ref}
      className={cx("knob", size === "sm" && "sm", size === "lg" && "lg", off && "off")}
      style={{ ["--rot" as string]: `${rot}deg` }}
      onPointerDown={start}
      onDoubleClick={() => def !== undefined && onChange?.(clamp(def))}
      title={title}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    />
  );
  if (label === undefined) return knob;
  return (
    <div className={cx("flex flex-col items-center gap-1", className)} style={{ minWidth: 0 }}>
      {knob}
      <Tag style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label} {fmt ? fmt(value) : value}
      </Tag>
    </div>
  );
}

/** ตัวเลข 7-segment เรืองแสง — เวลา/จำนวน · off = ยังไม่มีค่า */
export function Seg7({
  children,
  size = 14,
  off,
  className,
  style,
  title,
}: Div & { size?: number; off?: boolean }) {
  return (
    <span className={cx("seg7", off && "off", className)} style={{ fontSize: size, ...style }} title={title}>
      {children}
    </span>
  );
}

/** ปุ่มสั่งงานหลัก — ตัวเดียวต่อหน้า */
export function Cta({
  children,
  onClick,
  disabled,
  sm,
  busy,
  className,
  title,
}: Div & { onClick?: () => void; disabled?: boolean; sm?: boolean; busy?: boolean }) {
  return (
    <button type="button" className={cx("cta", sm && "sm", className)} onClick={onClick} disabled={disabled || busy} title={title}>
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/** มิเตอร์ขีด — n จาก total ติด · hot = ขีดถัดไปกำลังทำ */
export function Meter({
  n,
  total = 20,
  hot,
  className,
  style,
}: {
  n: number;
  total?: number;
  hot?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const lit = Math.max(0, Math.min(total, Math.round(n)));
  return (
    <span className={cx("meter", className)} style={style}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < lit ? "l" : hot && i === lit ? "h" : undefined} />
      ))}
    </span>
  );
}

/** มิเตอร์ 4 ขีด = ราคาของการแก้ (tier rank) */
export function Cost({ n, label }: { n: number; label?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Meter n={n} total={4} style={{ width: 34 }} />
      {label !== undefined && <Tag>{label}</Tag>}
    </span>
  );
}

/** แถวสถิติ — ป้ายซ้าย ค่าขวา (โมโน) */
export function Stat({ label, value, warn, title, className }: { label: ReactNode; value: ReactNode; warn?: boolean; title?: string; className?: string }) {
  return (
    <div className={cx("stat", className)} title={title}>
      <span>{label}</span>
      <span style={warn ? { color: "var(--amber)" } : undefined}>{value}</span>
    </div>
  );
}

/** หัวส่วน — TAG · ชื่อ · คำอธิบาย · ของฝั่งขวา */
export function SecHead({
  tag,
  title,
  kv,
  right,
  size = 16,
  className,
}: {
  tag?: ReactNode;
  title?: ReactNode;
  kv?: ReactNode;
  right?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cx("h", className)}>
      {tag !== undefined && <Tag>{tag}</Tag>}
      {title !== undefined && (
        <span className="t" style={{ fontSize: size }}>
          {title}
        </span>
      )}
      {kv !== undefined && <Kv className="truncate">{kv}</Kv>}
      {right !== undefined && (
        <>
          <div style={{ flex: 1 }} />
          {right}
        </>
      )}
    </div>
  );
}

/** ช่องค่า — ป้ายเล็กด้านบน + ร่องบุ๋ม · chg = ค่าถูกแก้ยังไม่บันทึก */
export function Fld({
  label,
  chg,
  children,
  className,
  style,
  title,
}: Div & { label: ReactNode; chg?: boolean }) {
  return (
    <div className={cx("fld", chg && "chg", className)} style={style} title={title}>
      <label>{label}</label>
      {children}
    </div>
  );
}

const inWell = "well in";

export function TIn({
  value,
  onChange,
  placeholder,
  disabled,
  mono = true,
  onEnter,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
  onEnter?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <input
      type="text"
      className={cx(inWell, className)}
      style={{ fontFamily: mono ? undefined : "inherit", ...style }}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
    />
  );
}

export function TArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <textarea
      className={cx(inWell, className)}
      style={{ fontFamily: "inherit", fontSize: 13, lineHeight: "20px", resize: "vertical" }}
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NIn({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  disabled,
  className,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  unit?: string;
}) {
  const el = (
    <input
      type="number"
      className={cx(inWell, className)}
      value={Number.isFinite(value) ? value : ""}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
  if (!unit) return el;
  return (
    <span className="flex items-center gap-1.5">
      {el}
      <Tag>{unit}</Tag>
    </span>
  );
}

export function Sel({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select className={cx(inWell, className)} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CIn({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={{ width: 28, height: 24 }}
      />
      <TIn value={value} onChange={onChange} disabled={disabled} />
    </span>
  );
}

/** ภาพตัวอย่าง + ตัวเลขเวลา มุมขวาล่าง */
export function Thumb({
  src,
  tc,
  w,
  h,
  className,
  style,
  children,
  onClick,
  title,
}: Div & { src?: string; tc?: ReactNode; w?: number | string; h?: number | string; onClick?: () => void }) {
  return (
    <div className={cx("thumb", onClick && "cursor-pointer", className)} style={{ width: w, height: h, ...style }} onClick={onClick} title={title}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#0d0e0c" }} />
      )}
      {tc !== undefined && <span className="tc">{tc}</span>}
      {children}
    </div>
  );
}

/** กล่อง log โมโน — เลื่อนลงล่างสุดเองเมื่อมีบรรทัดใหม่ */
export function LogWell({ lines, className, style, max = 200, follow = true }: { lines: string[]; className?: string; style?: CSSProperties; max?: number; follow?: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, follow]);
  return (
    <pre ref={ref} className={cx("well logwell overflow-y-auto", className)} style={{ padding: "8px 10px", margin: 0, ...style }}>
      {lines.slice(-max).join("\n") || "…"}
    </pre>
  );
}

export function Empty({ children, className }: Div) {
  return (
    <div className={cx("well dashed", className)} style={{ padding: 18, textAlign: "center", fontSize: 12, lineHeight: "18px", color: "var(--muted)" }}>
      {children}
    </div>
  );
}

export function Spin({ className }: { className?: string }) {
  return (
    <div className={cx("flex justify-center py-6", className)} style={{ color: "var(--muted)" }}>
      <Loader2 size={16} className="animate-spin" />
    </div>
  );
}

/** ตาราง 5 ท่าวางบนจอ 9:16 — บนซ้าย · บนขวา · กลาง · ล่างซ้าย · ล่างขวา
 *  (+ ล่างกลางเมื่อ six=true) คืนค่า x/y สัมพัทธ์ + align แบบ ass */
export const POSES: { id: string; x: number; y: number; align: number; label: string; px: number; py: number }[] = [
  { id: "tl", x: 0.08, y: 0.08, align: 7, label: "บนซ้าย", px: 3, py: 3 },
  { id: "tr", x: 0.92, y: 0.08, align: 9, label: "บนขวา", px: 9, py: 3 },
  { id: "c", x: 0.5, y: 0.5, align: 5, label: "กลางจอ", px: 6, py: 10 },
  { id: "bl", x: 0.08, y: 0.9, align: 1, label: "ล่างซ้าย", px: 3, py: 17 },
  { id: "bc", x: 0.5, y: 0.9, align: 2, label: "ล่างกลาง", px: 6, py: 17 },
  { id: "br", x: 0.92, y: 0.9, align: 3, label: "ล่างขวา", px: 9, py: 17 },
];

export function PosGrid({
  value,
  onChange,
  cols = 5,
  ids = ["tl", "tr", "c", "bl", "br"],
}: {
  value: string | null;
  onChange: (p: (typeof POSES)[number]) => void;
  cols?: number;
  ids?: string[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6 }}>
      {POSES.filter((p) => ids.includes(p.id)).map((p) => {
        const sel = value === p.id;
        return (
          <Well key={p.id} sel={sel} onClick={() => onChange(p)} title={p.label} style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="26" viewBox="0 0 18 26" fill="none">
              <rect x="1" y="1" width="16" height="24" rx="1" stroke="var(--faint)" />
              <rect x={p.px} y={p.py} width="6" height="6" fill={sel ? "var(--amber)" : "var(--muted)"} />
            </svg>
          </Well>
        );
      })}
    </div>
  );
}

/** แถบเลื่อนแนวนอนพร้อมป้าย/ค่า — ใช้ตรงที่ลูกบิดไม่พอ (ช่วงกว้าง · ต้องเล็ง) */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt,
  disabled,
  title,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1", disabled && "opacity-45")} title={title}>
      <span className="flex items-baseline justify-between">
        <Tag>{label}</Tag>
        <Mono style={{ fontSize: 10.5 }}>{fmt ? fmt(value) : value}</Mono>
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full cursor-pointer disabled:cursor-not-allowed" />
    </label>
  );
}

/** เฟดเดอร์แนวตั้ง (dB) */
export function Fader({ value, onChange, min = -40, max = 6, h = 76, title }: { value: number; onChange: (v: number) => void; min?: number; max?: number; h?: number; title?: string }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={0.5}
      value={Math.min(max, Math.max(min, value))}
      onChange={(e) => onChange(Number(e.target.value))}
      className="cursor-pointer"
      style={{ writingMode: "vertical-lr", direction: "rtl", width: 16, height: h }}
      title={title ?? "ความดัง (dB) — ลากขึ้นดัง ลากลงเบา"}
    />
  );
}

/** ข้อความแจ้งชั่วคราว (toast) มุมล่าง — โผล่ตราบที่ text ไม่ว่าง (ตัวตั้งเวลาอยู่ที่ flash()) */
export function Notice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="panel" style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", padding: "8px 14px", zIndex: 90, display: "flex", gap: 10, alignItems: "center", maxWidth: 640 }}>
      <Led on />
      <span style={{ fontSize: 12.5 }}>{text}</span>
    </div>
  );
}

/** ขนาดไฟล์อ่านง่าย */
export function fmtBytes(b: number) {
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  if (b < 1e6) return `${Math.round(b / 1e3)} KB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
  return `${(b / 1e9).toFixed(2)} GB`;
}

/** mm:ss จากวินาที (ปัดลง) */
export function fmtClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** เวลาที่แล้ว/นาฬิกา สำหรับ mtime */
export function fmtWhen(ts: number) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (same) return `วันนี้ ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `เมื่อวาน ${hm}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}


// ─────────────────────────── v6 · ท้องฟ้า × ป่าไม้ ───────────────────────────

/** ไอคอนเส้น 16px ชุดเดียวกับ mockup v6 — ไม่ใช้อีโมจิ/สัญลักษณ์ตัวอักษร */
const ICONS: Record<string, string> = {
  check: '<path d="M4 8.5l3 3 5-6"/>',
  play: '<path d="M5 3.5v9l7-4.5z"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  upload: '<path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10"/>',
  folder: '<path d="M2 4.5h4l1.5 1.5H14v7H2z"/>',
  film: '<path d="M2.5 3h11v10h-11zM2.5 6h11M2.5 10h11M5.5 3v10M10.5 3v10"/>',
  edit: '<path d="M3 13h3l7-7-3-3-7 7zM9 4l3 3"/>',
  chev: '<path d="M6 3.5l4.5 4.5L6 12.5"/>',
  back: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
  prev: '<path d="M11 3.5v9L5 8zM4 3.5v9"/>',
  next: '<path d="M5 3.5v9L11 8zM12 3.5v9"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  mic: '<rect x="6" y="2" width="4" height="8" rx="2"/><path d="M4 8a4 4 0 0 0 8 0M8 12v2"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2.5 1.5"/>',
  spark: '<path d="M8 2l1.3 3.7L13 7l-3.7 1.3L8 12l-1.3-3.7L3 7l3.7-1.3z"/>',
  sticker: '<path d="M3 3h10v6l-4 4H3z M9 13V9h4"/>',
  music: '<path d="M6 12.5V4l7-1.5v8.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>',
  text: '<path d="M3 4h10M8 4v9M5.5 13h5"/>',
  fx: '<path d="M3 13L13 3M9 3h4v4M3 9v4h4"/>',
  warn: '<path d="M8 2.5l6 11H2z M8 6.5v3M8 11.5v.5"/>',
  leaf: '<path d="M13 3c-6 0-9.5 3-9.5 8.5 0 .6.1 1.1.2 1.5C9.5 13 13 9.5 13 3z"/><path d="M3.7 13c1.8-3.4 4.2-6 7.3-8"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8"/>',
  eye: '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  tl: '<path d="M2 5h12M2 8h8M2 11h5"/>',
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, color = "currentColor", className, style }: { name: IconName; size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }}
    />
  );
}

/** ตัวเลือกแบบช่องเท่ากันสูง 44 มีเครื่องหมายถูก — ใช้แทนชิป/ข้อความขีดเส้นใต้ทุกที่ที่เป็น "ค่า"
 *  value เป็นสตริง = เลือกได้ตัวเดียว · เป็น array = เลือกได้หลายตัว */
export function Seg<T extends string>({
  items,
  value,
  onChange,
  cols,
  col,
  sm,
  disabled,
  className,
  style,
}: {
  items: { v: T; label: ReactNode; note?: ReactNode; title?: string; disabled?: boolean }[];
  value: T | T[] | null;
  onChange: (v: T) => void;
  /** จำนวนคอลัมน์ (ตั้งต้น = จำนวนตัวเลือก) */
  cols?: number;
  /** เรียงแนวตั้ง ชิดซ้าย */
  col?: boolean;
  sm?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const on = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div className={cx("seg", col && "col", sm && "sm", className)} style={{ gridTemplateColumns: col ? undefined : `repeat(${cols ?? items.length}, minmax(0, 1fr))`, ...style }} role={Array.isArray(value) ? "group" : "radiogroup"}>
      {items.map((it) => {
        const sel = on(it.v);
        const dis = disabled || it.disabled;
        return (
          <span
            key={it.v}
            className={sel ? "on" : undefined}
            aria-disabled={dis ? "true" : undefined}
            role={Array.isArray(value) ? "checkbox" : "radio"}
            aria-checked={sel}
            title={it.title}
            onClick={() => !dis && onChange(it.v)}
          >
            {sel && <Icon name="check" size={12} color="var(--amber)" />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            {it.note !== undefined && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{it.note}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** ตัวเลขใช้ปุ่ม − / + (ไม่ใช้ลูกบิดให้หมุน) — กดค้างไม่ต้อง แค่กดทีละขั้น */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  fmt,
  disabled,
  title,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: ReactNode;
  fmt?: (v: number) => string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 1e6) / 1e6;
  return (
    <span className={cx("stp", disabled && "opacity-45", className)} title={title} role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
      <span className="k" onClick={() => !disabled && onChange(clamp(value - step))} aria-label="ลด">
        −
      </span>
      <span className="v num">
        {fmt ? fmt(value) : value}
        {unit !== undefined && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 3 }}>{unit}</span>}
      </span>
      <span className="k" onClick={() => !disabled && onChange(clamp(value + step))} aria-label="เพิ่ม">
        +
      </span>
    </span>
  );
}

/** ตาราง 3×3 กดช่อง — ตำแหน่งบนจอ 9:16 · index 0–8 (แถวบน→ล่าง ซ้าย→ขวา) */
export function Pos9({ value, onChange, disabled, title }: { value: number | null; onChange: (i: number) => void; disabled?: boolean; title?: string }) {
  return (
    <div className={cx("pos", disabled && "opacity-45")} title={title}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={value === i ? "on" : undefined} onClick={() => !disabled && onChange(i)} role="radio" aria-checked={value === i} />
      ))}
    </div>
  );
}

/** แถบความคืบหน้าเส้นบาง 3px — warm = เตือน · dim = ไม่ใช่ของหลัก */
export function Bar({ pct, warm, dim, className, style }: { pct: number; warm?: boolean; dim?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span className={cx("bar", className)} style={style}>
      <i className={cx(warm && "warm", dim && "dim")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

/** ช่องกดเปิด/ปิดพร้อมป้าย — สวิตช์ใหญ่ 56×30 (Tog) วางซ้าย ตามด้วยข้อความ */
export function SwRow({ on, onChange, label, note, disabled, title }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; note?: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <span className="inline-flex items-center gap-3" style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }} onClick={() => !disabled && onChange(!on)} title={title}>
      <Tog on={on} disabled={disabled} />
      <span>{label}</span>
      {note !== undefined && <span className="kv">{note}</span>}
    </span>
  );
}
