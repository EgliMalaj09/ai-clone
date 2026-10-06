import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PROJECT STUDIO — Your next main character moment",
  description: "Choose a look. Upload a photo. Make your own AI video with credits, and pay only for videos that are delivered.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Browser extensions (e.g. ColorZilla) add attributes to <body> before React loads; ignore those differences. */}
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
