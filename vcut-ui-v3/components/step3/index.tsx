"use client";

// ขั้น ③ ส่งออก — เลือกหน้าจาก ?e= (hooks/route)
//   ไม่มี  → Variants    (6 แบบ · ชั้นแต่งของแบบนี้ · ส่งออก)
//   tl    → TimelinePage (ไทม์ไลน์เต็ม)
//   อื่น ๆ → แผงแก้รายชั้น (edit/)
// ทุกหน้าอยู่ใต้ StudioProvider ตัวเดียว — draft/หัวเล่น/ย้อนกลับไม่หายตอนสลับหน้า

import { useRoute } from "@/hooks/route";
import EditorSwitch from "@/components/step3/edit";
import { StudioProvider } from "./store";
import Variants from "./Variants";
import TimelinePage from "./TimelinePage";

function Step3Body() {
  const r = useRoute();
  if (r.edit === null) return <Variants />;
  if (r.edit === "tl") return <TimelinePage />;
  return <EditorSwitch id={r.edit} />;
}

export default function Step3() {
  return (
    <StudioProvider>
      <Step3Body />
    </StudioProvider>
  );
}
