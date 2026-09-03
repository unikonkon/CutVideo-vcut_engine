"use client";

// แท็บ AI (CAI) — ผู้ให้บริการ · บริบทที่ส่ง · โจทย์ · งานที่ให้ทำ · กฎที่เอนจินใช้ความเห็น
//
// AI เป็นชั้นที่ปรึกษา เขียนได้แค่ .vcut/ai.json — ทุกอย่างในแท็บนี้จึงเป็นค่า ai.* ในไฟล์
// โปรเจกต์ (ผ่าน draft เดียวกับแท็บตั้งค่า) ยกเว้น Gemini key ที่เอนจินเก็บลงไฟล์ลับแยก

import { useState } from "react";
import { api2, api3 } from "@/lib/api";
import { useEngine, useLoader } from "@/hooks/engine";
import { Btn, Fld, Keys, Kv, Led, Mono, SecHead, Stat, TArea, TIn, Tog, Well, fmtClock, fmtWhen } from "@/components/instrument";
import { AdvFrame, FieldInput, HeadBadge, type TabProps } from "./shared";

/** คำอธิบาย + เวลาโดยประมาณต่องาน (ตาม mockup) — ชื่องานมาจาก field ai.tasks */
const TASK_NOTE: Record<string, { desc: string; sec: number }> = {
  story_arc: { desc: "แบ่งบทเล่าเรื่อง → chapters (ใช้กับ ai.apply.order)", sec: 40 },
  describe: { desc: "อ่านความหมายรายคลิป → tags · ใช้เลือก BROLL", sec: 60 },
  shot_scoring: { desc: "ให้คะแนนช็อต → ai_score (ใช้กับ mode ai / score_weight)", sec: 50 },
  trim_suggest: { desc: "แนะนำช่วงที่ควรเก็บ → ai.apply.trim", sec: 60 },
};
const PROVIDER_SHORT: Record<string, string> = { claude_cli: "claude -p", gemini: "gemini" };

