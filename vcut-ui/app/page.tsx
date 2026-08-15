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
  clipUrl,
  liveUrl,
  segUrl,
  type ClipInfo,
  type JobState,
  type ProjectState,
  type Shot,
} from "@/lib/api";
import TopBar from "@/components/TopBar";
import IconRail from "@/components/IconRail";
import AssetsPanel from "@/components/AssetsPanel";
import Preview from "@/components/Preview";
import Properties from "@/components/Properties";
import Timeline from "@/components/Timeline";
import JobPanel from "@/components/JobPanel";

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
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
  const mutate = useCallback((fn: (prev: Shot[]) => Shot[]) => {
    setShots((prev) => fn(prev));
    setDirty(true);
  }, []);

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

  // ── คีย์ลัด ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (sel != null) removeShot(sel);
      } else if (e.key === "s" || e.key === "S") {
        split();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [toggle, sel, removeShot, split]);

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
        job={job}
        onRun={runJob}
        onStop={() => api.stopJob()}
        outExists={!!proj?.out_exists}
        outStale={!!proj?.out_stale}
      />

      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <IconRail />
        <AssetsPanel
          clips={clips}
          usage={usage}
          onAdd={addClip}
          onPreview={previewClip}
          onScan={() => runJob("scan")}
          busy={!!job?.running}
        />
        <Preview
          videoRef={videoRef}
          stageRef={stageRef}
          playing={playing}
          playhead={playhead}
          total={total}
          onToggle={toggle}
          notice={notice}
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
          onSelect={setSel}
          onSeek={seek}
          onReorder={reorder}
          onRemove={removeShot}
          onSplit={split}
          onDuplicate={duplicate}
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
