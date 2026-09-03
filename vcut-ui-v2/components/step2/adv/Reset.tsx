"use client";

// แท็บ รีเซ็ต · ประวัติ · cache (CRESET) — คืนค่าตั้งต้นตาม scope · ลบของที่ติ๊ก · กู้คืน snapshot
//
// ทุกอย่างเป็น "ดูก่อนทำ": /api/reset (GET) บอกว่าจะคืนคีย์ไหน ลบอะไรได้บ้าง แล้วค่อย POST
// ทีเดียวตอนกดปุ่มท้าย  เอนจินถ่าย snapshot ไฟล์โปรเจกต์ไว้ก่อน apply เสมอ จึงกู้คืนได้

import { useState } from "react";
import { api3, type ResetArtifact } from "@/lib/api";
import { useEngine, useLoader } from "@/hooks/engine";
import { Btn, Cost, Empty, Keys, Kv, Mono, SecHead, Spin, Stat, Tag, Tog, Well, fmtBytes, fmtWhen } from "@/components/instrument";
import { AdvFrame, GLYPH, HeadBadge, PHASE_SHORT, bars, fmtVal, type TabProps } from "./shared";

/** เดา rank ของ tier จากข้อความราคาที่เอนจินส่งมา (artifact ไม่มีช่อง tier) —
 *  ใช้แค่วาดมิเตอร์ 4 ขีด ข้อความจริงยังโชว์เต็มข้าง ๆ */
function guessRank(cost: string) {
  if (/render|ตัดชิ้นที่ใส่/.test(cost)) return 6;
  if (/อ่านคลิป/.test(cost)) return 5;
  if (/ถอดเสียง/.test(cost)) return 4;
  if (/AI|โควตา|วัดความดัง|เข้ารหัส|ตั้งเอฟเฟกต์|หาไฟล์/.test(cost)) return 3;
  if (/ภาพใหม่/.test(cost)) return 2;
  return 1;
}

/** id ของ cache ที่ "ล้าง cache ทั้งหมด" หมายถึง — ชิ้นที่ตัดแล้วของขั้น ③ กับ ⑤ */
const CACHE_IDS = ["segments", "fxseg"];

