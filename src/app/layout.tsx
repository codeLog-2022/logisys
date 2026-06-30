import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { HeaderWrapper } from "@/components/HeaderWrapper";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LogiSys — 3PL倉庫業務管理",
  description: "3PL倉庫事業者向け業務管理 × WMS ハイブリッドシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
          <HeaderWrapper />
          <div className="flex-1">{children}</div>
        </body>
    </html>
  );
}
