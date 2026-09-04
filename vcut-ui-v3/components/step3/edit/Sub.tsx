"use client";

// CSUB — ซับจากบทพูด (captions.json · ขั้น ④)
//   โหมด ทั้งบรรทัด/ทีละคำ/ปิดซับ · STYLE (ฟอนต์ · SIZE/OUTLINE/MARGIN/SHADOW · COLOUR · ALIGN)
//   · LINES (subline: เวลา · ข้อความแก้ได้ · แก้/ซ่อน) · OUTPUT
//   ข้อมูลซับไม่มีค่าความมั่นใจ (transcript ให้แค่ [start, end, text]) — จึงไม่มีมิเตอร์ 4 ขีดของ mockup

import { useMemo } from "react";
import { Btn, CIn, Empty, Keys, Knob, Kv, Led, PosGrid, SecHead, Sel, Stat, Tag, Well, cx, fmtBytes, type POSES } from "@/components/instrument";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, KnobGrid, TagRow } from "./common";

type Mode = "line" | "word" | "off";

/** ชุดสีสำเร็จของ mockup — สีตัวอักษร + สีขอบ (captions.json ไม่มีคีย์ "แผ่นทึบ" จึงใช้ขอบขาวแทน) */
const COLOURS: { v: string; label: string; color: string; outline: string; title: string }[] = [
  { v: "white", label: "ขาว", color: "#FFFFFF", outline: "#000000", title: "ขาวขอบดำ — อ่านง่ายสุดบนภาพทั่วไป" },
  { v: "yellow", label: "เหลือง", color: "#FFD400", outline: "#000000", title: "เหลืองขอบดำ — สไตล์ซับทีวี" },
  { v: "plate", label: "ดำบนแผ่น", color: "#000000", outline: "#FFFFFF", title: "ดำขอบขาว — captions.json ไม่มีคีย์แผ่นทึบ จึงใช้ขอบขาวหนาแทน" },
];

const ALIGN_IDS = ["tl", "c", "bl", "bc", "br"];
const ALIGN_TH: Record<number, string> = { 1: "ล่างซ้าย", 2: "กลางล่าง", 3: "ล่างขวา", 4: "กลางซ้าย", 5: "กลางจอ", 6: "กลางขวา", 7: "บนซ้าย", 8: "กลางบน", 9: "บนขวา" };

interface Row {
  id: string;
  tl: number;
  end: number;
  text: string;
  /** เอนจินคิด cue ให้แล้ว (มีในหนังจริง) · false = มีแค่ในบทพูด */
  cue: boolean;
  dropped: boolean;
}

