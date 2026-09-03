"use client";

// ของใช้ร่วมของขั้น ① (Input · Library) — ตรรกะเล็ก ๆ ที่ทั้งสองหน้าต้องคิดเหมือนกัน
// ถ้าคิดคนละสูตร หน้าใส่วิดีโอกับหน้าคลังจะบอกสถานะคลิปเดียวกันไม่ตรงกัน

import type { ClipInfo, SetupStep, TranscriptData } from "@/lib/api";

/** งานที่ต้องวิ่งต่อกันหลังมีคลิปใหม่ — ลำดับตายตัวตามไปป์ไลน์ของเอนจิน */
export const CHAIN: string[] = ["scan", "listen", "thumbs"];

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

export function findStep(steps: SetupStep[] | undefined, id: string) {
  return steps?.find((s) => s.id === id) ?? null;
}

/** สถานะ LED หนึ่งช่อง — on ทำแล้ว · dim กำลังทำ · off รอ · red พัง */
export interface LedState {
  on?: boolean;
  dim?: boolean;
  red?: boolean;
  text: string;
  muted?: boolean;
}

/** ภาพตัวอย่างของคลิปนี้ทำไว้หรือยัง — thumbs ทำทีเดียวทั้งคลัง จึงดูจากเวลา:
 *  คลิปที่มาถึงหลังรอบ thumbs ล่าสุดยังไม่มีอยู่ในแผ่นไหน */
export function thumbsCover(step: SetupStep | null, clip: ClipInfo | null) {
  if (!step?.exists) return false;
  if (!clip) return true;
  return clip.added <= step.mtime;
}
