"use client";

// แท็บ "เอฟเฟกต์" ของลิ้นชัก — เอฟเฟกต์รายช็อต (fx.json clips · กุญแจจาก view.segments[].key)
//   แถวช็อต (T1 B1 T2 … + ความยาว) · ความเร็ว/ซูมเริ่ม/ซูมจบ/เสียง (− / +) · ไถลกล้อง (ช่อง) · ปิดเสียง
//   โทนสี (ช่อง) · กระตุก/เบลอหัวท้าย (− / +) · แบ่งจอ · ใช้กับทุกช็อต
//   ช่วงค่าตาม v1: speed 0.25–4 · zoom 1–4 · zoom_to 0 หรือ 1–4 · vol_db −40…12

import { useMemo } from "react";
import { Btn, Empty, Fld, Seg, Sel, Stepper, Tog } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import type { FxClip } from "@/lib/api";
import { useStudio } from "@/components/step3/store";
import { EditShell, Grid2, Lbl, Row, Sec, TagRow } from "./common";

const PAN_LABEL: Record<string, string> = { "": "ไม่ไถล", l: "ซ้าย", r: "ขวา", u: "ขึ้น", d: "ลง" };

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
      <EditShell id="fx">
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
    s.flash(`ใช้ค่านี้กับ${onlyTalk ? "ช็อตพูดทุกตัว" : "ทุกช็อต"}แล้ว — ชิ้นที่ถูกแต่งจะเรนเดอร์ใหม่ตอนส่งออก`);
  };

  const shot = cur != null ? shots[cur] : undefined;

  return (
    <EditShell id="fx" revert={s.fx.revert}>
      <Sec title="ช็อต" note={`แต่งแล้ว ${Object.keys(dr.clips).length} · กดช็อตเพื่อแก้`} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 120, overflowY: "auto", flexShrink: 0 }}>
        {shots.map((x, i) => {
          const on = i === cur;
          const has = Boolean(s.fxKeys[i] && dr.clips[s.fxKeys[i] as string]);
          return (
            <Btn key={`${x.name}-${i}`} sm on={on} onClick={() => { s.setSel(i); s.seek(s.offsets[i]); }} style={{ flex: "1 0 52px", minWidth: 52, padding: "0 8px", gap: 4 }} title={`${x.name} · ${x.kind === "TALK" ? "พูด" : "วิว"} · ${x.dur.toFixed(1)} วิ${has ? " · แต่งแล้ว" : ""}${s.fxKeys[i] ? "" : " · ยังไม่ได้ตัดชิ้น"}`}>
              {labels[i]}
              <span className="num" style={{ fontSize: 11, color: has ? "var(--amber)" : "var(--muted)" }}>{x.dur.toFixed(1)}</span>
            </Btn>
          );
        })}
      </div>
      {!fx || cur == null ? (
        <Empty>{shots.length ? "ยังตั้งเอฟเฟกต์กับชิ้นนี้ไม่ได้ — ต้องต่อไฟล์ก่อน เอฟเฟกต์เกาะกับช่วงที่ตัดจริง ซึ่งยังไม่มี" : "ยังไม่มีช็อตในไทม์ไลน์"}</Empty>
      ) : (
        <>
          <Sec title={`ช็อต ${labels[cur]}`} note={shot ? `${shot.name} · ${shot.dur.toFixed(1)} วิ${Math.abs(fx.speed - 1) > 1e-6 ? ` → ${(shot.dur / fx.speed).toFixed(1)} วิ` : ""}` : ""} />
          <Grid2>
            <Row label="ความเร็ว (×)">
              <Stepper value={fx.speed} min={0.25} max={4} step={0.25} fmt={(v) => `${+v.toFixed(2)}`} onChange={(v) => set({ speed: v })} title="< 1 ช้าลง · > 1 เร็วขึ้น" />
            </Row>
            <Row label="เสียง (dB)">
              <Stepper value={fx.vol_db} min={-40} max={12} step={1} fmt={(v) => `${v > 0 ? "+" : ""}${v}`} disabled={fx.mute} onChange={(v) => set({ vol_db: v })} />
            </Row>
            <Row label="ซูมเริ่ม">
              <Stepper value={fx.zoom} min={1} max={4} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => set({ zoom: v })} title="1 = เต็มเฟรม" />
            </Row>
            <Row label="ซูมจบ" title="ซูมไล่จากซูมเริ่มไปค่านี้ตลอดช็อต · ปิด = ค้างที่ซูมเริ่ม">
              <Stepper
                value={fx.zoom_to}
                min={0}
                max={4}
                step={0.1}
                fmt={(v) => (v <= 0 ? "ปิด" : v.toFixed(1))}
                onChange={(v) => {
                  // ช่วง 0–1 ไม่มีความหมาย — กระโดดข้าม: ปิด ↔ 1.0
                  const now = fx.zoom_to;
                  if (v > now && v < 1) return set({ zoom_to: 1 });
                  if (v < now && v < 1) return set({ zoom_to: 0 });
                  set({ zoom_to: v });
                }}
              />
            </Row>
          </Grid2>
          {zp && zp.z1 !== zp.z0 && <Lbl>กล้องจะไล่ซูมจาก {zp.z0.toFixed(2)} ไป {zp.z1.toFixed(2)} ตลอดช็อต</Lbl>}
          <Lbl>ไถลกล้อง{!zp?.room ? " · ต้องซูมเกิน 1 ก่อนถึงมีที่ให้ไถล" : ""}</Lbl>
          <Seg sm cols={Math.min(5, pans.length)} items={pans.map(([k, desc]) => ({ v: k, label: PAN_LABEL[k] ?? k, title: desc, disabled: k !== "" && !zp?.room }))} value={fx.pan} onChange={(v) => set({ pan: v })} />
          <Tog on={fx.mute} onChange={(v) => set({ mute: v })} label="ปิดเสียงช็อตนี้" title="ตัดเสียงของชิ้นนี้ทั้งชิ้น" />

          <Lbl>โทนสี</Lbl>
          <Seg sm cols={3} items={grades.map(([k, desc]) => ({ v: k, label: k ? `${desc.split(" —")[0]}` : "ไม่แตะ", title: desc }))} value={fx.grade} onChange={(v) => set({ grade: v })} />

          <Grid2>
            <Row label="กระตุก">
              <Stepper value={fx.glitch} min={0} max={1} step={0.1} fmt={(v) => (v <= 0 ? "ปิด" : v.toFixed(1))} onChange={(v) => set({ glitch: v })} title="ภาพกระตุก 0 = ปิด" />
            </Row>
            <Row label="กระตุก (ครั้ง/วิ)">
              <Stepper value={fx.glitch_hz} min={0.2} max={12} step={0.2} fmt={(v) => v.toFixed(1)} disabled={fx.glitch <= 1e-6} onChange={(v) => set({ glitch_hz: v })} />
            </Row>
            <Row label="เบลอหัว-ท้าย">
              <Stepper value={fx.whip} min={0} max={1} step={0.1} fmt={(v) => (v <= 0 ? "ปิด" : v.toFixed(1))} onChange={(v) => set({ whip: v })} title="เบลอตอนเข้า/ออกช็อต (ทรานสิชันแบบประมาณ)" />
            </Row>
          </Grid2>

          {splits.length > 0 && (
            <>
              <Lbl>แบ่งจอสองคน</Lbl>
              <Seg sm cols={Math.min(3, splits.length)} items={splits.map(([k, desc]) => ({ v: k, label: k === "" ? "ปิด" : k === "v" ? "บน-ล่าง" : k === "h" ? "ซ้าย-ขวา" : k, title: desc }))} value={fx.split} onChange={(v) => set({ split: v })} />
              {fx.split !== "" && (
                <Grid2>
                  <Fld label="อีกครึ่งใช้คลิป (ฟุตเทจดิบ)">
                    <Sel value={fx.split_with} onChange={(v) => set({ split_with: v })} options={[{ v: "", label: "— เลือกคลิป (ยังไม่มีผล)" }, ...clipNames.map((v) => ({ v, label: v }))]} />
                  </Fld>
                  <Row label="เริ่มที่ (วิ)">
                    <Stepper value={fx.split_at} min={0} max={3600} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => set({ split_at: Math.max(0, v) })} />
                  </Row>
                </Grid2>
              )}
              {fx.split !== "" && fx.split_with && <Lbl>จอตัวอย่างวาดเส้นแบ่งกับชื่อคลิปให้ แต่ยังไม่เล่นภาพของอีกครึ่ง — ดูของจริงในไฟล์ที่ส่งออก</Lbl>}
            </>
          )}

          <TagRow style={{ paddingTop: 6 }}>
            <Btn sm on onClick={() => applyAll(true)} disabled={!touched} title="ก๊อปค่าชุดนี้ให้ช็อตพูดทุกตัว">
              ใช้กับทุกช็อตพูด
            </Btn>
            <Btn sm onClick={() => applyAll(false)} disabled={!touched}>
              ใช้กับทุกช็อต
            </Btn>
            <Btn sm ghost onClick={() => set({ ...base })} disabled={!touched} title="คืนทุกช่องเป็น 'ไม่แตะ' — ชิ้นนี้กลับไปใช้ไฟล์ที่ต่อแล้วตรง ๆ">
              ล้างช็อตนี้
            </Btn>
          </TagRow>
          <Lbl>{touched ? "ช็อตนี้จะเรนเดอร์ใหม่ตอนส่งออก · ช็อตอื่นใช้ของเดิม" : "ยังไม่แต่ง — ใช้ชิ้นที่ต่อแล้วตรง ๆ"}</Lbl>
        </>
      )}
    </EditShell>
  );
}
