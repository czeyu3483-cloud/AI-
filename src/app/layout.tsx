import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = IBM_Plex_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "仿真AI模拟面试官 · 研发压力面",
  description: "本地 Demo：研发岗压力面模拟面试（简历定制 + 控场状态机 + 复盘报告）",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${display.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
