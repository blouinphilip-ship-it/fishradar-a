import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopBar } from "@/components/layout/top-bar";
import { AskFab } from "@/components/layout/ask-fab";
import { Footer } from "@/components/layout/footer";
import { themeInitScript } from "@/components/layout/theme-toggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FishRadar AI", template: "%s · FishRadar AI" },
  description: "Know where the fish are — before you leave the dock. Tides, wind, water temps, fishing reports and runs on one globe.",
};

export const viewport: Viewport = { themeColor: "#07121f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-dvh flex-col font-sans antialiased`}>
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <Footer />
        <AskFab />
      </body>
    </html>
  );
}
