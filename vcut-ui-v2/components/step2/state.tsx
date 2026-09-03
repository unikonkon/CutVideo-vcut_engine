"use client";

// สถานะร่วมของขั้น ② — โต๊ะทำงาน (ซ้าย) กับแผง OUTPUT (ขวา) แตะ "ร่างค่าตั้ง"
// ก้อนเดียวกัน: การ์ดสไตล์/ความยาว/AI ทางซ้ายแค่ *วางค่าไว้ในร่าง* แล้วปุ่ม
// "ตัดให้เลย" ทางขวาเป็นคนบันทึกลงไฟล์โปรเจกต์ทีเดียวก่อนสั่งงาน (กติกาข้อ 10)
//
// ข้อมูลที่หน้านี้ต้องอ่านหลายที่ (setup · plan · pool · transcript · captions ·
// fx · gc) โหลดที่นี่ครั้งเดียว — แถวชั้นแต่งหนัง สถิติ และป้าย STT อ่านจาก
// ก้อนเดียวกัน จะได้ไม่ยิงเอนจินซ้ำจากหลายคอมโพเนนต์

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useEngine, useLoader } from "@/hooks/engine";
import {
  api2,
  api3,
  type CaptionsData,
  type FxData,
  type GcPreview,
  type PlanData,
  type PoolData,
  type SetupData,
  type TranscriptData,
} from "@/lib/api";

export interface Step2State {
  setup: SetupData | null;
  setSetup: (s: SetupData) => void;
  plan: PlanData | null;
  pool: PoolData | null;
  setPool: (p: PoolData) => void;
  transcript: TranscriptData | null;
  captions: CaptionsData | null;
  setCaptions: (c: CaptionsData) => void;
  fx: FxData | null;
  gc: GcPreview | null;
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
  // แผนขึ้นกับค่าตั้ง — บันทึกแล้วต้องขอใหม่แม้เอนจินยังไม่ได้รันอะไร
  const [planKey, setPlanKey] = useState(0);

  const setup = useLoader(() => api2.setup(), key);
  const plan = useLoader(() => api3.plan(), `${key}:${planKey}`);
  const pool = useLoader(() => api3.pool(), key);
  const transcript = useLoader(() => api2.transcript(), key);
  const captions = useLoader(() => api2.captions(), key);
  const fx = useLoader(() => api2.fx(), key);
  const gc = useLoader(() => api3.gc(), key);

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const values = setup.data?.values;
  const eff = useCallback((k: string) => (k in draft ? draft[k] : values?.[k]), [draft, values]);

  // ค่าที่วางแล้วเท่ากับที่บันทึกไว้อยู่แล้ว ไม่นับเป็น MOD — เลือกการ์ดเดิมซ้ำ
  // ต้องไม่ขึ้น UNSAVED
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
      eng.flash("ยังไม่มีไฟล์โปรเจกต์ให้บันทึก — สร้างที่ขั้น ① ก่อน");
      return false;
    }
    if (Object.keys(draft).length === 0) return true;
    setSaving(true);
    try {
      const res = await api2.saveSetup(path, draft);
      setup.setData(res.setup);
      setDraft({});
      setPlanKey((n) => n + 1);
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
      plan: plan.data,
      pool: pool.data,
      setPool: pool.setData,
      transcript: transcript.data,
      captions: captions.data,
      setCaptions: captions.setData,
      fx: fx.data,
      gc: gc.data,
      draft,
      mod: Object.keys(draft).length,
      eff,
      stage,
      revert,
      save,
      saving,
    }),
    [setup.data, setup.setData, plan.data, pool.data, pool.setData, transcript.data, captions.data, captions.setData, fx.data, gc.data, draft, eff, stage, revert, save, saving],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStep2(): Step2State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStep2 ต้องอยู่ใต้ <Step2Provider>");
  return v;
}

/** ตัวเลขจากค่าตั้งที่อาจเป็น unknown */
export function num(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** ความยาวเป้า (นาที) → ป้ายอ่านง่าย · 0 = ทั้งคลิป */
export function targetLabel(minutes: number) {
  if (!(minutes > 0)) return "ALL";
  const s = Math.round(minutes * 60);
  return s < 100 ? `${s} วิ` : `${(minutes).toFixed(1)} นาที`;
}
