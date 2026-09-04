// แถว LAYERS ทั้งหก (mockup LAYER_LIST) — หน้าเลือกแบบ · แผงแก้ · หน้า review ใช้
// ตัวเดียวกัน โน้ตทุกช่องคิดจากข้อมูลจริงใน store ไม่ใช่ตัวเลขตัวอย่าง

import type { LayerRow } from "@/components/frames/EditFrame";
import type { Studio } from "./store";

/** เสียงสั้น (SFX) แยกจากเพลงคลอด้วยท่าที่วางไว้: ไม่วน · ไม่หลบเสียงพูด · มีความยาวชัด */
export function isSfxTrack(t: { loop: boolean; duck: boolean; dur: number }) {
  return !t.loop && !t.duck && t.dur > 0;
}

export function layerRows(s: Studio): LayerRow[] {
  const d = s.fx.draft;
  const texts = d?.texts ?? [];
  const cards = texts.filter((t) => (t.lines?.length ?? 0) > 0).length;
  const hooks = texts.length - cards;
  const music = d?.music ?? [];
  const sfx = music.filter(isSfxTrack).length;
  const tracks = music.length - sfx;
  const bpm = s.beats?.tracks.find((t) => t.bpm)?.bpm ?? 0;
  const overlays = d?.overlays ?? [];
  const shapes = d?.shapes ?? [];
  const cues = s.cap.data?.cues.length ?? 0;
  const drop = s.cap.draft?.drop.length ?? 0;
  const subOn = s.cap.draft?.enabled ?? false;
  const clips = d?.clips ?? {};
  const touched = Object.keys(clips).length;
  const grades = [...new Set(Object.values(clips).map((c) => c.grade).filter(Boolean))];
  const zooms = Object.values(clips).filter((c) => (c.zoom ?? 1) > 1 + 1e-6 || (c.zoom_to ?? 0) > 0).length;
  const firstTrack = music[0]?.file.replace(/\.[^.]+$/, "").slice(0, 14) ?? "";

  return [
    {
      id: "text",
      name: "ข้อความ",
      note: texts.length ? `HOOK ${hooks} · การ์ด ${cards}` : "ยังไม่มี",
      on: texts.length > 0,
    },
    {
      id: "music",
      name: tracks ? `เพลง · ${tracks} แทร็ก` : "เพลง",
      note: music.length ? `${bpm ? `${Math.round(bpm)} BPM` : firstTrack} · SFX ${sfx}` : "ยังไม่มี",
      on: music.length > 0,
    },
    {
      id: "sticker",
      name: "สติกเกอร์ / ภาพซ้อน",
      note: overlays.length + shapes.length ? `${overlays.length} ภาพ · ${shapes.length} รูปทรง` : "ยังไม่มี",
      on: overlays.length + shapes.length > 0,
    },
    {
      id: "sub",
      name: "ซับจากบทพูด",
      // ข้อมูลซับไม่มีค่าความมั่นใจ — บอกจำนวนที่ซ่อนไว้แทน "N ไม่มั่นใจ" ของ mockup
      note: !s.cap.data ? "—" : subOn ? `${cues} บรรทัด · ซ่อน ${drop}` : `ปิด · ${cues} บรรทัด`,
      on: subOn && cues > 0,
    },
    {
      id: "fx",
      name: "โทนสี / ซูม / ความเร็ว",
      note: touched ? `${grades.join("/") || "—"} · zoom ${zooms} · แต่ง ${touched} ช็อต` : "ยังไม่แต่ง",
      on: touched > 0,
    },
  ];
}
