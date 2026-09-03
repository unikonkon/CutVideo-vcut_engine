import type { Metadata } from "next";
import { JetBrains_Mono, Mitr } from "next/font/google";
import "./globals.css";

// ทิศทาง C · แผงควบคุม — Mitr สำหรับข้อความ · JetBrains Mono สำหรับตัวเลข/รหัส
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${mitr.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
