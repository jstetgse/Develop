import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Posture Analyzer",
  description: "웹캠으로 자세를 분석하고 맞춤형 스트레칭을 안내하는 AI 자세 코칭 서비스입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
