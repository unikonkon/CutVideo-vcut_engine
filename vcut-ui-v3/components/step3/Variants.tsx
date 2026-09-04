"use client";

// ③ ส่งออก — ซ้าย: 6 แบบของสไตล์ที่เลือก · กลาง: ดูแบบที่เลือก · ขวา: ชั้นแต่ง + ส่งออก
//
// กดการ์ด = ดูตัวอย่าง (out.mp4 ของแบบนั้น) · กด "ใช้แบบนี้" = activate ในเอนจิน
// (สลับ edl/render/fx/captions) แล้วถ้าแบบนั้นยังไม่เคยมีชั้นแต่ง → สั่ง autofx ให้เอง
// ขั้น 4/5 (ซับ · ทุกชั้น) ทำต่อจากแบบที่ active เท่านั้น

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/frames/TopBar";
import { Btn, Cta, Empty, Keys, Kv, Led, Mono, Panel, Tag, Thumb, Well, fmtBytes, fmtClock } from "@/components/instrument";
import { useEngine, type Variant } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import { thumbUrl, variantUrl, type OutKind } from "@/lib/api";
import { dur } from "@/lib/time";
import Player from "./Player";
import { layerRows } from "./layers";
import { useStudio } from "./store";

const BUILD: { v: OutKind; label: string; mark: string; step: string; tip: string }[] = [
  { v: "out", label: "ภาพ+เสียง", mark: "③", step: "build", tip: "ต่อไฟล์จากชิ้นที่ตัด (ไม่มีข้อความ)" },
  { v: "text", label: "+ ซับ", mark: "④", step: "build_text", tip: "ภาพ+เสียง + เผาซับลงภาพ" },
  { v: "fx", label: "+ ทุกชั้น", mark: "⑤", step: "build_fx", tip: "ทุกชั้นแต่ง: HOOK · การ์ด · ซับ · เพลง · สติกเกอร์ · เอฟเฟกต์" },
];

function VariantCard({ v, sel, onClick }: { v: Variant; sel: boolean; onClick: () => void }) {
  const bad = !v.ok;
  return (
    <Well sel={sel} onClick={bad ? undefined : onClick} style={{ padding: 8, display: "grid", gridTemplateColumns: "54px 1fr", gap: 10, alignItems: "center", opacity: bad ? 0.55 : 1 }} title={bad ? v.error : v.note}>
      <Thumb src={v.first ? thumbUrl(v.first) : undefined} w={54} h={96} tc={v.ok ? dur(v.dur) : undefined} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{v.label}</span>
          {v.active && (
            <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--amber)", color: "#08182e", fontWeight: 600 }}>ใช้อยู่</span>
          )}
        </div>
        <Kv style={{ fontSize: 11.5, whiteSpace: "normal", lineHeight: "15px" }}>{bad ? v.error || "ยังไม่ได้ตัด" : v.note}</Kv>
        {v.ok && (
          <Mono style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {v.shots} ช็อต · {v.dur.toFixed(1)} วิ{v.hasLayers ? " · มีชั้นแต่ง" : ""}
          </Mono>
        )}
      </div>
    </Well>
  );
}

