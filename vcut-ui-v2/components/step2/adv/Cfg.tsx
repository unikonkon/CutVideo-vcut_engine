"use client";

// แท็บ ตั้งค่า (CQ2ADV) — ค่าทั้ง 135 ตัว จัดกลุ่มตามขั้นที่มันรับใช้ พร้อมราคาของการแก้
//
// กลุ่มหลักสามกลุ่มกางไว้ (② เตรียมคลัง · ③ รวมร่าง · ④ ตัดชิ้น·ต่อไฟล์) เพราะเป็นค่าที่
// คนแก้บ่อยจริง ที่เหลือพับรวมไว้ใต้ "N MORE" — แต่กลุ่มสร้างจาก setup.stages กับ
// field.stage ของเอนจิน ไม่ได้ hardcode คีย์ เอนจินเพิ่มค่าใหม่แล้วโผล่เอง

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api3, type Estimate, type SetupField } from "@/lib/api";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { Btn, Cost, Empty, Fld, Keys, Kv, Mono, Tag, Well, fmtBytes, fmtClock } from "@/components/instrument";
import { AdvFrame, FieldInput, bars, same, tierRank, worstTier, type TabProps } from "./shared";

/** กลุ่มที่กางไว้ก่อน เรียงตาม mockup — stage ที่ไม่อยู่ในนี้ไปรวมใต้ MORE */
const MAIN: string[][] = [["prepare"], ["compose"], ["render", "assemble"]];

interface Grp {
  id: string;
  title: string;
  /** คำนำหน้าคีย์ที่อยู่ในกลุ่ม เช่น "talk / jumpcut / broll" */
  sub: string;
  fields: SetupField[];
}

