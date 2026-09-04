"use client";

// แถวการ์ดสไตล์ของขั้น ② — A–D จาก /api/setup recipes (ที่มี style) + ใบที่ 5 "กำหนดเอง"
//
// การ์ดเป็นภาพเต็ม (ภาพตัวอย่างของคลิปในโปรเจกต์ วนตามลำดับ) + scrim + ตัวอักษรใหญ่
// ที่เลือกมีขอบมอส + ป้ายถูกมุมขวาบน  กดการ์ด = วางค่าทั้งชุดของสูตรลงร่าง (state.tsx)
// กำหนดเอง = ล้าง autofx.style แล้วให้ 6 แผงข้างล่างเป็นคนตั้งค่า

import { useMemo, type CSSProperties } from "react";
import { Icon, cx } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { thumbUrl, type SetupRecipe } from "@/lib/api";
import { useStep2 } from "./state";

export interface Recipe {
  /** ตัวอักษร A–D */
  letter: string;
  /** ค่า autofx.style ของสูตร (sell/proof/teach/compare) */
  key: string;
  label: string;
  /** คำอธิบายช็อต (สองส่วนแรกของ hint) */
  desc: string;
  hint: string;
  preset: string;
  values: Record<string, unknown>;
}

const LETTER: Record<string, string> = { sell: "A", proof: "B", teach: "C", compare: "D" };

export function useRecipes(): Recipe[] {
  const s = useStep2();
  return useMemo(() => {
    const raw = (s.setup?.recipes ?? []) as (SetupRecipe & { style?: string })[];
    return raw
      .filter((r) => typeof r.style === "string" && r.style)
      .map((r, i) => {
        const key = String(r.values["autofx.style"] ?? "");
        const st = r.style ?? "";
        const letter = /^[A-Z]$/.test(st) ? st : LETTER[key] ?? String.fromCharCode(65 + i);
        const parts = r.hint.split(" · ");
        return { letter, key, label: r.label, desc: parts.slice(0, 2).join(" · ") || r.hint, hint: r.hint, preset: r.preset, values: r.values };
      })
      .sort((a, b) => a.letter.localeCompare(b.letter));
  }, [s.setup]);
}

/** สูตรที่เลือกอยู่ = สูตรที่ autofx.style ตรงกับค่าที่จะเป็น · null = กำหนดเอง */
export function useCurrentRecipe(): Recipe | null {
  const s = useStep2();
  const recipes = useRecipes();
  const styleNow = String(s.eff("autofx.style") ?? "");
  return (styleNow && recipes.find((r) => r.key === styleNow)) || null;
}

const numStyle = (sel: boolean): CSSProperties => ({ position: "absolute", left: 16, top: 8, fontSize: 44, lineHeight: 1.2, color: sel ? "var(--amber)" : "rgba(240,244,234,.85)" });

export function StyleCards({ dim, h }: { dim: boolean; h: number | string }) {
  const s = useStep2();
  const eng = useEngine();
  const recipes = useRecipes();
  const current = useCurrentRecipe();
  const customSel = !current;
  const clips = eng.clips;

  const pickCard = (fn: () => void) => () => {
    if (!dim) fn();
  };

  if (recipes.length === 0 && s.setup) {
    return (
      <div className="panel" style={{ padding: "16px 20px" }}>
        <span className="muted small">เอนจินยังไม่ส่งสูตรสไตล์ — ตรวจว่า config/presets/tiktok-*.toml อยู่ครบ</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 16, flexShrink: 0 }}>
      {recipes.map((r, i) => {
        const sel = current?.key === r.key;
        const clip = clips.length ? clips[i % clips.length] : null;
        return (
          <div key={r.preset} className={cx("card", sel && "sel", dim && "dim")} style={{ height: h, background: clip ? undefined : "rgba(214,232,210,.05)", cursor: dim ? "default" : "pointer" }} onClick={pickCard(() => s.stage(r.values))} title={`${r.hint}\npreset ${r.preset}`} role="radio" aria-checked={sel}>
            {clip && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbUrl(clip.name)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
            <div className="scrim" />
            <span className="num" style={numStyle(sel)}>
              {r.letter}
            </span>
            {sel && (
              <span className="check-badge" style={{ position: "absolute", right: 12, top: 12 }}>
                <Icon name="check" size={14} color="var(--ink-dark)" />
              </span>
            )}
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
              <span className="small" style={{ color: "rgba(240,244,234,.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.desc}
              </span>
            </div>
          </div>
        );
      })}
      <div className={cx("card", "dashed", customSel && "sel", dim && "dim")} style={{ height: h, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "12px 16px 14px", cursor: dim ? "default" : "pointer" }} onClick={pickCard(() => s.stage({ "autofx.style": "" }))} role="radio" aria-checked={customSel}>
        <span style={{ display: "inline-flex", alignItems: "center", height: 52 }}>
          <Icon name="edit" size={26} color={customSel ? "var(--amber)" : "rgba(240,244,234,.85)"} />
        </span>
        {customSel && (
          <span className="check-badge" style={{ position: "absolute", right: 12, top: 12 }}>
            <Icon name="check" size={14} color="var(--ink-dark)" />
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 400 }}>กำหนดเอง</span>
          <span className="small muted">เลือกทุกอย่างเอง 6 ตัวเลือก</span>
        </div>
      </div>
    </div>
  );
}
