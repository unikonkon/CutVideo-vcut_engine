"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import {
  api,
  api2,
  clipUrl,
  fileToBase64,
  liveUrl,
  segUrl,
  type BeatData,
  type CaptionsData,
  type ClipInfo,
  type TrashItem,
  type FxClip,
  type FxData,
  type FxOverlay,
  type FxPreset,
  type FxShape,
  type FxTextItem,
  type MusicTrack,
  type JobState,
  type ProjectState,
  type ReviewOp,
  type VModeOption,
  type ReviewTask,
  type Shot,
  type TranscriptData,
} from "@/lib/api";
import {
  captionBlocks,
  MAX_AUDIO_STACK,
  MAX_STACK,
  musicBlocks,
  overlapCount,
  shapeBlocks,
  speechBlocks,
  stickerBlocks,
  textBlocks,
  tlToClip,
  type DropPayload,
  type LayerKind,
} from "@/lib/layers";
import { lookOf, nameFromText, uniqueName } from "@/lib/presets";
import { resolveLook } from "@/lib/textfx";
import { dur } from "@/lib/time";
import { BGM_LIST, bgmLabel, bgmUrl } from "@/lib/bgm";
import { SFX_LIST, sfxUrl } from "@/lib/sfx";
import { STICKER_LIST, stickerUrl } from "@/lib/stickers";
import type { CapDraft, FxStore } from "@/components/panels/types";
import TopBar from "@/components/TopBar";
import { type Tab } from "@/components/TabNav";
import AssetsPanel from "@/components/AssetsPanel";
import Preview from "@/components/Preview";
import MusicMixer from "@/components/MusicMixer";
import MixerPanel from "@/components/MixerPanel";
import Properties from "@/components/Properties";
import Timeline from "@/components/Timeline";
import BlockCard, { type CardAnchor, type CardItem } from "@/components/BlockCard";
import JobPanel from "@/components/JobPanel";
import TextPanel from "@/components/panels/TextPanel";
import MusicPanel from "@/components/panels/MusicPanel";
import StickerPanel from "@/components/panels/StickerPanel";
import TranscriptPanel from "@/components/panels/TranscriptPanel";
import ReviewPanel from "@/components/panels/ReviewPanel";
import SetupPanel from "@/components/panels/SetupPanel";
import PipelinePanel from "@/components/panels/PipelinePanel";

/** ก๊อปเอฟเฟกต์รายชิ้นทั้งกองแบบตื้นสองชั้น — draft ต้องไม่ใช้ object เดียวกับ
 *  ที่โหลดมา ไม่งั้นแก้ค่าแล้ว "ของเดิม" เปลี่ยนตาม แล้วปุ่มย้อนกลับคืนอะไรไม่ได้ */
function cloneClips(src: Record<string, FxClip> | undefined) {
  const out: Record<string, FxClip> = {};
  for (const [k, v] of Object.entries(src ?? {})) out[k] = { ...v };
  return out;
}

/** ข้อความไทยประจำรหัสผิดพลาดของ <video> (MediaError.code) */
const MEDIA_ERR: Record<number, string> = {
  1: "หยุดโหลดวิดีโอกลางคัน",
  2: "สายขาดระหว่างโหลดวิดีโอ — เอนจินยังทำงานอยู่หรือเปล่า",
  3: "ไฟล์วิดีโอเสียหรือถอดรหัสไม่ได้",
  4: "เบราว์เซอร์นี้เล่นแหล่งวิดีโอนี้ไม่ได้",
};
const ERR_SRC_NOT_SUPPORTED = 4;

/** เบราว์เซอร์ตระกูล WebKit — Safari ทุกตัว และ *ทุก* เบราว์เซอร์บน iOS/iPadOS
 *
 *  WebKit บังคับว่า <video src> ที่เป็น video/mp4 ต้องเลื่อนหัวอ่านด้วย byte-range
 *  ได้ แต่ /live/ ของเอนจินตอบ `200 + Transfer-Encoding: chunked` ไม่มี
 *  Content-Length ไม่มี Accept-Ranges และเมิน Range ที่ส่งไป (ดู serve.py `_live`)
 *  มันจึงไม่ยอมเริ่มเล่นเลย แล้วขึ้น "The operation is not supported." บนจอดำ
 *  — ตัวสตรีมไม่ได้เสีย (h264/avc1 + aac ปกติ) ปัญหาอยู่ที่วิธีตอบ HTTP ล้วน ๆ
 *
 *  เช็กไว้เพื่อ *เริ่ม* ที่โหมดทีละชิ้นไปเลย ผู้ใช้จะได้ไม่ต้องเห็นจอดำก่อนหนึ่งครั้ง
 *  ส่วนตาข่ายรองจริงคือตัวจับ error ด้านล่าง ซึ่งทำงานกับทุกเบราว์เซอร์ที่เล่นไม่ได้
 *  ไม่ว่าจะเดาถูกหรือไม่ */
function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

