"use client";

// ขั้น ② โต๊ะทำงาน — แถบบน (ป้าย STT) · กริด 1fr 380px · ลิ้นชัก 3 ตัวซ้อนทับ
//
//   ซ้าย  Workbench  สไตล์ · ปุ่มควบคุม · ชั้นแต่งหนัง (ล็อกตอนงานวิ่ง)
//   ขวา   Output     ว่างงาน → รายการแบบ · ETA · ตัดให้เลย
//         Run        งานวิ่ง/เพิ่งจบ → มิเตอร์ · 5 เฟส · log · STOP
//   ลิ้นชัก pool / trans / adv เลือกจาก ?d= (hooks/route)

import { useState } from "react";
import TopBar from "@/components/frames/TopBar";
import { Led, Well } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import AdvancedDrawer from "@/components/step2/adv";
import Workbench from "./Workbench";
import Output from "./Output";
import Run from "./Run";
import PoolDrawer from "./PoolDrawer";
import TranscriptDrawer from "./TranscriptDrawer";
import { currentStep } from "./phases";
import { Step2Provider, useStep2 } from "./state";

function SttWell() {
  const eng = useEngine();
  const s = useStep2();
  const job = eng.job;
  const listening = Boolean(job?.running) && currentStep(job, eng.jobLines, s.plan?.steps) === "listen";
  const pr = job?.progress;
  const tr = s.transcript;
  return (
    <Well className="mono" style={{ padding: "4px 10px", fontSize: 11, color: listening ? "var(--amber)" : "var(--muted)", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }} title={listening ? "กำลังถอดเสียง (listen)" : tr ? `${tr.summary.with_speech} คลิปมีเสียงพูด · ${(tr.summary.speech / 60).toFixed(1)} นาที` : ""}>
      <Led on={!listening && Boolean(tr?.exists)} dim={listening} blink={listening} />
      {listening ? `STT ${pr && pr.total ? `${pr.n}/${pr.total}` : "…"}` : `STT ${tr ? `${tr.summary.segments} SEG` : "…"}`}
    </Well>
  );
}

function Body() {
  const eng = useEngine();
  const r = useRoute();
  const job = eng.job;
  // งานที่จบแล้วยังโชว์แผง Run ค้างไว้ให้เห็นผล (สำเร็จ/พัง) จนกว่าจะกดปิด —
  // แต่เฉพาะงานที่หน้านี้สั่งเอง (lastStep) งานค้างจากหน้าต่างอื่นจบแล้วกลับเป็น Output เลย
  const [dismissed, setDismissed] = useState("");
  const jobKey = job ? `${eng.lastStep}:${job.code}:${job.total}` : "";
  const showRun = !!job && (job.running || (job.code !== null && eng.lastStep !== "" && dismissed !== jobKey));

  return (
    <>
      <TopBar right={<SttWell />} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", gap: 10, padding: 10, minHeight: 0, opacity: r.drawer ? 0.35 : 1 }}>
        <Workbench />
        {showRun ? <Run onDismiss={() => setDismissed(jobKey)} /> : <Output />}
      </div>
      {r.drawer === "pool" && <PoolDrawer />}
      {r.drawer === "trans" && <TranscriptDrawer />}
      {r.drawer === "adv" && <AdvancedDrawer onClose={r.closeDrawer} />}
    </>
  );
}

export default function Step2() {
  return (
    <Step2Provider>
      <Body />
    </Step2Provider>
  );
}
