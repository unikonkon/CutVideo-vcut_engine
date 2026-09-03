"use client";

// สตูดิโอของขั้น ③ — state ที่หน้าเลือกแบบ · ไทม์ไลน์ · แผงแก้รายชั้น · AI review
// ใช้ร่วมกันทั้งหมด (port จาก vcut-ui/app/page.tsx Editor)
//
//   EDL     shots (draft) ⇄ proj.timeline · บันทึกด้วย api.saveEdl
//   fx      draft ของ fx.json (เพลง · ข้อความ · สติกเกอร์ · รูปทรง · รายช็อต · แผนที่)
//   cap     draft ของ captions.json (ซับขั้น ④)
//   ประวัติ ย้อน/ทำซ้ำก้อนเดียวครอบทั้งสามอย่าง — แก้อะไรก็ Cmd+Z ได้เหมือนกัน
//   ตัวเล่น <video> ตัวเดียวของทั้งขั้น: เล่นไฟล์ที่ส่งออกแล้ว (final) · สตรีมสดตาม
//           ลำดับที่จัดอยู่ (timeline) · หรือคลิปดิบ (clip) — Player บอกว่าจะเล่นอะไร
//
// แผงแก้รายชั้น (components/step3/edit) เขียนทับ interface `Studio` นี้ — ชื่อช่อง
// ห้ามเปลี่ยนโดยไม่แจ้ง

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  api,
  api2,
  api3,
  clipUrl,
  fileToBase64,
  liveUrl,
  outUrl,
  segUrl,
  type BeatData,
  type CaptionCue,
  type CaptionsData,
  type FxClip,
  type FxData,
  type FxOverlay,
  type FxShape,
  type FxTextItem,
  type InfoData,
  type OutKind,
  type PlanData,
  type ReviewData,
  type ReviewOp,
  type SetupData,
  type Shot,
  type TranscriptData,
} from "@/lib/api";
import { useEngine, useLoader, type Variant } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import {
  captionBlocks,
  musicBlocks,
  shapeBlocks,
  speechBlocks,
  stickerBlocks,
  textBlocks,
  tlToClip,
  type LayerBlock,
  type LayerKind,
} from "@/lib/layers";
import { resolveLook } from "@/lib/textfx";
import { BGM_LIST, bgmUrl } from "@/lib/bgm";
import { sfxUrl } from "@/lib/sfx";
import { STICKER_LIST, stickerUrl } from "@/lib/stickers";
import type { CapDraft, CapStore, FxDraft, FxStore, SpeechLine } from "./types";

// ─────────────────────────── ชนิดที่แผงแก้ใช้ ───────────────────────────

/** สิ่งที่ตัวเล่นกำลังเล่น — Player เป็นคนตั้ง store เป็นคนเล่น */
export type PlayerSource =
  | { mode: "timeline" }
  | { mode: "final"; out: OutKind }
  | { mode: "clip"; name: string; at?: number };

/** ของที่จอตัวอย่างต้องวาดทับวิดีโอ — ตัวเลขชุดเดียวกับที่ ffmpeg จะเผาตอน render */
export interface OverlayData {
  texts: { item: FxTextItem; tl: number; idx: number }[];
  stickers: { item: FxOverlay; tl: number; kind: string; idx: number }[];
  shapes: { item: FxShape; tl: number; idx: number }[];
  cues: CaptionCue[];
}

/** ขั้นไหนต้องทำใหม่ก่อนส่งออก + เวลาโดยประมาณ (วินาที) */
export interface Rebuild {
  /** ③ ต่อไฟล์ใหม่ — EDL แก้ค้าง หรือไฟล์ ③ ยังไม่มี/เก่ากว่า EDL */
  edl: boolean;
  /** ④ ซับ — captions แก้ค้าง หรือไฟล์ ④ เก่ากว่า ③ */
  text: boolean;
  /** ⑤ ทุกชั้น — fx แก้ค้าง หรือไฟล์ ⑤ เก่ากว่า ③ */
  fx: boolean;
  eta: { edl: number; text: number; fx: number };
}

export interface TrashedShot {
  shot: Shot;
  /** ลำดับเดิมตอนเอาออก — กู้แล้วพยายามวางที่เดิม */
  at: number;
}

export interface Focus {
  kind: LayerKind;
  idx: number;
}

export interface Studio {
  variant: Variant;

  // ── EDL (draft ของ edl.json) ──
  shots: Shot[];
  setShots: (s: Shot[]) => void;
  offsets: number[];
  total: number;
  /** ช็อตที่มีไฟล์ตัดแล้ว (เล่นสดได้) */
  rendered: { seg: string; i: number; dur: number }[];
  dirty: boolean;
  saving: boolean;
  saveEdl: () => Promise<void>;
  /** ทิ้ง draft กลับไปใช้ proj.timeline */
  revertEdl: () => void;
  /** ย้อนไฟล์ edl.json ที่เอนจิน (edl.prev.json) แล้วโหลดใหม่ */
  undoEdl: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** แก้ไทม์ไลน์ผ่านตัวนี้เสมอ — บันทึกจุดย้อนกลับให้ */
  mutate: (fn: (prev: Shot[]) => Shot[]) => void;
  patchShot: (i: number, patch: Partial<Shot>) => void;
  removeShot: (i: number) => void;
  reorder: (from: number, to: number) => void;
  duplicate: (i: number) => void;
  /** ซอยช็อตตรงหัวเล่นเป็นสองชิ้น — false ถ้าหัวเล่นชิดขอบเกินไป */
  split: () => boolean;
  trash: TrashedShot[];
  restoreTrash: (k: number) => void;
  sel: number | null;
  setSel: (i: number | null) => void;

  // ── ตัวเล่น ──
  playhead: number;
  setPlayhead: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  /** เลื่อนหัวเล่น (หน่วงต่อสาย 200 ms — ลากไม้บรรทัดรัว ๆ ได้) */
  seek: (t: number) => void;
  /** เล่นจากวินาทีนั้นทันที */
  play: (t: number) => void;
  toggle: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** ใส่ที่ ref ของ <video> — Player ใช้ตัวนี้ ไม่ใช่ videoRef ตรง ๆ */
  bindVideo: (el: HTMLVideoElement | null) => void;
  source: PlayerSource;
  setSource: (s: PlayerSource) => void;
  /** ความยาวของไฟล์ที่ตัวเล่นถืออยู่ (วินาที) — 0 = ยังไม่รู้ · ใช้เป็น total ในโหมด final/clip */
  mediaDuration: number;

  // ── ชั้นแต่งหนัง ──
  fx: FxStore;
  cap: CapStore;
  transcript: TranscriptData | null;
  speechLines: SpeechLine[];
  focus: Focus | null;
  setFocus: (f: Focus | null) => void;
  /** บล็อกทุกเลนบนไทม์ไลน์ คิดจาก draft + EDL ปัจจุบัน */
  layers: Record<LayerKind, LayerBlock[]>;
  overlay: OverlayData;
  previewCues: CaptionCue[];
  patchTextAt: (idx: number, p: Partial<FxTextItem>) => void;
  patchOverlayAt: (idx: number, p: Partial<FxOverlay>) => void;
  patchShapeAt: (idx: number, p: Partial<FxShape>) => void;
  removeLayerItem: (kind: LayerKind, idx: number) => void;
  /** ยกไฟล์ตัวอย่างของหน้าเว็บ (public/…) เข้าคลังของโปรเจกต์ — คืนชื่อจริงในคลัง */
  ensureAsset: (file: string, url: string, want: "media" | "audio") => Promise<string>;

