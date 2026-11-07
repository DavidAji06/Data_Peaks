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
  title: "Ground Truth · ACAPS Moderator Dashboard",
  description: "Moderator dashboard for the ACAPS Ground Truth expert forecasting system.",
};

export const viewport: Viewport = {
  themeColor: "#f8fafc", // matches --color-surface-page
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface-page text-ink">{children}</body>
    </html>
  );
}
