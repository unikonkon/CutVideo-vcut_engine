// แปลงสถานะงานของเอนจิน (JobState) → 5 เฟสบนแผง "กำลังตัด"
//
// เอนจินบอกแค่ cmd ที่กำลังรัน (job.cmd) กับลำดับ at/of — ไม่ได้บอกรายชื่อขั้น
// ทั้งหมดของงาน ตารางงาน→ขั้นจึงต้องมีสำเนาไว้ที่นี่ (ตาม JOB_STEPS · PHASE_JOBS ·
// PREPARE_JOBS · BUILD_JOBS ใน serve.py)  ส่วนงาน "plan" คือ `vcut run` คำสั่ง
// เดียวที่ทำทุกขั้นข้างใน — at/of ค้างที่ 1/1 ตลอด ต้องอ่านป้ายตัวพิมพ์ใหญ่ที่แต่ละ
// ขั้นพิมพ์หัวบรรทัด log (SCAN · LISTEN · RENDER …) แทนว่าถึงขั้นไหนแล้ว

import type { JobState, SetupStep } from "@/lib/api";

export interface Phase {
  id: string;
  label: string;
  steps: string[];
  note: string;
}

export const PHASES: Phase[] = [
  { id: "source", label: "① SCAN", steps: ["scan", "thumbs"], note: "อ่านคลิป · ภาพตัวอย่าง" },
  { id: "prepare", label: "② LISTEN · PREPARE", steps: ["listen", "ai", "silence", "prepare"], note: "บทพูด · AI · ช่วงเงียบ · คลังชิ้น" },
  { id: "compose", label: "③ COMPOSE · RENDER", steps: ["compose", "decide", "render", "assemble"], note: "เรียง · ตัดชิ้น · ต่อไฟล์" },
  { id: "text", label: "④ CAPTION", steps: ["caption"], note: "ซับ · ข้อความ" },
  { id: "fx", label: "⑤ FX · AI REVIEW", steps: ["finish", "review"], note: "เพลง · ภาพซ้อน · เอฟเฟกต์" },
];

/** ชื่อคำสั่ง → ชื่อขั้น (JOB_STEPS กลับด้าน — ต่างกันแค่ fx→finish) */
const CMD_STEP: Record<string, string> = { fx: "finish" };

/** ป้ายหัวบรรทัด log ที่แต่ละขั้นพิมพ์ — ไว้ตามงาน `vcut run` */
const LOG_TAGS: [RegExp, string][] = [
  [/^SCAN\b/, "scan"],
  [/^THUMBS\b/, "thumbs"],
  [/^LISTEN\b/, "listen"],
  [/^AI\b|^\s*·\s*ก้อน\s+\d+\/\d+/, "ai"],
  [/^SILENCE\b/, "silence"],
  // prepare/compose ไม่พิมพ์ป้ายตัวพิมพ์ใหญ่ — จับบรรทัดสรุปแรกของแต่ละตัวแทน
  [/^PREPARE\b|^\s*ชิ้นที่เตรียมได้/, "prepare"],
  [/^COMPOSE\b|^\s*วิธีเลือก\s/, "compose"],
  [/^DECIDE\b/, "decide"],
  [/^RENDER\b/, "render"],
  [/^ASSEMBLE\b/, "assemble"],
  [/^CAPTION\b/, "caption"],
  [/^FINISH\b|^FX\b/, "finish"],
];

const ANSI = /\[[0-9;]*m/g;

const PHASE_JOBS: Record<string, string[]> = {
  source: ["scan", "thumbs"],
  prepare: ["listen", "ai", "silence", "prepare"],
  compose: ["compose", "render", "assemble"],
  text: ["caption"],
  fx: ["finish"],
  prepare_all: ["listen", "ai", "silence", "prepare"],
  prepare_free: ["listen", "silence", "prepare"],
  build: ["render", "assemble"],
  build_text: ["render", "caption"],
  build_fx: ["render", "finish"],
};

/** รายชื่อขั้นที่งานนี้จะรัน — งาน plan/phase ยึดตามแผน (ขั้นที่ปิดไว้ไม่รัน) */
export function jobSteps(step: string, planSteps: SetupStep[] | undefined): string[] {
  const ok = new Set((planSteps ?? []).filter((s) => s.run).map((s) => s.id));
  if (step === "plan") return (planSteps ?? []).filter((s) => s.run).map((s) => s.id);
  if (step in PHASE_JOBS) {
    const list = PHASE_JOBS[step];
    // phase จริงกรองด้วยแผน · ปุ่ม prepare_*/build_* สั่งตรงตามที่เขียน
    return ["source", "prepare", "compose", "text", "fx"].includes(step) && planSteps ? list.filter((s) => ok.has(s)) : list;
  }
  if (step === "music") return [];
  return step ? [step] : [];
}

/** ขั้นที่กำลังทำอยู่ตอนนี้ — จาก job.cmd หรือจาก log เมื่อเป็น `vcut run` */
export function currentStep(job: JobState | null, lines: string[], planSteps: SetupStep[] | undefined): string | null {
  if (!job || !job.cmd) return null;
  if (job.cmd !== "run") return CMD_STEP[job.cmd] ?? job.cmd;
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i].replace(ANSI, "");
    for (const [re, id] of LOG_TAGS) if (re.test(ln)) return id;
  }
  return jobSteps("plan", planSteps)[0] ?? null;
}

