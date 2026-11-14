import type { Metadata } from "next";
import { headers } from "next/headers";
import { langFromCookie } from "@/lib/i18n";
import "./globals.css";
import { CardLoader } from "@/components/card-loader";
import { BRAND } from "@/lib/brand";

// First visit in a session: a short NgaZero splash with the light ring. It hides as soon as the page has loaded (at least 0.7 s, at most 2.5 s).
const SPLASH = `(function(){try{if(sessionStorage.getItem("nzs"))return;sessionStorage.setItem("nzs","1");var d=document.documentElement,t0=Date.now(),gone=0;d.classList.add("nz-splash-on");function done(){if(gone++)return;setTimeout(function(){d.classList.add("nz-splash-out");setTimeout(function(){d.classList.remove("nz-splash-on","nz-splash-out")},400)},Math.max(0,700-(Date.now()-t0)))}if(document.readyState==="complete")done();else addEventListener("load",done);setTimeout(done,2500)}catch(e){}})();`;

export const metadata: Metadata = {
  title: "NgaZero — Your next main character moment",
  description: "Choose a look. Upload a photo. Make your own AI video with credits, and pay only for videos that are delivered.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  // Installable app (V7).
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND, statusBarStyle: "default" },
};
export const viewport = { themeColor: "#3154f5" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={langFromCookie((await headers()).get("cookie"))} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: SPLASH }} /></head>
      {/* Browser extensions (e.g. ColorZilla) add attributes to <body> before React loads; ignore those differences. */}
      <body className="antialiased" suppressHydrationWarning>
        <div className="nz-splash" aria-hidden="true"><CardLoader size={110} eager /><span className="brand">Nga<b>Zero</b></span></div>
        {children}
      </body>
    </html>
  );
}
