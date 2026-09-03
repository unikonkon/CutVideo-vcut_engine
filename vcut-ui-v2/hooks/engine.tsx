"use client";

// สถานะกลางที่คุยกับเอนจิน — ทุกขั้น ทุกลิ้นชัก อ่านจากที่นี่ที่เดียว
//
//   core   = /api/state + /api/clips + /api/trash (โหลดครั้งเดียว · refresh() ตามสั่ง)
//   job    = /api/job โพลทุกวินาทีตอนมีงานวิ่ง · จบแล้ว refresh + bump reloadKey
//   variants = "แบบ" ที่ขั้น ③ เลือก — ตอนนี้เอนจินมีแบบเดียวต่อโปรเจกต์
//              (ดู memory ui-v2-build-decisions ข้อ 1) โครง state รองรับหลายแบบ
//              ไว้ก่อน: ทุกที่อ้าง variant.id ไม่ใช่อ้าง /out ตรง ๆ
//
// ข้อมูลที่หนักหรือใช้เฉพาะบางหน้า (fx · captions · transcript · setup · pool ·
// review · beats) ไม่อยู่ในนี้ — ใช้ useLoader() โหลดเองในหน้านั้น แล้วฟัง
// reloadKey เพื่อโหลดใหม่หลังงานจบ

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type ClipInfo,
  type ClipsData,
  type JobState,
  type OutKind,
  type ProjectState,
  type TrashItem,
  type VModeOption,
} from "@/lib/api";

export interface Variant {
  id: string;
  /** ชื่อที่คนอ่าน เช่น "ตัดชิดทั้งคลิป" — ตอนนี้มาจากชื่อสูตร/โปรเจกต์ */
  label: string;
  /** คำโปรย ใต้ชื่อ */
  note: string;
  /** วินาทีรวมของไทม์ไลน์ */
  dur: number;
  shots: number;
  /** ไฟล์ขั้น ③ มีแล้วไหม · เก่ากว่า EDL ไหม */
  ready: boolean;
  stale: boolean;
  /** ไฟล์ที่เล่นได้ตอนนี้ — ขั้นสูงสุดที่มี */
  best: OutKind;
}

export interface Engine {
  proj: ProjectState | null;
  clips: ClipInfo[];
  clipsData: ClipsData | null;
  vmodes: VModeOption[];
  vmodeDefault: string;
  trash: TrashItem[];
  loading: boolean;
  offline: boolean;
  /** เพิ่มทุกครั้งที่งานเอนจินจบ — หน้าที่ถือข้อมูลของตัวเองใช้ตัวนี้เป็น dep */
  reloadKey: number;
  bump: () => void;
  refresh: () => Promise<void>;

  job: JobState | null;
  jobLines: string[];
  /** งานที่ *หน้านี้* เพิ่งสั่ง — ไว้แยกจากงานที่ค้างจากหน้าต่างอื่น */
  lastStep: string;
  runJob: (step: string, force?: boolean) => Promise<boolean>;
  stopJob: () => Promise<void>;
  /** สั่งงานที่ไม่ผ่าน /api/job (music · review · compose) แล้วเริ่มโพลเหมือนกัน */
  track: (step: string, start: () => Promise<unknown>) => Promise<boolean>;

  notice: string;
  flash: (msg: string) => void;

  variants: Variant[];
}