  // ── เอฟเฟกต์รายช็อต ──
  /** กุญแจ fx.clips ของแต่ละช็อต (จากเอนจิน) · null = ยังไม่ได้ตัดชิ้น */
  fxKeys: (string | null)[];
  fxOfShot: (i: number) => FxClip | null;
  setShotFx: (i: number, patch: Partial<FxClip>) => void;
  playheadFx: FxClip | null;
  playheadAt: { p: number; dur: number; i: number } | null;

  // ── จังหวะเพลง ──
  beats: BeatData | null;
  beatBusy: boolean;
  loadBeats: (force?: boolean) => Promise<BeatData | null>;
  showBeats: boolean;
  setShowBeats: (v: boolean) => void;
  snapToBeats: () => Promise<void>;

  // ── ค่าตั้ง/ข้อมูลเครื่อง ──
  setup: SetupData | null;
  info: InfoData | null;
  plan: PlanData | null;
  /** ขนาดหนัง (video.width/height) · fps · ความดังรวม */
  frame: { w: number; h: number };
  fps: number;
  lufs: number;
  /** ไฟล์ที่ส่งออกแล้วมีขั้นไหนบ้าง */
  outs: { kind: OutKind; exists: boolean; size: number; mtime: number; path: string }[];
  rebuild: Rebuild;

  // ── AI review ──
  review: ReviewData | null;
  reloadReview: () => void;
  /** รับข้อเสนอ — แก้ draft (EDL/fx) ให้ ยังไม่บันทึก */
  applyOps: (ops: ReviewOp[]) => Promise<{ done: number[]; failed: string[] }>;

  /** Cmd+S — บันทึกทุก draft ที่ค้าง */
  saveAll: () => Promise<void>;
  flash: (msg: string) => void;
}

const Ctx = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStudio ต้องอยู่ใต้ <StudioProvider>");
  return v;
}

// ─────────────────────────── ตัวช่วย ───────────────────────────

/** ก๊อปเอฟเฟกต์รายชิ้นทั้งกองแบบตื้นสองชั้น — draft ต้องไม่ใช้ object เดียวกับ
 *  ที่โหลดมา ไม่งั้นแก้ค่าแล้ว "ของเดิม" เปลี่ยนตาม แล้วปุ่มย้อนกลับคืนอะไรไม่ได้ */
function cloneClips(src: Record<string, FxClip> | undefined) {
  const out: Record<string, FxClip> = {};
  for (const [k, v] of Object.entries(src ?? {})) out[k] = { ...v };
  return out;
}

function draftOf(d: FxData): FxDraft {
  return {
    music: d.fx.music.map((m) => ({ ...m })),
    texts: d.fx.texts.map((t) => ({ ...t })),
    presets: (d.fx.presets ?? []).map((x) => ({ ...x })),
    overlays: d.fx.overlays.map((o) => ({ ...o })),
    journey: JSON.parse(JSON.stringify(d.fx.journey)),
    auto_sub: {
      enabled: Boolean((d.fx.auto_sub as { enabled?: boolean } | undefined)?.enabled),
    },
    clips: cloneClips(d.fx.clips),
    shapes: (d.fx.shapes ?? []).map((sh) => ({ ...sh })),
  };
}

function capDraftOf(d: CaptionsData): CapDraft {
  return {
    style: { ...d.style },
    enabled: d.auto.enabled,
    drop: [...d.auto.drop],
    edits: { ...d.auto.edits },
  };
}

/** ข้อความไทยประจำรหัสผิดพลาดของ <video> (MediaError.code) */
const MEDIA_ERR: Record<number, string> = {
  1: "หยุดโหลดวิดีโอกลางคัน",
  2: "สายขาดระหว่างโหลดวิดีโอ — เอนจินยังทำงานอยู่หรือเปล่า",
  3: "ไฟล์วิดีโอเสียหรือถอดรหัสไม่ได้",
  4: "เบราว์เซอร์นี้เล่นแหล่งวิดีโอนี้ไม่ได้",
};
const ERR_SRC_NOT_SUPPORTED = 4;

/** เบราว์เซอร์ตระกูล WebKit — เล่นสตรีม chunked ของ /live/ ไม่ได้ (ไม่มี Range)
 *  จึงเริ่มที่โหมดเล่นทีละชิ้นเลย ไม่ต้องให้เห็นจอดำก่อนหนึ่งครั้ง */
function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

