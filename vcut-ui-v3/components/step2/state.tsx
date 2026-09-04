"use client";

// สถานะร่วมของขั้น ② — การ์ดสไตล์/สวิตช์ชั้นแต่ง *วางค่าไว้ในร่าง* แล้วปุ่ม "ตัดให้เลย"
// บันทึกลงไฟล์โปรเจกต์ทีเดียวก่อนสั่งงาน (เอนจินอ่านไฟล์ตอนเริ่มงาน)

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useEngine, useLoader } from "@/hooks/engine";
import { api2, type SetupData, type TranscriptData } from "@/lib/api";

export interface Step2State {
  setup: SetupData | null;
  setSetup: (s: SetupData) => void;
  transcript: TranscriptData | null;
  /** ค่าที่วางไว้ยังไม่บันทึก — คีย์ค่าตั้ง → ค่าใหม่ */
  draft: Record<string, unknown>;
  mod: number;
  /** ค่าที่ "จะเป็น" = ค่าที่บันทึกไว้ทับด้วยร่าง */
  eff: (key: string) => unknown;
  stage: (patch: Record<string, unknown>) => void;
  revert: () => void;
  save: () => Promise<boolean>;
  saving: boolean;
}

const Ctx = createContext<Step2State | null>(null);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function Step2Provider({ children }: { children: ReactNode }) {
  const eng = useEngine();
  const key = eng.reloadKey;
  const setup = useLoader(() => api2.setup(), key);
  const transcript = useLoader(() => api2.transcript(), key);

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const values = setup.data?.values;
  const eff = useCallback((k: string) => (k in draft ? draft[k] : values?.[k]), [draft, values]);

  const stage = useCallback(
    (patch: Record<string, unknown>) =>
      setDraft((d) => {
        const next = { ...d };
        for (const [k, v] of Object.entries(patch)) {
          if (values && same(values[k], v)) delete next[k];
          else next[k] = v;
        }
        return next;
      }),
    [values],
  );
  const revert = useCallback(() => setDraft({}), []);

  const save = useCallback(async () => {
    const path = setup.data?.project.path;
    if (!path) {
      eng.flash("ยังไม่มีไฟล์โปรเจกต์ — ใส่วิดีโอที่ขั้น ① ก่อน");
      return false;
    }
    if (Object.keys(draft).length === 0) return true;
    setSaving(true);
    try {
      const res = await api2.saveSetup(path, draft);
      setup.setData(res.setup);
      setDraft({});
      return true;
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึกค่าตั้งไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, setup, eng]);

  const value = useMemo<Step2State>(
    () => ({
      setup: setup.data,
      setSetup: setup.setData,
      transcript: transcript.data,
      draft,
      mod: Object.keys(draft).length,
      eff,
      stage,
      revert,
      save,
      saving,
    }),
    [setup.data, setup.setData, transcript.data, draft, eff, stage, revert, save, saving],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStep2(): Step2State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStep2 ต้องอยู่ใต้ <Step2Provider>");
  return v;
}

export function num(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function bool(v: unknown) {
  return v === true || v === "true";
}

export function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
