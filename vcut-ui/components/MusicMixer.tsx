"use client";

// เล่นเพลงประกอบซ้อนกับวิดีโอตอน preview — ใช้ตัวเลขชุดเดียวกับที่ ffmpeg
// จะมิกซ์ตอน render ขั้น 5: at/dur บนเวลารวมของหนัง, gain_db → volume,
// fade_in/fade_out เชิงเส้น, loop วนไฟล์, dur=0 = เล่นจนจบหนัง
//
// ที่ยังไม่จำลอง: duck หลบเสียงพูด (ต้องวัด loudness ของแทร็กพูด — ฟังของจริง
// ตอน render) และ volume บูสต์เกิน 0dB (HTMLAudio จำกัดที่ 1.0)

import { useEffect, useRef } from "react";
import { assetUrl, MusicTrack } from "@/lib/api";

const db2vol = (db: number) => Math.min(1, Math.pow(10, (db || 0) / 20));

export default function MusicMixer({
  tracks,
  playing,
  playhead,
  total,
}: {
  tracks: MusicTrack[];
  playing: boolean;
  playhead: number;
  total: number;
}) {
  const els = useRef(new Map<string, HTMLAudioElement>());
  // ช่องส่องสถานะสำหรับ debug/ทดสอบ (ตัว <audio> ไม่ได้อยู่ใน DOM)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__vcutMusic = els.current;
  }, []);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const phRef = useRef(playhead);
  phRef.current = playhead;
  const totalRef = useRef(total);
  totalRef.current = total;

  // key ของตัวเล่น = ลำดับ|ชื่อไฟล์ — ห้ามใช้ t.id เพราะแทร็กที่เพิ่งเพิ่มจาก UI
  // ยังเป็น id ว่าง (เอนจินแจก id ตอนบันทึก FX) เดี๋ยวโดนข้ามแล้วเงียบทั้งแทร็ก
  const keyOf = (i: number, file: string) => `${i}|${file}`;

  // สร้าง/ทิ้ง <audio> ตามรายการแทร็ก (แก้ไฟล์/ลบแทร็กระหว่างเล่นก็ตามทัน)
  useEffect(() => {
    const map = els.current;
    const want = new Set<string>();
    tracks.forEach((t, i) => {
      if (!t.file) return;
      const k = keyOf(i, t.file);
      want.add(k);
      let a = map.get(k);
      if (!a) {
        a = new Audio();
        a.preload = "auto";
        map.set(k, a);
      }
      const src = assetUrl(t.file);
      // a.src เป็น absolute URL — เทียบท้ายพอ
      if (!a.src.endsWith(src)) a.src = src;
      a.loop = !!t.loop;
    });
    for (const [k, a] of map) {
      if (!want.has(k)) {
        a.pause();
        a.removeAttribute("src");
        map.delete(k);
      }
    }
  }, [tracks]);

  useEffect(() => {
    const map = els.current;
    const pauseAll = () => {
      for (const a of map.values()) if (!a.paused) a.pause();
    };
    if (!playing) {
      pauseAll();
      return;
    }
    let raf = 0;
    const tick = () => {
      const ph = phRef.current;
      tracksRef.current.forEach((t, i) => {
        const a = t.file ? map.get(keyOf(i, t.file)) : undefined;
        if (!a) return;
        const end = t.dur > 0 ? t.at + t.dur : totalRef.current;
        if (ph < t.at || ph >= end) {
          if (!a.paused) a.pause();
          return;
        }
        let off = ph - t.at;
        if (t.loop && isFinite(a.duration) && a.duration > 0)
          off = off % a.duration;
        // เพี้ยนเกิน 0.35 วิ (เพิ่ง seek / ลากแทร็ก / เพิ่งเข้าโซน) → ดีดกลับให้ตรง
        if (a.readyState >= 1 && Math.abs(a.currentTime - off) > 0.35)
          a.currentTime = off;
        let vol = db2vol(t.gain_db);
        if (t.fade_in > 0) vol *= Math.min(1, (ph - t.at) / t.fade_in);
        if (t.fade_out > 0)
          vol *= Math.min(1, Math.max(0, (end - ph) / t.fade_out));
        a.volume = Math.max(0, Math.min(1, vol));
        if (a.paused) a.play().catch(() => {});
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pauseAll();
    };
  }, [playing]);

  return null;
}
