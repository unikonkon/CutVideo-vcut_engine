import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Mitr } from "next/font/google";
import Backdrop from "@/components/sky/Backdrop";
import "./globals.css";

// ธีม v6 ท้องฟ้า × ป่าไม้ — Mitr น้ำหนักเบาสำหรับทุกอย่าง · JetBrains Mono เฉพาะ log/ไทม์ไลน์
const mitr = Mitr({
  variable: "--font-mitr",
  weight: ["300", "400", "500", "600"],
  subsets: ["thai", "latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jb",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VCUT",
  description: "ตัดวิดีโอ 3 ขั้นด้วย vcut engine",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${mitr.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full">
        <Backdrop />
        <div style={{ position: "relative", zIndex: 1, height: "100%" }}>{children}</div>
      </body>
    </html>
  );
}
