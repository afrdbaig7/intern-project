import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kanban AI — Real-Time Collaborative Project Management",
  description:
    "Real-time collaborative Kanban boards with an autonomous AI project manager. Drag-and-drop cards, live presence, complexity scoring, sprint risk and bottleneck detection, weekly digests, and GitHub import.",
  keywords: [
    "Kanban",
    "Real-time",
    "Collaborative",
    "AI Project Manager",
    "Next.js",
    "Socket.IO",
  ],
  authors: [{ name: "Kanban AI" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Kanban AI",
    description: "Real-time boards with an autonomous AI project manager",
    siteName: "Kanban AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kanban AI",
    description: "Real-time boards with an autonomous AI project manager",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
