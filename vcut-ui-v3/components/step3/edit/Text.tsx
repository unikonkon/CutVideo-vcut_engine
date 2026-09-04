"use client";

// CTEXT — ข้อความ + รูปทรง (fx.json texts · presets · shapes · ขั้น ⑤)
//   รายการข้อความ (LED · "HOOK · “…”" · a–b · anim · ✕) + ปุ่มเพิ่ม 3 แบบ
//   ชิ้นที่ focus: ANIM · IN/OUT/DUR/SIZE · STYLE SET · plate · เนื้อความ · สี · ตำแหน่ง · COUNT
//   SHAPES: คีย์ชนิด (วางที่หัวเล่น) · รายการ · SIZE/THICK/ANGLE/GLOW · สี · behind · ตำแหน่ง
//   (port จาก vcut-ui TextPanel + StickerPanel ส่วนรูปทรง — ค่าทุกช่องชื่อเดียวกับเอนจิน)

import { useMemo, useState } from "react";
import { Btn, CIn, Empty, Fld, Keys, Knob, Kv, Led, NIn, POSES, PosGrid, SecHead, Sel, TArea, Tag, Tog, Well, cx } from "@/components/instrument";
import type { FxPreset, FxShape, FxTextItem } from "@/lib/api";
import { lookOf } from "@/lib/presets";
import { resolveLook } from "@/lib/textfx";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, KnobGrid, TR_ID, TagRow, useAdders } from "./common";

const POS_IDS = ["tl", "tr", "c", "bl", "bc", "br"];

/** ชนิดของชิ้นให้คนอ่าน — การ์ดหลายบรรทัด · จากบทพูด · ที่เหลือคือ HOOK */
function kindOf(t: FxTextItem): string {
  if ((t.lines?.length ?? 0) > 0) return "การ์ด";
  if (t.id.startsWith("tr:")) return "บทพูด";
  if (t.count) return "นับเลข";
  return "HOOK";
}

/** ท่าใน POSES ที่ตรงกับ (x, y, align) ของชิ้น — ไม่ตรงเป๊ะ = จัดเอง (null) */
function poseOf(x: number, y: number, align: number): string | null {
  return POSES.find((p) => POS_IDS.includes(p.id) && p.align === align && Math.abs(p.x - x) < 0.03 && Math.abs(p.y - y) < 0.03)?.id ?? null;
}

