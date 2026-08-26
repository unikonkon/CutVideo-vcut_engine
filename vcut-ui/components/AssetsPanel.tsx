"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowUpDown,
  Ban,
  Check,
  FilterX,
  GripVertical,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  checkClip,
  thumbUrl,
  uploadClip,
  type ClipInfo,
  type TrashItem,
} from "@/lib/api";
import { DND_MIME } from "@/lib/layers";
import { dur } from "@/lib/time";

interface UpItem {
  name: string;
  pct: number;
  error?: string;
  /** ชื่อที่จะได้จริงเมื่อชนกับคลิปที่มีอยู่แล้ว (IMG_1234 → IMG_1234-2) */
  as?: string;
}

// ลากการ์ดในคลังเพื่อจัดลำดับ — คนละชนิดกับ DND_MIME ที่ไทม์ไลน์รับ ลากครั้งเดียว
// จึงพกไปทั้งสองแบบ แล้วปลายทางไหนรู้จักชนิดของตัวเองก็หยิบไปใช้
const REORDER_MIME = "text/x-vcut-clip";

type Look = "xl" | "lg" | "big" | "small" | "list";
type Sort = "project" | "dur" | "added";
type Used = "all" | "used" | "unused";
type Orient = "all" | "V" | "H";

// กี่แถวที่ต้องเห็นครบโดยไม่ต้องเลื่อน — ขนาดภาพตัวอย่างคำนวณย้อนจากตัวเลขนี้กับ
// ความสูงที่แผงมีจริง เพดานคือ 5 แถว จอเล็กภาพก็เล็กตาม จอใหญ่ภาพก็ใหญ่ตาม
// กี่แถวที่ต้องเห็นครบในหนึ่งหน้าจอ — ตัวเลขนี้คือ "ระดับการซูม" ของคลัง
// น้อยแถว = ภาพใหญ่  ค่าที่เลือกได้จึงเป็น 1 · 2 · 3 · 5
const ROWS: Record<Exclude<Look, "list">, number> = {
  xl: 1,
  lg: 2,
  big: 3,
  small: 5,
};
const GAP = 8;
const PAD = 8;
const LABEL = 20;  // แถบชื่อใต้ภาพ (เฉพาะโหมดภาพใหญ่)
// พื้นสุดท้ายจริง ๆ เท่านั้น (แผงโดนบีบจนเหลือไม่กี่สิบพิกเซล) — ตั้งสูงกว่านี้
// แล้วโหมด 5 แถวจะใส่ไม่ลงในแผงความสูงปกติ กลายเป็นต้องเลื่อนทั้งที่สั่งว่าพอดี
const MIN_ROW = 36;
const MIN_W = 240;
const MAX_W = 720;
const KEY_W = "vcut.assets.width";
const KEY_LOOK = "vcut.assets.look";

// localStorage เป็นข้อมูลที่อยู่ *นอก* React และอ่านตอน prerender ไม่ได้ —
// useSyncExternalStore มีช่องให้บอก "ค่าฝั่งเซิร์ฟเวอร์" แยกไว้ตรง ๆ HTML ที่
// prerender ไว้จึงตรงกับที่เบราว์เซอร์วาดรอบแรกเสมอ แล้วค่อยสลับเป็นค่าที่จำไว้
const prefWatchers = new Set<() => void>();

function readPref<T extends string>(key: string, fallback: T, ok: (v: string) => boolean) {
  try {
    const v = localStorage.getItem(key);
    return v && ok(v) ? (v as T) : fallback;
  } catch {
    return fallback; // โหมดส่วนตัว/ปิด storage ไว้
  }
}

function usePref<T extends string>(key: string, fallback: T, ok: (v: string) => boolean) {
  const value = useSyncExternalStore(
    (cb) => {
      prefWatchers.add(cb);
      return () => prefWatchers.delete(cb);
    },
    () => readPref(key, fallback, ok),
    () => fallback,
  );
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* เขียนไม่ได้ก็ใช้ต่อได้ แค่ไม่จำข้ามรอบ */
      }
      prefWatchers.forEach((f) => f());
    },
    [key],
  );
  return [value, set] as const;
}

const dateShort = (sec: number) =>
  sec
    ? new Date(sec * 1000).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      })
    : "—";