export default function Reset(p: TabProps) {
  const { setup, draft } = p;
  const eng = useEngine();
  const running = !!eng.job?.running;
  const n = Object.keys(draft).length;
  const [scope, setScope] = useState("all");
  const pv = useLoader(() => api3.resetPreview(scope), `${eng.reloadKey}:${scope}`);
  const gc = useLoader(() => api3.gc(), eng.reloadKey);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [moreKeys, setMoreKeys] = useState(false);
  const [moreSnaps, setMoreSnaps] = useState(false);

  const data = pv.data;
  // ติ๊กไว้ก่อนเฉพาะของที่ทำใหม่ได้ถูก (ไม่ danger) — ของแพงต้องติ๊กเอง
  const isOn = (a: ResetArtifact) => checked[a.id] ?? (a.exists && !a.danger);
  const arts = data?.artifacts ?? [];
  const ids = arts.filter((a) => a.exists && isOn(a)).map((a) => a.id);
  const changes = (data?.keys ?? []).filter((k) => k.changes);
  const snaps = data?.history ?? [];
  const scopeShort = scope === "all" ? "ทั้งหมด" : (() => {
    const ph = setup.phases.find((x) => x.id === scope);
    return ph ? `${GLYPH[ph.no] ?? ph.no} ${PHASE_SHORT[ph.id] ?? ph.label}` : scope;
  })();
  const cacheBytes = arts.filter((a) => CACHE_IDS.includes(a.id)).reduce((s, a) => s + a.bytes, 0);

  const afterWrite = async (setupNew: typeof setup, msg: string) => {
    p.setSetup(setupNew);
    eng.flash(msg);
    await eng.refresh();
    void pv.reload();
    void gc.reload();
  };

  const apply = async (withArts: boolean) => {
    if (!data) return;
    const del = withArts ? ids : [];
    const q = `รีเซ็ต ${data.scope_label}: คืนค่าตั้งต้น ${changes.length} ค่า${del.length ? `\nและลบของ ${del.length} ชิ้น (${del.join(", ")})` : ""}\n\nเอนจินถ่าย snapshot ไฟล์โปรเจกต์ไว้ก่อนเสมอ — ทำต่อ?`;
    if (!window.confirm(q)) return;
    setBusy("apply");
    try {
      const res = await api3.resetApply(scope, true, del);
      await afterWrite(res.setup, `รีเซ็ต ${data.scope_label} แล้ว${del.length ? ` · ลบ ${del.length} ชิ้น` : ""} — กู้คืนได้จาก HISTORY`);
      setChecked({});
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "รีเซ็ตไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const restore = async (id: string, label: string) => {
    if (!window.confirm(`กู้คืนไฟล์โปรเจกต์กลับเป็น snapshot ${id}\n"${label}"\n\nค่าปัจจุบันจะถูกทับ (เอนจินถ่าย snapshot ปัจจุบันไว้ก่อน) — ทำต่อ?`)) return;
    setBusy(id);
    try {
      const res = await api3.restore(id);
      await afterWrite(res.setup, `กู้คืน ${id} แล้ว`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const runGc = async () => {
    if (!gc.data) return;
    if (!window.confirm(`ลบ segment ที่ EDL ไม่ใช้ ${gc.data.unused} ชิ้น (${fmtBytes(gc.data.unused_bytes)})\nชิ้นที่ EDL ใช้อยู่ไม่ถูกแตะ — ทำต่อ?`)) return;
    setBusy("gc");
    try {
      const res = await api3.gcRun();
      eng.flash(`ล้างแล้ว ${fmtBytes(res.freed_bytes)} · เหลือชิ้นที่ใช้ ${res.in_use}`);
      void gc.reload();
      void pv.reload();
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "ล้างไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  /** ติ๊ก cache ทั้งสองก้อนให้ แล้วให้ปุ่มท้ายเป็นคนลบ — ไม่มีทางลัด rm -rf แยกต่างหาก */
  const tickCache = () => {
    const have = arts.filter((a) => CACHE_IDS.includes(a.id) && a.exists);
    if (!have.length) return eng.flash("scope นี้ไม่มี cache ให้ลบ — เลือก ทั้งหมด หรือ ③ รวม");
    setChecked((c) => ({ ...c, ...Object.fromEntries(have.map((a) => [a.id, true])) }));
    eng.flash(`ติ๊ก ${have.map((a) => a.id).join(" + ")} แล้ว — กด "รีเซ็ต … + ลบที่ติ๊ก" ด้านล่างเพื่อลบจริง`);
  };

  const locked = running || !!busy || !data || !!data.blocked;
  const footer = (
    <>
      <Btn sm on danger={ids.length > 0} disabled={locked} onClick={() => void apply(true)} title={running ? "มีงานกำลังรัน — เอนจินตอบ 409" : `คืนค่า ${changes.length} ค่า และลบ ${ids.length} ชิ้นที่ติ๊กไว้`}>
        รีเซ็ต {scopeShort} + ลบที่ติ๊ก {ids.length}
      </Btn>
      <Btn sm disabled={locked} onClick={() => void apply(false)} title="คืนค่าตั้งต้นในไฟล์โปรเจกต์ ไม่ลบไฟล์อะไร">
        รีเซ็ตค่าอย่างเดียว
      </Btn>
      <Btn sm disabled title="เอนจินยังไม่มีเส้นทางลบ snapshot — ไฟล์อยู่ใน .vcut/history">
        ลืม snapshot เก่า
      </Btn>
      <div style={{ flex: 1 }} />
      <Mono className="kv" style={{ fontSize: 10, color: running ? "var(--amber)" : undefined }}>
        ห้ามลบระหว่าง render วิ่ง (409)
      </Mono>
      <Btn sm off onClick={p.onClose}>
        ยกเลิก
      </Btn>
    </>
  );

  const shownKeys = moreKeys ? changes : changes.slice(0, 6);
  const shownSnaps = moreSnaps ? snaps : snaps.slice(0, 6);

  return (
    <AdvFrame sub="ทุกครั้งที่ล้าง เอนจินถ่ายสำเนาทั้งไฟล์โปรเจกต์ไว้ก่อน — กู้คืนได้เป๊ะทุกตัวอักษร" badge={<HeadBadge>SNAPSHOT BEFORE APPLY</HeadBadge>} draftN={n} onClose={p.onClose} footer={footer}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Tag>SCOPE</Tag>
        <Keys
          items={[{ v: "all", label: "ทั้งหมด" }, ...setup.phases.map((ph) => ({ v: ph.id, label: `${GLYPH[ph.no] ?? ph.no} ${PHASE_SHORT[ph.id] ?? ph.label}`, title: ph.label }))]}
          value={scope}
          onChange={(v) => {
            setScope(v);
            setChecked({});
          }}
        />
        <div style={{ flex: 1 }} />
        <HeadBadge muted>
          PREVIEW · จะรีเซ็ต <span style={{ color: "var(--amber)" }}>{data ? changes.length : "…"}</span> ค่า · ลบของ <span style={{ color: "var(--amber)" }}>{ids.length}</span> ชิ้น
        </HeadBadge>
      </div>

      {pv.error && <Empty>{pv.error}</Empty>}
      {data?.blocked && <Empty>{data.blocked}</Empty>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Well style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag>KEYS → DEFAULT</Tag>
          {!data ? (
            <Spin />
          ) : changes.length === 0 ? (
            <Kv style={{ fontSize: 11 }}>ไม่มีค่าที่ต่างจากค่าตั้งต้นใน scope นี้</Kv>
          ) : (
            <>
              {shownKeys.map((k) => (
                <Stat key={k.key} label={k.key} value={`${fmtVal(k.now)} → ${fmtVal(k.back)}`} title={`${k.label}\nตอนนี้: ${JSON.stringify(k.now)}\nกลับเป็น: ${JSON.stringify(k.back)}${k.in_file ? "" : "\n(ไม่ได้อยู่ในไฟล์นี้ — มาจาก preset ที่ต่อยอด)"}`} />
              ))}
              {changes.length > 6 && (
                <Btn sm ghost onClick={() => setMoreKeys((v) => !v)} style={{ alignSelf: "flex-start" }}>
                  {moreKeys ? "พับ ▴" : `+${changes.length - 6} …`}
                </Btn>
              )}
            </>
          )}
        </Well>

        <Well style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag>GC · SEGMENTS ที่ EDL ไม่ใช้</Tag>
          {!gc.data ? (
            gc.error ? <Kv style={{ color: "var(--danger)" }}>{gc.error}</Kv> : <Spin />
          ) : (
            <>
              <Stat label="UNUSED" value={`${gc.data.unused} pcs · ${fmtBytes(gc.data.unused_bytes)}`} />
              <Stat label="IN USE" value={`${gc.data.in_use} pcs · ${fmtBytes(gc.data.in_use_bytes)}`} />
              {gc.data.fx_unused > 0 && <Stat label="FX UNUSED" value={`${gc.data.fx_unused} pcs · ${fmtBytes(gc.data.fx_unused_bytes)}`} />}
              {gc.data.web_unused_bytes > 0 && <Stat label="WEB COPIES" value={fmtBytes(gc.data.web_unused_bytes)} title="สำเนาเสียง AAC ที่ทำไว้ให้เบราว์เซอร์เล่น" />}
              {gc.data.need_render > 0 && <Stat label="NEED RENDER" value={`${gc.data.need_render} pcs`} warn title="ชิ้นที่ EDL ต้องใช้แต่ยังไม่มีไฟล์ — ต้อง render ก่อนต่อไฟล์" />}
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                <Btn sm disabled={running || !!busy || gc.data.unused === 0} onClick={() => void runGc()} title="vcut gc — ลบเฉพาะชิ้นที่ EDL ปัจจุบันไม่ใช้">
                  ล้าง {fmtBytes(gc.data.unused_bytes)} · vcut gc
                </Btn>
                <Btn sm disabled={running || !!busy || !arts.length} onClick={tickCache} title="ติ๊ก segment cache ทั้งหมดใน ARTIFACTS — ลบจริงด้วยปุ่มท้าย">
                  ล้าง cache ทั้งหมด{cacheBytes ? ` ${fmtBytes(cacheBytes)}` : ""}
                </Btn>
              </div>
            </>
          )}
        </Well>
      </div>

      <SecHead tag="ARTIFACTS" title="ของที่จะลบ (ติ๊กเอง)" size={14} kv={`${arts.length} รายการใน scope นี้ · แดง = ทำใหม่แพง`} />
      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
        {arts.map((a) => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr 70px 40px minmax(0, 220px)", gap: 10, alignItems: "center", padding: "6px 12px", opacity: a.exists ? 1 : 0.45 }}>
            <Tog on={isOn(a)} disabled={!a.exists || running} onChange={(v) => setChecked((c) => ({ ...c, [a.id]: v }))} title={a.paths.join("\n")} />
            <span style={{ fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.paths.join("\n")}>
              {a.label}{" "}
              <Mono className="kv" style={{ fontSize: 10 }}>
                · {a.id}
              </Mono>
              {a.danger && <span style={{ color: "var(--danger)", fontSize: 10, marginLeft: 6 }}>DANGER</span>}
            </span>
            <Mono className="kv" style={{ fontSize: 10.5 }}>
              {a.exists ? fmtBytes(a.bytes) : "—"}
            </Mono>
            <Cost n={bars(guessRank(a.cost))} />
            <Tag style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={a.cost}>
              {a.cost}
            </Tag>
          </div>
        ))}
        {data && arts.length === 0 && <Kv style={{ padding: 8 }}>ไม่มีไฟล์ผลลัพธ์ใน scope นี้</Kv>}
      </Well>

      <SecHead tag="HISTORY" title={`SNAPSHOTS · ${snaps.length}`} size={14} kv=".vcut/history — ถ่ายก่อน reset/restore ทุกครั้ง" />
      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
        {shownSnaps.map((s) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "130px 70px 1fr auto auto", gap: 10, alignItems: "center", padding: "6px 12px" }}>
            <Mono style={{ fontSize: 11, color: "var(--amber)" }}>{s.id}</Mono>
            <Tag>{s.scope === "all" ? "all" : (GLYPH[setup.phases.find((x) => x.id === s.scope)?.no ?? 0] ?? s.scope)}</Tag>
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${s.label} · ${Object.keys(s.values).length} ค่า · ${s.project}`}>
              {s.label}
            </span>
            <Mono className="kv" style={{ fontSize: 10.5 }}>
              {fmtWhen(s.at)}
            </Mono>
            <Btn sm disabled={running || !!busy} onClick={() => void restore(s.id, s.label)} title="เขียนไฟล์โปรเจกต์กลับเป็นชุดนี้ทั้งไฟล์">
              {busy === s.id ? "…" : "กู้คืน"}
            </Btn>
          </div>
        ))}
        {snaps.length > 6 && (
          <div style={{ padding: "6px 12px" }}>
            <Btn sm ghost onClick={() => setMoreSnaps((v) => !v)}>
              {moreSnaps ? "พับ ▴" : `+${snaps.length - 6} snapshot เก่ากว่า ▾`}
            </Btn>
          </div>
        )}
        {data && snaps.length === 0 && <Kv style={{ padding: 8 }}>ยังไม่มี snapshot</Kv>}
      </Well>
    </AdvFrame>
  );
}
