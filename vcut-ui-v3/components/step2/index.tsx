"use client";

// ขั้น ② สไตล์ — ซ้าย: การ์ดสูตร A–D + กำหนดเอง · ชั้นแต่งที่จะใส่ · แบบที่จะตัด
//               ขวา: สรุป + ปุ่ม "ตัดให้เลย" · ระหว่างวิ่งเป็นแผงความคืบหน้า
//
// ทุกอย่างทางซ้ายแค่วางค่าลงร่าง (state.tsx) ปุ่มขวาบันทึกลง projects/<ชื่อ>.toml
// แล้วสั่งงาน quick (scan → thumbs → listen → silence → variants → autofx)

import TopBar from "@/components/frames/TopBar";
import StylePanel from "./StylePanel";
import RunPanel from "./RunPanel";
import { Step2Provider } from "./state";

export default function Step2() {
  return (
    <Step2Provider>
      <TopBar />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 10, padding: 10, minHeight: 0 }}>
        <StylePanel />
        <RunPanel />
      </div>
    </Step2Provider>
  );
}
