"use client";

import {
  Bot,
  Captions,
  FolderOpen,
  Music,
  Settings,
  Smile,
  Type,
  WandSparkles,
} from "lucide-react";

export type Tab =
  | "assets"
  | "text"
  | "music"
  | "stickers"
  | "fx"
  | "cc"
  | "review"
  | "setup";

const ITEMS: { id: Tab; icon: typeof FolderOpen; label: string }[] = [
  { id: "assets", icon: FolderOpen, label: "คลังคลิป" },
  { id: "text", icon: Type, label: "ข้อความ / ซับ (ขั้น 4)" },
  { id: "music", icon: Music, label: "เพลงประกอบ" },
  { id: "stickers", icon: Smile, label: "สติกเกอร์ / ภาพซ้อน" },
  { id: "fx", icon: WandSparkles, label: "เอฟเฟกต์ (ขั้น 5)" },
  { id: "cc", icon: Captions, label: "บทพูดที่ถอดไว้" },
  { id: "review", icon: Bot, label: "AI ดูหนัง" },
  { id: "setup", icon: Settings, label: "ตั้งค่าเอนจิน" },
];

export default function IconRail({
  tab,
  onTab,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
      {ITEMS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => onTab(id)}
          className={
            tab === id
              ? "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel-2 text-accent"
              : "flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-panel-2 hover:text-muted"
          }
        >
          <Icon size={16} />
        </button>
      ))}
    </nav>
  );
}
