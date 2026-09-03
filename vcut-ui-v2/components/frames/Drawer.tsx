"use client";

// ลิ้นชักของขั้น ② — ซ้อนทับโต๊ะทำงานที่หรี่ไว้ (คลังชิ้น · บทพูด · ขั้นสูง 5 แท็บ)
//
// โครงเดียวกับ mockup drawer2(): หัว (TAG · ชื่อ · คำอธิบาย · ป้าย · ✕) →
// แถบแท็บ (เฉพาะขั้นสูง) → เนื้อ → ท้าย (ปุ่มบันทึก/สั่งงาน)

import { useEffect, type ReactNode } from "react";
import { Btn, Keys, Kv, Panel, Tag } from "@/components/instrument";
import { ADV_TABS, type AdvTab } from "@/hooks/route";

export default function Drawer({
  tag,
  title,
  sub,
  badge,
  tabs,
  onTab,
  onClose,
  footer,
  width = 820,
  children,
  bodyStyle,
}: {
  tag: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  /** แท็บที่เปิดอยู่ — ใส่แล้วแถบแท็บของ "ขั้นสูง" โผล่ */
  tabs?: AdvTab;
  onTab?: (t: AdvTab) => void;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
  bodyStyle?: React.CSSProperties;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 30 }} />
      <Panel
        style={{
          position: "absolute",
          right: 10,
          top: 72,
          bottom: 10,
          width: `min(${width}px, calc(100% - 20px))`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 31,
          boxShadow: "-24px 0 60px rgba(0,0,0,.6), 0 2px 0 var(--edge)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--edge)", minWidth: 0 }}>
          <Tag>{tag}</Tag>
          <span style={{ fontSize: 16, fontWeight: 500, whiteSpace: "nowrap" }}>{title}</span>
          {sub !== undefined && <Kv className="truncate">{sub}</Kv>}
          <div style={{ flex: 1 }} />
          {badge}
          <Btn sm onClick={onClose} title="ปิด (Esc)">
            ✕
          </Btn>
        </div>
        {tabs && (
          <div style={{ display: "flex", gap: 4, padding: "10px 16px", borderBottom: "1px solid var(--edge)" }}>
            <Keys sm={false} items={ADV_TABS.map((t) => ({ v: t.id, label: t.label }))} value={tabs} onChange={(t) => onTab?.(t)} />
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px", overflowY: "auto", minHeight: 0, ...bodyStyle }}>{children}</div>
        {footer && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderTop: "1px solid var(--edge)", flexWrap: "wrap" }}>{footer}</div>}
      </Panel>
    </>
  );
}
