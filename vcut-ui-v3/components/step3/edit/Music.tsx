"use client";

// แท็บ "เพลง" ของลิ้นชัก — เพลงคลอ · เสียงสั้น (SFX) · บีต (fx.json music · /api/beats · /api/beat/snap)
//   เพลงคลอ = แทร็กแรกที่ไม่ใช่เสียงสั้น: ความดัง/หลบเสียงพูด/เฟด เป็น − / + · วน/หลบ/ล็อก BPM เป็นสวิตช์
//   คลังเพลง (public/bgm + ไฟล์ในโปรเจกต์) · yt-dlp / อัปโหลด · SFX · จังหวะ (BPM · ดูดรอยตัดเข้าบีต)

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Icon, Seg, Stepper, TIn, Tog, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { api2, fileToBase64, type MusicTrack } from "@/lib/api";
import { BGM_CATS, BGM_LIST, bgmUrl, type BgmCat } from "@/lib/bgm";
import { SFX_CATS, SFX_LIST, sfxUrl, type SfxCat } from "@/lib/sfx";
import { isSfxTrack } from "@/components/step3/layers";
import { useStudio } from "@/components/step3/store";
import { EditShell, Grid2, IcBtn, Lbl, Row, Sec, TagRow, trackLabel, useAdders } from "./common";

