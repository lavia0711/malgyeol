import type { Metadata, Viewport } from "next";
import "@fontsource/hahmlet/400.css";
import "@fontsource/hahmlet/500.css";
import "./globals.css";

const siteOrigin = "https://malgyeol.geonwoomoon.chatgpt.site";

const title = "말결 — 아름다운 한국어 단어 찾기";
const description =
  "뜻과 분위기로 발견하는 아름다운 우리말. 창작과 이름 짓기에 어울리는 낱말을 찾아보세요.";

export function generateMetadata(): Metadata {
  const origin = siteOrigin;
  const ogImage = `${origin}/og.png?v=poetry-cover`;

  return {
    title,
    description,
    keywords: ["한국어 단어", "예쁜 우리말", "순우리말", "이름 짓기", "창작"],
    openGraph: {
      title,
      description: "마음에 오래 남는 단어의 결을 찾아보세요.",
      type: "website",
      locale: "ko_KR",
      siteName: "말결",
      url: origin,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "말결 — 마음에 오래 남는 단어의 결을 찾으세요.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "마음에 오래 남는 단어의 결을 찾아보세요.",
      images: [ogImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f2ead9",
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
