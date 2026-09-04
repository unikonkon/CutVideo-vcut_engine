"use client";

// ของกลางของแผงแก้รายชั้น (ขั้น ③ · edit) — โครงหน้า + ตัวช่วยที่ store ยังไม่มี
//
//   EditShell   TopBar (ป้าย · MOD n · ทิ้ง/บันทึก · ↻ ทำขั้น ⑤ ใหม่) + EditFrame + Player
//               โหมด timeline — ทุกแผงใช้ตัวเดียวกัน จะได้ไม่มีแผงไหนลืม disabled ตอนงานวิ่ง
//   useAdders   "วางของที่หัวเล่น" ทุกชนิด (ข้อความ · รูปทรง · สติกเกอร์ · SFX · เพลง · หมุด)
//               ประกอบจาก fx.patch / ensureAsset / tlToClip / setFocus ของ store — store ไม่มี
//               ตัวเพิ่มพวกนี้ (v1 อยู่ใน page.tsx) จึงสร้างไว้ที่นี่ที่เดียว แผงไหนก็หยิบไป
//   catalog     รายการตัวอย่างฝั่งหน้าเว็บที่ต้องส่งให้ AI review (สำเนาจาก ReviewPage —
//               ตัวนั้นไม่ได้ export)

import { useCallback, useMemo, type ReactNode } from "react";
import TopBar from "@/components/frames/TopBar";
import EditFrame from "@/components/frames/EditFrame";
import { Btn, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import type { FxJourney, FxOverlay, FxShape, FxTextItem, JourneyStop, MusicTrack, ReviewCatalog } from "@/lib/api";
import { BGM_LIST, bgmUrl } from "@/lib/bgm";
import { MAX_AUDIO_STACK, MAX_STACK, overlapCount, tlToClip } from "@/lib/layers";
import { lookOf, nameFromText, uniqueName } from "@/lib/presets";
import { SFX_LIST, sfxUrl } from "@/lib/sfx";
import { STICKER_LIST, stickerUrl, type StickerDef } from "@/lib/stickers";
import { resolveLook } from "@/lib/textfx";
import Player from "@/components/step3/Player";
import { layerRows } from "@/components/step3/layers";
import { useStudio } from "@/components/step3/store";
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

// ─────────────────────────── โครงหน้า ───────────────────────────

export interface ShellProps {
  id: Edit3;
  /** ป้ายโมโนซ้ายบน เช่น "EDIT SUB · 12 LINES" (variant id เติมให้เอง) */
  badge: string;
  tag: string;
  title: string;
  /** ป้ายปุ่มขวาบน — ค่าตั้งต้น "↻ ทำขั้น ⑤ ใหม่ · ~N s" */
  cta?: string;
  /** งานที่ปุ่มขวาบนสั่ง — ซับใช้ build_text ที่เหลือ build_fx */
  buildStep?: "build_fx" | "build_text";
  /** ทิ้ง draft ของแผงนี้ (ปุ่ม ทิ้ง) */
  revert?: () => void;
  leftNote?: ReactNode;
  leftExtra?: ReactNode;
  topleft?: ReactNode;
  /** แถวเลนใต้ transport แทนของ Player (เช่น เลนที่มีเส้นบีต) */
  lanes?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

export function EditShell({ id, badge, tag, title, cta, buildStep = "build_fx", revert, leftNote, leftExtra, topleft, lanes, right, children }: ShellProps) {
  const eng = useEngine();
  const r = useRoute();
  const s = useStudio();
  const running = Boolean(eng.job?.running);
  const rows = useMemo(() => layerRows(s), [s]);
  const rb = s.rebuild;
  const modN = (s.dirty ? 1 : 0) + (s.fx.dirty ? 1 : 0) + (s.cap.dirty ? 1 : 0);
  const saving = s.saving || s.fx.saving || s.cap.saving;
  const isText = buildStep === "build_text";
  const eta = isText ? rb.eta.text : rb.eta.fx;
  const label = cta ?? (isText ? `↻ เผาซับ · build_text ④ · ~${eta} s` : `↻ ทำขั้น ⑤ ใหม่ · ~${eta} s`);

  // draft ลงไฟล์ก่อนสั่งงานเสมอ — ไม่งั้นเอนจินสร้างจากของเก่าแล้วคนเข้าใจว่าที่แก้ไม่มีผล
  const run = async () => {
    if (running) return;
    if (modN) await s.saveAll();
    await eng.runJob(buildStep);
  };

  return (
    <>
      <TopBar
        left={
          <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", whiteSpace: "nowrap" }}>
            {s.variant.id} · {badge}
            {modN > 0 && ` · MOD ${modN}`}
          </Well>
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {modN > 0 && (
              <>
                <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", whiteSpace: "nowrap" }} title="ไฟล์ที่แก้ค้าง — Cmd+S บันทึกทั้งหมด">
                  MOD {modN} · UNSAVED
                </Well>
                {revert && (
                  <Btn sm onClick={revert} disabled={saving} title="ทิ้งที่แก้ในแผงนี้ กลับไปใช้ที่บันทึกไว้">
                    ทิ้ง
                  </Btn>
                )}
                <Btn sm onClick={() => s.saveAll()} disabled={saving} title="บันทึกทุก draft ที่ค้าง (Cmd+S)">
                  บันทึก
                </Btn>
              </>
            )}
            <Btn on onClick={run} disabled={running || saving || !s.shots.length} title={running ? "เอนจินกำลังทำงานอื่นอยู่" : `บันทึก draft แล้วสั่ง ${buildStep}`}>
              {label}
            </Btn>
          </div>
        }
      />
      <EditFrame
        variantId={s.variant.id}
        variantLabel={s.variant.label}
        variantMeta={`${s.total.toFixed(1)} s · ${s.shots.length} SHOTS`}
        layers={rows}
        active={id}
        onPick={(l) => r.openEdit(l)}
        leftNote={leftNote}
        leftExtra={leftExtra}
        rebuild={[
          isText
            ? { label: "④ TEXT REBUILD", value: rb.text ? `~${rb.eta.text} s` : "READY", warn: rb.text }
            : { label: "⑤ FX REBUILD", value: rb.fx ? `~${rb.eta.fx} s` : "READY", warn: rb.fx },
          { label: "③ RENDER", value: rb.edl ? `~${rb.eta.edl} s` : "CACHE", warn: rb.edl },
        ]}
        onBack={() => r.openEdit(null)}
        center={
          <>
            <Player mode="timeline" topleft={topleft} showLanes={lanes === undefined} />
            {lanes !== undefined && <div style={{ padding: "4px 14px 12px 14px" }}>{lanes}</div>}
          </>
        }
        tag={tag}
        title={title}
        right={right}
      >
        {children}
      </EditFrame>
    </>
  );
}

/** ตารางลูกบิด n ช่องเท่ากัน (mockup: grid repeat(4,1fr) gap 8) */
export function KnobGrid({ cols = 4, children }: { cols?: number; children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 8 }}>{children}</div>;
}

/** แถว TAG + ของ (mockup: display flex gap 10 align center) */
export function TagRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
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
        flash(`เปลี่ยน TR 1 เป็น ${trackLabel(file)}`);
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

  return { playhead, addTextAt, addSpeechText, makePresetFrom, addShapeAt, addStickerAt, addStickerSampleAt, addSfxAt, addBgmAt, addStopAt, r3, clamp01 };
}
