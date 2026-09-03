"use client";

// CREVIEW — AI ดูหนังที่ตัดแล้ว (EditFrame · ไม่มีชั้นไหน active)
//   TASKS (rtask) · CONTEXT · SEES/EST · CTA สั่งดู · PROPOSALS แยกตาม task · REPORT · HISTORY

import { useMemo, useState } from "react";
import TopBar from "@/components/frames/TopBar";
import EditFrame from "@/components/frames/EditFrame";
import { Btn, Cta, Empty, Fld, Kv, Mono, Stat, TArea, Tag, Tog, Well, fmtWhen } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api2, type ReviewCatalog, type ReviewOp, type ReviewTask } from "@/lib/api";
import { BGM_LIST } from "@/lib/bgm";
import { SFX_LIST } from "@/lib/sfx";
import { STICKER_LIST } from "@/lib/stickers";
import Player from "./Player";
import { layerRows } from "./layers";
import { AiOpRow, useReviewOps } from "./review";
import { useStudio } from "./store";

const TASK_TH: Record<string, { th: string; desc: string }> = {
  cut: { th: "รอยตัด", desc: "ตรงไหนยืดเยื้อ · ควรตัดออก/สลับที่" },
  trim: { th: "เล็ม", desc: "หัว-ท้ายช็อตที่ควรเล็ม (ตามช่วงเงียบที่วัดไว้)" },
  music: { th: "เพลง", desc: "อารมณ์ · จุดเปลี่ยนเพลง" },
  sfx: { th: "เสียงเอฟเฟกต์", desc: "วาง SFX ตรงรอยตัด" },
  sticker: { th: "สติกเกอร์", desc: "3–5 จุดที่ควรมีภาพซ้อน" },
  text: { th: "ข้อความ", desc: "ประโยคที่ควรขึ้นจอ" },
};

/** รายการตัวอย่างฝั่งหน้าเว็บ — เอนจินไม่รู้จัก public/ ต้องส่งไปทุกครั้ง AI จะได้เลือกของที่มีจริง */
function catalog(): ReviewCatalog {
  return {
    sfx: SFX_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat, dur: x.dur, loop: x.loop ? 1 : 0 })),
    sticker: STICKER_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat })),
    bgm: BGM_LIST.map((x) => ({ file: x.file, label: x.label, cat: x.cat })),
  };
}

