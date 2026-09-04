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
  ghost?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={cx("btn", on && "on", off && "off", sm && "sm", ghost && "ghost", danger && "danger", className)}
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
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <span className="led" style={{ background: "var(--bg)", boxShadow: "none" }} />
      )}
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
        <img src={src} alt="" loading="lazy" />
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
