"use client";

// ขั้น ② สไตล์ — คอลัมน์เดียวเต็มกว้าง (mockup F2 / F2Custom / F2Run)
//
//   หัว "เลือกสไตล์" → การ์ด 5 ใบ (A–D + กำหนดเอง) → ส่วนล่างตามสถานะ
//     เลือกสูตร   RecipeLayers  แผงอ่านอย่างเดียว "สูตร A แต่งให้แบบนี้"
//     กำหนดเอง    CustomGrid    6 แผงตัวเลือก ผูกคีย์เอนจินจริง
//     กำลังตัด    RunPanel      การ์ดล็อกจาง + แผงความคืบหน้ารายแบบ
//   → แถวล่างสุด: คำโปรย (.cap) + ปุ่มหลักตัวเดียว "ตัดให้เลย · N แบบ"
//
// ทุกตัวเลือกวางค่าลงร่าง (state.tsx) ปุ่มหลักบันทึกลง projects/<ชื่อ>.toml แล้วสั่ง
// quick / quick_ai / recut (serve.QUICK_JOBS) — ทุกปุ่มสั่งงานปิดระหว่างมีงานวิ่ง

import { useMemo, useState } from "react";
import TopBar from "@/components/frames/TopBar";
import { Btn, Cta, Icon } from "@/components/instrument";
import { useEngine } from "@/hooks/engine";
import { StyleCards, useCurrentRecipe } from "./cards";
import { isQuickJob } from "./phases";
import { useCutProgress } from "./progress";
import RunPanel from "./RunPanel";
import { Step2Provider, bool, num, strs, useStep2 } from "./state";
import { CustomGrid, RecipeLayers, musicLabel } from "./StylePanel";

function Body() {
  const eng = useEngine();
  const s = useStep2();
  const current = useCurrentRecipe();
  const [dismissed, setDismissed] = useState("");

  const job = eng.job;
  const running = Boolean(job?.running);
  const quickRunning = running && !!job && isQuickJob(job.step);
  const mine = isQuickJob(eng.lastStep);
  const jobKey = job ? `${eng.lastStep}:${job.code}:${job.total}` : "";
  const showRun = !!job && isQuickJob(job.step) && (job.running || (mine && dismissed !== jobKey));

  // แบบที่จะได้จากงานนี้ — variants.ids ตัด ai45 ออกเมื่อ AI ปิด
  const aiOn = bool(s.eff("variants.ai"));
  const idsField = s.setup?.fields.find((f) => f.key === "variants.ids");
  const ids = useMemo(() => strs(s.eff("variants.ids")).filter((x) => x !== "ai45" || aiOn), [s, aiOn]);
  const labels = useMemo(() => idsField?.labels ?? {}, [idsField]);
  const prog = useCutProgress(job, ids, labels, showRun);

  const w = num(s.eff("video.width"));
  const h = num(s.eff("video.height"));
  const lufs = s.eff("audio.master_lufs");
  const tr = s.transcript;
  const musicField = s.setup?.fields.find((f) => f.key === "autofx.music");

  // คำโปรยบรรทัดล่าง — ทุกค่ามาจากค่าตั้ง/เอนจิน
  let cap: string;
  if (eng.clips.length === 0) cap = "ยังไม่มีคลิป — ใส่วิดีโอที่ขั้น ① ก่อน";
  else if (running && !quickRunning) cap = `เอนจินกำลัง${job?.cmd_label || job?.step}อยู่ — รอให้เสร็จก่อนค่อยตัด`;
  else if (current) {
    cap = [`ตัดให้ ${ids.length} แบบ ต่างกันที่ความยาวและจังหวะ`, w && h ? `${w}×${h}` : "", lufs !== undefined ? `${lufs} LUFS` : "", tr?.exists ? "บทพูดมีแล้ว ไม่ต้องถอดใหม่" : "ถอดเสียงก่อนแล้วตัดทุกแบบ"].filter(Boolean).join(" · ");
  } else {
    const music = String(s.eff("autofx.music") ?? "");
    const hook = bool(s.eff("autofx.hook"));
    const card = bool(s.eff("autofx.card"));
    cap = [
      labels[s.pick] ?? s.pick,
      bool(s.eff("autofx.sub")) ? "ซับทั้งบรรทัด" : "ไม่มีซับ",
      hook && card ? "HOOK + การ์ดปิด" : hook ? "HOOK" : card ? "การ์ดปิด" : "",
      music ? `เพลง${musicLabel(musicField, music)}${bool(s.eff("autofx.beat_snap")) ? " ตามบีต" : ""}` : "",
      bool(s.eff("autofx.burst")) ? "ยิงรัว" : "",
      aiOn ? "AI ไฮไลต์" : "",
      tr?.exists ? "บทพูดมีแล้ว" : "ถอดเสียงก่อน",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const cardH = showRun ? 200 : current ? "clamp(220px, 36vh, 400px)" : 176;
  const canRun = !running && eng.clips.length > 0 && !!s.setup;

  return (
    <>
      <TopBar
        right={
          quickRunning ? (
            <span className="small" style={{ width: 170, display: "inline-flex", justifyContent: "flex-end", alignItems: "center", gap: 8, color: "var(--amber)", whiteSpace: "nowrap" }}>
              <span className="led on" />
              กำลังตัด {prog.done} / {prog.total}
            </span>
          ) : undefined
        }
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, padding: "16px 36px 28px", minHeight: 0, overflowY: "auto", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span className="h1">เลือกสไตล์</span>
          <span className="muted">4 สูตรจากเอนจิน เลือกชั้นแต่งให้เอง · หรือกำหนดเองทั้งหมด</span>
        </div>
        <StyleCards dim={showRun} h={cardH} />

        {showRun && job ? (
          <RunPanel job={job} prog={prog} onDismiss={() => setDismissed(jobKey)} />
        ) : (
          <>
            {current ? <RecipeLayers recipe={current} /> : <CustomGrid />}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <span className="cap small">{cap}</span>
              <div style={{ flex: 1 }} />
              {s.mod > 0 && (
                <Btn sm ghost onClick={s.revert} title="ทิ้งค่าที่แก้ไว้ กลับเป็นค่าในไฟล์โปรเจกต์">
                  ทิ้งที่แก้
                </Btn>
              )}
              <Cta onClick={() => s.run()} disabled={!canRun} busy={s.busy || s.saving} title={running ? "มีงานกำลังรัน" : eng.clips.length === 0 ? "ใส่วิดีโอที่ขั้น ① ก่อน" : `บันทึกค่า แล้วสั่ง ${s.jobKind}`}>
                ตัดให้เลย · {ids.length} แบบ
                <Icon name="chev" size={14} color="var(--ink-dark)" />
              </Cta>
            </div>
          </>
        )}
      </div>
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
