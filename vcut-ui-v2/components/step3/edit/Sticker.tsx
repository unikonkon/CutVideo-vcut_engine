"use client";

// CQ3STK — สติกเกอร์ / ภาพซ้อน (fx.json overlays · /api/asset)
//   แหล่ง: คลัง 200 (public/stickers · 12 หมวด) · อัปโหลดของฉัน (assets ภาพ) · มาสคอต (assets วิดีโอ)
//   ชิ้นที่ focus: POSITION · SHOW AT · WIDTH/OPACITY · ANIM · IN/OUT · อัปโหลด
//   ซ้าย (leftExtra): AI ASSIST — สั่ง review task sticker/sfx พร้อม catalog

import { useMemo, useRef, useState } from "react";
import { Btn, Empty, Fld, Keys, Knob, Kv, Led, NIn, PosGrid, Sel, Tag, Well, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { api2, assetUrl, fileToBase64, type FxOverlay } from "@/lib/api";
import { STICKER_CATS, STICKER_LIST, stickerUrl, type StickerCat } from "@/lib/stickers";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, KnobGrid, TagRow, catalog, useAdders } from "./common";

type Source = "lib" | "mine" | "mascot";
type ShowAt = "whole" | "first" | "last" | "cur";
const CAT_SHOWN = 9;
const SAFE = 0.05;
const POS_IDS = ["tl", "tr", "c", "bl", "br"];
const isVideo = (kind: string, file: string) => kind === "video" || /\.(mov|webm|mp4|m4v)$/i.test(file);

