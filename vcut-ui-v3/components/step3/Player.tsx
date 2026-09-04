"use client";

// จอตัวอย่าง + transport + เลน ของขั้น ③ — คอลัมน์กลางของทุกหน้าใน ③
//
//   <Player mode="final"    />  เล่นไฟล์ที่ส่งออกแล้ว (③/④/⑤ เลือกด้วยคีย์ ถ้ามีมากกว่าหนึ่ง)
//   <Player mode="timeline" />  สตรีมสดตามลำดับที่จัดอยู่ (ยังไม่บันทึกก็เห็น) — ต้องมีชิ้นที่ตัดแล้ว
//   <Player mode="clip"     />  คลิปดิบหนึ่งไฟล์ ณ วินาทีที่กำหนด
//
// ชั้นซ้อน (ข้อความ · สติกเกอร์ · รูปทรง · ซับ) วาดจาก draft ที่ studio ถืออยู่ ณ หัวเล่น
// ตัวเลขชุดเดียวกับที่ ffmpeg จะเผาตอน render — ลากได้เมื่อชั้นนั้นถูก focus อยู่
// (port จาก vcut-ui/components/Preview.tsx · หน้าตาเป็นภาษา C)

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { assetUrl, type CaptionCue, type FxClip, type FxOverlay, type FxShape, type FxTextItem, type OutKind } from "@/lib/api";
import { GRADE_STEPS, gradeFilter, gradeFilterId } from "@/lib/grade";
import { applyCount, countValue, formatCount, usesCount, wordStates } from "@/lib/textfx";
import { assPathToSvg, glowLayers, shapePath } from "@/lib/shapes";
import { tc } from "@/lib/time";
import type { LayerKind } from "@/lib/layers";
import { Btn, Keys, Kv, Seg7, Tag, Well, cx } from "@/components/instrument";
import { useRoute } from "@/hooks/route";
import { useStudio, type OverlayData } from "./store";

export type PlayerMode = "final" | "timeline" | "clip";
export type StageKind = "text" | "sticker" | "shape";
type DragMode = "move" | "resize" | "rotate";

// ความละเอียดอ้างอิงของสไตล์ข้อความ — ass ใช้ PlayResY เท่าความสูงหนังจริง
const REF_H = 1920;
const SNAP_PX = 7; // ระยะที่ถือว่า "ชิด" แล้วดูดเข้าหาแนว
const SAFE = 0.05; // ขอบปลอดภัยชั้นนอก (title-safe 90%)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** สิ่งที่จำไว้ตอนเริ่มลาก — ทุกก้าวคิดจากค่าตั้งต้นนี้ ไม่ใช่สะสมทีละ delta */
interface Drag {
  mode: DragMode;
  kind: StageKind;
  idx: number;
  px: number;
  py: number;
  x0: number;
  y0: number;
  w0: number;
  a0: number;
  ew: number;
  eh: number;
}

const CORNERS = [
  { k: "nw", x: 0, y: 0, cur: "nwse-resize" },
  { k: "ne", x: 1, y: 0, cur: "nesw-resize" },
  { k: "se", x: 1, y: 1, cur: "nwse-resize" },
  { k: "sw", x: 0, y: 1, cur: "nesw-resize" },
] as const;

/** ตำแหน่ง anchor ตามเลข align แบบ ass (numpad: 1=ล่างซ้าย … 9=บนขวา) */
function anchor(align: number): { tx: string; ty: string } {
  const col = (align - 1) % 3;
  const tx = col === 0 ? "0%" : col === 1 ? "-50%" : "-100%";
  const ty = align <= 3 ? "-100%" : align <= 6 ? "-50%" : "0%";
  return { tx, ty };
}

function fadeOpacity(p: number, q: number, tin: number, tout: number): number {
  let o = 1;
  if (tin > 0) o = Math.min(o, p / tin);
  if (tout > 0) o = Math.min(o, q / tout);
  return Math.max(0, Math.min(1, o));
}

function outlineShadow(px: number, color: string): string {
  const rr = Math.max(px, 0.5);
  return [
    `${rr}px 0 ${color}`, `-${rr}px 0 ${color}`, `0 ${rr}px ${color}`, `0 -${rr}px ${color}`,
    `${rr * 0.7}px ${rr * 0.7}px ${color}`, `-${rr * 0.7}px ${rr * 0.7}px ${color}`,
    `${rr * 0.7}px -${rr * 0.7}px ${color}`, `-${rr * 0.7}px -${rr * 0.7}px ${color}`,
  ].join(", ");
}

