"use client";

// tooltip กลางของทั้งแอป — ดักทุก element ที่มี title แล้ววาดเอง
//
// ทำไมไม่ใช้ title ตรง ๆ: ของ native โผล่ช้า ~1-2 วิ, หน้าตาแล้วแต่ OS และโดน
// container ที่ overflow ตัดไม่ได้ก็จริงแต่ผู้ใช้มักปล่อยเมาส์ก่อนมันทันโผล่
// ตัวนี้: ย้าย title → data-tip ตอน hover (กัน native เด้งซ้อน) แล้ววาด div
// fixed ของตัวเองใน 150ms พร้อมแปลงวงเล็บคีย์ลัด "(Cmd+Z)" เป็นป้ายปุ่ม

import { Fragment, useEffect, useState } from "react";

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

// วงเล็บที่ข้างในหน้าตาเป็นคีย์ เช่น (Cmd+Z) (S) (-) (=) (Delete) (Cmd+Shift+Z)
const KEY_RE = /\((Cmd|Ctrl|Shift|Alt|Space|Delete|Backspace|Enter|Esc|[A-Z0-9=+\-/])((\+|\s|·)*(Cmd|Ctrl|Shift|Alt|Space|Delete|Backspace|Enter|Esc|[A-Z0-9=+\-/]))*\)/gi;

function Line({ line }: { line: string }) {
  const parts: (string | { key: string })[] = [];
  let last = 0;
  for (const m of line.matchAll(KEY_RE)) {
    if (m.index! > last) parts.push(line.slice(last, m.index));
    parts.push({ key: m[0].slice(1, -1) });
    last = m.index! + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return (
    <div>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <kbd
            key={i}
            className="mx-0.5 rounded border border-white/25 bg-white/10 px-1 py-px font-mono text-[10px] text-white"
          >
            {p.key}
          </kbd>
        ),
      )}
    </div>
  );
}

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: HTMLElement | null = null;

    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 64; // ชิดขอบบนก็ย้ายไปโผล่ใต้ปุ่มแทน
      setTip({
        text,
        x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130),
        y: below ? r.bottom + 8 : r.top - 8,
        below,
      });
    };

    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(
        "[title], [data-tip]",
      ) as HTMLElement | null;
      if (!el) return;
      // ย้าย title มาเก็บใน data-tip กัน tooltip ของเบราว์เซอร์เด้งซ้อน
      const t = el.getAttribute("title");
      if (t) {
        el.dataset.tip = t;
        el.removeAttribute("title");
      }
      if (el === current) return;
      current = el;
      if (timer) clearTimeout(timer);
      setTip(null);
      timer = setTimeout(() => show(el), 150);
    };

    const out = (e: MouseEvent) => {
      if (!current) return;
      const to = e.relatedTarget as HTMLElement | null;
      if (to && current.contains(to)) return;
      current = null;
      if (timer) clearTimeout(timer);
      setTip(null);
    };

    const hide = () => setTip(null);

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("scroll", hide, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className="pointer-events-none fixed z-[200] max-w-64 rounded-lg border border-line-2 bg-[#202027] px-2.5 py-1.5 text-[11px] leading-4.5 text-ink shadow-xl"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      }}
    >
      {tip.text.split("\n").map((line, i) => (
        <Line key={i} line={line} />
      ))}
    </div>
  );
}
