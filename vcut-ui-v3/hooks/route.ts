"use client";

// ตำแหน่งใน flow อยู่ใน URL query — รีเฟรชแล้วอยู่หน้าเดิม แผงเดิม
//
//   ?s=2      ขั้น ① ใส่วิดีโอ · ② สไตล์ · ③ ส่งออก
//   &e=sub    แผงแก้รายชั้นของขั้น ③: tl · sub · text · music · sticker · fx
//   &v=s45    แบบที่กำลังดูอยู่ในขั้น ③ (id จาก /api/variants)
//
// v3 ไม่มีลิ้นชักขั้นสูง/คลังคลิป/หน้า AI review อีกแล้ว (memory ui-v3-decisions)

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type Step = 1 | 2 | 3;
export type Edit3 = "tl" | "sub" | "text" | "music" | "sticker" | "fx";

export interface Route {
  step: Step;
  edit: Edit3 | null;
  variant: string;
  go: (step: Step) => void;
  openEdit: (e: Edit3 | null) => void;
  setVariant: (id: string) => void;
}

const STEPS = new Set([1, 2, 3]);
const EDITS = new Set<string>(["tl", "sub", "text", "music", "sticker", "fx"]);

export function useRoute(): Route {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const s = Number(sp.get("s") || 1);
  const step = (STEPS.has(s) ? s : 1) as Step;
  const e = sp.get("e") || "";
  const edit = (EDITS.has(e) ? e : null) as Edit3 | null;
  const variant = sp.get("v") || "";

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
      edit,
      variant,
      go: (n) => set({ s: String(n), e: null }),
      openEdit: (ed) => set({ s: "3", e: ed }),
      setVariant: (id) => set({ v: id }),
    }),
    [step, edit, variant, set],
  );
}