/** เนื้อข้อความ ณ เวลาที่หัวเล่นอยู่ — แทนตัวเลขที่นับขึ้น แล้วซอยเป็นคำถ้าเป็นแอนิเมชันทีละคำ */
function Body({ raw, t, p, whole }: { raw: string; t: FxTextItem; p: number; whole: boolean }) {
  const kind = String(t.count || "");
  let txt = raw;
  if (kind && usesCount(t.text, t.lines as { text?: string }[])) {
    const v = countValue(t.dur > 0 ? p / t.dur : 1, t.count_from, t.count_to);
    txt = applyCount(raw, formatCount(v, kind), whole);
  }
  const ws = wordStates(txt, t.anim, p, t.in, t.dur, t.out);
  if (!ws) return <>{txt}</>;
  return (
    <>
      {ws.map((s, i) => (
        <span key={i} style={{ opacity: s.o, display: "inline-block", transform: s.s === 1 ? undefined : `scale(${s.s.toFixed(3)})` }}>
          {s.w}
          {i < ws.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

const selOutline = (sel: boolean, edit: boolean) =>
  sel ? "1.5px solid var(--amber)" : edit ? "1px dashed rgba(255,255,255,0.35)" : undefined;

function TextOv({ t, ph, tl, W, H, refH, edit, sel, onDown }: {
  t: FxTextItem; ph: number; tl: number; W: number; H: number; refH: number; edit: boolean; sel: boolean;
  onDown: (mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  const s = H / refH;
  const p = ph - tl;
  const q = tl + t.dur - ph;
  const { tx, ty } = anchor(t.align || 5);
  const wordAnim = t.anim === "pop_words" || t.anim === "fade_words";
  const rise = t.anim === "rise" ? (1 - Math.min(1, p / Math.max(t.in, 0.05))) * 26 * s : 0;
  const style: CSSProperties = {
    position: "absolute",
    left: t.x * W,
    top: t.y * H + rise,
    transform: `translate(${tx}, ${ty}) rotate(${t.angle || 0}deg)`,
    fontSize: t.size * s,
    fontFamily: `'${t.font}', var(--font-mitr), sans-serif`,
    color: t.color,
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? "italic" : "normal",
    letterSpacing: (t.spacing || 0) * s,
    textShadow: outlineShadow((t.border || 0) * s, t.outline),
    // แบบทีละคำจัดการความทึบเองรายคำแล้ว — จางทั้งก้อนซ้ำจะกลบจังหวะไล่คำ
    opacity: edit ? Math.max(fadeOpacity(p, q, wordAnim ? 0 : t.in, t.out), 0.35) : fadeOpacity(p, q, wordAnim ? 0 : t.in, t.out),
    whiteSpace: "pre",
    textAlign: "center",
    lineHeight: 1.25,
    ...(t.plate ? { background: "rgba(10,13,17,0.72)", padding: `${0.18 * t.size * s}px ${0.4 * t.size * s}px`, borderRadius: 8 * s } : {}),
    pointerEvents: edit ? "auto" : "none",
    cursor: edit ? "move" : "default",
    outline: selOutline(sel, edit),
    outlineOffset: 2,
  };
  const lines = (t.lines as Partial<FxTextItem>[] | undefined) ?? [];
  return (
    <div data-ov="text" style={style} onPointerDown={(e) => edit && onDown("move", e)}>
      <div>
        <Body raw={t.text} t={t} p={p} whole={!lines.length} />
      </div>
      {lines.map((ln, i) => (
        <div
          key={i}
          style={{
            fontSize: (ln.size ?? t.size) * s,
            color: ln.color ?? t.color,
            fontWeight: ln.bold ? 700 : 400,
            textShadow: outlineShadow((ln.border ?? t.border ?? 0) * s, ln.outline ?? t.outline),
          }}
        >
          <Body raw={String(ln.text ?? "")} t={t} p={p} whole={false} />
        </div>
      ))}
    </div>
  );
}

/** id ของฟิลเตอร์กระตุก — แยกตามความแรง เพราะระยะเลื่อนช่องสีต่างกัน */
const shiftId = (px: number) => `vcut-shift-${px}`;

/** ภาพกระตุกตอนนี้ติดอยู่ไหม — ประตูเวลาสูตรเดียวกับ fx.seg_vfilter() ของเอนจิน */
function glitchNow(f: FxClip | null, tInShot: number) {
  const g = f?.glitch ?? 0;
  if (g <= 1e-6) return 0;
  const period = 1 / (f?.glitch_hz || 1.4);
  const on = Math.min(0.1, period * 0.28);
  return tInShot % period < on ? Math.round(28 * g) : 0;
}

/** ประกาศฟิลเตอร์โทนสี/กระตุกครั้งเดียว — <svg> ขนาดศูนย์ให้ url(#…) อ้างถึง */
function GradeDefs() {
  return (
    <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        {Object.entries(GRADE_STEPS).map(([name, steps]) => (
          <filter key={name} id={gradeFilterId(name)} colorInterpolationFilters="sRGB">
            {steps.map((st, i) =>
              st.matrix ? (
                <feColorMatrix key={i} type="matrix" values={st.matrix.join(" ")} />
              ) : st.saturate !== undefined ? (
                <feColorMatrix key={i} type="saturate" values={String(st.saturate)} />
              ) : (
                <feComponentTransfer key={i}>
                  <feFuncR type="gamma" exponent={st.gamma} />
                  <feFuncG type="gamma" exponent={st.gamma} />
                  <feFuncB type="gamma" exponent={st.gamma} />
                </feComponentTransfer>
              ),
            )}
          </filter>
        ))}
        {[8, 11, 14, 17, 20, 22, 25, 28].map((px) => (
          <filter key={px} id={shiftId(px)} colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={-px} dy={0} result="rm" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feOffset in="b" dx={px} dy={0} result="bm" />
            <feComposite in="rm" in2="g" operator="arithmetic" k2={1} k3={1} result="rg" />
            <feComposite in="rg" in2="bm" operator="arithmetic" k2={1} k3={1} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** รูปทรงทั้งชั้นในผืนเดียว — viewBox เป็นพิกเซลของหนังจริง */
function ShapeLayer({ items, ph, fw, fh, W, H, edit, focusIdx, onDown }: {
  items: { item: FxShape; tl: number; idx: number }[]; ph: number; fw: number; fh: number; W: number; H: number;
  edit: boolean; focusIdx: number | null; onDown: (idx: number, mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  if (!items.length) return null;
  return (
    <svg viewBox={`0 0 ${fw} ${fh}`} width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      {items.map(({ item: sh, tl, idx }) => {
        const p = ph - tl;
        const q = tl + sh.dur - ph;
        const fade = sh.anim === "none" ? 1 : fadeOpacity(p, q, sh.in, sh.out);
        const pop =
          sh.anim === "pop" && sh.in > 0 && p < sh.in
            ? 0.72 + 0.38 * Math.min(1, p / sh.in) - 0.1 * Math.max(0, 1 - Math.abs(p / sh.in - 0.75) * 4)
            : 1;
        const tf = `translate(${sh.x * fw} ${sh.y * fh}) rotate(${-(sh.angle || 0)})` + (pop === 1 ? "" : ` scale(${pop})`);
        const d = assPathToSvg(shapePath(sh.kind, sh.size, sh.thick));
        return (
          <g
            key={idx}
            transform={tf}
            opacity={edit || focusIdx === idx ? Math.max(fade, 0.4) : fade}
            style={{ pointerEvents: edit ? "auto" : "none", cursor: edit ? "move" : "default" }}
            onPointerDown={(e) => edit && onDown(idx, "move", e)}
          >
            {glowLayers(sh.kind, sh.size, sh.thick, sh.glow ?? 0, fw, fh).map((g, k) => (
              <path key={`g${k}`} d={d} fill={sh.color} stroke={sh.color} strokeWidth={g.bord * 2} paintOrder="stroke" strokeLinejoin="round" opacity={g.op} style={{ filter: `blur(${g.blur}px)` }} />
            ))}
            <path d={d} fill={sh.color} stroke={sh.border > 0 ? sh.outline : "none"} strokeWidth={sh.border * 2} paintOrder="stroke" strokeLinejoin="round" />
            {focusIdx === idx && <path d={d} fill="none" stroke="var(--amber)" strokeWidth={Math.max(2, fw / 500)} vectorEffect="non-scaling-stroke" />}
          </g>
        );
      })}
    </svg>
  );
}

function StickerOv({ o, kind, ph, tl, W, H, edit, sel, onDown }: {
  o: FxOverlay; kind: string; ph: number; tl: number; W: number; H: number; edit: boolean; sel: boolean;
  onDown: (mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  const p = ph - tl;
  const q = tl + o.dur - ph;
  const op = (o.opacity ?? 1) * (o.anim === "none" ? 1 : fadeOpacity(p, q, o.in, o.out));
  const media: CSSProperties = { display: "block", width: "100%", opacity: edit ? Math.max(op, 0.35) : op };
  const handle: CSSProperties = { position: "absolute", width: 9, height: 9, background: "var(--amber)", border: "1px solid var(--bg)" };
  return (
    <div
      data-ov="sticker"
      onPointerDown={(e) => edit && onDown("move", e)}
      style={{
        position: "absolute",
        left: o.x * W,
        top: o.y * H,
        width: o.width * W,
        transform: `translate(-50%, -50%) rotate(${o.angle || 0}deg)`,
        pointerEvents: edit ? "auto" : "none",
        cursor: edit ? "move" : "default",
        outline: selOutline(sel, edit),
        outlineOffset: 3,
      }}
    >
      {kind === "video" ? (
        <video src={assetUrl(o.file)} muted playsInline preload="metadata" style={media} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(o.file)} alt={o.file} draggable={false} style={media} />
      )}
      {edit && sel && (
        <>
          {CORNERS.map((c) => (
            <div
              key={c.k}
              onPointerDown={(e) => {
                e.stopPropagation();
                onDown("resize", e);
              }}
              style={{ ...handle, left: `${c.x * 100}%`, top: `${c.y * 100}%`, marginLeft: -5, marginTop: -5, cursor: c.cur }}
            />
          ))}
          <div style={{ position: "absolute", left: "50%", top: -24, width: 1, height: 18, marginLeft: -0.5, background: "var(--amber)" }} />
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onDown("rotate", e);
            }}
            title="ลากเพื่อหมุน (Shift = ทีละ 15°)"
            style={{ ...handle, left: "50%", top: -34, width: 12, height: 12, marginLeft: -6, borderRadius: 999, cursor: "grab" }}
          />
        </>
      )}
    </div>
  );
}

function CueOv({ c, W, H, refH }: { c: CaptionCue; W: number; H: number; refH: number }) {
  const s = H / refH;
  const st = c.style;
  return (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        bottom: (st.margin_v ?? 60) * s,
        transform: "translateX(-50%)",
        fontSize: (st.size ?? 54) * s,
        fontFamily: `'${st.font}', var(--font-mitr), sans-serif`,
        color: st.color,
        fontWeight: st.bold ? 700 : 400,
        textShadow: outlineShadow((st.border ?? 3) * s, st.outline),
        whiteSpace: "pre-wrap",
        textAlign: "center",
        maxWidth: W * 0.9,
        lineHeight: 1.3,
      }}
    >
      {c.text}
    </div>
  );
}

// ─────────────────────────── เวที 9:16 ───────────────────────────

/** <video> ตัวเดียวของขั้น ③ — แยกเป็นคอมโพเนนต์เล็กเพื่อให้ ref ของ store ไปอยู่ที่นี่
 *  ที่เดียว (ตัววิเคราะห์ของ React ถือว่าทุกอย่างที่อ่านหลังจับ ref เป็นการอ่าน ref) */
function StudioVideo({ edit, style }: { edit: boolean; style: CSSProperties }) {
  const { bindVideo, setFocus, toggle } = useStudio();
  return (
    <video
      ref={bindVideo}
      playsInline
      preload="auto"
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", ...style }}
      onClick={() => (edit ? setFocus(null) : toggle())}
    />
  );
}

/** จอตัวอย่าง — <video> ของ studio + ชั้นซ้อน ณ หัวเล่น · ลากได้เมื่อชั้นนั้น focus อยู่ */
export function Stage({ showOverlays = true, message }: { showOverlays?: boolean; message?: ReactNode }) {
  const s = useStudio();
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guide, setGuide] = useState<{ vx?: number; hy?: number }>({});
  const [readout, setReadout] = useState("");
  const [dims, setDims] = useState({ bw: 0, bh: 0 });

  // ขนาดที่วางได้ — กรอบหนังใหญ่สุดที่ยังพอดีเวที
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const upd = () => setDims({ bw: el.clientWidth, bh: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fw = s.frame.w;
  const fh = s.frame.h;
  let W = 0;
  let H = 0;
  if (dims.bw > 0 && dims.bh > 0) {
    const k = Math.min(dims.bw / fw, dims.bh / fh);
    W = Math.floor(fw * k);
    H = Math.floor(fh * k);
  }
  const refH = fh || REF_H;
  const ph = s.playhead;
  const overlay: OverlayData = s.overlay;
  const clipFx = s.playheadFx;
  const clipAt = s.playheadAt;
  const focus = s.focus;
  const editKind: StageKind | null = focus && (focus.kind === "text" || focus.kind === "sticker" || focus.kind === "shape") ? focus.kind : null;

  /** กล้อง (ซูม/ไถล) + สี + กระตุก + เบลอหัว-ท้าย ของเฟรมที่กำลังโชว์ — สูตรเดียวกับ fx._zoom_pair */
  const camCss = useMemo(() => {
    const f = clipFx;
    const p = clipAt?.p ?? 0;
    if (!f) return { transform: undefined as string | undefined, filter: "" };
    const z0 = f.zoom || 1;
    let z1 = f.zoom_to || 0;
    if (z1 <= 1e-6) z1 = z0;
    else if (z1 < 1) z1 = 1;
    const room = Math.max(z0, z1) > 1 + 1e-6;
    const panning = room && !!f.pan;
    const z = room ? z0 + (z1 - z0) * p : 1;
    const room01 = Math.max(0, (z - 1) / 2);
    let tx = 0;
    let ty = 0;
    if (panning) {
      if (f.pan === "r") tx = -room01 * (2 * p - 1);
      else if (f.pan === "l") tx = -room01 * (1 - 2 * p);
      else if (f.pan === "d") ty = -room01 * (2 * p - 1);
      else if (f.pan === "u") ty = -room01 * (1 - 2 * p);
    }
    const parts: string[] = [];
    if (z > 1 + 1e-6) parts.push(`scale(${z.toFixed(4)})`);
    if (tx || ty) parts.push(`translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%)`);
    const fil: string[] = [];
    const grade = gradeFilter(f.grade);
    if (grade) fil.push(grade);
    const px = glitchNow(f, p * (clipAt?.dur ?? 0));
    if (px) fil.push(`url(#${shiftId(px)})`);
    const wp = f.whip || 0;
    if (wp > 1e-6 && clipAt) {
      const d = Math.min(0.12, (clipAt.dur || 1) / 3);
      const tt = p * (clipAt.dur || 0);
      if (tt < d || tt > (clipAt.dur || 0) - d) fil.push(`blur(${(18 * wp * (W > 0 ? W / 1080 : 1)).toFixed(2)}px)`);
    }
    return { transform: parts.join(" ") || undefined, filter: fil.join(" ") };
  }, [clipFx, clipAt, W]);

  // (ความเร็ว/เสียงรายชิ้นสั่งที่ตัวเล่นจาก store — ที่นี่วาดอย่างเดียว)
  const active = useMemo(
    () => ({
      texts: overlay.texts.filter(({ item, tl }) => ph >= tl && ph < tl + item.dur),
      stickers: overlay.stickers.filter(({ item, tl }) => ph >= tl && ph < tl + item.dur),
      shapes: overlay.shapes.filter(({ item, tl }) => ph >= tl && ph < tl + item.dur),
      cue: overlay.cues.find((c) => ph >= c.a && ph < c.b) ?? null,
    }),
    [overlay, ph],
  );

  // ── ลาก/ย่อขยาย/หมุน — คิดเป็น "สัดส่วนของเฟรม" ตั้งแต่ต้น ตัวเลขชุดเดียวกับ ffmpeg ──
  const startDrag = useCallback(
    (kind: StageKind, idx: number, mode: DragMode, e: ReactPointerEvent<Element>) => {
      const box = e.currentTarget.closest("[data-ov]");
      const el = (box ?? e.currentTarget) as Partial<HTMLElement>;
      const item =
        kind === "sticker"
          ? overlay.stickers.find((x) => x.idx === idx)?.item
          : kind === "shape"
            ? overlay.shapes.find((x) => x.idx === idx)?.item
            : overlay.texts.find((x) => x.idx === idx)?.item;
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* บางเหตุการณ์จับไม่ได้ — ลากในกรอบยังทำงาน */
      }
      s.setFocus({ kind, idx });
      drag.current = {
        mode, kind, idx, px: e.clientX, py: e.clientY, x0: item.x, y0: item.y,
        w0: kind === "sticker" ? (item as FxOverlay).width : 0, a0: item.angle || 0,
        ew: el.offsetWidth ?? 0, eh: el.offsetHeight ?? 0,
      };
    },
    [overlay, s],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const rect = frameRef.current?.getBoundingClientRect();
      if (!d || !rect || W <= 0) return;
      const patch = d.kind === "sticker" ? s.patchOverlayAt : d.kind === "shape" ? s.patchShapeAt : s.patchTextAt;
      if (d.mode === "move") {
        let nx = d.x0 + (e.clientX - d.px) / W;
        let ny = d.y0 + (e.clientY - d.py) / H;
        const g: { vx?: number; hy?: number } = {};
        if (!e.altKey) {
          const hw = d.kind === "sticker" ? d.ew / 2 / W : 0;
          const hh = d.kind === "sticker" ? d.eh / 2 / H : 0;
          const xs: [number, number][] = [[0.5, 0.5], [hw, 0], [1 - hw, 1], [SAFE + hw, SAFE], [1 - SAFE - hw, 1 - SAFE]];
          const ys: [number, number][] = [[0.5, 0.5], [hh, 0], [1 - hh, 1], [SAFE + hh, SAFE], [1 - SAFE - hh, 1 - SAFE]];
          for (const [target, line] of xs) if (Math.abs(nx - target) * W < SNAP_PX) { nx = target; g.vx = line * W; break; }
          for (const [target, line] of ys) if (Math.abs(ny - target) * H < SNAP_PX) { ny = target; g.hy = line * H; break; }
        }
        setGuide(g);
        patch(d.idx, { x: r3(clamp01(nx)), y: r3(clamp01(ny)) });
        setReadout(`x ${r3(clamp01(nx)).toFixed(3)} · y ${r3(clamp01(ny)).toFixed(3)}`);
        return;
      }
      const cx0 = rect.left + d.x0 * W;
      const cy0 = rect.top + d.y0 * H;
      if (d.mode === "resize" && d.kind === "sticker") {
        const a = (-d.a0 * Math.PI) / 180;
        const dx = e.clientX - cx0;
        const dy = e.clientY - cy0;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        const k = Math.max(Math.abs(lx) / Math.max(d.ew / 2, 1), Math.abs(ly) / Math.max(d.eh / 2, 1));
        const nw = Math.min(2, Math.max(0.02, d.w0 * k));
        setGuide({});
        s.patchOverlayAt(d.idx, { width: r3(nw) });
        setReadout(`w ${(nw * 100).toFixed(1)}%`);
        return;
      }
      if (d.mode === "rotate") {
        let ang = (Math.atan2(e.clientY - cy0, e.clientX - cx0) * 180) / Math.PI + 90;
        ang = ((ang + 180) % 360) - 180;
        if (e.shiftKey) ang = Math.round(ang / 15) * 15;
        else if (Math.abs(ang) < 3) ang = 0;
        setGuide({});
        patch(d.idx, { angle: Math.round(ang * 10) / 10 });
        setReadout(`หมุน ${(Math.round(ang * 10) / 10).toFixed(1)}°`);
      }
    },
    [W, H, s],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    setGuide({});
    setReadout("");
  }, []);

  const edit = editKind !== null;
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
      <div
        ref={frameRef}
        style={{ position: "relative", width: W || "100%", height: H || "100%", background: "#000", borderRadius: 4, overflow: "hidden", boxShadow: "0 0 0 1px var(--edge)" }}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <StudioVideo edit={edit} style={{ transform: camCss.transform, filter: camCss.filter || undefined }} />
        <GradeDefs />
        {clipFx && (clipFx.split === "v" || clipFx.split === "h") && clipFx.split_with && W > 0 && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div style={{ position: "absolute", background: "var(--amber)", opacity: 0.7, ...(clipFx.split === "v" ? { left: 0, right: 0, top: "50%", height: 2 } : { top: 0, bottom: 0, left: "50%", width: 2 }) }} />
            <div className="mono" style={{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--ink)", background: "rgba(0,0,0,.55)", textAlign: "center", ...(clipFx.split === "v" ? { left: 0, right: 0, top: "50%", bottom: 0 } : { top: 0, bottom: 0, left: "50%", right: 0 }) }}>
              {clipFx.split_with} @{(clipFx.split_at ?? 0).toFixed(1)}s · เห็นของจริงในไฟล์
            </div>
          </div>
        )}
        {showOverlays && W > 0 && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <ShapeLayer items={active.shapes.filter((x) => x.item.behind)} ph={ph} fw={fw} fh={fh} W={W} H={H} edit={editKind === "shape"} focusIdx={focus?.kind === "shape" ? focus.idx : null} onDown={(idx, m, e) => startDrag("shape", idx, m, e)} />
            {active.texts.map(({ item, tl, idx }) => (
              <TextOv key={`t${idx}`} t={item} ph={ph} tl={tl} W={W} H={H} refH={refH} edit={editKind === "text"} sel={focus?.kind === "text" && focus.idx === idx} onDown={(m, e) => startDrag("text", idx, m, e)} />
            ))}
            {active.stickers.map(({ item, tl, kind, idx }) => (
              <StickerOv key={`s${idx}`} o={item} kind={kind} ph={ph} tl={tl} W={W} H={H} edit={editKind === "sticker"} sel={focus?.kind === "sticker" && focus.idx === idx} onDown={(m, e) => startDrag("sticker", idx, m, e)} />
            ))}
            <ShapeLayer items={active.shapes.filter((x) => !x.item.behind)} ph={ph} fw={fw} fh={fh} W={W} H={H} edit={editKind === "shape"} focusIdx={focus?.kind === "shape" ? focus.idx : null} onDown={(idx, m, e) => startDrag("shape", idx, m, e)} />
            {active.cue && <CueOv c={active.cue} W={W} H={H} refH={refH} />}
          </div>
        )}
        {/* เส้นขอบปลอดภัย + เส้นนำตอนลาก — โชว์เฉพาะตอนแก้ตำแหน่ง */}
        {edit && W > 0 && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: "5%", top: "5%", right: "5%", bottom: "5%", border: "1px dashed rgba(255,255,255,0.22)" }} />
            <div style={{ position: "absolute", left: "10%", top: "10%", right: "10%", bottom: "10%", border: "1px dashed rgba(255,255,255,0.12)" }} />
            {guide.vx !== undefined && <div style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: guide.vx, background: "var(--amber)" }} />}
            {guide.hy !== undefined && <div style={{ position: "absolute", left: 0, right: 0, height: 1, top: guide.hy, background: "var(--amber)" }} />}
            {readout && (
              <Well className="mono" style={{ position: "absolute", left: 8, bottom: 8, padding: "3px 8px", fontSize: 10, color: "var(--amber)" }}>
                {readout}
              </Well>
            )}
          </div>
        )}
        {message && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <Well className="mono" style={{ padding: "6px 12px", fontSize: 11, color: "var(--muted)", textAlign: "center", maxWidth: "80%" }}>
              {message}
            </Well>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── transport ───────────────────────────

const OUT_KEY: { v: OutKind; label: string; step: string }[] = [
  { v: "out", label: "③", step: "ภาพ+เสียง" },
  { v: "text", label: "④", step: "+ ซับ" },
  { v: "fx", label: "⑤", step: "+ ทุกชั้น" },
];

/** แถว TRANSPORT ของ mockup — ◀◀ ▶ ▶▶ · ไทม์ไลน์ ▸ · timecode / total · ขนาด·LUFS·fps */
export function Transport({
  showTimelineBtn = true,
  outKeys,
}: {
  showTimelineBtn?: boolean;
  /** คีย์เลือกไฟล์ ③④⑤ (โหมด final) */
  outKeys?: { items: OutKind[]; value: OutKind; onChange: (k: OutKind) => void };
}) {
  const s = useStudio();
  const rt = useRoute();
  const fpsLabel = Number.isInteger(s.fps) ? String(s.fps) : s.fps.toFixed(2);
  const totalLabel = s.source.mode === "timeline" ? s.total : s.mediaDuration || s.total;

  // ◀◀ ▶▶ = ต้นช็อตก่อนหน้า/ถัดไป (กดครั้งแรกในช็อตที่เดินมาเกิน 1 วิ = กลับต้นช็อตนี้)
  const step = (d: -1 | 1) => {
    const at = s.playheadAt;
    if (!at) return s.seek(0);
    if (d < 0) return s.seek(s.playhead - s.offsets[at.i] > 1 ? s.offsets[at.i] : s.offsets[Math.max(0, at.i - 1)]);
    const n = Math.min(s.shots.length - 1, at.i + 1);
    s.seek(n === at.i ? s.total : s.offsets[n]);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid var(--edge)", flexShrink: 0, flexWrap: "wrap" }}>
      <Btn sm onClick={() => step(-1)} title="ต้นช็อตก่อนหน้า">◀◀</Btn>
      <Btn sm on={s.playing} onClick={s.toggle} title={s.playing ? "หยุด (Space)" : "เล่น (Space)"}>{s.playing ? "❚❚" : "▶"}</Btn>
      <Btn sm onClick={() => step(1)} title="ต้นช็อตถัดไป">▶▶</Btn>
      {showTimelineBtn && rt.edit !== "tl" && (
        <Btn sm onClick={() => rt.openEdit("tl")} title="เปิดไทม์ไลน์เต็ม — สลับ/ตัด/เล็มช็อต">ไทม์ไลน์ ▸</Btn>
      )}
      <Well style={{ padding: "3px 10px" }}>
        <Seg7 size={14}>{tc(s.playhead, s.fps)}</Seg7>
      </Well>
      <Kv className="mono" style={{ whiteSpace: "nowrap" }}>/ {tc(totalLabel, s.fps)}</Kv>
      <div style={{ flex: 1 }} />
      {outKeys && outKeys.items.length > 1 && (
        <Keys
          items={OUT_KEY.filter((k) => outKeys.items.includes(k.v)).map((k) => ({ v: k.v, label: k.label, title: `เล่นไฟล์ ${k.label} ${k.step}` }))}
          value={outKeys.value}
          onChange={outKeys.onChange}
          wrap={false}
        />
      )}
      <Kv className="mono" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
        {s.frame.w}×{s.frame.h} · {s.lufs > 0 ? "" : "−"}{Math.abs(s.lufs).toFixed(1)} LUFS · {fpsLabel} fps
      </Kv>
    </div>
  );
}

// ─────────────────────────── เลน ───────────────────────────

const LANES: { kind: LayerKind; label: string; a: boolean }[] = [
  { kind: "text", label: "TEXT", a: true },
  { kind: "sticker", label: "STKR", a: true },
  { kind: "music", label: "MUSIC", a: false },
  { kind: "caption", label: "SUB", a: false },
];

/** 4 เลนย่อของ mockup (lanes) — บล็อกเป็นสัดส่วนของความยาวรวม · เลนที่ focus อยู่ติดไฟ */
export function LanesStrip() {
  const s = useStudio();
  const total = Math.max(s.total, 0.001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {LANES.map((l) => {
        const blocks = s.layers[l.kind];
        const focused = s.focus?.kind === l.kind || (l.kind === "sticker" && s.focus?.kind === "shape");
        return (
          <div key={l.kind} className="lane">
            <Tag style={{ width: 34 }}>{l.label}</Tag>
            <div
              className="bar"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                const rr = e.currentTarget.getBoundingClientRect();
                s.seek(((e.clientX - rr.left) / rr.width) * s.total);
              }}
              title="คลิกเพื่อเลื่อนหัวเล่น"
            >
              {blocks.map((b) => (
                <span
                  key={`${l.kind}${b.idx}-${b.tl.toFixed(2)}`}
                  className={cx("blk", l.a && "a", focused && b.idx === s.focus?.idx && "on", b.orphan && "orphan")}
                  style={{ left: `${(b.tl / total) * 100}%`, width: `${Math.max((b.dur / total) * 100, 0.4)}%`, opacity: b.orphan ? 0.35 : focused ? 1 : undefined, cursor: b.idx >= 0 ? "pointer" : undefined }}
                  title={b.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (b.idx >= 0) s.setFocus({ kind: l.kind, idx: b.idx });
                    s.seek(b.tl);
                  }}
                />
              ))}
              {/* หัวเล่น */}
              <span style={{ position: "absolute", left: `${(s.playhead / total) * 100}%`, top: -2, width: 1, height: 16, background: "var(--amber)", pointerEvents: "none" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Player ───────────────────────────

export interface PlayerProps {
  mode: PlayerMode;
  /** โหมด final: ไฟล์ขั้นไหนที่อยากเริ่มด้วย (ถ้ามี) — ค่าตั้งต้น = ขั้นสูงสุดที่มีไฟล์ */
  out?: OutKind;
  /** โหมด clip: คลิปดิบ + วินาทีที่จะไปยืน */
  clip?: { name: string; at?: number };
  /** ป้ายสถานะโมโนมุมซ้ายบนของเวที */
  topleft?: ReactNode;
  /** ซ่อนปุ่ม "ไทม์ไลน์ ▸" (หน้าไทม์ไลน์ซ่อนเอง) */
  showTimelineBtn?: boolean;
  /** ซ่อนเลน 4 แถวใต้ transport */
  showLanes?: boolean;
  /** วาดชั้นซ้อนไหม — ค่าตั้งต้น: วาดเมื่อเล่นสด/③ หรือกำลัง focus ชั้นใดชั้นหนึ่ง
   *  (ไฟล์ ④/⑤ เผาของพวกนี้ลงไปแล้ว วาดทับซ้ำจะเห็นสองชั้น) */
  overlays?: boolean;
}

export default function Player({ mode, out, clip, topleft, showTimelineBtn = true, showLanes = true, overlays }: PlayerProps) {
  const s = useStudio();
  const [outSel, setOutSel] = useState<OutKind | null>(null);
  const have = useMemo(() => s.outs.filter((o) => o.exists).map((o) => o.kind), [s.outs]);
  const best: OutKind = have.includes("fx") ? "fx" : have.includes("text") ? "text" : "out";
  const outNow: OutKind = outSel && have.includes(outSel) ? outSel : out && have.includes(out) ? out : best;

  const setSource = s.setSource;
  const clipName = clip?.name;
  const clipAt = clip?.at;
  useEffect(() => {
    if (mode === "final") setSource({ mode: "final", out: outNow });
    else if (mode === "clip" && clipName) setSource({ mode: "clip", name: clipName, at: clipAt });
    else setSource({ mode: "timeline" });
  }, [mode, outNow, clipName, clipAt, setSource]);

  const noFile = mode === "final" && !have.length && s.info !== null;
  const showOv = overlays ?? (mode === "timeline" || (mode === "final" && (outNow === "out" || s.focus !== null)));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, minHeight: 0, position: "relative" }}>
        <Stage showOverlays={showOv} message={noFile ? "ยังไม่มีไฟล์ที่ส่งออก — กดส่งออก (③) ก่อน หรือเปิดไทม์ไลน์เพื่อเล่นสด" : mode === "timeline" && !s.rendered.length ? "ยังไม่มีชิ้นที่ตัดแล้ว — ต่อไฟล์ก่อนถึงจะเล่นสดได้" : undefined} />
        {topleft && (
          <Well className="mono" style={{ position: "absolute", left: 14, top: 14, padding: "3px 8px", fontSize: 10, color: "var(--amber)", maxWidth: "calc(100% - 28px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {topleft}
          </Well>
        )}
      </div>
      <Transport showTimelineBtn={showTimelineBtn} outKeys={mode === "final" ? { items: have, value: outNow, onChange: setOutSel } : undefined} />
      {showLanes && (
        <div style={{ padding: "4px 14px 12px 14px" }}>
          <LanesStrip />
        </div>
      )}
    </div>
  );
}
