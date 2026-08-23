"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckSquare,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Music,
  Scissors,
  Square,
  Trash2,
  Type,
  Zap,
} from "lucide-react";
import {
  api2,
  type ReviewData,
  type ReviewOp,
  type ReviewTask,
} from "@/lib/api";
import { Empty, Panel, Section, Spin, TInput } from "@/components/ui";

/** ไอคอน + สีประจำชนิดข้อเสนอ — ชนิดไหนแตะไฟล์ไหน คนอ่านต้องรู้ตั้งแต่ตาแรก */
const LOOK: Record<string, { icon: typeof Bot; tone: string }> = {
  drop: { icon: Trash2, tone: "text-danger" },
  move: { icon: ArrowRight, tone: "text-accent" },
  trim: { icon: Scissors, tone: "text-warn" },
  music: { icon: Music, tone: "text-accent" },
  sfx: { icon: Zap, tone: "text-warn" },
  sticker: { icon: ImageIcon, tone: "text-ok" },
  text: { icon: Type, tone: "text-ok" },
};

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** พาดหัวของข้อเสนอหนึ่งข้อ — บอกให้ครบว่าจะเกิดอะไรตรงไหน */
function opTitle(op: ReviewOp) {
  if (op.op === "drop") return `เอาช็อต ${(op.at ?? 0) + 1} ออก · ${op.name}`;
  if (op.op === "move")
    return `ย้ายช็อต ${(op.at ?? 0) + 1} → ตำแหน่ง ${(op.to ?? 0) + 1}`;
  if (op.op === "trim")
    return `ช็อต ${(op.at ?? 0) + 1} · ตัด${op.side === "head" ? "หัว" : "ท้าย"} ` +
      `${op.cut?.toFixed(1)} วิ (${op.was?.toFixed(1)} → ${op.dur?.toFixed(1)} วิ)`;
  if (op.op === "text") return `“${op.text}”`;
  return `${op.label || op.file}`;
}

