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
  /** เวลาที่ไฟล์มาถึงโฟลเดอร์ฟุตเทจ (mtime) — คนละอันกับ created ที่เป็นวันถ่าย */
  added: number;
  rot: string;
  vmode: string;
  vmode_eff: string;
  picked: boolean;
}

/** ตัวเลือกหนึ่งตัวของโหมดแนวตั้ง — ข้อความทั้งหมดมาจากเอนจิน (clips.VMODES)
 *  หน้าเว็บจึงไม่มีรายการของตัวเอง ที่จะหลุดจากของจริงตอนเอนจินเพิ่มโหมดใหม่ */
export interface VModeOption {
  value: string;
  label: string;
  help: string;
}

export interface ClipsData {
  clips: ClipInfo[];
  rotations: { value: string; label: string }[];
  vmodes: VModeOption[];
  /** โหมดแนวตั้งค่ากลางของทั้งเรื่อง — คลิปที่ไม่ได้ตั้งเองใช้ตัวนี้ */
  vertical_default: string;
  summary: {
    total: number;
    picked: number;
    vertical: number;
    horizontal: number;
    duration: number;
    custom_order: boolean;
    order_mode: string;
    order_reverse: boolean;
  };
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

/** จังหวะของแทร็กเพลงหนึ่งแทร็ก — ทุกตัวเลขคำนวณที่เอนจิน (ดู vcut_engine/beat.py) */
export interface BeatTrack {
  id: string;
  file: string;
  at: number;
  dur: number;
  loop: boolean;
  /** ที่เอนจินตรวจได้ — 0 = ตรวจไม่ได้ */
  auto_bpm: number;
  auto_offset: number;
  /** ที่ใช้จริง = ค่าที่พิมพ์ทับ ถ้าไม่มีก็ใช้ค่าที่ตรวจได้ */
  bpm: number;
  offset: number;
  /** true = คนพิมพ์ BPM เอง ค่าที่ตรวจได้ถูกเมิน */
  manual: boolean;
  /** เพลงนี้มีเครื่องเคาะชัดแค่ไหน — **ไม่ใช่** ความน่าจะเป็นที่ BPM จะถูก
   *  (แยกสองอย่างนั้นด้วยตัวเลขเดียวไม่ได้ ดูเหตุผลที่ beat.py) */
  strength: number;
  file_dur: number;
  /** คลื่นเสียงย่อ 20 ค่า/วินาที เป็นจำนวนเต็ม 0–100 */
  peaks: number[];
  peak_hz: number;
  /** เพลงที่วนซ้ำแล้วจังหวะขาดตอนกี่วินาที — 0 = ลงตัวพอดี */
  loop_drift: number;
  error: string;
}

export interface BeatData {
  tracks: BeatTrack[];
  /** จังหวะทุกเส้นเป็น *วินาทีในหนัง* พร้อมวาดทับไทม์ไลน์ได้เลย */
  grid: number[];
  total: number;
  analysed: number;
  limits: { talk: number; broll: number; min_dur: number };
  range: [number, number];
}

export interface BeatSnapResult {
  shots: { i: number; start: number; end: number; moved?: number }[];
  report: { i: number; why: string; need?: number; limit?: number;
            room?: [number, number] }[];
  moved: number;
  beats: number;
}

export const api = {
  state: () => j<ProjectState>(`${engine}/api/state`),
  /** จังหวะของทุกแทร็ก + กริดบนไทม์ไลน์ · force = วิเคราะห์ใหม่ ไม่ใช้แคช */
  beats: (force = false) =>
    j<BeatData>(`${engine}/api/beats${force ? "?force=1" : ""}`),
  /** ส่งช็อตที่อยู่บนจอตอนนี้ไปให้เอนจินคำนวณตำแหน่งใหม่ — ไม่ได้บันทึกอะไร
   *  หน้าเว็บเอาผลไปทาบเองผ่าน mutate() เพื่อให้ย้อนกลับได้ตามปกติ */
  beatSnap: (
    shots: { kind: string; start: number; end: number; clip_dur: number }[],
    limits?: { talk?: number; broll?: number; min_dur?: number },
  ) => j<BeatSnapResult>(`${engine}/api/beat/snap`, post({ shots, limits })),
  clips: () => j<ClipsData>(`${engine}/api/clips`),
  job: (since = 0) => j<JobState>(`${engine}/api/job?since=${since}`),
  runJob: (step: string, force = false) =>
    j<{ ok: boolean }>(`${engine}/api/job`, post({ step, force })),
  stopJob: () => j<{ ok: boolean }>(`${engine}/api/job/stop`, post({})),
  // ส่ง exclude/order เต็มรายการเสมอ — เอนจินเขียนทับทั้งคีย์ ไม่ได้รับเป็นส่วนต่าง
  saveClips: (payload: {
    exclude?: string[];
    order?: string[];
    /** ชื่อคลิป → โหมดแนวตั้ง ("" = ใช้ค่ากลางของเรื่อง) */
    vmodes?: Record<string, string>;
    rotations?: Record<string, string>;
  }) =>
    j<{ ok: boolean; clips: ClipsData }>(
      `${engine}/api/clips`,
      post(payload),
    ),
  /** เอาคลิปออกจากคลัง — ไฟล์ไปนอนในถังขยะ (กู้ได้) และชิ้นของมันถูกตัดออกจาก
   *  edl.json ให้ด้วย · คลิปที่อ้างอิงไฟล์เดิมจะถอดแค่ตัวลิงก์ ไม่แตะไฟล์ต้นทาง */
  deleteClip: (name: string) =>
    j<{ ok: boolean; deleted: string; kind: "file" | "link"; dropped: number;
        clips: ClipsData }>(
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
  /** จังหวะที่พิมพ์ทับเอง — 0 = ให้เอนจินตรวจให้ (ดู vcut_engine/beat.py)
   *  ค่าที่พิมพ์เองชนะค่าที่ตรวจได้เสมอ เพราะตัวตรวจพลาดจริงราว 1 ใน 10 เพลง */
  bpm: number;
  beat_offset: number;
}

/** ชุดสไตล์ที่ข้อความหลายชิ้นใช้ร่วมกัน — ชื่อคือตัวชี้ที่ข้อความอ้างถึง
 *
 *  **ชุดชนะค่าหน้าตาของชิ้น** ตอนเอนจินประกอบสตริง (fxtext.cues) ไม่ใช่ตอน
 *  บันทึก — ค่าเดิมของชิ้นจึงยังอยู่ครบในไฟล์ ปลดออกจากชุดแล้วได้ของเดิมคืน
 *
 *  ไม่มี align เพราะจุดยึดบนจอเป็นของรายชิ้นเสมอ (ดู fx.PRESET_KEYS)
 */
export interface FxPreset {
  name: string;
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
  /** ชื่อชุดสไตล์ที่ผูกอยู่ — "" = ไม่ผูก ใช้ค่าข้างบนตรง ๆ (ดู FxPreset) */
  preset: string;
  at: number;
  dur: number;
  id: string;
  name: string;
  lines: unknown[];

  /**
   *  ตัวเลขที่นับขึ้น — "" = ไม่นับ · ที่เหลือคือรูปแบบ (int · comma · k · pct · 1dp)
   *
   *  เลขไปแทนที่ `{n}` ในข้อความ · ไม่มี `{n}` = เลขแทนข้อความทั้งก้อน
   *  ยกเว้นการ์ดหลายบรรทัดซึ่ง **ต้องมี `{n}` ชัด ๆ** ไม่งั้นไม่นับให้เลย
   *  (ไม่งั้นทุกบรรทัดในการ์ดจะกลายเป็นตัวเลขเหมือนกันหมด)
   */
  count: string;
  count_from: number;
  count_to: number;
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

/** เอฟเฟกต์ของ *ชิ้นหนึ่งในไทม์ไลน์* — ไม่ใช่ของคลิปต้นฉบับ
 *
 *  เก็บใน fx.json["clips"] โดยผูกกับกุญแจ `<คลิป>@<เริ่ม>+<ยาว>` ที่เอนจินคิดมา
 *  ให้ (view.segments[].key) — หน้าเว็บห้ามประกอบกุญแจเอง เพราะกุญแจผูกกับ
 *  *ช่วงที่ตัด* ไม่ใช่ลำดับ ประกอบคลาดไปหลักมิลลิวินาทีเดียวก็กลายเป็นตั้งค่า
 *  ให้ชิ้นที่ไม่มีอยู่จริง แล้วเงียบ ไม่มีอะไรฟ้อง
 */
export interface FxClip {
  /** < 1 ช้าลง · > 1 เร็วขึ้น (0.1–8.0) */
  speed: number;
  /** 1.0 = เต็มเฟรมตามเดิม (1.0–4.0) — ขยายแล้วครอบกลับ กรอบภาพไม่เปลี่ยน */
  zoom: number;
  /** ชื่อโทนสี · "" = ไม่แตะสี */
  grade: string;
  mute: boolean;
  /** ดัง/เบาของชิ้นนี้เทียบกับที่ขั้น 3 ปรับมาแล้ว (−40…+12) */
  vol_db: number;

  /**
   *  ซูมปลายทาง — 0 = ไม่เดิน (ซูมค้างที่ `zoom` เหมือนเดิม) · >0 = ไล่จาก
   *  `zoom` ไปถึงค่านี้ตลอดช็อต
   *
   *  0 ไม่ใช่ "ซูม 0 เท่า" แต่คือสวิตช์ปิด — ต้องแยกจาก 1.0 ซึ่งแปลว่า "ไล่ไป
   *  จนสุดที่เต็มเฟรม" (ซูมออก) ซึ่งเป็นคำสั่งที่ตั้งใจสั่ง
   */
  zoom_to: number;
  /** ทิศที่กรอบภาพไถลไป · "" = อยู่กลาง — ต้องมี zoom > 1 ถึงจะมีที่ให้ไถล */
  pan: string;
  /** ภาพกระตุก 0 = ปิด · 1 = แรงสุด */
  glitch: number;
  /** กระตุกกี่ครั้งต่อวินาที — มีผลเมื่อ glitch > 0 เท่านั้น */
  glitch_hz: number;
  /** เบลอหัว-ท้ายช็อต 0 = ปิด · 1 = แรงสุด (ทรานสิชันแบบประมาณ) */
  whip: number;

  /** ── แบ่งจอสองคน (เฟส F) ──
   *  อีกครึ่งดึงจาก *ฟุตเทจดิบ* ไม่ใช่จากไทม์ไลน์ — ช่วงที่อยากเอามาเทียบมัก
   *  เป็นช่วงที่ถูกตัดทิ้งไปแล้ว ซึ่งเลือกจากไทม์ไลน์ไม่ได้
   *
   *  ต้องตั้งครบทั้งคู่ถึงจะมีผล — ขาดอย่างใดอย่างหนึ่งเอนจินไม่นับว่าถูกแตะ */
  split: string;
  /** ชื่อไฟล์ฟุตเทจดิบที่จะเอามาเป็นอีกครึ่ง */
  split_with: string;
  /** เริ่มที่วินาทีที่เท่าไรของคลิปนั้น */
  split_at: number;
}

/** ชิ้นในไทม์ไลน์ + เอฟเฟกต์ที่ตั้งไว้ — มาจาก view.segments ของเอนจิน */
export interface FxSegment {
  name: string;
  kind: Kind;
  start: number;
  dur: number;
  speed: number;
  exact_dur: number;
  /** วินาทีที่ชิ้นนี้เริ่มในหนังของขั้น 5 (หลังคิดความเร็วแล้ว) */
  at: number;
  /** ความยาวจริงหลังใส่เอฟเฟกต์ */
  len: number;
  key: string;
  /** ชิ้นนี้ถูกแต่งอะไรไหม — false = ใช้ไฟล์ของขั้น 3 ตรง ๆ ไม่ต้อง render */
  fx: boolean;
  effects: FxClip;
}

/** รูปทรงเวกเตอร์หนึ่งชิ้น — libass วาดเองด้วยโหมด \p ไม่ต้องมีไฟล์ภาพ */
export interface FxShape {
  /** arrow | bar | dot | rrect */
  kind: string;
  x: number;
  y: number;
  /** พิกเซลของหนังจริง */
  size: number;
  /** ความหนาเทียบกับ size (0.03–0.9) */
  thick: number;
  angle: number;
  color: string;
  outline: string;
  border: number;
  anim: string;
  in: number;
  out: number;
  /** วาดไว้ข้างหลังข้อความแทนที่จะทับ — แถบมุมมนที่รองตัวเลขต้องติ๊กตัวนี้ */
  behind: boolean;
  /** เรืองแสง 0 = ปิด · 1 = แรงสุด — ฮาโลสีเดียวกับตัวรูป วาดอยู่ใต้รูปจริง */
  glow: number;
  at: number;
  dur: number;
  id: string;
  name: string;
}

/** รูปทรงพร้อมเวลาในหนัง + เส้นทางที่เอนจินคำนวณมาแล้ว
 *
 *  `path` เป็นพิกัดสัมบูรณ์ยึด (0,0) เป็นกึ่งกลางรูป — ใช้กับ SVG ได้ตรง ๆ
 *  เพราะโหมด \p ของ libass กับ path ของ SVG นับพิกัดเหมือนกัน  ที่ให้เอนจิน
 *  คิดรูปให้ ไม่ใช่ให้เบราว์เซอร์คิดเอง เพราะวันหนึ่งลูกศรในพรีวิวจะคนละทรง
 *  กับในไฟล์ แล้วคนจะเชื่อพรีวิวจนกว่าจะ render เสร็จ
 */
export interface FxShapeCue extends FxShape {
  path: string;
  a: number | null;
  b: number | null;
  orphan?: boolean;
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
  /** map = เส้นทึบขอบคม · neon = เส้นเรืองแสง (ชื่อคีย์ไม่ใช่ "style" โดยตั้งใจ
   *  — ดูเหตุผลที่ vcut_engine/journey.py) */
  look?: string;
  /** ความแรงของแสงฟุ้ง 0–1 (มีผลเมื่อ look = neon) */
  glow?: number;
  /** สีแกนกลางของเส้นนีออน — หลอดจริงแกนขาว ฮาโลมีสี */
  core?: string;
  [k: string]: unknown;
}

export interface FxData {
  fx: {
    version: number;
    clips: Record<string, FxClip>;
    overlays: FxOverlay[];
    music: MusicTrack[];
    journey: FxJourney;
    style: Record<string, unknown>;
    presets: FxPreset[];
    texts: FxTextItem[];
    shapes: FxShape[];
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
    /** ชุดสไตล์เปล่า — หน้าเว็บสร้างชุดใหม่จากตัวนี้ */
    preset: FxPreset;
    /** คีย์ที่ *อยู่ในชุด* — ที่เหลือของ FxTextItem เป็นของรายชิ้นเสมอ */
    preset_keys: (keyof FxPreset)[];
    /** ค่าตั้งต้นของเอฟเฟกต์รายชิ้น — ทุกตัวแปลว่า "ไม่แตะ" */
    clip: FxClip;
    /** ชื่อโทนสี → คำอธิบายไทย ("" = ไม่แตะสี) */
    grade: Record<string, string>;
    /** ทิศการไถลกล้อง → คำอธิบายไทย ("" = อยู่กลางเฟรม) */
    pan: Record<string, string>;
    /** ทิศการแบ่งจอ → คำอธิบายไทย ("" = ไม่แบ่ง) */
    split?: Record<string, string>;
    /** รูปแบบตัวเลขที่นับขึ้น → คำอธิบายไทย ("" = ไม่นับ) */
    count: Record<string, string>;
    /** ชื่อแอนิเมชันที่ทำงานทีละคำ — จอตัวอย่างต้องวาดคนละแบบ */
    word_anim: string[];
    /** หน้าตาของเส้นแผนที่ → คำอธิบายไทย (map | neon) */
    journey_look?: Record<string, string>;
    shape: Omit<FxShape, "at" | "dur" | "id" | "name">;
    /** arrow → "ลูกศร" ฯลฯ */
    shape_kind: Record<string, string>;
    [k: string]: unknown;
  };
  view: {
    ready: boolean;
    total: number;
    cues: unknown[];
    shapes?: FxShapeCue[];
    segments?: FxSegment[];
    /** กี่ชิ้นในไทม์ไลน์ที่ถูกแต่ง — ชิ้นพวกนี้ต้องเข้ารหัสภาพเพิ่มหนึ่งรอบ */
    touched?: number;
  };
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
  /** สูตรสำเร็จ + ค่าที่จะเขียนจริง — ส่งค่ากลับทาง saveSetup ตัวเดิม
   *  `skipped` = คีย์ใน preset ที่ฟอร์มตั้งไม่ได้ ต้องใช้ `-c <preset>` จากเทอร์มินัล */
  recipes?: SetupRecipe[];
  work: string;
  source_ok: boolean;
}

export interface SetupRecipe {
  preset: string;
  label: string;
  hint: string;
  values: Record<string, unknown>;
  skipped: string[];
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
