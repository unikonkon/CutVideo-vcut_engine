"use client";

// แท็บ "สติกเกอร์" ของลิ้นชัก — สติกเกอร์ / ภาพซ้อน (fx.json overlays · /api/asset)
//   แหล่ง 3 ช่อง: คลังตัวอย่าง (public/stickers) · อัปโหลดของฉัน · มาสคอต (วิดีโอโปร่งใส)
//   ชิ้นที่เลือก: แสดงตอน (4 ช่อง) · เข้า/ออก/ยาว/หมุน (− / +) · แอนิเมชัน · ขวา: ตำแหน่ง 3×3 · กว้าง · ทึบ
//   AI ช่วยวาง (review task sticker/sfx) อยู่ท้ายแผง

import { useMemo, useRef, useState } from "react";
import { Btn, Empty, Fld, Icon, Pos9, Seg, Sel, Stepper, Well, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { api2, assetUrl, fileToBase64, type FxOverlay } from "@/lib/api";
import { STICKER_CATS, STICKER_LIST, stickerUrl, type StickerCat } from "@/lib/stickers";
import { durMs } from "@/lib/time";
import { useStudio } from "@/components/step3/store";
import { EditShell, Grid2, IcBtn, Lbl, Row, Sec, TagRow, catalog, useAdders } from "./common";

type Source = "lib" | "mine" | "mascot";
type ShowAt = "whole" | "first" | "last" | "cur";
const CAT_SHOWN = 9;
const SAFE = 0.05;
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
      <EditShell id="sticker">
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
  /** ช่อง 3×3 ที่ชิ้นอยู่ (ชิดขอบปลอดภัย/กลาง) · null = จัดเอง */
  const pos9Of = (x: FxOverlay): number | null => {
    const hw = x.width / 2;
    const hh = heightOf(x) / 2;
    const col = Math.abs(x.x - (SAFE + hw)) < 0.02 ? 0 : Math.abs(x.x - 0.5) < 0.02 ? 1 : Math.abs(x.x - (1 - SAFE - hw)) < 0.02 ? 2 : -1;
    const row = Math.abs(x.y - (SAFE + hh)) < 0.02 ? 0 : Math.abs(x.y - 0.5) < 0.02 ? 1 : Math.abs(x.y - (1 - SAFE - hh)) < 0.02 ? 2 : -1;
    return col < 0 || row < 0 ? null : row * 3 + col;
  };
  const setPos9 = (i: number) => {
    if (!o) return;
    const hw = o.width / 2;
    const hh = heightOf(o) / 2;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = col === 0 ? SAFE + hw : col === 2 ? 1 - SAFE - hw : 0.5;
    const y = row === 0 ? SAFE + hh : row === 2 ? 1 - SAFE - hh : 0.5;
    patch({ x: A.r3(A.clamp01(x)), y: A.r3(A.clamp01(y)) });
  };

  // แสดงตอน — ภาพซ้อนผูกกับ (คลิป, วินาทีในคลิป) · "ทั้งเรื่อง" = เกาะช็อตแรกแล้วยาวเท่าหนัง
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
      s.flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — กดไทล์เพื่อวางที่หัวเล่น`);
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
  const tile = { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, padding: "8px 4px 6px", position: "relative" as const };

  return (
    <EditShell
      id="sticker"
      revert={s.fx.revert}
      right={
        o ? (
          <>
            <Lbl>ตำแหน่ง</Lbl>
            <Pos9 value={pos9Of(o)} onChange={setPos9} title="ชิดขอบปลอดภัย · ลากบนจอตัวอย่างได้ด้วย" />
            <Row label="กว้าง">
              <Stepper value={Math.round(o.width * 100)} min={2} max={150} step={5} unit="%" onChange={(v) => patch({ width: A.r3(v / 100) })} />
            </Row>
            <Row label="ทึบ">
              <Stepper value={Math.round(o.opacity * 100)} min={0} max={100} step={10} unit="%" onChange={(v) => patch({ opacity: v / 100 })} />
            </Row>
          </>
        ) : undefined
      }
    >
      <Seg<Source>
        items={[
          { v: "lib", label: `คลัง ${STICKER_LIST.length}` },
          { v: "mine", label: `ของฉัน ${mine.length}` },
          { v: "mascot", label: `มาสคอต ${mascots.length}`, title: "วิดีโอโปร่งใส (MOV ProRes 4444) ในคลัง" },
        ]}
        value={src}
        onChange={setSrc}
      />
      {src === "lib" && (
        <>
          <TagRow>
            <div style={{ flex: 1 }}>
              <Seg sm cols={3} items={cats.map((c) => ({ v: c.key, label: c.label }))} value={cat} onChange={setCat} />
            </div>
            {!allCats && (
              <Btn sm ghost onClick={() => setAllCats(true)}>
                +{STICKER_CATS.length - CAT_SHOWN}
              </Btn>
            )}
          </TagRow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
            {tiles.map((x) => (
              <Well key={x.file} sel={o?.file === x.file} onClick={() => A.addStickerSampleAt(s.playhead, x)} title={`${x.label} — วางที่หัวเล่น${inLib.has(x.file) ? " (อยู่ในคลังแล้ว)" : ""}`} style={tile}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stickerUrl(x.file)} alt={x.label} style={{ width: 44, height: 44, objectFit: "contain" }} loading="lazy" />
                <Lbl style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{x.label}</Lbl>
              </Well>
            ))}
          </div>
          <Lbl>ทุกแบบมี “ท่า” มาให้ — แบดจ์เกาะมุมขวาบน · แถบนอนล่างซ้าย</Lbl>
        </>
      )}
      {src !== "lib" &&
        ((src === "mine" ? mine : mascots).length === 0 ? (
          <Empty>{src === "mine" ? "ยังไม่มีไฟล์ของคุณในคลัง — อัปโหลด PNG/WEBP/JPG ข้างล่าง" : "ยังไม่มีมาสคอต — อัปโหลด MOV ProRes 4444 (อัลฟา) ข้างล่าง"}</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
            {(src === "mine" ? mine : mascots).map((a) => (
              <Well key={a.file} sel={o?.file === a.file} onClick={() => A.addStickerAt(s.playhead, a.file)} title={`${a.file} (${a.w}×${a.h}) — กดวางที่หัวเล่น`} style={tile}>
                {isVideo(a.kind, a.file) ? (
                  <video src={assetUrl(a.file)} muted playsInline preload="metadata" style={{ width: 44, height: 44, objectFit: "contain" }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(a.file)} alt={a.file} style={{ width: 44, height: 44, objectFit: "contain" }} loading="lazy" />
                )}
                <Lbl style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{a.file}</Lbl>
                <span style={{ position: "absolute", right: 0, top: 0 }}>
                  <IcBtn name="trash" onClick={(e) => { e.stopPropagation(); del(a.file); }} title="ลบออกจากคลัง" />
                </span>
              </Well>
            ))}
          </div>
        ))}

      {/* ── ชิ้นที่วางอยู่ ── */}
      {overlays.length > 0 && (
        <>
          <Sec title={`วางแล้ว · ${overlays.length}`} note="กดเพื่อเลือกแล้วแก้" />
          <div className="rows" style={{ display: "flex", flexDirection: "column", maxHeight: 140, overflowY: "auto", flexShrink: 0 }}>
            {overlays.map((x, i) => {
              const b = s.layers.sticker.find((k) => k.idx === i);
              return (
                <div key={`${x.file}-${i}`} className={cx("cursor-pointer", i === focusIdx && "sel-ring")} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto 34px", gap: 10, alignItems: "center", padding: "4px 4px", opacity: b?.orphan ? 0.5 : 1 }} onClick={() => { s.setFocus({ kind: "sticker", idx: i }); if (b && !b.orphan) s.seek(b.tl); }}>
                  <Icon name="sticker" size={13} color={b?.orphan ? "var(--danger)" : i === focusIdx ? "var(--amber)" : "var(--muted)"} />
                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{STICKER_LIST.find((y) => y.file === x.file)?.label ?? x.file}</span>
                  <span className="muted small num">{b && !b.orphan ? `${durMs(b.tl)}–${durMs(b.tl + x.dur)}` : "กำพร้า"}</span>
                  <IcBtn name="x" onClick={(e) => { e.stopPropagation(); s.removeLayerItem("sticker", i); }} title="เอาชิ้นนี้ออก" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {o && (
        <>
          <Lbl>แสดงตอน{blk && !blk.orphan ? ` · ${durMs(blk.tl)}–${durMs(blk.tl + o.dur)}` : ""}</Lbl>
          <Seg<ShowAt>
            sm
            items={[
              { v: "whole", label: "ทั้งเรื่อง", title: "เกาะช็อตแรก ยาวเท่าหนัง" },
              { v: "first", label: "ช็อตแรก" },
              { v: "last", label: "ช็อตสุดท้าย" },
              { v: "cur", label: "ช็อตที่ดูอยู่", title: cur ? `${cur.name} · ${cur.dur.toFixed(1)} วิ` : "" },
            ]}
            value={showAt(o)}
            onChange={setShowAt}
          />
          <Grid2>
            <Row label="เข้า (วิ)">
              <Stepper value={o.in} min={0} max={3} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ in: v })} />
            </Row>
            <Row label="ออก (วิ)">
              <Stepper value={o.out} min={0} max={3} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ out: v })} />
            </Row>
            <Row label="ยาว (วิ)">
              <Stepper value={o.dur} min={0.2} max={Math.max(1, s.total)} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => patch({ dur: Math.max(0.2, v) })} />
            </Row>
            <Row label="หมุน (องศา)">
              <Stepper value={o.angle} min={-180} max={180} step={5} onChange={(v) => patch({ angle: v })} />
            </Row>
            <Fld label="แอนิเมชัน">
              <Sel value={o.anim} onChange={(v) => patch({ anim: v })} options={anims.map(([k, label]) => ({ v: k, label: k === label ? k : `${k} · ${label}` }))} />
            </Fld>
          </Grid2>
          <Lbl>ลากบนจอตัวอย่างได้ · จุดมุม = ย่อขยาย · ก้านบน = หมุน</Lbl>
        </>
      )}

      <div style={{ flex: 1 }} />
      <Well dashed onClick={() => fileRef.current?.click()} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} title="เลือกไฟล์จากเครื่อง">
        <Icon name="upload" size={14} color="var(--amber)" />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13 }}>อัปโหลดของตัวเอง</span>
          <Lbl style={{ fontSize: 11 }}>PNG · WEBP · JPG · MOV ProRes 4444 ≤ 40 MB — .webm อัลฟาใช้ไม่ได้</Lbl>
        </span>
      </Well>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.mov,.mp4,.m4v" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <TagRow>
        <Btn sm onClick={() => ai("sticker")} disabled={running} title="ให้ AI เสนอสติกเกอร์ 3–5 จุด (review --task sticker)">
          <Icon name="spark" size={12} />
          AI วางสติกเกอร์ให้
        </Btn>
        <Btn sm onClick={() => ai("sfx")} disabled={running} title="ให้ AI วางเสียงสั้นตรงรอยตัด (review --task sfx)">
          <Icon name="spark" size={12} />
          AI วางเสียงสั้น
        </Btn>
        {running && eng.lastStep === "review" && <Lbl>กำลังดู…</Lbl>}
      </TagRow>
      {d.overlay.missing.length > 0 && <Lbl style={{ color: "var(--danger)" }}>ไฟล์หาย: {d.overlay.missing.join(", ")}</Lbl>}
    </EditShell>
  );
}
