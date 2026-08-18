"use client";

import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useState,
} from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Maximize,
  Pause,
  Play,
  Proportions,
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
  texts: { item: FxTextItem; tl: number }[];
  stickers: { item: FxOverlay; tl: number; kind: string }[];
  cues: CaptionCue[];
}

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
}: {
  t: FxTextItem;
  ph: number;
  tl: number;
  W: number;
  H: number;
  refH: number;
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
    opacity: fadeOpacity(p, q, t.in, t.out),
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
  };
  const lines = (t.lines as Partial<FxTextItem>[] | undefined) ?? [];
  return (
    <div style={style}>
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
}: {
  o: FxOverlay;
  kind: string;
  ph: number;
  tl: number;
  W: number;
  H: number;
}) {
  const p = ph - tl;
  const q = tl + o.dur - ph;
  const style: CSSProperties = {
    position: "absolute",
    left: o.x * W,
    top: o.y * H,
    width: o.width * W,
    transform: `translate(-50%, -50%) rotate(${o.angle || 0}deg)`,
    opacity:
      (o.opacity ?? 1) *
      (o.anim === "none" ? 1 : fadeOpacity(p, q, o.in, o.out)),
  };
  if (kind === "video") {
    return (
      <video src={assetUrl(o.file)} muted playsInline preload="metadata" style={style} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={assetUrl(o.file)} alt={o.file} style={style} />;
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
}) {
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

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div
        ref={stageRef}
        className="relative m-4 mb-2 flex min-h-0 flex-1 items-center justify-center"
      >
        {/* กรอบผืนหนัง — สัดส่วนตาม layout ที่เลือก ไม่ใช่ตามสตรีม */}
        <div
          className="relative overflow-hidden bg-black"
          style={{ width: W || "100%", height: H || "100%" }}
        >
          <video
            ref={videoRef}
            playsInline
            className="h-full w-full"
            style={{ objectFit: fit.v }}
            onClick={onToggle}
          />
          {/* ชั้นซ้อนสด — ตัวเลขชุดเดียวกับที่ ffmpeg จะเผาใน render ขั้น 5 */}
          {showOv && W > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {activeTexts.map(({ item, tl }, i) => (
                <TextOv key={`t${i}`} t={item} ph={ph} tl={tl} W={W} H={H} refH={refH} />
              ))}
              {activeStickers.map(({ item, tl, kind }, i) => (
                <StickerOv key={`s${i}`} o={item} kind={kind} ph={ph} tl={tl} W={W} H={H} />
              ))}
              {activeCue && <CueOv c={activeCue} W={W} H={H} refH={refH} />}
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
