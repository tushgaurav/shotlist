import type { Metadata } from "next";
import { Geist, Geist_Mono, Mona_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEMES } from "@/lib/themes";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Only the Studio theme uses it, so it isn't preloaded for everyone else.
const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  preload: false,
});

const description = "Write scripts and plan shot lists for your productions.";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.shotlist.video"),
  title: { default: "Shotlist", template: "%s · Shotlist" },
  description,
  openGraph: {
    title: "Shotlist",
    description,
    siteName: "Shotlist",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shotlist",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${monaSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          themes={THEMES}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