export default function Cfg(p: TabProps) {
  const { setup, draft, put, drop, val, field } = p;
  const eng = useEngine();
  const r = useRoute();
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState<Record<string, boolean>>({});
  const hist = useLoader(() => api3.history(), eng.reloadKey);
  const gc = useLoader(() => api3.gc(), eng.reloadKey);
  const n = Object.keys(draft).length;

  /** ค่านี้ "ตั้งเอง" ไหม — ไฟล์โปรเจกต์ทับค่าที่ตกมาจาก preset หรือเพิ่งแก้ใน draft */
  const own = (k: string) => k in draft || !same(setup.values[k], setup.inherited[k]);
  const nOwn = setup.fields.filter((f) => own(f.key)).length;

  const { main, rest } = useMemo(() => {
    const want = q.trim().toLowerCase();
    const by = new Map<string, SetupField[]>();
    for (const f of setup.fields) {
      // สวิตช์ "รันขั้น 1-5" ของเอนจินรุ่นเก่า และโฟลเดอร์ฟุตเทจ (ย้ายทีเดียวทั้งคลัง
      // ไม่ใช่งานของฟอร์ม — คลิปเข้าทาง "เพิ่มคลิป" ขั้น ① เท่านั้น)
      if (f.stage === "run" || f.key === "project.source") continue;
      if (want && !f.key.toLowerCase().includes(want) && !f.label.toLowerCase().includes(want) && !(f.help ?? "").toLowerCase().includes(want)) continue;
      if (mine && !own(f.key)) continue;
      if (!by.has(f.stage)) by.set(f.stage, []);
      by.get(f.stage)!.push(f);
    }
    const stages = setup.stages ?? [];
    const label = (id: string) => stages.find((s) => s.id === id)?.label ?? id;
    const mk = (ids: string[]): Grp => {
      const fs = ids.flatMap((id) => by.get(id) ?? []);
      const labels = ids.map(label);
      // "④ ตัดชิ้น" + "④ ต่อไฟล์" → "④ ตัดชิ้น · ต่อไฟล์" (ตัดเลขวงกลมซ้ำ)
      const head = labels[0]?.slice(0, 1) ?? "";
      const title = labels.map((l, i) => (i > 0 && head && l.startsWith(head) ? l.slice(1).trim() : l)).join(" · ");
      const sub = [...new Set(fs.map((f) => f.key.split(".")[0]))].join(" / ");
      return { id: ids.join("+"), title, sub, fields: fs };
    };
    const mainIds = MAIN.flat();
    const restIds = stages.map((s) => s.id).filter((id) => !mainIds.includes(id) && by.has(id));
    // stage ที่เอนจินไม่ได้ประกาศชื่อไว้แต่มี field — โชว์ด้วยชื่อดิบ ไม่ทิ้งเงียบ
    for (const id of by.keys()) if (!mainIds.includes(id) && !restIds.includes(id)) restIds.push(id);
    return {
      main: MAIN.map(mk).filter((g) => g.fields.length),
      rest: restIds.map((id) => mk([id])).filter((g) => g.fields.length),
    };
    // own() อ่าน draft/setup ซึ่งอยู่ใน deps อยู่แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, q, mine, draft]);

  const restFields = rest.flatMap((g) => g.fields);
  const restWorst = worstTier(setup, restFields.map((f) => f.key));
  const expandAll = !!q.trim() || mine;

  // ── ประเมิน render ด้วยค่าที่ยังไม่บันทึก (หน่วง 600 ms) — เฉพาะเมื่อ draft แตะค่าที่
  // ทำให้ชิ้นเปลี่ยน (tier render/edl) ไม่งั้นแก้ชื่อโปรเจกต์ก็ไปรัน compose ในเอนจินเปล่า ๆ
  const estKeys = Object.keys(draft).filter((k) => ["render", "edl"].includes(field(k)?.tier ?? ""));
  const estSig = JSON.stringify(estKeys.map((k) => [k, draft[k]]));
  const hasEst = estKeys.length > 0;
  const [est, setEst] = useState<{ sig: string; data: Estimate | null; err: string } | null>(null);
  useEffect(() => {
    if (!hasEst) return;
    const sig = estSig;
    const t = setTimeout(async () => {
      try {
        // ส่งเฉพาะคีย์ที่มีผลต่อชิ้น (ถอดกลับจาก sig เอง — จะได้ไม่ต้องอ้าง draft ทั้งก้อนใน effect)
        const vals = Object.fromEntries(JSON.parse(sig) as [string, unknown][]);
        const d = await api3.estimate(vals);
        setEst({ sig, data: d, err: "" });
      } catch (e) {
        setEst({ sig, data: null, err: e instanceof Error ? e.message : "ประเมินไม่ได้" });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [estSig, hasEst]);

  const tierKeys = Object.keys(setup.tiers);
  const legend = [
    { n: 1, label: "no rebuild" },
    { n: 2, label: "assemble" },
    { n: 3, label: "listen / silence" },
    { n: 4, label: "render all" },
  ];

  const grid = (fields: SetupField[]) =>
    fields.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {fields.map((f) => {
          const chg = f.key in draft;
          const wide = ["text", "multi", "multi_order", "clips", "list_str", "list_float"].includes(f.type);
          return (
            <Fld
              key={f.key}
              chg={chg}
              style={wide ? { gridColumn: "1 / -1" } : undefined}
              title={`${f.help ?? f.label}\ntier: ${setup.tiers[f.tier]?.label ?? f.tier}${own(f.key) && !chg ? `\nตั้งเองในไฟล์นี้ · ค่าตั้งต้น ${JSON.stringify(setup.inherited[f.key])}` : ""}`}
              label={
                <>
                  <span style={own(f.key) ? { color: "var(--ink)" } : undefined}>{f.key}</span> · {f.label}
                  {chg && (
                    <span onClick={() => drop(f.key)} title={`ทิ้งที่แก้ — กลับเป็น ${JSON.stringify(setup.values[f.key])}`} style={{ color: "var(--amber)", cursor: "pointer", marginLeft: 6 }}>
                      ↶
                    </span>
                  )}
                </>
              }
            >
              <FieldInput f={f} value={val(f.key)} onChange={(v) => put(f.key, v)} />
            </Fld>
          );
        })}
      </div>
    );

  const group = (g: Grp, dim = false): ReactNode => {
    const worst = worstTier(setup, g.fields.map((f) => f.key));
    const base = g.fields.filter((f) => !f.adv);
    const adv = g.fields.filter((f) => f.adv);
    const open = advOpen[g.id] || expandAll;
    return (
      <Well key={g.id} style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, opacity: dim ? 0.6 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>
            {g.title}
            {g.sub && <span style={{ color: "var(--muted)", fontWeight: 400 }}> — {g.sub}</span>}
          </span>
          <Cost n={bars(tierRank(setup, worst))} label={setup.tiers[worst]?.label ?? worst} />
          <div style={{ flex: 1 }} />
          {adv.length > 0 && !expandAll && (
            <Btn sm ghost onClick={() => setAdvOpen((a) => ({ ...a, [g.id]: !a[g.id] }))} title="ค่าที่ตั้งไว้ถูกแล้วสำหรับเกือบทุกคน — เปิดดูถ้ารู้ว่าจะแก้อะไร">
              ขั้นสูง {adv.length} {open ? "▴" : "▾"}
            </Btn>
          )}
          <Mono className="kv" style={{ fontSize: 10.5 }}>
            {g.fields.length} VALUES
          </Mono>
        </div>
        {grid(base)}
        {open && grid(adv)}
      </Well>
    );
  };

  const footer = (
    <>
      <Btn sm onClick={() => r.setAdv("reset")} title="ไปแท็บรีเซ็ต — เลือก scope แล้วคืนค่าตั้งต้น">
        รีเซ็ตขั้นนี้
      </Btn>
      <Btn sm onClick={() => r.setAdv("reset")} title="snapshot ที่เอนจินถ่ายไว้ก่อนรีเซ็ตทุกครั้ง">
        ประวัติ {hist.data ? hist.data.snaps.length : "…"}
      </Btn>
      <Btn sm onClick={() => r.setAdv("reset")} title="segment ที่ EDL ไม่ใช้แล้ว — ล้างได้ที่แท็บรีเซ็ต">
        ล้าง cache {gc.data ? fmtBytes(gc.data.unused_bytes) : "…"}
      </Btn>
      <div style={{ flex: 1 }} />
      <Btn sm off disabled={!n} onClick={p.discard}>
        ทิ้ง
      </Btn>
      <Btn sm on disabled={!n || p.saving} onClick={() => void p.save()}>
        บันทึก {n} ค่า
      </Btn>
    </>
  );

  return (
    <AdvFrame sub={`ค่าที่แก้บันทึกลง ${setup.project.path || "(ยังไม่มีไฟล์โปรเจกต์)"}${setup.project.extends ? ` · ต่อยอดจาก ${setup.project.extends}` : ""}`} draftN={n} onClose={p.onClose} footer={footer}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="fld" style={{ flex: 1 }}>
          <input type="text" className="well in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH ▸ min_shot · lufs · noise …" style={{ fontSize: 11 }} />
        </div>
        <Keys<"mine" | "all">
          items={[
            { v: "mine", label: "เฉพาะที่ตั้งเอง", n: nOwn, title: "ค่าที่ไฟล์โปรเจกต์นี้ทับไว้ หรือเพิ่งแก้ — ที่เหลือตกมาจาก preset" },
            { v: "all", label: "ทั้งหมด", n: setup.fields.length },
          ]}
          value={mine ? "mine" : "all"}
          onChange={(v) => setMine(v === "mine")}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Tag>COST OF CHANGE</Tag>
        {legend.map((l) => (
          <Cost key={l.n} n={l.n} label={l.label} />
        ))}
        <div style={{ flex: 1 }} />
        <Kv style={{ fontSize: 10.5 }} title={tierKeys.map((t) => `${t} · rank ${setup.tiers[t].rank} · ${setup.tiers[t].label}`).join("\n")}>
          {tierKeys.length} TIERS
        </Kv>
      </div>

      {hasEst && (
        <Well style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 10px" }}>
          <Tag>EST</Tag>
          {est && est.sig === estSig ? (
            est.data ? (
              <Mono style={{ fontSize: 10.5 }}>
                render ใหม่ <b style={{ color: "var(--amber)" }}>{est.data.new}</b> ชิ้น · ใช้ซ้ำ {est.data.reuse} · ~{fmtClock(est.data.render_seconds + est.data.measure_seconds)} · หนัง {fmtClock(est.data.duration)} · {est.data.segments} ชิ้น ({est.data.talk} พูด + {est.data.broll} วิว)
              </Mono>
            ) : (
              <Kv style={{ color: "var(--danger)" }}>{est.err}</Kv>
            )
          ) : (
            <Kv style={{ fontSize: 10.5 }}>กำลังประเมินด้วยค่าที่แก้…</Kv>
          )}
        </Well>
      )}

      {main.map((g) => group(g))}

      {rest.length > 0 &&
        (expandAll || moreOpen ? (
          <>
            {!expandAll && (
              <Btn sm ghost onClick={() => setMoreOpen(false)} style={{ alignSelf: "flex-start" }}>
                พับกลุ่มที่เหลือ ▴
              </Btn>
            )}
            {rest.map((g) => group(g))}
          </>
        ) : (
          <Well onClick={() => setMoreOpen(true)} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }} title="กางกลุ่มที่เหลือ">
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{rest.map((g) => g.title).slice(0, 3).join(" · ")} …</span>
            <Cost n={bars(tierRank(setup, restWorst))} label={setup.tiers[restWorst]?.label ?? restWorst} />
            <div style={{ flex: 1 }} />
            <Mono className="kv" style={{ fontSize: 10.5 }}>
              {restFields.length} MORE ▾
            </Mono>
          </Well>
        ))}

      {main.length === 0 && rest.length === 0 && <Empty>ไม่มีค่าไหนตรงกับที่ค้น</Empty>}
    </AdvFrame>
  );
}
