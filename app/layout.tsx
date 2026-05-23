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
  title: "1OS | Energy-as-a-Service and Commercial Solar in South Africa",
  description:
    "1OS builds energy infrastructure for South Africa through commercial solar, energy-as-a-service, and guided business migration workflows.",
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
    title: "1OS | Energy-as-a-Service and Commercial Solar in South Africa",
    description:
      "Commercial solar, lower-cost electricity, and guided business energy migration through one private 1OS workspace.",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=foundation-1", sizes: "32x32" },
      { url: "/favicon-32x32.png?v=foundation-1", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png?v=foundation-1", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=foundation-1",
    apple: "/apple-touch-icon.png?v=foundation-1",
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
    <html lang="en-ZA" className={`${inter.variable} ${orbitron.variable}`} data-scroll-behavior="smooth">
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
