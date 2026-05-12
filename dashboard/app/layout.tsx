import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MEV Gladiator Pit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-phosphor font-mono crt-scanlines min-h-screen">{children}</body>
    </html>
  );
}