export default function ReviewPage() {
  const eng = useEngine();
  const rt = useRoute();
  const s = useStudio();
  const rev = useReviewOps();
  const review = s.review;
  const running = Boolean(eng.job?.running);
  const rows = useMemo(() => layerRows(s), [s]);

  const [picked, setPicked] = useState<ReviewTask[] | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const tasksAll = useMemo(() => review?.tasks_all ?? [], [review]);
  const selTasks = picked ?? review?.tasks_default ?? ["cut"];
  const ctx = context ?? review?.context_default ?? "";
  const perTask = useMemo(() => review?.tasks ?? {}, [review]);

  const toggleTask = (t: ReviewTask) =>
    setPicked(() => (selTasks.includes(t) ? selTasks.filter((x) => x !== t) : [...selTasks, t]));

  // ประมาณจากรอบก่อน (วินาที/ดอลลาร์ต่อ task) — ไม่มีประวัติก็บอกแค่จำนวน task
  const est = useMemo(() => {
    const hist = Object.values(perTask).filter((t) => t.seconds);
    if (!hist.length) return `${selTasks.length} TASKS`;
    const sec = hist.reduce((a, t) => a + (t.seconds ?? 0), 0) / hist.length;
    const usd = hist.reduce((a, t) => a + (t.cost_usd ?? 0), 0) / hist.length;
    const m = Math.max(1, Math.round((sec * selTasks.length) / 60));
    return `${selTasks.length} TASKS · ~${m}m${usd ? ` · $${(usd * selTasks.length).toFixed(2)}` : ""}`;
  }, [perTask, selTasks.length]);

  const run = () => {
    if (running || !selTasks.length) return;
    eng.track("review", () => api2.runReview(ctx, review?.has === true, selTasks, catalog()));
  };

  // ข้อเสนอแยกตาม task ตามลำดับ tasks_all
  const grouped = useMemo(() => {
    const by = new Map<string, ReviewOp[]>();
    for (const op of rev.left) {
      const k = op.task ?? op.op;
      by.set(k, [...(by.get(k) ?? []), op]);
    }
    const order = tasksAll.map((t) => t.id as string);
    return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [rev.left, tasksAll]);

  const fp = String(review?.fingerprint ?? "").slice(0, 4);
  const at = Number(review?.at ?? 0);
  const needKey = review?.provider === "gemini" && !review.gemini?.ok;

  return (
    <>
      <TopBar
        left={
          <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", whiteSpace: "nowrap" }}>
            {s.variant.id} · AI REVIEW · {rev.left.length} PROPOSALS
          </Well>
        }
        right={<Btn on onClick={() => rt.openEdit(null)}>◀ กลับ 03</Btn>}
      />
      <EditFrame
        variantId={s.variant.id}
        variantLabel={s.variant.label}
        variantMeta={`${s.total.toFixed(1)} s · ${s.shots.length} SHOTS`}
        layers={rows}
        active={null}
        onPick={(id) => rt.openEdit(id)}
        leftNote="AI บทบาทที่สอง — เห็นลำดับจริงที่คนดูจะเจอ จึงตอบเรื่อง “ตรงไหนยืดเยื้อ” ได้ต่างจาก vcut ai ที่ดูฟุตเทจดิบ"
        rebuild={[
          { label: "⑤ FX REBUILD", value: s.rebuild.fx ? `~${s.rebuild.eta.fx} s` : "READY", warn: s.rebuild.fx },
          { label: "③ RENDER", value: s.rebuild.edl ? `~${s.rebuild.eta.edl} s` : "CACHE", warn: s.rebuild.edl },
        ]}
        onBack={() => rt.openEdit(null)}
        center={<Player mode="final" topleft={`REVIEW · ${review?.provider ?? "—"} · sees final order · not raw footage`} />}
        tag="SEC 06 · AI REVIEW"
        title="AI ดูหนังที่ตัดแล้ว"
      >
        <Tag>TASKS · vcut review --task</Tag>
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
          {tasksAll.length === 0 && <Kv style={{ padding: "6px 10px", fontSize: 10.5 }}>{s.review ? "เอนจินไม่ส่งรายการงานมา" : "กำลังโหลด…"}</Kv>}
          {tasksAll.map((t) => {
            const on = selTasks.includes(t.id);
            const th = TASK_TH[t.id] ?? { th: t.label, desc: "" };
            const note = perTask[t.id]?.note;
            return (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "30px 60px 1fr", gap: 8, alignItems: "center", padding: "6px 10px" }}>
                <Tog on={on} onChange={() => toggleTask(t.id)} />
                <Mono style={{ fontSize: 11, color: on ? "var(--amber)" : undefined }}>{t.id}</Mono>
                <span style={{ fontSize: 11.5 }}>
                  {th.th}{" "}
                  <Kv style={{ fontSize: 10 }}>
                    {th.desc}
                    {t.fx ? " · ลง fx.json" : " · แก้ edl.json"}
                    {note ? ` · รอบก่อน: ${note}` : ""}
                  </Kv>
                </span>
              </div>
            );
          })}
        </Well>

        <Fld label={<Tag>CONTEXT · บอกว่าอยากให้ดูอะไรเป็นพิเศษ</Tag>} chg={context !== null && context !== (review?.context_default ?? "")}>
          <TArea value={ctx} onChange={setContext} rows={2} placeholder="เช่น เน้นความกระชับช่วง 10–30 วิ · อย่าเสนอตัดช่วงถึงน้ำตก" />
        </Fld>
        <div style={{ display: "flex", gap: 18 }}>
          <Stat className="flex-1" label="SEES" value={`${s.shots.length} SHOTS · ${s.total.toFixed(1)} s`} />
          <Stat className="flex-1" label="EST" value={est} />
        </div>
        {needKey && <Kv style={{ fontSize: 10.5, color: "var(--amber)" }}>ยังไม่มี Gemini API key — {review?.gemini?.hint ?? "ตั้งที่แท็บ AI ของขั้น ②"}</Kv>}
        <Cta sm onClick={run} disabled={running || !selTasks.length || Boolean(needKey)} busy={running && eng.lastStep === "review"} title={review?.provider === "gemini" ? "ใช้ Gemini API" : "ใช้ Claude CLI ในเครื่อง — หลายนาที"}>
          สั่งดู · review {s.variant.id}
        </Cta>
        {s.dirty && <Kv style={{ fontSize: 10.5, color: "var(--amber)" }}>ไทม์ไลน์แก้ค้างอยู่ — AI ดูจาก edl.json ที่บันทึกแล้ว กด SAVE EDL ก่อนถ้าอยากให้ดูของใหม่</Kv>}

        <div className="h">
          <Tag>PROPOSALS · {rev.left.length}{fp ? ` (fingerprint ${fp})` : ""}</Tag>
          <div style={{ flex: 1 }} />
          {rev.left.length > 0 && (
            <Btn sm onClick={() => rev.take(rev.left)} disabled={rev.busy || rev.stale} title={rev.stale ? "ไทม์ไลน์เปลี่ยนหลัง AI ดู — สั่งดูใหม่ก่อน" : "รับที่เหลือทั้งหมด"}>
              รับทั้งหมด
            </Btn>
          )}
        </div>
        {review?.summary && <Kv style={{ fontSize: 11, lineHeight: "16px" }}>{review.summary}</Kv>}
        {rev.stale && <Kv style={{ fontSize: 10.5, color: "var(--amber)" }}>ไทม์ไลน์ถูกแก้หลังจาก AI ดู — ตำแหน่งอาจเลื่อน ควรสั่งดูใหม่ก่อนรับ</Kv>}
        {!review?.has ? (
          <Empty>ยังไม่เคยให้ AI ดูหนังเรื่องนี้</Empty>
        ) : grouped.length === 0 ? (
          <Empty>{rev.ops.length ? "รับ/ข้ามครบทุกข้อแล้ว" : "AI ไม่มีข้อเสนอ — หนังผ่านตามที่เป็นอยู่"}</Empty>
        ) : (
          <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
            {grouped.map(([task, ops]) => (
              <div key={task} className="rows" style={{ display: "flex", flexDirection: "column" }}>
                <Tag style={{ padding: "4px 10px" }}>
                  {task} · {ops.length}
                </Tag>
                {ops.map((op) => (
                  <AiOpRow key={op.id} op={op} onTake={() => rev.take([op])} onSkip={() => rev.skip(op)} busy={rev.busy} done={rev.applied.has(op.id ?? -1)} />
                ))}
              </div>
            ))}
          </Well>
        )}

        <div style={{ flex: 1 }} />
        <Tag>REPORT · HISTORY {Object.keys(perTask).length}</Tag>
        <Well style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.keys(perTask).length === 0 ? (
            <Kv style={{ fontSize: 10.5 }}>ยังไม่มีรอบไหนจบ</Kv>
          ) : (
            Object.entries(perTask).map(([k, t]) => {
              const w = Number((t as { warnings?: number }).warnings ?? 0);
              return (
                <Stat
                  key={k}
                  label={`${at ? fmtWhen(at) : "—"} · ${k}`}
                  value={`${t.ops?.length ?? 0} ops · ${Math.round(t.seconds ?? 0)} s${t.cost_usd ? ` · $${t.cost_usd.toFixed(2)}` : ""} · ${w} warn · ${t.provider ?? ""}`}
                  warn={w > 0}
                />
              );
            })
          )}
        </Well>
        <Kv style={{ fontSize: 10.5 }}>รับข้อเสนอ = แก้ edl.json/fx.json ให้ (ยังไม่บันทึกจนกด SAVE) · ถ้า EDL กับโจทย์ไม่เปลี่ยน ไม่ถามซ้ำ (cache ตาม fingerprint)</Kv>
      </EditFrame>
    </>
  );
}
