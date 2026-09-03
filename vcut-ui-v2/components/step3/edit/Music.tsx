"use client";

// CMUSIC — เพลง · SFX · บีต (fx.json music · /api/beats · /api/beat/snap)
//   TR 1 · BGM (แทร็กแรกที่ไม่ใช่เสียงสั้น) + TR 2 · SFX (เสียงสั้นทั้งหมด) · คีย์หมวด + looprow ของ 53 ลูป
//   · yt-dlp / อัปโหลด · BEATS (BPM · OFFSET · CUTS ON BEAT · ดูดรอยตัด) · MIXER (TALK/TR1/TR2)
//   เลนใต้ transport เป็นของแผงนี้เอง (มีเส้นบีตทับเลน MUSIC) — Player เดิมไม่วาดบีต

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Fader, Keys, Knob, Kv, Led, Meter, NIn, SecHead, Seg7, Stat, TIn, Tag, Well, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { api2, fileToBase64, type MusicTrack } from "@/lib/api";
import { BGM_CATS, BGM_LIST, bgmUrl, type BgmCat } from "@/lib/bgm";
import { SFX_CATS, SFX_LIST, sfxUrl, type SfxCat } from "@/lib/sfx";
import { LanesStrip } from "@/components/step3/Player";
import { isSfxTrack } from "@/components/step3/layers";
import { useStudio } from "@/components/step3/store";
import { EditShell, TagRow, trackLabel, useAdders } from "./common";

