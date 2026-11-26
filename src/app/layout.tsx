import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthContext";
import Navbar from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "CineStream Pro — Media Catalogue & Multi-Source Player",
  description:
    "A curated media catalogue with multi-source playback, account libraries, and server-side source verification.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} dark`}>
      <body className="min-h-screen bg-[#090e1a] font-sans text-slate-100 antialiased selection:bg-amber-400 selection:text-slate-950">
        <AuthProvider>
          <Navbar />
          <main className="pt-16">{children}</main>
          <footer className="mt-20 border-t border-slate-800/80 bg-[#060913] py-10 text-sm text-slate-400">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-lg font-bold tracking-tight text-white">
                  Cine<span className="text-amber-400">Stream</span>
                </span>
                <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  PRO v2.0
                </span>
              </div>
              <p className="text-center text-xs text-slate-500">
                A curated catalogue, operator-managed sources, and transparent
                server-side verification.
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span>PostgreSQL + Drizzle</span>
                <span>•</span>
                <span>HLS.js ABR Engine</span>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
