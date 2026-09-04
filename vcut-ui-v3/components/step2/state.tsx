"use client";

// สถานะร่วมของขั้น ② — การ์ดสไตล์/สวิตช์ชั้นแต่ง *วางค่าไว้ในร่าง* แล้วปุ่ม "ตัดให้เลย"
// บันทึกลงไฟล์โปรเจกต์ทีเดียวก่อนสั่งงาน (เอนจินอ่านไฟล์ตอนเริ่มงาน)
//
// นอกจากค่าตั้งของเอนจิน ยังถือ `pick` = แบบที่จะเปิดให้ก่อนในขั้น ③ (30/45/60 วิ/ทั้งคลิป)
// ซึ่งเป็นเรื่องของหน้าเว็บล้วน ๆ — เอนจินตัดครบทุกแบบเสมอ

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
  /** แบบที่จะเปิดให้ก่อนในขั้น ③ (id จาก variants.ids) — ไม่ใช่คีย์เอนจิน */
  pick: string;
  setPick: (id: string) => void;
  /** งานที่ปุ่ม "ตัดให้เลย" จะสั่ง: recut (มีบทพูด+เคยตัดแล้ว) · quick_ai · quick */
  jobKind: string;
  /** บันทึกร่างแล้วสั่งงาน jobKind — คืน true เมื่อสั่งสำเร็จ */
  run: () => Promise<boolean>;
  busy: boolean;
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
  const [busy, setBusy] = useState(false);
  const [pickRaw, setPick] = useState("");

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

  // recut = ข้ามถอดเสียง — ได้ต่อเมื่อบทพูดมีแล้วและโปรเจกต์นี้เคยตัดสไตล์ใดสไตล์หนึ่งแล้ว
  const aiOn = bool(eff("variants.ai"));
  const canRecut = Boolean(transcript.data?.exists) && (eng.proj?.styles_cut.length ?? 0) > 0;
  const jobKind = canRecut ? "recut" : aiOn ? "quick_ai" : "quick";

  const run = useCallback(async () => {
    if (eng.job?.running) return false;
    setBusy(true);
    try {
      const saved = await save();
      if (!saved) return false;
      return await eng.runJob(jobKind);
    } finally {
      setBusy(false);
    }
  }, [eng, save, jobKind]);

  const pick = pickRaw || eng.variantsData?.default || "s45";

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
      pick,
      setPick,
      jobKind,
      run,
      busy,
    }),
    [setup.data, setup.setData, transcript.data, draft, eff, stage, revert, save, saving, pick, jobKind, run, busy],
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
