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
  type CaptionsData,
  type ClipInfo,
  type FxData,
  type FxOverlay,
  type FxTextItem,
  type JobState,
  type MusicTrack,
  type ProjectState,
  type ReviewOp,
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
  speechBlocks,
  stickerBlocks,
  textBlocks,
  tlToClip,
  type DropPayload,
  type LayerKind,
} from "@/lib/layers";
import { SFX_LIST, sfxUrl } from "@/lib/sfx";
import { STICKER_LIST, stickerUrl } from "@/lib/stickers";
import type { CapDraft } from "@/components/panels/types";
import TopBar from "@/components/TopBar";
import { type Tab } from "@/components/TabNav";
import AssetsPanel from "@/components/AssetsPanel";
import Preview from "@/components/Preview";
import MusicMixer from "@/components/MusicMixer";
import MixerPanel from "@/components/MixerPanel";
import Properties from "@/components/Properties";
import Timeline from "@/components/Timeline";
import JobPanel from "@/components/JobPanel";
import TextPanel from "@/components/panels/TextPanel";
import MusicPanel from "@/components/panels/MusicPanel";
import StickerPanel from "@/components/panels/StickerPanel";
import TranscriptPanel from "@/components/panels/TranscriptPanel";
import ReviewPanel from "@/components/panels/ReviewPanel";
import SetupPanel from "@/components/panels/SetupPanel";

