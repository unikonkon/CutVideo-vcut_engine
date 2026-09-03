"use client";

// CFXSHOT — เอฟเฟกต์รายช็อต (fx.json clips · กุญแจจาก view.segments[].key)
//   แถวคีย์ช็อต (T1 B1 T2 … + ความยาว) · SPEED/ZOOM/ZOOM TO/VOL · PAN + MUTE · GRADE
//   · GLITCH/HZ/WHIP (KEN ไม่มีคีย์ — ตัดออก) · SPLIT (ทิศ · คลิปดิบ · เริ่มที่) · ใช้กับทุกช็อต · RENDER
//   ช่วงค่าตาม v1 Properties: speed 0.1–8 · zoom 1–4 · zoom_to 0 หรือ 1–4 · vol_db −40…12

import { useMemo } from "react";
import { Btn, Empty, Fld, Keys, Knob, Kv, NIn, SecHead, Sel, Stat, Tag, Tog } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import type { FxClip } from "@/lib/api";
import { useStudio } from "@/components/step3/store";
import { EditShell, KnobGrid, TagRow } from "./common";

const PAN_LABEL: Record<string, string> = { "": "ไม่ไถล", l: "←", r: "→", u: "↑", d: "↓" };

/** ซูมเริ่ม/จบที่จะเกิดจริง — สูตรเดียวกับ fx._zoom_pair ของเอนจิน */
function zoomPair(f: FxClip) {
  const z0 = f.zoom || 1;
  let z1 = f.zoom_to || 0;
  if (z1 <= 1e-6) z1 = z0;
  else if (z1 < 1) z1 = 1;
  return { z0, z1, room: Math.max(z0, z1) > 1 + 1e-6 };
}

