"use client";

// หน้า CLIB · คลังคลิป — ลากเรียง ([scan] order) · สวิตช์เก็บ/พัก ([scan] exclude) ·
// หมุน ([scan] rotation_overrides) · 9:16 ([video] vertical_overrides) รายคลิป
//
// ทั้งสี่อย่างเป็น draft ใน state จนกด "บันทึกลำดับ" ค่อย POST /api/clips ทีเดียว
// ส่งเต็มรายการเสมอ (order · exclude) เพราะเอนจินเขียนทับทั้งคีย์ ไม่รับส่วนต่าง

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Btn,
  Empty,
  Fld,
  Keys,
  Knob,
  Kv,
  Led,
  Mono,
  Panel,
  SecHead,
  Seg7,
  Stat,
  TIn,
  Tag,
  Thumb,
  Tog,
  Well,
  fmtWhen,
} from "@/components/instrument";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api, api2, api3, sheetUrl, thumbUrl, type ClipInfo, type ProbeDir } from "@/lib/api";
import { dur } from "@/lib/time";
import { CHAIN, findStep, orientLabel, pickVideos, speechOf } from "./common";
import type { UploadQueue } from "./upload";

type Filter = "all" | "speech" | "view" | "H";
type Sort = "order" | "date" | "name" | "dur";

interface Draft {
  order: string[];
  exclude: string[];
  vmodes: Record<string, string>;
  rotations: Record<string, string>;
}

