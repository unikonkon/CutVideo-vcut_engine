"use client";

import { useMemo, useState } from "react";
import { Captions, CheckSquare, Square } from "lucide-react";
import { type FxTextItem } from "@/lib/api";
import { dur } from "@/lib/time";
import { Empty, Panel, SaveBar, Section, Spin, TInput, Toggle } from "@/components/ui";
import type { FxStore, SpeechLine } from "./types";

/** ข้อความที่มาจากบทพูดติดรหัสไว้ที่ช่อง id — ติ๊กออกแล้วลบถูกชิ้นเสมอ
 *  แม้ปิดโปรเจกต์ไปแล้วเปิดใหม่ (เอนจินเก็บ id ตามที่ส่งไป ไม่เขียนทับ) */
const TR_ID = (id: string) => `tr:${id}`;

// ลอกหน้าตาจากสไตล์กลางของขั้น 5 ตอนสร้างชิ้น ไม่ใช่ไปอ้างอิงตอน render
// (ไม่งั้นแก้สไตล์กลางทีหลังแล้วบรรทัดที่จัดไว้เรียบร้อยเปลี่ยนหน้าตายกเรื่อง)
const STYLE_KEYS = [
  "font", "size", "color", "outline", "border", "shadow",
  "bold", "italic", "spacing",
] as const;

/** บทพูดที่ถอดไว้ = จุดเดียวที่หยิบคำพูดขึ้นไปเป็นตัวหนังสือบนหนัง
 *
 *  เดิมแท็บนี้เป็นรายการอ่านอย่างเดียว (สรุป · โหลด .srt · ลากลงไทม์ไลน์) ส่วน
 *  การเลือกบรรทัดไปใส่จริงอยู่ที่แท็บข้อความ — คนละที่กับที่คนไปหาบทพูด ตอนนี้
 *  ย้ายมารวมที่นี่ที่เดียว แท็บข้อความเหลือไว้ดูแลตัวหนังสือที่วางเอง
 *
 *  บรรทัดที่ติ๊กจะกลายเป็นข้อความของ **ขั้น 5** (fx.json) ตรงเวลาที่พูดจริง
 *  ไม่ใช่ซับขั้น 4 — จัดตำแหน่ง/สไตล์รายบรรทัดต่อได้ที่แท็บข้อความ
 */
