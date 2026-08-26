"use client";

import { useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  Ban,
  Check,
  Link2,
  List,
  Loader2,
  Plus,
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
  busy: boolean;
  flash: (m: string) => void;
}) {
  const [byDur, setByDur] = useState(false);
  const [ups, setUps] = useState<UpItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ask, setAsk] = useState<string | null>(null); // ชื่อคลิปที่รอยืนยันลบ
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropFile, setDropFile] = useState(false);
  const [view, setView] = useState<"clips" | "trash">("clips");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPath, setLinkPath] = useState("");
  const [linking, setLinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // เรียงตามความยาวเป็นแค่มุมมองสำหรับเลือกของ — ลากจัดลำดับได้เฉพาะลำดับโปรเจกต์
  // เพราะเลขที่ลากในมุมมองที่เรียงใหม่จะไม่ตรงกับตำแหน่งจริงที่ต้องเขียนลง config
  const shown = byDur ? [...clips].sort((a, b) => b.dur - a.dur) : clips;
  const sortable = !byDur;

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

  return (
    <aside
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
        <span className="text-[12.5px] font-medium text-muted">
          คลังคลิป <span className="text-faint">({clips.length})</span>
        </span>
        <div className="flex-1" />
        <button
          className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เรียงตามลำดับโปรเจกต์ (ลากจัดลำดับได้ในมุมมองนี้)"
          onClick={() => setByDur(false)}
        >
          <List size={14} className={byDur ? "" : "text-accent"} />
        </button>
        <button
          className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
          title="เรียงตามความยาว"
          onClick={() => setByDur(true)}
        >
          <ArrowDownWideNarrow size={14} className={byDur ? "text-accent" : ""} />
        </button>
        <button
          onClick={() => {
            setLinkOpen((o) => !o);
            setView("clips");
          }}
          className={`rounded-md p-1.5 hover:bg-panel-2 hover:text-ink ${
            linkOpen ? "text-accent" : "text-muted"
          }`}
          title="อ้างอิงไฟล์ที่อยู่เดิม — ไม่ก๊อปสำเนา ไม่กินดิสก์เพิ่ม"
        >
          <Link2 size={14} />
        </button>
        <button
          onClick={() => setView((v) => (v === "trash" ? "clips" : "trash"))}
          className={`relative rounded-md p-1.5 hover:bg-panel-2 hover:text-ink ${
            view === "trash" ? "text-accent" : "text-muted"
          }`}
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
          disabled={uploading || busy}
          className="ml-1 flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-panel-3 disabled:opacity-50"
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

      {view === "trash" ? (
        trash.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="rounded-xl border border-dashed border-line-2 p-8 text-[12px] leading-5 text-muted">
              ถังขยะว่าง
              <br />
              คลิปที่เอาออกจากคลังจะมานอนรอตรงนี้
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
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
                  {dur(t.dur)} · {(t.size / 1e6).toFixed(0)} MB
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="rounded-xl border border-dashed border-line-2 p-8 text-[12px] leading-5 text-muted">
            ยังไม่มีคลิปในคลัง
            <br />
            กด &ldquo;เพิ่มคลิป&rdquo; หรือลากไฟล์วิดีโอมาวางตรงนี้
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2">
          {shown.map((c, i) => {
            const used = usage.get(c.name) ?? 0;
            const asking = ask === c.name;
            return (
              <div
                key={c.name}
                draggable={!asking}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    DND_MIME,
                    JSON.stringify({ type: "clip", name: c.name }),
                  );
                  if (sortable) e.dataTransfer.setData(REORDER_MIME, String(i));
                  e.dataTransfer.effectAllowed = "copyMove";
                  setDragFrom(sortable ? i : null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragOver={(e) => {
                  if (dragFrom == null || dragFrom === i) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  if (dragFrom == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragFrom !== i) onReorder(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border ${
                  c.picked ? "border-line" : "border-line opacity-40"
                } bg-panel-2 hover:border-line-2 ${
                  dragOver === i && dragFrom !== i
                    ? "outline outline-2 outline-accent/70"
                    : ""
                }`}
                onClick={() => !asking && onPreview(c)}
                title={`${c.name} · ${c.w}×${c.h} ${c.codec}${
                  c.picked ? "" : " · พักไว้ ไม่เข้าหนัง"
                }\nคลิก = ดูตัวอย่าง · ลากไปไทม์ไลน์ = แทรกตรงจุดที่ปล่อย${
                  sortable ? " · ลากสลับกับการ์ดอื่น = จัดลำดับคลัง" : ""
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

                  <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd(c);
                      }}
                      title="เพิ่มลงท้ายไทม์ไลน์"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-accent"
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
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-panel-3"
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
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {asking && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/85 px-2 text-center"
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
                  )}
                </div>
                <div className="truncate px-1.5 py-1 text-[11px] text-muted">
                  {c.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dropFile && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-panel/85 text-[12.5px] font-medium text-accent">
          ปล่อยเพื่อเพิ่มคลิปเข้าคลัง
        </div>
      )}
    </aside>
  );
}
