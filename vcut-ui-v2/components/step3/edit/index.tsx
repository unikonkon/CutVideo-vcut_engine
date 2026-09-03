"use client";

// แผงแก้รายชั้นของขั้น ③ — เลือกแผงจาก ?e= (hooks/route)
//   sub → Sub (CSUB) · text → Text (CTEXT) · music → Music (CMUSIC) · sticker → Sticker (CQ3STK)
//   fx → FxShot (CFXSHOT) · map → Map (CMAP) · tl/review เป็นของ step3/index.tsx (ไม่ควรมาถึงนี่)
// ทุกแผงใช้ EditShell (common.tsx) ตัวเดียวกัน: TopBar · EditFrame · Player โหมด timeline

import { Empty } from "@/components/instrument";
import type { Edit3 } from "@/hooks/route";
import SubEditor from "./Sub";
import TextEditor from "./Text";
import MusicEditor from "./Music";
import StickerEditor from "./Sticker";
import FxShotEditor from "./FxShot";
import MapEditor from "./Map";

export default function EditorSwitch({ id }: { id: Edit3 }) {
  switch (id) {
    case "sub":
      return <SubEditor />;
    case "text":
      return <TextEditor />;
    case "music":
      return <MusicEditor />;
    case "sticker":
      return <StickerEditor />;
    case "fx":
      return <FxShotEditor />;
    case "map":
      return <MapEditor />;
    default:
      return (
        <div style={{ padding: 10 }}>
          <Empty>หน้า “{id}” ไม่ใช่แผงแก้รายชั้น</Empty>
        </div>
      );
  }
}
