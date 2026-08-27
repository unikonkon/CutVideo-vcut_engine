"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Maximize,
  Move,
  Pause,
  Play,
  Proportions,
  RotateCw,
} from "lucide-react";
import { LAYOUT_GROUPS, ratioLabel } from "@/lib/layouts";
import {
  assetUrl,
  type CaptionCue,
  type FxClip,
  type FxOverlay,
  type FxShape,
  type FxTextItem,
} from "@/lib/api";
import { GRADE_STEPS, gradeFilter, gradeFilterId } from "@/lib/grade";
import {
  applyCount,
  countValue,
  formatCount,
  usesCount,
  wordStates,
} from "@/lib/textfx";
import { assPathToSvg, glowLayers, shapePath } from "@/lib/shapes";
import { tc } from "@/lib/time";

const FITS = [
  { v: "contain", label: "Fit" },
  { v: "cover", label: "Fill" },
  { v: "fill", label: "Stretch" },
] as const;

// ความละเอียดอ้างอิงตั้งต้นของสไตล์ข้อความ — ass ใช้ PlayResY เท่าความสูง output
// จริง ดังนั้นถ้า config ตั้งขนาดหนังไว้ ให้สเกลด้วยความสูงนั้นแทน (ส่งผ่าน refH)
const REF_H = 1080;

export interface OverlayData {
  texts: { item: FxTextItem; tl: number; idx: number }[];
  stickers: { item: FxOverlay; tl: number; kind: string; idx: number }[];
  shapes: { item: FxShape; tl: number; idx: number }[];
  cues: CaptionCue[];
}

export type StageKind = "text" | "sticker" | "shape";
type DragMode = "move" | "resize" | "rotate";

/** สิ่งที่จำไว้ตอนเริ่มลาก — ทุกก้าวคิดจากค่าตั้งต้นนี้ ไม่ใช่สะสมทีละ delta
 *  (สะสมแล้วค่าจะเพี้ยนสะสมตามไปด้วยเมื่อโดนหนีบขอบหรือสแนป) */
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

const SNAP_PX = 7;        // ระยะที่ถือว่า "ชิด" แล้วดูดเข้าหาแนว
const SAFE = 0.05;        // ขอบปลอดภัยชั้นนอก (title-safe 90%)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** จุดจับ 4 มุม — อยู่ในกล่องที่หมุนแล้ว จึงหมุนตามชิ้นงานไปเอง */
const CORNERS = [
  { k: "nw", x: 0, y: 0, cur: "nwse-resize" },
  { k: "ne", x: 1, y: 0, cur: "nesw-resize" },
  { k: "se", x: 1, y: 1, cur: "nwse-resize" },
  { k: "sw", x: 0, y: 1, cur: "nesw-resize" },
] as const;

/** ตำแหน่ง anchor ตามเลข align แบบ ass (numpad: 1=ล่างซ้าย … 9=บนขวา) */
function anchor(align: number): { tx: string; ty: string } {
  const col = (align - 1) % 3; // 0 ซ้าย 1 กลาง 2 ขวา
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
  const r = Math.max(px, 0.5);
  return [
    `${r}px 0 ${color}`, `-${r}px 0 ${color}`,
    `0 ${r}px ${color}`, `0 -${r}px ${color}`,
    `${r * 0.7}px ${r * 0.7}px ${color}`, `-${r * 0.7}px ${r * 0.7}px ${color}`,
    `${r * 0.7}px -${r * 0.7}px ${color}`, `-${r * 0.7}px -${r * 0.7}px ${color}`,
  ].join(", ");
}

/**
 *  เนื้อข้อความหนึ่งบรรทัด ณ เวลาที่เส้นหัวเล่นอยู่
 *
 *  รวมสองเรื่องไว้ที่เดียว: แทนตัวเลขที่นับขึ้น แล้วซอยเป็นคำถ้าเป็นแอนิเมชัน
 *  แบบทีละคำ — แยกกันวาดจะได้ข้อความที่นับเลขแล้วแต่ไม่ไล่ทีละคำ (หรือกลับกัน)
 *  เวลาใช้สองอย่างพร้อมกัน
 */
function Body({
  raw,
  t,
  p,
  whole,
}: {
  raw: string;
  t: FxTextItem;
  /** เดินมาถึงวินาทีที่เท่าไรของชิ้น */
  p: number;
  whole: boolean;
}) {
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
        <span
          key={i}
          style={{
            opacity: s.o,
            // ย่อ-ขยายรอบตัวเอง — inline-block ไม่งั้น transform ไม่มีผลกับ span
            display: "inline-block",
            transform: s.s === 1 ? undefined : `scale(${s.s.toFixed(3)})`,
          }}
        >
          {s.w}
          {i < ws.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </>
  );
}