export default function TranscriptPanel({
  speech,
  fxs,
}: {
  speech: SpeechLine[];
  fxs: FxStore;
}) {
  const [filter, setFilter] = useState("");

  const texts = fxs.draft?.texts ?? [];
  // บรรทัดไหนถูกใส่ลงหนังไปแล้วบ้าง — ตัดสินสถานะติ๊กของทุกแถวจากตรงนี้ที่เดียว
  const fromSpeech = useMemo(() => {
    const m = new Set<string>();
    texts.forEach((t) => {
      if (t.id.startsWith("tr:")) m.add(t.id.slice(3));
    });
    return m;
  }, [texts]);

  if (!fxs.data || !fxs.draft) {
    return (
      <Panel title={<><Captions size={13} /> บทพูดที่ถอดไว้</>}>
        <Spin />
      </Panel>
    );
  }

  const { data, draft } = fxs;

  const subLike = (ln: SpeechLine): FxTextItem => {
    const base = data.defaults.text_item as Omit<
      FxTextItem,
      "at" | "dur" | "id" | "name" | "lines"
    >;
    const gstyle = (data.fx.style ?? {}) as Record<string, unknown>;
    const copied = Object.fromEntries(
      STYLE_KEYS.filter((k) => k in gstyle).map((k) => [k, gstyle[k]]),
    );
    return {
      ...base,
      ...copied,
      text: ln.text,
      name: ln.name,
      at: ln.at,
      dur: Math.max(0.4, ln.dur),
      // วางอย่างซับ: ยึดขอบล่างกลางจอ (align 2) แล้วลากจัดต่อได้ตามใจ
      align: 2,
      x: 0.5,
      y: 0.94,
      anim: "none",
      id: TR_ID(ln.id),
      lines: [],
    };
  };

  const putLines = (lines: SpeechLine[]) => {
    const add = lines.filter((l) => !fromSpeech.has(l.id)).map(subLike);
    if (add.length) fxs.patch({ texts: [...draft.texts, ...add] });
  };
  const dropLines = (ids: string[]) => {
    const kill = new Set(ids.map(TR_ID));
    fxs.patch({ texts: draft.texts.filter((t) => !kill.has(t.id)) });
  };
  const toggleLine = (ln: SpeechLine) =>
    fromSpeech.has(ln.id) ? dropLines([ln.id]) : putLines([ln]);

  const shown = speech.filter(
    (l) => !filter || l.text.includes(filter) || l.name.includes(filter),
  );
  const putCount = speech.filter((l) => fromSpeech.has(l.id)).length;
  const autoSub = Boolean(draft.auto_sub?.enabled);
  const clips = new Set(speech.map((l) => l.name)).size;
  const spoken = speech.reduce((s, l) => s + l.dur, 0);

  return (
    <Panel
      title={<><Captions size={13} /> บทพูดที่ถอดไว้</>}
      width="w-[24rem]"
      footer={
        <SaveBar
          dirty={fxs.dirty}
          saving={fxs.saving}
          onSave={fxs.save}
          onRevert={fxs.revert}
          hint="ยังไม่บันทึก: ข้อความบนหนัง (fx)"
        />
      }
    >
      <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
        <div className="rounded-lg bg-panel-2 px-2.5 py-2">
          <div className="text-lg font-semibold text-ink">{clips}</div>
          <div className="text-muted">คลิปที่มีเสียงพูดในหนัง</div>
        </div>
        <div className="rounded-lg bg-panel-2 px-2.5 py-2">
          <div className="text-lg font-semibold text-ink">{dur(spoken)}</div>
          <div className="text-muted">ความยาวเสียงพูดรวม</div>
        </div>
      </div>

      <Section
        title={`เลือกใส่ลงหนัง (${putCount}/${speech.length})`}
        right={
          <div className="flex items-center gap-1">
            <button
              onClick={() => putLines(shown)}
              disabled={!shown.length}
              className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink hover:bg-panel-3 disabled:opacity-40"
              title="ใส่ทุกบรรทัดที่เห็นอยู่ลงหนัง"
            >
              เลือกทั้งหมด
            </button>
            <button
              onClick={() => dropLines(speech.map((l) => l.id))}
              disabled={!putCount}
              className="rounded-md px-2 py-1 text-[11px] text-muted hover:text-danger disabled:opacity-40"
              title="เอาบรรทัดที่ใส่ไว้ออกจากหนังทั้งหมด (ข้อความที่พิมพ์เองไม่ถูกแตะ)"
            >
              ล้างที่ใส่ไว้
            </button>
          </div>
        }
      >
        {autoSub && (
          <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11px] leading-4 text-warn">
            สวิตช์ &ldquo;ซับอัตโนมัติทั้งกอง&rdquo; ด้านล่างเปิดอยู่ —
            บรรทัดที่ติ๊กใส่จะซ้อนกับซับอีกชั้นตอน Export แบบมีเอฟเฟกต์
            เลือกอย่างใดอย่างหนึ่ง
          </div>
        )}
        {speech.length === 0 ? (
          <Empty>
            ยังไม่มีบทพูดในหนัง — สั่งถอดเสียง (ขั้น 2) แล้วรวมร่าง (ขั้น 3) ก่อน
            แล้วบรรทัดจะมาโผล่ที่นี่
          </Empty>
        ) : (
          <>
            {speech.length > 8 && (
              <TInput value={filter} onChange={setFilter} placeholder="ค้นหาบทพูด/คลิป…" />
            )}
            <div className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
              {shown.map((l) => {
                const on = fromSpeech.has(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLine(l)}
                    className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left ${
                      on ? "border-accent/60 bg-accent/10" : "border-line bg-panel-2"
                    }`}
                    title={on ? "เอาออกจากหนัง" : "ใส่ลงหนังตรงเวลาที่พูดจริง"}
                  >
                    {on ? (
                      <CheckSquare size={13} className="mt-0.5 shrink-0 text-accent" />
                    ) : (
                      <Square size={13} className="mt-0.5 shrink-0 text-faint" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-faint">
                        {dur(l.tl)} · {l.name} @{l.at.toFixed(1)} · {l.dur.toFixed(1)}s
                      </div>
                      <div className="truncate text-[12px] text-ink">{l.text}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-2.5 py-2">
          <div className="min-w-0 pr-2">
            <div className="text-[11.5px] text-ink">ซับอัตโนมัติทั้งกอง (ขั้น 5)</div>
            <div className="text-[10px] leading-4 text-faint">
              เผาบทพูดทุกบรรทัดเป็นซับตอน Export แบบมีเอฟเฟกต์ — ทางลัดแทนการติ๊กทีละบรรทัด
              แต่จัดตำแหน่งรายบรรทัดไม่ได้
            </div>
          </div>
          <Toggle
            value={autoSub}
            onChange={(v) => fxs.patch({ auto_sub: { enabled: v } })}
            label=""
          />
        </div>
        <p className="text-[10px] leading-4 text-faint">
          บรรทัดที่ติ๊กจะไปโผล่ในแท็บ &ldquo;ข้อความ&rdquo; — แก้ถ้อยคำ สไตล์
          และลากจัดตำแหน่งบนจอตัวอย่างต่อได้ที่นั่น
        </p>
      </Section>
    </Panel>
  );
}
