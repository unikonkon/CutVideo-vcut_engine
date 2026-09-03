"use client";

// CQ3 — ③ เลือกแบบ · ชั้นของแบบนี้ · AI review · ส่งออก
//   ซ้าย 400  SEC 04 VARIANTS การ์ดแบบ (vcard) · กลับ 02
//   กลาง      Player mode="final"
//   ขวา 400   หัวแบบ + MOD badge · SEC 05 LAYERS (lrow) · AI REVIEW (ai_op) · SEC 06 EXPORT

import { useMemo, useState } from "react";
import TopBar from "@/components/frames/TopBar";
import { Btn, Cta, Empty, Keys, Knob, Kv, Led, Mono, Panel, SecHead, Seg7, Tag, Thumb, Tog, Well, fmtBytes, fmtClock, fmtWhen } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import { thumbUrl, type OutKind } from "@/lib/api";
import { dur } from "@/lib/time";
import Player from "./Player";
import { layerRows } from "./layers";
import { AiOpList, useReviewOps } from "./review";
import { useStudio } from "./store";

const BUILD: { v: OutKind; label: string; mark: string; step: string }[] = [
  { v: "out", label: "ภาพ+เสียง", mark: "③", step: "build" },
  { v: "text", label: "+ ซับ", mark: "④", step: "build_text" },
  { v: "fx", label: "+ ทุกชั้น", mark: "⑤", step: "build_fx" },
];

