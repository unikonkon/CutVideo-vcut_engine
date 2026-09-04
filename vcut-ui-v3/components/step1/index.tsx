"use client";

// ขั้น ① ใส่วิดีโอ — หน้าเดียว: วางไฟล์ (กี่ไฟล์ก็ได้) → เอนจินอ่านคลิป · ทำภาพตัวอย่าง ·
// ถอดเสียงให้เอง (งาน `ingest`) → กด "เลือกสไตล์" ไปขั้น ②  ไม่มีหน้าคลังคลิป
//
// คิวอัปโหลด + การสั่ง ingest อยู่ที่ระดับนี้ (upload.ts) ไม่ใช่ในหน้า Input

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
