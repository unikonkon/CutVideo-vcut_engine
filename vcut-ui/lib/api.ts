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

/** ของในถังขยะ — kind "link" คือคลิปที่แค่อ้างอิงไฟล์เดิม ถอดออกไปแค่ตัวลิงก์ */
export interface TrashItem {
  name: string;
  at: number;
  kind: "file" | "link";
  orig: string;
  file: string;
  thumb: string;
  size: number;
  dur: number;
  link_to?: string;
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
  // ส่ง exclude/order เต็มรายการเสมอ — เอนจินเขียนทับทั้งคีย์ ไม่ได้รับเป็นส่วนต่าง
  saveClips: (payload: { exclude?: string[]; order?: string[] }) =>
    j<{ ok: boolean; clips: { clips: ClipInfo[] } }>(
      `${engine}/api/clips`,
      post(payload),
    ),
  /** เอาคลิปออกจากคลัง — ไฟล์ไปนอนในถังขยะ (กู้ได้) และชิ้นของมันถูกตัดออกจาก
   *  edl.json ให้ด้วย · คลิปที่อ้างอิงไฟล์เดิมจะถอดแค่ตัวลิงก์ ไม่แตะไฟล์ต้นทาง */
  deleteClip: (name: string) =>
    j<{ ok: boolean; deleted: string; kind: "file" | "link"; dropped: number;
        clips: { clips: ClipInfo[] } }>(
      `${engine}/api/clips`,
      post({ delete: name }),
    ),
  /** เพิ่มคลิปแบบอ้างอิงไฟล์ที่อยู่เดิม — ส่งโฟลเดอร์มาก็ได้ (ลิงก์ทั้งโฟลเดอร์) */
  linkClips: (path: string) =>
    j<{ ok: boolean; linked: string[]; skipped: { path: string; why: string }[] }>(
      `${engine}/api/clips`,
      post({ link: path }),
    ),
  trash: () => j<{ items: TrashItem[]; dir: string }>(`${engine}/api/trash`),
  restoreClip: (name: string) =>
    j<{ ok: boolean; restored: string; trash: { items: TrashItem[] } }>(
      `${engine}/api/trash`,
      post({ restore: name }),
    ),
  purgeClip: (name?: string) =>
    j<{ ok: boolean; purged: string[]; trash: { items: TrashItem[] } }>(
      `${engine}/api/trash`,
      post(name ? { purge: name } : { empty: true }),
    ),
  saveEdl: (keep: KeepPiece[]) =>
    j<{ ok: boolean }>(`${engine}/api/edl`, post({ keep })),
  undo: () => j<{ ok: boolean }>(`${engine}/api/undo`, post({})),
  // keyint = ระยะห่างคีย์เฟรมของชิ้นที่ตัดไว้ (วินาที) — ใช้ปัด at ให้ตรงคีย์เฟรม
  live: (segs: string[]) =>
    j<{ token: string; count: number; keyint: number }>(
      `${engine}/api/live`,
      post({ segs }),
    ),
};

export const thumbUrl = (name: string) => `${engine}/thumb/${name}.jpg`;
export const segUrl = (file: string) => `${engine}/seg/${file}`;
export const clipUrl = (name: string) => `${engine}/clip/${name}`;
// at = ข้ามเข้าไปในชิ้นแรกกี่วินาที (เอนจินสั่ง -ss ให้) — เบราว์เซอร์เลื่อนหัวอ่าน
// ในสตรีม chunked เองไม่ได้ ต้องให้ ffmpeg ตั้งต้นมาให้ตรงจุดตั้งแต่แรก
export const liveUrl = (token: string, from: number, at = 0) =>
  `${engine}/live/${token}?from=${from}` + (at > 0.05 ? `&at=${at.toFixed(3)}` : "");
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

export type ReviewTask = "cut" | "trim" | "music" | "sfx" | "sticker" | "text";

/** ข้อเสนอหนึ่งข้อจาก AI — ช่องที่มีจริงขึ้นกับ op (เอนจินตรวจมาแล้วทุกข้อ)
 *
 *  drop/move/trim ชี้ช็อตด้วยเลขลำดับ `at` (+ `name` ไว้กันไทม์ไลน์เปลี่ยน)
 *  music/sfx/sticker/text วางของบนเส้นเวลาด้วย `tl` = วินาทีในหนัง
 */
export interface ReviewOp {
  op: "drop" | "move" | "trim" | "music" | "sfx" | "sticker" | "text";
  id?: number;
  task?: ReviewTask;
  why: string;
  // ── ฝั่งไทม์ไลน์ ──
  at?: number;
  name?: string;
  to?: number;
  side?: "head" | "tail";
  cut?: number;
  start?: number;
  was?: number;
  // ── ฝั่งชั้นแต่งหนัง ──
  tl?: number;
  dur?: number;
  file?: string;
  label?: string;
  loop?: boolean;
  text?: string;
}

export interface ReviewTaskInfo {
  id: ReviewTask;
  label: string;
  /** ผลลง fx.json (ขั้น 5) — กดรับแล้วไม่ต้องตัดวิดีโอใหม่ */
  fx: boolean;
  /** ต้องมีแคตตาล็อกจากหน้าเว็บถึงจะสั่งได้ */
  web: boolean;
}

