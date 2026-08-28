"use client";

import { useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Palette,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { FxOverlay, FxShape, FxTextItem, MusicTrack } from "@/lib/api";
import { durMs } from "@/lib/time";
import { Chips, PosPad, SliderRow } from "@/components/ui";

/** จุดที่การ์ดต้องชี้ไป — พิกัดบนหน้าจอ ไม่ใช่พิกัดในไทม์ไลน์
 *
 *  ไทม์ไลน์เป็นคนคิดให้ เพราะเรขาคณิต (ซูม · เลื่อนแนวนอน · ความสูงเลน) อยู่ที่
 *  นั่นทั้งหมด  ส่วน `top` คือขอบบนของกล่องไทม์ไลน์ — การ์ดลอยอยู่ *เหนือ* มัน
 */
export interface CardAnchor {
  /** กึ่งกลางบล็อกในแนวนอน (px จากขอบซ้ายจอ) */
  x: number;
  /** ขอบบนของกล่องไทม์ไลน์ (px จากขอบบนจอ) */
  top: number;
  /** บล็อกเลื่อนพ้นขอบไปแล้วไหม — พ้นแล้วซ่อนการ์ด ไม่ใช่ปล่อยให้ชี้ไปที่ว่าง */
  off: boolean;
}

const W = 396;
const GAP = 10;
/** ระยะขั้นต่ำจากขอบจอ — หางต้องยังชี้เข้าบล็อกได้ จึงเลื่อนการ์ดไม่ใช่ตัดทิ้ง */
const EDGE = 12;

const KIND_LABEL: Record<string, string> = {
  text: "ข้อความบนหนัง",
  sticker: "ภาพซ้อน",
  shape: "รูปทรง",
  music: "เพลง / เสียง",
};
const KIND_COLOR: Record<string, string> = {
  text: "#10b981",
  sticker: "#ec4899",
  shape: "#f97316",
  music: "#8b5cf6",
};

export type CardItem =
  | { kind: "text"; item: FxTextItem }
  | { kind: "sticker"; item: FxOverlay }
  | { kind: "shape"; item: FxShape }
  | { kind: "music"; item: MusicTrack };

/** การ์ดลอยเหนือไทม์ไลน์ — แก้ของที่เลือกอยู่ตรงที่ที่มองมันอยู่
 *
 *  **ทำไมลอย ไม่ใช่ในแผงข้าง** — ตอนไล่ดูหนัง สายตาอยู่ที่ไทม์ไลน์กับจอตัวอย่าง
 *  การเด้งไปแผงซ้ายเพื่อขยับ 0.2 วิ แล้วเด้งกลับมาดูผล คือการกวาดตาข้ามจอทุกครั้ง
 *  ที่แก้ทีละนิด ซึ่งเป็นสิ่งที่ทำบ่อยที่สุดในงานตัดต่อ
 *
 *  **การ์ดไม่ใช่ฟอร์มเต็ม** — มีเฉพาะสิ่งที่แก้ระหว่างไล่ดู (ข้อความ · ตำแหน่ง ·
 *  ความยาว · ขนาด · แอนิเมชัน)  ของที่ตั้งครั้งเดียวแล้วจบ (ฟอนต์ สี เงา ระยะ
 *  ตัวอักษร ชุดสไตล์ นับเลข) อยู่ในแผงเหมือนเดิม และปุ่ม ⚙ พาไปที่นั่น — ถ้ายัด
 *  ครบ 20 ช่อง การ์ดจะสูงจนบังไทม์ไลน์ที่มันมีไว้ให้แก้ตรงจุดพอดี
 *
 *  **ลอยเหนือไทม์ไลน์ ไม่ใช่ใต้บล็อกอย่างในภาพต้นแบบ** — กล่องไทม์ไลน์จริงสูง
 *  21rem และอยู่ชิดขอบล่างจอ การ์ดใต้บล็อกจึงตกนอกจอเสมอ  หางชี้ลงไปที่บล็อก
 *  ให้ผลเดียวกันคือ "การ์ดใบนี้เป็นของชิ้นนั้น" โดยยังเห็นครบทั้งใบ
 */
export default function BlockCard({
  sel,
  anchor,
  name,
  tl,
  animOpts,
  presetOf,
  onPatch,
  onRemove,
  onClose,
  onStep,
  onOpenPanel,
  onMakePreset,
}: {
  sel: CardItem;
  anchor: CardAnchor;
  /** ชื่อคลิปที่ชิ้นนี้เกาะอยู่ — เพลงผูกกับเวลาในหนังตรง ๆ จึงเป็น "" */
  name: string;
  /** วินาทีในหนัง — ตัวเลขเดียวกับที่เห็นบนไม้บรรทัด */
  tl: number;
  animOpts: { v: string; label: string; title?: string }[];
  /** ชื่อชุดสไตล์ที่ข้อความชิ้นนี้ผูกอยู่ — มีชุด = ขนาดมาจากชุด แก้ที่นี่ไม่ได้ */
  presetOf?: string;
  onPatch: (p: Record<string, unknown>) => void;
  onRemove: () => void;
  onClose: () => void;
  /** ไปชิ้นก่อนหน้า/ถัดไปในเลนเดียวกัน — null = ไม่มีให้ไป */
  onStep: (d: -1 | 1) => void;
  onOpenPanel: () => void;
  onMakePreset?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Esc ปิดการ์ด — ผูกที่นี่ ไม่ใช่ที่คีย์ลัดกลาง เพราะการ์ดเป็นของชั่วคราวที่รู้
  // ตัวเองว่าเปิดอยู่ ส่วนคีย์ลัดกลางไม่ควรต้องรู้จักทุกอย่างที่เปิดค้างได้
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (anchor.off) return null;

  const left = Math.min(
    Math.max(EDGE, anchor.x - W / 2),
    (typeof window === "undefined" ? 1600 : window.innerWidth) - W - EDGE,
  );
  // หางชี้ที่บล็อกจริงเสมอ แม้การ์ดจะถูกดันหนีขอบจอไปแล้ว
  const tail = Math.min(Math.max(16, anchor.x - left), W - 16);

  const { kind, item } = sel;
  const rows: React.ReactNode[] = [];

  if (kind === "text") {
    rows.push(
      <input
        key="txt"
        autoFocus
        type="text"
        value={item.text}
        onChange={(e) => onPatch({ text: e.target.value })}
        placeholder="พิมพ์ข้อความ…"
        className="w-full rounded-lg border border-line-2 bg-panel px-3 py-2 text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint focus:border-accent"
      />,
    );
  } else {
    rows.push(
      <div
        key="file"
        className="truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[11.5px] text-muted"
        title={"file" in item ? item.file : sel.kind}
      >
        {kind === "shape" ? item.kind : "file" in item ? item.file : ""}
      </div>,
    );
  }

  const durMax = Math.max(10, Math.ceil((item.dur || 2) * 1.5));
  const grid: React.ReactNode[] = [
    <SliderRow
      key="dur"
      label="นาน"
      value={item.dur}
      min={kind === "music" ? 0 : 0.2}
      max={kind === "music" ? Math.max(60, item.dur) : durMax}
      step={kind === "music" ? 1 : 0.05}
      fmt={(v) =>
        kind === "music" && v === 0 ? "จนจบเรื่อง" : `${v.toFixed(2)}s`
      }
      onChange={(v) => onPatch({ dur: Math.round(v * 100) / 100 })}
      title={kind === "music" ? "0 = เล่นยาวจนจบเรื่อง" : undefined}
    />,
  ];

  if (kind === "text") {
    grid.push(
      <SliderRow
        key="size"
        label={presetOf ? `ขนาด · ตามชุด "${presetOf}"` : "ขนาด"}
        value={item.size}
        min={12}
        max={220}
        step={2}
        disabled={!!presetOf}
        onChange={(v) => onPatch({ size: v })}
        title={
          presetOf
            ? `ขนาดมาจากชุดสไตล์ "${presetOf}" — แก้ที่ชุดในแผงข้อความเพื่อเปลี่ยนทุกชิ้นที่ผูกอยู่`
            : undefined
        }
      />,
    );
  } else if (kind === "sticker") {
    grid.push(
      <SliderRow
        key="w"
        label="กว้าง (เท่าของจอ)"
        value={item.width}
        min={0.02}
        max={2}
        step={0.01}
        fmt={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ width: v })}
      />,
      <SliderRow
        key="op"
        label="ความทึบ"
        value={item.opacity}
        min={0}
        max={1}
        step={0.05}
        fmt={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => onPatch({ opacity: v })}
      />,
    );
  } else if (kind === "shape") {
    grid.push(
      <SliderRow
        key="size"
        label="ขนาด"
        value={item.size}
        min={20}
        max={800}
        step={4}
        onChange={(v) => onPatch({ size: v })}
      />,
      <SliderRow
        key="ang"
        label="หมุน (องศา)"
        value={item.angle}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => onPatch({ angle: v })}
      />,
    );
  } else {
    grid.push(
      <SliderRow
        key="g"
        label="ความดัง"
        value={item.gain_db}
        min={-40}
        max={12}
        step={0.5}
        fmt={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
        onChange={(v) => onPatch({ gain_db: v })}
      />,
    );
  }

  const pad = kind !== "music" && "x" in item;

  return (
    // กล่องนอกไม่มี overflow — หางต้องยื่นออกนอกขอบได้  ส่วนการเลื่อนอยู่ที่กล่อง
    // ใน (เจอตอนทดสอบ: ใส่ overflow-y-auto ที่กล่องนอกแล้วหางถูกตัดหายไปเงียบ ๆ
    // การ์ดจึงลอยอยู่เฉย ๆ โดยไม่มีอะไรบอกว่ามันเป็นของบล็อกไหน)
    <div
      ref={ref}
      className="fixed z-50 rounded-2xl border border-line-2 bg-panel shadow-[0_26px_64px_rgba(0,0,0,.75)]"
      style={{ left, width: W, bottom: `calc(100vh - ${anchor.top - GAP}px)` }}
    >
      <div
        className="flex flex-col gap-3 overflow-y-auto overscroll-contain p-4"
        style={{
          // จอเตี้ยกว่าการ์ด — เลื่อนในการ์ดดีกว่าให้มันล้นออกนอกจอด้านบนแล้วหัวการ์ด
          // (ซึ่งบอกว่ากำลังแก้ชิ้นไหนอยู่) หายไปเงียบ ๆ
          maxHeight: Math.max(180, anchor.top - GAP - 8),
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ background: KIND_COLOR[kind] }}
          />
          <span className="shrink-0 text-[12.5px] font-semibold text-ink">
            {KIND_LABEL[kind]}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint">
            {name ? `${name} · ` : ""}
            {durMs(tl)}
          </span>
          <button
            onClick={onClose}
            title="ปิดการ์ด (Esc)"
            className="shrink-0 rounded-md p-0.5 text-faint hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {rows}

        <div className="flex gap-3">
          {pad && (
            <div className="w-[132px] shrink-0">
              <div className="mb-1 text-[10.5px] text-muted">
                ตำแหน่ง (ลากจุด)
              </div>
              <PosPad
                x={item.x}
                y={item.y}
                align={kind === "text" ? item.align : undefined}
                onChange={(v) => onPatch(v as Record<string, unknown>)}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">{grid}</div>
        </div>

        {kind !== "music" && (
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted">แอนิเมชัน</span>
            <Chips
              value={item.anim}
              onChange={(v) => onPatch({ anim: v })}
              options={animOpts}
            />
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-line pt-3">
          {onMakePreset && (
            <button
              onClick={onMakePreset}
              title="เก็บหน้าตาของชิ้นนี้เป็นชุดสไตล์ แล้วชิ้นอื่นเลือกใช้ได้"
              className="flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn hover:bg-warn/20"
            >
              <Palette size={12} /> สร้างชุดจากชิ้นนี้
            </button>
          )}
          <button
            onClick={onOpenPanel}
            title="เปิดฟอร์มเต็มในแผงข้าง — ฟอนต์ สี เงา ชุดสไตล์ นับเลข ฯลฯ"
            className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
          >
            <Settings2 size={12} /> ตั้งค่าทั้งหมด
          </button>
          <div className="flex-1" />
          <button
            onClick={onRemove}
            title="ลบชิ้นนี้ (Delete)"
            className="rounded-lg p-1.5 text-danger hover:bg-danger/10"
          >
            <Trash2 size={13} />
          </button>
          <div className="flex overflow-hidden rounded-lg border border-line">
            <button
              onClick={() => onStep(-1)}
              title="ไปชิ้นก่อนหน้าในเลนนี้"
              className="px-1.5 py-1 text-muted hover:bg-panel-2 hover:text-ink"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => onStep(1)}
              title="ไปชิ้นถัดไปในเลนนี้"
              className="border-l border-line px-1.5 py-1 text-muted hover:bg-panel-2 hover:text-ink"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      {/* หางชี้ลงไปที่บล็อกบนไทม์ไลน์ */}
      <span
        className="absolute -bottom-[7px] h-3 w-3 rotate-45 border-b border-r border-line-2 bg-panel"
        style={{ left: tail - 6 }}
      />
    </div>
  );
}
