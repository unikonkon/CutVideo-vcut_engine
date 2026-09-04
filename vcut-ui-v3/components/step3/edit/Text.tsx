"use client";

// แท็บ "HOOK / การ์ดปิด" ของลิ้นชัก — ข้อความ + รูปทรง (fx.json texts · presets · shapes · ขั้น ⑤)
//   ซ้าย : รายการข้อความ (ชนิด · “…” · เวลา · ลบ) + ปุ่มเพิ่ม · ชิ้นที่เลือก: เนื้อความ · แอนิเมชัน ·
//          เข้า/ออก/ยาว (− / +) · แผ่นพื้น/หนา/เอียง · สี · ฟอนต์ · ชุดสไตล์ · เลขนับขึ้น · รูปทรง
//   ขวา  : จอตัวอย่าง · ตำแหน่ง 3×3 · ขนาด − / + ของชิ้นที่เลือก
//   (ค่าทุกช่องชื่อเดียวกับเอนจิน — port จาก vcut-ui TextPanel + StickerPanel ส่วนรูปทรง)

import { useMemo, useState } from "react";
import { Btn, CIn, Empty, Fld, Icon, Pos9, Seg, Sel, Stepper, TArea, Tog, cx } from "@/components/instrument";
import type { FxPreset, FxShape, FxTextItem } from "@/lib/api";
import { lookOf } from "@/lib/presets";
import { resolveLook } from "@/lib/textfx";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, Grid2, IcBtn, Lbl, Row, Sec, TR_ID, TagRow, pos9OfItem, pos9Pose, useAdders } from "./common";

