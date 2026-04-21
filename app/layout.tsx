import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "1OS | Migration Operating System",
  description:
    "1OS guides businesses from Eskom dependence to close through one premium migration workspace for qualification, documents, proposals, term sheets, and execution.",
  keywords: [
    "1OS",
    "energy migration",
    "Generocity",
    "Lumen-1",
    "migration operating system",
    "business qualification",
    "proposal review",
    "term sheet workflow",
    "Africa energy platform",
  ],
  openGraph: {
    title: "1OS | Migration Operating System",
    description:
      "A conversational operating surface for moving businesses from registration to close with trust, clarity, and commercial speed.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={`${inter.variable} ${orbitron.variable}`}>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