export default function AssetsPanel({
  clips,
  usage,
  trash,
  onAdd,
  onPreview,
  onScan,
  onDelete,
  onLink,
  onRestore,
  onPurge,
  onTogglePick,
  onReorder,
  orderDirty,
  onSaveOrder,
  onRevertOrder,
  busy,
  flash,
}: {
  clips: ClipInfo[];
  usage: Map<string, number>;
  trash: TrashItem[];
  onAdd: (clip: ClipInfo) => void;
  onPreview: (clip: ClipInfo) => void;
  onScan: () => void;
  onDelete: (clip: ClipInfo) => void;
  onLink: (path: string) => Promise<void>;
  onRestore: (name: string) => void;
  onPurge: (name?: string) => void;
  onTogglePick: (clip: ClipInfo) => void;
  onReorder: (from: number, to: number) => void;
  orderDirty: boolean;
  onSaveOrder: () => void;
  onRevertOrder: () => void;
  busy: boolean;
  flash: (m: string) => void;
}) {
  const [ups, setUps] = useState<UpItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ask, setAsk] = useState<string | null>(null); // ชื่อคลิปที่รอยืนยันเอาออก
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropFile, setDropFile] = useState(false);
  const [view, setView] = useState<"clips" | "trash">("clips");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPath, setLinkPath] = useState("");
  const [linking, setLinking] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [askExit, setAskExit] = useState(false);
  const [look, setLook] = usePref<Look>(
    KEY_LOOK,
    "small",
    (v) => ["xl", "lg", "big", "small", "list"].includes(v),
  );
  const [sort, setSort] = useState<Sort>("project");
  const [fUsed, setFUsed] = useState<Used>("all");
  const [fOrient, setFOrient] = useState<Orient>("all");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // ความกว้างแผงไม่ต้องเป็น state ของ React เลย — เขียนลง style ของ element ตรง ๆ
  // แล้ว ResizeObserver ข้างล่างจะรายงานขนาดใหม่กลับมาให้เอง  ได้ผลพลอยได้คือ
  // ลากขอบทีนึงไม่ต้อง re-render ทั้งแผงทุกพิกเซลที่เมาส์ขยับ
  const applyWidth = useCallback((w: number) => {
    const el = asideRef.current;
    if (el) el.style.width = `${Math.min(MAX_W, Math.max(MIN_W, w))}px`;
  }, []);

  useEffect(() => {
    const w = Number(readPref(KEY_W, "", () => true));
    if (w >= MIN_W && w <= MAX_W) applyWidth(w);
  }, [applyWidth]);

  // ขนาดจริงของพื้นที่วางการ์ด — ผูกกับตัว element ไม่ใช่ขนาดหน้าต่าง เพราะแผงนี้
  // ยืดหดตามการลากขอบและตามแผงอื่นที่เปิด/ปิดอยู่ด้วย
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const grid = useMemo(() => {
    if (look === "list" || box.h <= 0) return null;
    const rows = ROWS[look];
    // แถบชื่อกินความสูงที่ควรเป็นของภาพ — โหมดภาพเล็กจึงตัดทิ้ง ชื่อไปอยู่ใน
    // tooltip กับตอนชี้ค้างแทน ได้ภาพใหญ่ขึ้นราวหนึ่งในสามในเนื้อที่เท่ากัน
    const label = look === "small" ? 0 : LABEL;
    const quota = Math.floor((box.h - PAD * 2 - GAP * (rows - 1)) / rows);
    const rowH = Math.max(MIN_ROW, quota);
    // ความกว้างการ์ดมาจากความสูงแถว ไม่ใช่ค่าคงที่ — ไม่งั้นพื้นขั้นต่ำของความ
    // กว้างจะไปดันให้การ์ดสูงเกินโควตา แล้วเห็นไม่ครบตามจำนวนแถวที่สั่งไว้
    const want = Math.max(56, Math.round((rowH - label) * (16 / 9)));
    const avail = Math.max(1, box.w - PAD * 2);
    // ปัด "จำนวนคอลัมน์" ขึ้นเสมอ — การ์ดจึงแคบกว่าที่คำนวณไว้เล็กน้อย แถวจึงเตี้ย
    // กว่าโควตาเสมอ และเห็นครบตามจำนวนแถวที่ตั้งไว้แน่นอน ไม่ใช่ขาดไปครึ่งแถว
    const cols = Math.max(1, Math.ceil((avail + GAP) / (want + GAP)));
    const cardW = (avail - GAP * (cols - 1)) / cols;
    const cardH = cardW * (9 / 16) + label;
    // แผงเตี้ยจนแถวตามโควตาจะเล็กเกินอ่าน (ชน MIN_ROW) — บอกไปตรง ๆ ว่าเห็นได้
    // กี่แถว ไม่ใช่ป้ายว่า 5 แถวแล้วผู้ใช้เห็นสองแถวครึ่ง
    const fit = Math.max(1, Math.floor((box.h - PAD * 2 + GAP) / (cardH + GAP)));
    return { cols, rows, fit, label };
  }, [look, box.w, box.h]);

  const shown = useMemo(() => {
    let a = clips;
    if (fUsed === "used") a = a.filter((c) => (usage.get(c.name) ?? 0) > 0);
    else if (fUsed === "unused") a = a.filter((c) => !(usage.get(c.name) ?? 0));
    if (fOrient !== "all") a = a.filter((c) => c.orient === fOrient);
    if (sort === "dur") a = [...a].sort((x, y) => y.dur - x.dur);
    else if (sort === "added") a = [...a].sort((x, y) => y.added - x.added);
    return a;
  }, [clips, usage, fUsed, fOrient, sort]);

  // ลากจัดลำดับได้เฉพาะในโหมดจัดลำดับ ซึ่งบังคับให้เห็นลำดับจริงของโปรเจกต์อยู่
  // แล้ว — ในมุมมองที่กรองหรือเรียงใหม่ ตำแหน่งที่ลากไปวางไม่ได้แปลว่าตำแหน่ง
  // นั้นในลำดับที่จะเขียนลง config เลยสักนิด
  const sortable = arranging;
  const filtered = fUsed !== "all" || fOrient !== "all";
  const messy = filtered || sort !== "project";

  const enterArrange = () => {
    setSort("project");
    setFUsed("all");
    setFOrient("all");
    setArranging(true);
    setBarOpen(true);
  };

  const leaveArrange = () => {
    if (orderDirty) return setAskExit(true); // ลากไว้แล้วยังไม่บันทึก — ถามก่อน
    setArranging(false);
  };

  const clearView = () => {
    setSort("project");
    setFUsed("all");
    setFOrient("all");
  };

  const startUpload = async (files: FileList | File[]) => {
    setUploading(true);
    const list = [...files];
    setUps(list.map((f) => ({ name: f.name, pct: 0 })));
    let okCount = 0;
    // ทีละไฟล์ — เอนจินเขียนดิสก์ก้อนใหญ่อยู่แล้ว ยิงพร้อมกันไม่ได้ช่วยให้เร็วขึ้น
    for (let i = 0; i < list.length; i++) {
      const fail = (msg: string) =>
        setUps((p) => p.map((u, k) => (k === i ? { ...u, error: msg } : u)));
      try {
        // ถามให้จบก่อนส่งไบต์แรก — ไฟล์ฟุตเทจใหญ่ระดับกิกะไบต์ ถ้าปล่อยให้ไป
        // ตายเอาตอนเอนจินตอบกลับกลางคัน ผู้ใช้จะรอเสียเปล่าแล้วยังไม่ได้เห็น
        // เหตุผลจริงด้วย (เบราว์เซอร์ทิ้งตอบกลับที่มาระหว่างยังส่งไม่จบ)
        const pre = await checkClip(list[i]);
        if (!pre.ok) {
          fail(pre.error || "ไฟล์นี้ลงคลังไม่ได้");
          continue;
        }
        if (pre.name && pre.name !== list[i].name) {
          const as = pre.name;
          setUps((p) => p.map((u, k) => (k === i ? { ...u, as } : u)));
        }
        await uploadClip(list[i], (pct) =>
          setUps((p) => p.map((u, k) => (k === i ? { ...u, pct } : u))),
        );
        okCount++;
      } catch (e) {
        fail(e instanceof Error ? e.message : "ไม่สำเร็จ");
      }
    }
    setUploading(false);
    if (okCount > 0) {
      flash(`เพิ่ม ${okCount}/${list.length} ไฟล์แล้ว — กำลังอ่านเข้าคลัง`);
      // เหลือไว้เฉพาะรายการที่พลาด พร้อมเหตุผล — ที่สำเร็จเดี๋ยวก็โผล่ในคลังเอง
      setUps((p) => p.filter((u) => u.error));
      onScan();
    }
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = asideRef.current?.getBoundingClientRect().width ?? 288;
    const at = (ev: PointerEvent) =>
      Math.min(MAX_W, Math.max(MIN_W, Math.round(w0 + ev.clientX - x0)));
    const move = (ev: PointerEvent) => applyWidth(at(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const w = at(ev);
      applyWidth(w);
      try {
        localStorage.setItem(KEY_W, String(w));
      } catch {
        /* จำไม่ได้ก็ไม่เป็นไร */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const iconBtn = (on: boolean) =>
    `rounded-md p-1.5 hover:bg-panel-2 hover:text-ink ${on ? "text-accent" : "text-muted"}`;
  const chip = (on: boolean) =>
    `rounded-md px-1.5 py-0.5 text-[11px] ${
      on ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"
    }`;

  // ── การ์ดหนึ่งใบ (ใช้ทั้งกริดและรายการ) ──
  const card = (c: ClipInfo, i: number) => {
    const used = usage.get(c.name) ?? 0;
    const asking = ask === c.name;
    const row = look === "list";
    const common = {
      draggable: !asking,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(
          DND_MIME,
          JSON.stringify({ type: "clip", name: c.name }),
        );
        if (sortable) e.dataTransfer.setData(REORDER_MIME, String(i));
        e.dataTransfer.effectAllowed = "copyMove";
        setDragFrom(sortable ? i : null);
      },
      onDragEnd: () => {
        setDragFrom(null);
        setDragOver(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (dragFrom == null || dragFrom === i) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(i);
      },
      onDrop: (e: React.DragEvent) => {
        if (dragFrom == null) return;
        e.preventDefault();
        e.stopPropagation();
        if (dragFrom !== i) onReorder(dragFrom, i);
        setDragFrom(null);
        setDragOver(null);
      },
      onClick: () => !asking && !arranging && onPreview(c),
      title:
        `${c.name} · ${c.w}×${c.h} ${c.codec} · เพิ่ม ${dateShort(c.added)}` +
        (c.picked ? "" : " · พักไว้ ไม่เข้าหนัง") +
        (arranging
          ? "\nลากสลับกับการ์ดอื่นเพื่อจัดลำดับคลัง"
          : "\nคลิก = ดูตัวอย่าง · ลากไปไทม์ไลน์ = แทรกตรงจุดที่ปล่อย"),
    };

    const grip = arranging && (
      <div
        className={
          row
            ? "text-faint"
            : "absolute right-1 top-1 rounded-md bg-black/70 p-0.5 text-white"
        }
      >
        <GripVertical size={12} />
      </div>
    );

    const tools = arranging ? null : (
      <div
        className={`${
          row ? "flex" : "absolute right-1 top-1 hidden group-hover:flex"
        } gap-1`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd(c);
          }}
          title="เพิ่มลงท้ายไทม์ไลน์"
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            row ? "text-muted hover:bg-panel-3 hover:text-ink" : "bg-black/70 text-white hover:bg-accent"
          }`}
        >
          <Plus size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePick(c);
          }}
          title={
            c.picked
              ? "พักไว้ — ไม่เอาคลิปนี้เข้าหนัง (ไฟล์ยังอยู่)"
              : "เอากลับมาใช้"
          }
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            row ? "text-muted hover:bg-panel-3 hover:text-ink" : "bg-black/70 text-white hover:bg-panel-3"
          }`}
        >
          {c.picked ? <Ban size={12} /> : <Undo2 size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (busy) return flash("มีงานกำลังรันอยู่ — หยุดก่อนถึงจะเอาออกได้");
            setAsk(c.name);
          }}
          title="เอาออกจากคลัง — ย้ายไฟล์เข้าถังขยะ กู้คืนได้"
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            row ? "text-muted hover:bg-danger/20 hover:text-danger" : "bg-black/70 text-white hover:bg-danger"
          }`}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );

    const confirm = asking && (
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/85 px-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10.5px] leading-4 text-white">
          เอาออกจากคลัง?
          <br />
          <span className="text-faint">(ไปนอนในถังขยะ กู้ได้)</span>
          {used > 0 && (
            <>
              <br />
              <span className="text-warn">
                อยู่บนไทม์ไลน์ {used} ชิ้น — จะถูกเอาออกด้วย
              </span>
            </>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              setAsk(null);
              onDelete(c);
            }}
            className="flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-medium text-white"
          >
            <Check size={11} /> เอาออก
          </button>
          <button
            onClick={() => setAsk(null)}
            className="flex items-center gap-1 rounded-md bg-panel-3 px-2 py-1 text-[11px] text-ink"
          >
            <X size={11} /> ยกเลิก
          </button>
        </div>
      </div>
    );

    if (row) {
      return (
        <div
          key={c.name}
          {...common}
          className={`group relative flex items-center gap-2 rounded-lg border px-1.5 py-1 ${
            arranging ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          } ${
            c.picked ? "border-line" : "border-line opacity-40"
          } bg-panel-2 hover:border-line-2 ${
            dragOver === i && dragFrom !== i ? "outline outline-2 outline-accent/70" : ""
          }`}
        >
          <div className="relative aspect-video h-9 shrink-0 overflow-hidden rounded bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(c.name)}
              alt={c.name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] text-ink">{c.name}</div>
            <div className="truncate text-[10px] text-faint">
              {dur(c.dur)} · {c.orient === "V" ? "ตั้ง" : "นอน"} ·{" "}
              {dateShort(c.added)}
              {c.size > 0 && ` · ${(c.size / 1e6).toFixed(0)} MB`}
              {used > 0 && <span className="text-accent"> · ใช้ {used}</span>}
              {!c.picked && <span className="text-warn"> · พักไว้</span>}
            </div>
          </div>
          {tools}
          {grip}
          {confirm}
        </div>
      );
    }

    return (
      <div
        key={c.name}
        {...common}
        className={`group relative overflow-hidden rounded-lg border ${
          arranging ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${
          c.picked ? "border-line" : "border-line opacity-40"
        } bg-panel-2 hover:border-line-2 ${
          dragOver === i && dragFrom !== i ? "outline outline-2 outline-accent/70" : ""
        }`}
      >
        <div className="relative aspect-video bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(c.name)}
            alt={c.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0";
            }}
          />
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
            {dur(c.dur)}
          </span>
          {used > 0 && (
            <span className="absolute left-1 top-1 rounded bg-accent/90 px-1 text-[10px] font-medium text-white">
              ใช้ {used}
            </span>
          )}
          {!c.picked && (
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-warn">
              พักไว้
            </span>
          )}
          {tools}
          {grip}
        </div>
        {grid?.label ? (
          <div
            className="truncate px-1.5 text-[11px] leading-[20px] text-muted"
            style={{ height: LABEL }}
          >
            {sort === "added" ? dateShort(c.added) + " · " : ""}
            {c.name}
          </div>
        ) : (
          // โหมดภาพเล็กไม่มีแถบชื่อถาวร — โผล่ทับล่างของภาพตอนชี้ค้างแทน
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden truncate bg-black/75 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
            {sort === "added" ? dateShort(c.added) + " · " : ""}
            {c.name}
          </div>
        )}
        {confirm}
      </div>
    );
  };

  return (
    <aside
      ref={asideRef}
      className={`relative flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-panel ${
        dropFile ? "border-accent" : "border-line"
      }`}
      onDragOver={(e) => {
        // ไฟล์จากเครื่อง = อัปโหลด · การ์ดในคลังเองไม่นับ (มันไม่มีชนิด Files)
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!uploading) setDropFile(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropFile(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropFile(false);
        if (uploading) return;
        const files = [...e.dataTransfer.files].filter((f) =>
          /\.(mov|mp4|m4v)$/i.test(f.name),
        );
        if (!files.length) return flash("ลากได้เฉพาะไฟล์วิดีโอ .mov .mp4 .m4v");
        startUpload(files);
      }}
    >
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="truncate text-[12.5px] font-medium text-muted">
          คลังคลิป{" "}
          <span className="text-faint">
            ({shown.length !== clips.length ? `${shown.length}/` : ""}
            {clips.length})
          </span>
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setBarOpen((o) => !o)}
          className={`relative ${iconBtn(barOpen || filtered || sort !== "project")}`}
          title="มุมมอง · การเรียง · ตัวกรอง"
        >
          <SlidersHorizontal size={14} />
          {(filtered || sort !== "project") && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
          )}
        </button>
        <button
          onClick={() => {
            setLinkOpen((o) => !o);
            setView("clips");
          }}
          disabled={arranging}
          className={`${iconBtn(linkOpen)} disabled:opacity-30`}
          title={
            arranging
              ? "ออกจากโหมดจัดลำดับก่อน — อ่านคลิปเข้าคลังใหม่จะทับลำดับที่จัดค้างไว้"
              : "อ้างอิงไฟล์ที่อยู่เดิม — ไม่ก๊อปสำเนา ไม่กินดิสก์เพิ่ม"
          }
        >
          <Link2 size={14} />
        </button>
        <button
          onClick={() => setView((v) => (v === "trash" ? "clips" : "trash"))}
          className={`relative ${iconBtn(view === "trash")}`}
          title={`ถังขยะ${trash.length ? ` — ${trash.length} คลิปที่กู้ได้` : " (ว่าง)"}`}
        >
          <Trash2 size={14} />
          {trash.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-warn px-1 text-[9px] font-medium text-black">
              {trash.length}
            </span>
          )}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || busy || arranging}
          className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3 disabled:opacity-50"
          title="เลือกไฟล์วิดีโอเข้าคลัง — หรือลากไฟล์มาวางบนแผงนี้ก็ได้"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          เพิ่มคลิป
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".mov,.mp4,.m4v,video/quicktime,video/mp4"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) startUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {barOpen && view === "clips" && (
        // แถบเดียวที่ตัดขึ้นบรรทัดใหม่เองตามความกว้าง — แผงนี้เตี้ย (ไทม์ไลน์กิน
        // ครึ่งจอ) ทุกบรรทัดที่แถบนี้กินคือแถวคลิปที่หายไปหนึ่งแถว
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1.5">
          <div className="flex items-center gap-0.5">
            {(["xl", "lg", "big", "small"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setLook(k)}
                className={`h-6 w-6 rounded-md text-[11px] font-medium ${
                  look === k
                    ? "bg-panel-3 text-accent"
                    : "text-muted hover:bg-panel-2 hover:text-ink"
                }`}
                title={`${ROWS[k]} แถวพอดีความสูงแผง — ยิ่งน้อยแถว ภาพยิ่งใหญ่`}
              >
                {ROWS[k]}
              </button>
            ))}
            <button
              onClick={() => setLook("list")}
              className={iconBtn(look === "list")}
              title="รายการแถวละคลิป — เห็นวันที่/ขนาด/แนวภาพครบ"
            >
              <Rows3 size={14} />
            </button>
          </div>

          <span className="text-[10px] text-faint">เรียง</span>
          <div
            className={`flex items-center gap-0.5 ${
              arranging ? "pointer-events-none opacity-40" : ""
            }`}
            title={arranging ? "ออกจากโหมดจัดลำดับก่อนถึงจะเปลี่ยนการเรียงได้" : undefined}
          >
            <button onClick={() => setSort("project")} className={chip(sort === "project")}>
              ลำดับโปรเจกต์
            </button>
            <button onClick={() => setSort("added")} className={chip(sort === "added")}>
              วันที่เพิ่ม
            </button>
            <button onClick={() => setSort("dur")} className={chip(sort === "dur")}>
              ความยาว
            </button>
          </div>

          <span className="text-[10px] text-faint">กรอง</span>
          <div
            className={`flex flex-wrap items-center gap-0.5 ${
              arranging ? "pointer-events-none opacity-40" : ""
            }`}
            title={arranging ? "ออกจากโหมดจัดลำดับก่อนถึงจะกรองได้" : undefined}
          >
            {(
              [
                ["all", "ทั้งหมด"],
                ["used", "ที่ใช้แล้ว"],
                ["unused", "ยังไม่ใช้"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} onClick={() => setFUsed(v)} className={chip(fUsed === v)}>
                {t}
              </button>
            ))}
            {(
              [
                ["all", "ทุกแนว"],
                ["H", "นอน"],
                ["V", "ตั้ง"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} onClick={() => setFOrient(v)} className={chip(fOrient === v)}>
                {t}
              </button>
            ))}
          </div>

          {messy && !arranging && (
            <button
              onClick={clearView}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-panel-2 hover:text-ink"
              title="กลับไปเป็นทั้งหมด · ทุกแนว · ลำดับโปรเจกต์ (มุมมองกับความกว้างแผงคงไว้)"
            >
              <FilterX size={12} /> ล้าง
            </button>
          )}

          <div className="flex-1" />
          {grid && (
            <span
              className="text-[10px] text-faint"
              title={
                grid.fit < grid.rows
                  ? `แผงเตี้ยเกินกว่าจะใส่ ${grid.rows} แถวโดยภาพยังดูออก — เลื่อนดูส่วนที่เหลือ หรือลากขอบขวาให้กว้างขึ้น`
                  : `ภาพถูกย่อให้ ${grid.rows} แถวพอดีความสูงแผง`
              }
            >
              {grid.cols}×{grid.fit}
              {grid.fit < grid.rows && <span className="text-warn"> /{grid.rows}</span>}
            </span>
          )}

          {/* ── โหมดจัดลำดับคลัง ── */}
          <div className="flex w-full items-center gap-1.5">
            <button
              onClick={() => (arranging ? leaveArrange() : enterArrange())}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${
                arranging
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:bg-panel-2 hover:text-ink"
              }`}
              title={
                arranging
                  ? "ออกจากโหมดจัดลำดับ"
                  : "จัดลำดับคลัง — สลับเป็นลำดับโปรเจกต์และล้างตัวกรองให้ แล้วลากสลับการ์ดได้"
              }
            >
              <ArrowUpDown size={12} />
              {arranging ? "กำลังจัดลำดับ" : "จัดลำดับคลัง"}
            </button>

            {arranging && !orderDirty && (
              <span className="text-[10px] text-faint">ลากการ์ดสลับที่ได้เลย</span>
            )}
            {orderDirty && (
              <>
                <span className="text-[10px] text-warn">ยังไม่ได้บันทึก</span>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    onRevertOrder();
                    setAskExit(false);
                    if (askExit) setArranging(false);
                  }}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-panel-2 hover:text-ink"
                  title="ทิ้งลำดับที่จัดไว้ กลับไปใช้ของที่บันทึกไว้ล่าสุด"
                >
                  <RotateCcw size={12} /> ทิ้ง
                </button>
                <button
                  onClick={() => {
                    onSaveOrder();
                    setAskExit(false);
                    if (askExit) setArranging(false);
                  }}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-2"
                  title="เขียน [scan] order ลงไฟล์โปรเจกต์"
                >
                  <Save size={12} /> บันทึกลำดับ
                </button>
              </>
            )}
          </div>

          {askExit && (
            <div className="w-full rounded-md bg-warn/10 px-2 py-1 text-[10.5px] leading-4 text-warn">
              ลำดับที่จัดไว้ยังไม่ได้บันทึก — กด &ldquo;บันทึกลำดับ&rdquo; หรือ
              &ldquo;ทิ้ง&rdquo; ก่อนออกจากโหมด
            </div>
          )}
        </div>
      )}

      {linkOpen && (
        <div className="flex flex-col gap-1.5 border-b border-line px-3 py-2">
          <div className="text-[11px] leading-4 text-muted">
            วางที่อยู่ไฟล์หรือทั้งโฟลเดอร์ — เอนจินทำลิงก์ไว้ในโฟลเดอร์ฟุตเทจ
            ไม่ได้ก๊อปไฟล์ (ย้าย/ลบต้นทางแล้วคลิปจะหาย)
          </div>
          <textarea
            value={linkPath}
            onChange={(e) => setLinkPath(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder={"/Users/…/ฟุตเทจ\n/Users/…/IMG_1234.MOV"}
            className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => {
                setLinkOpen(false);
                setLinkPath("");
              }}
              className="rounded-md px-2 py-1 text-[11.5px] text-muted hover:text-ink"
            >
              ยกเลิก
            </button>
            <button
              disabled={linking || !linkPath.trim()}
              onClick={async () => {
                setLinking(true);
                // ทีละบรรทัด — วางหลายที่อยู่รวดเดียวได้ ไม่ต้องกดทีละอัน
                for (const line of linkPath.split("\n").map((x) => x.trim())) {
                  if (line) await onLink(line);
                }
                setLinking(false);
                setLinkPath("");
                setLinkOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-50"
            >
              {linking ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Link2 size={12} />
              )}
              อ้างอิง
            </button>
          </div>
        </div>
      )}

      {ups.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-line px-3 py-2">
          {ups.some((u) => u.error) && !uploading && (
            <button
              onClick={() => setUps([])}
              className="self-end text-[10.5px] text-faint hover:text-ink"
            >
              ล้างรายการที่พลาด
            </button>
          )}
          {ups.map((u) => (
            <div key={u.name} className="text-[11px]">
              <div className="flex justify-between text-muted">
                <span className="truncate">
                  {u.name}
                  {u.as && <span className="text-faint"> → {u.as}</span>}
                </span>
                <span className={u.error ? "text-danger" : "font-mono"}>
                  {u.error ?? `${u.pct}%`}
                </span>
              </div>
              {!u.error && (
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-panel-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${u.pct}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
        {view === "trash" ? (
          trash.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="rounded-xl border border-dashed border-line-2 p-8 text-[12px] leading-5 text-muted">
                ถังขยะว่าง
                <br />
                คลิปที่เอาออกจากคลังจะมานอนรอตรงนี้
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 p-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-muted">
                <span>{trash.length} คลิปที่กู้ได้</span>
                <button
                  onClick={() => onPurge()}
                  className="text-danger hover:underline"
                >
                  เทถังทั้งหมด
                </button>
              </div>
              {trash.map((t) => (
                <div
                  key={t.name}
                  className="rounded-lg border border-line bg-panel-2 px-2 py-1.5"
                >
                  <div className="truncate text-[12px] text-ink">{t.orig}</div>
                  <div className="text-[10.5px] text-faint">
                    {dur(t.dur)} · {(t.size / 1e6).toFixed(0)} MB ·{" "}
                    {dateShort(t.at)}
                    {t.kind === "link" && " · อ้างอิง (ไฟล์ต้นทางไม่ถูกแตะ)"}
                  </div>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      onClick={() => onRestore(t.name)}
                      className="flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-ink hover:bg-panel-3"
                    >
                      <Undo2 size={11} /> กู้คืน
                    </button>
                    <button
                      onClick={() => onPurge(t.name)}
                      className="flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] text-danger hover:bg-danger/20"
                    >
                      <Trash2 size={11} /> ทิ้งถาวร
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : clips.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="rounded-xl border border-dashed border-line-2 p-8 text-[12px] leading-5 text-muted">
              ยังไม่มีคลิปในคลัง
              <br />
              กด &ldquo;เพิ่มคลิป&rdquo; หรือลากไฟล์วิดีโอมาวางตรงนี้
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-[12px] leading-5 text-muted">
              ไม่มีคลิปที่ตรงกับตัวกรอง
              <br />
              <button
                onClick={() => {
                  setFUsed("all");
                  setFOrient("all");
                }}
                className="text-accent hover:underline"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        ) : look === "list" ? (
          <div className="flex flex-col gap-1 p-2">{shown.map(card)}</div>
        ) : (
          <div
            className="grid auto-rows-min p-2"
            style={{
              gap: GAP,
              gridTemplateColumns: `repeat(${grid?.cols ?? 2}, minmax(0, 1fr))`,
            }}
          >
            {shown.map(card)}
          </div>
        )}
      </div>

      {dropFile && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-panel/85 text-[12.5px] font-medium text-accent">
          ปล่อยเพื่อเพิ่มคลิปเข้าคลัง
        </div>
      )}

      {/* ขอบขวา = ที่จับขยายแผง */}
      <div
        onPointerDown={startResize}
        onDoubleClick={() => {
          applyWidth(288);
          try {
            localStorage.setItem(KEY_W, "288");
          } catch {
            /* จำไม่ได้ก็ไม่เป็นไร */
          }
        }}
        title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = กลับค่าเริ่มต้น"
        className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
      />
    </aside>
  );
}