/** draft ตั้งต้น = สิ่งที่เอนจินถืออยู่ตอนนี้ (manifest เรียงตาม order แล้ว) */
function fromClips(clips: ClipInfo[]): Draft {
  const vmodes: Record<string, string> = {};
  const rotations: Record<string, string> = {};
  for (const c of clips) {
    vmodes[c.name] = c.vmode || "";
    rotations[c.name] = c.rot || "";
  }
  return {
    order: clips.map((c) => c.name),
    exclude: clips.filter((c) => !c.picked).map((c) => c.name),
    vmodes,
    rotations,
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const diffRec = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys({ ...a, ...b }).filter((k) => (a[k] || "") !== (b[k] || "")).length;

export default function Library({ up }: { up: UploadQueue }) {
  const eng = useEngine();
  const r = useRoute();
  const tr = useLoader(() => api2.transcript(), eng.reloadKey);
  const setup = useLoader(() => api2.setup(), eng.reloadKey);
  const running = Boolean(eng.job?.running);
  const busy = running || up.busy;

  // ── draft ──
  const base = useMemo(() => fromClips(eng.clips), [eng.clips]);
  // null = ยังไม่แตะ ใช้ของเอนจินตรง ๆ — บันทึก/ทิ้งแล้วกลับเป็น null ไม่ต้อง sync ใน effect
  const [draft, setDraft] = useState<Draft | null>(null);
  const d = draft ?? base;
  const edit = (f: (x: Draft) => Draft) => setDraft((x) => f(x ?? base));
  const excluded = useMemo(() => new Set(d.exclude), [d.exclude]);

  const orderChanged = !sameList(d.order, base.order);
  const exclChanged = new Set([...d.exclude.filter((n) => !base.exclude.includes(n)), ...base.exclude.filter((n) => !d.exclude.includes(n))]).size;
  const rotChanged = diffRec(d.rotations, base.rotations);
  const vmChanged = diffRec(d.vmodes, base.vmodes);
  const mod = (orderChanged ? 1 : 0) + exclChanged + rotChanged + vmChanged;
  const modKeys = [orderChanged && "scan.order", exclChanged && "scan.exclude", rotChanged && "scan.rotation_overrides", vmChanged && "video.vertical_overrides"].filter(Boolean).join(" · ");

  // ── มุมมอง ──
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("order");
  const byName = useMemo(() => new Map(eng.clips.map((c) => [c.name, c])), [eng.clips]);
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const out: ClipInfo[] = [];
    for (const n of d.order) {
      const c = byName.get(n);
      if (c && !seen.has(n)) {
        out.push(c);
        seen.add(n);
      }
    }
    // คลิปที่เพิ่งเข้าคลังหลังเริ่มจัด — ต่อท้ายไว้ก่อน (เอนจินก็ทำแบบเดียวกันตอน arrange)
    for (const c of eng.clips) if (!seen.has(c.name)) out.push(c);
    return out;
  }, [d.order, byName, eng.clips]);

  const speech = useCallback((n: string) => speechOf(tr.data, n), [tr.data]);
  const counts = useMemo(
    () => ({
      all: eng.clips.length,
      speech: eng.clips.filter((c) => (speech(c.name) ?? 0) > 0).length,
      view: eng.clips.filter((c) => !((speech(c.name) ?? 0) > 0)).length,
      H: eng.clips.filter((c) => c.orient === "H").length,
    }),
    [eng.clips, speech],
  );
  const shown = useMemo(() => {
    let a = ordered;
    if (filter === "speech") a = a.filter((c) => (speech(c.name) ?? 0) > 0);
    else if (filter === "view") a = a.filter((c) => !((speech(c.name) ?? 0) > 0));
    else if (filter === "H") a = a.filter((c) => c.orient === "H");
    if (sort === "date") a = [...a].sort((x, y) => x.created - y.created);
    else if (sort === "name") a = [...a].sort((x, y) => x.name.localeCompare(y.name));
    else if (sort === "dur") a = [...a].sort((x, y) => y.dur - x.dur);
    return a;
  }, [ordered, filter, sort, speech]);
  // ลากจัดลำดับได้เฉพาะตอนเห็นลำดับจริงครบทุกตัว — ในมุมมองที่กรอง/เรียงใหม่
  // ตำแหน่งที่ปล่อยไม่ได้แปลว่าตำแหน่งนั้นในลำดับที่จะลงไฟล์
  const sortable = filter === "all" && sort === "order" && !busy;

  // ── ลากเรียง (HTML5 drag) ──
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to) return;
    edit((x) => {
      const names = ordered.map((c) => c.name);
      const [m] = names.splice(from, 1);
      names.splice(to, 0, m);
      return { ...x, order: names };
    });
  };

  // ── link โฟลเดอร์ + ตรวจล่วงหน้า ──
  const [path, setPath] = useState("");
  const [probe, setProbe] = useState<ProbeDir | null>(null);
  const [linking, setLinking] = useState(false);
  useEffect(() => {
    const p = path.trim();
    const id = setTimeout(() => {
      if (!p) return setProbe(null);
      api3.probeDir(p).then(setProbe).catch(() => setProbe({ ok: false, msg: "ตรวจไม่ได้" }));
    }, 400);
    return () => clearTimeout(id);
  }, [path]);
  const doLink = async () => {
    const p = path.trim();
    if (!p) return;
    setLinking(true);
    try {
      const res = await api.linkClips(p);
      const skip = res.skipped.length ? ` · ข้าม ${res.skipped.length}` : "";
      eng.flash(`อ้างอิง ${res.linked.length} คลิป${skip} — เริ่มอ่านคลิป`);
      setPath("");
      await eng.refresh();
      if (res.linked.length) await up.chain(CHAIN);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "อ้างอิงไฟล์ไม่สำเร็จ");
    } finally {
      setLinking(false);
    }
  };
  const [over, setOver] = useState(false);
  const onFiles = (files: FileList) => {
    const vids = pickVideos(files);
    if (!vids.length) return eng.flash("ลากได้เฉพาะไฟล์วิดีโอ .mov .mp4 .m4v");
    up.start(vids, "add");
  };

  // ── บันทึก / ทิ้ง ──
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!mod) return;
    setSaving(true);
    try {
      // ส่งเต็มชุดทุกคีย์ — vmodes/rotations ส่งทุกคลิป ("" = ล้างค่าของคลิปนั้น)
      await api.saveClips({ order: d.order, exclude: d.exclude, vmodes: d.vmodes, rotations: d.rotations });
      await eng.refresh();
      setDraft(null);
      eng.flash(`บันทึกแล้ว · ${modKeys}`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // ── ถังขยะ ──
  const restore = async (name: string) => {
    try {
      await api.restoreClip(name);
      await eng.refresh();
      eng.flash(`กู้ ${name} กลับมาแล้ว — กำลังอ่านเข้าคลัง`);
      await up.chain(["scan"]);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ");
    }
  };
  const purge = async (name: string) => {
    try {
      await api.purgeClip(name);
      await eng.refresh();
      eng.flash(`ลบ ${name} ถาวรแล้ว`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  // ── สถิติฝั่งขวา ──
  const steps = setup.data?.steps;
  const scanStep = findStep(steps, "scan");
  const listenStep = findStep(steps, "listen");
  const thumbsStep = findStep(steps, "thumbs");
  const sheets = eng.proj?.sheets ?? [];
  const runStep = running ? eng.job?.step ?? "" : "";
  const prog = running ? eng.job?.progress ?? null : null;
  const sum = tr.data?.summary;
  const stale = (s: typeof scanStep) => (s?.changed.length ? " · STALE" : "");

  const rotations = eng.clipsData?.rotations ?? [];
  const vmodes = eng.vmodes;

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", gap: 10, padding: 10, minHeight: 0 }}>
      {/* ── ซ้าย: คลัง ── */}
      <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", minHeight: 0, overflow: "hidden" }}>
        <SecHead tag="SEC 00b · LIBRARY" title={`คลังคลิป · ${eng.clips.length}`} kv="ลากเรียง = [scan] order · สวิตช์ = [scan] exclude · หมุน/9:16 รายคลิป ไม่ต้อง scan ใหม่" />

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Keys<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              { v: "all", label: "ทั้งหมด", n: counts.all },
              { v: "speech", label: "มีคนพูด", n: counts.speech, title: "คลิปที่ transcript มีท่อนพูด ≥ 1" },
              { v: "view", label: "วิว", n: counts.view, title: "ไม่มีคำพูด → BROLL" },
              { v: "H", label: "แนวนอน", n: counts.H, title: "ต้องเลือกโหมด 9:16" },
            ]}
          />
          <div style={{ flex: 1 }} />
          <Tag>SORT</Tag>
          <Keys<Sort>
            value={sort}
            onChange={setSort}
            items={[
              { v: "order", label: "ลำดับที่จัด" },
              { v: "date", label: "วันที่" },
              { v: "name", label: "ชื่อ" },
              { v: "dur", label: "ยาว" },
            ]}
          />
        </div>

        {eng.clips.length === 0 ? (
          <Empty>{'ยังไม่มีคลิปในคลัง — วางไฟล์ที่ช่องด้านล่าง หรือกลับไปหน้า "ใส่วิดีโอ"'}</Empty>
        ) : (
          <Well className="rows" style={{ flex: 1, minHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", padding: "2px 0" }}>
            {shown.map((c, i) => {
                const keep = !excluded.has(c.name);
                const n = speech(c.name);
                const rot = d.rotations[c.name] || "";
                const vm = d.vmodes[c.name] || "";
                const note = c.orient === "H" ? "· แนวนอน → ต้องเลือก 9:16" : n === null ? "" : n > 0 ? `· มีคนพูด ${n} ท่อน` : "· วิว";
                const meta = [
                  dur(c.dur),
                  `${c.w}×${c.h} ${orientLabel(c.orient)}`,
                  (c.codec || "?").toUpperCase(),
                  n === null ? "LISTEN รอ" : n > 0 ? `SPEECH ${n} SEG` : "NO SPEECH → BROLL",
                  "SCAN ✓",
                  fmtWhen(c.created),
                ].join(" · ");
                return (
                  <div
                    key={c.name}
                    draggable={sortable}
                    onDragStart={(e) => {
                      if (!sortable) return e.preventDefault();
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.name);
                      setDragFrom(i);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragOver={(e) => {
                      if (dragFrom == null || dragFrom === i) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOver !== i) setDragOver(i);
                    }}
                    onDrop={(e) => {
                      if (dragFrom == null) return;
                      e.preventDefault();
                      move(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "14px 44px minmax(0,1fr) auto auto auto 8px",
                      gap: 12,
                      alignItems: "center",
                      padding: "8px 12px",
                      opacity: keep ? (dragFrom === i ? 0.4 : 1) : 0.5,
                      boxShadow: dragOver === i ? "inset 0 2px 0 var(--amber)" : undefined,
                    }}
                  >
                    <Mono style={{ color: "var(--muted)", cursor: sortable ? "grab" : "default", userSelect: "none" }} title={sortable ? "ลากเพื่อจัดลำดับ" : "จัดลำดับได้เมื่อดู 'ทั้งหมด' เรียงตาม 'ลำดับที่จัด' และเอนจินว่าง"}>
                      ⋮
                    </Mono>
                    <Thumb src={thumbUrl(c.name)} w={44} h={78} tc={dur(c.dur)} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name} <Kv>{note}</Kv>
                      </span>
                      <Mono className="kv" style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {meta}
                      </Mono>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <Tag>ROTATE</Tag>
                      <Keys
                        value={rot}
                        wrap={false}
                        onChange={(v) => edit((x) => ({ ...x, rotations: { ...x.rotations, [c.name]: v } }))}
                        items={rotations.map((o) => ({ v: o.value, label: o.label, disabled: busy }))}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <Tag>9:16{!vm && <span style={{ color: "var(--faint)" }}> · ค่ากลาง</span>}</Tag>
                      <Keys
                        value={vm || eng.vmodeDefault}
                        wrap={false}
                        onChange={(v) => edit((x) => ({ ...x, vmodes: { ...x.vmodes, [c.name]: v } }))}
                        items={vmodes.map((o) => ({ v: o.value, label: o.label, title: o.help, disabled: busy }))}
                      />
                    </div>
                    <Tog
                      on={keep}
                      disabled={busy}
                      title={keep ? "เก็บไว้ในหนัง — ปิด = พักไว้ ([scan] exclude)" : "พักไว้ ไม่เข้าหนัง"}
                      onChange={(on) => edit((x) => ({ ...x, exclude: on ? x.exclude.filter((y) => y !== c.name) : [...x.exclude, c.name] }))}
                    />
                    <Led on={keep} />
                  </div>
                );
              })}
            {shown.length === 0 && <Empty>ไม่มีคลิปในมุมมองนี้</Empty>}
          </Well>
        )}

        {/* วางไฟล์เพิ่ม / link โฟลเดอร์ — div ห่อรับลาก-วาง (Well ไม่รับ drag handler) */}
        <div
          style={{ display: "flex" }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!up.busy) setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(false);
            if (!up.busy) onFiles(e.dataTransfer.files);
          }}
        >
          <Well dashed sel={over} style={{ flex: 1, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
            <Knob value={up.busy ? 0.5 : 0} min={0} max={1} size="sm" off={up.busy} />
            <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{up.busy ? `กำลังส่ง ${up.items.filter((u) => !u.done && !u.error).length} ไฟล์…` : "วางไฟล์เพิ่มที่นี่"}</span>
            <Mono className="kv" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
              หรือ LINK โฟลเดอร์ฟุตเทจ ▸
            </Mono>
            <Fld label={probe ? probe.msg : "ที่อยู่โฟลเดอร์หรือไฟล์บนเครื่องที่รันเอนจิน — ทำลิงก์ ไม่ก๊อป"} style={{ flex: 1 }} chg={Boolean(probe?.ok)}>
              <TIn value={path} onChange={setPath} placeholder="/Volumes/SD/DCIM/100MEDIA" onEnter={doLink} disabled={busy} />
            </Fld>
            <Btn sm on={Boolean(probe?.ok)} disabled={busy || linking || !path.trim()} onClick={doLink}>
              {linking ? "กำลังลิงก์…" : "ลิงก์"}
            </Btn>
          </Well>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Btn on={mod > 0} disabled={!mod || busy || saving} onClick={save} title="เขียน [scan] order · exclude · rotation_overrides · [video] vertical_overrides ลงไฟล์โปรเจกต์">
            บันทึกลำดับ · [scan] order
          </Btn>
          <Btn disabled={!mod || saving} onClick={() => setDraft(null)}>
            ทิ้งลำดับที่จัดไว้
          </Btn>
          <Mono className="kv" style={{ fontSize: 10.5 }}>
            {mod ? (
              <>
                <span style={{ color: "var(--amber)" }}>MOD {mod} · UNSAVED</span> · {modKeys}
              </>
            ) : (
              "SAVED · ตรงกับไฟล์โปรเจกต์"
            )}
          </Mono>
          <div style={{ flex: 1 }} />
          <Btn onClick={() => r.setLib(false)}>◀ ใส่วิดีโอ</Btn>
          <Btn on onClick={() => r.go(2)}>
            ถัดไป · 02 เลือกสไตล์ ▸
          </Btn>
        </div>
      </Panel>

      {/* ── ขวา: ถังขยะ · contact sheet · สถิติ ── */}
      <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", minHeight: 0, overflow: "hidden" }}>
        <SecHead tag={`TRASH · ${eng.trash.length}`} title="ถังขยะ" size={14} />
        {eng.trash.length === 0 ? (
          <Empty>ถังขยะว่าง — คลิปที่เอาออกจะมานอนที่นี่ กู้คืนได้</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
            {eng.trash.map((t) => (
              <Well key={t.name} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 10px" }}>
                <Thumb w={34} h={60} title="ไม่มีภาพตัวอย่างของคลิปในถังขยะ" />
                <span style={{ fontSize: 12, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.orig || t.name}</span>
                  <Mono className="kv" style={{ fontSize: 10 }}>
                    {dur(t.dur)} · เอาออกเมื่อ {fmtWhen(t.at)}
                    {t.kind === "link" ? " · ลิงก์" : ""}
                  </Mono>
                </span>
                <Btn sm disabled={busy} onClick={() => restore(t.name)}>
                  กู้
                </Btn>
                <Btn sm danger disabled={busy} onClick={() => purge(t.name)}>
                  ล้าง
                </Btn>
              </Well>
            ))}
          </div>
        )}

        <SecHead tag="CONTACT SHEET · 5×5" title="ภาพตัวอย่าง" size={14} right={sheets.length ? <Mono className="kv" style={{ fontSize: 10 }}>{sheets[0]} · {sheets.length} แผ่น</Mono> : undefined} />
        {sheets.length ? (
          // แผ่นเป็น xstack 5×5 ช่องเท่ากันหมด — ตัดเป็น 25 ช่องด้วย background-position
          <a href={sheetUrl(sheets[0])} target="_blank" rel="noreferrer" title="เปิดแผ่นเต็ม">
            <Well style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 3 }}>
              {Array.from({ length: 25 }, (_, i) => (
                <div
                  key={i}
                  className="thumb"
                  style={{
                    height: 34,
                    backgroundImage: `url(${sheetUrl(sheets[0])})`,
                    backgroundSize: "500% 500%",
                    backgroundPosition: `${(i % 5) * 25}% ${Math.floor(i / 5) * 25}%`,
                  }}
                />
              ))}
            </Well>
          </a>
        ) : (
          <Well style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 3 }}>
            {ordered.slice(0, 15).map((c) => (
              <Thumb key={c.name} src={thumbUrl(c.name)} h={34} title={c.name} />
            ))}
            {ordered.length === 0 && <Kv style={{ gridColumn: "1 / -1", textAlign: "center", padding: 12 }}>ยังไม่มีภาพตัวอย่าง</Kv>}
          </Well>
        )}

        <Stat label="THUMBS" value={runStep === "thumbs" ? `RUNNING${prog ? ` ${prog.n}/${prog.total}` : ""}` : thumbsStep?.exists ? `${eng.clips.length} → ${sheets.length} SHEETS${stale(thumbsStep)}` : "QUEUED"} warn={Boolean(thumbsStep?.changed.length) || runStep === "thumbs"} />
        <Stat label="SCAN" value={runStep === "scan" ? "RUNNING" : scanStep?.exists ? `${scanStep.summary}${stale(scanStep)}` : "—"} warn={Boolean(scanStep?.changed.length) || runStep === "scan"} />
        <Stat label="LISTEN" value={runStep === "listen" ? `RUNNING${prog ? ` ${prog.n}/${prog.total}` : ""}` : sum ? `${sum.with_speech}/${sum.clips} CLIPS · ${sum.segments} SEG${stale(listenStep)}` : listenStep?.exists ? listenStep.summary : "—"} warn={Boolean(listenStep?.changed.length) || runStep === "listen"} />
        {up.chainError && <Kv style={{ color: "var(--danger)", fontSize: 11 }}>{up.chainError}</Kv>}
        <div style={{ flex: 1 }} />
        <Kv style={{ fontSize: 11, lineHeight: "16px" }}>ทั้ง 4 อย่าง (เอาคลิปไหน · เรียงยังไง · หมุน · แนวตั้ง) เก็บใน toml ไม่ใช่ cache — ลบ .vcut/ แล้วรันใหม่ได้ผลเดิม</Kv>
        <Well onClick={() => r.go(2)} style={{ padding: "10px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }} title="ไปขั้น ②">
          <Tag>NEXT</Tag>
          <Seg7 size={32} off={busy || mod > 0}>
            02
          </Seg7>
        </Well>
      </Panel>
    </div>
  );
}
