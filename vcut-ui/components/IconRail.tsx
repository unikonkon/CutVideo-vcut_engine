"use client";

import {
  Captions,
  ChevronsRight,
  FolderOpen,
  Settings,
  SlidersHorizontal,
  Smile,
  Type,
  WandSparkles,
} from "lucide-react";

const ITEMS = [
  { icon: FolderOpen, label: "คลังคลิป", active: true },
  { icon: Type, label: "ข้อความ (ยังไม่เปิดใช้)" },
  { icon: Smile, label: "สติกเกอร์ (ยังไม่เปิดใช้)" },
  { icon: WandSparkles, label: "เอฟเฟกต์ (ยังไม่เปิดใช้)" },
  { icon: ChevronsRight, label: "ทรานสิชัน (ยังไม่เปิดใช้)" },
  { icon: Captions, label: "ซับ (ยังไม่เปิดใช้)" },
  { icon: SlidersHorizontal, label: "ปรับแต่ง (ยังไม่เปิดใช้)" },
  { icon: Settings, label: "ตั้งค่า (ยังไม่เปิดใช้)" },
];

export default function IconRail() {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
      {ITEMS.map(({ icon: Icon, label, active }) => (
        <button
          key={label}
          title={label}
          disabled={!active}
          className={
            active
              ? "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel-2 text-accent"
              : "flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:text-muted disabled:cursor-default"
          }
        >
          <Icon size={16} />
        </button>
      ))}
    </nav>
  );
}