export default function TextEditor() {
  const s = useStudio();
  const A = useAdders();
  const d = s.fx.data;
  const dr = s.fx.draft;
  const [pickSpeech, setPickSpeech] = useState(false);

  const focusText = s.focus?.kind === "text" ? s.focus.idx : null;
  const focusShape = s.focus?.kind === "shape" ? s.focus.idx : null;
  const texts = useMemo(() => dr?.texts ?? [], [dr]);
  const shapes = useMemo(() => dr?.shapes ?? [], [dr]);
  const presets = useMemo(() => dr?.presets ?? [], [dr]);
  const pkeys = useMemo(() => (d?.defaults.preset_keys as string[] | undefined) ?? [], [d]);
  const blocks = s.layers.text;
  const shapeBlocks = s.layers.shape;

  if (!d || !dr) {
    return (
      <EditShell id="text" badge="EDIT TEXT" tag="SEC 05a · TEXT + SHAPE" title="ข้อความ · รูปทรง">
        <Empty>{s.fx.data === null ? "โหลด fx.json ไม่ได้" : "กำลังโหลด…"}</Empty>
      </EditShell>
    );
  }

  const t = focusText != null ? texts[focusText] : undefined;
  const sh = focusShape != null ? shapes[focusShape] : undefined;
  const anims = Object.entries(d.defaults.anim as Record<string, string>);
  const counts = Object.entries(d.defaults.count ?? {});
  const shapeKinds = Object.entries(d.defaults.shape_kind ?? {});
  const hasGlow = d.defaults.shape?.glow !== undefined;
  const blankPreset = d.defaults.preset as FxPreset | undefined;

  const patch = (p: Partial<FxTextItem>) => focusText != null && s.patchTextAt(focusText, p);
  const patchShape = (p: Partial<FxShape>) => focusShape != null && s.patchShapeAt(focusShape, p);

  // ชุดสไตล์ชนะค่าของชิ้น (เหมือน fxtext.cues) — ปุ่ม/ลูกบิดหน้าตาต้องแก้ที่ชุด ไม่ใช่ที่ชิ้น
  const bound = t ? presets.find((p) => p.name === t.preset) : undefined;
  const view = t ? resolveLook(t, presets, pkeys) : undefined;
  const patchLook = (p: Partial<FxPreset>) => {
    if (!t) return;
    if (bound) s.fx.patch({ presets: presets.map((x) => (x.name === bound.name ? { ...x, ...p } : x)) });
    else patch(p as Partial<FxTextItem>);
  };
  const setPreset = (name: string) => {
    if (!t || focusText == null) return;
    if (name === "__new") return A.makePresetFrom(focusText);
    // ปลดชุดแล้วเก็บหน้าตาที่เห็นอยู่ไว้ — เลิกตามชุดไม่ใช่คำสั่งเปลี่ยนหน้าตา
    if (!name && bound) return patch({ ...lookOf(view ?? t, pkeys), preset: "" });
    patch({ preset: name });
  };

  const blk = focusText != null ? blocks.find((b) => b.idx === focusText) : undefined;
  const sblk = focusShape != null ? shapeBlocks.find((b) => b.idx === focusShape) : undefined;
  const topleft = t && blk
    ? `TEXT · ${kindOf(t)} · ${t.anim} · ${durMs(blk.tl)}–${durMs(blk.tl + t.dur)} s · ลากเพื่อย้าย`
    : sh && sblk
      ? `SHAPE · ${d.defaults.shape_kind?.[sh.kind] ?? sh.kind} · ${durMs(sblk.tl)}–${durMs(sblk.tl + sh.dur)} s · x ${sh.x.toFixed(2)} y ${sh.y.toFixed(2)} · ลากเพื่อย้าย`
      : `TEXT · ${texts.length} TEXTS · ${shapes.length} SHAPES · กดชิ้นในรายการเพื่อแก้`;

  const inSpeech = new Set(texts.filter((x) => x.id.startsWith("tr:")).map((x) => x.id.slice(3)));

  return (
    <EditShell
      id="text"
      badge={`EDIT TEXT · ${texts.length} TEXTS · ${shapes.length} SHAPE`}
      tag="SEC 05a · TEXT + SHAPE"
      title="ข้อความ · รูปทรง"
      revert={s.fx.revert}
      leftNote="ข้อความ/รูปทรงเขียนเป็น ASS ในขั้น ⑤ (fxtext) — เปลี่ยนแล้วทำขั้น ⑤ ใหม่ · ซับ (④) ไม่ถูกแตะ"
      topleft={topleft}
    >
      {/* ── รายการข้อความ ── */}
      <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 200, overflowY: "auto", flexShrink: 0 }}>
        {texts.length === 0 && <Kv style={{ padding: "6px 10px", fontSize: 11 }}>ยังไม่มีข้อความ — กดปุ่มข้างล่างเพื่อวางที่หัวเล่น</Kv>}
        {texts.map((x, i) => {
          const b = blocks.find((k) => k.idx === i);
          const on = i === focusText;
          const first = (x.text || "(ว่าง)").split("\n")[0];
          return (
            <div
              key={`${x.id}-${i}`}
              className={cx("cursor-pointer", on && "sel-ring")}
              style={{ display: "grid", gridTemplateColumns: "8px 1fr auto auto", gap: 10, alignItems: "center", padding: "6px 10px", opacity: b?.orphan ? 0.5 : 1 }}
              onClick={() => {
                s.setFocus({ kind: "text", idx: i });
                if (b && !b.orphan) s.seek(b.tl);
              }}
              title={b?.orphan ? "ช่วงที่เกาะอยู่ไม่มีในไทม์ไลน์แล้ว — ชิ้นนี้จะไม่ขึ้นในหนัง" : `เกาะคลิป ${x.name} @${x.at.toFixed(2)} s`}
            >
              <Led on={!b?.orphan} red={b?.orphan} />
              <span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {kindOf(x)} · “{first}”
              </span>
              <span className="mono kv" style={{ fontSize: 10 }}>
                {b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)} s` : "กำพร้า"} · {x.anim}
              </span>
              <Btn sm onClick={(e) => { e.stopPropagation(); s.removeLayerItem("text", i); }} title="เอาข้อความนี้ออก">✕</Btn>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 4, padding: "6px 10px", flexWrap: "wrap" }}>
          <Btn sm onClick={() => A.addTextAt(s.playhead)} title="ข้อความตั้งต้นของเอนจิน วางตรงหัวเล่น (ยาว 3 วิ)">+ ข้อความใหม่ที่หัวเล่น</Btn>
          <Btn sm on={pickSpeech} onClick={() => setPickSpeech((v) => !v)} disabled={!s.speechLines.length} title="เลือกบรรทัดจากบทพูดขึ้นจอตรงเวลาที่พูดจริง">+ จากบทพูด ▸</Btn>
          <Btn sm onClick={() => A.addTextAt(s.playhead, { text: "{n}", count: "int", count_from: 0, count_to: 100 })} disabled={!counts.length} title="ตัวเลขนับขึ้น 0→100 (แก้ช่วง/รูปแบบได้ที่ COUNT)">+ นับเลข</Btn>
        </div>
      </Well>
      {pickSpeech && (
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 160, overflowY: "auto", flexShrink: 0 }}>
          {s.speechLines.map((ln) => {
            const used = inSpeech.has(ln.id);
            return (
              <div key={ln.id} className="cursor-pointer" style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 8, padding: "4px 10px", alignItems: "center", opacity: used ? 0.4 : 1 }} onClick={() => { if (!used) A.addSpeechText(ln); setPickSpeech(false); }} title={used ? "อยู่ในหนังแล้ว" : "ขึ้นจอที่วินาทีนี้"}>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>{durMs(ln.tl)}</span>
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ln.text}</span>
              </div>
            );
          })}
        </Well>
      )}

      {/* ── ชิ้นที่เลือก ── */}
      {t && view && focusText != null && (
        <>
          <SecHead tag={`ANIM · ${kindOf(t)}`} kv={`${t.name} @${t.at.toFixed(2)} s`} />
          <Keys items={anims.map(([k, desc]) => ({ v: k, label: k, title: desc }))} value={t.anim} onChange={(v) => patch({ anim: v })} />
          <KnobGrid>
            <Knob label="IN" value={t.in} min={0} max={1.5} step={0.02} def={d.defaults.text_item.in} fmt={(v) => v.toFixed(2)} onChange={(v) => patch({ in: v })} />
            <Knob label="OUT" value={t.out} min={0} max={1.5} step={0.02} def={d.defaults.text_item.out} fmt={(v) => v.toFixed(2)} onChange={(v) => patch({ out: v })} />
            <Knob label="DUR" value={t.dur} min={0.2} max={20} step={0.1} def={3} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ dur: v })} title="ยาวกี่วินาที (mockup มี STAGGER — เอนจินไม่มีคีย์ จังหวะทีละคำคิดจาก in/dur/out)" />
            <Knob label="SIZE" value={view.size} min={8} max={300} step={2} def={d.defaults.text_item.size} onChange={(v) => patchLook({ size: v })} title={bound ? `ค่าจากชุด "${bound.name}" — หมุนแล้วเปลี่ยนทุกชิ้นที่ผูก` : "ขนาดตัวอักษร (พิกเซลของหนัง)"} />
          </KnobGrid>
          <TagRow>
            <Tag>STYLE SET</Tag>
            <Keys
              items={[
                { v: "", label: "ตั้งเอง", title: "ไม่ผูกชุด — ใช้ค่าของชิ้นนี้" },
                ...presets.map((p) => ({ v: p.name, label: p.name, title: `${p.font} ${p.size} · ใช้อยู่ ${texts.filter((x) => x.preset === p.name).length} ชิ้น` })),
                ...(blankPreset ? [{ v: "__new", label: "+ ชุดใหม่", title: "เก็บหน้าตาของชิ้นนี้เป็นชุด แล้วชิ้นอื่นเลือกใช้ได้" }] : []),
              ]}
              value={t.preset && presets.some((p) => p.name === t.preset) ? t.preset : ""}
              onChange={setPreset}
            />
            <div style={{ flex: 1 }} />
            <Tog on={t.plate} onChange={(v) => patch({ plate: v })} label="plate" title="พื้นหลังทึบใต้ตัวอักษร" />
          </TagRow>
          {t.preset && !bound && <Kv style={{ fontSize: 10.5, color: "var(--amber)" }}>ชิ้นนี้ผูกกับชุด “{t.preset}” ที่ไม่มีอยู่แล้ว — ตอนนี้ใช้ค่าของชิ้นเอง</Kv>}
          <TArea value={t.text} onChange={(v) => patch({ text: v })} rows={2} placeholder="เนื้อความ · {n} = ตำแหน่งตัวเลขที่นับ" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label={`สีตัวอักษร${bound ? " · จากชุด" : ""}`}>
              <CIn value={view.color} onChange={(v) => patchLook({ color: v })} />
            </Fld>
            <Fld label={`สีขอบ${bound ? " · จากชุด" : ""}`}>
              <CIn value={view.outline} onChange={(v) => patchLook({ outline: v })} />
            </Fld>
          </div>
          <TagRow>
            <Tag>FONT</Tag>
            <div style={{ flex: 1 }}>
              <Sel value={view.font} onChange={(v) => patchLook({ font: v })} options={[...(view.font && !d.fonts.thai.includes(view.font) && !d.fonts.other.includes(view.font) ? [{ v: view.font, label: `${view.font} (ไม่มีในเครื่องนี้)` }] : []), ...d.fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })), ...d.fonts.other.map((f) => ({ v: f, label: f }))]} />
            </div>
            <Btn sm on={view.bold} onClick={() => patchLook({ bold: !view.bold })}>หนา</Btn>
            <Btn sm on={view.italic} onClick={() => patchLook({ italic: !view.italic })}>เอียง</Btn>
          </TagRow>
          <TagRow>
            <Tag>POSITION</Tag>
            <div style={{ width: 200 }}>
              <PosGrid ids={POS_IDS} cols={6} value={poseOf(t.x, t.y, t.align)} onChange={(p) => patch({ x: p.x, y: p.y, align: p.align })} />
            </div>
            <Fld label="x" style={{ width: 70 }}>
              <NIn value={t.x} step={0.01} min={0} max={1} onChange={(v) => patch({ x: A.clamp01(v) })} />
            </Fld>
            <Fld label="y" style={{ width: 70 }}>
              <NIn value={t.y} step={0.01} min={0} max={1} onChange={(v) => patch({ y: A.clamp01(v) })} />
            </Fld>
          </TagRow>
          {counts.length > 0 && (
            <Well style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Tag>COUNT</Tag>
              <Tog
                on={Boolean(t.count)}
                onChange={(on) => {
                  // เปิดนับครั้งแรกแล้วยังไม่มีที่ให้เลขลง — ใส่ {n} ให้เลย ไม่งั้นจอไม่เปลี่ยนอะไร
                  const need = on && !t.text.includes("{n}") && (t.lines?.length ?? 0) === 0;
                  patch(on ? { count: "int", ...(need ? { text: "{n}" } : {}) } : { count: "" });
                }}
                title="ตัวเลขนับขึ้นตลอดช่วงของชิ้น"
              />
              {t.count ? (
                <>
                  <Fld label="from → to" style={{ flex: 1, minWidth: 150 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <NIn value={t.count_from} step={1} onChange={(v) => patch({ count_from: v })} />
                      <span className="kv">→</span>
                      <NIn value={t.count_to} step={1} onChange={(v) => patch({ count_to: v })} />
                    </span>
                  </Fld>
                  <Fld label="format" style={{ width: 150 }}>
                    <Sel value={t.count} onChange={(v) => patch({ count: v })} options={counts.filter(([k]) => k).map(([v, label]) => ({ v, label }))} />
                  </Fld>
                </>
              ) : (
                <Kv style={{ fontSize: 10.5 }}>เลขนับขึ้น — ไปแทน {"{n}"} ในข้อความ (ชะลอปลายเหมือนเอนจิน)</Kv>
              )}
            </Well>
          )}
        </>
      )}

      {/* ── รูปทรง ── */}
      <SecHead tag={`SHAPES · ${shapes.length}`} right={<Keys items={shapeKinds.map(([k, label]) => ({ v: k, label, title: `วาง${label}ที่หัวเล่น (libass วาดเอง)` }))} value={null} onChange={(k) => A.addShapeAt(s.playhead, k)} />} />
      {shapes.length > 0 && (
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 140, overflowY: "auto", flexShrink: 0 }}>
          {shapes.map((x, i) => {
            const b = shapeBlocks.find((k) => k.idx === i);
            const on = i === focusShape;
            return (
              <div
                key={`${x.id}-${i}`}
                className={cx("cursor-pointer", on && "sel-ring")}
                style={{ display: "grid", gridTemplateColumns: "8px 1fr auto auto", gap: 10, alignItems: "center", padding: "6px 10px", opacity: b?.orphan ? 0.5 : 1 }}
                onClick={() => {
                  s.setFocus({ kind: "shape", idx: i });
                  if (b && !b.orphan) s.seek(b.tl);
                }}
              >
                <Led on={!b?.orphan} red={b?.orphan} />
                <span style={{ fontSize: 12 }}>
                  <span style={{ color: x.color }}>■</span> {d.defaults.shape_kind?.[x.kind] ?? x.kind}
                  {x.behind ? " · ใต้ข้อความ" : ""}
                </span>
                <span className="mono kv" style={{ fontSize: 10 }}>
                  {b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)} s` : "กำพร้า"} · x {x.x.toFixed(2)} y {x.y.toFixed(2)}
                </span>
                <Btn sm onClick={(e) => { e.stopPropagation(); s.removeLayerItem("shape", i); }}>✕</Btn>
              </div>
            );
          })}
        </Well>
      )}
      {sh && (
        <>
          <KnobGrid>
            <Knob label="SIZE" value={sh.size} min={4} max={2000} step={4} def={d.defaults.shape.size} onChange={(v) => patchShape({ size: Math.round(v) })} title="พิกเซลของหนังจริง" />
            <Knob label="THICK" value={sh.thick} min={0.03} max={0.9} step={0.01} def={d.defaults.shape.thick} fmt={(v) => v.toFixed(2)} onChange={(v) => patchShape({ thick: v })} title="ความหนาเทียบขนาด" />
            <Knob label="ANGLE" value={sh.angle} min={-180} max={180} step={1} def={0} fmt={(v) => `${Math.round(v)}°`} onChange={(v) => patchShape({ angle: v })} title="หมุนทวนเข็ม (องศา)" />
            <Knob label="GLOW" value={sh.glow ?? 0} min={0} max={1} step={0.05} def={0} fmt={(v) => v.toFixed(2)} off={!hasGlow} onChange={(v) => patchShape({ glow: v })} title={hasGlow ? "เรืองแสง 0 = ปิด" : "เอนจินรุ่นนี้ไม่มี glow"} />
          </KnobGrid>
          <TagRow>
            <Fld label="สี" style={{ flex: 1 }}>
              <CIn value={sh.color} onChange={(v) => patchShape({ color: v })} />
            </Fld>
            <Fld label="anim" style={{ width: 120 }}>
              <Sel value={sh.anim} onChange={(v) => patchShape({ anim: v })} options={anims.map(([k]) => ({ v: k, label: k }))} />
            </Fld>
            <Tog on={sh.behind} onChange={(v) => patchShape({ behind: v })} label="behind" title="วางไว้ใต้ข้อความ — แถบที่รองตัวเลขต้องเปิด" />
          </TagRow>
          <TagRow>
            <Tag>POSITION</Tag>
            <div style={{ width: 200 }}>
              <PosGrid ids={POS_IDS} cols={6} value={POSES.find((p) => Math.abs(p.x - sh.x) < 0.03 && Math.abs(p.y - sh.y) < 0.03)?.id ?? null} onChange={(p) => patchShape({ x: p.x, y: p.y })} />
            </div>
            <Fld label="dur" style={{ width: 70 }}>
              <NIn value={sh.dur} step={0.1} min={0.2} onChange={(v) => patchShape({ dur: Math.max(0.2, v) })} />
            </Fld>
          </TagRow>
        </>
      )}
      <Kv style={{ fontSize: 10.5 }}>ลากชิ้นไปวางบนจอ · รูปทรงวาดด้วย libass (fxtext) ไม่ต้องมีไฟล์ภาพ · ลูกศร = ขยับทีละนิด · Delete = ลบชิ้นที่เลือก</Kv>
    </EditShell>
  );
}

// TR_ID ถูกใช้ผ่าน useAdders — export ซ้ำไว้ให้แผงอื่นอ้างชนิดเดียวกัน
export { TR_ID };