export default function ReviewPanel({
  reloadKey,
  busy,
  onRun,
  applyOps,
  flash,
}: {
  reloadKey: number;
  busy: boolean;
  onRun: (context: string, force: boolean, tasks?: ReviewTask[]) => void;
  applyOps: (ops: ReviewOp[]) => Promise<{ done: number[]; failed: string[] }>;
  flash: (m: string) => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [context, setContext] = useState("");
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<ReviewTask[] | null>(null);
  const [key, setKey] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api2.review();
      setData(d);
      setContext((c) => c || d.context_default);
      setPicked((p) => p ?? d.tasks_default ?? ["cut"]);
      setApplied(new Set());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const ops = useMemo(() => data?.ops ?? [], [data]);
  const left = useMemo(
    () => ops.filter((o) => !applied.has(o.id ?? -1)),
    [ops, applied],
  );

  if (!data) {
    return (
      <Panel title={<><Bot size={13} /> AI Review</>}>
        <Spin />
      </Panel>
    );
  }

  const tasksAll = data.tasks_all ?? [{ id: "cut" as const, label: "เอาออก / สลับที่", fx: false, web: false }];
  const sel = picked ?? ["cut"];
  const gemini = data.provider === "gemini";
  const needKey = gemini && !data.gemini?.ok;
  const perTask = data.tasks ?? {};

  const toggle = (t: ReviewTask) =>
    setPicked((p) => {
      const cur = p ?? [];
      return cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    });

  const take = async (list: ReviewOp[]) => {
    if (!list.length) return;
    setWorking(true);
    try {
      const r = await applyOps(list);
      if (r.done.length) {
        setApplied((p) => {
          const n = new Set(p);
          r.done.forEach((i) => n.add(i));
          return n;
        });
      }
      const edl = list.some((o) => ["drop", "move", "trim"].includes(o.op));
      const fx = list.some((o) => !["drop", "move", "trim"].includes(o.op));
      flash(
        `ใช้ข้อเสนอ ${r.done.length} ข้อแล้ว` +
          (r.failed.length ? ` · ข้าม ${r.failed.length} (${r.failed[0]})` : "") +
          ` — อย่าลืมกดบันทึก${edl && fx ? " EDL และ FX" : edl ? " EDL" : " FX"}`,
      );
    } finally {
      setWorking(false);
    }
  };

  const saveKey = async () => {
    try {
      const r = await api2.saveAiKey(key.trim());
      setKey("");
      setData((d) => (d ? { ...d, gemini: { ...(d.gemini ?? { hint: "" }), ...r } } : d));
      flash(r.ok ? "เก็บ API key แล้ว (.vcut/secrets.json)" : "ลบ API key แล้ว");
    } catch (e) {
      flash(e instanceof Error ? e.message : "เก็บ key ไม่สำเร็จ");
    }
  };

  return (
    <Panel title={<><Bot size={13} /> AI ดูหนังที่ตัดแล้ว</>} width="w-[24rem]">
      <Section title="ให้ AI ทำอะไรบ้าง">
        <div className="flex flex-col gap-1">
          {tasksAll.map((t) => {
            const on = sel.includes(t.id);
            const note = perTask[t.id]?.note;
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left ${
                  on ? "border-accent/60 bg-accent/10" : "border-line bg-panel-2"
                }`}
              >
                {on ? (
                  <CheckSquare size={13} className="mt-0.5 shrink-0 text-accent" />
                ) : (
                  <Square size={13} className="mt-0.5 shrink-0 text-faint" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink">{t.label}</div>
                  <div className="text-[10px] leading-4 text-faint">
                    {t.fx
                      ? "ลงชั้นแต่งหนัง (ขั้น 5) — ไม่ต้องตัดวิดีโอใหม่"
                      : t.id === "trim"
                        ? "ตัดไทม์ไลน์ตามช่วงเงียบที่วัดไว้ — ต้อง render ชิ้นนั้นใหม่"
                        : "แก้ไทม์ไลน์ — ไม่ต้องตัดวิดีโอใหม่"}
                    {note ? ` · รอบก่อน: ${note}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="สั่งดู">
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="บริบทเพิ่มเติม เช่น 'เน้นกระชับ เอาช็อตซ้ำออก'…"
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={() => onRun(context, data.has === true, sel)}
          disabled={busy || !sel.length || needKey}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-accent/90 py-2 text-[12.5px] font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
          {data.has ? `ให้ AI ดูใหม่ (${sel.length} งาน)` : `ให้ AI ดูหนัง (${sel.length} งาน)`}
        </button>
        <div className="text-[11px] leading-4 text-muted">
          {gemini
            ? `ใช้ Gemini API — ${data.gemini?.ok ? `key จาก ${data.gemini.from}` : "ยังไม่มี key"}`
            : "ใช้ Claude CLI ในเครื่อง — ใช้เวลาหลายนาทีและเสียโควตา"}
          {" · เลือกเจ้าไหนตั้งที่แท็บตั้งค่า"}
        </div>
        {needKey && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-warn/30 bg-warn/10 p-2">
            <div className="flex items-center gap-1.5 text-[11.5px] text-warn">
              <KeyRound size={12} /> ยังไม่มี Gemini API key
            </div>
            <div className="text-[10px] leading-4 text-faint">
              {data.gemini?.hint}
            </div>
            <div className="flex gap-1.5">
              <TInput value={key} onChange={setKey} placeholder="วาง API key…" mono />
              <button
                onClick={saveKey}
                disabled={!key.trim()}
                className="shrink-0 rounded-lg border border-line bg-panel-2 px-2.5 text-[11.5px] text-ink hover:bg-panel-3 disabled:opacity-40"
              >
                เก็บไว้
              </button>
            </div>
          </div>
        )}
      </Section>

      {data.has && (
        <Section
          title={`ข้อเสนอ (${left.length}${ops.length !== left.length ? `/${ops.length}` : ""})`}
          right={
            left.length > 0 ? (
              <button
                onClick={() => take(left)}
                disabled={working || data.stale}
                className="flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink hover:bg-panel-3 disabled:opacity-40"
                title="ใช้ข้อเสนอที่เหลือทั้งหมดในครั้งเดียว"
              >
                {working ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                รับทั้งหมด
              </button>
            ) : undefined
          }
        >
          {data.summary && (
            <div className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[11.5px] leading-5 text-muted">
              {data.summary}
            </div>
          )}
          {data.stale && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-[11.5px] text-warn">
              ไทม์ไลน์ถูกแก้หลังจาก AI ดู — ตำแหน่งอาจเลื่อน ควรรันใหม่ก่อนใช้
            </div>
          )}
          {ops.length === 0 ? (
            <Empty>AI ไม่มีข้อเสนอ — หนังผ่านตามที่เป็นอยู่</Empty>
          ) : (
            ops.map((op, i) => {
              const id = op.id ?? i;
              const look = LOOK[op.op] ?? LOOK.move;
              const Icon = look.icon;
              const isOn = applied.has(id);
              return (
                <div
                  key={id}
                  className={`flex flex-col gap-1 rounded-lg border border-line bg-panel-2 p-2.5 ${
                    isOn ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-1.5 text-[12px] text-ink">
                    <Icon size={12} className={`mt-0.5 shrink-0 ${look.tone}`} />
                    <span className="min-w-0 flex-1">{opTitle(op)}</span>
                    {op.tl != null && (
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        {mmss(op.tl)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] leading-4 text-muted">{op.why}</div>
                  {!isOn && (
                    <button
                      onClick={() => take([op])}
                      disabled={working}
                      className="mt-1 flex items-center justify-center gap-1 rounded-md border border-line bg-panel-3 py-1 text-[11.5px] text-ink hover:bg-line-2 disabled:opacity-40"
                    >
                      <Check size={11} /> ใช้ข้อเสนอนี้
                    </button>
                  )}
                </div>
              );
            })
          )}
        </Section>
      )}
    </Panel>
  );
}