export default function Editor() {
  const [proj, setProj] = useState<ProjectState | null>(null);
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const [shots, setShots] = useState<Shot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const [job, setJob] = useState<JobState | null>(null);
  const [jobLines, setJobLines] = useState<string[]>([]);
  const [jobOpen, setJobOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("assets");
  // เด้งขึ้นทุกครั้งที่งานฝั่งเอนจินจบ — panel ที่เปิดอยู่จะโหลดข้อมูลใหม่
  const [reloadKey, setReloadKey] = useState(0);

  // ── fx (ขั้น 5) เป็น state กลาง — แผงซ้ายกับเลเยอร์บนไทม์ไลน์แก้ก้อนเดียวกัน ──
  const [fxData, setFxData] = useState<FxData | null>(null);
  const [fxDraft, setFxDraft] = useState<{
    music: MusicTrack[];
    texts: FxTextItem[];
    overlays: FxOverlay[];
    journey: Record<string, unknown>;
    auto_sub: { enabled: boolean };
  } | null>(null);
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

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  // ── โหลดสถานะจากเอนจิน ──
  const refresh = useCallback(async () => {
    try {
      const [st, cl] = await Promise.all([api.state(), api.clips()]);
      setProj(st);
      setClips(cl.clips);
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
        overlays: d.fx.overlays.map((o) => ({ ...o })),
        journey: JSON.parse(JSON.stringify(d.fx.journey)),
        auto_sub: {
          enabled: Boolean(
            (d.fx.auto_sub as { enabled?: boolean } | undefined)?.enabled,
          ),
        },
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
        overlays: r.fx.fx.overlays.map((o) => ({ ...o })),
        journey: JSON.parse(JSON.stringify(r.fx.fx.journey)),
        auto_sub: {
          enabled: Boolean(
            (r.fx.fx.auto_sub as { enabled?: boolean } | undefined)?.enabled,
          ),
        },
      });
      setFxDirty(false);
      flash("บันทึก fx.json แล้ว — มีผลตอนสร้างไฟล์แบบมีเอฟเฟกต์");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึก fx ไม่สำเร็จ");
    } finally {
      setFxSaving(false);
    }
  }, [fxDraft, flash]);

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
    [rendered, locate, offsets, total, flash],
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
      if (videoRef.current?.ended) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, elapsed]);

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
              music.push({
                ...data.music.defaults,
                file: o.file ?? "",
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
      music: fxDraft ? musicBlocks(fxDraft.music, total) : [],
      caption: capData ? captionBlocks(capData.cues) : [],
      speech: speechBlocks(trData, shots, offsets),
    }),
    [fxDraft, capData, trData, shots, offsets, total],
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

  // ข้อมูลให้ตัวอย่างซ้อนสดใน preview — ตัวเลขชุดเดียวกับที่จะถูกเผาตอน render
  const overlayData = useMemo(() => {
    if (!fxDraft) {
      return { texts: [], stickers: [], cues: previewCues };
    }
    const kindOf = new Map(
      (fxData?.overlay.assets ?? []).map((a) => [a.file, a.kind]),
    );
    const extKind = (f: string) =>
      /\.(mov|webm|mp4|m4v)$/i.test(f) ? "video" : "image";
    return {
      texts: layers.text
        .filter((b) => !b.orphan)
        .map((b) => ({ item: fxDraft.texts[b.idx], tl: b.tl, idx: b.idx })),
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
      cues: previewCues,
    };
  }, [layers, fxDraft, fxData, previewCues]);

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
      const cur = kind === "text" ? fxDraft.texts[idx] : fxDraft.overlays[idx];
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
      if (!focus || (focus.kind !== "text" && focus.kind !== "sticker")) return false;
      const cur =
        focus.kind === "sticker"
          ? fxDraft?.overlays[focus.idx]
          : fxDraft?.texts[focus.idx];
      if (!cur) return false;
      const nx = Math.round(Math.min(1, Math.max(0, cur.x + dx)) * 1000) / 1000;
      const ny = Math.round(Math.min(1, Math.max(0, cur.y + dy)) * 1000) / 1000;
      if (focus.kind === "sticker") patchOverlayAt(focus.idx, { x: nx, y: ny });
      else patchTextAt(focus.idx, { x: nx, y: ny });
      return true;
    },
    [focus, fxDraft, patchOverlayAt, patchTextAt],
  );

  const removeLayerItem = useCallback(
    (kind: LayerKind, idx: number) => {
      if (!fxDraft) return;
      if (kind === "music") patchFx({ music: fxDraft.music.filter((_, k) => k !== idx) });
      else if (kind === "text") patchFx({ texts: fxDraft.texts.filter((_, k) => k !== idx) });
      else if (kind === "sticker")
        patchFx({ overlays: fxDraft.overlays.filter((_, k) => k !== idx) });
      setFocus(null);
    },
    [fxDraft, patchFx],
  );

  // ตัวหนังสือบนจอทุกชนิดไปแท็บเดียวกันแล้ว — ทั้งข้อความที่วางเองและซับจากบทพูด
  const KIND_TAB: Record<string, Tab> = {
    text: "text",
    sticker: "stickers",
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

  // เสียงเอฟเฟกต์ตัวอย่าง — ไฟล์อยู่ใน public/sfx ของ UI; ครั้งแรกที่ใช้
  // อัปโหลดเข้าโฟลเดอร์ assets ของโปรเจกต์ก่อน (เอนจินอ่านจากที่นั่นเท่านั้น)
  // แล้วค่อยวางเป็นแทร็กเพลงแบบ "เสียงสั้น": ยาวเท่าไฟล์ ไม่วน ไม่หลบเสียงพูด
  const addSfxAt = useCallback(
    async (tl: number, file: string, dur: number, loop = false) => {
      if (!fxDraft || !fxData) return;
      if (overlapCount(layers.music, tl, dur) >= MAX_AUDIO_STACK) {
        return flash(`ช่วงนี้มีเสียงซ้อนครบ ${MAX_AUDIO_STACK} ชั้นแล้ว`);
      }
      let actual = file;
      try {
        if (!fxData.music.tracks.includes(file)) {
          const blob = await (await fetch(sfxUrl(file))).blob();
          const b64 = await fileToBase64(new File([blob], file));
          const r = await api2.saveAsset(file, b64, "audio");
          setFxData(r.fx);
          // เอนจินอาจเปลี่ยนชื่อตอนชนไฟล์เดิม — แทร็กต้องชี้ชื่อจริง ไม่งั้นเงียบ
          actual = r.file || file;
        }
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
    [fxDraft, fxData, layers, patchFx, flash],
  );

  const dropOnTimeline = useCallback(
    (p: DropPayload, tl: number) => {
      if (p.type === "music-file") addMusicAt(tl, p.file);
      else if (p.type === "sfx") addSfxAt(tl, p.file, p.dur, p.loop);
      else if (p.type === "sticker") addStickerAt(tl, p.file);
      else if (p.type === "sticker-sample") addStickerSampleAt(tl, p.file);
      else if (p.type === "text-new") addTextAt(tl, p.text);
    },
    [addMusicAt, addSfxAt, addStickerAt, addStickerSampleAt, addTextAt],
  );

  const addClip = useCallback(
    (c: ClipInfo) => {
      const piece: Shot = {
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
      };
      mutate((prev) => [...prev, piece]);
      flash(`เพิ่ม ${c.name} ต่อท้ายแล้ว — บันทึก EDL แล้ว render เพื่อตัด`);
    },
    [mutate, flash],
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
          />
        )}
        {tab === "music" && (
          <MusicPanel
            fxs={fxs}
            onMusicFetch={musicFetch}
            onAddAtPlayhead={(f) => addMusicAt(playhead, f)}
            onAddSfxAtPlayhead={(f, d, lp) => addSfxAt(playhead, f, d, lp)}
            onToggleMixer={() => setMixerOpen((o) => !o)}
            focusIdx={focus?.kind === "music" ? focus.idx : null}
            flash={flash}
          />
        )}
        {tab === "stickers" && (
          <StickerPanel
            fxs={fxs}
            onPlaceAtPlayhead={(f) => addStickerAt(playhead, f)}
            onPlaceSampleAtPlayhead={(f) => addStickerSampleAt(playhead, f)}
            focusIdx={focus?.kind === "sticker" ? focus.idx : null}
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
        />
      </div>

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
