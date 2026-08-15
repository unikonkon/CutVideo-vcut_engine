// ตัวกลางคุยกับ vcut serve.py — ทุกเส้นทางวิ่งผ่าน /engine (rewrite ใน next.config.ts)

export const engine = "/engine";

export type Kind = "TALK" | "BROLL";

export interface Shot {
  i: number;
  name: string;
  kind: Kind;
  start: number;
  end: number;
  dur: number;
  clip_dur: number;
  orient: string;
  rot: string;
  text: string;
  motion: number | null;
  bright: number | null;
  chapter: string;
  chapter_title: string;
  ai_score: number | null;
  gain: number | null;
  limiter: unknown;
  seg: string | null; // ชื่อไฟล์ segment ที่ render แล้ว — null = ต้องตัดใหม่
}

export interface Chapter {
  id: string;
  title?: string;
  segments: number;
  duration: number;
}

export interface ProjectState {
  project: string;
  out: string;
  out_exists: boolean;
  out_size: number;
  out_mtime: number;
  out_stale: boolean;
  config: string[];
  clips_total: number;
  footage_minutes: number;
  summary: {
    segments?: number;
    duration_total?: number;
    duration_talk?: number;
    duration_broll?: number;
    [k: string]: unknown;
  };
  chapters: Chapter[];
  ai: { goal: string; chapters: number; enabled: boolean };
  sheets: string[];
  timeline: Shot[];
  rendered: number;
}

export interface ClipInfo {
  name: string;
  num: number;
  orient: string;
  dur: number;
  w: number;
  h: number;
  size: number;
  codec: string;
  motion: number | null;
  bright: number | null;
  created: number;
  rot: string;
  vmode: string;
  vmode_eff: string;
  picked: boolean;
}

export interface JobProgress {
  label: string;
  n: number;
  total: number;
  eta: string;
  note: string;
}

export interface JobState {
  running: boolean;
  step: string;
  code: number | null;
  stopped: boolean;
  total: number;
  lines: string[];
  cmd: string;
  cmd_label: string;
  at: number;
  of: number;
  elapsed: number;
  progress: JobProgress | null;
}

export interface KeepPiece {
  name: string;
  start: number;
  end: number;
  kind: Kind;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || `HTTP ${r.status}`,
    );
  }
  return data as T;
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  state: () => j<ProjectState>(`${engine}/api/state`),
  clips: () => j<{ clips: ClipInfo[] }>(`${engine}/api/clips`),
  job: (since = 0) => j<JobState>(`${engine}/api/job?since=${since}`),
  runJob: (step: string, force = false) =>
    j<{ ok: boolean }>(`${engine}/api/job`, post({ step, force })),
  stopJob: () => j<{ ok: boolean }>(`${engine}/api/job/stop`, post({})),
  saveEdl: (keep: KeepPiece[]) =>
    j<{ ok: boolean }>(`${engine}/api/edl`, post({ keep })),
  undo: () => j<{ ok: boolean }>(`${engine}/api/undo`, post({})),
  live: (segs: string[]) =>
    j<{ token: string; count: number }>(`${engine}/api/live`, post({ segs })),
};

export const thumbUrl = (name: string) => `${engine}/thumb/${name}.jpg`;
export const segUrl = (file: string) => `${engine}/seg/${file}`;
export const clipUrl = (name: string) => `${engine}/clip/${name}`;
export const liveUrl = (token: string, from: number) =>
  `${engine}/live/${token}?from=${from}`;