export interface ReviewData {
  has: boolean;
  stale: boolean;
  context_default: string;
  version?: number;
  ops?: ReviewOp[];
  note?: string;
  summary?: string;
  tasks_all?: ReviewTaskInfo[];
  tasks_default?: ReviewTask[];
  tasks?: Record<string, { ops?: ReviewOp[]; note?: string; seconds?: number;
                           cost_usd?: number; provider?: string }>;
  provider?: string;
  gemini?: { ok: boolean; from: string; hint: string };
  [k: string]: unknown;
}

/** รายการตัวอย่างที่มีอยู่ฝั่งหน้าเว็บ — เอนจินไม่รู้จัก ต้องส่งไปให้ตอนสั่งงาน */
export interface ReviewCatalog {
  sfx?: { file: string; label: string; cat: string; dur: number; loop: number }[];
  sticker?: { file: string; label: string; cat: string }[];
  bgm?: { file: string; label: string; cat: string }[];
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
  runReview: (
    context: string,
    force = false,
    tasks?: ReviewTask[],
    catalog?: ReviewCatalog,
  ) =>
    j<{ ok: boolean }>(`${engine}/api/review`, post({ context, force, tasks, catalog })),
  saveAiKey: (key: string) =>
    j<{ ok: boolean; from: string; hint: string }>(`${engine}/api/aikey`, post({ key })),
  setup: () => j<SetupData>(`${engine}/api/setup`),
  saveSetup: (path: string, values: Record<string, unknown>) =>
    j<{ ok: boolean; path: string; setup: SetupData }>(
      `${engine}/api/setup`,
      post({ path, values, activate: true }),
    ),
};

/** ถามก่อนว่าไฟล์นี้ลงคลังได้ไหม — ชื่อ · นามสกุล · ที่ว่างในดิสก์ · ชื่อซ้ำ
 *
 *  ต้องถามให้จบ *ก่อน* เริ่มส่งไฟล์ เพราะ error ที่ตอบกลางคันระหว่างที่เบราว์เซอร์
 *  ยังส่งไฟล์อยู่นั้นไปไม่ถึงผู้ใช้: ฝั่งที่กำลังเขียนสายอยู่จะเห็นแค่ EPIPE แล้ว
 *  ทิ้งตอบกลับที่รับมาแล้วไป (พร็อกซีของ next dev ก็ฟ้อง Parse Error แทน)
 */
export function checkClip(file: File) {
  const q = `name=${encodeURIComponent(file.name)}&size=${file.size}`;
  return j<{ ok: boolean; name?: string; error?: string }>(
    `${engine}/api/upload/check?${q}`,
  );
}

// ก้อนละ 8 MB — ต้องต่ำกว่าเพดาน 10 MB ที่ rewrites() ของ Next ตัดเนื้อคำขอทิ้ง
// (proxyClientMaxBodySize) ตอน dev  ใหญ่กว่านี้แล้วคลิปจะขาดหายโดยไม่มีใครฟ้อง
const CHUNK = 8 * 1024 * 1024;

/** ส่งก้อนเดียว — XHR เพราะ fetch ไม่มี progress ฝั่งส่ง */
function putChunk(
  file: File,
  name: string,
  offset: number,
  overwrite: boolean,
  onBytes: (sent: number) => void,
): Promise<{ done: boolean; name?: string; renamed?: boolean }> {
  const blob = file.slice(offset, Math.min(offset + CHUNK, file.size));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const q =
      `name=${encodeURIComponent(name)}&offset=${offset}` +
      `&total=${file.size}${overwrite ? "&overwrite=1" : ""}`;
    xhr.open("POST", `${engine}/upload/clip?${q}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytes(offset + e.loaded);
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
    xhr.send(blob);
  });
}

/** อัปโหลดคลิปฟุตเทจ — ซอยเป็นก้อนแล้วส่งต่อกันจนครบ
 *
 *  ส่งรวดเดียวทั้งไฟล์ไม่ได้ เพราะพร็อกซีของ `next dev` อมเนื้อคำขอไว้ในหน่วยความจำ
 *  แล้วตัดทิ้งที่ 10 MB โดยไม่ฟ้องอะไรเลย — คลิปที่ใหญ่กว่านั้นจะไปถึงเอนจินไม่ครบ
 */
export async function uploadClip(
  file: File,
  onProgress: (pct: number) => void,
  overwrite = false,
): Promise<{ ok: boolean; name: string; size: number; renamed: boolean }> {
  let offset = 0;
  // ชื่อที่จะใช้จริง — ชนของเดิมแล้วเอนจินจะเปลี่ยนให้ตั้งแต่ก้อนแรก (IMG → IMG-2)
  // ก้อนถัดไปต้องยึดชื่อนั้น ไม่ใช่ชื่อไฟล์ต้นทาง ไม่งั้นจะไปต่อท้าย .part ผิดตัว
  let name = file.name;
  for (;;) {
    const r = await putChunk(file, name, offset, overwrite, (sent) =>
      onProgress(Math.min(100, Math.round((sent / file.size) * 100))),
    );
    if (r.name) name = r.name;
    offset = Math.min(offset + CHUNK, file.size);
    if (r.done) {
      onProgress(100);
      return { ok: true, name, size: file.size, renamed: name !== file.name };
    }
    if (offset >= file.size) throw new Error("ส่งครบแล้วแต่เอนจินยังไม่ปิดไฟล์");
  }
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
