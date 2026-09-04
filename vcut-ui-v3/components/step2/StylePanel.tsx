"use client";

// แผงซ้ายของขั้น ② — สูตร 4 แบบจากเอนจิน (RECIPES ที่มี style) + กำหนดเอง
//
// การ์ด A–D วางค่าทั้งชุดของ preset (รวม [autofx] ที่เลือกชั้นแต่งให้เอง) ลงร่าง
// กำหนดเอง = แก้สวิตช์ทีละตัว  ทั้งสองทางแก้เพิ่มได้อีกหลังตัดเสร็จในขั้น ③

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Btn, Keys, Kv, Led, Panel, Sel, TIn, Tag, Tog, Well } from "@/components/instrument";
import type { SetupField, SetupRecipe } from "@/lib/api";
import { bool, strs, useStep2 } from "./state";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type StyledRecipe = SetupRecipe & { style: string; shot?: string };

/** ภาพประจำการ์ด — A การ์ดแดง · B เลขนับ · C เส้นโค้ง · D ครึ่งจอ */
function Art({ style }: { style: string }) {
  const base: CSSProperties = { height: 84, borderRadius: 8, background: "var(--well)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, overflow: "hidden" };
  if (style === "A")
    return (
      <div style={{ ...base, background: "linear-gradient(135deg,#5a0c18,#2a0810)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>คลิป VDO ของคุณ</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#ff5d6c" }}>ดูเจ๋ง ได้เนี่ย</span>
      </div>
    );
  if (style === "B")
    return (
      <div style={base}>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--amber-hi)" }}>255.9K</span>
      </div>
    );
  if (style === "C")
    return (
      <div style={base}>
        <svg width="110" height="28" viewBox="0 0 120 30" fill="none">
          <path d="M6 6 C 40 6 40 24 74 24 L 114 24" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  if (style === "D")
    return (
      <div style={{ ...base, flexDirection: "row", gap: 6, padding: 10 }}>
        <span style={{ flex: 1, height: "100%", borderRadius: 4, background: "#2a3a5c" }} />
        <span style={{ flex: 1, height: "100%", borderRadius: 4, background: "var(--amber-dim)" }} />
      </div>
    );
  return (
    <div style={base}>
      <span style={{ fontSize: 26, color: "var(--muted)" }}>⚙</span>
    </div>
  );
}

/** ชิปบอกว่าสูตรนี้เปิดชั้นไหนให้เอง */
function layerChips(values: Record<string, unknown>) {
  const out: string[] = [];
  if (bool(values["autofx.hook"])) out.push("HOOK");
  if (bool(values["autofx.card"])) out.push("การ์ดปิด");
  if (bool(values["autofx.sub"])) out.push("ซับ");
  if (values["autofx.music"]) out.push("เพลง");
  if (bool(values["autofx.burst"])) out.push("ยิงรัว");
  return out;
}

function Card({ sel, onClick, art, title, sub, chips, tip }: { sel: boolean; onClick: () => void; art: ReactNode; title: ReactNode; sub: ReactNode; chips: string[]; tip?: string }) {
  return (
    <Well sel={sel} onClick={onClick} title={tip} style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {art}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Led on={sel} />
        <span className="truncate" style={{ fontSize: 13.5, fontWeight: 500 }}>
          {title}
        </span>
      </div>
      <Kv className="truncate" style={{ fontSize: 11.5 }}>
        {sub}
      </Kv>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 18 }}>
        {chips.map((c) => (
          <span key={c} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "rgba(90,176,255,.14)", color: "var(--amber-hi)" }}>
            {c}
          </span>
        ))}
      </div>
    </Well>
  );
}

function Row({ name, note, right }: { name: ReactNode; note: ReactNode; right: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 14, alignItems: "center", padding: "10px 12px" }}>
      <span style={{ fontSize: 13.5 }}>{name}</span>
      <Kv style={{ fontSize: 11.5 }}>{note}</Kv>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>
    </div>
  );
}

