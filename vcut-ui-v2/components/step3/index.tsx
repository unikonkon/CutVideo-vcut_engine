"use client";

// ขั้น ③ เลือกแบบ — เลือกหน้าจาก ?e= (hooks/route)
//   ไม่มี      → Variants   (CQ3: แบบ · ชั้น · AI · ส่งออก)
//   tl        → TimelinePage (CTL)
//   review    → ReviewPage  (CREVIEW)
//   อื่น ๆ     → แผงแก้รายชั้น (components/step3/edit — ของอีกทีม)
// ทุกหน้าอยู่ใต้ StudioProvider ตัวเดียว — draft/หัวเล่น/ประวัติย้อนกลับไม่หายตอนสลับหน้า

import { useRoute } from "@/hooks/route";
import EditorSwitch from "@/components/step3/edit";
import { StudioProvider } from "./store";
import Variants from "./Variants";
import TimelinePage from "./TimelinePage";
import ReviewPage from "./ReviewPage";

function Step3Body() {
  const r = useRoute();
  if (r.edit === null) return <Variants />;
  if (r.edit === "tl") return <TimelinePage />;
  if (r.edit === "review") return <ReviewPage />;
  return <EditorSwitch id={r.edit} />;
}

export default function Step3() {
  return (
    <StudioProvider>
      <Step3Body />
    </StudioProvider>
  );
}