export default function Variants() {
  const eng = useEngine();
  const rt = useRoute();
  const s = useStudio();
  const v = s.variant;
  const running = Boolean(eng.job?.running);
  const [exportSel, setExportSel] = useState<Set<string>>(() => new Set([v.id]));
  const [build, setBuild] = useState<OutKind>("fx");
  const rev = useReviewOps();

  const rows = useMemo(() => layerRows(s), [s]);
  const d = s.fx.draft;

  // ป้ายโมโนใต้ชื่อการ์ด — "N SHOT · HOOK · MUSIC …" จากของที่มีจริงในแบบนี้
  const tags = useMemo(() => {
    const t = [`${v.shots} SHOT`];
    if (d?.texts.length) t.push(`TEXT ${d.texts.length}`);
    if (d?.music.length) t.push("MUSIC");
    if (d?.overlays.length) t.push("STKR");
    if (s.cap.draft?.enabled && s.cap.data?.cues.length) t.push(`SUB ${s.cap.data.cues.length}`);
    if ((d?.journey as { enabled?: boolean } | undefined)?.enabled) t.push("MAP");
    return t.join(" · ");
  }, [v.shots, d, s.cap.draft, s.cap.data]);

  const firstShot = s.shots[0]?.name ?? eng.proj?.timeline[0]?.name;
  const rb = s.rebuild;
  const modN = (s.dirty ? 1 : 0) + (s.fx.dirty ? 1 : 0) + (s.cap.dirty ? 1 : 0);
  const rebuildLabel = rb.edl ? `REBUILD ③ ~${rb.eta.edl} s` : rb.fx ? `REBUILD ⑤ ~${rb.eta.fx} s` : rb.text ? `REBUILD ④ ~${rb.eta.text} s` : "READY";

  const buildDef = BUILD.find((b) => b.v === build) ?? BUILD[2];
  const outFile = s.outs.find((o) => o.kind === build);
  const eta = build === "out" ? rb.eta.edl : build === "text" ? rb.eta.edl * Number(rb.edl) + rb.eta.text : rb.eta.edl * Number(rb.edl) + rb.eta.fx;
  const dirtyFiles = [s.dirty && "edl.json", s.cap.dirty && "captions.json", s.fx.dirty && "fx.json"].filter(Boolean) as string[];
  const need = build === "out" ? rb.edl : build === "text" ? rb.text : rb.fx;
  const ids = [...exportSel].sort();

  const onExport = async () => {
    if (running) return;
    if (dirtyFiles.length) await s.saveAll(); // draft ลงไฟล์ก่อน ไม่งั้นเอนจินสร้างจากของเก่า
    await eng.runJob(buildDef.step);
  };

  const doneBadge = running
    ? `RUN ${(eng.job?.cmd_label || eng.job?.step || "").toUpperCase()}${eng.job && eng.job.of > 1 ? ` ${eng.job.at}/${eng.job.of}` : ""}`
    : v.ready
      ? `DONE · ③ ${v.stale ? "STALE" : "READY"} · ${eng.proj ? fmtWhen(eng.proj.out_mtime) : ""}${eng.job?.elapsed ? ` · ${fmtClock(eng.job.elapsed)}` : ""}`
      : "③ ยังไม่ต่อไฟล์";

  const openEdit = (id: Edit3) => rt.openEdit(id);

  return (
    <>
      <TopBar
        left={
          <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: v.ready && !running ? "var(--amber)" : "var(--muted)", whiteSpace: "nowrap" }}>
            {doneBadge}
          </Well>
        }
        right={
          <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
            SEL <span style={{ color: "var(--amber)" }}>{v.id}</span> · {s.total.toFixed(1)} s · {s.shots.length} SHOTS
          </Well>
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "400px minmax(0,1fr) 400px", gap: 10, padding: 10, minHeight: 0 }}>
        {/* ── ซ้าย: แบบทั้งหมด ── */}
        <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
          <SecHead
            tag="SEC 04 · VARIANTS"
            title={`${eng.variants.length} แบบ`}
            size={15}
            right={
              <Kv className="mono" style={{ fontSize: 10.5 }}>
                EXPORT <span style={{ color: "var(--amber)" }}>{exportSel.size}</span>
              </Kv>
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, overflowY: "auto", minHeight: 0 }}>
            {eng.variants.map((x) => {
              const viewing = x.id === v.id;
              const picked = exportSel.has(x.id);
              return (
                <Well key={x.id} sel={picked} onClick={() => rt.setVariant(x.id)} style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }} title={x.note}>
                  <Thumb src={firstShot ? thumbUrl(firstShot) : undefined} h={214} tc={dur(x.dur)} style={{ width: "100%" }}>
                    {viewing && (
                      <Btn sm on style={{ position: "absolute", left: 6, top: 6 }}>
                        VIEW
                      </Btn>
                    )}
                    {!x.ready && (
                      <Tag style={{ position: "absolute", left: 6, bottom: 6, color: "var(--amber)" }}>NO FILE</Tag>
                    )}
                  </Thumb>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tog
                      on={picked}
                      title="เลือกแบบนี้ไว้ส่งออก"
                      onChange={(on) =>
                        setExportSel((p) => {
                          const n = new Set(p);
                          if (on) n.add(x.id);
                          else n.delete(x.id);
                          return n;
                        })
                      }
                    />
                    <Seg7 size={12}>{x.id}</Seg7>
                    <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
                  </div>
                  <Kv className="mono" style={{ fontSize: 10, letterSpacing: ".06em" }}>
                    {viewing ? tags : `${x.shots} SHOT`}
                  </Kv>
                </Well>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn sm onClick={() => rt.go(2)}>◀ กลับ 02</Btn>
            <Kv style={{ fontSize: 10.5 }}>เปลี่ยนสไตล์/ความยาว · ถอดเสียงไม่ทำใหม่ (cache)</Kv>
          </div>
        </Panel>

        {/* ── กลาง: จอ ── */}
        <Panel style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", minHeight: 0 }}>
          <Player mode="final" />
        </Panel>

        {/* ── ขวา: ชั้น · AI · ส่งออก ── */}
        <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
          <div className="h">
            <Seg7 size={18}>{v.id}</Seg7>
            <span className="t" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>
              {v.label}
            </span>
            <div style={{ flex: 1 }} />
            <Well className="mono" style={{ padding: "2px 8px", fontSize: 10, color: modN || rb.fx ? "var(--amber)" : "var(--muted)", whiteSpace: "nowrap" }} title="ไฟล์ที่แก้ค้าง · ขั้นที่ต้องทำใหม่ก่อนส่งออก">
              MOD {modN} · {rebuildLabel}
            </Well>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <Tag>SEC 05 · LAYERS OF THIS VARIANT</Tag>
            <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
              {rows.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto auto", gap: 10, alignItems: "center", padding: "7px 10px" }}>
                  <Knob value={l.on ? 0.75 : 0} min={0} max={1} size="sm" off={!l.on} title={l.on ? "ชั้นนี้มีของ" : "ชั้นนี้ยังว่าง"} />
                  <span style={{ fontSize: 12 }}>{l.name}</span>
                  <Kv style={{ fontSize: 10.5, color: l.on ? undefined : "var(--faint)" }}>{l.note}</Kv>
                  <Btn sm onClick={() => openEdit(l.id)}>แก้ ▸</Btn>
                </div>
              ))}
            </Well>

            <div className="h">
              <Tag>AI REVIEW · {rev.left.length} PROPOSALS</Tag>
              <div style={{ flex: 1 }} />
              {rev.left.length > 0 && (
                <Btn sm onClick={() => rev.take(rev.left)} disabled={rev.busy || rev.stale} title={rev.stale ? "ไทม์ไลน์เปลี่ยนหลัง AI ดู — สั่งดูใหม่ก่อน" : "รับที่เหลือทั้งหมดในครั้งเดียว"}>
                  รับทั้งหมด
                </Btn>
              )}
              <Btn sm onClick={() => openEdit("review")}>ตั้งค่า ▸</Btn>
            </div>
            {rev.review?.has && rev.left.length > 0 ? (
              <AiOpList ops={rev.left.slice(0, 12)} onTake={(op) => rev.take([op])} onSkip={rev.skip} busy={rev.busy} applied={rev.applied} />
            ) : (
              <Empty>{rev.review?.has ? "ไม่มีข้อเสนอค้าง — สั่งดูรอบใหม่ได้ที่ ตั้งค่า ▸" : "ยังไม่เคยให้ AI ดู — กด ตั้งค่า ▸ เพื่อสั่งดู"}</Empty>
            )}
            {rev.left.length > 12 && <Kv style={{ fontSize: 10.5, textAlign: "center" }}>+ อีก {rev.left.length - 12} ข้อ — ดูทั้งหมดที่ ตั้งค่า ▸</Kv>}
          </div>

          <Tag>SEC 06 · EXPORT · {exportSel.size} SELECTED</Tag>
          <Keys
            sm={false}
            grow
            items={BUILD.map((b) => ({
              v: b.v,
              label: b.label,
              n: b.mark,
              title: b.v === "out" ? "ต่อไฟล์จากชิ้นที่ตัด (render + assemble)" : b.v === "text" ? "③ + เผาซับ (caption)" : "③ + ทุกชั้นแต่งหนัง (fx)",
            }))}
            value={build}
            onChange={setBuild}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Well className="mono" style={{ flex: 1, padding: "5px 8px", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }} title={s.info?.project.out_dir}>
              {s.info?.project.out_dir ?? "…"}
            </Well>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }} title="โฟลเดอร์ปลายทางบนดิสก์">
              <Led on={Boolean(outFile?.exists)} />
              FINDER
            </span>
          </div>
          <Cta onClick={onExport} disabled={running || !ids.length || !s.shots.length} busy={running} title={running ? "เอนจินกำลังทำงานอื่นอยู่" : `สั่ง ${buildDef.step}`}>
            ส่งออก {ids.join(" + ")} · {outFile?.exists ? fmtBytes(outFile.size) : "—"} · ~{fmtClock(eta)}
          </Cta>
          <Mono className="kv" style={{ fontSize: 10, textAlign: "center" }}>
            {v.id} {need ? `REBUILD ${buildDef.mark}` : "READY"}
            {need && dirtyFiles.length ? ` (${dirtyFiles.map((f) => f.replace(".json", "")).join(" · ")})` : ""}
            {dirtyFiles.length ? ` · + ${dirtyFiles.join(" · ")}` : ""}
          </Mono>
        </Panel>
      </div>
    </>
  );
}
