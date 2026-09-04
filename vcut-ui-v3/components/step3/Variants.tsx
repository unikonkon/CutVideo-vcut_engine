"use client";

// ③ เลือกแบบ · ส่งออก (mockup F3)
//   ซ้าย : "เลือกแบบ" · แท็บสไตล์ A–D + กำหนดเอง (ตัดแล้ว = จำนวนแบบ · ยังไม่ตัด = "ตัดเพิ่ม" → recut)
//          · การ์ดภาพ 3×2 ของ 6 แบบ · "เปลี่ยนสไตล์"
//   ขวา  : ตัวอย่างแบบที่ดูอยู่ (วิดีโอ + เล่น/หยุด + ก่อน/ถัดไป) · "ชั้นแต่งของแบบนี้" 5 แถว (สวิตช์ + แก้)
//          · ส่งออก 3 ช่อง (build / build_text / build_fx) + ปุ่มหลัก
//
// กดการ์ด = ใช้แบบนั้น (activate ในเอนจิน — สลับ edl/render/fx/captions) แล้วถ้ายังไม่เคยมีชั้นแต่ง → autofx
// ระหว่างงานวิ่ง กดการ์ดได้แค่ดู · แบบที่ดูอยู่ (?v=) กับแบบที่ใช้อยู่ (active) อาจต่างกัน — ส่งออกได้เฉพาะ active

import { useEffect, useMemo, useRef, useState } from "react";
import TopBar from "@/components/frames/TopBar";
import { Bar, Btn, Cta, Empty, Icon, Seg, Tog, cx, fmtClock, type IconName } from "@/components/instrument";
import { useEngine, type Variant } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import { api2, thumbUrl, variantUrl, type OutKind } from "@/lib/api";
import { FEATURES } from "@/lib/roadmap";
import { dur } from "@/lib/time";
import { layerRows } from "./layers";
import { useStudio } from "./store";
import { styleNowOf, styleTabs, type StyleTab } from "./styles";

const BUILD: { v: OutKind; label: string; step: string; tip: string }[] = [
  { v: "out", label: "ภาพ+เสียง", step: "build", tip: "ต่อไฟล์จากชิ้นที่ตัด (ไม่มีข้อความ)" },
  { v: "text", label: "+ ซับ", step: "build_text", tip: "ภาพ+เสียง + เผาซับลงภาพ" },
  { v: "fx", label: "+ ทุกชั้น", step: "build_fx", tip: "ทุกชั้นแต่ง: HOOK · การ์ดปิด · ซับ · เพลง · สติกเกอร์ · เอฟเฟกต์" },
];

/** ชื่อ/ไอคอนของแถวชั้นแต่งตาม mockup — โน้ตมาจาก layerRows (store) */
const LAYER_META: { id: Edit3; name: string; icon: IconName }[] = [
  { id: "sub", name: "ซับ", icon: "text" },
  { id: "text", name: "HOOK + การ์ดปิด", icon: "spark" },
  { id: "music", name: "เพลงตามจังหวะ", icon: "music" },
  { id: "sticker", name: "สติกเกอร์ / ภาพซ้อน", icon: "sticker" },
  { id: "fx", name: "เอฟเฟกต์รายช็อต", icon: "fx" },
];

// ─────────────────────────── การ์ดแบบ ───────────────────────────

