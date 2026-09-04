"use client";

// ของกลางของลิ้นชักแก้ชั้นแต่ง (ขั้น ③ · edit) — โครงลิ้นชัก + ตัวช่วยที่ store ยังไม่มี
//
//   EditShell    ลิ้นชัก (frames/EditFrame) + จอตัวอย่างเล็ก + ปุ่ม ยกเลิก/บันทึก·เรนเดอร์ใหม่
//                ทุกแผงใช้ตัวเดียวกัน จะได้ไม่มีแผงไหนลืม disabled ตอนงานวิ่ง
//   Lbl Row Sec  ชิ้นเล็กให้แผงเรียงแบบ mockup: ป้ายจาง · แถว "ป้าย | ตัวควบคุม" · หัวส่วน
//   pos9         แปลงตาราง 3×3 ↔ (x, y, align) ของเอนจิน
//   useAdders    "วางของที่หัวเล่น" ทุกชนิด (ข้อความ · รูปทรง · สติกเกอร์ · SFX · เพลง · หมุด)
//   catalog      รายการตัวอย่างฝั่งหน้าเว็บที่ต้องส่งให้ AI review

import { useCallback, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import EditFrame from "@/components/frames/EditFrame";
import { Bar, Btn, Icon } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import type { FxJourney, FxOverlay, FxShape, FxTextItem, JourneyStop, MusicTrack, ReviewCatalog } from "@/lib/api";
import { BGM_LIST, bgmUrl } from "@/lib/bgm";
import { MAX_AUDIO_STACK, MAX_STACK, overlapCount, tlToClip } from "@/lib/layers";
import { lookOf, nameFromText, uniqueName } from "@/lib/presets";
import { SFX_LIST, sfxUrl } from "@/lib/sfx";
import { STICKER_LIST, stickerUrl, type StickerDef } from "@/lib/stickers";
import { resolveLook } from "@/lib/textfx";
import { dur } from "@/lib/time";
import { Stage } from "@/components/step3/Player";
import { useStudio } from "@/components/step3/store";
import { styleLetter } from "@/components/step3/styles";
import type { SpeechLine } from "@/components/step3/types";

/** ข้อความที่มาจากบทพูดติดรหัสไว้ที่ id — สูตรเดียวกับ v1 TranscriptPanel (เอนจินเก็บ id ตามที่ส่ง) */
export const TR_ID = (id: string) => `tr:${id}`;

/** รายการตัวอย่างฝั่งหน้าเว็บ — เอนจินไม่รู้จัก public/ ต้องส่งไปทุกครั้ง AI จะได้เลือกของที่มีจริง */
export function catalog(): ReviewCatalog {
  return {
    sfx: SFX_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat, dur: x.dur, loop: x.loop ? 1 : 0 })),
    sticker: STICKER_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat })),
    bgm: BGM_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat })),
  };
}

/** ชื่อไฟล์เสียงให้อ่านออก — ป้ายไทยของแคตตาล็อกก่อน ไม่มีค่อยใช้ชื่อไฟล์ตัดนามสกุล */
export function trackLabel(file: string): string {
  return SFX_LIST.find((x) => x.file === file)?.label ?? BGM_LIST.find((x) => x.file === file)?.label ?? file.replace(/\.[^.]+$/, "");
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ─────────────────────────── ชิ้นเล็กของแผง ───────────────────────────

/** ป้ายจางเล็ก (mockup: .muted.small) */
export function Lbl({ children, style, title }: { children: ReactNode; style?: CSSProperties; title?: string }) {
  return (
    <span className="muted small" style={style} title={title}>
      {children}
    </span>
  );
}

/** แถว "ป้ายซ้าย · ตัวควบคุมขวา" (mockup: ขนาด | − 54 +) */
export function Row({ label, children, title, style }: { label: ReactNode; children: ReactNode; title?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, ...style }} title={title}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  );
}

/** หัวส่วน — ชื่อน้ำหนัก 400 + ของฝั่งขวา */
export function Sec({ title, note, right, style }: { title: ReactNode; note?: ReactNode; right?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, minWidth: 0, ...style }}>
      <span style={{ fontWeight: 400, whiteSpace: "nowrap" }}>{title}</span>
      {note !== undefined && <Lbl style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</Lbl>}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