const QUICK_SFX = ["sfx-whoosh.m4a", "sfx-pop.m4a", "sfx-ding.m4a"];
const CAT_SHOWN = 6;
const fmtDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(v % 1 ? 1 : 0)}`;

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

  // อ่านจังหวะครั้งแรกให้ถ้ามีเพลงแล้ว
  const { loadBeats } = s;
  const hasMusic = (dr?.music.length ?? 0) > 0;
  const hasBeats = s.beats !== null;
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
      <EditShell id="music">
        <Lbl>กำลังโหลด fx.json…</Lbl>
      </EditShell>
    );
  }

  const patch = (i: number, p: Partial<MusicTrack>) => i >= 0 && s.fx.patch({ music: music.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const m1 = tr1 >= 0 ? music[tr1] : null;
  const m2 = tr2 >= 0 ? music[tr2] : null;
  const beat1 = m1 ? (s.beats?.tracks.find((t) => t.id && t.id === m1.id) ?? s.beats?.tracks.find((t) => t.file === m1.file)) : undefined;
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
      s.flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — อยู่ในหมวด "คลัง"`);
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

  return (
    <EditShell id="music" revert={s.fx.revert}>
      {/* ── เพลงคลอ ── */}
      <Sec title="เพลงคลอ" note={m1 ? trackLabel(m1.file) : "ยังไม่มีเพลง — เลือกจากคลังข้างล่าง"} right={m1 ? <IcBtn name="trash" onClick={() => s.removeLayerItem("music", tr1)} title="เอาเพลงออก (ไฟล์ยังอยู่ในคลัง)" /> : undefined} />
      {m1 && (
        <>
          <Grid2>
            <Row label="ความดัง (dB)">
              <Stepper value={m1.gain_db} min={-40} max={12} step={1} fmt={fmtDb} onChange={(v) => patch(tr1, { gain_db: v })} />
            </Row>
            <Row label="หลบพูดลง (dB)">
              <Stepper value={m1.duck_db} min={0} max={24} step={1} disabled={!m1.duck} onChange={(v) => patch(tr1, { duck_db: v })} title="เบาลงกี่ dB ตอนมีเสียงพูด" />
            </Row>
            <Row label="เฟดเข้า (วิ)">
              <Stepper value={m1.fade_in} min={0} max={10} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patch(tr1, { fade_in: v })} />
            </Row>
            <Row label="เฟดออก (วิ)">
              <Stepper value={m1.fade_out} min={0} max={10} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patch(tr1, { fade_out: v })} />
            </Row>
          </Grid2>
          <TagRow style={{ gap: 18 }}>
            <Tog on={Boolean(m1.loop)} onChange={(v) => patch(tr1, { loop: v })} label="วนซ้ำจนจบ" />
            <Tog on={Boolean(m1.duck)} onChange={(v) => patch(tr1, { duck: v })} label="หลบเสียงพูด" title="เพลงเบาลงเองตอนมีเสียงพูด (sidechain)" />
            <Tog on={m1.bpm > 0} onChange={(v) => patch(tr1, { bpm: v ? Math.round((beat1?.auto_bpm || bpm || 120) * 10) / 10 : 0 })} label="ล็อก BPM" title="ตั้ง BPM เอง (ปิด = ให้เอนจินตรวจ)" />
          </TagRow>
          {m1.bpm > 0 && (
            <Grid2>
              <Row label="BPM">
                <Stepper value={m1.bpm} min={40} max={300} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patch(tr1, { bpm: v })} />
              </Row>
              <Row label="ออฟเซ็ต (วิ)">
                <Stepper value={m1.beat_offset} min={0} max={60} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => patch(tr1, { beat_offset: v })} />
              </Row>
            </Grid2>
          )}
        </>
      )}

      {/* ── คลังเพลง ── */}
      <Sec title="คลังเพลง" note={m1 ? "กด + เพื่อเปลี่ยนเพลงคลอ" : "กด + วางเป็นเพลงคลอที่หัวเล่น"} right={!allCats ? <Btn sm ghost onClick={() => setAllCats(true)} title="หมวดตามช่วงของทริป">+{BGM_CATS.length - CAT_SHOWN}</Btn> : undefined} />
      <Seg sm cols={4} items={catItems} value={cat} onChange={setCat} />
      <div className="rows" style={{ display: "flex", flexDirection: "column", maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
        {loops.length === 0 && <Lbl style={{ padding: "6px 4px" }}>{cat === "lib" ? "ยังไม่มีไฟล์ในคลัง — ดึงจาก YouTube หรืออัปโหลดข้างล่าง" : "—"}</Lbl>}
        {loops.map((b) => {
          const on = m1?.file === b.file;
          return (
            <div key={b.file} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto 34px 34px", gap: 8, alignItems: "center", padding: "4px 4px" }}>
              <Icon name="music" size={13} color={on ? "var(--amber)" : "var(--muted)"} />
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.file}>
                {b.label}
              </span>
              <span className="muted small num">{b.dur ? `${b.dur.toFixed(0)} วิ วน` : "ไฟล์ในคลัง"}</span>
              <IcBtn name={playing === b.file ? "pause" : "play"} on={playing === b.file} disabled={!b.url} onClick={() => preview(b.file, b.url)} title={b.url ? "ลองฟัง (กดซ้ำเพื่อหยุด)" : "ฟังตัวอย่างได้เฉพาะลูปตัวอย่าง"} />
              <IcBtn name="plus" onClick={() => A.addBgmAt(s.playhead, b.file, m1 ? tr1 : null)} title={m1 ? "เปลี่ยนเพลงคลอเป็นเพลงนี้ (ค่าอื่นคงเดิม)" : "วางเป็นเพลงคลอที่หัวเล่น (วนซ้ำจนจบเรื่อง)"} />
            </div>
          );
        })}
      </div>
      <TagRow>
        <div style={{ flex: 1, minWidth: 160 }}>
          <TIn value={yt} onChange={setYt} placeholder="ลิงก์ YouTube (yt-dlp)" onEnter={fetchYt} mono={false} />
        </div>
        <Btn sm onClick={fetchYt} disabled={running || !d.music.fetch.ok} title={d.music.fetch.ok ? "ดึงเสียงด้วย yt-dlp (งานเอนจิน)" : d.music.fetch.how}>
          ดึงเสียง
        </Btn>
        <Btn sm onClick={() => fileRef.current?.click()} title="อัปโหลดไฟล์เสียง (mp3/m4a/wav ≤ 40 MB)">
          <Icon name="upload" size={12} />
          อัปโหลด
        </Btn>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </TagRow>

      {/* ── เสียงสั้น ── */}
      <Sec title={`เสียงสั้น · ${sfxIdx.length}`} note="วางที่หัวเล่น" right={<Btn sm ghost on={sfxOpen} onClick={() => setSfxOpen((v) => !v)} title="คลัง SFX ทั้งหมดแยกหมวด">คลัง {SFX_LIST.length}</Btn>} />
      <TagRow>
        {QUICK_SFX.map((f) => {
          const def = SFX_LIST.find((x) => x.file === f);
          return def ? (
            <Btn key={f} sm onClick={() => A.addSfxAt(s.playhead, def.file, def.dur, Boolean(def.loop))} title={`วาง ${def.label} ที่หัวเล่น`}>
              <Icon name="plus" size={12} />
              {def.label}
            </Btn>
          ) : null;
        })}
      </TagRow>
      {sfxOpen && (
        <>
          <Seg sm cols={3} items={SFX_CATS.map((c) => ({ v: c.key, label: c.label }))} value={sfxCat} onChange={setSfxCat} />
          <TagRow style={{ gap: 4 }}>
            {SFX_LIST.filter((x) => x.cat === sfxCat).map((x) => (
              <Btn key={x.file} sm on={playing === x.file} onClick={() => A.addSfxAt(s.playhead, x.file, x.dur, Boolean(x.loop))} title={`${x.label} · ${x.dur.toFixed(1)} วิ — กดวางที่หัวเล่น`}>
                {x.label}
                <span onClick={(e) => { e.stopPropagation(); preview(x.file, sfxUrl(x.file)); }} title="ลองฟัง" style={{ display: "inline-flex" }}>
                  <Icon name={playing === x.file ? "pause" : "play"} size={10} color="var(--muted)" />
                </span>
              </Btn>
            ))}
          </TagRow>
        </>
      )}
      {sfxIdx.length > 0 && (
        <div className="rows" style={{ display: "flex", flexDirection: "column", maxHeight: 140, overflowY: "auto", flexShrink: 0 }}>
          {sfxIdx.map((i) => {
            const m = music[i];
            return (
              <div key={`${m.file}-${i}`} className={cx("cursor-pointer", i === focusMusic && "sel-ring")} style={{ display: "grid", gridTemplateColumns: "1fr auto 34px", gap: 8, alignItems: "center", padding: "4px 4px" }} onClick={() => { s.setFocus({ kind: "music", idx: i }); s.seek(m.at); }}>
                <span style={{ fontSize: 13 }}>{trackLabel(m.file)}</span>
                <span className="muted small num">
                  {m.at.toFixed(2)} วิ · {fmtDb(m.gain_db)} dB
                </span>
                <IcBtn name="x" onClick={(e) => { e.stopPropagation(); s.removeLayerItem("music", i); }} title="เอาเสียงนี้ออก" />
              </div>
            );
          })}
        </div>
      )}
      {m2 && (
        <Grid2>
          <Row label={`ความดัง ${trackLabel(m2.file)} (dB)`}>
            <Stepper value={m2.gain_db} min={-40} max={12} step={1} fmt={fmtDb} onChange={(v) => patch(tr2, { gain_db: v })} />
          </Row>
          <Row label="ที่วินาที">
            <Stepper value={m2.at} min={0} max={Math.max(1, s.total)} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch(tr2, { at: v })} />
          </Row>
        </Grid2>
      )}

      {/* ── จังหวะ ── */}
      <Sec title="จังหวะเพลง" note={s.beats ? `รอยตัดตกบีต ${cuts.on} / ${cuts.of}` : "ยังไม่ได้อ่านจังหวะ"} right={<Btn sm ghost onClick={() => s.loadBeats(true)} disabled={s.beatBusy || !music.length} title="อ่านคลื่นเสียงใหม่ ไม่ใช้ผลที่เก็บไว้"><Icon name="refresh" size={12} />{s.beatBusy ? "กำลังอ่าน…" : "วิเคราะห์ใหม่"}</Btn>} />
      <TagRow style={{ gap: 14 }}>
        <span className="num" style={{ fontSize: 26, lineHeight: 1 }}>
          {bpm ? bpm.toFixed(1) : "—"} <span className="muted" style={{ fontSize: 13 }}>BPM{beat1?.manual ? " · ตั้งเอง" : ""}</span>
        </span>
        {beat1 && <Lbl>ออฟเซ็ต {beat1.offset.toFixed(2)} วิ</Lbl>}
        <div style={{ flex: 1 }} />
        <Btn sm on onClick={() => s.snapToBeats()} disabled={s.beatBusy || !music.length || running} title="ยืด/หดปลายช็อตให้รอยตัดตกลงจังหวะ — เอนจินคำนวณ · ย้อนกลับได้">
          ดูดรอยตัดเข้าบีต
        </Btn>
        <Btn sm ghost onClick={s.undo} disabled={!s.canUndo} title="ย้อนการแก้ล่าสุด (Cmd+Z)">
          ย้อนกลับ
        </Btn>
      </TagRow>
      <Lbl>เพลงหลบเสียงพูดด้วย sidechain — แก้ไทม์ไลน์แล้วไม่พัง · ดูดรอยตัดเข้าบีตเป็นทางเลือก ไม่ใช่ค่าตั้งต้น</Lbl>
    </EditShell>
  );
}
