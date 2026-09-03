"use client";

// CMAP — แผนที่เส้นทาง (fx.json journey · vcut_engine/journey.py)
//   เปิด/ปิด · STOPS (stoprow: ชื่อ · เวลาในหนัง · ระยะ · ✕) + หมุดที่หัวเล่น · หมุดที่เลือก (ชื่อ/ระยะ/สี/px py)
//   · UNIT + show_dist · LINE · GLOW (THICK/GLOW/WALK/FIGURE + สี line/trail/walker/core) · LOOK
//   · PANEL (ตำแหน่ง · SIZE/PAD/ALPHA · DUR · IN/OUT) · แผนที่ย่อ (SVG จาก d + หมุด)
//   คีย์จริงของ journey: enabled x y width dur walk in out panel panel_color pad thick figure line trail
//   walker size font look glow core show_dist unit box d stops — mockup "WALKER คนเดิน/จุด/ลูกศร" ไม่มีคีย์
//   (คนเดินมีแบบเดียว ตั้งได้แค่สี walker + ความสูง figure) · "TRAIL" เป็นสี ไม่ใช่ลูกบิด

import { useMemo, useState } from "react";
import { Btn, CIn, Empty, Fld, Keys, Knob, Kv, Led, NIn, POSES, PosGrid, SecHead, Stat, TIn, Tag, Tog, Well, cx } from "@/components/instrument";
import type { FxJourney, JourneyStop } from "@/lib/api";
import { clipToTl } from "@/lib/layers";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, KnobGrid, TagRow, useAdders } from "./common";

const POS_IDS = ["tl", "tr", "c", "bl", "br"];
const UNITS = [
  { v: "ม.", label: "m" },
  { v: "กม.", label: "km" },
];

