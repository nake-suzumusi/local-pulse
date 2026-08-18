import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Pulse | ローカルLLM速度計測",
  description: "Ollama、LM Studio、OpenAI互換APIの生成速度とTTFTを計測します。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
