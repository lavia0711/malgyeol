import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "말결 — 아름다운 한국어 단어 찾기",
  description:
    "뜻과 분위기로 발견하는 아름다운 우리말. 창작과 이름 짓기에 어울리는 낱말을 찾아보세요.",
  keywords: ["한국어 단어", "예쁜 우리말", "순우리말", "이름 짓기", "창작"],
  openGraph: {
    title: "말결 — 아름다운 한국어 단어 찾기",
    description: "마음에 오래 남는 단어의 결을 찾아보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "말결",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3eee2",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

