"use client";

// ลิ้นชัก "ขั้นสูง" ของขั้น ② — 5 แท็บ: ตั้งค่า · วิธีเลือกชิ้น+ลำดับ · AI · ไปป์ไลน์ · รีเซ็ต
//
// โหลด /api/setup ครั้งเดียวที่นี่ (ทุกแท็บอ่านก้อนเดียวกัน) และถือ draft ของค่าที่
// แก้แล้วยังไม่บันทึกไว้ที่นี่ — บันทึก = POST ทีเดียวทั้ง draft แล้วแทนก้อน setup
// ด้วยของที่เอนจินตอบกลับ ไม่ต้อง GET ซ้ำ

import { useCallback, useMemo, useState } from "react";
import { api2, type SetupData } from "@/lib/api";
import { useEngine, useLoader } from "@/hooks/engine";
import { useRoute } from "@/hooks/route";
import { Empty, Spin } from "@/components/instrument";
import { AdvFrame, same, type TabProps, type Values } from "./shared";
import Cfg from "./Cfg";
import Pick from "./Pick";
import Ai from "./Ai";
import Pipe from "./Pipe";
import Reset from "./Reset";

export default function AdvancedDrawer({ onClose }: { onClose: () => void }) {
  const eng = useEngine();
  const r = useRoute();
  // reloadKey ขยับทุกครั้งที่งานเอนจินจบ → สถานะขั้น (exists/changed) ต้องโหลดใหม่
  const { data, setData, error } = useLoader(() => api2.setup(), eng.reloadKey);
  const [draft, setDraft] = useState<Values>({});
  const [saving, setSaving] = useState(false);

  const fieldMap = useMemo(() => new Map((data?.fields ?? []).map((f) => [f.key, f])), [data]);

  const put = useCallback(
    (k: string, v: unknown) =>
      setDraft((p) => {
        const next = { ...p };
        // ตั้งกลับเป็นค่าเดิม = ไม่ถือว่าแก้ ป้าย MOD จะได้ไม่นับค่าที่ไม่เปลี่ยนจริง
        if (data && same(v, data.values[k])) delete next[k];
        else next[k] = v;
        return next;
      }),
    [data],
  );
  const drop = useCallback(
    (k: string) =>
      setDraft((p) => {
        const next = { ...p };
        delete next[k];
        return next;
      }),
    [],
  );
  const discard = useCallback(() => setDraft({}), []);

  const save = useCallback(async () => {
    if (!data) return false;
    const n = Object.keys(draft).length;
    if (!n) return true;
    if (!data.project.path) {
      eng.flash("ยังไม่มีไฟล์โปรเจกต์ให้บันทึก — สร้างโปรเจกต์ที่ขั้น ① ก่อน");
      return false;
    }
    setSaving(true);
    try {
      const res = await api2.saveSetup(data.project.path, draft);
      setData(res.setup);
      setDraft({});
      eng.flash(`บันทึก ${n} ค่าลง ${res.path} แล้ว`);
      void eng.refresh();
      return true;
    } catch (e) {
      eng.flash(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, draft, eng, setData]);

  if (!data) {
    return (
      <AdvFrame sub="กำลังอ่านค่าตั้งจากเอนจิน…" draftN={0} onClose={onClose}>
        {error ? <Empty>โหลด /api/setup ไม่ได้ — {error}</Empty> : <Spin />}
      </AdvFrame>
    );
  }

  const props: TabProps = {
    setup: data,
    setSetup: (s: SetupData) => setData(s),
    draft,
    put,
    drop,
    val: (k) => (k in draft ? draft[k] : data.values[k]),
    field: (k) => fieldMap.get(k),
    save,
    saving,
    discard,
    onClose,
  };

  switch (r.adv) {
    case "pick":
      return <Pick {...props} />;
    case "ai":
      return <Ai {...props} />;
    case "pipe":
      return <Pipe {...props} />;
    case "reset":
      return <Reset {...props} />;
    default:
      return <Cfg {...props} />;
  }
}
