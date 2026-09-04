"use client";

// หน้าเดียวของ v2 — 3 ขั้น + ลิ้นชัก + แผงแก้ ทั้งหมดเลือกจาก URL (hooks/route)
//
//   ① ใส่วิดีโอ  → components/step1  (Input · Library)
//   ② โต๊ะทำงาน → components/step2  (Workbench · Run · Pool · Transcript · Advanced)
//   ③ เลือกแบบ  → components/step3  (Variants · Timeline · แผงแก้รายชั้น · Review)

import { Suspense } from "react";
import { EngineProvider, useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { Notice, Spin } from "@/components/instrument";
import Step1 from "@/components/step1";
import Step2 from "@/components/step2";
import Step3 from "@/components/step3";

function Flow() {
  const r = useRoute();
  const eng = useEngine();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {eng.loading && !eng.proj ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin />
        </div>
      ) : r.step === 1 ? (
        <Step1 />
      ) : r.step === 2 ? (
        <Step2 />
      ) : (
        <Step3 />
      )}
      <Notice text={eng.notice} />
    </div>
  );
}

export default function Page() {
  return (
    <EngineProvider>
      <Suspense fallback={<Spin />}>
        <Flow />
      </Suspense>
    </EngineProvider>
  );
}
