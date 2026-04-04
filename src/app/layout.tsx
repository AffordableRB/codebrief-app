import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Serif_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "CodeBrief — Pre-Design Code Intelligence for Architects",
  description:
    "Enter your project parameters. Get a professional building code compliance brief in 60 seconds — zoning, construction type, fire separation, egress, accessibility, energy code, and risk flags, with IBC section citations.",
  keywords: [
    "building code compliance",
    "IBC code analysis",
    "architect code brief",
    "pre-design code intelligence",
    "zoning analysis",
    "ADA compliance",
    "IECC energy code",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${dmSerifDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