/** ชนิดของชิ้นให้คนอ่าน — การ์ดหลายบรรทัด · จากบทพูด · ที่เหลือคือ HOOK */
function kindOf(t: FxTextItem): string {
  if ((t.lines?.length ?? 0) > 0) return "การ์ดปิด";
  if (t.id.startsWith("tr:")) return "บทพูด";
  if (t.count) return "นับเลข";
  return "HOOK";
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
      <EditShell id="text">
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

  // ชุดสไตล์ชนะค่าของชิ้น (เหมือน fxtext.cues) — ตัวควบคุมหน้าตาต้องแก้ที่ชุด ไม่ใช่ที่ชิ้น
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

  const inSpeech = new Set(texts.filter((x) => x.id.startsWith("tr:")).map((x) => x.id.slice(3)));
  const fontOpts = (font: string) => [
    ...(font && !d.fonts.thai.includes(font) && !d.fonts.other.includes(font) ? [{ v: font, label: `${font} (ไม่มีในเครื่องนี้)` }] : []),
    ...d.fonts.thai.map((f) => ({ v: f, label: `${f} (ไทย)` })),
    ...d.fonts.other.map((f) => ({ v: f, label: f })),
  ];

  const right =
    t && view ? (
      <>
        <Lbl>ตำแหน่ง · {kindOf(t)}</Lbl>
        <Pos9 value={pos9OfItem(t.x, t.y, t.align)} onChange={(i) => patch(pos9Pose(i))} title="ลากบนจอตัวอย่างได้ด้วย" />
        <Row label="ขนาด">
          <Stepper value={view.size} min={8} max={300} step={2} onChange={(v) => patchLook({ size: v })} title={bound ? `ค่าจากชุด "${bound.name}" — เปลี่ยนแล้วมีผลทุกชิ้นที่ผูก` : "ขนาดตัวอักษร (พิกเซลของหนัง)"} />
        </Row>
      </>
    ) : sh ? (
      <>
        <Lbl>ตำแหน่งรูปทรง</Lbl>
        <Pos9 value={[...Array(9).keys()].find((i) => Math.abs(pos9Pose(i).x - sh.x) < 0.05 && Math.abs(pos9Pose(i).y - sh.y) < 0.05) ?? null} onChange={(i) => patchShape({ x: pos9Pose(i).x, y: pos9Pose(i).y })} />
        <Row label="ขนาด">
          <Stepper value={sh.size} min={4} max={2000} step={10} onChange={(v) => patchShape({ size: Math.round(v) })} title="พิกเซลของหนังจริง" />
        </Row>
      </>
    ) : undefined;

  return (
    <EditShell id="text" revert={s.fx.revert} right={right}>
      {/* ── รายการข้อความ ── */}
      <Sec title={`ข้อความ · ${texts.length}`} note="HOOK · การ์ดปิด · บทพูด · เลขนับ" />
      {texts.length === 0 && <Lbl>ยังไม่มีข้อความ — กดปุ่มข้างล่างเพื่อวางที่หัวเล่น</Lbl>}
      <div className="rows" style={{ display: "flex", flexDirection: "column" }}>
        {texts.map((x, i) => {
          const b = blocks.find((k) => k.idx === i);
          const on = i === focusText;
          const first = (x.text || "(ว่าง)").split("\n")[0];
          return (
            <div
              key={`${x.id}-${i}`}
              className={cx("cursor-pointer", on && "sel-ring")}
              style={{ display: "grid", gridTemplateColumns: "16px 1fr auto 34px", gap: 10, alignItems: "center", padding: "6px 4px", opacity: b?.orphan ? 0.5 : 1 }}
              onClick={() => {
                s.setFocus({ kind: "text", idx: i });
                if (b && !b.orphan) s.seek(b.tl);
              }}
              title={b?.orphan ? "ช่วงที่เกาะอยู่ไม่มีในไทม์ไลน์แล้ว — ชิ้นนี้จะไม่ขึ้นในหนัง" : `เกาะคลิป ${x.name} @${x.at.toFixed(2)} วิ`}
            >
              <Icon name={kindOf(x) === "HOOK" ? "spark" : "text"} size={14} color={b?.orphan ? "var(--danger)" : on ? "var(--amber)" : "var(--muted)"} />
              <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {kindOf(x)} · “{first}”
              </span>
              <span className="muted small num" style={{ whiteSpace: "nowrap" }}>
                {b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)}` : "กำพร้า"}
              </span>
              <IcBtn name="x" onClick={(e) => { e.stopPropagation(); s.removeLayerItem("text", i); }} title="เอาข้อความนี้ออก" />
            </div>
          );
        })}
      </div>
      <TagRow>
        <Btn sm onClick={() => A.addTextAt(s.playhead)} title="ข้อความตั้งต้นของเอนจิน วางตรงหัวเล่น (ยาว 3 วิ)">
          <Icon name="plus" size={12} />
          ข้อความที่หัวเล่น
        </Btn>
        <Btn sm on={pickSpeech} onClick={() => setPickSpeech((v) => !v)} disabled={!s.speechLines.length} title="เลือกบรรทัดจากบทพูดขึ้นจอตรงเวลาที่พูดจริง">
          <Icon name="mic" size={12} />
          จากบทพูด
        </Btn>
        <Btn sm onClick={() => A.addTextAt(s.playhead, { text: "{n}", count: "int", count_from: 0, count_to: 100 })} disabled={!counts.length} title="ตัวเลขนับขึ้น 0→100 (แก้ช่วง/รูปแบบได้ข้างล่าง)">
          <Icon name="plus" size={12} />
          เลขนับขึ้น
        </Btn>
      </TagRow>
      {pickSpeech && (
        <div className="rows" style={{ display: "flex", flexDirection: "column", maxHeight: 160, overflowY: "auto", flexShrink: 0 }}>
          {s.speechLines.map((ln) => {
            const used = inSpeech.has(ln.id);
            return (
              <div key={ln.id} className="cursor-pointer" style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 8, padding: "5px 4px", alignItems: "center", opacity: used ? 0.4 : 1 }} onClick={() => { if (!used) A.addSpeechText(ln); setPickSpeech(false); }} title={used ? "อยู่ในหนังแล้ว" : "ขึ้นจอที่วินาทีนี้"}>
                <span className="muted small num">{durMs(ln.tl)}</span>
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ln.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ชิ้นที่เลือก ── */}
      {t && view && focusText != null && (
        <>
          <Sec title={kindOf(t)} note={`${t.name} @${t.at.toFixed(2)} วิ`} />
          <TArea value={t.text} onChange={(v) => patch({ text: v })} rows={2} placeholder="เนื้อความ · {n} = ตำแหน่งตัวเลขที่นับ" />
          <Lbl>แอนิเมชัน</Lbl>
          <Seg sm cols={Math.min(4, Math.max(1, anims.length))} items={anims.map(([k, desc]) => ({ v: k, label: k, title: desc }))} value={t.anim} onChange={(v) => patch({ anim: v })} />
          <Grid2>
            <Row label="เข้า (วิ)">
              <Stepper value={t.in} min={0} max={1.5} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ in: v })} />
            </Row>
            <Row label="ออก (วิ)">
              <Stepper value={t.out} min={0} max={1.5} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ out: v })} />
            </Row>
            <Row label="ยาว (วิ)">
              <Stepper value={t.dur} min={0.2} max={20} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ dur: v })} />
            </Row>
          </Grid2>
          <TagRow style={{ gap: 18 }}>
            <Tog on={t.plate} onChange={(v) => patch({ plate: v })} label="แผ่นพื้นหลัง" title="พื้นหลังทึบใต้ตัวอักษร" />
            <Tog on={view.bold} onChange={(v) => patchLook({ bold: v })} label="หนา" />
            <Tog on={view.italic} onChange={(v) => patchLook({ italic: v })} label="เอียง" />
          </TagRow>
          <Grid2>
            <Fld label={`สีตัวอักษร${bound ? " · จากชุด" : ""}`}>
              <CIn value={view.color} onChange={(v) => patchLook({ color: v })} />
            </Fld>
            <Fld label={`สีขอบ${bound ? " · จากชุด" : ""}`}>
              <CIn value={view.outline} onChange={(v) => patchLook({ outline: v })} />
            </Fld>
            <Fld label="ฟอนต์">
              <Sel value={view.font} onChange={(v) => patchLook({ font: v })} options={fontOpts(view.font)} />
            </Fld>
            <Fld label="ชุดสไตล์" title="ชิ้นที่ผูกชุดเดียวกันหน้าตาเปลี่ยนพร้อมกัน">
              <Sel
                value={t.preset && presets.some((p) => p.name === t.preset) ? t.preset : ""}
                onChange={setPreset}
                options={[
                  { v: "", label: "ตั้งเอง" },
                  ...presets.map((p) => ({ v: p.name, label: `${p.name} · ใช้ ${texts.filter((x) => x.preset === p.name).length} ชิ้น` })),
                  ...(blankPreset ? [{ v: "__new", label: "+ ชุดใหม่จากชิ้นนี้" }] : []),
                ]}
              />
            </Fld>
          </Grid2>
          {t.preset && !bound && <Lbl style={{ color: "var(--warm)" }}>ชิ้นนี้ผูกกับชุด “{t.preset}” ที่ไม่มีอยู่แล้ว — ตอนนี้ใช้ค่าของชิ้นเอง</Lbl>}
          {counts.length > 0 && (
            <>
              <Sec
                title="เลขนับขึ้น"
                note={`ไปแทน {n} ในข้อความ`}
                right={
                  <Tog
                    on={Boolean(t.count)}
                    onChange={(on) => {
                      // เปิดนับครั้งแรกแล้วยังไม่มีที่ให้เลขลง — ใส่ {n} ให้เลย ไม่งั้นจอไม่เปลี่ยนอะไร
                      const need = on && !t.text.includes("{n}") && (t.lines?.length ?? 0) === 0;
                      patch(on ? { count: "int", ...(need ? { text: "{n}" } : {}) } : { count: "" });
                    }}
                  />
                }
              />
              {t.count && (
                <Grid2>
                  <Row label="จาก">
                    <Stepper value={t.count_from} min={-1e9} max={1e9} step={1} onChange={(v) => patch({ count_from: v })} />
                  </Row>
                  <Row label="ถึง">
                    <Stepper value={t.count_to} min={-1e9} max={1e9} step={1} onChange={(v) => patch({ count_to: v })} />
                  </Row>
                  <Fld label="รูปแบบ">
                    <Sel value={t.count} onChange={(v) => patch({ count: v })} options={counts.filter(([k]) => k).map(([v, label]) => ({ v, label }))} />
                  </Fld>
                </Grid2>
              )}
            </>
          )}
        </>
      )}

      {/* ── รูปทรง ── */}
      <Sec title={`รูปทรง · ${shapes.length}`} note="วางที่หัวเล่น · วาดด้วย libass ไม่ต้องมีไฟล์ภาพ" />
      {shapeKinds.length > 0 && (
        <Seg sm cols={Math.min(4, shapeKinds.length)} items={shapeKinds.map(([k, label]) => ({ v: k, label, title: `วาง${label}ที่หัวเล่น` }))} value={null} onChange={(k) => A.addShapeAt(s.playhead, k)} />
      )}
      {shapes.length > 0 && (
        <div className="rows" style={{ display: "flex", flexDirection: "column" }}>
          {shapes.map((x, i) => {
            const b = shapeBlocks.find((k) => k.idx === i);
            const on = i === focusShape;
            return (
              <div
                key={`${x.id}-${i}`}
                className={cx("cursor-pointer", on && "sel-ring")}
                style={{ display: "grid", gridTemplateColumns: "16px 1fr auto 34px", gap: 10, alignItems: "center", padding: "6px 4px", opacity: b?.orphan ? 0.5 : 1 }}
                onClick={() => {
                  s.setFocus({ kind: "shape", idx: i });
                  if (b && !b.orphan) s.seek(b.tl);
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 3, background: x.color, display: "inline-block" }} />
                <span style={{ fontSize: 13 }}>
                  {d.defaults.shape_kind?.[x.kind] ?? x.kind}
                  {x.behind ? " · ใต้ข้อความ" : ""}
                </span>
                <span className="muted small num">{b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)}` : "กำพร้า"}</span>
                <IcBtn name="x" onClick={(e) => { e.stopPropagation(); s.removeLayerItem("shape", i); }} title="เอารูปทรงนี้ออก" />
              </div>
            );
          })}
        </div>
      )}
      {sh && (
        <>
          <Grid2>
            <Row label="ความหนา">
              <Stepper value={sh.thick} min={0.03} max={0.9} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => patchShape({ thick: v })} title="ความหนาเทียบขนาด" />
            </Row>
            <Row label="หมุน (องศา)">
              <Stepper value={sh.angle} min={-180} max={180} step={5} fmt={(v) => `${Math.round(v)}`} onChange={(v) => patchShape({ angle: v })} />
            </Row>
            <Row label="เรืองแสง">
              <Stepper value={sh.glow ?? 0} min={0} max={1} step={0.1} fmt={(v) => v.toFixed(1)} disabled={!hasGlow} onChange={(v) => patchShape({ glow: v })} title={hasGlow ? "0 = ปิด" : "เอนจินรุ่นนี้ไม่มี glow"} />
            </Row>
            <Row label="ยาว (วิ)">
              <Stepper value={sh.dur} min={0.2} max={20} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patchShape({ dur: Math.max(0.2, v) })} />
            </Row>
            <Fld label="สี">
              <CIn value={sh.color} onChange={(v) => patchShape({ color: v })} />
            </Fld>
            <Fld label="แอนิเมชัน">
              <Sel value={sh.anim} onChange={(v) => patchShape({ anim: v })} options={anims.map(([k]) => ({ v: k, label: k }))} />
            </Fld>
          </Grid2>
          <Tog on={sh.behind} onChange={(v) => patchShape({ behind: v })} label="วางไว้ใต้ข้อความ" title="แถบที่รองตัวเลขต้องเปิด" />
        </>
      )}
      <Lbl>ลากชิ้นไปวางบนจอตัวอย่างได้ · ลูกศร = ขยับทีละนิด · Delete = ลบชิ้นที่เลือก</Lbl>
    </EditShell>
  );
}

// TR_ID ถูกใช้ผ่าน useAdders — export ซ้ำไว้ให้แผงอื่นอ้างชนิดเดียวกัน
export { TR_ID };