export default function MapEditor() {
  const s = useStudio();
  const A = useAdders();
  const d = s.fx.data;
  const dr = s.fx.draft;
  const [pick, setPick] = useState<number | null>(null);

  const j = (dr?.journey ?? {}) as FxJourney;
  const stops = useMemo(() => (j.stops ?? []) as JourneyStop[], [j.stops]);
  const times = useMemo(() => stops.map((st) => clipToTl(s.shots, s.offsets, st.name, st.at)), [stops, s.shots, s.offsets]);

  // หมุดที่เลือก = ที่กดไว้ · ไม่งั้นหมุดล่าสุดที่หัวเล่นผ่านมาแล้ว
  const auto = times.reduce<number>((best, t, i) => (t != null && t <= s.playhead + 1e-6 && (best < 0 || (times[best] ?? 0) <= t) ? i : best), -1);
  const sel = pick != null && stops[pick] ? pick : auto >= 0 ? auto : null;
  const st = sel != null ? stops[sel] : undefined;

  if (!d || !dr) {
    return (
      <EditShell id="map" badge="EDIT JOURNEY" tag="SEC 05f · JOURNEY MAP" title="แผนที่เส้นทาง">
        <Empty>กำลังโหลด fx.json…</Empty>
      </EditShell>
    );
  }

  const def = d.defaults.journey;
  const num = (k: string, fb: number) => (Number.isFinite(Number(j[k])) ? Number(j[k]) : Number.isFinite(Number(def[k])) ? Number(def[k]) : fb);
  const str = (k: string, fb: string) => String(j[k] ?? def[k] ?? fb);
  const patchJ = (p: Record<string, unknown>) => s.fx.patch({ journey: { ...j, ...p } });
  const patchStop = (i: number, p: Partial<JourneyStop>) => patchJ({ stops: stops.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const removeStop = (i: number) => {
    patchJ({ stops: stops.filter((_, k) => k !== i) });
    setPick(null);
  };
  const looks = Object.entries(d.defaults.journey_look ?? {});
  const unit = str("unit", "ม.");
  const fmtDist = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${unit}`;

  // แผงเป็นสี่เหลี่ยม box (1000×550) กว้าง width ของจอ · (x, y) คือกึ่งกลางแผง
  const box = (j.box as number[] | undefined) ?? (def.box as number[] | undefined) ?? [1000, 550];
  const width = num("width", 0.46);
  const panelH = width * (box[1] / box[0]) * (s.frame.w / s.frame.h);
  const posSel = POSES.find((p) => POS_IDS.includes(p.id) && Math.abs(p.align === 5 ? 0.5 - num("x", 0.5) : (p.x < 0.5 ? 0.05 + width / 2 : 0.95 - width / 2) - num("x", 0.5)) < 0.03 && Math.abs((p.y < 0.5 ? 0.05 + panelH / 2 : p.y > 0.6 ? 0.95 - panelH / 2 : 0.5) - num("y", 0.5)) < 0.03)?.id ?? null;
  const setPos = (p: (typeof POSES)[number]) => {
    const x = p.align === 5 ? 0.5 : p.x < 0.5 ? 0.05 + width / 2 : 0.95 - width / 2;
    const y = p.align === 5 ? 0.5 : p.y < 0.5 ? 0.05 + panelH / 2 : 0.95 - panelH / 2;
    patchJ({ x: A.r3(A.clamp01(x)), y: A.r3(A.clamp01(y)) });
  };

  const topleft = st && sel != null
    ? `JOURNEY · STOP ${sel + 1}/${stops.length} · ${times[sel] != null ? `${(times[sel] as number).toFixed(1)} s` : "กำพร้า"} · ${fmtDist(st.dist)}`
    : `JOURNEY · ${j.enabled ? "ON" : "OFF"} · ${stops.length} STOPS`;

  return (
    <EditShell
      id="map"
      badge={`EDIT JOURNEY · ${stops.length} STOPS`}
      tag="SEC 05f · JOURNEY MAP"
      title="แผนที่เส้นทาง"
      revert={s.fx.revert}
      leftNote="หนังเดินป่าที่ทุกช็อตหน้าตาเหมือนกัน คนดูหลงตั้งแต่นาทีที่สอง — แผนที่เล็กที่โผล่ตอนถึงเนินแก้เรื่องนี้"
      topleft={topleft}
    >
      <TagRow>
        <Tog on={Boolean(j.enabled)} onChange={(v) => patchJ({ enabled: v })} label={`เปิดแผนที่ในแบบ ${s.variant.id}`} />
        <div style={{ flex: 1 }} />
        <Kv style={{ fontSize: 10.5 }}>ตอบคำถามเดียว: “เดินมาถึงไหนแล้ว”</Kv>
      </TagRow>

      {/* ── แผนที่ย่อ — Player ยังไม่วาดชั้นแผนที่ จึงโชว์ที่นี่แทน (พิกัด box เดียวกับเอนจิน) ── */}
      <Well style={{ padding: 6, background: str("panel_color", "#0E1A22") }} title="แผนที่ย่อ · เส้นจาก d · หมุดจาก px/py (หน่วย box)">
        <svg viewBox={`0 0 ${box[0]} ${box[1]}`} style={{ width: "100%", height: 96, display: "block" }}>
          {j.d ? <path d={String(j.d)} fill="none" stroke={str("trail", "#8695A3")} strokeWidth={num("thick", 7)} strokeLinecap="round" strokeLinejoin="round" /> : null}
          {stops.map((x, i) => (
            <g key={i} onClick={() => { setPick(i); const t = times[i]; if (t != null) s.seek(t); }} style={{ cursor: "pointer" }}>
              <circle cx={x.px} cy={x.py} r={num("thick", 7) * 1.6} fill={x.color} stroke={i === sel ? "var(--amber)" : "#FFFFFF"} strokeWidth={i === sel ? 4 : 2} />
              <text x={x.lx} y={x.ly} fontSize={num("size", 34) * 0.9} fill="#FFFFFF" textAnchor="middle" fontFamily="var(--font-mitr), sans-serif">{x.label}</text>
            </g>
          ))}
          {!j.d && stops.length < 2 && <text x={box[0] / 2} y={box[1] / 2} fontSize={36} fill="#8695A3" textAnchor="middle">ยังไม่มีเส้นทาง — เพิ่มหมุด ≥ 2 จุด</text>}
        </svg>
      </Well>

      <SecHead tag={`STOPS · หมุด ${stops.length}`} right={<Btn sm onClick={() => { const i = A.addStopAt(s.playhead); if (i != null) setPick(i); }} disabled={!s.shots.length} title="หมุดใหม่ผูกกับคลิป/วินาทีใต้หัวเล่น · ต่อเส้นทางให้">+ หมุดที่หัวเล่น</Btn>} />
      {stops.length === 0 ? (
        <Empty>ยังไม่มีหมุด — เลื่อนหัวเล่นไปจุดที่ถึงแล้วกด “+ หมุดที่หัวเล่น”</Empty>
      ) : (
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 170, overflowY: "auto", flexShrink: 0 }}>
          {stops.map((x, i) => {
            const t = times[i];
            return (
              <div key={`${x.id}-${i}`} className={cx("cursor-pointer", i === sel && "sel-ring")} style={{ display: "grid", gridTemplateColumns: "8px 1fr 60px 70px auto", gap: 8, alignItems: "center", padding: "5px 10px", opacity: t == null ? 0.5 : 1 }} onClick={() => { setPick(i); if (t != null) s.seek(t); }} title={t == null ? `เกาะ ${x.name} @${x.at.toFixed(2)} ซึ่งไม่อยู่ในไทม์ไลน์แล้ว` : `${x.name} @${x.at.toFixed(2)} s`}>
                <Led on={t != null} red={t == null} />
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label || "(ไม่มีชื่อ)"}</span>
                <span className="mono kv" style={{ fontSize: 10.5 }}>{t != null ? `${durMs(t)}` : "—"}</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>{fmtDist(x.dist)}</span>
                <Btn sm onClick={(e) => { e.stopPropagation(); removeStop(i); }}>✕</Btn>
              </div>
            );
          })}
        </Well>
      )}
      {st && sel != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 8 }}>
          <Fld label={`หมุด ${sel + 1} · ${st.name || "?"} @${st.at.toFixed(1)}`}>
            <TIn value={st.label} mono={false} onChange={(v) => patchStop(sel, { label: v })} />
          </Fld>
          <Fld label={`ระยะ (${unit})`}>
            <NIn value={st.dist} step={100} min={0} onChange={(v) => patchStop(sel, { dist: v })} />
          </Fld>
          <Fld label="สี">
            <CIn value={st.color} onChange={(v) => patchStop(sel, { color: v })} />
          </Fld>
          <Fld label="px (box)"><NIn value={st.px} step={10} min={0} max={box[0]} onChange={(v) => patchStop(sel, { px: v })} /></Fld>
          <Fld label="py"><NIn value={st.py} step={10} min={0} max={box[1]} onChange={(v) => patchStop(sel, { py: v })} /></Fld>
          <Fld label="ป้าย lx / ly">
            <span style={{ display: "flex", gap: 4 }}>
              <NIn value={st.lx} step={10} onChange={(v) => patchStop(sel, { lx: v })} />
              <NIn value={st.ly} step={10} onChange={(v) => patchStop(sel, { ly: v })} />
            </span>
          </Fld>
        </div>
      )}
      <TagRow>
        <Tag>UNIT</Tag>
        <Keys items={UNITS.map((u) => ({ v: u.v, label: u.label, title: `ป้ายหน่วยต่อท้ายตัวเลข "${u.v}" — เอนจินไม่แปลงหน่วย พิมพ์ dist ให้ตรงเอง` }))} value={UNITS.some((u) => u.v === unit) ? unit : null} onChange={(v) => patchJ({ unit: v })} />
        <TIn value={unit} onChange={(v) => patchJ({ unit: v })} style={{ width: 60 }} />
        <div style={{ flex: 1 }} />
        <Tog on={Boolean(j.show_dist ?? def.show_dist)} onChange={(v) => patchJ({ show_dist: v })} label="show_dist" />
      </TagRow>
      <Kv style={{ fontSize: 10.5 }}>mockup มี WALKER คนเดิน/จุด/ลูกศร — เอนจินมีคนเดินแบบเดียว ตั้งได้แค่สี (walker) กับความสูง (FIGURE)</Kv>

      <SecHead tag="LINE · GLOW" />
      <KnobGrid>
        <Knob label="THICK" value={num("thick", 7)} min={1} max={30} step={0.5} def={Number(def.thick)} fmt={(v) => v.toFixed(1)} onChange={(v) => patchJ({ thick: v })} title="ความหนาเส้น (หน่วย box)" />
        <Knob label="GLOW" value={num("glow", 0.9)} min={0} max={1} step={0.05} def={Number(def.glow)} fmt={(v) => v.toFixed(2)} onChange={(v) => patchJ({ glow: v })} title="แรงแสงฟุ้ง (มีผลเมื่อ LOOK = neon)" />
        <Knob label="WALK" value={num("walk", 1.4)} min={0} max={6} step={0.1} def={Number(def.walk)} fmt={(v) => v.toFixed(1)} onChange={(v) => patchJ({ walk: v })} title="คนเดินใช้เวลากี่วินาทีจากหมุดก่อนหน้า" />
        <Knob label="FIGURE" value={num("figure", 74)} min={20} max={200} step={2} def={Number(def.figure)} onChange={(v) => patchJ({ figure: v })} title="ความสูงคนเดิน (หน่วย box)" />
      </KnobGrid>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
        <Fld label="LINE (เดินแล้ว)"><CIn value={str("line", "#FFFFFF")} onChange={(v) => patchJ({ line: v })} /></Fld>
        <Fld label="TRAIL (ยังไม่ถึง)"><CIn value={str("trail", "#8695A3")} onChange={(v) => patchJ({ trail: v })} /></Fld>
        <Fld label="WALKER"><CIn value={str("walker", "#FF3B30")} onChange={(v) => patchJ({ walker: v })} /></Fld>
        <Fld label="CORE (แกนนีออน)"><CIn value={str("core", "#FFFFFF")} onChange={(v) => patchJ({ core: v })} /></Fld>
      </div>
      <TagRow>
        <Tag>LOOK</Tag>
        <Keys items={looks.map(([k, desc]) => ({ v: k, label: `${k} ${desc.split(" —")[0]}`, title: desc }))} value={str("look", "map")} onChange={(v) => patchJ({ look: v })} />
      </TagRow>

      <SecHead tag="PANEL" />
      <TagRow>
        <div style={{ width: 170 }}>
          <PosGrid ids={POS_IDS} value={posSel} onChange={setPos} />
        </div>
        <Knob size="sm" label="SIZE" value={width} min={0.2} max={1} step={0.01} def={Number(def.width)} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patchJ({ width: A.r3(v) })} title="ความกว้างแผงเทียบจอ" />
        <Knob size="sm" label="PAD" value={num("pad", 26)} min={0} max={80} step={1} def={Number(def.pad)} onChange={(v) => patchJ({ pad: v })} />
        <Knob size="sm" label="ALPHA" value={num("panel", 0.55)} min={0} max={1} step={0.05} def={Number(def.panel)} fmt={(v) => v.toFixed(2)} onChange={(v) => patchJ({ panel: v })} title="ความทึบพื้นหลังแผง · 0 = ไม่มีพื้น" />
      </TagRow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
        <Fld label="DUR (วิ)"><NIn value={num("dur", 3.5)} step={0.1} min={0.3} onChange={(v) => patchJ({ dur: v })} /></Fld>
        <Fld label="IN"><NIn value={num("in", 0.3)} step={0.05} min={0} onChange={(v) => patchJ({ in: v })} /></Fld>
        <Fld label="OUT"><NIn value={num("out", 0.35)} step={0.05} min={0} onChange={(v) => patchJ({ out: v })} /></Fld>
        <Fld label="พื้นแผง"><CIn value={str("panel_color", "#0E1A22")} onChange={(v) => patchJ({ panel_color: v })} /></Fld>
      </div>
      <Stat label="x · y · font" value={`${num("x", 0.5).toFixed(2)} · ${num("y", 0.5).toFixed(2)} · ${str("font", "")} ${num("size", 34)}`} />
      <div style={{ flex: 1 }} />
      <Kv style={{ fontSize: 10.5, lineHeight: "14px" }}>แผนที่วาดด้วย ASS (journey.py) · เส้นทางเป็น path ใน d (หมุดใหม่ต่อเส้นตรงให้ · จอตัวอย่างยังไม่วาดชั้นนี้) · โผล่ตอนถึงแต่ละหมุด (cues) · เก็บใน fx.json ก้อนเดียวกับสติกเกอร์</Kv>
    </EditShell>
  );
}
