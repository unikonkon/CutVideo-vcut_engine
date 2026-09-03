"use client";

// แท็บ วิธีเลือกชิ้น + ลำดับ (CPICK) — [compose] mode กับ [order] mode เป็นการ์ดให้กดเลือก
//
// การ์ดกับตัวเลือกมาจาก field compose.mode / order.mode ของเอนจิน (options · labels ·
// helps) ไม่ได้เขียนรายการเอง — ช่องย่อยในการ์ดผูกกับคีย์ที่ help ของเอนจินบอกว่าใช้
// กับโหมดนั้น (budget → talk/broll_minutes · pattern → pattern/target_minutes/run_max)

import type { ReactNode } from "react";
import { api, api3 } from "@/lib/api";
import { useEngine } from "@/hooks/engine";
import { Btn, Cost, Fld, Kv, Led, Mono, SecHead, Tag, Tog, Well } from "@/components/instrument";
import { AdvFrame, FieldInput, HeadBadge, bars, tierRank, worstTier, type TabProps } from "./shared";

/** คำอธิบายสั้นบนการ์ด — สำรองเมื่อ field ไม่มี label ให้ */
const MODE_NOTE: Record<string, string> = {
  all: "ทุกชิ้นที่ keep ในคลัง",
  ai: "ให้ AI เลือก (--ask + โจทย์)",
};

