import type { NextConfig } from "next";

// serve.py ของ vcut ผูกกับ 127.0.0.1:8765 และเช็ก Host — proxy ผ่าน rewrite
// ทำให้เบราว์เซอร์คุยกับ origin เดียว ไม่ติด CORS และ Host ที่ไปถึงคือ 127.0.0.1
//
// ทดสอบกับเอนจินรุ่นที่เพิ่งแก้ (เปิดไว้อีกพอร์ต) ด้วย
//   VCUT_ENGINE_URL=http://127.0.0.1:8791 npm run dev
const ENGINE = process.env.VCUT_ENGINE_URL ?? "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/engine/:path*", destination: `${ENGINE}/:path*` }];
  },
};

export default nextConfig;