const QUICK_SFX = ["sfx-whoosh.m4a", "sfx-pop.m4a", "sfx-ding.m4a"];
const CAT_SHOWN = 6;
/** dB → จำนวนขีดจาก 20 (−40 dB = 0 · +6 dB = 20) */
const bars = (db: number) => Math.round(((Math.min(6, Math.max(-40, db)) + 40) / 46) * 20);
const fmtDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(v % 1 ? 1 : 0)}`;

/** เลน 4 แถวของ Player + เส้นบีตทับเลน MUSIC */
function BeatLanes() {
  const s = useStudio();
  const total = Math.max(s.total, 0.001);
  const grid = s.beats?.grid ?? [];
  return (
    <div style={{ position: "relative" }}>
      <LanesStrip />
      {grid.length > 0 && (
        <div className="lane" style={{ marginTop: 4 }} title={`${grid.length} เส้นบีต`}>
          <Tag style={{ width: 34 }}>BEAT</Tag>
          <div className="bar" style={{ background: "transparent" }}>
            {/* เพลงยาว/บีตถี่ → เส้นเป็นพันชิ้นทับกันเป็นแถบทึบ — วาดทุก k เส้นให้ยังเห็นเป็นกริด */}
            {grid.filter((g, i) => g <= total && i % Math.max(1, Math.ceil(grid.length / 240)) === 0).map((g, i) => (
              <span key={i} style={{ position: "absolute", left: `${(g / total) * 100}%`, top: 0, width: 1, height: 12, background: "var(--amber)", opacity: 0.6 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MusicEditor() {
  const s = useStudio();
  const eng = useEngine();
  const A = useAdders();
  const d = s.fx.data;
  const dr = s.fx.draft;
  const running = Boolean(eng.job?.running);
  const [cat, setCat] = useState<BgmCat | "lib">("upbeat");
  const [allCats, setAllCats] = useState(false);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [sfxCat, setSfxCat] = useState<SfxCat>("transition");
  const [yt, setYt] = useState("");
  const [playing, setPlaying] = useState("");
  const player = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // เส้นบีตเปิดค้างระหว่างอยู่ในแผงนี้ · อ่านจังหวะครั้งแรกให้ถ้ามีเพลงแล้ว
  const { setShowBeats, loadBeats } = s;
  const hasMusic = (dr?.music.length ?? 0) > 0;
  const hasBeats = s.beats !== null;
  useEffect(() => {
    setShowBeats(true);
    return () => setShowBeats(false);
  }, [setShowBeats]);
  useEffect(() => {
    if (hasMusic && !hasBeats) loadBeats(false);
  }, [hasMusic, hasBeats, loadBeats]);
  useEffect(() => () => player.current?.pause(), []);

  const music = useMemo(() => dr?.music ?? [], [dr]);
  const tr1 = music.findIndex((m) => !isSfxTrack(m));
  const sfxIdx = music.map((m, i) => (isSfxTrack(m) ? i : -1)).filter((i) => i >= 0);
  const focusMusic = s.focus?.kind === "music" ? s.focus.idx : null;
  const tr2 = focusMusic != null && sfxIdx.includes(focusMusic) ? focusMusic : (sfxIdx[0] ?? -1);

  // รอยตัด (ต้นช็อตที่ 2 เป็นต้นไป) ที่ห่างเส้นบีตไม่เกิน ±0.25 วิ
  const cuts = useMemo(() => {
    const grid = s.beats?.grid ?? [];
    const edges = s.offsets.slice(1);
    if (!grid.length || !edges.length) return { on: 0, of: edges.length };
    let on = 0;
    for (const e of edges) if (grid.some((g) => Math.abs(g - e) <= 0.25)) on++;
    return { on, of: edges.length };
  }, [s.beats, s.offsets]);

  if (!d || !dr) {
    return (
      <EditShell id="music" badge="EDIT MUSIC" tag="SEC 05d · MUSIC · SFX · BEAT" title="เพลง">
        <Kv>กำลังโหลด fx.json…</Kv>
      </EditShell>
    );
  }

  const patch = (i: number, p: Partial<MusicTrack>) => i >= 0 && s.fx.patch({ music: music.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const m1 = tr1 >= 0 ? music[tr1] : null;
  const m2 = tr2 >= 0 ? music[tr2] : null;
  const beat1 = m1 ? s.beats?.tracks.find((t) => t.id && t.id === m1.id) ?? s.beats?.tracks.find((t) => t.file === m1.file) : undefined;
  const bpm = beat1?.bpm ?? s.beats?.tracks.find((t) => t.bpm)?.bpm ?? 0;

  const preview = (file: string, url: string) => {
    if (!player.current) {
      player.current = new Audio();
      player.current.addEventListener("ended", () => setPlaying(""));
    }
    const a = player.current;
    a.pause();
    if (playing === file) return setPlaying("");
    a.src = url;
    a.currentTime = 0;
    setPlaying(file);
    a.play().catch(() => {
      setPlaying("");
      s.flash("เล่นตัวอย่างเสียงไม่ได้");
    });
  };

  const upload = async (f: File) => {
    if (f.size > 40 * 1024 * 1024) return s.flash("ไฟล์ใหญ่เกิน 40 MB — คลัง asset รับไม่ได้");
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "audio");
      s.fx.setData(r.fx);
      s.flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — อยู่ในหมวด "คลัง" กด ＋ เพื่อวาง`);
    } catch (e) {
      s.flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };

  const fetchYt = () => {
    const url = yt.trim();
    if (!url) return s.flash("ใส่ลิงก์ก่อน");
    if (!d.music.fetch.ok) return s.flash(d.music.fetch.how);
    eng.track("music", () => api2.music(url));
    setYt("");
  };

  // ไฟล์ในคลังที่ไม่ใช่ตัวอย่างของหน้าเว็บ (yt-dlp/อัปโหลด) — หมวด "คลัง"
  const libFiles = d.music.tracks.filter((f) => !SFX_LIST.some((x) => x.file === f) && !BGM_LIST.some((x) => x.file === f));
  const catItems = [...(allCats ? BGM_CATS : BGM_CATS.slice(0, CAT_SHOWN)).map((c) => ({ v: c.key as BgmCat | "lib", label: c.label, title: c.hint })), { v: "lib" as const, label: `คลัง ${libFiles.length}`, title: "ไฟล์ที่ดึง/อัปโหลดเข้าโปรเจกต์" }];
  const loops = cat === "lib" ? libFiles.map((f) => ({ file: f, label: f.replace(/\.[^.]+$/, ""), dur: 0, url: "" })) : BGM_LIST.filter((b) => b.cat === cat).map((b) => ({ file: b.file, label: b.label, dur: b.dur, url: bgmUrl(b.file) }));

  const topleft = `MUSIC · TR1 ${m1 ? trackLabel(m1.file) : "—"} · ${m1?.duck ? "DUCK ON TALK" : "NO DUCK"} · BEAT GRID ${bpm ? Math.round(bpm) : "—"}`;

  return (
    <EditShell
      id="music"
      badge={`EDIT MUSIC · ${m1 ? "TR1" : "—"}${sfxIdx.length ? ` + SFX ${sfxIdx.length}` : ""}`}
      tag="SEC 05d · MUSIC · SFX · BEAT"
      title={`เพลง · ${music.length} แทร็ก`}
      revert={s.fx.revert}
      leftNote="เพลงหลบเสียงพูดด้วย sidechaincompress — ไม่ต้องรู้ว่าใครพูดตรงไหน แก้ไทม์ไลน์แล้วไม่พัง"
      topleft={topleft}
      lanes={<BeatLanes />}
    >
      {/* ── TR1 · TR2 ── */}
      <Well style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Led on={Boolean(m1)} />
            <Tag>TR 1 · BGM</Tag>
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m1?.file}>{m1 ? trackLabel(m1.file) : "ยังไม่มีเพลง"}</span>
            {m1 && <Btn sm onClick={() => s.removeLayerItem("music", tr1)} title="เอาแทร็กออก (ไฟล์ยังอยู่ในคลัง)">✕</Btn>}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "space-around" }}>
            <Knob size="sm" label="GAIN" value={m1?.gain_db ?? -18} min={-40} max={12} step={0.5} def={d.music.defaults.gain_db} off={!m1} fmt={fmtDb} onChange={(v) => patch(tr1, { gain_db: v })} />
            <Knob size="sm" label="DUCK" value={m1?.duck_db ?? 6} min={0} max={24} step={0.5} def={d.music.defaults.duck_db} off={!m1 || !m1.duck} fmt={(v) => `${v}`} onChange={(v) => patch(tr1, { duck_db: v })} title="เบาลงกี่ dB ตอนมีเสียงพูด" />
            <Knob size="sm" label="FADE" value={m1?.fade_in ?? 1} min={0} max={10} step={0.1} def={d.music.defaults.fade_in} off={!m1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch(tr1, { fade_in: v })} title="เฟดเข้า (วินาที) — เฟดออกตั้งที่ช่อง OUT ข้างล่าง" />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn sm on={Boolean(m1?.loop)} disabled={!m1} onClick={() => patch(tr1, { loop: !m1?.loop })} title="วนซ้ำจนจบช่วง">LOOP</Btn>
            <Btn sm on={Boolean(m1?.duck)} disabled={!m1} onClick={() => patch(tr1, { duck: !m1?.duck })} title="หลบเสียงพูด (sidechain)">DUCK</Btn>
            <Btn sm on={Boolean(m1 && m1.bpm > 0)} disabled={!m1} onClick={() => m1 && patch(tr1, { bpm: m1.bpm > 0 ? 0 : Math.round((beat1?.auto_bpm || bpm || 120) * 10) / 10 })} title="ล็อก BPM เอง (0 = ให้เอนจินตรวจ)">BEAT LOCK</Btn>
          </div>
          {m1 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Tag>OUT</Tag>
              <NIn value={m1.fade_out} step={0.1} min={0} max={10} onChange={(v) => patch(tr1, { fade_out: v })} />
            </div>
          )}
          {m1 && m1.bpm > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Tag>BPM</Tag>
              <NIn value={m1.bpm} step={0.5} min={0} max={300} onChange={(v) => patch(tr1, { bpm: v })} />
              <Tag>OFFSET</Tag>
              <NIn value={m1.beat_offset} step={0.02} min={0} max={60} onChange={(v) => patch(tr1, { beat_offset: v })} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Led on={sfxIdx.length > 0} dim={!sfxIdx.length} />
            <Tag>TR 2 · SFX</Tag>
            <span style={{ fontSize: 12 }}>{sfxIdx.length ? `${sfxIdx.length} จุด` : "ยังไม่มี"}</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-around" }}>
            <Knob size="sm" label="GAIN" value={m2?.gain_db ?? -6} min={-40} max={12} step={0.5} def={-6} off={!m2} fmt={fmtDb} onChange={(v) => patch(tr2, { gain_db: v })} title={m2 ? `ความดังของ ${trackLabel(m2.file)} @${m2.at.toFixed(1)} s` : "ยังไม่มี SFX"} />
            <Knob size="sm" label="AT" value={m2?.at ?? 0} min={0} max={Math.max(1, s.total)} step={0.05} off={!m2} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => patch(tr2, { at: v })} title="วินาทีในหนังที่เสียงดัง (mockup: SNAP CUT — ไม่มีคีย์)" />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {QUICK_SFX.map((f) => {
              const def = SFX_LIST.find((x) => x.file === f);
              return def ? (
                <Btn key={f} sm onClick={() => A.addSfxAt(s.playhead, def.file, def.dur, Boolean(def.loop))} title={`วาง ${def.label} ที่หัวเล่น`}>
                  {f.replace(/^sfx-|\.m4a$/g, "")}
                </Btn>
              ) : null;
            })}
            <Btn sm on={sfxOpen} onClick={() => setSfxOpen((v) => !v)} title="คลัง SFX ทั้งหมดแยกหมวด">+{SFX_LIST.length - QUICK_SFX.length}</Btn>
          </div>
        </div>
      </Well>
      {sfxOpen && (
        <>
          <Keys items={SFX_CATS.map((c) => ({ v: c.key, label: c.label }))} value={sfxCat} onChange={setSfxCat} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SFX_LIST.filter((x) => x.cat === sfxCat).map((x) => (
              <Btn key={x.file} sm on={playing === x.file} onClick={() => A.addSfxAt(s.playhead, x.file, x.dur, Boolean(x.loop))} title={`${x.label} · ${x.dur.toFixed(1)} s — คลิกวางที่หัวเล่น · ▶ ลองฟัง`}>
                {x.label}
                <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }} onClick={(e) => { e.stopPropagation(); preview(x.file, sfxUrl(x.file)); }}>▶</span>
              </Btn>
            ))}
          </div>
        </>
      )}
      {sfxIdx.length > 0 && (
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 110, overflowY: "auto", flexShrink: 0 }}>
          {sfxIdx.map((i) => {
            const m = music[i];
            return (
              <div key={`${m.file}-${i}`} className={cx("cursor-pointer", i === focusMusic && "sel-ring")} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto auto", gap: 10, alignItems: "center", padding: "4px 10px" }} onClick={() => { s.setFocus({ kind: "music", idx: i }); s.seek(m.at); }}>
                <Led on />
                <span style={{ fontSize: 12 }}>{trackLabel(m.file)}</span>
                <span className="mono kv" style={{ fontSize: 10 }}>{m.at.toFixed(2)} s · {fmtDb(m.gain_db)} dB</span>
                <Btn sm onClick={(e) => { e.stopPropagation(); s.removeLayerItem("music", i); }}>✕</Btn>
              </div>
            );
          })}
        </Well>
      )}

      {/* ── คลังลูป ── */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <Keys items={catItems} value={cat} onChange={setCat} />
        {!allCats && <Btn sm onClick={() => setAllCats(true)} title="หมวดตามช่วงของทริป">+{BGM_CATS.length - CAT_SHOWN}</Btn>}
      </div>
      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 190, overflowY: "auto", flexShrink: 0 }}>
        {loops.length === 0 && <Kv style={{ padding: "6px 10px", fontSize: 11 }}>{cat === "lib" ? "ยังไม่มีไฟล์ในคลัง — ดึงจาก YouTube หรืออัปโหลดข้างล่าง" : "—"}</Kv>}
        {loops.map((b) => {
          const on = m1?.file === b.file;
          return (
            <div key={b.file} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto auto auto", gap: 10, alignItems: "center", padding: "4px 10px" }}>
              <Led on={on} />
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.file}>{b.label}</span>
              <span className="mono kv" style={{ fontSize: 10 }}>{b.dur ? `${b.dur.toFixed(0)}s loop` : "ไฟล์ในคลัง"}</span>
              <Btn sm on={playing === b.file} disabled={!b.url} onClick={() => preview(b.file, b.url)} title={b.url ? "ลองฟัง (กดซ้ำเพื่อหยุด)" : "ฟังตัวอย่างได้เฉพาะลูปสังเคราะห์"}>{playing === b.file ? "❚❚" : "▶"}</Btn>
              <Btn sm onClick={() => A.addBgmAt(s.playhead, b.file, m1 ? tr1 : null)} title={m1 ? "เปลี่ยนเพลงของ TR 1 เป็นเพลงนี้ (ค่าอื่นคงเดิม)" : "วางเป็น TR 1 ที่หัวเล่น (วนซ้ำจนจบเรื่อง)"}>＋</Btn>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <TIn value={yt} onChange={setYt} placeholder="yt-dlp ▸ https://youtu.be/…" onEnter={fetchYt} />
          </div>
          <Btn sm onClick={fetchYt} disabled={running || !d.music.fetch.ok} title={d.music.fetch.ok ? "ดึงเสียงด้วย yt-dlp (งานเอนจิน)" : d.music.fetch.how}>ดึง</Btn>
          <Btn sm onClick={() => fileRef.current?.click()} title="อัปโหลดไฟล์เสียง (mp3/m4a/wav ≤ 40 MB)">⬆ mp3/m4a/wav</Btn>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
      </Well>

      {/* ── BEATS ── */}
      <SecHead tag="BEATS · beat.py" right={<Btn sm onClick={() => s.loadBeats(true)} disabled={s.beatBusy || !music.length} title="อ่านคลื่นเสียงใหม่ ไม่ใช้ผลที่เก็บไว้">{s.beatBusy ? "กำลังอ่าน…" : "วิเคราะห์ใหม่"}</Btn>} />
      <Well style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 14 }}>
        <Seg7 size={22} off={!bpm}>{bpm ? bpm.toFixed(1) : "---"}</Seg7>
        <Tag>BPM{beat1?.manual ? " · MANUAL" : ""}</Tag>
        <Stat className="flex-1" label="OFFSET" value={beat1 ? `${beat1.offset.toFixed(2)} s` : "—"} />
        <Stat className="flex-1" label="CUTS ON BEAT" value={s.beats ? `${cuts.on} / ${cuts.of}` : "—"} warn={Boolean(s.beats) && cuts.on < cuts.of} />
      </Well>
      <TagRow>
        <Btn sm on onClick={() => s.snapToBeats()} disabled={s.beatBusy || !music.length} title="ยืด/หดปลายช็อตให้รอยตัดตกลงจังหวะ — เอนจินคำนวณ · ย้อนกลับได้">
          ดูดรอยตัดเข้าบีต · ±{s.beats ? `${s.beats.limits.talk}/${s.beats.limits.broll}` : "0.25"} s
        </Btn>
        <Btn sm onClick={s.undo} disabled={!s.canUndo} title="ย้อนการแก้ล่าสุด (Cmd+Z)">ย้อนกลับ</Btn>
        <Kv className="mono" style={{ fontSize: 10 }}>รับเฉพาะช็อตที่อยู่บนจอตอนนี้ · คืน start/end ใหม่</Kv>
      </TagRow>
      <Kv style={{ fontSize: 10.5, lineHeight: "14px" }}>คลิปอ้างอิง 7 ตัวไม่ได้ตัดตามบีต (4/21–8/17 = สุ่ม) — ปุ่มนี้เป็นทางเลือก ไม่ใช่ค่าตั้งต้น</Kv>

      {/* ── MIXER ── */}
      <SecHead tag={`MIXER · MASTER ${s.lufs > 0 ? "" : "−"}${Math.abs(s.lufs).toFixed(0)} LUFS`} />
      <Well style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        {[
          { n: "TALK", db: 0, idx: -1, title: `เสียงพูดปรับไว้ที่ขั้น ③ (${s.lufs} LUFS) — แก้รายช็อตที่แผง fx (vol_db)` },
          { n: "TR1", db: m1?.gain_db ?? -40, idx: tr1, title: m1 ? trackLabel(m1.file) : "ยังไม่มีเพลง" },
          { n: "TR2", db: m2?.gain_db ?? -40, idx: tr2, title: m2 ? trackLabel(m2.file) : "ยังไม่มี SFX" },
        ].map((row) => (
          <div key={row.n} style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px 20px", gap: 10, alignItems: "center" }} title={row.title}>
            <Tag>{row.n}</Tag>
            <Meter n={row.idx < 0 ? 15 : bars(row.db)} total={20} />
            <span className="mono kv" style={{ fontSize: 10, textAlign: "right" }}>{row.idx < 0 ? "0" : music[row.idx] ? fmtDb(row.db) : "—"}</span>
            {row.idx >= 0 && music[row.idx] ? <Fader value={row.db} min={-40} max={12} h={28} onChange={(v) => patch(row.idx, { gain_db: v })} /> : <span />}
          </div>
        ))}
      </Well>
    </EditShell>
  );
}