function TextOv({
  t,
  ph,
  tl,
  W,
  H,
  refH,
  edit,
  sel,
  onDown,
}: {
  t: FxTextItem;
  ph: number;
  tl: number;
  W: number;
  H: number;
  refH: number;
  edit: boolean;
  sel: boolean;
  onDown: (mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  const s = H / refH;
  const p = ph - tl;
  const q = tl + t.dur - ph;
  const { tx, ty } = anchor(t.align || 5);
  const wordAnim = t.anim === "pop_words" || t.anim === "fade_words";
  const rise =
    t.anim === "rise" ? (1 - Math.min(1, p / Math.max(t.in, 0.05))) * 26 * s : 0;
  const style: CSSProperties = {
    position: "absolute",
    left: t.x * W,
    top: t.y * H + rise,
    transform: `translate(${tx}, ${ty}) rotate(${t.angle || 0}deg)`,
    fontSize: t.size * s,
    fontFamily: `'${t.font}', var(--font-thai), sans-serif`,
    color: t.color,
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? "italic" : "normal",
    letterSpacing: (t.spacing || 0) * s,
    textShadow: outlineShadow((t.border || 0) * s, t.outline),
    // แบบทีละคำจัดการความทึบเองรายคำแล้ว — จางทั้งก้อนซ้ำจะกลบจังหวะไล่คำจน
    // มองไม่ออก (เอนจินก็ตัด \fad ขาเข้าทิ้งด้วยเหตุผลเดียวกัน ดู anim_tags)
    opacity: edit
      ? Math.max(fadeOpacity(p, q, wordAnim ? 0 : t.in, t.out), 0.35)
      : fadeOpacity(p, q, wordAnim ? 0 : t.in, t.out),
    whiteSpace: "pre",
    textAlign: "center",
    lineHeight: 1.25,
    ...(t.plate
      ? {
          background: "rgba(10,13,17,0.72)",
          padding: `${0.18 * t.size * s}px ${0.4 * t.size * s}px`,
          borderRadius: 8 * s,
        }
      : {}),
    pointerEvents: edit ? "auto" : "none",
    cursor: edit ? "move" : "default",
    outline: sel
      ? "1.5px solid var(--accent)"
      : edit
        ? "1px dashed rgba(255,255,255,0.35)"
        : undefined,
    outlineOffset: 2,
  };
  const lines = (t.lines as Partial<FxTextItem>[] | undefined) ?? [];
  return (
    <div
      data-ov="text"
      style={style}
      onPointerDown={(e) => {
        if (!edit) return;
        onDown("move", e);
      }}
    >
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

/**
 *  ภาพกระตุกตอนนี้ติดอยู่ไหม + เลื่อนช่องสีกี่พิกเซล
 *
 *  ประตูเวลาต้องเป็นสูตรเดียวกับที่ fx.seg_vfilter() เขียนลง enable= เป๊ะ
 *  (`lt(mod(t, 1/hz), min(0.10, period*0.28))`) ไม่งั้นจอตัวอย่างจะกระตุกคนละ
 *  จังหวะกับไฟล์ แล้วคนตั้งค่าจะไล่หาความถี่ที่ "ถูก" จากภาพที่โกหก
 */
function glitchNow(f: FxClip | null, tInShot: number) {
  const g = f?.glitch ?? 0;
  if (g <= 1e-6) return 0;
  const period = 1 / (f?.glitch_hz || 1.4);
  const on = Math.min(0.1, period * 0.28);
  return tInShot % period < on ? Math.round(28 * g) : 0;
}

/** ประกาศฟิลเตอร์โทนสีทั้งชุดครั้งเดียวต่อหน้า — <svg> ขนาดศูนย์ที่ไม่กินที่
 *  และไม่รับคลิก มีไว้ให้ url(#…) ของ CSS filter อ้างถึงได้เท่านั้น */
function GradeDefs() {
  return (
    <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        {Object.entries(GRADE_STEPS).map(([name, steps]) => (
          // sRGB ไม่ใช่ linearRGB (ค่าตั้งต้นของ SVG) — ffmpeg คิดบนค่าที่เก็บ
          // ในไฟล์ตรง ๆ ปล่อยให้เบราว์เซอร์แปลงเป็นเชิงเส้นก่อนจะได้คนละภาพ
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
        {/* กระตุก = เลื่อนช่องแดงไปทางหนึ่ง ช่องน้ำเงินไปอีกทาง แล้วรวมกลับ —
            ตรงกับ rgbashift=rh=-N:bh=N ของ ffmpeg ไม่ใช่การประมาณด้วย
            drop-shadow ซึ่งวาดเงาสีทับ ไม่ได้แยกช่องสีจริง */}
        {[...new Set([8, 11, 14, 17, 20, 22, 25, 28])].map((px) => (
          <filter key={px} id={shiftId(px)} colorInterpolationFilters="sRGB">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="r"
            />
            <feOffset in="r" dx={-px} dy={0} result="rm" />
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="g"
            />
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="b"
            />
            <feOffset in="b" dx={px} dy={0} result="bm" />
            {/* บวกกันแบบ arithmetic — screen/lighten จะทำให้ส่วนที่ซ้อนกันสว่างผิด */}
            <feComposite in="rm" in2="g" operator="arithmetic" k2={1} k3={1} result="rg" />
            <feComposite in="rg" in2="bm" operator="arithmetic" k2={1} k3={1} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** รูปทรงทั้งชั้นในผืนเดียว — vieBox เป็นพิกเซลของหนังจริง จึงวางด้วยตัวเลขชุด
 *  เดียวกับที่เอนจินเขียนลง ASS ไม่ต้องแปลงหน่วยที่ไหนเลย
 *
 *  แยกเป็นสอง <svg> ตาม `behind` แทนที่จะเรียงลำดับใน svg เดียว เพราะชั้นที่ต้อง
 *  แทรกระหว่างกลางคือ *ข้อความ* ซึ่งเป็น DOM คนละก้อน — แถบมุมมนที่ทำหน้าที่เป็น
 *  พื้นของชิปตัวเลขต้องอยู่ใต้ตัวเลข ไม่งั้นมันบังสิ่งที่มันมีไว้รองพอดี
 */
function ShapeLayer({
  items,
  ph,
  fw,
  fh,
  W,
  H,
  edit,
  focusIdx,
  onDown,
}: {
  items: { item: FxShape; tl: number; idx: number }[];
  ph: number;
  fw: number;
  fh: number;
  W: number;
  H: number;
  edit: boolean;
  focusIdx: number | null;
  onDown: (idx: number, mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  if (!items.length) return null;
  return (
    <svg
      viewBox={`0 0 ${fw} ${fh}`}
      width={W}
      height={H}
      className="absolute inset-0"
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      {items.map(({ item: sh, tl, idx }) => {
        const p = ph - tl;
        const q = tl + sh.dur - ph;
        const fade = sh.anim === "none" ? 1 : fadeOpacity(p, q, sh.in, sh.out);
        // pop = ย่อ→ใหญ่เกิน→พอดี · ตัวเลขชุดเดียวกับที่ fxtext.anim_tags ใช้
        const pop =
          sh.anim === "pop" && sh.in > 0 && p < sh.in
            ? 0.72 + 0.38 * Math.min(1, p / sh.in) -
              0.1 * Math.max(0, 1 - Math.abs(p / sh.in - 0.75) * 4)
            : 1;
        // \frz หมุนทวนเข็ม · rotate() ของ SVG หมุนตามเข็ม จึงต้องกลับเครื่องหมาย
        const tf =
          `translate(${sh.x * fw} ${sh.y * fh}) rotate(${-(sh.angle || 0)})` +
          (pop === 1 ? "" : ` scale(${pop})`);
        return (
          <g
            key={idx}
            transform={tf}
            // ชิ้นที่เลือกอยู่ต้องเห็นเสมอ ไม่ใช่แค่ตอนเปิดโหมดแก้ตำแหน่ง — วางรูป
            // ที่หัวเล่นพอดีแปลว่า p=0 ซึ่งเป็นวินาทีแรกของการเฟดเข้า ความจาง
            // จึงเป็นศูนย์เป๊ะ  ถ้าไม่ยกพื้นให้ คนกดวางแล้วจอไม่มีอะไรเปลี่ยนเลย
            // แล้วจะกดซ้ำอีกหลายครั้งก่อนจะรู้ว่ามันวางไปแล้วทุกครั้ง
            opacity={edit || focusIdx === idx ? Math.max(fade, 0.4) : fade}
            style={{ pointerEvents: edit ? "auto" : "none", cursor: edit ? "move" : "default" }}
            onPointerDown={(e) => edit && onDown(idx, "move", e)}
          >
            {/* แสงฟุ้ง — วาดรูปเดิมซ้ำแล้วขยายด้วย stroke + เบลอ ท่าเดียวกับที่
                เอนจินใช้ \bord กับ \blur  ค่าทุกตัวมาจาก lib/shapes.ts ซึ่งถูก
                เทียบกับเอนจินไว้แล้วใน scripts/check_shape_parity.py */}
            {glowLayers(sh.kind, sh.size, sh.thick, sh.glow ?? 0, fw, fh).map(
              (g, k) => (
                <path
                  key={`g${k}`}
                  d={assPathToSvg(shapePath(sh.kind, sh.size, sh.thick))}
                  fill={sh.color}
                  stroke={sh.color}
                  // \bord ขยายออก *นอก* รูป ส่วน stroke ของ SVG คร่อมครึ่ง-ครึ่ง
                  strokeWidth={g.bord * 2}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  opacity={g.op}
                  // blur() บนลูกของ svg คิดเป็นหน่วยของ viewBox = พิกเซลหนังจริง
                  style={{ filter: `blur(${g.blur}px)` }}
                />
              ),
            )}
            <path
              d={assPathToSvg(shapePath(sh.kind, sh.size, sh.thick))}
              fill={sh.color}
              stroke={sh.border > 0 ? sh.outline : "none"}
              // \bord วาดขอบ *นอก* รูป ส่วน stroke ของ SVG คร่อมเส้นขอบครึ่ง-ครึ่ง
              // — คูณสองแล้วให้ fill ทับทีหลัง (paint-order) ได้ขอบนอกหนาเท่าที่สั่ง
              strokeWidth={sh.border * 2}
              paintOrder="stroke"
              strokeLinejoin="round"
            />
            {focusIdx === idx && (
              <path
                d={assPathToSvg(shapePath(sh.kind, sh.size, sh.thick))}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={Math.max(2, fw / 500)}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StickerOv({
  o,
  kind,
  ph,
  tl,
  W,
  H,
  edit,
  sel,
  onDown,
}: {
  o: FxOverlay;
  kind: string;
  ph: number;
  tl: number;
  W: number;
  H: number;
  edit: boolean;
  sel: boolean;
  onDown: (mode: DragMode, e: ReactPointerEvent<Element>) => void;
}) {
  const p = ph - tl;
  const q = tl + o.dur - ph;
  // ความจางอยู่ที่ตัวรูป ไม่ใช่ที่กล่อง — ไม่งั้นกรอบเลือกกับจุดจับจางตามไปด้วย
  // จนจับไม่ถูกในจังหวะที่ภาพกำลังเฟดเข้า
  const op =
    (o.opacity ?? 1) * (o.anim === "none" ? 1 : fadeOpacity(p, q, o.in, o.out));
  const media: CSSProperties = {
    display: "block",
    width: "100%",
    opacity: edit ? Math.max(op, 0.35) : op,
  };
  return (
    <div
      data-ov="sticker"
      onPointerDown={(e) => {
        if (!edit) return;
        onDown("move", e);
      }}
      style={{
        position: "absolute",
        left: o.x * W,
        top: o.y * H,
        width: o.width * W,
        transform: `translate(-50%, -50%) rotate(${o.angle || 0}deg)`,
        pointerEvents: edit ? "auto" : "none",
        cursor: edit ? "move" : "default",
        outline: sel
          ? "1.5px solid var(--accent)"
          : edit
            ? "1px dashed rgba(255,255,255,0.35)"
            : undefined,
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
              style={{
                position: "absolute",
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                width: 11,
                height: 11,
                marginLeft: -6,
                marginTop: -6,
                borderRadius: 3,
                background: "var(--accent)",
                border: "1.5px solid #fff",
                cursor: c.cur,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -26,
              width: 1.5,
              height: 20,
              marginLeft: -0.75,
              background: "var(--accent)",
            }}
          />
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onDown("rotate", e);
            }}
            title="ลากเพื่อหมุน (กด Shift = ทีละ 15°)"
            style={{
              position: "absolute",
              left: "50%",
              top: -44,
              width: 20,
              height: 20,
              marginLeft: -10,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "1.5px solid #fff",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
            }}
          >
            <RotateCw size={11} />
          </div>
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
        fontFamily: `'${st.font}', var(--font-thai), sans-serif`,
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

export default function Preview({
  videoRef,
  stageRef,
  playing,
  playhead,
  total,
  onToggle,
  notice,
  overlay,
  frame,
  onLayout,
  edit,
  onEdit,
  focus,
  onSelect,
  onClearSel,
  onPatchSticker,
  onPatchText,
  onPatchShape,
  clipFx,
  clipAt,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  playing: boolean;
  playhead: number;
  total: number;
  onToggle: () => void;
  notice: string;
  overlay: OverlayData;
  frame: { w: number; h: number } | null;
  onLayout: (w: number, h: number) => void;
  edit: boolean;
  onEdit: (v: boolean) => void;
  focus: { kind: string; idx: number } | null;
  onSelect: (kind: StageKind, idx: number) => void;
  onClearSel: () => void;
  onPatchSticker: (idx: number, p: Partial<FxOverlay>) => void;
  onPatchText: (idx: number, p: Partial<FxTextItem>) => void;
  onPatchShape: (idx: number, p: Partial<FxShape>) => void;
  /** เอฟเฟกต์ของช็อตที่เส้นหัวเล่นอยู่ — null = ยังไม่รู้ (ยังไม่ได้ตัดชิ้น) */
  clipFx: FxClip | null;
  /** เดินมาถึงไหนของช็อตนั้น (p = 0–1) และช็อตยาวกี่วินาที */
  clipAt: { p: number; dur: number } | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // เส้นนำที่กำลังโชว์ (พิกัดบนกรอบหนัง) + ตัวเลขที่อ่านสดตอนลาก
  const [guide, setGuide] = useState<{ vx?: number; hy?: number }>({});
  const [readout, setReadout] = useState("");

  const [fit, setFit] = useState<(typeof FITS)[number]>(FITS[0]);
  const [fitOpen, setFitOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [showOv, setShowOv] = useState(true);
  const [dims, setDims] = useState({ bw: 0, bh: 0 });


  // ขนาดเวที — ไว้คำนวณกรอบผืนหนัง (layout) ที่ใหญ่สุดที่ยังพอดีเวที
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const upd = () =>
      setDims({ bw: stage.clientWidth, bh: stage.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stageRef]);

  // กรอบผืนหนังตามสัดส่วน layout ที่เลือก — เปลี่ยน layout แล้วกรอบเปลี่ยนทันที
  // สตรีมเก่า (สัดส่วนเดิม) ถูกจัดวางในกรอบตามโหมด Fit/Fill/Stretch จนกว่าจะ
  // Export ใหม่  ตัวอย่างซ้อนยึดกรอบนี้ = ตำแหน่งเดียวกับที่ ffmpeg จะเผาจริง
  const { bw, bh } = dims;
  const fw = frame?.w || 1920;
  const fh = frame?.h || 1080;
  let W = 0, H = 0;
  if (bw > 0 && bh > 0) {
    const k = Math.min(bw / fw, bh / fh);
    W = fw * k;
    H = fh * k;
  }

  /**
   *  กล้อง (ซูม/ไถล) + สี + กระตุก + เบลอหัว-ท้าย ของเฟรมที่กำลังโชว์
   *
   *  คิดที่เดียวแล้วส่งออกเป็น transform กับ filter — แยกคิดคนละที่แล้วสองอย่าง
   *  จะหลุดจากกันทันทีที่มีคนเพิ่มชั้นใหม่
   */
  const camCss = useMemo(() => {
    const f = clipFx;
    const p = clipAt?.p ?? 0;
    if (!f) return { transform: undefined as string | undefined, filter: "" };

    // ── ซูม: ค้างหรือเดิน (สูตรเดียวกับ fx._zoom_pair) ──
    const z0 = f.zoom || 1;
    let z1 = f.zoom_to || 0;
    if (z1 <= 1e-6) z1 = z0;
    else if (z1 < 1) z1 = 1;
    const room = Math.max(z0, z1) > 1 + 1e-6;
    const panning = room && !!f.pan;
    const z = room ? z0 + (z1 - z0) * p : 1;

    // ── ไถล: zoompan เลื่อนกรอบที่ *มอง* ไปทางหนึ่ง = ภาพขยับสวนทาง ──
    //
    // ระยะที่เลื่อนได้คือครึ่งหนึ่งของส่วนที่ล้นออกนอกกรอบ คิดเป็นสัดส่วนของ
    // ความกว้างกรอบ  ที่ zoom = z ภาพกว้าง z เท่า จึงล้น (z−1) และเลื่อนได้ ±(z−1)/2
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
    if (tx || ty)
      parts.push(`translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%)`);

    const fil: string[] = [];
    const grade = gradeFilter(f.grade);
    if (grade) fil.push(grade);
    const px = glitchNow(f, p * (clipAt?.dur ?? 0));
    if (px) fil.push(`url(#${shiftId(px)})`);
    // เบลอหัว-ท้าย — gblur sigma กับ CSS blur() ใช้หน่วยเดียวกัน (ส่วนเบี่ยงเบน
    // มาตรฐานเป็นพิกเซล) แต่ที่นี่วัดบนจอตัวอย่างซึ่งเล็กกว่าผืนจริงหลายเท่า
    // จึงย่อตามสัดส่วนความกว้าง ไม่งั้นพรีวิวจะเบลอกว่าไฟล์จริงมาก
    const wp = f.whip || 0;
    if (wp > 1e-6 && clipAt) {
      const d = Math.min(0.12, (clipAt.dur || 1) / 3);
      const tt = p * (clipAt.dur || 0);
      if (tt < d || tt > (clipAt.dur || 0) - d) {
        const sigma = 18 * wp * (W > 0 ? W / 1080 : 1);
        fil.push(`blur(${sigma.toFixed(2)}px)`);
      }
    }
    return { transform: parts.join(" ") || undefined, filter: fil.join(" ") };
  }, [clipFx, clipAt, W]);

  const refH = frame?.h || REF_H;
  const ph = playhead;
  const activeTexts = overlay.texts.filter(
    ({ item, tl }) => ph >= tl && ph < tl + item.dur,
  );
  const activeStickers = overlay.stickers.filter(
    ({ item, tl }) => ph >= tl && ph < tl + item.dur,
  );
  const activeShapes = overlay.shapes.filter(
    ({ item, tl }) => ph >= tl && ph < tl + item.dur,
  );
  const activeCue = overlay.cues.find((c) => ph >= c.a && ph < c.b) ?? null;

  // ── ลาก/ย่อขยาย/หมุน บนจอตัวอย่าง ──
  // ทุกอย่างคิดเป็น "สัดส่วนของเฟรม" ตั้งแต่ต้น ค่าที่ได้จึงเป็นตัวเลขชุดเดียว
  // กับที่ ffmpeg เอาไปใช้ตอน render — ย้ายบนจอเล็กแล้วออกมาตรงกันที่ 4K
  const startDrag = useCallback(
    (kind: StageKind, idx: number, mode: DragMode, e: ReactPointerEvent<Element>) => {
      // รูปทรงเป็น <g> ของ SVG ซึ่งไม่มี offsetWidth/Height — ค่าที่จำไว้ตอนเริ่ม
      // ลากใช้แค่ตอนย่อขยาย ซึ่งเปิดให้เฉพาะภาพซ้อน (ดูเหตุผลที่ onStageMove)
      // ศูนย์จึงไม่ทำให้อะไรพัง และไม่ต้องแยกทางเดินสองสายให้ตัวจับลาก
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
      // จับ pointer ไว้กับชิ้นที่กด — ลากเลยขอบจอแล้วยังตามต่อ ไม่หลุดกลางคัน
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* บางเบราว์เซอร์/เหตุการณ์สังเคราะห์จับไม่ได้ — ลากในกรอบยังทำงานปกติ */
      }
      onSelect(kind, idx);
      drag.current = {
        mode,
        kind,
        idx,
        px: e.clientX,
        py: e.clientY,
        x0: item.x,
        y0: item.y,
        w0: kind === "sticker" ? (item as FxOverlay).width : 0,
        a0: item.angle || 0,
        ew: el.offsetWidth ?? 0,
        eh: el.offsetHeight ?? 0,
      };
    },
    [overlay, onSelect],
  );

  const onStageMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const r = frameRef.current?.getBoundingClientRect();
      if (!d || !r || W <= 0) return;
      // รูปทรงย้ายกับหมุนได้บนเวที แต่ *ย่อขยายไม่ได้* — ขนาดของมันเป็นพิกเซล
      // ของหนังจริง (ไม่ใช่สัดส่วนจอแบบภาพซ้อน) ลากมุมแล้วเลขที่ได้จะขึ้นกับว่า
      // จอตัวอย่างย่อไว้เท่าไร ซึ่งไม่ใช่สิ่งที่ใครคาดจากปุ่มลาก · ตั้งที่ช่อง
      // "ขนาด" ในแผงแทน ที่นั่นเห็นตัวเลขจริง
      const patch =
        d.kind === "sticker"
          ? onPatchSticker
          : d.kind === "shape"
            ? onPatchShape
            : onPatchText;

      if (d.mode === "move") {
        let nx = d.x0 + (e.clientX - d.px) / W;
        let ny = d.y0 + (e.clientY - d.py) / H;
        const g: { vx?: number; hy?: number } = {};
        if (!e.altKey) {
          // ดูดเข้าหากึ่งกลาง + ขอบจอ + เส้นปลอดภัย — เทียบที่ "ขอบชิ้นงาน"
          // สำหรับสติกเกอร์ (รู้ขนาดจริง) ส่วนข้อความเทียบที่จุดยึดของมันเอง
          const hw = d.kind === "sticker" ? d.ew / 2 / W : 0;
          const hh = d.kind === "sticker" ? d.eh / 2 / H : 0;
          const xs: [number, number][] = [
            [0.5, 0.5],
            [hw, 0],
            [1 - hw, 1],
            [SAFE + hw, SAFE],
            [1 - SAFE - hw, 1 - SAFE],
          ];
          const ys: [number, number][] = [
            [0.5, 0.5],
            [hh, 0],
            [1 - hh, 1],
            [SAFE + hh, SAFE],
            [1 - SAFE - hh, 1 - SAFE],
          ];
          for (const [target, line] of xs) {
            if (Math.abs(nx - target) * W < SNAP_PX) {
              nx = target;
              g.vx = line * W;
              break;
            }
          }
          for (const [target, line] of ys) {
            if (Math.abs(ny - target) * H < SNAP_PX) {
              ny = target;
              g.hy = line * H;
              break;
            }
          }
        }
        setGuide(g);
        patch(d.idx, { x: r3(clamp01(nx)), y: r3(clamp01(ny)) });
        setReadout(`x ${r3(clamp01(nx)).toFixed(3)} · y ${r3(clamp01(ny)).toFixed(3)}`);
        return;
      }

      const cx = r.left + d.x0 * W;
      const cy = r.top + d.y0 * H;

      if (d.mode === "resize" && d.kind === "sticker") {
        // ย่อขยายจากจุดกึ่งกลาง (จุดยึดเดียวกับที่เอนจินใช้) — หมุนพิกัดเมาส์
        // กลับตามมุมของชิ้นก่อน ระยะที่วัดได้จึงเป็นระยะบนแกนของตัวมันเอง
        const a = (-d.a0 * Math.PI) / 180;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        const k = Math.max(
          Math.abs(lx) / Math.max(d.ew / 2, 1),
          Math.abs(ly) / Math.max(d.eh / 2, 1),
        );
        const nw = Math.min(2, Math.max(0.02, d.w0 * k));
        setGuide({});
        onPatchSticker(d.idx, { width: r3(nw) });
        setReadout(`กว้าง ${(nw * 100).toFixed(1)}% ของจอ`);
        return;
      }

      if (d.mode === "rotate") {
        let ang =
          (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        ang = ((ang + 180) % 360) - 180;
        if (e.shiftKey) ang = Math.round(ang / 15) * 15;
        else if (Math.abs(ang) < 3) ang = 0;
        setGuide({});
        patch(d.idx, { angle: Math.round(ang * 10) / 10 });
        setReadout(`หมุน ${(Math.round(ang * 10) / 10).toFixed(1)}°`);
      }
    },
    [W, H, onPatchSticker, onPatchText, onPatchShape],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    setGuide({});
    setReadout("");
  }, []);

  useEffect(() => {
    if (!edit) endDrag();
  }, [edit, endDrag]);

  // ── เอฟเฟกต์รายชิ้นที่ต้องสั่งตัวเล่น ไม่ใช่แค่ทาสีทับ ──
  //
  // **ความเร็วปลอดภัยกับเส้นหัวเล่น** — playbackRate เปลี่ยนแค่ว่าเวลาในสื่อ
  // เดินเร็วแค่ไหนเทียบกับเวลาจริง ส่วน currentTime ยังนับเป็นวินาทีของสื่อเหมือน
  // เดิม  ตัวที่คำนวณเส้นหัวเล่น (page.elapsed) อ่าน currentTime ตรง ๆ จึงยัง
  // ตรงกับไทม์ไลน์ของขั้น 3 ทุกโหมด สโลว์โมจึงพรีวิวได้โดยไม่มีอะไรเลื่อน
  //
  // สิ่งที่ *ไม่* ตรงคือความยาวรวม: ไทม์ไลน์ยังยาวเท่าขั้น 3 ส่วนไฟล์ของขั้น 5
  // จะยาวกว่าตามความเร็วที่ตั้ง — เอนจินเองก็เก็บสองแผน (render.json กับ
  // fx-render.json) ด้วยเหตุผลเดียวกันเป๊ะ แผงคุณสมบัติจึงบอกความยาวใหม่ไว้ให้
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sp = clipFx?.speed ?? 1;
    // ตัวเล่นรับ 0.0625–16 เท่านั้น นอกช่วงนั้นบางเบราว์เซอร์โยน error ทิ้งทั้ง
    // การเล่น — หนีบไว้ดีกว่าจอค้างโดยไม่มีอะไรบอก (ช่วงของเอนจินคือ 0.1–8 อยู่แล้ว)
    v.playbackRate = Math.min(16, Math.max(0.0625, sp));
    v.muted = Boolean(clipFx?.mute);
    // vol_db → อัตราส่วนความดัง · เกิน 0 dB ตัวเล่นทำไม่ได้ (เพดานคือ 1.0)
    // ตัวจริงทำได้เพราะ ffmpeg มีที่ว่างเหนือระดับที่ปรับมา — พรีวิวจึงได้แค่
    // "ไม่ดังขึ้น" ซึ่งยังบอกทิศทางถูก ต่างจากการทำเสียงแตกให้ฟัง
    const db = clipFx?.vol_db ?? 0;
    v.volume = Math.min(1, Math.pow(10, Math.min(0, db) / 20));
  }, [videoRef, clipFx?.speed, clipFx?.mute, clipFx?.vol_db]);

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div
        ref={stageRef}
        className="relative m-4 mb-2 flex min-h-0 flex-1 items-center justify-center"
      >
        {/* กรอบผืนหนัง — สัดส่วนตาม layout ที่เลือก ไม่ใช่ตามสตรีม */}
        <div
          ref={frameRef}
          className="relative overflow-hidden bg-black"
          style={{ width: W || "100%", height: H || "100%" }}
          onPointerMove={onStageMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <video
            ref={videoRef}
            playsInline
            // ต้องโหลดเองแม้ยังไม่กดเล่น — ตอนหยุดแล้วเลื่อนเส้นหัวเล่น เราตั้ง
            // currentTime ให้ไปโชว์เฟรมนั้นค้างไว้ ถ้าไม่โหลดจะได้จอดำ
            preload="auto"
            className="h-full w-full"
            style={{
              objectFit: fit.v,
              // ซูมของเอนจินคือ "ขยายแล้วครอบกลับให้เท่าเดิม" — กรอบไม่เปลี่ยน
              // ภาพโตขึ้นรอบจุดกึ่งกลาง  scale() รอบ center ให้ผลเดียวกันเป๊ะ
              // (กรอบผืนหนังตั้ง overflow-hidden ไว้แล้ว จึงครอบให้เอง)
              transform: camCss.transform,
              filter: camCss.filter || undefined,
            }}
            onClick={() => (edit ? onClearSel() : onToggle())}
          />
          {/* ── แบ่งจอสองคน ──
              วาดได้แค่ *เส้นแบ่งกับป้าย* ไม่ใช่ภาพของอีกครึ่ง — วิดีโอในจอนี้
              คือหนังที่ต่อเสร็จแล้วหนึ่งสาย ส่วนอีกครึ่งเป็นฟุตเทจดิบคนละไฟล์
              ที่ต้องถอดรหัสเพิ่มอีกสาย  บอกตรง ๆ ว่ายังไม่เห็นภาพจริงดีกว่า
              วาดอะไรมั่ว ๆ ไว้แล้วให้เชื่อจนกว่าจะ render เสร็จ */}
          {clipFx && (clipFx.split === "v" || clipFx.split === "h")
            && clipFx.split_with && W > 0 && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute bg-accent/70"
                style={
                  clipFx.split === "v"
                    ? { left: 0, right: 0, top: "50%", height: 2 }
                    : { top: 0, bottom: 0, left: "50%", width: 2 }
                }
              />
              <div
                className="absolute flex items-center justify-center bg-black/55 text-center text-[11px] leading-4 text-ink"
                style={
                  clipFx.split === "v"
                    ? { left: 0, right: 0, top: "50%", bottom: 0 }
                    : { top: 0, bottom: 0, left: "50%", right: 0 }
                }
              >
                <span className="px-2">
                  {clipFx.split_with}
                  <br />
                  <span className="text-faint">
                    @{(clipFx.split_at ?? 0).toFixed(1)} วิ · เห็นของจริงในไฟล์
                  </span>
                </span>
              </div>
            </div>
          )}
          <GradeDefs />
          {/* ชั้นซ้อนสด — ตัวเลขชุดเดียวกับที่ ffmpeg จะเผาใน render ขั้น 5 */}
          {showOv && W > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <ShapeLayer
                items={activeShapes.filter((x) => x.item.behind)}
                ph={ph}
                fw={fw}
                fh={fh}
                W={W}
                H={H}
                edit={edit}
                focusIdx={focus?.kind === "shape" ? focus.idx : null}
                onDown={(idx, m, e) => startDrag("shape", idx, m, e)}
              />
              {activeTexts.map(({ item, tl, idx }) => (
                <TextOv
                  key={`t${idx}`}
                  t={item}
                  ph={ph}
                  tl={tl}
                  W={W}
                  H={H}
                  refH={refH}
                  edit={edit}
                  sel={focus?.kind === "text" && focus.idx === idx}
                  onDown={(m, e) => startDrag("text", idx, m, e)}
                />
              ))}
              {activeStickers.map(({ item, tl, kind, idx }) => (
                <StickerOv
                  key={`s${idx}`}
                  o={item}
                  kind={kind}
                  ph={ph}
                  tl={tl}
                  W={W}
                  H={H}
                  edit={edit}
                  sel={focus?.kind === "sticker" && focus.idx === idx}
                  onDown={(m, e) => startDrag("sticker", idx, m, e)}
                />
              ))}
              <ShapeLayer
                items={activeShapes.filter((x) => !x.item.behind)}
                ph={ph}
                fw={fw}
                fh={fh}
                W={W}
                H={H}
                edit={edit}
                focusIdx={focus?.kind === "shape" ? focus.idx : null}
                onDown={(idx, m, e) => startDrag("shape", idx, m, e)}
              />
              {activeCue && <CueOv c={activeCue} W={W} H={H} refH={refH} />}
            </div>
          )}
          {/* เส้นขอบปลอดภัย + เส้นนำตอนลาก — โชว์เฉพาะตอนแก้ตำแหน่ง */}
          {edit && W > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute border border-dashed border-white/20"
                   style={{ left: "5%", top: "5%", right: "5%", bottom: "5%" }} />
              <div className="absolute border border-dashed border-white/12"
                   style={{ left: "10%", top: "10%", right: "10%", bottom: "10%" }} />
              {guide.vx !== undefined && (
                <div className="absolute top-0 bottom-0 w-px bg-accent"
                     style={{ left: guide.vx }} />
              )}
              {guide.hy !== undefined && (
                <div className="absolute left-0 right-0 h-px bg-accent"
                     style={{ top: guide.hy }} />
              )}
              {readout && (
                <div className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 font-mono text-[10.5px] text-white">
                  {readout}
                </div>
              )}
            </div>
          )}
        </div>
        {notice && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-[11.5px] text-white">
            {notice}
          </div>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 px-4 pb-2">
        <div className="font-mono text-[12px]">
          <span className="text-accent">{tc(playhead)}</span>
          <span className="mx-1.5 text-faint">/</span>
          <span className="text-muted">{tc(total)}</span>
        </div>

        <div className="flex flex-1 justify-center">
          <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-panel-2"
            title={playing ? "หยุดชั่วคราว (Space)" : "เล่น (Space)"}
          >
            {playing ? (
              <Pause size={16} className="fill-current" />
            ) : (
              <Play size={16} className="fill-current" />
            )}
          </button>
        </div>

        {/* layout ขนาดหนัง — เขียน video.width/height ลง config ทันทีที่เลือก */}
        {frame && (
          <div className="relative">
            <button
              onClick={() => setLayoutOpen((v) => !v)}
              title="ขนาดหนัง (layout) — เลือกสัดส่วนยอดนิยม เช่น YouTube · TikTok · Instagram"
              className="flex items-center gap-1 rounded-lg bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3"
            >
              <Proportions size={13} />
              {ratioLabel(frame.w, frame.h)}
              <span className="text-[10.5px] text-muted">
                {frame.w}×{frame.h}
              </span>
              <ChevronDown size={12} />
            </button>
            {layoutOpen && (
              <div className="absolute bottom-9 right-0 z-40 max-h-80 w-64 overflow-y-auto rounded-lg border border-line bg-panel-2 shadow-xl">
                {LAYOUT_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium text-faint">
                      {g.label}
                    </div>
                    {g.items.map((p) => {
                      const cur = p.w === frame.w && p.h === frame.h;
                      return (
                        <button
                          key={`${p.w}x${p.h}`}
                          onClick={() => {
                            onLayout(p.w, p.h);
                            setLayoutOpen(false);
                          }}
                          className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-panel-3 ${
                            cur ? "text-accent" : "text-ink"
                          }`}
                        >
                          <span className="w-12 shrink-0 font-mono text-[11px]">
                            {p.ratio}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{p.label}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted">
                            {p.w}×{p.h}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                <div className="border-t border-line px-3 py-1.5 text-[10px] leading-4 text-muted">
                  มีผลตอน Export — ชิ้นที่ตัดไว้ถูก render ใหม่ให้เอง ·
                  ขนาดกำหนดเองอยู่ในแท็บตั้งค่า
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => {
            onEdit(!edit);
            if (!edit) setShowOv(true);   // เปิดโหมดแก้แต่ชั้นซ้อนปิดอยู่ = จอว่าง ไม่มีอะไรให้ลาก
          }}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] ${
            edit ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"
          }`}
          title="แก้ตำแหน่งบนจอ — ลากย้าย · จุดมุม=ย่อขยาย · ก้านบน=หมุน · ลูกศร=ขยับทีละนิด (Alt=ไม่สแนป)"
        >
          <Move size={13} /> แก้ตำแหน่ง
        </button>

        <button
          onClick={() => setShowOv((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] ${
            showOv ? "text-accent" : "text-muted hover:text-ink"
          }`}
          title="เปิด/ปิดตัวอย่างซ้อน (ข้อความ · สติกเกอร์ · ซับ)"
        >
          {showOv ? <Eye size={13} /> : <EyeOff size={13} />} ซ้อน
        </button>

        <div className="relative">
          <button
            onClick={() => setFitOpen((v) => !v)}
            title="วิธีวางภาพในจอ: Fit=เห็นทั้งภาพ · Fill=เต็มจอตัดขอบ · Stretch=ยืด"
            className="flex items-center gap-1 rounded-lg bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3"
          >
            {fit.label} <ChevronDown size={12} />
          </button>
          {fitOpen && (
            <div className="absolute bottom-9 right-0 z-40 w-28 overflow-hidden rounded-lg border border-line bg-panel-2 shadow-xl">
              {FITS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => {
                    setFit(f);
                    setFitOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-panel-3 ${
                    f.v === fit.v ? "text-accent" : "text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => stageRef.current?.requestFullscreen()}
          className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เต็มจอ"
        >
          <Maximize size={14} />
        </button>
      </div>
    </section>
  );
}
