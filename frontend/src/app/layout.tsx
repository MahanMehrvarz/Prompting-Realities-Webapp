import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { FirstUseModalWrapper } from "@/components/FirstUseModalWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves relative Open Graph image paths. Without it they resolve against
  // localhost at build time and link previews show a broken image.
  metadataBase: new URL("https://promptingrealities.com"),
  title: "Prompting Realities — Prototype LLM-powered tangible interactions",
  description:
    "A low-threshold framework for building physical things you can talk to. Describe your object in plain language, converse with it, and the model's structured output drives your hardware.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-50`}
      >
        <FirstUseModalWrapper />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
