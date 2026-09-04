"use client";

// แผงขวาของขั้น ② — ว่างงาน: สรุป + "ตัดให้เลย" · งานวิ่ง/เพิ่งจบ: ขั้นที่ทำถึง · log · หยุด
//
// ปุ่มใหญ่ทำสองอย่างตามลำดับ: บันทึกร่างค่าตั้ง (ถ้ามี) แล้วสั่ง quick / quick_ai
// (serve.QUICK_JOBS) งานจบด้วยรหัส 0 → พาไปขั้น ③ เอง (เฉพาะงานที่หน้านี้สั่ง)

import { useEffect, useRef, useState } from "react";
import { Btn, Cta, Kv, Led, LogWell, Meter, Mono, Panel, Stat, Well, fmtClock } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { isQuickJob, quickFraction, quickViews } from "./phases";
import { bool, strs, useStep2 } from "./state";

export default function RunPanel() {
  const eng = useEngine();
  const r = useRoute();
  const s = useStep2();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const job = eng.job;
  const running = Boolean(job?.running);
  const finished = !!job && !job.running && job.code !== null;
  const ok = finished && job.code === 0 && !job.stopped;
  const mine = isQuickJob(eng.lastStep);
  const jobKey = job ? `${eng.lastStep}:${job.code}:${job.total}` : "";
  const showRun = !!job && isQuickJob(job.step) && (job.running || (mine && dismissed !== jobKey));

  // พาไป ③ ครั้งเดียวต่องาน — เฉพาะงานที่หน้านี้สั่ง
  const navigated = useRef(false);
  useEffect(() => {
    if (running) navigated.current = false;
  }, [running]);
  useEffect(() => {
    if (ok && mine && !navigated.current) {
      navigated.current = true;
      r.go(3);
    }
  }, [ok, mine, r]);

  const aiOn = bool(s.eff("variants.ai"));
  const ids = strs(s.eff("variants.ids"));
  const styleNow = String(s.eff("autofx.style") ?? "");
  const tr = s.transcript;

  const go = async () => {
    setBusy(true);
    try {
      if (s.mod > 0) {
        const saved = await s.save();
        if (!saved) return;
      }
      await eng.runJob(aiOn ? "quick_ai" : "quick");
    } finally {
      setBusy(false);
    }
  };

  if (showRun && job) {
    const views = quickViews(job);
    const frac = quickFraction(job);
    return (
      <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 18px", minHeight: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{running ? "กำลังตัด…" : ok ? "ตัดเสร็จแล้ว" : job.stopped ? "หยุดแล้ว" : "มีข้อผิดพลาด"}</span>
          <div style={{ flex: 1 }} />
          <Mono style={{ fontSize: 11, color: "var(--muted)" }}>{fmtClock(job.elapsed)}</Mono>
        </div>
        <Meter n={frac * 20} total={20} hot={running} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {views.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }} title={v.note}>
              <Led on={v.led === "on"} dim={v.led === "dim"} red={v.led === "red"} blink={v.cur} />
              <span style={{ flex: 1, color: v.led === "off" ? "var(--muted)" : undefined }}>{v.label}</span>
              <Mono style={{ fontSize: 11, color: v.cur ? "var(--amber-hi)" : v.led === "red" ? "var(--danger)" : "var(--muted)" }}>{v.status}</Mono>
            </div>
          ))}
        </div>
        <LogWell lines={eng.jobLines} style={{ flex: 1, minHeight: 100 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {running ? (
            <Btn ghost danger onClick={() => eng.stopJob()}>
              หยุด
            </Btn>
          ) : (
            <>
              <Btn onClick={() => setDismissed(jobKey)}>ปิด</Btn>
              {ok ? (
                <Cta sm onClick={() => r.go(3)} style={{ flex: 1 }}>
                  ดู 6 แบบ · ส่งออก ▸
                </Cta>
              ) : (
                <Btn on onClick={go}>
                  ลองใหม่
                </Btn>
              )}
            </>
          )}
        </div>
      </Panel>
    );
  }

  const n = ids.filter((x) => x !== "ai45" || aiOn).length;
  return (
    <Panel style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 18px", minHeight: 0, overflow: "hidden" }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>สรุปก่อนตัด</span>
      <Well style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <Stat label="คลิป" value={eng.proj ? `${eng.proj.clips_total} ไฟล์ · ${eng.proj.footage_minutes.toFixed(1)} นาที` : "—"} />
        <Stat label="บทพูด" value={tr?.exists ? `${tr.summary.segments} ท่อน · ${(tr.summary.speech / 60).toFixed(1)} นาที` : "จะถอดตอนตัด"} warn={!tr?.exists} />
        <Stat label="สไตล์" value={styleNow ? styleNow : "กำหนดเอง"} />
        <Stat label="แบบที่จะได้" value={`${n} แบบ`} />
        <Stat label="AI" value={aiOn ? "เปิด · ไฮไลต์ 45 วิ" : "ปิด"} />
      </Well>
      <Kv style={{ fontSize: 11.5, lineHeight: "17px" }}>
        {tr?.exists ? "บทพูดมีแล้ว — ตัด 6 แบบใช้เวลาราวหนึ่งนาทีสำหรับคลิป 2 นาที" : "ครั้งแรกใช้เวลาถอดเสียงราวครึ่งหนึ่งของความยาวคลิป แล้วตัดทุกแบบจากชิ้นเดียวกัน"}
        {aiOn ? " · AI เพิ่มอีก ~3 นาที (ใช้ claude)" : ""}
      </Kv>
      <div style={{ flex: 1 }} />
      {s.mod > 0 && (
        <Kv style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <Led dim /> จะบันทึก {s.mod} ค่าลง {s.setup?.project.path.split("/").pop()} ก่อนเริ่ม
        </Kv>
      )}
      <Cta onClick={go} disabled={running || !eng.proj || eng.clips.length === 0} busy={busy || s.saving} title={running ? "มีงานกำลังรัน" : "บันทึกค่า แล้วตัดทุกแบบ"}>
        ตัดให้เลย · {n} แบบ
      </Cta>
      {running && (
        <Kv style={{ fontSize: 11, textAlign: "center" }}>
          เอนจินกำลังทำ {job?.cmd_label || job?.step} อยู่ — รอให้เสร็จก่อน
        </Kv>
      )}
    </Panel>
  );
}