export default function Variants() {
  const eng = useEngine();
  const rt = useRoute();
  const s = useStudio();
  const running = Boolean(eng.job?.running);
  const active = eng.variants.find((v) => v.active) ?? null;
  const sel = eng.variants.find((v) => v.id === rt.variant) ?? active ?? eng.variants.find((v) => v.ok) ?? null;
  const [switching, setSwitching] = useState(false);
  const [build, setBuild] = useState<OutKind>("fx");
  const [showOut, setShowOut] = useState(false);

  // แบบที่ดูอยู่คือแบบที่ active และมีไฟล์ส่งออกแล้ว → เปิด Player (ดู ③④⑤ + ชั้นซ้อนสด)
  const have = useMemo(() => s.outs.filter((o) => o.exists).map((o) => o.kind), [s.outs]);
  const canPlayer = Boolean(sel?.active) && have.length > 0;
  useEffect(() => {
    if (!canPlayer) setShowOut(false);
  }, [canPlayer]);

  const rows = useMemo(() => layerRows(s), [s]);
  const rb = s.rebuild;
  const modN = (s.dirty ? 1 : 0) + (s.fx.dirty ? 1 : 0) + (s.cap.dirty ? 1 : 0);
  const buildDef = BUILD.find((b) => b.v === build) ?? BUILD[2];
  const outFile = s.outs.find((o) => o.kind === build);
  const eta = build === "out" ? rb.eta.edl : build === "text" ? rb.eta.edl * Number(rb.edl) + rb.eta.text : rb.eta.edl * Number(rb.edl) + rb.eta.fx;
  const need = build === "out" ? rb.edl : build === "text" ? rb.text : rb.fx;
  const dirtyFiles = [s.dirty && "edl.json", s.cap.dirty && "captions.json", s.fx.dirty && "fx.json"].filter(Boolean) as string[];

  const useThis = async (v: Variant) => {
    if (running || switching || v.active || !v.ok) return;
    if (modN && !confirm("มีที่แก้ค้างในแบบที่ใช้อยู่ — สลับแบบแล้วจะทิ้งที่ยังไม่บันทึก ไปต่อไหม")) return;
    setSwitching(true);
    try {
      const ok = await eng.activateVariant(v.id);
      if (ok && !v.hasLayers) await eng.runJob("autofx");
      if (ok) eng.flash(`ใช้แบบ ${v.label} แล้ว${v.hasLayers ? "" : " — กำลังวางชั้นแต่งตามสไตล์"}`);
    } finally {
      setSwitching(false);
    }
  };

  const onExport = async () => {
    if (running || !active) return;
    if (dirtyFiles.length) await s.saveAll();
    await eng.runJob(buildDef.step);
  };

  const openEdit = (id: Edit3) => {
    if (!sel?.active) return eng.flash("กด “ใช้แบบนี้” ก่อน ถึงจะแก้ชั้นแต่งของแบบนั้นได้");
    rt.openEdit(id);
  };

  return (
    <>
      <TopBar
        right={
          active ? (
            <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              ใช้อยู่ <span style={{ color: "var(--amber-hi)" }}>{active.label}</span> · {s.total.toFixed(1)} s · {s.shots.length} ช็อต
            </Well>
          ) : undefined
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "330px minmax(0,1fr) 380px", gap: 10, padding: 10, minHeight: 0 }}>
        {/* ── ซ้าย: 6 แบบ ── */}
        <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{eng.variants.filter((v) => v.ok).length} แบบ</span>
            <Kv>สไตล์ {eng.proj?.autofx_style || "กำหนดเอง"}</Kv>
          </div>
          {eng.variants.length === 0 ? (
            <Empty>
              ยังไม่มีแบบ — กลับไปขั้น ② แล้วกด “ตัดให้เลย”
              <div style={{ marginTop: 10 }}>
                <Btn onClick={() => rt.go(2)}>◀ เลือกสไตล์</Btn>
              </div>
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
              {eng.variants.map((v) => (
                <VariantCard key={v.id} v={v} sel={sel?.id === v.id} onClick={() => rt.setVariant(v.id)} />
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <Btn onClick={() => rt.go(2)} title="เปลี่ยนสไตล์/ชั้นแต่งแล้วตัดใหม่ — บทพูดไม่ถอดซ้ำ">
            ◀ เปลี่ยนสไตล์ · ตัดใหม่
          </Btn>
        </Panel>

        {/* ── กลาง: ดูแบบ ── */}
        <Panel style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", minHeight: 0 }}>
          {!sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Kv>เลือกแบบทางซ้าย</Kv>
            </div>
          ) : showOut && canPlayer ? (
            <Player mode="final" />
          ) : (
            <>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, minHeight: 0 }}>
                {sel.ok ? (
                  <video key={`${sel.id}:${sel.made}`} src={variantUrl(sel.id, sel.made)} controls playsInline style={{ height: "100%", maxWidth: "100%", aspectRatio: "9/16", borderRadius: 10, background: "#000" }} />
                ) : (
                  <Kv>{sel.error || "แบบนี้ยังไม่ได้ตัด"}</Kv>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{sel.label}</span>
                <Kv>{sel.note}</Kv>
                <div style={{ flex: 1 }} />
                {sel.ok && !sel.active && (
                  <Btn on onClick={() => useThis(sel)} disabled={running || switching} title="สลับให้ขั้น 4/5 ทำต่อจากแบบนี้">
                    {switching ? "กำลังสลับ…" : "ใช้แบบนี้ ▸"}
                  </Btn>
                )}
                {sel.active && canPlayer && (
                  <Btn onClick={() => setShowOut(true)} title="ดูไฟล์ที่ส่งออกแล้ว (③④⑤) พร้อมชั้นซ้อนสด">
                    ดูไฟล์ส่งออก ▸
                  </Btn>
                )}
                {sel.active && (
                  <Btn sm onClick={() => rt.openEdit("tl")} title="ไทม์ไลน์เต็ม — สลับ/ตัด/เล็มช็อต">
                    ไทม์ไลน์ ▸
                  </Btn>
                )}
              </div>
            </>
          )}
          {showOut && canPlayer && (
            <div style={{ padding: "6px 14px", borderTop: "1px solid var(--line)" }}>
              <Btn sm onClick={() => setShowOut(false)}>◀ ดูตัวอย่างของแบบ</Btn>
            </div>
          )}
        </Panel>

        {/* ── ขวา: ชั้นแต่ง · ส่งออก ── */}
        <Panel style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>ชั้นแต่งหนัง</span>
            <Kv>{active ? `ของแบบ ${active.label}` : "ยังไม่ได้เลือกแบบ"}</Kv>
            <div style={{ flex: 1 }} />
            {(modN > 0 || need) && (
              <Mono style={{ fontSize: 10.5, color: "var(--amber-hi)" }}>{modN ? `แก้ค้าง ${modN}` : "ต้องทำใหม่"}</Mono>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <Well className="rows" style={{ display: "flex", flexDirection: "column" }}>
              {rows.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 10, alignItems: "center", padding: "9px 10px" }}>
                  <Led on={l.on} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, display: "block" }}>{l.name}</span>
                    <Kv style={{ fontSize: 11 }}>{l.note}</Kv>
                  </span>
                  <Btn sm onClick={() => openEdit(l.id)} disabled={!active}>
                    แก้ ▸
                  </Btn>
                </div>
              ))}
            </Well>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn sm onClick={() => eng.runJob("autofx")} disabled={running || !active} title="วางชั้นแต่งตามสไตล์ใหม่ทั้งชุด (ชิ้นที่วางเองไม่ถูกแตะ)">
                ↻ วางชั้นแต่งตามสไตล์ใหม่
              </Btn>
              <Btn sm onClick={() => rt.openEdit("sticker")} disabled={!active}>
                + สติกเกอร์
              </Btn>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>ส่งออก</span>
            <Kv>{active ? active.label : "—"}</Kv>
          </div>
          <Keys sm={false} grow items={BUILD.map((b) => ({ v: b.v, label: b.label, n: b.mark, title: b.tip }))} value={build} onChange={setBuild} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Well className="mono" style={{ flex: 1, padding: "5px 8px", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }} title={s.info?.project.out_dir}>
              {s.info?.project.out_dir ?? "…"}
            </Well>
            <Tag>{outFile?.exists ? fmtBytes(outFile.size) : "ยังไม่มีไฟล์"}</Tag>
          </div>
          <Cta onClick={onExport} disabled={running || !active || !s.shots.length} busy={running} title={running ? "เอนจินกำลังทำงานอื่น" : `สั่ง ${buildDef.step}`}>
            ส่งออก {buildDef.label} · ~{fmtClock(eta)}
          </Cta>
          <Mono className="kv" style={{ fontSize: 10.5, textAlign: "center" }}>
            {need ? `ต้องทำ ${buildDef.mark} ใหม่` : outFile?.exists ? "ไฟล์พร้อม — เล่นได้ที่ “ดูไฟล์ส่งออก”" : "ยังไม่เคยส่งออก"}
            {dirtyFiles.length ? ` · จะบันทึก ${dirtyFiles.join(" · ")} ก่อน` : ""}
          </Mono>
        </Panel>
      </div>
    </>
  );
}
