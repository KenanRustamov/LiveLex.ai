import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "AI Glasses Starter",
  description: "Starter for an AI-powered, mobile-style web app with Next.js + Tailwind.",
  manifest: "/manifest.json",
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
