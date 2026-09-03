"use client";

// โครงหน้าแก้รายชั้นของขั้น ③ — 3 คอลัมน์ (mockup edit3())
//   ซ้าย 270  : แบบที่แก้อยู่ · LAYERS (กดสลับแผง) · โน้ต · ราคา rebuild · กลับ 03
//   กลาง     : จอตัวอย่าง + transport + เลน (ส่งมาเป็น center)
//   ขวา 400  : แผงของชั้นที่เลือก (ส่งมาเป็น children)

import type { ReactNode } from "react";
import { Btn, Led, Panel, Seg7, Stat, Tag, Well, cx } from "@/components/instrument";
import type { Edit3 } from "@/hooks/route";

export interface LayerRow {
  id: Edit3;
  name: string;
  note: ReactNode;
  /** ชั้นเปิดอยู่/มีของ */
  on?: boolean;
}

export function LayerList({ rows, active, onPick }: { rows: LayerRow[]; active: Edit3 | null; onPick: (id: Edit3) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map((l) => {
        const on = l.id === active;
        return (
          <div
            key={l.id}
            onClick={() => onPick(l.id)}
            className={cx("cursor-pointer", on && "sel-ring")}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}
          >
            <Led on={on || l.on} />
            <span style={{ flex: 1, fontSize: 12 }}>{l.name}</span>
            <span className="kv" style={{ fontSize: 10.5, textAlign: "right" }}>
              {l.note}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function EditFrame({
  variantId,
  variantLabel,
  variantMeta,
  layers,
  active,
  onPick,
  leftNote,
  leftExtra,
  rebuild,
  onBack,
  center,
  tag,
  title,
  right,
  children,
}: {
  variantId: string;
  variantLabel: string;
  variantMeta: ReactNode;
  layers: LayerRow[];
  active: Edit3 | null;
  onPick: (id: Edit3) => void;
  leftNote?: ReactNode;
  leftExtra?: ReactNode;
  /** แถวราคาที่ต้องจ่ายถ้าบันทึก — [ป้าย, ค่า] */
  rebuild?: { label: string; value: ReactNode; warn?: boolean }[];
  onBack: () => void;
  center: ReactNode;
  tag: ReactNode;
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "270px minmax(0,1fr) 400px", gap: 10, padding: 10, minHeight: 0 }}>
      <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 12px", overflow: "hidden", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="h">
            <Seg7 size={18}>{variantId}</Seg7>
            <span className="t" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
              {variantLabel}
            </span>
          </div>
          <span className="mono kv" style={{ fontSize: 10.5 }}>
            {variantMeta}
          </span>
        </div>
        <Tag>LAYERS · กดเพื่อสลับแผง</Tag>
        <LayerList rows={layers} active={active} onPick={onPick} />
        <div style={{ height: 1, background: "var(--edge)" }} />
        {leftExtra}
        {leftNote && (
          <span className="kv" style={{ fontSize: 10.5, lineHeight: "15px" }}>
            {leftNote}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {rebuild && rebuild.length > 0 && (
          <Well style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            {rebuild.map((r) => (
              <Stat key={r.label} label={r.label} value={r.value} warn={r.warn} />
            ))}
          </Well>
        )}
        <Btn onClick={onBack}>◀ กลับ 03 · เลือกแบบ</Btn>
      </Panel>
      <Panel style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", minHeight: 0 }}>{center}</Panel>
      <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
        <div className="h">
          <Tag>{tag}</Tag>
          <span className="t" style={{ fontSize: 15 }}>
            {title}
          </span>
          {right !== undefined && (
            <>
              <div style={{ flex: 1 }} />
              {right}
            </>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      </Panel>
    </div>
  );
}
