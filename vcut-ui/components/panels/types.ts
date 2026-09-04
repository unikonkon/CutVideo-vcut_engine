import type {
  CaptionsData,
  FxClip,
  FxData,
  FxOverlay,
  FxPreset,
  FxShape,
  FxTextItem,
  MusicTrack,
} from "@/lib/api";

/** state กลางของ fx ที่ page ถืออยู่ — แผงซ้ายและเลเยอร์บนไทม์ไลน์ใช้ก้อนเดียวกัน */
export interface FxStore {
  data: FxData | null;
  draft: {
    music: MusicTrack[];
    texts: FxTextItem[];
    /** ชุดสไตล์ที่ข้อความหลายชิ้นใช้ร่วมกัน — ชื่อคือตัวชี้ที่ texts[].preset อ้าง */
    presets: FxPreset[];
    overlays: FxOverlay[];
    journey: Record<string, unknown>;
    /** สวิตช์ซับอัตโนมัติของขั้น 5 เอง (อ่าน transcript ตรง ๆ ไม่ผ่าน captions.json) */
    auto_sub: { enabled: boolean };
    /** เอฟเฟกต์รายชิ้น — กุญแจมาจาก view.segments[].key ของเอนจิน ห้ามประกอบเอง */
    clips: Record<string, FxClip>;
    shapes: FxShape[];
  } | null;
  patch: (part: {
    music?: MusicTrack[];
    texts?: FxTextItem[];
    presets?: FxPreset[];
    overlays?: FxOverlay[];
    journey?: Record<string, unknown>;
    auto_sub?: { enabled: boolean };
    clips?: Record<string, FxClip>;
    shapes?: FxShape[];
  }) => void;
  save: () => void;
  revert: () => void;
  dirty: boolean;
  saving: boolean;
  /** อัปเดตเฉพาะข้อมูลอ้างอิง (คลัง asset ฯลฯ) โดยไม่แตะ draft */
  setData: (d: FxData) => void;
}

/** state กลางของซับขั้น 4 — ทรงเดียวกับ FxStore เพื่อให้แผงเดียวคุมสองไฟล์ได้
 *  ด้วยตรรกะชุดเดียว (แก้ที่ draft · กดบันทึกทีเดียว · Cmd+Shift+S เก็บให้ทั้งหมด) */
export interface CapStore {
  data: CaptionsData | null;
  draft: CapDraft | null;
  patch: (part: Partial<CapDraft>) => void;
  save: () => void;
  revert: () => void;
  dirty: boolean;
  saving: boolean;
}

export interface CapDraft {
  style: Record<string, unknown>;
  enabled: boolean;
  drop: string[];
  edits: Record<string, string>;
}

/** บรรทัดบทพูดที่อยู่ในหนังจริง — page คิดมาให้แล้ว จากบทพูดที่ถอดไว้ + ไทม์ไลน์
 *
 *  `id` ใช้สูตรเดียวกับ cue ของซับขั้น 4 (`<คลิป>#<ลำดับบรรทัด>`) แผงบทพูดจึงจับคู่
 *  บรรทัด ↔ ข้อความบนหนัง ↔ cue ที่ซ่อนไว้ ได้ด้วยคีย์ตัวเดียวกันทั้งสามที่
 */
export interface SpeechLine {
  /** `<คลิป>#<ลำดับบรรทัดในคลิป>` */
  id: string;
  /** ชื่อคลิปต้นทาง */
  name: string;
  /** วินาทีที่พูด นับจากต้นคลิป (พิกัดเดียวกับ at ของข้อความขั้น 5) */
  at: number;
  dur: number;
  text: string;
  /** วินาทีบนไทม์ไลน์ของหนัง — ใช้เรียงและโชว์เวลาให้คนอ่าน */
  tl: number;
}
