import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { strings } from "@/lib/strings";
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
  title: strings.en.meta.title,
  description: strings.en.meta.description,
};

export const viewport: Viewport = {
  themeColor: "#f8fafc", // matches --color-canvas
};

// lang is the default; pages mark their own content with the expert's language (EN/FR toggle).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