export type Led = "on" | "dim" | "off" | "red";

export interface PhaseView extends Phase {
  led: Led;
  cur: boolean;
  /** ขั้นของเฟสนี้ที่อยู่ในงาน (ว่าง = งานนี้ไม่แตะเฟสนี้) */
  inJob: string[];
  /** ข้อความช่องขวา — ความคืบหน้า/สรุปของที่มีอยู่ */
  status: string;
}

export function phaseViews(
  job: JobState | null,
  lines: string[],
  planSteps: SetupStep[] | undefined,
  setupSteps: SetupStep[] | undefined,
): PhaseView[] {
  const steps = job ? jobSteps(job.step, planSteps) : [];
  const cur = currentStep(job, lines, planSteps);
  const curIdx = cur ? steps.indexOf(cur) : -1;
  const finished = !!job && !job.running && job.code !== null;
  const okDone = finished && job.code === 0 && !job.stopped;
  const have = new Map((setupSteps ?? []).map((s) => [s.id, s]));

  return PHASES.map((p) => {
    const inJob = p.steps.filter((s) => steps.includes(s));
    if (inJob.length === 0) {
      // เฟสนอกงาน — ไฟติดถ้าของที่แผนต้องการมีอยู่แล้ว
      const want = p.steps.filter((s) => have.get(s)?.run);
      const done = want.length > 0 && want.every((s) => have.get(s)?.exists);
      const summ = want.map((s) => have.get(s)?.summary).filter(Boolean).join(" · ");
      return { ...p, led: done ? "on" : "off", cur: false, inJob, status: summ || (want.length ? "ยังไม่มี" : "ข้าม") };
    }
    const isCur = cur !== null && inJob.includes(cur);
    const before = inJob.every((s) => steps.indexOf(s) < curIdx);
    let led: Led = "off";
    let status = "WAIT";
    if (okDone || (finished && before)) {
      led = "on";
      status = "DONE";
    } else if (isCur) {
      led = job?.running ? "dim" : finished ? "red" : "dim";
      const pr = job?.progress;
      status = job?.running
        ? pr && pr.total > 0
          ? `${pr.label || cur} ${pr.n}/${pr.total}${pr.eta ? ` · ~${pr.eta}` : ""}`
          : `${cur?.toUpperCase()} …`
        : job?.stopped
          ? "STOPPED"
          : `FAIL · code ${job?.code}`;
    } else if (before) {
      led = "on";
      status = "DONE";
    } else {
      status = inJob.map((s) => s.toUpperCase()).join(" · ");
    }
    return { ...p, led, cur: isCur && !!job?.running, inJob, status };
  });
}

/** สัดส่วนงานที่ทำไปแล้ว 0–1 — ขั้นที่ผ่านแล้วนับเต็ม ขั้นปัจจุบันนับตามแถบ */
export function jobFraction(job: JobState | null, lines: string[], planSteps: SetupStep[] | undefined): number {
  if (!job) return 0;
  if (!job.running) return job.code === 0 && !job.stopped ? 1 : 0;
  const steps = jobSteps(job.step, planSteps);
  if (steps.length === 0) {
    const pr = job.progress;
    return pr && pr.total > 0 ? pr.n / pr.total : 0;
  }
  const cur = currentStep(job, lines, planSteps);
  const idx = cur ? Math.max(0, steps.indexOf(cur)) : 0;
  const pr = job.progress;
  const inner = pr && pr.total > 0 ? pr.n / pr.total : 0.3;
  return Math.min(1, (idx + inner) / steps.length);
}