export default function FxShotEditor() {
  const s = useStudio();
  const eng = useEngine();
  const d = s.fx.data;
  const dr = s.fx.draft;
  const shots = s.shots;

  // ช็อตที่แก้อยู่ = ที่เลือกบนไทม์ไลน์ ไม่งั้นช็อตใต้หัวเล่น
  const cur = s.sel ?? s.playheadAt?.i ?? (shots.length ? 0 : null);
  const fx = cur != null ? s.fxOfShot(cur) : null;
  const base = d?.defaults.clip;

  // ป้าย T1 B1 T2 … นับแยกตามชนิด
  const labels = useMemo(() => {
    let t = 0;
    let b = 0;
    return shots.map((x) => (x.kind === "TALK" ? `T${++t}` : `B${++b}`));
  }, [shots]);

  if (!d || !dr || !base) {
    return (
      <EditShell id="fx" badge="EDIT FX" tag="SEC 05e · PER-SHOT FX" title="เอฟเฟกต์รายช็อต">
        <Empty>กำลังโหลด fx.json…</Empty>
      </EditShell>
    );
  }

  const set = (p: Partial<FxClip>) => cur != null && s.setShotFx(cur, p);
  const touched = fx ? (Object.keys(base) as (keyof FxClip)[]).some((k) => fx[k] !== base[k]) : false;
  const zp = fx ? zoomPair(fx) : null;
  const grades = Object.entries(d.defaults.grade);
  const pans = Object.entries(d.defaults.pan);
  const splits = Object.entries(d.defaults.split ?? {});
  const clipNames = eng.clips.map((c) => c.name);

  /** ก๊อปค่าที่ตั้งให้ช็อตนี้ไปทุกช็อตที่เข้าเงื่อนไข — คิดทั้งชุดใน patch เดียว (setShotFx ทีละตัวจะทับกันเอง
   *  เพราะแต่ละครั้งอ่าน draft ตัวเดิม) และไม่แตะ split_with ที่ผูกกับคลิปเฉพาะ */
  const applyAll = (onlyTalk: boolean) => {
    if (!fx) return;
    const clips = { ...dr.clips };
    const next = { ...fx };
    shots.forEach((sh, i) => {
      if (onlyTalk && sh.kind !== "TALK") return;
      const key = s.fxKeys[i];
      if (!key) return;
      const untouched = (Object.keys(base) as (keyof FxClip)[]).every((k) => next[k] === base[k]);
      if (untouched) delete clips[key];
      else clips[key] = { ...next };
    });
    s.fx.patch({ clips });
    s.flash(`ใช้ค่านี้กับ${onlyTalk ? "ช็อต TALK ทุกตัว" : "ทุกช็อต"}แล้ว — ชิ้นที่ถูกแต่งจะ render ใหม่ตอนสร้าง ⑤`);
  };

  const shot = cur != null ? shots[cur] : undefined;
  const topleft = fx && zp && shot
    ? `SHOT ${labels[cur!]} · ZOOM ${zp.z0.toFixed(2)}${zp.z1 !== zp.z0 ? ` → ${zp.z1.toFixed(2)}` : ""} · PAN ${PAN_LABEL[fx.pan] ?? fx.pan} · GRADE ${fx.grade || "—"} · ${fx.speed !== 1 ? `${fx.speed}×` : "1×"}`
    : "SHOT — · เลือกช็อตจากแถวข้างขวา";

  return (
    <EditShell
      id="fx"
      badge={`EDIT FX · ${shot ? `SHOT ${labels[cur!]}` : "—"} · แต่ง ${Object.keys(dr.clips).length}`}
      tag="SEC 05e · PER-SHOT FX"
      title="เอฟเฟกต์รายช็อต"
      revert={s.fx.revert}
      leftNote="ค่ารายช็อตอยู่ใน fx.json (speed zoom zoom_to pan grade glitch whip split mute vol_db) — ช็อตที่แก้ถูก render ใหม่เฉพาะชิ้น"
      topleft={topleft}
    >
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxHeight: 96, overflowY: "auto" }}>
        {shots.map((x, i) => {
          const on = i === cur;
          const has = Boolean(s.fxKeys[i] && dr.clips[s.fxKeys[i] as string]);
          return (
            <Btn key={`${x.name}-${i}`} sm on={on} onClick={() => { s.setSel(i); s.seek(s.offsets[i]); }} style={{ flex: "1 0 44px", flexDirection: "column", gap: 0, lineHeight: 1.2, minWidth: 44 }} title={`${x.name} · ${x.kind} · ${x.dur.toFixed(1)} s${has ? " · แต่งแล้ว" : ""}${s.fxKeys[i] ? "" : " · ยังไม่ได้ตัดชิ้น"}`}>
              {labels[i]}{has ? "•" : ""}
              <span className="mono" style={{ fontSize: 9, color: on ? "var(--amber)" : "var(--muted)" }}>{x.dur.toFixed(1)}</span>
            </Btn>
          );
        })}
      </div>
      {!fx || cur == null ? (
        <Empty>{shots.length ? "ยังตั้งเอฟเฟกต์กับชิ้นนี้ไม่ได้ — ต้องต่อไฟล์ (③) ก่อน เอฟเฟกต์เกาะกับช่วงที่ตัดจริง ซึ่งยังไม่มี" : "ยังไม่มีช็อตในไทม์ไลน์"}</Empty>
      ) : (
        <>
          <KnobGrid>
            <Knob label="SPEED" value={fx.speed} min={0.1} max={8} step={0.05} def={base.speed} fmt={(v) => `${+v.toFixed(2)}`} onChange={(v) => set({ speed: v })} title="< 1 ช้าลง · > 1 เร็วขึ้น" />
            <Knob label="ZOOM" value={fx.zoom} min={1} max={4} step={0.05} def={base.zoom} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ zoom: v })} title="ซูมเริ่ม (1 = เต็มเฟรม)" />
            <Knob label="ZOOM TO" value={fx.zoom_to} min={0} max={4} step={0.05} def={base.zoom_to} fmt={(v) => (v <= 0 ? "OFF" : v.toFixed(2))} onChange={(v) => set({ zoom_to: v <= 0.5 ? 0 : Math.max(1, v) })} title="ซูมจบ · 0 = ค้างที่ซูมเริ่ม" />
            <Knob label="VOL" value={fx.vol_db} min={-40} max={12} step={0.5} def={base.vol_db} off={fx.mute} fmt={(v) => `${v > 0 ? "+" : ""}${v} dB`} onChange={(v) => set({ vol_db: v })} />
          </KnobGrid>
          {zp && zp.z1 !== zp.z0 && <Kv style={{ fontSize: 10.5 }}>กล้องจะไล่ซูมจาก {zp.z0.toFixed(2)} ไป {zp.z1.toFixed(2)} ตลอดช็อต</Kv>}
          <TagRow>
            <Tag>PAN</Tag>
            <Keys items={pans.map(([k, desc]) => ({ v: k, label: PAN_LABEL[k] ?? k, title: desc, disabled: k !== "" && !zp?.room }))} value={fx.pan} onChange={(v) => set({ pan: v })} />
            {!zp?.room && <Kv style={{ fontSize: 10 }}>ต้องซูมเกิน 1 ก่อนถึงมีที่ให้ไถล</Kv>}
            <div style={{ flex: 1 }} />
            <Tog on={fx.mute} onChange={(v) => set({ mute: v })} label="MUTE" title="ตัดเสียงของชิ้นนี้ทั้งชิ้น" />
          </TagRow>

          <SecHead tag="GRADE · โทนสี" />
          <Keys items={grades.map(([k, desc]) => ({ v: k, label: k ? `${k} ${desc.split(" —")[0]}` : "ไม่แตะ", title: desc }))} value={fx.grade} onChange={(v) => set({ grade: v })} />

          <SecHead tag="GLITCH · WHIP" />
          <KnobGrid>
            <Knob label="GLITCH" value={fx.glitch} min={0} max={1} step={0.05} def={0} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ glitch: v })} title="ภาพกระตุก 0 = ปิด" />
            <Knob label="HZ" value={fx.glitch_hz} min={0.2} max={12} step={0.2} def={base.glitch_hz} off={fx.glitch <= 1e-6} fmt={(v) => v.toFixed(1)} onChange={(v) => set({ glitch_hz: v })} title="กระตุกกี่ครั้งต่อวินาที (มีผลเมื่อ GLITCH > 0)" />
            <Knob label="WHIP" value={fx.whip} min={0} max={1} step={0.05} def={0} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ whip: v })} title="เบลอหัว-ท้ายช็อต (ทรานสิชันแบบประมาณ)" />
            <Knob label="KEN" value={0} min={0} max={1} off fmt={() => "—"} title="mockup มี KEN — เอนจินไม่มีคีย์ (ใช้ ZOOM → ZOOM TO + PAN แทน)" />
          </KnobGrid>

          {splits.length > 0 && (
            <>
              <SecHead tag="SPLIT · แบ่งจอสองคน" />
              <Keys items={splits.map(([k, desc]) => ({ v: k, label: k === "" ? "ปิด" : k === "v" ? "บน-ล่าง (v)" : k === "h" ? "ซ้าย-ขวา (h)" : k, title: desc }))} value={fx.split} onChange={(v) => set({ split: v })} />
              {fx.split !== "" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
                  <Fld label="อีกครึ่งใช้คลิป (ฟุตเทจดิบ)">
                    <Sel value={fx.split_with} onChange={(v) => set({ split_with: v })} options={[{ v: "", label: "— เลือกคลิป ▾ (ยังไม่มีผล)" }, ...clipNames.map((v) => ({ v, label: v }))]} />
                  </Fld>
                  <Fld label="เริ่มที่ (วิ)">
                    <NIn value={fx.split_at} step={0.5} min={0} onChange={(v) => set({ split_at: Math.max(0, v) })} />
                  </Fld>
                </div>
              )}
              {fx.split !== "" && fx.split_with && <Kv style={{ fontSize: 10.5 }}>จอตัวอย่างวาดเส้นแบ่งกับชื่อคลิปให้ แต่ยังไม่เล่นภาพของอีกครึ่ง — ดูของจริงในไฟล์ ⑤</Kv>}
            </>
          )}

          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn sm on onClick={() => applyAll(true)} disabled={!touched} title="ก๊อปค่าชุดนี้ให้ช็อต TALK ทุกตัว">ใช้กับทุกช็อต TALK</Btn>
            <Btn sm onClick={() => applyAll(false)} disabled={!touched}>ใช้กับทุกช็อต</Btn>
            <Btn sm onClick={() => set({ ...base })} disabled={!touched} title="คืนทุกช่องเป็น 'ไม่แตะ' — ชิ้นนี้กลับไปใช้ไฟล์ ③ ตรง ๆ">ล้างช็อตนี้</Btn>
          </div>
          <Stat label="RENDER" value={touched ? "ช็อตนี้ render ใหม่ (sha1 เปลี่ยน) · ช็อตอื่น cache" : "ยังไม่แต่ง — ใช้ไฟล์ ③ ตรง ๆ"} warn={touched} />
          {Math.abs(fx.speed - 1) > 1e-6 && shot && <Kv style={{ fontSize: 10.5 }}>ชิ้นนี้จะยาว {(shot.dur / fx.speed).toFixed(2)} วิ (เดิม {shot.dur.toFixed(2)})</Kv>}
        </>
      )}
    </EditShell>
  );
}
