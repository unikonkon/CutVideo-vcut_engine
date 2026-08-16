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
  type Shot,
  type TranscriptData,
} from "@/lib/api";
import {
  captionBlocks,
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
import TopBar from "@/components/TopBar";
import IconRail, { type Tab } from "@/components/IconRail";
import AssetsPanel from "@/components/AssetsPanel";
import Preview from "@/components/Preview";
import MusicMixer from "@/components/MusicMixer";
import Properties from "@/components/Properties";
import Timeline from "@/components/Timeline";
import JobPanel from "@/components/JobPanel";
import TextPanel from "@/components/panels/TextPanel";
import MusicPanel from "@/components/panels/MusicPanel";
import StickerPanel from "@/components/panels/StickerPanel";
import FxPanel from "@/components/panels/FxPanel";
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
  } | null>(null);
  const [fxDirty, setFxDirty] = useState(false);
  const [fxSaving, setFxSaving] = useState(false);
  const [capData, setCapData] = useState<CaptionsData | null>(null);
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
  const [playhead, setPlayhead] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(10);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<{ token: string; key: string; from: number }>({
    token: "",
    key: "",
    from: 0,
  });
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
      });
      setFxDirty(false);
      clearHistory();
    } catch {
      setFxData(null);
    }
  }, [clearHistory]);

  useEffect(() => {
    loadFx();
    api2.captions().then(setCapData).catch(() => setCapData(null));
    api2.transcript().then(setTrData).catch(() => setTrData(null));
  }, [loadFx, reloadKey]);

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
    async (context: string, force: boolean) => {
      try {
        await api2.runReview(context, force);
        setJobOpen(true);
        await pollJob();
      } catch (e) {
        flash(e instanceof Error ? e.message : "สั่ง review ไม่สำเร็จ");
      }
    },
    [pollJob, flash],
  );

  // ── เล่นวิดีโอ: สตรีมชิ้นที่ render แล้วเป็นสายเดียว (ผ่าน /api/live) ──
  const play = useCallback(
    async (fromTime: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (!rendered.length) {
        flash("ยังไม่มีชิ้นที่ตัดแล้ว — กด Export เพื่อ render ก่อน");
        return;
      }
      // ช็อตที่เวลานั้นตกอยู่ + เวลาที่เหลือภายในช็อต
      let k = shots.length - 1;
      for (let i = 0; i < shots.length; i++) {
        if (fromTime < offsets[i] + shots[i].dur) {
          k = i;
          break;
        }
      }
      let rIdx = rendered.findIndex((r) => r.i >= k);
      if (rIdx < 0) rIdx = 0;
      const delta = rendered[rIdx].i === k ? fromTime - offsets[k] : 0;

      try {
        const key = rendered.map((r) => r.seg).join("|");
        if (streamRef.current.key !== key) {
          const got = await api.live(rendered.map((r) => r.seg));
          streamRef.current.token = got.token;
          streamRef.current.key = key;
        }
        modeRef.current = "timeline";
        streamRef.current.from = rIdx;
        v.src = liveUrl(streamRef.current.token, rIdx);
        if (delta > 0.05) {
          v.addEventListener(
            "loadedmetadata",
            () => {
              v.currentTime = delta;
            },
            { once: true },
          );
        }
        await v.play();
        setPlaying(true);
      } catch (e) {
        flash(e instanceof Error ? e.message : "เล่นไม่ได้");
      }
    },
    [rendered, shots, offsets, flash],
  );

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else if (v.src && modeRef.current === "timeline") {
      v.play().then(() => setPlaying(true)).catch(() => play(playhead));
    } else {
      play(playhead);
    }
  }, [playing, playhead, play]);

  // หัวเล่นวิ่งตามวิดีโอ — แปลงเวลาในสตรีม (นับจากชิ้นที่เริ่ม) → เวลาบนไทม์ไลน์
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && modeRef.current === "timeline") {
        let t = v.currentTime;
        for (let j = streamRef.current.from; j < rendered.length; j++) {
          if (t < rendered[j].dur || j === rendered.length - 1) {
            setPlayhead(
              Math.min(offsets[rendered[j].i] + t, total),
            );
            break;
          }
          t -= rendered[j].dur;
        }
        if (v.ended) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rendered, offsets, total]);

  const seek = useCallback(
    (t: number) => {
      setPlayhead(t);
      if (seekTimer.current) clearTimeout(seekTimer.current);
      if (playing) {
        seekTimer.current = setTimeout(() => play(t), 220);
      }
    },
    [playing, play],
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

  const applyReviewOp = useCallback(
    (op: ReviewOp): boolean => {
      if (shots[op.at]?.name !== op.name) {
        flash(`ช็อต ${op.at + 1} ไม่ใช่ ${op.name} แล้ว — ไทม์ไลน์เปลี่ยนไป ให้รัน review ใหม่`);
        return false;
      }
      if (op.op === "drop") {
        removeShot(op.at);
        return true;
      }
      if (op.op === "move" && op.to != null) {
        reorder(op.at, Math.min(op.to, shots.length - 1));
        return true;
      }
      return false;
    },
    [shots, removeShot, reorder, flash],
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

  // ข้อมูลให้ตัวอย่างซ้อนสดใน preview — ตัวเลขชุดเดียวกับที่จะถูกเผาตอน render
  const overlayData = useMemo(() => {
    if (!fxDraft) {
      return { texts: [], stickers: [], cues: capData?.cues ?? [] };
    }
    const kindOf = new Map(
      (fxData?.overlay.assets ?? []).map((a) => [a.file, a.kind]),
    );
    const extKind = (f: string) =>
      /\.(mov|webm|mp4|m4v)$/i.test(f) ? "video" : "image";
    return {
      texts: layers.text
        .filter((b) => !b.orphan)
        .map((b) => ({ item: fxDraft.texts[b.idx], tl: b.tl })),
      stickers: layers.sticker
        .filter((b) => !b.orphan)
        .map((b) => {
          const it = fxDraft.overlays[b.idx];
          return { item: it, tl: b.tl, kind: kindOf.get(it.file) ?? extKind(it.file) };
        }),
      cues: capData?.cues ?? [],
    };
  }, [layers, fxDraft, fxData, capData]);

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
    [fxDraft, shots, offsets, layers, patchFx, flash],
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

  const KIND_TAB: Record<string, Tab> = {
    text: "fx",
    sticker: "stickers",
    music: "music",
    caption: "text",
    speech: "cc",
  };
  const selectLayerItem = useCallback((kind: LayerKind, idx: number) => {
    setFocus({ kind, idx });
    setSel(null); // ปุ่ม Delete จะได้ชี้ที่บล็อกเลเยอร์ ไม่ใช่ช็อตที่ค้างเลือกไว้
    setTab(KIND_TAB[kind] ?? "fx");
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
      flash(`วางข้อความที่ ${bind.name} — แก้เนื้อหาในแท็บเอฟเฟกต์ แล้วกดบันทึก FX`);
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

  const addMusicAt = useCallback(
    (tl: number, file: string) => {
      if (!fxDraft || !fxData) return;
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
    [fxDraft, fxData, patchFx, flash],
  );

  const dropOnTimeline = useCallback(
    (p: DropPayload, tl: number) => {
      if (p.type === "music-file") addMusicAt(tl, p.file);
      else if (p.type === "sticker") addStickerAt(tl, p.file);
      else if (p.type === "text-new") addTextAt(tl, p.text);
      else if (p.type === "transcript") addTextAt(tl, p.text);
    },
    [addMusicAt, addStickerAt, addTextAt],
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
    if (!dirty && !fxDirty) return flash("ไม่มีอะไรค้างบันทึก");
    if (dirty) save();
    if (fxDirty) saveFx();
  }, [dirty, fxDirty, save, saveFx, flash]);

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

      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <IconRail tab={tab} onTab={setTab} />
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
            reloadKey={reloadKey}
            runJob={runJob}
            onAddTextAtPlayhead={() => addTextAt(playhead)}
            flash={flash}
          />
        )}
        {tab === "music" && (
          <MusicPanel
            fxs={fxs}
            onMusicFetch={musicFetch}
            onAddAtPlayhead={(f) => addMusicAt(playhead, f)}
            focusIdx={focus?.kind === "music" ? focus.idx : null}
            flash={flash}
          />
        )}
        {tab === "stickers" && (
          <StickerPanel
            fxs={fxs}
            onPlaceAtPlayhead={(f) => addStickerAt(playhead, f)}
            focusIdx={focus?.kind === "sticker" ? focus.idx : null}
            flash={flash}
          />
        )}
        {tab === "fx" && (
          <FxPanel
            fxs={fxs}
            onAddAtPlayhead={() => addTextAt(playhead)}
            focusIdx={focus?.kind === "text" ? focus.idx : null}
            flash={flash}
          />
        )}
        {tab === "cc" && (
          <TranscriptPanel
            reloadKey={reloadKey}
            onAddText={(t) => addTextAt(playhead, t)}
          />
        )}
        {tab === "review" && (
          <ReviewPanel
            reloadKey={reloadKey}
            busy={!!job?.running}
            onRun={runReview}
            applyOp={applyReviewOp}
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
        />
        <MusicMixer
          tracks={fxDraft?.music ?? []}
          playing={playing}
          playhead={playhead}
          total={total}
        />
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
