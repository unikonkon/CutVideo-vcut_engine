"use client";

// ลิ้นชัก "คลังชิ้น" (CPOOL) — prepare → pool.json · ชิ้นที่ compose จะหยิบ
//
// สวิตช์ KEEP ผูกกับ `[prepare] keep` ซึ่งในเอนจินเป็นรายชื่อ *คลิป* ที่สั่งให้
// "ข้ามตัวกรอง" (prepare.py: force = keep − exclude) ไม่ใช่รายชื่อชิ้นที่จะใช้
// — ชิ้นที่ผ่านตัวกรองอยู่แล้ว (ok) ถูกใช้โดยไม่ต้องอยู่ใน keep  สวิตช์จึงมีผล
// จริงกับสองกรณี: เปิดชิ้นที่ถูกกรองทิ้ง = ดึงทั้งคลิปนั้นกลับ · ปิดชิ้นของคลิปที่
// ดึงกลับไว้ = ปล่อยให้ตัวกรองทำงานตามเดิม  ส่วน "ทิ้งทั้งคลิป" เป็นเรื่องของ
// scan.exclude ที่ขั้น ① (ห้ามยัดมาปนกันในลิสต์เดียว ไม่งั้นความหมายกลับด้าน)

import { useMemo, useState } from "react";
import Drawer from "@/components/frames/Drawer";
import { Btn, Keys, Kv, Led, Mono, Seg7, Spin, Stat, Tag, Tog, Well, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api3, type PoolPiece } from "@/lib/api";
import { dur } from "@/lib/time";
import { num, targetLabel, useStep2 } from "./state";

type Filter = "all" | "TALK" | "BROLL" | "dropped";

const COLS = "30px 44px 52px 96px 44px 1fr 44px 56px";

