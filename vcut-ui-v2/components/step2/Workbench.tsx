"use client";

// แผงซ้ายของขั้น ② (q2_left ใน mockup) — SEC 01 สไตล์ · ปุ่มควบคุม · SEC 02 ชั้นแต่งหนัง
//
// ทุกอย่างในนี้ *ไม่เขียนไฟล์เอง*: การ์ดสไตล์/ความยาว/AI วางค่าลงร่าง (useStep2)
// แล้วปุ่ม "ตัดให้เลย" ทางขวาบันทึกทีเดียว  แถวชั้นแต่งหนังเป็นสรุปอ่านอย่างเดียว
// ปุ่ม "แก้" พาไปแผงจริงที่ขั้น ③

import type { CSSProperties } from "react";
import { Btn, Keys, Knob, Kv, Led, Mono, Panel, SecHead, Seg7, Tag, Tog, Well, fmtBytes } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute, type Edit3 } from "@/hooks/route";
import { usePref } from "@/lib/pref";
import type { SetupRecipe } from "@/lib/api";
import { num, targetLabel, useStep2 } from "./state";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** ภาพประจำการ์ด — ลอกจาก mockup: A แผ่นแดง · B เลขนับ · C เส้นนีออน · D เปล่า */
function Art({ style }: { style: string }) {
  const base: CSSProperties = { height: 88, borderRadius: 3, background: "var(--edge)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 };
  if (style === "A") {
    return (
      <div style={{ ...base, background: "color-mix(in srgb, var(--red) 40%, var(--edge))" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>คลิป VDO ของคุณ</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--amber)" }}>ดูเจ๋ง ได้เนี่ย</span>
      </div>
    );
  }
  if (style === "B") {
    return (
      <div style={base}>
        <Seg7 size={26}>255.9K</Seg7>
      </div>
    );
  }
  if (style === "C") {
    return (
      <div style={base}>
        <svg width="110" height="28" viewBox="0 0 120 30" fill="none">
          <path d="M6 6 C 40 6 40 24 74 24 L 114 24" stroke="var(--amber)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px var(--amber))" }} />
        </svg>
      </div>
    );
  }
  return <div style={base} />;
}

type StyledRecipe = SetupRecipe & { style: string; shot?: string };