function VariantCard({ v, sel, hook, sub, onClick }: { v: Variant; sel: boolean; hook: string; sub: string; onClick: () => void }) {
  const bad = !v.ok;
  return (
    <div className={cx("card", sel && "sel", bad && "dim")} onClick={bad ? undefined : onClick} title={bad ? v.error || "ยังไม่ได้ตัด" : `${v.label} · ${v.note}`} style={{ minHeight: 0, cursor: bad ? "not-allowed" : "pointer" }} role="button" aria-pressed={sel}>
      {v.first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(v.first)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
      ) : null}
      <div className="scrim" />
      {sel && hook && <span className="hook-preview">{hook}</span>}
      {sel && sub && (
        <span className="sub-preview" style={{ bottom: "34%" }}>
          {sub}
        </span>
      )}
      {v.ok && (
        <span className="num" style={{ position: "absolute", right: 14, top: 8, fontSize: 30, color: "rgba(240,244,234,.9)" }}>
          {dur(v.dur)}
        </span>
      )}
      {sel && (
        <span className="check-badge" style={{ position: "absolute", left: 12, top: 12 }}>
          <Icon name="check" size={14} color="var(--ink-dark)" />
        </span>
      )}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.label}</span>
        <span className="small" style={{ color: "rgba(240,244,234,.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {bad ? v.error || "ยังไม่ได้ตัด" : `${v.shots} ช็อต${v.active ? " · ใช้อยู่" : ""}`}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── ตัวอย่างแบบ (แผงขวาบน) ───────────────────────────

function PreviewVideo({
  v,
  style,
  letter,
  frame,
  lufs,
  hook,
  sub,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onTimeline,
  onUse,
  useBusy,
  paused,
}: {
  v: Variant;
  style: string;
  letter: string;
  frame: { w: number; h: number };
  lufs: number;
  hook: string;
  sub: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onTimeline?: () => void;
  onUse?: () => void;
  useBusy?: boolean;
  /** ลิ้นชักเปิดอยู่ — หยุดวิดีโอ */
  paused: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (paused) ref.current?.pause();
  }, [paused]);
  const total = len || v.dur;
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const seek = (pct: number) => {
    const el = ref.current;
    if (el && total > 0) el.currentTime = pct * total;
  };
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div className="thumb" style={{ width: 110, height: 196, flexShrink: 0 }}>
        {v.ok ? (
          <video
            ref={ref}
            src={variantUrl(v.id, v.made, style)}
            poster={v.first ? thumbUrl(v.first) : undefined}
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setLen(e.currentTarget.duration || 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onClick={toggle}
            style={{ cursor: "pointer" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, textAlign: "center" }}>
            <span className="muted small">{v.error || "ยังไม่ได้ตัด"}</span>
          </div>
        )}
        {hook && <span className="hook-preview" style={{ fontSize: 11 }}>{hook}</span>}
        {sub && <span className="sub-preview" style={{ fontSize: 10.5 }}>{sub}</span>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span className="num" style={{ fontSize: 34, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={v.label}>
          {letter} · {Math.round(v.dur)} <span className="muted" style={{ fontSize: 16 }}>วิ</span>
        </span>
        <span className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {v.shots} ช็อต · {frame.w}×{frame.h} · {lufs > 0 ? "" : "−"}{Math.abs(lufs).toFixed(0)} LUFS
        </span>
        <div style={{ flex: 1 }} />
        {onUse && (
          <Btn sm on onClick={onUse} disabled={useBusy} title="สลับให้ชั้นแต่ง/ส่งออก ทำต่อจากแบบนี้">
            {useBusy ? "กำลังสลับ…" : "ใช้แบบนี้"}
            <Icon name="chev" size={11} />
          </Btn>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn sm ic onClick={onPrev} disabled={!canPrev} title="แบบก่อนหน้า">
            <Icon name="prev" size={12} />
          </Btn>
          <Btn sm pri onClick={toggle} disabled={!v.ok} style={{ flex: 1, boxShadow: "none" }} title={playing ? "หยุด" : "เล่นตัวอย่างของแบบนี้"}>
            <Icon name={playing ? "pause" : "play"} size={12} color="var(--ink-dark)" />
            {playing ? "หยุด" : "เล่น"}
          </Btn>
          <Btn sm ic onClick={onNext} disabled={!canNext} title="แบบถัดไป">
            <Icon name="next" size={12} />
          </Btn>
        </div>
        <span
          style={{ display: "block", padding: "4px 0", cursor: v.ok ? "pointer" : undefined }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - r.left) / Math.max(1, r.width));
          }}
          title="กดเพื่อเลื่อน"
        >
          <Bar pct={total > 0 ? (t / total) * 100 : 0} />
        </span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="muted small num">
            {dur(t)} / {dur(total)}
          </span>
          {onTimeline && (
            <button type="button" className="tab small" onClick={onTimeline} style={{ color: "var(--amber)", padding: 0, gap: 3, alignItems: "center" }} title="ไทม์ไลน์เต็ม — สลับ/ตัด/เล็มช็อตของแบบที่ใช้อยู่">
              ไทม์ไลน์
              <Icon name="chev" size={10} color="var(--amber)" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── หน้า ③ ───────────────────────────

export default function Variants({ dim = false }: { dim?: boolean }) {
  const eng = useEngine();
  const r = useRoute();
  const s = useStudio();
  const running = Boolean(eng.job?.running);
  const proj = eng.proj;
  const [switching, setSwitching] = useState(false);
  const [recutting, setRecutting] = useState(false);
  const [build, setBuild] = useState<OutKind>("fx");

  // ── สไตล์ที่ดูอยู่ ↔ ก้อน variants ของเอนจิน ──
  const styleNow = styleNowOf(r.style, proj);
  const { variantsStyle, setVariantsStyle } = eng;
  useEffect(() => {
    if (variantsStyle !== styleNow) setVariantsStyle(styleNow);
  }, [styleNow, variantsStyle, setVariantsStyle]);
  const vd = eng.variantsData;
  const loaded = vd !== null && (vd.style === styleNow || (!vd.style && vd.project_style === styleNow));
  const variants = useMemo(() => (loaded ? eng.variants : []), [loaded, eng.variants]);
  const styleInfo = useMemo(() => new Map((vd?.styles ?? []).map((x) => [x.style, x])), [vd]);
  const tabs = useMemo(() => styleTabs(s.setup), [s.setup]);
  const tabNow = tabs.find((t) => t.key === styleNow);
  const letter = tabNow ? (tabNow.custom ? tabNow.label : tabNow.letter) : styleNow;
  const cut = new Set(proj?.styles_cut ?? []);

  // ── แบบที่ใช้อยู่ · แบบที่ดูอยู่ ──
  const active = variants.find((v) => v.active) ?? null;
  const okList = variants.filter((v) => v.ok);
  const view = variants.find((v) => v.id === r.variant) ?? active ?? okList[0] ?? null;
  const viewIdx = view ? okList.findIndex((v) => v.id === view.id) : -1;

  // ── ชั้นแต่ง (ของแบบที่ active — store ถือ fx/captions ของแบบนั้น) ──
  const rows = useMemo(() => new Map(layerRows(s).map((l) => [l.id, l])), [s]);
  const rb = s.rebuild;
  const modN = (s.dirty ? 1 : 0) + (s.fx.dirty ? 1 : 0) + (s.cap.dirty ? 1 : 0);
  const dirtyFiles = [s.dirty && "edl.json", s.cap.dirty && "captions.json", s.fx.dirty && "fx.json"].filter(Boolean) as string[];
  const hookText = useMemo(() => {
    const t = s.fx.draft?.texts.find((x) => (x.lines?.length ?? 0) === 0 && !x.id.startsWith("tr:") && !x.count);
    return t?.text.split("\n")[0] ?? "";
  }, [s.fx.draft]);
  const subText = s.cap.draft?.enabled ? (s.cap.data?.cues[0]?.text ?? "") : "";

  // ── ส่งออก ──
  const buildDef = BUILD.find((b) => b.v === build) ?? BUILD[2];
  const outFile = s.outs.find((o) => o.kind === build);
  const eta = build === "out" ? rb.eta.edl : build === "text" ? rb.eta.edl * Number(rb.edl) + rb.eta.text : rb.eta.edl * Number(rb.edl) + rb.eta.fx;
  const canExport = Boolean(view?.active && active && s.shots.length) && !running;

  // ── สรุปบนแถบบน: ตัดเสร็จ n / 6 · เวลาที่ใช้ตัด ──
  const okN = variants.filter((v) => v.ok).length;
  const totalN = styleInfo.get(styleNow)?.total ?? variants.length;
  const took = (vd?.items ?? []).filter((x) => x.ok).reduce((a, x) => a + (x.took || 0), 0);

  const activateThis = async (v: Variant) => {
    if (running || switching || v.active || !v.ok) return;
    if (modN && !confirm("มีที่แก้ค้างในแบบที่ใช้อยู่ — สลับแบบแล้วจะทิ้งที่ยังไม่บันทึก ไปต่อไหม")) return;
    setSwitching(true);
    try {
      const ok = await eng.activateVariant(v.id, styleNow);
      if (ok && !v.hasLayers) await eng.runJob("autofx");
      if (ok) eng.flash(`ใช้แบบ ${v.label} แล้ว${v.hasLayers ? "" : " — กำลังวางชั้นแต่งตามสูตร"}`);
    } finally {
      setSwitching(false);
    }
  };

  const pick = (v: Variant) => {
    if (!v.ok) return;
    r.setVariant(v.id);
    if (!running && !v.active) void activateThis(v);
  };

  // แท็บที่ยังไม่ตัด: วางค่าสูตรลงโปรเจกต์ → recut (ใช้ listen เดิม) → ไปหน้า ② ดูสถานะ
  // เปลี่ยน ?st= กับ ?s= ต้องคนละรอบ (route.set อ่าน query ตอน render) — ตั้ง st ก่อน แล้วค่อย go(2) เมื่อ URL ตามทัน
  const goAfterStyle = useRef<string | null>(null);
  useEffect(() => {
    if (goAfterStyle.current !== null && r.style === goAfterStyle.current) {
      goAfterStyle.current = null;
      r.go(2);
    }
  }, [r]);
  const recut = async (tab: StyleTab) => {
    if (running || recutting) return;
    const path = s.setup?.project.path;
    if (!path) return eng.flash("ยังไม่มีไฟล์โปรเจกต์ — ใส่วิดีโอที่ขั้น ① ก่อน");
    setRecutting(true);
    try {
      await api2.saveSetup(path, tab.values);
      const ok = await eng.runJob("recut");
      if (!ok) return;
      if (r.style === tab.key) r.go(2);
      else {
        goAfterStyle.current = tab.key;
        r.setStyle(tab.key);
      }
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "วางค่าสูตรไม่สำเร็จ");
    } finally {
      setRecutting(false);
    }
  };
  const pickTab = (tab: StyleTab) => {
    if (tab.key === styleNow) return;
    if (cut.has(tab.key)) {
      eng.setVariantsStyle(tab.key);
      r.setStyle(tab.key);
    } else void recut(tab);
  };

  const onExport = async () => {
    if (!canExport) return;
    if (dirtyFiles.length) await s.saveAll();
    await eng.runJob(buildDef.step);
  };

  const openEdit = (id: Edit3) => {
    if (!view?.active) return eng.flash("กด “ใช้แบบนี้” ก่อน ถึงจะแก้ชั้นแต่งของแบบนั้นได้");
    r.openEdit(id);
  };

  const gridStyle = dim ? { opacity: 0.3, filter: "saturate(.5) blur(1px)", pointerEvents: "none" as const } : undefined;

  return (
    <>
      <TopBar
        right={
          running || !vd ? undefined : (
            <span className="muted small" style={{ width: 170, textAlign: "right", whiteSpace: "nowrap" }} title="แบบที่ตัดเสร็จ / ทั้งหมด · เวลาที่ใช้ตัด">
              ตัดเสร็จ {okN} / {totalN} · {dur(took)}
            </span>
          )
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 410px", gap: 28, padding: "12px 36px 28px", minHeight: 0, ...gridStyle }}>
        {/* ── ซ้าย: แท็บสไตล์ + 6 แบบ ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <span className="h1">เลือกแบบ</span>
            <span className="muted">สไตล์ที่ตัดแล้วอยู่ในแท็บ · กดสไตล์อื่นเพื่อตัดเพิ่ม</span>
          </div>
          <div style={{ display: "flex", gap: 26, overflowX: "auto", flexShrink: 0 }}>
            {tabs.map((t) => {
              const on = t.key === styleNow;
              const isCut = cut.has(t.key);
              const n = on ? okN : (styleInfo.get(t.key)?.ok ?? 0);
              return (
                <button
                  key={t.key}
                  type="button"
                  className={cx("tab", on && "on")}
                  disabled={!isCut && (running || recutting)}
                  onClick={() => pickTab(t)}
                  title={isCut ? `${t.label} — ตัดแล้ว ${n} แบบ` : `ตัดเพิ่มด้วยสูตร ${t.letter || t.label} (ใช้บทพูดที่ถอดไว้แล้ว)`}
                  style={!isCut && (running || recutting) ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  {t.letter && <b>{t.letter}</b>}
                  {t.label}
                  <span className="cnt">
                    {isCut ? (
                      `${n} แบบ`
                    ) : (
                      <>
                        {recutting ? "กำลังสั่ง…" : "ตัดเพิ่ม"}
                        <Icon name="chev" size={10} color="var(--muted)" />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {variants.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              <Empty className="w-full" style={{ maxWidth: 420 }}>
                {loaded ? "ยังไม่มีแบบ — กลับไปขั้น ② แล้วกด ตัดให้เลย" : "กำลังโหลดแบบ…"}
                <div style={{ marginTop: 12 }}>
                  <Btn onClick={() => r.go(2)}>
                    <Icon name="back" size={12} />
                    เลือกสไตล์
                  </Btn>
                </div>
              </Empty>
            </div>
          ) : (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gridTemplateRows: "repeat(2, minmax(0,1fr))", gap: 16, minHeight: 0 }}>
              {variants.slice(0, 6).map((v) => (
                <VariantCard key={v.id} v={v} sel={view?.id === v.id} hook={v.active ? hookText : ""} sub={v.active ? subText : ""} onClick={() => pick(v)} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <Btn sm ghost onClick={() => r.go(2)} title="เปลี่ยนสไตล์/ชั้นแต่งแล้วตัดใหม่ — บทพูดไม่ถอดซ้ำ">
              <Icon name="back" size={12} />
              เปลี่ยนสไตล์
            </Btn>
            {variants.length > 0 && (
              <span className="cap small">
                {variants.length} แบบใช้ชั้นแต่งของ{tabNow?.custom ? "ที่กำหนดเอง" : `สูตร ${letter}`}เหมือนกัน ต่างกันที่การตัด
              </span>
            )}
          </div>
        </div>

        {/* ── ขวา: ตัวอย่าง · ชั้นแต่ง · ส่งออก ── */}
        <div className="panel deep" style={{ display: "flex", flexDirection: "column", padding: "16px 22px", minHeight: 0, overflowY: "auto" }}>
          {!view ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted small">{variants.length ? "เลือกแบบทางซ้าย" : "ยังไม่มีแบบให้ดู"}</span>
            </div>
          ) : (
            <>
              <PreviewVideo
                key={`${styleNow}:${view.id}:${view.made}`}
                v={view}
                style={styleNow}
                letter={letter}
                frame={s.frame}
                lufs={s.lufs}
                hook={view.active ? hookText : ""}
                sub={view.active ? subText : ""}
                onPrev={() => viewIdx > 0 && r.setVariant(okList[viewIdx - 1].id)}
                onNext={() => viewIdx >= 0 && viewIdx < okList.length - 1 && r.setVariant(okList[viewIdx + 1].id)}
                canPrev={viewIdx > 0}
                canNext={viewIdx >= 0 && viewIdx < okList.length - 1}
                onTimeline={view.active ? () => r.openEdit("tl") : undefined}
                onUse={view.ok && !view.active ? () => void activateThis(view) : undefined}
                useBusy={running || switching}
                paused={dim}
              />

              <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 0 0", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 400 }}>ชั้นแต่งของแบบนี้</span>
                <span className="muted small">{view.active ? `เปิด/ปิดได้ · เรนเดอร์ใหม่เฉพาะแบบนี้ ~${rb.eta.fx} วิ` : "กด “ใช้แบบนี้” ก่อน ถึงจะแก้ได้"}</span>
              </div>
              <div className="rows" style={{ display: "flex", flexDirection: "column", opacity: view.active ? 1 : 0.55 }}>
                {LAYER_META.map((m) => {
                  const row = rows.get(m.id);
                  const on = view.active ? Boolean(row?.on) : false;
                  const note = view.active ? (row?.note ?? "—") : view.hasLayers ? "ดูได้เมื่อใช้แบบนี้" : "จะวางให้ตามสูตรเมื่อใช้แบบนี้";
                  const subTog = m.id === "sub" && view.active && s.cap.draft !== null;
                  return (
                    <div key={m.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", alignItems: "center", gap: 14, padding: "5px 0" }}>
                      <Tog
                        on={on}
                        disabled={!subTog}
                        onChange={subTog ? (v) => s.cap.patch({ enabled: v }) : undefined}
                        title={subTog ? (on ? "ปิดซับ (บันทึกตอนส่งออก)" : "เปิดซับ") : view.active ? "เปิด/ปิดได้ในลิ้นชักแก้" : "กด “ใช้แบบนี้” ก่อน"}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                          <Icon name={m.icon} size={14} color={on ? "var(--amber)" : "var(--muted)"} />
                          {m.name}
                        </span>
                        <span className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {note}
                        </span>
                      </div>
                      <Btn sm onClick={() => openEdit(m.id)} disabled={!view.active} title={view.active ? "เปิดลิ้นชักแก้ชั้นนี้" : "กด “ใช้แบบนี้” ก่อน"}>
                        {!on && (m.id === "sticker" || m.id === "music" || m.id === "text") ? "เพิ่ม" : "แก้"}
                        <Icon name="chev" size={11} />
                      </Btn>
                    </div>
                  );
                })}
              </div>

              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10 }}>
                <Seg items={BUILD.map((b) => ({ v: b.v, label: b.label, title: b.tip }))} value={build} onChange={setBuild} />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Cta className="w-full" onClick={onExport} disabled={!canExport} busy={running && eng.lastStep === buildDef.step} title={running ? "เอนจินกำลังทำงานอื่น" : !view.active ? "ส่งออกได้เฉพาะแบบที่ใช้อยู่ — กด “ใช้แบบนี้” ก่อน" : `สั่ง ${buildDef.step}${dirtyFiles.length ? ` (บันทึก ${dirtyFiles.join(" · ")} ก่อน)` : ""}`}>
                      ส่งออก · {letter} · {Math.round(view.dur)} วิ
                    </Cta>
                  </div>
                  {FEATURES.openFinder && (
                    <Btn lg ic style={{ width: 52 }} title="เปิดโฟลเดอร์ไฟล์ออก">
                      <Icon name="folder" size={15} />
                    </Btn>
                  )}
                </div>
                <span className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "rtl", textAlign: "left" }} title={outFile?.path ?? s.info?.project.out_dir}>
                  {outFile?.path ?? s.info?.project.out_dir ?? "…"} · ~{fmtClock(eta)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
