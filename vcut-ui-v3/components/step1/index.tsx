"use client";

// ขั้น ① ใส่วิดีโอ — หน้าเดียว: วางไฟล์ (กี่ไฟล์ก็ได้) → เอนจินอ่านคลิป · ถอดเสียง ·
// ทำภาพตัวอย่างให้เอง → กด "ต่อไป" ไปเลือกสไตล์  ไม่มีหน้าคลังคลิป (ui-v3-decisions ข้อ 6)
//
// คิวอัปโหลด + สายงาน scan→listen→thumbs อยู่ที่ระดับนี้ (upload.ts) เหมือน v2

import TopBar from "@/components/frames/TopBar";
import { useEngine } from "@/hooks/engine";
import Input from "./Input";
import { useUploadQueue } from "./upload";

export default function Step1() {
  const eng = useEngine();
  const up = useUploadQueue(eng);
  return (
    <>
      <TopBar />
      <Input up={up} />
    </>
  );
}
