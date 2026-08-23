import type {
  CaptionsData,
  FxData,
  FxOverlay,
  FxTextItem,
  MusicTrack,
} from "@/lib/api";

/** state กลางของ fx ที่ page ถืออยู่ — แผงซ้ายและเลเยอร์บนไทม์ไลน์ใช้ก้อนเดียวกัน */
export interface FxStore {
  data: FxData | null;
  draft: {
    music: MusicTrack[];
    texts: FxTextItem[];
    overlays: FxOverlay[];
    journey: Record<string, unknown>;
    /** สวิตช์ซับอัตโนมัติของขั้น 5 เอง (อ่าน transcript ตรง ๆ ไม่ผ่าน captions.json) */
    auto_sub: { enabled: boolean };
  } | null;
  patch: (part: {
    music?: MusicTrack[];
    texts?: FxTextItem[];
    overlays?: FxOverlay[];
    journey?: Record<string, unknown>;
    auto_sub?: { enabled: boolean };
  }) => void;
  save: () => void;
  revert: () => void;
  dirty: boolean;
  saving: boolean;
  /** อัปเดตเฉพาะข้อมูลอ้างอิง (คลัง asset ฯลฯ) โดยไม่แตะ draft */
  setData: (d: FxData) => void;
}

/** state กลางของซับขั้น 4 — ทรงเดียวกับ FxStore เพื่อให้แผงเดียวคุมสองไฟล์ได้
 *  ด้วยตรรกะชุดเดียว (แก้ที่ draft · กดบันทึกทีเดียว · Cmd+S เก็บให้ทั้งหมด) */
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