/** แถวของหลายชิ้นเรียงซ้ายไปขวา ห่อบรรทัดได้ */
export function TagRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", ...style }}>{children}</div>;
}

/** ตาราง 2 คอลัมน์ของแถว Row — ตัวเลขหลายตัวไม่ยาวเป็นตับ */
export function Grid2({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>{children}</div>;
}

/** ปุ่มไอคอนเล็กโปร่ง (ลบ · เล่น) */
export function IcBtn({ name, onClick, title, disabled, on }: { name: Parameters<typeof Icon>[0]["name"]; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; title?: string; disabled?: boolean; on?: boolean }) {
  return (
    <Btn sm ic ghost on={on} onClick={onClick} title={title} disabled={disabled}>
      <Icon name={name} size={13} />
    </Btn>
  );
}

// ─────────────────────────── ตาราง 3×3 ↔ เอนจิน ───────────────────────────

const POS_X = [0.08, 0.5, 0.92];
const POS_Y = [0.08, 0.5, 0.9];

/** ช่อง i (0–8 บน→ล่าง ซ้าย→ขวา) → (x, y, align แบบ ass numpad) */
export function pos9Pose(i: number): { x: number; y: number; align: number } {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return { x: POS_X[col], y: POS_Y[row], align: (2 - row) * 3 + col + 1 };
}

/** align (1–9) → ช่อง 0–8 */
export function pos9OfAlign(align: number): number | null {
  if (!Number.isInteger(align) || align < 1 || align > 9) return null;
  const row = align >= 7 ? 0 : align >= 4 ? 1 : 2;
  return row * 3 + ((align - 1) % 3);
}

/** ช่องที่ตรงกับ (x, y, align) ของชิ้น — ไม่ตรง = จัดเอง (null) */
export function pos9OfItem(x: number, y: number, align: number): number | null {
  const i = pos9OfAlign(align);
  if (i === null) return null;
  const p = pos9Pose(i);
  return Math.abs(p.x - x) < 0.05 && Math.abs(p.y - y) < 0.05 ? i : null;
}

// ─────────────────────────── จอตัวอย่างในลิ้นชัก ───────────────────────────

/** จอ 9:16 ในคอลัมน์ขวา 200 — Stage ของ store (ชั้นซ้อนสด) + เล่น/หยุด + แถบเวลา */
export function DrawerPreview() {
  const s = useStudio();
  const { setSource } = s;
  useEffect(() => {
    setSource({ mode: "timeline" });
  }, [setSource]);
  const total = Math.max(s.total, 0.001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
      <div className="thumb" style={{ height: 250, display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <Stage showOverlays message={!s.rendered.length ? "ยังไม่มีชิ้นที่ตัดแล้ว — ต่อไฟล์ก่อนถึงจะเล่นสดได้" : undefined} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn sm ic onClick={s.toggle} disabled={!s.rendered.length} title={s.playing ? "หยุด (Space)" : "เล่น (Space)"}>
          <Icon name={s.playing ? "pause" : "play"} size={12} />
        </Btn>
        <Bar pct={(s.playhead / total) * 100} style={{ flex: 1 }} />
        <span className="muted small num" style={{ whiteSpace: "nowrap" }}>
          {dur(s.playhead)} / {dur(s.total)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── โครงลิ้นชัก ───────────────────────────

export interface ShellProps {
  id: Edit3;
  /** งานที่ปุ่มบันทึกสั่ง — ซับใช้ build_text ที่เหลือ build_fx */
  buildStep?: "build_fx" | "build_text";
  /** ทิ้ง draft ของแผงนี้ (ปุ่ม ยกเลิก) */
  revert?: () => void;
  /** ตัวควบคุมสไตล์ใต้จอตัวอย่าง (คอลัมน์ขวา) */
  right?: ReactNode;
  children: ReactNode;
}

export function EditShell({ id, buildStep = "build_fx", revert, right, children }: ShellProps) {
  const eng = useEngine();
  const r = useRoute();
  const s = useStudio();
  const running = Boolean(eng.job?.running);
  const rb = s.rebuild;
  const modN = (s.dirty ? 1 : 0) + (s.fx.dirty ? 1 : 0) + (s.cap.dirty ? 1 : 0);
  const saving = s.saving || s.fx.saving || s.cap.saving;
  const isText = buildStep === "build_text";
  const eta = isText ? rb.eta.text : rb.eta.fx;
  const letter = styleLetter(s.setup, eng.proj?.variant_style ?? "");
  const secs = Math.round(s.total || s.variant.dur);

  // draft ลงไฟล์ก่อนสั่งงานเสมอ — ไม่งั้นเอนจินสร้างจากของเก่าแล้วคนเข้าใจว่าที่แก้ไม่มีผล
  const save = async () => {
    if (running || saving) return;
    if (modN) await s.saveAll();
    const ok = await eng.runJob(buildStep);
    if (ok) r.openEdit(null);
  };
  const cancel = () => {
    revert?.();
    r.openEdit(null);
  };

  return (
    <EditFrame
      active={id}
      title={`แก้ชั้นแต่ง · ${letter} · ${secs} วิ`}
      onPick={(t) => r.openEdit(t)}
      onClose={() => r.openEdit(null)}
      preview={<DrawerPreview />}
      right={right}
      footNote={`เรนเดอร์ใหม่เฉพาะแบบ ${s.variant.label} · ~${eta} วิ${modN ? ` · แก้ค้าง ${modN} ไฟล์` : ""}`}
      onCancel={cancel}
      onSave={save}
      saveDisabled={running || saving || !s.shots.length}
      saveTitle={running ? "เอนจินกำลังทำงานอื่นอยู่" : `บันทึกที่แก้ค้างแล้วสั่ง ${buildStep}`}
    >
      {children}
    </EditFrame>
  );
}

// ─────────────────────────── วางของที่หัวเล่น ───────────────────────────

// คีย์หน้าตาที่ลอกจากสไตล์กลางของขั้น ⑤ ตอนสร้างชิ้นจากบทพูด (v1 TranscriptPanel)
const STYLE_KEYS = ["font", "size", "color", "outline", "border", "shadow", "bold", "italic", "spacing"] as const;

export function useAdders() {
  const s = useStudio();
  const { fx, shots, offsets, total, layers, playhead, setFocus, ensureAsset, flash } = s;
  const d = fx.data;
  const dr = fx.draft;

  const bindAt = useCallback(
    (tl: number) => {
      const b = tlToClip(shots, offsets, tl);
      if (!b) flash("ตำแหน่งนี้อยู่นอกช่วงหนัง");
      return b;
    },
    [shots, offsets, flash],
  );

  /** ข้อความใหม่ที่วินาที tl ของหนัง — ค่าตั้งต้นของเอนจิน (defaults.text_item) ทับด้วย extra */
  const addTextAt = useCallback(
    (tl: number, extra: Partial<FxTextItem> = {}) => {
      if (!d || !dr) return;
      const bind = bindAt(tl);
      if (!bind) return;
      if (overlapCount(layers.text, tl, 3) >= MAX_STACK) return flash(`ช่วงนี้มีข้อความครบ ${MAX_STACK} ชั้นแล้ว`);
      const item: FxTextItem = { ...d.defaults.text_item, at: bind.at, dur: 3, name: bind.name, id: "", lines: [], ...extra };
      fx.patch({ texts: [...dr.texts, item] });
      setFocus({ kind: "text", idx: dr.texts.length });
    },
    [d, dr, bindAt, layers.text, fx, setFocus, flash],
  );

  /** บรรทัดบทพูด → ข้อความขั้น ⑤ ตรงเวลาที่พูดจริง (ท่าเดียวกับ v1: ยึดล่างกลาง · ลอกสไตล์กลาง) */
  const addSpeechText = useCallback(
    (ln: SpeechLine) => {
      if (!d || !dr) return;
      if (dr.texts.some((t) => t.id === TR_ID(ln.id))) return flash("บรรทัดนี้อยู่ในหนังแล้ว");
      const gstyle = (d.fx.style ?? {}) as Record<string, unknown>;
      const copied = Object.fromEntries(STYLE_KEYS.filter((k) => k in gstyle).map((k) => [k, gstyle[k]]));
      const item: FxTextItem = {
        ...d.defaults.text_item,
        ...copied,
        text: ln.text,
        name: ln.name,
        at: ln.at,
        dur: Math.max(0.4, ln.dur),
        align: 2,
        x: 0.5,
        y: 0.94,
        anim: "none",
        id: TR_ID(ln.id),
        lines: [],
      };
      fx.patch({ texts: [...dr.texts, item] });
      setFocus({ kind: "text", idx: dr.texts.length });
    },
    [d, dr, fx, setFocus, flash],
  );

  /** สร้างชุดสไตล์จากข้อความชิ้นนั้นแล้วผูกให้เลย (v1 makePresetFromText) */
  const makePresetFrom = useCallback(
    (idx: number) => {
      if (!d || !dr) return;
      const blank = d.defaults.preset;
      const t = dr.texts[idx];
      if (!blank || !t) return;
      const keys = d.defaults.preset_keys as string[];
      const name = uniqueName(nameFromText(t.text), new Set(dr.presets.map((x) => x.name)));
      fx.patch({
        presets: [...dr.presets, { ...blank, ...lookOf(resolveLook(t, dr.presets, keys), keys), name }],
        texts: dr.texts.map((x, k) => (k === idx ? { ...x, preset: name } : x)),
      });
      flash(`สร้างชุด "${name}" จากชิ้นนี้แล้ว — ชิ้นอื่นเลือกใช้ชุดเดียวกันได้`);
    },
    [d, dr, fx, flash],
  );

  const addShapeAt = useCallback(
    (tl: number, kind: string) => {
      if (!d || !dr) return;
      const bind = bindAt(tl);
      if (!bind) return;
      if (overlapCount(layers.shape, tl, 2) >= MAX_STACK) return flash(`ช่วงนี้มีรูปทรงซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      // แถบมุมมนเป็นพื้นของชิปตัวเลข — วางแล้วต้องอยู่ใต้ข้อความตั้งแต่แรก
      const item: FxShape = { ...d.defaults.shape, kind, behind: kind === "rrect", at: bind.at, dur: 2, name: bind.name, id: "" };
      fx.patch({ shapes: [...dr.shapes, item] });
      setFocus({ kind: "shape", idx: dr.shapes.length });
    },
    [d, dr, bindAt, layers.shape, fx, setFocus, flash],
  );

  /** ภาพซ้อนจากคลังของโปรเจกต์ (ไฟล์อยู่ใน assets แล้ว) */
  const addStickerAt = useCallback(
    (tl: number, file: string, pose?: Partial<FxOverlay>) => {
      if (!d || !dr) return;
      const bind = bindAt(tl);
      if (!bind) return;
      if (overlapCount(layers.sticker, tl, 2.5) >= MAX_STACK) return flash(`ช่วงนี้มีภาพซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      const item: FxOverlay = { ...d.defaults.overlay, ...pose, file, at: bind.at, dur: 2.5, name: bind.name, id: "" };
      fx.patch({ overlays: [...dr.overlays, item] });
      setFocus({ kind: "sticker", idx: dr.overlays.length });
    },
    [d, dr, bindAt, layers.sticker, fx, setFocus, flash],
  );

  /** สติกเกอร์ตัวอย่าง (public/stickers) — ยกเข้าคลังก่อน แล้ววางด้วยท่าที่ติดมากับแบบ */
  const addStickerSampleAt = useCallback(
    async (tl: number, def: StickerDef) => {
      try {
        const file = await ensureAsset(def.file, stickerUrl(def.file), "media");
        addStickerAt(tl, file, { width: def.width, x: def.x, y: def.y, ...(def.anim ? { anim: def.anim } : {}) });
      } catch (e) {
        flash(e instanceof Error ? e.message : "เพิ่มรูปเข้าคลังไม่สำเร็จ");
      }
    },
    [ensureAsset, addStickerAt, flash],
  );

  /** เสียงสั้น — แทร็กเพลงแบบ "ไม่วน ไม่หลบ ยาวเท่าไฟล์" (v1 addSfxAt) */
  const addSfxAt = useCallback(
    async (tl: number, file: string, dur: number, loop = false) => {
      if (!d || !dr) return;
      if (overlapCount(layers.music, tl, dur) >= MAX_AUDIO_STACK) return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      let actual = file;
      try {
        actual = await ensureAsset(file, sfxUrl(file), "audio");
      } catch (e) {
        return flash(e instanceof Error ? e.message : "เพิ่มไฟล์เสียงเข้าคลังไม่สำเร็จ");
      }
      const item: MusicTrack = { ...d.music.defaults, file: actual, at: Math.max(0, Math.round(tl * 100) / 100), dur, loop, duck: false, fade_in: 0, fade_out: 0, gain_db: -6, id: "" };
      fx.patch({ music: [...dr.music, item] });
      setFocus({ kind: "music", idx: dr.music.length });
      flash(`วางเสียง ${trackLabel(file)} ที่ ${tl.toFixed(1)} วิ`);
    },
    [d, dr, layers.music, ensureAsset, fx, setFocus, flash],
  );

  /** เพลงคลอ — ค่าตั้งต้นของเพลง (วน · หลบพูด · ยาวจนจบ) · replaceIdx = เปลี่ยนไฟล์ของแทร็กเดิมแทนที่จะเพิ่ม
   *  ไฟล์ตัวอย่าง (public/bgm) ถูกยกเข้าคลังก่อน · ไฟล์ในคลังอยู่แล้ววางได้เลย */
  const addBgmAt = useCallback(
    async (tl: number, file: string, replaceIdx: number | null = null) => {
      if (!d || !dr) return;
      let actual = file;
      try {
        if (BGM_LIST.some((b) => b.file === file)) actual = await ensureAsset(file, bgmUrl(file), "audio");
      } catch (e) {
        return flash(e instanceof Error ? e.message : "เพิ่มเพลงเข้าคลังไม่สำเร็จ");
      }
      if (replaceIdx != null && dr.music[replaceIdx]) {
        fx.patch({ music: dr.music.map((m, k) => (k === replaceIdx ? { ...m, file: actual } : m)) });
        setFocus({ kind: "music", idx: replaceIdx });
        flash(`เปลี่ยนเพลงเป็น ${trackLabel(file)}`);
        return;
      }
      const eff = d.music.defaults.dur > 0 ? d.music.defaults.dur : Math.max(total - tl, 1);
      if (overlapCount(layers.music, tl, eff) >= MAX_AUDIO_STACK) return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      const item: MusicTrack = { ...d.music.defaults, file: actual, at: Math.max(0, Math.round(tl * 100) / 100), id: "" };
      fx.patch({ music: [...dr.music, item] });
      setFocus({ kind: "music", idx: dr.music.length });
      flash(`วางเพลง ${trackLabel(file)} ที่ ${tl.toFixed(1)} วิ — วนซ้ำจนจบเรื่อง`);
    },
    [d, dr, total, layers.music, ensureAsset, fx, setFocus, flash],
  );

  /** หมุดใหม่ที่หัวเล่น — ผูก (คลิป, วินาทีในคลิป) เหมือนชั้นอื่น · ตำแหน่งบนแผนที่ (px/py หน่วย box)
   *  ต่อจากหมุดก่อนหน้าไปทางขวาบน และต่อเส้นทาง `d` ให้ด้วย เพราะเอนจินวาดเส้นจาก d ไม่ใช่จากหมุด
   *  (journey.polyline) — หมุดที่ไม่มีเส้นถึงจะไม่มีคนเดินไปหา */
  const addStopAt = useCallback(
    (tl: number) => {
      if (!d || !dr) return;
      const bind = bindAt(tl);
      if (!bind) return;
      const j = dr.journey as FxJourney;
      const stops = (j.stops ?? []) as JourneyStop[];
      const box = (j.box as number[] | undefined) ?? [1000, 550];
      const prev = stops[stops.length - 1];
      const px = prev ? Math.min(box[0] - 60, prev.px + 120) : 70;
      const py = prev ? Math.max(50, prev.py - 55) : box[1] - 90;
      const stop: JourneyStop = { ...d.defaults.stop, name: bind.name, at: bind.at, px, py, lx: px, ly: py + 45, id: "" };
      const all = [...stops, stop];
      let path = String(j.d ?? "");
      if (path) path += ` L ${px},${py}`;
      else if (all.length >= 2) path = all.map((st, i) => `${i ? "L" : "M"} ${st.px},${st.py}`).join(" ");
      fx.patch({ journey: { ...j, stops: all, d: path } });
      return all.length - 1;
    },
    [d, dr, bindAt, fx],
  );

  return useMemo(
    () => ({ playhead, addTextAt, addSpeechText, makePresetFrom, addShapeAt, addStickerAt, addStickerSampleAt, addSfxAt, addBgmAt, addStopAt, r3, clamp01 }),
    [playhead, addTextAt, addSpeechText, makePresetFrom, addShapeAt, addStickerAt, addStickerSampleAt, addSfxAt, addBgmAt, addStopAt],
  );
}
