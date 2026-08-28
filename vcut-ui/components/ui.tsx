"use client";

// ชิ้นส่วนฟอร์มเล็ก ๆ ที่ทุก panel ใช้ร่วมกัน — โทนเดียวกับ OpenCut

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ChevronsLeftRight, Loader2, RotateCcw, Save } from "lucide-react";
import { panelMax, readPref, writePref } from "@/lib/pref";

/** แผงลากขยายได้ — คีย์ที่ใช้จำความกว้าง + ช่วงที่ยอมให้กาง
 *
 *  `max` เป็นเพดานแข็ง ส่วนกว้างสุดจริงยังถูกบีบด้วยขนาดหน้าต่าง (ดู panelMax)
 */
export interface PanelResize {
  key: string;
  min: number;
  max: number;
  def: number;
  /** ความกว้างจริงหลังลาก/กดขยาย — ผู้ใช้เอาไปจัดคอลัมน์ในฟอร์มเอง */
  onWidth?: (w: number) => void;
}

export function Panel({
  title,
  children,
  width = "w-[22rem]",
  footer,
  resize,
}: {
  title: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  resize?: PanelResize;
}) {
  const ref = useRef<HTMLElement>(null);

  // ความกว้างไม่ต้องเป็น state ของ React เลย — เขียนลง style ของ element ตรง ๆ
  // ลากทีนึงจึงไม่ต้อง re-render ทั้งแผงทุกพิกเซลที่เมาส์ขยับ  ส่วนคนที่อยากรู้
  // ความกว้าง (เพื่อจัดคอลัมน์) ได้ทาง onWidth ซึ่งยิงตอนหยุดเท่านั้น
  const apply = useCallback(
    (w: number, tell = true) => {
      if (!resize || !ref.current) return;
      const v = Math.min(panelMax(resize.max), Math.max(resize.min, Math.round(w)));
      ref.current.style.width = `${v}px`;
      if (tell) resize.onWidth?.(v);
    },
    [resize],
  );

  const key = resize?.key;
  const def = resize?.def;
  useEffect(() => {
    if (!key || def == null) return;
    const w = Number(readPref(key, "", () => true));
    apply(Number.isFinite(w) && w > 0 ? w : def);
  }, [key, def, apply]);

  const commit = (w: number) => {
    apply(w);
    if (resize) writePref(resize.key, String(w));
  };

  const startResize = (e: React.PointerEvent) => {
    if (!resize) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = ref.current?.getBoundingClientRect().width ?? resize.def;
    const at = (ev: PointerEvent) => w0 + ev.clientX - x0;
    const move = (ev: PointerEvent) => apply(at(ev), false);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const el = ref.current;
      apply(at(ev));
      commit(el ? Math.round(el.getBoundingClientRect().width) : resize.def);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // กว้างสุดอยู่แล้วไหม — ถามที่ตัว element ตอนกด ไม่ใช่เก็บเป็น state คู่ขนาน
  // ที่จะเพี้ยนจากความกว้างจริงทันทีที่มีคนลากขอบ
  const toggleWide = () => {
    if (!resize) return;
    const wide = panelMax(resize.max);
    const now = ref.current?.getBoundingClientRect().width ?? resize.def;
    commit(now >= wide - 4 ? resize.def : wide);
  };

  return (
    <aside
      ref={ref}
      className={`relative flex ${resize ? "" : width} shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel`}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] font-medium text-muted">
        {title}
        {resize && (
          <>
            <div className="flex-1" />
            <button
              onClick={toggleWide}
              title="ขยายแผงให้กว้างสุด / กลับความกว้างปกติ — ลากขอบขวาปรับเองก็ได้"
              className="rounded-md p-1 text-faint hover:bg-panel-2 hover:text-ink"
            >
              <ChevronsLeftRight size={13} />
            </button>
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {children}
      </div>
      {footer}
      {resize && (
        <div
          onPointerDown={startResize}
          onDoubleClick={() => commit(resize.def)}
          title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = กลับค่าเริ่มต้น"
          className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
        />
      )}
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
// ช่องที่ถูกของอื่นคุมค่าอยู่ — ปิดแล้วต้อง *เห็นว่าปิด* ไม่ใช่แค่กดไม่ติด
const offCls = "disabled:cursor-not-allowed disabled:opacity-45";

export function TInput({
  value,
  onChange,
  placeholder,
  mono,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${offCls} ${mono ? "font-mono" : ""}`}
    />
  );
}

export function NInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className={`${inputCls} ${offCls} font-mono`}
    />
  );
}

export function CInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className={`h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-panel-2 p-0.5 ${offCls}`}
      />
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} ${offCls} font-mono`}
      />
    </div>
  );
}

export function Toggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`flex items-center gap-2 py-1 text-left text-[12px] text-ink ${offCls}`}
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
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${offCls}`}
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

/** แถบเลื่อนความดังแนวตั้ง (fader แบบโต๊ะมิกซ์) — หน่วย dB
 *  writing-mode: vertical-lr + direction: rtl = ลากขึ้น (ค่าเพิ่ม) ลากลง (ค่าลด) */
export function Fader({
  value,
  onChange,
  min = -40,
  max = 6,
  h = 76,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  h?: number;
}) {
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
      title="ความดัง (dB) — ลากขึ้นดัง ลากลงเบา"
    />
  );
}

// ── จุดยึด 3×3 ของข้อความ ──
//
// align (จุดยึดแบบ ass) ต้องตั้งคู่กับ x/y เสมอ ข้อความจึงกอดมุมได้พอดีโดยไม่ต้อง
// รู้ว่ากล่องกว้างเท่าไร (ต่างจากภาพซ้อนที่รู้ขนาด)
export const ANCHORS: { align: number; x: number; y: number; label: string }[] = [
  { align: 7, x: 0.05, y: 0.05, label: "บนซ้าย" },
  { align: 8, x: 0.5, y: 0.05, label: "บนกลาง" },
  { align: 9, x: 0.95, y: 0.05, label: "บนขวา" },
  { align: 4, x: 0.05, y: 0.5, label: "กลางซ้าย" },
  { align: 5, x: 0.5, y: 0.5, label: "กลางจอ" },
  { align: 6, x: 0.95, y: 0.5, label: "กลางขวา" },
  { align: 1, x: 0.05, y: 0.95, label: "ล่างซ้าย" },
  { align: 2, x: 0.5, y: 0.95, label: "ล่างกลาง" },
  { align: 3, x: 0.95, y: 0.95, label: "ล่างขวา" },
];

// ระยะที่ถือว่า "ตั้งใจไปเกาะจุดยึด" — 7% ของด้าน  กว้างกว่านี้แล้วลากไปวางกลาง
// ระหว่างสองจุดไม่ได้ แคบกว่านี้แล้วเล็งจุดยึดด้วยเมาส์ไม่ติดสักที
const SNAP = 0.07;

/** แผ่นลากจุด — ตำแหน่งบนจอของข้อความ/สติกเกอร์/รูปทรง
 *
 *  **ตัวเดียวคุมทั้ง x/y และ align** ซึ่งเดิมเป็นสองคอนโทรล (ช่องตัวเลข X/Y กับ
 *  ตารางจุดยึด 3×3) ที่ขัดกันเองได้ — ตั้ง X/Y เองแล้ว align ยังค้างที่เดิม
 *  ข้อความจึงยึดคนละมุมกับที่เห็นในช่องตัวเลข
 *
 *  ลากอิสระได้ทุกจุด แต่ *ดูดเข้าจุดยึดเมื่อเข้าใกล้* แล้วตั้ง align ให้ด้วย —
 *  ได้ทั้งวางเป๊ะที่มุมและวางตรงไหนก็ได้จากคอนโทรลเดียว  กด Alt ค้าง = ไม่ดูด
 */
export function PosPad({
  x,
  y,
  align,
  onChange,
  h = 74,
}: {
  x: number;
  y: number;
  /** จุดยึดแบบ ass — มีเฉพาะข้อความ  ภาพซ้อนกับรูปทรงรู้ขนาดตัวเองอยู่แล้ว
   *  จึงยึดกลางรูปเสมอและไม่มีช่องนี้ (ดู fx.OVERLAY / fx.SHAPE) */
  align?: number;
  onChange: (p: { x: number; y: number; align?: number }) => void;
  h?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const at = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (!e.altKey) {
      for (const a of ANCHORS) {
        if (Math.abs(px - a.x) < SNAP && Math.abs(py - a.y) < SNAP) {
          // ของที่ไม่มีจุดยึดยังได้ประโยชน์จากการดูด — วางกลางจอ/ชิดมุมให้ตรงเป๊ะ
          // ได้โดยไม่ต้องเล็ง แค่ไม่มี align ให้ตั้ง
          return align === undefined
            ? { x: a.x, y: a.y }
            : { x: a.x, y: a.y, align: a.align };
        }
      }
    }
    // ไม่ได้เกาะจุดยึด — เก็บ align เดิมไว้ ไม่ใช่บังคับเป็นกลางจอ เพราะคนที่
    // ตั้งให้กอดมุมซ้ายแล้วขยับนิดเดียวไม่ได้สั่งให้เปลี่ยนจุดยึด
    const free = { x: Math.round(px * 1000) / 1000, y: Math.round(py * 1000) / 1000 };
    return align === undefined ? free : { ...free, align };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const v = at(ev);
      if (v) onChange(v);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    const v = at(e);
    if (v) onChange(v);
  };

  const spot = align === undefined ? undefined : ANCHORS.find((a) => a.align === align);
  const onSpot = !!spot && Math.abs(spot.x - x) < 0.001 && Math.abs(spot.y - y) < 0.001;
  return (
    <div
      ref={ref}
      onPointerDown={start}
      title={
        "ลากจุดเพื่อจัดตำแหน่งบนจอ · เข้าใกล้จุดแล้วดูดติด · Alt = ไม่ดูด" +
        (onSpot ? `\nตอนนี้ยึด${spot!.label}` : "")
      }
      className="relative cursor-crosshair touch-none rounded-lg border border-line bg-panel"
      style={{
        height: h,
        backgroundImage:
          "linear-gradient(var(--border) 1px,transparent 1px)," +
          "linear-gradient(90deg,var(--border) 1px,transparent 1px)",
        backgroundSize: "33.34% 33.34%",
      }}
    >
      {ANCHORS.map((a) => (
        <span
          key={a.align}
          className={`pointer-events-none absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            onSpot && a.align === align ? "bg-accent" : "bg-line-2"
          }`}
          style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
        />
      ))}
      <span
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_2px_8px_rgba(0,0,0,.6)]"
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      />
    </div>
  );
}

/** แถบเลื่อนพร้อมชื่อและค่าที่อ่านออก — ค่าตัวเลขอยู่ขวาเสมอ
 *  ลากคร่าว ๆ ได้เร็วกว่าพิมพ์ แต่ยังต้องเห็นเลขจริงเพราะมันคือค่าที่ลงไฟล์ */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt,
  title,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 ${disabled ? "opacity-45" : ""}`}
      title={title}
    >
      <span className="flex items-baseline justify-between text-[10.5px] text-muted">
        {label}
        <span className="font-mono text-[10.5px] text-ink">
          {fmt ? fmt(value) : value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer disabled:cursor-not-allowed"
      />
    </label>
  );
}

/** ชิปเลือกอย่างเดียวจากไม่กี่ตัว — เห็นตัวเลือกทั้งหมดพร้อมกันโดยไม่ต้องกางเมนู
 *  ใช้เมื่อมีไม่เกิน ~5 ตัว ที่เหลือยังเป็น Sel เหมือนเดิม */
export function Chips({
  value,
  onChange,
  options,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string; title?: string }[];
  title?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" title={title}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          title={o.title}
          className={`min-w-[58px] grow basis-0 truncate rounded-lg px-1.5 py-1 text-[11px] transition-colors ${
            value === o.v
              ? "bg-accent/20 text-accent shadow-[inset_0_0_0_1px_var(--accent)]"
              : "bg-panel-2 text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
