"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Circle,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { api2, type JobState, type SetupData, type SetupStep } from "@/lib/api";
import { Panel, Spin } from "@/components/ui";

/** ไปป์ไลน์ทุกขั้น — ทำถึงไหนแล้ว ของที่มีเก่าหรือยัง และกดสั่งได้จากที่นี่
 *
 *  **ของทุกอย่างในแผงนี้เอนจินส่งมาให้อยู่แล้ว หน้าเว็บแค่ไม่เคยวาด** —
 *  /api/setup ส่ง `phases` (คำอธิบายว่าแต่ละขั้นทำอะไร) กับ `steps` (ทำไปแล้ว
 *  หรือยัง · ทำเมื่อไร · สรุปผล · **ค่าตั้งตัวไหนเปลี่ยนไปหลังจากทำครั้งนั้น**)
 *  มาตั้งแต่แรก แต่ฝั่งหน้าเว็บประกาศเป็น `unknown[]` แล้วทิ้งทั้งสองก้อน
 *
 *  ก้อนที่ขาดไปเจ็บที่สุดคือ `changed` — มันคือคำตอบของ "กดสร้างแล้วทำไมได้ของ
 *  เดิม": ขั้นนั้นไม่ได้เก่า เพราะค่าที่แก้ไม่ได้อยู่ในรายการที่ขั้นนั้นสนใจ
 *
 *  **ไม่คิดสถานะเองสักข้อ** — "ขั้นนี้ถูกปิดอยู่ไหม" เคยถูกเดาซ้ำที่ฝั่งหน้าเว็บ
 *  แล้วเดาไม่ตรงกับที่เอนจินทำจริง (ดู settings.step_status) ที่นี่จึงอ่าน
 *  run/skip ที่ส่งมาตรง ๆ
 */
export default function PipelinePanel({
  reloadKey,
  job,
  onRun,
}: {
  reloadKey: number;
  job: JobState | null;
  onRun: (step: string) => void;
}) {
  const [data, setData] = useState<SetupData | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api2.setup());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  // reloadKey ขยับทุกครั้งที่งานของเอนจินจบ (ดู page.tsx) — สถานะทุกขั้นจึง
  // ตามเองหลังกดรัน โดยไม่ต้องมีตัวเฝ้า job เป็นของแผงนี้อีกชุด
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const running = !!job?.running;

  if (!data) {
    return (
      <Panel title={<><Layers size={13} /> ไปป์ไลน์</>}>
        {err ? (
          <div className="text-[12px] text-muted">
            เอนจินไม่ตอบ — เปิด ./vcut view ไว้หรือยัง
          </div>
        ) : (
          <Spin />
        )}
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <>
          <Layers size={13} /> ไปป์ไลน์
          <span className="ml-1 text-[10.5px] text-faint">
            {data.phases.length} ขั้น
          </span>
        </>
      }
      width="w-[24rem]"
      resize={{ key: "vcut.w.pipeline", min: 320, max: 760, def: 384 }}
    >
      {data.phases.map((ph) => {
        const live = running && job?.step === ph.id;
        const runnable = ph.steps.filter((s) => s.run).length;
        return (
          <section
            key={ph.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2 p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-panel-3 text-[11px] font-semibold text-ink">
                {ph.no}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                {ph.label}
              </span>
              <button
                disabled={running || runnable === 0}
                onClick={() => onRun(ph.id)}
                title={
                  runnable === 0
                    ? "ทุกขั้นในนี้ถูกปิดหรือข้ามไว้"
                    : `สั่ง ${runnable} ขั้นในกลุ่มนี้ — ขั้นที่ถูกข้ามจะไม่ถูกสั่ง`
                }
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40"
              >
                {live ? (
                  <Loader2 size={11} className="animate-spin text-accent" />
                ) : (
                  <Play size={11} />
                )}
                รันขั้นนี้
              </button>
            </div>

            <p className="text-[10.5px] leading-4 text-faint">{ph.why}</p>

            <div className="flex flex-col">
              {ph.steps.map((s) => (
                <StepRow
                  key={s.id}
                  s={s}
                  fields={data.fields}
                  busy={running}
                  live={running && job?.step === s.id}
                  onRun={onRun}
                />
              ))}
            </div>
          </section>
        );
      })}
    </Panel>
  );
}

