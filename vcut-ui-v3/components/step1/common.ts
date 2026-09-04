"use client";

// ของใช้ร่วมของขั้น ① — ตรรกะเล็ก ๆ ที่ Input กับคิวอัปโหลดต้องคิดเหมือนกัน
// (ชื่อคลิปที่เอนจินจะตั้ง · คลิปไหนถอดเสียงแล้ว) ถ้าคิดคนละสูตร แถวคลิปจะบอก
// สถานะไม่ตรงกับที่คิวรู้

import type { TranscriptData } from "@/lib/api";

/** งานที่สั่งหลังมีคลิปใหม่ — `ingest` ของเอนจิน = scan → thumbs → listen ในงานเดียว
 *  (ยังไม่ตัด เพราะสไตล์ยังไม่ได้เลือก) */
export const CHAIN: string[] = ["ingest"];

/** ชื่อคลิปที่เอนจินจะใช้ — สูตรเดียวกับ upload_target ใน serve.py
 *  (ตัดนามสกุล · เหลือเฉพาะ A-Za-z0-9._- · ตัด . _ หัวท้าย) ใช้ทั้งเทียบว่า
 *  ไฟล์ที่อัปโหลดโผล่ในคลังหรือยัง และตั้งชื่อไฟล์โปรเจกต์ใหม่ */
export function stemOf(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
}

/** ไฟล์วิดีโอที่คลังรับ — กรองตั้งแต่ตอนลาก ไม่ต้องรอเอนจินปฏิเสธ */
export const VIDEO_RE = /\.(mov|mp4|m4v)$/i;

export function pickVideos(files: FileList | File[]) {
  return [...files].filter((f) => VIDEO_RE.test(f.name));
}

export function orientLabel(o: string) {
  return o === "H" ? "แนวนอน" : o === "V" ? "แนวตั้ง" : "จัตุรัส";
}

/** จำนวนท่อนพูดของคลิป — 0 = ไม่มีคนพูด (จะกลายเป็น BROLL) · null = ยังไม่ได้ฟัง */
export function speechOf(tr: TranscriptData | null, name: string): number | null {
  if (!tr || !tr.exists) return null;
  const segs = tr.clips[name];
  if (segs && segs.length) return segs.length;
  // เอนจินฟังแล้วแต่ไม่พบคำพูด — อยู่ใน order แต่ไม่มีท่อน
  if (tr.order.includes(name)) return 0;
  return null;
}