export default function StylePanel() {
  const s = useStep2();
  const fields = s.setup?.fields ?? [];
  const fld = (k: string): SetupField | undefined => fields.find((f) => f.key === k);
  const recipes = useMemo(() => ((s.setup?.recipes ?? []) as Partial<StyledRecipe>[]).filter((r): r is StyledRecipe => typeof r.style === "string" && !!r.style), [s.setup]);

  const lit = (r: StyledRecipe) => Object.entries(r.values).every(([k, v]) => same(s.eff(k), v));
  const current = recipes.find(lit);
  const styleNow = String(s.eff("autofx.style") ?? "");
  const customSel = !current;

  const hook = bool(s.eff("autofx.hook")) || bool(s.eff("autofx.card"));
  const sub = bool(s.eff("autofx.sub"));
  const music = String(s.eff("autofx.music") ?? "");
  const beat = bool(s.eff("autofx.beat_snap"));
  const burst = bool(s.eff("autofx.burst"));
  const channel = String(s.eff("autofx.channel") ?? "");
  const musicField = fld("autofx.music");
  const musicOpts = (musicField?.options ?? []).map((v) => ({ v: String(v), label: musicField?.labels?.[String(v)] ?? String(v) }));

  const idsField = fld("variants.ids");
  const idOpts = (idsField?.options ?? []).map(String);
  const ids = strs(s.eff("variants.ids"));
  const aiOn = bool(s.eff("variants.ai"));
  const toggleId = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : idOpts.filter((x) => ids.includes(x) || x === id);
    if (next.length) s.stage({ "variants.ids": next });
  };

  return (
    <Panel style={{ display: "flex", flexDirection: "column", gap: 16, padding: "18px 20px", minHeight: 0, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>เลือกสไตล์</span>
        <Kv>4 สูตรจากคลิปอ้างอิง TikTok · เลือกชั้นแต่งหนังให้เอง · หรือกำหนดเอง</Kv>
      </div>

      {recipes.length === 0 ? (
        <Well dashed style={{ padding: 14 }}>
          <Kv>เอนจินยังไม่ส่งสูตรสไตล์ — ตรวจว่า config/presets/tiktok-*.toml อยู่ครบ</Kv>
        </Well>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          {recipes.map((r) => {
            const parts = r.hint.split(" · ");
            return (
              <Card
                key={r.preset}
                sel={lit(r)}
                onClick={() => s.stage(r.values)}
                art={<Art style={r.style} />}
                title={`${r.style} · ${r.label}`}
                sub={`ช็อต ${r.shot || "—"} · ${parts.slice(1, 2).join("")}`}
                chips={layerChips(r.values)}
                tip={`${r.hint}\npreset ${r.preset}`}
              />
            );
          })}
          <Card
            sel={customSel}
            onClick={() => s.stage({ "autofx.style": "" })}
            art={<Art style="" />}
            title="กำหนดเอง"
            sub="เลือกชั้นแต่งและแบบที่จะตัดเองข้างล่าง"
            chips={customSel ? layerChips({ "autofx.hook": hook, "autofx.card": hook, "autofx.sub": sub, "autofx.music": music, "autofx.burst": burst }) : []}
          />
        </div>
      )}

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>ชั้นแต่งหนัง</span>
          <Kv>{current ? `ค่าของสูตร ${current.style} — ปรับได้ · แก้รายชิ้นได้อีกหลังตัดในขั้น ③` : "กำหนดเอง"}</Kv>
        </div>
        <Well className="rows" style={{ display: "flex", flexDirection: "column" }}>
          <Row name="ซับจากบทพูด" note="ตัวหนา ขาวขอบดำ · ล่างกลาง · แก้คำได้ทีละบรรทัดในขั้น ③" right={<Tog on={sub} onChange={(v) => s.stage({ "autofx.sub": v })} />} />
          <Row
            name="HOOK + การ์ดปิด"
            note={
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                การ์ด 3 บรรทัดจากประโยคแรก · การ์ดปิด 4 วิ
                {hook && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Tag>ชื่อช่อง</Tag>
                    <TIn value={channel} onChange={(v) => s.stage({ "autofx.channel": v })} placeholder="@ชื่อช่อง (ว่าง = ชื่อโปรเจกต์)" mono={false} style={{ width: 220 }} />
                  </span>
                )}
              </span>
            }
            right={<Tog on={hook} onChange={(v) => s.stage({ "autofx.hook": v, "autofx.card": v })} />}
          />
          <Row
            name="เพลงตามจังหวะ"
            note={
              <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Sel value={music} onChange={(v) => s.stage({ "autofx.music": v })} options={musicOpts.length ? musicOpts : [{ v: "", label: "ไม่ใส่" }]} className="fld-sel" />
                <Tog on={beat} disabled={!music} onChange={(v) => s.stage({ "autofx.beat_snap": v })} label="ดูดรอยตัดเข้าบีต" title="ขยับปลายช็อตให้ตรงจังหวะเพลง (ต้อง render ชิ้นที่ขยับใหม่)" />
              </span>
            }
            right={<Tog on={Boolean(music)} onChange={(v) => s.stage({ "autofx.music": v ? musicOpts.find((o) => o.v)?.v ?? "up" : "", ...(v ? {} : { "autofx.beat_snap": false }) })} />}
          />
          <Row name="สติกเกอร์ / ภาพซ้อน" note="คลัง 200 ชิ้น · วางเองบนจอตัวอย่างในขั้น ③ (ยังไม่มีการวางอัตโนมัติ)" right={<Kv style={{ fontSize: 11 }}>ขั้น ③</Kv>} />
          <Row name="เอฟเฟกต์รายช็อต" note="ชุดยิงรัว: ซูมไล่สลับทิศ + โทนสีจัด · ปรับรายช็อตได้ในขั้น ③" right={<Tog on={burst} onChange={(v) => s.stage({ "autofx.burst": v })} />} />
        </Well>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>แบบที่จะตัด</span>
          <Kv>ทุกแบบต่างกันที่การตัด ใช้ชั้นแต่งชุดเดียวกัน · เลือกดูก่อนส่งออกในขั้น ③</Kv>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Keys
            sm={false}
            items={idOpts.map((v) => ({ v, label: idsField?.labels?.[v] ?? v, disabled: v === "ai45" && !aiOn, title: v === "ai45" && !aiOn ? "เปิด AI ก่อน" : undefined }))}
            value={null}
            onChange={toggleId}
            className="v3-multi"
          />
          <Tog on={aiOn} onChange={(v) => s.stage({ "variants.ai": v, ...(v ? { "variants.ids": idOpts.filter((x) => ids.includes(x) || x === "ai45") } : {}) })} label="ให้ AI เลือกช่วงไฮไลต์ (claude · ~3 นาที)" />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {idOpts.map((v) => (
            <Btn key={v} sm on={ids.includes(v)} onClick={() => toggleId(v)} disabled={v === "ai45" && !aiOn}>
              {ids.includes(v) ? "✓ " : ""}
              {idsField?.labels?.[v] ?? v}
            </Btn>
          ))}
        </div>
      </div>
      {s.mod > 0 && (
        <Kv style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
          <Led dim /> แก้ไว้ {s.mod} ค่า — จะบันทึกลงโปรเจกต์ตอนกด "ตัดให้เลย"
          <Btn sm ghost onClick={s.revert}>
            ทิ้งที่แก้
          </Btn>
        </Kv>
      )}
      <Kv style={{ fontSize: 11 }}>สไตล์ตอนนี้: {styleNow ? `${styleNow}` : "กำหนดเอง"}</Kv>
    </Panel>
  );
}
