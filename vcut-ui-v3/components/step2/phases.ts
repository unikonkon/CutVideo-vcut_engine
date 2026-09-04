// สถานะงาน "ตัดให้เลย" (quick / quick_ai / recut ใน serve.QUICK_JOBS) → รายการขั้นบนแผง
//
// งานพวกนี้เป็นคำสั่งแยกต่อขั้น (ไม่ใช่ `vcut run` คำสั่งเดียว) เอนจินจึงบอก job.cmd
// กับ at/of ตรง ๆ — ไม่ต้องอ่านป้ายจาก log เหมือน v2

import type { JobState } from "@/lib/api";

export interface QuickStep {
  id: string;
  label: string;
  note: string;
}

export const QUICK_STEPS: QuickStep[] = [
  { id: "scan", label: "อ่านคลิป", note: "คุณสมบัติทุกไฟล์ (ทำแล้วข้าม)" },
  { id: "thumbs", label: "ภาพตัวอย่าง", note: "ภาพปกของแต่ละแบบ" },
  { id: "listen", label: "ถอดเสียง", note: "บทพูดพร้อมเวลา — ใช้ร่วมทุกแบบ" },
  { id: "silence", label: "หาช่วงเงียบ", note: "เกณฑ์ตามความดังของคลิป" },
  { id: "ai_trim", label: "AI เลือกช่วง", note: "trim_suggest ~2–3 นาที" },
  { id: "variants", label: "ตัด 6 แบบ", note: "30 · 45 · 60 วิ · ตัดชิด · AI · ยิงรัว" },
  { id: "autofx", label: "วางชั้นแต่ง", note: "HOOK · การ์ดปิด · ซับ · เพลง ตามสไตล์" },
];

export const QUICK_JOBS: Record<string, string[]> = {
  quick: ["scan", "thumbs", "listen", "silence", "variants", "autofx"],
  quick_ai: ["scan", "thumbs", "listen", "silence", "ai_trim", "variants", "autofx"],
  recut: ["silence", "variants", "autofx"],
};

export const isQuickJob = (step: string) => step in QUICK_JOBS;

export type Led = "on" | "dim" | "off" | "red";

export interface StepView extends QuickStep {
  led: Led;
  cur: boolean;
  status: string;
}

/** แถวขั้นของงานที่กำลังวิ่ง/เพิ่งจบ — เฉพาะขั้นที่งานนี้มี */
export function quickViews(job: JobState | null): StepView[] {
  if (!job || !isQuickJob(job.step)) return [];
  const ids = QUICK_JOBS[job.step];
  const finished = !job.running && job.code !== null;
  const ok = finished && job.code === 0 && !job.stopped;
  const at = Math.max(0, job.at - 1); // ดัชนีคำสั่งที่กำลังทำ
  return QUICK_STEPS.filter((s) => ids.includes(s.id)).map((s) => {
    const i = ids.indexOf(s.id);
    let led: Led = "off";
    let status = "รอ";
    if (ok || i < at) {
      led = "on";
      status = "เสร็จ";
    } else if (i === at) {
      if (job.running) {
        led = "dim";
        const pr = job.progress;
        status = pr && pr.total > 0 ? `${pr.n}/${pr.total}${pr.eta ? ` · ~${pr.eta}` : ""}` : "กำลังทำ";
      } else {
        led = "red";
        status = job.stopped ? "หยุด" : `พัง (code ${job.code})`;
      }
    }
    return { ...s, led, cur: i === at && job.running, status };
  });
}

/** สัดส่วน 0–1 ของงาน */
export function quickFraction(job: JobState | null): number {
  if (!job || !isQuickJob(job.step)) return 0;
  if (!job.running) return job.code === 0 && !job.stopped ? 1 : 0;
  const n = QUICK_JOBS[job.step].length;
  const pr = job.progress;
  const inner = pr && pr.total > 0 ? pr.n / pr.total : 0.3;
  return Math.min(1, (Math.max(0, job.at - 1) + inner) / n);
}