export default function Pick(p: TabProps) {
  const { setup, draft, val, put, field } = p;
  const eng = useEngine();
  const running = !!eng.job?.running;
  const n = Object.keys(draft).length;

  const modeF = field("compose.mode");
  const orderF = field("order.mode");
  const mode = String(val("compose.mode") ?? "");
  const order = String(val("order.mode") ?? "");
  const modes = modeF?.options ?? [];
  const orders = orderF?.options ?? [];

  /** ช่องย่อยในการ์ด — label เป็นชื่อคีย์สั้น (ตัด compose. ออก) ตาม mockup */
  const sub = (k: string, label?: string) => {
    const f = field(k);
    if (!f) return null;
    return (
      <Fld key={k} label={label ?? k.replace(/^compose\./, "")} chg={k in draft} title={f.help ?? f.label}>
        <FieldInput f={f} value={val(k)} onChange={(v) => put(k, v)} help={false} />
      </Fld>
    );
  };

  const modeBody = (id: string): ReactNode => {
    switch (id) {
      case "budget":
        return (
          <>
            {sub("compose.talk_minutes")}
            {sub("compose.broll_minutes")}
          </>
        );
      case "pattern":
        return (
          <>
            {sub("compose.pattern")}
            {sub("compose.target_minutes")}
            {sub("broll.run_max", "broll.run_max")}
          </>
        );
      case "numbers":
        return sub("compose.numbers");
      case "timerange":
        return (
          <>
            {sub("compose.from", "from")}
            {sub("compose.to", "→ to")}
          </>
        );
      case "manual":
        return sub("compose.manual");
      case "ai":
        return (
          <>
            <Mono className="kv" style={{ fontSize: 10 }}>
              ใช้ shot_scoring · ต้องมี ai.json
            </Mono>
            {sub("compose.context", "context")}
            {sub("compose.ask_max", "ask_max")}
          </>
        );
      default:
        return (
          <Mono className="kv" style={{ fontSize: 10 }}>
            {MODE_NOTE[id] ?? ""}
          </Mono>
        );
    }
  };

  const card = (id: string, on: boolean, name: string, desc: string, body: ReactNode, onClick?: () => void, dim?: boolean) => (
    <Well key={id} sel={on} onClick={onClick} style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, opacity: dim ? 0.5 : 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Led on={on} />
        <Mono style={{ fontSize: 12, fontWeight: 700, color: on ? "var(--amber)" : undefined }}>{name}</Mono>
      </div>
      <Kv style={{ fontSize: 10.5, lineHeight: "14px" }}>{desc}</Kv>
      {body}
    </Well>
  );

  const pickKeys = setup.fields.filter((f) => /^(compose|order)\./.test(f.key)).map((f) => f.key);
  const worst = worstTier(setup, pickKeys);
  const worstRank = tierRank(setup, worst);

  // สวิตช์จริงที่มีในเอนจิน — mockup วาด keep_jump_together กับ select.prefer_bright
  // ซึ่งไม่มีคีย์ในรุ่นนี้ จึงใช้ bool ของ [compose]/[order] ที่มีจริงแทน
  const toggles = ["compose.avoid_adjacent", "order.reverse"].map((k) => ({ k, f: field(k) })).filter((x) => x.f);

  const recompose = async () => {
    const vals = { ...draft };
    if (n && !(await p.save())) return;
    // เอนจินบันทึก values ที่ส่งไปด้วยอยู่แล้ว (ส่งซ้ำไม่เป็นไร) แล้วสั่ง compose เข้าคิวงาน
    const ok = await eng.track("compose", () => api3.compose({ values: vals }));
    if (ok) eng.flash("สั่ง compose แล้ว — จบแล้วกด ต่อไฟล์ (assemble) เพื่อได้หนังใหม่จาก cache");
  };

  const undo = async () => {
    try {
      await api.undo();
      await eng.refresh();
      eng.flash("ย้อน edl กลับไปรอบก่อนแล้ว");
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "ย้อนไม่ได้");
    }
  };

  const footer = (
    <>
      <Btn sm on disabled={!n || p.saving} onClick={() => void p.save()}>
        บันทึก · compose.* order.*
      </Btn>
      <Btn sm disabled={running || p.saving} onClick={() => void recompose()} title="บันทึกค่าที่แก้ แล้วรวมร่างใหม่จากคลังชิ้น (ไม่ตัดใหม่)">
        จัดใหม่ · compose → assemble
      </Btn>
      <Btn sm disabled={running} onClick={() => void undo()} title="กลับไปใช้ edl.json รอบก่อนหน้า">
        ↶ ย้อน edl ก่อนหน้า
      </Btn>
      <div style={{ flex: 1 }} />
      <Kv style={{ fontSize: 10 }}>หลัง compose เสร็จ ต้องต่อไฟล์ใหม่ (assemble)</Kv>
      <Btn sm off disabled={!n} onClick={p.discard}>
        ทิ้ง
      </Btn>
    </>
  );

  return (
    <AdvFrame
      sub={`[compose] mode ${modes.length} แบบ · [order] mode ${orders.length} แบบ — บันทึกแล้วกด 'จัดใหม่' ต่อไฟล์ใหม่จาก cache`}
      badge={<HeadBadge>MODE {mode || "—"} · ORDER {order || "—"}</HeadBadge>}
      draftN={n}
      onClose={p.onClose}
      footer={footer}
    >
      {!modeF ? (
        <Kv>เอนจินไม่ส่ง field compose.mode มา</Kv>
      ) : (
        <>
          <SecHead tag="COMPOSE MODE" title="จะเอาชิ้นไหน" size={14} kv={modeF.help} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {modes.map((id) => card(id, mode === id, id, modeF.labels?.[id] ?? MODE_NOTE[id] ?? id, modeBody(id), () => put("compose.mode", id)))}
            {card("—", false, "—", "", <Kv style={{ fontSize: 10 }}>เลือกได้แบบเดียวต่อครั้ง · แบบ A–D ของตัดง่าย = all / budget / pattern / caption</Kv>, undefined, true)}
          </div>
        </>
      )}

      {orderF && (
        <>
          <SecHead tag="ORDER MODE" title="เรียงยังไง" size={14} />
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, orders.length)}, minmax(0, 1fr))`, gap: 8 }}>
            {orders.map((id) =>
              card(
                id,
                order === id,
                id,
                orderF.labels?.[id] ?? id,
                <Kv style={{ fontSize: 10, lineHeight: "13px" }}>
                  {orderF.helps?.[id] ?? ""}
                  {id === "pick" && Boolean(val("ai.apply.order")) ? " · ai.apply.order ON" : ""}
                </Kv>,
                () => put("order.mode", id),
              ),
            )}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        {toggles.map(({ k, f }) => (
          <Tog key={k} on={Boolean(val(k))} onChange={(v) => put(k, v)} label={<span style={k in draft ? { color: "var(--amber)" } : undefined}>{k} · {f!.label}</span>} title={f!.help} />
        ))}
        <Kv style={{ fontSize: 10 }} title="mockup วาดไว้ แต่เอนจินรุ่นนี้ไม่มีคีย์สองตัวนี้">
          keep_jump_together · prefer_bright — ไม่มีในเอนจินรุ่นนี้
        </Kv>
        <div style={{ flex: 1 }} />
        <Cost n={bars(worstRank)} />
        <Tag>
          {worst} · rank {worstRank}
        </Tag>
      </div>
    </AdvFrame>
  );
}