/** fps ใน config เป็นได้ทั้งเลขและเศษส่วน "60000/1001" */
function parseFps(v: unknown): number {
  if (typeof v === "number" && v > 0) return v;
  const s = String(v ?? "");
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** ค่าล่าสุดใน ref — ให้ตัวจับ event/ตัวจับเวลาอ่านได้โดยไม่ต้องผูก deps */
function useLatest<T>(v: T) {
  const r = useRef(v);
  useEffect(() => {
    r.current = v;
  });
  return r;
}

const OUT_OF_STEP: Record<string, OutKind> = { assemble: "out", caption: "text", fx: "fx" };

// ─────────────────────────── provider ───────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const eng = useEngine();
  const r = useRoute();
  const flash = eng.flash;
  const proj = eng.proj;

  const variant = useMemo<Variant>(
    () =>
      eng.variants.find((v) => v.id === r.variant) ??
      eng.variants[0] ?? {
        id: r.variant,
        label: "—",
        note: "",
        dur: 0,
        shots: 0,
        ready: false,
        stale: false,
        best: "out",
      },
    [eng.variants, r.variant],
  );

  // ── EDL draft ──
  const [shots, setShots] = useState<Shot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [trash, setTrash] = useState<TrashedShot[]>([]);

  // ── fx / cap drafts ──
  const [fxData, setFxData] = useState<FxData | null>(null);
  const [fxDraft, setFxDraft] = useState<FxDraft | null>(null);
  const [fxDirty, setFxDirty] = useState(false);
  const [fxSaving, setFxSaving] = useState(false);
  const [capData, setCapData] = useState<CaptionsData | null>(null);
  const [capDraft, setCapDraft] = useState<CapDraft | null>(null);
  const [capDirty, setCapDirty] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);

  // ── ประวัติย้อนกลับ/ทำซ้ำ — ครอบ EDL · fx · ซับ ในก้อนเดียว ──
  interface Snap {
    shots: Shot[];
    dirty: boolean;
    fx: FxDraft | null;
    fxDirty: boolean;
    cap: CapDraft | null;
    capDirty: boolean;
  }
  const undoStack = useRef<Snap[]>([]);
  const redoStack = useRef<Snap[]>([]);
  const lastPush = useRef(0);
  // ปุ่มย้อน/ทำซ้ำอ่านจาก state ไม่ใช่จาก ref ระหว่าง render
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const stateRef = useLatest<Snap>({ shots, dirty, fx: fxDraft, fxDirty, cap: capDraft, capDirty });

  const syncHist = useCallback(() => {
    setHist({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const pushHistory = useCallback(() => {
    const now = Date.now();
    // การพิมพ์/ลากรัว ๆ ภายใน 0.8 วิ นับเป็นก้าวเดียว — จุดย้อนคือก่อนก้าวแรก
    if (now - lastPush.current < 800) return;
    lastPush.current = now;
    undoStack.current.push({ ...stateRef.current });
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    syncHist();
  }, [stateRef, syncHist]);

  const applySnap = useCallback((s: Snap) => {
    setShots(s.shots);
    setDirty(s.dirty);
    setFxDraft(s.fx);
    setFxDirty(s.fxDirty);
    setCapDraft(s.cap);
    setCapDirty(s.capDirty);
  }, []);

  const undo = useCallback(() => {
    const s = undoStack.current.pop();
    if (!s) return;
    redoStack.current.push({ ...stateRef.current });
    lastPush.current = 0;
    applySnap(s);
    syncHist();
  }, [applySnap, stateRef, syncHist]);

  const redo = useCallback(() => {
    const s = redoStack.current.pop();
    if (!s) return;
    undoStack.current.push({ ...stateRef.current });
    lastPush.current = 0;
    applySnap(s);
    syncHist();
  }, [applySnap, stateRef, syncHist]);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastPush.current = 0;
    syncHist();
  }, [syncHist]);

  // ── ตัวเล่น ──
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [source, setSource] = useState<PlayerSource>({ mode: "timeline" });
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [mediaDuration, setMediaDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bindVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
    if (!el) setPlaying(false);
  }, []);
  const sourceRef = useLatest(source);
  const playingRef = useLatest(playing);
  const playheadRef = useLatest(playhead);
  // at = สายที่เปิดอยู่ตั้งต้นเข้าไปในชิ้นแรกกี่วินาที · keyint = ระยะคีย์เฟรม
  const streamRef = useRef({ token: "", key: "", from: 0, at: 0, keyint: 1.001 });
  // วิธีเล่นไทม์ไลน์ — live (สายเดียวจาก /live/) หรือ segments (ทีละชิ้น ทุกเบราว์เซอร์)
  const playModeRef = useRef<"live" | "segments">("live");
  const segRef = useRef(0);
  const loadSeq = useRef(0);
  const prefetchRef = useRef<HTMLVideoElement | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── จังหวะ ──
  const [beats, setBeats] = useState<BeatData | null>(null);
  const [beatBusy, setBeatBusy] = useState(false);
  const [showBeats, setShowBeats] = useState(false);

  // ── ข้อมูลประกอบ (โหลดใหม่เมื่องานเอนจินจบ) ──
  const setupL = useLoader(() => api2.setup(), eng.reloadKey);
  const infoL = useLoader(() => api3.info(), eng.reloadKey);
  const planL = useLoader(() => api3.plan(), eng.reloadKey);
  const trL = useLoader(() => api2.transcript(), eng.reloadKey);
  const reviewL = useLoader(() => api2.review(), eng.reloadKey);

  // ── ตำแหน่งบนไทม์ไลน์ ──
  const offsets = useMemo(() => {
    const out: number[] = [];
    let t = 0;
    for (const s of shots) {
      out.push(t);
      t += s.dur;
    }
    return out;
  }, [shots]);
  const total = useMemo(() => shots.reduce((a, s) => a + s.dur, 0), [shots]);
  const rendered = useMemo(
    () =>
      shots
        .map((s, i) => ({ seg: s.seg as string, i, dur: s.dur }))
        .filter((x) => x.seg),
    [shots],
  );

  // ── ของบนจอถูกแทนด้วยของจากดิสก์ทุกครั้งที่ proj โหลดใหม่ ──
  const resetFromProj = useCallback(() => {
    if (!proj) return;
    setShots(proj.timeline);
    setDirty(false);
    setSel(null);
    clearHistory();
    streamRef.current.key = ""; // ลำดับอาจเปลี่ยน — ขอสตรีมใหม่รอบหน้า
  }, [proj, clearHistory]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetFromProj();
  }, [resetFromProj]);

  const loadFx = useCallback(async () => {
    try {
      const d = await api2.fx();
      setFxData(d);
      setFxDraft(draftOf(d));
      setFxDirty(false);
    } catch {
      setFxData(null);
    }
  }, []);

  const loadCaps = useCallback(async () => {
    try {
      const d = await api2.captions();
      setCapData(d);
      setCapDraft(capDraftOf(d));
      setCapDirty(false);
    } catch {
      setCapData(null);
      setCapDraft(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFx();
    loadCaps();
  }, [loadFx, loadCaps, eng.reloadKey]);

  const patchCap = useCallback(
    (part: Partial<CapDraft>) => {
      pushHistory();
      setCapDraft((d) => (d ? { ...d, ...part } : d));
      setCapDirty(true);
    },
    [pushHistory],
  );

  const saveCaps = useCallback(async () => {
    if (!capDraft || !capData) return;
    setCapSaving(true);
    try {
      const rr = await api2.saveCaptions({
        style: capDraft.style,
        auto: {
          enabled: capDraft.enabled,
          drop: capDraft.drop,
          edits: capDraft.edits,
          styles: capData.auto.styles,
        },
      });
      setCapData(rr.captions);
      setCapDraft(capDraftOf(rr.captions));
      setCapDirty(false);
      flash("บันทึก captions.json แล้ว — มีผลตอนสร้างไฟล์ ④");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกซับไม่สำเร็จ");
    } finally {
      setCapSaving(false);
    }
  }, [capDraft, capData, flash]);

  const patchFx = useCallback(
    (part: Partial<FxDraft>) => {
      pushHistory();
      setFxDraft((d) => (d ? { ...d, ...part } : d));
      setFxDirty(true);
    },
    [pushHistory],
  );

  const saveFx = useCallback(async () => {
    if (!fxDraft) return;
    setFxSaving(true);
    try {
      const rr = await api2.saveFx(fxDraft);
      setFxData(rr.fx);
      setFxDraft(draftOf(rr.fx));
      setFxDirty(false);
      flash("บันทึก fx.json แล้ว — มีผลตอนสร้างไฟล์ ⑤");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึก fx ไม่สำเร็จ");
    } finally {
      setFxSaving(false);
    }
  }, [fxDraft, flash]);

  // ── กุญแจเอฟเฟกต์ของแต่ละช็อต — จาก view.segments[].key ของเอนจิน ไม่ประกอบเอง ──
  const fxKeys = useMemo(() => {
    const byRange = new Map<string, string>();
    for (const seg of fxData?.view.segments ?? []) {
      byRange.set(`${seg.name}|${seg.start.toFixed(3)}|${seg.dur.toFixed(3)}`, seg.key);
    }
    return shots.map(
      (s) => byRange.get(`${s.name}|${s.start.toFixed(3)}|${s.dur.toFixed(3)}`) ?? null,
    );
  }, [shots, fxData]);

  /** เอฟเฟกต์ของช็อตลำดับนี้ — ค่าตั้งต้นทับด้วยที่ตั้งไว้เอง (เหมือน fx.for_seg) */
  const fxOfShot = useCallback(
    (i: number): FxClip | null => {
      const base = fxData?.defaults.clip;
      const key = fxKeys[i];
      if (!base || !key || !fxDraft) return null;
      return { ...base, ...(fxDraft.clips[key] ?? {}) };
    },
    [fxData, fxKeys, fxDraft],
  );

  /** ตั้งเอฟเฟกต์ให้ช็อตหนึ่ง — กลับไปเท่าค่าตั้งต้นทุกช่องแล้วลบกุญแจทิ้ง */
  const setShotFx = useCallback(
    (i: number, patch: Partial<FxClip>) => {
      const base = fxData?.defaults.clip;
      const key = fxKeys[i];
      const cur = fxOfShot(i);
      if (!base || !key || !cur || !fxDraft) return;
      const next = { ...cur, ...patch };
      const clips = { ...fxDraft.clips };
      const untouched = (Object.keys(base) as (keyof FxClip)[]).every((k) => next[k] === base[k]);
      if (untouched) delete clips[key];
      else clips[key] = next;
      patchFx({ clips });
    },
    [fxData, fxKeys, fxOfShot, fxDraft, patchFx],
  );

  const playheadAt = useMemo(() => {
    const i = shots.findIndex((s, k) => playhead < offsets[k] + s.dur);
    if (i < 0) return null;
    const d = shots[i].dur || 1;
    return { p: Math.min(1, Math.max(0, (playhead - offsets[i]) / d)), dur: d, i };
  }, [shots, offsets, playhead]);

  const playheadFx = useMemo(
    () => (playheadAt ? fxOfShot(playheadAt.i) : null),
    [playheadAt, fxOfShot],
  );

  // ── เล่นวิดีโอ ──

  /** เวลาบนไทม์ไลน์ → ชิ้นที่ต้องตั้งต้นสตรีม + วินาทีที่ต้องข้ามในชิ้นนั้น */
  const locate = useCallback(
    (tl: number) => {
      let k = shots.length - 1;
      for (let i = 0; i < shots.length; i++) {
        if (tl < offsets[i] + shots[i].dur) {
          k = i;
          break;
        }
      }
      let rIdx = rendered.findIndex((x) => x.i >= k);
      if (rIdx < 0) rIdx = 0;
      const delta = rendered[rIdx].i === k ? Math.max(0, tl - offsets[k]) : 0;
      return { rIdx, delta };
    },
    [shots, offsets, rendered],
  );

  /** ตัวเล่นอยู่วินาทีไหนของไทม์ไลน์ (หรือของไฟล์ ในโหมด final/clip) */
  const elapsed = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.src) return null;
    if (sourceRef.current.mode !== "timeline") return v.currentTime;
    if (!rendered.length) return null;
    if (playModeRef.current === "segments") {
      const x = rendered[segRef.current];
      return x ? Math.min(offsets[x.i] + v.currentTime, total) : null;
    }
    let t = v.currentTime + streamRef.current.at;
    for (let j = streamRef.current.from; j < rendered.length; j++) {
      if (t < rendered[j].dur || j === rendered.length - 1) {
        return Math.min(offsets[rendered[j].i] + t, total);
      }
      t -= rendered[j].dur;
    }
    return null;
  }, [rendered, offsets, total, sourceRef]);

  /** อุ่นชิ้นถัดไปไว้ในแคชของเบราว์เซอร์ระหว่างที่ชิ้นปัจจุบันยังเล่นอยู่ */
  const prefetchNext = useCallback(
    (rIdx: number) => {
      const nxt = rendered[rIdx + 1];
      if (!nxt) return;
      let el = prefetchRef.current;
      if (!el) {
        el = document.createElement("video");
        el.preload = "auto";
        el.muted = true;
        prefetchRef.current = el;
      }
      if (!el.src.endsWith(`/seg/${nxt.seg}`)) el.src = segUrl(nxt.seg);
    },
    [rendered],
  );

  /** โหลด url (ถ้ายังไม่ใช่ตัวเดิม) แล้วพาไปวินาที at — คำสั่งที่ตกรอบเงียบไป */
  const loadAndSeek = useCallback(
    (v: HTMLVideoElement, url: string, at: number, autoplay: boolean, after?: () => void) => {
      const mine = ++loadSeq.current;
      const begin = () => {
        if (loadSeq.current !== mine) return;
        if (at > 0.01 || v.currentTime > 0.01) {
          try {
            v.currentTime = at;
          } catch {
            /* ยังไม่พร้อมให้ขยับ — ปล่อยเล่นจากหัว ดีกว่าค้าง */
          }
        }
        if (autoplay) {
          v.play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
        }
        after?.();
      };
      if (v.src.endsWith(url) && v.readyState >= 1) {
        begin();
        return;
      }
      const onMeta = () => {
        v.removeEventListener("loadedmetadata", onMeta);
        begin();
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.src = url;
      v.load();
    },
    [],
  );

  /** เล่นชิ้นที่ rIdx ของ rendered โดยเริ่มที่วินาที at ในชิ้นนั้น (โหมดทีละชิ้น) */
  const playSegment = useCallback(
    (rIdx: number, at: number, autoplay: boolean) => {
      const v = videoRef.current;
      const x = rendered[rIdx];
      if (!v || !x) return;
      segRef.current = rIdx;
      // กันไปยืนที่ปลายชิ้นพอดีแล้ว ended ยิงทันทีจนวิ่งรวดไปท้ายเรื่อง
      const start = Math.max(0, Math.min(at, Math.max(0, x.dur - 0.05)));
      setPlayhead(Math.min(offsets[x.i] + start, total));
      loadAndSeek(v, segUrl(x.seg), start, autoplay, () => prefetchNext(rIdx));
    },
    [rendered, offsets, total, loadAndSeek, prefetchNext],
  );

  /** พาตัวเล่นไปยืนที่เวลานั้นจริง ๆ — autoplay=false = โชว์เฟรมค้างไว้ */
  const goTo = useCallback(
    async (tl: number, autoplay: boolean) => {
      const v = videoRef.current;
      if (!v) return;
      const src = sourceRef.current;
      if (src.mode === "final") {
        setPlayhead(tl);
        loadAndSeek(v, outUrl(src.out), tl, autoplay);
        return;
      }
      if (src.mode === "clip") {
        setPlayhead(tl);
        loadAndSeek(v, clipUrl(src.name), tl, autoplay);
        return;
      }
      if (!rendered.length) {
        if (autoplay) flash("ยังไม่มีชิ้นที่ตัดแล้ว — ต่อไฟล์ (build) ก่อนถึงจะเล่นสดได้");
        return;
      }
      const { rIdx, delta } = locate(tl);
      if (playModeRef.current === "segments") {
        playSegment(rIdx, delta, autoplay);
        return;
      }
      try {
        const key = rendered.map((x) => x.seg).join("|");
        if (streamRef.current.key !== key) {
          const got = await api.live(rendered.map((x) => x.seg));
          streamRef.current.token = got.token;
          streamRef.current.key = key;
          if (got.keyint > 0) streamRef.current.keyint = got.keyint;
        }
        // ภาพถูก copy ไม่ได้เข้ารหัสใหม่ ffmpeg จึงเริ่มได้เฉพาะที่คีย์เฟรม — ปัดลง
        // ให้ตรงกริดเอง จะได้รู้แน่ว่าสายใหม่เริ่มวินาทีไหน
        const k = streamRef.current.keyint;
        const at = k > 0 ? Math.max(0, Math.floor(delta / k + 1e-6) * k) : 0;
        streamRef.current.from = rIdx;
        streamRef.current.at = at;
        loadSeq.current++;
        v.src = liveUrl(streamRef.current.token, rIdx, at);
        setPlayhead(Math.min(offsets[rendered[rIdx].i] + at, total));
        if (autoplay) {
          await v.play();
          setPlaying(true);
        }
      } catch (e) {
        flash(e instanceof Error ? e.message : "เล่นไม่ได้");
      }
    },
    [rendered, locate, offsets, total, flash, playSegment, loadAndSeek, sourceRef],
  );
  const goToRef = useLatest(goTo);

  const play = useCallback((t: number) => goTo(t, true), [goTo]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (seekTimer.current) clearTimeout(seekTimer.current);
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    // เล่นต่อจากที่ค้างไว้ได้เฉพาะตอนตัวเล่น "ยืนตรงเส้นหัวเล่น" อยู่แล้ว
    const at = elapsed();
    if (at != null && Math.abs(at - playhead) < 0.35) {
      v.play()
        .then(() => setPlaying(true))
        .catch(() => play(playhead));
    } else {
      play(playhead);
    }
  }, [playing, playhead, play, elapsed]);

  const seek = useCallback(
    (t: number) => {
      setPlayhead(t);
      if (seekTimer.current) clearTimeout(seekTimer.current);
      seekTimer.current = setTimeout(() => goToRef.current(t, playingRef.current), 200);
    },
    [goToRef, playingRef],
  );

  // หัวเล่นวิ่งตามวิดีโอ
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const at = elapsed();
      if (at != null) setPlayhead(at);
      const v = videoRef.current;
      const segMode = sourceRef.current.mode === "timeline" && playModeRef.current === "segments";
      // โหมดทีละชิ้น: ปลายชิ้นไม่ใช่ปลายเรื่อง — ตัวจับ "ended" พาไปชิ้นถัดไปเอง
      if (v?.ended && !segMode) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, elapsed, sourceRef]);

  // WebKit เล่นสตรีมสดไม่ได้ — เริ่มที่โหมดทีละชิ้นเลย · ปล่อยสาย prefetch ตอนถอด
  useEffect(() => {
    if (isWebKit()) playModeRef.current = "segments";
    return () => {
      const el = prefetchRef.current;
      if (el) {
        el.removeAttribute("src");
        el.load();
        prefetchRef.current = null;
      }
    };
  }, []);

  // ตัวจับ error / ended ของ <video> — ผูกใหม่ทุกครั้งที่ตัว element เปลี่ยน
  // (Player ถูกถอด/ใส่ใหม่เมื่อสลับหน้าใน ③)
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const onError = () => {
      const code = v.error?.code ?? 0;
      // สตรีมสดเล่นไม่ได้ = เบราว์เซอร์นี้ไม่รับ chunked ที่ไม่มี Range → ถอยไปทีละชิ้น
      if (
        sourceRef.current.mode === "timeline" &&
        playModeRef.current === "live" &&
        code === ERR_SRC_NOT_SUPPORTED &&
        rendered.length
      ) {
        playModeRef.current = "segments";
        flash("เบราว์เซอร์นี้เล่นสตรีมต่อเนื่องไม่ได้ — สลับไปโหมดเล่นทีละชิ้นให้แล้ว");
        const { rIdx, delta } = locate(playheadRef.current);
        playSegment(rIdx, delta, playingRef.current);
        return;
      }
      setPlaying(false);
      if (sourceRef.current.mode === "final") {
        flash("ยังไม่มีไฟล์ของขั้นนี้ — กดส่งออกก่อน");
        return;
      }
      flash(MEDIA_ERR[code] ?? "เล่นวิดีโอไม่ได้");
    };
    const onEnded = () => {
      if (sourceRef.current.mode !== "timeline" || playModeRef.current !== "segments") {
        setPlaying(false);
        return;
      }
      const next = segRef.current + 1;
      if (next >= rendered.length) {
        setPlaying(false);
        setPlayhead(total);
        return;
      }
      playSegment(next, 0, playingRef.current);
    };
    const onDur = () => setMediaDuration(Number.isFinite(v.duration) ? v.duration : 0);
    v.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("emptied", onDur);
    return () => {
      v.removeEventListener("error", onError);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("emptied", onDur);
    };
  }, [videoEl, rendered, total, locate, playSegment, flash, sourceRef, playingRef, playheadRef]);

  // แหล่งเล่นเปลี่ยน (หรือ <video> ตัวใหม่) → หยุดแล้วพาไปยืนที่หัวเล่นในแหล่งใหม่
  useEffect(() => {
    if (!videoEl) return;
    videoEl.pause();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(false);
    const at = source.mode === "clip" ? (source.at ?? 0) : playheadRef.current;
    goToRef.current(at, false);
  }, [source, videoEl, goToRef, playheadRef]);

  // ความเร็ว/เสียงรายชิ้นสั่งที่ตัวเล่น ไม่ใช่แค่ทาสีทับ — playbackRate เปลี่ยนแค่ว่าเวลา
  // ในสื่อเดินเร็วแค่ไหน currentTime ยังนับเป็นวินาทีของสื่อ หัวเล่นจึงยังตรงกับไทม์ไลน์
  // ตัวเล่นรับ 0.0625–16 เท่านั้น · เกิน 0 dB ทำไม่ได้ (เพดาน 1.0) — ได้แค่ "ไม่ดังขึ้น"
  const fxSpeed = playheadFx?.speed ?? 1;
  const fxMute = Boolean(playheadFx?.mute);
  const fxVol = playheadFx?.vol_db ?? 0;
  useEffect(() => {
    // แตะผ่าน ref (ตัวเดียวกับ videoEl) — state ถือว่าแก้ไม่ได้ แต่ DOM ที่ ref ชี้แก้ได้
    const v = videoRef.current;
    if (!videoEl || !v) return;
    v.playbackRate = Math.min(16, Math.max(0.0625, fxSpeed));
    v.muted = fxMute;
    v.volume = Math.min(1, Math.pow(10, Math.min(0, fxVol) / 20));
  }, [videoEl, fxSpeed, fxMute, fxVol]);

  // ── แก้ไทม์ไลน์ (ยังไม่เขียนลงดิสก์จนกด SAVE EDL) ──
  const mutate = useCallback(
    (fn: (prev: Shot[]) => Shot[]) => {
      pushHistory();
      setShots((prev) => fn(prev));
      setDirty(true);
      streamRef.current.key = "";
    },
    [pushHistory],
  );

  const patchShot = useCallback(
    (i: number, patch: Partial<Shot>) => {
      mutate((prev) =>
        prev.map((s, k) => {
          if (k !== i) return s;
          const next = { ...s, ...patch };
          next.dur = Math.round((next.end - next.start) * 1000) / 1000;
          // ขยับขอบแล้วไฟล์ segment เดิมไม่ตรงอีกต่อไป — ต้องตัดใหม่
          if (patch.start !== undefined || patch.end !== undefined) {
            if (next.start !== s.start || next.end !== s.end) next.seg = null;
          }
          return next;
        }),
      );
    },
    [mutate],
  );

  const removeShot = useCallback(
    (i: number) => {
      const s = shots[i];
      if (!s) return;
      mutate((prev) => prev.filter((_, k) => k !== i));
      setTrash((t) => [{ shot: s, at: i }, ...t]);
      setSel((x) => (x == null ? null : x === i ? null : x > i ? x - 1 : x));
    },
    [shots, mutate],
  );

  const restoreTrash = useCallback(
    (k: number) => {
      const it = trash[k];
      if (!it) return;
      mutate((prev) => {
        const at = Math.min(it.at, prev.length);
        return [...prev.slice(0, at), { ...it.shot }, ...prev.slice(at)];
      });
      setTrash((t) => t.filter((_, j) => j !== k));
      setSel(Math.min(it.at, shots.length));
    },
    [trash, mutate, shots.length],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      mutate((prev) => {
        const next = [...prev];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        return next;
      });
      setSel(to);
    },
    [mutate],
  );

  const duplicate = useCallback(
    (i: number) => {
      mutate((prev) => {
        const next = [...prev];
        next.splice(i + 1, 0, { ...prev[i] });
        return next;
      });
    },
    [mutate],
  );

  const split = useCallback(() => {
    let k = -1;
    for (let i = 0; i < shots.length; i++) {
      if (playhead > offsets[i] + 0.3 && playhead < offsets[i] + shots[i].dur - 0.3) {
        k = i;
        break;
      }
    }
    if (k < 0) {
      flash("เลื่อนหัวเล่นให้อยู่กลางช็อต (ห่างขอบเกิน 0.3 วิ) ก่อนตัด");
      return false;
    }
    const s = shots[k];
    const cut = Math.round((s.start + (playhead - offsets[k])) * 1000) / 1000;
    mutate((prev) => {
      const next = [...prev];
      next.splice(
        k,
        1,
        { ...s, end: cut, dur: Math.round((cut - s.start) * 1000) / 1000, seg: null },
        { ...s, start: cut, dur: Math.round((s.end - cut) * 1000) / 1000, seg: null },
      );
      return next;
    });
    setSel(k);
    return true;
  }, [shots, offsets, playhead, mutate, flash]);

  const saveEdl = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveEdl(shots.map((s) => ({ name: s.name, start: s.start, end: s.end, kind: s.kind })));
      await eng.refresh();
      flash("บันทึก edl.json แล้ว (ของเดิมสำรองไว้ที่ edl.prev.json)");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึก EDL ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [shots, eng, flash]);

  const revertEdl = useCallback(() => {
    resetFromProj();
    flash("ทิ้งการแก้ไทม์ไลน์ กลับไปใช้ที่บันทึกไว้");
  }, [resetFromProj, flash]);

  const undoEdl = useCallback(async () => {
    try {
      await api.undo();
      await eng.refresh();
      flash("ย้อน edl.json กลับไปรอบก่อนแล้ว");
    } catch (e) {
      flash(e instanceof Error ? e.message : "ย้อน EDL ไม่สำเร็จ");
    }
  }, [eng, flash]);

  // ── จังหวะเพลง ──
  const loadBeats = useCallback(
    async (force = false) => {
      setBeatBusy(true);
      try {
        const b = await api.beats(force);
        setBeats(b);
        setShowBeats(true);
        const noBpm = b.tracks.filter((t) => !t.bpm).length;
        flash(
          b.tracks.length === 0
            ? "ยังไม่มีเพลงในหนัง — วางเพลงก่อน"
            : `อ่านจังหวะแล้ว ${b.tracks.length} แทร็ก · ${b.grid.length} เส้น` +
                (noBpm ? ` · ${noBpm} แทร็กจับจังหวะไม่ได้ พิมพ์ BPM เองได้` : ""),
        );
        return b;
      } catch (e) {
        flash(e instanceof Error ? e.message : "อ่านจังหวะไม่สำเร็จ");
        return null;
      } finally {
        setBeatBusy(false);
      }
    },
    [flash],
  );

  /** ดูดรอยตัดทุกจุดเข้าหาจังหวะ — เอนจินคำนวณ หน้าเว็บแค่ทาบผลผ่าน mutate (ย้อนได้) */
  const snapToBeats = useCallback(async () => {
    if (!shots.length) return flash("ยังไม่มีช็อตในไทม์ไลน์");
    setBeatBusy(true);
    try {
      if (!beats) await loadBeats();
      const rr = await api.beatSnap(
        shots.map((s) => ({ kind: s.kind, start: s.start, end: s.end, clip_dur: s.clip_dur })),
      );
      if (!rr.beats) return flash("ยังไม่รู้จังหวะของเพลง — วางเพลงแล้วอ่านจังหวะก่อน");
      if (!rr.moved) return flash("รอยตัดตรงจังหวะอยู่แล้วทุกจุด — ไม่มีอะไรต้องแก้");
      const by = new Map(rr.shots.map((x) => [x.i, x]));
      mutate((prev) =>
        prev.map((sh, i) => {
          const x = by.get(i);
          if (!x || x.end === sh.end) return sh;
          return { ...sh, end: x.end, dur: Math.round((x.end - sh.start) * 1000) / 1000, seg: null };
        }),
      );
      flash(
        `ดูดเข้าจังหวะ ${rr.moved} รอย` +
          (rr.report.length ? ` · ข้าม ${rr.report.length} รอยที่เอื้อมไม่ถึง` : "") +
          ` — ต้อง render ใหม่ ${rr.moved} ชิ้น (ย้อนกลับได้)`,
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "ดูดรอยตัดไม่สำเร็จ");
    } finally {
      setBeatBusy(false);
    }
  }, [shots, beats, loadBeats, mutate, flash]);

  // ── เลเยอร์บนไทม์ไลน์ ──
  const layers = useMemo<Record<LayerKind, LayerBlock[]>>(
    () => ({
      text: fxDraft ? textBlocks(fxDraft.texts, shots, offsets) : [],
      sticker: fxDraft ? stickerBlocks(fxDraft.overlays, shots, offsets) : [],
      shape: fxDraft ? shapeBlocks(fxDraft.shapes, shots, offsets, fxData?.defaults.shape_kind) : [],
      music: fxDraft ? musicBlocks(fxDraft.music, total) : [],
      caption: capData ? captionBlocks(capData.cues) : [],
      speech: speechBlocks(trL.data, shots, offsets),
    }),
    [fxDraft, fxData, capData, trL.data, shots, offsets, total],
  );

  // ซับที่จะ "เห็นจริง" ตามที่แก้ค้างอยู่ — ปิดสวิตช์/ซ่อน cue/แก้คำ/เปลี่ยนสไตล์แล้ว
  // จอตัวอย่างเปลี่ยนทันทีโดยไม่ต้องกดบันทึกก่อน
  const previewCues = useMemo(() => {
    if (!capData) return [];
    if (!capDraft) return capData.cues;
    if (!capDraft.enabled) return [];
    const drop = new Set(capDraft.drop);
    const changed = Object.keys(capDraft.style).filter(
      (k) => capDraft.style[k] !== (capData.style as unknown as Record<string, unknown>)[k],
    );
    return capData.cues
      .filter((c) => !drop.has(c.id))
      .map((c) => ({
        ...c,
        text: capDraft.edits[c.id] ?? c.text,
        style: changed.length
          ? ({ ...c.style, ...Object.fromEntries(changed.map((k) => [k, capDraft.style[k]])) } as typeof c.style)
          : c.style,
      }));
  }, [capData, capDraft]);

  // บรรทัดบทพูดที่ตกอยู่ในไทม์ไลน์จริง — id สูตรเดียวกับ cue ของซับ (`<คลิป>#<ลำดับ>`)
  const speechLines = useMemo<SpeechLine[]>(() => {
    const tr = trL.data;
    if (!tr) return [];
    const out: SpeechLine[] = [];
    const seen = new Set<string>();
    shots.forEach((s, i) => {
      (tr.clips[s.name] ?? []).forEach(([a, b, text], k) => {
        const x = Math.max(a, s.start);
        const y = Math.min(b, s.end);
        if (y - x < 0.15 || !String(text).trim()) return;
        const id = `${s.name}#${k}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push({
          id,
          name: s.name,
          at: Math.round(x * 1000) / 1000,
          dur: Math.round((y - x) * 1000) / 1000,
          text: String(text).trim(),
          tl: offsets[i] + (x - s.start),
        });
      });
    });
    return out.sort((p, q) => p.tl - q.tl);
  }, [trL.data, shots, offsets]);

  // ชุดสไตล์ต้องถูกรวมตรงนี้ — จอตัวอย่างวาดจากร่างที่ยังไม่บันทึก ซึ่งเอนจินยังไม่เห็น
  const overlay = useMemo<OverlayData>(() => {
    if (!fxDraft) return { texts: [], stickers: [], shapes: [], cues: previewCues };
    const presets = fxDraft.presets;
    const presetKeys = (fxData?.defaults.preset_keys as string[] | undefined) ?? [];
    const kindOf = new Map((fxData?.overlay.assets ?? []).map((a) => [a.file, a.kind]));
    const extKind = (f: string) => (/\.(mov|webm|mp4|m4v)$/i.test(f) ? "video" : "image");
    return {
      texts: layers.text
        .filter((b) => !b.orphan)
        .map((b) => ({ item: resolveLook(fxDraft.texts[b.idx], presets, presetKeys), tl: b.tl, idx: b.idx })),
      stickers: layers.sticker
        .filter((b) => !b.orphan)
        .map((b) => {
          const it = fxDraft.overlays[b.idx];
          return { item: it, tl: b.tl, kind: kindOf.get(it.file) ?? extKind(it.file), idx: b.idx };
        }),
      shapes: layers.shape.filter((b) => !b.orphan).map((b) => ({ item: fxDraft.shapes[b.idx], tl: b.tl, idx: b.idx })),
      cues: previewCues,
    };
  }, [layers, fxDraft, fxData, previewCues]);

  const patchOverlayAt = useCallback(
    (idx: number, p: Partial<FxOverlay>) => {
      if (!fxDraft) return;
      patchFx({ overlays: fxDraft.overlays.map((o, k) => (k === idx ? { ...o, ...p } : o)) });
    },
    [fxDraft, patchFx],
  );
  const patchShapeAt = useCallback(
    (idx: number, p: Partial<FxShape>) => {
      if (!fxDraft) return;
      patchFx({ shapes: fxDraft.shapes.map((sh, k) => (k === idx ? { ...sh, ...p } : sh)) });
    },
    [fxDraft, patchFx],
  );
  const patchTextAt = useCallback(
    (idx: number, p: Partial<FxTextItem>) => {
      if (!fxDraft) return;
      patchFx({ texts: fxDraft.texts.map((t, k) => (k === idx ? { ...t, ...p } : t)) });
    },
    [fxDraft, patchFx],
  );
  const removeLayerItem = useCallback(
    (kind: LayerKind, idx: number) => {
      if (!fxDraft) return;
      if (kind === "music") patchFx({ music: fxDraft.music.filter((_, k) => k !== idx) });
      else if (kind === "text") patchFx({ texts: fxDraft.texts.filter((_, k) => k !== idx) });
      else if (kind === "sticker") patchFx({ overlays: fxDraft.overlays.filter((_, k) => k !== idx) });
      else if (kind === "shape") patchFx({ shapes: fxDraft.shapes.filter((_, k) => k !== idx) });
      setFocus(null);
    },
    [fxDraft, patchFx],
  );

  // ขยับทีละนิดด้วยลูกศร — ค่าที่เห็นบนจอกับใน fx.json เป็นก้อนเดียวกัน
  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!focus || !fxDraft) return false;
      const cur =
        focus.kind === "sticker"
          ? fxDraft.overlays[focus.idx]
          : focus.kind === "shape"
            ? fxDraft.shapes[focus.idx]
            : focus.kind === "text"
              ? fxDraft.texts[focus.idx]
              : null;
      if (!cur) return false;
      const nx = Math.round(Math.min(1, Math.max(0, cur.x + dx)) * 1000) / 1000;
      const ny = Math.round(Math.min(1, Math.max(0, cur.y + dy)) * 1000) / 1000;
      if (focus.kind === "sticker") patchOverlayAt(focus.idx, { x: nx, y: ny });
      else if (focus.kind === "shape") patchShapeAt(focus.idx, { x: nx, y: ny });
      else patchTextAt(focus.idx, { x: nx, y: ny });
      return true;
    },
    [focus, fxDraft, patchOverlayAt, patchShapeAt, patchTextAt],
  );

  // ไฟล์ตัวอย่างของหน้าเว็บ (public/…) เข้าคลังของโปรเจกต์ครั้งแรกที่ใช้ — เอนจินอ่าน
  // จากโฟลเดอร์ assets เท่านั้น · คืนชื่อจริง (เอนจินเปลี่ยนชื่อได้ตอนชนไฟล์เดิม)
  const ensureAsset = useCallback(
    async (file: string, url: string, want: "media" | "audio") => {
      const have =
        want === "audio"
          ? fxData?.music.tracks.includes(file)
          : fxData?.overlay.assets.some((a) => a.file === file);
      if (have) return file;
      const blob = await (await fetch(url)).blob();
      const b64 = await fileToBase64(new File([blob], file));
      const rr = await api2.saveAsset(file, b64, want);
      setFxData(rr.fx);
      return rr.file || file;
    },
    [fxData],
  );

  // ── ลงมือทำตามข้อเสนอของ AI — รวบเป็น mutate/patchFx อย่างละครั้ง ──
  // ลบช็อตแล้วเลขลำดับของข้อถัดไปเลื่อน จึงต้องคิดทั้งชุดในการแก้ครั้งเดียว
  const applyOps = useCallback(
    async (ops: ReviewOp[]): Promise<{ done: number[]; failed: string[] }> => {
      const done: number[] = [];
      const failed: string[] = [];
      const oid = (o: ReviewOp, i: number) => o.id ?? i;

      const tlOps = ops.filter((o) => ["drop", "move", "trim"].includes(o.op));
      if (tlOps.length) {
        const stale = tlOps.filter((o) => o.at == null || shots[o.at]?.name !== o.name);
        for (const o of stale) failed.push(`ช็อต ${(o.at ?? 0) + 1} ไม่ใช่ ${o.name} แล้ว`);
        const live = tlOps.filter((o) => !stale.includes(o));
        if (live.length) {
          mutate((prev) => {
            let arr = prev.map((sh, i) => ({ i, sh }));
            for (const o of live) {
              if (o.op !== "trim" || o.start == null || o.dur == null) continue;
              const k = arr.findIndex((x) => x.i === o.at);
              if (k < 0) continue;
              const start = o.start;
              arr[k] = { ...arr[k], sh: { ...arr[k].sh, start, end: start + o.dur, dur: o.dur, seg: null } };
            }
            const kill = new Set(live.filter((o) => o.op === "drop").map((o) => o.at));
            arr = arr.filter((x) => !kill.has(x.i));
            for (const o of live) {
              if (o.op !== "move" || o.to == null) continue;
              const from = arr.findIndex((x) => x.i === o.at);
              if (from < 0) continue;
              const [x] = arr.splice(from, 1);
              const anchor = arr.findIndex((y) => y.i === o.to);
              arr.splice(anchor < 0 ? arr.length : anchor, 0, x);
            }
            return arr.map((x) => x.sh);
          });
          setSel(null);
          live.forEach((o) => done.push(oid(o, ops.indexOf(o))));
        }
      }

      const fxOps = ops.filter((o) => ["music", "sfx", "sticker", "text"].includes(o.op));
      if (fxOps.length) {
        if (!fxDraft || !fxData) {
          failed.push("ชั้นแต่งหนังยังโหลดไม่เสร็จ");
          return { done, failed };
        }
        const music = [...fxDraft.music];
        const overlays = [...fxDraft.overlays];
        const texts = [...fxDraft.texts];
        for (const o of fxOps) {
          const tl = o.tl ?? 0;
          const id = oid(o, ops.indexOf(o));
          try {
            if (o.op === "text") {
              const bind = tlToClip(shots, offsets, tl);
              if (!bind) throw new Error("อยู่นอกช่วงหนัง");
              texts.push({
                ...fxData.defaults.text_item,
                text: o.text ?? "",
                at: bind.at,
                dur: o.dur ?? 2.5,
                name: bind.name,
                id: "",
                lines: [],
              });
            } else if (o.op === "sticker") {
              const def = STICKER_LIST.find((x) => x.file === o.file);
              const bind = tlToClip(shots, offsets, tl);
              if (!def) throw new Error("ไม่รู้จักสติกเกอร์นี้");
              if (!bind) throw new Error("อยู่นอกช่วงหนัง");
              const file = await ensureAsset(def.file, stickerUrl(def.file), "media");
              overlays.push({
                ...fxData.defaults.overlay,
                ...(def.anim ? { anim: def.anim } : {}),
                file,
                width: def.width,
                x: def.x,
                y: def.y,
                at: bind.at,
                dur: o.dur ?? 2.5,
                name: bind.name,
                id: "",
              });
            } else if (o.op === "sfx") {
              const file = await ensureAsset(o.file ?? "", sfxUrl(o.file ?? ""), "audio");
              music.push({
                ...fxData.music.defaults,
                file,
                at: Math.max(0, Math.round(tl * 100) / 100),
                dur: o.dur ?? 1,
                loop: !!o.loop,
                duck: false,
                fade_in: 0,
                fade_out: 0,
                gain_db: -6,
                id: "",
              });
            } else {
              // AI เลือกลูปตัวอย่างได้ด้วย (catalog.bgm) — ขึ้นคลังก่อน ไม่งั้นได้แทร็กที่ชี้ไฟล์ที่ไม่มี
              let file = o.file ?? "";
              if (BGM_LIST.some((b) => b.file === file)) file = await ensureAsset(file, bgmUrl(file), "audio");
              music.push({
                ...fxData.music.defaults,
                file,
                at: Math.max(0, Math.round(tl * 100) / 100),
                ...(o.dur ? { dur: o.dur } : {}),
                id: "",
              });
            }
            done.push(id);
          } catch (e) {
            failed.push(`${o.label || o.file || o.text || "ข้อเสนอ"}: ${e instanceof Error ? e.message : "ทำไม่สำเร็จ"}`);
          }
        }
        patchFx({ music, overlays, texts });
      }
      if (done.length) {
        const edl = ops.some((o) => ["drop", "move", "trim"].includes(o.op));
        const fxs = ops.some((o) => !["drop", "move", "trim"].includes(o.op));
        flash(
          `รับข้อเสนอ ${done.length} ข้อแล้ว` +
            (failed.length ? ` · ข้าม ${failed.length} (${failed[0]})` : "") +
            ` — อย่าลืมบันทึก${edl && fxs ? " EDL และ FX" : edl ? " EDL" : " FX"}`,
        );
      } else if (failed.length) flash(failed[0]);
      return { done, failed };
    },
    [shots, offsets, mutate, fxDraft, fxData, patchFx, ensureAsset, flash],
  );

  // ── ค่าตั้ง · ไฟล์ที่ส่งออกแล้ว · ราคาการทำใหม่ ──
  const setup = setupL.data;
  const frame = useMemo(() => {
    const vals = { ...(setup?.inherited ?? {}), ...(setup?.values ?? {}) };
    const num = (k: string, d: number) => {
      const v = Number(vals[k]);
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    return {
      w: num("video.width", 1080),
      h: num("video.height", 1920),
      fps: parseFps(vals["video.fps"]),
      lufs: Number.isFinite(Number(vals["audio.master_lufs"])) ? Number(vals["audio.master_lufs"]) : -14,
    };
  }, [setup]);

  const outs = useMemo(
    () =>
      (infoL.data?.project.outs ?? [])
        .filter((o) => OUT_OF_STEP[o.step])
        .map((o) => ({ kind: OUT_OF_STEP[o.step], exists: o.exists, size: o.size, mtime: o.mtime, path: o.path })),
    [infoL.data],
  );

  const rebuild = useMemo<Rebuild>(() => {
    const out3 = outs.find((o) => o.kind === "out");
    const out4 = outs.find((o) => o.kind === "text");
    const out5 = outs.find((o) => o.kind === "fx");
    const edlNeed = dirty || !(out3?.exists ?? proj?.out_exists) || Boolean(proj?.out_stale);
    const base = out3?.mtime ?? proj?.out_mtime ?? 0;
    // "เก่ากว่า EDL" วัดผ่านไฟล์ ③ — ③ ถูกต่อใหม่ทุกครั้งที่ EDL เปลี่ยน จึงเป็นตัวแทนเดียวกัน
    const textNeed = capDirty || edlNeed || !out4?.exists || out4.mtime < base;
    const fxNeed = fxDirty || edlNeed || !out5?.exists || out5.mtime < base;
    const touched = fxDraft ? Object.keys(fxDraft.clips).length : (fxData?.view.touched ?? 0);
    const perSeg = planL.data?.estimate?.sec_per_segment ?? 1;
    // ประมาณอย่างหยาบ: ③ จากแผนของเอนจิน · ④/⑤ = เข้ารหัสภาพซ้ำหนึ่งรอบ (~6% ของความยาว)
    // + ชิ้นที่ถูกแต่งต้องตัดใหม่ (ราว 3 เท่าของเวลาตัดชิ้นปกติ)
    const edlEta = planL.data?.seconds ?? Math.round(10 + total * 0.02);
    const textEta = Math.round(8 + total * 0.06);
    const fxEta = Math.round(10 + total * 0.06 + touched * perSeg * 3);
    return { edl: edlNeed, text: textNeed, fx: fxNeed, eta: { edl: edlEta, text: textEta, fx: fxEta } };
  }, [outs, dirty, capDirty, fxDirty, proj, fxDraft, fxData, planL.data, total]);

  const fx = useMemo<FxStore>(
    () => ({ data: fxData, draft: fxDraft, patch: patchFx, save: saveFx, revert: loadFx, dirty: fxDirty, saving: fxSaving, setData: setFxData }),
    [fxData, fxDraft, patchFx, saveFx, loadFx, fxDirty, fxSaving],
  );
  const cap = useMemo<CapStore>(
    () => ({ data: capData, draft: capDraft, patch: patchCap, save: saveCaps, revert: loadCaps, dirty: capDirty, saving: capSaving, setData: setCapData }),
    [capData, capDraft, patchCap, saveCaps, loadCaps, capDirty, capSaving],
  );

  const saveAll = useCallback(async () => {
    if (!dirty && !fxDirty && !capDirty) {
      flash("ไม่มีอะไรค้างบันทึก");
      return;
    }
    const jobs: Promise<void>[] = [];
    if (fxDirty) jobs.push(saveFx());
    if (capDirty) jobs.push(saveCaps());
    await Promise.all(jobs);
    if (dirty) await saveEdl();
  }, [dirty, fxDirty, capDirty, saveEdl, saveFx, saveCaps, flash]);

  // ── คีย์ลัดของทั้งขั้น ③ ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      } else if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (focus && (focus.kind === "text" || focus.kind === "sticker" || focus.kind === "shape" || focus.kind === "music")) {
          removeLayerItem(focus.kind, focus.idx);
        } else if (sel != null) {
          removeShot(sel);
        }
      } else if (!mod && (e.key === "s" || e.key === "S")) {
        split();
      } else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 0.02 : 0.005;
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const v = d[e.key];
        if (v && nudge(v[0], v[1])) e.preventDefault();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo, saveAll, toggle, focus, sel, removeLayerItem, removeShot, split, nudge]);

  const value = useMemo<Studio>(
    () => ({
      variant,
      shots,
      setShots,
      offsets,
      total,
      rendered,
      dirty,
      saving,
      saveEdl,
      revertEdl,
      undoEdl,
      undo,
      redo,
      canUndo: hist.undo > 0,
      canRedo: hist.redo > 0,
      mutate,
      patchShot,
      removeShot,
      reorder,
      duplicate,
      split,
      trash,
      restoreTrash,
      sel,
      setSel,
      playhead,
      setPlayhead,
      playing,
      setPlaying,
      seek,
      play,
      toggle,
      videoRef,
      bindVideo,
      source,
      setSource,
      mediaDuration,
      fx,
      cap,
      transcript: trL.data,
      speechLines,
      focus,
      setFocus,
      layers,
      overlay,
      previewCues,
      patchTextAt,
      patchOverlayAt,
      patchShapeAt,
      removeLayerItem,
      ensureAsset,
      fxKeys,
      fxOfShot,
      setShotFx,
      playheadFx,
      playheadAt,
      beats,
      beatBusy,
      loadBeats,
      showBeats,
      setShowBeats,
      snapToBeats,
      setup,
      info: infoL.data,
      plan: planL.data,
      frame: { w: frame.w, h: frame.h },
      fps: frame.fps,
      lufs: frame.lufs,
      outs,
      rebuild,
      review: reviewL.data,
      reloadReview: reviewL.reload,
      applyOps,
      saveAll,
      flash,
    }),
    [
      variant, shots, offsets, total, rendered, dirty, saving, saveEdl, revertEdl, undoEdl, undo, redo, hist,
      mutate, patchShot, removeShot, reorder, duplicate, split, trash, restoreTrash, sel, playhead, playing,
      seek, play, toggle, bindVideo, source, mediaDuration, fx, cap, trL.data, speechLines, focus, layers, overlay, previewCues,
      patchTextAt, patchOverlayAt, patchShapeAt, removeLayerItem, ensureAsset, fxKeys, fxOfShot, setShotFx,
      playheadFx, playheadAt, beats, beatBusy, loadBeats, showBeats, snapToBeats, setup, infoL.data, planL.data,
      frame, outs, rebuild, reviewL.data, reviewL.reload, applyOps, saveAll, flash,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