function StyleCards() {
  const s = useStep2();
  const recipes = ((s.setup?.recipes ?? []) as Partial<StyledRecipe>[]).filter((r): r is StyledRecipe => typeof r.style === "string" && !!r.style);
  if (recipes.length === 0) {
    return (
      <Well dashed style={{ padding: 14, textAlign: "center" }}>
        <Kv>เอนจินยังไม่ส่งสูตรสไตล์ (recipes ที่มี style) — ตั้งค่าเองได้ที่ ขั้นสูง ▸ ตั้งค่า</Kv>
      </Well>
    );
  }
  // การ์ดที่ "ติดไฟ" = ค่าปัจจุบัน (รวมร่าง) ตรงกับสูตรนั้นทุกคีย์
  const lit = (r: StyledRecipe) => Object.entries(r.values).every(([k, v]) => same(s.eff(k), v));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, recipes.length)}, minmax(0, 1fr))`, gap: 12 }}>
      {recipes.map((r) => {
        const on = lit(r);
        const parts = r.hint.split(" · ");
        const sub = parts.length > 1 ? parts.slice(1, 3).join(" · ") : r.hint;
        return (
          <Well key={r.preset} sel={on} onClick={() => s.stage(r.values)} title={`${r.hint}\npreset ${r.preset} · ${Object.keys(r.values).length} ค่า`} style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <Art style={r.style} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Led on={on} />
              <span className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>
                {r.style} · {r.label}
              </span>
            </div>
            <Kv className="truncate">
              ช็อต <b>{r.shot || "—"}</b> · {sub}
            </Kv>
          </Well>
        );
      })}
    </div>
  );
}

const LENGTHS: { v: string; label: string }[] = [
  { v: "0.5", label: "30" },
  { v: "0.75", label: "45 s" },
  { v: "1", label: "60" },
  { v: "0", label: "ALL" },
];

const VARIANT_TITLE = "เอนจินยังทำแบบเดียวต่อโปรเจกต์ (เฟสถัดไป)";

function Controls() {
  const s = useStep2();
  const eng = useEngine();
  const target = num(s.eff("compose.target_minutes"), 0);
  const lenKey = LENGTHS.find((l) => Math.abs(Number(l.v) - target) < 1e-6)?.v ?? null;

  const tasks = (Array.isArray(s.eff("ai.tasks")) ? (s.eff("ai.tasks") as unknown[]) : []).map(String);
  const aiOn = Boolean(s.eff("ai.enabled")) && (tasks.includes("trim_suggest") || tasks.includes("shot_scoring"));
  const setAi = (on: boolean) => {
    if (!on) return s.stage({ "ai.enabled": false });
    const next = [...tasks];
    for (const t of ["shot_scoring", "trim_suggest"]) if (!next.includes(t)) next.push(t);
    s.stage({ "ai.enabled": true, "ai.tasks": next });
  };
  // ความชอบฝั่งเบราว์เซอร์ — ขั้น ③ อ่านไปตัดสินว่าจะสั่ง review ให้เองไหม
  const [autoReview, setAutoReview] = usePref<"0" | "1">("vcut2.autoReview", "0", (v) => v === "0" || v === "1");

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tag>Length</Tag>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Keys sm={false} items={LENGTHS} value={lenKey} onChange={(v) => s.stage({ "compose.target_minutes": Number(v) })} />
          {lenKey === null && <Kv title="ค่าที่สูตรตั้งไว้ ไม่ตรงกับปุ่มไหน">เป้า {targetLabel(target)}</Kv>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tag>Variants</Tag>
        <Keys
          sm={false}
          items={[
            { v: "1", label: "1", title: `แบบ ${eng.variants.map((x) => x.id).join(" · ") || "A"}` },
            ...["2", "3", "4", "5"].map((v) => ({ v, label: v, disabled: true, title: VARIANT_TITLE })),
          ]}
          value="1"
          onChange={() => undefined}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tag>AI · claude -p</Tag>
        <div style={{ display: "flex", gap: 14, alignItems: "center", height: 30, flexWrap: "wrap" }}>
          <Tog on={aiOn} onChange={setAi} label={<span>ไฮไลต์ให้ 1 แบบ <Mono className="kv">{aiOn ? tasks.join(" · ") : "trim_suggest · shot_scoring"}</Mono></span>} title="ai.enabled + ai.tasks — ให้ AI ให้คะแนนช็อตและเสนอตัดสั้น" />
          <Tog on={autoReview === "1"} onChange={(v) => setAutoReview(v ? "1" : "0")} label={<span>ดูหนังแล้วเสนอแก้ <Mono className="kv">review · ขั้น ③</Mono></span>} title="จำไว้ในเบราว์เซอร์ (vcut2.autoReview) — ขั้น ③ ใช้ตัดสินว่าจะสั่ง AI review ให้เอง" />
        </div>
      </div>
    </div>
  );
}

interface LayerRow {
  id: Edit3;
  name: string;
  kv: React.ReactNode;
  on: boolean;
  dim?: boolean;
  /** ตำแหน่งลูกบิด 0–1 (ตกแต่ง — บอก "มีของมากแค่ไหน") */
  v: number;
}

const ALIGN: Record<number, string> = { 1: "ล่างซ้าย", 2: "กลางล่าง", 3: "ล่างขวา", 4: "กลางซ้าย", 5: "กลางจอ", 6: "กลางขวา", 7: "บนซ้าย", 8: "กลางบน", 9: "บนขวา" };

function Layers() {
  const s = useStep2();
  const r = useRoute();
  const cap = s.captions;
  const fx = s.fx;

  const rows: LayerRow[] = [];
  {
    const st = cap?.style;
    const autoCues = cap?.cues.filter((c) => c.kind === "auto").length ?? 0;
    const on = Boolean(cap?.auto.enabled);
    rows.push({
      id: "sub",
      name: "ซับจากบทพูด",
      on,
      dim: !on,
      v: on ? Math.min(1, autoCues / 40) : 0,
      kv: st ? (
        <>
          {st.font} {st.bold ? "หนา" : ""} · {ALIGN[st.align] ?? `align ${st.align}`} · <b>{st.size}</b> · {on ? `${autoCues} บรรทัด` : "ปิดอยู่"}
          {cap && cap.auto.drop.length > 0 ? ` · ตัด ${cap.auto.drop.length}` : ""}
        </>
      ) : (
        "…"
      ),
    });
  }
  {
    const texts = fx?.fx.texts ?? [];
    const anims = [...new Set(texts.map((t) => t.anim).filter(Boolean))];
    const presets = [...new Set(texts.map((t) => t.preset).filter(Boolean))];
    const shapes = fx?.fx.shapes?.length ?? 0;
    rows.push({
      id: "text",
      name: "HOOK + การ์ดปิด",
      on: texts.length > 0,
      v: Math.min(1, texts.length / 10),
      kv: fx ? (
        <>
          ข้อความ <b>{texts.length}</b>
          {shapes ? ` · รูปทรง ${shapes}` : ""} · {anims.length ? anims.join("/") : "ไม่มีแอนิเมชัน"} · {presets.length ? `ชุด ${presets.join(", ")}` : "ไม่ผูกชุดสไตล์"}
        </>
      ) : (
        "…"
      ),
    });
  }
  {
    const music = fx?.fx.music ?? [];
    rows.push({
      id: "music",
      name: `เพลง · ${music.length} แทร็ก`,
      on: music.length > 0,
      dim: music.length === 0,
      v: music.length ? Math.min(1, (num(music[0].gain_db, -40) + 40) / 46) : 0,
      kv: fx ? (
        music.length ? (
          <>
            {music.map((m, i) => (
              <span key={m.id || i}>
                {i > 0 ? " — " : ""}TR{i + 1} {m.file.replace(/\.[^.]+$/, "").slice(0, 22)} <b>{m.gain_db} dB</b>
                {m.duck ? ` · DUCK ${m.duck_db}` : ""}
                {m.loop ? " · LOOP" : ""}
              </span>
            ))}
          </>
        ) : (
          "ยังไม่มีเพลง — เพิ่มที่ 03 ▸ เพลง"
        )
      ) : (
        "…"
      ),
    });
  }
  {
    const overlays = fx?.fx.overlays ?? [];
    const assets = fx?.overlay.assets.length ?? 0;
    rows.push({
      id: "sticker",
      name: "สติกเกอร์ / ภาพซ้อน",
      on: overlays.length > 0,
      dim: overlays.length === 0,
      v: Math.min(1, overlays.length / 8),
      kv: fx ? (
        <>
          วางแล้ว <b>{overlays.length}</b> · คลังไฟล์ {assets}
          {fx.overlay.missing.length ? ` · หายไป ${fx.overlay.missing.length}` : ""}
        </>
      ) : (
        "…"
      ),
    });
  }
  {
    const j = fx?.fx.journey;
    const on = Boolean(j?.enabled);
    const stops = j?.stops?.length ?? 0;
    rows.push({
      id: "map",
      name: "แผนที่เส้นทาง",
      on,
      dim: !on,
      v: on ? Math.min(1, stops / 10) : 0,
      kv: fx ? (
        <>
          journey · <b>{stops}</b> หมุด · {on ? "เปิด" : "ปิด"} · {j?.look === "neon" ? "เส้นเรือง" : "เส้นทึบ"}
        </>
      ) : (
        "…"
      ),
    });
  }
  {
    const clips = Object.values(fx?.fx.clips ?? {});
    const touched = fx?.view.touched ?? 0;
    const grades = [...new Set(clips.map((c) => c.grade).filter(Boolean))];
    const zooms = [...new Set(clips.map((c) => c.zoom).filter((z) => z && z !== 1))];
    const speeds = [...new Set(clips.map((c) => c.speed).filter((z) => z && z !== 1))];
    rows.push({
      id: "fx",
      name: "เอฟเฟกต์รายช็อต",
      on: touched > 0,
      dim: touched === 0,
      v: Math.min(1, touched / 12),
      kv: fx ? (
        touched ? (
          <>
            แต่ง <b>{touched}</b> ช็อต · {grades.length ? grades.join("/") : "ไม่แตะสี"}
            {zooms.length ? ` · ZOOM ${zooms.map((z) => z.toFixed(2)).join("/")}` : ""}
            {speeds.length ? ` · SPEED ${speeds.join("/")}` : ""}
          </>
        ) : (
          "ยังไม่แตะช็อตไหน · โทนสี / ซูม / ความเร็ว"
        )
      ) : (
        "…"
      ),
    });
  }

  return (
    <Well style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
      {rows.map((row) => (
        <div key={row.id} className="row" style={row.dim ? { opacity: 0.6 } : undefined}>
          <Knob value={row.v} min={0} max={1} step={0.01} off={row.dim} title={`${row.name} — ลูกบิดบอกปริมาณ แก้ค่าจริงที่ปุ่ม แก้`} />
          <span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
          <Kv className="truncate" style={{ minWidth: 0 }}>
            {row.kv}
          </Kv>
          <Btn sm onClick={() => r.openEdit(row.id)} title={`ไปแก้ที่ขั้น ③ · ${row.id}`}>
            แก้
          </Btn>
          <Led on={row.on} />
        </div>
      ))}
    </Well>
  );
}

export default function Workbench() {
  const s = useStep2();
  const eng = useEngine();
  const r = useRoute();
  const locked = Boolean(eng.job?.running);
  const fields = s.setup?.fields ?? [];
  const nPick = fields.find((f) => f.key === "compose.mode")?.options?.length ?? 0;
  const nOrder = fields.find((f) => f.key === "order.mode")?.options?.length ?? 0;
  const poolN = s.pool?.summary.usable ?? 0;
  const trN = s.transcript?.summary.segments ?? 0;
  const styled = (s.setup?.recipes ?? []).filter((x) => "style" in x && x.style).length;

  return (
    <Panel style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px", overflow: "hidden", position: "relative", minWidth: 0 }}>
      {locked && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(28,30,27,.62)", zIndex: 2, borderRadius: 6, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 14 }}>
          <Btn onClick={eng.stopJob} title="หยุดงานที่กำลังรัน">
            <Led on />
            LOCKED · กำลังตัด — กด STOP แล้วแก้ได้
          </Btn>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <SecHead
          tag="SEC 01 · STYLE"
          title="สไตล์"
          kv={styled ? `สูตร ${styled} แบบจากเอนจิน · ตัวเลขวัดจากคลิปอ้างอิงจริง` : "สูตรสไตล์มาจาก recipes ของเอนจิน"}
          right={
            s.mod > 0 ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Well className="mono" style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--amber)" }}>
                  MOD {s.mod} · UNSAVED
                </Well>
                <Btn sm off onClick={s.revert}>
                  ทิ้ง
                </Btn>
              </span>
            ) : undefined
          }
        />
        <StyleCards />
        <Controls />
        <SecHead tag="SEC 02 · LAYERS" title="ชั้นแต่งหนัง" kv="ค่าตั้งต้นของทุกแบบ · แก้รายแบบได้อีกทีที่ 03" className="mt-0.5" />
        <Layers />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn onClick={() => r.openDrawer("pool")} title="prepare → pool.json · ชิ้นที่ compose จะหยิบ">
          คลังชิ้น · {poolN} ▸
        </Btn>
        <Btn onClick={() => r.openDrawer("trans")} title="listen → transcript.json">
          บทพูด · {trN} ▸
        </Btn>
        <Btn onClick={() => r.openDrawer("adv")} title="ค่าตั้งทั้งหมด · วิธีเลือกชิ้น · AI · ไปป์ไลน์ · รีเซ็ต">
          ขั้นสูง ▸
        </Btn>
        <Mono className="kv" style={{ fontSize: 10.5 }}>
          CFG {fields.length} · PICK {nPick} · ORDER {nOrder} · AI · PIPELINE · RESET/HISTORY · CACHE {s.gc ? fmtBytes(s.gc.work_bytes) : "…"}
        </Mono>
        <div style={{ flex: 1 }} />
        <Kv style={{ fontSize: 11 }}>ทุกอย่างที่เอนจินทำได้อยู่ในนี้</Kv>
      </div>
    </Panel>
  );
}