/** สถานะสี่แบบของหนึ่งขั้น — เรียงตามลำดับที่ต้องตอบก่อน
 *
 *  ปิดอยู่ ต้องมาก่อน "ยังไม่ได้ทำ" เสมอ: ขั้นที่ถูกปิดไว้จะไม่มีไฟล์ผลลัพธ์
 *  ตลอดกาล ถ้าโชว์ว่า "ยังไม่ได้ทำ" คนจะไล่กดมันทุกครั้งที่เปิดหน้านี้
 */
function stateOf(s: SetupStep) {
  if (!s.run) {
    return { key: "off", icon: Ban, cls: "text-faint", label: s.skip };
  }
  if (!s.exists) {
    return { key: "todo", icon: Circle, cls: "text-muted", label: "ยังไม่ได้ทำ" };
  }
  if (s.changed.length) {
    return {
      key: "stale",
      icon: TriangleAlert,
      cls: "text-warn",
      label: `ของที่มีเก่าแล้ว — ค่าเปลี่ยนไป ${s.changed.length} ตัว`,
    };
  }
  return { key: "done", icon: Check, cls: "text-ok", label: "ทำแล้ว" };
}

function when(t: number) {
  if (!t) return "";
  return new Date(t * 1000).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StepRow({
  s,
  fields,
  busy,
  live,
  onRun,
}: {
  s: SetupStep;
  fields: SetupData["fields"];
  busy: boolean;
  live: boolean;
  onRun: (step: string) => void;
}) {
  const st = stateOf(s);
  const Icon = live ? Loader2 : st.icon;
  // ค่าที่เปลี่ยนไป — บอกเป็น *ชื่อที่คนอ่านออก* ไม่ใช่คีย์ดิบ
  //
  // แต่ที่เอนจินเฝ้าไว้บางตัวเป็น *ตารางทั้งตาราง* ("talk" = ทุกค่าในกลุ่มช่วงพูด)
  // ซึ่งไม่มีช่องชื่อนั้นในฟอร์ม  ใส่วงเล็บเหลี่ยมแบบ TOML ให้รู้ว่านี่คือชื่อกลุ่ม
  // ไม่ใช่ชื่อช่องที่หาไม่เจอ
  const why = s.changed
    .map((k) => fields.find((f) => f.key === k)?.label ?? `[${k}]`)
    .join(" · ");

  return (
    <div className="flex items-center gap-2 border-t border-line/50 py-1.5 first:border-t-0">
      <Icon
        size={12}
        className={`shrink-0 ${live ? "animate-spin text-accent" : st.cls}`}
      />
      <span className="w-[5.5rem] shrink-0 truncate text-[11.5px] text-ink">
        {s.label}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[10.5px] text-faint"
        title={why ? `ค่าที่เปลี่ยนไป: ${why}` : st.label + (s.summary ? ` · ${s.summary}` : "")}
      >
        {/* ขั้นที่ถูกปิดไว้แต่ *มีไฟล์อยู่* — บอกทั้งสองอย่าง ไม่ใช่บอกแค่ว่าปิด
            (เพิ่งกดสร้างไฟล์นี้เองแล้วแถวขึ้นว่า "ปิดไว้" เฉย ๆ อ่านแล้วเหมือน
            ไม่ได้ทำอะไรเลย) */}
        {st.key === "off"
          ? s.skip + (s.exists ? ` · มีไฟล์จาก ${when(s.mtime)}` : "")
          : st.key === "stale"
            ? why || st.label
            : s.summary || (s.exists ? when(s.mtime) : st.label)}
      </span>
      <button
        disabled={busy || !s.run}
        onClick={() => onRun(s.id)}
        title={
          s.run
            ? `สั่ง "${s.label}" ขั้นเดียว` +
              (s.exists ? ` · ทำไว้เมื่อ ${when(s.mtime)}` : "")
            : s.skip
        }
        className="shrink-0 rounded-md p-1 text-faint hover:bg-panel-3 hover:text-ink disabled:opacity-30"
      >
        <RefreshCw size={11} />
      </button>
    </div>
  );
}