export default function SubEditor() {
  const s = useStudio();
  const cap = s.cap;
  const data = cap.data;
  const cd = cap.draft;

  // บรรทัด = บทพูดที่อยู่ในหนัง (id สูตรเดียวกับ cue) ทับด้วยข้อความของ cue/ที่แก้ค้าง
  // cue ที่ซ่อนไว้หายจากรายการที่เอนจินส่งมา จึงต้องปั้นแถวคืนจากบทพูด ไม่งั้นกู้ไม่ได้อีก
  const rows = useMemo<Row[]>(() => {
    if (!data || !cd) return [];
    const drop = new Set(cd.drop);
    const byId = new Map(data.cues.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out: Row[] = s.speechLines.map((ln) => {
      seen.add(ln.id);
      const c = byId.get(ln.id);
      return { id: ln.id, tl: c?.a ?? ln.tl, end: c?.b ?? ln.tl + ln.dur, text: cd.edits[ln.id] ?? c?.text ?? ln.text, cue: Boolean(c), dropped: drop.has(ln.id) };
    });
    for (const c of data.cues) {
      if (seen.has(c.id)) continue;
      out.push({ id: c.id, tl: c.a, end: c.b, text: cd.edits[c.id] ?? c.text, cue: true, dropped: drop.has(c.id) });
    }
    return out.sort((a, b) => a.tl - b.tl);
  }, [data, cd, s.speechLines]);

  const selIdx = rows.findIndex((r) => s.playhead >= r.tl && s.playhead < r.end);
  const sel = selIdx >= 0 ? rows[selIdx] : null;
  const shown = rows.filter((r) => !r.dropped).length;
  const dropped = rows.length - shown;

  if (!data || !cd) {
    return (
      <EditShell id="sub" badge="EDIT SUB" tag="SEC 05c · AUTO SUB" title="ซับจากบทพูด" buildStep="build_text">
        <Empty>{cap.data === null ? "โหลด captions.json ไม่ได้ — เอนจินตอบไม่ได้หรือยังไม่ได้ถอดเสียง" : "กำลังโหลด…"}</Empty>
      </EditShell>
    );
  }

  const st = cd.style;
  const num = (k: string, d: number) => (Number.isFinite(Number(st[k])) ? Number(st[k]) : d);
  const setSt = (p: Record<string, unknown>) => cap.patch({ style: { ...st, ...p } });
  const mode: Mode = cd.enabled ? "line" : "off";
  const align = num("align", 2);
  const fonts = data.fonts.thai.slice(0, 4);
  const font = String(st.font ?? "");
  const fontOpts = [...data.fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })), ...data.fonts.other.map((f) => ({ v: f, label: f }))];
  if (font && !fontOpts.some((o) => o.v === font)) fontOpts.unshift({ v: font, label: `${font} (ไม่มีในเครื่องนี้)` });
  const colourSel = COLOURS.find((c) => c.color === String(st.color).toUpperCase() && c.outline === String(st.outline).toUpperCase())?.v ?? null;
  const posSel = ALIGN_IDS.find((id) => ({ tl: 7, c: 5, bl: 1, bc: 2, br: 3 })[id] === align) ?? null;

  const toggleDrop = (id: string) => cap.patch({ drop: cd.drop.includes(id) ? cd.drop.filter((x) => x !== id) : [...cd.drop, id] });
  const setText = (id: string, text: string) => cap.patch({ edits: { ...cd.edits, [id]: text } });

  const topleft = sel
    ? `SUB · LINE ${selIdx + 1} · ${durMs(sel.tl)}–${durMs(sel.end)} · align ${align} · size ${num("size", 54)}`
    : `SUB · ${shown} LINES · align ${align} · size ${num("size", 54)}`;

  return (
    <EditShell
      id="sub"
      badge={`EDIT SUB · ${shown} LINES`}
      tag="SEC 05c · AUTO SUB"
      title="ซับจากบทพูด"
      buildStep="build_text"
      revert={cap.revert}
      leftNote="ซับใช้ segment เดิมของขั้น ③ ทั้งหมด — เปลี่ยนสไตล์แล้วเข้ารหัสภาพใหม่หนึ่งรอบ (④) ไม่แตะ render cache"
      topleft={topleft}
    >
      <Keys<Mode>
        grow
        sm={false}
        items={[
          { v: "line", label: "ทั้งบรรทัด", title: "เผาซับทีละบรรทัดตามบทพูด (auto.enabled)" },
          { v: "word", label: "ทีละคำ", disabled: true, title: "ยังไม่มีคีย์ในเอนจิน — captions.json มีแค่เปิด/ปิดทั้งบรรทัด (ทีละคำมีเฉพาะข้อความขั้น ⑤: anim fade_words/pop_words)" },
          { v: "off", label: "ปิดซับ", title: "ไม่เผาซับในไฟล์ ④" },
        ]}
        value={mode}
        onChange={(v) => cap.patch({ enabled: v !== "off" })}
      />

      <SecHead tag="STYLE · text.sub" />
      <TagRow>
        <Keys items={fonts.map((f) => ({ v: f, label: f }))} value={font} onChange={(v) => setSt({ font: v })} />
        <div style={{ flex: 1, minWidth: 120 }}>
          <Sel value={font} onChange={(v) => setSt({ font: v })} options={fontOpts} />
        </div>
      </TagRow>
      <KnobGrid>
        <Knob label="SIZE" value={num("size", 54)} min={10} max={200} step={1} def={data.defaults.size} onChange={(v) => setSt({ size: v })} />
        <Knob label="OUTLINE" value={num("border", 3)} min={0} max={20} step={0.5} def={data.defaults.border} onChange={(v) => setSt({ border: v })} />
        <Knob label="MARGIN" value={num("margin_v", 60)} min={0} max={600} step={4} def={data.defaults.margin_v} onChange={(v) => setSt({ margin_v: v })} title="ระยะจากขอบจอ (margin_v · พิกเซลของหนัง)" />
        <Knob label="SHADOW" value={num("shadow", 0)} min={0} max={20} step={0.5} def={data.defaults.shadow} onChange={(v) => setSt({ shadow: v })} />
      </KnobGrid>
      <TagRow>
        <Tag>COLOUR</Tag>
        <Keys items={COLOURS.map((c) => ({ v: c.v, label: c.label, title: c.title }))} value={colourSel} onChange={(v) => {
          const c = COLOURS.find((x) => x.v === v);
          if (c) setSt({ color: c.color, outline: c.outline, ...(v === "plate" ? { border: Math.max(num("border", 3), 4) } : {}) });
        }} />
        <div style={{ flex: 1 }} />
        <CIn value={String(st.color ?? "#FFFFFF")} onChange={(v) => setSt({ color: v })} />
        <CIn value={String(st.outline ?? "#000000")} onChange={(v) => setSt({ outline: v })} />
      </TagRow>
      <TagRow>
        <Tag>ALIGN</Tag>
        <div style={{ width: 170 }}>
          <PosGrid ids={ALIGN_IDS} value={posSel} onChange={(p: (typeof POSES)[number]) => setSt({ align: p.align, pos_x: null, pos_y: null })} />
        </div>
        <Kv style={{ fontSize: 10.5 }}>
          {ALIGN_TH[align] ?? "—"} (align {align}) · ตำแหน่งคิดจาก align + margin เท่านั้น (pos_x/pos_y ปล่อยว่าง)
        </Kv>
      </TagRow>
      <TagRow>
        <Tag>WEIGHT</Tag>
        <Btn sm on={Boolean(st.bold)} onClick={() => setSt({ bold: !st.bold })}>หนา</Btn>
        <Btn sm on={Boolean(st.italic)} onClick={() => setSt({ italic: !st.italic })}>เอียง</Btn>
      </TagRow>

      <SecHead
        tag={`LINES · ${shown}${dropped ? ` · ซ่อน ${dropped}` : ""}`}
        right={
          <Btn sm onClick={() => cap.patch({ drop: [] })} disabled={!dropped} title={dropped ? `กู้บรรทัดที่ซ่อนไว้ ${dropped} บรรทัดกลับมาทั้งหมด` : "ไม่มีบรรทัดที่ซ่อนไว้"}>
            จากบทพูด ▸ เพิ่ม
          </Btn>
        }
      />
      {rows.length === 0 ? (
        <Empty>ยังไม่มีบทพูดในหนัง — ต้องถอดเสียง (listen) และตัดชิ้นก่อน บรรทัดจะมาโผล่ที่นี่</Empty>
      ) : (
        <Well className="rows" style={{ flex: 1, minHeight: 120, display: "flex", flexDirection: "column", padding: "2px 0", overflowY: "auto" }}>
          {rows.map((r, i) => {
            const on = i === selIdx;
            return (
              <div
                key={r.id}
                className={cx(on && "sel-ring")}
                style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 8, alignItems: "center", padding: "5px 10px", opacity: r.dropped ? 0.45 : 1 }}
                title={`${r.id}${r.cue ? "" : " · เอนจินยังไม่คิด cue ให้ — บันทึกแล้วสร้างไฟล์ ④ จะได้บรรทัดนี้"}`}
              >
                <span className="mono" style={{ fontSize: 10.5, color: "var(--amber)", cursor: "pointer" }} onClick={() => s.seek(r.tl)}>
                  {durMs(r.tl)}
                </span>
                <input
                  type="text"
                  className="well in"
                  style={{ fontFamily: "inherit", fontSize: 12, padding: "3px 8px", textDecoration: r.dropped ? "line-through" : undefined }}
                  value={r.text}
                  disabled={r.dropped}
                  onFocus={() => s.seek(r.tl)}
                  onChange={(e) => setText(r.id, e.target.value)}
                />
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <Led on={!r.dropped && r.cue} dim={!r.dropped && !r.cue} title={r.cue ? "อยู่ในไฟล์ ④" : "รอเอนจินคิด cue"} />
                  <Btn sm on={r.dropped} onClick={() => toggleDrop(r.id)} title={r.dropped ? "แสดงบรรทัดนี้อีกครั้ง" : "ซ่อนบรรทัดนี้ (drop)"}>
                    {r.dropped ? "แสดง" : "ซ่อน"}
                  </Btn>
                </span>
              </div>
            );
          })}
        </Well>
      )}
      <Kv style={{ fontSize: 10.5, lineHeight: "14px" }}>
        ค่าความมั่นใจ (confidence) ไม่มีในข้อมูลบทพูด — จึงไม่มีมิเตอร์ต่อบรรทัด · แก้คำในช่องแล้วมีผลเฉพาะซับ (edits) ไม่แตะบทพูดต้นฉบับ
      </Kv>
      <Stat label="OUTPUT" value={`${data.out.name} · build_text ④ · re-encode${data.out.exists ? ` · ${fmtBytes(data.out.size)}` : " · ยังไม่มีไฟล์"}`} warn={s.rebuild.text} />
    </EditShell>
  );
}
