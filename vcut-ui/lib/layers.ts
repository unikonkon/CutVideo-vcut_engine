// แปลงข้อมูลของเอนจิน (ผูกกับ "คลิป+วินาทีในคลิป") ⇄ ตำแหน่งบนไทม์ไลน์รวม
//
// fx.texts / fx.overlays ผูกด้วย (name, at ในคลิปต้นฉบับ) — ชิ้นเดียวกันจึงตาม
// ช็อตไปเองเวลาสลับลำดับ  ส่วน fx.music ใช้เวลารวมของหนังตรง ๆ (at/dur)

import type {
  CaptionCue,
  FxOverlay,
  FxTextItem,
  MusicTrack,
  Shot,
  TranscriptData,
} from "./api";

export type LayerKind = "text" | "sticker" | "music" | "caption" | "speech";

export interface LayerBlock {
  kind: LayerKind;
  idx: number; // index ใน array ต้นทาง (-1 = อ่านอย่างเดียว)
  tl: number; // วินาทีบนไทม์ไลน์รวม
  dur: number;
  label: string;
  orphan?: boolean; // ผูกกับช่วงที่ไม่อยู่ในไทม์ไลน์แล้ว
}

/** ช็อตที่ครอบ (name, at ในคลิป) — คืน null ถ้าช่วงนั้นถูกตัดออกไปแล้ว */
export function clipToTl(
  shots: Shot[],
  offsets: number[],
  name: string,
  at: number,
): number | null {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.name === name && at >= s.start - 0.001 && at < s.end) {
      return offsets[i] + (at - s.start);
    }
  }
  return null;
}

/** เวลาบนไทม์ไลน์ → (ช็อต, ชื่อคลิป, วินาทีในคลิป) — ไว้ผูกของที่เพิ่งวาง */
export function tlToClip(
  shots: Shot[],
  offsets: number[],
  tl: number,
): { shotIdx: number; name: string; at: number } | null {
  for (let i = 0; i < shots.length; i++) {
    if (tl < offsets[i] + shots[i].dur) {
      return {
        shotIdx: i,
        name: shots[i].name,
        at: Math.round((shots[i].start + (tl - offsets[i])) * 1000) / 1000,
      };
    }
  }
  return null;
}

export function textBlocks(
  texts: FxTextItem[],
  shots: Shot[],
  offsets: number[],
): LayerBlock[] {
  return texts.map((t, idx) => {
    const tl = clipToTl(shots, offsets, t.name, t.at);
    return {
      kind: "text" as const,
      idx,
      tl: tl ?? 0,
      dur: Math.max(t.dur, 0.2),
      label: t.text || "(ว่าง)",
      orphan: tl == null,
    };
  });
}

export function stickerBlocks(
  overlays: FxOverlay[],
  shots: Shot[],
  offsets: number[],
): LayerBlock[] {
  return overlays.map((o, idx) => {
    const tl = clipToTl(shots, offsets, o.name, o.at);
    return {
      kind: "sticker" as const,
      idx,
      tl: tl ?? 0,
      dur: Math.max(o.dur, 0.2),
      label: o.file || "(ไม่มีไฟล์)",
      orphan: tl == null,
    };
  });
}

export function musicBlocks(music: MusicTrack[], total: number): LayerBlock[] {
  return music.map((m, idx) => ({
    kind: "music" as const,
    idx,
    tl: m.at,
    dur: m.dur > 0 ? m.dur : Math.max(total - m.at, 1),
    label: m.file.replace(/\.[^.]+$/, ""),
  }));
}

export function captionBlocks(cues: CaptionCue[]): LayerBlock[] {
  // cues ถูกคำนวณจาก EDL ปัจจุบันแล้ว — a/b เป็นเวลารวมอยู่แล้ว
  return cues.map((c, idx) => ({
    kind: "caption" as const,
    idx,
    tl: c.a,
    dur: Math.max(c.b - c.a, 0.1),
    label: c.text,
  }));
}

export function speechBlocks(
  tr: TranscriptData | null,
  shots: Shot[],
  offsets: number[],
): LayerBlock[] {
  if (!tr) return [];
  const out: LayerBlock[] = [];
  shots.forEach((s, i) => {
    for (const [a, b, text] of tr.clips[s.name] ?? []) {
      const x = Math.max(a, s.start);
      const y = Math.min(b, s.end);
      if (y - x < 0.15) continue; // ท่อนที่โดนตัดจนเหลือเศษ ไม่ต้องวาด
      out.push({
        kind: "speech",
        idx: -1,
        tl: offsets[i] + (x - s.start),
        dur: y - x,
        label: text,
      });
    }
  });
  return out;
}

// ── ซ้อนกันได้สูงสุด 5 ชั้น (ข้อความ/สติกเกอร์) · เสียง 6 ชั้น ──

export const MAX_STACK = 5;
export const MAX_AUDIO_STACK = 6;

/** จัดบล็อกที่ทับเวลากันให้แยกแถว — คืน map idx→แถว และจำนวนแถวที่ใช้ */
export function assignRows(
  blocks: LayerBlock[],
  maxRows = MAX_STACK,
): { row: Map<number, number>; rows: number } {
  const row = new Map<number, number>();
  // แถวละหนึ่ง "เวลาสิ้นสุดล่าสุด" — ใส่บล็อกลงแถวแรกที่ว่างพอ
  const ends: number[] = [];
  for (const b of [...blocks].sort((a, z) => a.tl - z.tl)) {
    let r = ends.findIndex((e) => b.tl >= e - 0.001);
    if (r < 0) r = Math.min(ends.length, maxRows - 1);
    ends[r] = Math.max(ends[r] ?? 0, b.tl + b.dur);
    row.set(b.idx, r);
  }
  return { row, rows: Math.max(1, Math.min(ends.length, maxRows)) };
}

/** นับว่ามีบล็อกอื่นทับช่วง [tl, tl+dur) กี่ชิ้น — ไว้คุมเพดาน 5 ชั้น */
export function overlapCount(
  blocks: LayerBlock[],
  tl: number,
  dur: number,
  excludeIdx = -1,
): number {
  return blocks.filter(
    (b) => b.idx !== excludeIdx && b.tl < tl + dur && tl < b.tl + b.dur,
  ).length;
}

// ── payload ตอนลากจากแผงมาปล่อยบนไทม์ไลน์ ──

export const DND_MIME = "application/x-vcut";

export type DropPayload =
  | { type: "music-file"; file: string }
  | { type: "sfx"; file: string; dur: number; loop?: boolean }
  | { type: "sticker"; file: string }
  | { type: "sticker-sample"; file: string }
  | { type: "text-new"; text?: string };