function fmt1(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

export default function PoolDrawer() {
  const eng = useEngine();
  const r = useRoute();
  const s = useStep2();
  const pool = s.pool;
  const running = Boolean(eng.job?.running);
  const [filter, setFilter] = useState<Filter>("all");
  // ร่าง = รายชื่อคลิปใน keep · null = ยังไม่แตะ (ใช้ของจริง)
  const [keepDraft, setKeepDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const savedKeep = useMemo(() => {
    const k = pool?.params["prepare.keep"];
    return Array.isArray(k) ? k.map(String) : [];
  }, [pool]);
  const keep = keepDraft ?? savedKeep;
  const keepSet = useMemo(() => new Set(keep), [keep]);
  const mod = useMemo(() => {
    const a = new Set(savedKeep);
    let n = 0;
    for (const k of keep) if (!a.has(k)) n++;
    for (const k of a) if (!keepSet.has(k)) n++;
    return n;
  }, [savedKeep, keep, keepSet]);

  // เรียงตามคลิปแล้วตามเวลา — ชิ้นของคลิปเดียวกันอยู่ติดกัน (สวิตช์มีผลทั้งคลิป)
  const pieces = useMemo(() => {
    const ps = [...(pool?.pieces ?? [])];
    ps.sort((a, b) => (a.num - b.num) || a.name.localeCompare(b.name) || a.start - b.start);
    return ps;
  }, [pool]);
  const counts = useMemo(() => {
    const c = { all: pieces.length, TALK: 0, BROLL: 0, dropped: 0 };
    for (const p of pieces) {
      if (p.kind === "TALK") c.TALK++;
      else c.BROLL++;
      if (!p.ok && !keepSet.has(p.name)) c.dropped++;
    }
    return c;
  }, [pieces, keepSet]);
  const shown = useMemo(
    () => pieces.filter((p) => (filter === "all" ? true : filter === "dropped" ? !p.ok && !keepSet.has(p.name) : p.kind === filter)),
    [pieces, filter, keepSet],
  );
  // เลขลำดับสั้น ๆ ต่อชนิด (T01 · B07) ไว้อ่านในตาราง — id จริงอยู่ที่ title
  const shortId = useMemo(() => {
    const m = new Map<string, string>();
    let t = 0;
    let b = 0;
    for (const p of pieces) m.set(p.id, p.kind === "TALK" ? `T${String(++t).padStart(2, "0")}` : `B${String(++b).padStart(2, "0")}`);
    return m;
  }, [pieces]);

  const toggleClip = (p: PoolPiece) => {
    const on = keepSet.has(p.name);
    setKeepDraft(on ? keep.filter((k) => k !== p.name) : [...keep, p.name]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api3.savePool(keep);
      s.setPool(res.pool);
      setKeepDraft(null);
      eng.flash(`บันทึก keep ${res.kept} คลิป แล้ว — เอนจินเตรียมคลังใหม่ให้แล้ว`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึกคลังไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const pa = pool?.params ?? {};
  const talk = (pa.talk ?? {}) as Record<string, unknown>;
  const jc = (pa.jumpcut ?? {}) as Record<string, unknown>;
  const keptPieces = pieces.filter((p) => p.ok || keepSet.has(p.name));
  const keptDur = keptPieces.reduce((a, p) => a + p.dur, 0);
  const clipsN = pool?.summary.clips ?? 0;
  const keptClips = new Set(keptPieces.map((p) => p.name)).size;
  const target = num(s.eff("compose.target_minutes"), 0);

  let lastClip = "";

  return (
    <Drawer
      tag="SEC 02b · POOL"
      title={`คลังชิ้น · ${pool?.summary.usable ?? "…"}`}
      sub="prepare → pool.json · ชิ้นที่ compose จะหยิบ · สวิตช์ = ดึงคลิปกลับ/ปล่อยตามตัวกรอง (keep)"
      onClose={r.closeDrawer}
      width={860}
      badge={
        mod > 0 ? (
          <Well className="mono" style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--amber)" }}>
            MOD {mod} · UNSAVED
          </Well>
        ) : undefined
      }
      bodyStyle={{ overflow: "hidden" }}
      footer={
        <>
          <Btn sm on={mod > 0} disabled={mod === 0 || saving || running} onClick={save} title="เขียน [prepare] keep แล้วเอนจินเตรียมคลังใหม่ทันที">
            <Led on={mod > 0} dim={running} />
            บันทึกคลัง · keep {keep.length}
          </Btn>
          <Btn sm disabled={running} onClick={() => eng.track("compose", () => api3.compose())} title="เรียงใหม่จากคลังนี้ แล้วต่อไฟล์จาก cache">
            จัดใหม่ · compose
          </Btn>
          <Btn sm disabled={running} onClick={() => eng.runJob("prepare")} title="ตัดทีละคลิปใหม่ด้วยค่าตั้งปัจจุบัน (tier edl · rank 1)">
            เตรียมใหม่ (prepare · rank 1)
          </Btn>
          <Btn sm ghost onClick={() => r.setAdv("cfg")}>
            ตั้งค่าเตรียมคลัง ▸ ขั้นสูง
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn sm off disabled={mod === 0} onClick={() => setKeepDraft(null)}>
            ทิ้ง
          </Btn>
        </>
      }
    >
      {!pool ? (
        <Spin />
      ) : !pool.has ? (
        <Well dashed style={{ padding: 18, textAlign: "center" }}>
          <Kv>ยังไม่มี pool.json — กด &ldquo;เตรียมใหม่&rdquo; หรือ &ldquo;ตัดให้เลย&rdquo; ก่อน</Kv>
        </Well>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Keys<Filter>
              items={[
                { v: "all", label: "ทั้งหมด", n: counts.all },
                { v: "TALK", label: "TALK", n: counts.TALK },
                { v: "BROLL", label: "BROLL", n: counts.BROLL },
                { v: "dropped", label: "ทิ้งแล้ว", n: counts.dropped },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <div style={{ flex: 1 }} />
            <Well className="mono" style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap" }} title="ค่าตั้งที่ใช้ตอนเตรียมคลังรอบล่าสุด (pool.params)">
              NOISE {fmt1(jc.noise_db)} dB · MIN_SHOT {fmt1(talk.min_shot)} · GAP {fmt1(talk.gap_merge)} · PRE/POST {fmt1(talk.margin_pre)}/{fmt1(talk.margin_post)}
            </Well>
          </div>
          <Kv style={{ fontSize: 10.5 }}>
            keep = รายชื่อ<b>คลิป</b>ที่สั่งข้ามตัวกรอง ไม่ใช่รายชิ้น — สวิตช์หนึ่งตัวมีผลทุกชิ้นของคลิปนั้น · ชิ้นที่ผ่านตัวกรองอยู่แล้วปิดไม่ได้จากตรงนี้ (ทิ้งทั้งคลิปที่ขั้น ①) · ชิ้นที่หรี่ = ถูกกรองทิ้ง
          </Kv>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, padding: "0 12px" }}>
            <Tag>KEEP</Tag>
            <Tag>ID</Tag>
            <Tag>KIND</Tag>
            <Tag>RANGE</Tag>
            <Tag>DUR</Tag>
            <Tag>TEXT / CLIP</Tag>
            <Tag style={{ textAlign: "right" }}>SCORE</Tag>
            <Tag>LUFS</Tag>
          </div>
          <Well style={{ flex: 1, display: "flex", flexDirection: "column", padding: "2px 0", overflowY: "auto", minHeight: 0 }}>
            {shown.map((p) => {
              const forced = keepSet.has(p.name);
              const on = p.ok || forced;
              // สวิตช์กดได้เมื่อมันจะเปลี่ยนอะไรจริง: ชิ้นที่ถูกกรอง (ดึงกลับ) หรือคลิปที่ดึงกลับไว้ (ปล่อย)
              const canToggle = !p.ok || forced;
              const head = p.name !== lastClip;
              lastClip = p.name;
              const score = p.score ?? p.ai_score;
              const lufs = Array.isArray(p.loud_ref) ? p.loud_ref[0] : undefined;
              const why = typeof p.why === "string" ? p.why : "";
              return (
                <div key={p.id}>
                  {head && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 1px", borderTop: "1px solid var(--edge)" }}>
                      <Mono style={{ fontSize: 10, color: forced ? "var(--amber)" : "var(--muted)" }}>{p.name}</Mono>
                      <Kv style={{ fontSize: 10 }}>
                        {dur(p.clip_duration)} · {p.orient}
                        {forced ? " · KEEP (ข้ามตัวกรอง)" : ""}
                      </Kv>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, alignItems: "center", padding: "6px 12px", opacity: on ? 1 : 0.45 }} title={`${p.id}${why ? `\n${why}` : ""}${p.used ? "\nอยู่ใน EDL ปัจจุบัน" : ""}`}>
                    <Tog on={on} disabled={!canToggle || running} onChange={() => toggleClip(p)} title={canToggle ? (forced ? `ปล่อย ${p.name} ให้ตัวกรองทำงานตามเดิม` : `ดึง ${p.name} กลับทั้งคลิป (ข้ามตัวกรอง)`) : "ผ่านตัวกรองอยู่แล้ว — ทิ้งทั้งคลิปได้ที่ขั้น ①"} />
                    <Seg7 size={11} off={!on}>
                      {shortId.get(p.id)}
                    </Seg7>
                    <span className="strip">
                      <span style={{ color: p.kind === "TALK" ? "var(--ink)" : "var(--muted)" }}>{p.kind}</span>
                    </span>
                    <Mono style={{ fontSize: 11 }}>
                      {dur(p.start)}–{dur(p.end)}
                    </Mono>
                    <Mono className="kv" style={{ fontSize: 11 }}>
                      {p.dur.toFixed(1)}
                    </Mono>
                    <span className={cx("truncate", p.used && "sel-ring")} style={{ fontSize: 12, padding: p.used ? "0 4px" : undefined }}>
                      {p.text ? p.text : `${p.name}${p.motion != null ? ` · MOTION ${p.motion}` : ""}${p.bright != null ? ` · BRIGHT ${p.bright}` : ""}`}
                      {!p.ok && why ? <Kv style={{ fontSize: 10.5 }}> ({why})</Kv> : null}
                    </span>
                    <Seg7 size={12} off={score == null} style={{ textAlign: "right" }}>
                      {score == null ? "—" : Number(score).toFixed(2)}
                    </Seg7>
                    <Mono className="kv" style={{ fontSize: 10.5 }}>
                      {lufs == null ? "—" : Number(lufs).toFixed(1)}
                    </Mono>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && (
              <div style={{ padding: "10px 12px" }}>
                <Kv>ไม่มีชิ้นในตัวกรองนี้</Kv>
              </div>
            )}
          </Well>
          <div style={{ display: "flex", gap: 18 }}>
            <Stat className="flex-1" label="KEEP" value={`${keptClips} / ${clipsN} คลิป · ${keptPieces.length} ชิ้น · ${dur(keptDur)}`} />
            <Stat className="flex-1" label="TARGET" value={`${targetLabel(target)} · ${String(s.eff("compose.mode") ?? "")}`} />
            <Stat className="flex-1" label="SILENCE" value={`${pool.summary.jump_pieces} PCS · ${dur(pool.summary.jump_saved)} CUT`} title="ชิ้นที่มาจากการตัดชนช่วงเงียบ · เวลาที่ตัดออก" />
          </div>
        </>
      )}
    </Drawer>
  );
}
