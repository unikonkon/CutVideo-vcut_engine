"use client";

import {
  Bot,
  Captions,
  FolderOpen,
  Layers,
  Music,
  Settings,
  Smile,
  Type,
} from "lucide-react";

export type Tab =
  | "assets"
  | "text"
  | "music"
  | "stickers"
  | "cc"
  | "review"
  | "pipeline"
  | "setup";

// label = ตัวสั้นที่โชว์บนแถบ, title = คำอธิบายเต็มตอนชี้ค้าง
const ITEMS: {
  id: Tab;
  icon: typeof FolderOpen;
  label: string;
  title: string;
}[] = [
  { id: "assets", icon: FolderOpen, label: "คลิป", title: "คลังคลิป" },
  { id: "text", icon: Type, label: "ข้อความ", title: "ข้อความบนหนัง + สไตล์ซับ" },
  { id: "music", icon: Music, label: "เพลง", title: "เพลงประกอบ" },
  { id: "stickers", icon: Smile, label: "สติกเกอร์", title: "สติกเกอร์ / ภาพซ้อน / แผนที่เส้นทาง" },
  { id: "cc", icon: Captions, label: "บทพูด", title: "บทพูดที่ถอดไว้ — เลือกบรรทัดใส่ลงหนัง" },
  { id: "review", icon: Bot, label: "AI", title: "AI ดูหนัง" },
  // ── สองแท็บสุดท้าย = "เครื่องมือของทั้งเรื่อง" ไม่ใช่ "ของที่อยู่ในหนัง" ──
  //
  // หกแท็บแรกตอบคำถาม "หนังมีอะไรอยู่บ้าง" (คลิป ข้อความ เพลง …) สองตัวนี้ตอบ
  // "จะผลิตมันยังไง" — เส้นแบ่งจึงอยู่ตรงนี้ ไม่ใช่เรียงปนกันตามลำดับที่เพิ่ม
  {
    id: "pipeline",
    icon: Layers,
    label: "ไปป์ไลน์",
    title: "ทำถึงขั้นไหนแล้ว · ของที่มีเก่าหรือยัง · สั่งรันทีละขั้น",
  },
  { id: "setup", icon: Settings, label: "ตั้งค่า", title: "ตั้งค่าเอนจินทั้ง 135 ค่า" },
];

export default function TabNav({
  tab,
  onTab,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl bg-panel/70 p-0.5">
      {ITEMS.map(({ id, icon: Icon, label, title }) => (
        <button
          key={id}
          title={title}
          onClick={() => onTab(id)}
          className={
            "flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] transition-colors " +
            (tab === id
              ? "bg-panel-3 font-medium text-ink shadow-[inset_0_0_0_1px_var(--border-2)]"
              : "text-faint hover:bg-panel-2 hover:text-muted")
          }
        >
          <Icon size={15} className={tab === id ? "text-accent" : undefined} />
          <span className="hidden xl:inline">{label}</span>
        </button>
      ))}
    </nav>
  );
}
