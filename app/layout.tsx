import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_KR, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Posture Analyzer",
  description: "Desktop-first webcam posture analyzer built with Next.js, MediaPipe, and Firebase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${spaceGrotesk.variable} ${notoSansKr.variable}`}>{children}</body>
    </html>
  );
}
