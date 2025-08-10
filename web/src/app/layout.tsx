import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "نظام إضافة البطاقات - Facebook Card Adder System",
  description: "نظام متكامل لإدارة وإضافة البطاقات مبني باستخدام Next.js للواجهة الأمامية و Fastify للخادم",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-blue-600" />
                  <span className="font-semibold text-slate-800">Card Adder System</span>
                </div>
                <nav className="text-sm text-slate-600">
                  <Link href="/" className="hover:text-slate-900">الرئيسية</Link>
                </nav>
              </div>
            </header>
            <main className="flex-1 bg-slate-50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
              </div>
            </main>
            <footer className="border-t border-slate-200 bg-white">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between text-xs text-slate-500">
                <span>© {new Date().getFullYear()} Card Adder</span>
                <span>واجهة احترافية بتباين واضح</span>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
