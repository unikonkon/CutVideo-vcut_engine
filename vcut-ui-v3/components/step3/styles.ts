// แท็บสไตล์ของขั้น ③ — สูตร A–D จาก /api/setup recipes[] ที่มี `style` + "กำหนดเอง"
//
// ตัวอักษร = recipe.style (A–D) · คีย์ที่เอนจินใช้เก็บแบบ = values["autofx.style"]
// (sell proof teach compare) · กำหนดเอง = autofx.style ว่าง = โฟลเดอร์ "custom"

import type { SetupData, SetupRecipe } from "@/lib/api";

export const CUSTOM_STYLE = "custom";

export interface StyleTab {
  /** คีย์ที่ส่งให้ /api/variants?style= และที่อยู่ใน styles_cut */
  key: string;
  /** A–D · ว่างสำหรับกำหนดเอง */
  letter: string;
  label: string;
  /** ค่าที่ stage ลงโปรเจกต์ก่อนสั่ง recut */
  values: Record<string, unknown>;
  custom: boolean;
}

const FALLBACK_KEYS = ["sell", "proof", "teach", "compare"];

export function styleTabs(setup: SetupData | null): StyleTab[] {
  const recipes = ((setup?.recipes ?? []) as (SetupRecipe & { style?: string })[]).filter((r) => typeof r.style === "string" && r.style);
  const tabs: StyleTab[] = recipes.map((r, i) => {
    const engineKey = String(r.values["autofx.style"] ?? "") || FALLBACK_KEYS[i] || r.preset;
    const letter = /^[A-Z]$/.test(r.style ?? "") ? (r.style as string) : String.fromCharCode(65 + i);
    return { key: engineKey, letter, label: r.label, values: r.values, custom: false };
  });
  tabs.push({ key: CUSTOM_STYLE, letter: "", label: "กำหนดเอง", values: { "autofx.style": "" }, custom: true });
  return tabs;
}

/** ตัวอักษรของสไตล์ (A–D) · กำหนดเอง = "กำหนดเอง" · ไม่รู้จัก = คีย์ดิบ */
export function styleLetter(setup: SetupData | null, style: string): string {
  const key = style || CUSTOM_STYLE;
  const t = styleTabs(setup).find((x) => x.key === key);
  if (!t) return key;
  return t.custom ? t.label : t.letter;
}

/** สไตล์ที่ขั้น ③ กำลังดูอยู่ — แท็บใน URL ก่อน · ไม่มีก็สไตล์ของแบบที่ active · ไม่มีก็ของโปรเจกต์ */
export function styleNowOf(routeStyle: string, proj: { variant_style?: string; autofx_style?: string } | null): string {
  return routeStyle || proj?.variant_style || proj?.autofx_style || CUSTOM_STYLE;
}
