import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "AstroXL",
  description: "Direct future predictions from your natal chart",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      {/*
        h-full on html+body locks the viewport — nothing scrolls at the root level.
        Individual pages opt into overflow-y-auto when they need internal scroll
        (results page, JXL chat). All other pages are fixed-height, no scroll.
      */}
      <body className="h-full overflow-hidden bg-[#050816] text-foreground">
        <ClerkProvider>
          <main className="h-full">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
