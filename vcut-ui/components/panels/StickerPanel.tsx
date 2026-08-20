"use client";

import { useRef } from "react";
import { Check, Film, ImagePlus, Smile, Trash2 } from "lucide-react";
import { api2, assetUrl, fileToBase64, type FxOverlay } from "@/lib/api";
import { DND_MIME } from "@/lib/layers";
import { STICKER_CATS, STICKER_LIST, stickerUrl } from "@/lib/stickers";
import {
  Empty,
  Field,
  NInput,
  Panel,
  SaveBar,
  Section,
  Sel,
  Spin,
} from "@/components/ui";
import type { FxStore } from "./types";

// ตารางหมากรุกหลังรูป — สติกเกอร์ส่วนใหญ่เป็นสีขาวบนพื้นใส ถ้าวางบนพื้นทึบสีเดียว
// จะแยกไม่ออกว่าส่วนไหนคือตัวรูป ส่วนไหนคือพื้นที่โปร่ง
const CHECKER = {
  backgroundColor: "#2a2a2a",
  backgroundImage:
    "linear-gradient(45deg,#383838 25%,transparent 25%)," +
    "linear-gradient(-45deg,#383838 25%,transparent 25%)," +
    "linear-gradient(45deg,transparent 75%,#383838 75%)," +
    "linear-gradient(-45deg,transparent 75%,#383838 75%)",
  backgroundSize: "10px 10px",
  backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
};

export default function StickerPanel({
  fxs,
  onPlaceAtPlayhead,
  onPlaceSampleAtPlayhead,
  focusIdx,
  flash,
}: {
  fxs: FxStore;
  onPlaceAtPlayhead: (file: string) => void;
  onPlaceSampleAtPlayhead: (file: string) => void;
  focusIdx: number | null;
  flash: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!fxs.data || !fxs.draft) {
    return (
      <Panel title={<><Smile size={13} /> สติกเกอร์ / ภาพซ้อน</>}>
        <Spin />
      </Panel>
    );
  }

  const { data, draft } = fxs;
  const overlays = draft.overlays;

  const animOpts = Object.keys(
    (data.defaults.overlay_anim as Record<string, unknown>) ?? { fade: 1 },
  ).map((k) => ({ v: k, label: k }));

  const patch = (i: number, p: Partial<FxOverlay>) =>
    fxs.patch({ overlays: overlays.map((o, k) => (k === i ? { ...o, ...p } : o)) });

  const upload = async (f: File) => {
    if (f.size > 40 * 1024 * 1024) {
      return flash("ไฟล์ใหญ่เกิน 40 MB — คลัง asset รับไม่ได้");
    }
    try {
      const b64 = await fileToBase64(f);
      const r = await api2.saveAsset(f.name, b64, "media");
      fxs.setData(r.fx);
      flash(`เพิ่ม ${r.file} เข้าคลังแล้ว — คลิกวางที่หัวเล่น หรือลากลงไทม์ไลน์`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
  };

  const used = new Set(overlays.map((o) => o.file));
  // ตัวอย่างที่ถูกยกเข้าคลังของโปรเจกต์ไปแล้ว — โผล่ทั้งสองที่ ติดเครื่องหมายไว้
  // จะได้ไม่อ่านว่ารูปซ้ำกันสองอัน
  const inLib = new Set(data.overlay.assets.map((a) => a.file));

  return (
    <Panel
      title={<><Smile size={13} /> สติกเกอร์ / ภาพซ้อน</>}
      footer={
        <SaveBar
          dirty={fxs.dirty}
          saving={fxs.saving}
          onSave={fxs.save}
          onRevert={fxs.revert}
          hint="FX ยังไม่บันทึก (รวมทุกเลเยอร์)"
        />
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    DND_MIME,
                    JSON.stringify({ type: "sticker", file: a.file }),
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group relative cursor-grab overflow-hidden rounded-lg border border-line bg-black active:cursor-grabbing"
                onClick={() => onPlaceAtPlayhead(a.file)}
                title={`${a.file} (${a.w}×${a.h}) — คลิก=วางที่หัวเล่น · ลากลงไทม์ไลน์=วางตรงจุดนั้น`}
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
                      .then((r) => fxs.setData(r.fx))
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

      <Section
        title={`สติกเกอร์ตัวอย่าง (${STICKER_LIST.length} แบบ · ${STICKER_CATS.length} หมวด)`}
      >
        {STICKER_CATS.map((c) => (
          <div key={c.key} className="flex flex-col gap-1">
            <div className="text-[10.5px] font-medium text-muted">{c.label}</div>
            <div className="grid grid-cols-4 items-start gap-1.5">
              {STICKER_LIST.filter((s) => s.cat === c.key).map((s) => (
                <button
                  key={s.file}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      DND_MIME,
                      JSON.stringify({ type: "sticker-sample", file: s.file }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onPlaceSampleAtPlayhead(s.file)}
                  title={`${s.label} — คลิก=วางที่หัวเล่น · ลากลงไทม์ไลน์=วางตรงจุดนั้น${
                    inLib.has(s.file) ? " (อยู่ในคลังแล้ว)" : ""
                  }`}
                  className="group flex cursor-grab flex-col overflow-hidden rounded-lg border border-dashed border-line-2 active:cursor-grabbing"
                >
                  <div
                    className="relative flex aspect-square w-full min-h-0 items-center justify-center overflow-hidden p-1"
                    style={CHECKER}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stickerUrl(s.file)}
                      alt={s.label}
                      draggable={false}
                      className="max-h-full min-h-0 max-w-full object-contain"
                    />
                    {inLib.has(s.file) && (
                      <Check
                        size={11}
                        className="absolute right-0.5 top-0.5 text-ok"
                      />
                    )}
                  </div>
                  <span className="truncate bg-panel-2 px-1 py-0.5 text-[9.5px] text-muted group-hover:text-ink">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title={`วางอยู่ในหนัง (${overlays.length})`}>
        {overlays.length === 0 ? (
          <Empty>
            ยังไม่มีภาพซ้อน — คลิกรูปในคลังเพื่อวางที่หัวเล่น
            หรือลากรูปไปปล่อยบนไทม์ไลน์ตรงจุดที่ต้องการ
          </Empty>
        ) : (
          overlays.map((o, i) => (
            <div
              key={`${o.file}-${i}`}
              className={`flex flex-col gap-2 rounded-lg border bg-panel-2 p-2.5 ${
                focusIdx === i ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                  {o.file}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  @{o.name || "?"}
                </span>
                <button
                  onClick={() =>
                    fxs.patch({ overlays: overlays.filter((_, k) => k !== i) })
                  }
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
