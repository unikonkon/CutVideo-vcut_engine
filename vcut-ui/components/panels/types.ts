import type { FxData, FxOverlay, FxTextItem, MusicTrack } from "@/lib/api";

/** state กลางของ fx ที่ page ถืออยู่ — แผงซ้ายและเลเยอร์บนไทม์ไลน์ใช้ก้อนเดียวกัน */
export interface FxStore {
  data: FxData | null;
  draft: {
    music: MusicTrack[];
    texts: FxTextItem[];
    overlays: FxOverlay[];
    journey: Record<string, unknown>;
  } | null;
  patch: (part: {
    music?: MusicTrack[];
    texts?: FxTextItem[];
    overlays?: FxOverlay[];
    journey?: Record<string, unknown>;
  }) => void;
  save: () => void;
  revert: () => void;
  dirty: boolean;
  saving: boolean;
  /** อัปเดตเฉพาะข้อมูลอ้างอิง (คลัง asset ฯลฯ) โดยไม่แตะ draft */
  setData: (d: FxData) => void;
}
