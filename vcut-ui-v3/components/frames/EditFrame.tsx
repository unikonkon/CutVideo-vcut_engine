"use client";

// ลิ้นชักแก้ชั้นแต่งของขั้น ③ (mockup F3Edit) — กระจกเข้มลอยขวา กว้าง 680 สูงเต็ม
//   หัว     : "แก้ชั้นแต่ง · A · 45 วิ" + ปุ่มปิด
//   แท็บ    : ซับ · HOOK / การ์ดปิด · เพลง · สติกเกอร์ · เอฟเฟกต์ (สลับ ?e=)
//   เนื้อใน : ซ้าย = แผงควบคุมของชั้น (children) · ขวา 200 = จอตัวอย่าง + ตัวควบคุมสไตล์ (right)
//   ท้าย    : ราคา rebuild · ยกเลิก · บันทึก · เรนเดอร์ใหม่
// หน้า ③ เดิมอยู่ข้างหลัง (จาง+เบลอ) — ตัวจัดวางอยู่ที่ components/step3/index.tsx

import type { ReactNode } from "react";
import { Btn, Icon, cx } from "@/components/instrument";
import type { Edit3 } from "@/hooks/route";

export interface LayerRow {
  id: Edit3;
  name: string;
  note: ReactNode;
  /** ชั้นเปิดอยู่/มีของ */
  on?: boolean;
}

export const EDIT_TABS: { id: Edit3; label: string }[] = [
  { id: "sub", label: "ซับ" },
  { id: "text", label: "HOOK / การ์ดปิด" },
  { id: "music", label: "เพลง" },
  { id: "sticker", label: "สติกเกอร์" },
  { id: "fx", label: "เอฟเฟกต์" },
];

export default function EditFrame({
  active,
  title,
  onPick,
  onClose,
  preview,
  right,
  footNote,
  onCancel,
  onSave,
  saveLabel = "บันทึก · เรนเดอร์ใหม่",
  saveDisabled,
  saveTitle,
  children,
}: {
  active: Edit3;
  /** ข้อความหัวลิ้นชัก เช่น "แก้ชั้นแต่ง · A · 45 วิ" */
  title: ReactNode;
  onPick: (id: Edit3) => void;
  onClose: () => void;
  /** จอตัวอย่าง 9:16 (คอลัมน์ขวา บนสุด) */
  preview?: ReactNode;
  /** ตัวควบคุมสไตล์ใต้จอตัวอย่าง */
  right?: ReactNode;
  footNote?: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: ReactNode;
  saveDisabled?: boolean;
  saveTitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="panel deep"
      role="dialog"
      aria-label="แก้ชั้นแต่ง"
      style={{ position: "absolute", top: 14, right: 14, bottom: 14, width: 680, maxWidth: "calc(100% - 28px)", display: "flex", flexDirection: "column", background: "rgba(10,24,40,.86)", zIndex: 6, minHeight: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 26px 10px", flexShrink: 0 }}>
        <span className="h2" style={{ fontSize: 20, fontWeight: 300, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <div style={{ flex: 1 }} />
        <Btn ic ghost onClick={onClose} title="ปิดลิ้นชัก (ที่แก้ค้างยังอยู่ จนกว่าจะบันทึกหรือยกเลิก)">
          <Icon name="x" size={16} color="var(--muted)" />
        </Btn>
      </div>
      <div style={{ display: "flex", gap: 18, padding: "0 26px 14px", overflowX: "auto", flexShrink: 0 }}>
        {EDIT_TABS.map((t) => (
          <button key={t.id} type="button" className={cx("tab", t.id === active && "on")} onClick={() => onPick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 200px", gap: 26, padding: "12px 26px 0", minHeight: 0, borderTop: "1px solid var(--edge)" }}>
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 8, overflowY: "auto", paddingBottom: 8 }}>{children}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto", paddingBottom: 8 }}>
          {preview}
          {right}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 26px 20px", flexShrink: 0, flexWrap: "wrap" }}>
        <span className="muted small" style={{ minWidth: 0 }}>
          {footNote}
        </span>
        <div style={{ flex: 1 }} />
        <Btn onClick={onCancel} title="ทิ้งที่แก้ค้างของชั้นนี้แล้วปิดลิ้นชัก">
          ยกเลิก
        </Btn>
        <Btn pri onClick={onSave} disabled={saveDisabled} title={saveTitle}>
          {saveLabel}
        </Btn>
      </div>
    </div>
  );
}
