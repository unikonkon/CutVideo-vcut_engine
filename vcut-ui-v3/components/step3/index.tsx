"use client";

// ขั้น ③ เลือกแบบ · ส่งออก — เลือกหน้าจาก ?e= (hooks/route)
//   ไม่มี  → Variants    (แท็บสไตล์ · 6 แบบ · ชั้นแต่งของแบบนี้ · ส่งออก)
//   tl    → TimelinePage (ไทม์ไลน์เต็ม — หน้าเต็มเหมือนเดิม)
//   อื่น ๆ → Variants อยู่ข้างหลัง (จาง+เบลอ) + ม่าน + ลิ้นชักแก้ชั้นแต่ง (edit/)
// ทุกหน้าอยู่ใต้ StudioProvider ตัวเดียว — draft/หัวเล่น/ย้อนกลับไม่หายตอนสลับหน้า/เปิดปิดลิ้นชัก

import { useRoute } from "@/hooks/route";
import EditorSwitch from "@/components/step3/edit";
import { StudioProvider } from "./store";
import Variants from "./Variants";
import TimelinePage from "./TimelinePage";

function Step3Body() {
  const r = useRoute();
  if (r.edit === "tl") return <TimelinePage />;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      <Variants dim={r.edit !== null} />
      {r.edit !== null && (
        <>
          <div style={{ position: "absolute", inset: 0, background: "rgba(7,15,31,.30)", zIndex: 5 }} onClick={() => r.openEdit(null)} title="ปิดลิ้นชัก" />
          <EditorSwitch id={r.edit} />
        </>
      )}
    </div>
  );
}

export default function Step3() {
  return (
    <StudioProvider>
      <Step3Body />
    </StudioProvider>
  );
}