export default function StickerEditor() {
  const s = useStudio();
  const eng = useEngine();
  const A = useAdders();
  const d = s.fx.data;
  const dr = s.fx.draft;
  const running = Boolean(eng.job?.running);
  const [src, setSrc] = useState<Source>("lib");
  const [cat, setCat] = useState<StickerCat>("badge");
  const [allCats, setAllCats] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const overlays = useMemo(() => dr?.overlays ?? [], [dr]);
  const focusIdx = s.focus?.kind === "sticker" ? s.focus.idx : null;
  const o = focusIdx != null ? overlays[focusIdx] : undefined;
  const blk = focusIdx != null ? s.layers.sticker.find((b) => b.idx === focusIdx) : undefined;

  if (!d || !dr) {
    return (
      <EditShell id="sticker" badge="EDIT STICKER" tag="SEC 05b · STICKER / OVERLAY" title="สติกเกอร์ / ภาพซ้อน">
        <Empty>กำลังโหลด fx.json…</Empty>
      </EditShell>
    );
  }

  const patch = (p: Partial<FxOverlay>) => focusIdx != null && s.patchOverlayAt(focusIdx, p);
  const assets = d.overlay.assets;
  const mine = assets.filter((a) => !isVideo(a.kind, a.file));
  const mascots = assets.filter((a) => isVideo(a.kind, a.file));
  const anims = Array.isArray(d.defaults.overlay_anim) ? d.defaults.overlay_anim.map((k) => [k, k] as [string, string]) : Object.entries(d.defaults.overlay_anim as Record<string, string>);
  const used = new Set(overlays.map((x) => x.file));
  const inLib = new Set(assets.map((a) => a.file));

  // ความสูงของชิ้นเทียบเฟรม (จากสัดส่วนไฟล์ในคลัง) — ให้จัดชิดขอบปลอดภัยได้พอดีทั้งป้ายกว้างและไอคอนเล็ก
  const frameAR = s.frame.w / s.frame.h;
  const heightOf = (x: FxOverlay) => {
    const a = assets.find((y) => y.file === x.file);
    return x.width * frameAR * (a && a.w && a.h ? a.h / a.w : 1);
  };
  const poseId = (x: FxOverlay): string | null => {
    const hw = x.width / 2;
    const hh = heightOf(x) / 2;
    const col = Math.abs(x.x - (SAFE + hw)) < 0.02 ? "l" : Math.abs(x.x - (1 - SAFE - hw)) < 0.02 ? "r" : Math.abs(x.x - 0.5) < 0.02 ? "c" : "";
    const row = Math.abs(x.y - (SAFE + hh)) < 0.02 ? "t" : Math.abs(x.y - (1 - SAFE - hh)) < 0.02 ? "b" : Math.abs(x.y - 0.5) < 0.02 ? "c" : "";
    return { tl: "tl", tr: "tr", cc: "c", bl: "bl", br: "br" }[row + col] ?? null;
  };
  const setPose = (id: string) => {
    if (!o) return;
    const hw = o.width / 2;
    const hh = heightOf(o) / 2;
    const x = id.endsWith("l") ? SAFE + hw : id.endsWith("r") ? 1 - SAFE - hw : 0.5;
    const y = id.startsWith("t") ? SAFE + hh : id.startsWith("b") ? 1 - SAFE - hh : 0.5;
    patch({ x: A.r3(A.clamp01(x)), y: A.r3(A.clamp01(y)) });
  };

  // SHOW AT — ภาพซ้อนผูกกับ (คลิป, วินาทีในคลิป) · "ทั้งเรื่อง" = เกาะช็อตแรกแล้วยาวเท่าหนัง
  // (ถ้าสลับช็อตแรกไปอยู่ที่อื่น ชิ้นนี้จะย้ายตามช็อตนั้น — ข้อจำกัดของโครงข้อมูล)
  const shots = s.shots;
  const first = shots[0];
  const last = shots[shots.length - 1];
  const cur = s.playheadAt ? shots[s.playheadAt.i] : undefined;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
  const showAt = (x: FxOverlay): ShowAt | null => {
    if (first && x.name === first.name && near(x.at, first.start)) {
      if (near(x.dur, s.total) || x.dur >= s.total - 0.02) return "whole";
      if (near(x.dur, first.dur)) return "first";
    }
    if (last && x.name === last.name && near(x.at, last.start) && near(x.dur, last.dur)) return "last";
    if (cur && x.name === cur.name && near(x.at, cur.start) && near(x.dur, cur.dur)) return "cur";
    return null;
  };
  const setShowAt = (v: ShowAt) => {
    const sh = v === "whole" || v === "first" ? first : v === "last" ? last : cur;
    if (!sh) return;
    patch({ name: sh.name, at: sh.start, dur: v === "whole" ? A.r3(s.total) : sh.dur });
  };

  const upload = async (f: File) => {
    if (f.size > 40 * 1024 * 1024) return s.flash("ไฟล์ใหญ่เกิน 40 MB — คลัง asset รับไม่ได้");
    if (/\.webm$/i.test(f.name)) s.flash(".webm อัลฟาใช้ไม่ได้ในเอนจิน — แนะนำ MOV ProRes 4444");
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "media");
      s.fx.setData(r.fx);
      setSrc(isVideo("", f.name) ? "mascot" : "mine");
      s.flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — คลิกไทล์เพื่อวางที่หัวเล่น`);
    } catch (e) {
      s.flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };
  const del = (file: string) => {
    if (used.has(file)) return s.flash("ไฟล์นี้ถูกใช้อยู่ — เอาออกจากหนังก่อนลบ");
    api2.deleteAsset(file).then((r) => s.fx.setData(r.fx)).catch((e: Error) => s.flash(e.message));
  };
  const ai = (task: "sticker" | "sfx") => {
    if (running) return;
    eng.track("review", () => api2.runReview("", true, [task], catalog()));
  };

  const cats = allCats ? STICKER_CATS : STICKER_CATS.slice(0, CAT_SHOWN);
  const tiles = STICKER_LIST.filter((x) => x.cat === cat);
  const topleft = o && blk
    ? `STICKER · DRAG TO MOVE · ${durMs(blk.tl)}–${durMs(blk.tl + o.dur)} s · x ${o.x.toFixed(2).slice(1)} y ${o.y.toFixed(2).slice(1)} w ${o.width.toFixed(2).slice(1)}`
    : `STICKER · ${overlays.length} PLACED · คลิกไทล์เพื่อวางที่หัวเล่น`;

  return (
    <EditShell
      id="sticker"
      badge={`EDIT STICKER · ${overlays.length}`}
      tag="SEC 05b · STICKER / OVERLAY"
      title="สติกเกอร์ / ภาพซ้อน"
      revert={s.fx.revert}
      topleft={topleft}
      leftExtra={
        <>
          <Tag>AI ASSIST</Tag>
          <Btn onClick={() => ai("sticker")} disabled={running} style={{ justifyContent: "space-between" }} title="review --task sticker (ส่ง catalog 200 แบบไป)">
            วางสติกเกอร์ให้ 3–5 จุด <span className="mono kv" style={{ fontSize: 10 }}>~1m</span>
          </Btn>
          <Btn onClick={() => ai("sfx")} disabled={running} style={{ justifyContent: "space-between" }} title="review --task sfx">
            วาง SFX ตรงรอยตัด <span className="mono kv" style={{ fontSize: 10 }}>~1m</span>
          </Btn>
          <Kv style={{ fontSize: 10.5, lineHeight: "15px" }}>AI เสนอเป็นรายการ กดรับทีละข้อเหมือนหน้า 03{running && eng.lastStep === "review" ? " · กำลังดู…" : ""}</Kv>
        </>
      }
    >
      <Keys<Source>
        grow
        sm={false}
        items={[
          { v: "lib", label: `คลัง ${STICKER_LIST.length}` },
          { v: "mine", label: `อัปโหลดของฉัน ${mine.length}` },
          { v: "mascot", label: `มาสคอต ${mascots.length}`, title: "วิดีโอโปร่งใส (MOV ProRes 4444) ในคลัง" },
        ]}
        value={src}
        onChange={setSrc}
      />
      {src === "lib" && (
        <>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Keys items={cats.map((c) => ({ v: c.key, label: c.label }))} value={cat} onChange={setCat} />
            {!allCats && <Btn sm onClick={() => setAllCats(true)}>+{STICKER_CATS.length - CAT_SHOWN}</Btn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
            {tiles.map((x) => (
              <Well key={x.file} sel={o?.file === x.file} onClick={() => A.addStickerSampleAt(s.playhead, x)} title={`${x.label} — วางที่หัวเล่นด้วยท่า x ${x.x} y ${x.y} w ${x.width}${inLib.has(x.file) ? " (อยู่ในคลังแล้ว)" : ""}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px 6px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stickerUrl(x.file)} alt={x.label} style={{ width: 44, height: 44, objectFit: "contain" }} loading="lazy" />
                <Kv style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{x.label}</Kv>
              </Well>
            ))}
          </div>
          <Kv style={{ fontSize: 10.5 }}>ทุกแบบมี “ท่า” มาให้ — แบดจ์เกาะมุมขวาบน · แถบนอนล่างซ้าย</Kv>
        </>
      )}
      {src !== "lib" && (
        <>
          {(src === "mine" ? mine : mascots).length === 0 ? (
            <Empty>{src === "mine" ? "ยังไม่มีไฟล์ของคุณในคลัง — อัปโหลด PNG/WEBP/JPG ข้างล่าง" : "ยังไม่มีมาสคอต — อัปโหลด MOV ProRes 4444 (อัลฟา) ข้างล่าง"}</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
              {(src === "mine" ? mine : mascots).map((a) => (
                <Well key={a.file} sel={o?.file === a.file} onClick={() => A.addStickerAt(s.playhead, a.file)} title={`${a.file} (${a.w}×${a.h}) — คลิกวางที่หัวเล่น`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px 6px", position: "relative" }}>
                  {isVideo(a.kind, a.file) ? (
                    <video src={assetUrl(a.file)} muted playsInline preload="metadata" style={{ width: 44, height: 44, objectFit: "contain" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(a.file)} alt={a.file} style={{ width: 44, height: 44, objectFit: "contain" }} loading="lazy" />
                  )}
                  <Kv style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{a.file}</Kv>
                  <Btn sm onClick={(e) => { e.stopPropagation(); del(a.file); }} style={{ position: "absolute", right: 2, top: 2, padding: "0 4px" }} title="ลบออกจากคลัง">✕</Btn>
                </Well>
              ))}
            </div>
          )}
          {src === "mascot" && <Kv style={{ fontSize: 10.5 }}>มาสคอต = วิดีโอโปร่งใส MOV ProRes 4444 — .webm อัลฟาใช้ไม่ได้ · เล่นวนตามช่วงที่วาง</Kv>}
        </>
      )}

      {/* ── ชิ้นที่วางอยู่ ── */}
      {overlays.length > 0 && (
        <Well className="rows" style={{ display: "flex", flexDirection: "column", padding: "2px 0", maxHeight: 110, overflowY: "auto", flexShrink: 0 }}>
          {overlays.map((x, i) => {
            const b = s.layers.sticker.find((k) => k.idx === i);
            return (
              <div key={`${x.file}-${i}`} className={cx("cursor-pointer", i === focusIdx && "sel-ring")} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto auto", gap: 10, alignItems: "center", padding: "4px 10px", opacity: b?.orphan ? 0.5 : 1 }} onClick={() => { s.setFocus({ kind: "sticker", idx: i }); if (b && !b.orphan) s.seek(b.tl); }}>
                <Led on={!b?.orphan} red={b?.orphan} />
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{STICKER_LIST.find((y) => y.file === x.file)?.label ?? x.file}</span>
                <span className="mono kv" style={{ fontSize: 10 }}>{b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)} s` : "กำพร้า"}</span>
                <Btn sm onClick={(e) => { e.stopPropagation(); s.removeLayerItem("sticker", i); }}>✕</Btn>
              </div>
            );
          })}
        </Well>
      )}

      {o && (
        <>
          <Tag>POSITION</Tag>
          <PosGrid ids={POS_IDS} value={poseId(o)} onChange={(p) => setPose(p.id)} />
          <Tag>SHOW AT</Tag>
          <Keys<ShowAt>
            grow
            items={[
              { v: "whole", label: "ทั้งเรื่อง", title: "เกาะช็อตแรก ยาวเท่าหนัง (ผูกกับคลิป — ถ้าย้ายช็อตแรก ชิ้นนี้ย้ายตาม)" },
              { v: "first", label: "ช็อตแรก" },
              { v: "last", label: "ช็อตสุดท้าย" },
              { v: "cur", label: "ช็อตที่ดูอยู่", title: cur ? `${cur.name} · ${cur.dur.toFixed(1)} s` : "" },
            ]}
            value={showAt(o)}
            onChange={setShowAt}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, alignItems: "end" }}>
            <Knob label="WIDTH" value={o.width} min={0.02} max={1.5} step={0.01} def={d.defaults.overlay.width} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch({ width: A.r3(v) })} />
            <Knob label="OPACITY" value={o.opacity} min={0} max={1} step={0.05} def={1} fmt={(v) => `${Math.round(v * 100)}`} onChange={(v) => patch({ opacity: v })} />
            <Fld label="ANIM">
              <Sel value={o.anim} onChange={(v) => patch({ anim: v })} options={anims.map(([k, label]) => ({ v: k, label: k === label ? k : `${k} · ${label}` }))} />
            </Fld>
          </div>
          <KnobGrid>
            <Fld label="IN (วิ)"><NIn value={o.in} step={0.05} min={0} max={3} onChange={(v) => patch({ in: v })} /></Fld>
            <Fld label="OUT (วิ)"><NIn value={o.out} step={0.05} min={0} max={3} onChange={(v) => patch({ out: v })} /></Fld>
            <Fld label="DUR (วิ)"><NIn value={o.dur} step={0.1} min={0.2} onChange={(v) => patch({ dur: Math.max(0.2, v) })} /></Fld>
            <Fld label="ANGLE"><NIn value={o.angle} step={5} min={-180} max={180} onChange={(v) => patch({ angle: v })} /></Fld>
          </KnobGrid>
          <TagRow>
            <Fld label="x" style={{ flex: 1 }}><NIn value={o.x} step={0.01} min={0} max={1} onChange={(v) => patch({ x: A.clamp01(v) })} /></Fld>
            <Fld label="y" style={{ flex: 1 }}><NIn value={o.y} step={0.01} min={0} max={1} onChange={(v) => patch({ y: A.clamp01(v) })} /></Fld>
            <Kv style={{ fontSize: 10.5, flex: 2 }}>ลากบนจอได้เลย · จุดมุม = ย่อขยาย · ก้านบน = หมุน</Kv>
          </TagRow>
        </>
      )}

      <div style={{ flex: 1 }} />
      <Well dashed onClick={() => fileRef.current?.click()} style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }} title="เลือกไฟล์จากเครื่อง">
        <span style={{ fontSize: 11.5 }}>⬆ อัปโหลดของตัวเอง</span>
        <Kv style={{ fontSize: 10, lineHeight: "14px" }}>PNG · WEBP · JPG · MOV ProRes 4444 ≤ 40 MB — .webm อัลฟาใช้ไม่ได้ · เข้า .vcut/assets</Kv>
      </Well>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.mov,.mp4,.m4v" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      {d.overlay.missing.length > 0 && <Kv style={{ fontSize: 10.5, color: "var(--danger)" }}>ไฟล์หาย: {d.overlay.missing.join(", ")}</Kv>}
    </EditShell>
  );
}