export default function Editor() {
  const [proj, setProj] = useState<ProjectState | null>(null);
  const [clips, setClips] = useState<ClipInfo[]>([]);
  // ตัวเลือกโหมดแนวตั้ง + ค่ากลางของเรื่อง — มาจากเอนจินทั้งชุด หน้าเว็บไม่มี
  // รายการของตัวเอง จะได้ไม่หลุดจากของจริงตอนเอนจินเพิ่ม/แก้โหมด
  const [vmodes, setVmodes] = useState<VModeOption[]>([]);
  const [vmodeDefault, setVmodeDefault] = useState("blur_pad");
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const [shots, setShots] = useState<Shot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const [trash, setTrash] = useState<TrashItem[]>([]);
  // ลำดับคลังที่ลากจัดไว้แต่ยังไม่ได้เขียนลงไฟล์โปรเจกต์
  const [orderDirty, setOrderDirty] = useState(false);

  const [job, setJob] = useState<JobState | null>(null);
  const [jobLines, setJobLines] = useState<string[]>([]);
  const [jobOpen, setJobOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("assets");
  // เด้งขึ้นทุกครั้งที่งานฝั่งเอนจินจบ — panel ที่เปิดอยู่จะโหลดข้อมูลใหม่
  const [reloadKey, setReloadKey] = useState(0);

  // ── fx (ขั้น 5) เป็น state กลาง — แผงซ้ายกับเลเยอร์บนไทม์ไลน์แก้ก้อนเดียวกัน ──
  const [fxData, setFxData] = useState<FxData | null>(null);
  // ทรงเดียวกับ FxStore["draft"] — ประกาศชนิดที่นั่นที่เดียวแล้วยืมมาใช้ ไม่งั้น
  // เพิ่มชั้นใหม่ทีต้องแก้สองที่ แล้วที่หนึ่งจะลืมทุกครั้ง
  const [fxDraft, setFxDraft] = useState<FxStore["draft"]>(null);
  const [fxDirty, setFxDirty] = useState(false);
  const [fxSaving, setFxSaving] = useState(false);
  const [capData, setCapData] = useState<CaptionsData | null>(null);
  // ซับขั้น 4 แก้ที่ draft เหมือน fx — แผงเดียวจึงกดบันทึกทีเดียวได้ทั้งสองไฟล์
  // และ Cmd+S เก็บของค้างครบ (เดิม state ชุดนี้ซ่อนอยู่ในแผง Cmd+S จึงไม่เห็น)
  const [capDraft, setCapDraft] = useState<CapDraft | null>(null);
  const [capDirty, setCapDirty] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [trData, setTrData] = useState<TranscriptData | null>(null);
  // เลเยอร์ไหนเปิดอยู่บนไทม์ไลน์
  const [vis, setVis] = useState<Record<LayerKind, boolean>>({
    text: true,
    sticker: true,
    shape: true,
    music: true,
    caption: false,
    speech: false,
  });
  // บล็อก/รายการที่ถูกเลือกข้ามแผง — คลิกบนไทม์ไลน์แล้วให้แผงเปิดตัวนั้น
  const [focus, setFocus] = useState<{ kind: LayerKind; idx: number } | null>(
    null,
  );

  // ── ประวัติย้อนกลับ/ทำซ้ำ — ครอบทั้งการตัดช็อต (EDL) และเลเยอร์ (fx) ──
  interface Snap {
    shots: Shot[];
    fx: typeof fxDraft;
    dirty: boolean;
    fxDirty: boolean;
  }
  const undoStack = useRef<Snap[]>([]);
  const redoStack = useRef<Snap[]>([]);
  const lastPush = useRef(0);
  const [histVer, setHistVer] = useState(0); // ให้ปุ่มรู้ว่ามีของให้ย้อนไหม

  const stateRef = useRef<Snap>({
    shots: [],
    fx: null,
    dirty: false,
    fxDirty: false,
  });
  useEffect(() => {
    stateRef.current = { shots, fx: fxDraft, dirty, fxDirty };
  });

  const pushHistory = useCallback(() => {
    const now = Date.now();
    // การพิมพ์/ลากรัว ๆ ภายใน 0.8 วิ นับเป็นก้าวเดียว — จุดย้อนคือก่อนก้าวแรก
    if (now - lastPush.current < 800) return;
    lastPush.current = now;
    undoStack.current.push({ ...stateRef.current });
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    setHistVer((v) => v + 1);
  }, []);

  const applySnap = useCallback((s: Snap) => {
    setShots(s.shots);
    setDirty(s.dirty);
    setFxDraft(s.fx);
    setFxDirty(s.fxDirty);
  }, []);

  const undo = useCallback(() => {
    const s = undoStack.current.pop();
    if (!s) return;
    redoStack.current.push({ ...stateRef.current });
    lastPush.current = 0;
    applySnap(s);
    setHistVer((v) => v + 1);
  }, [applySnap]);

  const redo = useCallback(() => {
    const s = redoStack.current.pop();
    if (!s) return;
    undoStack.current.push({ ...stateRef.current });
    lastPush.current = 0;
    applySnap(s);
    setHistVer((v) => v + 1);
  }, [applySnap]);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastPush.current = 0;
    setHistVer((v) => v + 1);
  }, []);

  const [playing, setPlaying] = useState(false);
  // โหมดแก้ตำแหน่งบนจอตัวอย่าง — อยู่ที่นี่เพราะทั้ง Preview (ลาก), คีย์ลัด (ลูกศร)
  // และแผงสติกเกอร์ (ปุ่ม "แก้บนจอ") ต้องเห็นสวิตช์ตัวเดียวกัน
  const [posEdit, setPosEdit] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [mixerOpen, setMixerOpen] = useState(false);
  // ขนาดหนัง (layout) จาก config — ใช้โชว์ตัวเลือกใต้จอ + สเกลตัวอย่างซ้อนให้ตรง
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const setupPath = useRef("");
  const [pxPerSec, setPxPerSec] = useState(10);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // at = สายที่เปิดอยู่ตั้งต้นเข้าไปในชิ้นแรกกี่วินาที (เวลา 0 ของสตรีม = จุดนั้น)
  // keyint = ระยะห่างคีย์เฟรม ใช้ปัด at ให้ตรงคีย์เฟรมที่ ffmpeg เริ่มได้จริง
  const streamRef = useRef<{
    token: string;
    key: string;
    from: number;
    at: number;
    keyint: number;
  }>({ token: "", key: "", from: 0, at: 0, keyint: 1.001 });
  const modeRef = useRef<"timeline" | "clip">("timeline");
  // วิธีเล่นไทม์ไลน์ — คนละแกนกับ modeRef ข้างบน
  //   live     สายเดียวจาก /live/ (ffmpeg ต่อให้สด · ลื่นไม่มีรอยต่อ · Chromium เท่านั้น)
  //   segments เล่น /seg/<ชิ้น> ทีละชิ้นแล้วต่อเอง (ทุกเบราว์เซอร์ · เลื่อนในชิ้นได้จริง)
  const playModeRef = useRef<"live" | "segments">("live");
  const segRef = useRef(0);          // อยู่ชิ้นที่เท่าไรของ rendered (โหมด segments)
  const segLoad = useRef(0);         // รอบโหลดล่าสุด — กันคำสั่งเก่าที่ยังค้างมาสั่งทับ
  const prefetchRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(false);  // ให้ตัวจับ event อ่านค่าล่าสุดได้ไม่ต้องผูก deps
  const playheadRef = useRef(0);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const total = useMemo(
    () => shots.reduce((a, s) => a + s.dur, 0),
    [shots],
  );
  const rendered = useMemo(
    () =>
      shots
        .map((s, i) => ({ seg: s.seg as string, i, dur: s.dur }))
        .filter((x) => x.seg),
    [shots],
  );

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shots) m.set(s.name, (m.get(s.name) ?? 0) + 1);
    return m;
  }, [shots]);
  const needRender = useMemo(
    () => shots.filter((s) => !s.seg).length,
    [shots],
  );

  // ── จังหวะเพลง ──
  //
  // เก็บทั้งก้อนไว้ที่นี่เพราะมีสองที่ที่ต้องใช้ตัวเลขชุดเดียวกัน: เส้นบนไทม์ไลน์
  // กับปุ่มดูดรอยตัด  ให้แต่ละที่ไปเรียกเองแปลว่าเส้นที่เห็นกับที่ปุ่มใช้อาจเป็น
  // คนละรอบการวิเคราะห์
  const [beats, setBeats] = useState<BeatData | null>(null);
  const [beatBusy, setBeatBusy] = useState(false);
  const [showBeats, setShowBeats] = useState(false);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  // ── โหลดสถานะจากเอนจิน ──
  const refresh = useCallback(async () => {
    try {
      const [st, cl, tr] = await Promise.all([
        api.state(),
        api.clips(),
        api.trash().catch(() => ({ items: [] })), // เอนจินรุ่นเก่ายังไม่มีถังขยะ
      ]);
      setProj(st);
      setClips(cl.clips);
      setVmodes(cl.vmodes ?? []);
      setVmodeDefault(cl.vertical_default || "blur_pad");
      setTrash(tr.items);
      setShots(st.timeline);
      setDirty(false);
      setOffline(false);
      clearHistory(); // ของบนจอถูกแทนด้วยของจากดิสก์ — ประวัติเก่าใช้ต่อไม่ได้
      streamRef.current.key = ""; // ลำดับอาจเปลี่ยน — ขอสตรีมใหม่รอบหน้า
      setPxPerSec((px) => {
        const t = st.timeline.reduce((a, s) => a + s.dur, 0);
        if (t <= 0) return px;
        const fit = (window.innerWidth - 220) / t;
        return Math.min(120, Math.max(2, fit));
      });
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [clearHistory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadFx = useCallback(async () => {
    try {
      const d = await api2.fx();
      setFxData(d);
      setFxDraft({
        music: d.fx.music.map((m) => ({ ...m })),
        texts: d.fx.texts.map((t) => ({ ...t })),
        presets: (d.fx.presets ?? []).map((x) => ({ ...x })),
        overlays: d.fx.overlays.map((o) => ({ ...o })),
        journey: JSON.parse(JSON.stringify(d.fx.journey)),
        auto_sub: {
          enabled: Boolean(
            (d.fx.auto_sub as { enabled?: boolean } | undefined)?.enabled,
          ),
        },
        clips: cloneClips(d.fx.clips),
        shapes: (d.fx.shapes ?? []).map((sh) => ({ ...sh })),
      });
      setFxDirty(false);
      clearHistory();
    } catch {
      setFxData(null);
    }
  }, [clearHistory]);

  const loadCaps = useCallback(async () => {
    try {
      const d = await api2.captions();
      setCapData(d);
      setCapDraft({
        style: { ...d.style },
        enabled: d.auto.enabled,
        drop: [...d.auto.drop],
        edits: { ...d.auto.edits },
      });
      setCapDirty(false);
    } catch {
      setCapData(null);
      setCapDraft(null);
    }
  }, []);

  useEffect(() => {
    loadFx();
    loadCaps();
    api2.transcript().then(setTrData).catch(() => setTrData(null));
  }, [loadFx, loadCaps, reloadKey]);

  const patchCap = useCallback((part: Partial<CapDraft>) => {
    setCapDraft((d) => (d ? { ...d, ...part } : d));
    setCapDirty(true);
  }, []);

  const saveCaps = useCallback(async () => {
    if (!capDraft || !capData) return;
    setCapSaving(true);
    try {
      const r = await api2.saveCaptions({
        style: capDraft.style,
        auto: {
          enabled: capDraft.enabled,
          drop: capDraft.drop,
          edits: capDraft.edits,
          styles: capData.auto.styles,
        },
      });
      setCapData(r.captions);
      setCapDraft({
        style: { ...r.captions.style },
        enabled: r.captions.auto.enabled,
        drop: [...r.captions.auto.drop],
        edits: { ...r.captions.auto.edits },
      });
      setCapDirty(false);
      flash("บันทึก captions.json แล้ว — มีผลตอนสร้างไฟล์แบบมีข้อความ");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกซับไม่สำเร็จ");
    } finally {
      setCapSaving(false);
    }
  }, [capDraft, capData, flash]);

  const patchFx = useCallback(
    (part: Partial<NonNullable<typeof fxDraft>>) => {
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
      const r = await api2.saveFx(fxDraft);
      setFxData(r.fx);
      setFxDraft({
        music: r.fx.fx.music.map((m) => ({ ...m })),
        texts: r.fx.fx.texts.map((t) => ({ ...t })),
        presets: (r.fx.fx.presets ?? []).map((x) => ({ ...x })),
        overlays: r.fx.fx.overlays.map((o) => ({ ...o })),
        journey: JSON.parse(JSON.stringify(r.fx.fx.journey)),
        auto_sub: {
          enabled: Boolean(
            (r.fx.fx.auto_sub as { enabled?: boolean } | undefined)?.enabled,
          ),
        },
        clips: cloneClips(r.fx.fx.clips),
        shapes: (r.fx.fx.shapes ?? []).map((sh) => ({ ...sh })),
      });
      setFxDirty(false);
      flash("บันทึก fx.json แล้ว — มีผลตอนสร้างไฟล์แบบมีเอฟเฟกต์");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึก fx ไม่สำเร็จ");
    } finally {
      setFxSaving(false);
    }
  }, [fxDraft, flash]);

  // ── ช็อตบนไทม์ไลน์ → กุญแจเอฟเฟกต์ของขั้น 5 ──
  //
  // **กุญแจมาจากเอนจิน (view.segments[].key) ไม่ใช่ประกอบเองจาก Shot**
  //
  // fx.clip_key ผูกกับ (คลิป, ช่วงที่ตัด) ด้วยทศนิยมสามตำแหน่ง ถ้าฝั่งนี้ประกอบ
  // สตริงเอง วันที่เอนจินเปลี่ยนรูปแบบกุญแจ (หรือปัดคนละแบบ) หน้าเว็บจะเขียน
  // เอฟเฟกต์ลงกุญแจที่ไม่ตรงกับชิ้นไหนเลย แล้วเงียบ — ค่าถูกบันทึก ไฟล์ออกมา
  // เหมือนเดิมทุกประการ ไม่มีอะไรฟ้อง  จับคู่ด้วยตัวเลขที่เอนจินพิมพ์มาเองแทน
  //
  // ชิ้นที่ยังไม่ได้ตัด (แก้ไทม์ไลน์หลัง render) จะไม่มีกุญแจ — ตั้งใจ เพราะ
  // เอฟเฟกต์ที่ตั้งไว้กับช่วงเก่าไม่มีผลกับช่วงใหม่อยู่แล้ว
  const fxKeys = useMemo(() => {
    const byRange = new Map<string, string>();
    for (const seg of fxData?.view.segments ?? []) {
      byRange.set(
        `${seg.name}|${seg.start.toFixed(3)}|${seg.dur.toFixed(3)}`,
        seg.key,
      );
    }
    return shots.map(
      (s) =>
        byRange.get(`${s.name}|${s.start.toFixed(3)}|${s.dur.toFixed(3)}`) ?? null,
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

  /** ตั้งเอฟเฟกต์ให้ช็อตหนึ่ง — ค่าที่กลับไปเท่าค่าตั้งต้นทุกช่องถูกลบกุญแจทิ้ง
   *  ไม่ใช่เก็บ {speed:1, zoom:1, …} ไว้ ซึ่งจะทำให้ fx.json บวมด้วยชิ้นที่ไม่ได้
   *  แต่งอะไรเลย และ fx.touched นับผิดจนหน้าเว็บบอกว่ามีชิ้นต้องตัดใหม่ทั้งที่ไม่มี */
  const setShotFx = useCallback(
    (i: number, patch: Partial<FxClip>) => {
      const base = fxData?.defaults.clip;
      const key = fxKeys[i];
      const cur = fxOfShot(i);
      if (!base || !key || !cur || !fxDraft) return;
      const next = { ...cur, ...patch };
      const clips = { ...fxDraft.clips };
      const untouched = (Object.keys(base) as (keyof FxClip)[]).every(
        (k) => next[k] === base[k],
      );
      if (untouched) delete clips[key];
      else clips[key] = next;
      patchFx({ clips });
    },
    [fxData, fxKeys, fxOfShot, fxDraft, patchFx],
  );

  /** เอฟเฟกต์ของช็อตที่เส้นหัวเล่นอยู่ — จอตัวอย่างทาสี/ซูม/เร่งความเร็วตามตัวนี้
   *
   *  คิดจาก draft ไม่ใช่จากไฟล์ที่บันทึกแล้ว หมุนแถบซูมแล้วภาพจึงขยับทันทีโดย
   *  ไม่ต้องกดบันทึกก่อน (ท่าเดียวกับ previewCues ของซับขั้น 4) */
  const playheadFx = useMemo(() => {
    const i = shots.findIndex((s, k) => playhead < offsets[k] + s.dur);
    return i < 0 ? null : fxOfShot(i);
  }, [shots, offsets, playhead, fxOfShot]);

  /**
   *  เดินมาถึงไหนของช็อตที่เส้นหัวเล่นอยู่ (0–1)
   *
   *  จอตัวอย่างต้องรู้ค่านี้ถึงจะวาดกล้องที่เคลื่อนตามเวลากับเบลอหัว-ท้ายได้ —
   *  เอฟเฟกต์พวกนี้ไม่ได้ขึ้นกับ "ตั้งค่าอะไรไว้" อย่างเดียว แต่ขึ้นกับ "ตอนนี้
   *  อยู่วินาทีที่เท่าไรของช็อต" ด้วย ซึ่งเป็นข้อมูลที่อยู่ที่นี่ที่เดียว
   */
  const playheadAt = useMemo(() => {
    const i = shots.findIndex((s, k) => playhead < offsets[k] + s.dur);
    if (i < 0) return null;
    const dur = shots[i].dur || 1;
    return { p: Math.min(1, Math.max(0, (playhead - offsets[i]) / dur)), dur };
  }, [shots, offsets, playhead]);

  // ── งานฝั่งเอนจิน (render/assemble/scan) ──
  const pollJob = useCallback(async () => {
    try {
      const got = await api.job(0);
      setJob(got);
      setJobLines(got.lines);
      return got;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    pollJob(); // มีงานค้างจากที่อื่นไหม
  }, [pollJob]);

  useEffect(() => {
    if (!job?.running) return;
    setJobOpen(true);
    const id = setInterval(async () => {
      const got = await pollJob();
      if (got && !got.running) {
        clearInterval(id);
        refresh();
        setReloadKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [job?.running, pollJob, refresh]);

  const runJob = useCallback(
    async (step: string) => {
      try {
        await api.runJob(step);
        setJobOpen(true);
        await pollJob();
      } catch (e) {
        flash(e instanceof Error ? e.message : "สั่งงานไม่สำเร็จ");
      }
    },
    [pollJob, flash],
  );

  const musicFetch = useCallback(
    async (url: string) => {
      try {
        await api2.music(url);
        setJobOpen(true);
        await pollJob();
      } catch (e) {
        flash(e instanceof Error ? e.message : "สั่งดึงเพลงไม่สำเร็จ");
      }
    },
    [pollJob, flash],
  );

  const runReview = useCallback(
    async (context: string, force: boolean, tasks?: ReviewTask[]) => {
      try {
        // เอนจินไม่รู้จักไฟล์ตัวอย่างที่อยู่ใน public/ ของหน้าเว็บ — ส่งรายการไปด้วย
        // ทุกครั้ง AI จะได้เลือกได้เฉพาะของที่กดรับแล้วอัปโหลดเข้าคลังได้จริง
        const catalog = {
          sfx: SFX_LIST.map((x) => ({
            file: x.file, label: x.label, cat: x.cat, dur: x.dur,
            loop: x.loop ? 1 : 0,
          })),
          sticker: STICKER_LIST.map((x) => ({
            file: x.file, label: x.label, cat: x.cat,
          })),
          bgm: BGM_LIST.map((x) => ({
            file: x.file, label: x.label, cat: x.cat,
          })),
        };
        await api2.runReview(context, force, tasks, catalog);
        setJobOpen(true);
        await pollJob();
      } catch (e) {
        flash(e instanceof Error ? e.message : "สั่ง review ไม่สำเร็จ");
      }
    },
    [pollJob, flash],
  );

  // ── ขนาดหนัง (layout) — อ่าน/เขียน video.width/height ใน config ──
  useEffect(() => {
    let dead = false;
    api2
      .setup()
      .then((s) => {
        if (dead) return;
        setupPath.current = s.project.path;
        const num = (k: string, d: number) => {
          const v = Number(s.values[k] ?? s.inherited[k]);
          return Number.isFinite(v) && v > 0 ? v : d;
        };
        setFrame({ w: num("video.width", 1920), h: num("video.height", 1080) });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [reloadKey]);

  const applyLayout = useCallback(
    async (w: number, h: number) => {
      try {
        await api2.saveSetup(setupPath.current, {
          "video.width": w,
          "video.height": h,
        });
        setFrame({ w, h });
        flash(
          `ขนาดหนัง ${w}×${h} แล้ว — มีผลตอน Export (ชิ้นที่ตัดไว้จะถูก render ใหม่ให้เอง)`,
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : "บันทึกขนาดไม่สำเร็จ");
      }
    },
    [flash],
  );

  // ── เล่นวิดีโอ: สตรีมชิ้นที่ render แล้วเป็นสายเดียว (ผ่าน /api/live) ──
  //
  // สตรีมของเอนจินเป็น chunked ไม่บอกความยาวรวม เบราว์เซอร์จึงเลื่อนไปข้างหน้า
  // ไกล ๆ ไม่ได้ (ดู serve.py `_live`) — "ย้ายหัวเล่น" ที่นี่จึงหมายถึงขอสตรีม
  // ใหม่ตั้งต้นที่ชิ้นนั้น ยกเว้นจุดที่ยังอยู่ในบัฟเฟอร์ของสายเดิม (ขยับได้เลย)

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
      let rIdx = rendered.findIndex((r) => r.i >= k);
      if (rIdx < 0) rIdx = 0;
      const delta = rendered[rIdx].i === k ? Math.max(0, tl - offsets[k]) : 0;
      return { rIdx, delta };
    },
    [shots, offsets, rendered],
  );

  /** ตอนนี้ตัวเล่นอยู่วินาทีไหนของไทม์ไลน์ — null ถ้ายังไม่ได้เล่นโหมดไทม์ไลน์
   *  (เวลาในสตรีมนับจากชิ้นที่ตั้งต้น ต้องบวกกลับเป็นเวลารวมของหนัง) */
  const elapsed = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.src || modeRef.current !== "timeline" || !rendered.length) {
      return null;
    }
    // โหมดทีละชิ้น: currentTime คือเวลาในชิ้นนั้นตรง ๆ ไม่ต้องไล่หักความยาว
    if (playModeRef.current === "segments") {
      const r = rendered[segRef.current];
      return r ? Math.min(offsets[r.i] + v.currentTime, total) : null;
    }
    // เวลา 0 ของสตรีมคือ "ชิ้นที่ตั้งต้น + at" ไม่ใช่หัวชิ้นเสมอไป
    let t = v.currentTime + streamRef.current.at;
    for (let j = streamRef.current.from; j < rendered.length; j++) {
      if (t < rendered[j].dur || j === rendered.length - 1) {
        return Math.min(offsets[rendered[j].i] + t, total);
      }
      t -= rendered[j].dur;
    }
    return null;
  }, [rendered, offsets, total]);

  /** อุ่นชิ้นถัดไปไว้ในแคชของเบราว์เซอร์ ระหว่างที่ชิ้นปัจจุบันยังเล่นอยู่
   *
   *  /seg/ ตอบ Accept-Ranges + Content-Length และ *ไม่* ได้ตั้ง no-store (ต่างจาก
   *  เส้น JSON ที่ผ่าน _send) เบราว์เซอร์จึงเก็บแคชได้จริง พอถึงรอยต่อจะสลับได้เร็ว
   *  ไม่ต้องรอ TCP รอบใหม่ — ใช้ <video> ลอย ๆ ไม่ต่อ DOM เพื่อไม่ต้องแตะ Preview */
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
      const url = segUrl(nxt.seg);
      if (!el.src.endsWith(`/seg/${nxt.seg}`)) el.src = url;
    },
    [rendered],
  );

  /** เล่นชิ้นที่ rIdx ของ rendered โดยเริ่มที่วินาที at ในชิ้นนั้น (โหมดทีละชิ้น)
   *
   *  ชิ้นเดิมที่โหลดไว้แล้วจะไม่โหลดซ้ำ — แค่ขยับ currentTime ซึ่งทำได้จริงเพราะ
   *  /seg/ รองรับ Range (ต่างจากสตรีมสดที่ v.seekable ว่างเปล่า) */
  const playSegment = useCallback(
    (rIdx: number, at: number, autoplay: boolean) => {
      const v = videoRef.current;
      const r = rendered[rIdx];
      if (!v || !r) return;
      segRef.current = rIdx;
      // กันไปยืนที่ปลายชิ้นพอดีแล้ว ended ยิงทันทีจนวิ่งรวดไปท้ายเรื่อง
      const start = Math.max(0, Math.min(at, Math.max(0, r.dur - 0.05)));
      // ลากไม้บรรทัดเร็ว ๆ จะสั่งซ้อนกันได้ — คำสั่งที่ตกรอบต้องเงียบไปเฉย ๆ ไม่งั้น
      // ตัวที่ค้างอยู่จะเด้ง currentTime กลับไปจุดเก่า หรือสั่งเล่นทั้งที่คำสั่งใหม่
      // บอกให้หยุด (loadedmetadata ของสายใหม่ปลุก listener ของสายเก่าด้วย)
      const mine = ++segLoad.current;
      const begin = () => {
        if (segLoad.current !== mine) return;
        if (start > 0.01 || v.currentTime > 0.01) {
          try {
            v.currentTime = start;
          } catch {
            /* ยังไม่พร้อมให้ขยับ — ปล่อยเล่นจากหัวชิ้น ดีกว่าค้าง */
          }
        }
        if (autoplay) {
          v.play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
        }
        prefetchNext(rIdx);
      };
      setPlayhead(Math.min(offsets[r.i] + start, total));
      if (v.src.endsWith(`/seg/${r.seg}`) && v.readyState >= 1) {
        begin();                       // อยู่ชิ้นนี้อยู่แล้ว — เลื่อนในชิ้นได้เลย
        return;
      }
      const onMeta = () => {
        v.removeEventListener("loadedmetadata", onMeta);
        begin();
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.src = segUrl(r.seg);
      v.load();
    },
    [rendered, offsets, total, prefetchNext],
  );

  /** พาตัวเล่นไปยืนที่เวลานั้นจริง ๆ — autoplay=false ใช้ตอนหยุดอยู่ (โชว์เฟรมนั้น
   *  ค้างไว้) เพื่อให้กดเล่นแล้วเล่นต่อจากตรงนั้นได้ทันทีโดยไม่ต้องโหลดซ้ำ */
  const goTo = useCallback(
    async (tl: number, autoplay: boolean) => {
      const v = videoRef.current;
      if (!v) return;
      if (!rendered.length) {
        if (autoplay) flash("ยังไม่มีชิ้นที่ตัดแล้ว — กด Export เพื่อ render ก่อน");
        return;
      }
      const { rIdx, delta } = locate(tl);
      if (playModeRef.current === "segments") {
        modeRef.current = "timeline";
        playSegment(rIdx, delta, autoplay);
        return;
      }
      try {
        const key = rendered.map((r) => r.seg).join("|");
        if (streamRef.current.key !== key) {
          const got = await api.live(rendered.map((r) => r.seg));
          streamRef.current.token = got.token;
          streamRef.current.key = key;
          if (got.keyint > 0) streamRef.current.keyint = got.keyint;
        }
        // ภาพถูก copy ไม่ได้เข้ารหัสใหม่ ffmpeg จึงเริ่มได้เฉพาะที่คีย์เฟรม —
        // ปัดลงให้ตรงกริดเอง จะได้รู้แน่ว่าสายใหม่เริ่มวินาทีไหน (ไม่งั้นมันถอย
        // ไปคีย์เฟรมก่อนหน้าเงียบ ๆ แล้วหัวเล่นกับภาพหลุดกันไปตลอดทั้งสาย)
        const k = streamRef.current.keyint;
        const at = k > 0 ? Math.max(0, Math.floor(delta / k + 1e-6) * k) : 0;
        modeRef.current = "timeline";
        streamRef.current.from = rIdx;
        streamRef.current.at = at;
        v.src = liveUrl(streamRef.current.token, rIdx, at);
        // เส้นแดงย้ายมายืนตรงเฟรมที่เล่นได้จริง (ห่างจากที่คลิกไม่เกินหนึ่งคีย์เฟรม)
        setPlayhead(Math.min(offsets[rendered[rIdx].i] + at, total));
        if (autoplay) {
          await v.play();
          setPlaying(true);
        }
      } catch (e) {
        flash(e instanceof Error ? e.message : "เล่นไม่ได้");
      }
    },
    [rendered, locate, offsets, total, flash, playSegment],
  );

  const play = useCallback((t: number) => goTo(t, true), [goTo]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (seekTimer.current) clearTimeout(seekTimer.current); // ตัดคิว scrub ที่ค้าง
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    // เล่นต่อจากที่ค้างไว้ได้เฉพาะตอนตัวเล่น "ยืนตรงเส้นแดง" อยู่แล้ว — ถ้าเพิ่ง
    // เลื่อนเส้นตอนหยุด ตัวเล่นยังค้างที่จุดเก่า ต้องตั้งต้นใหม่ที่เส้นแดง
    const at = elapsed();
    if (at != null && Math.abs(at - playhead) < 0.35) {
      v.play()
        .then(() => setPlaying(true))
        .catch(() => play(playhead));
    } else {
      play(playhead);
    }
  }, [playing, playhead, play, elapsed]);

  // หัวเล่นวิ่งตามวิดีโอ
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const at = elapsed();
      if (at != null) setPlayhead(at);
      // โหมดทีละชิ้น: ปลายชิ้นไม่ใช่ปลายเรื่อง — ปล่อยให้ตัวจับ "ended" พาไปชิ้นถัดไป
      if (videoRef.current?.ended && playModeRef.current !== "segments") {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, elapsed]);

  // ตัวจับ event อ่านสองค่านี้จาก ref ไม่ใช่ closure — จะได้ไม่ต้องถอด/ใส่ listener
  // ใหม่ทุกครั้งที่หัวเล่นขยับ (วินาทีละหลายสิบครั้ง)
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  // WebKit เล่นสตรีมสดไม่ได้ (ดูหมายเหตุที่ isWebKit) — เริ่มที่โหมดทีละชิ้นเลย
  useEffect(() => {
    if (isWebKit()) playModeRef.current = "segments";
    return () => {
      // ปล่อยสายที่กำลังอุ่นชิ้นถัดไปอยู่ ไม่งั้นมันโหลดต่อทั้งที่ไม่มีใครดูแล้ว
      const el = prefetchRef.current;
      if (el) {
        el.removeAttribute("src");
        el.load();
        prefetchRef.current = null;
      }
    };
  }, []);

  // ── ตัวจับ error / ended ของ <video> ──
  //
  // ผูกที่นี่ ไม่ใช่ที่ Preview เพราะทั้งสองตัวเป็นเรื่องของ *ตรรกะการเล่น* ซึ่งอยู่
  // ไฟล์นี้ทั้งหมด — Preview มีหน้าที่วาดอย่างเดียว ไม่ต้องรู้ว่ามีโหมดสำรองอยู่
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onError = () => {
      const code = v.error?.code ?? 0;
      // สตรีมสดเล่นไม่ได้ = เบราว์เซอร์นี้ไม่รับ chunked ที่ไม่มี Range → ถอยไปทีละชิ้น
      // แล้วเล่นต่อจากจุดเดิมทันที ผู้ใช้เห็นแค่สะดุดครั้งเดียว ไม่ใช่จอดำค้าง
      if (
        modeRef.current === "timeline" &&
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
      // โหมดดูคลิปเดี่ยวมีข้อความของตัวเองอยู่แล้ว (previewClip) ไม่ต้องทับ
      if (modeRef.current === "clip") return;
      flash(MEDIA_ERR[code] ?? "เล่นวิดีโอไม่ได้");
    };

    const onEnded = () => {
      if (modeRef.current !== "timeline" || playModeRef.current !== "segments") {
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

    v.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("error", onError);
      v.removeEventListener("ended", onEnded);
    };
  }, [rendered, total, locate, playSegment, flash]);

  const seek = useCallback(
    (t: number) => {
      setPlayhead(t);
      if (seekTimer.current) clearTimeout(seekTimer.current);
      // หน่วงไว้ให้ลากไม้บรรทัดรัว ๆ ได้โดยไม่ต่อสายใหม่ทุกพิกเซล — ตอนหยุดอยู่
      // ก็พาภาพไปเฟรมนั้นด้วย (ไม่เล่น) จะได้เห็นว่ากำลังจะเล่นต่อจากตรงไหน
      seekTimer.current = setTimeout(() => goTo(t, playing), 200);
    },
    [playing, goTo],
  );

  // ── แก้ไทม์ไลน์ (ยังไม่เขียนลงดิสก์จนกด "บันทึก EDL") ──
  const mutate = useCallback(
    (fn: (prev: Shot[]) => Shot[]) => {
      pushHistory();
      setShots((prev) => fn(prev));
      setDirty(true);
    },
    [pushHistory],
  );

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
            ? "ยังไม่มีเพลงในหนัง — วางเพลงลงไทม์ไลน์ก่อน"
            : `อ่านจังหวะแล้ว ${b.tracks.length} แทร็ก · ${b.grid.length} เส้น` +
              (noBpm ? ` · ${noBpm} แทร็กจับจังหวะไม่ได้ พิมพ์ BPM เองได้` : ""),
        );
        return b;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // เอนจินรุ่นก่อนหน้าไม่มีเส้นทางนี้ แล้ว 404 ของเอนจินตอบข้อความกลาง ๆ
        // ที่อ่านแล้วไม่รู้ว่าต้องทำอะไรต่อ — แปลให้ตรงจุดตรงนี้
        flash(
          msg.includes("ไม่รู้จักเส้นทาง") || msg.includes("404")
            ? "เอนจินที่รันอยู่ยังไม่มีชั้นจังหวะ — รีสตาร์ต ./vcut view แล้วลองใหม่"
            : msg || "อ่านจังหวะไม่สำเร็จ",
        );
        return null;
      } finally {
        setBeatBusy(false);
      }
    },
    [flash],
  );

  const patchShot = useCallback(
    (i: number, patch: Partial<Shot>) => {
      mutate((prev) =>
        prev.map((s, k) => {
          if (k !== i) return s;
          const next = { ...s, ...patch };
          next.dur = Math.round((next.end - next.start) * 1000) / 1000;
          // ขยับขอบแล้วไฟล์ segment เดิมไม่ตรงอีกต่อไป — ต้องตัดใหม่
          if (
            patch.start !== undefined ||
            patch.end !== undefined
          ) {
            if (next.start !== s.start || next.end !== s.end) next.seg = null;
          }
          return next;
        }),
      );
    },
    [mutate],
  );

  /**
   *  ดูดรอยตัดทุกจุดเข้าหาจังหวะ
   *
   *  **เอนจินคำนวณ หน้าเว็บแค่ทาบผล** — ตำแหน่งจังหวะกับกฎการขยับอยู่ที่
   *  vcut_engine/beat.py ที่เดียว (มีด่าน scripts/check_beat.py คุมไว้) ถ้า
   *  หน้าเว็บคิดเอง จะมีกฎสองชุดที่เพี้ยนจากกันได้ทันที
   *
   *  ทาบผ่าน mutate() เหมือนการแก้อื่น ๆ ทุกอย่าง — ปุ่มย้อนกลับจึงย้อนได้
   *  ทั้งกองในครั้งเดียว ซึ่งสำคัญมากเพราะปุ่มนี้แตะช็อตหลายสิบชิ้นพร้อมกัน
   */
  const snapToBeats = useCallback(async () => {
    if (!shots.length) return flash("ยังไม่มีช็อตในไทม์ไลน์");
    setBeatBusy(true);
    try {
      const r = await api.beatSnap(
        shots.map((s) => ({
          kind: s.kind, start: s.start, end: s.end, clip_dur: s.clip_dur,
        })),
      );
      if (!r.beats) return flash("ยังไม่รู้จังหวะของเพลง — กด “อ่านจังหวะ” ก่อน");
      if (!r.moved) return flash("รอยตัดตรงจังหวะอยู่แล้วทุกจุด — ไม่มีอะไรต้องแก้");
      const by = new Map(r.shots.map((x) => [x.i, x]));
      mutate((prev) =>
        prev.map((sh, i) => {
          const x = by.get(i);
          if (!x || x.end === sh.end) return sh;
          // ขอบขยับ = ไฟล์ segment เดิมใช้ไม่ได้แล้ว ต้องตัดใหม่ (กฎเดียวกับ
          // patchShot — ที่นี่เขียนซ้ำเพราะ mutate รับตัวแปลงทั้งรายการ)
          return { ...sh, end: x.end,
                   dur: Math.round((x.end - sh.start) * 1000) / 1000,
                   seg: null };
        }),
      );
      const skip = r.report.length;
      flash(
        `ดูดเข้าจังหวะ ${r.moved} รอย` +
          (skip ? ` · ข้าม ${skip} รอยที่เอื้อมไม่ถึง` : "") +
          ` — ต้อง render ใหม่ ${r.moved} ชิ้น (กดย้อนกลับได้)`,
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "ดูดรอยตัดไม่สำเร็จ");
    } finally {
      setBeatBusy(false);
    }
  }, [shots, mutate, flash]);

  const removeShot = useCallback(
    (i: number) => {
      mutate((prev) => prev.filter((_, k) => k !== i));
      setSel((s) => (s == null ? null : s === i ? null : s > i ? s - 1 : s));
    },
    [mutate],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
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
      flash("เลื่อนหัวเล่นให้อยู่กลางช็อต (ห่างขอบเกิน 0.3 วิ) ก่อนซอย");
      return;
    }
    const s = shots[k];
    const cut = s.start + (playhead - offsets[k]);
    mutate((prev) => {
      const next = [...prev];
      next.splice(
        k,
        1,
        { ...s, end: cut, dur: cut - s.start, seg: null },
        { ...s, start: cut, dur: s.end - cut, seg: null },
      );
      return next;
    });
    setSel(k);
  }, [shots, offsets, playhead, mutate, flash]);

  // ช็อตที่หัวเล่นชี้อยู่ → (ชื่อคลิป, วินาทีในคลิปต้นฉบับ) — ใช้ผูกเอฟเฟกต์/ภาพซ้อน
  const atPlayhead = useCallback(() => {
    for (let i = 0; i < shots.length; i++) {
      if (playhead < offsets[i] + shots[i].dur) {
        return {
          name: shots[i].name,
          at: shots[i].start + (playhead - offsets[i]),
        };
      }
    }
    return null;
  }, [shots, offsets, playhead]);

  // ── ลงมือทำตามข้อเสนอของ AI ────────────────────────────────────────────
  //
  // รับทีละข้อหรือทั้งชุดก็เข้าทางเดียวกัน เพราะ "รับทั้งหมด" ทีละข้อไม่ได้:
  //  · ลบช็อตแล้วเลขลำดับของข้อถัด ๆ ไปเลื่อนหมด — ต้องคิดทั้งชุดในการแก้ครั้งเดียว
  //  · ของชั้นแต่งหนังทุกชิ้นอ่าน fxDraft จาก closure เดียวกัน ถ้าเรียกซ้อนกัน
  //    ชิ้นหลังจะทับชิ้นแรกหายไปเงียบ ๆ — จึงรวบเป็น patchFx ครั้งเดียวเช่นกัน
  const applyReviewOps = useCallback(
    async (ops: ReviewOp[]): Promise<{ done: number[]; failed: string[] }> => {
      const done: number[] = [];
      const failed: string[] = [];
      const oid = (o: ReviewOp, i: number) => o.id ?? i;

      // ── ฝั่งไทม์ไลน์: trim → drop → move ในการ mutate ครั้งเดียว ──
      const tlOps = ops.filter((o) => ["drop", "move", "trim"].includes(o.op));
      if (tlOps.length) {
        const stale = tlOps.filter(
          (o) => o.at == null || shots[o.at]?.name !== o.name,
        );
        for (const o of stale) {
          failed.push(`ช็อต ${(o.at ?? 0) + 1} ไม่ใช่ ${o.name} แล้ว`);
        }
        const live = tlOps.filter((o) => !stale.includes(o));
        if (live.length) {
          mutate((prev) => {
            // ติดเลขลำดับ "ของตอนที่ AI ดู" ไว้กับทุกช็อต ทุกข้อเสนอจึงยังชี้ถูก
            // แม้ข้อก่อนหน้าจะลบหรือย้ายอะไรไปแล้ว
            let arr = prev.map((sh, i) => ({ i, sh }));
            for (const o of live) {
              if (o.op !== "trim" || o.start == null || o.dur == null) continue;
              const k = arr.findIndex((x) => x.i === o.at);
              if (k < 0) continue;
              const start = o.start;
              arr[k] = {
                ...arr[k],
                sh: { ...arr[k].sh, start, end: start + o.dur, dur: o.dur, seg: null },
              };
            }
            const kill = new Set(
              live.filter((o) => o.op === "drop").map((o) => o.at),
            );
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

      // ── ฝั่งชั้นแต่งหนัง: อัปโหลดไฟล์ที่ยังไม่มีในคลังก่อน แล้วค่อยแก้ draft ──
      const fxOps = ops.filter((o) =>
        ["music", "sfx", "sticker", "text"].includes(o.op),
      );
      if (fxOps.length) {
        if (!fxDraft || !fxData) {
          failed.push("ชั้นแต่งหนังยังโหลดไม่เสร็จ");
          return { done, failed };
        }
        let data = fxData;
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
                ...(data.defaults.text_item as Omit<
                  FxTextItem,
                  "at" | "dur" | "id" | "name" | "lines"
                >),
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
              let file = def.file;
              if (!data.overlay.assets.some((a) => a.file === file)) {
                const blob = await (await fetch(stickerUrl(file))).blob();
                const b64 = await fileToBase64(new File([blob], file));
                const r = await api2.saveAsset(file, b64, "media");
                data = r.fx;
                file = r.file || file;
              }
              overlays.push({
                ...(data.defaults.overlay as Omit<FxOverlay, "at" | "dur" | "id" | "name">),
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
              let file = o.file ?? "";
              if (!data.music.tracks.includes(file)) {
                const blob = await (await fetch(sfxUrl(file))).blob();
                const b64 = await fileToBase64(new File([blob], file));
                const r = await api2.saveAsset(file, b64, "audio");
                data = r.fx;
                file = r.file || file;
              }
              music.push({
                ...data.music.defaults,
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
              // AI เลือกลูปตัวอย่างได้ด้วย (ดู catalog.bgm ข้างบน) ซึ่งยังไม่อยู่ใน
              // คลังของโปรเจกต์จนกว่าจะมีคนใช้ — ขึ้นคลังตรงนี้ ไม่งั้นได้แทร็กที่
              // ชี้ไฟล์ที่ไม่มีอยู่ แล้วเงียบไปตอน export โดยไม่มีอะไรฟ้อง
              let file = o.file ?? "";
              if (
                BGM_LIST.some((b) => b.file === file) &&
                !data.music.tracks.includes(file)
              ) {
                const blob = await (await fetch(bgmUrl(file))).blob();
                const b64 = await fileToBase64(new File([blob], file));
                const r = await api2.saveAsset(file, b64, "audio");
                data = r.fx;
                file = r.file || file;
              }
              music.push({
                ...data.music.defaults,
                file,
                at: Math.max(0, Math.round(tl * 100) / 100),
                ...(o.dur ? { dur: o.dur } : {}),
                id: "",
              });
            }
            done.push(id);
          } catch (e) {
            failed.push(
              `${o.label || o.file || o.text || "ข้อเสนอ"}: ` +
                (e instanceof Error ? e.message : "ทำไม่สำเร็จ"),
            );
          }
        }
        if (data !== fxData) setFxData(data);
        patchFx({ music, overlays, texts });
      }
      return { done, failed };
    },
    [shots, offsets, mutate, fxDraft, fxData, patchFx, setFxData],
  );

  const caps = useMemo(
    () => ({
      data: capData,
      draft: capDraft,
      patch: patchCap,
      save: saveCaps,
      revert: loadCaps,
      dirty: capDirty,
      saving: capSaving,
    }),
    [capData, capDraft, patchCap, saveCaps, loadCaps, capDirty, capSaving],
  );

  // ก้อน props ที่แผง fx ทุกตัวใช้ร่วมกัน
  const fxs = useMemo(
    () => ({
      data: fxData,
      draft: fxDraft,
      patch: patchFx,
      save: saveFx,
      revert: loadFx,
      dirty: fxDirty,
      saving: fxSaving,
      setData: setFxData,
    }),
    [fxData, fxDraft, patchFx, saveFx, loadFx, fxDirty, fxSaving],
  );

  // ── เลเยอร์บนไทม์ไลน์ (คำนวณจาก state กลาง + EDL ปัจจุบัน) ──
  const layers = useMemo(
    () => ({
      text: fxDraft ? textBlocks(fxDraft.texts, shots, offsets) : [],
      sticker: fxDraft ? stickerBlocks(fxDraft.overlays, shots, offsets) : [],
      shape: fxDraft
        ? shapeBlocks(fxDraft.shapes, shots, offsets, fxData?.defaults.shape_kind)
        : [],
      music: fxDraft ? musicBlocks(fxDraft.music, total) : [],
      caption: capData ? captionBlocks(capData.cues) : [],
      speech: speechBlocks(trData, shots, offsets),
    }),
    [fxDraft, fxData, capData, trData, shots, offsets, total],
  );

  // ซับที่จะ "เห็นจริง" ตามที่แก้ค้างอยู่ — ปิดสวิตช์/ซ่อน cue/แก้คำ/เปลี่ยนสไตล์
  // แล้วจอตัวอย่างเปลี่ยนทันทีโดยไม่ต้องกดบันทึกก่อน (เดิมพรีวิวอ่านจากไฟล์ที่
  // บันทึกแล้วอย่างเดียว จึงโชว์ cue ที่สั่งซ่อนไว้ด้วย)
  const previewCues = useMemo(() => {
    if (!capData) return [];
    if (!capDraft) return capData.cues;
    if (!capDraft.enabled) return [];
    const drop = new Set(capDraft.drop);
    // ใช้เฉพาะคีย์สไตล์ที่ผู้ใช้เพิ่งแก้ — คีย์อื่นปล่อยไว้ตามที่เอนจินผสมมาให้
    // (cue บางเส้นมีสไตล์เฉพาะตัวใน auto.styles ถ้าทับหมดจะหายไปจากพรีวิว)
    const changed = Object.keys(capDraft.style).filter(
      (k) =>
        capDraft.style[k] !==
        (capData.style as unknown as Record<string, unknown>)[k],
    );
    return capData.cues
      .filter((c) => !drop.has(c.id))
      .map((c) => ({
        ...c,
        text: capDraft.edits[c.id] ?? c.text,
        style: changed.length
          ? ({
              ...c.style,
              ...Object.fromEntries(changed.map((k) => [k, capDraft.style[k]])),
            } as typeof c.style)
          : c.style,
      }));
  }, [capData, capDraft]);

  // บรรทัดบทพูดที่ตกอยู่ในไทม์ไลน์จริง (คลิปที่ถูกใช้ + ช่วงที่ไม่ถูกตัดทิ้ง)
  // id ใช้สูตรเดียวกับที่เอนจินตั้งให้ cue ของซับ (`<คลิป>#<ลำดับบรรทัด>`) —
  // ติ๊กใส่/ติ๊กออก และ "ซ่อน cue" จึงอ้างถึงบรรทัดเดียวกันได้โดยไม่ต้องเดา
  const speechLines = useMemo(() => {
    if (!trData) return [];
    const out: {
      id: string;
      name: string;
      at: number;
      dur: number;
      text: string;
      tl: number;
    }[] = [];
    const seen = new Set<string>();
    shots.forEach((s, i) => {
      (trData.clips[s.name] ?? []).forEach(([a, b, text], k) => {
        const x = Math.max(a, s.start);
        const y = Math.min(b, s.end);
        if (y - x < 0.15 || !String(text).trim()) return;
        const id = `${s.name}#${k}`;
        if (seen.has(id)) return; // คลิปเดียวถูกใช้ซ้ำหลายช็อต — เอาครั้งแรกพอ
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
  }, [trData, shots, offsets]);

  // ── ชุดสไตล์ที่จอตัวอย่างต้องรวมเอง ──
  //
  // รายชื่อคีย์มาจากเอนจิน ไม่ใช่ค่าคงที่ฝั่งนี้ — เอนจินเป็นเจ้าของว่า "อะไรบ้าง
  // ที่อยู่ในชุด" (fx.PRESET_KEYS) หน้าเว็บแค่ตามอ่าน จึงไม่มีสองรายการให้เพี้ยน
  const presets = useMemo(() => fxDraft?.presets ?? [], [fxDraft]);
  const presetKeys = useMemo(
    () => (fxData?.defaults.preset_keys as string[] | undefined) ?? [],
    [fxData],
  );

  // ชื่อแอนิเมชันมาจากเอนจิน (fx.ANIM) — คำอธิบายไทยไปอยู่ใน tooltip ของชิป
  // ส่วนป้ายบนชิปใช้ชื่อคีย์ เพราะคำอธิบายยาวเกินกว่าจะใส่ในชิปกว้าง 60 พิกเซล
  const animOpts = useMemo(
    () =>
      Object.entries((fxData?.defaults.anim as Record<string, string>) ?? { none: "" })
        .map(([v, title]) => ({ v, label: v, title })),
    [fxData],
  );

  // ข้อมูลให้ตัวอย่างซ้อนสดใน preview — ตัวเลขชุดเดียวกับที่จะถูกเผาตอน render
  const overlayData = useMemo(() => {
    if (!fxDraft) {
      return { texts: [], stickers: [], shapes: [], cues: previewCues };
    }
    const kindOf = new Map(
      (fxData?.overlay.assets ?? []).map((a) => [a.file, a.kind]),
    );
    const extKind = (f: string) =>
      /\.(mov|webm|mp4|m4v)$/i.test(f) ? "video" : "image";
    return {
      // ชุดสไตล์ต้องถูกรวมตรงนี้ ไม่ใช่ปล่อยให้ Preview ไปหาเอง — จอตัวอย่างวาด
      // จากร่างที่ยังไม่บันทึก ซึ่งเอนจินยังไม่เห็น ถ้าไม่รวม จอจะโชว์ค่าที่ค้าง
      // อยู่ในชิ้น ส่วนไฟล์ที่ได้ใช้ค่าของชุด (ตัวรวมเดียวกับที่แผงข้อความใช้)
      texts: layers.text
        .filter((b) => !b.orphan)
        .map((b) => ({
          item: resolveLook(fxDraft.texts[b.idx], presets, presetKeys),
          tl: b.tl,
          idx: b.idx,
        })),
      stickers: layers.sticker
        .filter((b) => !b.orphan)
        .map((b) => {
          const it = fxDraft.overlays[b.idx];
          return {
            item: it,
            tl: b.tl,
            kind: kindOf.get(it.file) ?? extKind(it.file),
            idx: b.idx,
          };
        }),
      shapes: layers.shape
        .filter((b) => !b.orphan)
        .map((b) => ({ item: fxDraft.shapes[b.idx], tl: b.tl, idx: b.idx })),
      cues: previewCues,
    };
  }, [layers, fxDraft, fxData, previewCues, presets, presetKeys]);

  // ย้าย/ยืดบล็อกบนเลเยอร์ → เขียนกลับเป็นหน่วยของเอนจิน (คลิป+วินาที หรือ at รวม)
  const changeLayerItem = useCallback(
    (
      kind: LayerKind,
      idx: number,
      tl: number,
      durNew: number,
      mode: "move" | "resize" = "resize",
    ) => {
      if (!fxDraft) return;
      if (kind === "music") {
        // เพดานเสียงซ้อน 6 ชั้น — คิดจากความยาวที่เห็นบนไทม์ไลน์ (dur 0 = ถึงท้ายหนัง)
        const effDur =
          mode === "resize"
            ? Math.max(1, durNew)
            : ((d) => (d > 0 ? d : Math.max(total - tl, 1)))(
                fxDraft.music[idx]?.dur ?? 0,
              );
        if (overlapCount(layers.music, tl, effDur, idx) >= MAX_AUDIO_STACK) {
          return flash(
            `ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว — ขยับไปที่ว่างก่อน`,
          );
        }
        patchFx({
          music: fxDraft.music.map((m, k) =>
            k === idx
              ? {
                  ...m,
                  at: Math.max(0, Math.round(tl * 100) / 100),
                  // ลากย้าย: แทร็ก "เล่นจนจบ" (dur 0) คงไว้แบบนั้น
                  // ยืดหด: ตั้งความยาวชัดเจนตามที่ลาก แม้เดิมจะเป็น 0
                  dur:
                    mode === "resize"
                      ? Math.max(1, Math.round(durNew * 100) / 100)
                      : m.dur,
                }
              : m,
          ),
        });
        return;
      }
      const bind = tlToClip(shots, offsets, Math.max(0, tl));
      if (!bind) return flash("ปล่อยนอกช่วงหนัง — ไม่ได้ย้าย");
      const cur =
        kind === "text"
          ? fxDraft.texts[idx]
          : kind === "shape"
            ? fxDraft.shapes[idx]
            : fxDraft.overlays[idx];
      const dur =
        mode === "resize"
          ? Math.max(0.2, Math.round(durNew * 100) / 100)
          : (cur?.dur ?? durNew);
      // เพดานซ้อน 5 ชั้น — นับเฉพาะชิ้นอื่นที่ทับช่วงใหม่
      if (overlapCount(layers[kind], tl, dur, idx) >= MAX_STACK) {
        return flash(`ช่วงนี้ซ้อนครบ ${MAX_STACK} ชั้นแล้ว — ขยับไปที่ว่างก่อน`);
      }
      if (kind === "text") {
        patchFx({
          texts: fxDraft.texts.map((t, k) =>
            k === idx ? { ...t, name: bind.name, at: bind.at, dur } : t,
          ),
        });
      } else if (kind === "sticker") {
        patchFx({
          overlays: fxDraft.overlays.map((o, k) =>
            k === idx ? { ...o, name: bind.name, at: bind.at, dur } : o,
          ),
        });
      } else if (kind === "shape") {
        patchFx({
          shapes: fxDraft.shapes.map((sh, k) =>
            k === idx ? { ...sh, name: bind.name, at: bind.at, dur } : sh,
          ),
        });
      }
    },
    [fxDraft, shots, offsets, layers, total, patchFx, flash],
  );

  const patchOverlayAt = useCallback(
    (idx: number, p: Partial<FxOverlay>) => {
      if (!fxDraft) return;
      patchFx({
        overlays: fxDraft.overlays.map((o, k) => (k === idx ? { ...o, ...p } : o)),
      });
    },
    [fxDraft, patchFx],
  );

  const patchShapeAt = useCallback(
    (idx: number, p: Partial<FxShape>) => {
      if (!fxDraft) return;
      patchFx({
        shapes: fxDraft.shapes.map((sh, k) => (k === idx ? { ...sh, ...p } : sh)),
      });
    },
    [fxDraft, patchFx],
  );

  const patchTextAt = useCallback(
    (idx: number, p: Partial<FxTextItem>) => {
      if (!fxDraft) return;
      patchFx({
        texts: fxDraft.texts.map((t, k) => (k === idx ? { ...t, ...p } : t)),
      });
    },
    [fxDraft, patchFx],
  );

  // ขยับทีละนิดด้วยลูกศร — ค่าที่เห็นบนจอกับใน fx.json เป็นก้อนเดียวกัน
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const movable = ["text", "sticker", "shape"];
      if (!focus || !movable.includes(focus.kind)) return false;
      const cur =
        focus.kind === "sticker"
          ? fxDraft?.overlays[focus.idx]
          : focus.kind === "shape"
            ? fxDraft?.shapes[focus.idx]
            : fxDraft?.texts[focus.idx];
      if (!cur) return false;
      const nx = Math.round(Math.min(1, Math.max(0, cur.x + dx)) * 1000) / 1000;
      const ny = Math.round(Math.min(1, Math.max(0, cur.y + dy)) * 1000) / 1000;
      if (focus.kind === "sticker") patchOverlayAt(focus.idx, { x: nx, y: ny });
      else if (focus.kind === "shape") patchShapeAt(focus.idx, { x: nx, y: ny });
      else patchTextAt(focus.idx, { x: nx, y: ny });
      return true;
    },
    [focus, fxDraft, patchOverlayAt, patchTextAt, patchShapeAt],
  );

  // ── ก๊อป-วางบล็อกบนไทม์ไลน์ ──
  //
  // **ก๊อปตัวชิ้น ไม่ใช่ตัวชี้** — เก็บสำเนาของ object ไว้เลย ไม่ใช่จำ (kind, idx)
  // ไว้แล้วไปอ่านตอนวาง เพราะระหว่างก๊อปกับวางคนลบ/สลับชิ้นได้ แล้ว idx เดิมจะชี้
  // ไปที่ของคนละตัวโดยไม่มีอะไรฟ้อง (บทเรียนเดียวกับกุญแจเอฟเฟกต์ที่ไม่ผูกกับลำดับ)
  //
  // เวลาถูกทิ้งตั้งแต่ตอนก๊อป — ที่วางมาจากหัวเล่นเสมอ ของที่ก๊อปไว้จึงเป็น
  // "หน้าตา + ความยาว" ล้วน ๆ ส่วน id ตั้งใหม่ให้เอนจินตอนบันทึก
  type ClipItem =
    | { kind: "text"; item: FxTextItem }
    | { kind: "sticker"; item: FxOverlay }
    | { kind: "shape"; item: FxShape }
    | { kind: "music"; item: MusicTrack };
  const [clipboard, setClipboard] = useState<ClipItem | null>(null);

  const copyLayerItem = useCallback(() => {
    if (!fxDraft || !focus) return;
    const { kind, idx } = focus;
    const row =
      kind === "text"
        ? fxDraft.texts[idx]
        : kind === "sticker"
          ? fxDraft.overlays[idx]
          : kind === "shape"
            ? fxDraft.shapes[idx]
            : kind === "music"
              ? fxDraft.music[idx]
              : null;
    if (!row) {
      return flash("เลเยอร์นี้ก๊อปไม่ได้ — ซับอัตโนมัติกับเสียงพูดเป็นของที่คำนวณมา");
    }
    setClipboard({ kind, item: { ...row } } as ClipItem);
    flash(`ก๊อปแล้ว — กด Cmd+V วางที่หัวเล่น (${dur(playhead)})`);
  }, [fxDraft, focus, playhead, flash]);

  const pasteLayerItem = useCallback(() => {
    if (!fxDraft || !clipboard) return flash("ยังไม่มีอะไรถูกก๊อป");
    const { kind, item } = clipboard;
    if (kind === "music") {
      const d = item.dur > 0 ? item.dur : Math.max(total - playhead, 1);
      if (overlapCount(layers.music, playhead, d) >= MAX_AUDIO_STACK) {
        return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      }
      patchFx({
        music: [
          ...fxDraft.music,
          { ...item, at: Math.round(playhead * 100) / 100, id: "" },
        ],
      });
      setFocus({ kind: "music", idx: fxDraft.music.length });
      return flash(`วางเพลง ${item.file} ที่ ${dur(playhead)}`);
    }
    const bind = tlToClip(shots, offsets, playhead);
    if (!bind) return flash("หัวเล่นอยู่นอกช่วงหนัง — วางไม่ได้");
    if (overlapCount(layers[kind], playhead, item.dur) >= MAX_STACK) {
      return flash(`ช่วงนี้ซ้อนครบ ${MAX_STACK} ชั้นแล้ว — เลื่อนหัวเล่นไปที่ว่างก่อน`);
    }
    // id ว่างเสมอ — id เดิมเป็นตัวชี้ของชิ้นต้นฉบับ (ซับจากบทพูดใช้ `tr:` จับคู่
    // กับบรรทัดที่ติ๊กไว้) สำเนาที่ถือ id เดิมจะกลายเป็นชิ้นที่สองที่อ้างว่าเป็น
    // บรรทัดเดียวกัน แล้วติ๊กออกทีเดียวหายไปทั้งคู่
    const row = { ...item, name: bind.name, at: bind.at, id: "" };
    if (kind === "text") {
      patchFx({ texts: [...fxDraft.texts, row as FxTextItem] });
      setFocus({ kind: "text", idx: fxDraft.texts.length });
    } else if (kind === "sticker") {
      patchFx({ overlays: [...fxDraft.overlays, row as FxOverlay] });
      setFocus({ kind: "sticker", idx: fxDraft.overlays.length });
    } else {
      patchFx({ shapes: [...fxDraft.shapes, row as FxShape] });
      setFocus({ kind: "shape", idx: fxDraft.shapes.length });
    }
    flash(`วางที่ ${bind.name} ${dur(playhead)} — กดบันทึกเมื่อจัดเสร็จ`);
  }, [fxDraft, clipboard, shots, offsets, layers, total, playhead, patchFx, flash]);

  // ── การ์ดลอยเหนือไทม์ไลน์ ──
  //
  // ไทม์ไลน์เป็นคนบอกว่าการ์ดต้องไปชี้ตรงไหน (เรขาคณิตอยู่ที่นั่น) ส่วนที่นี่เป็น
  // คนถือข้อมูล  ตัวกรองด้านล่างทิ้ง update ที่ค่าไม่ขยับจริง — ตอนเลื่อนไทม์ไลน์
  // ตัวบอกตำแหน่งยิงทุกเฟรม ถ้าปล่อยผ่านหมดจะ re-render ทั้งหน้า (208 ช็อต) ฟรี
  const [anchor, setAnchor] = useState<CardAnchor | null>(null);
  const onAnchor = useCallback((a: CardAnchor | null) => {
    setAnchor((prev) => {
      if (!a || !prev) return a === prev ? prev : a;
      return Math.abs(a.x - prev.x) < 0.5 &&
        Math.abs(a.top - prev.top) < 0.5 &&
        Math.abs(a.blockTop - prev.blockTop) < 0.5 &&
        Math.abs(a.blockBottom - prev.blockBottom) < 0.5 &&
        a.off === prev.off
        ? prev
        : a;
    });
  }, []);

  const card: CardItem | null = useMemo(() => {
    if (!fxDraft || !focus) return null;
    const { kind, idx } = focus;
    if (kind === "text" && fxDraft.texts[idx]) return { kind, item: fxDraft.texts[idx] };
    if (kind === "sticker" && fxDraft.overlays[idx]) return { kind, item: fxDraft.overlays[idx] };
    if (kind === "shape" && fxDraft.shapes[idx]) return { kind, item: fxDraft.shapes[idx] };
    if (kind === "music" && fxDraft.music[idx]) return { kind, item: fxDraft.music[idx] };
    return null; // ซับกับเสียงพูดเป็นของที่คำนวณมา แก้ไม่ได้
  }, [fxDraft, focus]);

  const patchLayerItem = useCallback(
    (kind: LayerKind, idx: number, p: Record<string, unknown>) => {
      if (!fxDraft) return;
      if (kind === "text") patchTextAt(idx, p as Partial<FxTextItem>);
      else if (kind === "sticker") patchOverlayAt(idx, p as Partial<FxOverlay>);
      else if (kind === "shape") patchShapeAt(idx, p as Partial<FxShape>);
      else if (kind === "music") {
        patchFx({
          music: fxDraft.music.map((m, k) => (k === idx ? { ...m, ...p } : m)),
        });
      }
    },
    [fxDraft, patchTextAt, patchOverlayAt, patchShapeAt, patchFx],
  );

  /** ไปชิ้นก่อนหน้า/ถัดไป *ตามลำดับบนไทม์ไลน์* ไม่ใช่ลำดับใน array
   *
   *  ลำดับใน array คือลำดับที่คนกดสร้าง ซึ่งไม่เกี่ยวกับที่มันไปโผล่ในหนังเลย —
   *  ปุ่ม "ถัดไป" ที่กระโดดข้ามไปคนละนาทีคือปุ่มที่ใช้ไล่ตรวจงานไม่ได้
   */
  const stepLayer = useCallback(
    (d: -1 | 1) => {
      if (!focus) return;
      const order = [...(layers[focus.kind] ?? [])]
        .filter((b) => !b.orphan)
        .sort((a, z) => a.tl - z.tl);
      const at = order.findIndex((b) => b.idx === focus.idx);
      const next = order[at + d];
      if (!next) return flash(d < 0 ? "ชิ้นแรกของเลนนี้แล้ว" : "ชิ้นสุดท้ายของเลนนี้แล้ว");
      setFocus({ kind: focus.kind, idx: next.idx });
      seek(next.tl);
    },
    [focus, layers, seek, flash],
  );

  /** เก็บหน้าตาของข้อความชิ้นหนึ่งเป็นชุดสไตล์ แล้วผูกชิ้นนั้นกับชุดที่เพิ่งสร้าง
   *
   *  อยู่ที่นี่เพราะกดได้จากสองที่ (ฟอร์มในแผง กับการ์ดลอย) — ประกอบชุดคนละที่
   *  แล้ววันหนึ่งจะมีปุ่มหนึ่งที่ลอกค่ามาไม่ครบโดยที่อีกปุ่มยังถูก
   *
   *  ลอกจากค่าที่ *รวมชุดแล้ว* ไม่ใช่ค่าดิบในชิ้น — ชิ้นที่ผูกชุดอื่นอยู่ก่อนแล้ว
   *  ต้องได้ชุดใหม่ที่หน้าตาเหมือนที่เห็นอยู่ ไม่ใช่ค่าเก่าที่ถูกทับไปนานแล้ว
   */
  const makePresetFromText = useCallback(
    (idx: number) => {
      if (!fxDraft || !fxData) return;
      const blank = fxData.defaults.preset as FxPreset | undefined;
      if (!blank) {
        return flash("เอนจินที่รันอยู่ยังไม่มีชุดสไตล์ — รีสตาร์ต ./vcut view แล้วลองใหม่");
      }
      const t = fxDraft.texts[idx];
      if (!t) return;
      const name = uniqueName(
        nameFromText(t.text),
        new Set(presets.map((x) => x.name)),
      );
      patchFx({
        presets: [
          ...presets,
          { ...blank, ...lookOf(resolveLook(t, presets, presetKeys), presetKeys), name },
        ],
        texts: fxDraft.texts.map((x, k) => (k === idx ? { ...x, preset: name } : x)),
      });
      flash(`สร้างชุด "${name}" จากชิ้นนี้แล้ว — แก้ที่ชุดในแท็บข้อความเพื่อเปลี่ยนทุกชิ้นที่ผูก`);
    },
    [fxDraft, fxData, presets, presetKeys, patchFx, flash],
  );

  const removeLayerItem = useCallback(
    (kind: LayerKind, idx: number) => {
      if (!fxDraft) return;
      if (kind === "music") patchFx({ music: fxDraft.music.filter((_, k) => k !== idx) });
      else if (kind === "text") patchFx({ texts: fxDraft.texts.filter((_, k) => k !== idx) });
      else if (kind === "sticker")
        patchFx({ overlays: fxDraft.overlays.filter((_, k) => k !== idx) });
      else if (kind === "shape")
        patchFx({ shapes: fxDraft.shapes.filter((_, k) => k !== idx) });
      setFocus(null);
    },
    [fxDraft, patchFx],
  );

  // ตัวหนังสือบนจอทุกชนิดไปแท็บเดียวกันแล้ว — ทั้งข้อความที่วางเองและซับจากบทพูด
  const KIND_TAB: Record<string, Tab> = {
    text: "text",
    sticker: "stickers",
    shape: "stickers",
    music: "music",
    caption: "text",
    speech: "cc",
  };
  const selectLayerItem = useCallback((kind: LayerKind, idx: number) => {
    setFocus({ kind, idx });
    setSel(null); // ปุ่ม Delete จะได้ชี้ที่บล็อกเลเยอร์ ไม่ใช่ช็อตที่ค้างเลือกไว้
    setTab(KIND_TAB[kind] ?? "text");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // สร้างของใหม่ ณ เวลาบนไทม์ไลน์ (จากปุ่ม "ที่หัวเล่น" หรือจากการลากมาปล่อย)
  const addTextAt = useCallback(
    (tl: number, text?: string) => {
      if (!fxDraft || !fxData) return;
      const bind = tlToClip(shots, offsets, tl);
      if (!bind) return flash("ตำแหน่งนี้อยู่นอกช่วงหนัง");
      if (overlapCount(layers.text, tl, 2.0) >= MAX_STACK) {
        return flash(`ช่วงนี้มีข้อความซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      }
      patchFx({
        texts: [
          ...fxDraft.texts,
          {
            ...(fxData.defaults.text_item as Omit<FxTextItem, "at" | "dur" | "id" | "name" | "lines">),
            ...(text ? { text } : {}),
            at: bind.at,
            dur: 2.0,
            name: bind.name,
            id: "",
            lines: [],
          },
        ],
      });
      setFocus({ kind: "text", idx: fxDraft.texts.length });
      flash(`วางข้อความที่ ${bind.name} — แก้เนื้อหาในแท็บข้อความ แล้วกดบันทึก`);
    },
    [fxDraft, fxData, shots, offsets, layers, patchFx, flash],
  );

  const addStickerAt = useCallback(
    (tl: number, file: string) => {
      if (!fxDraft || !fxData) return;
      const bind = tlToClip(shots, offsets, tl);
      if (!bind) return flash("ตำแหน่งนี้อยู่นอกช่วงหนัง");
      if (overlapCount(layers.sticker, tl, 2.5) >= MAX_STACK) {
        return flash(`ช่วงนี้มีภาพซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      }
      patchFx({
        overlays: [
          ...fxDraft.overlays,
          {
            ...(fxData.defaults.overlay as Omit<FxOverlay, "at" | "dur" | "id" | "name">),
            file,
            at: bind.at,
            dur: 2.5,
            name: bind.name,
            id: "",
          },
        ],
      });
      setFocus({ kind: "sticker", idx: fxDraft.overlays.length });
      flash(`วาง ${file} ที่ ${bind.name} — กดบันทึก FX เมื่อจัดเสร็จ`);
    },
    [fxDraft, fxData, shots, offsets, layers, patchFx, flash],
  );

  const addShapeAt = useCallback(
    (tl: number, kind: string) => {
      if (!fxDraft || !fxData) return;
      const bind = tlToClip(shots, offsets, tl);
      if (!bind) return flash("ตำแหน่งนี้อยู่นอกช่วงหนัง");
      if (overlapCount(layers.shape, tl, 2.0) >= MAX_STACK) {
        return flash(`ช่วงนี้มีรูปทรงซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      }
      patchFx({
        shapes: [
          ...fxDraft.shapes,
          {
            ...(fxData.defaults.shape as Omit<FxShape, "at" | "dur" | "id" | "name">),
            kind,
            // แถบมุมมนเป็นพื้นของชิปตัวเลข ไม่ใช่ของที่ชี้ไปที่อะไร — วางแล้วต้อง
            // อยู่ใต้ข้อความตั้งแต่แรก ไม่งั้นมันบังสิ่งที่มันมีไว้รองพอดี
            behind: kind === "rrect",
            at: bind.at,
            dur: 2.0,
            name: bind.name,
            id: "",
          },
        ],
      });
      setFocus({ kind: "shape", idx: fxDraft.shapes.length });
      flash(
        `วาง${fxData.defaults.shape_kind[kind] ?? kind}ที่ ${bind.name} — ` +
          "ลากบนจอตัวอย่างเพื่อจัดตำแหน่ง แล้วกดบันทึก",
      );
    },
    [fxDraft, fxData, shots, offsets, layers, patchFx, flash],
  );

  // สติกเกอร์ตัวอย่างอยู่ใน public/stickers ของ UI — เอนจินอ่านจากคลัง assets ของ
  // โปรเจกต์ที่เดียว ครั้งแรกที่ใช้จึงต้องยกไฟล์เข้าคลังก่อน แล้วค่อยวางด้วย
  // ขนาด/ตำแหน่งที่ติดมากับแบบนั้น (แบดจ์เกาะมุม · แถบนอนล่าง · กรอบเต็มจอ)
  const addStickerSampleAt = useCallback(
    async (tl: number, file: string) => {
      if (!fxDraft || !fxData) return;
      const def = STICKER_LIST.find((s) => s.file === file);
      if (!def) return;
      const bind = tlToClip(shots, offsets, tl);
      if (!bind) return flash("ตำแหน่งนี้อยู่นอกช่วงหนัง");
      if (overlapCount(layers.sticker, tl, 2.5) >= MAX_STACK) {
        return flash(`ช่วงนี้มีภาพซ้อนครบ ${MAX_STACK} ชั้นแล้ว`);
      }
      let actual = file;
      try {
        if (!fxData.overlay.assets.some((a) => a.file === file)) {
          const blob = await (await fetch(stickerUrl(file))).blob();
          const b64 = await fileToBase64(new File([blob], file));
          const r = await api2.saveAsset(file, b64, "media");
          setFxData(r.fx);
          // เอนจินอาจเปลี่ยนชื่อตอนชนไฟล์เดิม — ต้องชี้ชื่อจริง ไม่งั้นภาพไม่ขึ้น
          actual = r.file || file;
        }
      } catch (e) {
        return flash(e instanceof Error ? e.message : "เพิ่มรูปเข้าคลังไม่สำเร็จ");
      }
      patchFx({
        overlays: [
          ...fxDraft.overlays,
          {
            ...(fxData.defaults.overlay as Omit<FxOverlay, "at" | "dur" | "id" | "name">),
            ...(def.anim ? { anim: def.anim } : {}),
            file: actual,
            width: def.width,
            x: def.x,
            y: def.y,
            at: bind.at,
            dur: 2.5,
            name: bind.name,
            id: "",
          },
        ],
      });
      setFocus({ kind: "sticker", idx: fxDraft.overlays.length });
      flash(`วาง ${def.label} ที่ ${bind.name} — ลากบนจอตัวอย่างเพื่อจัดตำแหน่งต่อได้`);
    },
    [fxDraft, fxData, shots, offsets, layers, patchFx, flash],
  );

  const addMusicAt = useCallback(
    (tl: number, file: string) => {
      if (!fxDraft || !fxData) return;
      const d = fxData.music.defaults.dur;
      const effDur = d > 0 ? d : Math.max(total - tl, 1);
      if (overlapCount(layers.music, tl, effDur) >= MAX_AUDIO_STACK) {
        return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      }
      patchFx({
        music: [
          ...fxDraft.music,
          {
            ...fxData.music.defaults,
            file,
            at: Math.max(0, Math.round(tl * 100) / 100),
            id: "",
          },
        ],
      });
      setFocus({ kind: "music", idx: fxDraft.music.length });
      flash(`วางเพลง ${file} ที่ ${tl.toFixed(1)} วิ — กดบันทึก FX เมื่อจัดเสร็จ`);
    },
    [fxDraft, fxData, layers, total, patchFx, flash],
  );

  // ไฟล์ตัวอย่างของหน้าเว็บ (public/sfx · public/bgm) เข้าคลังของโปรเจกต์
  // ครั้งแรกที่ใช้ — เอนจินอ่านจากโฟลเดอร์ assets เท่านั้น ไม่รู้จัก public/ เลย
  // คืนชื่อไฟล์จริงในคลัง (เอนจินเปลี่ยนชื่อได้ตอนชนไฟล์เดิม — แทร็กต้องชี้ชื่อ
  // ที่เอนจินตอบกลับมา ไม่งั้นได้แทร็กที่ไม่มีไฟล์แล้วเงียบไปตอน export)
  const ensureAsset = useCallback(
    async (file: string, url: string) => {
      if (fxData?.music.tracks.includes(file)) return file;
      const blob = await (await fetch(url)).blob();
      const b64 = await fileToBase64(new File([blob], file));
      const r = await api2.saveAsset(file, b64, "audio");
      setFxData(r.fx);
      return r.file || file;
    },
    [fxData],
  );

  // เสียงเอฟเฟกต์ตัวอย่าง — วางเป็นแทร็กเพลงแบบ "เสียงสั้น": ยาวเท่าไฟล์ ไม่วน
  // ไม่หลบเสียงพูด (เสียงสั้นที่หลบเองจะหายไปทั้งเสียงตอนวางทับคนพูด)
  const addSfxAt = useCallback(
    async (tl: number, file: string, dur: number, loop = false) => {
      if (!fxDraft || !fxData) return;
      if (overlapCount(layers.music, tl, dur) >= MAX_AUDIO_STACK) {
        return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      }
      let actual = file;
      try {
        actual = await ensureAsset(file, sfxUrl(file));
      } catch (e) {
        return flash(e instanceof Error ? e.message : "เพิ่มไฟล์เสียงเข้าคลังไม่สำเร็จ");
      }
      patchFx({
        music: [
          ...fxDraft.music,
          {
            ...fxData.music.defaults,
            file: actual,
            at: Math.max(0, Math.round(tl * 100) / 100),
            dur,
            loop,
            duck: false,
            fade_in: 0,
            fade_out: 0,
            gain_db: -6,
            id: "",
          },
        ],
      });
      setFocus({ kind: "music", idx: fxDraft.music.length });
      flash(`วางเสียง ${file} ที่ ${tl.toFixed(1)} วิ — กดบันทึก FX เมื่อจัดเสร็จ`);
    },
    [fxDraft, fxData, layers, patchFx, flash, ensureAsset],
  );

  // เพลงคลอตัวอย่าง — ขึ้นคลังเหมือนเสียงเอฟเฟกต์ แต่วางด้วยค่าตั้งต้นของ *เพลง*
  // (ยาวจนจบเรื่อง · วนซ้ำ · หลบเสียงพูด) ซึ่งก็คือค่าตั้งต้นของเอนจินอยู่แล้ว
  // จึงไม่ต้องทับอะไรเลยนอกจากชื่อไฟล์ — ต่างจาก addSfxAt ที่ต้องทับห้าช่อง
  const addBgmAt = useCallback(
    async (tl: number, file: string) => {
      if (!fxDraft || !fxData) return;
      const d = fxData.music.defaults.dur;
      const effDur = d > 0 ? d : Math.max(total - tl, 1);
      if (overlapCount(layers.music, tl, effDur) >= MAX_AUDIO_STACK) {
        return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      }
      let actual = file;
      try {
        actual = await ensureAsset(file, bgmUrl(file));
      } catch (e) {
        return flash(e instanceof Error ? e.message : "เพิ่มเพลงเข้าคลังไม่สำเร็จ");
      }
      patchFx({
        music: [
          ...fxDraft.music,
          {
            ...fxData.music.defaults,
            file: actual,
            at: Math.max(0, Math.round(tl * 100) / 100),
            id: "",
          },
        ],
      });
      setFocus({ kind: "music", idx: fxDraft.music.length });
      flash(
        `วางเพลง ${bgmLabel(file) ?? file} ที่ ${tl.toFixed(1)} วิ — วนซ้ำจนจบเรื่อง`,
      );
    },
    [fxDraft, fxData, layers, total, patchFx, flash, ensureAsset],
  );

  // ชิ้นเต็มคลิปหนึ่งชิ้น — ยังไม่มีไฟล์ตัด (seg: null) จนกว่าจะบันทึกแล้ว render
  const pieceOf = useCallback(
    (c: ClipInfo): Shot => ({
      i: -1,
      name: c.name,
      kind: "BROLL",
      start: 0,
      end: Math.round(c.dur * 1000) / 1000,
      dur: Math.round(c.dur * 1000) / 1000,
      clip_dur: c.dur,
      orient: c.orient,
      rot: c.rot,
      text: "",
      motion: c.motion,
      bright: c.bright,
      chapter: "",
      chapter_title: "",
      ai_score: null,
      gain: null,
      limiter: null,
      seg: null,
    }),
    [],
  );

  const addClip = useCallback(
    (c: ClipInfo) => {
      mutate((prev) => [...prev, pieceOf(c)]);
      flash(`เพิ่ม ${c.name} ต่อท้ายแล้ว — บันทึก EDL แล้ว render เพื่อตัด`);
    },
    [mutate, pieceOf, flash],
  );

  /** ลากคลิปจากคลังมาปล่อยบนไทม์ไลน์ — แทร็กวิดีโอเรียงติดกันไม่มีช่องว่าง
   *  วินาทีที่ปล่อยจึงแปลเป็น "แทรกก่อนชิ้นไหน" โดยใช้กึ่งกลางชิ้นเป็นเส้นแบ่ง */
  const insertClipAt = useCallback(
    (tl: number, name: string) => {
      const c = clips.find((x) => x.name === name);
      if (!c) return flash(`ไม่พบ ${name} ในคลังแล้ว`);
      let at = shots.length;
      for (let i = 0; i < shots.length; i++) {
        if (tl < offsets[i] + shots[i].dur / 2) {
          at = i;
          break;
        }
      }
      mutate((prev) => [...prev.slice(0, at), pieceOf(c), ...prev.slice(at)]);
      setSel(at);
      flash(`แทรก ${c.name} เป็นชิ้นที่ ${at + 1} — บันทึก EDL แล้ว render เพื่อตัด`);
    },
    [clips, shots, offsets, mutate, pieceOf, flash],
  );

  const togglePick = useCallback(
    async (c: ClipInfo) => {
      // ส่งรายการ "ไม่เอา" เต็มชุดเสมอ — เอนจินเขียนทับคีย์ scan.exclude ทั้งคีย์
      const exclude = clips
        .filter((x) => (x.name === c.name ? c.picked : !x.picked))
        .map((x) => x.name);
      try {
        const r = await api.saveClips({ exclude });
        // คำตอบพกลำดับของเอนจินมาด้วย — ถ้ามีลำดับร่างที่ยังไม่บันทึกค้างอยู่
        // แล้วเอามาทับทั้งก้อน สิ่งที่เพิ่งลากจัดไว้จะหายไปเงียบ ๆ
        setClips((prev) =>
          orderDirty
            ? prev.map((x) => ({ ...x, picked: !exclude.includes(x.name) }))
            : r.clips.clips,
        );
        flash(
          c.picked
            ? `พัก ${c.name} ไว้ — ไม่เข้าหนังตอนจัดใหม่ ไฟล์ยังอยู่`
            : `เอา ${c.name} กลับมาใช้แล้ว`,
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    },
    [clips, orderDirty, flash],
  );

  /** ลากสลับในคลัง — แก้แค่ของบนจอ ยังไม่เขียนอะไรลงไฟล์โปรเจกต์
   *
   *  ของเดิมยิงบันทึกทุกครั้งที่ปล่อยการ์ด ลากสิบทีคือเขียน .toml สิบรอบ
   *  (แล้วเอนจินโหลด config ใหม่ทุกรอบ) และไม่มีจังหวะให้ทบทวนหรือยกเลิกเลย
   */
  const reorderClips = useCallback((from: number, to: number) => {
    setClips((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
    setOrderDirty(true);
  }, []);

  const saveClipOrder = useCallback(async () => {
    try {
      const r = await api.saveClips({
        order: clips.map((c) => c.name),
        exclude: clips.filter((c) => !c.picked).map((c) => c.name),
      });
      setClips(r.clips.clips);
      setOrderDirty(false);
      flash("บันทึกลำดับคลังลงไฟล์โปรเจกต์แล้ว");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ");
    }
  }, [clips, flash]);

  const revertClipOrder = useCallback(async () => {
    try {
      const r = await api.clips();
      setClips(r.clips);
      setOrderDirty(false);
      flash("ทิ้งลำดับที่จัดไว้ กลับไปใช้ของเดิม");
    } catch (e) {
      flash(e instanceof Error ? e.message : "โหลดลำดับเดิมไม่สำเร็จ");
    }
  }, [flash]);

  const deleteClip = useCallback(
    async (c: ClipInfo) => {
      try {
        const r = await api.deleteClip(c.name);
        setClips(r.clips.clips);
        if (r.dropped > 0) {
          // เอนจินตัดชิ้นของคลิปนี้ออกจาก edl.json ให้แล้ว — ของบนจอต้องตามให้ตรง
          // และประวัติย้อนกลับเดิมใช้ต่อไม่ได้ เพราะมันพาชิ้นที่ไม่มีไฟล์ต้นฉบับ
          // แล้วกลับมา ซึ่งจะบันทึกไม่ผ่านด่านตรวจของเอนจินอีกต่อไป
          setShots((prev) => prev.filter((s) => s.name !== c.name));
          setSel(null);
          clearHistory();
        }
        api.trash().then((t) => setTrash(t.items)).catch(() => {});
        const how =
          r.kind === "link" ? "ถอดลิงก์แล้ว (ไฟล์ต้นทางไม่ถูกแตะ)" : "ย้ายเข้าถังขยะแล้ว";
        flash(
          r.dropped > 0
            ? `${c.name} ${how} — เอาออกจากไทม์ไลน์ ${r.dropped} ชิ้นด้วย`
            : `${c.name} ${how}`,
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : "เอาคลิปออกไม่สำเร็จ");
      }
    },
    [clearHistory, flash],
  );

  const linkClips = useCallback(
    async (path: string) => {
      try {
        const r = await api.linkClips(path);
        const skip = r.skipped.length ? ` · ข้าม ${r.skipped.length}` : "";
        flash(`อ้างอิง ${r.linked.length} คลิป${skip} — กำลังอ่านเข้าคลัง`);
        runJob("scan");
      } catch (e) {
        flash(e instanceof Error ? e.message : "อ้างอิงไฟล์ไม่สำเร็จ");
      }
    },
    [runJob, flash],
  );

  const restoreClip = useCallback(
    async (name: string) => {
      try {
        const r = await api.restoreClip(name);
        setTrash(r.trash.items);
        flash(`กู้ ${name} กลับมาแล้ว — กำลังอ่านเข้าคลัง (ยังไม่กลับขึ้นไทม์ไลน์)`);
        runJob("scan");
      } catch (e) {
        flash(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ");
      }
    },
    [runJob, flash],
  );

  const purgeClip = useCallback(
    async (name?: string) => {
      try {
        const r = await api.purgeClip(name);
        setTrash(r.trash.items);
        flash(`ทิ้งถาวรแล้ว ${r.purged.length} คลิป`);
      } catch (e) {
        flash(e instanceof Error ? e.message : "เทถังขยะไม่สำเร็จ");
      }
    },
    [flash],
  );

  /** ตั้งโหมดพอดีเฟรมของคลิปหนึ่ง — "" = กลับไปใช้ค่ากลางของเรื่อง
   *
   *  ส่งทั้งตารางเสมอด้วยเหตุผลเดียวกับ togglePick: เอนจินเขียนคีย์
   *  video.vertical_overrides ทับทั้งคีย์ ส่งมาแค่ตัวที่เปลี่ยนแปลว่าตัวอื่นหาย
   */
  const setVMode = useCallback(
    async (c: ClipInfo, mode: string) => {
      const table: Record<string, string> = {};
      for (const x of clips) {
        const v = x.name === c.name ? mode : x.vmode;
        if (v) table[x.name] = v;
      }
      // ตัวที่เพิ่งถูกล้างต้องส่งค่าว่างไปด้วย ไม่ใช่หายไปจากตาราง — เอนจินลบ
      // บรรทัดทิ้งให้เองเมื่อค่าว่าง (clips.write_keys) แต่ต้องรู้ว่ามีตัวนี้อยู่
      if (!mode) table[c.name] = "";
      try {
        const r = await api.saveClips({ vmodes: table });
        setClips((prev) =>
          orderDirty
            ? prev.map((x) =>
                x.name === c.name
                  ? { ...x, vmode: mode, vmode_eff: mode || vmodeDefault }
                  : x,
              )
            : r.clips.clips,
        );
        // ชิ้นที่ตัดไว้แล้วถูกตัดใหม่ตอน Export เพราะโหมดฝังอยู่ในกุญแจแคชของชิ้น
        flash(
          mode
            ? `${c.name} → ${vmodes.find((v) => v.value === mode)?.label ?? mode} · กด Export เพื่อตัดใหม่`
            : `${c.name} กลับไปใช้ค่ากลางของเรื่องแล้ว`,
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : "บันทึกโหมดไม่สำเร็จ");
      }
    },
    [clips, orderDirty, vmodes, vmodeDefault, flash],
  );

  const previewClip = useCallback(
    (c: ClipInfo) => {
      const v = videoRef.current;
      if (!v) return;
      modeRef.current = "clip";
      setPlaying(false);
      // ถ้าคลิปนี้มีชิ้นที่ตัดแล้ว ใช้ไฟล์ชิ้น (โคเดกเล่นในเบราว์เซอร์ได้แน่)
      const done = shots.find((s) => s.name === c.name && s.seg);
      v.src = done ? segUrl(done.seg as string) : clipUrl(c.name);
      v.play().then(() => setPlaying(true)).catch(() => flash(`เบราว์เซอร์เล่นโคเดกของ ${c.name} ไม่ได้ — ตัดก่อนถึงจะดูได้`));
    },
    [shots, flash],
  );

  const dropOnTimeline = useCallback(
    (p: DropPayload, tl: number) => {
      if (p.type === "music-file") addMusicAt(tl, p.file);
      else if (p.type === "sfx") addSfxAt(tl, p.file, p.dur, p.loop);
      else if (p.type === "bgm") addBgmAt(tl, p.file);
      else if (p.type === "sticker") addStickerAt(tl, p.file);
      else if (p.type === "sticker-sample") addStickerSampleAt(tl, p.file);
      else if (p.type === "shape") addShapeAt(tl, p.kind);
      else if (p.type === "text-new") addTextAt(tl, p.text);
      else if (p.type === "clip") insertClipAt(tl, p.name);
    },
    [addMusicAt, addSfxAt, addBgmAt, addStickerAt, addStickerSampleAt, addShapeAt,
     addTextAt, insertClipAt],
  );

  // ── บันทึก EDL กลับเข้าเอนจิน ──
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveEdl(
        shots.map((s) => ({
          name: s.name,
          start: s.start,
          end: s.end,
          kind: s.kind,
        })),
      );
      await refresh();
      flash("บันทึก edl.json แล้ว (ของเดิมสำรองไว้ที่ edl.prev.json)");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [shots, refresh, flash]);

  const zoomFit = useCallback(() => {
    setPxPerSec(
      total > 0
        ? Math.min(120, Math.max(2, (window.innerWidth - 220) / total))
        : 10,
    );
  }, [total]);

  // Cmd+S — บันทึกทุกอย่างที่ค้างในครั้งเดียว
  const saveAll = useCallback(() => {
    if (!dirty && !fxDirty && !capDirty) return flash("ไม่มีอะไรค้างบันทึก");
    if (dirty) save();
    if (fxDirty) saveFx();
    if (capDirty) saveCaps();
  }, [dirty, fxDirty, capDirty, save, saveFx, saveCaps, flash]);

  // ── คีย์ลัด ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      } else if (mod && e.key.toLowerCase() === "c") {
        // ก๊อปช็อตยังไม่มี — Cmd+C จึงเป็นของบล็อกเลเยอร์อย่างเดียว ปล่อยผ่าน
        // ตอนไม่ได้เลือกบล็อกไว้ เพื่อไม่ไปทับการก๊อปข้อความปกติของเบราว์เซอร์
        if (focus) {
          e.preventDefault();
          copyLayerItem();
        }
      } else if (mod && e.key.toLowerCase() === "v") {
        if (clipboard) {
          e.preventDefault();
          pasteLayerItem();
        }
      } else if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // บล็อกเลเยอร์ที่เลือกอยู่มาก่อนช็อต
        if (
          focus &&
          (focus.kind === "text" ||
            focus.kind === "sticker" ||
            focus.kind === "music")
        ) {
          removeLayerItem(focus.kind, focus.idx);
        } else if (sel != null) {
          removeShot(sel);
        }
      } else if (!mod && (e.key === "s" || e.key === "S")) {
        split();
      } else if (e.key === "-" || e.key === "_") {
        setPxPerSec((p) => Math.max(2, p / 1.3));
      } else if (e.key === "=" || e.key === "+") {
        setPxPerSec((p) => Math.min(120, p * 1.3));
      } else if (e.key === "0") {
        zoomFit();
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
  }, [
    toggle,
    sel,
    focus,
    removeShot,
    removeLayerItem,
    split,
    undo,
    redo,
    saveAll,
    zoomFit,
    nudge,
    clipboard,
    copyLayerItem,
    pasteLayerItem,
  ]);

  // ── จอสถานะพิเศษ ──
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="mr-2 animate-spin" size={16} /> กำลังโหลด…
      </div>
    );
  }
  if (offline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel-2">
          <PlugZap size={22} className="text-warn" />
        </div>
        <div className="text-[15px] font-medium">ต่อกับ vcut engine ไม่ได้</div>
        <div className="text-center text-[12.5px] leading-6 text-muted">
          เปิดเซิร์ฟเวอร์ของเอนจินก่อน แล้วค่อยกดลองใหม่
          <br />
          <code className="rounded bg-panel-2 px-2 py-0.5 font-mono text-[12px] text-ink">
            ./vcut view -c projects/&lt;โปรเจกต์&gt;.toml --no-browser
          </code>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            refresh();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-medium text-white hover:bg-accent-2"
        >
          <RefreshCw size={13} /> ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        project={proj?.project ?? "โปรเจกต์"}
        tab={tab}
        onTab={setTab}
        dirty={dirty}
        needRender={needRender}
        saving={saving}
        onSave={save}
        onRevert={refresh}
        fxDirty={fxDirty}
        fxSaving={fxSaving}
        onSaveFx={saveFx}
        onRevertFx={loadFx}
        job={job}
        onRun={runJob}
        onStop={() => api.stopJob()}
        outExists={!!proj?.out_exists}
        outStale={!!proj?.out_stale}
      />

      <div className="flex min-h-0 flex-1 gap-2 px-2 pt-2">
        {tab === "assets" && (
          <AssetsPanel
            clips={clips}
            usage={usage}
            onAdd={addClip}
            onPreview={previewClip}
            onScan={() => runJob("scan")}
            trash={trash}
            onDelete={deleteClip}
            onLink={linkClips}
            onRestore={restoreClip}
            onPurge={purgeClip}
            onTogglePick={togglePick}
            vmodes={vmodes}
            vmodeDefault={vmodeDefault}
            onVMode={setVMode}
            frame={frame}
            onReorder={reorderClips}
            orderDirty={orderDirty}
            onSaveOrder={saveClipOrder}
            onRevertOrder={revertClipOrder}
            busy={!!job?.running}
            flash={flash}
          />
        )}
        {tab === "text" && (
          <TextPanel
            fxs={fxs}
            caps={caps}
            speech={speechLines}
            onAddAtPlayhead={(t) => addTextAt(playhead, t)}
            focusIdx={focus?.kind === "text" ? focus.idx : null}
            stageEdit={posEdit}
            onStageEdit={(i) => {
              setSel(null);
              setFocus({ kind: "text", idx: i });
              setPosEdit(true);
            }}
            onGotoSpeech={() => setTab("cc")}
            onMakePreset={makePresetFromText}
            blocks={layers.text}
            flash={flash}
          />
        )}
        {tab === "music" && (
          <MusicPanel
            fxs={fxs}
            onMusicFetch={musicFetch}
            onAddAtPlayhead={(f) => addMusicAt(playhead, f)}
            onAddSfxAtPlayhead={(f, d, lp) => addSfxAt(playhead, f, d, lp)}
            onAddBgmAtPlayhead={(f) => addBgmAt(playhead, f)}
            onToggleMixer={() => setMixerOpen((o) => !o)}
            focusIdx={focus?.kind === "music" ? focus.idx : null}
            beats={beats}
            beatBusy={beatBusy}
            showBeats={showBeats}
            onReadBeats={loadBeats}
            onToggleBeats={() => setShowBeats((v) => !v)}
            onSnapBeats={snapToBeats}
            flash={flash}
          />
        )}
        {tab === "stickers" && (
          <StickerPanel
            fxs={fxs}
            onPlaceAtPlayhead={(f) => addStickerAt(playhead, f)}
            onPlaceSampleAtPlayhead={(f) => addStickerSampleAt(playhead, f)}
            onPlaceShapeAtPlayhead={(k) => addShapeAt(playhead, k)}
            focusIdx={focus?.kind === "sticker" ? focus.idx : null}
            shapeFocusIdx={focus?.kind === "shape" ? focus.idx : null}
            onPatchShape={patchShapeAt}
            onRemoveShape={(i) => removeLayerItem("shape", i)}
            onShapeStageEdit={(i) => {
              setSel(null);
              setFocus({ kind: "shape", idx: i });
              setPosEdit(true);
            }}
            frame={frame}
            stageEdit={posEdit}
            onStageEdit={(i) => {
              setSel(null);
              setFocus({ kind: "sticker", idx: i });
              setPosEdit(true);
            }}
            flash={flash}
          />
        )}
        {tab === "cc" && (
          <TranscriptPanel speech={speechLines} fxs={fxs} />
        )}
        {tab === "review" && (
          <ReviewPanel
            reloadKey={reloadKey}
            busy={!!job?.running}
            onRun={runReview}
            applyOps={applyReviewOps}
            flash={flash}
          />
        )}
        {tab === "pipeline" && (
          <PipelinePanel reloadKey={reloadKey} job={job} onRun={runJob} />
        )}
        {tab === "setup" && (
          <SetupPanel reloadKey={reloadKey} flash={flash} />
        )}
        <Preview
          videoRef={videoRef}
          stageRef={stageRef}
          playing={playing}
          playhead={playhead}
          total={total}
          onToggle={toggle}
          notice={notice}
          overlay={overlayData}
          frame={frame}
          onLayout={applyLayout}
          edit={posEdit}
          onEdit={setPosEdit}
          focus={focus}
          onSelect={(k, i) => selectLayerItem(k, i)}
          onClearSel={() => setFocus(null)}
          onPatchSticker={patchOverlayAt}
          onPatchText={patchTextAt}
          onPatchShape={patchShapeAt}
          clipFx={playheadFx}
          clipAt={playheadAt}
        />
        <MusicMixer
          tracks={fxDraft?.music ?? []}
          playing={playing}
          playhead={playhead}
          total={total}
        />
        {mixerOpen && (
          <MixerPanel
            tracks={fxDraft?.music ?? []}
            focusIdx={focus?.kind === "music" ? focus.idx : null}
            onGain={(i, db) =>
              fxDraft &&
              patchFx({
                music: fxDraft.music.map((m, k) =>
                  k === i ? { ...m, gain_db: db } : m,
                ),
              })
            }
            onSelect={(i) => selectLayerItem("music", i)}
            onClose={() => setMixerOpen(false)}
          />
        )}
        <Properties
          shot={sel != null ? (shots[sel] ?? null) : null}
          onPatch={(p) => sel != null && patchShot(sel, p)}
          onRemove={() => sel != null && removeShot(sel)}
          onPlayShot={() => sel != null && play(offsets[sel])}
          onClose={() => setSel(null)}
          fx={sel != null ? fxOfShot(sel) : null}
          fxBase={fxData?.defaults.clip ?? null}
          grade={fxData?.defaults.grade ?? {}}
          pan={fxData?.defaults.pan ?? {}}
          split={fxData?.defaults.split ?? {}}
          clipNames={clips.map((c) => c.name)}
          onFx={(p) => sel != null && setShotFx(sel, p)}
        />
      </div>

      <div className="p-2">
        <Timeline
          shots={shots}
          offsets={offsets}
          total={total}
          selected={sel}
          playhead={playhead}
          pxPerSec={pxPerSec}
          onZoom={setPxPerSec}
          onSelect={(i) => {
            setSel(i);
            if (i != null) setFocus(null);
          }}
          onSeek={seek}
          onReorder={reorder}
          onRemove={removeShot}
          onSplit={split}
          onDuplicate={duplicate}
          layers={layers}
          vis={vis}
          onVis={(k) => setVis((v) => ({ ...v, [k]: !v[k] }))}
          canUndo={histVer >= 0 && undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
          onUndo={undo}
          onRedo={redo}
          layerSel={focus}
          onLayerSelect={selectLayerItem}
          onLayerChange={changeLayerItem}
          onLayerRemove={removeLayerItem}
          onDropPayload={(p, tl) => dropOnTimeline(p as DropPayload, tl)}
          beats={showBeats ? beats : null}
          canCopyLayer={!!focus}
          canPasteLayer={!!clipboard}
          onCopyLayer={copyLayerItem}
          onPasteLayer={pasteLayerItem}
          onAnchor={onAnchor}
        />
      </div>

      {card && anchor && focus && (
        <BlockCard
          sel={card}
          anchor={anchor}
          videoRef={videoRef}
          name={card.kind === "music" ? "" : card.item.name}
          tl={
            (layers[focus.kind] ?? []).find((b) => b.idx === focus.idx)?.tl ?? 0
          }
          animOpts={animOpts}
          presetOf={
            card.kind === "text" && presets.some((p) => p.name === card.item.preset)
              ? card.item.preset
              : undefined
          }
          onPatch={(p) => patchLayerItem(focus.kind, focus.idx, p)}
          onRemove={() => removeLayerItem(focus.kind, focus.idx)}
          onClose={() => setFocus(null)}
          onStep={stepLayer}
          onOpenPanel={() => selectLayerItem(focus.kind, focus.idx)}
          onMakePreset={
            card.kind === "text" ? () => makePresetFromText(focus.idx) : undefined
          }
        />
      )}

      {jobOpen && job && (
        <JobPanel
          job={job}
          lines={jobLines}
          onStop={() => api.stopJob()}
          onClose={() => setJobOpen(false)}
        />
      )}
    </div>
  );
}
