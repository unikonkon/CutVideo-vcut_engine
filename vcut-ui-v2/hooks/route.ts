"use client";

// ตำแหน่งใน flow อยู่ใน URL query — รีเฟรชแล้วอยู่หน้าเดิม ลิ้นชักเดิม
//
//   ?s=2            ขั้น ① ② ③
//   &d=pool         ลิ้นชักของขั้น ②: pool · trans · adv
//   &t=cfg          แท็บของลิ้นชักขั้นสูง: cfg · pick · ai · pipe · reset
//   &e=sub          แผงแก้รายชั้นของขั้น ③: tl · sub · text · music · sticker · fx · map · review
//   &v=A            แบบที่เลือกอยู่ (variant id) — ตอนนี้มีแบบเดียวเสมอ (ดู hooks/engine)
//   &lib=1          หน้าคลังคลิปของขั้น ①

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type Step = 1 | 2 | 3;
export type Drawer2 = "pool" | "trans" | "adv";
export type AdvTab = "cfg" | "pick" | "ai" | "pipe" | "reset";
export type Edit3 = "tl" | "sub" | "text" | "music" | "sticker" | "fx" | "map" | "review";

export const ADV_TABS: { id: AdvTab; label: string }[] = [
  { id: "cfg", label: "ตั้งค่า" },
  { id: "pick", label: "วิธีเลือกชิ้น · ลำดับ" },
  { id: "ai", label: "AI" },
  { id: "pipe", label: "ไปป์ไลน์ · สถานะ" },
  { id: "reset", label: "รีเซ็ต · ประวัติ · cache" },
];

export interface Route {
  step: Step;
  drawer: Drawer2 | null;
  adv: AdvTab;
  edit: Edit3 | null;
  variant: string;
  lib: boolean;
  go: (step: Step) => void;
  openDrawer: (d: Drawer2, tab?: AdvTab) => void;
  closeDrawer: () => void;
  setAdv: (t: AdvTab) => void;
  openEdit: (e: Edit3 | null) => void;
  setVariant: (id: string) => void;
  setLib: (on: boolean) => void;
}

const STEPS = new Set([1, 2, 3]);
const DRAWERS = new Set<string>(["pool", "trans", "adv"]);
const ADV = new Set<string>(ADV_TABS.map((t) => t.id));
const EDITS = new Set<string>(["tl", "sub", "text", "music", "sticker", "fx", "map", "review"]);

export function useRoute(): Route {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const s = Number(sp.get("s") || 1);
  const step = (STEPS.has(s) ? s : 1) as Step;
  const d = sp.get("d") || "";
  const drawer = (DRAWERS.has(d) ? d : null) as Drawer2 | null;
  const t = sp.get("t") || "cfg";
  const adv = (ADV.has(t) ? t : "cfg") as AdvTab;
  const e = sp.get("e") || "";
  const edit = (EDITS.has(e) ? e : null) as Edit3 | null;
  const variant = sp.get("v") || "A";
  const lib = sp.get("lib") === "1";

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") q.delete(k);
        else q.set(k, v);
      }
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  return useMemo<Route>(
    () => ({
      step,
      drawer,
      adv,
      edit,
      variant,
      lib,
      // เปลี่ยนขั้น = ปิดลิ้นชัก/แผงแก้ของขั้นเดิมด้วย
      go: (n) => set({ s: String(n), d: null, e: null, lib: null }),
      openDrawer: (dr, tab) => set({ s: "2", d: dr, t: tab ?? (dr === "adv" ? adv : null) }),
      closeDrawer: () => set({ d: null }),
      setAdv: (tab) => set({ d: "adv", t: tab }),
      openEdit: (ed) => set({ s: "3", e: ed }),
      setVariant: (id) => set({ v: id }),
      setLib: (on) => set({ s: "1", lib: on ? "1" : null }),
    }),
    [step, drawer, adv, edit, variant, lib, set],
  );
}
