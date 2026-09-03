"use client";

// ลิ้นชัก "บทพูด" (CTRANS) — listen → transcript.json · สวิตช์ = ใส่บรรทัดนี้ลงหนัง (captions ④)
//
// รหัสบรรทัด = `<คลิป>#<ลำดับในคลิป>` ตามที่ caption.py ประกอบ (cid) — ตัวเดียว
// กับที่ใช้ใน captions.auto.drop / edits  บรรทัดที่ "เลือก" = ซับอัตโนมัติเปิด
// และ id ไม่อยู่ใน drop  บันทึกจึงส่ง enabled:true + drop = ทุกบรรทัดที่ไม่เลือก
//
// mockup มีคอลัมน์ CONF (ความมั่นใจ) — transcript.json วันนี้ไม่มีค่านั้น
// (clips[name] = [start, end, text]) จึงไม่วาดคอลัมน์นี้ และบอกไว้ในบรรทัด kv

import { useMemo, useState } from "react";
import Drawer from "@/components/frames/Drawer";
import { Btn, Keys, Kv, Led, Mono, Sel, Spin, Stat, TIn, Tag, Tog, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { api2, textFileUrl } from "@/lib/api";
import { durMs } from "@/lib/time";
import { useStep2 } from "./state";

interface Line {
  id: string;
  name: string;
  a: number;
  b: number;
  text: string;
}

type Filter = "all" | "sel";

const COLS = "70px 1fr 80px 30px";

export default function TranscriptDrawer() {
  const eng = useEngine();
  const r = useRoute();
  const s = useStep2();
  const tr = s.transcript;
  const cap = s.captions;
  const running = Boolean(eng.job?.running);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [clip, setClip] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const lines = useMemo<Line[]>(() => {
    if (!tr) return [];
    const order = tr.order.length ? tr.order : Object.keys(tr.clips);
    const out: Line[] = [];
    for (const name of order) {
      (tr.clips[name] ?? []).forEach(([a, b, text], i) => out.push({ id: `${name}#${i}`, name, a, b, text }));
    }
    return out;
  }, [tr]);
  // ค่าที่บันทึกไว้ → ชุด "เลือก" ตั้งต้น
  const savedSel = useMemo(() => {
    if (!cap?.auto.enabled) return new Set<string>();
    const drop = new Set(cap.auto.drop);
    return new Set(lines.map((l) => l.id).filter((id) => !drop.has(id)));
  }, [cap, lines]);
  const savedEdits = useMemo(() => cap?.auto.edits ?? {}, [cap]);

  const [selDraft, setSelDraft] = useState<Set<string> | null>(null);
  const [editsDraft, setEditsDraft] = useState<Record<string, string> | null>(null);
  const sel = selDraft ?? savedSel;
  const edits = editsDraft ?? savedEdits;

  const mod = useMemo(() => {
    let n = 0;
    for (const id of sel) if (!savedSel.has(id)) n++;
    for (const id of savedSel) if (!sel.has(id)) n++;
    const keys = new Set([...Object.keys(edits), ...Object.keys(savedEdits)]);
    for (const k of keys) if (edits[k] !== savedEdits[k]) n++;
    return n;
  }, [sel, savedSel, edits, savedEdits]);

  const clipsWithSpeech = useMemo(() => [...new Set(lines.map((l) => l.name))], [lines]);
  const shown = useMemo(() => {
    const want = q.trim();
    return lines.filter((l) => (clip ? l.name === clip : true) && (filter === "sel" ? sel.has(l.id) : true) && (want ? (edits[l.id] ?? l.text).includes(want) || l.name.includes(want) : true));
  }, [lines, q, clip, filter, sel, edits]);

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelDraft(next);
  };
  const commitEdit = (l: Line) => {
    const next = { ...edits };
    const t = editText.trim();
    if (!t || t === l.text) delete next[l.id];
    else next[l.id] = t;
    setEditsDraft(next);
    setEditing(null);
  };

  const save = async (useSel: Set<string>) => {
    if (!cap) return;
    setSaving(true);
    try {
      // drop เฉพาะ id ที่ยังมีอยู่ในบทพูด — id ค้างจากคลิปที่ถูกลบไม่ต้องลากต่อ
      const drop = lines.map((l) => l.id).filter((id) => !useSel.has(id));
      const res = await api2.saveCaptions({ style: cap.style, auto: { enabled: true, drop, edits, styles: cap.auto.styles } });
      s.setCaptions(res.captions);
      setSelDraft(null);
      setEditsDraft(null);
      eng.flash(`บันทึก captions.json แล้ว — ${useSel.size} บรรทัดจะเป็นซับตอนทำขั้น ④`);
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึกซับไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const relisten = async () => {
    if (!window.confirm("ถอดเสียงใหม่ทุกคลิป (listen --force)? ใช้เวลาหลายนาที และบทพูดที่แก้คำไว้จะถูกทับด้วยของใหม่")) return;
    await eng.runJob("listen", true);
  };

  // ไฟล์ส่งออกที่เอนจินมี (transcript.files: คลิป → ["srt", "txt"])
  const files = useMemo(() => {
    const out: { v: string; label: string }[] = [];
    for (const [name, exts] of Object.entries(tr?.files ?? {})) for (const ext of exts) out.push({ v: `${name}.${ext}`, label: `${name}.${ext}` });
    out.sort((a, b) => a.v.localeCompare(b.v));
    return out;
  }, [tr]);
  const [file, setFile] = useState("");
  const fileSel = file || files[0]?.v || "";

  const model = String(s.setup?.values["listen.model"] ?? "")
    .split("/")
    .pop()
    ?.replace(/^ggml-/, "")
    .replace(/\.bin$/, "");
  const lang = String(s.setup?.values["listen.language"] ?? "");
  const speechMin = tr ? tr.summary.speech / 60 : 0;
  const footage = eng.proj?.footage_minutes ?? 0;

  return (
    <Drawer
      tag="SEC 02c · TRANSCRIPT"
      title={`บทพูด · ${tr ? tr.summary.segments : "…"} ท่อน`}
      sub="listen → transcript.json · สวิตช์ = ใส่บรรทัดนี้ลงหนัง (captions) · คลิกข้อความเพื่อแก้คำ"
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
          <Btn sm on={mod > 0} disabled={!cap || saving || running} onClick={() => save(sel)} title="captions.auto: enabled + drop (บรรทัดที่ไม่เลือก) + edits">
            <Led on={mod > 0} dim={running} />
            ใส่ที่เลือกลงหนัง · {sel.size}
          </Btn>
          <Btn sm disabled={!cap || saving || running || shown.length === 0} onClick={() => save(new Set([...sel, ...shown.map((l) => l.id)]))} title="เลือกทุกบรรทัดที่กรองอยู่ตอนนี้ แล้วบันทึกเลย">
            ใส่ทุกบรรทัดที่เห็น
          </Btn>
          {files.length > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Sel value={fileSel} onChange={setFile} options={files} className="min-w-0 w-[220px] truncate" />
              <a className="btn sm" href={textFileUrl(fileSel)} target="_blank" rel="noreferrer" title="เปิดไฟล์ที่เอนจินเขียนไว้ (listen.export)">
                ส่งออก .txt / .srt ▸
              </a>
            </span>
          ) : (
            <Btn sm disabled title="ยังไม่มีไฟล์ส่งออก — เปิด listen.export แล้วถอดใหม่">
              ส่งออก .txt / .srt
            </Btn>
          )}
          <Btn sm ghost disabled={running} onClick={relisten} title="ถอดเสียงใหม่ทุกคลิป (tier listen · rank 4)">
            ถอดใหม่ · LISTEN rank 4
          </Btn>
          <div style={{ flex: 1 }} />
          {mod > 0 && (
            <Btn
              sm
              off
              onClick={() => {
                setSelDraft(null);
                setEditsDraft(null);
              }}
            >
              ทิ้ง
            </Btn>
          )}
          <Mono className="kv" style={{ fontSize: 10 }}>
            → captions.json (④)
          </Mono>
        </>
      }
    >
      {!tr || !cap ? (
        <Spin />
      ) : !tr.exists ? (
        <Well dashed style={{ padding: 18, textAlign: "center" }}>
          <Kv>ยังไม่มี transcript.json — กด &ldquo;ถอดใหม่&rdquo; หรือ &ldquo;ตัดให้เลย&rdquo; (ขั้น ② LISTEN) ก่อน</Kv>
        </Well>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <TIn value={q} onChange={setQ} placeholder="SEARCH ▸ คำในบทพูด …" mono={false} style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 11 }} />
            <Keys<Filter>
              items={[
                { v: "all", label: "ทั้งหมด", n: lines.length },
                { v: "sel", label: "เลือกแล้ว", n: sel.size },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <Sel value={clip} onChange={setClip} options={[{ v: "", label: `ทุกคลิป · ${clipsWithSpeech.length}` }, ...clipsWithSpeech.map((c) => ({ v: c, label: c.length > 22 ? `${c.slice(0, 20)}…` : c }))]} className="sm" />
          </div>
          <Kv style={{ fontSize: 10.5 }}>
            ไม่มีคอลัมน์ CONF — transcript.json เก็บแค่ [เริ่ม, จบ, ข้อความ] ยังไม่มีค่าความมั่นใจจาก whisper · บรรทัดที่แก้คำแล้วขึ้นสีอำพัน
          </Kv>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, padding: "0 12px" }}>
            <Tag>TIME</Tag>
            <Tag>TEXT</Tag>
            <Tag>CLIP</Tag>
            <Tag>USE</Tag>
          </div>
          <Well style={{ flex: 1, display: "flex", flexDirection: "column", padding: "2px 0", overflowY: "auto", minHeight: 0 }} className="rows">
            {shown.map((l) => {
              const on = sel.has(l.id);
              const edited = l.id in edits;
              const isEditing = editing === l.id;
              return (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, alignItems: "center", padding: "6px 12px" }} title={`${l.id} · ${durMs(l.a)}–${durMs(l.b)}`}>
                  <Mono style={{ fontSize: 11, color: "var(--amber)" }}>{durMs(l.a)}</Mono>
                  {isEditing ? (
                    <TIn
                      value={editText}
                      onChange={setEditText}
                      mono={false}
                      onEnter={() => commitEdit(l)}
                      style={{ padding: "3px 8px", fontSize: 12.5 }}
                      className="in"
                    />
                  ) : (
                    <span
                      className="truncate"
                      style={{ fontSize: 12.5, cursor: "text", color: edited ? "var(--amber)" : undefined }}
                      onClick={() => {
                        setEditing(l.id);
                        setEditText(edits[l.id] ?? l.text);
                      }}
                      title={edited ? `เดิม: ${l.text}\nคลิกเพื่อแก้` : "คลิกเพื่อแก้คำ"}
                    >
                      {edits[l.id] ?? l.text}
                    </span>
                  )}
                  <Mono className="kv truncate" style={{ fontSize: 10 }} title={l.name}>
                    {l.name.length > 10 ? l.name.slice(-8) : l.name}
                  </Mono>
                  <Tog on={on} onChange={() => toggle(l.id)} disabled={running} title={on ? "เอาออกจากซับ (drop)" : "ใส่ลงซับ"} />
                </div>
              );
            })}
            {shown.length === 0 && (
              <div style={{ padding: "10px 12px" }}>
                <Kv>ไม่มีบรรทัดตรงตัวกรอง</Kv>
              </div>
            )}
          </Well>
          {editing && (
            <Kv style={{ fontSize: 10.5 }}>
              กด Enter เพื่อยืนยันคำที่แก้ · <span style={{ cursor: "pointer", color: "var(--amber)" }} onClick={() => setEditing(null)}>ยกเลิก</span>
            </Kv>
          )}
          <div style={{ display: "flex", gap: 18 }}>
            <Stat className="flex-1" label="MODEL" value={`whisper ${model || "?"} · ${lang || "auto"}`} />
            <Stat className="flex-1" label="SPEECH" value={`${speechMin.toFixed(1)} / ${footage.toFixed(1)} min`} title={`${tr.summary.with_speech} คลิปมีเสียงพูด · ${tr.summary.chars} ตัวอักษร`} />
            <Stat className="flex-1" label="SELECTED → CAP" value={`${sel.size} LINES${cap.auto.enabled ? "" : " · AUTO OFF"}`} warn={!cap.auto.enabled && sel.size === 0} />
          </div>
        </>
      )}
    </Drawer>
  );
}
