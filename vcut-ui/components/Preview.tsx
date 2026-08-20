"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
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
  type FxOverlay,
  type FxTextItem,
} from "@/lib/api";
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
  cues: CaptionCue[];
}

export type StageKind = "text" | "sticker";
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
  onDown: (mode: DragMode, e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const s = H / refH;
  const p = ph - tl;
  const q = tl + t.dur - ph;
  const { tx, ty } = anchor(t.align || 5);
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
    opacity: edit
      ? Math.max(fadeOpacity(p, q, t.in, t.out), 0.35)
      : fadeOpacity(p, q, t.in, t.out),
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
      <div>{t.text}</div>
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
          {String(ln.text ?? "")}
        </div>
      ))}
    </div>
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
  onDown: (mode: DragMode, e: ReactPointerEvent<HTMLElement>) => void;
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

  const refH = frame?.h || REF_H;
  const ph = playhead;
  const activeTexts = overlay.texts.filter(
    ({ item, tl }) => ph >= tl && ph < tl + item.dur,
  );
  const activeStickers = overlay.stickers.filter(
    ({ item, tl }) => ph >= tl && ph < tl + item.dur,
  );
  const activeCue = overlay.cues.find((c) => ph >= c.a && ph < c.b) ?? null;

  // ── ลาก/ย่อขยาย/หมุน บนจอตัวอย่าง ──
  // ทุกอย่างคิดเป็น "สัดส่วนของเฟรม" ตั้งแต่ต้น ค่าที่ได้จึงเป็นตัวเลขชุดเดียว
  // กับที่ ffmpeg เอาไปใช้ตอน render — ย้ายบนจอเล็กแล้วออกมาตรงกันที่ 4K
  const startDrag = useCallback(
    (kind: StageKind, idx: number, mode: DragMode, e: ReactPointerEvent<HTMLElement>) => {
      const box = e.currentTarget.closest("[data-ov]") as HTMLElement | null;
      const el = box ?? e.currentTarget;
      const item =
        kind === "sticker"
          ? overlay.stickers.find((x) => x.idx === idx)?.item
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
        ew: el.offsetWidth,
        eh: el.offsetHeight,
      };
    },
    [overlay, onSelect],
  );

  const onStageMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const r = frameRef.current?.getBoundingClientRect();
      if (!d || !r || W <= 0) return;
      const patch = d.kind === "sticker" ? onPatchSticker : onPatchText;

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
    [W, H, onPatchSticker, onPatchText],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    setGuide({});
    setReadout("");
  }, []);

  useEffect(() => {
    if (!edit) endDrag();
  }, [edit, endDrag]);

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
            className="h-full w-full"
            style={{ objectFit: fit.v }}
            onClick={() => (edit ? onClearSel() : onToggle())}
          />
          {/* ชั้นซ้อนสด — ตัวเลขชุดเดียวกับที่ ffmpeg จะเผาใน render ขั้น 5 */}
          {showOv && W > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
