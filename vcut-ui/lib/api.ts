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
export const assetUrl = (name: string) =>
  `${engine}/asset/${encodeURIComponent(name)}`;

// ── ขั้น 4 · ข้อความ/ซับ ──

export interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  outline: string;
  border: number;
  shadow: number;
  bold: boolean;
  italic: boolean;
  align: number;
  margin_v: number;
  margin_h: number;
  pos_x: number | null;
  pos_y: number | null;
  spacing: number;
}

export interface CaptionCue {
  id: string;
  kind: string;
  a: number;
  b: number;
  text: string;
  name: string;
  clip_a: number;
  style: CaptionStyle;
}

export interface FontList {
  thai: string[];
  other: string[];
}

export interface CaptionsData {
  style: CaptionStyle;
  auto: {
    enabled: boolean;
    edits: Record<string, string>;
    drop: string[];
    styles: Record<string, Partial<CaptionStyle>>;
  };
  boxes: Record<string, unknown>[];
  cues: CaptionCue[];
  total: number;
  defaults: CaptionStyle;
  fonts: FontList;
  ffmpeg: { ok: boolean; path: string; how: string };
  out: { path: string; name: string; exists: boolean; size: number; mtime: number };
}

// ── ขั้น 5 · fx (เพลง · ภาพซ้อน · ข้อความ · แผนที่) ──

export interface MusicTrack {
  file: string;
  gain_db: number;
  duck: boolean;
  duck_db: number;
  duck_release: number;
  fade_in: number;
  fade_out: number;
  at: number;
  dur: number;
  loop: boolean;
  id: string;
}

export interface FxTextItem {
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
  color: string;
  outline: string;
  border: number;
  shadow: number;
  bold: boolean;
  italic: boolean;
  spacing: number;
  angle: number;
  align: number;
  anim: string;
  in: number;
  out: number;
  plate: boolean;
  at: number;
  dur: number;
  id: string;
  name: string;
  lines: unknown[];
}

export interface FxOverlay {
  file: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
  angle: number;
  anim: string;
  in: number;
  out: number;
  at: number;
  dur: number;
  id: string;
  name: string;
}

export interface JourneyStop {
  label: string;
  dist: number;
  color: string;
  px: number;
  py: number;
  lx: number;
  ly: number;
  name: string;
  at: number;
  id: string;
}

export interface FxJourney {
  enabled: boolean;
  stops: JourneyStop[];
  [k: string]: unknown;
}

export interface FxData {
  fx: {
    version: number;
    clips: Record<string, unknown>;
    overlays: FxOverlay[];
    music: MusicTrack[];
    journey: FxJourney;
    style: Record<string, unknown>;
    texts: FxTextItem[];
    [k: string]: unknown;
  };
  defaults: {
    text_item: Omit<FxTextItem, "at" | "dur" | "id" | "name" | "lines">;
    overlay: Omit<FxOverlay, "at" | "dur" | "id" | "name">;
    anim: Record<string, unknown>;
    overlay_anim: Record<string, unknown> | string[];
    journey: FxJourney;
    stop: JourneyStop;
    style: Record<string, unknown>;
    [k: string]: unknown;
  };
  view: { ready: boolean; total: number; cues: unknown[] };
  overlay: {
    assets: { file: string; kind: string; w: number; h: number; bytes: number }[];
    cues: unknown[];
    dir: string;
    missing: string[];
  };
  journey: { enabled: boolean; stops: (JourneyStop & { idx: number; a: number; b: number })[] };
  music: {
    items: MusicTrack[];
    tracks: string[];
    missing: string[];
    fetch: { ok: boolean; path: string; how: string };
    duck_max: number;
    defaults: MusicTrack;
  };
  ready: boolean;
  segments: number;
  orphans: unknown[];
  pending: string[];
  fonts: FontList;
  out: { path: string; name: string; exists: boolean; size: number; mtime: number };
}

// ── บทพูด · review · ตั้งค่า ──

export interface TranscriptData {
  exists: boolean;
  enabled: boolean;
  export: string;
  order: string[];
  clips: Record<string, [number, number, string][]>;
  files: Record<string, string[]>;
  summary: {
    clips: number;
    with_speech: number;
    segments: number;
    chars: number;
    speech: number;
  };
}

export interface ReviewOp {
  op: "drop" | "move";
  at: number;
  name: string;
  to?: number;
  why: string;
}

export interface ReviewData {
  has: boolean;
  stale: boolean;
  context_default: string;
  version?: number;
  ops?: ReviewOp[];
  note?: string;
  [k: string]: unknown;
}

export interface SetupField {
  key: string;
  label: string;
  type: string;
  tier: string;
  stage: string;
  help?: string;
  options?: string[];
  labels?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
}

export interface SetupData {
  fields: SetupField[];
  tiers: Record<string, { label: string; rank: number }>;
  phases: unknown[];
  steps: unknown[];
  values: Record<string, unknown>;
  inherited: Record<string, unknown>;
  project: { path: string; extends: string; raw: string; chain: string[] };
  projects: string[];
  presets: string[];
  work: string;
  source_ok: boolean;
}

export const api2 = {
  captions: () => j<CaptionsData>(`${engine}/api/captions`),
  saveCaptions: (payload: unknown) =>
    j<{ ok: boolean; captions: CaptionsData }>(
      `${engine}/api/captions`,
      post(payload),
    ),
  fx: () => j<FxData>(`${engine}/api/fx`),
  saveFx: (payload: unknown) =>
    j<{ ok: boolean; fx: FxData }>(`${engine}/api/fx`, post(payload)),
  music: (url: string) =>
    j<{ ok: boolean }>(`${engine}/api/music`, post({ url })),
  saveAsset: (name: string, data: string, want: "media" | "audio") =>
    j<{ ok: boolean; file: string; fx: FxData }>(
      `${engine}/api/asset`,
      post({ name, data, want }),
    ),
  deleteAsset: (name: string) =>
    j<{ ok: boolean; fx: FxData }>(`${engine}/api/asset`, post({ delete: name })),
  transcript: () => j<TranscriptData>(`${engine}/api/transcript`),
  review: () => j<ReviewData>(`${engine}/api/review`),
  runReview: (context: string, force = false) =>
    j<{ ok: boolean }>(`${engine}/api/review`, post({ context, force })),
  setup: () => j<SetupData>(`${engine}/api/setup`),
  saveSetup: (path: string, values: Record<string, unknown>) =>
    j<{ ok: boolean; path: string; setup: SetupData }>(
      `${engine}/api/setup`,
      post({ path, values, activate: true }),
    ),
};

/** อัปโหลดคลิปฟุตเทจแบบสตรีม — XHR เพราะ fetch ไม่มี progress ฝั่งส่ง */
export function uploadClip(
  file: File,
  onProgress: (pct: number) => void,
  overwrite = false,
): Promise<{ ok: boolean; name: string; size: number; renamed: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const q = `name=${encodeURIComponent(file.name)}${overwrite ? "&overwrite=1" : ""}`;
    xhr.open("POST", `${engine}/upload/clip?${q}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("ส่งไฟล์ไม่สำเร็จ"));
    xhr.send(file);
  });
}

/** แปลงไฟล์เป็น base64 (ไม่รวมหัว data:) สำหรับ /api/asset */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
    r.readAsDataURL(file);
  });
}
