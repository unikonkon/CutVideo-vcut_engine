"use client";

// ขั้น ① ใส่วิดีโอ — หน้า Input (CQ1) หรือ Library (CLIB) ตาม ?lib=1
//
// คิวอัปโหลด + สายงาน scan→listen→thumbs ถืออยู่ที่นี่ ไม่ใช่ในหน้าใดหน้าหนึ่ง
// เพื่อให้สลับหน้าไปมาระหว่างส่งไฟล์ได้โดยไม่หลุด

import TopBar from "@/components/frames/TopBar";
import { Led, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import Input from "./Input";
import Library from "./Library";
import { useUploadQueue } from "./upload";

export default function Step1() {
  const eng = useEngine();
  const r = useRoute();
  const up = useUploadQueue(eng);

  const sending = up.items.filter((u) => !u.done && !u.error);
  const right = (
    <>
      {up.busy && sending.length > 0 && (
        <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--amber)", display: "flex", alignItems: "center", gap: 6 }} title={sending.map((u) => u.name).join("\n")}>
          <Led dim blink />
          UPLOAD {up.items.filter((u) => u.done).length}/{up.items.length} · {sending[0].pct}%
        </Well>
      )}
      {r.lib && (
        <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)" }}>
          LIB <span style={{ color: "var(--amber)" }}>{eng.clips.length}</span> · TRASH {eng.trash.length}
        </Well>
      )}
    </>
  );

  return (
    <>
      <TopBar right={right} />
      {r.lib ? <Library up={up} /> : <Input up={up} />}
    </>
  );
}
