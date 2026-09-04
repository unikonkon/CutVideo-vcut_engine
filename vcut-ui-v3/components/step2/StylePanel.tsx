"use client";

// ส่วนล่างของขั้น ② เมื่อยังไม่ได้สั่งตัด — สองหน้าตาตามการ์ดที่เลือก
//
//   RecipeLayers  (F2)       เลือกสูตร A–D → แผงกระจกอ่านอย่างเดียว "สูตร A แต่งให้แบบนี้"
//                            5 ช่องคำนวณจากค่า autofx.* ของสูตรนั้น
//   CustomGrid    (F2Custom) กำหนดเอง → กริด 3×2 ของแผง soft ผูกกับคีย์เอนจินจริงเท่านั้น
//                            (ระยะเวลา = แบบที่จะเปิดให้ก่อนในขั้น ③ ไม่ใช่คีย์เอนจิน)

import { useState, type ReactNode } from "react";
import { Icon, Seg, Stepper, SwRow, TIn, Tog, cx, type IconName } from "@/components/instrument";
import { FEATURES } from "@/lib/roadmap";
import type { SetupField } from "@/lib/api";
import type { Recipe } from "./cards";
import { bool, num, strs, useStep2 } from "./state";

const NOT_YET = "ยังไม่มีในเอนจิน";

/** ป้ายหมวดเพลงจากฟิลด์ autofx.music */
export function musicLabel(fld: SetupField | undefined, v: string) {
  return fld?.labels?.[v] ?? v;
}

// ─────────────────────────── F2 · สูตร A แต่งให้แบบนี้ ───────────────────────────

function LayerCell({ icon, name, desc, off }: { icon: IconName; name: string; desc: string; off?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", opacity: off ? 0.45 : 1, minWidth: 0 }}>
      <Icon name={icon} size={16} color={off ? "var(--muted)" : "var(--amber)"} style={{ marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 400 }}>{name}</span>
        <span className="muted small">{desc}</span>
      </div>
    </div>
  );
}

export function RecipeLayers({ recipe }: { recipe: Recipe }) {
  const s = useStep2();
  const v = recipe.values;
  const musicField = s.setup?.fields.find((f) => f.key === "autofx.music");
  const sub = bool(v["autofx.sub"]);
  const hook = bool(v["autofx.hook"]);
  const card = bool(v["autofx.card"]);
  const music = String(v["autofx.music"] ?? "");
  const beat = bool(v["autofx.beat_snap"] ?? s.eff("autofx.beat_snap"));
  const burst = bool(v["autofx.burst"]);
  const channel = String(s.eff("autofx.channel") ?? "").trim();

  const hookDesc = [hook && "จากประโยคแรก", card && `การ์ด 4 วิ ${channel || "@ชื่อโปรเจกต์"}`].filter(Boolean).join(" · ");
  const musicDesc = [musicLabel(musicField, music), beat && "รอยตัดเข้าบีต", "ลดตอนพูด"].filter(Boolean).join(" · ");

  return (
    <div className="panel" style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span className="h2">สูตร {recipe.letter} แต่งให้แบบนี้</span>
        <span className="muted small">แก้เพิ่มได้หลังตัดเสร็จ ทีละแบบ ในขั้นส่งออก</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 22 }}>
        <LayerCell icon="text" name="ซับจากบทพูด" desc={sub ? "ตัวหนา ขาวขอบดำ · กลางล่าง" : "สูตรนี้ไม่ใส่ · เพิ่มเองทีหลังได้"} off={!sub} />
        <LayerCell icon="spark" name="HOOK + การ์ดปิด" desc={hook || card ? hookDesc : "สูตรนี้ไม่ใส่ · เพิ่มเองทีหลังได้"} off={!hook && !card} />
        <LayerCell icon="music" name="เพลงตามจังหวะ" desc={music ? musicDesc : "สูตรนี้ไม่ใส่ · เพิ่มเองทีหลังได้"} off={!music} />
        <LayerCell icon="fx" name="เอฟเฟกต์รายช็อต" desc={burst ? "ยิงรัวช่วงช็อตสั้นติดกัน · ซูมไล่ · punch" : "สูตรนี้ไม่ใส่ · ปรับทีละช็อตได้หลังตัด"} off={!burst} />
        <LayerCell icon="sticker" name="สติกเกอร์ / ภาพซ้อน" desc="สูตรนี้ไม่ใส่ · เพิ่มเองทีหลังได้" off />
      </div>
    </div>
  );
}

// ─────────────────────────── F2Custom · กำหนดเอง 6 แผง ───────────────────────────

function OptCard({ icon, title, on, tog, children, note }: { icon: IconName; title: string; on: boolean; tog?: ReactNode; children?: ReactNode; note?: ReactNode }) {
  return (
    <div className={cx("panel", "soft")} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, opacity: on ? 1 : 0.55, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={icon} size={15} color={on ? "var(--amber)" : "var(--muted)"} />
        <span style={{ fontWeight: 400 }}>{title}</span>
        <div style={{ flex: 1 }} />
        {tog}
      </div>
      {children}
      {note !== undefined && <span className="muted small">{note}</span>}
    </div>
  );
}

const PICK_LABEL: Record<string, string> = { tight: "ทั้งคลิป" };