export default function Ai(p: TabProps) {
  const { setup, draft, val, put, field } = p;
  const eng = useEngine();
  const running = !!eng.job?.running;
  const n = Object.keys(draft).length;
  const info = useLoader(() => api3.info(), eng.reloadKey);
  const tr = useLoader(() => api2.transcript(), eng.reloadKey);
  const [force, setForce] = useState<"reuse" | "force">("reuse");
  const [keyIn, setKeyIn] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [report, setReport] = useState(false);

  const provF = field("ai.provider");
  const provider = String(val("ai.provider") ?? "");
  const gemini = provider === "gemini";
  const modelKey = gemini ? "ai.gemini_model" : "ai.model";
  const modelF = field(modelKey);
  const tasksF = field("ai.tasks");
  const tasksV = val("ai.tasks");
  const tasks = (Array.isArray(tasksV) ? tasksV : []).map(String);
  const aiStep = setup.steps.find((s) => s.id === "ai");
  const applyFields = setup.fields.filter((f) => f.key.startsWith("ai.apply."));
  const nAi = setup.fields.filter((f) => f.key.startsWith("ai.")).length;
  const proj = eng.proj;
  const cols = Number(val("thumbs.sheet_cols") ?? 0);
  const rows = Number(val("thumbs.sheet_rows") ?? 0);
  const claude = info.data?.tools.claude;
  const gkey = info.data?.tools.gemini;
  const aiTier = setup.tiers.ai;
  const estSec = tasks.reduce((a, t) => a + (TASK_NOTE[t]?.sec ?? 50), 0);

  const toggleTask = (id: string, on: boolean) => put("ai.tasks", on ? [...tasks.filter((t) => t !== id), id] : tasks.filter((t) => t !== id));

  const saveKey = async () => {
    if (keyIn === null) return;
    setKeyBusy(true);
    try {
      const res = await api2.saveAiKey(keyIn.trim());
      eng.flash(res.hint || "บันทึก Gemini key แล้ว");
      setKeyIn(null);
      void info.reload();
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึก key ไม่ได้");
    } finally {
      setKeyBusy(false);
    }
  };

  /** บันทึก draft ก่อนสั่งงานเสมอ — ไม่งั้นเอนจินอ่านค่าเก่าจากไฟล์ ไม่ใช่ที่เห็นบนจอ */
  const run = async (step: string, f = false) => {
    if (n && !(await p.save())) return;
    await eng.runJob(step, f);
  };

  const footer = (
    <>
      {force === "force" ? (
        <Btn sm on disabled={running || p.saving} onClick={() => void run("ai", true)} title="prepare_all ไม่รับ --force — ถามใหม่ต้องสั่งขั้น ai เดี่ยว ๆ แล้วค่อยกด ตัดทีละคลิป">
          ถาม AI ใหม่ · ai -f
        </Btn>
      ) : (
        <Btn sm on disabled={running || p.saving} onClick={() => void run("prepare_all")} title="listen → ai → silence → prepare (ข้ามขั้นที่มีของแล้วและค่าไม่เปลี่ยน)">
          ดึงความหมาย · prepare_all
        </Btn>
      )}
      <Btn sm disabled={running || p.saving} onClick={() => void run("prepare_free")} title="listen → silence → prepare — ไม่เรียก AI ไม่เสียโควตา">
        ไม่ใช้ AI · prepare_free
      </Btn>
      <Btn sm on={report} onClick={() => setReport((v) => !v)}>
        ดูรายงาน ai.json
      </Btn>
      <div style={{ flex: 1 }} />
      <Btn sm off disabled={!n} onClick={p.discard}>
        ทิ้ง
      </Btn>
      <Btn sm on disabled={!n || p.saving} onClick={() => void p.save()}>
        บันทึก · ai.* {n > 0 ? n : ""}
      </Btn>
    </>
  );

  return (
    <AdvFrame sub="AI = ชั้นที่ปรึกษา เขียนได้แค่ .vcut/ai.json — เอนจินยังคาดเดาได้ 100%" badge={<HeadBadge>AI · {nAi} VALUES</HeadBadge>} draftN={n} onClose={p.onClose} footer={footer}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <SecHead tag="PROVIDER" size={14} right={field("ai.enabled") && <Tog on={Boolean(val("ai.enabled"))} onChange={(v) => put("ai.enabled", v)} label="ai.enabled" title={field("ai.enabled")?.label} />} />
          {provF ? (
            <Keys sm={false} items={provF.options?.map((o) => ({ v: o, label: PROVIDER_SHORT[o] ?? o, title: provF.labels?.[o] })) ?? []} value={provider} onChange={(v) => put("ai.provider", v)} />
          ) : (
            <Kv>ไม่มี field ai.provider</Kv>
          )}
          <Stat label="claude CLI" value={info.data ? (claude?.ok ? `OK · ${claude.version || "?"} · ${String(val("ai.model") ?? "")}` : "ไม่พบ claude") : "…"} warn={!!info.data && !claude?.ok} />
          {modelF && (
            <Fld label={modelKey} chg={modelKey in draft}>
              <FieldInput f={modelF} value={val(modelKey)} onChange={(v) => put(modelKey, v)} />
            </Fld>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {keyIn === null ? (
              <>
                <Well className="mono" style={{ flex: 1, padding: "4px 8px", fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={gkey?.hint}>
                  GEMINI KEY {info.data ? (gkey?.ok ? `•••• SAVED · ${gkey.from || "secrets"}` : gkey?.hint || "ยังไม่มี") : "…"}
                </Well>
                <Btn sm onClick={() => setKeyIn("")}>เปลี่ยน</Btn>
              </>
            ) : (
              <>
                <div className="fld" style={{ flex: 1 }}>
                  <TIn value={keyIn} onChange={setKeyIn} placeholder="AIza…" onEnter={() => void saveKey()} />
                </div>
                <Btn sm on disabled={keyBusy || !keyIn.trim()} onClick={() => void saveKey()}>
                  บันทึก
                </Btn>
                <Btn sm off onClick={() => setKeyIn(null)}>
                  ยกเลิก
                </Btn>
              </>
            )}
          </div>
        </Well>

        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <SecHead tag="CONTEXT · CONTACT SHEET" size={14} />
          <Stat label="SHEETS" value={proj ? `${proj.sheets.length} × ${cols}×${rows} (${proj.clips_total} THUMBS)` : "…"} />
          <Stat label="SPEECH BLOCK" value={tr.data ? (tr.data.exists ? `${tr.data.summary.segments} SEG · ${tr.data.summary.with_speech} CLIPS · TIMED` : "ยังไม่ได้ถอดเสียง") : "…"} />
          <Stat label="ai.json ที่มี" value={aiStep?.exists ? `${fmtWhen(aiStep.mtime)}${aiStep.summary ? ` · ${aiStep.summary}` : ""}` : "ยังไม่มี"} warn={!!aiStep?.changed.length} title={aiStep?.changed.length ? `ค่าเปลี่ยนหลังทำ: ${aiStep.changed.join(", ")}` : aiStep?.skip} />
          <Keys<"reuse" | "force">
            items={[
              { v: "reuse", label: "ใช้ของเดิม (--ai)", title: "ขั้นที่มีของแล้วและค่าไม่เปลี่ยนจะถูกข้าม" },
              { v: "force", label: "ถามใหม่ (-f)", title: "สั่งขั้น ai ด้วย --force — เสียโควตาใหม่" },
            ]}
            value={force}
            onChange={setForce}
          />
        </Well>
      </div>

      <SecHead tag="GOAL" title="โจทย์ภาษาไทยที่จะบอก AI" size={14} />
      <Fld label="ai.goal" chg={"ai.goal" in draft}>
        <TArea value={String(val("ai.goal") ?? "")} onChange={(v) => put("ai.goal", v)} rows={3} placeholder={field("ai.goal")?.placeholder ?? "ตัดเหลือ 10 นาที เล่าตามลำดับการเดินทาง"} />
      </Fld>

      <SecHead tag="TASKS" title="vcut ai --task" size={14} kv={tasksF?.help} />
      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0" }}>
        {(tasksF?.options ?? []).map((t) => {
          const on = tasks.includes(t);
          return (
            <div key={t} style={{ display: "grid", gridTemplateColumns: "30px 150px 1fr auto", gap: 10, alignItems: "center", padding: "7px 12px" }}>
              <Tog on={on} onChange={(v) => toggleTask(t, v)} />
              <span style={{ fontSize: 12.5, color: on ? undefined : "var(--muted)" }}>{t}</span>
              <Kv>{TASK_NOTE[t]?.desc ?? tasksF?.labels?.[t] ?? ""}</Kv>
              <Mono className="kv" style={{ fontSize: 10.5 }}>
                ~{TASK_NOTE[t]?.sec ?? 50} s
              </Mono>
            </div>
          );
        })}
        {!tasksF && <Kv style={{ padding: 8 }}>ไม่มี field ai.tasks</Kv>}
      </Well>

      <SecHead tag="APPLY" title="[ai.apply] กฎที่เอนจินใช้ความเห็น" size={14} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {applyFields.map((f) => (
          <Fld key={f.key} label={`${f.key} · ${f.label}`} chg={f.key in draft} title={f.help}>
            <FieldInput f={f} value={val(f.key)} onChange={(v) => put(f.key, v)} />
          </Fld>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18 }}>
        <Stat className="flex-1" label="EST" value={`${tasks.length} TASKS · ~${fmtClock(estSec)}`} />
        <Stat className="flex-1" label="TIER" value={aiTier ? `AI · rank ${aiTier.rank} (${aiTier.label})` : "ai"} />
      </div>

      {report && (
        <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <SecHead tag="REPORT" title="ai.json ตามที่ /api/state สรุป" size={14} kv="ไม่มีเส้นทางอ่านไฟล์ดิบ — โชว์เท่าที่เอนจินสรุปให้" />
          <Stat label="ENABLED" value={proj?.ai.enabled ? "ON" : "OFF"} />
          <Stat label="GOAL" value={proj?.ai.goal || "—"} />
          <Stat label="CHAPTERS" value={String(proj?.ai.chapters ?? 0)} />
          <Stat label="STEP ai" value={aiStep ? (aiStep.exists ? `${fmtWhen(aiStep.mtime)} · ${aiStep.summary || "—"}` : aiStep.skip || "ยังไม่ได้ทำ") : "—"} />
          {(proj?.chapters ?? []).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
              <Led on />
              <Mono style={{ fontSize: 11, color: "var(--amber)" }}>{c.id}</Mono>
              <span style={{ flex: 1 }}>{c.title || "—"}</span>
              <Mono className="kv" style={{ fontSize: 10.5 }}>
                {c.segments} ชิ้น · {fmtClock(c.duration)}
              </Mono>
            </div>
          ))}
        </Well>
      )}
    </AdvFrame>
  );
}
