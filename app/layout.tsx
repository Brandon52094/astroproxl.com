import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Next.js handles viewport settings through this dedicated export
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#040611",
};

export const metadata: Metadata = {
  title: "AstroProXL",
  description: "Direct future predictions from your natal chart",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased bg-[#040611]`}
    >
      <head>
        {/* interactive-widget is kept here as a raw tag since Next.js viewport object doesn't fully map it natively yet */}
        <meta name="viewport" content="interactive-widget=resizes-content" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="h-full overflow-hidden bg-[#040611] text-foreground">
        {/* TikTok Pixel — loads after page becomes interactive, doesn't block render */}
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
            var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
            ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('D8TOKB3C77UBEINTG3S0');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
        <ClerkProvider>
          {/* Added CSS Safe Area padding utilities to the main wrapper. 
            This allows your deep dark [#040611] background to fill the whole screen (borders gone), 
            but keeps the actual layout items perfectly within the safe boundaries.
          */}
          <main className="h-full w-full bg-[#040611]">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}