export function CustomGrid() {
  const s = useStep2();
  const fld = (k: string) => s.setup?.fields.find((f) => f.key === k);
  const [subMode, setSubMode] = useState<"line" | "word">("line");

  const sub = bool(s.eff("autofx.sub"));
  const hook = bool(s.eff("autofx.hook"));
  const card = bool(s.eff("autofx.card"));
  const channel = String(s.eff("autofx.channel") ?? "");
  const music = String(s.eff("autofx.music") ?? "");
  const beat = bool(s.eff("autofx.beat_snap"));
  const burst = bool(s.eff("autofx.burst"));
  const burstMaxField = fld("autofx.burst_max");
  const burstMax = num(s.eff("autofx.burst_max"), 1.2);
  const aiOn = bool(s.eff("variants.ai"));

  const idsField = fld("variants.ids");
  const idOpts = (idsField?.options ?? []).map(String);
  const ids = strs(s.eff("variants.ids"));
  const pickItems = ["s30", "s45", "s60", "tight"].filter((v) => idOpts.includes(v)).map((v) => ({ v, label: PICK_LABEL[v] ?? idsField?.labels?.[v] ?? v }));

  const musicField = fld("autofx.music");
  const musicOpts = (musicField?.options ?? []).map(String).filter((v) => v !== "");
  const musicItems = musicOpts.map((v) => ({ v, label: musicLabel(musicField, v) }));
  const [lastMusic, setLastMusic] = useState("");
  const setMusicOn = (on: boolean) => {
    if (on) s.stage({ "autofx.music": lastMusic || musicOpts[0] || "up" });
    else {
      setLastMusic(music);
      s.stage({ "autofx.music": "", "autofx.beat_snap": false });
    }
  };

  const setAi = (on: boolean) => {
    const patch: Record<string, unknown> = { "variants.ai": on };
    if (on && !ids.includes("ai45")) patch["variants.ids"] = idOpts.filter((x) => ids.includes(x) || x === "ai45");
    s.stage(patch);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        <OptCard icon="clock" title="ระยะเวลา" on note="เอนจินยังตัดครบทุกแบบ · ค่านี้คือแบบที่เลือกไว้ก่อน">
          <Seg items={pickItems} value={s.pick} onChange={s.setPick} />
        </OptCard>

        <OptCard icon="text" title="ซับ" on={sub} tog={<Tog on={sub} onChange={(v) => s.stage({ "autofx.sub": v })} />} note="ขาวขอบดำ กลางล่าง · แก้คำผิดได้หลังตัด">
          <Seg<"line" | "word">
            items={[
              { v: "line", label: "ทั้งบรรทัด" },
              { v: "word", label: "ทีละคำ", disabled: !FEATURES.wordSub, title: FEATURES.wordSub ? undefined : NOT_YET },
            ]}
            value={subMode}
            onChange={setSubMode}
            disabled={!sub}
          />
        </OptCard>

        <OptCard icon="spark" title="HOOK + การ์ดปิด" on={hook || card} tog={<Tog on={hook || card} onChange={(v) => s.stage({ "autofx.hook": v, "autofx.card": v })} />} note="พิมพ์ข้อความเองได้ในขั้นส่งออก">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SwRow on={hook} onChange={(v) => s.stage({ "autofx.hook": v })} label="HOOK จากประโยคแรก" />
            <SwRow on={card} onChange={(v) => s.stage({ "autofx.card": v })} label="การ์ดปิด 4 วิ" />
            <TIn value={channel} onChange={(v) => s.stage({ "autofx.channel": v })} placeholder={`${fld("autofx.channel")?.placeholder ?? "@ชื่อช่อง"} · ว่าง = @ชื่อโปรเจกต์`} mono={false} disabled={!card} />
          </div>
        </OptCard>

        <OptCard icon="music" title="เพลงตามจังหวะ" on={Boolean(music)} tog={<Tog on={Boolean(music)} onChange={setMusicOn} disabled={musicOpts.length === 0} title={musicOpts.length ? undefined : "เอนจินไม่มีหมวดเพลง"} />} note="ลดเสียงตอนพูดให้เสมอ · วนจนจบ">
          {musicItems.length > 0 && <Seg sm items={musicItems} value={music || null} onChange={(v) => s.stage({ "autofx.music": v })} cols={musicItems.length > 6 ? 4 : musicItems.length} disabled={!music} />}
          <SwRow on={beat} onChange={(v) => s.stage({ "autofx.beat_snap": v })} label="รอยตัดเข้าบีต" disabled={!music} />
        </OptCard>

        <OptCard icon="sticker" title="สติกเกอร์ / ภาพซ้อน" on={false} tog={<Tog on={false} disabled title="ยังไม่มีการวางอัตโนมัติ" />} note="วางเองบนจอตัวอย่างในขั้น ③">
          <span className="small muted">ยังไม่มีการวางอัตโนมัติ</span>
        </OptCard>

        <OptCard icon="fx" title="เอฟเฟกต์รายช็อต" on={burst} tog={<Tog on={burst} onChange={(v) => s.stage({ "autofx.burst": v })} />} note="ชุดยิงรัว: ซูมไล่สลับทิศ + โทน punch · ปรับทีละช็อตได้หลังตัด">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Stepper value={burstMax} min={burstMaxField?.min ?? 0.3} max={burstMaxField?.max ?? 6} step={burstMaxField?.step ?? 0.1} unit={burstMaxField?.unit ?? "วิ"} fmt={(v) => v.toFixed(1)} onChange={(v) => s.stage({ "autofx.burst_max": v })} disabled={!burst} />
            <span className="muted small">{burstMaxField?.label ?? "ช็อตสั้นกว่านี้นับเป็นยิงรัว"}</span>
          </div>
        </OptCard>
      </div>
      <SwRow on={aiOn} onChange={setAi} label="ให้ AI เลือกช่วงไฮไลต์" note="แบบที่ 5 · ~3 นาที" />
    </div>
  );
}
