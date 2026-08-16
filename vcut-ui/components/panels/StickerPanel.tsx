"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, ImagePlus, Smile, Trash2 } from "lucide-react";
import {
  api2,
  assetUrl,
  fileToBase64,
  type FxData,
  type FxOverlay,
} from "@/lib/api";
import {
  Empty,
  Field,
  NInput,
  Panel,
  SaveBar,
  Section,
  Sel,
  Spin,
  Toggle,
} from "@/components/ui";

export default function StickerPanel({
  reloadKey,
  atPlayhead,
  flash,
}: {
  reloadKey: number;
  atPlayhead: () => { name: string; at: number } | null;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<FxData | null>(null);
  const [overlays, setOverlays] = useState<FxOverlay[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api2.fx();
      setData(d);
      setOverlays(d.fx.overlays.map((o) => ({ ...o })));
      setDirty(false);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!data) {
    return (
      <Panel title={<><Smile size={13} /> สติกเกอร์ / ภาพซ้อน</>}>
        <Spin />
      </Panel>
    );
  }

  const animOpts = Object.keys(
    (data.defaults.overlay_anim as Record<string, unknown>) ?? { fade: 1 },
  ).map((k) => ({ v: k, label: k }));

  const patch = (i: number, p: Partial<FxOverlay>) => {
    setOverlays((prev) => prev.map((o, k) => (k === i ? { ...o, ...p } : o)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api2.saveFx({ overlays });
      setData(r.fx);
      setOverlays(r.fx.fx.overlays.map((o) => ({ ...o })));
      setDirty(false);
      flash("บันทึกภาพซ้อนแล้ว — มีผลตอนสร้างไฟล์แบบมีเอฟเฟกต์");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (f: File) => {
    if (f.size > 40 * 1024 * 1024) {
      return flash("ไฟล์ใหญ่เกิน 40 MB — คลัง asset รับไม่ได้");
    }
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "media");
      setData(r.fx);
      flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — กดที่รูปเพื่อวางลงหนัง`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };

  const place = (file: string) => {
    const pos = atPlayhead();
    if (!pos) return flash("เลื่อนหัวเล่นไปตรงช็อตที่จะให้ภาพโผล่ก่อน");
    setOverlays((p) => [
      ...p,
      {
        ...(data.defaults.overlay as Omit<FxOverlay, "at" | "dur" | "id" | "name">),
        file,
        at: Math.round(pos.at * 100) / 100,
        dur: 2.5,
        name: pos.name,
        id: "",
      },
    ]);
    setDirty(true);
    flash(`วาง ${file} ที่ ${pos.name} — ปรับเวลา/ตำแหน่งด้านล่างแล้วกดบันทึก`);
  };

  const used = new Set(overlays.map((o) => o.file));

  return (
    <Panel
      title={<><Smile size={13} /> สติกเกอร์ / ภาพซ้อน</>}
      footer={
        <SaveBar dirty={dirty} saving={saving} onSave={save} onRevert={load} />
      }
    >
      <Section
        title={`คลังภาพ (${data.overlay.assets.length})`}
        right={
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-[11.5px] text-ink hover:bg-panel-3"
          >
            <ImagePlus size={12} /> อัปโหลด
          </button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.mov,.webm,.mp4,.m4v"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {data.overlay.assets.length === 0 ? (
          <Empty>
            ยังไม่มีไฟล์ในคลัง — อัปโหลด PNG/JPG/WebP หรือวิดีโอโปร่งใส
            (MOV/WebM) ≤40MB
          </Empty>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {data.overlay.assets.map((a) => (
              <div
                key={a.file}
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-line bg-black"
                onClick={() => place(a.file)}
                title={`${a.file} (${a.w}×${a.h}) — คลิกเพื่อวางที่หัวเล่น`}
              >
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(a.file)} alt={a.file} className="aspect-square w-full object-contain" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-muted">
                    <Film size={20} />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (used.has(a.file))
                      return flash("ไฟล์นี้ถูกใช้อยู่ — เอาออกจากรายการก่อนลบ");
                    api2
                      .deleteAsset(a.file)
                      .then((r) => setData(r.fx))
                      .catch((err) => flash(err.message));
                  }}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-white hover:bg-danger group-hover:block"
                >
                  <Trash2 size={11} />
                </button>
                <div className="truncate bg-black/60 px-1 py-0.5 text-[9.5px] text-white">
                  {a.file}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`วางอยู่ในหนัง (${overlays.length})`}>
        {overlays.length === 0 ? (
          <Empty>
            ยังไม่มีภาพซ้อน — เลื่อนหัวเล่นไปตรงจังหวะที่ต้องการ
            แล้วคลิกรูปในคลังด้านบน
          </Empty>
        ) : (
          overlays.map((o, i) => (
            <div
              key={`${o.file}-${i}`}
              className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                  {o.file}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  @{o.name || "?"}
                </span>
                <button
                  onClick={() => {
                    setOverlays((p) => p.filter((_, k) => k !== i));
                    setDirty(true);
                  }}
                  className="shrink-0 rounded-md p-1 text-muted hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="โผล่วินาทีที่ (ในคลิป)">
                  <NInput value={o.at} min={0} onChange={(v) => patch(i, { at: v })} />
                </Field>
                <Field label="นานกี่วิ">
                  <NInput value={o.dur} min={0.2} onChange={(v) => patch(i, { dur: v })} />
                </Field>
                <Field label="กว้าง (สัดส่วนจอ)">
                  <NInput value={o.width} step={0.05} min={0.05} max={1} onChange={(v) => patch(i, { width: v })} />
                </Field>
                <Field label="X (0-1)">
                  <NInput value={o.x} step={0.05} min={0} max={1} onChange={(v) => patch(i, { x: v })} />
                </Field>
                <Field label="Y (0-1)">
                  <NInput value={o.y} step={0.05} min={0} max={1} onChange={(v) => patch(i, { y: v })} />
                </Field>
                <Field label="ความทึบ">
                  <NInput value={o.opacity} step={0.1} min={0} max={1} onChange={(v) => patch(i, { opacity: v })} />
                </Field>
                <Field label="แอนิเมชัน" span2>
                  <Sel value={o.anim} onChange={(v) => patch(i, { anim: v })} options={animOpts} />
                </Field>
                <Field label="หมุน (องศา)">
                  <NInput value={o.angle} step={5} onChange={(v) => patch(i, { angle: v })} />
                </Field>
              </div>
            </div>
          ))
        )}
      </Section>
      {data.overlay.missing.length > 0 && (
        <div className="text-[11px] text-danger">
          ไฟล์หาย: {data.overlay.missing.join(", ")}
        </div>
      )}
    </Panel>
  );
}