const Ctx = createContext<Engine | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [proj, setProj] = useState<ProjectState | null>(null);
  const [clipsData, setClipsData] = useState<ClipsData | null>(null);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [job, setJob] = useState<JobState | null>(null);
  const [jobLines, setJobLines] = useState<string[]>([]);
  const [lastStep, setLastStep] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [st, cl, tr] = await Promise.all([
        api.state(),
        api.clips(),
        api.trash().catch(() => ({ items: [] as TrashItem[], dir: "" })),
      ]);
      setProj(st);
      setClipsData(cl);
      setTrash(tr.items);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // โหลดรอบแรก — setState เกิดหลัง await ไม่ใช่ใน effect ตรง ๆ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  const pollJob = useCallback(async () => {
    try {
      const got = await api.job(0);
      setJob(got);
      setJobLines(got.lines);
      return got;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // มีงานค้างจากหน้าต่างอื่นไหม
    // eslint-disable-next-line react-hooks/set-state-in-effect
    pollJob();
  }, [pollJob]);

  useEffect(() => {
    if (!job?.running) return;
    const id = setInterval(async () => {
      const got = await pollJob();
      if (got && !got.running) {
        clearInterval(id);
        await refresh();
        setReloadKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [job?.running, pollJob, refresh]);

  const track = useCallback(
    async (step: string, start: () => Promise<unknown>) => {
      try {
        await start();
        setLastStep(step);
        await pollJob();
        return true;
      } catch (e) {
        flash(e instanceof Error ? e.message : "สั่งงานไม่สำเร็จ");
        return false;
      }
    },
    [pollJob, flash],
  );

  const runJob = useCallback(
    (step: string, force = false) => track(step, () => api.runJob(step, force)),
    [track],
  );

  const stopJob = useCallback(async () => {
    try {
      await api.stopJob();
      await pollJob();
    } catch (e) {
      flash(e instanceof Error ? e.message : "หยุดงานไม่สำเร็จ");
    }
  }, [pollJob, flash]);

  const variants = useMemo<Variant[]>(() => {
    if (!proj) return [];
    const dur = Number(proj.summary.duration_total ?? 0);
    const cfg = proj.config?.length ? proj.config[proj.config.length - 1] : "";
    return [
      {
        id: "A",
        label: proj.project || "แบบ A",
        note: cfg ? cfg.replace(/\.toml$/, "") : "ตามค่าที่ตั้งไว้",
        dur,
        shots: Number(proj.summary.segments ?? proj.timeline.length),
        ready: proj.out_exists,
        stale: proj.out_stale,
        best: "out",
      },
    ];
  }, [proj]);

  const value = useMemo<Engine>(
    () => ({
      proj,
      clips: clipsData?.clips ?? [],
      clipsData,
      vmodes: clipsData?.vmodes ?? [],
      vmodeDefault: clipsData?.vertical_default || "blur_pad",
      trash,
      loading,
      offline,
      reloadKey,
      bump,
      refresh,
      job,
      jobLines,
      lastStep,
      runJob,
      stopJob,
      track,
      notice,
      flash,
      variants,
    }),
    [proj, clipsData, trash, loading, offline, reloadKey, bump, refresh, job, jobLines, lastStep, runJob, stopJob, track, notice, flash, variants],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngine(): Engine {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEngine ต้องอยู่ใต้ <EngineProvider>");
  return v;
}

/** โหลดข้อมูลหนึ่งก้อนจากเอนจิน — โหลดใหม่เมื่อ `key` เปลี่ยน
 *
 *  key = สตริง/ตัวเลขที่รวมทุกอย่างที่ควรทำให้โหลดใหม่ เช่น `eng.reloadKey` หรือ
 *  `${eng.reloadKey}:${scope}` — รับเป็นค่าเดียวแทน deps array เพราะ fn มักเป็น
 *  arrow ใหม่ทุก render และกฎ hooks ไม่ยอมให้ส่ง deps ผ่านตัวแปร
 *
 *  คืน setData ให้หน้าเอาไปทับด้วยผลจาก POST ได้เลย (เอนจินตอบก้อนล่าสุดกลับมา
 *  ทุกครั้ง) ไม่ต้องยิง GET ซ้ำ
 */
export function useLoader<T>(fn: () => Promise<T>, key: string | number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  // อัปเดต ref หลัง render (ไม่ใช่ระหว่าง render ตามกฎ react-hooks/refs) — effect
  // นี้ประกาศก่อน effect ที่เรียก load จึงทำงานก่อนเสมอในรอบเดียวกัน
  useEffect(() => {
    fnRef.current = fn;
  });
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (my === seq.current) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : "โหลดไม่ได้");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, key]);
  return { data, setData, error, loading, reload: load };
}
